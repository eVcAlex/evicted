import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Evicted',
    short_name: 'Evicted',
    description: 'Who finished bottom this week, and have they paid up',
    start_url: '/',
    display: 'standalone',
    background_color: '#101215',
    theme_color: '#101215',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
