import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Recette visuelle rc12 (13/11/2026) — les défauts relevés au banc Playwright
// (API simulée, 1440 / 1280 / 1024 / 768 / 400 px, thèmes clair et sombre,
// tailles Petite / Normale / Grande). Captures avant / après :
// ~/DEV/coordination/scratch-b209/recette-ui/. Ces gardes fixent les règles
// qui les corrigent ; chacune échoue sur l'état d'avant (contre-épreuve).

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const style = (p: string) => sansCommentaires(lire(p).split('<style>')[1] ?? '');

describe('recette rc12 — en-têtes à onglets', () => {
  it.each([
    ['src/components/v2/LibraryV2.svelte', '.v2-lib'],
    ['src/components/v2/FavoritesV2.svelte', '.v2-fav'],
  ])('%s : les onglets passent sous le titre (hors vue mini)', (fichier, racine) => {
    const css = style(fichier);
    const top = `:global(.v2-shell:not(.mini)) ${racine} > .v2-top`;
    expect(css).toContain(`${top}{flex-wrap:wrap`);
    expect(css).toContain(`${top} > .v2-titres{flex:1 0 100%`);
    expect(css).toContain(`${top} > .v2-actions{flex:1 1 100%; justify-content:flex-start}`);
    // Fenêtre étroite : le titre sous la grappe.
    expect(css).toContain(`${top}{padding-top:var(--v2-grappe-h, 66px)}`);
  });

  it('Réglages : la recherche passe sous le titre sous 720 px', () => {
    const css = style('src/components/v2/SettingsV2.svelte');
    expect(css).toMatch(/@media \(max-width:720px\)\{\s*:global\(\.v2-shell:not\(\.mini\)\) \.v2-settings > \.v2-top\{flex-wrap:wrap/);
  });

  it('Réglages : une ligne se replie sous son libellé sur fenêtre étroite', () => {
    const css = style('src/components/v2/SettingsV2.svelte');
    expect(css).toMatch(/@media \(max-width:640px\)\{\s*\.row\{flex-wrap:wrap; row-gap:8px\}\s*\.row > \.lbl\{flex:1 1 200px\}/);
  });
});

describe('recette rc12 — fiches album et playlist étroites', () => {
  it.each([
    ['src/components/v2/AlbumDetailV2.svelte', '.v2-detail'],
    ['src/components/v2/PlaylistDetailV2.svelte', '.v2-pldetail'],
  ])('%s : la pochette passe au-dessus du titre sous 640 px', (fichier, racine) => {
    const css = style(fichier);
    expect(css).toContain(`${racine}{padding:20px 16px 32px}`);
    expect(css).toContain('.head:not(.compact){flex-direction:column; gap:18px}');
    expect(css).toMatch(/\.meta\{display:flex; flex-direction:column; gap:12px; padding-top:8px; min-width:0\}/);
  });
});

describe('recette rc12 — barre de lecture', () => {
  const css = style('src/components/partages/TransportBar.svelte');

  it('la colonne de gauche est un conteneur, et les ornements cèdent la place au titre', () => {
    expect(css).toMatch(/\.transport-left \{\s*container-type: inline-size;\s*container-name: tleft;/);
    expect(css).toMatch(/@container tleft \(max-width: 439px\) \{\s*\.tb-mini-viz \{ display: none; \}/);
    expect(css).toMatch(/@container tleft \(max-width: 359px\) \{\s*\.tb-crete \{ display: none; \}/);
    expect(css).toMatch(/@container tleft \(max-width: 239px\) \{\s*\.transport-left \.mini-badges \{ display: none; \}/);
  });

  it("la coquille ne réserve pas la place d'une barre d'onglets qu'elle n'a pas", () => {
    const v2 = sansCommentaires(lire('src/styles/tune-v2.css'));
    expect(v2).toContain('.v2-shell:not(.mini){--tab-bar-height:0px}');
  });
});

describe('recette rc12 — menus et barre latérale', () => {
  it('le menu ▾ du bouton Lecture est plus large que le menu par défaut (208 px)', () => {
    const src = lire('src/components/v2/BoutonLectureV2.svelte');
    const m = src.match(/const LARGEUR_MENU_LECTURE = (\d+);/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(208);
    expect(src).toContain('largeur={LARGEUR_MENU_LECTURE}');
  });

  it('les intertitres repliables gardent le retrait des intertitres fixes', () => {
    const css = style('src/components/v2/Sidebar.svelte');
    expect(css).toMatch(/\.grp-label\{[^}]*padding:11px 14px 5px/);
    expect(css).toMatch(/\.grp-pli\{[^}]*padding-inline:14px\}/);
    expect(css).not.toMatch(/\.grp-pli\{[^}]*padding-inline:0\}/);
  });
});

describe('recette rc12 — textes', () => {
  it("l'aide du thème ne compte plus les palettes (il y en a neuf, elle en annonçait sept)", () => {
    const dossier = resolve(process.cwd(), 'src/lib/locales');
    const locales = readdirSync(dossier).filter((f) => /^[a-z]{2}\.ts$/.test(f));
    expect(locales.length).toBeGreaterThanOrEqual(15);
    for (const f of locales) {
      const src = readFileSync(resolve(dossier, f), 'utf-8');
      const m = src.match(/"settings\.themePalettesHint": "([^"]*)"/);
      expect(m, f).not.toBeNull();
      expect(m![1], f).not.toMatch(/^(Sept|Seven|Sieben|Siete|Sette|Sju|Siedem|Șapte|Hét|Επτά|Bảy|7 |七|일곱)/);
    }
  });
});
