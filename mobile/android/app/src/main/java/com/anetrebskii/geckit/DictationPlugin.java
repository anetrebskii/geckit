package com.anetrebskii.geckit;

import android.Manifest;
import android.content.Intent;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Bundle;
import android.os.SystemClock;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.Locale;

/**
 * The same Dictation the iPhone app has: Android's own speech recognition for the composer, and the microphone alone
 * as the 16 kHz mono 16-bit WAV the host hears with whisper, with how loud it is for the page to show.
 */
@CapacitorPlugin(name = "Dictation", permissions = { @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }) })
public class DictationPlugin extends Plugin {

    private static final int RATE = 16000;
    private static final String DENIED = "GeckIt may not use the microphone. Allow it in Settings, Apps, GeckIt, Permissions.";

    private SpeechRecognizer recognizer;
    private Intent asking;
    // Android ends a hearing at a pause; while the button is held it is started again, and what each one heard is kept.
    private String heardBefore = "";
    private boolean stopping = false;
    private long levelAt = 0;

    private AudioRecord recorder;
    private Thread reading;
    private volatile boolean recording = false;
    private ByteArrayOutputStream recorded;

    /** How loud the microphone is, 0 to 1, a few times a second, so the page can show that it hears. */
    private void level(double decibels) {
        long now = SystemClock.elapsedRealtime();
        if (now - levelAt < 60) return;
        levelAt = now;
        JSObject said = new JSObject();
        said.put("level", Math.max(0, Math.min(1, (decibels + 50) / 50)));
        notifyListeners("level", said);
    }

