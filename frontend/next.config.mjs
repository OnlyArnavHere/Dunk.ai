/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000'
    return [
      {
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
