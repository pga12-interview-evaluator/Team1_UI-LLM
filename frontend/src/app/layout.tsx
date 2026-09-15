import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";
import "./workspace.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

// The proxy issues a fresh CSP nonce per request. Static HTML cannot carry that nonce.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Interviewly · Your interview workspace", template: "%s · Interviewly" },
  description: "Structured AI interview — candidate interview and reviewer console.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4f7fb",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={manrope.variable} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
