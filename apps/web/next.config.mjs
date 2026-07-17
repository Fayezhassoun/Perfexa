/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@voxmarketer/db',
    '@voxmarketer/llm',
    '@voxmarketer/agents',
    '@voxmarketer/integrations',
  ],
  eslint: {
    // no eslint config in wave 1 — don't let builds fail on it
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
