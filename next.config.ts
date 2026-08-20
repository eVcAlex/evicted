import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  sassOptions: {
    implementation: 'sass-embedded',
    loadPaths: [process.cwd()],
    additionalData: '@use "_mantine" as mantine;',
  },
};

export default nextConfig;
