/** @type {import('next').NextConfig} */
const nextConfig = {
  // ============================================
  // 🌐 LEGACY BROWSER COMPATIBILITY
  // ============================================
  transpilePackages: ['firebase', '@firebase/app', '@firebase/auth', '@firebase/database', '@firebase/firestore', '@firebase/storage', '@firebase/component', '@firebase/util', 'swr'],
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : false,
  },

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
  // 🔄 REDIRECTS FOR SEO
  // ============================================
  async redirects() {
    return [
      {
        source: '/product/:path*',
        destination: '/products/:path*',
        permanent: true, // مهم جداً للـ SEO
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