import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Configure Tauri
  assetPrefix: process.env.NODE_ENV === 'production' ? './' : undefined,
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  // Disable server features for Tauri static export
  output: 'export',
  distDir: 'dist',
  // Disable TypeScript and ESLint during build for faster builds
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
}

export default nextConfig