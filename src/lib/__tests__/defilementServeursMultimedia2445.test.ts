// @vitest-environment jsdom
// La liste des sources est hors du défileur des dossiers. Elle doit donc
// pouvoir défiler avec la page. La mesure complète est rejouée en Chromium
// sur Shrek : huit sources, fenêtre 1100 x 600, molette vers la dernière action.
import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';
import { expect, it } from 'vitest';
const chemin = 'src/components/v2/MediaServersV2.svelte';
const css = compile(readFileSync(chemin, 'utf8'), { filename: chemin, css: 'external' }).css!.code;
it('#2445 : les actions des sources peuvent défiler hors de la première hauteur', () => {
  const style = document.createElement('style'); style.textContent = css;
  const page = document.createElement('section');
  const classe = /\.v2-ms\.(svelte-[\w-]+)/.exec(css)![1];
  page.className = `v2-ms ${classe}`;
  document.head.append(style); document.body.append(page);
  try {
    const rendu = getComputedStyle(page);
    expect(['auto', 'scroll']).toContain(rendu.overflowY || rendu.overflow);
  } finally { page.remove(); style.remove(); }
});
