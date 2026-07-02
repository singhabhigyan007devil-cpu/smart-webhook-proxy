import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HookShield - Webhook Proxy & Retry Engine",
  description: "Enterprise-grade intermediate buffer and automatic exponential retry engine for third-party webhooks.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
