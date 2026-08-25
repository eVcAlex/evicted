import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  sassOptions: {
    implementation: 'sass-embedded',
    loadPaths: [process.cwd()],
    additionalData: '@use "_mantine" as mantine;',
  },
  // Mostly makes the modern browser default explicit rather than adding new
  // protection — query strings are already stripped from a cross-origin
  // `Referer`. The one place that matters here is `/api/monzo/auth`, whose
  // URL carries `?pin=...`; see the comment on that route for what this does
  // and does not cover.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }],
      },
    ];
  },
};

export default nextConfig;
