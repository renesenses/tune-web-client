/**
 * #901 — « Liste des albums manquants dans les dossiers "Collections" ».
 *
 * Lulu range 58 albums dans un dossier, en retrouve moins, et rien ne le dit.
 * Ce n'est pas un défaut d'affichage : c'est un écart INVISIBLE PAR
 * CONSTRUCTION. La carte compte `album_ids.length`, or le serveur ne sert
 * déjà QUE les albums vivants (`dossier_servi`, `library/collections.rs`) —
 * la carte et la grille s'accordent donc toujours, quel que soit le nombre
 * d'albums disparus.
 *
 * Ce que le serveur dit à voix haute et que personne n'écoutait :
 * `orphan_album_ids`, qui — malgré son nom — porte un NOMBRE, celui des
 * identifiants rangés dont l'album n'est plus en base.
 *
 * ## Ce que cette garde tient
 *
 * 1. Le compte vient du serveur, pas d'une soustraction faite ici : le client
 *    n'a aucun moyen de la faire, il ne reçoit jamais la liste stockée.
 * 2. La mention ne s'affiche QUE s'il y a quelque chose à dire — sinon chaque
 *    dossier sain porterait un « 0 manquant », c'est-à-dire du bruit.
 * 3. Les trois textes existent dans les ONZE dictionnaires du client.
 *
 * ## Ce que la seconde moitié ajoute (23/09, décision de Bertrand)
 *
 * Lulu redemande la LISTE (fil 1891) et donne le geste : « un clic sur le
 * nombre des manquants ». Le serveur publie désormais `orphan_album_ids` en
 * LISTE, le compte sous `orphan_album_count`, et `orphan_albums` nommé —
 * parce qu'il conserve le titre AU RANGEMENT. L'écran n'a donc plus le droit
 * de s'arrêter au nombre.
 *
 * 4. Le compte se lit dans `orphan_album_count`, et l'ANCIENNE forme (un
 *    nombre dans `orphan_album_ids`) reste comprise : un client à jour devant
 *    un serveur plus vieux garde sa mention.
 * 5. La mention est CLIQUABLE et ouvre la liste — c'est le geste demandé.
 * 6. La liste nomme les albums quand le nom a pu être conservé, et n'invente
 *    rien quand il ne l'a pas été.
 *
 * ## Ce qu'elle ne tient PAS
 *
 * Que le titre SOIT là. Un album disparu avant que le serveur n'apprenne à
 * garder son nom n'a plus de nom nulle part : la liste le désigne alors par
 * son seul identifiant, et c'est tout ce qui existe.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const ecran = () => sansCommentaires(lire('src/components/v2/CollectionsV2.svelte'));
const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu'];

/**
 * Le fichier PRIVÉ DE SES COMMENTAIRES — une garde qui parle du code doit lire
 * le code, jamais la phrase qui l'explique (piège déjà payé par #2430 et #983).
 */
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
}

describe('#901 — les albums manquants d’un dossier sont dits, puis NOMMÉS', () => {
  it('le compte vient du serveur, jamais d’un calcul local', () => {
    expect(
      ecran(),
      'le seul endroit où le nombre d’albums disparus existe est la réponse du ' +
        'serveur : `album_ids` est déjà réduit aux vivants.'
    ).toContain('orphan_album_count');
  });

  it('l’ANCIENNE forme reste comprise — un serveur d’avant #901 dit le nombre dans `orphan_album_ids`', () => {
    const src = ecran();
    expect(src).toContain('orphan_album_ids');
    expect(
      /typeof\s+c\??\.orphan_album_ids\s*===\s*'number'/.test(src),
      'sans ce repli, un client à jour devant un serveur plus ancien perdrait la mention'
    ).toBe(true);
  });

  it('il n’est PAS recalculé ici par une soustraction', () => {
    const src = ecran();
    expect(/album_ids\.length\s*-\s*/.test(src)).toBe(false);
    expect(/-\s*c\.album_count/.test(src)).toBe(false);
  });

  it('la mention ne paraît que s’il y a des manquants', () => {
    const src = ecran();
    expect(src).toMatch(/\{#if e\.manquants\}/);
  });

  it('🔴 elle est CLIQUABLE et ouvre la liste — le geste demandé par Lulu', () => {
    const src = ecran();
    const mention = src.slice(src.indexOf('{#if e.manquants}'));
    expect(
      /<button[^>]*class="mq"/.test(mention),
      'un `title=` ne suffit pas : il n’existe pas au tactile, et Lulu a demandé un clic'
    ).toBe(true);
    expect(/manquantsOuverts\s*=\s*e/.test(mention)).toBe(true);
  });

  it('🔴 la liste nomme les albums, et n’invente rien quand le nom n’a pas été conservé', () => {
    const src = ecran();
    expect(src).toContain('orphan_albums');
    expect(src).toContain('manquantsDetail');
    expect(src).toContain('collections.missingUnknown');
    expect(src).toContain('collections.missingNoList');
    expect(src).toContain('collections.missingListTitle');
  });

  it('elle accorde le singulier et le pluriel, et porte une explication', () => {
    const src = ecran();
    expect(src).toContain('collections.missingOne');
    expect(src).toContain('collections.missingMany');
    expect(src).toContain('collections.missingHint');
  });

  it('les trois textes existent dans les onze dictionnaires', () => {
    for (const langue of LANGUES) {
      const dictionnaire = lire(`src/lib/locales/${langue}.ts`);
      for (const cle of [
        'collections.missingOne',
        'collections.missingMany',
        'collections.missingHint',
        'collections.missingListTitle',
        'collections.missingUnknown',
        'collections.missingNoList',
      ]) {
        expect(dictionnaire.includes(`"${cle}"`), `${cle} manque dans ${langue}.ts`).toBe(true);
      }
    }
  });

  it('le pluriel porte bien le nombre, le singulier non', () => {
    const fr = lire('src/lib/locales/fr.ts');
    const ligne = (cle: string) => fr.split('\n').find((l) => l.includes(`"${cle}"`)) ?? '';
    expect(ligne('collections.missingMany')).toContain('{count}');
    expect(ligne('collections.missingOne')).not.toContain('{count}');
  });

  it('l’album sans nom est désigné par son identifiant, dans les onze langues', () => {
    for (const langue of LANGUES) {
      const dictionnaire = lire(`src/lib/locales/${langue}.ts`);
      const ligne = dictionnaire.split('\n').find((l) => l.includes('"collections.missingUnknown"')) ?? '';
      expect(ligne, `collections.missingUnknown doit porter {id} dans ${langue}.ts`).toContain('{id}');
    }
  });
});
