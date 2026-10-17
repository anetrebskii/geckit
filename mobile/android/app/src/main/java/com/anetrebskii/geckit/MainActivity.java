package com.anetrebskii.geckit;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

// The window the page lives in, with the app's own plugins, which are part of the app rather than packages.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DictationPlugin.class);
        registerPlugin(LocalPagePlugin.class);
        registerPlugin(RecordingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
