/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Suppress missing optional dependencies from WalletConnect/pino bundled inside wagmi
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "pino-pretty": false,
      "@react-native-async-storage/async-storage": false,
      "@coral-xyz/anchor": false,
      "@solana/web3.js": false,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Allow Telegram Mini App to embed and load scripts from telegram.org
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org https://*.telegram.org https://*.circle.com",
              "connect-src 'self' https: wss:",
              "img-src 'self' data: https: blob:",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "frame-src https://telegram.org https://*.telegram.org https://pw-auth.circle.com https://*.circle.com",
            ].join("; "),
          },
          // Allow iframe embedding from Telegram
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
    ];
  },
};

export default nextConfig;
