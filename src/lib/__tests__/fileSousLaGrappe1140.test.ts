/**
 * #1140 — Bilou, forum fil 1770, 12/09/2026, `os_type = windows` :
 * « Quand on supprime la file d'attente, l'avatar gêne le clic sur la
 * corbeille ».
 *
 * ## L'ÉCRAN EXACT — le ticket le laissait ouvert, les marqueurs le tranchent
 *
 * Ce n'est **pas** l'écran « File d'attente » (`QueueV2`, `activeView` =
 * `queue`). C'est « **Lecture en cours** » avec le **PANNEAU latéral** de la
 * file ouvert — `.queue-sheet.wide-layout` de `partages/NowPlaying.svelte`.
 * Trois marqueurs de la capture le disent, et ils concordent :
 *
 *  1. le **pictogramme d'écran** de la grappe est le bouton Mode TV, rendu
 *     sous `{#if $activeView === 'nowplaying'}` dans `ShellV2`. Il n'existe
 *     sur aucun autre écran : la capture est donc sur « Lecture en cours » ;
 *  2. l'en-tête « **File d'attente** » suivi de « **1 pistes** », puis une
 *     **disquette** et une **corbeille sans fond**, c'est `.qs-header` du
 *     panneau — `{$queueTracks.length} {$t('common.tracks')}` y est rendu
 *     (le ticket croyait ce compteur propre au seul `QueueView` v1 : il est
 *     AUSSI dans le panneau partagé, ce qui lève sa contradiction) ;
 *  3. l'ordre relevé sur la capture — écran, loupe, *(disquette, corbeille)*,
 *     avatar — est exactement celui de `.av-tr` (TV, loupe, signet, avatar)
 *     avec l'en-tête du panneau glissé DESSOUS.
 *
 * La grappe et le panneau ne sont pas dans le même conteneur : `.av-tr` est en
 * `position:absolute` sur la coquille, le panneau en `position:absolute` sur
 * `.now-playing`. Aucun `z-index` ne peut les réconcilier — seule la MISE EN
 * PAGE le peut, et c'est ce que garde ce fichier.
 *
 * ## Ce que ce fichier PROUVE, et ce qu'il NE PROUVE PAS
 *
 * Il ne prouve **pas** le rendu : le CSS scopé de Svelte n'est pas injecté
 * sous vitest + jsdom, et jsdom ne fait aucune mise en page — un test qui
 * lirait des positions calculées serait vert quoi qu'il arrive.
 *
 * Il fait donc deux choses, toutes deux vérifiables :
 *
 *  - il lit les **règles réellement déclarées** dans les feuilles livrées
 *    (`ShellV2.svelte`, `NowPlaying.svelte`, `styles/tune-v2.css`) ;
 *  - il **rejoue l'arithmétique de placement** de CSS 2.1 §10.6.4 sur ces
 *    valeurs, et vérifie deux choses que la capture montre : la bande du
 *    panneau ne coupe plus celle de la grappe, et le panneau ne déborde plus
 *    sous son conteneur.
 *
 * Il ne dit rien du clic lui-même : personne n'a mesuré si l'avatar CAPTAIT
 * l'événement ou si la corbeille restait atteignable de justesse (point 3 du
 * ticket, resté sans réponse). Ce qu'il garde, c'est que les deux grappes
 * n'occupent plus la même bande — ce qui rend la question sans objet.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { extraireFeuilleDeStyle, releverDeclarations, valeurEffective } from '../cascadeCss';
import { RESERVE_HAUTE_MINIMALE } from '../gouttiereGrappe';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

const SHELL = lire('src/components/v2/ShellV2.svelte');
const NOW_PLAYING = lire('src/components/partages/NowPlaying.svelte');
const JETONS = lire('src/styles/tune-v2.css');

const FEUILLE_SHELL = extraireFeuilleDeStyle(SHELL);
const FEUILLE_NP = extraireFeuilleDeStyle(NOW_PLAYING);

/** Une longueur en pixels déclarée dans un corps de règle. */
function pixels(corps: string, propriete: string): number | null {
  const trouve = new RegExp(`(?:^|[;{\\s])${propriete}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)px`).exec(corps);
  return trouve ? Number(trouve[1]) : null;
}

