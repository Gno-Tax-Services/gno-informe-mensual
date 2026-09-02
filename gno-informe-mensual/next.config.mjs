/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    domains: ['gnotaxservices.com', 'files2.heygen.ai'],
  },
};

export default nextConfig;
