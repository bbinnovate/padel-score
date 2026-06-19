import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const viewport: Viewport = {
  themeColor: "#0047FF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Padel Score",
  description: "Live padel match scorer — track points, sets and unforced errors.",
  authors: [{ name: "CourtsidewithPri" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Padel Score",
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: "Padel Score by CourtsidewithPri",
    description: "Live padel match scorer — track points, sets and unforced errors.",
    type: "website",
    images: [
      "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/cc0186bf-512c-48a6-a06f-adbbc655bdb3/id-preview-ddfe1c16--d830c2b0-a3d5-4de6-8b5c-fe48c5eb6b63.lovable.app-1778421995093.png",
    ],
  },
  twitter: {
    card: "summary",
    site: "@Lovable",
    title: "Padel Score by CourtsidewithPri",
    description: "Live padel match scorer — track points, sets and unforced errors.",
    images: [
      "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/cc0186bf-512c-48a6-a06f-adbbc655bdb3/id-preview-ddfe1c16--d830c2b0-a3d5-4de6-8b5c-fe48c5eb6b63.lovable.app-1778421995093.png",
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