/** Corps de la règle dont le sélecteur est exactement `selecteur`. */
function regle(feuille: string, selecteur: string): string {
  const echappe = selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const trouve = new RegExp(`(?:^|\\})\\s*${echappe}\\s*\\{([^}]*)\\}`, 'm').exec(
    feuille.replace(/\/\*[\s\S]*?\*\//g, ' '),
  );
  expect(trouve, `règle « ${selecteur} » introuvable`).not.toBeNull();
  return trouve![1];
}

// ───────────────────────────────────────────────────────────────────────────
// La grappe : la bande qu'elle occupe, lue dans la feuille de la coquille.
// ───────────────────────────────────────────────────────────────────────────

const HAUT_GRAPPE = pixels(regle(FEUILLE_SHELL, '.av-tr'), 'top');
const HAUTEUR_BOUTON = pixels(regle(FEUILLE_SHELL, '.av-tr :global(.search-icon-btn)'), 'height');

describe('#1140 — la bande de la grappe, relevée et non devinée', () => {
  it('la feuille de la coquille la déclare', () => {
    expect(HAUT_GRAPPE, '`.av-tr { top }` introuvable').not.toBeNull();
    expect(HAUTEUR_BOUTON, 'hauteur des boutons de la grappe introuvable').not.toBeNull();
  });
});

/** Bas de la grappe, en pixels depuis le haut de la coquille. */
const BAS_GRAPPE = (HAUT_GRAPPE ?? 20) + (HAUTEUR_BOUTON ?? 32);

// ───────────────────────────────────────────────────────────────────────────
// 1. Le REPLI de la réserve verticale.
//
// #1045 a branché la MESURE (`--v2-grappe-h`, posée par la coquille sur
// `.v2-shell`). Mais le repli de la feuille est resté `0px`, écrit au point
// d'usage : `top: var(--v2-grappe-h, 0px)`. Zéro, c'est EXACTEMENT la valeur
// d'avant #1045 — donc le défaut de la capture — et c'est ce qui s'applique
// tant que l'observateur n'a pas mesuré : au premier rendu, et partout où
// `ResizeObserver` n'existe pas.
//
// Le repli doit donc vivre là où vit déjà celui de la gouttière horizontale,
// `.v2-shell{--v2-grappe-w:172px}` dans `styles/tune-v2.css` : sur la coquille
// SEULE. Hors coquille — l'ancienne interface — le jeton reste indéfini, le
// repli du point d'usage vaut 0, et rien n'y change : elle masque sa propre
// grappe haut-droite sur « Lecture en cours » (`App.svelte`, `$activeView !==
// 'nowplaying'`), donc elle n'a rien à réserver.
// ───────────────────────────────────────────────────────────────────────────

describe('#1140 — le repli de la réserve verticale vit dans la feuille des jetons', () => {
  const declarations = [
    ...JETONS.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(
      /([^{}\s][^{}]*)\{[^}]*--v2-grappe-h\s*:\s*(-?\d+(?:\.\d+)?)px/g,
    ),
  ];

  it('🔴 elle est déclarée, une fois et une seule', () => {
    expect(declarations.map((d) => d[1].trim()), 'le repli doit être déclaré une fois').toHaveLength(1);
  });

  it('🔴 sur `.v2-shell` — la coquille SEULE, jamais une racine d’écran', () => {
    // Le piège déjà payé pour `--v2-grappe-w` le 09/09/2026 : posé sur
    // `.tune-v2`, que chaque écran porte aussi, il était redéclaré sous la
    // valeur mesurée et l'annulait.
    expect(declarations[0]?.[1].trim()).toBe('.v2-shell');
  });

  it('🔴 elle vaut le plancher du module, pour que les deux ne divergent pas', () => {
    expect(Number(declarations[0]?.[2])).toBe(RESERVE_HAUTE_MINIMALE);
  });

  it('🔴 et elle passe sous la grappe, pas dedans', () => {
    expect(Number(declarations[0]?.[2])).toBeGreaterThanOrEqual(BAS_GRAPPE);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Le placement du panneau, rejoué.
// ───────────────────────────────────────────────────────────────────────────

const REGLES_NP = releverDeclarations(FEUILLE_NP, ['top', 'bottom', 'height']);

/** Les sélecteurs de la feuille qui visent le panneau, dans l'état donné. */
function selecteurs(etat: 'peek' | 'expanded'): string[] {
  return ['.queue-sheet', `.queue-sheet.${etat}`, '.queue-sheet.wide-layout', `.queue-sheet.wide-layout.${etat}`];
}

/** Une longueur CSS résolue en pixels : `Npx`, `N%` du conteneur, ou le jeton. */
function longueur(valeur: string | null, conteneur: number, reserveHaute: number): number | 'auto' | null {
  if (valeur === null) return null;
  const brut = valeur.trim();
  if (brut === 'auto') return 'auto';
  // `bottom: 0` — un zéro CSS se passe d'unité.
  if (/^-?0(?:\.0+)?$/.test(brut)) return 0;
  if (/^var\(\s*--v2-grappe-h/.test(brut)) return reserveHaute;
  const px = /^(-?\d+(?:\.\d+)?)px$/.exec(brut);
  if (px) return Number(px[1]);
  const pourcent = /^(-?\d+(?:\.\d+)?)%$/.exec(brut);
  if (pourcent) return (Number(pourcent[1]) * conteneur) / 100;
  return null;
}

/**
 * Bord BAS du panneau, en pixels depuis le haut de son conteneur — CSS 2.1
 * §10.6.4.
 *
 * 🔴 La règle qui compte ici : quand `top`, `height` ET `bottom` sont tous les
 * trois déclarés, la boîte est SUR-CONTRAINTE et c'est `bottom` qui est
 * ignoré. Un `height: 100%` sous un `top` non nul ne « remplit » donc pas le
 * conteneur : il le dépasse d'autant — et `.now-playing{overflow:hidden}`
 * coupe le dépassement.
 */
function bordBasDuPanneau(etat: 'peek' | 'expanded', conteneur: number, reserveHaute: number) {
  const contexte = { ecran: { largeur: 1440, hauteur: conteneur }, survol: false };
  const lu = (p: string) => valeurEffective(REGLES_NP, selecteurs(etat), p, contexte);
  const haut = longueur(lu('top'), conteneur, reserveHaute);
  const bas = longueur(lu('bottom'), conteneur, reserveHaute);
  const hauteur = longueur(lu('height'), conteneur, reserveHaute);

  expect(haut, `\`top\` du panneau (${etat}) non résolu`).not.toBeNull();
  expect(bas, `\`bottom\` du panneau (${etat}) non résolu`).not.toBeNull();

  const h = typeof haut === 'number' ? haut : 0;
  // Sur-contrainte : `bottom` est ignoré, la hauteur déclarée l'emporte.
  if (typeof hauteur === 'number') return { haut: h, basDuBord: h + hauteur, surContraint: true };
  // `height: auto` : la paire `top` / `bottom` dimensionne la boîte.
  return { haut: h, basDuBord: conteneur - (typeof bas === 'number' ? bas : 0), surContraint: false };
}

const CONTENEURS = [700, 900, 1080, 1440];

describe('La forme fautive, reproduite — elle DOIT recouvrir', () => {
  // Sans cette moitié, le test suivant pourrait être vert par accident : il
  // faut montrer que l'arithmétique SAIT voir le défaut de la capture.
  it('🔴 avec le repli à 0, l’en-tête du panneau coupe la bande de la grappe', () => {
    // C'est l'état d'avant #1045, et celui d'avant la première mesure.
    const { haut } = bordBasDuPanneau('peek', 1080, 0);
    expect(haut).toBeLessThan(BAS_GRAPPE);
  });

  it('🔴 un `height: 100%` sous un `top` non nul dépasse le conteneur', () => {
    // La contre-épreuve de la sur-contrainte, rejouée à la main sur les mêmes
    // longueurs : c'est bien la règle CSS qui est en cause, pas notre lecture.
    const conteneur = 1080;
    const surContraint = { haut: RESERVE_HAUTE_MINIMALE, hauteur: conteneur };
    expect(surContraint.haut + surContraint.hauteur).toBeGreaterThan(conteneur);
  });
});

describe('#1140 — la forme livrée : le panneau passe sous la grappe, et pas sous son conteneur', () => {
  for (const etat of ['peek', 'expanded'] as const) {
    it(`🔴 état « ${etat} » : l’en-tête commence après le bas de la grappe`, () => {
      const { haut } = bordBasDuPanneau(etat, 1080, RESERVE_HAUTE_MINIMALE);
      expect(haut, 'le panneau repart sous la grappe').toBeGreaterThanOrEqual(BAS_GRAPPE);
    });

    for (const conteneur of CONTENEURS) {
      it(`🔴 état « ${etat} », conteneur ${conteneur} px : aucun débordement`, () => {
        const { basDuBord, surContraint } = bordBasDuPanneau(etat, conteneur, RESERVE_HAUTE_MINIMALE);
        expect(
          surContraint,
          '`top` + `bottom` + `height` déclarés : `bottom` est ignoré, le panneau déborde',
        ).toBe(false);
        expect(
          basDuBord,
          `le bas du panneau (${basDuBord} px) sort du conteneur (${conteneur} px) : ` +
            '`.now-playing{overflow:hidden}` coupe la fin de la liste',
        ).toBeLessThanOrEqual(conteneur);
      });
    }
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 3. La portée du changement — la grappe commune est partagée par tout le
//    client. Ce correctif n'y touche PAS : il n'ajoute qu'un repli au jeton
//    vertical, et ce jeton n'est lu que par le panneau de la file.
// ───────────────────────────────────────────────────────────────────────────

describe('#1140 — la portée du correctif est bornée', () => {
  it('🔴 `--v2-grappe-h` n’est lue que par le panneau de la file', () => {
    const lecteurs = [
      ['ShellV2.svelte', FEUILLE_SHELL],
      ['NowPlaying.svelte', FEUILLE_NP],
      ['tune-v2.css', JETONS],
    ].flatMap(([nom, feuille]) =>
      [...feuille.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/var\(\s*--v2-grappe-h/g)].map(() => nom),
    );
    expect(lecteurs, 'un second lecteur changerait la portée du correctif').toEqual(['NowPlaying.svelte']);
  });

  it('🔴 la grappe elle-même n’est pas déplacée', () => {
    // Le correctif ne doit rien changer à `.av-tr`, commune à tous les écrans.
    const av = regle(FEUILLE_SHELL, '.av-tr');
    expect(av).toContain('position:absolute');
    expect(pixels(av, 'top')).toBe(20);
    expect(pixels(av, 'right')).toBe(30);
  });
});
