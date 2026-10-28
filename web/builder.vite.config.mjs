import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('./builder', import.meta.url));
export default defineConfig({
  root,
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  esbuild: { jsx: 'automatic' },
  build: {
    outDir: '../dist-builder',
    emptyOutDir: true,
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules\/three/ }] } } },
  },
  server: { host: '127.0.0.1', port: 5174 },
});
