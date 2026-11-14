import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700", "800"],
});

const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["700", "800"],
  style: ["italic"],
});

export const metadata: Metadata = {
  title: "DFN Arena",
  description: "بطولة الأكثر تطورًا الشهرية — DFN GYM",
  applicationName: "DFN Arena",
  icons: {
    icon: [
      { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/brand/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "DFN Arena", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#C42A1E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${barlow.variable}`}>
      <body className="min-h-dvh bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
