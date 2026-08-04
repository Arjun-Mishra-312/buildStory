import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
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
  const socialImage = new URL("/og.png", metadataBase).toString();

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
      images: [{ url: socialImage, width: 1731, height: 909, alt: "Buildstory — Every build has a story." }],
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

const themeBootScript = `
  (function () {
    try {
      var stored = localStorage.getItem('buildstory-theme');
      var preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = stored || preferred;
    } catch (_) {
      document.documentElement.dataset.theme = 'light';
    }
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
