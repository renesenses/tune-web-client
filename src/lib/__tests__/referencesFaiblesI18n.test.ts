import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// Les scripts sont des `.mjs` sans déclaration de types ; `clesOrphelinesDerivation`
// les importe de la même façon, sans directive — en ajouter une est signalée comme
// inutile par `check-svelte`.
import {
  referencesFaibles,
  plagesDeCommentaire,
  estAssertionDAbsence,
} from '../../../scripts/lib/referencesFaibles.mjs';
import { prefixesDynamiques } from '../../../scripts/lib/prefixesDynamiques.mjs';

/**
 * CE QUI GARDE LES TROIS NOUVEAUX PLAFONDS D'ÊTRE DÉCORATIFS.
 *
 * `check-i18n` refuse une clé déclarée que personne n'appelle, plafond à zéro.
 * Mais il décide « appelée » par `clesLitterales()`, et trois façons d'écrire
 * une clé la rendaient vivante SANS que rien s'affiche : un commentaire, une
 * assertion d'absence, une fonction de production sans appelant. Chacune est
 * désormais comptée et bornée.
 *
 * 🔴 UNE DÉTECTION VIDE PASSERAIT POUR UNE GARDE. Chaque mécanisme est donc
 * prouvé DANS LES DEUX SENS, sur des fixtures qu'on sert à la détection pour de
 * vrai : la forme fautive est SIGNALÉE, et la forme légitime ne l'est PAS. Sans
 * le second sens, une détection qui ne trouve jamais rien — parce qu'on a cassé
 * sa lecture — annoncerait « 0 clé » et personne ne verrait la différence.
 *
 * C'est la leçon de la semaine dans ce dépôt, et elle a déjà servi ici : la
 * première version de (c) comptait la DÉCLARATION d'une fonction comme un appel
 * et annonçait « 0 fonction sans appelant » sur 2 438. Un vert parfait, qui ne
 * gardait rien.
 */

const RACINE = resolve(__dirname, '../../..');

/** Une racine de fixture neuve : les lectures sont mémorisées par chemin. */
function racineNeuve(nom: string): string {
  const dir = mkdtempSync(join(tmpdir(), `refFaibles-${nom}-`));
  mkdirSync(join(dir, 'lib'), { recursive: true });
  return dir;
}

function ecrire(racine: string, chemin: string, contenu: string): void {
  writeFileSync(join(racine, chemin), contenu, 'utf8');
}

type Verdict = Map<string, { mecanisme: string; site: string }>;

const lire = (racine: string): Verdict => referencesFaibles(racine).faibles;

// ---------------------------------------------------------------------------
// (a) LE COMMENTAIRE
// ---------------------------------------------------------------------------

describe('(a) une clé que seul un commentaire nomme', () => {
  it('🔴 est SIGNALÉE, même entre guillemets, même en production', () => {
    const r = racineNeuve('commentaire');
    ecrire(
      r,
      'lib/ecran.ts',
      [
        'export function rendu(tr: (k: string) => string): string {',
        "  // L'ancienne infobulle passait par 'fixture.commentSeul' : plus personne",
        "  // ne l'appelle depuis la phase 5.",
        "  return tr('fixture.vraimentAppelee');",
        '}',
        'rendu((k) => k);',
      ].join('\n'),
    );
    const v = lire(r);
    expect(v.get('fixture.commentSeul')?.mecanisme).toBe('commentaire');
  });

  it('ne signale PAS une clé réellement appelée sur la même ligne', () => {
    // Le second sens. Si celui-ci tombe, la détection accuse du code vivant et
    // la garde sera débranchée la semaine suivante.
    const r = racineNeuve('commentaire-propre');
    ecrire(
      r,
      'lib/ecran.ts',
      [
        'export function rendu(tr: (k: string) => string): string {',
        "  return tr('fixture.vraimentAppelee'); // commentaire qui suit l'appel",
        '}',
        'rendu((k) => k);',
      ].join('\n'),
    );
    expect(lire(r).has('fixture.vraimentAppelee')).toBe(false);
  });

  it("n'appelle commentaire que ce que le balayage juge tel", () => {
    // Une URL dans une chaîne n'ouvre PAS de commentaire : sans ce soin, la
    // moitié d'`api.ts` passerait pour commentée et (a) accuserait à tort.
    expect(plagesDeCommentaire("const u = 'http://x/y'; // vrai")).toEqual([[24, 31]]);
    // Un bloc non refermé court jusqu'à la fin, comme le compilateur le voit.
    expect(plagesDeCommentaire('a /* b')).toEqual([[2, 6]]);
  });

  it('🔴 dit sa LIMITE : un littéral d’expression régulière aveugle sa ligne', () => {
    // `/["']/` ouvre une chaîne aux yeux du balayeur, qui ne trouve pas sa
    // fermeture et consomme le reste de la ligne : le `//` qui suit n'est pas vu.
    // On ne prétend pas le contraire — on borne le dégât. L'état des chaînes est
    // remis à zéro à chaque fin de ligne, donc la ligne SUIVANTE est lue
    // normalement. Sans cette remise à zéro, une seule ligne tordue fabriquerait
    // de faux commentaires — donc de faux signalements — jusqu'au bas du fichier.
    const tordu = ['const r = /["\']/; // cette fin de ligne est manquée', '// celle-ci, non'];
    const plages = plagesDeCommentaire(tordu.join('\n'));
    expect(plages).toHaveLength(1);
    expect(plages[0][0]).toBe(tordu[0].length + 1);
  });
});

