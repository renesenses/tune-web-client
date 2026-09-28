/**
 * LES DEUX DÉFAUTS DES COLLECTIONS INTELLIGENTES — Yves Corbat, en direct le
 * 28/09/2026, sur sa bibliothèque `/Volumes/Music/CDThèque Yves`.
 *
 * 1. « pas de rafraîchissement de la collection après avoir enregistré » ;
 * 2. « les noms de volumes contenant des espaces sont mal gérés » — le
 *    sélecteur de dossier montrait `arillion`, `ush`, `ream Theater` au lieu
 *    de Marillion, Rush, Dream Theater.
 *
 * 🔴 **Le second n'est PAS une affaire d'espaces, et ce banc le démontre.**
 * C'est la normalisation Unicode. macOS rend ses chemins en NFD (décomposé) :
 * `CDThèque` y occupe NEUF caractères au lieu de huit, le `è` étant écrit
 * `e` + accent combinant. Le serveur bâtit son motif SQL en NFC
 * (`folder_like_pattern`, `track_repo.rs`) mais compte la longueur du préfixe
 * sur la chaîne BRUTE (`folder_facet.rs`) : il trouve donc les bonnes lignes
 * et en découpe **un caractère de trop par lettre accentuée**.
 *
 * Reproduit en direct sur le .18 le 28/09 : le même dossier
 * `/data/recordings/Tidal/José González` demandé en NFC rend
 * « Local Valley (Deluxe) », demandé en NFD rend « cal Valley (Deluxe) » —
 * DEUX caractères perdus pour DEUX lettres accentuées. Chez Yves, une seule
 * (`è`), donc une seule lettre perdue.
 *
 * La correction de fond appartient au serveur. Ce banc garde la part CLIENT :
 * ne pas envoyer de NFD, et recharger ce qu'on vient de redéfinir.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('🔴 1 — enregistrer des règles recharge le CONTENU, pas seulement la liste', () => {
  const src = sansCommentaires(lire('src/components/v2/CollectionsV2.svelte'));

  it('l’éditeur de RÈGLES ne rebranche plus `charger` tout nu', () => {
    // `charger()` reconstruit la liste (nom, compte, pochettes) et ne touche
    // pas à `albums`, la grille de la collection ouverte.
    //
    // ⚠️ La garde est SCOPÉE à l'éditeur de règles. La modale de renommage,
    // elle, garde légitimement `onSaved={charger}` : changer un nom ou une
    // description ne change pas le contenu, et recharger la grille pour ça
    // serait une requête gratuite. Une garde qui interdirait `charger` partout
    // réclamerait donc un défaut.
    const i = src.indexOf('CollectionSmartEditeurV2');
    expect(i, 'l’éditeur de règles a disparu').toBeGreaterThan(-1);
    const bloc = src.slice(i, src.indexOf('{/await}', i));
    expect(bloc, 'onSaved rappelle charger seul : la grille restera périmée')
      .not.toMatch(/onSaved=\{charger\}/);
    expect(bloc).toContain('rafraichirApresRegles');
  });

  it('il recharge les albums de la collection OUVERTE', () => {
    const i = src.indexOf('async function rafraichirApresRegles');
    expect(i).toBeGreaterThan(-1);
    const bloc = src.slice(i, src.indexOf('async function charger()', i));
    expect(bloc).toContain('await charger()');
    expect(bloc, 'la grille n’est pas rechargée').toContain('chargerAlbums(fraiche)');
  });

  it('🔴 il retrouve l’entrée par la PAIRE (sorte, id), jamais par l’id seul', () => {
    // Les deux espaces d'identifiants se recouvrent : l'id 1 désigne aussi une
    // collection manuelle. Et après rechargement, l'objet équivalent est un
    // AUTRE objet — le comparer par identité ne retrouverait jamais rien.
    const i = src.indexOf('async function rafraichirApresRegles');
    const bloc = src.slice(i, src.indexOf('async function charger()', i));
    expect(bloc).toMatch(/sorte === 'smart' && x\.id === id/);
    expect(bloc, 'une création (id nul) ne doit rien recharger').toContain('if (id == null) return;');
  });
});

describe('🔴 2 — le chemin envoyé au serveur est NORMALISÉ en NFC', () => {
  const picker = sansCommentaires(lire('src/components/partages/SmartFolderPicker.svelte'));

  /**
   * 🔴 COMPTER LES OCCURRENCES NE GARDE RIEN.
   *
   * Ce témoin exigeait d'abord « au moins trois appels à `normaliserChemin` ».
   * La contre-épreuve l'a pris en défaut : en retirer UN en laissait trois, et
   * le témoin restait vert sur le défaut qu'il prétendait garder. Un seuil ne
   * dit pas QUELS chemins sont couverts.
   *
   * Chacun des quatre est donc nommé. Ce sont les quatre façons dont un chemin
   * quitte ce composant, et il suffit qu'une seule laisse passer du NFD pour
   * que le défaut d'Yves revienne.
   */
  it.each([
    ['la saisie libre au clavier', /oninput=\{\(e\) => onChange\(normaliserChemin\(/],
    ['le dossier atteint par navigation', /onChange\(normaliserChemin\(f\.path\)\)/],
    ['la requête envoyée au serveur', /getFolderFacet\(p \? normaliserChemin\(p\) : p\)/],
    ['la réouverture sur le dossier déjà choisi', /charger\(value \? normaliserChemin\(value\) : null\)/],
  ])('%s est normalisé', (_quoi, motif) => {
    expect(picker, 'ce chemin-là laisse passer du NFD').toMatch(motif as RegExp);
  });

  it('la normalisation est celle du serveur : NFC, et elle vit en UN endroit', () => {
    // Elle est dans `lib/cheminNfc`, pas recopiée dans le composant : c'est ce
    // qui permettra de la brancher ailleurs (règles enregistrées, Oxygen)
    // sans en écrire une seconde définition.
    const module = lire('src/lib/cheminNfc.ts');
    expect(module).toMatch(/normalize\(\s*'NFC'\s*\)/);
    expect(picker, 'le composant réécrit la normalisation au lieu de l’appeler')
      .not.toMatch(/normalize\(\s*'NF/);
  });
});

describe('la fonction de normalisation elle-même', () => {
  it('ramène une forme décomposée à la forme composée', async () => {
    const { normaliserChemin } = await import('../cheminNfc');
    const nfd = '/Volumes/Music/CDThèque Yves';   // « CDThèque » décomposé
    const nfc = '/Volumes/Music/CDThèque Yves';    // « CDThèque » composé
    expect(nfd.length, 'le NFD doit bien être plus long').toBe(nfc.length + 1);
    expect(normaliserChemin(nfd)).toBe(nfc);
    expect(normaliserChemin(nfc), 'une forme déjà composée ne doit pas changer').toBe(nfc);
  });

  it('laisse tranquille ce qui n’a pas d’accent, et supporte le vide', async () => {
    const { normaliserChemin } = await import('../cheminNfc');
    expect(normaliserChemin('/data/music/Rush')).toBe('/data/music/Rush');
    expect(normaliserChemin('')).toBe('');
    expect(normaliserChemin(null as any)).toBe('');
  });
});
