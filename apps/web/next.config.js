/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next adds `X-Powered-By: Next.js` after middleware runs, so deleting it in
  // middleware has no effect -- it has to be disabled at the config level.
  poweredByHeader: false,
};

export default nextConfig;
