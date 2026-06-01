import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@codedartdev/slide-captcha-react/styles.css': new URL(
        '../../src/styles/slide-captcha.css',
        import.meta.url,
      ).pathname,
      '@codedartdev/slide-captcha-react': new URL('../../src/index.ts', import.meta.url).pathname,
    },
  },
});
