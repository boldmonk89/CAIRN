import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.cairn.tracker",
  appName: "Cairn",
  // `next build` with output:"export" writes here; Capacitor copies it into the APK
  webDir: "out",
  android: {
    // the WebView must not fall back to a light system background mid-navigation
    backgroundColor: "#0c0a09",
  },
  plugins: {
    // Android needs the app to ask; the WebView's own prompt is not enough
    Geolocation: { permissions: ["location"] },
  },
};

export default config;
