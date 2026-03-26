/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    domains: ['res.cloudinary.com'],
  },
  serverExternalPackages: ['@neondatabase/serverless', 'pg'],
}

module.exports = nextConfig
