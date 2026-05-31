import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.natea.twag',
  appName: 'StageHopper',
  // The existing site in docs/ is the web asset root; Capacitor copies it
  // verbatim into the native bundle. Same folder serves GitHub Pages and
  // the native app — feature detection (window.Capacitor) picks the path.
  webDir: 'docs',
  // Serve the bundled local assets under the https://natea.github.io origin.
  // On ANDROID the default https scheme + this hostname makes the webview's
  // origin literally https://natea.github.io, so the referrer-restricted
  // Mapbox token (allow-listed to natea.github.io) works with no extra token.
  // On iOS, WKWebView reserves the https scheme, so Capacitor keeps the
  // capacitor:// scheme regardless — the origin becomes capacitor://natea.github.io,
  // which Mapbox can't allow-list. iOS therefore uses a separate, URL-
  // unrestricted token (window.TWAG_MAPBOX_TOKEN_NATIVE) applied by the bridge.
  server: {
    androidScheme: 'https',
    hostname: 'natea.github.io',
  },
  // contentInset 'always' makes the WKWebView scroll view inset its content
  // below the status bar / notch (with 'never' it draws full-screen and the
  // header overlaps the clock). backgroundColor fills the reserved status-bar
  // strip with the same dark as the header. NOTE: do not add
  // viewport-fit=cover to the pages — it re-opts into drawing under the bar
  // and defeats this.
  ios: { contentInset: 'always', backgroundColor: '#1a1a1a' },
  android: { allowMixedContent: false },
  plugins: {
    // The webview is inset below the status bar via ios.contentInset, so the
    // status bar should NOT overlay. We only need light ("DARK") content for
    // legibility on the dark strip. backgroundColor is Android-only.
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a1a1a',
    },
    LocalNotifications: {
      // Brand-orange small icon + accent; falls back to the app icon.
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#e8543e',
    },
  },
};

export default config;
