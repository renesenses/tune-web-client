import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'fs';
import { greffonVersionJson } from './src/build/versionJson';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // `greffonVersionJson` depose `dist/version.json`, que le serveur lit pour
  // dire QUELLE interface tourne (#3667). Sans lui, la ligne « Interface
  // (web) » de tout rapport de bogue affirme que le build est anterieur a
  // #3380 — y compris pour un build du jour.
  plugins: [svelte(), greffonVersionJson(pkg.version)],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8888',
      '/ws': {
        target: 'ws://localhost:8888',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
