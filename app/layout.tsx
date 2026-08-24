import type { Metadata, Viewport } from "next";
import { Inter_Tight, Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight" });

export const metadata: Metadata = {
  title: "DanceOS",
  description: "Where India dances — classes, studios, crews, and stages.",
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
