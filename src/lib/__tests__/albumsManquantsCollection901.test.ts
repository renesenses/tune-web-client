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
 * ## Ce qu'elle ne tient PAS
 *
 * Le TITRE des albums manquants. Ils ne sont plus en base : leur nom n'est
 * lisible nulle part, ni côté client ni côté serveur. Le dire demanderait de
 * conserver le titre au moment du rangement — un travail serveur, hors de
 * portée d'ici.
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

describe('#901 — les albums manquants d’un dossier sont dits', () => {
  it('le compte vient de `orphan_album_ids`, servi par le serveur', () => {
    expect(
      ecran(),
      'le seul endroit où le nombre d’albums disparus existe est la réponse du ' +
        'serveur : `album_ids` est déjà réduit aux vivants.'
    ).toContain('orphan_album_ids');
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

  it('elle accorde le singulier et le pluriel, et porte une explication', () => {
    const src = ecran();
    expect(src).toContain('collections.missingOne');
    expect(src).toContain('collections.missingMany');
    expect(src).toContain('collections.missingHint');
  });

  it('les trois textes existent dans les onze dictionnaires', () => {
    for (const langue of LANGUES) {
      const dictionnaire = lire(`src/lib/locales/${langue}.ts`);
      for (const cle of ['collections.missingOne', 'collections.missingMany', 'collections.missingHint']) {
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
});
