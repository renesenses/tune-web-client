<script lang="ts">
  import { labelDe, ouvrirLabelDansLaBibliotheque } from '../../lib/artistesDuLabel';
  import { labelQobuzDe, ouvrirLabelDeService } from '../../lib/labelDeService';
  import BadgeReaffectation from './BadgeReaffectation.svelte';
  import ApportsQobuzAlbum from './ApportsQobuzAlbum.svelte';
  import { bulleTexte } from '../../lib/infobulleTexte';
  /**
   * Fiche album du nouveau client (direction Levente). Ouvre par-dessus la
   * grille : pochette + métadonnées + liste de pistes jouables. Détail
   * technique (fréquence/profondeur) à l'Expert, comme partout ailleurs.
   */
  import { get } from 'svelte/store';
  import { tick, untrack } from 'svelte';
  import * as api from '../../lib/api';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { mentionAussiSur, type AussiSur } from '../../lib/aussiSur';
  import { t as tr, tn } from '../../lib/i18n';
  import EcoutesCommunaute from '../partages/EcoutesCommunaute.svelte';
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
  import type { Album, Source, Track } from '../../lib/types';
  import type { CibleFicheAlbumService } from '../../lib/stores/streaming';
  import DisponibiliteUpnp from './DisponibiliteUpnp.svelte';
  import AlbumArt from '../partages/AlbumArt.svelte';
import AlbumRating from '../partages/AlbumRating.svelte';
import MesNotes from '../partages/MesNotes.svelte';
import ReportButton from '../partages/ReportButton.svelte';
import { libelleQualite, autreAlbumMeilleur } from '../../lib/meilleureQualite';
import { chargerLivrets, cibleLivrets, type Livret } from '../../lib/livretsAlbum';
  import ClampedText from '../partages/ClampedText.svelte';
  import AttributionBio from './AttributionBio.svelte';
  import TexteDeBio from './TexteDeBio.svelte';
  import { segmentsAffichables } from '../../lib/library/bioSegments';
  import MentionRepliBio from './MentionRepliBio.svelte';
  import { langueBioDe, AUCUNE_LANGUE, type LangueBio } from '../../lib/library/langueBio';
  import { provenanceDe, type BioProvenance } from '../../lib/library/attributionBio';
  import ListePistesV2 from './ListePistesV2.svelte';
  import BoutonLectureV2 from './BoutonLectureV2.svelte';
  import BoutonMenuV2 from './BoutonMenuV2.svelte';
  import type { EntreeMenu } from '../../lib/menuPiste';
  import EditionAlbumV2 from './EditionAlbumV2.svelte';
  import SuggestionsIaAlbumV2 from './SuggestionsIaAlbumV2.svelte';
  import NotesPochetteIaV2 from './NotesPochetteIaV2.svelte';
  import { estReponseEdition, defaireCoffretManuelAnnonce, type EditionReponse } from '../../lib/editionAlbum';
  import { ordreCoffretAnnonce } from '../../lib/ordreCoffret';
  import OrdreCoffretFicheV2 from './OrdreCoffretFicheV2.svelte';
  import {
    SELECTION_VIDE, appliquerGenre, basculer, choisiesDansLOrdre, corpsArtistePistes,
    idsSelectionnables, restreindre, toutEstChoisi, toutOuRien, type Bilan, type EtatSelection,
  } from '../../lib/selectionPistes';
  import { circleCharge } from '../../lib/circle';
  import { demandeCercle } from '../../lib/circlePlaylists';
  import { badgeHiRes, type BadgeHiRes } from '../../lib/badgeHiRes';
  import PastilleCompilation from './PastilleCompilation.svelte';
  import { corpsDeLecture, corpsDeFileListe, corpsDeTeteDeListe } from '../../lib/pisteFile';
  import { rangLireEnsuite } from '../../lib/stores/queue';
  import { lireListe, lireListeDepuis, pistesJouables } from '../../lib/lectureEnMasse';
  import { pisteIndisponible } from '../../lib/albumAParaitre';
  import type { GesteDisque } from '../../lib/lectureDisque';
  import { notifications } from '../../lib/stores/notifications';
  import { cleEchecRevelation, revelationDisponible, revelerDossierAlbum } from '../../lib/revelerDossier';
  import { fichiersInchanges } from '../../lib/ecritureFichiers';
  import { favoriteAlbumIds, favoriteStreamingKeys } from '../../lib/stores/profile';
  import { basculerFavoriLocal } from '../../lib/favorisLocaux';
  import { favKeyOf, refFavoriDeFiche, toggleStreamingFavorite } from '../../lib/streamingFavorites';
  import { corpsLecture, pistesAlbumDistant, type DepotDistant } from '../../lib/tuneRemote';
  import { cibleEtiquetteAlbum, type CibleEtiquette } from '../../lib/cibleEtiquette';
  import { basculerLeSas, chargerSas, estDansLeSas, rangeableDansLeSas, sasEcouterPlusTard } from '../../lib/ecouterPlusTard';
  import { tip } from '../../lib/tooltip';
  import { afficherDynamicRange } from '../../lib/dynamicRange';
  import { corpsDeLectureBandcamp } from '../../lib/bandcampLecture';
  import { activeView, pendingLibraryAlbum, pendingModeModifier, vueDeRetour, gestesNavigationService } from '../../lib/stores/navigation';
  import { reidentifierAlbum } from '../../lib/gestesObjet';
  import { destinationArtiste } from '../../lib/routageArtiste';
  import { ouvrirArtisteDepuis } from '../../lib/ouvrirArtisteDepuis';
  import { cleDetailAlbum } from '../../lib/cleDetailAlbum';
  import { currentShortcutTarget, setShortcutTarget, type ShortcutTarget } from '../../lib/stores/shortcuts';
  import { cibleRaccourciAlbum } from '../../lib/raccourciAlbum';
  import { detailOuvert, fermerDetail } from '../../lib/historiqueCoquille';

  import { dossierDeLAlbum } from '../../lib/dossierAlbum';
  import { qualiteDuRepertoire, repertoiresDeLecture } from '../../lib/repertoireAlbum';
  import { ouvrirLeRepertoire } from '../../lib/stores/repertoireCible';
  import { chargerCollectionsCibles, entreesAjoutCollection, lignesMenuEnRayons, type CollectionCible } from '../../lib/albumVersCollection';
  import { rafraichirRayons, type EtatRayons } from '../../lib/rayonsCollections';
  import { styleMenuAncre } from '../../lib/ancrageMenu';
  import { portail } from '../../lib/portail';
  import { estMarqueIa, marquageIaADemander } from '../../lib/contenuIa';
