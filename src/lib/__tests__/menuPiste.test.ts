/**
 * Le menu « … » d'une ligne de piste — parité avec le client actuel.
 *
 * Bertrand, 07/09/2026, capture de la fiche album du client ACTUEL à l'appui :
 * « continue sur le bouton … je veux à minima le contenu de la v0 ».
 *
 * Le client actuel porte ce menu depuis longtemps — `TrackContextMenu.svelte`,
 * SEPT gestes. Le nouveau n'en avait aucun : sa barre portait six icônes, et
 * trois des sept gestes n'avaient AUCUNE porte nulle part —
 *
 *     Plus comme ça      /library/tracks/{id}/similar   (voisins acoustiques)
 *     Autres versions    /library/tracks/{id}/versions  (pressages et reprises)
 *     Aller à l'artiste  la fiche artiste de la Bibliothèque
 *
 * Mesuré sur le .18 le 07/09/2026, piste 2450 (« La fleur », M, artist_id 125) :
 * les deux routes répondent, `similar` rend 5 voisins et `versions` un autre
 * pressage. Ce n'est donc pas le serveur qui manquait.
 *
 * Ce fichier tient la PARITÉ : tout ce que le menu du client actuel propose se
 * retrouve dans celui du nouveau. « À minima » est une borne basse, et une
 * garde qui ne la contrôle pas la laisse redescendre au premier remaniement.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { entreesMenuPiste, type CapacitesPiste, type GestesPiste } from '../menuPiste';

/** Une piste de la BIBLIOTHÈQUE : tout s'applique. */
const TOUT: CapacitesPiste = { jouable: true, idBibliotheque: 2450, artistId: 125, albumId: 259 };
/** Une piste de SERVICE : ni identifiant de bibliothèque, ni album local. */
const SERVICE: CapacitesPiste = { jouable: true, idBibliotheque: null, artistId: null, albumId: null };

function gestesTemoins() {
  const appels: string[] = [];
  const g = {} as GestesPiste;
  for (const nom of ['lire', 'ensuite', 'aLaFile', 'plusCommeCa', 'autresVersions',
                     'ajouterAPlaylist', 'allerArtiste', 'allerAlbum', 'etiqueter'] as const) {
    (g as any)[nom] = () => appels.push(nom);
  }
  return { g, appels };
}

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const actions = () => lire('src/components/v2/PisteActions.svelte');
const menu = () => lire('src/components/v2/MenuPisteV2.svelte');
/**
 * Les sept gestes que le menu du client ACTUEL offrait — la borne basse.
 *
 * 🔴 Ils étaient LUS dans `TrackContextMenu.svelte`, tant que ce fichier
 * portait sa liste en dur. `renesenses/tune-server-rust#1848` la lui a retirée :
 * les deux menus rendent désormais `entreesMenuPiste`, et relire la source du
 * client actuel ne renverrait plus rien — la garde serait devenue tautologique.
 *
 * Le plancher est donc GELÉ ici. C'est légitime : c'est un fait historique, il
 * ne bouge plus. Ce qu'il empêche reste entier — qu'un remaniement redescende
 * sous ce que l'utilisateur avait déjà.
 */
const PLANCHER_V0 = [
  'common.play',
  'queue.addToQueue',
  'library.playSimilar',
  'library.otherVersions',
  'nowplaying.addToPlaylist',
  'library.goToArtist',
  'library.goToAlbum',
];
function clesDuClientActuel(): string[] {
  return PLANCHER_V0;
}

