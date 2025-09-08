import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// Point the plugin to the i18n request config (per docs)
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  // Configure Tauri
  // Use absolute asset paths in production; relative prefixes like './'
  // break client-side chunk loading on nested routes in export builds.
  assetPrefix: undefined,
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

export default withNextIntl(nextConfig)
