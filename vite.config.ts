/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths: the build works at the root of eeg-primer.tomkr.ai and under any sub-path
  base: './',
  // Dev server: `npm run dev` → http://localhost:5173 with hot-module reload on every save.
  server: { port: 5173, strictPort: false, open: false },
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['tests/**/*.test.ts'] },
});
