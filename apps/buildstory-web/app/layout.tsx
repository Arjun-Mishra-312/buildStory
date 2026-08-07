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
      default: "Buildstory — Show the story behind the software",
      template: "%s · Buildstory",
    },
    description:
      "A community for AI-assisted software builders to share the decisions, detours, and tools behind what they ship.",
    openGraph: {
      type: "website",
      siteName: "Buildstory",
      title: "Every build has a story.",
      description:
        "Private-first build reports and public stories for people making software with AI.",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "Buildstory — Every build has a story." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Every build has a story.",
      description:
        "Private-first build reports and public stories for people making software with AI.",
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
