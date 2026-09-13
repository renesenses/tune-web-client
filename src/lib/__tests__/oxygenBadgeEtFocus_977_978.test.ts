/**
 * Deux retours d’Alex Campbell sur l’écran Oxygen, le 12/09/2026.
 *
 * ## #977 — le badge de qualité barrait la pochette
 *
 *   « the encoding title covering the album art in Oxygen has to go! You can
 *     see its simply not legible and a bad design choice, can you remove it
 *     entirely or implement the same details below next to artist and album? »
 *
 * Sa capture montre huit pochettes où « HI-RES MAX ✦ FLAC 192/24 » traverse le
 * haut de l’image ; sur les claires — *Morning Phase*, *American Beauty* — il
 * disparaît.
 *
 * 🔴 Ce n’est pas une préférence nouvelle. Bertrand a tranché la MÊME question
 * le 05/09/2026 pour la nouvelle interface (« mets-le sur une troisième
 * ligne »), et `v2/QualiteAlbum` porte depuis le diagnostic exact : un badge
 * translucide se perd sur une pochette claire, et la barre d’actions du survol
 * le recouvre. Oxygen était resté en arrière.
 *
 * ## #978 — le bouton « sans distraction » était inerte en `?v2`
 *
 *   « it also appears the full screen button in Oxygen does not do anything. »
 *
 * `OxygenView` est monté par les DEUX coquilles ; `focusMode` n’était lu que
 * par `App.svelte`, que `?v2` ne monte jamais. Écrit, mais pas branché.
 *
 * ## Ce que ces gardes ne tiennent PAS
 *
 * La lisibilité RÉELLE à l’écran. Une garde de source ne mesure pas un
 * contraste ; elle empêche le badge de retourner sur la pochette, et le mode
 * de redevenir muet.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

/**
 * Le contenu de la balise `class="<classe>"` jusqu’à sa fermeture, repérée par
 * l’indentation. Sert à demander « qu’y a-t-il DANS la pochette ? ».
 */
function contenuDe(texte: string, classe: string): string {
  const lignes = texte.split('\n');
  const debut = lignes.findIndex((l) => l.includes(`class="${classe}"`));
  expect(debut, `aucune balise class="${classe}"`).toBeGreaterThan(-1);
  const marge = lignes[debut].length - lignes[debut].trimStart().length;
  let fin = -1;
  for (let i = debut + 1; i < lignes.length; i++) {
    const l = lignes[i];
    if (l.trim() === '</div>' && l.length - l.trimStart().length === marge) { fin = i; break; }
  }
  expect(fin, `class="${classe}" ne se referme pas`).toBeGreaterThan(debut);
  return lignes.slice(debut + 1, fin).join('\n');
}

describe('#977 — la qualité quitte la pochette dans la grille Oxygen', () => {
  const oxy = () => lire('src/components/OxygenView.svelte');

  /** 🔴 LE DÉFAUT LUI-MÊME. */
  it('la pochette ne porte PLUS de badge de qualité', () => {
    const dans = contenuDe(oxy(), 'cwrap');
    expect(dans).not.toContain('QualityBadge');
    expect(dans).not.toContain('qov');
  });

  it('la pochette garde ce qui doit y rester : le cœur et le bouton Lire', () => {
    const dans = contenuDe(oxy(), 'cwrap');
    expect(dans).toContain('HeartButton');
    expect(dans).toContain('class="pov"');
  });

  it('le badge est rendu APRÈS le titre et l’artiste, sur sa propre ligne', () => {
    const t = oxy();
    const iTitre = t.indexOf('<div class="ct">');
    const iArtiste = t.indexOf('<div class="ca">', iTitre);
    const iQualite = t.indexOf('<div class="cq">', iArtiste);
    expect(iTitre).toBeGreaterThan(-1);
    expect(iArtiste).toBeGreaterThan(iTitre);
    expect(iQualite).toBeGreaterThan(iArtiste);
    expect(t.slice(iQualite, iQualite + 260)).toContain('QualityBadge');
  });

  /** La règle d’avant ne doit pas pouvoir revenir par le style. */
  it('plus aucune règle ne positionne un badge sur la pochette', () => {
    expect(oxy()).not.toMatch(/\.qov\s*\{/);
  });

  /**
   * Contre-épreuve du DÉTECTEUR : sur un témoin où le badge EST dans la
   * pochette, `contenuDe` doit le voir — sinon la garde serait verte parce
   * qu’elle ne regarde rien.
   */
  it('le détecteur voit bien un badge resté sur la pochette', () => {
    const temoin = [
      '              <div class="cwrap">',
      '                <img class="cvr" />',
      '                <span class="qov"><QualityBadge /></span>',
      '              </div>',
    ].join('\n');
    expect(contenuDe(temoin, 'cwrap')).toContain('QualityBadge');
  });
});

describe('#978 — le mode sans distraction vaut dans les DEUX coquilles', () => {
  it('la nouvelle coquille lit `focusMode`', () => {
    const src = lire('src/components/v2/ShellV2.svelte');
    expect(src).toMatch(/import \{[^}]*focusMode[^}]*\} from '\.\.\/\.\.\/lib\/stores\/navigation'/);
    expect(src).toContain('$focusMode');
  });

  it('elle RETIRE la barre latérale, et passe à une seule colonne', () => {
    const src = lire('src/components/v2/ShellV2.svelte');
    expect(src).toMatch(/\{#if !\$focusMode\}<Sidebar \/>\{\/if\}/);
    expect(src).toMatch(/\.v2-row\.sans-distraction\{[^}]*grid-template-columns:\s*1fr/);
    expect(src).toContain('class:sans-distraction={$focusMode}');
  });

  it('l’ancienne coquille le lit toujours — on n’a rien déplacé', () => {
    const src = lire('src/App.svelte');
    expect(src).toContain('class:focus-mode={$focusMode}');
  });

  /**
   * 🔴 Les trois sorties. Sans barre latérale, un mode dont on ne sort pas
   * enferme l’utilisateur — c’est pour cela que `focusMode` n’est pas
   * persisté.
   */
  it('les trois sorties tiennent, et aucune ne dépend de la coquille', () => {
    const oxy = lire('src/components/OxygenView.svelte');
    // 1 · le bouton reste rendu quel que soit l'état
    expect(oxy).toContain('focusMode.set(!$focusMode)');
    // 2 · Échap, posé par la VUE et non par une coquille
    expect(oxy).toMatch(/Escape['"]? && get\(focusMode\)\)\s*focusMode\.set\(false\)/);
    // 3 · tout changement de vue le rabat
    expect(lire('src/lib/stores/navigation.ts')).toMatch(
      /activeView\.subscribe[\s\S]{0,600}?focusMode\.set\(false\)/,
    );
  });

  it('il reste NON persisté — un rechargement doit rendre l’interface complète', () => {
    const nav = lire('src/lib/stores/navigation.ts');
    const i = nav.indexOf('export const focusMode');
    const decl = nav.slice(i, nav.indexOf('\n', i));
    expect(decl).toContain('writable(false)');
    expect(decl).not.toContain('localStorage');
  });
});
