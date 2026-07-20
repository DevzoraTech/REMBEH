import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  // website/ is a standalone package inside the monorepo — pin tracing root
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
