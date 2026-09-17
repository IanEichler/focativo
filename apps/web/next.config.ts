import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

const securityHeaders = [
  // Diretivas que não dependem de nonce; política de scripts entra no hardening (Fase 10).
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

// Imagens de catálogo servidas pelo bucket público do Supabase Storage.
const supabaseImagePattern = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return { protocol: "https" as const, hostname: "**.supabase.co", pathname: "/storage/v1/object/public/**" };
  const parsed = new URL(url);
  return {
    protocol: parsed.protocol.replace(":", "") as "http" | "https",
    hostname: parsed.hostname,
    port: parsed.port,
    pathname: "/storage/v1/object/public/**",
  };
})();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns: [supabaseImagePattern],
  },
  experimental: {
    serverActions: {
      // Upload de imagem de produto (limite de 2 MB + overhead do multipart).
      bodySizeLimit: "3mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
