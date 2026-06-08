/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `mongodb` is a server-only dependency; keep it external to the bundle.
  serverExternalPackages: ["mongodb"],
};

export default nextConfig;
