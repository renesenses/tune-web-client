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
    expect(b.length).toBe(23);
    for (const x of b) {
      expect(x.url, x.url).toMatch(/^\.\.\/assets\/polices\/[\w-]+\/[\w-]+\.woff2$/);
      expect(existsSync(resolve(RACINE, 'src/styles', x.url)), x.url).toBe(true);
      expect(x.display).toBe('swap');
      expect(x.plage).toMatch(/^U\+/);
    }
  });

  it('Inter 400/600/700 et Cormorant Garamond 600/700, rien d’autre', () => {
    const b = blocs(lire(CSS));
    const graisses = (f: string) => [...new Set(b.filter((x) => x.famille === f).map((x) => x.graisse))].sort();
    expect(graisses('Inter')).toEqual([400, 600, 700]);
    expect(graisses('Cormorant Garamond')).toEqual([600, 700]);
    expect(new Set(b.map((x) => x.famille))).toEqual(new Set(['Inter', 'Cormorant Garamond']));
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
    expect(dossiers.size).toBe(2);
    for (const d of dossiers) {
      expect(readFileSync(resolve(d, 'OFL.txt'), 'utf8')).toMatch(/SIL Open Font License, Version 1\.1/);
    }
  });
});
