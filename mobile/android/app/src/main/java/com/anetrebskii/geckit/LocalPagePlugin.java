package com.anetrebskii.geckit;

import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.ComponentDialog;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * The same LocalPage the iPhone app has: a page off the host's localhost in a view of its own, each request it makes
 * handed to the page, which makes it on the host. Android's web view will not let a page fetch from a scheme of the
 * app's own, so here the page keeps its http://localhost address and every request to the loopback is taken over.
 */
@CapacitorPlugin(name = "LocalPage")
public class LocalPagePlugin extends Plugin {

    static final String LOCAL_SCHEME = "geckit-local";
    private static final Set<String> LOOPBACK = new HashSet<>(Arrays.asList("localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"));
    // Past this the host is not coming: the 30 s it gives a server, and the trip both ways.
    private static final long WAITING = 40;
    private static final String BODY_HEADER = "x-geckit-body";

    /**
     * Android hands an app no request's body, so the page's fetch and XMLHttpRequest leave it here first and name it
     * in a header. A form posted by the page itself still goes without one.
     */
    private static final String KEEP_BODIES =
        "(() => {\n" +
        "  const LOOP = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]'])\n" +
        "  const local = (url) => { try { const at = new URL(url, location.href); return at.protocol === 'http:' && LOOP.has(at.hostname) } catch { return false } }\n" +
        "  if (!window.GeckitBody || window.__geckitBodies || !local(location.href)) return\n" +
        "  window.__geckitBodies = true\n" +
        "  const keep = async (bytes) => {\n" +
        "    const all = new Uint8Array(bytes)\n" +
        "    let text = ''\n" +
        "    for (let at = 0; at < all.length; at += 0x8000) text += String.fromCharCode.apply(null, all.subarray(at, at + 0x8000))\n" +
        "    return GeckitBody.keep(btoa(text))\n" +
        "  }\n" +
        "  const fetched = window.fetch\n" +
        "  window.fetch = async (input, init) => {\n" +
        "    const asked = new Request(input, init)\n" +
        "    if (asked.method === 'GET' || asked.method === 'HEAD' || !local(asked.url)) return fetched(asked)\n" +
        "    const id = await keep(await asked.clone().arrayBuffer())\n" +
        "    const headers = new Headers(asked.headers)\n" +
        "    if (id) headers.set('" + BODY_HEADER + "', id)\n" +
        "    return fetched(new Request(asked, { headers }))\n" +
        "  }\n" +
        "  const opened = XMLHttpRequest.prototype.open\n" +
        "  XMLHttpRequest.prototype.open = function (method, url, ...rest) { this.__geckitUrl = String(url); return opened.call(this, method, url, ...rest) }\n" +
        "  const sent = XMLHttpRequest.prototype.send\n" +
        "  XMLHttpRequest.prototype.send = function (body) {\n" +
        "    if (body == null || !local(this.__geckitUrl)) return sent.call(this, body)\n" +
        "    const made = new Response(body)\n" +
        "    made.arrayBuffer().then(keep).then((id) => {\n" +
        "      if (id) this.setRequestHeader('" + BODY_HEADER + "', id)\n" +
        "      // A form's parts are cut at a boundary of the Response's own; the header has to name that one, not the browser's.\n" +
        "      if (body instanceof FormData) this.setRequestHeader('Content-Type', made.headers.get('content-type'))\n" +
        "      sent.call(this, body)\n" +
        "    }, () => sent.call(this, body))\n" +
        "  }\n" +
        "})()";

    private final Map<String, Answer> waiting = new ConcurrentHashMap<>();
    private final Map<String, Kept> bodies = new ConcurrentHashMap<>();
    // A body not asked for in this long was for a request that never came; and all of them together are held to this much.
    private static final long KEPT_FOR = 60_000;
    private static final long KEPT_MOST = 64L * 1024 * 1024;

    private static final class Kept {
        final byte[] bytes;
        final long at = System.currentTimeMillis();

        Kept(byte[] bytes) {
            this.bytes = bytes;
        }
    }

    private static final class Answer {
        final CountDownLatch done = new CountDownLatch(1);
        int status = 502;
        Map<String, String> headers = Collections.emptyMap();
        byte[] body = new byte[0];
        String moved;
    }

    /** `geckit-local://localhost:5173/a` as the web view asks for it here. */
    static String toHttp(String url) {
        return url.startsWith(LOCAL_SCHEME + ":") ? "http:" + url.substring(LOCAL_SCHEME.length() + 1) : url;
    }