describe('« je veux à minima le contenu de la v0 »', () => {
  it('le plancher du client actuel porte bien ses sept gestes, sans doublon', () => {
    expect(clesDuClientActuel()).toHaveLength(7);
    expect(new Set(clesDuClientActuel()).size, 'un geste compté deux fois').toBe(7);
  });

  /**
   * 🔴 On APPELLE la fonction, on ne lit pas le fichier.
   *
   * La première version de cette garde cherchait `cle: '…'` dans le texte de
   * `PisteActions`. Contre-épreuve du 07/09/2026 : préfixer l'entrée d'un
   * `if (false)` la laissait VERTE — le texte était toujours là. Une garde qui
   * lit du texte ne garde pas un comportement.
   */
  it('🔴 chaque geste du client actuel a sa contrepartie, à l’exécution', () => {
    const { g } = gestesTemoins();
    const rendues = entreesMenuPiste(TOUT, g).map((e) => e.cle);
    const manquants = clesDuClientActuel().filter((k) => !rendues.includes(k));
    expect(manquants, `gestes du client actuel absents du menu du nouveau : ${manquants.join(', ')}`)
      .toEqual([]);
  });

  it('chaque entrée déclenche SON geste, et lui seul', () => {
    const { g, appels } = gestesTemoins();
    const entrees = entreesMenuPiste(TOUT, g);
    for (const e of entrees) e.faire();
    // Neuf gestes, neuf entrées, dans l'ordre : aucune entrée ne partage son
    // action avec une autre — c'est ainsi qu'une piste favorite était partie
    // en `streaming_album_id` en août.
    expect(appels).toEqual([
      'lire', 'ensuite', 'aLaFile', 'plusCommeCa', 'autresVersions',
      'ajouterAPlaylist', 'allerArtiste', 'allerAlbum', 'etiqueter',
    ]);
  });

  it('une piste de SERVICE n’offre que ce qu’elle peut faire', () => {
    const { g } = gestesTemoins();
    const rendues = entreesMenuPiste(SERVICE, g).map((e) => e.cle);
    // Les trois routes de bibliothèque prennent un `i64` : les proposer sur une
    // piste distante donnerait trois gestes morts.
    for (const morte of ['library.playSimilar', 'library.otherVersions', 'v2.cover.tags']) {
      expect(rendues, `« ${morte} » proposée sur une piste sans identifiant de bibliothèque`)
        .not.toContain(morte);
    }
    expect(rendues).toContain('common.play');
    /**
     * 🔴 RETOURNÉ le 07/09/2026 par #1848.
     *
     * « Ajouter à une liste de lecture » était proposée sur une piste de service,
     * et le serveur ne peut pas la tenir. `tune-server/src/routes/playlists.rs`,
     * tête de `renesenses/tune-server-rust` au 07/09/2026 :
     *
     *     struct AddTracks { track_ids: Vec<i64>, position: Option<i64> }
     *
     * et `add_tracks` ne lit que `body.track_ids`. Le client envoyait pourtant
     * `streaming_tracks` : serde l'écartait en silence, la route répondait
     * **201 Created**, et le modal annonçait « ajoutée » sur une liste restée
     * vide. Ce n'est pas réparable en stockant la piste —
     * `playlist_tracks.track_id` est `NOT NULL REFERENCES tracks(id)`.
     *
     * #1848 tranche : ABSENTE, pas grisée.
     */
    expect(rendues, 'une piste de service ne peut pas entrer dans une liste locale')
      .not.toContain('nowplaying.addToPlaylist');
  });

  it('une piste qu’on ne sait pas jouer ne rend AUCUNE entrée', () => {
    const { g } = gestesTemoins();
    expect(entreesMenuPiste(
      { jouable: false, idBibliotheque: null, artistId: null, albumId: null }, g,
    )).toEqual([]);
  });

  it('les trois gestes qui n’existaient NULLE PART sont branchés', () => {
    const src = actions();
    // « Plus comme ça » : la route, et le message quand la réponse est vide —
    // sans empreinte audio calculée elle l'est, et ne rien faire en silence
    // se lit comme une panne.
    expect(/api\.getSimilarTracks\(piste\.id, 50\)/.test(src),
      '« Plus comme ça » n’appelle plus la route des voisins acoustiques').toBe(true);
    expect(src.includes("$t('library.noSimilar' as any)"),
      'une réponse vide ne dit plus rien à l’utilisateur').toBe(true);
    // « Autres versions » : le panneau.
    expect(src.includes("import('./VersionsPistePanneau.svelte')"),
      '« Autres versions » n’ouvre plus de panneau').toBe(true);
    // « Aller à l'artiste » : le dépôt ET la vue.
    expect(/pendingLibraryArtist\.set\(piste\.artist_id\)/.test(src),
      '« Aller à l’artiste » ne pose plus la cible').toBe(true);
    expect(/allerArtiste[\s\S]{0,220}activeView\.set\('library'\)/.test(src),
      '« Aller à l’artiste » ne change plus de vue').toBe(true);
  });

  /**
   * 🔴 « ÉCRIT MAIS PAS BRANCHÉ » — le défaut le plus fréquent de ce client.
   *
   * Poser `pendingLibraryArtist` ne suffit pas : sans consommateur, le clic
   * change d'écran sans rien ouvrir. C'est mot pour mot le treizième cas,
   * signalé par Fabien sur les liens de la lecture en cours.
   */
  it('le dépôt de l’artiste est CONSOMMÉ, et la fiche s’ouvre', () => {
    const bib = lire('src/components/v2/LibraryV2.svelte');
    expect(/get\(pendingLibraryArtist\)/.test(bib),
      'la Bibliothèque ne lit plus le dépôt : le clic changerait d’écran sans rien ouvrir').toBe(true);
    expect(/pendingLibraryArtist\.set\(null\)/.test(bib),
      'le dépôt n’est plus vidé : la fiche se rouvrirait à chaque retour').toBe(true);
    expect(/tab = 'artists'/.test(bib),
      'l’onglet des artistes n’est plus ouvert : la vue ne serait même pas montée').toBe(true);
    // Basculer d'onglet est la MOITIÉ du geste ; encore faut-il ouvrir la fiche.
    expect(/<ArtistesV2 \{q\} ouvrirId=/.test(bib),
      'l’identifiant n’est plus transmis à la vue des artistes').toBe(true);

    const vue = lire('src/components/v2/ArtistesV2.svelte');
    expect(/artistes\.find\(\(a\) => a\.id === id\)/.test(vue),
      'la vue ne cherche plus l’artiste demandé').toBe(true);
    expect(/artistes\.length === 0\) return/.test(vue),
      'la vue cherche avant que la liste soit chargée : elle ne trouverait rien').toBe(true);
  });
});