// ---------------------------------------------------------------------------
// (b) L'ASSERTION D'ABSENCE
// ---------------------------------------------------------------------------

describe("(b) une clé dont la seule mention est une assertion d'absence", () => {
  it('🔴 est SIGNALÉE — nier une clé est le contraire de la référencer', () => {
    const r = racineNeuve('absence');
    ecrire(
      r,
      'lib/ecran.test.ts',
      [
        "it('ne rend plus le vieux libellé', () => {",
        "  expect(html).not.toContain('fixture.niee');",
        "  expect(bouton(el, fr['fixture.introuvable'])).toBeUndefined();",
        '});',
      ].join('\n'),
    );
    const v = lire(r);
    expect(v.get('fixture.niee')?.mecanisme).toBe('assertionAbsence');
    expect(v.get('fixture.introuvable')?.mecanisme).toBe('assertionAbsence');
  });

  it('ne signale PAS une assertion normale', () => {
    const r = racineNeuve('absence-propre');
    ecrire(
      r,
      'lib/ecran.test.ts',
      [
        "it('rend bien le libellé', () => {",
        "  expect(html).toContain('fixture.affirmee');",
        "  expect(fr['fixture.definie']).toBeDefined();",
        '});',
      ].join('\n'),
    );
    const v = lire(r);
    expect(v.has('fixture.affirmee')).toBe(false);
    expect(v.has('fixture.definie')).toBe(false);
  });

  it('distingue la négation du matcher, pas seulement le mot « not »', () => {
    const negation = "expect(html).not.toContain('a.b');";
    expect(estAssertionDAbsence(negation, negation.indexOf("'a.b'"))).toBe(true);
    const normale = "expect(html).toContain('a.b');";
    expect(estAssertionDAbsence(normale, normale.indexOf("'a.b'"))).toBe(false);
    const vide = "expect(bouton(fr['a.b'])).toBeUndefined();";
    expect(estAssertionDAbsence(vide, vide.indexOf("'a.b'"))).toBe(true);
    const definie = "expect(bouton(fr['a.b'])).toBeDefined();";
    expect(estAssertionDAbsence(definie, definie.indexOf("'a.b'"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (c) LA FONCTION DE PRODUCTION SANS APPELANT
// ---------------------------------------------------------------------------

/** Le même module, à l'appelant près. C'est tout l'objet de la preuve. */
const MODULE_MORT = [
  "import type { Etat } from './types';",
  '',
  'export function cleDuBadge(etat: Etat): string {',
  "  return etat.verrouille ? 'fixture.verrouOn' : 'fixture.verrouOff';",
  '}',
].join('\n');

describe('(c) une clé rangée dans une fonction exportée sans appelant', () => {
  it('🔴 est SIGNALÉE quand seul son témoin cite la fonction', () => {
    const r = racineNeuve('morte');
    ecrire(r, 'lib/badge.ts', MODULE_MORT);
    mkdirSync(join(r, 'lib', '__tests__'), { recursive: true });
    ecrire(
      r,
      'lib/__tests__/badge.test.ts',
      [
        "import { cleDuBadge } from '../badge';",
        "it('dit on', () => expect(cleDuBadge({ verrouille: true })).toBe('fixture.verrouOn'));",
      ].join('\n'),
    );
    const v = lire(r);
    expect(v.get('fixture.verrouOn')?.mecanisme).toBe('fonctionMorte');
    expect(v.get('fixture.verrouOff')?.mecanisme).toBe('fonctionMorte');
  });

  it("🔴 ne l'est PLUS dès qu'un écran appelle la fonction", () => {
    // Le second sens, et le seul qui prouve que la détection mesure bien
    // l'ATTEIGNABILITÉ et non la simple présence d'un littéral dans un `lib/`.
    const r = racineNeuve('vivante');
    ecrire(r, 'lib/badge.ts', MODULE_MORT);
    ecrire(
      r,
      'Ecran.svelte',
      [
        '<script lang="ts">',
        "  import { cleDuBadge } from './lib/badge';",
        "  import { t } from './lib/i18n';",
        '  let etat = { verrouille: true };',
        '</script>',
        '',
        '<span>{$t(cleDuBadge(etat))}</span>',
      ].join('\n'),
    );
    const v = lire(r);
    expect(v.has('fixture.verrouOn')).toBe(false);
    expect(v.has('fixture.verrouOff')).toBe(false);
  });

  it("un import seul ne suffit pas : importer n'est pas appeler", () => {
    const r = racineNeuve('import-seul');
    ecrire(r, 'lib/badge.ts', MODULE_MORT);
    ecrire(
      r,
      'Ecran.svelte',
      ['<script lang="ts">', "  import { cleDuBadge } from './lib/badge';", '</script>'].join('\n'),
    );
    expect(lire(r).get('fixture.verrouOn')?.mecanisme).toBe('fonctionMorte');
  });

  it('suit une chaîne d’appels : lib → lib → écran', () => {
    // Sans point fixe, `cleDuBadge` paraîtrait morte parce qu'aucun `.svelte`
    // ne cite son nom — et ses deux clés seraient accusées à tort.
    const r = racineNeuve('chaine');
    ecrire(r, 'lib/badge.ts', MODULE_MORT);
    ecrire(
      r,
      'lib/relais.ts',
      [
        "import { cleDuBadge } from './badge';",
        "import type { Etat } from './types';",
        '',
        'export function libelleBadge(etat: Etat, tr: (k: string) => string): string {',
        '  return tr(cleDuBadge(etat));',
        '}',
      ].join('\n'),
    );
    ecrire(
      r,
      'Ecran.svelte',
      [
        '<script lang="ts">',
        "  import { libelleBadge } from './lib/relais';",
        '  let etat = { verrouille: true };',
        '</script>',
        '',
        '<span>{libelleBadge(etat, $t)}</span>',
      ].join('\n'),
    );
    const v = lire(r);
    expect(v.has('fixture.verrouOn')).toBe(false);
    expect(v.has('fixture.verrouOff')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// L'ARBRE RÉEL : les comptes de la livraison, et les plafonds qui les tiennent
// ---------------------------------------------------------------------------

/**
 * Les comptes mesurés sur `main` le 27/09/2026, à la livraison de cette garde.
 *
 * 🔴 Ils ne sont pas là pour être « mis à jour quand ça rougit ». Un plafond ne
 * peut que BAISSER : c'est ce que la dernière assertion de ce fichier interdit
 * de contourner. Si un compte monte, c'est `check-i18n` qui rougit, et la seule
 * issue est de brancher la clé ou de la retirer des onze dictionnaires.
 */
const MESURES_DU_27_09 = {
  fonctionMorte: 20,
  commentaire: 5,
  assertionAbsence: 3,
} as const;

describe('sur l’arbre réel du client', () => {
  const src = readFileSync(resolve(RACINE, 'src/lib/locales/fr.ts'), 'utf8');
  const fr = new Set([...src.matchAll(/^\s*['"]([^'"]+)['"]\s*:/gm)].map((m) => m[1]));
  const { prefixes, enumerees } = prefixesDynamiques(resolve(RACINE, 'src'), fr) as {
    prefixes: Map<string, string[]>;
    enumerees: Map<string, string>;
  };
  const couverte = (cle: string) =>
    enumerees.has(cle) ||
    [...prefixes.keys()].some((p) => cle.startsWith(p) && cle.length > p.length);

  const faibles = lire(resolve(RACINE, 'src'));
  const comptes: Record<string, string[]> = { fonctionMorte: [], commentaire: [], assertionAbsence: [] };
  for (const [cle, { mecanisme }] of faibles) {
    if (!fr.has(cle) || couverte(cle)) continue;
    comptes[mecanisme].push(cle);
  }

  it('🔴 les trois mécanismes ne se recouvrent jamais', () => {
    // Sinon les trois plafonds compteraient deux fois la même dette, et en
    // baisser un ferait monter un autre sans que rien ne soit réparé.
    const total = Object.values(comptes).reduce((n, l) => n + l.length, 0);
    expect(new Set(Object.values(comptes).flat()).size).toBe(total);
  });

  it('nomme les clés que Bertrand avait relevées à la main', () => {
    // Trois clés pour (a), trois pour (b) : la carte du 27/09 était juste, et
    // (c) voit bien le cas qu'aucune mesure ne voyait.
    expect(comptes.commentaire).toContain(cle('queue', 'unknownTrack'));
    expect(comptes.commentaire).toContain(cle('home', 'openAlbum'));
    expect(comptes.commentaire).toContain(cle('tip', 'rescanArtwork'));
    expect(comptes.assertionAbsence).toContain(cle('settings', 'crossfadeHint'));
    expect(comptes.assertionAbsence).toContain(cle('playlistManager', 'sameServiceOnly'));
    expect(comptes.assertionAbsence).toContain(cle('settings', 'migrateToSqliteBtn'));
    expect(comptes.fonctionMorte).toContain(cle('devices', 'volumeLockOn'));
    expect(comptes.fonctionMorte).toContain(cle('devices', 'volumeLockInherited'));
  });

  it('chaque compte reste sous son plafond', () => {
    for (const [mecanisme, plafond] of Object.entries(plafondsDuControleur())) {
      expect(comptes[mecanisme].length, `${mecanisme} : ${comptes[mecanisme].join(', ')}`).toBeLessThanOrEqual(plafond);
    }
  });

  it('🔴 aucun plafond ne dépasse la mesure du 27/09 : ils ne peuvent que baisser', () => {
    // La seule façon de faire passer la porte en trichant serait de relever un
    // plafond. Cette assertion le refuse, définitivement.
    for (const [mecanisme, plafond] of Object.entries(plafondsDuControleur())) {
      expect(plafond, `plafond ${mecanisme} relevé`).toBeLessThanOrEqual(
        MESURES_DU_27_09[mecanisme as keyof typeof MESURES_DU_27_09],
      );
    }
  });
});

/**
 * 🔴 UN TÉMOIN QUI NOMME UNE CLÉ LA REND VIVANTE — ET VIDE CE QU'IL MESURE.
 *
 * Écrit d'abord en nommant ses six clés entre guillemets, ce fichier est devenu
 * lui-même un site littéral pour chacune. `clesLitterales` les a comptées comme
 * des références SOLIDES, les trois catégories sont tombées de 20/5/3 à 20/2/0,
 * et les assertions échouaient en accusant la détection. La garde s'était
 * mangée elle-même. Aucune clé réelle n'est donc écrite ici, pas même dans un
 * commentaire — un commentaire est justement le mécanisme (a).
 *
 * On assemble la clé à l'exécution : `LITTERAL_CLE` exige la clé ENTIÈRE entre
 * une seule paire de guillemets, et deux morceaux joints n'en sont pas une.
 *
 * 🔴 Et PAS avec un gabarit. Une première version écrivait
 * `` (f, n) => `${f}.${n}` ``, ce que `prefixesDynamiques` lit comme une
 * fonction qui COMPOSE une clé : ses appels ont ajouté six préfixes dynamiques
 * (30 → 36), exemptant au passage les familles `queue.`, `home.`, `settings.`
 * et `devices.` du plafond à zéro du quatrième contrôle. Un témoin avait élargi
 * une exemption de porte. `join` ne compose rien aux yeux de la dérivation.
 */
const cle = (famille: string, nom: string) => [famille, nom].join('.');

/** Les plafonds tels que `check-i18n.mjs` les porte, lus dans le fichier. */
function plafondsDuControleur(): Record<string, number> {
  const source = readFileSync(resolve(RACINE, 'scripts/check-i18n.mjs'), 'utf8');
  const bloc = source.match(/const PLAFONDS = \{([^}]*)\}/);
  expect(bloc, 'le bloc PLAFONDS a disparu de check-i18n.mjs').toBeTruthy();
  const trouves: Record<string, number> = {};
  for (const m of (bloc as RegExpMatchArray)[1].matchAll(/(\w+)\s*:\s*(\d+)/g)) {
    trouves[m[1]] = Number(m[2]);
  }
  expect(Object.keys(trouves).sort()).toEqual(
    ['assertionAbsence', 'commentaire', 'fonctionMorte'],
  );
  return trouves;
}