import { creditsAlbumDeServiceDe, servicesCreditsRefuses, type AlbumDeServiceCredits } from '../../lib/creditsService';
import { chargerPresentation, presentationAlbumDeServiceDe, servicesPresentationRefuses, type EtatPresentation } from '../../lib/presentationAlbumService';
  import { dialogs } from '../../lib/stores/dialogs';
  import { origineDuCoffret, EVT_COFFRET_DEFAIT, type OrigineCoffret } from '../../lib/coffretAuto';
  import { chargerOeuvreAlbum, choisirVersionPreferee, libelleVersion, type OeuvreAlbum } from '../../lib/oeuvres';
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
    // #5530 — un album Qobuz reçu sans son marquage IA le demande aussi.
    const manque = !enTeteComplet(album) || marquageIaADemander(svc, album);
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
  // tune-server-rust#4805 lot 2 — la pochette plus nette posée depuis la
  // fiche, affichée sans recharger l'album.
  let pochetteRemplacee = $state<string | null>(null);
  $effect(() => {
    void album.id; // un autre album : on oublie la pochette posée sur le précédent
    pochetteRemplacee = null;
  });

  const albumAffiche = $derived.by(() => {
    const d = detailService;
    if (!d) return album;
    const fusion: any = { ...(album as any) };
    for (const cle of ['cover_path', 'artist_name', 'artist_id', 'year', 'release_date', 'original_year', 'original_date']) {
      if (vide(fusion[cle])) fusion[cle] = (d as any)[cle] ?? null;
    }
    // #5530 — le marquage IA, seulement si l'appelant ne l'avait pas.
    if (fusion.ai_generated === undefined && typeof (d as any).ai_generated === 'boolean') {
      fusion.ai_generated = (d as any).ai_generated;
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
      : cibleEtiquetteAlbum({
          ...(album as any),
          source: (album as any).source ?? service ?? (bandcamp ? 'bandcamp' : null),
          source_id: (album as any).source_id ?? bandcamp ?? null,
        }),
  );
  /** Le panneau partagé — celui des vignettes, pas une seconde copie. */
  let etiquettesOuvertes = $state(false);

  /**
   * web#2202 (Sandro, fil 2285 ; Patatorz, fil 2325) — « Écouter plus tard »
   * sur la FICHE d'un album. Le geste de web#1653 n'existait que dans le menu
   * « … » des vignettes et des pistes : la fiche, qui n'a pas de menu « … »,
   * ne l'offrait nulle part.
   *
   * Même désignation que les étiquettes (`cibleEtiquettes`) et même module
   * que les vignettes (`lib/ecouterPlusTard`) : album de la bibliothèque comme
   * de service, ABSENT pour le dépôt distant. La lecture de l'état est
   * synchrone, dans le magasin ; la liste du sas est lue une fois.
   */
  const dansLeSas = $derived<boolean | null>(
    rangeableDansLeSas(cibleEtiquettes) ? estDansLeSas(cibleEtiquettes, $sasEcouterPlusTard) : null,
  );
  $effect(() => { if (dansLeSas !== null) untrack(() => void chargerSas()); });

  /**
   * LA FICHE SE DÉCLARE COMME CIBLE DE RACCOURCI — fil 2143, point 2.
   *
   * FabienM : « impossible de définir un raccourci sur […] un album ouvert ».
   * Même mécanisme que la page d'artiste (#1501) et les listes de lecture
   * (`setShortcutTarget`) ; la forme et la restitution vivent dans
   * `lib/raccourciAlbum`.
   *
   * 🔴 La fiche est un CALQUE par-dessus un écran qui a pu publier SA cible
   * (une collection, une étiquette, une page d'artiste) : on la retient en
   * s'ouvrant et on la rend en se refermant — sans quoi, la fiche refermée,
   * un raccourci posé sur la collection viserait encore l'album. On ne la
   * rend que si la cible courante est toujours la nôtre : un écran qui a
   * publié depuis garde la main.
   */
  const cibleRaccourci = $derived(cibleRaccourciAlbum({ album: albumAffiche, service, depot, bandcamp }));
  let cibleDessous: ShortcutTarget | null | undefined = undefined;
  let clePubliee: string | null = null;
  $effect(() => {
    const c = cibleRaccourci;
    untrack(() => {
      if (cibleDessous === undefined) cibleDessous = get(currentShortcutTarget);
      if (!c) return;
      setShortcutTarget(c);
      clePubliee = c.key;
    });
  });
  $effect(() => () => {
    if (clePubliee != null && get(currentShortcutTarget)?.key === clePubliee) setShortcutTarget(cibleDessous ?? null);
  });

  /**
   * « Crédits » — #1572 (FabienM, fil forum 1921 : « ajouter un bouton pour
   * consulter les crédits d'un album »). Les crédits sont ceux des pistes de
   * la BIBLIOTHÈQUE (`track_credits`) : ni dépôt distant — son `id` est celui
   * d'un autre serveur —, ni album de service.
   *
   * #4993 — un album de SERVICE aussi, quand son service rend des crédits
   * (`GET /streaming/{service}/albums/{id}/credits`, Qobuz seul). La règle vit
   * dans `lib/creditsService` : les services qui répondent 501 (Tidal,
   * Deezer…) n'ont pas le bouton, Bandcamp et le dépôt distant non plus.
   */
  const creditsPossibles = $derived(album.id != null && !depot && !service && !bandcamp);

  /**
   * tune-server-rust#6934 — le label de l'album CHEZ QOBUZ, pour ouvrir la
   * page « Label » du catalogue :
   *   • album Qobuz → `GET /streaming/qobuz/albums/{id}/context` (lu sur la
   *     réponse `album/get` déjà en cache côté serveur) ;
   *   • album de la bibliothèque → le `qobuz_label_id` que le serveur a
   *     rapproché pour son label (`GET /library/labels`), sinon rien.
   * Sans compte Qobuz, ni service, ni label rapproché : aucun lien.
   */
  let labelQobuz = $state<{ id: string; nom: string } | null>(null);
  let jetonLabelQobuz = 0;
  $effect(() => {
    const j = ++jetonLabelQobuz;
    labelQobuz = null;
    if (depot || bandcamp) return;
    if (service === 'qobuz' && sidDistant) {
      const sid = String(sidDistant);
      void api.getStreamingAlbumContext('qobuz', sid).then((c) => {
        if (j === jetonLabelQobuz && c?.label_id) labelQobuz = { id: c.label_id, nom: c.label_name ?? '' };
      });
      return;
    }
    const nom = creditsPossibles ? labelDe(albumAffiche) : null;
    if (!nom) return;
    void api.getLibraryLabels().then((labels) => {
      const id = labelQobuzDe(nom, labels);
      if (j === jetonLabelQobuz && id) labelQobuz = { id, nom };
    });
  });
  const creditsDeService = $derived(
    depot || bandcamp ? null : creditsAlbumDeServiceDe(service, sidDistant, $servicesCreditsRefuses),
  );
  /** Relevé AU CLIC : un refus (501/404) retire le bouton, pas le tiroir ouvert. */
  let creditsServiceOuvert = $state.raw<AlbumDeServiceCredits | null>(null);

  /**
   * #6481 — le LIVRET PDF (cpadiou77 et Patatorz, fil forum 2326) : les PDF du
   * dossier d'un album de la bibliothèque, ou le livret numérique de Qobuz.
   * Lus à l'ouverture de la fiche — une lecture de dossier, ou la réponse
   * `album/get` que le serveur garde déjà en cache : le bouton n'apparaît que
   * s'il y a un livret à ouvrir.
   */
  let livrets = $state.raw<Livret[]>([]);
  $effect(() => {
    const cible = cibleLivrets(album as any, { service, depot, bandcamp });
    livrets = [];
    if (!cible) return;
    let perime = false;
    void chargerLivrets(cible, {
      base: api.BASE,
      locaux: api.getAlbumBooklets,
      deService: api.getStreamingAlbumBooklets,
      navigateur: api.urlDeNavigation,
    }).then((l) => { if (!perime) livrets = l; });
    return () => { perime = true; };
  });

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
  /** L'arbre des rayons (#4853), relu par le chargeur de l'écran Collections
   *  et de la barre latérale — `rafraichirRayons`, une seule source. Serveur
   *  antérieur ou panne : `plat`, et le menu reste la liste d'avant. */
  let rayonsCollection = $state<EtatRayons>({ mode: 'plat' });
  /** Fil 1928 (Lulu) : les collections rangées sous leurs rayons, indentées. */
  const lignesCollection = $derived(
    lignesMenuEnRayons(entreesCollection, rayonsCollection, $tr('v2.rayons.unfiled' as any)),
  );
  /**
   * web#2736 — le menu s'ouvre depuis l'entrée « Ajouter à › Collection » du
   * menu « … » : il se pose sous CE bouton, et le focus entre dans la liste
   * (le menu « … » s'est refermé en rendant le focus à son bouton).
   */
  async function ouvrirMenuCollection() {
    const r = boutonPlus?.getBoundingClientRect();
    if (!r) return;
    ancreCollection = { top: r.top, bottom: r.bottom, right: r.right };
    const [cibles, rayons] = await Promise.all([
      chargerCollectionsCibles(),
      rafraichirRayons(api.getCollectionFolders),
    ]);
    collectionsCibles = cibles;
    rayonsCollection = rayons;
    menuCollectionOuvert = true;
    await tick();
    elementsCollection()[0]?.focus();
  }
  const elementsCollection = () =>
    Array.from(document.querySelectorAll<HTMLElement>('.coll-menu [role="menuitem"]'));
  function fermerMenuCollection() { menuCollectionOuvert = false; }
  /** Un défilement de la PAGE ferme le menu : posé en `fixed` aux coordonnées
   *  du bouton, il resterait figé loin de lui. Mais le menu défile lui-même
   *  depuis #1575 (hauteur bornée à la fenêtre) : ce défilement-là est le
   *  seul moyen d'atteindre les dernières collections, il ne doit pas le
   *  fermer. */
  function auDefilementCollection(e: Event) {
    const cible = e.target as Element | null;
    if (cible && typeof cible.closest === 'function' && cible.closest('.coll-menu')) return;
    menuCollectionOuvert = false;
  }
  function auClavierCollection(e: KeyboardEvent) {
    if (!menuCollectionOuvert) return;
    if (e.key === 'Escape') { menuCollectionOuvert = false; boutonPlus?.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const l = elementsCollection();
    if (!l.length) return;
    e.preventDefault();
    const i = l.indexOf(document.activeElement as HTMLElement);
    l[(i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length]?.focus();
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

  /* ══════════════════════════════════════════════════════════════════════
     web#2736 — MOINS DE BOUTONS (Bertrand, 09/11/2026).

     L'en-tête comptait une vingtaine de boutons. Il en garde trois et un menu :

         [ ▶ Lecture | ▾ ]  [ ♡ ]  [ … ]   (rc12 : ⤮ passé sous ▾)

     « Lire ensuite » et « Ajouter à la file » passent sous la flèche du bouton
     Lecture (`BoutonLectureV2`) ; tout le reste dans « … », par groupes.
     AUCUN geste ne disparaît : chacun garde sa garde d'avant — une entrée qui
     ne s'applique pas à CET album est absente, pas grisée — et son attribut
     `data-*`. Crédits, Bio et Présentation deviennent des onglets au-dessus
     des pistes (voir `onglet`).
     ══════════════════════════════════════════════════════════════════════ */
  let boutonPlus = $state<HTMLElement | null>(null);
  function entreesPlus(): EntreeMenu[] {
    const l: EntreeMenu[] = [];
    const ajout = 'v2.menu.addTo', infos = 'v2.menu.info', biblio = 'v2.menu.library';
    // ▸ Ajouter à — #2096 : pas pour un dépôt distant, ses pistes ne se désignent pas ici.
    if (!depot && tracks.length) l.push({ groupe: ajout, cle: 'v2.menu.toPlaylist', bulle: 'v2.album.addToPlaylistTip',
      faire: () => (playlistAlbum = true), attrs: { 'data-album-playlist': true, 'aria-haspopup': 'dialog' } });
    // Un album de la BIBLIOTHÈQUE seulement : voir « Ajouter à une collection ».
    if (album.id != null && !depot) l.push({ groupe: ajout, cle: 'v2.menu.toCollection', bulle: 'v2.album.addToCollectionTip',
      faire: () => void ouvrirMenuCollection(), attrs: { 'data-album-collection': true, 'aria-haspopup': 'menu' } });
    // web#2202 — « Écouter plus tard », AVANT les étiquettes.
    if (dansLeSas !== null) l.push({ groupe: ajout, cle: dansLeSas ? 'v2.later.remove' : 'v2.later.add',
      bulle: dansLeSas ? 'v2.later.albumRemoveTip' : 'v2.later.albumAddTip', active: dansLeSas,
      // Clé calculée : `check-francais-v2` lirait « plus » dans le littéral.
      faire: () => void basculerLeSas(cibleEtiquettes), attrs: { [`data-ecouter-plus-tard`]: true } });
    if (cibleEtiquettes) l.push({ groupe: ajout, cle: 'v2.cover.tags', bulle: 'v2.album.tagsTip',
      faire: () => (etiquettesOuvertes = true), attrs: { 'data-etiquettes-album': true, 'aria-haspopup': 'dialog' } });
    // ▸ Infos — l'assistant IA : mêmes albums que « Modifier ».
    if (edition && !enEdition && album.id != null) {
      l.push({ groupe: infos, cle: 'assistantIa.album.button', bulle: 'assistantIa.album.tip', secondaire: true,
        faire: () => (suggestionsIa = true), attrs: { 'data-suggestions-ia-album': true } });
      l.push({ groupe: infos, cle: 'assistantIa.notes.button', bulle: 'assistantIa.notes.tip', secondaire: true,
        faire: () => (notesIa = true), attrs: { 'data-notes-ia-album': true } });
    }
    // #6481 — le livret s'ouvre dans un nouvel onglet.
    for (const lv of livrets) l.push({ groupe: infos, cle: 'v2.album.booklet',
      suffixe: livrets.length > 1 && lv.nom ? lv.nom.replace(/\.pdf$/i, '') : undefined,
      faire: () => void window.open(lv.url, '_blank', 'noopener,noreferrer'), attrs: { 'data-livret': lv.url } });
    // ▸ Bibliothèque
    if (selectionPossible && !enEdition && ordreSelection.length > 0) l.push({ groupe: biblio,
      cle: enSelection ? 'v2.selection.done' : 'v2.selection.start', bulle: 'v2.selection.startTip', active: enSelection,
      faire: () => { onglet = 'pistes'; if (enSelection) quitterSelection(); else enSelection = true; },
      attrs: { 'data-selection-album': true } });
    if (edition && !enEdition) l.push({ groupe: biblio, cle: 'v2.edition.modify', bulle: 'v2.edition.modifyTip',
      faire: () => { onglet = 'pistes'; enEdition = true; }, attrs: { 'data-modifier-album': true } });
    // rc12 — réidentifier (MusicBrainz) et le dossier sur disque sont des
    // outils d'EXPERT : absents au niveau Essentiel, sous « Plus… » sinon.
    if (album.id != null && !depot && !essentiel) l.push({ groupe: biblio, secondaire: true,
      cle: reidentification ? 'library.reidentifying' : 'library.reidentify', desactive: reidentification, bulle: 'v2.album.reidentifyTip',
      faire: () => void reidentifier(), attrs: { 'data-reidentifier-album': true } });
    // Le dossier n'existe que pour un album LOCAL dont les pistes portent un chemin.
    if (dossier && !essentiel) {
      l.push({ groupe: biblio, secondaire: true, cle: 'v2.album.locate', bulle: 'v2.album.locateTip', faire: localiser, attrs: { 'data-localiser-album': true } });
      if (revelable) l.push({ groupe: biblio, secondaire: true, cle: 'v2.album.reveal', bulle: 'v2.album.revealTip',
        faire: () => void ouvrirDansLExplorateur(), attrs: { 'data-reveler-album': true } });
    }
    // #8571 (fil 2763) — réordonner les albums d'un coffret composé à la
    // main, sur un serveur qui l'annonce (sonde `ordre_coffret`).
    if (coffretReordonnable() && !enEdition) l.push({ groupe: biblio, secondaire: true, cle: 'v2.album.boxReorder', bulle: 'v2.album.boxReorderTip',
      active: enOrdreCoffret,
      faire: () => { onglet = 'pistes'; enOrdreCoffret = !enOrdreCoffret; }, attrs: { 'data-reordonner-coffret': true } });
    if (coffretDefaisable()) l.push({ groupe: biblio, secondaire: true, cle: 'v2.album.boxUndo', desactive: defaireEnCours, bulle: 'v2.album.boxUndoTip',
      faire: () => void defaireCoffret(), attrs: { 'data-defaire-coffret': true } });
    return l;
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

  /** tune-server-rust#6285 — le verdict des faux hi-res, album LOCAL seulement.
   *  Un serveur antérieur (404) ou un album jamais mesuré : pas de badge. */
  let hiRes = $state<BadgeHiRes>(null);
  $effect(() => {
    const id = album?.id;
    const local = album != null && (album.source == null || album.source === 'local');
    hiRes = null;
    if (id == null || !local) return;
    let annule = false;
    api.getAlbumHiRes(id)
      .then((v) => { if (!annule) hiRes = badgeHiRes(v); })
      .catch(() => { if (!annule) hiRes = null; });
    return () => { annule = true; };
  });
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

  /**
   * « Défaire le coffret » — GO de Bertrand du 25/09/2026. Seulement sur un
   * coffret AUTOMATIQUE d'un album LOCAL : l'origine se lit dans le magasin
   * clé-valeur de l'album (`coffret`, voir `lib/coffretAuto.ts`).
   *
   * Un coffret MANUEL a le sien depuis la décision de Bertrand du 29/09/2026
   * (tune-server-rust#5319) : `POST /library/coffrets/{id}/defaire-manuel`.
   * 🔴 LA SONDE DÉCIDE : la fiche d'édition (`edition`, plus bas) doit annoncer
   * `defaire_coffret_manuel`. Un serveur antérieur ne l'annonce pas, et sa
   * route des coffrets automatiques répondrait 409 : pas de bouton.
   */
  let origineCoffret = $state<OrigineCoffret | null>(null);
  let defaireEnCours = $state(false);
  $effect(() => {
    const id = album.id;
    origineCoffret = null;
    if (id == null || depot || service || bandcamp || (album.source && album.source !== 'local')) return;
    api.getAlbumExtendedMetadata(id)
      .then((m) => { if (album.id === id) origineCoffret = origineDuCoffret(m?.coffret); })
      .catch(() => { /* pas de bouton : rien n'est promis */ });
  });
  function coffretDefaisable(): 'auto' | 'manuel' | null {
    if (origineCoffret === 'auto') return 'auto';
    if (origineCoffret === 'manuel' && edition?.album.id === album.id && defaireCoffretManuelAnnonce(edition)) {
      return 'manuel';
    }
    return null;
  }
  /** #8571 — le panneau « Réordonner les albums » est ouvert. */
  let enOrdreCoffret = $state(false);
  function coffretReordonnable(): boolean {
    return origineCoffret === 'manuel' && edition?.album.id === album.id && ordreCoffretAnnonce(edition);
  }
  async function defaireCoffret() {
    const id = album.id;
    const genre = coffretDefaisable();
    if (id == null || defaireEnCours || genre == null) return;
    const question = genre === 'auto' ? 'v2.album.boxUndoConfirm' : 'v2.album.boxUndoManualConfirm';
    const ok = await dialogs.confirm($tr(question as any), { danger: true });
    if (!ok) return;
    defaireEnCours = true;
    let reussi = false;
    try {
      await (genre === 'auto' ? api.defaireCoffret(id) : api.defaireCoffretManuel(id));
      reussi = true;
    } catch {
      reussi = false;
    }
    defaireEnCours = false;
    if (!reussi) {
      notifications.error($tr('v2.album.boxUndoError' as any));
      return;
    }
    notifications.success($tr('v2.album.boxUndone' as any));
    // La liste des Coffrets, si elle est ouverte dessous, se recharge.
    window.dispatchEvent(new CustomEvent(EVT_COFFRET_DEFAIT, { detail: { id } }));
    // Retour là d'où l'on venait : la liste des coffrets, ou la bibliothèque.
    // Cette fiche décrit un album qui n'est plus ce qu'elle montre.
    onClose();
  }
  /**
   * #1875 — « Ouvrir dans l'explorateur » : le gestionnaire de fichiers de la
   * machine du serveur, quand le navigateur est sur cette machine. Le serveur
   * seul sait le dire ; tant qu'il n'a pas dit oui, le bouton est absent.
   */
  let revelable = $state(false);
  $effect(() => {
    if (!dossier || album.id == null) { revelable = false; return; }
    let vivant = true;
    void revelationDisponible().then((oui) => { if (vivant) revelable = oui; });
    return () => { vivant = false; };
  });
  async function ouvrirDansLExplorateur() {
    if (album.id == null) return;
    try {
      await revelerDossierAlbum(album.id);
    } catch (e) {
      notifications.error($tr(cleEchecRevelation((e as api.ApiError)?.code) as any));
    }
  }

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
  /** rc12 — niveau Essentiel : les outils d'expert du menu « … » n'y sont pas proposés. */
  const essentiel = $derived(!atLeast($preferences.settingsLevel, 'intermediate'));

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
    // Le mode « Modifier » vient d'enregistrer : relire la liste.
    void rechargement;
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
          // web#1923, #1924 : chaque piste garde la page de SON album. Lancée
          // seule (aléatoire, file, menu de la ligne), elle l'emporte dans
          // `album_ref` (`champAlbumBandcamp`), sans quoi un titre que Tune
          // n'a jamais vu entrait en file sans album.
          album_id_service: d2?.url ?? bc,
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
    void rechargement;
    fiche = null;
    if (id == null || d || svc || bc) return;
    let vivant = true;
    api.getAlbum(id).then((a) => { if (vivant) fiche = a; }).catch(() => {});
    return () => { vivant = false; };
  });

  // #1684 — la liste des exemplaires vient de la fiche locale complète. Les
  // anciens serveurs n'envoient pas ce champ : aucun contrôle n'est affiché.
  const repertoiresDeCetAlbum = $derived(repertoiresDeLecture(fiche));
  let racinePreferee = $state<string | null>(null);
  let preferenceChargee = $state(false);
  let preferenceEnCours = $state(false);
  let erreurPreference = $state('');
  $effect(() => {
    const id = album.id, d = depot, svc = service, bc = bandcamp;
    const racines = repertoiresDeCetAlbum;
    racinePreferee = null;
    preferenceChargee = false;
    preferenceEnCours = false;
    erreurPreference = '';
    if (id == null || d || svc || bc || !racines.length) return;
    let vivant = true;
    api.getAlbumPreferredDirectory(id)
      .then((r) => {
        if (!vivant) return;
        racinePreferee = r.racine;
        preferenceChargee = true;
      })
      .catch(() => { /* Un serveur antérieur n'a pas cette route. */ });
    return () => { vivant = false; };
  });

  async function choisirRepertoire(event: Event) {
    const element = event.currentTarget as HTMLSelectElement;
    const id = album.id;
    if (id == null || preferenceEnCours) return;
    const avant = racinePreferee;
    const voulu = element.value;
    preferenceEnCours = true;
    erreurPreference = '';
    try {
      const r = voulu
        ? await api.setAlbumPreferredDirectory(id, voulu)
        : await api.clearAlbumPreferredDirectory(id);
      if (album.id === id) racinePreferee = r.racine;
    } catch {
      if (album.id === id) {
        element.value = avant ?? '';
        erreurPreference = get(tr)('v2.album.sourceSaveError' as any);
      }
    } finally {
      if (album.id === id) preferenceEnCours = false;
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     LE MODE « MODIFIER » — GO de Bertrand, 25/09/2026.

     Éditer l'album, ses disques et ses pistes SUR PLACE : voir
     `EditionAlbumV2` et `lib/editionAlbum`. Un album de la BIBLIOTHÈQUE
     seulement — ni dépôt distant (son `id` est celui d'un autre serveur), ni
     service, ni Bandcamp.

     🔴 LA SONDE DÉCIDE DU BOUTON. `GET /library/albums/{id}/edition` n'existe
     que sur un serveur qui a le lot `edition-coffrets` : un serveur antérieur
     répond 404, et « Modifier » n'apparaît pas. Un bouton qui échouerait au
     clic promettrait ce que le serveur ne sait pas faire.

     `rechargement` avance après un enregistrement, un détachement ou un
     ajout de disque : les pistes, la fiche et la sonde se relisent.
     ══════════════════════════════════════════════════════════════════════ */
  let rechargement = $state(0);
  let edition = $state.raw<EditionReponse | null>(null);
  let enEdition = $state(false);
  /** Assistant IA, étape 1 : la fenêtre des suggestions de CET album. */
  let suggestionsIa = $state(false);
  /** Notes de pochette écrites par l'assistant (tune-server-rust, 23/10/2026). */
  let notesIa = $state(false);
  const editionPossible = $derived(album.id != null && !depot && !service && !bandcamp);
  $effect(() => {
    const id = album.id, possible = editionPossible;
    void rechargement;
    // Une RELECTURE du même album garde la fiche d'édition en place : le
    // mode ouvert ne se démonte pas le temps de la requête.
    if (untrack(() => edition)?.album.id !== id) edition = null;
    if (!possible || id == null) { edition = null; enEdition = false; return; }
    let vivant = true;
    api.getAlbumEdition(id)
      .then((r) => { if (vivant) edition = estReponseEdition(r) ? r : null; })
      .catch(() => { /* serveur sans la route : pas de bouton */ });
    return () => { vivant = false; };
  });
  // Une autre fiche s'ouvre : on ne reste pas en édition sur l'album d'avant.
  $effect(() => { void album?.id; enEdition = false; enOrdreCoffret = false; suggestionsIa = false; notesIa = false; });

  /**
   * « Modifier » depuis le menu « … » d'un album (`lib/gestesObjet`) : la fiche
   * s'ouvre, et passe en mode Modifier dès que la sonde de CET album est
   * revenue. La demande est consommée une fois — remise à `null`, elle ne
   * relance rien.
   */
  $effect(() => {
    const demande = $pendingModeModifier;
    if (demande == null || demande !== album.id || !edition) return;
    pendingModeModifier.set(null);
    enEdition = true;
  });

  async function apresEnregistrement() {
    const id = album.id;
    enEdition = false;
    rechargement += 1;
    if (id == null) return;
    // L'en-tête (titre, artiste, année) se relit comme après une
    // ré-identification.
    try {
      const a = await api.getAlbum(id);
      if (album.id === id && a) album = a;
    } catch { /* l'en-tête garde l'ancien texte ; les pistes, elles, sont relues */ }
  }

  /* ══════════════════════════════════════════════════════════════════════
     LA SÉLECTION MULTIPLE DES PISTES — web#1683, point 3 (go de Bertrand,
     27/09/2026).

     Levente Toth, fil 1998 : sélectionner plusieurs titres, voire tous,
     « in case the user wants to update metadata eg. Artist / Genre so they
     don't have to do it one-by-one ». Le mode « Modifier » édite l'artiste
     piste par piste ; il n'avait aucun geste groupé, et le genre d'une piste
     n'y figure pas.

     Un album de la BIBLIOTHÈQUE seulement — la garde de `editionPossible` :
     toutes les actions groupées désignent une piste par son identifiant
     local. Les règles (plage, ordre, corps) vivent dans `lib/selectionPistes`.

     Les actions sont celles qui existaient déjà pour UNE piste ou pour
     l'album, sur les mêmes routes : lire (`track_ids`), lire ensuite et
     ajouter à la file (`queue/add` + `track_ids`), ajouter à une playlist
     (la fenêtre partagée, en une requête), et les deux éditions.
     ══════════════════════════════════════════════════════════════════════ */
  const selectionPossible = $derived(album.id != null && !depot && !service && !bandcamp);
  let enSelection = $state(false);
  let sel = $state.raw<EtatSelection>(SELECTION_VIDE);
  /** Les pistes cochables, dans l'ordre AFFICHÉ (focus artiste compris). */
  const ordreSelection = $derived(idsSelectionnables(pistesVisibles));
  const choisies = $derived(choisiesDansLOrdre(sel, ordreSelection));
  const toutChoisi = $derived(toutEstChoisi(sel, ordreSelection));
  let champGroupe = $state<'artist' | 'genre' | null>(null);
  let valeurGroupe = $state('');
  let groupeOccupe = $state(false);
  let playlistSelection = $state(false);
  /** web#2096 — « Ajouter à une playlist » pour l'album ENTIER (local ou de service). */
  let playlistAlbum = $state(false);
  // Une autre fiche s'ouvre : la sélection de l'album d'avant ne la suit pas.
  $effect(() => { void album?.id; quitterSelection(); });
  // Le mode Modifier et la sélection ne vivent pas ensemble : l'un remplace
  // la liste des pistes, l'autre la coche.
  $effect(() => { if (enEdition) untrack(quitterSelection); });
  // Après une relecture, ce qui a disparu se décoche. PAS pendant le
  // chargement : la liste repart vide, et tout se décocherait.
  $effect(() => {
    const o = ordreSelection;
    if (loading) return;
    sel = restreindre(untrack(() => sel), o);
  });

  function quitterSelection() {
    enSelection = false;
    sel = SELECTION_VIDE;
    champGroupe = null;
    valeurGroupe = '';
    playlistSelection = false;
  }
  function cocher(p: Track, _i: number, etendre: boolean) {
    if (typeof p.id !== 'number') return;
    sel = basculer(sel, p.id, ordreSelection, etendre);
  }
  function contexteAlbum(): Record<string, string> {
    if (depot) return {};
    const id = sidDistant ?? bandcamp ?? album.id;
    return id == null ? {} : { context_type: 'album', context_id: String(id), context_source: service ?? (bandcamp ? 'bandcamp' : 'local') };
  }

  function lireSelection() {
    const zid = zoneRequise();
    if (zid == null || !choisies.length) return;
    playAndSync(zid, { track_ids: [...choisies], ...contexteAlbum() }).catch(signalerEchecLecture);
  }
  /** UNE requête, dans l'ordre de l'album — la règle de `enfiler`. */
  async function enfilerSelection(position: number | undefined, cle: string) {
    const zid = zoneRequise();
    const ids = [...choisies];
    if (zid == null || !ids.length || fileOccupee) return;
    fileOccupee = true;
    try {
      await api.addToQueue(zid, { track_ids: ids, ...contexteAlbum(), ...(position != null ? { position } : {}) });
      notifications.success($tr(cle as any).replace('{n}', String(ids.length)));
    } catch {
      notifications.error($tr('v2.pa.queueError' as any));
    }
    fileOccupee = false;
  }
  const pistesChoisies = $derived(
    choisies.map((id) => tracks.find((t) => t.id === id)).filter((t): t is Track => t != null),
  );
  function ajouterSelectionAuCercle() {
    const lot = [...pistesChoisies];
    if (!lot.length) return;
    const n = lot.length;
    demandeCercle.set({
      mode: 'ajout',
      nom: [album.title, $tn('v2.selection.countN', n)]
        .filter(Boolean).join(' · '),
      pistes: async () => lot,
    });
  }
  function ouvrirChamp(champ: 'artist' | 'genre') {
    champGroupe = champGroupe === champ ? null : champ;
    valeurGroupe = '';
  }
  /**
   * L'artiste ou le genre des pistes choisies.
   *
   * L'artiste passe par `PUT /library/albums/{id}/edition` (une requête, le
   * nom résolu en artiste de la bibliothèque) ; il n'est offert que si la
   * sonde du mode Modifier a répondu. Le genre, par `PUT /library/tracks/{id}`,
   * une piste à la fois. Le bilan se DIT, succès partiel compris.
   */
  async function appliquerGroupe() {
    const id = album.id, champ = champGroupe, ids = [...choisies], v = valeurGroupe.trim();
    if (id == null || !champ || !ids.length || !v || groupeOccupe) return;
    groupeOccupe = true;
    let bilan: Bilan;
    // Le serveur dit si le genre a atteint les fichiers (réglage « Écrire les
    // modifications dans les fichiers audio », décoché par défaut).
    let baseSeule = false;
    if (champ === 'artist') {
      const corps = corpsArtistePistes(ids, v);
      try {
        if (corps) await api.putAlbumEdition(id, corps);
        bilan = { reussies: ids.length, echouees: 0 };
      } catch {
        bilan = { reussies: 0, echouees: ids.length };
      }
    } else {
      bilan = await appliquerGenre(ids, v, async (tid, c) => {
        const r = await api.updateTrack(tid, c);
        if (fichiersInchanges(r)) baseSeule = true;
        return r;
      });
    }
    groupeOccupe = false;
    if (album.id !== id) return;
    if (bilan.reussies === 0) {
      notifications.error($tr('v2.selection.editError' as any));
      return;
    }
    if (bilan.echouees) {
      notifications.error($tr('v2.selection.editPartial' as any)
        .replace('{ok}', String(bilan.reussies)).replace('{ko}', String(bilan.echouees)));
    } else {
      const fait = $tr('v2.selection.edited' as any).replace('{n}', String(bilan.reussies));
      notifications.success(baseSeule ? `${fait} ${$tr('fileWrites.savedInTuneOnly' as any)}` : fait);
    }
    champGroupe = null;
    valeurGroupe = '';
    // Les pistes se relisent ; la sélection, elle, reste — pour enchaîner
    // l'artiste puis le genre sur les mêmes titres.
    rechargement += 1;
  }

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
          // #6482 — l'artiste CHEZ LE SERVICE, pour proposer de l'ajouter aussi.
          artistId: album.artist_id != null ? String(album.artist_id) : undefined,
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
  /**
   * tune-server-rust#7617 — les autres versions de cet album (remaster,
   * Hi-Res, édition), regroupées par le serveur. Le choix ouvre la version
   * dans cette même fiche : ses pistes, sa lecture. Rien pour un album sans
   * autre version, un dépôt distant, un service, ou un serveur ancien.
   */
  let oeuvre = $state.raw<OeuvreAlbum | null>(null);
  $effect(() => {
    const id = album.id, d = depot, svc = service, bc = bandcamp;
    if (id == null || d || svc || bc) { oeuvre = null; return; }
    let vivant = true;
    chargerOeuvreAlbum(id).then((o) => { if (vivant) oeuvre = o && o.versions.length > 1 ? o : null; });
    return () => { vivant = false; };
  });
  async function changerVersion(id: number) {
    if (!Number.isFinite(id) || id === album.id) return;
    try { album = await api.getAlbum(id); } catch { /* la fiche garde la version affichée */ }
  }
  async function preferer() {
    const o = oeuvre, id = album.id;
    if (!o || id == null) return;
    try {
      await choisirVersionPreferee(o.work_id, id);
      oeuvre = { ...o, preferred_id: id };
    } catch { /* le choix n'a pas été retenu : le bouton reste proposé */ }
  }

  async function reidentifier() {
    if (album.id == null) return;
    const id = album.id;
    reidentification = true;
    try {
      // Le geste et ses verdicts ('no_tracks', 'not_found', 'unchanged')
      // vivent dans `lib/gestesObjet.reidentifierAlbum` : le menu « … » d'un
      // album offre la même entrée, et les deux doivent dire la même chose.
      // Relire la fiche pour montrer ce qui vient d'être écrit.
      if (await reidentifierAlbum(id)) album = await api.getAlbum(id);
    } catch { /* relecture manquée : l'en-tête garde l'ancien texte */ }
    finally {
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
      // web#2687 — album MIXTE (titres « Indisponible » / « À paraître ») :
      // `streaming_album_id` mettrait toute la liste en file. On envoie la
      // liste nous-mêmes, sans les titres grisés, dans le même contexte d'album.
      if (tracks.some(pisteIndisponible)) {
        lireListeDepuis(tracks, startIndex, {
          lire: (corps: any) => playAndSync(zid, { ...corps, ...contexteAlbum() }),
          enfiler: (corps: any) => api.addToQueue(zid, { ...corps, ...contexteAlbum() }),
        }).catch(signalerEchecLecture);
        return;
      }
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
      // web#2687 — les titres grisés n'entrent pas dans la file mélangée.
      const l = melanger(pistesJouables(tracks));
      if (!l.length) return;
      // #6469 — la suite mélangée s'enfile derrière : la tête ne rejoue pas
      // l'album dans l'ordre.
      const tete = l.length > 1 ? corpsDeTeteDeListe(l[0]) : corpsDeLecture(l[0]);
      if (!tete) return;
      (async () => {
        await playAndSync(zid, { ...tete, ...contexteAlbum(), context_shuffle: true } as any);
        const reste = corpsDeFileListe(l.slice(1));
        if (reste) await api.addToQueue(zid, { ...reste, ...contexteAlbum() });
      })().catch(signalerEchecLecture);
      return;
    }
    if (album.id == null) return;
    const ids = melanger(tracks.map((t) => t.id).filter((x): x is number => x != null));
    playAndSync(zid, { track_ids: ids, ...contexteAlbum(), context_shuffle: true }).catch(signalerEchecLecture);
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
      await api.addToQueue(zid, { ...corps, ...contexteAlbum() });
      notifications.success($tr(cle as any).replace('{title}', album.title ?? ''));
    } catch {
      notifications.error($tr('v2.pa.queueError' as any));
    }
    fileOccupee = false;
  }
  const addQueue = () => enfiler(undefined, 'v2.album.queued');
  /**
   * web#2221 — UN disque d'un album à plusieurs disques : « comment lire un
   * seul CD d'un coffret ? » (demande relayée par Bertrand le 19/10/2026).
   *
   * `ListePistesV2` remet la tranche du disque, dans l'ordre de l'album. Les
   * gestes sont ceux que la fiche emploie déjà, sur cette tranche :
   *   - « Lire le disque » : `lireListe` (« Tout lire ») — une liste locale
   *     part en `track_ids` et REMPLACE la file ; une liste de service, tête
   *     puis reste ;
   *   - « Lire ensuite » / « Ajouter à la file » : `corpsDeFileListe`, UNE
   *     requête, au rang de `rangLireEnsuite` ou à la fin.
   *
   * ⚠️ Pas d'`album_id` ici : il désignerait l'album ENTIER, tous disques
   * compris — précisément ce que « Lire à partir d'ici » fait déjà.
   *
   * Album d'un AUTRE serveur Tune (`depot`) : ses identifiants ne désignent
   * rien sur ce serveur ; chaque piste part par son flux (`corpsLecture`),
   * comme `enchainerDistant` et `enfiler`.
   */
  async function gesteDisque(geste: GesteDisque, liste: Track[], disque: number) {
    const zid = zoneRequise();
    if (zid == null) return;
    const d = depot;
    const designees: Track[] = d
      ? liste.map((t) => ({ ...corpsLecture(d, t), id: null }) as unknown as Track)
      : liste;
    if (geste === 'lire') {
      lireListe(designees, {
        lire: (corps: any) => playAndSync(zid, { ...corps, ...contexteAlbum() }),
        enfiler: (corps: any) => api.addToQueue(zid, { ...corps, ...contexteAlbum() }),
      }).catch(signalerEchecLecture);
      return;
    }
    if (fileOccupee) return;
    const corps = corpsDeFileListe(designees, geste === 'ensuite' ? rangLireEnsuite() : undefined);
    if (!corps) return;
    const titre = [album.title, $tr('library.disc' as any).replace('{num}', String(disque))]
      .filter(Boolean).join(' — ');
    fileOccupee = true;
    try {
      await api.addToQueue(zid, { ...corps, ...contexteAlbum() });
      notifications.success($tr((geste === 'ensuite' ? 'v2.album.queuedNext' : 'v2.album.queued') as any)
        .replace('{title}', titre));
    } catch {
      notifications.error($tr('v2.pa.queueError' as any));
    }
    fileOccupee = false;
  }
  /** « Lire ensuite » insère au rang SUIVANT celui qui joue. Sans rang, la
   *  route ajoute à la fin — ce serait le bouton d'à côté. */
  const lireEnsuite = () => enfiler(rangLireEnsuite(), 'v2.album.queuedNext');
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
  /** Provenance de la notice (`bio_provenance`) — attribution CC BY-SA. */
  let bioProvenance = $state<BioProvenance | null>(null);
  /** `bio_segments` de `GET /library/albums/{id}/bio` (#7910) : liens de la présentation. */
  let bioSegments = $state<unknown>(null);
  const segmentsBio = $derived(segmentsAffichables(bio, bioSegments));
  /** Langue de la notice et repli éventuel (#8010). */
  let bioLangue = $state<LangueBio>(AUCUNE_LANGUE);
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
    bioProvenance = null;
    bioSegments = null;
    bioLangue = AUCUNE_LANGUE;
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
      if (album.id === id) {
        bio = r.bio ?? '';
        bioProvenance = provenanceDe(r);
        bioSegments = r.bio_segments ?? null;
        bioLangue = langueBioDe(r);
      }
    } catch {
      if (album.id === id) bioErreur = true;
    }
    bioChargement = false;
  }

  /**
   * #6480 — la PRÉSENTATION d'un album de service (cpadiou77, fil 2327) : la
   * critique que Qobuz publie, servie en texte par le serveur. Même geste que
   * « Notes / Bio » ci-dessus (un bouton, lu au clic), pour un album SANS
   * `id` local. Voir `lib/presentationAlbumService`.
   */
  const presentationCible = $derived(
    depot || bandcamp || album.id != null ? null
      : presentationAlbumDeServiceDe(service, sidDistant, $servicesPresentationRefuses),
  );
  let presentationOuverte = $state(false);
  let presentation = $state<EtatPresentation | null>(null);
  /** #8129 — les liens de la présentation Qobuz, rendus par `TexteDeBio`. */
  const segmentsPresentation = $derived(
    presentation?.etat === 'texte' ? segmentsAffichables(presentation.texte, presentation.segments) : null,
  );
  let presentationChargement = $state(false);
  let presentationCle = $state<string | null>(null);
  $effect(() => {
    const cle = presentationCible ? `${presentationCible.service}:${presentationCible.albumId}` : null;
    if (cle === untrack(() => presentationCle)) return;
    presentationCle = cle;
    presentationOuverte = false;
    presentation = null;
  });
  async function basculerPresentation() {
    presentationOuverte = !presentationOuverte;
    const cible = presentationCible;
    if (!presentationOuverte || !cible || presentation || presentationChargement) return;
    presentationChargement = true;
    const cle = `${cible.service}:${cible.albumId}`;
    const r = await chargerPresentation(cible, api.getStreamingAlbumDescription);
    // Course : l'album a pu changer pendant la requête.
    if (presentationCle === cle) presentation = r;
    presentationChargement = false;
  }

  /**
   * Les ONGLETS sous l'en-tête : Pistes | Crédits | Bio | Présentation. Chacun
   * garde la garde de son ancien bouton ; le contenu se lit au premier choix
   * de l'onglet, comme il se lisait au clic (la route de la bio sort sur le
   * réseau, voir `basculerBio`).
   */
  type Onglet = 'pistes' | 'credits' | 'bio' | 'presentation';
  let onglet = $state<Onglet>('pistes');
  const LIBELLES_ONGLETS: Record<Onglet, string> = {
    pistes: 'v2.menu.tabTracks',
    credits: 'artist.credits',
    bio: 'library.notesBio',
    presentation: 'v2.album.presentation',
  };
  const onglets = $derived<Onglet[]>([
    'pistes',
    ...(creditsPossibles || creditsDeService || onglet === 'credits' ? ['credits' as const] : []),
    ...(album.id != null ? ['bio' as const] : []),
    ...(presentationCible || presentation?.etat === 'refus' ? ['presentation' as const] : []),
  ]);
  // Une autre fiche : on revient aux pistes.
  $effect(() => { void album; untrack(() => (onglet = 'pistes')); });
  function choisirOnglet(o: Onglet) {
    onglet = o;
    if (o === 'credits') creditsServiceOuvert = creditsPossibles ? null : creditsDeService;
    if (o === 'bio' && !bioOuverte) void basculerBio();
    if (o === 'presentation' && !presentationOuverte) void basculerPresentation();
  }
  /** ← / → / Début / Fin d'un onglet à l'autre (motif « tabs » de l'ARIA APG). */
  function clavierOnglets(e: KeyboardEvent) {
    const i = onglets.indexOf(onglet);
    let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % onglets.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + onglets.length) % onglets.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = onglets.length - 1;
    if (j < 0) return;
    e.preventDefault();
    choisirOnglet(onglets[j]);
    void tick().then(() => document.getElementById(`album-onglet-${onglets[j]}`)?.focus());
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
      // Lus AVANT la fermeture : l'album affiché est celui qu'on quitte, et
      // la vue `streamingalbum` vide `ficheAlbumService` en se refermant —
      // relu après, `artisteDeService` se recalculait sur une cible nulle et
      // levait (web#1602, mesuré en montant la coquille).
      const artiste = artisteDeService;
      const fiche = ficheDeCetAlbum();
      quitterLaFiche();
      // `depuis` se lit APRÈS la fermeture : la vue `streamingalbum` de la
      // coquille, elle, referme EN changeant de vue — c'est cette vue-là, et
      // pas la fiche qu'on vient de quitter, qui est le point de retour.
      const depuis = get(activeView);
      // 🔴 web#1602 — et la fiche elle-même voyage avec le geste : le Retour
      // de la page artiste la rouvre, puis le sien ramène à `depuis`. Sans
      // elle, le Retour sautait la fiche (Reivax66, fil 1941). Pas depuis une
      // page artiste (album ouvert DANS la page) : son Retour ne sait pas
      // rouvrir la page d'avant, on n'y empile pas un cran de plus.
      $gestesNavigationService?.ouvrirArtiste({
        ...artiste,
        depuis,
        ficheDeRetour: depuis === 'streamingartist' ? null : fiche,
      });
    }
  }

  /**
   * Cet album sous la forme que rouvre la vue `streamingalbum` — web#1602.
   * `null` quand elle ne sait pas le rouvrir : un album de la bibliothèque,
   * d'un autre serveur (`depot`), de Bandcamp (désigné par une URL, sans
   * `source_id` de service), ou sans identifiant chez son service.
   */
  function ficheDeCetAlbum(): CibleFicheAlbumService | null {
    if (!service || depot || bandcamp) return null;
    const a: any = albumAffiche;
    const id = a?.source_id == null ? '' : String(a.source_id).trim();
    if (!id) return null;
    return {
      service: service as Source,
      id,
      titre: String(a.title ?? ''),
      pochette: a.cover_path ?? null,
      artiste: a.artist_name ?? null,
      artisteId: a.artist_id == null ? null : String(a.artist_id),
    };
  }

  function trackTech(t: Track): string {
    const rate = t.sample_rate ? `${Math.round(t.sample_rate / 100) / 10} kHz` : '';
    const depth = t.bit_depth ? `${t.bit_depth}-bit` : '';
    return [t.format?.toUpperCase(), rate, depth].filter(Boolean).join(' · ');
  }
</script>

<div class="v2-detail tune-v2">
  <!-- #2459 (Régis, 10/11) — la flèche porte son libellé « Retour », comme
       le retour des Collections (`common.back`) ; visible à toute largeur. -->
  <button class="close" data-retour-album onclick={onClose}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
    <span>{$tr('common.back' as any)}</span>
  </button>

  <div class="head">
    <!-- #1342 — `albumAffiche` : la pochette que l'appelant n'a pas portée
         vient du service, sinon la fiche reste un carré gris à l'initiale. -->
    <div class="art"><AlbumArt coverPath={pochetteRemplacee ?? albumAffiche.cover_path} albumId={depot ? null : album.id} size={0} alt={album.title} source={album.source} fallbackInitials={album.title?.slice(0,1)} /></div>
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
        <!-- tune-server-rust#6285 — « hi-res vérifié / douteux » : rien tant que
             le serveur n'a pas mesuré l'album (lib/badgeHiRes). -->
        {#if hiRes}<div class="qbadge cue" class:douteux={hiRes.genre === 'douteux'} data-hires={hiRes.genre}
          title={$tr((hiRes.cleRaison ?? 'v2.album.hiresVerifiedTip') as any)}>{$tr(hiRes.cle as any)}</div>{/if}
        <PastilleCompilation compilation={album.is_compilation} />
        <!-- #862 — Marco Polo, fil 1738 : « identifier dans la bibliothèque
             qu'un album affiché est la résultante d'un fichier .CUE ». La
             donnée vit sur les PISTES (`cue_media_path`) ; la fiche la remonte
             dès qu'une piste en porte. C'est une nature de disque, à côté de
             « compilation ». -->
        {#if depuisCue}<div class="qbadge cue" title={$tr('v2.album.cueTip' as any)}>{$tr('v2.album.cue' as any)}</div>{/if}
        {#if mention}<div class="qbadge cue" title={$tr('v2.album.alsoOnTip' as any)}>{$tr(mention.cle as any).replace('{servers}', mention.serveurs.join(', '))}</div>{/if}
        <!-- #5530 — le marquage « généré par IA » que le service pose sur
             l'album (Qobuz). Rien quand il ne dit rien. -->
        {#if estMarqueIa(albumAffiche)}<div class="qbadge cue ia" data-ia title={$tr('v2.str.aiGeneratedTip' as any)}>{$tr('v2.str.aiGenerated' as any)}</div>{/if}
        <!-- web#2140 — une règle de réaffectation des canaux armée sur CET album
             (bibliothèque locale seulement : la règle porte un album_id local). -->
        {#if creditsPossibles}<BadgeReaffectation cible="album" id={album.id} />{/if}
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
      {#if oeuvre}
        <div class="versions" data-versions={oeuvre.versions.length}>
          <label>
            <span>{$tr('v2.album.versions' as any).replace('{n}', String(oeuvre.versions.length))}</span>
            <select value={album.id} onchange={(e) => changerVersion(Number(e.currentTarget.value))}>
              {#each oeuvre.versions as v (v.id)}
                <option value={v.id}>{libelleVersion(v)}{v.id === oeuvre.preferred_id ? ' ★' : ''}</option>
              {/each}
            </select>
          </label>
          {#if album.id === oeuvre.preferred_id}
            <span class="vpref">★ {$tr('v2.album.preferredVersion' as any)}</span>
          {:else}
            <button type="button" class="vchoix" onclick={preferer}>{$tr('v2.album.setPreferredVersion' as any)}</button>
          {/if}
        </div>
      {/if}
      <div class="facts">
        {#if $formatAnneeAlbum(albumAffiche)}<span>{$formatAnneeAlbum(albumAffiche)}</span>{/if}
        <span>{$tn('v2.common.trackCountN', tracks.length)}</span>
        {#if totalMs}<span>{formatDuration(totalMs)}</span>{/if}
        <!-- #1388 : `DR 12` pour une mesure inscrite dans le fichier,
             `DR ~12` souligné en pointillés pour la moyenne des pistes. Même
             valeur, provenance différente — voir `lib/dynamicRange.ts`. -->
        {#if dr}<span class="dr" class:deduit={dr.deduit} use:tip={dr.cleInfobulle}>DR {dr.texte}</span>{/if}
        <!-- #2298 — le total des écoutes de la communauté, lu sur la fiche
             locale (`GET /library/albums/{id}`) ; rien sans le champ. -->
        <EcoutesCommunaute objet={fiche ?? album} />
      </div>
      <!-- tune-server-rust#6782 — vers la page du label : ses autres artistes,
           dans la bibliothèque puis chez Qobuz. Album de la bibliothèque
           seulement : la page du label est celle de la Bibliothèque. -->
      {#if creditsPossibles && labelDe(albumAffiche)}
        {@const nomLabel = labelDe(albumAffiche)!}
        <!-- tune-server-rust#8145 — le nom est LU AVANT `onClose()` : la
             fermeture vide `albumAffiche`, et `nomLabel` relu après valait
             `null` (TypeError, « il ne se passe rien »). -->
        <button type="button" class="lien-label" data-lien-label onclick={() => { const nom = nomLabel; onClose(); void ouvrirLabelDansLaBibliotheque(nom); }}>
          {$tr('v2.label.autresArtistes' as any).replace('{label}', nomLabel)}
        </button>
      {/if}
      {#if labelQobuz}
        {@const lq = labelQobuz}
        <button type="button" class="lien-label" data-lien-label-qobuz title={$tr('v2.label.ouvrirLabelTip' as any)}
          onclick={() => ouvrirLabelDeService({ service: 'qobuz', id: lq.id, nom: lq.nom })}>
          {$tr('v2.label.ouvrirLabel' as any).replace('{label}', lq.nom || $tr('v2.label.qobuzTitre' as any))}
        </button>
      {/if}
      {#if preferenceChargee && (repertoiresDeCetAlbum.length > 1 || racinePreferee)}
        <div class="repertoire-lecture">
          <label for="album-repertoire-{album.id}">{$tr('v2.album.playFrom' as any)}</label>
          <select id="album-repertoire-{album.id}" data-album-source
            value={racinePreferee ?? ''} disabled={preferenceEnCours}
            onchange={choisirRepertoire}>
            <option value="">{$tr('v2.album.sourceAutomatic' as any)}</option>
            {#each repertoiresDeCetAlbum as exemplaire (exemplaire.racine)}
              <option value={exemplaire.racine}>
                {exemplaire.racine}{qualiteDuRepertoire(exemplaire) ? ` · ${qualiteDuRepertoire(exemplaire)}` : ''}{exemplaire.joignable ? '' : ` · ${$tr('v2.album.sourceUnavailable' as any)}`}
              </option>
            {/each}
            {#if racinePreferee && !repertoiresDeCetAlbum.some((e) => e.racine === racinePreferee)}
              <option value={racinePreferee}>{racinePreferee} · {$tr('v2.album.sourceUnavailable' as any)}</option>
            {/if}
          </select>
          {#if erreurPreference}<p role="alert">{erreurPreference}</p>{/if}
        </div>
      {/if}
      <!-- web#2736 — trois boutons et un menu. Les bulles disent ce que le
           bouton FAIT (#2151, Didier, fil 2258). Les gestes valent pour les
           QUATRE origines (Bertrand, 06/09/2026) : chaque piste porte sa paire
           `source` + `source_id`, et la route de file accepte `tracks[]`. -->
      <div class="actions">
        <!-- rc12 (Bertrand, 12/11/2026) : « un seul bouton Play pour Play /
             Shuffle / Lire ensuite / Ajouter à la file ». Le ⤮ séparé passe
             sous la flèche, avec son `data-aleatoire-album`. -->
        <BoutonLectureV2 onLire={() => playAlbum(0)} cle="v2.album.play" cleBulle="v2.album.playTip"
          aleatoire={{ faire: shuffle, bulle: 'v2.album.shuffleTip' }} attrsAleatoire={{ 'data-aleatoire-album': true }}
          ensuite={{ faire: lireEnsuite, desactive: fileOccupee, bulle: 'v2.album.playNextTip' }}
          file={{ faire: addQueue, desactive: fileOccupee, bulle: 'v2.album.addQueueTip' }} />
        <!-- Le cœur n'apparaît que si l'album est DÉSIGNABLE (`id` local, ou
             référence de service — Bandcamp compris depuis #1409). Un bouton
             absent ne promet rien. -->
        {#if album.id != null || refService}
          <button class="ghost carre coeur" class:on={enFavori} onclick={basculerFavori} disabled={bascule}
            aria-pressed={enFavori}
            title={$tr(enFavori ? 'favorites.removeAlbum' : 'v2.album.favoriteTip' as any)}
            aria-label={$tr(enFavori ? 'favorites.removeAlbum' : 'favorites.addAlbum')}>
            <svg viewBox="0 0 24 24" fill={enFavori ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
        {/if}
        <BoutonMenuV2 entrees={entreesPlus} etiquette={$tr('v2.cover.more' as any)} largeur={248}>
          {#snippet declencheur(p)}
            <button class="ghost carre plus" bind:this={boutonPlus} {...p} data-menu-album
              aria-label={$tr('v2.cover.more' as any)} title={$tr('v2.cover.more' as any)}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
            </button>
          {/snippet}
        </BoutonMenuV2>
      </div>
      <!-- La note sur 5 et le signalement de la pochette : des réglages de
           l'album, pas des gestes — ils restent à vue. Album LOCAL seulement. -->
      {#if album.id != null && !depot}
        <div class="actions local">
          <AlbumRating albumId={album.id} />
          {#if album.cover_path}
            <ReportButton entity="cover" entityId={album.id} compact
              reasons={['wrong_entity', 'incorrect', 'poor_quality', 'offensive']} />
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- web#2653 — « Mes notes » : album LOCAL seulement, comme la note sur 5. -->
  {#if album.id != null && !depot}
    <div class="mes-notes-album"><MesNotes type="album" id={album.id} /></div>
  {/if}

  <!-- tune-server-rust#8077 — ce que Qobuz complète, avec sa source, et le
       geste qui le retire. Album LOCAL seulement. -->
  {#if album.id != null && !depot}
    <ApportsQobuzAlbum albumId={album.id} />
  {/if}

  <!-- #4805 lot 1 (d'après MetaRust, de Xavier Joly) : complétude, BPM,
       instruments Wikidata, propositions Discogs. Album de la BIBLIOTHÈQUE
       seulement — la même garde que les crédits. -->
  {#if creditsPossibles && album.id != null}
    {#await import('./EnrichissementAlbumV2.svelte') then m}
      <m.default albumId={album.id} pistes={tracks} pochette={pochetteRemplacee ?? albumAffiche.cover_path ?? null}
        onPochette={(h) => (pochetteRemplacee = h)} />
    {/await}
  {/if}

  {#if notesIa && album.id != null}
    <NotesPochetteIaV2 albumId={album.id} onClose={() => (notesIa = false)} />
  {/if}

  {#if suggestionsIa && album.id != null}
    <SuggestionsIaAlbumV2 albumId={album.id}
      onClose={() => (suggestionsIa = false)}
      onChange={() => (rechargement += 1)} />
  {/if}

  <!-- web#2736 — Pistes | Crédits | Bio | Présentation. Un onglet n'existe
       que si son ancien bouton existait : pas de « Présentation » sur un album
       de la bibliothèque, pas de « Bio » sur un album de service. Seul, l'onglet
       Pistes ne s'affiche pas. -->
  {#if onglets.length > 1}
    <div class="onglets" role="tablist" aria-label={$tr('v2.menu.tabsLabel' as any)}>
      {#each onglets as o (o)}
        <button type="button" role="tab" class="onglet" class:actif={onglet === o}
          id="album-onglet-{o}" aria-controls="album-panneau-{o}"
          aria-selected={onglet === o} tabindex={onglet === o ? 0 : -1}
          data-onglet-album={o} data-credits-album={o === 'credits' ? '' : undefined}
          onclick={() => choisirOnglet(o)} onkeydown={clavierOnglets}>{$tr(LIBELLES_ONGLETS[o] as any)}</button>
      {/each}
    </div>
  {/if}

  {#if onglet === 'credits'}
    <!-- #1572 — les crédits de l'album : la même fiche que celle d'un titre,
         agrégée sur le disque, ici À PLAT dans l'onglet. Un nom crédité
         referme la fiche avant d'ouvrir la page de l'artiste. -->
    <div class="panneau" role="tabpanel" id="album-panneau-credits" aria-labelledby="album-onglet-credits">
      {#if (creditsPossibles && album.id != null) || creditsServiceOuvert}
        {#key `${album.id ?? ''}:${creditsServiceOuvert?.albumId ?? ''}`}
          {#await import('../partages/CreditsTiroir.svelte') then m}
            <m.default enLigne
              cible={{ type: 'album', albumId: creditsServiceOuvert ? null : album.id, service: creditsServiceOuvert, titre: album.title, artiste: nomArtiste, pistes: tracks }}
              avantDeNaviguer={quitterLaFiche}
              onClose={() => {}} />
          {/await}
        {/key}
      {/if}
    </div>
  {:else if onglet === 'bio'}
    <!-- Présentation de l'album (#3586) : lue au premier choix de l'onglet, la
         route sort sur le réseau (voir `basculerBio`). -->
    <div class="panneau bio" role="tabpanel" id="album-panneau-bio" aria-labelledby="album-onglet-bio" data-panneau-bio>
      {#if bioChargement}
        <p class="bio-state">{$tr('v2.common.loading' as any)}</p>
      {:else if bioErreur}
        <p class="bio-state err">{$tr('library.bioLoadError' as any)}</p>
      {:else if bio}
        <ClampedText lines={4} resetKey={bio}>
          <p class="bio-text" lang={bioLangue.langue ?? undefined}>{#if segmentsBio}<TexteDeBio segments={segmentsBio} />{:else}{bio}{/if}</p>
        </ClampedText>
        <MentionRepliBio genre="notes" repliVers={bioLangue.repliVers} />
        <AttributionBio provenance={bioProvenance} />
      {:else if bio !== null}
        <p class="bio-state">{$tr('library.noAlbumNote')}</p>
      {/if}
    </div>
  {:else if onglet === 'presentation'}
    <!-- #6480 — la présentation d'un album de SERVICE, en texte : jamais de
         balisage interprété (`{@html}`), le serveur l'a déjà retiré. Un refus
         (501) retire l'onglet des fiches suivantes ; celle-ci dit pourquoi. -->
    <div class="panneau bio" role="tabpanel" id="album-panneau-presentation" aria-labelledby="album-onglet-presentation" data-panneau-presentation>
      {#if presentationChargement}
        <p class="bio-state">{$tr('v2.common.loading' as any)}</p>
      {:else if presentation?.etat === 'texte'}
        <ClampedText lines={4} resetKey={presentation.texte}>
          <p class="bio-text presentation" lang={presentation.langue ?? undefined}>{#if segmentsPresentation}<TexteDeBio segments={segmentsPresentation} />{:else}{presentation.texte}{/if}</p>
        </ClampedText>
      {:else if presentation?.etat === 'erreur'}
        <p class="bio-state err">{$tr('v2.album.presentationError' as any)}</p>
      {:else if presentation}
        <p class="bio-state">{$tr('v2.album.noPresentation' as any)}</p>
      {/if}
    </div>
  {/if}

  <div class="tracks" hidden={onglet !== 'pistes'}
    role={onglets.length > 1 ? 'tabpanel' : undefined}
    id={onglets.length > 1 ? 'album-panneau-pistes' : undefined}
    aria-labelledby={onglets.length > 1 ? 'album-onglet-pistes' : undefined}>
    {#if enEdition && edition && album.id != null}
      <EditionAlbumV2 albumId={album.id} donnees={edition}
        onFermer={() => (enEdition = false)}
        onEnregistre={apresEnregistrement}
        onRecharger={() => (rechargement += 1)} />
    {:else if enOrdreCoffret && album.id != null}
      <!-- #8571 (fil 2763) — réordonner les albums du coffret. -->
      <OrdreCoffretFicheV2 coffretId={album.id}
        onFermer={() => (enOrdreCoffret = false)}
        onEnregistre={() => { enOrdreCoffret = false; void apresEnregistrement(); }} />
    {:else if loading}
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
      {#if enSelection}
        <!-- #1683 — la barre des gestes groupés. Les libellés d'action sont
             ceux des boutons de l'album : ce sont les mêmes gestes. -->
        <div class="barre-selection" role="toolbar" aria-label={$tr('v2.selection.toolbar' as any)}>
          <span class="sel-compte" data-sel-compte aria-live="polite">
            {$tn('v2.selection.countN', choisies.length)}
          </span>
          <button class="sel-btn" data-sel-tout onclick={() => (sel = toutOuRien(sel, ordreSelection))}>
            {$tr((toutChoisi ? 'v2.selection.none' : 'v2.selection.all') as any)}
          </button>
          <button class="sel-btn" data-sel-lire disabled={!choisies.length} onclick={lireSelection}>{$tr('v2.album.play' as any)}</button>
          <button class="sel-btn" data-sel-ensuite disabled={!choisies.length || fileOccupee}
            onclick={() => enfilerSelection(rangLireEnsuite(), 'v2.selection.queuedNext')}>{$tr('v2.album.playNext' as any)}</button>
          <button class="sel-btn" data-sel-file disabled={!choisies.length || fileOccupee}
            onclick={() => enfilerSelection(undefined, 'v2.selection.queued')}>{$tr('v2.album.addQueue' as any)}</button>
          <button class="sel-btn" data-sel-playlist disabled={!pistesChoisies.length}
            onclick={() => (playlistSelection = true)}>{$tr('playlist.addToPlaylist')}</button>
          {#if $circleCharge}
            <!-- Les pistes choisies rejoignent une playlist de cercle, en une
                 fois et dans l'ordre de l'album (`bulk-items`). -->
            <button class="sel-btn" data-sel-cercle disabled={!pistesChoisies.length}
              onclick={ajouterSelectionAuCercle}>{$tr('v2.circle.pl.addToCircle' as any)}</button>
          {/if}
          {#if edition}
            <button class="sel-btn" data-sel-artiste disabled={!choisies.length} aria-pressed={champGroupe === 'artist'}
              onclick={() => ouvrirChamp('artist')}>{$tr('v2.selection.setArtist' as any)}</button>
          {/if}
          <button class="sel-btn" data-sel-genre disabled={!choisies.length} aria-pressed={champGroupe === 'genre'}
            onclick={() => ouvrirChamp('genre')}>{$tr('v2.selection.setGenre' as any)}</button>
        </div>
        {#if champGroupe && choisies.length}
          <form class="sel-edition" data-sel-edition onsubmit={(e) => { e.preventDefault(); void appliquerGroupe(); }}>
            <label for="sel-valeur-{album.id}">{$tr((champGroupe === 'artist' ? 'v2.selection.newArtist' : 'v2.selection.newGenre') as any)}</label>
            <input id="sel-valeur-{album.id}" type="text" bind:value={valeurGroupe} disabled={groupeOccupe} />
            <button class="sel-btn primaire" type="submit" disabled={!valeurGroupe.trim() || groupeOccupe}>
              {$tr('v2.selection.apply' as any).replace('{n}', String(choisies.length))}
            </button>
            <button class="sel-btn" type="button" onclick={() => (champGroupe = null)}>{$tr('v2.edition.cancel' as any)}</button>
          </form>
        {/if}
      {/if}
      <ListePistesV2
        ecranColonnes="album"
        contexte={contexteAlbum()}
        selection={enSelection ? sel.choisies : null}
        onCocher={cocher}
        pistes={pistesVisibles}
        numerotation="piste"
        pochetteEnTableau={pochettesDePisteDistinctesIci}
        enTetesDisque
        onLire={(_p, i) => playAlbum(i)}
        onLireDepuis={(_p, i) => playAlbum(i)}
        onGesteDisque={gesteDisque}
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
<!-- #1683 — la fenêtre de playlists PARTAGÉE, pour toutes les pistes
     choisies en une requête. -->
{#if playlistAlbum && tracks.length}
  {#await import('../partages/AddToPlaylistModal.svelte') then m}
    <m.default track={tracks[0]} {tracks} onClose={() => (playlistAlbum = false)} />
  {/await}
{/if}
{#if playlistSelection && pistesChoisies.length}
  {#await import('../partages/AddToPlaylistModal.svelte') then m}
    <m.default track={pistesChoisies[0]} tracks={pistesChoisies}
      onClose={() => (playlistSelection = false)} />
  {/await}
{/if}
<!-- Le menu « Ajouter à une collection » : une entrée par collection
     MANUELLE, ou l'état vide qui mène à l'écran Collections. Porté à la
     racine et posé en `fixed` : la fiche défile. -->
<svelte:window onclick={fermerMenuCollection} onkeydown={auClavierCollection}
  onresize={fermerMenuCollection} onscrollcapture={auDefilementCollection} />
{#if menuCollectionOuvert && ancreCollection}
  <div class="coll-menu tune-v2" role="menu" tabindex="-1" use:portail
    aria-label={$tr('v2.album.addToCollection' as any)}
    style={styleMenuAncre(ancreCollection, Math.max(2, lignesCollection.length), window, LARGEUR_MENU_COLLECTION)}>
    {#if entreesCollection.length}
      {#each lignesCollection as l (l.cle)}
        {#if l.sorte === 'rayon'}
          <p class="coll-rayon" role="presentation" style:padding-left="{10 + l.profondeur * 14}px" use:bulleTexte>{l.nom}</p>
        {:else}
        {@const e = l.entree}
        <button type="button" role="menuitem" class="coll-item" class:deja={e.deja}
          style:padding-left="{10 + l.profondeur * 14}px"
          onclick={(ev) => choisirCollection(ev, e.faire)} use:bulleTexte>{e.libelle}</button>
        {/if}
      {/each}
    {:else}
      <p class="coll-vide">{$tr('v2.album.noCollection' as any)}</p>
      <button type="button" role="menuitem" class="coll-item coll-lien" onclick={allerCollections} use:bulleTexte>
        {$tr('v2.nav.collections' as any)}
      </button>
    {/if}
  </div>
{/if}

<style>
  /* Le menu des collections. `fixed` + `use:portail` : voir l'en-tête du
     `<script>`. Même gabarit que le panneau de `MenuZone`. Sa hauteur est
     bornée à la fenêtre par `styleMenuAncre` (`max-height`, #1575) : au-delà,
     il défile en lui-même, sans entraîner la page. */
  .coll-menu{position:fixed; z-index:60; width:240px; padding:6px; display:flex; flex-direction:column; gap:1px;
    overflow-y:auto; overscroll-behavior:contain;
    border-radius:var(--v2-r-md); border:1px solid var(--v2-line2); background:var(--v2-surface);
    color:var(--v2-txt); font-family:var(--v2-sans); box-shadow:0 18px 40px rgba(0,0,0,.5)}
  .coll-item{display:block; flex:0 0 auto; width:100%; min-height:34px; padding:7px 10px; border:0; border-radius:8px;
    background:transparent; color:var(--v2-txt); font:calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); text-align:left; cursor:pointer;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .coll-item:hover{background:var(--v2-surface2)}
  .coll-item:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:-2px}
  .coll-item.deja{color:var(--v2-txt3)}
  /* Intitulé d'un rayon (fil 1928) : il range, il ne se clique pas. */
  .coll-rayon{flex:0 0 auto; margin:6px 0 0; padding:4px 10px 2px; font-size:calc(11px * var(--v2-txt-echelle, 1)); font-weight:600;
    letter-spacing:.04em; text-transform:uppercase; color:var(--v2-txt3);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .coll-rayon:first-child{margin-top:0}
  .coll-lien{color:var(--v2-acc-tint)}
  .coll-vide{flex:0 0 auto; margin:0; padding:7px 10px; font-size:calc(12px * var(--v2-txt-echelle, 1)); line-height:1.4; color:var(--v2-txt3); white-space:normal}
  .v2-detail{position:absolute; inset:0; z-index:30; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow-y:auto; padding:26px 34px 40px}
  .close{position:sticky; top:0; margin-bottom:8px; height:40px; padding:0 14px 0 10px; border-radius:12px; cursor:pointer;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt2);
    display:inline-flex; align-items:center; gap:6px; max-width:100%; white-space:nowrap;
    font:500 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .close:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .close svg{width:18px; height:18px; flex:none}

  .head{display:flex; gap:30px; padding:6px 0 26px}
  .art{width:240px; height:240px; border-radius:8px; overflow:hidden; flex:0 0 auto; box-shadow:var(--v2-sh-lg)}
  .meta{display:flex; flex-direction:column; gap:12px; padding-top:8px; min-width:0}
  /* Recette rc12 (13/11) — fenêtre étroite (téléphone, demi-écran) : la
     pochette de 240 px et le titre côte à côte ne tenaient pas ; le titre se
     coupait mot à mot ou sortait du cadre. La pochette passe au-dessus. */
  @media (max-width:640px){
    .v2-detail{padding:20px 16px 32px}
    .head:not(.compact){flex-direction:column; gap:18px}
    .head:not(.compact) .art{width:min(240px, 100%); height:auto; aspect-ratio:1 / 1}
    .head:not(.compact) .meta h1{font-size:calc(28px * var(--v2-txt-echelle, 1)); overflow-wrap:anywhere}
  }
  /* Le badge de qualité et la pastille « compilation » sur la MÊME ligne, et
     non deux blocs empilés : ce sont deux étiquettes de même rang, et empilées
     elles pousseraient le titre de l'album hors du premier coup d'œil. */
  .qrow{display:flex; align-items:center; gap:10px; flex-wrap:wrap}
  .qbadge.cue{background:transparent; border:1px solid var(--v2-line2); color:var(--v2-txt2)}
  /* tune-server-rust#6285 — un hi-res douteux se distingue, sans crier. */
  .qbadge.cue.douteux{border-color:var(--v2-danger-bd)}
  .qbadge{font:700 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.04em; padding:6px 10px; border-radius:8px;
    color:var(--v2-acc-tint); border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .meta h1{font-size:calc(38px * var(--v2-txt-echelle, 1)); font-weight:800; letter-spacing:-.01em; line-height:1.05}
  .artist{font-size:calc(18px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  /* Le bouton doit se lire comme le texte qu'il remplace : même taille, même
     couleur, aligné à gauche. Ce qui l'annonce comme un lien, c'est le
     survol et le focus — visible AU CLAVIER, pas seulement à la souris. */
  .artist.lien{border:0; background:transparent; padding:0; font-family:inherit;
    text-align:left; cursor:pointer}
  .artist.lien:hover{color:var(--v2-acc-tint); text-decoration:underline}
  .artist.lien:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:3px; border-radius:4px}
  .facts{display:flex; gap:16px; font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3)}
  /* tune-server-rust#7617 — le choix de la version à lire. */
  .versions{display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin:6px 0 8px; font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3)}
  .versions label{display:flex; align-items:center; gap:8px}
  .versions select{max-width:100%; font:inherit; color:var(--v2-txt); background:var(--v2-surface2); border:1px solid var(--v2-line2); border-radius:6px; padding:3px 6px}
  .vpref{color:var(--v2-acc2)}
  .vchoix{font:inherit; color:var(--v2-acc2); background:transparent; border:1px solid var(--v2-line2); border-radius:6px; padding:3px 8px; cursor:pointer}
  .repertoire-lecture{display:flex; flex-direction:column; align-items:flex-start; gap:5px; max-width:min(100%, 520px)}
  .lien-label{all:unset; cursor:pointer; margin-top:6px; font:500 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--tune-accent)}
  .lien-label:hover{text-decoration:underline}
  .lien-label:focus-visible{outline:2px solid var(--tune-accent); outline-offset:2px}
  .repertoire-lecture label{font:600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt2)}
  .repertoire-lecture select{width:100%; min-height:38px; padding:6px 10px; border-radius:8px;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt);
    font:calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .repertoire-lecture select:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
  .repertoire-lecture select:disabled{opacity:.6}
  .repertoire-lecture p{margin:0; color:var(--v2-danger); font-size:calc(12px * var(--v2-txt-echelle, 1))}
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
  .ghost{display:inline-flex; align-items:center; gap:9px; height:44px; padding:0 20px; border-radius:var(--v2-r-pill);
    font:700 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans); cursor:pointer; border:0}
  .ghost{color:var(--v2-txt); background:transparent; border:1px solid var(--v2-line2)}
  .ghost:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  /* Le cœur ACTIF garde le rouge : c'est un ÉTAT, pas une action — la même
     règle que sur les lignes de piste. */
  .coeur.on{color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .coeur.on:hover{color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .coeur:disabled{opacity:.55; cursor:default}
  .ghost svg{width:16px; height:16px}
  /* web#2736 — les boutons d'icône seule : carrés, même hauteur que Lecture. */
  .ghost.carre{width:44px; padding:0; justify-content:center; flex:0 0 auto}
  .ghost[aria-expanded="true"]{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .ghost:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}

  /* web#2736 — Pistes | Crédits | Bio | Présentation. Au téléphone, la rangée
     défile d'elle-même plutôt que de pousser la fiche hors du cadre. */
  .onglets{display:flex; gap:4px; margin:14px 0 10px; border-bottom:1px solid var(--v2-line2);
    overflow-x:auto; scrollbar-width:none}
  .onglet{flex:0 0 auto; padding:9px 14px; border:0; border-bottom:2px solid transparent; margin-bottom:-1px;
    background:transparent; color:var(--v2-txt2); font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); cursor:pointer; white-space:nowrap}
  .onglet:hover{color:var(--v2-txt)}
  .onglet.actif{color:var(--v2-txt); border-bottom-color:var(--v2-acc2)}
  .onglet:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:-2px}
  .panneau{padding:6px 0 20px}
  .tracks[hidden]{display:none}

  .tracks{display:flex; flex-direction:column; gap:1px}
  /* #4767 — la pastille de focus : visible sans crier, au-dessus de la liste
     qu'elle explique. Même dessin que la puce de portée de la Bibliothèque. */
  .focus-artiste{padding:2px 0 10px}
  .fchip{display:inline-flex; align-items:center; gap:8px; padding:6px 8px 6px 12px;
    border-radius:var(--v2-r-pill); font:600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans);
    color:var(--v2-acc1); background:var(--v2-acc-soft);
    border:1px solid color-mix(in srgb, var(--v2-acc1) 40%, transparent)}
  .fchip svg{width:14px; height:14px; flex:none}
  .fchip button{display:flex; align-items:center; justify-content:center; width:18px; height:18px;
    padding:0; border:0; border-radius:50%; cursor:pointer; font:600 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans);
    background:transparent; color:inherit; line-height:1}
  .fchip button:hover{background:color-mix(in srgb, var(--v2-acc1) 22%, transparent)}
  .fchip button:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:2px}
  .state{padding:24px 6px; color:var(--v2-txt3)} .state.err{color:var(--v2-danger)}
  /* #1683 — la barre de sélection : collée en haut de la fiche qui défile,
     pour que les gestes restent à portée pendant qu'on coche plus bas. */
  .barre-selection{position:sticky; top:0; z-index:3; display:flex; flex-wrap:wrap; align-items:center; gap:8px;
    padding:10px 12px; margin-bottom:8px; border-radius:var(--v2-r-md);
    border:1px solid var(--v2-line2); background:var(--v2-surface)}
  .sel-compte{font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt); margin-right:6px}
  .sel-btn{height:32px; padding:0 14px; border-radius:var(--v2-r-pill); cursor:pointer;
    border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt); font:600 calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .sel-btn:hover:not(:disabled){border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .sel-btn:disabled{opacity:.45; cursor:default}
  .sel-btn[aria-pressed="true"]{border-color:var(--v2-acc2); color:var(--v2-acc-tint); background:var(--v2-acc-soft)}
  .sel-btn.primaire{color:var(--v2-on-acc); border:0; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sel-btn:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
  .sel-edition{display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:0 12px 10px}
  .sel-edition label{font:600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt2)}
  .sel-edition input{min-width:220px; height:32px; padding:0 10px; border-radius:8px;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt); font:calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .sel-edition input:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:1px}
  /* Les regles de LIGNE ont disparu avec la boucle qu'elles habillaient :
     la fiche monte `ListePistesV2`, qui porte les siennes. Le compilateur
     Svelte les signalait toutes les neuf en « Unused CSS selector » des que
     ce composant etait compile (#1957, garde de montage). */

  /* Présentation de l'album (#3586) — repliée par défaut, comme dans
     l'interface actuelle : la route sort sur le réseau quand la notice
     manque, cf. `basculerBio`. */
  .mes-notes-album{max-width:760px}
  .bio{margin:0; display:flex; flex-direction:column; gap:10px; align-items:flex-start}
  .bio-text{margin:0; color:var(--v2-txt2); font-size:calc(14px * var(--v2-txt-echelle, 1)); line-height:1.65; max-width:70ch}
  .bio-state{margin:0; color:var(--v2-txt3); font-size:calc(13px * var(--v2-txt-echelle, 1)); font-style:italic}
  .bio-state.err{color:var(--v2-danger)}
  .bio-text.presentation{white-space:pre-line}
</style>
