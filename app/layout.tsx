import type { Metadata, Viewport } from "next";
import { Inter_Tight, Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight" });

export const metadata: Metadata = {
  title: "DanceOS",
  description: "Where India dances — classes, studios, crews, and stages.",
  /* The Android APK is a Trusted Web Activity built from app/manifest.ts, which
     Next serves at /manifest.webmanifest. These two blocks are what the OTHER
     installers need: `appleWebApp` is how an iPhone opens it full-screen from
     "Add to Home Screen" (black-translucent lets the page draw under the status
     bar, which viewportFit: "cover" below already lays out for), and `icons`
     names the touch icon, since ours lives in public/ rather than app/. */
  appleWebApp: {
    capable: true,
    title: "DanceOS",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

/** viewport-fit=cover asks the browser to lay the page out under the notch/home
 *  indicator and publish the safe-area insets globals.css reads (prototype 19183+). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Applies the saved theme before first paint so a light-theme user never sees a
 *  dark flash. The key mirrors the prototype's persisted theme (`dosSet("theme")`). */
const THEME_BOOT = `try{var t=localStorage.getItem("__DOSTHEME");if(t==="light")document.documentElement.className="light"}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className={`${sora.variable} ${interTight.variable}`}>{children}</body>
    </html>
  );
}
