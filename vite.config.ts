import { defineConfig } from 'vite';

export default defineConfig({
  base: '/simgolf-web/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    open: true,
  },
});
