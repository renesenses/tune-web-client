/**
 * « Affichage sur petit écran » (Bertrand, 07/09/2026).
 *
 * ## Le constat, mesuré avant correction
 *
 * `ShellV2`, `Sidebar` et `styles/tune-v2.css` ne contenaient AUCUNE media
 * query — zéro, comptée. La barre latérale gardait donc ses 236 px quelle que
 * soit la fenêtre. Dans un cadre de 390 px sur le .18 :
 *
 *     largeur de la fenêtre : 390 px
 *     barre latérale        : 236 px   (60 % de l'écran)
 *     reste pour la vue     : 154 px
 *
 * « Zones d'écoute actives » tenait sur trois lignes, « Rien à montrer pour
 * l'instant. » sur quatre, et l'en-tête passait sous l'avatar.
 *
 * ## Après correction, mesuré dans trois cadres
 *
 *     1400 px  ->  barre 236 px, telle quelle
 *      900 px  ->  barre  72 px, repliée en icônes
 *      390 px  ->  barre hors flux (`visibility:hidden`), vue pleine largeur
 *
 * Et dans les trois : `scrollWidth === clientWidth`, aucun défilement
 * horizontal de page.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatPour, SEUIL_ICONES, SEUIL_TIROIR } from '../largeurEcran';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const barre = () => lire('src/components/v2/Sidebar.svelte');
const coquille = () => lire('src/components/v2/ShellV2.svelte');

describe('Les trois paliers', () => {
  it('chaque largeur tombe dans le bon palier', () => {
    expect(formatPour(1920)).toBe('large');
    expect(formatPour(SEUIL_ICONES + 1)).toBe('large');
    expect(formatPour(SEUIL_ICONES)).toBe('etroit');
    expect(formatPour(900)).toBe('etroit');
    expect(formatPour(SEUIL_TIROIR + 1)).toBe('etroit');
    expect(formatPour(SEUIL_TIROIR)).toBe('tiroir');
    expect(formatPour(390)).toBe('tiroir');
  });

  it('les seuils sont ORDONNÉS — sinon un palier devient inatteignable', () => {
    expect(SEUIL_TIROIR).toBeLessThan(SEUIL_ICONES);
  });

  it('aucune largeur ne reste sans palier', () => {
    for (let w = 200; w <= 2200; w += 7) {
      expect(['large', 'etroit', 'tiroir'], `largeur ${w}`).toContain(formatPour(w));
    }
  });
});

describe('Ce que les paliers commandent', () => {
  it('sous 1100 px la barre se replie EN ICÔNES, d’office', () => {
    const src = barre();
    expect(/\$formatEcran === 'etroit'/.test(src),
      'le palier « étroit » ne commande plus le repli').toBe(true);
    expect(/class:collapsed=\{enIcones\}/.test(src),
      'la classe de repli ne suit plus le palier').toBe(true);
  });

  it('🔴 le choix MANUEL n’est jamais écrasé dans le stockage', () => {
    // Réduire puis agrandir la fenêtre doit rendre son état à l'utilisateur.
    // Une écriture dans `localStorage` depuis le calcul de palier le perdrait
    // pour de bon.
    const src = barre();
    const ecritures = [...src.matchAll(/localStorage\.setItem\('tune_v2_sidebar_collapsed'/g)].length;
    expect(ecritures, 'le repli automatique écrit la préférence : le choix de l’utilisateur serait perdu')
      .toBe(1); // uniquement dans `toggleCollapse`
    expect(/function toggleCollapse\(\)[\s\S]{0,220}localStorage\.setItem\('tune_v2_sidebar_collapsed'/.test(src),
      'la seule écriture n’est plus celle du bouton').toBe(true);
  });

  it('sous 760 px la barre SORT DU FLUX, et la rangée n’a plus qu’une colonne', () => {
    expect(/\.v2-sidebar\.tiroir\{[^}]*position:fixed/.test(barre()),
      'la barre reprend de la place dans le flux : 72 px sur 390 px en mangent un cinquième').toBe(true);
    expect(/@media \(max-width: 760px\)\{\s*\.v2-row\{grid-template-columns:1fr\}/.test(coquille()),
      'la grille garde sa colonne de barre : un vide resterait à gauche de la vue').toBe(true);
  });

  it('fermée, elle n’est ni cliquable ni atteignable au clavier', () => {
    // `transform` seul la déplacerait en la laissant focusable : on tabulerait
    // dans une navigation invisible. `display:none` la retire de l'ordre de
    // tabulation.
    expect(/\.v2-sidebar\.tiroir:not\(\.ouvert\)\{display:none\}/.test(barre()),
      'la barre hors champ reste focusable').toBe(true);
  });

  /**
   * 🔴 AUCUNE TRANSITION sur le tiroir, et c'est délibéré.
   *
   * Mesuré dans le navigateur le 07/09/2026, deux fois : avec
   * `transform:translateX(-100%)` levé par une classe, Chrome laissait une
   * `CSSTransition` BLOQUÉE — `playState: "running"`, `currentTime: 0` pendant
   * quinze secondes — et le tiroir ne glissait jamais. La cascade était
   * pourtant juste : un clone privé de transition calculait `transform: none`.
   * Faire entrer `visibility` dans la transition, le remède connu, n'y a rien
   * changé.
   *
   * `npm test` était VERT dans les deux cas. Aucune garde de source ne voit une
   * transition bloquée.
   */
  it('🔴 le tiroir ne s’anime PAS — c’est ce qui a échoué deux fois', () => {
    const src = barre();
    const bloc = /\.v2-sidebar\.tiroir\{[\s\S]*?\}/.exec(src)?.[0] ?? '';
    expect(/transition/.test(bloc),
      'une transition revient sur le tiroir : elle est restée bloquée deux fois').toBe(false);
    expect(/transform/.test(bloc),
      'le tiroir se déplace de nouveau par `transform` : c’est ce qui bloquait').toBe(false);
  });
});

