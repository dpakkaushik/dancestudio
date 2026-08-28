import type { NextConfig } from "next";

/** The uploaded photos live in a PUBLIC Supabase Storage bucket, so next/image
 *  needs the host named before it will optimise them. One pattern, one bucket,
 *  read from the same env var the client uses — nothing else is allowed through. */
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();

const nextConfig: NextConfig = {
  images: supabaseHost
    ? {
        remotePatterns: [
          { protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/media/**" },
        ],
      }
    : undefined,
};

export default nextConfig;
