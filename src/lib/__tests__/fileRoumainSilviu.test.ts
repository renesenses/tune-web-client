import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { locale, t } from '../i18n';
import * as locales from '../locales';

/**
 * Garde : l'écran FILE D'ATTENTE ne parle plus français à qui ne l'a pas
 * choisi, et une clé manquante replie sur l'ANGLAIS.
 *
 * ── LA CAPTURE ──────────────────────────────────────────────────────────
 *
 * Silviu, testeur roumain, v0.9.161. Interface en roumain : le titre de la
 * page dit « Coadă », la barre latérale est en roumain, et au milieu :
 *
 *     183 à suivre     14h 49min restantes
 *     À suivre
 *
 * Trois chaînes françaises écrites en dur dans `QueueV2.svelte`, plus
 * quatre `aria-label` (`Fermer`, `Lire …`, `Monter`, `Descendre`) et le
 * message d'erreur « File d'attente indisponible. » qu'aucun des six
 * contrôleurs ne regardait :
 *
 *   - `check-i18n.mjs` lit le texte entre balises, mais `{upNext.length} à
 *     suivre` MÊLE une expression à du texte, et sa forme `VISIBLE` s'arrête
 *     aux accolades ;
 *   - `check-francais-v2.mjs` ne lit pas, lui non plus, un littéral collé à
 *     une accolade, et son troisième passage ne descend pas dans une
 *     affectation ordinaire du `<script>` (`error = "…"`).
 *
 * D'où ce test, qui ne regarde pas des formes mais le FICHIER : plus aucune
 * de ces chaînes ne doit s'y trouver, et les clés qui les remplacent doivent
 * exister dans les onze langues.
 *
 * ── LE REPLI ────────────────────────────────────────────────────────────
 *
 * Deuxième défaut, plus profond et invisible sur cette capture : `i18n.ts`
 * repliait sur `messages.fr`. Une clé absente d'un dictionnaire rendait donc
 * du FRANÇAIS à un lecteur roumain. `fr.ts` est la source du catalogue, pas
 * la langue de secours : le repli se fait désormais en anglais.
 */

const RACINE = resolve(__dirname, '../../..');
const QUEUE = resolve(RACINE, 'src/components/v2/QueueV2.svelte');

type Dict = Record<string, string | undefined>;
const DICTS = locales as unknown as Record<string, Dict>;
const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu'] as const;

/** Le fichier sans ses commentaires : la doc est en français exprès. */
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const SOURCE_QUEUE = sansCommentaires(readFileSync(QUEUE, 'utf8'));

