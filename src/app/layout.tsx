import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VUNA Life — Veritas University Abuja digital campus",
  description:
    "A web-first digital twin of one real school. Verified students see their real timetable, attend real mass, and walk a real campus map.",
  keywords: ["VUNA Life", "Veritas University Abuja", "campus", "digital twin"],
  authors: [{ name: "VUNA Life" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ background: '#050d1a', margin: 0, padding: 0, maxWidth: 'none' }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
