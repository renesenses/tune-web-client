// Harmonisation de l'interface, phase 1 (26/11/2026) — polices AUTO-HÉBERGÉES.
//
// Tune tourne aussi hors ligne : un serveur sans accès à Internet servait
// l'interface sans ses polices (Google Fonts injoignable), chaque système
// retombant sur la sienne. Les polices vivent désormais dans le dépôt
// (src/assets/polices/), déclarées par src/styles/polices.css.
//
// Cette garde lit les fichiers : aucune police demandée à une autre origine,
// chaque `url()` pointe vers un fichier présent, `font-display: swap` partout,
// la licence OFL à côté de chaque famille, et les graisses retenues.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const RACINE = process.cwd();
const lire = (p: string) => readFileSync(resolve(RACINE, p), 'utf8');
const CSS = 'src/styles/polices.css';

/** Les blocs `@font-face` : famille, graisse, fichier, display. */
function blocs(css: string) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => ({
    famille: /font-family:\s*'([^']+)'/.exec(m[1])?.[1],
    graisse: Number(/font-weight:\s*(\d+)/.exec(m[1])?.[1]),
    url: /url\('([^']+)'\)/.exec(m[1])?.[1] ?? '',
    display: /font-display:\s*(\w+)/.exec(m[1])?.[1],
    plage: /unicode-range:\s*([^;]+)/.exec(m[1])?.[1],
  }));
}

describe('polices auto-hébergées', () => {
  it('index.html ne demande plus rien à Google Fonts', () => {
    const html = lire('index.html');
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });

  it('main.ts charge polices.css avant les feuilles de jetons', () => {
    const main = lire('src/main.ts');
    const i = main.indexOf("import './styles/polices.css'");
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(main.indexOf("import './styles/fondations.css'"));
    expect(main.indexOf("import './styles/fondations.css'")).toBeLessThan(main.indexOf("import './styles/tune-theme.css'"));
  });

  it('chaque @font-face : fichier woff2 local présent, swap, plage unicode', () => {
    const b = blocs(lire(CSS));
    expect(b.length).toBe(44);
    for (const x of b) {
      expect(x.url, x.url).toMatch(/^\.\.\/assets\/polices\/[\w-]+\/[\w-]+\.woff2$/);
      expect(existsSync(resolve(RACINE, 'src/styles', x.url)), x.url).toBe(true);
      expect(x.display).toBe('swap');
      expect(x.plage).toMatch(/^U\+/);
    }
  });

  // Les graisses que Google Fonts servait jusqu'ici : le rendu ne bouge pas
  // (rc14). Cormorant 500 n'était pas chargé — un 500 retombe sur 400, comme avant.
  it('Inter 400/500/600/700 et Cormorant Garamond 400/600/700 (+ 400 italique)', () => {
    const b = blocs(lire(CSS));
    const graisses = (f: string) => [...new Set(b.filter((x) => x.famille === f).map((x) => x.graisse))].sort();
    expect(graisses('Inter')).toEqual([400, 500, 600, 700]);
    expect(graisses('Cormorant Garamond')).toEqual([400, 600, 700]);
    expect(lire(CSS)).toMatch(/cormorant-garamond-latin-400-italic\.woff2/);
    expect(new Set(b.map((x) => x.famille))).toEqual(new Set(['Inter', 'Cormorant Garamond', 'Playfair Display']));
  });

  // Interface Salon : sa serif de titres, embarquée comme les deux autres
  // (elle venait du paquet @fontsource, importé par jetons-roon-like.css).
  it('Playfair Display 400/500 pour les titres de Salon, sans paquet npm', () => {
    const b = blocs(lire(CSS));
    const graisses = [...new Set(b.filter((x) => x.famille === 'Playfair Display').map((x) => x.graisse))].sort();
    expect(graisses).toEqual([400, 500]);
    expect(lire('src/styles/roon-like/jetons-roon-like.css')).not.toMatch(/@fontsource/);
    expect(lire('package.json')).not.toMatch(/@fontsource/);
  });

  it('Inter couvre le grec, le cyrillique et le vietnamien (l’ancienne bascule :lang(vi/el) n’existe plus)', () => {
    const urls = blocs(lire(CSS)).filter((x) => x.famille === 'Inter').map((x) => x.url);
    for (const s of ['latin', 'latin-ext', 'greek', 'cyrillic', 'vietnamese']) {
      expect(urls.some((u) => u.includes(`inter-${s}-400`)), s).toBe(true);
    }
    // Le commentaire qui raconte la suppression cite l'ancien sélecteur : on lit le CSS sans commentaires.
    expect(lire('src/styles/tune-theme.css').replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/:lang\(/);
  });

  it('la licence OFL accompagne chaque famille', () => {
    const dossiers = new Set(blocs(lire(CSS)).map((x) => dirname(resolve(RACINE, 'src/styles', x.url))));
    expect(dossiers.size).toBe(3);
    for (const d of dossiers) {
      expect(readFileSync(resolve(d, 'OFL.txt'), 'utf8')).toMatch(/SIL Open Font License, Version 1\.1/);
    }
  });
});