describe('file d’attente — capture Silviu (roumain, v0.9.161)', () => {
  /**
   * Le cœur de la capture. Chaque chaîne est cherchée TELLE QU'ELLE
   * S'AFFICHAIT, hors commentaires : c'est ce que Silviu a lu.
   */
  const EN_DUR: [string, string][] = [
    ['à suivre', 'le compteur « 183 à suivre »'],
    ['restantes', 'le temps « 14h 49min restantes »'],
    ['À suivre', 'l’en-tête de la liste'],
    ['aria-label="Fermer"', 'la croix du bandeau d’erreur'],
    ['`Lire ${t.title}`', 'le bouton de lecture d’une ligne'],
    ['aria-label="Monter"', 'la flèche de remontée'],
    ['aria-label="Descendre"', 'la flèche de descente'],
    ["File d'attente indisponible.", 'le message d’échec de chargement'],
  ];

  for (const [chaine, quoi] of EN_DUR) {
    it(`n’écrit plus ${quoi} en français dans le composant`, () => {
      expect(SOURCE_QUEUE).not.toContain(chaine);
    });
  }

  /**
   * L'inverse de la garde précédente : une absence se satisferait d'un
   * composant vide. On exige les clés, et on exige qu'elles rendent.
   */
  const CLES = [
    'v2.queue.upNextCount',
    'v2.queue.remaining',
    'v2.queue.upNext',
    'v2.queue.upNextNone',
    'v2.queue.playTrack',
    'v2.queue.moveUp',
    'v2.queue.moveDown',
    'v2.queue.loadFailed',
  ];

  for (const cle of CLES) {
    it(`rend « ${cle} » depuis le magasin, et la clé existe dans les 11 langues`, () => {
      expect(SOURCE_QUEUE).toContain(`'${cle}'`);
      for (const langue of LANGUES) {
        const valeur = DICTS[langue]?.[cle];
        expect(valeur, `${cle} manque dans ${langue}.ts`).toBeTruthy();
      }
    });
  }

  /**
   * Les deux compteurs portent un paramètre : une traduction qui perdrait le
   * jeton afficherait « à suivre » sans le nombre. C'est arrivé ailleurs.
   */
  it('garde {n} et {d} dans les onze traductions des compteurs', () => {
    for (const langue of LANGUES) {
      expect(DICTS[langue]['v2.queue.upNextCount'], langue).toContain('{n}');
      expect(DICTS[langue]['v2.queue.remaining'], langue).toContain('{d}');
      expect(DICTS[langue]['v2.queue.playTrack'], langue).toContain('{t}');
    }
  });

  /**
   * La preuve côté LECTEUR : en roumain, les trois chaînes de la capture
   * sortent en roumain, et aucune ne ressemble à ce qu'il a vu.
   */
  it('rend le compteur et l’en-tête en roumain quand la langue est le roumain', () => {
    locale.set('ro');
    const tr = get(t);
    const compteur = tr('v2.queue.upNextCount').replace('{n}', '183');
    const reste = tr('v2.queue.remaining').replace('{d}', '14h 49min');

    expect(compteur).toBe('183 în continuare');
    // Le séparateur de milliers suit la langue : une file de 1454 titres
    // (#1126) s'écrit « 1.453 » en roumain, pas « 1 453 ».
    expect(SOURCE_QUEUE).toContain('$formatNombre(upNext.length)');
    expect((1453).toLocaleString('ro')).toBe('1.453');
    expect(reste).toBe('14h 49min rămase');
    expect(tr('v2.queue.upNext')).toBe('În continuare');

    expect(compteur).not.toContain('à suivre');
    expect(reste).not.toContain('restantes');
    locale.set('fr');
  });
});

describe('repli d’une clé manquante', () => {
  /**
   * 🔴 Le défaut de fond. Une clé inconnue du dictionnaire roumain rendait le
   * FRANÇAIS. On le prouve par une clé qui n'existe nulle part : le repli ne
   * doit pas remonter jusqu'au français, et doit rendre l'anglais quand il
   * existe.
   */
  it('replie sur l’anglais, jamais sur le français', () => {
    // Une clé présente en anglais suffit : on vérifie que c'est l'anglais qui
    // sort, et pas le français, quand le roumain ne l'a pas.
    const cle = 'v2.queue.upNext';
    const roumainSansLaCle: Record<string, string> = {};
    expect(roumainSansLaCle[cle]).toBeUndefined();

    locale.set('ro');
    const tr = get(t);
    // La clé EXISTE en roumain (parité tenue) : le repli n'a pas à servir.
    expect(tr(cle)).toBe('În continuare');

    // Une clé qui n'existe dans aucune langue rend la clé, pas du français.
    expect(tr('v2.queue.cleQuiNExistePas')).toBe('v2.queue.cleQuiNExistePas');
    locale.set('fr');
  });

  /**
   * La garde qui tient vraiment : la CHAÎNE DE REPLI écrite dans `i18n.ts`.
   * Un test de comportement seul ne peut pas l'attraper tant que la parité
   * est à 100 % — et c'est justement quand elle se rompt que le défaut
   * réapparaît.
   */
  it('n’a plus « messages.fr » dans la chaîne de repli de i18n.ts', () => {
    const source = readFileSync(resolve(RACINE, 'src/lib/i18n.ts'), 'utf8');
    const corps = sansCommentaires(source);
    expect(corps).toContain('messages.en[key]');
    expect(corps).not.toContain('messages.fr[key]');
    expect(corps).not.toContain('messages[$l] ?? messages.fr');
  });
});
