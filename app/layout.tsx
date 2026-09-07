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

/** The boot splash the Android app opens onto. Only `display-mode: standalone`
 *  (the installed TWA / an installed PWA) ever shows it — a browser tab never
 *  does — and it paints with the very first HTML bytes, so the app's first
 *  moments are the wordmark on the app's own dark instead of a blank white
 *  frame. It fades as soon as the document is ready (held ~650ms so it reads as
 *  an opening, not a flicker); pointer-events are off so it can never trap a
 *  tap, and a CSS failsafe removes it at 7s even if scripts never run. */
const BOOT_CSS = `
#dos-boot{display:none;position:fixed;inset:0;z-index:9999;background:#0A0A0A;align-items:center;justify-content:center;pointer-events:none;opacity:1;transition:opacity .3s ease;animation:dosBootGone .3s ease 7s forwards}
@media (display-mode: standalone){#dos-boot{display:flex}}
#dos-boot span{font-weight:800;font-size:31px;letter-spacing:-.6px;color:#FAFAFA;font-family:Sora,"SF Pro Display",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;animation:dosBootPulse 1.6s ease infinite}
@keyframes dosBootPulse{0%,100%{opacity:.6}50%{opacity:1}}
@keyframes dosBootGone{to{opacity:0;visibility:hidden}}
`;
const BOOT_JS = `(function(){var b=document.getElementById("dos-boot");if(!b)return;var t0=Date.now();function go(){setTimeout(function(){b.style.opacity="0";setTimeout(function(){b.style.visibility="hidden"},350)},Math.max(0,650-(Date.now()-t0)))}if(document.readyState!=="loading"){go()}else{document.addEventListener("DOMContentLoaded",go)}})();`;

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
      <body className={`${sora.variable} ${interTight.variable}`}>
        <style dangerouslySetInnerHTML={{ __html: BOOT_CSS }} />
        {/* mutated by BOOT_JS before hydration, so React must not patch it back */}
        <div id="dos-boot" suppressHydrationWarning>
          <span>
            Dance<span style={{ color: "#5AC8FA" }}>OS</span>
          </span>
        </div>
        <script dangerouslySetInnerHTML={{ __html: BOOT_JS }} />
        {children}
      </body>
    </html>
  );
}
