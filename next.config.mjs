if (process.argv.includes("dev")) {
  const { initOpenNextCloudflareForDev } = await import("@opennextjs/cloudflare");
  initOpenNextCloudflareForDev();
}

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
        hostname: 'media.windeg.com',
      },
      {
        protocol: 'https',
        hostname: '**.firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
    ],
  },

  // ============================================
  // 🛡️ SECURITY HEADERS
  // (CSP مؤجلة عمداً: الموقع بيحمّل سكريبتات Meta/TikTok/Kashier وتحتاج قائمة دقيقة أولاً)
  // ============================================
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        ],
      },
    ];
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
