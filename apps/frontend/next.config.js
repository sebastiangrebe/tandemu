/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@tandemu/types"],
};

// Conditionally wrap with Sentry — only for SaaS builds with auth token
let config = nextConfig;
if (process.env.SENTRY_AUTH_TOKEN) {
  const { withSentryConfig } = await import('@sentry/nextjs');
  config = withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT_FRONTEND,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
  });
}

export default config;
