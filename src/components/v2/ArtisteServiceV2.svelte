<script lang="ts">
  /**
   * LA FICHE ARTISTE ÉLUE — #3825, socle de #2568, puis #1232.
   *
   * ## Ce qu'elle accepte désormais — #1232, étape 1
   *
   * Arbitrage de FabienM du 18/09/2026, repris par Bertrand le 23/09 : « une
   * seule page quel que soit l'endroit du clic, la page de streaming servant
   * de référence ». Le relevé de #1478 a montré pourquoi il n'était PAS
   * appliqué — pas « mal » appliqué, pas appliqué du tout : aucune des dix
   * origines de clic ne choisit une fiche, toutes choisissent d'après la
   * NATURE de l'objet, et la fiche élue ne savait montrer qu'un artiste
   * distant.
   *
   * Elle en sait donc deux maintenant, départagés par `ficheArtisteService` :
   *   • `service` renseigné → l'artiste de ce service, les trois routes ;
   *   • `service: null`     → un artiste de la BIBLIOTHÈQUE, `id` portant son
   *     identifiant local rendu en texte.
   *
   * 🔴 RIEN N'EST ENCORE ROUTÉ VERS LA SECONDE ENTRÉE, et c'est voulu : la
   * convergence du routage est l'étape 3, la réduction d'`ArtistesV2` à sa
   * liste l'étape 4. Basculer le routage avant que cette fiche sache tout
   * montrer ferait PERDRE des fonctions au testeur — c'est toute la raison du
   * découpage.
   *
   * ## La fiche d'un artiste de streaming — #3825, socle de #2568
   *
   * 🔴 Cet écran n'existait pas. C'est tout le défaut : `SearchV2.ouvrirArtiste`
   * se terminait par `if (!estLocal(ar)) { q = ar.name; return; }` — cliquer un
   * artiste Qobuz RELANÇAIT la recherche sur son nom. Le commentaire au-dessus
   * l'assumait : « Seul un artiste LOCAL a une fiche ». Ce n'était pas un lien
   * cassé à rebrancher, c'était l'écran d'arrivée qui manquait.
   *
   * Le serveur, lui, savait déjà tout faire — trois routes exposées pour six
   * services (`tune-streaming-http/src/lib.rs:313-320`) :
   *   • `/{service}/artists/{id}`            → `getStreamingArtist`
   *   • `/{service}/artists/{id}/albums`     → `getStreamingArtistAlbumsAll`
   *   • `/{service}/artists/{id}/top-tracks` → `getStreamingArtistTopTracks`
   * Les deux premières avaient leur enveloppe cliente et aucun consommateur en
   * v2 ; la troisième n'avait même pas d'enveloppe.
   *
   * RETOUR : on emploie `vueDeRetour`, le dépôt posé par l'émetteur du geste et
   * consommé UNE fois ici — le mécanisme de la coquille v2 (#3824/#3843), pas
   * un second inventé pour l'occasion. C'est exactement la divergence v1/v2 qui
   * a produit ce chantier ; en créer une de plus serait le reproduire.
   */
  import { onMount } from 'svelte';
  import * as api from '../../lib/api';
  import { zoneRequise } from '../../lib/zoneRequise';
  import type { Album, Artist, Source, Track } from '../../lib/types';
  import { activeView, vueDeRetour } from '../../lib/stores/navigation';
  import { ficheArtisteService, streamingServices } from '../../lib/stores/streaming';
  import { albumsDeStreamingPourArtiste, servicesInterrogeables, statutsStreaming, type AlbumsDeService } from '../../lib/albumsArtisteStreaming';
  import { BIBLIOTHEQUE, cleEdition, type Exemplaire } from '../../lib/discographieCommune';
  import type { ComptesArtistesSources } from '../../lib/provenanceBibliotheque';
  import { chargerTitresPhares } from '../../lib/titresPharesArtiste';
  import { initialesArtiste } from '../../lib/initialesArtiste';
  import DiscographieCommune from './DiscographieCommune.svelte';
  import BioEtTitresPhares from './BioEtTitresPhares.svelte';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import { t as tr } from '../../lib/i18n';
  import { lireListe, lireListeAleatoire } from '../../lib/lectureEnMasse';
  import EnTeteArtiste from './EnTeteArtiste.svelte';
  import { notifications } from '../../lib/stores/notifications';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';
  import { detailOuvert, ouvrirDetail, fermerDetailEnReculant } from '../../lib/historiqueCoquille';
  import { cleDetailAlbum } from '../../lib/cleDetailAlbum';

  const cible = $derived($ficheArtisteService);
  /**
   * LA FICHE EST OUVERTE SUR UN ARTISTE DE LA BIBLIOTHÈQUE — #1232, étape 1.
   *
   * `service: null` est le discriminant, et non « `id` ressemble à un
   * nombre » : un service rend des identifiants numériques (`q-42` chez Qobuz,
   * mais `12345` chez d'autres), et les confondre ouvrirait un artiste local
   * au hasard. C'est la même garde que celle de `artisteDePiste` (#1193).
   */
  const estLocal = $derived(cible != null && cible.service == null);

  let artiste = $state<Artist | null>(null);
  let titres = $state<Track[]>([]);
  /** #910 — la requête des titres phares a ÉCHOUÉ, par opposition à « ce
   *  service n'en rend aucun ». Sans ce témoin, les deux états sont le même
   *  `titres.length === 0`. */
  let titresEnEchec = $state(false);
  let albums = $state<Album[]>([]);
  let chargement = $state(true);
  /**
   * LA MÊME PAGE QUE CELLE D'UN ARTISTE DE LA BIBLIOTHÈQUE — #4330.
   *
   * FabienM, 17/09/2026 : depuis un artiste trouvé seulement sur un service,
   * « Oui je m'attends à avoir la même page, c'est le principe de la page
   * commune ». La fiche va donc chercher, en plus des albums du service d'où
   * l'on vient :
   *   • ses albums dans la BIBLIOTHÈQUE, si elle connaît un artiste du même
   *     nom (replié) — et seulement du même nom : un rapprochement approché
   *     poserait les albums d'un autre artiste sous celui-ci ;
   *   • ses albums chez les AUTRES services connectés, résolus par le nom
   *     comme le fait déjà la fiche de bibliothèque (#3709).
   * Les deux partent sans bloquer l'affichage : le service d'origine répond
   * d'abord, la grille grandit ensuite.
   */
  let locaux = $state<Album[]>([]);
  /**
   * L'ARTISTE de la bibliothèque qui porte ce nom, s'il existe — #1356.
   *
   * Bertrand, 20/09/2026 : « mêmes actions ! », « sans en perdre ! ». Deux des
   * gestes de la fiche de bibliothèque — « Toutes les pistes » et « Lecture
   * aléatoire » — ont une cible ici DÈS LORS que la bibliothèque connaît cet
   * artiste. `chargerComplements` le RÉSOLVAIT déjà, par le nom replié exact,
   * pour aller chercher ses albums locaux ; il le jetait ensuite. On le garde :
   * rien de nouveau n'est interrogé.
   *
   * 🔴 Pas de résolution approchée : un rapprochement à peu près lancerait la
   * discographie d'un AUTRE artiste. C'est la même garde que celle des albums.
   */
  let artisteLocal = $state<Artist | null>(null);
  let autresServices = $state<AlbumsDeService[]>([]);
  let complementsEnCharge = $state(false);
  /**
   * La biographie affichée. Un artiste de SERVICE la porte sur lui (Qobuz la
   * publie) ; un artiste LOCAL a d'abord celle qu'on a éditée dans la
   * bibliothèque, et à défaut celle que `GET /library/artists/{id}/bio` sait
   * rendre — même règle et même ordre que la fiche de bibliothèque (#1232).
   */
  let bio = $state<string | null>(null);
  /**
   * Le compte de l'en-tête : les vignettes de la DISCOGRAPHIE COMMUNE, et non
   * les seuls albums de la bibliothèque — « 1 albums » pour a-ha, 44 à
   * l'écran. Repris tel quel de la fiche de bibliothèque, qui l'avait mesuré.
   */
  let comptesFiche = $state<ComptesArtistesSources | null>(null);
  const sectionsServices = $derived<AlbumsDeService[]>(
    // `artistId` : l'identifiant OUVERT chez ce service — ce qui départage ses
    // albums de ceux d'autres artistes que le service range sous lui (#4651).
    // `cible.service` non nul : la première section est celle du service
    // d'ORIGINE, et un artiste local n'en a pas — sa grille est `locaux` plus
    // les services résolus par le nom (#1232, étape 1).
    cible?.service && albums.length ? [{ service: cible.service, albums, artistId: String(cible.id) }, ...autresServices] : autresServices,
  );
  /** L'album ouvert, et d'où il vient : `null` = la bibliothèque. */
  let albumOuvert = $state<Album | null>(null);
  let serviceOuvert = $state<string | null>(null);
  /**
   * 🔴 LE CALQUE ALBUM EMPILE UNE ENTRÉE D'HISTORIQUE — #980.
   *
   * Fabien, fils 1774 et 1778 : « quand on clique sur un album → page album, le
   * bouton BACK du navigateur retourne à la page d'accueil » / « à l'avant-
   * dernière page consultée ».
   *
   * Une fiche album est un CALQUE : l'ouvrir ne change pas `activeView`, donc
   * la coquille n'écrit rien et le Précédent dépile l'entrée d'AVANT. Mesuré :
   * dix écrans montent `AlbumDetailV2`, et deux seulement empilaient.
   *
   * Trois branchements, et il en faut trois : ouvrir empile, le Retour referme
   * ET dépile, le Précédent referme le calque. On pose la CLÉ, jamais l'objet —
   * `history.state` refuse les proxies Svelte.
   */
  function ouvrirCalqueAlbum(a: any) {
    const cle = cleDetailAlbum(a);
    if (cle) ouvrirDetail(cle);
  }
  function fermerCalqueAlbum() {
    albumOuvert = null;
  }
  function retourCalqueAlbum() {
    fermerDetailEnReculant(fermerCalqueAlbum);
  }
  $effect(() => {
    if ($detailOuvert == null && albumOuvert) fermerCalqueAlbum();
  });

  /**
   * 🔴 Un jeton par ouverture. Trois requêtes partent ensemble et un service
   * distant répond en secondes : sans lui, la réponse d'un artiste ouvert puis
   * quitté viendrait se poser sous le suivant. Même garde que
   * `ArtistesV2.chargerAlbumsDeService`.
   */
  let jeton = 0;

  async function charger(service: Source, id: string) {
    const mien = ++jeton;
    chargement = true;
    artiste = null;
    titres = [];
    titresEnEchec = false;
    albums = [];
    bio = null;
    // `allSettled` : un service qui refuse les titres phares ne doit pas
    // emporter les albums avec lui. Une fiche à moitié pleine vaut mieux
    // qu'un écran vide — c'est la règle du reste de l'application.
    const [a, tt, al] = await Promise.allSettled([
      api.getStreamingArtist(service, id),
      api.getStreamingArtistTopTracks(service, id),
      // #1343 — la discographie ne s'arrête plus à la première page de 50.
      api.getStreamingArtistAlbumsAll(service, id),
    ]);
    if (mien !== jeton) return;
    if (a.status === 'fulfilled') artiste = a.value;
    // 🔴 ESTAMPILLER LA SOURCE, UNE FOIS, ICI. La charge de `top-tracks` ne
    // porte pas de champ `source` — le service est dans l'URL. Sans lui
    // `corpsDeLecture` ne sait désigner aucune de ces pistes : `planDeLecture`
    // les écarte toutes et le « best of » partirait VIDE, sans erreur. On le
    // pose au chargement plutôt qu'à chaque geste : un seul endroit à ne pas
    // oublier, au lieu d'un par bouton.
    if (tt.status === 'fulfilled') {
      titres = (tt.value ?? []).map((p) => ({ ...p, source: service })) as Track[];
      titresEnEchec = false;
    } else {
      // 🔴 #910 — UN REFUS N'EST PAS UNE ABSENCE.
      //
      // Sandro, 15/09/2026 : « les boutons Radio et Best of restent absents
      // près du nom de l'artiste — ont-ils été retirés ? » Ils ne l'avaient
      // pas été. Ils sont entièrement conditionnés par `{#if titres.length}`,
      // et `titres` reste VIDE aussi bien quand le service ne rend aucun titre
      // phare que quand la requête a ÉCHOUÉ. `allSettled` avale le rejet : la
      // page montrait alors ses albums sans un mot, et deux gestes
      // disparaissaient sans que rien ne dise pourquoi.
      //
      // La distinction est la même que celle de #1096 pour les zones : une
      // liste vide et une liste qu'on n'a pas pu charger ne se disent pas
      // pareil.
      titresEnEchec = true;
    }
    // Tamponnée comme le fait `albumsDeStreamingPourArtiste` : le serveur ne
    // pose `source` sur aucun objet de streaming, et la clé d'historique d'un
    // album (`cleDetailAlbum`) en a besoin.
    if (al.status === 'fulfilled') {
      albums = (al.value ?? []).map((x) => ({ ...x, source: (x.source ?? service) as Album['source'] }));
    }
    bio = artiste?.bio ?? null;
    chargement = false;
    void chargerComplements(mien, service, artiste?.name || cible?.nom || '');
  }

  /**
   * L'ENTRÉE « ARTISTE DE LA BIBLIOTHÈQUE » — #1232, étape 1.
   *
   * Le miroir exact de `charger` : là où un service rend l'artiste, ses albums
   * et ses titres phares, la bibliothèque rend l'artiste et ses albums —
   * `locaux`, pas `albums`, qui est la grille du service d'origine et reste
   * vide ici. Les titres phares, eux, n'existent PAS en bibliothèque : ce
   * classement vient des services, et `chargerComplements` va les chercher
   * chez celui qui en rend, comme le fait déjà la fiche de bibliothèque
   * (`chargerTitresPhares`, étape 2 de #4330). Rien de nouveau n'est interrogé.
   *
   * 🔴 `getArtist` et non une recherche par le nom : cette fiche est ouverte
   * sur un IDENTIFIANT, et chercher « M » dans la table qui porte « -M- » est
   * exactement l'échec que la prop `ouvrirId` d'`ArtistesV2` avait corrigé.
   */
  async function chargerLocal(id: number) {
    const mien = ++jeton;
    chargement = true;
    artiste = null;
    titres = [];
    titresEnEchec = false;
    albums = [];
    bio = null;
    locaux = [];
    artisteLocal = null;
    autresServices = [];
    comptesFiche = null;
    const [a, al] = await Promise.allSettled([
      api.getArtist(id),
      api.getArtistAlbums(id),
    ]);
    if (mien !== jeton) return;
    if (a.status === 'fulfilled' && a.value) {
      artiste = a.value;
      // L'artiste local EST celui de la fiche : les gestes conditionnés par
      // `artisteLocal` (« Toutes les pistes », « Lecture aléatoire ») ont donc
      // une cible sans qu'aucune résolution par le nom soit nécessaire.
      artisteLocal = a.value;
    }
    if (al.status === 'fulfilled') locaux = (al.value ?? []) as Album[];
    chargement = false;
    void chargerBioLocale(mien, id, artiste?.bio ?? null);
    void chargerComplements(mien, null, artiste?.name || cible?.nom || '', true);
  }

  /**
   * La biographie d'un artiste local : celle qu'on a éditée d'abord, celle que
   * le serveur sait rendre ensuite. Même ordre que la fiche de bibliothèque —
   * une bio éditée ne doit jamais être recouverte par une bio rapportée.
   */
  async function chargerBioLocale(mien: number, id: number, bioEditee: string | null) {
    const editee = bioEditee?.trim() || null;
    bio = editee;
    if (editee) return;
    try {
      const r = await api.getArtistBio(id);
      if (mien === jeton) bio = r?.bio?.trim() || null;
    } catch {
      /* pas de biographie : le bloc ne s'affiche pas */
    }
  }

  const plier = (x: string | null | undefined) => cleEdition(x);

  /**
   * `localDejaCharge` — l'entrée locale a DÉJÀ l'artiste et ses albums.
   *
   * 🔴 Sans ce drapeau, la remise à zéro en tête de fonction effacerait ce que
   * `chargerLocal` vient de poser, et la recherche par le nom irait rechercher
   * un artiste qu'on tient par son identifiant — avec le risque, pour un nom
   * que `searchLibrary` ne rend pas dans ses vingt premiers, de le perdre.
   */
  async function chargerComplements(mien: number, service: Source | null, nomArtiste: string, localDejaCharge = false) {
    if (!localDejaCharge) {
      locaux = [];
      artisteLocal = null;
    }
    autresServices = [];
    if (!nomArtiste.trim()) return;
    complementsEnCharge = true;
    // Le magasin peut être VIDE dans le nouveau client : voir `statutsStreaming`.
    const statuts = await statutsStreaming($streamingServices, api.getStreamingServices, (x) => streamingServices.set(x));
    if (mien !== jeton) return;
    const autres = servicesInterrogeables(statuts).filter((s) => s !== service);
    const [loc, svc] = await Promise.allSettled([
      (async () => {
        // Déjà tenu par l'identifiant : on ne le recherche pas par le nom.
        if (localDejaCharge) return { artiste: artisteLocal, albums: locaux };
        const trouve = ((await api.searchLibrary(nomArtiste, 20))?.artists ?? [])
          .find((a) => a.id != null && plier(a.name) === plier(nomArtiste));
        // L'artiste EN PLUS de ses albums : voir `artisteLocal` (#1356).
        return { artiste: trouve ?? null, albums: trouve ? ((await api.getArtistAlbums(trouve.id!)) ?? []) : [] };
      })(),
      albumsDeStreamingPourArtiste(nomArtiste, autres, {
        resoudreArtiste: async (svc, nom) =>
          (await api.federatedSearch(nom, [svc], 5))?.services?.[svc]?.artists ?? [],
        albumsDeLArtiste: (svc, id) => api.getStreamingArtistAlbumsAll(svc, id),
      }),
    ]);
    if (mien !== jeton) return;
    if (!localDejaCharge && loc.status === 'fulfilled') {
      locaux = loc.value.albums;
      artisteLocal = loc.value.artiste;
    }
    if (svc.status === 'fulfilled') autresServices = svc.value;
    complementsEnCharge = false;
    // #1232, étape 1 — LES TITRES PHARES D'UN ARTISTE LOCAL. Une bibliothèque
    // ne sait pas lesquels de ses titres sont « phares » : le classement vient
    // des services, dont l'identifiant vient d'être résolu pour la
    // discographie. Exactement ce que fait la fiche de bibliothèque.
    // Un artiste de service, lui, a déjà les siens par `top-tracks` : on ne
    // touche pas à sa branche.
    if (localDejaCharge && svc.status === 'fulfilled') {
      const phares = await chargerTitresPhares(svc.value, (s, id) => api.getStreamingArtistTopTracks(s, id));
      if (mien !== jeton) return;
      titres = phares;
    }
  }

  function ouvrirExemplaire(ex: Exemplaire) {
    ouvrirCalqueAlbum(ex.album);
    serviceOuvert = ex.source === BIBLIOTHEQUE ? null : ex.source;
    albumOuvert = ex.album;
  }
  function lireExemplaire(ex: Exemplaire) {
    const zid = zoneRequise();
    if (zid == null) return;
    if (ex.source === BIBLIOTHEQUE) {
      if (ex.album.id == null) return;
      playAndSync(zid, { album_id: ex.album.id }).catch(signalerEchecLecture);
    } else if (ex.album.source_id != null) {
      // 🔴 `source` va TOUJOURS avec `streaming_album_id` (voir `ArtistesV2`).
      playAndSync(zid, { streaming_album_id: String(ex.album.source_id), source: ex.source as any })
        .catch(signalerEchecLecture);
    }
  }

  $effect(() => {
    const c = cible;
    if (!c) return;
    // #1232, étape 1 — deux entrées, un seul aiguillage, et il est ICI.
    if (c.service == null) {
      const n = Number(c.id);
      // Un identifiant local qui n'est pas un nombre n'est pas une route : on
      // ne fabrique pas d'appel mort.
      if (Number.isFinite(n)) void chargerLocal(n);
      return;
    }
    void charger(c.service, c.id);
  });

  onMount(() => () => { jeton++; });

  /** Le nom affiché tant que la fiche charge : celui que l'appelant portait. */
  const nom = $derived(artiste?.name || cible?.nom || '');

  function retour() {
    const ou = $vueDeRetour;
    // 🔴 Lu AVANT de vider le magasin : `estLocal` en dérive, et le lire après
    // rendrait toujours faux — le repli d'un artiste local retomberait sur la
    // Recherche, un écran d'où il ne vient pas (#1232, étape 1).
    const local = estLocal;
    albumOuvert = null;
    ficheArtisteService.set(null);
    vueDeRetour.set(null);
    activeView.set(ou ?? (local ? 'library' : 'search'));
  }

  /**
   * « Best of » et « Radio de l'artiste » — #2568.
   *
   * Sandro, fil forum 1579 (27/08/2026) : « serait-il possible d'ajouter un
   * bouton pour écouter une sélection de ses meilleurs titres (ou un mix
   * automatique basé sur son catalogue) […] une fonction "Radio Artiste" ou
   * "Best of" dédiée, permettant de découvrir rapidement sa discographie sans
   * devoir charger manuellement chaque album un par un. »
   *
   * Sa demande porte DEUX gestes, et un seul bouton en trahirait un : le best
   * of, c'est la sélection dans l'ordre du service ; la radio, c'est le mix.
   * On ne fabrique aucun classement — `get_artist_top_tracks` rend l'ordre du
   * service, et le trier nous-mêmes sur une popularité qu'il ne donne pas
   * reviendrait à inventer le best of au lieu de le relayer.
   *
   * ⚠️ Le piège serveur que le ticket signalait est LEVÉ sur `main` : Qobuz
   * demande `extra=tracks` d'abord et ne retombe sur `tracks_appears_on` —
   * « ce sur quoi l'artiste apparaît », qui n'est pas un best of — qu'en
   * dernier recours (`qobuz.rs`, `get_artist_top_tracks`).
   */
  let enMasse = $state(false);
  async function jouerLesTitres(aleatoire: boolean) {
    const zid = $currentZoneId;
    if (zid == null || !titres.length) return;
    enMasse = true;
    try {
      const gestes = {
        lire: (c: any) => playAndSync(zid, c),
        enfiler: (c: any) => api.addToQueue(zid, c),
      };
      const n = aleatoire ? await lireListeAleatoire(titres, gestes) : await lireListe(titres, gestes);
      // Zéro veut dire « rien n'était désignable » : c'est à l'écran de le
      // dire, sans quoi le bouton paraîtrait mort.
      if (!n) notifications.error($tr('v2.fas.empty' as any));
    } catch (e: any) {
      notifications.error(e?.message ?? $tr('v2.fas.empty' as any));
    }
    enMasse = false;
  }

  /**
   * « Toutes les pistes » et « Lecture aléatoire » — PORTÉS de la fiche de
   * bibliothèque (#1356).
   *
   * 🔴 MESURÉS AVANT D'ÊTRE PORTÉS. Ces deux gestes portent sur une
   * DISCOGRAPHIE, et un service n'en rend pas les pistes : ses trois routes
   * donnent l'artiste, ses albums et ses titres phares, rien de plus. La seule
   * cible réelle est donc la bibliothèque — et elle n'existe que si elle
   * connaît cet artiste. D'où la condition : pas d'`artisteLocal`, pas de
   * boutons. Un bouton visible qui ne fait rien se lit comme une panne (#1231).
   *
   * Ce qu'ils jouent est donc exactement ce que la fiche montre déjà sous
   * « Bibliothèque » dans la discographie commune : rien de promis en plus.
   *
   * Les appels sont les MÊMES que ceux d'`ArtistesV2` — `getArtistTracks` puis
   * `lireListe` avec le contexte artiste (#2442), `shuffleAll({artist_id})` qui
   * tire sur la discographie entière côté serveur (#1947).
   */
  let enMasseLocale = $state(false);
  async function lireDiscographieLocale(aleatoire: boolean) {
    const a = artisteLocal;
    const zid = $currentZoneId;
    if (a?.id == null) return;
    if (zid == null) {
      notifications.error($tr('v2.art.noZone' as any));
      return;
    }
    enMasseLocale = true;
    try {
      if (aleatoire) {
        const r = await api.shuffleAll(zid, { artist_id: a.id });
        if (!r.track_count) notifications.error($tr('library.noTracks' as any));
      } else {
        const pistes = (await api.getArtistTracks(a.id)) ?? [];
        const n = await lireListe(pistes, {
          lire: (c: any) => playAndSync(zid, { ...c, context_type: 'artist', context_id: String(a.id) }),
          enfiler: (c: any) => api.addToQueue(zid, c),
        });
        if (!n) notifications.error($tr('library.noTracks' as any));
      }
    } catch (e: any) {
      notifications.error(e?.message ?? $tr('common.error' as any));
    }
    enMasseLocale = false;
  }