describe('Le tiroir se referme', () => {
  it('naviguer le referme', () => {
    // Sinon la barre reste par-dessus l'écran qu'on vient de demander.
    expect(/function go\(v: View\) \{ activeView\.set\(v\); tiroirOuvert\.set\(false\); \}/.test(barre()),
      'choisir une vue laisse le tiroir ouvert par-dessus elle').toBe(true);
  });

  it('Échap et le voile le referment', () => {
    const src = barre();
    expect(/e\.key === 'Escape' && \$tiroirOuvert/.test(src), 'Échap ne referme plus').toBe(true);
    expect(/class="voile-tiroir" onclick=\{fermerTiroir\}/.test(src), 'le voile ne referme plus').toBe(true);
  });

  it('🔴 le voile ne s’appelle PAS `voile` tout court', () => {
    // Mesuré dans le navigateur : 1652 éléments portent déjà `.voile`
    // (la surcouche des pochettes). La portée Svelte protège les styles, mais
    // la coquille a déjà dû désamorcer un nom générique (`.row` -> `.v2-row`).
    expect(/class="voile"/.test(barre()), 'le voile reprend un nom déjà porté par un autre composant').toBe(false);
  });
});

describe('L’ouverture du tiroir est ATTEIGNABLE', () => {
  /**
   * 🔴 Au palier tiroir, la barre est hors champ : son propre bouton de repli
   * ne peut pas l'ouvrir. Sans un bouton ailleurs, la navigation entière
   * disparaît sur un téléphone.
   */
  it('la coquille porte le bouton, pas la barre', () => {
    const src = coquille();
    expect(/\$formatEcran === 'tiroir'\}[\s\S]{0,400}tiroirOuvert\.update/.test(src),
      'la coquille n’ouvre plus le tiroir : la navigation serait inatteignable').toBe(true);
    expect(/aria-label=\{\$t\('v2\.nav\.menu' as any\)\}/.test(src),
      'le bouton n’a plus de nom accessible').toBe(true);
  });

  it('il reste au-dessus du voile pour pouvoir refermer', () => {
    expect(/@media \(max-width: 760px\)\{\s*\.av-tr\{z-index:121/.test(coquille()),
      'le voile passe par-dessus le bouton : on ne pourrait plus refermer').toBe(true);
    // 121 > 120 (la barre) > 119 (le voile).
    expect(/\.v2-sidebar\.tiroir\{[^}]*z-index:120/.test(barre())).toBe(true);
    expect(/\.voile-tiroir\{[^}]*z-index:119/.test(barre())).toBe(true);
  });

  it('la barre cache son propre bouton de repli au palier tiroir', () => {
    // La largeur commande : un bouton qui ne changerait rien est un bouton mort.
    expect(/\.v2-sidebar\.tiroir \.collapse\{display:none\}/.test(barre())).toBe(true);
  });
});
