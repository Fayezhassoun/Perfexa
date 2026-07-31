/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: [
    '@growthcrew/db',
    '@growthcrew/llm',
    '@growthcrew/agents',
    '@growthcrew/integrations',
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
