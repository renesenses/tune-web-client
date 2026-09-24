<script lang="ts">
  /**
   * Fiche album du nouveau client (direction Levente). Ouvre par-dessus la
   * grille : pochette + métadonnées + liste de pistes jouables. Détail
   * technique (fréquence/profondeur) à l'Expert, comme partout ailleurs.
   */
  import { get } from 'svelte/store';
  import * as api from '../../lib/api';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { mentionAussiSur, type AussiSur } from '../../lib/aussiSur';
  import { t as tr } from '../../lib/i18n';
  import { formatAnneeAlbum } from '../../lib/formats';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  // Un échec de lecture DOIT se voir : ces appels finissaient tous par un
  // `.catch(() => {})` (#3732). Le message du serveur — qui nomme l'appareil
  // manquant — n'atteignait jamais l'écran.
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import { currentTrackId } from '../../lib/stores/nowPlaying';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { getQualityTier, formatDuration,  errText } from '../../lib/utils';
  import { qualiteEnTeteAlbum } from '../../lib/qualiteEnTeteAlbum';
  import { pochettesDePisteDistinctes } from '../../lib/pochetteDePisteDistincte';
  import {
    focusRestreint, pistesAuxRangs, rangDansLAlbum, rangsDuFocus, type FocusArtiste,
  } from '../../lib/focusArtiste';
  import type { Album, Track } from '../../lib/types';
  import DisponibiliteUpnp from './DisponibiliteUpnp.svelte';
  import AlbumArt from '../partages/AlbumArt.svelte';
