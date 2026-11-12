import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { SiteNav } from "@/app/components/site-nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "Albion Transport", template: "%s | Albion Transport" },
  description: "Albion Online transport opportunity scanner using public market data.",
  applicationName: "Albion Transport",
  keywords: ["Albion Online", "market", "transport", "Black Market"],
  openGraph: {
    type: "website",
    siteName: "Albion Transport",
    title: "Albion Transport",
    description: "Find Albion Online transport opportunities with visible price freshness.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} min-h-full antialiased`}
    >
      <body className="min-h-screen bg-slate-50 text-slate-950">
        <a href="#main-content" className="sr-only z-50 rounded bg-white px-4 py-2 font-semibold text-emerald-800 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link href="/black-market" className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded bg-emerald-700 text-sm font-bold text-white">
                    AT
                  </span>
                  <span>
                    <span className="block text-base font-semibold tracking-tight">
                      Albion Transport
                    </span>
                    <span className="block text-xs text-slate-500">
                      Public market transport scanner
                    </span>
                  </span>
                </Link>
              </div>
              <SiteNav />
            </div>
          </header>
          <div id="main-content" tabIndex={-1}>{children}</div>
          <footer className="mt-10 border-t border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
              <p>Private-first decision support. Verify uncertain prices and quantities in-game.</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
