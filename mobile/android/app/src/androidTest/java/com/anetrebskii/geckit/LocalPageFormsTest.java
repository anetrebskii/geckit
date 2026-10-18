package com.anetrebskii.geckit;

import static org.junit.Assert.*;

import android.util.Base64;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class LocalPageFormsTest {
    private String evaluate(WebView web, String script) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> web.evaluateJavascript(script, value -> {
            result.set(value);
            done.countDown();
        }));
        assertTrue("JavaScript callback", done.await(10, TimeUnit.SECONDS));
        return result.get();
    }

    private JSONObject submitted(String form) throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<WebView> view = new AtomicReference<>();
            scenario.onActivity(activity -> view.set(activity.getBridge().getWebView()));
            WebView web = view.get();
            long until = System.currentTimeMillis() + 20_000;
            while (!"true".equals(evaluate(web, "!!window.Capacitor?.nativePromise")) && System.currentTimeMillis() < until) Thread.sleep(50);
            String page = "<!doctype html><meta charset=utf-8>" + form;
            String script = """
                (async () => {
                  const cap = window.Capacitor
                  await cap.nativePromise('LocalPage', 'removeAllListeners', {})
                  window.formResult = null
                  cap.nativeCallback('LocalPage', 'addListener', { eventName: 'request' }, (request) => {
                    const posted = request.method === 'POST'
                    if (posted) window.formResult = request
                    const html = posted ? '<h1>Submitted</h1>' : PAGE
                    cap.nativePromise('LocalPage', 'respond', { id: request.id, status: 200,
                      headers: { 'content-type': 'text/html; charset=utf-8' },
                      body: btoa(unescape(encodeURIComponent(html))) })
                  })
                  await cap.nativePromise('LocalPage', 'open', { url: 'http://localhost:9800/form' })
                })().catch(error => window.formResult = { error: String(error) })
                """.replace("PAGE", JSONObject.quote(page));
            evaluate(web, script);
            until = System.currentTimeMillis() + 20_000;
            String result;
            do {
                result = evaluate(web, "JSON.stringify(window.formResult)");
                if (!"null".equals(result) && !"\"null\"".equals(result)) break;
                Thread.sleep(50);
            } while (System.currentTimeMillis() < until);
            assertNotEquals("form reaches the native localhost bridge", "\"null\"", result);
            JSONObject request = new JSONObject(new JSONArray("[" + result + "]").getString(0));
            assertFalse(request.optString("error"), request.has("error"));
            assertEquals("POST", request.getString("method"));
            assertEquals("http://localhost:9800/login", request.getString("url"));
            return request;
        }
    }

    private String body(JSONObject request) throws Exception {
        return new String(Base64.decode(request.getString("body"), Base64.DEFAULT), StandardCharsets.UTF_8);
    }

    @Test public void ordinaryPostIncludesFieldsAndSubmitter() throws Exception {
        JSONObject request = submitted("""
            <form method=post action=/login><input name=user value=Alex><input name=password value="a&b">
            <button name=action value=login>Sign in</button></form>
            <script>addEventListener('load', () => document.querySelector('button').click())</script>
            """);
        assertEquals("user=Alex&password=a%26b&action=login", body(request));
    }

    @Test public void nativeSubmitCarriesFields() throws Exception {
        JSONObject request = submitted("""
            <form method=post action=/login><input name=user value=Alex></form>
            <script>addEventListener('load', () => document.querySelector('form').submit())</script>
            """);
        assertEquals("user=Alex", body(request));
    }

    @Test public void multipartRequestSubmitPreservesEncodingAndFile() throws Exception {
        JSONObject request = submitted("""
            <form method=post action=/login enctype=multipart/form-data><input name=user value=Alex>
            <input type=file name=attachment><button name=action value=upload>Upload</button></form>
            <script>addEventListener('load', () => {
              const files = new DataTransfer(); files.items.add(new File(['hello'], 'proof.txt', {type:'text/plain'}))
              document.querySelector('[type=file]').files = files.files
              document.querySelector('form').requestSubmit(document.querySelector('button'))
            })</script>
            """);
        String type = request.getJSONObject("headers").getString("Content-Type");
        assertTrue(type, type.startsWith("multipart/form-data; boundary="));
        String bytes = body(request);
        assertTrue(bytes, bytes.startsWith("--" + type.substring(type.indexOf("boundary=") + 9)));
        assertTrue(bytes, bytes.contains("filename=\"proof.txt\""));
        assertTrue(bytes, bytes.contains("hello"));
        assertTrue(bytes, bytes.contains("upload"));
    }
}
