/** @type {import('next').NextConfig} */
const nextConfig = {
  // ============================================
  // 🖼️ IMAGE OPTIMIZATION CONFIGURATION
  // ============================================
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.imagekit.io',
      },
      {
        protocol: 'https',
        hostname: '**.firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: '**.cloudinary.com',
      },
    ],
  },

  // ============================================
  // 🔄 REWRITES FOR DYNAMIC ROUTING
  // ============================================
  async rewrites() {
    return [
      {
        /** * السحر هنا: أي رابط فرعي (ما عدا الملفات الثابتة والصفحات الموجودة فعلياً)
         * سيتم توجيهه داخلياً لمسار الكولكشنز الديناميكي.
         */
        source: '/:slug',
        destination: '/collections/:slug',
      },
    ];
  },

  // ============================================
  // 🔥 FIREBASE EDGE COMPATIBILITY (Cloudflare Pages)
  // ============================================
  webpack: (config, { isServer, nextRuntime }) => {
    if (isServer && nextRuntime === 'edge') {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@firebase/firestore': '@firebase/firestore/dist/index.cjs.js',
      };
    }
    return config;
  },
};

export default nextConfig;