    static boolean isLoopback(Uri url) {
        return "http".equals(url.getScheme()) && url.getHost() != null && LOOPBACK.contains(url.getHost());
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = toHttp(call.getString("url", ""));
        if (!isLoopback(Uri.parse(url))) {
            call.reject("No address to open.");
            return;
        }
        String note = call.getString("note");
        getActivity().runOnUiThread(() -> {
            show(url, note);
            call.resolve();
        });
    }

    @PluginMethod
    public void respond(PluginCall call) {
        Answer answer = waiting.remove(call.getString("id", ""));
        call.resolve();
        if (answer == null) return;
        // An answer that cannot be read still lets the page go on, as a failure, rather than waiting out the time.
        try {
            answer.status = call.getInt("status", 502);
            JSObject fields = call.getObject("headers", new JSObject());
            Map<String, String> headers = new HashMap<>();
            for (Iterator<String> names = fields.keys(); names.hasNext(); ) {
                String name = names.next();
                headers.put(name, fields.optString(name));
            }
            answer.headers = headers;
            answer.body = Base64.decode(call.getString("body", ""), Base64.DEFAULT);
            answer.moved = call.getString("moved");
        } catch (RuntimeException unreadable) {
            answer.status = 502;
            answer.headers = Collections.emptyMap();
            answer.body = new byte[0];
            answer.moved = null;
        } finally {
            answer.done.countDown();
        }
    }

    /** Asked of the page, which asks the host; waited for on the web view's own thread, as Android asks. */
    private WebResourceResponse asked(WebResourceRequest request) {
        String id = UUID.randomUUID().toString();
        Answer answer = new Answer();
        waiting.put(id, answer);
        JSObject headers = new JSObject();
        String body = "";
        for (Map.Entry<String, String> one : request.getRequestHeaders().entrySet()) {
            if (one.getKey().equalsIgnoreCase(BODY_HEADER)) {
                Kept kept = bodies.remove(one.getValue());
                if (kept != null) body = Base64.encodeToString(kept.bytes, Base64.NO_WRAP);
            } else {
                headers.put(one.getKey(), one.getValue());
            }
        }
        JSObject said = new JSObject();
        said.put("id", id);
        said.put("url", request.getUrl().toString());
        said.put("method", request.getMethod());
        said.put("headers", headers);
        said.put("body", body);
        notifyListeners("request", said);
        try {
            if (!answer.done.await(WAITING, TimeUnit.SECONDS)) {
                waiting.remove(id);
                return page(504, "The host did not answer in time.");
            }
        } catch (InterruptedException stopped) {
            Thread.currentThread().interrupt();
            waiting.remove(id);
            return page(504, "The host did not answer in time.");
        }
        // Android takes no redirect from here, so the page sends itself on to where the server did; the host follows
        // the others itself, and a 3xx left unfollowed (one to another site) reaches the page as a 200 with its Location.
        if (answer.moved != null && request.isForMainFrame()) {
            String to = toHttp(answer.moved).replace("\"", "&quot;");
            return html(200, "<meta http-equiv=\"refresh\" content=\"0;url=" + to + "\">");
        }
        int status = answer.status >= 300 && answer.status < 400 ? 200 : answer.status;
        String type = "application/octet-stream";
        String charset = null;
        Map<String, String> headersOut = new HashMap<>();
        for (Map.Entry<String, String> one : answer.headers.entrySet()) {
            if (one.getKey().equalsIgnoreCase("content-type")) {
                String[] parts = one.getValue().split(";");
                type = parts[0].trim();
                for (String part : parts) {
                    String trimmed = part.trim();
                    if (trimmed.toLowerCase().startsWith("charset=")) charset = trimmed.substring(8).replace("\"", "");
                }
                // Said by the type and charset given apart; repeated in the headers it reaches the page twice.
                continue;
            }
            headersOut.put(one.getKey(), one.getValue());
        }
        return new WebResourceResponse(type, charset, status, reason(status), headersOut, new ByteArrayInputStream(answer.body));
    }

    private static String reason(int status) {
        if (status >= 200 && status < 300) return "OK";
        if (status == 304) return "Not Modified";
        if (status == 404) return "Not Found";
        return status >= 500 ? "Server Error" : "Error";
    }

    private static WebResourceResponse html(int status, String page) {
        Map<String, String> headers = Collections.singletonMap("content-type", "text/html; charset=utf-8");
        return new WebResourceResponse("text/html", "utf-8", status, reason(status), headers, new ByteArrayInputStream(page.getBytes(StandardCharsets.UTF_8)));
    }

