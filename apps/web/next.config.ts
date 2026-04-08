import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@bi/ui', '@bi/schemas', '@bi/types'],
  typedRoutes: true,
  output: 'standalone',
};

export default nextConfig;
