import type { Metadata, Viewport } from "next";
import { StoreProvider } from "@/lib/store";
import { TabBar } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cairn",
  description: "Everything a group shares on a trip, in one place.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f7f7" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <StoreProvider>
          <main id="main" className="mx-auto min-h-dvh w-full max-w-[520px] pb-[76px]">
            {children}
          </main>
          <TabBar />
        </StoreProvider>
      </body>
    </html>
  );
}
