import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.anetrebskii.geckit',
  appName: 'GeckIt',
  webDir: 'www',
  // The page makes room for the keyboard itself as it starts to rise; the plugin would shrink the web view only once it is up, and the web view would scroll the bar at the top away.
  ios: { contentInset: 'never', scrollEnabled: false },
  plugins: { Keyboard: { resize: 'none', resizeOnFullScreen: true } },
}

export default config
