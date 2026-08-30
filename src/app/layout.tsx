import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import { TabBar } from "@/components/ui";
import "./globals.css";

// Self-hosted at build time by next/font: no runtime request to Google, and no
// layout shift while a webfont swaps in.
const playfair = Playfair_Display({
  subsets: ["latin"], weight: ["400", "700", "900"],
  style: ["normal", "italic"], variable: "--font-playfair", display: "swap",
});
const inter = Inter({
  subsets: ["latin"], weight: ["400", "500", "600", "700"],
  variable: "--font-inter", display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"], weight: ["400", "500", "700"],
  variable: "--font-mono-jb", display: "swap",
});

export const metadata: Metadata = {
  title: "Cairn",
  description: "Track your run. Keep your records.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0c0a09",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable} ${mono.variable}`}>
      <body className="bg-ground">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:font-semibold focus:text-accent-ink"
        >
          Skip to content
        </a>
        <main id="main" className="mx-auto min-h-dvh w-full max-w-[560px]">
          {children}
        </main>
        <TabBar />
      </body>
    </html>
  );
}
