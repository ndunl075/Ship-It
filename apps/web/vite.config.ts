import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  let origin = '';
  if (env.VITE_API_ORIGIN) {
    const url = new URL(env.VITE_API_ORIGIN);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error('VITE_API_ORIGIN must be an HTTPS origin');
    origin = url.origin;
  }
  const policy = `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ${origin}; worker-src 'self' blob:; base-uri 'self'; form-action 'none'; object-src 'none'; upgrade-insecure-requests`;
  return {
    base: '/Ship-It/',
    build: { chunkSizeWarningLimit: 1100 },
    plugins: [
      react(),
      {
        name: 'production-security-policy',
        apply: 'build',
        transformIndexHtml: () => [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
            injectTo: 'head-prepend',
          },
        ],
      },
    ],
  };
});
