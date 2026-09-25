import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
  // Sans ce plugin, les runes ne sont pas compilées et tout fichier
  // `.svelte.ts` échoue à l'exécution en `rune_outside_svelte` — ce qui rendait
  // la réactivité Svelte intestable, et donc non couverte. `hot: false` : pas
  // de HMR en test, ça n'apporte rien et charge le graphe de modules.
  plugins: [svelte({ hot: false })],
  // Sans la condition `browser`, Vitest resout la build SSR de Svelte, dans
  // laquelle `$effect` est un no-op : les effets ne se declenchent jamais et
  // un test de reactivite passe au vert sans rien avoir execute. Pire qu'un
  // test absent.
  resolve: {
    conditions: ['browser'],
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    // Les onze dictionnaires, enregistrés avant chaque banc : i18n.ts ne les
    // importe plus en statique (tune-server-rust#4800, cause 4).
    //
    // Le stockage d'abord (#1555) : sous Node ≥ 25, le `localStorage` natif de
    // Node masque celui de jsdom et vaut `undefined` — `getToken()` levait,
    // et pontRoonImport4349 tombait à 10 rouges sur 10 sous Node 26.
    setupFiles: ['src/lib/__tests__/setupStockageWeb.ts', 'src/lib/__tests__/setupLocales.ts'],
  },
});
