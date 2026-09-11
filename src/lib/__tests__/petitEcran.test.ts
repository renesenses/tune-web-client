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
import { describe, it, expect, vi } from 'vitest';
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
    // ⚠️ Le corps de `go` n'est plus figé mot pour mot : #3843 y a ajouté
    // `requestListReset()` en tête (la barre v2 ne l'émettait pas, et la fiche
    // album survivait au clic sur « Bibliothèque »). La garde tient toujours ce
    // qu'elle veut dire — naviguer POSE la vue et REFERME le tiroir, dans cet
    // ordre — sans interdire qu'on fasse autre chose dans la même fonction.
    expect(/function go\(v: View\) \{[^}]*activeView\.set\(v\);[^}]*tiroirOuvert\.set\(false\);[^}]*\}/.test(barre()),
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

/**
 * PETITE HAUTEUR — l'autre moitié du « petit écran ».
 *
 * Capture d'un testeur (bluevelvet, Windows, v0.9.140, fenêtre 1356 x 622) :
 * le menu du compte est coupé par le bas de l'écran, « Réglages » et
 * « Se déconnecter » sont inatteignables.
 *
 * Mesuré dans un cadre de 1356 x 622 le 07/09/2026 :
 *
 *     hauteur du panneau : 592 px
 *     haut               :  72 px   ->  bas à 664, soit 42 px hors écran
 *     max-height : none      overflow-y : visible
 *
 * Ce n'est pas un cas limite : le panneau GRANDIT avec le produit — les thèmes
 * y sont arrivés le 05/09 — quand une fenêtre de portable, elle, ne grandit
 * pas.
 */
describe('Le menu du compte tient dans la fenêtre', () => {
  const menu = () => lire('src/components/v2/AvatarMenu.svelte');

  it('🔴 il est PLAFONNÉ et il défile', () => {
    const src = menu();
    const bloc = /\.avmenu\{[\s\S]*?\n    overscroll-behavior:contain\}/.exec(src)?.[0] ?? '';
    expect(bloc, '`.avmenu` n’a plus de bloc reconnaissable').not.toBe('');
    expect(/max-height:calc\(100dvh - 132px\)/.test(bloc),
      'le panneau n’a plus de plafond : il repassera sous le bord de l’écran').toBe(true);
    expect(/overflow-y:auto/.test(bloc),
      'plafonné sans défilement, le bas du panneau serait simplement COUPÉ').toBe(true);
  });

  it('le repli `vh` précède `dvh`, jamais l’inverse', () => {
    // Un navigateur qui ignore `dvh` garde la dernière déclaration qu'il
    // comprend : mettre `vh` en second annulerait `dvh` partout ailleurs.
    const src = menu();
    const iVh = src.indexOf('max-height:calc(100vh - 132px)');
    const iDvh = src.indexOf('max-height:calc(100dvh - 132px)');
    expect(iVh).toBeGreaterThan(-1);
    expect(iDvh).toBeGreaterThan(iVh);
  });

  it('la marge tient compte de la BANNIÈRE de mise à jour', () => {
    // La grappe descend de `--maj-h` (42 px) quand la bannière est là, et le
    // panneau descend avec elle : 92 px de marge suffiraient sans bannière et
    // laisseraient déborder avec.
    const majH = /--maj-h:\s*(\d+)px/.exec(lire('src/components/v2/ShellV2.svelte'))?.[1];
    expect(majH, 'la hauteur de bannière n’est plus déclarée').toBe('42');
    const marge = Number(/max-height:calc\(100dvh - (\d+)px\)/.exec(menu())?.[1]);
    // haut sans bannière 72, avec bannière 114 ; il faut de la marge sous le
    // panneau dans les deux cas.
    expect(marge).toBeGreaterThanOrEqual(114 + 12);
  });

  it('la molette ne fait pas défiler l’écran derrière le panneau', () => {
    expect(/overscroll-behavior:contain/.test(menu())).toBe(true);
  });
});

describe('🔴 Un environnement SANS `matchMedia`', () => {
  it('ne fait pas tomber le montage du composant', async () => {
    // Tester `typeof window === "undefined"` ne suffit pas : un environnement
    // qui monte un composant, ou une vieille webview, offre un `window` SANS
    // `matchMedia`. L'appel jetait — et c'est le MONTAGE ENTIER qui tombait,
    // pas seulement la mesure de largeur.
    //
    // Constaté le 08/09/2026 en fusionnant `main` : le test de la recherche
    // globale (#3629) monte `ShellV2` et échouait sur « window.matchMedia is
    // not a function », alors qu'il ne parle pas de largeur d'écran. Un défaut
    // de robustesse se paie toujours dans le test de quelqu'un d'autre.
    const vrai = (globalThis as any).window;
    const ecoutes: string[] = [];
    (globalThis as any).window = {
      innerWidth: 1400,
      addEventListener: (t: string) => ecoutes.push(t),
      removeEventListener: () => {},
    };
    try {
      vi.resetModules();
      const { formatEcran } = await import('../largeurEcran');
      let vu: string | undefined;
      const stop = formatEcran.subscribe((f) => { vu = f; });
      expect(vu, "l'abonnement n'a rien produit").toBe('large');
      // Le repli doit écouter QUELQUE CHOSE, sinon la largeur ne suivrait plus.
      expect(ecoutes).toContain('resize');
      stop();
    } finally {
      (globalThis as any).window = vrai;
      vi.resetModules();
    }
  });
});
