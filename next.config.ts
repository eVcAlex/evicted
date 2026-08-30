import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  sassOptions: {
    implementation: 'sass-embedded',
    loadPaths: [process.cwd()],
    additionalData: '@use "_mantine" as mantine;',
  },
  // Make the modern-browser default explicit: a cross-origin `Referer` carries
  // only the origin, never the path or query. Nothing sensitive rides in a URL
  // here now, but it is a sound default to state rather than inherit.
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
