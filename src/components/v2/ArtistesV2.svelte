<script lang="ts">
  /**
   * Onglet « Artistes » de la Bibliothèque — refait.
   *
   * ## Ce qu'il était
   *
   * Une FACETTE des albums : une section par artiste, avec ses albums en
   * dessous. Ce n'est pas une vue d'artistes, c'est la vue Albums rangée
   * autrement. Sur la bibliothèque de Bertrand, cela donnait une page où
   * chaque artiste occupait toute la hauteur pour un seul album, sans avatar
   * ni compte (constaté sur capture, 02/09/2026).
   *
   * Surtout, elle ne montrait que les artistes PORTÉS PAR UN ALBUM chargé.
   * Un artiste sans album en base — ou dont les albums n'étaient pas encore
   * arrivés — n'existait pas.
   *
   * ## Ce qu'il est
   *
   * La vue de l'écran actuel : une grille d'ARTISTES — pochette carrée, au
   * même format que celle d'un album —, nom, nombre d'albums, et un rail A–Z.
   * Les artistes viennent de `/library/artists`,
   * leur propre table — pas d'une déduction depuis les albums.
   *
   * On ouvre un artiste pour voir ses albums, comme aujourd'hui.
   *
   * ## Les cinq actions
   *
   * L'artiste les a toutes : le favori et les étiquettes existaient déjà côté
   * serveur (`LOCAL_ITEM_TYPES` et `TAGGABLE_ITEM_TYPES` contiennent
   * `artist`), et `PUT /library/artists/{id}` accepte nom, nom de tri et
   * biographie.
   *
   * ⚠️ Le cœur d'artiste n'avait JAMAIS été proposé nulle part avant l'écran
   * actuel : la route et le magasin existaient, aucun écran ne passait
   * `artistId`. C'est ce qui explique le zéro absolu d'artistes favoris en
   * base, mieux que la discrétion du bouton.
   *
   * La lecture passe par le premier album : `POST /zones/{id}/play` n'accepte
   * pas d'`artist_id`. Même compromis que pour les collections.
   */
  import { onMount, untrack } from 'svelte';
  import {
    activeView, listResetNonce, vueDeRetour, pendingSearchQuery,
    saveDetailScroll, restoreDetailScroll,
  } from '../../lib/stores/navigation';
  import {
    detailOuvert, ouvrirDetail, fermerDetail, fermerDetailEnReculant,
  } from '../../lib/historiqueCoquille';
  import { cleDetailArtiste } from '../../lib/cleDetailArtiste';
  import { lireListe, lireListeAleatoire } from '../../lib/lectureEnMasse';
  import { melangee } from '../../lib/shuffle';
  import { dansSource, sourceCorrespond, compterSources, type ComptesArtistesSources } from '../../lib/provenanceBibliotheque';
  import * as api from '../../lib/api';
  import { normaliserMetadonnees, bioDans, bilanEnrichissement } from '../../lib/metadonneesArtiste';
  import { uniqueInstruments } from '../../lib/library/credits';
  import { locale as langueCourante } from '../../lib/i18n';
  import type { ArtistMetadata, TrackCredit } from '../../lib/types';
  import { t } from '../../lib/i18n';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  // Un échec de lecture DOIT se voir : ces appels finissaient tous par un
  // `.catch(() => {})` (#3732). Le message du serveur — qui nomme l'appareil
  // manquant — n'atteignait jamais l'écran.
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import { notifications } from '../../lib/stores/notifications';
  import type { Album, Artist, Track } from '../../lib/types';
  import { streamingServices } from '../../lib/stores/streaming';
  import {
    albumsDeStreamingPourArtiste,
    servicesInterrogeables,
    statutsStreaming,
    type AlbumsDeService,
  } from '../../lib/albumsArtisteStreaming';
  import { BIBLIOTHEQUE, type Exemplaire } from '../../lib/discographieCommune';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import DiscographieCommune from './DiscographieCommune.svelte';
  import BioEtTitresPhares from './BioEtTitresPhares.svelte';
  import EnTeteArtiste from './EnTeteArtiste.svelte';
  import { chargerTitresPhares } from '../../lib/titresPharesArtiste';
  import PochetteActions from './PochetteActions.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';
  import RenommerModale from './RenommerModale.svelte';
  import ArtistEditModal from '../partages/ArtistEditModal.svelte';
  import ReportButton from '../partages/ReportButton.svelte';

  interface Props {
    /** Filtre texte partagé avec le reste de l'écran. */
    q?: string;
    /** Source partagée avec Albums/Pistes ; un artiste peut en avoir plusieurs. */
    provenance?: string | null;
    sourcesArtistes?: Map<number, Set<string>>;
    sourcesEnCharge?: boolean;
    erreurSources?: string | null;
    onComptesSources?: (comptes: ComptesArtistesSources) => void;
    /**
     * Les comptes du menu « Source » quand une FICHE est ouverte — ceux de sa
     * discographie commune, services compris (#4330) ; `null` à la fermeture,
     * le menu reprend alors ceux de la grille des artistes.
     */
    onComptesFiche?: (comptes: ComptesArtistesSources | null) => void;
    /**
     * L'artiste à OUVRIR dès que la liste est là — « Aller à l'artiste » du
     * menu « … » d'une piste (Bertrand, 07/09/2026).
     *
     * Par IDENTIFIANT, pas par nom : le client actuel cherche l'artiste par
     * son nom dans la table, un rapprochement qui échoue dès qu'une piste
     * porte « M » quand la table porte « -M- ». Une piste de la bibliothèque
     * porte `artist_id`, et c'est la clé de cette table.
     */
    ouvrirId?: number | null;
    /** Acquitté une fois la fiche ouverte — sinon elle se rouvrirait à chaque
     *  retour sur l'onglet. */
    onOuvert?: () => void;
    /**
     * PORTÉE À UN RÉPERTOIRE — les identifiants des artistes à montrer, ou
     * `null` quand aucune portée n'est posée.
     *
     * `/library/artists` n'a pas de facette `folder` : la portée arrive donc
     * déjà résolue, depuis les albums du dossier que la Bibliothèque a
     * demandés. Sans elle, choisir un répertoire laissait TOUS les artistes à
     * l'écran sous la puce du dossier — renesenses/tune-server-rust#3101.
     */
    idsPortee?: Set<number> | null;
    /** Le nom du dossier, pour le dire quand la portée ne rend aucun artiste. */
    nomPortee?: string | null;
  }
  let { q = '', provenance = null, sourcesArtistes = new Map(), sourcesEnCharge = false, erreurSources = null, onComptesSources, onComptesFiche, ouvrirId = null, onOuvert, idsPortee = null, nomPortee = null }: Props = $props();

  /**
   * 🔴 On attend que la LISTE soit chargée : `artistes` est vide au montage, et
   * chercher dedans tout de suite ne rendrait rien — l'effet se rejoue quand
   * elle arrive.
   */
  $effect(() => {
    const id = ouvrirId;
    if (id == null || artistes.length === 0) return;
    const cible = artistes.find((a) => a.id === id);
    onOuvert?.();
    if (cible) void ouvrir(cible);
  });

  let artistes = $state<Artist[]>([]);
  let chargement = $state(true);
  let erreur = $state<string | null>(null);

  /** Artiste ouvert — on montre ses albums. */
  let ouvert = $state<Artist | null>(null);
  /**
   * L'éditeur COMPLET de l'artiste (nom, tri, image téléversée…), porté de
   * l'ancienne Bibliothèque. La modale générique de la grille ne sait que
   * renommer : l'image d'un artiste ne se changeait nulle part ici.
   */
  let editionComplete = $state<Artist | null>(null);
  let albums = $state<Album[]>([]);
  let albumsChargement = $state(false);
  /** Le compte de l'en-tête : les vignettes de la discographie commune, et non
   *  les seuls albums de la bibliothèque (« 1 albums » pour a-ha, 44 à l'écran). */
  let comptesFiche = $state<ComptesArtistesSources | null>(null);
  $effect(() => { if (!ouvert) { comptesFiche = null; onComptesFiche?.(null); } });

  // Le tri de la fiche (#4246) a suivi la grille dans `DiscographieCommune`,
  // avec ses clés et sa mémoire.
  let albumOuvert = $state<Album | null>(null);
  let enEdition = $state<Artist | null>(null);
  /**
   * Étiquettes de la FICHE artiste — le même trou que celui de la fiche album.
   *
   * La vignette de la grille porte le bouton depuis #1238 ; la fiche ouverte,
   * elle, n'avait que « Tout lire », « Modifier » et « Aléatoire ».
   *
   * Seul un artiste de la BIBLIOTHÈQUE est étiquetable ici, et c'est la même
   * règle que la vignette juste au-dessus (`a.id != null ? … : null`) : cette
   * fiche-ci ne s'ouvre que sur un artiste indexé. La fiche d'un artiste de
   * SERVICE est un autre écran (`ArtisteServiceV2`), qui n'est pas traité ici.
   */
  let etiquettesArtiste = $state<Artist | null>(null);
  /**
   * 🔴 Le pendant de l'effet de `LibraryV2` — #3843.
   *
   * La fiche ARTISTE est un second calque, tenu ici et non dans `LibraryV2` :
   * refermer `opened` chez le parent ne la referme pas. Un clic sur
   * « Bibliothèque » doit rendre la grille, quel que soit le calque ouvert.
   *
   * 🔴 `$listResetNonce`, pas `get(...)` — voir `LibraryV2`.
   */
  $effect(() => {
    $listResetNonce;
    ouvert = null;
    albumOuvert = null;
    // Le magasin partagé suit le calque : le laisser garni ferait porter à
    // l'entrée d'historique une fiche que l'écran n'affiche plus.
    fermerDetail();
  });
  /**
   * Le bouton « Retour » de la fiche artiste — #3824.
   *
   * Il ne faisait que `ouvert = null`, ce qui découvre la grille des artistes
   * de la Bibliothèque : le testeur venu de la Recherche atterrissait « à
   * l'accueil de la bibliothèque ». La fiche sait désormais d'où l'on vient,
   * parce que l'émetteur du geste le lui a dit (`vueDeRetour`).
   *
   * Le calque est refermé DANS TOUS LES CAS : sans cela, revenir plus tard sur
   * la Bibliothèque rouvrirait la fiche qu'on croyait avoir quittée.
   */
  function retourFiche() {
    const retour = $vueDeRetour;
    if (retour) {
      // Le parcours a une destination explicite (venu de la Recherche) : on y
      // VA, on ne recule pas. Le magasin de détail est vidé sans reculer, sinon
      // le `history.back()` et le changement de vue se marcheraient dessus.
      fermerDetail();
      fermerLaFiche();
      vueDeRetour.set(null);
      activeView.set(retour);
      return;
    }
    // Sinon c'est un vrai RECUL : on dépile l'entrée d'historique en même
    // temps qu'on referme, pour que la pile du navigateur suive le chemin
    // réellement parcouru (#828).
    fermerDetailEnReculant(fermerLaFiche);
  }

  /**
   * LE RETOUR REPOSE OÙ L'ON ÉTAIT — #864.
   *
   * « Bibliothèque → Artistes → choix de l'artiste → album(s) → retour → haut
   * de la page » (Jean Valjean, fil 1671). `{#if ouvert}` RETIRE la grille du
   * DOM : au retour elle est reconstruite à neuf, et le navigateur n'a plus de
   * conteneur dont restaurer le `scrollTop`. Rien ne le compensait — mesuré :
   * pas une occurrence de `scrollTop` dans ce fichier avant ce correctif.
   *
   * On réemploie `saveDetailScroll` / `restoreDetailScroll`, écrits pour
   * exactement ce motif dans cinq écrans de l'ancienne coquille. La cible est
   * une FONCTION, pas l'élément : au moment du retour la branche « liste »
   * n'est pas encore rendue et `grilleEl` vaut `null` — la version à élément
   * rendrait la main sans rien faire, en silence.
   */
  const CLE_DEFILEMENT = 'v2:artistes';
  function fermerLaFiche() {
    ouvert = null;
    albumOuvert = null;
    restoreDetailScroll(CLE_DEFILEMENT, () => grilleEl);
  }

  /**
   * LE BOUTON PRÉCÉDENT DU NAVIGATEUR, relu ici — #828, #867.
   *
   * La coquille repose l'état de l'entrée atteinte dans `detailOuvert` ; c'est
   * à l'écran qui porte le calque de s'y conformer. Sans ce raccord, le retour
   * navigateur reposerait la bonne VUE en laissant la fiche par-dessus.
   *
   * ⚠️ `untrack` : l'effet écrit `ouvert`, qu'il lirait aussi. Il ne doit
   * dépendre QUE du magasin, sinon sa propre écriture le relance.
   */
  $effect(() => {
    const voulu = $detailOuvert;
    untrack(() => {
      if (!ouvert) return;
      if (voulu === cleDetailArtiste(ouvert.id)) return;
      fermerLaFiche();
    });
  });
  /**
   * Ouvrir un artiste EN CLIQUANT LA GRILLE efface le retour en attente.
   *
   * Sans cela, un parcours « Recherche → fiche A → grille → fiche B » ferait
   * repartir le Retour de la fiche B vers la Recherche, un écran que
   * l'utilisateur a quitté entre-temps. Le dépôt n'appartient qu'au geste qui
   * l'a posé.
   */
  function ouvrirDepuisGrille(a: Artist) {
    vueDeRetour.set(null);
    void ouvrir(a);
  }

  /**
   * Les albums de l'artiste CHEZ LES SERVICES — #3709.
   *
   * `ouvrirService` porte le service en même temps que l'album : `AlbumDetailV2`
   * n'apparie un album de streaming que sur la PAIRE service + `source_id`, et
   * l'ouvrir sans son service le laisserait sur « Chargement… » pour toujours.
   */
  let albumsService = $state<AlbumsDeService[]>([]);
  let albumsServiceChargement = $state(false);
  let albumOuvertService = $state<{ album: Album; service: string } | null>(null);

  /**
   * 🔴 Un jeton par ouverture. Ces requêtes sont lentes (une recherche PUIS une
   * liste, par service) : sans lui, la réponse d'un artiste ouvert puis refermé
   * viendrait se poser sous le suivant.
   */
  let jetonService = 0;
  async function chargerAlbumsDeService(a: Artist) {
    const jeton = ++jetonService;
    albumsService = [];
    titresPhares = [];
    albumsServiceChargement = true;
    // Le magasin peut être VIDE dans le nouveau client : voir `statutsStreaming`.
    const statuts = await statutsStreaming($streamingServices, api.getStreamingServices, (x) => streamingServices.set(x));
    if (jeton !== jetonService) return;
    const services = servicesInterrogeables(statuts);
    if (!services.length || !a.name) {
      albumsServiceChargement = false;
      return;
    }
    albumsServiceChargement = true;
    const trouves = await albumsDeStreamingPourArtiste(a.name, services, {
      resoudreArtiste: async (svc, nom) =>
        (await api.federatedSearch(nom, [svc], 5))?.services?.[svc]?.artists ?? [],
      // #1343 — TOUTES les pages, pas seulement les cinquante premiers
      // albums : « Second Song » de Neil Young est à `offset=50` chez Qobuz.
      albumsDeLArtiste: (svc, id) => api.getStreamingArtistAlbumsAll(svc, id),
    });
    if (jeton !== jetonService) return;
    albumsService = trouves;
    albumsServiceChargement = false;
    // Étape 2 de #4330 : les titres phares, chez le premier service qui en rend
    // — l'identifiant de l'artiste vient d'être résolu pour ses albums.
    const titres = await chargerTitresPhares(trouves, (svc, id) => api.getStreamingArtistTopTracks(svc, id));
    if (jeton !== jetonService) return;
    titresPhares = titres;
  }

  /**
   * BIOGRAPHIE et TITRES PHARES de la fiche — étape 2 de #4330 (FabienM,
   * 17/09/2026). La biographie éditée dans la bibliothèque (`artist.bio`)
   * prime ; à défaut, celle que `GET /library/artists/{id}/bio` sait rendre
   * (l'ancienne interface l'affiche depuis longtemps).
   */
  let bioFiche = $state<string | null>(null);
  let titresPhares = $state<Track[]>([]);
  let jetonBio = 0;
  /*
   * Métadonnées (similaires, membres), crédits (instruments joués) et
   * enrichissement — portés de l'ancienne Bibliothèque, seule à les montrer.
   * 🔴 Même précaution que `chargerBio` : appelée depuis l'effet d'ouverture,
   * cette fonction n'écrit qu'APRÈS un `await` et ne relit aucun état.
   */
  let metaFiche = $state<ArtistMetadata | null>(null);
  let creditsFiche = $state<TrackCredit[]>([]);
  let enrichissement = $state(false);
  let jetonMeta = 0;
  async function chargerMetadonnees(id: number | null | undefined) {
    const jeton = ++jetonMeta;
    metaFiche = null;
    creditsFiche = [];
    if (id == null) return;
    const [m, c] = await Promise.all([
      api.getArtistMetadata(id).then(normaliserMetadonnees).catch(() => null),
      api.getArtistCredits(id).catch(() => [] as TrackCredit[]),
    ]);
    if (jeton !== jetonMeta) return;
    metaFiche = m;
    creditsFiche = c ?? [];
  }
  async function enrichir() {
    const a = ouvert;
    if (a?.id == null || enrichissement) return;
    enrichissement = true;
    try {
      const m = normaliserMetadonnees(await api.enrichArtist(a.id));
      metaFiche = { ...(metaFiche ?? {}), ...m } as ArtistMetadata;
      // La bio rapportée remplace l'absence de bio, jamais une bio éditée.
      const bio = bioDans(m, $langueCourante);
      if (bio && !a.bio?.trim()) bioFiche = bio;
      const cle = bilanEnrichissement(m);
      if (cle === 'library.noInfoFound') notifications.info($t(cle as any));
      else notifications.success($t(cle as any));
    } catch {
      notifications.error($t('library.enrichUnavailable' as any));
    } finally {
      enrichissement = false;
    }
  }
  function ouvrirSimilaire(nom: string) {
    const trouve = artistes.find((x) => x.name.toLowerCase() === nom.toLowerCase());
    if (trouve) void ouvrir(trouve);
    else { pendingSearchQuery.set(nom); activeView.set('search'); }
  }

  async function chargerBio(a: Artist) {
    const jeton = ++jetonBio;
    // 🔴 Une variable LOCALE, pas `bioFiche` relu : cette fonction part, dans
    // sa partie synchrone, de l'effet qui ouvre la fiche (`ouvrirId`). Relire
    // l'état qu'on vient d'écrire y abonnerait l'effet — boucle sans fin
    // (mesurée : le témoin écran de #3709 ne rendait plus la main).
    const locale = a.bio?.trim() || null;
    bioFiche = locale;
    if (locale || a.id == null) return;
    try {
      const r = await api.getArtistBio(a.id);
      if (jeton === jetonBio) bioFiche = r?.bio?.trim() || null;
    } catch {
      /* pas de biographie : le bloc ne s'affiche pas */
    }
  }

  function lireAlbumDeService(al: Album, service: string) {
    const zid = $currentZoneId;
    // 🔴 `source` va TOUJOURS avec `streaming_album_id` : seul, l'identifiant
    // n'est apparié par aucun service.
    if (zid == null || al.source_id == null) return;
    playAndSync(zid, { streaming_album_id: String(al.source_id), source: (al.source ?? service) as any })
      .catch(signalerEchecLecture);
  }

  /** Sans accents ni casse : « Éric » doit se ranger et se chercher comme « Eric ». */
  const plier = (s: string | null | undefined) =>
    (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /** Les artistes que la PORTÉE laisse passer — tous, sans portée. */
  const dansLaPortee = $derived(
    idsPortee == null ? artistes : artistes.filter((x) => x.id != null && idsPortee!.has(x.id)),
  );
  const artistesRecherche = $derived(dansLaPortee.filter(a => plier(a.name).includes(plier(q))));
  const affiches = $derived(artistesRecherche.filter(a => provenance == null ||
    [...(sourcesArtistes.get(a.id!) ?? [])].some(s => sourceCorrespond(s, provenance)))
    .sort((x, z) => plier(x.name).localeCompare(plier(z.name))));
  $effect(() => {
    onComptesSources?.({
      total: artistesRecherche.length,
      comptes: compterSources(artistesRecherche.map(a => sourcesArtistes.get(a.id!) ?? [])),
    });
  });

  /** Première lettre, chiffres et symboles rassemblés sous « # ». */
  function lettre(a: Artist): string {
    const c = plier(a.name).charAt(0).toUpperCase();
    return c >= 'A' && c <= 'Z' ? c : '#';
  }
  const ALPHABET = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
  const presentes = $derived(new Set(affiches.map(lettre)));

  let grilleEl = $state<HTMLElement | null>(null);
  function sauter(L: string) {
    grilleEl?.querySelector<HTMLElement>(`[data-lettre="${L}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function charger() {
    chargement = true;
    erreur = null;
    try {
      // La liste ENTIÈRE : `getArtists` plafonne à 100 par défaut, et une vue
      // d'artistes tronquée à 100 se lit comme une bibliothèque incomplète.
      artistes = await api.getAllArtists();
    } catch (e: any) {
      erreur = e?.message ?? $t('common.error' as any);
      artistes = [];
    }
    chargement = false;
  }

  async function ouvrir(a: Artist) {
    // AVANT de basculer : `{#if ouvert}` va retirer `grilleEl` du DOM, et une
    // position mesurée après coup vaudrait toujours zéro.
    saveDetailScroll(CLE_DEFILEMENT, () => grilleEl);
    // La CLÉ, pas l'artiste : `a` est un proxy `$state` et `history.state`
    // refuse les proxies. Voir l'en-tête de `lib/historiqueCoquille.ts`.
    // La MÊME fonction que l'écran qui ENVOIE ici (#1142) : deux littéraux
    // dans deux fichiers divergeraient, et la fiche empilerait une seconde
    // entrée par-dessus l'entrée composée.
    const cle = cleDetailArtiste(a.id);
    if (cle) ouvrirDetail(cle);
    ouvert = a;
    albums = [];
    albumsChargement = true;
    // Les services partent EN PARALLÈLE et sans bloquer : la bibliothèque
    // locale répond en un aller-retour, un service en deux. Les attendre
    // retarderait l'affichage de ce qu'on possède déjà.
    void chargerAlbumsDeService(a);
    void chargerBio(a);
    void chargerMetadonnees(a.id);
    try {
      albums = (await api.getArtistAlbums(a.id!)) ?? [];
    } catch {
      albums = [];
    }
    albumsChargement = false;
  }

  /**
   * « Toutes les pistes » et « Lecture aleatoire » de l'artiste — #1947.
   *
   * `lireArtiste`, ci-dessous, ne joue que le PREMIER album de l'artiste : la
   * vignette de la grille lance un album, pas une discographie. La fiche, elle,
   * n'avait aucun bouton de lecture. Les deux gestes que le client actuel
   * porte depuis longtemps (`playArtistLibrary`) n'existaient pas ici.
   *
   * L'aleatoire passe par le SERVEUR : `artist_id` figurait deja dans
   * `api.shuffleAll` sans aucun appelant. Il tire sur la discographie entiere,
   * la ou une liste chargee cote client s'arreterait a ce qui est affiche.
   */
  //
  // `contexte` dit au serveur CE QUE l'auditeur a demandé — ici un ARTISTE. Il
  // sait déduire album, playlist et piste du corps ; une discographie, non :
  // elle part en liste nue de `track_ids`. Sans cette annonce l'écoute
  // s'enregistrait sans contexte et retombait dans le repli « albums » de
  // « Continuer l'écoute », jamais sous le nom de l'artiste (#2442).
  let masseEnCours = $state(false);
  const gestesMasse = (zid: number, contexte?: Record<string, unknown>) => ({
    lire: (c: any) => playAndSync(zid, contexte ? { ...c, ...contexte } : c),
    enfiler: (c: any) => api.addToQueue(zid, c),
  });
  async function lirePistesSource(zid: number, a: Artist, pistes: Track[]) {
    const ids = pistes.flatMap(p => p.id == null ? [] : [p.id]);
    if (!ids.length) return 0;
    await playAndSync(zid, { track_ids: ids, context_type: 'artist', context_id: String(a.id) } as any);
    return ids.length;
  }
  async function lireToutArtiste(a: Artist) {
    const zid = $currentZoneId;
    if (zid == null || a.id == null) {
      notifications.error($t('v2.art.noZone' as any));
      return;
    }
    masseEnCours = true;
    try {
      const pistes = (await api.getArtistTracks(a.id)) ?? [];
      const selection = pistes.filter(p => dansSource(p, provenance));
      const n = provenance != null
        ? await lirePistesSource(zid, a, selection)
        : await lireListe(
            pistes,
            gestesMasse(zid, { context_type: 'artist', context_id: String(a.id) }),
          );
      if (!n) notifications.error($t('library.noTracks' as any));
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
    masseEnCours = false;
  }
  async function lireArtisteAleatoire(a: Artist) {
    const zid = $currentZoneId;
    if (zid == null || a.id == null) {
      notifications.error($t('v2.art.noZone' as any));
      return;
    }
    masseEnCours = true;
    try {
      if (provenance != null) {
        const pistes = ((await api.getArtistTracks(a.id)) ?? []).filter(p => dansSource(p, provenance));
        if (!await lirePistesSource(zid, a, melangee(pistes))) notifications.error($t('library.noTracks' as any));
      } else {
        const r = await api.shuffleAll(zid, { artist_id: a.id });
        if (!r.track_count) notifications.error($t('library.noTracks' as any));
      }
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
    masseEnCours = false;
  }
  /**
   * « Écouter le best of » et « Radio de l'artiste » — PORTÉS depuis la fiche
   * de service (#1356, arbitrage de Bertrand du 20/09/2026 : « mêmes actions,
   * sans en perdre »).
   *
   * 🔴 MESURÉ AVANT D'ÊTRE PORTÉ, et c'est la règle de #1231 : un bouton
   * visible qui ne fait rien se lit comme une panne. Ces deux gestes n'ont de
   * cible que si un service a rendu des titres phares pour cet artiste. La
   * fiche les charge DÉJÀ (`chargerTitresPhares`, étape 2 de #4330) et les
   * montre dans `BioEtTitresPhares` ; chaque piste y est estampillée de sa
   * source, donc `corpsDeLecture` sait la désigner. Il n'y a rien à inventer :
   * la même liste, les mêmes deux gestes que la fiche de service.
   *
   * Donc la MÊME condition qu'elle : pas de titres phares, pas de boutons.
   */
  async function lireTitresPhares(aleatoire: boolean) {
    const zid = $currentZoneId;
    if (zid == null) {
      notifications.error($t('v2.art.noZone' as any));
      return;
    }
    if (!titresPhares.length) return;
    masseEnCours = true;
    try {
      const gestes = gestesMasse(zid);
      const n = aleatoire
        ? await lireListeAleatoire(titresPhares, gestes)
        : await lireListe(titresPhares, gestes);
      // Zéro veut dire « rien n'était désignable » : l'écran doit le dire,
      // sans quoi le bouton paraîtrait mort.
      if (!n) notifications.error($t('v2.fas.empty' as any));
    } catch (e: any) {
      notifications.error(e?.message ?? $t('v2.fas.empty' as any));
    }
    masseEnCours = false;
  }

  async function lireArtiste(a: Artist) {
    const zid = $currentZoneId;
    if (zid == null) {
      notifications.error($t('v2.art.noZone' as any));
      return;
    }
    try {
      const liste = (await api.getArtistAlbums(a.id!)) ?? [];
      const premier = liste.find((x) => x?.id != null && dansSource(x, provenance));
      if (!premier) {
        notifications.error($t('v2.art.noAlbum' as any));
        return;
      }
      await playAndSync(zid, { album_id: premier.id! });
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
  }

  function lireAlbum(al: Album) {
    const zid = $currentZoneId;
    if (zid == null || al.id == null) return;
    playAndSync(zid, { album_id: al.id }).catch(signalerEchecLecture);
  }

  /** Une vignette de la discographie commune désigne un exemplaire : la
   *  bibliothèque s'ouvre par son identifiant, un service par sa paire
   *  service + `source_id` (#3709). */
  function ouvrirExemplaire(ex: Exemplaire) {
    if (ex.source === BIBLIOTHEQUE) albumOuvert = ex.album;
    else albumOuvertService = { album: ex.album, service: ex.source };
  }
  function lireExemplaire(ex: Exemplaire) {
    if (ex.source === BIBLIOTHEQUE) lireAlbum(ex.album);
    else lireAlbumDeService(ex.album, ex.source);
  }

  /**
   * Une à deux initiales, LETTRES ET CHIFFRES seulement.
   *
   * Sans le filtre, « Accentus - Laurence E. » donnait « A- » : le tiret est
   * un mot pour `split`, sa première lettre est le tiret lui-même. Constaté
   * sur capture le 02/09/2026, avec « A- » débordant de son cercle.
   */
  const initiales = (n: string | null | undefined) =>
    (n ?? '')
      .split(/\s+/)
      .map((m) => m.replace(/[^\p{L}\p{N}]/gu, '').charAt(0))
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();

  onMount(() => {
    void charger();
  });
</script>

<!--
  « Enrichir la biographie » — rendu DANS le bloc de la biographie (#1356).

  Bertrand, 20/09/2026 : le bouton flottait seul au milieu de la fiche, en
  tête d'une section `À propos` qui liste les artistes proches, les membres et
  les instruments — rien qui le concerne. C'est sur la biographie qu'il agit,
  il se lit sous elle.

  Un EXTRAIT plutôt qu'un bloc recopié : `BioEtTitresPhares` est le bloc
  commun aux deux fiches (#4330), et la fiche de service n'a pas ce geste —
  elle n'a pas d'enregistrement local à enrichir. Elle ne passe donc rien, et
  ne montre rien.
-->
{#snippet enrichirBio()}
  <button class="fab creux" onclick={enrichir} disabled={enrichissement}>
    {enrichissement ? '…' : $t((bioFiche ? 'library.reEnrich' : 'library.enrichBio') as any)}
  </button>
{/snippet}

{#if ouvert}
  {@const artiste = ouvert}
  <!--
    🔴 UN SEUL CONTENEUR POUR TOUTE LA FICHE — #1356.

    `LibraryV2` monte cet écran dans `.body{display:flex}`. L'en-tête et le
    corps y étaient des FRÈRES DIRECTS : le navigateur en faisait deux
    COLONNES. L'en-tête prenait la gauche, et les titres phares, coincés dans
    ce qui restait, perdaient leurs colonnes Canaux / BPM / Genre / Qualité
    derrière une barre de défilement horizontale (captures de Bertrand,
    20/09/2026). La fiche de service n'avait jamais eu ce défaut : elle
    enveloppe tout dans sa `<section class="v2-fas">`.
  -->
  <div class="fiche-pleine">
    <EnTeteArtiste
      nom={artiste.name}
      provenance={$t('library.title' as any)}
      imagePath={artiste.image_path}
      initiales={initiales(artiste.name)}
      sousTitre={`${comptesFiche?.total ?? albums.length} ${$t('v2.art.albums' as any)}`}
      onRetour={retourFiche}>
      {#snippet actions()}
        <button class="fab" onclick={() => lireToutArtiste(artiste)} disabled={masseEnCours}
          title={$t('library.playAllArtist' as any)}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>{$t('library.playAllArtist' as any)}
        </button>
        <button class="fab creux" onclick={() => lireArtisteAleatoire(artiste)} disabled={masseEnCours}
          title={$t('library.shuffleArtist' as any)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>{$t('library.shuffleArtist' as any)}
        </button>
        <!-- Les deux gestes PORTÉS de la fiche de service (#1356). Ils ne
             s'affichent qu'avec des titres phares à jouer : voir
             `lireTitresPhares`. -->
        {#if titresPhares.length}
          <button class="fab creux" onclick={() => lireTitresPhares(false)} disabled={masseEnCours}>
            {$t('v2.fas.bestOf' as any)}
          </button>
          <button class="fab creux" onclick={() => lireTitresPhares(true)} disabled={masseEnCours}>
            {$t('v2.fas.radio' as any)}
          </button>
        {/if}
        {#if artiste.id != null}
          <button class="fab creux" onclick={() => (editionComplete = artiste)} title={$t('library.editArtist' as any)}>
            {$t('common.edit' as any)}
          </button>
          <!-- ÉTIQUETTES : le geste que la VIGNETTE avait et que la fiche
               n'avait pas (#1357). Même panneau, même cible. -->
          <button class="fab creux" onclick={() => (etiquettesArtiste = artiste)}
            aria-haspopup="dialog" title={$t('v2.cover.tags' as any)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l8.58-8.58a1 1 0 0 0 0-1.42z"/><circle cx="6.5" cy="6.5" r="1.2" fill="currentColor"/></svg>
            {$t('v2.cover.tags' as any)}
          </button>
          {#if artiste.image_path}
            <ReportButton entity="artist_image" entityId={artiste.id}
              mbid={artiste.musicbrainz_id ?? undefined}
              reasons={['wrong_entity', 'incorrect', 'poor_quality', 'offensive']} compact />
          {/if}
          {#if bioFiche}
            <ReportButton entity="bio" entityId={artiste.id}
              mbid={artiste.musicbrainz_id ?? undefined}
              reasons={['incorrect', 'wrong_entity', 'offensive']} />
          {/if}
        {/if}
      {/snippet}
    </EnTeteArtiste>

  <!-- UN seul conteneur défilant pour la fiche. La grille est COMMUNE à la
       bibliothèque et aux services — #4330 (FabienM, fil 1823), qui remplace
       les sections séparées par service de #3709. -->
  <div class="corps">
    <BioEtTitresPhares bio={bioFiche} titres={titresPhares} cle={artiste.id}
      actionsBio={artiste.id != null ? enrichirBio : undefined} />
    <!-- 🔴 « À propos » ne s'ouvre QUE si elle a quelque chose à dire (#1356).
         Le bouton d'enrichissement l'a quittée pour rejoindre la biographie :
         sans cette garde, elle resterait à l'écran vide, avec sa marge, entre
         les titres phares et la discographie. Vérifié au DOM monté. -->
    {#if artiste.id != null && (metaFiche?.similar_artists?.length || metaFiche?.members?.length || creditsFiche.length)}
      <section class="apropos">
        {#if metaFiche?.similar_artists?.length}
          <h3>{$t('artist.similarArtists' as any)}</h3>
          <div class="puces">
            {#each metaFiche.similar_artists as sa (sa.name)}
              <button class="puce" title={sa.reason} onclick={() => ouvrirSimilaire(sa.name)}>{sa.name}</button>
            {/each}
          </div>
        {/if}
        {#if metaFiche?.members?.length}
          <h3>{$t('artist.members' as any)}</h3>
          <ul class="membres">
            {#each metaFiche.members as m (m.name)}<li><b>{m.name}</b> {m.role}</li>{/each}
          </ul>
        {/if}
        {#if creditsFiche.length}
          <h3>{$t('artist.credits' as any)}</h3>
          <div class="puces">
            {#each uniqueInstruments(creditsFiche) as instr (instr)}<span class="puce fixe">{instr}</span>{/each}
          </div>
        {/if}
      </section>
    {/if}
    {#if albumsChargement}
      <div class="etat">{$t('common.loading' as any)}</div>
    {:else if !albums.length && !albumsService.length && !albumsServiceChargement}
      <div class="etat">{$t('v2.art.noAlbum' as any)}</div>
    {:else}
      <!-- Le filtre « Source » s'applique DANS la grille commune : le poser
           sur la seule bibliothèque cachait tous les services (#4330). -->
      <DiscographieCommune locaux={albums} services={albumsService}
        servicesEnCharge={albumsServiceChargement} {provenance}
        onComptesProvenance={(c) => { comptesFiche = c; onComptesFiche?.(c); }}
        onOuvrir={ouvrirExemplaire} onLire={lireExemplaire} />
    {/if}
  </div>

  {#if albumOuvert}
    <AlbumDetailV2 album={albumOuvert} depot={null} onClose={() => (albumOuvert = null)} />
  {/if}

  <!-- 🔴 `service` est passé AVEC l'album : la fiche n'apparie un album de
       streaming que sur la paire service + `source_id`. Sans lui, elle
       resterait sur « Chargement… » indéfiniment. -->
  {#if albumOuvertService}
    {@const fiche = albumOuvertService}
    <AlbumDetailV2 album={fiche.album} service={fiche.service}
      onClose={() => (albumOuvertService = null)} />
  {/if}
  </div>

{:else if chargement || (provenance != null && sourcesEnCharge)}
  <div class="etat">{$t('common.loading' as any)}</div>
{:else if provenance != null && erreurSources}
  <div class="etat err">{erreurSources}</div>
{:else if erreur}
  <div class="etat err">{erreur}</div>
{:else if !affiches.length}
  <div class="etat">{q ? $t('common.noResult' as any) : $t('library.noArtists' as any)}</div>
{:else}
  <div class="zone">
    <div class="grille artistes" bind:this={grilleEl}>
      {#each affiches as a, i (a.id)}
        <!-- `data-lettre` sur la PREMIÈRE carte de chaque lettre seulement :
             le rail cherche une ancre, et la poser sur toutes ferait viser la
             dernière au lieu de la première. -->
        {@const premiere = i === 0 || lettre(affiches[i - 1]) !== lettre(a)}
        <div class="carte" data-lettre={premiere ? lettre(a) : undefined}>
          <div class="cv">
            <PochetteActions
              favori={a.id != null ? { artistId: a.id } : null}
              etiquettes={a.id != null ? { itemType: 'artist', itemId: a.id } : null}
              onEditer={a.id != null ? () => (enEdition = a) : null}
              onLire={() => lireArtiste(a)}
              onOuvrir={() => ouvrirDepuisGrille(a)}
              nom={a.name}
            >
              <AlbumArt coverPath={a.image_path} size={0} alt={a.name}
                fallbackInitials={initiales(a.name)} />
            </PochetteActions>
          </div>
          <!-- Avatar et nom, rien d'autre — comme l'écran actuel.
               `/library/artists` ne rend PAS de nombre d'albums (vérifié sur le
               .18 le 02/09/2026 : bio, discogs_id, id, image_path,
               image_source, musicbrainz_id, name, sort_name). L'afficher
               demanderait une requête par artiste, et en inventer un serait
               pire que de n'en montrer aucun. -->
          <button class="meta centre" onclick={() => ouvrirDepuisGrille(a)}>
            <span class="ct" title={a.name}>{a.name}</span>
          </button>
        </div>
      {/each}
    </div>

    <!-- Rail A–Z, comme l'écran actuel. Les lettres absentes restent visibles
         mais inertes : les faire disparaître ferait bouger le rail à chaque
         recherche. -->
    <nav class="rail" aria-label="A–Z">
      {#each ALPHABET as L (L)}
        <button class:chaud={presentes.has(L)} disabled={!presentes.has(L)}
          onclick={() => sauter(L)}>{L}</button>
      {/each}
    </nav>
  </div>
{/if}

{#if enEdition}
  {@const cible = enEdition}
  <RenommerModale
    titre={$t('v2.edit.artist' as any)}
    nom={cible.name}
    description={cible.bio ?? ''}
    enregistrer={async (v) => {
      // `PUT /library/artists/{id}` prend `bio`, pas `description` : la modale
      // est générique, la traduction se fait ici.
      await api.updateArtist(cible.id!, { name: v.name, bio: v.description });
      artistes = artistes.map((x) =>
        x.id === cible.id ? { ...x, name: v.name, bio: v.description } : x,
      );
    }}
    onClose={() => (enEdition = null)}
  />
{/if}

{#if editionComplete}
  <ArtistEditModal
    artist={editionComplete}
    onClose={() => (editionComplete = null)}
    onSaved={(maj) => {
      if (ouvert?.id === maj.id) ouvert = maj;
      artistes = artistes.map((x) => (x.id === maj.id ? maj : x));
      editionComplete = null;
    }}
  />
{/if}

{#if etiquettesArtiste?.id != null}
  {@const cibleArtiste = { itemType: 'artist', itemId: etiquettesArtiste.id }}
  {@const nomArtiste = etiquettesArtiste.name}
  {#await import('./EtiquettesPanneau.svelte') then m}
    <m.default cible={cibleArtiste} nom={nomArtiste}
      onClose={() => (etiquettesArtiste = null)} />
  {/await}
{/if}

<style>
  .zone { display: flex; flex: 1; min-height: 0; }
  .grille {
    flex: 1;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
    gap: 22px 18px;
    align-content: start;
    padding: 8px 30px 40px;
  }
  /* La fiche d'un artiste défile d'un SEUL bloc (#3709) ; sa grille est
     `DiscographieCommune` (#4330). */
  .corps { flex: 1; overflow-y: auto; padding: 0 0 40px; min-height: 0; }
  .corps .etat { padding: 22px 0; }
  .carte {
    display: flex;
    flex-direction: column;
    /* Les cartes hors écran ne sont pas rendues : cinq boutons par pochette
       font une trentaine de nœuds, et une bibliothèque peut compter des
       milliers d'artistes. */
    content-visibility: auto;
    contain-intrinsic-size: auto 210px;
  }
  .cv { position: relative; aspect-ratio: 1; border-radius: var(--v2-r-card); overflow: hidden; }
  /*
    Pochettes d'artiste CARRÉES, comme les albums — décision de Bertrand du
    03/09/2026, sur trois mesures :

     1. 1651 artistes sur son serveur, ZÉRO image. La forme ne portait donc
        qu'une pastille d'initiales, jamais un portrait.
     2. Les images d'artistes des services sont déjà carrées — celle de John
        Coltrane chez Qobuz fait 550×550. Un cercle en jetait 21 % (1 − π/4),
        pris sur les bords, là où se trouvent les visages d'un groupe.
     3. Les vignettes d'artiste sont enveloppées dans `PochetteActions`, dont
        le cadre est CARRÉ : les quatre icônes de coin tombaient dans le vide
        autour du disque, sur du fond plutôt que sur l'image.

    Ce qui distingue encore une carte d'artiste d'une carte d'album, c'est le
    nom CENTRÉ — les albums alignent le leur à gauche.

    La forme se décide à DEUX endroits, et c'est le piège : ce rayon-ci, et le
    drapeau `round` d'`AlbumArt`, qui pose un `border-radius: 50%` sur l'image
    elle-même. Le 03/09/2026 seul le premier avait été changé — le cadre était
    carré, le disque à l'intérieur restait rond, et c'est ce que Bertrand
    voyait encore. Les deux appels à `AlbumArt` de cet écran (vignette de
    grille et en-tête de fiche) ne passent donc plus `round`.
  */
  .cv :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  /*
    Les initiales sont CENTRÉES dans leur vignette et ne la débordent pas.
    `AlbumArt` les dimensionne à 32 % de la largeur du conteneur, ce qui
    convient à une seule lettre : à deux, plus l'interlettrage, le mot dépassait
    et le rognage en montrait un morceau décalé — c'est ce que montrait la
    capture de Bertrand. On resserre, et on interdit le retour à la ligne, qui
    décentrerait verticalement.
  */
  .cv :global(.placeholder-initials) {
    font-size: 26cqw;
    letter-spacing: 0;
    white-space: nowrap;
    text-align: center;
  }
  .meta {
    display: block; width: 100%; border: 0; background: transparent; padding: 0;
    text-align: left; color: inherit; font: inherit; cursor: pointer;
  }
  .meta.centre { text-align: center; }
  .ct {
    display: block; margin-top: 9px;
    font: 600 12.5px var(--v2-sans); line-height: 1.25;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ca {
    display: block; margin-top: 2px;
    font: 11px var(--v2-mono); color: var(--v2-txt3);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .etat { padding: 30px; color: var(--v2-txt3); font-size: 13.5px; }
  .etat.err { color: var(--v2-danger); }

  .rail {
    display: flex; flex-direction: column; gap: 1px;
    padding: 8px 10px 8px 2px; align-self: start;
    position: sticky; top: 0;
  }
  .rail button {
    border: 0; background: transparent; cursor: pointer;
    font: 600 10px var(--v2-mono); color: var(--v2-txt3);
    padding: 1px 4px; border-radius: 4px; line-height: 1.35;
  }
  .rail button.chaud { color: var(--v2-txt2); }
  .rail button.chaud:hover { color: var(--v2-on-acc); background: var(--v2-acc1); }
  .rail button:disabled { opacity: .35; cursor: default; }

  /*
    🔴 LA FICHE EST UNE COLONNE, PAS DEUX — #1356.

    `LibraryV2` monte cet écran dans `.body{display:flex}`. Sans ce conteneur,
    l'en-tête et le corps sont deux ITEMS de ce flex, donc deux COLONNES : les
    titres phares perdaient les leurs (Canaux, BPM, Genre, Qualité) derrière
    une barre de défilement horizontale. `min-width:0` va avec : sans lui, un
    tableau large repousserait la colonne au lieu de défiler.
  */
  .fiche-pleine {
    flex: 1; min-width: 0; min-height: 0;
    display: flex; flex-direction: column;
    padding: 0 30px;
  }
  .fab{display:inline-flex; align-items:center; gap:8px; height:38px; padding:0 16px;
    border:0; border-radius:var(--v2-r-pill, 999px); cursor:pointer;
    font:700 13px var(--v2-sans, inherit); color:var(--v2-on-acc, #14110a);
    background:linear-gradient(135deg, var(--v2-acc1, #d9a441), var(--v2-acc2, #b8862b))}
  .fab.creux{background:transparent; color:var(--v2-txt, inherit);
    border:1px solid var(--v2-line2, rgba(255,255,255,.16))}
  .fab.creux:hover:not(:disabled){border-color:var(--v2-acc2, #b8862b); color:var(--v2-acc-tint, #e6c176)}
  .fab:disabled{opacity:.5; cursor:default}
  .fab svg{width:15px; height:15px}
  .apropos{margin:0 0 18px; display:flex; flex-direction:column; gap:8px; align-items:flex-start}
  .apropos h3{margin:8px 0 0; font:600 11px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .puces{display:flex; flex-wrap:wrap; gap:6px}
  .puce{padding:4px 10px; border-radius:999px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); font:12px var(--v2-sans); cursor:pointer}
  .puce:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .puce.fixe{cursor:default}
  .membres{margin:0; padding-left:18px; color:var(--v2-txt2); font-size:13px}
</style>
