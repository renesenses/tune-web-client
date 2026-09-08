/**
 * « Click sur l'artiste ne renvoie pas là où il faut. »
 *
 * Bertrand, 07/09/2026, sur la vue Lecture en cours :
 *
 *   « Si local : page artiste. Si radio : écran recherche/résultats avec les
 *     bons paramètres. Streaming : à voir. »
 *
 * Une seule destination ne POUVAIT pas convenir, et le contrat du serveur le
 * dit (`tune-core/src/playback/mod.rs`, struct `NowPlaying`) :
 *
 *     #[serde(default)] pub artist_id: Option<i64>,
 *     /// `Option` : une piste en streaming ou une radio n'a pas d'entrée en
 *     /// bibliothèque
 *
 * Mesuré sur le .18 le 07/09/2026, zone « Cet ordinateur » :
 *
 *     source='local'  track_id=29572  artist_id=994  artist_name='Pink Floyd'
 *
 * Une piste locale porte l'identifiant de son artiste ; une radio et une piste
 * de service n'en ont aucun, et ne peuvent pas en avoir.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { destinationArtiste } from '../routageArtiste';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const np = () => lire('src/components/NowPlaying.svelte');

describe('Où mène le nom d’artiste de la lecture en cours', () => {
  it('LOCAL → la fiche de l’artiste, par identifiant', () => {
    expect(destinationArtiste({ source: 'local', artist_id: 994, artist_name: 'Pink Floyd' }))
      .toEqual({ type: 'artiste', artistId: 994 });
  });

  it('RADIO → la recherche, SANS périmètre', () => {
    // L'artiste peut être n'importe où : dans la bibliothèque comme chez un
    // service. Restreindre masquerait un artiste qu'on possède.
    expect(destinationArtiste({ source: 'radio', artist_id: null, artist_name: 'Baba Blues' }))
      .toEqual({ type: 'recherche', requete: 'Baba Blues', source: null });
  });

  it('SERVICE → la recherche, ouverte SUR ce service', () => {
    // C'est là que l'utilisateur écoutait ; les autres sources restent à une
    // puce de distance.
    expect(destinationArtiste({ source: 'qobuz', artist_id: null, artist_name: 'Leprous' }))
      .toEqual({ type: 'recherche', requete: 'Leprous', source: 'qobuz' });
  });

  it('un service INCONNU suit la même règle — aucune liste en dur', () => {
    // Bandcamp est arrivé en août. Une liste de services écrite en dur ferait
    // retomber tout nouveau service sur le mauvais chemin, sans bruit.
    expect(destinationArtiste({ source: 'un-service-de-2027', artist_name: 'X' }))
      .toEqual({ type: 'recherche', requete: 'X', source: 'un-service-de-2027' });
  });

  it('LOCAL sans identifiant → on RÉSOUT le nom, on ne part pas en recherche', () => {
    // Un serveur antérieur à la 0.9.102 n'envoie pas `artist_id` : l'artiste
    // EST en bibliothèque, il ne manque que son numéro.
    expect(destinationArtiste({ source: 'local', artist_id: null, artist_name: 'M' }))
      .toEqual({ type: 'artiste-par-nom', nom: 'M' });
  });

  it('l’identifiant PRIME sur la source', () => {
    // « M » et « -M- » sont le même artiste et deux chaînes différentes : dès
    // qu'un numéro existe, il tranche.
    expect(destinationArtiste({ source: 'qobuz', artist_id: 125, artist_name: 'M' }))
      .toEqual({ type: 'artiste', artistId: 125 });
  });

  it('sans nom d’artiste, AUCUN geste', () => {
    for (const p of [
      { source: 'radio', artist_name: null },
      { source: 'radio', artist_name: '   ' },
      null,
    ]) {
      expect(destinationArtiste(p as any), `« ${JSON.stringify(p)} » a produit une destination`).toBeNull();
    }
  });
});

describe('La lecture en cours alimente les DEUX contrats', () => {
  /**
   * 🔴 Cet écran est monté par les DEUX coquilles. L'ancienne lit
   * `selectedArtist` + `libraryTab` ; la nouvelle ne lit ni l'un ni l'autre.
   * Poser les seuls magasins de l'ancienne, c'est exactement le défaut que
   * Fabien a signalé sur la v0.9.140 — le clic changeait d'écran sans rien
   * ouvrir.
   */
  it('la fiche artiste pose le magasin des DEUX clients', () => {
    const bloc = /async function ouvrirFicheArtiste\([\s\S]*?\n  \}/.exec(np());
    expect(bloc, 'ouvrirFicheArtiste a disparu').not.toBeNull();
    expect(bloc![0].includes("libraryTab.set('artists')"),
      'le contrat du client actuel n’est plus alimenté').toBe(true);
    expect(bloc![0].includes('pendingLibraryArtist.set(artistId)'),
      'le contrat du NOUVEAU client n’est plus alimenté : le clic changerait d’écran sans rien ouvrir').toBe(true);
    expect(bloc![0].includes("activeView.set('library')"),
      'on ne change plus de vue').toBe(true);
  });

  it('la recherche pose la requête ET le périmètre, pour les deux clients', () => {
    const bloc = /function ouvrirRecherche\([\s\S]*?\n  \}/.exec(np());
    expect(bloc, 'ouvrirRecherche a disparu').not.toBeNull();
    expect(bloc![0].includes('pendingSearchQuery.set(requete)'),
      '`pendingSearchQuery` n’est plus posé — le client actuel arriverait sur une recherche vide').toBe(true);
    expect(bloc![0].includes('setSearchCriteria({ q: requete, source: source ?? null })'),
      '`setSearchCriteria` n’est plus posé — le NOUVEAU client arriverait sur une recherche vide').toBe(true);
  });

  it('plus AUCUN chemin ne pose la seule requête de l’ancien client', () => {
    // `pendingSearchQuery` n'est lu QUE par `SearchView` (client actuel).
    // `SearchV2` lit `currentSearchCriteria`. Un chemin qui ne poserait que le
    // premier laisserait le nouveau client sur un écran vide — c'était le cas
    // du repli « artiste introuvable » et de celui de l'album.
    const poses = [...np().matchAll(/pendingSearchQuery\.set\(/g)].length;
    expect(poses, '`pendingSearchQuery` est posé hors de `ouvrirRecherche` : le nouveau client y arriverait vide')
      .toBe(1);
  });

  it('la DÉCISION vient du module, elle n’est pas recopiée dans l’écran', () => {
    const src = np();
    expect(src.includes('destinationArtiste({'),
      'l’écran ne consulte plus le module : la garde ci-dessus ne garderait plus rien').toBe(true);
    // Aucun test de source recopié dans le composant : c'est le module qui sait.
    expect(/=== 'radio'[\s\S]{0,120}activeView\.set\('search'\)/.test(src),
      'le routage est de nouveau écrit en dur dans l’écran').toBe(false);
  });
});
