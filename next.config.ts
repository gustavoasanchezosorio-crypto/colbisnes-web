import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://checkout.wompi.co https://www.paypalobjects.com https://www.paypal.com https://static.cloudflareinsights.com",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://res.cloudinary.com https://lh3.googleusercontent.com https://avatars.githubusercontent.com",
      "font-src 'self'",
      "connect-src 'self' blob: https://api.wompi.co https://sandbox.wompi.co https://cloudflareinsights.com wss: ws:",
      "frame-src https://checkout.wompi.co https://www.paypal.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  images: {
    // OPTIMIZADOR APAGADO A PROPÓSITO (mitigación de seguridad, no un ajuste de rendimiento).
    // El único camino de la app que llega a `sharp`/libvips es la ruta interna /_next/image,
    // y `sharp` arrastra vulnerabilidades conocidas en la versión que Next 16.2.12 fija en sus
    // optionalDependencies (no se puede subir sin pelear con el pin de next).
    // En este proyecto NADA usa <Image> de next/image: todas las fotos se sirven directo desde
    // Cloudinary con <img>. Con `unoptimized: true`, Next devuelve 404 en /_next/image ANTES de
    // instanciar el optimizador — verificado en node_modules/next/dist/server/next-server.js:198:
    //     if (imagesConfig.loader !== 'default' || imagesConfig.unoptimized) { await this.render404(...) }
    // Resultado: el código vulnerable queda inalcanzable, con cero impacto funcional.
    // Si algún día se empieza a usar <Image>, hay que quitar esta bandera Y actualizar sharp antes.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 3600,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
