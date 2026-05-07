import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['ssh2'],
  allowedDevOrigins: ['db.spader.co.nz'],
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options',           value: 'DENY' },
        { key: 'X-Content-Type-Options',    value: 'nosniff' },
        { key: 'Referrer-Policy',           value: 'same-origin' },
        { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
        // Strict-Transport-Security: ignored by browsers on plain HTTP, safe to always include
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        // Monaco Editor requires unsafe-eval (web worker compilation) and blob: worker-src
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self'",
            "connect-src 'self'",
            "worker-src 'self' blob:",
            "frame-ancestors 'none'",
          ].join('; '),
        },
      ],
    },
  ],
};

export default nextConfig;