</script>

{#if albumOuvert}
  <!-- `service` EN MÊME TEMPS que l'album : `AlbumDetailV2` n'apparie un album
       de streaming que sur la paire service + `source_id`, et l'ouvrir sans son
       service le laisserait sur « Chargement… » pour toujours (#3709). -->
  {#if serviceOuvert}
    <AlbumDetailV2 album={albumOuvert} service={serviceOuvert} onClose={retourCalqueAlbum} />
  {:else}
    <AlbumDetailV2 album={albumOuvert} depot={null} onClose={retourCalqueAlbum} />
  {/if}
{:else}
<section class="v2-fas tune-v2">
  <!-- L'en-tête est le MÊME composant que celui de la fiche de bibliothèque
       (#1356) : c'est la forme d'ici qui a été retenue, elle ne bouge pas.

       #1232, étape 1 — trois détails suivent la NATURE de l'artiste :
       la provenance affichée, les initiales de repli (deux pour un artiste
       local, comme la fiche de bibliothèque depuis le 02/09 ; la fiche de
       service garde la sienne, inchangée) et le compte d'albums, qui n'existe
       que côté bibliothèque. -->
  <EnTeteArtiste
    {nom}
    provenance={estLocal ? $tr('library.title' as any) : (cible?.service ?? null)}
    imagePath={artiste?.image_path ?? null}
    initiales={estLocal ? initialesArtiste(nom) : nom.slice(0, 1)}
    sousTitre={estLocal ? `${comptesFiche?.total ?? locaux.length} ${$tr('v2.art.albums' as any)}` : null}
    onRetour={retour}>
    {#snippet actions()}
      {#if titres.length}
        <button class="v2-btn" disabled={enMasse} onclick={() => jouerLesTitres(false)}>
          {$tr('v2.fas.bestOf' as any)}
        </button>
        <button class="v2-btn ghost" disabled={enMasse} onclick={() => jouerLesTitres(true)}>
          {$tr('v2.fas.radio' as any)}
        </button>
      {:else if titresEnEchec && !chargement}
        <!-- #910 — dire pourquoi les deux gestes manquent, et laisser
             réessayer. Ils ne sont PAS retirés : le service n'a pas répondu. -->
        <span class="echec">{$tr('v2.fas.topTracksFailed' as any)}</span>
        <button class="v2-btn ghost" onclick={() => cible && charger(cible.service as Source, cible.id)}>
          {$tr('zone.retry' as any)}
        </button>
      {/if}
      <!-- PORTÉS de la fiche de bibliothèque, et seulement quand elle connaît
           cet artiste : voir `lireDiscographieLocale` (#1356). -->
      {#if artisteLocal?.id != null}
        <button class="v2-btn" disabled={enMasseLocale} onclick={() => lireDiscographieLocale(false)}
          title={$tr('library.playAllArtist' as any)}>
          {$tr('library.playAllArtist' as any)}
        </button>
        <button class="v2-btn ghost" disabled={enMasseLocale} onclick={() => lireDiscographieLocale(true)}
          title={$tr('library.shuffleArtist' as any)}>
          {$tr('library.shuffleArtist' as any)}
        </button>
      {/if}
    {/snippet}
  </EnTeteArtiste>

  {#if chargement}
    <div class="etat">{$tr('v2.common.loading' as any)}</div>
  {:else if !titres.length && !albums.length && !locaux.length && !autresServices.length && !complementsEnCharge}
    <!-- #910 — « rien trouvé » et « rien chargé » ne se disent pas pareil. -->
    <div class="etat">{$tr(titresEnEchec ? 'v2.fas.topTracksFailed' as any : 'v2.fas.empty' as any)}</div>
  {:else}
    <!-- Biographie (Qobuz la publie) et titres phares : le MÊME bloc que la
         fiche d'un artiste de la bibliothèque (#4330, étape 2). -->
    <BioEtTitresPhares bio={bio} titres={titres} cle={cible?.id} />

    {#if albums.length || locaux.length || autresServices.length || complementsEnCharge}
      <h2>{$tr('v2.fas.albums' as any)}</h2>
      <DiscographieCommune {locaux} services={sectionsServices} servicesEnCharge={complementsEnCharge}
        nomArtiste={artiste?.name || cible?.nom || null}
        onComptesProvenance={(c) => (comptesFiche = c)}
        onOuvrir={ouvrirExemplaire} onLire={lireExemplaire} />
    {/if}
  {/if}
</section>
{/if}

<style>
  .v2-fas{height:100%; overflow-y:auto; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); padding:0 30px 40px}
  /* L'en-tête — `.tete`, `.retour`, `.portrait`, `.ident`, `.gestes` — vit
     désormais dans `EnTeteArtiste`, partagé avec la fiche de bibliothèque
     (#1356). Ne reste ici que ce qui est rendu dans CETTE portée. */
  /* #910 — pourquoi les deux gestes manquent. */
  .echec{font-size:12.5px; line-height:1.4; color:var(--v2-txt2); align-self:center}
  .etat{padding:40px 0; color:var(--v2-txt3)}
  h2{margin:22px 0 10px; font:600 13px var(--v2-sans); color:var(--v2-txt2);
    text-transform:uppercase; letter-spacing:.05em}
  @media (max-width: 640px){
    .v2-fas{padding:0 16px 40px}
  }
</style>
