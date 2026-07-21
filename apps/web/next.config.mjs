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
  webpack: (config) => {
    // Workspace packages use ESM ".js" import specifiers for ".ts" sources.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