describe('Le menu, comme surface', () => {
  it('il est PORTÉ à la racine du document', () => {
    // Un menu déroulant posé dans une ligne se fait rogner par le premier
    // ancêtre qui défile — et un ancêtre portant `transform` ou `contain`
    // capture même `position: fixed`. C'est ce qui avait rogné le panneau
    // d'étiquettes aux trois quarts le 02/09/2026.
    expect(menu().includes('use:portail'), 'le menu n’est plus porté : il sera rogné par la liste').toBe(true);
  });

  it('il se referme quand la page bouge sous lui', () => {
    const src = menu();
    expect(/onwheel=\{onClose\}/.test(src), 'le menu suivrait son bouton de loin au défilement').toBe(true);
    expect(/onresize=\{onClose\}/.test(src), 'le menu resterait aux anciennes coordonnées au redimensionnement').toBe(true);
  });

  it('il remonte au-dessus du bouton quand le bas de la fenêtre est proche', () => {
    // Sur la dernière ligne d'une liste, un menu qui descend naît hors écran.
    expect(/ancre\.bottom \+ hauteurEstimee \+ 8 > window\.innerHeight/.test(menu()),
      'le menu ne se retourne plus : il naîtrait sous le bord de la fenêtre').toBe(true);
  });

  it('ses libellés passent tous par une CLÉ', () => {
    expect(menu().includes('{$t(entree.cle as any)}'), 'un libellé pourrait revenir en dur').toBe(true);
    const { g } = gestesTemoins();
    const enDur = entreesMenuPiste(TOUT, g).map((e) => e.cle)
      .filter((k) => !/^[a-z0-9]+(\.[A-Za-z0-9_]+)+$/.test(k));
    expect(enDur, `entrées dont la « clé » n’en est pas une : ${enDur.join(', ')}`).toEqual([]);
  });

  it('le bouton « … » disparaît quand il n’aurait rien à offrir', () => {
    // Une piste de service sans identifiant n'a aucun geste : un bouton qui
    // ouvre un menu vide est pire qu'un bouton absent.
    expect(/\{#if entrees\.length\}/.test(actions()),
      'le bouton « … » s’affiche même sans aucune entrée').toBe(true);
  });
});
