import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Integration Ops Console",
  description:
    "A B2B SaaS demo for triaging integration failures, assigning the right owner, and recovering safely.",
  openGraph: {
    title: "Integration Ops Console",
    description:
      "Triage integration failures, find the right owner, and recover with evidence still attached.",
    images: [
      {
        url: "/og.png",
        width: 1280,
        height: 720,
        alt: "Integration Ops Console product interface",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Integration Ops Console",
    description:
      "A working Integration Ops demo for B2B SaaS incident recovery.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