    /** The language Correct is set to, by its English name, in this region when there is a choice; the phone's own otherwise. */
    static String languageTag(String language) {
        Locale here = Locale.getDefault();
        Locale found = null;
        for (Locale one : Locale.getAvailableLocales()) {
            if (!one.getDisplayLanguage(Locale.ENGLISH).equalsIgnoreCase(language)) continue;
            if (one.getCountry().equals(here.getCountry())) return one.toLanguageTag();
            if (found == null || (found.getCountry().isEmpty() && !one.getCountry().isEmpty())) found = one;
        }
        return (found != null ? found : here).toLanguageTag();
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "startAllowed");
            return;
        }
        listen(call);
    }

    @PermissionCallback
    private void startAllowed(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) listen(call);
        else call.reject(DENIED);
    }

    private void listen(PluginCall call) {
        String language = call.getString("language", "");
        getActivity().runOnUiThread(() -> {
            finish();
            if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
                call.reject("Dictation is not available on this phone. Choose the host under Heard by in Settings.");
                return;
            }
            heardBefore = "";
            stopping = false;
            recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(new Listener());
            Intent asked = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            asked.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            asked.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            asked.putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag(language));
            // Asked to wait at a pause, which Google's recognizer does not always do; `again` covers the rest.
            asked.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 5000L);
            asked.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 5000L);
            asking = asked;
            recognizer.startListening(asked);
            call.resolve();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            stopping = true;
            if (recognizer != null) recognizer.stopListening();
            else notifyListeners("ended", new JSObject());
            call.resolve();
        });
    }

    private void finish() {
        if (recognizer == null) return;
        recognizer.destroy();
        recognizer = null;
    }

    private void ended() {
        getActivity().runOnUiThread(() -> {
            finish();
            notifyListeners("ended", new JSObject());
        });
    }

    /** All that was heard while the button is held: the hearings before this one, then what this one has so far. */
    private String heard(Bundle results) {
        ArrayList<String> said = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        String now = said == null || said.isEmpty() ? "" : said.get(0).trim();
        String all = heardBefore.isEmpty() ? now : now.isEmpty() ? heardBefore : heardBefore + " " + now;
        if (!now.isEmpty()) {
            JSObject text = new JSObject();
            text.put("text", all);
            notifyListeners("heard", text);
        }
        return all;
    }

    /** A hearing ended at a pause while the button is still held: the next one starts, as the iPhone's goes on listening. */
    private void again() {
        getActivity().runOnUiThread(() -> {
            if (stopping || recognizer == null || asking == null) {
                ended();
                return;
            }
            recognizer.startListening(asking);
        });
    }

    private class Listener implements RecognitionListener {
        @Override public void onReadyForSpeech(Bundle params) {}
        @Override public void onBeginningOfSpeech() {}
        // Android says it in decibels from about -2 for quiet to 10 for loud.
        @Override public void onRmsChanged(float rms) { level((rms + 2) / 12 * 50 - 50); }
        @Override public void onBufferReceived(byte[] buffer) {}
        @Override public void onEndOfSpeech() {}
        // Nothing said is an error to the recognizer: a pause while held, or the end once let go.
        @Override public void onError(int error) {
            boolean pause = error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT;
            if (pause && !stopping) again();
            else ended();
        }
        @Override public void onResults(Bundle results) {
            heardBefore = heard(results);
            if (stopping) ended();
            else again();
        }
        @Override public void onPartialResults(Bundle partial) { heard(partial); }
        @Override public void onEvent(int type, Bundle params) {}
    }

    @PluginMethod
    public void record(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "recordAllowed");
            return;
        }
        startRecording(call);
    }

    @PermissionCallback
    private void recordAllowed(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) startRecording(call);
        else call.reject(DENIED);
    }

    @SuppressWarnings("MissingPermission")
    private synchronized void startRecording(PluginCall call) {
        stopRecording();
        int size = Math.max(AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT), RATE / 5);
        AudioRecord next;
        try {
            next = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size);
            if (next.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException();
            next.startRecording();
        } catch (RuntimeException error) {
            call.reject("The microphone could not start.");
            return;
        }
        recorder = next;
        recorded = new ByteArrayOutputStream();
        recording = true;
        final ByteArrayOutputStream into = recorded;
        reading = new Thread(() -> {
            byte[] buffer = new byte[size];
            while (recording) {
                int read = next.read(buffer, 0, buffer.length);
                if (read <= 0) continue;
                into.write(buffer, 0, read);
                double sum = 0;
                for (int at = 0; at + 1 < read; at += 2) {
                    double sample = (short) ((buffer[at] & 0xff) | (buffer[at + 1] << 8)) / 32768.0;
                    sum += sample * sample;
                }
                double rms = Math.sqrt(sum / Math.max(1, read / 2));
                level(20 * Math.log10(Math.max(rms, 0.00001)));
            }
        });
        reading.start();
        call.resolve();
    }

    // Reached from the plugin's thread through `recorded` and from the main one as the app goes.
    private synchronized byte[] stopRecording() {
        if (recorder == null) return null;
        recording = false;
        try {
            reading.join(1000);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        recorder.stop();
        recorder.release();
        recorder = null;
        byte[] pcm = recorded.toByteArray();
        recorded = null;
        return pcm;
    }

    /** Ends the recording and hands it back as base64, or drops it when keep is false. */
    @PluginMethod
    public void recorded(PluginCall call) {
        byte[] pcm = stopRecording();
        if (pcm == null) {
            call.reject("Nothing was recorded.");
            return;
        }
        if (Boolean.FALSE.equals(call.getBoolean("keep", true))) {
            call.resolve();
            return;
        }
        JSObject audio = new JSObject();
        audio.put("audio", Base64.encodeToString(wav(pcm), Base64.NO_WRAP));
        call.resolve(audio);
    }

    static byte[] wav(byte[] pcm) {
        ByteBuffer head = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
        head.put("RIFF".getBytes()).putInt(36 + pcm.length).put("WAVE".getBytes());
        head.put("fmt ".getBytes()).putInt(16).putShort((short) 1).putShort((short) 1).putInt(RATE).putInt(RATE * 2).putShort((short) 2).putShort((short) 16);
        head.put("data".getBytes()).putInt(pcm.length);
        byte[] out = new byte[44 + pcm.length];
        System.arraycopy(head.array(), 0, out, 0, 44);
        System.arraycopy(pcm, 0, out, 44, pcm.length);
        return out;
    }

    @Override
    protected void handleOnDestroy() {
        stopRecording();
        if (recognizer != null) getActivity().runOnUiThread(this::finish);
    }
}
