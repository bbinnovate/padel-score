import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Score Tracker by CourtsidewithPri",
  description:
    "Padel Point Keeper is a mobile app for tracking padel match scores and unforced errors.",
  authors: [{ name: "CourtsidewithPri" }],
  openGraph: {
    title: "Score Tracker by CourtsidewithPri",
    description:
      "Padel Point Keeper is a mobile app for tracking padel match scores and unforced errors.",
    type: "website",
    images: [
      "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/cc0186bf-512c-48a6-a06f-adbbc655bdb3/id-preview-ddfe1c16--d830c2b0-a3d5-4de6-8b5c-fe48c5eb6b63.lovable.app-1778421995093.png",
    ],
  },
  twitter: {
    card: "summary",
    site: "@Lovable",
    title: "Score Tracker by CourtsidewithPri",
    description:
      "Padel Point Keeper is a mobile app for tracking padel match scores and unforced errors.",
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
