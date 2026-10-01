/**
 * Сборка = статический экспорт в папку out/.
 * Node.js нужен только для сборки; на хостинг загружается out/ (там же лежит PHP API).
 *
 * BASE_PATH — если сайт открывается из подпапки, например https://site.ru/hangul,
 * соберите так:  BASE_PATH=/hangul npm run build
 */
const isDev = process.env.NODE_ENV === 'development';
const basePath = process.env.BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isDev ? undefined : 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // В режиме разработки запросы к API проксируются на встроенный PHP-сервер (npm run api)
  ...(isDev && {
    async rewrites() {
      return [{ source: '/api/:path*', destination: 'http://localhost:8000/api/:path*' }];
    },
  }),
};

export default nextConfig;