import AlbumRating from '../partages/AlbumRating.svelte';
import ReportButton from '../partages/ReportButton.svelte';
import { libelleQualite, autreAlbumMeilleur } from '../../lib/meilleureQualite';
  import ClampedText from '../partages/ClampedText.svelte';
  import ListePistesV2 from './ListePistesV2.svelte';
  import PastilleCompilation from './PastilleCompilation.svelte';
  import { corpsDeLecture, corpsDeFileListe } from '../../lib/pisteFile';
  import { queuePosition } from '../../lib/stores/queue';
  import { notifications } from '../../lib/stores/notifications';
  import { favoriteAlbumIds, favoriteStreamingKeys } from '../../lib/stores/profile';
  import { basculerFavoriLocal } from '../../lib/favorisLocaux';
  import { favKeyOf, refFavoriDeFiche, toggleStreamingFavorite } from '../../lib/streamingFavorites';
  import { corpsLecture, pistesAlbumDistant, type DepotDistant } from '../../lib/tuneRemote';
  import { cibleDeService, type CibleEtiquette } from '../../lib/cibleEtiquette';
  import { tip } from '../../lib/tooltip';
  import { afficherDynamicRange } from '../../lib/dynamicRange';
  import { corpsDeLectureBandcamp } from '../../lib/bandcampLecture';
  import { activeView, pendingLibraryAlbum, vueDeRetour, gestesNavigationService } from '../../lib/stores/navigation';
  import { destinationArtiste } from '../../lib/routageArtiste';
  import { ouvrirArtisteDepuis } from '../../lib/ouvrirArtisteDepuis';
  import { cleDetailAlbum } from '../../lib/cleDetailAlbum';
  import { detailOuvert, fermerDetail } from '../../lib/historiqueCoquille';

  import { dossierDeLAlbum } from '../../lib/dossierAlbum';
  import { ouvrirLeRepertoire } from '../../lib/stores/repertoireCible';
  import { chargerCollectionsCibles, entreesAjoutCollection, type CollectionCible } from '../../lib/albumVersCollection';
  import { styleMenuAncre } from '../../lib/ancrageMenu';
  import { portail } from '../../lib/portail';
  // `depot` : la fiche d'un album vivant sur un AUTRE serveur Tune. Les
  // identifiants n'y sont pas les notres — pistes et lecture doivent passer
  // par lui, sans quoi on jouerait un tout autre morceau du meme numero.
  // `service` : la fiche d'un album de STREAMING (Qobuz, Tidal…). Il n'a pas
  // d'identifiant local — son identite est `source_id` AVEC le service, et le
  // serveur n'apparie que la paire. Meme forme que `depot` : une origine qui
  // change ou l'on va chercher les pistes et comment on les joue.
  // `bandcamp` : la fiche d'un album BANDCAMP. Quatrieme origine, et la plus
  // etrangere des quatre — un album Bandcamp n'a ni identifiant local, ni
  // `source_id` de service : il est designe par l'URL de sa page publique, et
  // ses pistes se lisent par leur `stream_url`. Demande par Bertrand le
  // 05/09/2026 : « Click sur un album doit ouvrir l'album ! ». Jusque-la, un
  // clic LANCAIT l'extrait, sans jamais montrer ce que l'album contenait.
  let { album, depot = null, service = null, bandcamp = null, artisteFocus = null, onClose }:
    { album: Album; depot?: DepotDistant | null; service?: string | null;
      bandcamp?: string | null; artisteFocus?: FocusArtiste | null;
      onClose: () => void } = $props();

  /** Identifiant distant de l'album, quand il vient d'un service. */
  const sidDistant = $derived(service ? ((album as any).source_id ?? null) : null);

  /* ══════════════════════════════════════════════════════════════════════
     L'EN-TÊTE D'UN ALBUM DE SERVICE, COMPLÉTÉ À LA SOURCE — #1342.

     FabienM, fil forum 1859 (20/09/2026), point 4 : « Lien vers l'album depuis
     l'action "Aller à l'album" renvoie à une page incomplète […] Il manque sur
     la figure 2 la vignette de l'album et le nom de l'artiste ».

     🔴 LA CAUSE N'EST PAS DANS L'APPELANT, ELLE EST ICI. Une fiche d'album de
     service est montée avec ce que l'appelant a bien voulu mettre dans la
     charge utile, et CETTE FICHE NE RELIT JAMAIS L'ALBUM : pour un service
     elle ne demande que `getStreamingAlbumTracks`. D'où des pistes complètes
     sous un en-tête vide. Chaque appelant qui oublie un champ rouvre le même
     trou — #1114 l'avait bouché pour « Lecture en cours » en ajoutant
     `pochette` à la charge, et le menu « … » d'une piste, second appelant,
     est resté dehors treize jours.

     🔴 LA ROUTE EXISTE, ET ELLE REND TOUT. Mesuré sur le .18 le 20/09/2026 :

       GET /api/v1/streaming/qobuz/albums/atua1kxxk4tis
       {"artist_id":"35865","artist_name":"Neil Young",
        "cover_path":"https://static.qobuz.com/images/covers/is/4t/…_600.jpg",
        "source_id":"atua1kxxk4tis","title":"Second Song","year":2026,
        "track_count":1,"quality":{…},"released_at":1786053600}

     Le ticket laissait cette voie ouverte sans l'avoir vérifiée ; elle l'est.

     ⚠️ ON NE DEMANDE QUE CE QUI MANQUE. Un en-tête déjà complet (le cas de
     tous les écrans qui passent l'album entier) ne déclenche aucun appel : ce
     filet coûte une requête aux seules fiches qui s'ouvriraient nues.

     ⚠️ ET IL NE REMPLACE RIEN. Les champs portés par l'appelant priment, y
     compris sur la réponse du service : un écran qui sait mieux (une édition
     précise, un titre nettoyé) garde le dernier mot.
     ══════════════════════════════════════════════════════════════════════ */

  /** Ce que le service sait de cet album, quand il a fallu le lui demander. */
  let detailService = $state<Record<string, unknown> | null>(null);

  const vide = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '');

  /** L'en-tête a-t-il de quoi se rendre — pochette, artiste, année ? */
  const enTeteComplet = (a: any) =>
    !vide(a?.cover_path) && !vide(a?.artist_name) && (a?.year != null || !vide(a?.release_date));

  $effect(() => {
    const svc = service, sid = sidDistant;
    const manque = !enTeteComplet(album);
    detailService = null;
    if (!svc || !sid || !manque) return;
    let perime = false;
    api.getStreamingAlbum(svc, String(sid))
      .then((d) => { if (!perime) detailService = d as unknown as Record<string, unknown>; })
      // Un échec laisse la fiche exactement comme avant : pas d'erreur à
      // l'écran pour un complément, la liste des pistes vaut le déplacement.
      .catch(() => {});
    return () => { perime = true; };
  });

  /**
   * L'album TEL QU'IL S'AFFICHE : celui qu'on a reçu, ses trous comblés.
   *
   * Seuls les champs d'EN-TÊTE sont repris, et seulement s'ils sont vides —
   * le reste de la fiche (lecture, étiquettes, file d'attente) continue de
   * travailler sur l'objet d'origine, dont l'identité ne change pas.
   */
  const albumAffiche = $derived.by(() => {
    const d = detailService;
    if (!d) return album;
    const fusion: any = { ...(album as any) };
    for (const cle of ['cover_path', 'artist_name', 'artist_id', 'year', 'release_date', 'original_year', 'original_date']) {
      if (vide(fusion[cle])) fusion[cle] = (d as any)[cle] ?? null;
    }
    return fusion as Album;
  });

  /**
   * ÉTIQUETER L'ALBUM DEPUIS SA FICHE.
   *
   * Chaque LIGNE de piste avait son bouton d'étiquettes (`PisteActions`),
   * chaque VIGNETTE d'album aussi (`PochetteActions`) — la fiche de l'album,
   * elle, n'en avait aucun. Cinq gestes dans sa barre d'actions, et pas un
   * pour ranger le disque qu'on est justement en train de regarder.
   *
   * La désignation est celle que `lib/cibleEtiquette` tient déjà pour tout le
   * reste du client, et on n'en écrit pas une seconde :
   *
   *  - bibliothèque (y compris un serveur UPnP intégré) → l'identifiant ;
   *  - service, et Bandcamp → la paire `source` + `source_id`. `StreamingV2`
   *    donne à la fiche Bandcamp `source: '__bandcamp__'` (la clé d'ONGLET)
   *    et `source_id: <url>` ; `cibleDeService` la retraduit en `bandcamp`,
   *    la clé du serveur (#1409 — ce commentaire disait « 'bandcamp' »,
   *    et l'étiquette partait sous `__bandcamp__`) —
   *    le serveur ne valide QUE l'`item_type` (`TAGGABLE_ITEM_TYPES`), la
   *    source est une chaîne libre, et `tags.rs` cite Bandcamp en exemple.
   *
   * `source` et `source_id` retombent sur les propriétés `service` / `bandcamp`
   * quand l'album ne les porte pas lui-même : la fiche d'un service ouverte
   * depuis la Recherche reçoit parfois l'objet nu du service, sans sa source.
   *
   * 🔴 UN cas reste NON étiquetable, et le bouton disparaît alors : le DÉPÔT
   * DISTANT. Son `album.id` est l'identifiant d'un AUTRE serveur Tune ; posé
   * sur `/tags/{id}/items`, il étiquetterait l'album de la bibliothèque locale
   * qui porte ce numéro — un inconnu. C'est exactement la garde que
   * `LibraryV2` applique déjà à ses vignettes (`depot || a.id == null`).
   */
  const cibleEtiquettes = $derived<CibleEtiquette | null>(
    depot
      ? null
      : album.id != null
      ? { itemType: 'album', itemId: album.id }
      : cibleDeService('album', {
          ...(album as any),
          source: (album as any).source ?? service ?? (bandcamp ? 'bandcamp' : null),
          source_id: (album as any).source_id ?? bandcamp ?? null,
        }),
  );
  /** Le panneau partagé — celui des vignettes, pas une seconde copie. */
  let etiquettesOuvertes = $state(false);

  /* ══════════════════════════════════════════════════════════════════════
     « AJOUTER À UNE COLLECTION » — réunion du 23/09/2026.

     La fiche avait sept boutons et aucun pour ranger l'album dans un dossier
     de « Collections » : le geste n'existait que sur la VIGNETTE de la
     Bibliothèque (#1222), par le menu du coin bas-gauche. Le geste est le
     même — `lib/albumVersCollection`, une seule implémentation — et la garde
     aussi : un album de la BIBLIOTHÈQUE (`album.id != null && !depot`),
     comme le bloc local ci-dessous. Un dépôt distant porte le numéro d'un
     AUTRE serveur ; un album de service n'en a pas.

     Les collections sont RELUES à chaque ouverture du menu : une collection
     créée entre-temps doit apparaître, et `album_ids` dire « il y est déjà ».
     Le panneau est `position:fixed` et porté à la racine (`use:portail`),
     posé par `styleMenuAncre` : la fiche défile, un panneau `absolute` y
     serait rogné — voir `lib/ancrageMenu`.
     ══════════════════════════════════════════════════════════════════════ */
  const LARGEUR_MENU_COLLECTION = 240;
  let collectionsCibles = $state<CollectionCible[]>([]);
  let menuCollectionOuvert = $state(false);
  let ancreCollection = $state<{ top: number; bottom: number; right: number } | null>(null);
  const entreesCollection = $derived(
    depot || album.id == null
      ? []
      : entreesAjoutCollection(collectionsCibles, album.id, (k) => $tr(k as any), (relues) => (collectionsCibles = relues)),
  );
  async function basculerMenuCollection(e: MouseEvent) {
    e.stopPropagation();
    if (menuCollectionOuvert) { menuCollectionOuvert = false; return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    ancreCollection = { top: r.top, bottom: r.bottom, right: r.right };
    collectionsCibles = await chargerCollectionsCibles();
    menuCollectionOuvert = true;
  }
  function fermerMenuCollection() { menuCollectionOuvert = false; }
  function auClavierCollection(e: KeyboardEvent) {
    if (e.key === 'Escape') menuCollectionOuvert = false;
  }
  function choisirCollection(e: MouseEvent, faire: () => void) {
    e.stopPropagation();
    menuCollectionOuvert = false;
    faire();
  }
  /** Aucune collection : on mène à l'écran qui sait en créer. La fiche se
   *  referme AVANT de router, comme `allerArtiste`. */
  function allerCollections(e: MouseEvent) {
    e.stopPropagation();
    menuCollectionOuvert = false;
    quitterLaFiche();
    activeView.set('collections');
  }

  let tracks = $state<Track[]>([]);
  /** #862 — au moins une piste est découpée depuis une image + feuille CUE. */
  const depuisCue = $derived(tracks.some((t) => !!t.cue_media_path));

  /* ══════════════════════════════════════════════════════════════════════
     LE FOCUS PAR ARTISTE — #4767.

     Ouverte depuis « Compilations » ou « Apparitions » de la page artiste, la
     fiche ne montre que les titres de cet artiste, sous une pastille qui le
     dit et qui rend l'album entier. Modèle : la capture Roon « Affichage des
     morceaux interprétés par … » de FabienM (fil 1875).

     🔴 Le focus ne change QUE ce qui est affiché. L'en-tête (compte de
     pistes, durée, qualité, dossier, pochettes), « Aléatoire » et la file
     continuent de parler de l'ALBUM — c'est un album qu'on regarde, pas une
     sélection. Ce que le focus doit tenir, en revanche, c'est le rang : le
     serveur interprète `start_index` sur l'album ENTIER, donc « lire à partir
     d'ici » passe par `rangDansLAlbum`. Sans cette traduction, cliquer la
     2ᵉ ligne affichée jouerait la 2ᵉ piste de la galette.
     ══════════════════════════════════════════════════════════════════════ */
  /** La pastille a été refermée : l'album entier, jusqu'à la prochaine fiche. */
  let focusReferme = $state(false);
  // Une autre fiche s'ouvre (ou un autre focus arrive) : la pastille revient.
  $effect(() => { void album?.id; void artisteFocus?.id; void artisteFocus?.pistes; focusReferme = false; });
  // #4767 (crédits) — venu de « Collaborations » ou de « Reprises », le focus
  // porte les pistes CRÉDITÉES (`focus_track_ids`) : `tracks.artist_id` y
  // désigne l'artiste principal, pas celui de la page.
  const rangsDuFocusIci = $derived(rangsDuFocus(tracks, artisteFocus));
  const focusActif = $derived(
    artisteFocus != null && !focusReferme && focusRestreint(tracks, rangsDuFocusIci),
  );
  /** Les rangs AFFICHÉS, dans l'album entier — l'identité hors focus. */
  const rangsVisibles = $derived(focusActif ? rangsDuFocusIci : tracks.map((_, i) => i));
  const pistesVisibles = $derived(pistesAuxRangs(tracks, rangsVisibles));

  /**
   * #4650 — au moins une piste porte une pochette PROPRE, différente de celle
   * de l'album.
   *
   * Fuccaro (forum 1317) : les quatre singles de *Hackney Diamonds* — dont
   * « Angry » — sont rangés dans l'album et portent chacun leur propre
   * jaquette. Le serveur les sert déjà dans `cover_path` de la piste (la
   * lecture est un `COALESCE(tracks.cover_path, albums.cover_path)`), mais la
   * liste ci-dessous n'affichait AUCUNE vignette : la raison écrite plus bas
   * — « sans pochette, les vingt porteraient la même » — cesse d'être vraie
   * exactement dans ce cas-là, et seulement dans celui-là.
   *
   * La comparaison porte sur la pochette servie pour l'ALBUM : une piste dont
   * l'image est celle de son album n'est pas une pochette propre, même quand
   * le champ est rempli.
   */
  const pochettesDePisteDistinctesIci = $derived(
    pochettesDePisteDistinctes(tracks, (albumAffiche as any)?.cover_path ?? null),
  );

  /**
   * « Aussi sur … » (phase 5 UPnP) : l'album existe aussi de l'autre côté —
   * local ↔ serveur UPnP. Pas pour un disque de service, de dépôt ni Bandcamp.
   */
  let aussiSur = $state<AussiSur[]>([]);
  const mention = $derived(mentionAussiSur(aussiSur));
  $effect(() => {
    const id = album.id, d = depot, svc = service, bc = bandcamp;
    aussiSur = [];
    if (id == null || d || svc || bc) return;
    let perime = false;
    api.getAussiSur(id)
      .then((r) => { if (!perime) aussiSur = r?.aussi_sur ?? []; })
      .catch(() => { /* serveur sans la route : rien à dire */ });
    return () => { perime = true; };
  });

  /**
   * « Localiser sur le disque » (Bertrand, 09/09/2026).
   *
   * Le dossier se DÉDUIT des pistes : mesuré sur le .18, un album ne porte
   * aucun chemin, une piste si. La règle vit dans `lib/dossierAlbum` — elle
   * remonte au plus long préfixe commun, pour qu'un album gravé en `CD1/` et
   * `CD2/` ouvre le dossier de l'ALBUM et non la moitié.
   *
   * `null` quand il n'y a rien à montrer — album de streaming, dépôt distant,
   * pistes sans chemin : le bouton disparaît alors, plutôt que d'ouvrir un
   * dossier qui n'est pas celui-là.
   */
  const dossier = $derived(depot ? null : dossierDeLAlbum(tracks));
  function localiser() {
    if (!dossier) return;
    /**
     * 🔴 #854 — Pierre M, fil 1671 : « "Localiser sur le disque" : OK mais
     * retour ne ramène à l'album mais remonte l'arborescence ».
     *
     * L'écran Répertoires est celui du client ACTUEL, et son bouton Retour est
     * `goUp()` — le dossier parent, puis les racines. Rien ne lui disait d'où
     * l'on venait.
     *
     * On pose donc le chemin retour avant de partir, comme le fait déjà la
     * Recherche vers une fiche d'artiste : la VUE où rendre la main, et
     * l'ALBUM à y rouvrir. `pendingLibraryAlbum` est le contrat que
     * `LibraryV2` lit déjà pour rouvrir une fiche.
     */
    if (album.id != null) pendingLibraryAlbum.set(album.id);
    vueDeRetour.set('library');
    ouvrirLeRepertoire(dossier);
    activeView.set('browse');
  }
  let loading = $state(true);
  let error = $state<string | null>(null);
  const showExpert = $derived(atLeast($preferences.settingsLevel, 'expert'));

  /**
   * Les pistes de la fiche AFFICHÉE — et rien d'autre.
   *
   * renesenses/tune-server-rust#3178 (jfpaquet, 0.9.130 Windows) : « en
   * ouvrant la fiche d'un album, la liste de pistes affichée est celle d'un
   * AUTRE album », titre et pochette corrects, et la LECTURE juste. Le
   * compteur de l'entête suivait la liste étrangère — 12 puis 8 pour le même
   * disque, dont le journal serveur donne le vrai compte (`set_queue_ok n=9`).
   *
   * L'ancien client a reçu sa clé (`albumTracksOwner`, stores/library) ; CETTE
   * fiche-ci ne l'avait pas, et elle porte deux trous :
   *
   *  1. **La fiche change d'album SANS être remontée.** `{#if opened}<AlbumDetailV2
   *     album={opened}/>{/if}` : passer de l'album A à l'album B garde
   *     l'instance et ne fait que changer la propriété. `tracks` restait donc
   *     rempli des pistes de A — et l'entête, qui compte `tracks.length`,
   *     annonçait le compte de A sous le titre de B. C'est err 02 / err 01.
   *     `LibraryV2` a exactement ce chemin : l'effet `$pendingLibraryAlbum`
   *     écrit `opened = <autre album>` alors qu'une fiche est ouverte
   *     (« aller à l'album » du menu d'une piste).
   *  2. **Aucun jeton de fraîcheur.** Deux ouvertures rapprochées laissaient
   *     gagner la réponse la plus LENTE : celle de l'album précédent venait se
   *     poser, PLEINE et cohérente, sous l'entête du suivant.
   *
   * La liste repart donc VIDE à chaque changement d'album, et une réponse
   * périmée n'écrit plus rien. L'effet ÉCRIT `tracks`, `loading` et `error`,
   * et ne les LIT jamais — sans quoi il se relancerait lui-même sans fin.
   */
  $effect(() => {
    const id = album.id, d = depot, svc = service, sid = sidDistant, bc = bandcamp;
    // 🔴 AVANT la garde : une fiche qu'on ne sait pas charger ne doit pas
    // garder à l'écran la liste de la précédente.
    tracks = [];
    // Un album de service n'a pas d'`id` local : sans cette branche, la garde
    // sortait aussitot et la fiche restait sur « Chargement… » pour toujours.
    if (id == null && !(svc && sid) && !bc) return;
    loading = true; error = null;
    let perime = false;
    const p = bc
      // Le plugin rend ses propres champs : on les traduit dans la forme d'une
      // piste, en gardant `stream_url` comme chemin de lecture — c'est ce que
      // fait deja l'ecran Bandcamp du client actuel.
      // 🔴 `source_id`, PAS `file_path`.
      //
      // Bertrand, 05/09/2026 : « bouton play sur un album Bandcamp ne lance
      // pas la lecture mais relance la lecture en cours ». C'est la signature
      // d'un corps que le serveur ne sait pas apparier : il retombe alors sur
      // « reprendre ». L'ecran Bandcamp du client actuel, lui, marche — il
      // envoie la PAIRE `source: 'bandcamp'` + `source_id: <url du flux>`.
      //
      // Porter l'URL dans `source_id` repare la lecture ET rend la piste
      // designable : la barre d'actions, qui se retirait faute de pouvoir la
      // nommer, revient sur chaque ligne.
      ? api.bandcampAlbum(bc).then((d2) => (d2?.tracks ?? []).map((t, i) => ({
          id: null, track_number: t.num ?? i + 1, title: t.title,
          artist_name: t.artist ?? album.artist_name ?? null,
          album_title: album.title, duration_ms: (t.duration_s ?? 0) * 1000,
          source: 'bandcamp', source_id: t.stream_url,
          cover_path: album.cover_path ?? null, format: 'MP3',
        })) as unknown as Track[])
      : svc && sid
      ? api.getStreamingAlbumTracks(svc, String(sid))
      : d
        ? pistesAlbumDistant(d, id as number)
        : api.getAlbumTracks(id as number);
    p.then((t) => { if (!perime) tracks = t; })
      .catch((e) => { if (!perime) error = errText(e) ?? 'Chargement impossible'; })
      .finally(() => { if (!perime) loading = false; });
    return () => { perime = true; };
  });

  /**
   * DYNAMIC RANGE (#1388). La fiche v2 n'en affichait AUCUN — et elle n'aurait
   * rien pu en afficher : `album` lui vient de la GRILLE, servie par la route
   * de liste, qui ne porte pas la clé. Seul `GET /library/albums/{id}` rend
   * `dynamic_range` et `dynamic_range_source`. Il faut donc aller la lire, ce
   * que la fiche de l'ancienne interface fait depuis toujours.
   *
   * Requête SÉPARÉE, et non ajoutée au `Promise.all` des pistes : le DR est
   * une décoration. Son échec ne doit ni retarder la liste des pistes, ni
   * allumer le bandeau d'erreur de la fiche.
   *
   * Un album distant, de service ou Bandcamp n'a pas d'identifiant local :
   * aucune requête n'est tentée pour lui, et le badge reste absent.
   *
   * L'effet ÉCRIT `fiche` et ne la LIT jamais — sans quoi il se relancerait
   * lui-même sans fin. Le drapeau `vivant` évite qu'une réponse tardive
   * n'écrase le DR de l'album suivant.
   */
  let fiche = $state<Album | null>(null);
  $effect(() => {
    const id = album.id, d = depot, svc = service, bc = bandcamp;
    fiche = null;
    if (id == null || d || svc || bc) return;
    let vivant = true;
    api.getAlbum(id).then((a) => { if (vivant) fiche = a; }).catch(() => {});
    return () => { vivant = false; };
  });

  /** Le badge DR, et ce qu'il doit dire de sa provenance. */
  const dr = $derived(afficherDynamicRange(fiche));

  /**
   * FAVORI. Bertrand, 05/09/2026 : « En vue Album, où se trouve l'icône
   * favori ? » — nulle part. Le cœur vivait sur la pochette dans la grille,
   * posé par `PochetteActions` ; en ouvrant l'album on le perdait, et il
   * fallait refermer la fiche pour mettre un disque en favori.
   *
   * Les deux espaces d'identifiants sont distincts : un album local est
   * désigné par son `id`, un album de service par la paire service +
   * `source_id`, et ils vivent dans deux tables. Le premier chemin sur le
   * second ne retirerait rien, en silence (#1478).
   */
  // 🔴 #1409 — la référence passe par `refFavoriDeFiche`, la même règle que
  // la vignette : un album Bandcamp (propriété `bandcamp`, `service` nul) a
  // désormais son cœur, sous la clé du SERVEUR `bandcamp` et jamais sous la
  // clé d'onglet `__bandcamp__`.
  const refService = $derived(depot ? null : refFavoriDeFiche(album as any, service, bandcamp));
  const cleService = $derived(favKeyOf(refService));
  const enFavori = $derived(
    album.id != null ? $favoriteAlbumIds.has(album.id)
      : cleService != null && $favoriteStreamingKeys.has(cleService),
  );
  let bascule = $state(false);
  async function basculerFavori() {
    if (bascule) return;
    bascule = true;
    try {
      if (album.id != null) await basculerFavoriLocal({ albumId: album.id });
      else if (refService) {
        await toggleStreamingFavorite({
          ...refService,
          title: album.title, artist: album.artist_name ?? undefined,
          coverUrl: album.cover_path ?? undefined,
        });
      }
    } catch { /* le cœur reprend son état au prochain relevé */ }
    bascule = false;
  }

  const totalMs = $derived(tracks.reduce((s, t) => s + (t.duration_ms ?? 0), 0));
  /**
   * 🔴 #852 — l'en-tete se calcule sur les PISTES, pas sur les colonnes de
   * l'album.
   *
   * Pierre M voyait « CD » au-dessus d'un tableau qui affiche
   * `HI-RES FLAC 88.2/24` sur chacune des douze pistes. Les colonnes de
   * `albums` sont remplies une fois au scan et jamais recalculees ; les
   * pistes, elles, sont relues a chaque fois. On croit les pistes, et
   * l'en-tete dit alors la meme chose que le tableau PAR CONSTRUCTION.
   *
   * `null` = on ne sait pas, et on n'affiche AUCUN badge. L'ancien repli
   * `?? 'CD'` affirmait un format qu'il n'avait pas.
   */
  const qualite = $derived(qualiteEnTeteAlbum(album, tracks));
  const tier = $derived(
    qualite
      ? getQualityTier({
          format: qualite.format,
          sample_rate: qualite.sampleRate,
          bit_depth: qualite.bitDepth,
        } as any)
      : getQualityTier(album),
  );
  const qLabel = $derived.by(() => {
    if (!qualite) return null;
    if (tier === 'dsd') return 'DSD';
    const rate = qualite.sampleRate ? Math.round(qualite.sampleRate / 100) / 10 : null;
    const depth = qualite.bitDepth ?? 24;
    if ((tier === 'hires' || tier === 'hires_max') && rate) return `${rate} kHz · ${depth}-bit`;
    return qualite.format ? qualite.format.toUpperCase() : null;
  });

  /** Enchaine une suite de pistes distantes : la premiere joue, les autres
   *  s'empilent. Le serveur local ne connait pas l'album distant — il n'y a
   *  pas de `album_id` a lui donner, seulement des URL de flux. */
  async function enchainerDistant(liste: Track[], depuis = 0) {
    const zid = $currentZoneId, d = depot;
    if (zid == null || !d) return;
    const suite = liste.slice(depuis).filter((t) => t.id != null);
    if (!suite.length) return;
    await playAndSync(zid, corpsLecture(d, suite[0]) as any);
    for (let i = 1; i < suite.length; i++) await api.addToQueue(zid, corpsLecture(d, suite[i]) as any);
  }

  /*
   * Portés de l'ancienne Bibliothèque, seule à les offrir sur un album LOCAL :
   * la note, la ré-identification (#2128), le signalement de la pochette, et
   * la proposition « meilleure qualité disponible ».
   */
  let reidentification = $state(false);
  async function reidentifier() {
    if (album.id == null) return;
    const id = album.id;
    reidentification = true;
    const tid = notifications.info($tr('library.reidentifying'), 0);
    try {
      const r = await api.reidentifyAlbum(id);
      notifications.dismiss(tid);
      // Le verdict est rendu tel quel, y compris décevant : « même pressage »
      // et « rien trouvé » sont des réponses (fil forum #1455).
      if (r.verdict === 'no_tracks') { notifications.error($tr('library.reidentifyNoTracks')); return; }
      if (r.verdict === 'not_found') {
        notifications.error($tr('library.reidentifyNotFound').replace('{title}', r.searched_title ?? ''));
        return;
      }
      if (r.verdict === 'unchanged') { notifications.info($tr('library.reidentifyUnchanged'), 9000); return; }
      let msg = $tr('library.reidentifySuccess')
        .replace('{title}', r.release_title ?? '')
        .replace('{matched}', String(r.tracks_matched ?? 0))
        .replace('{total}', String(r.tracks_total ?? 0));
      if (r.fields_left_as_is?.length) {
        msg += ` — ${$tr('library.reidentifyKept').replace('{fields}', r.fields_left_as_is.join(', '))}`;
      }
      notifications.success(msg, 9000);
      // Relire la fiche pour montrer ce qui vient d'être écrit.
      album = await api.getAlbum(id);
    } catch (e: any) {
      notifications.dismiss(tid);
      notifications.error(`${$tr('library.reidentifyFailed')} : ${e?.message || e}`);
    } finally {
      reidentification = false;
    }
  }

  /** Même proposition, pour une PISTE lancée seule (porté de l'ancienne
   *  Bibliothèque) : une meilleure copie peut exister d'un titre sans que
   *  l'album entier en ait une. */
  async function proposerMeilleureQualitePiste(trackId: number) {
    try {
      const r = await api.trackBetterQuality(trackId);
      const b = r.better;
      if (!b?.track_id || b.track_id === trackId) return;
      notifications.withAction(
        `${$tr('library.betterQualityAvailable')} : ${libelleQualite(b)}`,
        $tr('library.playBetterQuality'),
        () => {
          const zid = zoneRequise();
          if (zid != null) playAndSync(zid, { track_id: b.track_id! } as any).catch(signalerEchecLecture);
        },
      );
    } catch { /* proposition silencieuse */ }
  }

  async function proposerMeilleureQualite(albumId: number) {
    try {
      const r = await api.albumBetterQuality(albumId);
      const autre = autreAlbumMeilleur(r.better, albumId);
      if (autre == null || !r.better) return;
      notifications.withAction(
        `${$tr('library.betterQualityAvailable')} : ${libelleQualite(r.better)}`,
        $tr('library.playBetterQuality'),
        () => {
          const zid = zoneRequise();
          if (zid != null) playAndSync(zid, { album_id: autre, start_index: 0 }).catch(signalerEchecLecture);
        },
      );
    } catch { /* proposition silencieuse : jamais d'erreur pour ça */ }
  }

  function playAlbum(rangAffiche = 0) {
    const zid = zoneRequise();
    if (zid == null) return;
    // #4767 — le rang cliqué est celui de la liste AFFICHÉE ; `start_index`
    // se compte sur l'album entier. Hors focus, la traduction est l'identité.
    const startIndex = rangDansLAlbum(rangsVisibles, rangAffiche);
    // 🔴 `source` va TOUJOURS avec `streaming_album_id`. Seul, l'identifiant
    // ne designe rien pour le serveur, qui retombe alors sur « reprendre la
    // lecture en cours » — le defaut releve sur les playlists Qobuz.
    if (service && sidDistant) {
      playAndSync(zid, { streaming_album_id: String(sidDistant), source: service as any, start_index: startIndex }).catch(signalerEchecLecture);
      return;
    }
    /*
     * 🔴 BANDCAMP : L'ALBUM, OUVERT À LA PISTE CHOISIE — #2702.
     *
     * Le commentaire qui vivait ici disait « il n'y a pas d'album à désigner
     * au serveur ». C'était vrai, et ça ne l'est plus : Bandcamp est inscrit
     * au registre des services depuis `tune-server/src/state.rs:369`, donc
     * `streaming_album_id` l'accepte — et son identifiant d'album EST l'adresse
     * publique de sa page, celle que `bandcamp` porte déjà.
     *
     * Tant qu'on envoyait UNE piste, le serveur terminait par
     * `update_queue_info(zone, 0, 1)` : une file d'exactement une piste, sans
     * jamais de suivante. Sevy Tabroc : « à la fin du morceau, le prochain ne
     * s'enchaîne pas. » Ce n'était pas la détection de fin de piste, c'était la
     * constitution de la file.
     *
     * `corpsDeLectureBandcamp` est la décision déjà employée par l'écran
     * Bandcamp de l'ancienne interface : elle rend le corps d'ALBUM dès qu'une
     * adresse est connue, et ne retombe sur la piste seule que s'il n'y en a
     * pas — mieux vaut une file d'une piste que rien.
     */
    if (bandcamp) {
      const corps = corpsDeLectureBandcamp(
        { url: bandcamp, tracks: tracks.map((t: any) => ({
            stream_url: String(t?.stream_url ?? t?.source_id ?? ''),
            title: t?.title ?? '',
            artist: t?.artist_name ?? '',
          })) },
        startIndex,
      );
      if (!corps) return;
      playAndSync(zid, corps as any).catch(signalerEchecLecture);
      return;
    }
    if (album.id == null) return;
    if (depot) { enchainerDistant(tracks, startIndex).catch(signalerEchecLecture); return; }
    playAndSync(zid, { album_id: album.id, start_index: startIndex }).catch(signalerEchecLecture);
    // APRÈS le départ de la lecture : la proposition ne la retarde jamais.
    // Lancé depuis une piste précise : c'est elle qu'on examine ; depuis le
    // début, l'album entier.
    const piste = startIndex > 0 ? (tracks[startIndex] as any) : null;
    if (piste?.id != null) void proposerMeilleureQualitePiste(piste.id);
    else void proposerMeilleureQualite(album.id);
  }
  /** Melange en place, sans hasard reel : la meme permutation pour un meme
   *  nombre de pistes. C'etait deja le cas ici, on ne fait que l'extraire. */
  function melanger<T>(l: T[]): T[] {
    const c = [...l];
    for (let i = c.length - 1; i > 0; i--) { const j = (i * 7 + 3) % (i + 1); [c[i], c[j]] = [c[j], c[i]]; }
    return c;
  }

  function shuffle() {
    const zid = zoneRequise();
    if (zid == null) return;
    if (depot) { enchainerDistant(melanger(tracks)).catch(signalerEchecLecture); return; }
    // Album de SERVICE ou Bandcamp : pas d'`id` local, mais chaque piste est
    // designable par sa paire `source` + `source_id`. La premiere joue, les
    // autres s'empilent en UNE requete.
    if (service || bandcamp) {
      const l = melanger(tracks);
      const tete = corpsDeLecture(l[0]);
      if (!tete) return;
      (async () => {
        await playAndSync(zid, tete as any);
        const reste = corpsDeFileListe(l.slice(1));
        if (reste) await api.addToQueue(zid, reste);
      })().catch(signalerEchecLecture);
      return;
    }
    if (album.id == null) return;
    const ids = melanger(tracks.map((t) => t.id).filter((x): x is number => x != null));
    playAndSync(zid, { track_ids: ids }).catch(signalerEchecLecture);
  }
  /**
   * Les deux boutons de file, pour les QUATRE origines.
   *
   * « Ajouter à la file » et « Lire ensuite » étaient MASQUÉS dès qu'un album
   * venait d'un service : « Aléatoire et "ajouter à la file" travaillent sur
   * des identifiants de pistes LOCALES ; un album de service n'en a pas »,
   * disait le commentaire. La moitié était vraie — l'album n'a pas d'`id` —,
   * la conclusion ne l'était pas : `QueueAddRequest` accepte `tracks[]`, des
   * lignes de service, et les fait passer par le même `insert_at`.
   *
   * « Vue album : ajouter Ajouter à la file d'attente, lire à la fin du
   * prochain morceau ; ex qobuz, ajouter les 5 CTA » (Bertrand, 06/09/2026).
   * Un album Qobuz n'offrait que deux boutons sur cinq.
   *
   * ⚠️ UNE requête, pas une boucle. La boucle précédente envoyait un appel par
   * piste ; avec un rang, chaque insertion décalait la suivante et l'ordre de
   * l'album s'inversait.
   */
  let fileOccupee = $state(false);
  async function enfiler(position: number | undefined, cle: string) {
    const zid = $currentZoneId, d = depot;
    if (zid == null || fileOccupee) return;
    // L'album LOCAL part par son identifiant : le serveur applique alors le
    // rattrapage de la ligne sœur, que résoudre les pistes ici ignorerait —
    // l'album s'ajoutait VIDE là où « lire » marchait (Pascal, v0.9.21).
    const corps = !d && !service && !bandcamp && album.id != null
      ? { album_id: album.id, ...(position != null ? { position } : {}) }
      : corpsDeFileListe(d ? tracks.map((t) => corpsLecture(d, t) as any) : tracks, position);
    if (!corps) return;
    fileOccupee = true;
    try {
      await api.addToQueue(zid, corps);
      notifications.success($tr(cle as any).replace('{title}', album.title ?? ''));
    } catch {
      notifications.error($tr('v2.pa.queueError' as any));
    }
    fileOccupee = false;
  }
  const addQueue = () => enfiler(undefined, 'v2.album.queued');
  /** « Lire ensuite » insère au rang SUIVANT celui qui joue. Sans rang, la
   *  route ajoute à la fin — ce serait le bouton d'à côté. */
  const lireEnsuite = () => enfiler(get(queuePosition) + 1, 'v2.album.queuedNext');
  /**
   * PRÉSENTATION DE L'ALBUM — renesenses/tune-server-rust#3586, FabienM,
   * fil forum 1697 : « Les artistes ont leur biographie, il serait également
   * intéressant d'afficher les infos de l'album sur la page album ».
   *
   * La donnée existe (`Album.bio`, servie par `/library/albums`, écrite par
   * `album_repo::update_bio`) et l'interface actuelle l'affiche déjà
   * (`LibraryView.svelte`, `.album-bio-section`). Cette fiche-ci n'en portait
   * AUCUNE trace : `grep bio src/components/v2/AlbumDetailV2.svelte` ne rendait
   * rien.
   *
   * 🔴 POURQUOI DERRIÈRE UN BOUTON, et non chargée à l'ouverture de la fiche.
   *
   * `GET /library/albums/{id}/bio` n'est pas une lecture locale. Quand la bio
   * stockée est vide (ou dans une autre langue que celle demandée), le
   * handler `albums::album_bio` sort sur le réseau :
   *
   *     state.http_client.get("https://mozaiklabs.fr/api/v1/albums/bio")
   *
   * et il ne met en cache que les réponses NON VIDES
   * (`if out.bio non nul { api_cache_set(...) }`). Un album sans notice
   * relance donc l'appel sortant à chaque consultation. Charger d'office
   * ferait partir une requête vers mozaiklabs.fr chaque fois qu'on ouvre un
   * album — sur une bibliothèque dont le taux de remplissage n'est pas établi.
   *
   * L'interface actuelle a tranché pareil : `loadAlbumBio` n'y est appelée que
   * par le clic sur « Notes / Bio ». On reprend son bouton, son état vide
   * (`library.noAlbumNote`) et ses trois clés — donc aucune nouvelle clé, et
   * les onze langues sont déjà servies.
   *
   * Un album de service, Bandcamp ou distant n'a pas d'`id` local : la route
   * ne le désigne pas, le bouton ne s'affiche pas. Un bouton absent ne promet
   * rien.
   */
  let bioOuverte = $state(false);
  let bio = $state<string | null>(null);
  let bioChargement = $state(false);
  let bioErreur = $state(false);
  /** Album dont la bio est en mémoire — la fiche est réutilisée d'un album à
   *  l'autre, et resservir la notice du précédent serait un mensonge. */
  let bioAlbumId = $state<number | null>(null);

  $effect(() => {
    const id = album.id ?? null;
    if (id === bioAlbumId) return;
    bioAlbumId = id;
    bioOuverte = false;
    bio = null;
    bioErreur = false;
  });

  async function basculerBio() {
    bioOuverte = !bioOuverte;
    const id = album.id;
    if (!bioOuverte || id == null || bio !== null || bioChargement) return;
    bioChargement = true;
    bioErreur = false;
    try {
      const r = await api.getAlbumBio(id);
      // Course : l'utilisateur a pu changer d'album pendant la requête.
      if (album.id === id) bio = r.bio ?? '';
    } catch {
      if (album.id === id) bioErreur = true;
    }
    bioChargement = false;
  }

  /**
   * Le nom de l'artiste MÈNE à sa fiche — #3708, FabienM, fil forum 1726 :
   * « l'hyperlien sur l'artiste est absent, ex ici: Artiste Depeche Mode n'a
   * pas de lien actif pour rediriger vers la page de l'artiste. »
   *
   * On ne réinvente aucun chemin : c'est le contrat que `PisteActions`
   * (`allerArtiste`) et `NowPlaying` (`ouvrirFicheArtiste`) posent déjà — on
   * POSE la cible, puis on change de vue. Le composant ne sait pas naviguer,
   * et n'a pas à le savoir.
   *
   * 🔴 `onClose()` en plus des deux magasins : cette fiche est un CALQUE
   * par-dessus la grille. Sans lui, l'onglet Artistes s'ouvrait derrière un
   * album resté au premier plan — le clic n'aurait rien paru faire.
   *
   * Le contrat V1 (`selectedArtist` + `libraryTab`) n'est PAS alimenté ici :
   * ce composant vit dans `components/v2/` et n'est monté que par la nouvelle
   * coquille (vérifié : ses neuf montages sont tous des composants `v2/`).
   * `NowPlaying`, lui, est monté par les DEUX et pose donc les deux.
   */
  /**
   * L'artiste d'un album de SERVICE — #3708, seconde moitié.
   *
   * Le commentaire du balisage disait, et il avait raison à l'époque : « un
   * lien mort serait pire que pas de lien ». Un album Qobuz n'a pas
   * d'`artist_id`, et aucun écran n'accueillait un artiste de service.
   *
   * Il en existe un depuis #3825, et la coquille sait résoudre un NOM en
   * identifiant (`gestesNavigationService.ouvrirArtiste`) — une piste de
   * service ne portant pas d'identifiant d'artiste. Le lien n'est donc plus
   * mort, et le texte inerte n'a plus de raison d'être.
   *
   * `null` quand il manque le service ou le nom : on retombe alors sur le
   * texte, qui reste le bon geste faute de cible.
   */
  /**
   * 🔴 #956 — `destinationArtiste` tranche, et lui seul. Un album Qobuz porte
   * `artist_id: "610403"` (mesuré sur la .18) : ce n'est PAS un artiste de la
   * bibliothèque, et `artist_id != null` l'y envoyait — Sandro (fil 1769) et
   * Fabien (fil 1774, point 15) atterrissaient sur une grille sans lui.
   * La source effective est le SERVICE de la fiche : `album.source` est nul
   * sur un album servi par `/streaming/qobuz/…`.
   */
  /**
   * 🔴 L'ARTISTE REPLIÉ SUR LES PISTES — #1361 bis, Bertrand le 20/09/2026 :
   * « le click sur Agnes Obel n'ouvre pas la page artiste ».
   *
   * La cause première est ailleurs (les fabriques d'album de service jetaient
   * `artist_id`, et celle de la coquille ne portait même pas le nom), et elle
   * est réparée là-bas. Ce repli est le FILET : cette fiche est montée par
   * DIX écrans, et le onzième qui oubliera un champ ne doit pas faire
   * réapparaître un nom mort.
   *
   * ⚠️ Il exige l'UNANIMITÉ des pistes. Un album n'a qu'un artiste d'album,
   * et `tracks[0]` serait faux sur une compilation ou un coffret — Bertrand,
   * 19/09/2026 : « les compilations et les coffrets ne sont pas parfaitement
   * gérés mais cela est corrigé à la main ». Une seule piste qui diffère, ou
   * une seule sans identifiant, et on renonce : pas de lien plutôt qu'un lien
   * qui mène ailleurs.
   */
  const artisteReplie = $derived.by(() => {
    const propre = albumAffiche.artist_id;
    if (propre != null && String(propre).trim() !== '') return null;
    if (!tracks.length) return null;
    const ids = new Set<string>();
    const noms = new Set<string>();
    for (const t of tracks) {
      const id = (t as any).artist_id;
      if (id == null || String(id).trim() === '') return null;
      ids.add(String(id).trim());
      noms.add((t.artist_name ?? '').trim());
    }
    if (ids.size !== 1 || noms.size !== 1) return null;
    const nom = [...noms][0];
    return nom ? { id: [...ids][0], nom } : null;
  });

  /** Le nom AFFICHÉ : celui de l'album, ou celui que les pistes s'accordent. */
  const nomArtiste = $derived(
    (albumAffiche.artist_name ?? '').trim() || artisteReplie?.nom || '',
  );

  const destination = $derived(destinationArtiste({
    source: service ?? (album as any).source ?? null,
    artist_id: (albumAffiche.artist_id ?? artisteReplie?.id ?? null) as any,
    artist_name: nomArtiste || null,
  }));
  const artisteDeService = $derived.by(() => {
    if (!$gestesNavigationService || !destination) return null;
    if (destination.type === 'artiste-service') {
      return { service: destination.service, nom: destination.nom, id: destination.id };
    }
    if (destination.type === 'recherche' && destination.source && destination.source !== 'local') {
      return { service: destination.source, nom: destination.requete };
    }
    return null;
  });

  /**
   * 🔴 REFERMER LA FICHE SANS RECULER DANS L'HISTORIQUE — #1486.
   *
   * FabienM, 23/09/2026 : « Lien artiste sur un album de Qobuz ou Bandcamp ne
   * renvoie pas sur la page artiste mais renvoie sur l'accueil du Streaming »,
   * et son déroulé finit par « 3 - Je retourne à la page accueil editorial du
   * menu Streaming Qobuz ».
   *
   * Ce n'est PAS le repli de #956 — il mènerait à l'écran Recherche, et il
   * pose un bandeau. Ce qui reste, c'est le RECUL d'historique de la
   * fermeture, qui laisse une traversée EN VOL derrière la navigation :
   *
   *   clic  → onClose()  = `fermerDetailEnReculant` → `history.back()`
   *         → ouvrirArtiste(...)                    → `activeView = streamingartist`
   *   ↳ tour suivant : si la traversée aboutit, `surRetour` repose la vue de
   *     l'entrée précédente — `streaming` — PAR-DESSUS la fiche artiste.
   *
   * ⚠️ CE « SI » N'EST PAS TRANCHÉ, et il faut le dire : jsdom, lui, AVALE la
   * traversée dès qu'un `pushState` la suit (mesuré — aucun `popstate`,
   * `history.length` qui monte), et aucune vue navigateur n'est possible sur
   * ce poste. On ne sait donc pas si Chrome la jette aussi.
   *
   * Mais on n'a pas besoin de le savoir pour s'en passer : une navigation qui
   * ne dépile RIEN n'a aucune course à arbitrer. C'est aussi pourquoi le
   * correctif de #1359 paraissait tenir — le seul chemin qu'il avait mesuré,
   * « Lecture en cours », n'est pas un calque : la vue `streamingalbum` de
   * `ShellV2` referme par un `activeView.set(...)` SYNCHRONE, sans recul.
   *
   * On referme donc le calque SANS dépiler : l'abonnement de `detailOuvert`
   * réécrit l'entrée courante (`replace`, voir `opPourFiche`) et le changement
   * de vue empile la sienne. Le Précédent depuis la fiche artiste ramène bien
   * à l'écran d'où l'on est parti, et la pile ne garde pas un cran mort.
   *
   * Les DIX écrans qui montent cette fiche se referment tous sur
   * `detailOuvert` (`$effect` : `if ($detailOuvert == null && …)`) : aucun
   * appelant n'a à changer. Les deux qui n'empilent pas — la vue
   * `streamingalbum` de la coquille, la fiche locale d'`ArtistesV2` — ne
   * reconnaissent pas leur clé ici et gardent leur `onClose`.
   */
  function quitterLaFiche() {
    const cle = cleDetailAlbum(albumAffiche as any);
    if (cle && $detailOuvert === cle) { fermerDetail(); return; }
    onClose();
  }

  function allerArtiste() {
    // La fiche se referme AVANT de router : sans cela l'écran d'arrivée
    // s'ouvrirait derrière un album resté au premier plan, et le clic
    // n'aurait rien paru faire.
    if (destination?.type === 'artiste') {
      quitterLaFiche();
      // Le chemin de référence (#3824) : il pose aussi `vueDeRetour`, que
      // cette fiche oubliait — le Retour de la fiche artiste retombait sur la
      // grille de la Bibliothèque au lieu de l'écran d'où l'on venait.
      void ouvrirArtisteDepuis({ id: destination.artistId, source: 'local' }, get(activeView));
      return;
    }
    if (artisteDeService) {
      quitterLaFiche();
      // `depuis` se lit APRÈS la fermeture : la vue `streamingalbum` de la
      // coquille, elle, referme EN changeant de vue — c'est cette vue-là, et
      // pas la fiche qu'on vient de quitter, qui est le point de retour.
      $gestesNavigationService?.ouvrirArtiste({ ...artisteDeService, depuis: get(activeView) });
    }
  }

  function trackTech(t: Track): string {
    const rate = t.sample_rate ? `${Math.round(t.sample_rate / 100) / 10} kHz` : '';
    const depth = t.bit_depth ? `${t.bit_depth}-bit` : '';
    return [t.format?.toUpperCase(), rate, depth].filter(Boolean).join(' · ');
  }
</script>

<div class="v2-detail tune-v2">
  <button class="close" onclick={onClose} aria-label="Fermer">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
  </button>

  <div class="head">
    <!-- #1342 — `albumAffiche` : la pochette que l'appelant n'a pas portée
         vient du service, sinon la fiche reste un carré gris à l'initiale. -->
    <div class="art"><AlbumArt coverPath={albumAffiche.cover_path} albumId={depot ? null : album.id} size={0} alt={album.title} source={album.source} fallbackInitials={album.title?.slice(0,1)} /></div>
    <div class="meta">
      <!-- 🔴 La pastille « compilation » vit À CÔTÉ du badge de qualité, pas
           dans la ligne de faits : c'est une NATURE de disque, pas une mesure,
           et c'est la première chose que Didier et Bertrand cherchaient sur
           cette fiche (#1957). Absente quand le drapeau est faux ou absent —
           voir `PastilleCompilation`. -->
      <div class="qrow">
        {#if album.source === 'upnp'}<DisponibiliteUpnp sourceId={album.source_id} />{/if}
        <!-- #852 — pas de badge quand la qualite est inconnue : mieux vaut
             rien qu'un « CD » invente. -->
        {#if qLabel}<div class="qbadge">{qLabel}</div>{/if}
        <PastilleCompilation compilation={album.is_compilation} />
        <!-- #862 — Marco Polo, fil 1738 : « identifier dans la bibliothèque
             qu'un album affiché est la résultante d'un fichier .CUE ». La
             donnée vit sur les PISTES (`cue_media_path`) ; la fiche la remonte
             dès qu'une piste en porte. C'est une nature de disque, à côté de
             « compilation ». -->
        {#if depuisCue}<div class="qbadge cue" title={$tr('v2.album.cueTip' as any)}>{$tr('v2.album.cue' as any)}</div>{/if}
        {#if mention}<div class="qbadge cue" title={$tr('v2.album.alsoOnTip' as any)}>{$tr(mention.cle as any).replace('{servers}', mention.serveurs.join(', '))}</div>{/if}
      </div>
      <h1>{album.title}</h1>
      <!-- Un vrai BOUTON, pas un `<div onclick>` : le clavier doit l'atteindre.
           Pas d'`<a href>` non plus — cette coquille ne route rien par l'URL,
           la navigation passe par les magasins. Sans identifiant d'artiste
           (album de service, dépôt distant, base ancienne), le nom reste du
           TEXTE : un lien mort serait pire que pas de lien. -->
      {#if nomArtiste && (albumAffiche.artist_id != null || artisteDeService)}
        <button type="button" class="artist lien" onclick={allerArtiste}>{nomArtiste}</button>
      {:else}
        <div class="artist">{nomArtiste}</div>
      {/if}
      <div class="facts">
        {#if $formatAnneeAlbum(albumAffiche)}<span>{$formatAnneeAlbum(albumAffiche)}</span>{/if}
        <span>{$tr((tracks.length > 1 ? 'v2.common.trackCountMany' : 'v2.common.trackCountOne') as any).replace('{n}', String(tracks.length))}</span>
        {#if totalMs}<span>{formatDuration(totalMs)}</span>{/if}
        <!-- #1388 : `DR 12` pour une mesure inscrite dans le fichier,
             `DR ~12` souligné en pointillés pour la moyenne des pistes. Même
             valeur, provenance différente — voir `lib/dynamicRange.ts`. -->
        {#if dr}<span class="dr" class:deduit={dr.deduit} use:tip={dr.cleInfobulle}>DR {dr.texte}</span>{/if}
      </div>
      <div class="actions">
        <button class="play" onclick={() => playAlbum(0)}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8V4z"/></svg>{$tr('v2.album.play' as any)}
        </button>
        <!-- 🔴 Les CINQ actions valent pour les QUATRE origines.
             Elles étaient masquées dès qu'un album venait d'un service, au
             motif qu'elles « travaillent sur des identifiants de pistes
             LOCALES ». L'album n'a effectivement pas d'`id` — mais chaque
             piste porte sa paire `source` + `source_id`, et la route de file
             accepte `tracks[]`. Un album Qobuz n'offrait que deux boutons sur
             cinq (Bertrand, 06/09/2026). -->
        <button class="ghost" onclick={shuffle}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3l5 5-5 5M3 8h18M8 21l-5-5 5-5M21 16H3"/></svg>{$tr('v2.album.shuffle' as any)}
        </button>
        <button class="ghost" onclick={lireEnsuite} disabled={fileOccupee}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h9M4 12h9M4 18h5"/><path d="M15 8l5 4-5 4z" fill="currentColor" stroke="none"/></svg>{$tr('v2.album.playNext' as any)}
        </button>
        <button class="ghost" onclick={addQueue} disabled={fileOccupee}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h13M4 11h13M4 16h8M18 15l3 2-3 2z"/></svg>{$tr('v2.album.addQueue' as any)}
        </button>
        <!-- Le cœur n'apparaît que si l'album est DÉSIGNABLE (`id` local, ou
             référence de service — Bandcamp compris depuis #1409, désigné par
             l'URL de sa page comme sur sa vignette). Un bouton absent ne
             promet rien. -->
        <!-- Le dossier n'existe que pour un album LOCAL, et seulement si ses
             pistes portent un chemin : le bouton n'apparaît qu'alors. -->
        {#if dossier}
          <button class="ghost" onclick={localiser}
            title={$tr('v2.album.locate' as any)} aria-label={$tr('v2.album.locate' as any)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            {$tr('v2.album.locate' as any)}
          </button>
        {/if}
        {#if album.id != null || refService}
          <button class="ghost coeur" class:on={enFavori} onclick={basculerFavori} disabled={bascule}
            aria-pressed={enFavori}
            title={$tr(enFavori ? 'favorites.removeAlbum' : 'favorites.addAlbum')}
            aria-label={$tr(enFavori ? 'favorites.removeAlbum' : 'favorites.addAlbum')}>
            <svg viewBox="0 0 24 24" fill={enFavori ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            {$tr(enFavori ? 'favorites.inFavorites' : 'favorites.addAlbum')}
          </button>
        {/if}
        <!-- ÉTIQUETTES — même niveau visuel que les autres (`ghost`), et
             ABSENT quand l'album n'est pas désignable (dépôt distant, album
             sans identifiant ni paire) : voir `cibleEtiquettes`. Un bouton
             absent ne promet rien, un bouton qui échoue à l'usage si. -->
        {#if cibleEtiquettes}
          <button class="ghost" onclick={() => (etiquettesOuvertes = true)}
            aria-haspopup="dialog" aria-expanded={etiquettesOuvertes}
            title={$tr('v2.cover.tags' as any)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l8.58-8.58a1 1 0 0 0 0-1.42z"/><circle cx="6.5" cy="6.5" r="1.2" fill="currentColor"/></svg>
            {$tr('v2.cover.tags' as any)}
          </button>
        {/if}
        <!-- AJOUTER À UNE COLLECTION — même garde que le bloc local : un
             album de la BIBLIOTHÈQUE. Voir l'en-tête du `<script>`. -->
        {#if album.id != null && !depot}
          <button class="ghost" onclick={basculerMenuCollection}
            aria-haspopup="menu" aria-expanded={menuCollectionOuvert}
            title={$tr('v2.album.addToCollection' as any)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM12 10v6M9 13h6"/></svg>
            {$tr('v2.album.addToCollection' as any)}
          </button>
        {/if}
      </div>
      <!-- Album LOCAL seulement : ces trois gestes travaillent sur la fiche de
           la bibliothèque. -->
      {#if album.id != null && !depot}
        <div class="actions local">
          <AlbumRating albumId={album.id} />
          <button class="ghost" onclick={reidentifier} disabled={reidentification}>
            {reidentification ? $tr('library.reidentifying') : $tr('library.reidentify')}
          </button>
          {#if album.cover_path}
            <ReportButton entity="cover" entityId={album.id}
              reasons={['wrong_entity', 'incorrect', 'poor_quality', 'offensive']} />
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- Présentation de l'album (#3586). Voir le commentaire de `basculerBio`
       pour la raison du bouton : la route sort sur le réseau. -->
  {#if album.id != null}
    <div class="bio">
      <button class="bio-toggle" onclick={basculerBio} aria-expanded={bioOuverte}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        {bioOuverte ? $tr('library.hideNotes') : $tr('library.notesBio')}
      </button>
      {#if bioOuverte}
        {#if bioChargement}
          <p class="bio-state">{$tr('v2.common.loading' as any)}</p>
        {:else if bioErreur}
          <p class="bio-state err">{$tr('library.bioLoadError' as any)}</p>
        {:else if bio}
          <ClampedText lines={4} resetKey={bio}>
            <p class="bio-text">{bio}</p>
          </ClampedText>
        {:else}
          <p class="bio-state">{$tr('library.noAlbumNote')}</p>
        {/if}
      {/if}
    </div>
  {/if}

  <div class="tracks">
    {#if loading}
      <div class="state">{$tr('v2.common.loadingTracks' as any)}</div>
    {:else if error}
      <div class="state err">{error}</div>
    {:else}
      <!-- LISTE partagée, et non plus une boucle de lignes.
           Au mode Essentiel elle rend un TABLEAU à colonnes choisies (maquette
           Levente, 07/09/2026) ; aux deux autres modes, exactement les mêmes
           lignes qu'avant — sans pochette, les vingt porteraient la même, et
           sans le titre de l'album, déjà en tête d'écran.
           `numerotation="piste"` : c'est le rang DANS L'ALBUM qui compte ici,
           pas la position dans la liste affichée.
           `enTetesDisque` (#1431) : « Disque N » avant chaque disque d'un
           coffret ; rien sur un album d'un seul disque sans sous-titre.

           #4650 — « les vingt porteraient la même » est vrai, SAUF quand une
           piste porte sa propre jaquette (les singles de *Hackney Diamonds*).
           La vignette n'apparaît alors que pour cet album-là, et elle est le
           seul moyen de distinguer le single de l'album sur cette page. -->
      {#if focusActif && artisteFocus}
        <!-- #4767 — la pastille de Roon : elle DIT ce qui est filtré, et son
             × est la seule action. Refermée, l'album entier revient sans
             aller-retour réseau — les pistes sont déjà là. -->
        <div class="focus-artiste">
          <span class="fchip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg>
            {$tr((artisteFocus.pistes?.length ? 'v2.album.creditedOnly' : 'v2.album.artistOnly') as any).replace('{artist}', artisteFocus.nom)}
            <button onclick={() => (focusReferme = true)} aria-label={$tr('v2.album.artistOnlyClear' as any)}
              title={$tr('v2.album.artistOnlyClear' as any)}>×</button>
          </span>
        </div>
      {/if}
      <ListePistesV2
        pistes={pistesVisibles}
        numerotation="piste"
        pochette={pochettesDePisteDistinctesIci}
        pochetteEnTableau={pochettesDePisteDistinctesIci}
        avecAlbum={false}
        enTetesDisque
        onLire={(_p, i) => playAlbum(i)}
        onLireDepuis={(_p, i) => playAlbum(i)}
      />
    {/if}
  </div>
</div>

<!-- Le PANNEAU partagé, chargé à la demande — exactement ce que fait
     `PochetteActions` depuis la vignette. Il se pose lui-même en surcouche
     (`use:portail`), donc hors du cadre défilant de la fiche. -->
{#if etiquettesOuvertes && cibleEtiquettes}
  {#await import('./EtiquettesPanneau.svelte') then m}
    <m.default cible={cibleEtiquettes} nom={album.title}
      onClose={() => (etiquettesOuvertes = false)} />
  {/await}
{/if}
<!-- Le menu « Ajouter à une collection » : une entrée par collection
     MANUELLE, ou l'état vide qui mène à l'écran Collections. Porté à la
     racine et posé en `fixed` : la fiche défile. -->
<svelte:window onclick={fermerMenuCollection} onkeydown={auClavierCollection}
  onresize={fermerMenuCollection} onscrollcapture={fermerMenuCollection} />
{#if menuCollectionOuvert && ancreCollection}
  <div class="coll-menu tune-v2" role="menu" tabindex="-1" use:portail
    aria-label={$tr('v2.album.addToCollection' as any)}
    style={styleMenuAncre(ancreCollection, Math.max(2, entreesCollection.length), window, LARGEUR_MENU_COLLECTION)}>
    {#if entreesCollection.length}
      {#each entreesCollection as e (e.id)}
        <button type="button" role="menuitem" class="coll-item" class:deja={e.deja}
          onclick={(ev) => choisirCollection(ev, e.faire)}>{e.libelle}</button>
      {/each}
    {:else}
      <p class="coll-vide">{$tr('v2.album.noCollection' as any)}</p>
      <button type="button" role="menuitem" class="coll-item coll-lien" onclick={allerCollections}>
        {$tr('v2.nav.collections' as any)}
      </button>
    {/if}
  </div>
{/if}

<style>
  /* Le menu des collections. `fixed` + `use:portail` : voir l'en-tête du
     `<script>`. Même gabarit que le panneau de `MenuZone`. */
  .coll-menu{position:fixed; z-index:60; width:240px; padding:6px; display:flex; flex-direction:column; gap:1px;
    border-radius:var(--v2-r-md); border:1px solid var(--v2-line2); background:var(--v2-surface);
    color:var(--v2-txt); font-family:var(--v2-sans); box-shadow:0 18px 40px rgba(0,0,0,.5)}
  .coll-item{display:block; width:100%; min-height:34px; padding:7px 10px; border:0; border-radius:8px;
    background:transparent; color:var(--v2-txt); font:13px var(--v2-sans); text-align:left; cursor:pointer;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .coll-item:hover{background:var(--v2-surface2)}
  .coll-item:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:-2px}
  .coll-item.deja{color:var(--v2-txt3)}
  .coll-lien{color:var(--v2-acc-tint)}
  .coll-vide{margin:0; padding:7px 10px; font-size:12px; line-height:1.4; color:var(--v2-txt3); white-space:normal}
  .v2-detail{position:absolute; inset:0; z-index:30; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow-y:auto; padding:26px 34px 40px}
  .close{position:sticky; top:0; margin-bottom:8px; width:40px; height:40px; border-radius:12px; cursor:pointer;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt2); display:grid; place-items:center}
  .close:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .close svg{width:18px; height:18px}

  .head{display:flex; gap:30px; padding:6px 0 26px}
  .art{width:240px; height:240px; border-radius:8px; overflow:hidden; flex:0 0 auto; box-shadow:var(--v2-sh-lg)}
  .meta{display:flex; flex-direction:column; gap:12px; padding-top:8px}
  /* Le badge de qualité et la pastille « compilation » sur la MÊME ligne, et
     non deux blocs empilés : ce sont deux étiquettes de même rang, et empilées
     elles pousseraient le titre de l'album hors du premier coup d'œil. */
  .qrow{display:flex; align-items:center; gap:10px; flex-wrap:wrap}
  .qbadge.cue{background:transparent; border:1px solid var(--v2-line2); color:var(--v2-txt2)}
  .qbadge{font:700 11px var(--v2-mono); letter-spacing:.04em; padding:6px 10px; border-radius:8px;
    color:var(--v2-acc-tint); border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .meta h1{font-size:38px; font-weight:800; letter-spacing:-.01em; line-height:1.05}
  .artist{font-size:18px; color:var(--v2-txt2)}
  /* Le bouton doit se lire comme le texte qu'il remplace : même taille, même
     couleur, aligné à gauche. Ce qui l'annonce comme un lien, c'est le
     survol et le focus — visible AU CLAVIER, pas seulement à la souris. */
  .artist.lien{border:0; background:transparent; padding:0; font-family:inherit;
    text-align:left; cursor:pointer}
  .artist.lien:hover{color:var(--v2-acc-tint); text-decoration:underline}
  .artist.lien:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:3px; border-radius:4px}
  .facts{display:flex; gap:16px; font:12px var(--v2-mono); color:var(--v2-txt3)}
  /* Le DR DÉDUIT (moyenne des pistes) : tilde dans le texte, soulignement
     pointillé en `currentColor` — donc lisible dans les deux thèmes sans
     jeton de couleur, et sans peser sur la ligne. Une mesure d'album ne porte
     aucune marque : c'est la valeur nue. */
  .dr.deduit{text-decoration:underline dotted currentColor; text-underline-offset:3px; text-decoration-thickness:1px}
  /* `flex-wrap` : la rangée ne se coupait PAS, et à largeur de téléphone les
     cinq boutons débordaient déjà du cadre — en ajouter un sixième aurait
     poussé le cœur dehors. La seconde rangée (`.actions.local`) enroulait
     depuis toujours ; celle-ci n'avait simplement jamais reçu la règle.
     Sans effet au-dessus du seuil de débordement : l'écran large garde sa
     ligne unique. */
  .actions{display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin-top:8px}
  .actions.local{flex-wrap:wrap; align-items:center}
  .play,.ghost{display:inline-flex; align-items:center; gap:9px; height:44px; padding:0 20px; border-radius:var(--v2-r-pill);
    font:700 14px var(--v2-sans); cursor:pointer; border:0}
  .play{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); box-shadow:0 6px 18px var(--v2-glow-strong)}
  .ghost{color:var(--v2-txt); background:transparent; border:1px solid var(--v2-line2)}
  .ghost:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  /* Le cœur ACTIF garde le rouge : c'est un ÉTAT, pas une action — la même
     règle que sur les lignes de piste. */
  .coeur.on{color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .coeur.on:hover{color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .coeur:disabled{opacity:.55; cursor:default}
  .play svg,.ghost svg{width:16px; height:16px}

  .tracks{display:flex; flex-direction:column; gap:1px}
  /* #4767 — la pastille de focus : visible sans crier, au-dessus de la liste
     qu'elle explique. Même dessin que la puce de portée de la Bibliothèque. */
  .focus-artiste{padding:2px 0 10px}
  .fchip{display:inline-flex; align-items:center; gap:8px; padding:6px 8px 6px 12px;
    border-radius:var(--v2-r-pill); font:600 12px var(--v2-sans);
    color:var(--v2-acc1); background:var(--v2-acc-soft);
    border:1px solid color-mix(in srgb, var(--v2-acc1) 40%, transparent)}
  .fchip svg{width:14px; height:14px; flex:none}
  .fchip button{display:flex; align-items:center; justify-content:center; width:18px; height:18px;
    padding:0; border:0; border-radius:50%; cursor:pointer; font:600 14px var(--v2-sans);
    background:transparent; color:inherit; line-height:1}
  .fchip button:hover{background:color-mix(in srgb, var(--v2-acc1) 22%, transparent)}
  .fchip button:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:2px}
  .state{padding:24px 6px; color:var(--v2-txt3)} .state.err{color:var(--v2-danger)}
  /* Les regles de LIGNE ont disparu avec la boucle qu'elles habillaient :
     la fiche monte `ListePistesV2`, qui porte les siennes. Le compilateur
     Svelte les signalait toutes les neuf en « Unused CSS selector » des que
     ce composant etait compile (#1957, garde de montage). */

  /* Présentation de l'album (#3586) — repliée par défaut, comme dans
     l'interface actuelle : la route sort sur le réseau quand la notice
     manque, cf. `basculerBio`. */
  .bio{margin:18px 0 4px; display:flex; flex-direction:column; gap:10px; align-items:flex-start}
  .bio-toggle{display:inline-flex; align-items:center; gap:6px; cursor:pointer;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt2);
    border-radius:10px; padding:6px 12px; font-family:var(--v2-sans); font-size:13px}
  .bio-toggle:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .bio-text{margin:0; color:var(--v2-txt2); font-size:14px; line-height:1.65; max-width:70ch}
  .bio-state{margin:0; color:var(--v2-txt3); font-size:13px; font-style:italic}
  .bio-state.err{color:var(--v2-danger)}
</style>
