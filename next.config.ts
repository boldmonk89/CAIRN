import type { NextConfig } from "next";

export default {
  // Capacitor ships a folder of files inside the APK — there is no Node server
  // in there to render anything, so every route has to be a static file.
  output: "export",
  typedRoutes: true,
  images: { unoptimized: true },
} satisfies NextConfig;