    private static WebResourceResponse page(int status, String why) {
        return html(status, "<!doctype html><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><body style=\"font:17px sans-serif;padding:24px;color:#666\">" + why + "</body>");
    }

    /**
     * The bodies the page leaves before it asks, read once by the request that names them. Android gives a page's
     * script this whatever site it is on, so what is held is bounded in time and size, and a page off the loopback,
     * whose requests are never taken over, gains nothing by it.
     */
    private class Bodies {
        @JavascriptInterface
        public String keep(String base64) {
            long now = System.currentTimeMillis();
            long held = 0;
            for (Iterator<Map.Entry<String, Kept>> all = bodies.entrySet().iterator(); all.hasNext(); ) {
                Kept one = all.next().getValue();
                if (now - one.at > KEPT_FOR) all.remove();
                else held += one.bytes.length;
            }
            byte[] bytes;
            try {
                bytes = Base64.decode(base64, Base64.DEFAULT);
            } catch (IllegalArgumentException unreadable) {
                return "";
            }
            if (held + bytes.length > KEPT_MOST) return "";
            String id = UUID.randomUUID().toString();
            bodies.put(id, new Kept(bytes));
            return id;
        }
    }

    private int dp(int value) {
        return Math.round(value * getContext().getResources().getDisplayMetrics().density);
    }

    private Button barButton(String text) {
        Button one = new Button(getContext(), null, android.R.attr.borderlessButtonStyle);
        one.setText(text);
        one.setAllCaps(false);
        one.setTextSize(17);
        one.setTextColor(Color.rgb(0x1a, 0x7f, 0x37));
        return one;
    }

    private void show(String start, String note) {
        ComponentDialog shown = new ComponentDialog(getActivity(), android.R.style.Theme_DeviceDefault_Light_NoActionBar);
        shown.requestWindowFeature(Window.FEATURE_NO_TITLE);

        LinearLayout root = new LinearLayout(getContext());
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        LinearLayout bar = new LinearLayout(getContext());
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(4), 0, dp(4), 0);
        Button done = barButton("Done");
        LinearLayout middle = new LinearLayout(getContext());
        middle.setOrientation(LinearLayout.VERTICAL);
        middle.setGravity(Gravity.CENTER);
        // Where a host's port could not be had here, the line over the title says where it went.
        TextView said = new TextView(getContext());
        said.setTextSize(12);
        said.setGravity(Gravity.CENTER);
        said.setText(note == null ? "" : note);
        said.setVisibility(note == null ? View.GONE : View.VISIBLE);
        TextView title = new TextView(getContext());
        title.setTextSize(17);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(Color.BLACK);
        title.setGravity(Gravity.CENTER);
        title.setSingleLine(true);
        title.setText(hostOf(Uri.parse(start)));
        middle.addView(said);
        middle.addView(title);
        Button again = barButton("↻");
        bar.addView(done);
        bar.addView(middle, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        bar.addView(again);

        WebView web = new WebView(getContext());
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        web.addJavascriptInterface(new Bodies(), "GeckitBody");
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, KEEP_BODIES, Collections.singleton("*"));
        }
        // Without one a page's alert, confirm and prompt say nothing at all; this one shows Android's own.
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return isLoopback(request.getUrl()) ? asked(request) : null;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                String named = view.getTitle();
                title.setText(named != null && !named.isEmpty() && !named.equals(url) ? named : hostOf(Uri.parse(url)));
            }
        });

        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)));
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        // Kept clear of the status bar, the keyboard and the gesture bar, which Android now draws over an app.
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        done.setOnClickListener((view) -> shown.dismiss());
        again.setOnClickListener((view) -> web.reload());
        // Back goes back in the page first, as a browser's does, and closes the view at its first page.
        shown.getOnBackPressedDispatcher().addCallback(new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web.canGoBack()) web.goBack();
                else shown.dismiss();
            }
        });
        shown.setOnDismissListener((dialog) -> {
            root.removeView(web);
            web.destroy();
        });
        shown.setContentView(root);
        Window window = shown.getWindow();
        if (window != null) {
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            // The bar over a white page, so the clock and icons in it are dark.
            WindowCompat.getInsetsController(window, window.getDecorView()).setAppearanceLightStatusBars(true);
            WindowCompat.getInsetsController(window, window.getDecorView()).setAppearanceLightNavigationBars(true);
        }
        shown.show();
        web.loadUrl(start);
    }

    private static String hostOf(Uri url) {
        if (url.getHost() == null) return "";
        return url.getPort() == -1 ? url.getHost() : url.getHost() + ":" + url.getPort();
    }
}
