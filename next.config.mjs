/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_BUILD_VERSION:
      process.env.NEXT_PUBLIC_APP_BUILD_VERSION ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_REF ||
      process.env.npm_package_version ||
      "development"
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.figma.com",
        pathname: "/api/mcp/asset/**"
      }
    ]
  }
};

export default nextConfig;
