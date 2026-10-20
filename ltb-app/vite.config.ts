import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

// Production builds write a single un-hashed IIFE bundle + stylesheet into the
// WordPress plugin directory so ltb-plugin/ can be uploaded as-is. `npm run dev`
// serves index.html locally against the same entry point.
export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: resolve(import.meta.dirname, '../ltb-plugin/assets'),
    emptyOutDir: true,
    sourcemap: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'src/main.tsx'),
      output: {
        format: 'iife',
        entryFileNames: 'ltb-app.js',
        assetFileNames: 'ltb-app.[ext]',
      },
    },
  },
});
