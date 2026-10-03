/** @type {import('next').NextConfig} */

// Where the Express backend lives, as seen from the Next.js server. Read when
// the config loads, which for a standalone build is at `next build` — so set
// BACKEND_URL in the build environment, not only at runtime.
const backendUrl = (process.env.BACKEND_URL || 'http://localhost:4000').replace(/\/+$/, '')

const nextConfig = {
  // A self-contained server in .next/standalone, for the Docker image.
  // Vercel ignores this and builds its own output.
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        // API calls stay same-origin, so the auth cookies are first-party
        // and no CORS preflight is needed.
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        // Generated board artifacts (SVGs, GLB) are written into the backend's
        // upload directory and served by its express.static mount. They are far
        // too large to travel in a Socket.io payload, so the pipeline returns
        // URLs and the browser fetches them through this rewrite — same origin,
        // so no CORS and cookies still apply.
        source: '/uploads/:path*',
        destination: `${backendUrl}/uploads/:path*`,
      },
    ]
  },
}

export default nextConfig
