import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'fs';
import { greffonVersionJson } from './src/build/versionJson';
import { greffonServiceWorker, identifiantDeBuild } from './src/build/serviceWorker';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Un identifiant par build (rc10) : la version du paquet ne change pas d'un
// build à l'autre. Il est écrit dans le bundle, dans `version.json` et dans
// `sw.js` — voir `src/build/serviceWorker.ts`.
const BUILD = identifiantDeBuild(pkg.version, Date.now(), process.env.TUNE_BUILD_ID);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __TUNE_BUILD__: JSON.stringify(BUILD),
  },
  // `greffonVersionJson` depose `dist/version.json`, que le serveur lit pour
  // dire QUELLE interface tourne (#3667). Sans lui, la ligne « Interface
  // (web) » de tout rapport de bogue affirme que le build est anterieur a
  // #3380 — y compris pour un build du jour.
  // `greffonServiceWorker` depose `dist/sw.js`, different a chaque build : sans
  // cela le navigateur ne remplace jamais le service worker (rc10).
  plugins: [svelte(), greffonVersionJson(pkg.version, BUILD), greffonServiceWorker(BUILD)],
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
