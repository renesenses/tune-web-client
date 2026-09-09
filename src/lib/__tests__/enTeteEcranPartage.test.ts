/**
 * L'en-tête d'écran partagé.
 *
 * Bertrand, 08/09/2026 : « Remarques pour tous les écrans : harmoniser le
 * placement de la recherche et les boutons d'action qui doivent tous se
 * ressembler. »
 *
 * ## Ce qui était mesuré avant
 *
 * Vingt-cinq en-têtes, chacun son dessin :
 *
 *   bouton    `.add` h 40 / 13 px / --v2-txt      Zones, Playlists
 *             `.neuve` h 38 / 12,5 px / --v2-txt2 Radios, Collections, Support
 *             `.btn` h 40 / 14 px                 Bibliothèque
 *             `.lnk` padding 8/15 / 12 px         Historique, File, Santé…
 *             `.mk` plein h 40                    Zones, Playlists
 *             `.ghost`                            Accueil, Historique
 *   recherche 320 × 42  Bibliothèque
 *             320 × 40  Streaming
 *             300 × 40  Radios
 *             260 × 40  Podcasts
 *             240 × 36  Convertisseur, Déclic
 *             230 × 38  Extensions
 *
 * Six dessins de bouton et six de champ, pour deux gestes.
 *
 * ## Ce que garde ce fichier
 *
 * 1. les classes partagées existent, dans la FEUILLE et pas dans un composant ;
 * 2. plus aucun écran ne porte son propre `.top` / `.eyebrow` ;
 * 3. l'ORDRE, qui est la moitié de l'harmonisation : dans un en-tête, la
 *    recherche vient AVANT les onglets et les boutons ;
 * 4. plus aucun écran ne redessine un champ de recherche à lui.
 *
 * Le point 3 est le seul qui se voit à l'œil nu : sur Radios, la recherche
 * était après « Nouvelle station » ; sur Extensions, après les onglets.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';

const ECRANS = globSync('src/components/v2/*.svelte');
const FEUILLE = readFileSync('src/styles/tune-v2.css', 'utf8');

const lire = (f: string) => readFileSync(f, 'utf8');
const balisage = (f: string) => { const s = lire(f); const i = s.lastIndexOf('<style'); return i < 0 ? s : s.slice(0, i); };
const style = (f: string) => { const s = lire(f); const i = s.lastIndexOf('<style'); return i < 0 ? '' : s.slice(i).replace(/\/\*[\s\S]*?\*\//g, ' '); };

describe('les classes partagées existent', () => {
  it('la garde voit bien des écrans', () => {
    expect(ECRANS.length).toBeGreaterThan(30);
  });

  it('l’en-tête, la grappe d’actions, le bouton et le champ sont définis une fois', () => {
    for (const c of ['.v2-top', '.v2-titres', '.v2-eyebrow', '.v2-actions', '.v2-btn', '.v2-rech']) {
      expect(FEUILLE, `${c} manque à la feuille partagée`).toContain(c);
    }
    // L'action PRIMAIRE est une variante du même bouton, pas un second bouton.
    expect(FEUILLE).toContain('.v2-btn.primaire');
  });

  it('🔴 un seul bouton PLEIN par EN-TÊTE — deux ne désigneraient plus rien', () => {
    // Le compte porte sur l'en-tête, pas sur l'écran entier : un formulaire
    // posé plus bas (créer une paire stéréo, par exemple) a droit à son propre
    // bouton d'accord, et ne concurrence pas l'action de l'écran.
    const fautifs: string[] = [];
    for (const f of ECRANS) {
      for (const bloc of balisage(f).match(/<header class="v2-top[^"]*">[\s\S]*?<\/header>/g) ?? []) {
        const m = bloc.match(/class="v2-btn primaire"/g);
        // Deux restent permises : le même bouton dans les deux branches d'un
        // `{#if}` (créer / valider la création) n'en fait qu'un à l'écran.
        if (m && m.length > 2) fautifs.push(`${f.split('/').pop()} → ${m.length}`);
      }
    }
    expect(fautifs).toEqual([]);
  });
});

describe('plus aucun écran ne redessine l’en-tête', () => {
  it('🔴 aucun `.top` ni `.eyebrow` local ne subsiste', () => {
    const fautifs: string[] = [];
    for (const f of ECRANS) {
      const c = style(f);
      if (/(^|\s)\.top\s*[{ ]/.test(c)) fautifs.push(`${f.split('/').pop()} → .top`);
      if (/(^|\s)\.eyebrow\s*[{ ]/.test(c)) fautifs.push(`${f.split('/').pop()} → .eyebrow`);
    }
    expect(fautifs).toEqual([]);
  });

  it('🔴 aucun écran ne redessine un champ de recherche à lui', () => {
    // `.search` était le nom de six géométries différentes.
    const fautifs = ECRANS.filter((f) => /(^|\s)\.search\s*[{ ]/.test(style(f)));
    expect(fautifs.map((f) => f.split('/').pop())).toEqual([]);
  });

  it('les écrans emploient bien la classe partagée', () => {
    const avec = ECRANS.filter((f) => balisage(f).includes('class="v2-top"') || balisage(f).includes('class="v2-top '));
    // Vingt et un composants portent un en-tête d'écran ; le compte ne peut que
    // monter. S'il baisse, c'est qu'un écran est reparti dessiner le sien.
    expect(avec.length).toBeGreaterThanOrEqual(21);
  });
});

describe('🔴 l’ordre : la recherche AVANT les onglets et les boutons', () => {
  it('dans chaque en-tête qui porte les deux, le champ vient en premier', () => {
    const fautifs: string[] = [];
    for (const f of ECRANS) {
      const m = balisage(f);
      for (const bloc of m.match(/<header class="v2-top[^"]*">[\s\S]*?<\/header>/g) ?? []) {
        const rech = bloc.indexOf('class="v2-rech"');
        if (rech < 0) continue;
        for (const apres of ['class="v2-btn', 'class="tabs"', '<nav class="tabs']) {
          const i = bloc.indexOf(apres);
          if (i >= 0 && i < rech) fautifs.push(`${f.split('/').pop()} → ${apres} avant la recherche`);
        }
      }
    }
    expect(fautifs).toEqual([]);
  });
});
