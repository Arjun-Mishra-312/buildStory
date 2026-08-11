import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { AppShell } from "@/components/shell/app-shell";
import { getCreatorSession } from "@/lib/auth/runtime";
import { viewerFromSession } from "@/components/shell/viewer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "buildstory.local";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og.jpg", metadataBase).toString();

  return {
    metadataBase,
    title: {
      default: "Buildstory - Your AI build, decoded.",
      template: "%s - Buildstory",
    },
    description:
      "Private AI-build reports that reveal decisions, patterns, costs, progress, and evidence-backed turning points.",
    openGraph: {
      type: "website",
      siteName: "Buildstory",
      title: "Your AI build, decoded.",
      description:
        "Private AI-build reports, with optional publishing when you are ready to share.",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "Buildstory - Your AI build, decoded.", type: "image/jpeg" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Your AI build, decoded.",
      description:
        "Private AI-build reports, with optional publishing when you are ready to share.",
      images: [socialImage],
    },
  };
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3efe6" },
    { media: "(prefers-color-scheme: dark)", color: "#11151f" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const creator = await getCreatorSession();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script src="/theme-boot.js" strategy="beforeInteractive" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AppShell viewer={viewerFromSession(creator)}>{children}</AppShell>
      </body>
    </html>
  );
}
