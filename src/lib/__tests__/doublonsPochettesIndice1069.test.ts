/**
 * #1069 — l'onglet Doublons ne montrait ni les pochettes côte à côte ni
 * l'indice qui a rapproché les fiches.
 *
 * La détection est complète côté serveur depuis tune-server-rust#3396 :
 * `dossier_et_titre` (v0.9.143) et `pochette_identique` (v0.9.146, PR #3876).
 * `MetadataV2` consommait déjà la route ; le champ `indice` arrivait dans la
 * réponse et personne ne le lisait — le type l'absorbait par son
 * `[k: string]: unknown`.
 *
 * Mesuré sur le .18 le 18/09/2026, `GET /library/albums/eclates` :
 *
 * ```
 * albums_concernes 53 · count 26
 * clés du groupe : albums, dossier, indice, meme_annee,
 *                  numeros_complementaires, pistes, titre_normalise
 * indice = 'dossier_et_titre'
 * clés album : artist, id, title, track_count, track_numbers, year
 * ```
 *
 * 🔴 Les albums d'un groupe ne portent PAS de `cover_path` : la vignette se
 * résout par l'identifiant.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const vue = readFileSync('src/components/v2/MetadataV2.svelte', 'utf8');

/**
 * 🔴 Le bloc `.eclv` SEUL, coupé à son `{/each}`.
 *
 * Une fenêtre de 700 caractères débordait sur la liste des boutons juste en
 * dessous — laquelle contient bien `filter((a) => a.id !== cible?.id)`. La
 * garde « la cible est montrée » jugeait donc un bout de code qui n'est pas
 * celui qu'elle vise. Une garde mal bornée est verte ou rouge pour la
 * mauvaise raison.
 */
const blocPochettes = (() => {
  const i = vue.indexOf('class="eclv"');
  expect(i).toBeGreaterThan(0);
  const fin = vue.indexOf('{/each}', i);
  return vue.slice(i, fin);
})();
const api = readFileSync('src/lib/api.ts', 'utf8');

describe('#1069 — l\'indice est lu et nommé', () => {
  it('le type le déclare, au lieu de le laisser au fourre-tout', () => {
    const i = api.indexOf('export interface GroupeAlbumsEclates');
    expect(i).toBeGreaterThan(0);
    const ligne = api.slice(i, api.indexOf('\n', i));
    expect(ligne).toContain('indice?: IndiceEclate');
    // 🔴 Laissé ouvert : un serveur plus récent peut en nommer un troisième.
    expect(api).toContain("'pochette_identique' | (string & {})");
  });

  it('les deux codes du serveur sont traduits', () => {
    expect(vue).toContain("case 'dossier_et_titre':");
    expect(vue).toContain("case 'pochette_identique':");
    expect(vue).toContain('v2.meta.indiceDossierTitre');
    expect(vue).toContain('v2.meta.indicePochette');
  });

  it('🔴 un code INCONNU est rendu tel quel, pas tu', () => {
    const i = vue.indexOf('function libelleIndice(');
    const bloc = vue.slice(i, vue.indexOf('\n  }', i));
    expect(bloc).toContain('default: return code;');
    // Absent = rien à afficher, et pas la chaîne « undefined ».
    expect(bloc).toContain('if (!code) return null;');
  });

  it('l\'écran ne dessine la ligne que s\'il y a un indice', () => {
    expect(vue).toContain('{#if libelleIndice(g.indice)}');
  });
});

describe('#1069 — les pochettes côte à côte', () => {
  it('chaque fiche du groupe a la sienne', () => {
    expect(blocPochettes).toContain('{#each g.albums ?? [] as a (a.id)}');
    expect(blocPochettes).toContain('<AlbumArt');
  });

  it('🔴 la vignette se résout par l\'IDENTIFIANT, pas par un chemin', () => {
    // Mesuré sur le .18 : les albums d'un groupe ne portent pas de
    // `cover_path`. Lui en passer un ferait une vignette vide.
    expect(blocPochettes).toContain('coverPath={null}');
    expect(blocPochettes).toContain('albumId={a.id}');
  });

  it('🔴 la fiche qu\'on GARDE se distingue des autres', () => {
    expect(blocPochettes).toContain("class:garde={a.id === cible?.id}");
    // Et la classe existe vraiment dans le style.
    expect(vue).toContain('.eclc.garde{');
  });

  it('le groupe entier est montré, cible comprise', () => {
    // La liste des BOUTONS écarte la cible (on ne l'absorbe pas elle-même) ;
    // la rangée de pochettes, elle, doit la montrer — c'est la comparaison
    // qui tranche.
    expect(blocPochettes).not.toContain('filter((a) => a.id !== cible?.id)');
    // Contre-épreuve : ce filtre existe bien, mais PLUS BAS, sur les boutons.
    expect(vue).toContain('filter((a) => a.id !== cible?.id)');
  });
});

describe('#1069 — les deux clés dans les ONZE langues', () => {
  for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu']) {
    it(l, () => {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      expect(src).toContain('v2.meta.indiceDossierTitre');
      expect(src).toContain('v2.meta.indicePochette');
    });
  }
});
