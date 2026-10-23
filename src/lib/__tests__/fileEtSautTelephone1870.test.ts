/**
 * web#1870 — Lionel (fil 1638), téléphone, navigateur sur le port 8888 :
 * « En voulant voir la playlist en cours j'ai souvent cliqué sur le bandeau
 * d'avance du morceau », et « comment aller sur l'album du morceau joué ».
 *
 * Lu dans le code, au palier téléphone (≤ 768 px) de `TransportBar` :
 * - la barre de saut `.transport-progress` (18 px) restait affichée, rangée
 *   dans la colonne des commandes, juste sous lecture/suivant ;
 * - le bouton de la file était masqué avec les autres `.control-btn.small`.
 * Le pouce qui cherchait la file tombait donc sur une zone qui fait sauter
 * dans le morceau.
 *
 * Et dans « Lecture en cours », le titre d'album était un <p> cliquable dont
 * le seul signe était le survol, qui n'existe pas au doigt.
 *
 * jsdom ne calcule pas de mise en page : ces cas lisent les règles CSS et le
 * balisage, comme les autres gardes de mise en page de ce dépôt. Aucun essai
 * sur un vrai téléphone.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

/** Le corps d'un bloc `@media (…)` donné, accolades équilibrées. */
function blocMedia(css: string, entete: string): string {
  const i = css.indexOf(entete);
  expect(i, `bloc ${entete} introuvable`).toBeGreaterThan(-1);
  let n = 0;
  for (let j = css.indexOf('{', i); j < css.length; j++) {
    if (css[j] === '{') n++;
    else if (css[j] === '}' && --n === 0) return css.slice(i, j + 1);
  }
  throw new Error('bloc non refermé');
}

/** Les déclarations de la règle `selecteur { … }` dans `css`. */
function regle(css: string, selecteur: string): string {
  const re = new RegExp(`(^|[}\\s])${selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm');
  const m = css.match(re);
  expect(m, `règle « ${selecteur} » absente`).not.toBeNull();
  return m![2];
}

const transport = sansCommentaires(lire('src/components/partages/TransportBar.svelte'));
const telephone = blocMedia(transport, '@media (max-width: 768px)');

describe('#1870 — mini-barre de lecture du téléphone', () => {
  it('🔴 la barre de SAUT n’est plus dans la mini-barre', () => {
    expect(regle(telephone, '.transport-progress')).toMatch(/display:\s*none/);
  });

  it('🔴 la FILE y reste, en cible tactile de 44 px', () => {
    // Le bouton de file porte sa classe propre : c'est elle que le palier
    // téléphone rend visible, les autres petits boutons restent masqués.
    expect(transport).toMatch(/class="control-btn small queue-btn"[\s\S]{0,120}onclick=\{\(\) => activeView\.set\('queue'\)\}/);
    const file = regle(telephone, '.transport-controls .control-btn.small.queue-btn');
    expect(file).toMatch(/display:\s*flex/);
    expect(file).toMatch(/width:\s*44px/);
    expect(file).toMatch(/height:\s*44px/);
    // La règle qui masque les petits boutons est moins précise : la file
    // l'emporte même si l'ordre changeait.
    expect(regle(telephone, '.transport-controls .control-btn.small')).toMatch(/display:\s*none/);
  });

  it('la progression reste visible, mais ne capte aucun toucher', () => {
    const trait = regle(telephone, '.transport-bar::after');
    expect(trait).toMatch(/pointer-events:\s*none/);
    expect(trait).toMatch(/width:\s*var\(--compact-progress/);
  });
});

describe('#1870 — « Aller à l’album » dans Lecture en cours', () => {
  const np = lire('src/components/partages/NowPlaying.svelte');
  const npSans = sansCommentaires(np);

  it('🔴 le titre d’album est un vrai bouton (doigt, clavier, lecteur d’écran)', () => {
    expect(npSans).toMatch(/<button type="button" class="track-album truncate clickable"[^>]*onclick=\{\(\) => navigateToAlbum\(/);
    expect(npSans).not.toMatch(/<p class="track-album/);
  });

  it('🔴 sans survol (écran tactile), il se voit souligné', () => {
    const tactile = blocMedia(npSans, '@media (hover: none)');
    const lien = regle(tactile, '.track-album.clickable');
    expect(lien).toMatch(/text-decoration:\s*underline/);
    expect(lien).toMatch(/min-height:\s*32px/);
  });
});
