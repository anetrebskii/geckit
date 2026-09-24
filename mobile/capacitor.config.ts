import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.anetrebskii.geckit',
  appName: 'GeckIt',
  webDir: 'www',
  ios: { contentInset: 'never' },
  // The web view is made shorter above the keyboard rather than scrolled under it, so the bar at the top stays put.
  plugins: { Keyboard: { resize: 'native', resizeOnFullScreen: true } },
}

export default config
