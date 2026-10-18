package com.anetrebskii.geckit;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.UUID;

/**
 * The same Recording the iPhone app has: a video from the phone, picked or the screen recording just made, read here
 * into a few frames and the sound said in it. Android has no recognizer that reads a file, so the words are heard by
 * the host: this hands over the sound as the 16 kHz mono WAV whisper takes, and the page has the host write it down.
 */
@CapacitorPlugin(
    name = "Recording",
    permissions = {
        @Permission(alias = "videos", strings = { Manifest.permission.READ_MEDIA_VIDEO }),
        @Permission(alias = "selected", strings = { Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
    }
)
public class RecordingPlugin extends Plugin {

    private static final int RATE = 16000;
    // Past this the host takes longer to hear it than anyone waits.
    private static final long MOST_SECONDS = 30 * 60;

    private String videosAlias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "videos" : "storage";
    }

    @PluginMethod
    public void pick(PluginCall call) {
        Intent asked;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            asked = new Intent(MediaStore.ACTION_PICK_IMAGES);
            asked.setType("video/*");
        } else {
            asked = new Intent(Intent.ACTION_GET_CONTENT);
            asked.setType("video/*");
            asked.addCategory(Intent.CATEGORY_OPENABLE);
        }
        startActivityForResult(call, asked, "picked");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        Uri chosen = result.getResultCode() == Activity.RESULT_OK && result.getData() != null ? result.getData().getData() : null;
        if (chosen == null) {
            call.resolve(new JSObject());
            return;
        }
        // Read off the main thread: a long video takes a while to copy.
        new Thread(() -> {
            try {
                call.resolve(described(kept(chosen), null));
            } catch (IOException error) {
                call.reject("The video could not be read.");
            }
        }).start();
    }

    /** A copy in the app's own cache, which stays until it is dropped, as the picker's own may not. */
    private File kept(Uri from) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        String type = resolver.getType(from);
        String ext = type == null ? null : MimeTypeMap.getSingleton().getExtensionFromMimeType(type);
        File into = new File(getContext().getCacheDir(), "recording-" + UUID.randomUUID() + "." + (ext == null ? "mp4" : ext));
        try (InputStream in = resolver.openInputStream(from); OutputStream out = new FileOutputStream(into)) {
            if (in == null) throw new IOException("no stream");
            byte[] buffer = new byte[256 * 1024];
            for (int read; (read = in.read(buffer)) > 0; ) out.write(buffer, 0, read);
        }
        return into;
    }

    private JSObject described(File file, Long made) {
        JSObject said = new JSObject();
        String name = file.getName();
        said.put("path", file.getAbsolutePath());
        said.put("url", Uri.fromFile(file).toString());
        said.put("ext", name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : "mp4");
        said.put("bytes", file.length());
        MediaMetadataRetriever reading = new MediaMetadataRetriever();
        try {
            reading.setDataSource(file.getAbsolutePath());
            String duration = reading.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            double seconds = duration == null ? 0 : Long.parseLong(duration) / 1000.0;
            said.put("seconds", seconds);
            if (made != null) {
                said.put("made", made);
                Bitmap middle = frameAt(reading, seconds / 2, 480);
                said.put("thumb", middle == null ? "" : jpeg(middle));
            }
        } catch (RuntimeException unreadable) {
            said.put("seconds", 0);
        } finally {
            try {
                reading.release();
            } catch (IOException ignored) {
                // Released either way.
            }
        }
        return said;
    }

    private static Bitmap frameAt(MediaMetadataRetriever reading, double seconds, int side) {
        Bitmap frame = reading.getFrameAtTime((long) (seconds * 1_000_000), MediaMetadataRetriever.OPTION_CLOSEST);
        if (frame == null) return null;
        float scale = Math.min(1f, (float) side / Math.max(frame.getWidth(), frame.getHeight()));
        if (scale >= 1f) return frame;
        return Bitmap.createScaledBitmap(frame, Math.round(frame.getWidth() * scale), Math.round(frame.getHeight() * scale), true);
    }

    private static String jpeg(Bitmap image) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        image.compress(Bitmap.CompressFormat.JPEG, 70, out);
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }

    /** The newest screen recording made since the time given, which is how one made from the quick settings comes back without being picked. */
    @PluginMethod
    public void latest(PluginCall call) {
        if (getPermissionState(videosAlias()) != PermissionState.GRANTED) {
            requestPermissionForAlias(videosAlias(), call, "latestAllowed");
            return;
        }
        findLatest(call);
    }

    @PermissionCallback
    private void latestAllowed(PluginCall call) {
        if (getPermissionState(videosAlias()) == PermissionState.GRANTED) {
            findLatest(call);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && getPermissionState("selected") == PermissionState.GRANTED) {
            // With access to chosen videos only, a recording made later is not among what GeckIt may see.
            call.reject("GeckIt sees a new recording only with access to all videos. Allow it in Settings, Apps, GeckIt, Permissions, Photos and videos, or choose the video.");
        } else {
            call.reject("GeckIt may not look at your videos. Allow it in Settings, Apps, GeckIt, Permissions, or choose the video.");
        }
    }

    private void findLatest(PluginCall call) {
        long since = call.getData().optLong("since", 0) / 1000;
        new Thread(() -> {
            Uri videos = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
            // Android marks no video as a screen recording; every phone's recorder names its folder or its files for it.
            String where = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? MediaStore.Video.Media.DATE_ADDED + " > ? AND (LOWER(" + MediaStore.Video.Media.RELATIVE_PATH + ") LIKE '%screen%' OR LOWER(" + MediaStore.Video.Media.DISPLAY_NAME + ") LIKE '%screen%')"
                : MediaStore.Video.Media.DATE_ADDED + " > ? AND LOWER(" + MediaStore.Video.Media.DATA + ") LIKE '%screen%'";
            String[] columns = { MediaStore.Video.Media._ID, MediaStore.Video.Media.DATE_ADDED };
            try (Cursor found = getContext().getContentResolver().query(videos, columns, where, new String[] { String.valueOf(since) }, MediaStore.Video.Media.DATE_ADDED + " DESC")) {
                if (found == null || !found.moveToFirst()) {
                    call.resolve(new JSObject());
                    return;
                }
                Uri one = ContentUris.withAppendedId(videos, found.getLong(0));
                long made = found.getLong(1) * 1000;
                call.resolve(described(kept(one), made));
            } catch (IOException | RuntimeException error) {
                call.reject("The recording could not be read.");
            }
        }).start();
    }

    @PluginMethod
    public void frames(PluginCall call) {
        File kept = cached(call.getString("path"));
        String path = kept == null ? null : kept.getPath();
        if (path == null) {
            call.reject("No video");
            return;
        }
        int count = Math.max(1, call.getData().optInt("count", 8));
        int side = call.getData().optInt("side", 1568);
        new Thread(() -> {
            JSArray taken = new JSArray();
            MediaMetadataRetriever reading = new MediaMetadataRetriever();
            try {
                reading.setDataSource(path);
                String duration = reading.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                double seconds = duration == null ? 0 : Long.parseLong(duration) / 1000.0;
                for (int index = 0; index < count; index++) {
                    // Spread over the length, the last one at the very end: what was on the screen when the point was made.
                    double at = count == 1 ? Math.max(0, seconds - 0.1) : Math.max(0, Math.min(seconds - 0.1, seconds * index / (count - 1)));
                    Bitmap frame = frameAt(reading, at, side);
                    if (frame == null) continue;
                    JSObject one = new JSObject();
                    one.put("at", at);
                    one.put("data", jpeg(frame));
                    taken.put(one);
                }
            } catch (RuntimeException unreadable) {
                // What was taken before it failed is still worth sending.
            } finally {
                try {
                    reading.release();
                } catch (IOException ignored) {
                    // Released either way.
                }
            }
            JSObject said = new JSObject();
            said.put("frames", taken);
            call.resolve(said);
        }).start();
    }

    /** The app's own copy at `path`, or nothing for a path outside the cache, as `../` would make. */
    private File cached(String path) {
        if (path == null) return null;
        try {
            File file = new File(path).getCanonicalFile();
            return file.getPath().startsWith(getContext().getCacheDir().getCanonicalPath() + File.separator) ? file : null;
        } catch (IOException unreadable) {
            return null;
        }
    }

    /** Copies left by an app that was closed before it dropped them; iOS empties its temporary folder itself. */
    @Override
    public void load() {
        File[] left = getContext().getCacheDir().listFiles((folder, name) -> name.startsWith("recording-") || name.startsWith("sound-"));
        if (left == null) return;
        long old = System.currentTimeMillis() - 24 * 3600_000L;
        for (File one : left) {
            //noinspection ResultOfMethodCallIgnored
            if (one.lastModified() < old) one.delete();
        }
    }

    /** Bytes `from` up to `to` of the file as base64: the app's own server hands back the whole file for any range. */
    @PluginMethod
    public void piece(PluginCall call) {
        File kept = cached(call.getString("path"));
        // Read as JSON numbers: a small one comes from the page as an Integer, which getLong does not take.
        long from = call.getData().optLong("from", 0);
        long to = call.getData().optLong("to", 0);
        if (kept == null || to <= from) {
            call.reject("No such piece");
            return;
        }
        new Thread(() -> {
            try (RandomAccessFile file = new RandomAccessFile(kept, "r")) {
                byte[] bytes = new byte[(int) Math.min(to - from, Math.max(0, file.length() - from))];
                file.seek(from);
                file.readFully(bytes);
                JSObject said = new JSObject();
                said.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
                call.resolve(said);
            } catch (IOException error) {
                call.reject("The video could not be read.");
            }
        }).start();
    }

    /**
     * The sound of the video, decoded into a file of its own as 16 kHz mono 16-bit samples, so a long one is never
     * held whole; `sound` hands it out a stretch at a time. An empty path when the video has no sound.
     */
    @PluginMethod
    public void audio(PluginCall call) {
        File video = cached(call.getString("path"));
        if (video == null) {
            call.reject("No video");
            return;
        }
        new Thread(() -> {
            File sound = new File(getContext().getCacheDir(), "sound-" + UUID.randomUUID() + ".pcm");
            try {
                long samples;
                try (OutputStream out = new BufferedOutputStream(new FileOutputStream(sound), 256 * 1024)) {
                    samples = decoded(video.getPath(), out);
                }
                JSObject said = new JSObject();
                if (samples <= 0) {
                    //noinspection ResultOfMethodCallIgnored
                    sound.delete();
                    said.put("sound", "");
                    said.put("seconds", 0);
                } else {
                    said.put("sound", sound.getAbsolutePath());
                    said.put("seconds", (double) samples / RATE);
                }
                call.resolve(said);
            } catch (IOException | RuntimeException error) {
                //noinspection ResultOfMethodCallIgnored
                sound.delete();
                call.reject("The sound of the video could not be read.");
            }
        }).start();
    }

    /** Seconds `from` up to `to` of what `audio` decoded, as the WAV whisper takes, in base64. */
    @PluginMethod
    public void sound(PluginCall call) {
        File kept = cached(call.getString("path"));
        double from = call.getData().optDouble("from", 0);
        double to = call.getData().optDouble("to", 0);
        if (kept == null || to <= from) {
            call.reject("No such sound");
            return;
        }
        new Thread(() -> {
            try (RandomAccessFile file = new RandomAccessFile(kept, "r")) {
                long start = Math.min(file.length(), (long) (from * RATE) * 2);
                long end = Math.min(file.length(), (long) (to * RATE) * 2);
                byte[] pcm = new byte[(int) (end - start)];
                file.seek(start);
                file.readFully(pcm);
                JSObject said = new JSObject();
                said.put("audio", Base64.encodeToString(DictationPlugin.wav(pcm), Base64.NO_WRAP));
                call.resolve(said);
            } catch (IOException error) {
                call.reject("The sound of the video could not be read.");
            }
        }).start();
    }

    /** Decoded, mixed to one channel and brought to 16 kHz 16-bit as it goes, into `out`; how many samples went. */
    private static long decoded(String path, OutputStream out) throws IOException {
        MediaExtractor extractor = new MediaExtractor();
        extractor.setDataSource(path);
        MediaFormat format = null;
        for (int track = 0; track < extractor.getTrackCount(); track++) {
            MediaFormat one = extractor.getTrackFormat(track);
            String mime = one.getString(MediaFormat.KEY_MIME);
            if (mime != null && mime.startsWith("audio/")) {
                extractor.selectTrack(track);
                format = one;
                break;
            }
        }
        if (format == null) {
            extractor.release();
            return 0;
        }
        MediaCodec codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME));
        codec.configure(format, null, null, 0);
        codec.start();
        int rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE);
        int channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
        boolean floats = false;
        byte[] chunk = new byte[16 * 1024];
        int filled = 0;
        long written = 0;
        double next = 0;
        long heard = 0;
        float last = 0;
        long most = MOST_SECONDS * RATE;
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        boolean inputDone = false;
        try {
            while (written < most) {
                if (!inputDone) {
                    int in = codec.dequeueInputBuffer(10_000);
                    if (in >= 0) {
                        ByteBuffer buffer = codec.getInputBuffer(in);
                        int size = buffer == null ? -1 : extractor.readSampleData(buffer, 0);
                        if (size < 0) {
                            codec.queueInputBuffer(in, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            inputDone = true;
                        } else {
                            codec.queueInputBuffer(in, 0, size, extractor.getSampleTime(), 0);
                            extractor.advance();
                        }
                    }
                }
                int outIndex = codec.dequeueOutputBuffer(info, 10_000);
                if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat now = codec.getOutputFormat();
                    rate = now.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                    channels = now.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                    floats = now.containsKey(MediaFormat.KEY_PCM_ENCODING) && now.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT;
                    continue;
                }
                if (outIndex < 0) continue;
                ByteBuffer buffer = codec.getOutputBuffer(outIndex);
                if (buffer != null && info.size > 0) {
                    buffer.position(info.offset);
                    buffer.limit(info.offset + info.size);
                    ByteBuffer samples = buffer.slice().order(ByteOrder.nativeOrder());
                    int frames = info.size / ((floats ? 4 : 2) * channels);
                    double step = (double) rate / RATE;
                    for (int frame = 0; frame < frames && written < most; frame++) {
                        float mixed = 0;
                        for (int channel = 0; channel < channels; channel++) {
                            mixed += floats ? samples.getFloat() : samples.getShort() / 32768f;
                        }
                        mixed /= channels;
                        // Each 16 kHz sample falls between two of the source's, and is taken on the line between them.
                        while (next <= heard) {
                            double between = 1 - (heard - next);
                            float value = (float) (last + (mixed - last) * between);
                            short sample = (short) Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
                            chunk[filled++] = (byte) (sample & 0xff);
                            chunk[filled++] = (byte) ((sample >> 8) & 0xff);
                            if (filled == chunk.length) {
                                out.write(chunk, 0, filled);
                                filled = 0;
                            }
                            written++;
                            next += step;
                        }
                        last = mixed;
                        heard++;
                    }
                }
                codec.releaseOutputBuffer(outIndex, false);
                if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) break;
            }
            if (filled > 0) out.write(chunk, 0, filled);
        } finally {
            codec.stop();
            codec.release();
            extractor.release();
        }
        return written;
    }

    @PluginMethod
    public void drop(PluginCall call) {
        File kept = cached(call.getString("path"));
        //noinspection ResultOfMethodCallIgnored
        if (kept != null) kept.delete();
        call.resolve();
    }
}
