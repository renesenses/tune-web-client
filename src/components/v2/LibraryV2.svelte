<script lang="ts">
  import AjoutsRecentsV2 from './AjoutsRecentsV2.svelte';
  // Alias `tr` : `t` est déjà pris comme variable de boucle plus bas
  // ({#each TABS as t}, {#each visibleTracks as t}), et il masquerait le store.
  import { tick, untrack } from 'svelte';
  // 🔴 PLUS d'import de `get` : ce fichier n'a plus AUCUN lecteur de magasin
  // par `get()`. Les deux derniers étaient les effets `pendingLibraryArtist`
  // (#3708) et `pendingLibraryAlbum` (#3717), et c'était précisément le
  // défaut — `get()` n'abonne à rien sous les runes. Si un `get(` réapparaît
  // ici, c'est presque sûrement la même faute : préférer `$monMagasin`.
  import { t as tr, locale } from '../../lib/i18n';
  import { ordreNaturel } from '../../lib/ordreNaturel';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { paliersDeFrequence, type LibelleServi } from '../../lib/libellesFrequence';
  import { formatNombre } from '../../lib/formats';
  /**
   * Bibliothèque — grille d'albums du nouveau client (direction Levente).
   *
   * Deux principes de la maquette :
   *  1. Les filtres RETIRENT les albums non conformes (Bertrand, 01/09/2026 :
   *     « les filtres doivent renvoyer les albums correspondants aux critères
   *     et pas seulement les mettre en surbrillance »). La maquette les
   *     atténuait pour la stabilité spatiale — un album ne sautait jamais de
   *     place — mais un filtre qui ne filtre pas oblige à chercher à l'œil ce
   *     qu'on venait justement de demander à la machine.
   *     Au passage, cela met fin à une INCOHÉRENCE : la vue groupée, elle,
   *     retirait déjà (`if (!matches(a)) continue`). Le même filtre se
   *     comportait donc de deux façons selon l'onglet.
   *     Le filtre de fréquence compare la valeur EXACTE — 176,4 kHz ≠ 192 kHz
   *     (bug Patatorz, tune-server-rust#2343).
   *  2. La densité suit le niveau d'interface (`preferences.settingsLevel`) :
   *     - Essentiel : grille nue, pas de filtres, pas de badges.
   *     - Avancé    : filtres Qualité + Fréquence, badges hi-res/DSD.
   *     - Expert    : + filtres Format & Profondeur, + ligne technique par carte.
   *
   * DEUX SOURCES, UN SEUL ECRAN (Bertrand, 28/08 : « une vue iso library Tune
   * native » pour chaque serveur multimedia). Sans `depot`, cet ecran est la
   * bibliotheque LOCALE, exactement comme avant. Avec `depot`, c'est la
   * bibliotheque d'un AUTRE serveur Tune : meme grille, memes filtres, meme
   * frise, meme fiche album — le catalogue vient de son API REST, la lecture
   * passe par son URL de flux jouee en `source: upnp` par le serveur local.
   * Voir `lib/tuneRemote` pour pourquoi c'est possible chez Tune et pas chez
   * un serveur UPnP tiers.
   */
  import { albums, libraryLoading, libraryFolderScope } from '../../lib/stores/library';
  // 🔴 renesenses/tune-server-rust#4800 — la grille se sert PAR PAGES. La
  // coquille ne charge plus la bibliothèque entière au démarrage ; cet écran
  // demande ses pages au défilement et au saut A–Z, et ne demande la liste
  // ENTIÈRE (`demanderBibliothequeEntiere`) que quand un geste l'exige :
  // recherche, facette, frise, onglet de regroupement, portée. Voir
  // `lib/stores/albumsPagines` pour ce que le serveur sait et ne sait pas.
  import {
    albumsPagines, albumsCharges, casesDeLaListe, demanderPage, demanderBibliothequeEntiere,
    mettreAJourAlbum, offsetDeLettre, TAILLE_PAGE, type ClefDeListe,
  } from '../../lib/stores/albumsPagines';
  // 🔴 `pendingLibraryFolder` n'existe PLUS : `main` l'a remplacé par le
  // magasin `libraryFolderScope` (voir `lib/porteeBibliotheque`) parce qu'un
  // dépôt consommé UNE fois dans l'initialiseur d'un `$state` n'était jamais
  // lu quand la Bibliothèque était déjà montée. On prend sa version.
  // `pendingLibraryAlbum`, lui, reste : c'est le contrat des liens de la
  // lecture en cours (Fabien), et il est toujours consommé plus bas.
  import { activeView, listResetNonce, pendingLibraryAlbum, pendingLibraryYear, type View } from '../../lib/stores/navigation';
  import { nomDeDossier } from '../../lib/porteeBibliotheque';
  import { idsAlbumsDeLaPortee } from '../../lib/porteeDossierAlbums';
  import { melangee, rangAleatoire, graineAleatoire } from '../../lib/shuffle';
  import { optionsAleatoire, albumsDeLaSelection, pistesDeLaSelection } from '../../lib/porteeAleatoire';
  import { lireFileAleatoire, FILE_ALEATOIRE_DEFAUT } from '../../lib/fileAleatoire';
  import { notifications } from '../../lib/stores/notifications';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { getQualityTier, multipleDSD, fold, formatDuration,  type QualityTier } from '../../lib/utils';
  import type { Album, Track } from '../../lib/types';
  import { anneeDOuverture, ecrireAnneeRepere, lireAnneeRepere } from '../../lib/anneeDOuverture';
  import { intertitresAnnee } from '../../lib/intertitresAnnee';
  import { sauterVersAncre } from '../../lib/sautAlphabetique';
  import { anneeAlbum, couvertureAnnees, albumsQuiChangent, comparerAnnees, comparerAlbumsParAnnee, type ModeAnnee } from '../../lib/anneeAlbum';
  import {
    comptesQualite, comptesFrequence, comptesFormat, comptesProfondeur,
    comptesCompilation, comptesProvenance,
    type FiltresBibliotheque, type Outils,
  } from '../../lib/facettesBibliotheque';
  import * as api from '../../lib/api';
  import { provenanceDe, dansSource, sourcesParArtiste, compterSources, type ComptesArtistesSources } from '../../lib/provenanceBibliotheque';
  import { favoriteFacetKeys, facetFavKey } from '../../lib/stores/profile';
  import { basculerFavoriFacette } from '../../lib/favorisLocaux';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  // Un échec de lecture DOIT se voir : ces appels finissaient tous par un
  // `.catch(() => {})` (#3732). Le message du serveur — qui nomme l'appareil
  // manquant — n'atteignait jamais l'écran.
  import { gestesDeZone } from '../../lib/gestesDeZone';
  import { chargerCollectionsCibles, entreesAjoutCollection, type CollectionCible } from '../../lib/albumVersCollection';
  import { lireListeDepuis } from '../../lib/lectureEnMasse';
  // #929 — le carrousel emprunte le geste des rangées éditoriales, il ne le
  // réécrit pas. C'est l'action de #1137, corrigée par #1327 : molette,
  // `Maj`+molette, flèches ←/→, et surtout la règle « la page passe d'abord ».
  import { defilementHorizontal } from '../../lib/defilementHorizontal';
  // #929, second jet — la géométrie de la bande et l'album central. Tout y est
  // CALCULÉ à partir de la place disponible : aucune vignette n'est interrogée,
  // donc le suivi coûte la même chose sur 4 338 albums que sur cinquante.
  import {
    centrageCarrousel, geometrieCarrousel, type GeometrieCarrousel,
  } from '../../lib/centreCarrousel';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import { cibleEtiquetteAlbum } from '../../lib/cibleEtiquette';
  import ListePistesV2 from './ListePistesV2.svelte';
  import { lireChoix, ecrireChoix, lireNombre } from '../../lib/preferencesEcran';
  import QualiteAlbum from './QualiteAlbum.svelte';
  import PastilleCompilation from './PastilleCompilation.svelte';
  import AlbumEditModal from '../partages/AlbumEditModal.svelte';
  import ArtistesV2 from './ArtistesV2.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';
  import { cleDetailAlbum } from '../../lib/cleDetailAlbum';
  import {
    detailOuvert, ouvrirDetail, fermerDetail, fermerDetailEnReculant,
  } from '../../lib/historiqueCoquille';
  import {
    albumsDistants, corpsLecture, pistesAlbumDistant, pistesDistantes, type DepotDistant } from '../../lib/tuneRemote';
  import '../../styles/tune-v2.css';

  let { depot = null }: { depot?: DepotDistant | null } = $props();

  // Catalogue distant. Le premier lot s'affiche des son arrivee : sur une
  // discotheque de plusieurs milliers d'albums, attendre le tout laisserait un
  // ecran vide plusieurs secondes.
  let albumsD = $state<Album[]>([]);
  let chargementD = $state(false);
  let erreurD = $state<string | null>(null);
  $effect(() => {
    const d = depot;
    if (!d) { albumsD = []; erreurD = null; chargementD = false; return; }
    const ctrl = new AbortController();
    albumsD = []; erreurD = null; chargementD = true;
    albumsDistants(d, (partiel) => { if (!ctrl.signal.aborted) albumsD = partiel; }, ctrl.signal)
      .then((tout) => { if (!ctrl.signal.aborted) albumsD = tout; })
      .catch((e) => { if (!ctrl.signal.aborted && e?.name !== 'AbortError') erreurD = `${d.nom} n’a pas répondu.`; })
      .finally(() => { if (!ctrl.signal.aborted) chargementD = false; });
    return () => ctrl.abort();
  });

  /**
   * PORTÉE À UN RÉPERTOIRE — le bouton « ouvrir dans la bibliothèque » de
   * l'écran Répertoires.
   *
   * UNE source de vérité : `libraryFolderScope` (stores/library), lu ici et
   * par l'ancien client, écrit par BrowseView et par la croix de la puce. Il
   * remplace `pendingLibraryFolder`, un dépôt « consommé une fois à
   * l'initialisation » : posé pendant que la Bibliothèque était montée, il
   * n'était jamais lu, et l'écran montrait TOUT sous une puce qui annonçait un
   * répertoire — « c'est l'entièreté de la bibliothèque en cours qui
   * s'affiche » (Sevy Tabroc, forum 1637, renesenses/tune-server-rust#3101),
   * « Répertoires vue en Bibliothèque : filtre non appliqué » (Bertrand,
   * 06/09/2026). Lu en dérivé, il est suivi tant que l'écran vit.
   *
   * ## Pourquoi les identifiants, et pas une reconstruction
   *
   * L'ancien client refait les albums à partir de 5 000 pistes et ÉCRASE le
   * magasin partagé `albums` — la portée survivait donc à l'écran qui l'avait
   * posée. Ici on demande au serveur les albums du dossier, on n'en garde que
   * les IDENTIFIANTS, et on filtre. Le magasin n'est pas touché, les pochettes
   * et les badges continuent de venir d'où ils venaient.
   *
   * Mesuré sur le .18 le 06/09/2026 : `/library/albums-detailed` rend 4 255
   * albums sans filtre, 1 440 pour `/data/music`, 1 306 pour son sous-dossier
   * `NEW_FLAC` — les sous-dossiers sont donc bien inclus.
   */
  const dossierPortee = $derived($libraryFolderScope);
  const nomPortee = $derived(nomDeDossier(dossierPortee));
  /** `null` tant qu'on ne sait pas encore : l'écran attend plutôt que de
   *  montrer tout, ce qui serait exactement le défaut signalé. */
  let idsPortee = $state<Set<number> | null>(null);
  const porteeActive = $derived(!!dossierPortee);
  $effect(() => {
    // Toute nouvelle portée repart de « je ne sais pas » ; une réponse arrivée
    // après un changement de portée est ignorée (`perime`).
    const d = dossierPortee;
    idsPortee = null;
    if (!d) return;
    let perime = false;
    // 🔴 Fil 1880 — PAGINÉ, pas un appel unique. La route borne ce qu'elle
    // rend (`clamp(1, 2000)`) : demander 5 000 en rendait 2 000 sans le dire,
    // et l'écran prenait ces 2 000 pour la portée entière. Comme elle ordonne
    // par artiste de carte, la coupe emportait d'abord les compilations —
    // « les albums "VA-xxx" ont disparu ». Voir `porteeDossierAlbums`.
    idsAlbumsDeLaPortee((limite, rang) => api.getAlbumsDetailed({ folder: d }, limite, rang))
      .then((ids) => {
        if (perime) return;
        idsPortee = ids;
      })
      .catch(() => {
        if (perime) return;
        // Échec : on ne montre RIEN plutôt que tout, et on le DIT.
        idsPortee = new Set();
        notifications.error($tr('library.scopeLoadError').replace('{d}', nomDeDossier(d)));
      });
    return () => { perime = true; };
  });
  function retirerPortee() {
    libraryFolderScope.set(null);
  }

  /** LA source d'albums de l'ecran. Tout le reste lit `src`, jamais `$albums`
   *  ni `albumsD` : c'est ce qui rend la vue identique des deux cotes.
   *
   *  🔴 #4800 — en mode PAGINÉ (`nu`, défini plus bas avec ses raisons), `src`
   *  n'est que ce qui est ARRIVÉ : les pages demandées, dans l'ordre du
   *  serveur. C'est assez pour ce qui se lit sur un échantillon (« y a-t-il
   *  une date d'ajout, un DR ? ») ; tout ce qui exige la liste entière fait
   *  sortir du mode paginé, et `src` redevient la bibliothèque complète. */
  const src: Album[] = $derived.by(() =>
    depot ? albumsD
      : nu ? albumsCharges($albumsPagines)
      : !porteeActive ? $albums
      : idsPortee == null ? []
      : $albums.filter((a) => a.id != null && idsPortee!.has(a.id)),
  );
  const enCharge: boolean = $derived.by(() =>
    depot ? chargementD
      : nu ? ($albumsPagines.total == null && $albumsPagines.erreur == null)
      : (porteeActive && idsPortee == null) || $libraryLoading || (sortirDesPages && !bibliothequeEntiere),
  );

  const level = $derived($preferences.settingsLevel);
  // FILTRER FAIT PARTIE DU GESTE DE BASE (Bertrand, 28/08 : « ou sont passes
  // les filtres ?? »). Dans une app audiophile, choisir « FLAC » ou « 96 kHz »
  // n'est pas une option avancee : c'est la facon normale de retrouver un
  // album. Le compteur, la qualite et la frequence sont donc visibles des
  // l'Essentiel. Ne restent en profondeur que ce qui demande de savoir ce
  // qu'on cherche : format et profondeur de bits (Expert), tri et bascule
  // d'affichage (Avance).
  const showBadges = $derived(atLeast(level, 'intermediate'));
  const showExpert = $derived(atLeast(level, 'expert'));
  /** Ligne technique sous les pochettes : niveau Expert ET réglage activé.
   *  Elle suivait le seul niveau, donc elle était imposée à tout Expert —
   *  or « Expert » dit ce qu'on sait faire, pas ce qu'on veut voir. Défaut OFF. */
  const showTech = $derived(showExpert && $preferences.v2AlbumTechLine);

  /**
   * 🔴 Le gabarit de colonnes est calculé UNE fois, pour toutes les lignes.
   *
   * Bertrand, 05/09/2026 : « vue Library : alignement des textes ».
   *
   * Chaque `.lrow` était sa propre grille. `minmax(0,2fr)`, `1.4fr` et `auto`
   * se résolvent alors sur le contenu de CETTE ligne seule : l'artiste, l'année
   * et la fiche technique commençaient à une abscisse différente d'une ligne à
   * l'autre. Sur sa capture, l'année de « Norah Jones » et celle de « Charlie
   * Parker » ne sont pas à la même place, alors qu'elles se suivent.
   *
   * Les colonnes de queue passent en largeurs FIXES : ce sont des champs de
   * longueur bornée (une année, un badge, « FLAC · 96 kHz · 24-bit »), et une
   * largeur intrinsèque les ferait respirer différemment à chaque ligne.
   */
  const colonnesListe = $derived(
    ['44px', 'minmax(0,2fr)', 'minmax(0,1.4fr)', '52px']
      .concat(showBadges ? ['46px'] : [])
      .concat(showTech ? ['150px'] : [])
      .join(' '),
  );

  /**
   * Fréquences en VALEURS EXACTES (jamais un seuil « ≥ »).
   *
   * 🔴 #1074 — la liste était FIGÉE ici, et ne portait que huit valeurs PCM :
   * un album DSD64 (2 822 400 Hz) ne correspondait à AUCUNE entrée, ne se
   * comptait nulle part et ne se filtrait pas. Ce n'était pas un libellé
   * manquant, c'était une ligne absente (Cyrille, fil 1792).
   *
   * Le serveur les nomme depuis la v0.9.155 (tune-server-rust#4171) ; la
   * liste figée reste le SECOURS pour les serveurs antérieurs. Voir
   * `lib/libellesFrequence`.
   */
  let libellesServis = $state<LibelleServi[]>([]);
  $effect(() => {
    let vivant = true;
    api.getSampleRateLabels().then((l) => { if (vivant) libellesServis = l; });
    return () => { vivant = false; };
  });
  const RATES = $derived(paliersDeFrequence(libellesServis, $locale));
  // DSD, Hi-Res et CD sont des NOMS de format : ils s'écrivent pareil dans
  // toutes les langues. « Compressé » est un mot, et porte donc une clé —
  // d'où `cle`, qui distingue les deux sans que le rendu ait à deviner.
  const QUALITIES: { key: QualityTier | 'hires'; label: string; cle?: string }[] = [
    { key: 'dsd', label: 'DSD' }, { key: 'hires', label: 'Hi-Res' },
    { key: 'cd', label: 'CD' }, { key: 'lossy', label: 'Compressé', cle: 'v2.lib.qualityLossy' },
  ];

  /**
   * Les facettes à valeurs listées portent un TABLEAU — #898.
   *
   * Cyrille Moutia, fil 1665 : « je sélectionne aiff + flac et je filtre aussi
   * sur des fréquences d'échantillonnage différentes ». Oxygen sait le faire
   * depuis le 28/08 ; sa précision du 04/09 19h46 demande les DEUX écrans.
   * Arbitrage de Bertrand, 11/09/2026 : OU dans une facette, ET entre elles.
   *
   * `[]` est l'absence de filtre. Tout est appliqué SUR PLACE, sur une
   * bibliothèque déjà chargée (`matches`) : aucune route ne change ici.
   */
  let fQuality = $state<string[]>([]);
  let fRate = $state<number[]>([]);
  let fFormat = $state<string[]>([]);
  // Tranche de Dynamic Range (#2144), bornes INCLUSES et indépendantes —
  // portée de l'ancienne Bibliothèque. Filtrée ici : chaque album de cette
  // liste porte déjà son DR (voir `drNombre`).
  let fDrMin = $state<number | null>(null);
  let fDrMax = $state<number | null>(null);
  let fDepth = $state<number[]>([]);
  /**
   * COMPILATIONS seulement (#1957). Une bascule, pas un menu.
   *
   * Le serveur accepte `?compilation=true|false` depuis la v0.9.95, mais la
   * bibliothèque est ici DÉJÀ chargée en entier — les autres filtres sont tous
   * appliqués sur place, et un aller-retour réseau pour celui-là seul ferait
   * diverger la grille du compteur. Le filtre est donc posé au même endroit
   * que ses voisins, sur `matches`.
   *
   * `false` n'est pas offert : voir `FiltresBibliotheque.compilation`.
   */
  let fCompilation = $state<boolean | null>(null);

  /**
   * SOURCE — de quelle bibliothèque l'album vient (#4152).
   *
   * `null` = toutes les sources. Sinon `'local'`, ou `'upnp:<udn>'` pour UN
   * serveur précis.
   *
   * 🔴 Nommé `fProvenance` et pas `fSource` : le mode d'année de cet écran
   * s'appelle déjà « origine » (`v2.lib.yearOrigin`), et la facette `source`
   * de `/library/tracks` désigne le SUPPORT (CD, vinyle). Le libellé affiché
   * reste « Source », qui est le mot de l'utilisateur.
   *
   * Comme ses voisins, le filtre est appliqué SUR PLACE : la bibliothèque est
   * déjà chargée. La sélection reste partagée entre Albums, Artistes et
   * Pistes ; les comptes portent sur les éléments de l'onglet courant.
   */
  let fProvenance = $state<string | null>(null);

  /**
   * Les noms que les serveurs s'annoncent, par UDN.
   *
   * `source_id` ne porte que l'UDN ; le nom lisible vit au registre
   * (`GET /network/media-servers`, champ `id` = ce même UDN). Bertrand,
   * 14/09/2026 : le libellé est le NOM du serveur, jamais `upnp` ni une IP
   * quand un nom existe.
   *
   * Le registre est CONSULTÉ, jamais exigé : injoignable, le menu s'affiche
   * quand même et l'entrée porte son UDN abrégé. Perdre la pilule entière
   * parce qu'un nom manque serait la mauvaise panne.
   */
  let nomsServeurs = $state<Record<string, string>>({});
  let sourcesIntegrees = $state<string[]>([]);
  $effect(() => {
    let alive = true;
    Promise.resolve().then(() => api.getUpnpLibrarySources()).then(({ items }) => {
      if (alive) sourcesIntegrees = [...new Set(items.map(s => `upnp:${s.udn}`))];
    }).catch(() => { /* older servers still expose album provenance */ });
    return () => { alive = false; };
  });
  $effect(() => {
    let vivant = true;
    api.getMediaServers()
      .then((liste) => {
        if (!vivant) return;
        const carte: Record<string, string> = {};
        for (const s of liste) if (s.id && s.name) carte[s.id] = s.name;
        nomsServeurs = carte;
      })
      .catch(() => { /* registre muet : les UDN suffisent à filtrer */ });
    return () => { vivant = false; };
  });

  /** Le libellé d'une provenance dans le menu et sur la pilule. */
  function libelleProvenance(cle: string): string {
    if (cle === 'local') return $tr('v2.lib.sourceLocal' as any);
    if (!cle.startsWith('upnp:')) return cle.toUpperCase();
    const udn = cle.slice(cle.indexOf(':') + 1);
    // Le nom du registre d'abord ; à défaut, l'UDN abrégé — lisible, et qui
    // reste distinctif quand deux serveurs cohabitent.
    return nomsServeurs[udn] ?? `${udn.slice(0, 18)}…`;
  }

  /** Formats et profondeurs REELLEMENT presents, avec leur compte. Proposer
   *  une liste figee ferait offrir des rubriques vides — et un filtre qui ne
   *  renvoie rien passe pour un bug. */
  // ── Menus de filtres ──────────────────────────────────────────────────────
  //
  // Ils s'ouvraient au SURVOL SEUL, et étaient donc inatteignables : le chip
  // fait 36 px de haut, `.drop` l'épouse, mais le menu était posé à `top:44px`.
  // Huit pixels morts entre les deux — en descendant vers le menu, le pointeur
  // quittait `.drop`, `:hover` tombait, le menu disparaissait avant d'être
  // atteint. « Les filtres ne sont pas sélectionnables » (Bertrand, 01/09/2026),
  // sur la Bibliothèque comme sur les Serveurs multimédia, qui montent le même
  // composant.
  //
  // Deux corrections, et il faut les deux :
  //  - un PONT transparent comble les 8 px, pour que le survol reste continu ;
  //  - le chip devient un vrai bouton qui ouvre au CLIC. Un menu au survol seul
  //    n'existe ni au clavier ni au toucher : sur tablette, aucun de ces
  //    filtres n'était atteignable, quelle que soit la géométrie.
  let ddOpen = $state<string | null>(null);
  /**
   * #4800 — les COMPTES des menus de facettes se calculent sur la bibliothèque
   * entière, que le mode paginé n'a pas. Approcher un menu (survol ou clic)
   * la demande ; d'ici là, les menus affichent « … ». Collant : une fois
   * voulue, la liste reste jusqu'à la prochaine invalidation.
   */
  let facettesVoulues = $state(false);
  function voirLesFacettes() { facettesVoulues = true; }
  function ddToggle(id: string) { voirLesFacettes(); ddOpen = ddOpen === id ? null : id; }
  function ddClose() { ddOpen = null; }
  // Un menu ouvert au clic doit se refermer au clic AILLEURS, sinon il reste
  // planté par-dessus la grille. `.drop` couvre le chip ET son menu.
  function ddDehors(e: MouseEvent) {
    if (ddOpen && !(e.target as HTMLElement)?.closest('.drop')) ddClose();
  }
  function ddEchap(e: KeyboardEvent) { if (e.key === 'Escape') ddClose(); }

  /**
   * Cocher ou décocher UNE valeur d'une facette — #898.
   *
   * Un nouveau tableau, jamais une mutation : `$state` suit la RÉFÉRENCE, et
   * un `push` sur place ne relancerait ni la grille ni les comptes.
   *
   * 🔴 Le menu ne se referme pas après un clic, contrairement aux pastilles
   * d'avant. C'est le geste que la capture d'Audirvana montre : on coche
   * plusieurs cases d'affilée. Refermer après la première rendrait la
   * sélection multiple possible mais indécouvrable.
   */
  function basculeFacette<T>(liste: T[], v: T): T[] {
    return liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v];
  }

  let q = $state('');

  function tierMatches(a: Album, key: string): boolean {
    const t = getQualityTier(a);
    if (key === 'hires') return t === 'hires' || t === 'hires_max';
    return t === key;
  }
  function matches(a: Album): boolean {
    // Une facette cochée est satisfaite par UNE de ses valeurs (OU) ; deux
    // facettes cochées le sont toutes les deux (ET) — #898.
    if (fQuality.length && !fQuality.some((c) => tierMatches(a, c))) return false;
    if (fRate.length && !fRate.includes(a.sample_rate ?? 0)) return false; // exact
    // 🔴 L'annee EFFECTIVE, pas seulement l'annee choisie : balayer la frise
    // filtre la grille en direct. Voir `anneeEffective`.
    if (anneeEffective != null && albumYear(a) !== anneeEffective) return false;
    if (fFormat.length && !fFormat.includes(a.format?.trim().toUpperCase() ?? '')) return false;
    if (fDepth.length && !fDepth.includes(a.bit_depth ?? 0)) return false;
    if (fDrMin != null || fDrMax != null) {
      // Un album sans DR ne répond pas à une question de DR : il sort.
      const dr = drNombre(a);
      if (dr == null) return false;
      if (fDrMin != null && dr < fDrMin) return false;
      if (fDrMax != null && dr > fDrMax) return false;
    }
    // `?? false` : un serveur d'avant la v0.9.95, ou une bibliothèque pas
    // encore re-scannée, ne porte pas le champ. Il vaut « non », comme côté
    // serveur — jamais « on ne sait pas, laissons passer ».
    if (fCompilation != null && (a.is_compilation ?? false) !== fCompilation) return false;
    if (!dansSource(a, fProvenance)) return false;
    if (q && !fold(a.title).includes(fold(q)) && !fold(a.artist_name).includes(fold(q))) return false;
    return true;
  }

  const sorted = $derived.by(() => {
    const list = [...src];
    // #1434 — « Disc 2 » avant « Disc 10 » : l'ordre des NOMBRES, pas du texte.
    const byTitle = (a: Album, b: Album) => ordreNaturel(fold(a.title), fold(b.title));
    switch (sortKey) {
      case 'artist':
        return list.sort((a, b) => fold(a.artist_name).localeCompare(fold(b.artist_name)) || byTitle(a, b));
      case 'year':
        // Sans annee en DERNIER quel que soit le sens : un album non date ne
        // doit pas squatter la tete de liste.
        //
        // 🔴 L'annee, PUIS la date de sortie (#866). Le bouble « Plus recent
        // d'abord » ne descendait pas sous l'annee : deux albums de 1975
        // retombaient sur l'ordre alphabetique, ce que Jean Valjean lit comme
        // un bouton qui n'ordonne pas. `comparerAlbumsParAnnee` departage sur
        // `original_date`/`release_date` quand les DEUX portent un mois, et
        // rend 0 sinon — on retombe alors sur `byTitle`, comme avant.
        return list.sort((a, b) =>
          comparerAlbumsParAnnee(a, b, modeAnnee, ordreAnnee) || byTitle(a, b),
        );
      case 'added':
        return list.sort((a, b) => (b.added_at ?? 0) - (a.added_at ?? 0) || byTitle(a, b));
      case 'random':
        // Rang dérivé de `(id, graine)` : reproductible tant que la graine ne
        // change pas. `byTitle` en second départage la collision de rang, pour
        // que l'ordre reste TOTAL — sans quoi deux albums pourraient permuter
        // d'un recalcul à l'autre selon l'implémentation du tri du moteur.
        return list.sort((a, b) =>
          rangAleatoire(cleTirage(a), graineTirage) - rangAleatoire(cleTirage(b), graineTirage) || byTitle(a, b),
        );
      case 'dr':
        // Les albums SANS tag sortent en dernier, jamais à DR 0 : les annoncer
        // à zéro serait un mensonge (`NULLS LAST` côté serveur, même règle).
        return list.sort((a, b) => {
          const va = drNombre(a), vb = drNombre(b);
          if (va == null && vb == null) return byTitle(a, b);
          if (va == null) return 1;
          if (vb == null) return -1;
          return vb - va || byTitle(a, b);
        });
      default:
        return list.sort(byTitle);
    }
  });
  /** Les albums réellement affichés : `sorted` filtré par les critères. Une
   *  seule source pour la grille, la liste, le rail A–Z et le compteur — sinon
   *  ils divergent et le rail propose des lettres qui ne mènent nulle part. */
  const affiches = $derived(sorted.filter(matches));
  // `matchCount` est défini plus bas, avec le mode paginé : en pages, le
  // compte est le `total` du serveur, pas la longueur de ce qui est arrivé.

  // Rail A–Z : première lettre d'un album (non-alpha → « # »).
  // ── Frise chronologique (direction Levente, brouillon v3 du 26/08) ────
  //
  // Troisième mode de navigation dans la collection, à côté du rail A–Z :
  // un histogramme du nombre d'albums par année. Sur une discothèque, le
  // repère naturel est souvent l'époque, pas la première lettre.
  //
  // Cohérence avec la règle d'or de l'écran : choisir une année ATTÉNUE les
  // albums d'une autre année, elle ne les retire pas. Les pochettes gardent
  // leur place — c'est la mémoire visuelle qui fait retrouver un album.
  //
  // Disponible à partir d'Avancé : en Essentiel, le rail A–Z suffit et reste
  // le seul repère, conformément au principe « seulement le plus pertinent ».
  type NavMode = 'alpha' | 'years';
  let navMode = $state<NavMode>(lireChoix('lib.nav', ['alpha', 'years'] as const, 'alpha'));
  $effect(() => ecrireChoix('lib.nav', navMode));
  /** La frise est un second repere de navigation : elle vient s'ajouter au
   *  rail A-Z, elle ne le remplace pas. On la propose des l'Avance. */

  /** Année retenue pour un album : l'année d'ORIGINE prime sur celle de
   *  réédition — sur du jazz ou du classique, l'écart se compte en décennies
   *  et c'est l'enregistrement qui situe l'œuvre. */
  /**
   * Quelle annee lire, et dans quel sens — demande de Bertrand le 04/09/2026.
   *
   * L'ecran appliquait « origine si connue, sinon edition » en dur, sans le
   * dire. Le choix est desormais explicite, et l'ecran ANNONCE la couverture
   * de chaque mode : mesure sur le .18, `original_year` n'est rempli que sur
   * 90 albums des 4255 (2 %), contre 3049 pour `year`. Choisir « origine »
   * sans le savoir ferait tomber la frise a 90 albums, ce qui se lit comme une
   * panne.
   *
   * `release_date` n'est toujours pas propose comme MODE : mesure du
   * 12/09/2026 sur le .18 (v0.9.146), 0 album sur 4 255 en porte un. Un choix
   * qui ne trierait rien n'est pas un choix.
   *
   * ⚠️ A ne pas confondre avec le DEPARTAGE par date ajoute pour #866 : le tri
   * par annee descend desormais jusqu'a `original_date`/`release_date` quand
   * les deux albums compares en portent une (`comparerAlbumsParAnnee`). C'est
   * un second critere applique sous l'annee, pas une entree de menu — il
   * n'affiche rien de nouveau et ne coute rien quand la donnee manque.
   */
  let modeAnnee = $state<ModeAnnee>('auto');
  let ordreAnnee = $state<'asc' | 'desc'>('desc');
  const albumYear = $derived((a: Album) => anneeAlbum(a, modeAnnee));
  const changeants = $derived(albumsQuiChangent(src));

  /**
   * Changer de mode retire le filtre d'annee.
   *
   * « 1975 » choisi en mode origine ne designe plus rien en mode edition —
   * l'album est range a 1994. La grille se viderait sans qu'aucune puce ne
   * paraisse fautive, et le premier reflexe serait de croire la bibliotheque
   * cassee.
   *
   * `dernierMode` est un `let` ordinaire, pas un `$state` : l'effet ne doit
   * dependre que de `modeAnnee`. Suivre `fYear` ici le ferait se relancer sur
   * sa propre ecriture.
   */
  let dernierMode: ModeAnnee = modeAnnee;
  $effect(() => {
    if (modeAnnee !== dernierMode) { dernierMode = modeAnnee; fYear = null; }
  });
  const MODES_ANNEE: { k: ModeAnnee; cle: string }[] = [
    { k: 'auto', cle: 'v2.lib.yearAuto' },
    { k: 'edition', cle: 'v2.lib.yearEdition' },
    { k: 'origine', cle: 'v2.lib.yearOrigin' },
  ];

  let fYear = $state<number | null>(null);

  /**
   * Les comptes de CHAQUE filtre tiennent compte des AUTRES (Bertrand,
   * 04/09/2026 : « les filtres cumulatifs ne modifient pas les valeurs d'albums
   * correspondants sur les filtres restants »).
   *
   * Ils se calculaient sur `src`, c'est-a-dire la bibliotheque entiere : filtrer
   * sur Hi-Res laissait « FLAC 3 049 » alors que la combinaison n'en donne
   * qu'une poignee. Et Qualite comme Frequence n'affichaient AUCUN compte : des
   * listes en dur dont la plupart des valeurs ne correspondent a rien.
   *
   * Chaque facette se compte SANS elle-meme — sinon choisir FLAC mettrait tous
   * les autres formats a zero et le menu deviendrait un cul-de-sac.
   */
  /**
   * ⚠️ Les compteurs de FACETTES restent sur l'annee CHOISIE, pas sur le survol.
   *
   * Ils decrivent le jeu de filtres que l'utilisateur a pose ; les recalculer a
   * chaque annee traversee ferait clignoter toute la rangee de pastilles
   * pendant qu'on balaye, et couterait un parcours complet de la bibliotheque
   * par cran. La grille suit le curseur ; les pastilles suivent les choix.
   */
  const filtresActifs = $derived<FiltresBibliotheque>({
    qualite: fQuality, frequence: fRate, annee: fYear,
    format: fFormat, profondeur: fDepth, recherche: q,
    compilation: fCompilation, provenance: fProvenance,
  });
  const outilsFacettes = $derived<Outils>({
    qualiteDe: tierMatches, anneeDe: albumYear, plier: fold, provenanceDe,
  });

  const formats = $derived(comptesFormat(src, filtresActifs, outilsFacettes));
  const depths = $derived(comptesProfondeur(src, filtresActifs, outilsFacettes));
  const nQualite = $derived(comptesQualite(src, filtresActifs, outilsFacettes, QUALITIES.map((x) => x.key)));
  const nFrequence = $derived(comptesFrequence(src, filtresActifs, outilsFacettes, RATES.map((r) => r.v)));
  /** Combien de compilations, compte tenu des AUTRES filtres. À zéro, la puce
   *  ne s'affiche pas : proposer un filtre qui ne rend rien passe pour un bug —
   *  et c'est le cas normal sur une bibliothèque pas encore re-scannée. */
  const nCompilations = $derived(comptesCompilation(src, filtresActifs, outilsFacettes));

  /** Annee SURVOLEE dans la frise. Le curseur suit la souris : c'est ce qui
   *  fait qu'il « parcourt les annees » au lieu d'attendre un clic. */
  let hoverYear = $state<number | null>(null);

  /**
   * L'annee qui commande la GRILLE.
   *
   * Bertrand, 05/09/2026 : il veut que la grille suive le curseur. Jusqu'ici la
   * frise ne filtrait qu'au clic ; le survol ne bougeait que le curseur, et
   * balayer cinquante ans ne montrait rien.
   *
   * Le survol l'emporte tant qu'il dure — c'est un APERCU. Quitter la frise
   * remet `hoverYear` a `null`, et la grille retombe sur l'annee choisie, ou
   * sur rien. Le clic, lui, FIGE : `fYear` survit a la sortie de la frise, et
   * le curseur se marque « fige ».
   *
   * Ordre voulu : survol AVANT choix. Sans cela, une annee figee empecherait
   * d'en previsualiser une autre — la frise deviendrait morte des le premier
   * clic, ce qui est exactement l'inverse de ce qu'on veut.
   */
  const anneeEffective = $derived(hoverYear ?? fYear);

  /** Mois survole dans l'annee, 0..11.
   *
   *  C'est une GRADUATION, pas une donnee : sur cette bibliotheque, 6 albums
   *  sur 54 portent un mois (`original_date`/`release_date`), les autres n'ont
   *  que l'annee. On ne place donc AUCUN album dans un mois — l'axe est
   *  simplement gradue au douzieme, et le curseur annonce le cran qu'il
   *  survole. Pretendre repartir les albums par mois inventerait 89 % de la
   *  distribution. */
  let hoverMonth = $state<number | null>(null);
  const MOIS = ['JAN', 'FÉV', 'MAR', 'AVR', 'MAI', 'JUN', 'JUL', 'AOÛ', 'SEP', 'OCT', 'NOV', 'DÉC'];

  /** Cran de 1/12 sous le pointeur, dans le trait survole. */
  function surveille(e: MouseEvent, year: number) {
    hoverYear = year;
    const el = e.currentTarget as HTMLElement;
    const w = el.getBoundingClientRect().width;
    if (w <= 0) { hoverMonth = null; return; }
    hoverMonth = Math.min(11, Math.max(0, Math.floor((e.offsetX / w) * 12)));
  }

  // ── Tri (contrôle « Title ▾ » du brouillon v3) ────────────────────────
  // « Ajout récent » n'est propose que si la donnee existe : sur une
  // bibliotheque importee d'un ancien serveur, `added_at` est souvent vide,
  // et un tri qui ne trie rien est pire qu'un tri absent.
  type SortKey = 'title' | 'artist' | 'year' | 'added' | 'dr' | 'random';
  // `l` porte une CLÉ, pas un libellé : le menu de tri restait en français
  // quelle que soit la langue (Bertrand, 06/09/2026).
  const SORTS: { k: SortKey; l: string }[] = [
    { k: 'title', l: 'v2.lib.sortTitle' }, { k: 'artist', l: 'v2.lib.sortArtist' },
    { k: 'year', l: 'v2.lib.sortYear' }, { k: 'added', l: 'v2.fav.sortRecent' },
    // Dynamic Range (#2144) — l'écran actuel l'a depuis longtemps, la nouvelle
    // interface ne l'avait jamais repris. Décroissant : on trie par DR pour
    // remonter ses disques les PLUS dynamiques, pas les plus écrasés.
    { k: 'dr', l: 'library.sortDynamicRange' },
    /**
     * 🔴 #4558 — Steve Taylor, fil 1671, 19/09/2026 : « Could you reinstate
     * the "random" sort for albums in the library view please? »
     *
     * Le tri aléatoire (#3074, livré en v0.9.131) vivait dans l'ancienne
     * interface, que la phase 5 a retirée (`d5ed7deb`) ; la v2 ne l'avait
     * jamais repris. Ses deux libellés étaient restés dans les onze
     * dictionnaires, sans consommateur.
     *
     * TRI CLIENT, et non `sort=random&seed=` du serveur — qui sait pourtant le
     * faire (`albums.rs:115`). Repasser par le chemin TRIÉ du serveur
     * rouvrirait deux défauts mesurés : il perd `added_at` (voir
     * `v2Bootstrap.loadAlbums`, mesure du 05/09) et il ne sert pas
     * `dynamic_range` (#4521) — l'écran perdrait deux de ses autres tris pour
     * en gagner un. Et il n'y a rien à paginer : la v2 tient toute sa
     * bibliothèque en mémoire et trie les cinq autres critères elle-même.
     */
    { k: 'random', l: 'library.sortRandom' },
  ];
  /**
   * 🔴 RETENU d'une visite à l'autre (Lulu, forum, 05/09/2026 : « figer le
   * choix de l'organisation de la bibliothèque »). Il repartait sur « Titre »
   * à chaque retour, quel que soit le choix précédent.
   */
  let sortKey = $state<SortKey>(lireChoix('lib.sort', SORTS.map((s2) => s2.k), 'title'));
  $effect(() => ecrireChoix('lib.sort', sortKey));
  /**
   * La GRAINE du tri aléatoire (#4558). C'est elle, et elle seule, qui fixe
   * l'ordre : `sorted` est un `$derived.by` recalculé à chaque frappe de
   * recherche, à chaque filtre et à l'arrivée de la seconde page d'albums —
   * un mélange tiré là re-battrait les cartes sous le doigt. Le rang venant de
   * `(id, graine)`, l'ordre relatif de deux albums ne dépend jamais des
   * autres : il tient donc aussi sous un filtre, et une liste qui s'allonge
   * n'en déplace aucun.
   *
   * Retenue d'une visite à l'autre, comme le choix de tri lui-même : revenir
   * sur la Bibliothèque pour retrouver un ordre neuf ferait perdre l'album
   * qu'on venait de repérer.
   */
  let graineTirage = $state<number>(lireNombre('lib.sortSeed') ?? graineAleatoire());
  $effect(() => ecrireChoix('lib.sortSeed', String(graineTirage)));
  /** « Re-tirer au hasard » n'est rien d'autre que « nouvelle graine ». */
  function reTirer(): void { graineTirage = graineAleatoire(); }
  /**
   * Ce sur quoi porte le tirage. `id` peut être nul — un album d'un dépôt
   * distant n'en a pas toujours — et deux albums sans identifiant ne doivent
   * pas partager le même rang : on retombe alors sur le titre, qui les
   * distingue, plutôt que sur un 0 commun.
   */
  const cleTirage = (a: Album) => a.id ?? a.title ?? '';
  const hasAddedAt = $derived(src.some((a) => (a.added_at ?? 0) > 0));
  /**
   * Le DR d'un album, en nombre — `null` quand il n'est pas tagué.
   *
   * ⚠️ `'0'` est une VRAIE valeur (un album entièrement écrasé), pas une
   * absence : `Number('')` rendrait 0 et le ferait passer pour tel.
   */
  const drNombre = (a: Album): number | null => {
    const v = (a as any).dynamic_range;
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  /**
   * 🔴 Le tri DR ne PARAÎT que s'il trie quelque chose — même règle que la
   * tranche DR de l'écran actuel, qui se cache quand aucune valeur n'existe.
   *
   * Mesuré le 09/09/2026 sur TROIS serveurs (.18, .15, .42) : aucun album,
   * aucune piste ne porte de DR. Proposer le tri là-dessus donnerait une
   * entrée de menu qui ne change rien à l'écran — ce qui se lit comme une
   * panne, pas comme une bibliothèque non taguée.
   */
  const hasDr = $derived(src.some((a) => drNombre(a) != null));
  /** Les DR réellement présents, croissants — pas une échelle inventée. */
  const valeursDr = $derived([...new Set(src.map(drNombre).filter((v): v is number => v != null))].sort((x, y) => x - y));
  const availableSorts = $derived(
    SORTS.filter((s2) => (s2.k !== 'added' || hasAddedAt) && (s2.k !== 'dr' || hasDr)),
  );
  /**
   * Un tri devenu indisponible ne doit pas rester ACTIF : la bibliothèque
   * paraîtrait triée par un critère absent du menu.
   *
   * 🔴 MAIS UNE LISTE VIDE NE DÉCIDE DE RIEN (#899).
   *
   * `hasAddedAt` et `hasDr` interrogent `src`, et `src` est VIDE le temps que
   * la bibliothèque arrive. Sans cette garde, l'enchaînement était :
   *
   *   1. l'écran s'ouvre, `src` est vide, `hasAddedAt` est faux ;
   *   2. « Ajout récent » quitte `availableSorts` ;
   *   3. cet effet rabat `sortKey` sur `'title'`… et l'effet voisin
   *      (`ecrireChoix('lib.sort', …)`) ÉCRIT ce `'title'` dans le stockage ;
   *   4. les albums arrivent, « Ajout récent » revient au menu — mais le choix
   *      de l'utilisateur a déjà été effacé, définitivement.
   *
   * eric, forum 1668, 04/09/2026 : « je n'ai pas vu de possibilité de tri des
   * albums par date d'ajout dans la nouvelle interface ». L'option EXISTE et le
   * serveur sert bien `added_at` — mesuré le 12/09/2026 sur le .18
   * (v0.9.146) : 4 255 albums sur 4 255 en portent un. C'est le retour sur
   * « Titre » à chaque ouverture qui la faisait paraître absente, et c'est
   * exactement la plainte de Lulu (05/09) que `preferencesEcran` devait régler.
   *
   * On ne retire donc un tri que sur une liste qui a répondu. Le cas réel —
   * une bibliothèque chargée où rien ne porte la donnée — reste couvert.
   */
  $effect(() => {
    if (!src.length) return;
    if (!availableSorts.some((s2) => s2.k === sortKey)) sortKey = 'title';
  });

  // ── Affichage grille / liste / carrousel ──────────────────────────────
  /**
   * #929 — TROIS modes de parcours, et le carrousel est le troisième.
   *
   * OLIVE, fil 1483, 19/08/2026 : « Pourrait-on envisager une vue des albums
   * en 3D comme sur JRiver ». La réponse de Bertrand, le même jour, déplace la
   * demande et c'est celle-là qu'on sert :
   *
   * > « On écoute en grand, mais on parcourt sa bibliothèque en petit, sur une
   * > grille pensée pour un bureau. […] Le plaisir vient des pochettes en
   * > grand, pas de la troisième dimension — et les deux ne sont pas liés. »
   *
   * 🔴 IL S'AJOUTE, IL NE REMPLACE PAS. La grille reste le mode par défaut et
   * reste atteignable d'un clic : la réserve posée le 19/08 — « superbe sur
   * cinquante albums, hostile sur deux mille » — vaut toujours, et c'est
   * l'utilisateur qui tranche pour sa discothèque, pas nous.
   */
  type Display = 'grid' | 'list' | 'carousel';
  const AFFICHAGES = ['grid', 'list', 'carousel'] as const;
  /** Le libellé d'un mode. La bascule annonce celui où elle MÈNE. */
  const LIBELLE_AFFICHAGE: Record<Display, string> = {
    grid: 'v2.lib.viewGrid', list: 'v2.lib.viewList', carousel: 'v2.lib.viewCarousel',
  };
  /**
   * 🔴 `lireChoix` VALIDE contre cette liste : un `'carousel'` écrit puis
   * retiré de `AFFICHAGES` retomberait silencieusement sur la grille. C'est ce
   * qui rend le choix durable, et c'est ce que le témoin de rechargement garde.
   */
  let display = $state<Display>(lireChoix('lib.display', AFFICHAGES, 'grid'));
  $effect(() => ecrireChoix('lib.display', display));

  /** Histogramme : une barre par année, du minimum au maximum RÉELS de la
   *  bibliothèque — pas une plage fixe, qui laisserait des décennies vides
   *  chez quelqu'un dont la collection commence en 1985. */
  const histogram = $derived.by(() => {
    const counts = new Map<number, number>();
    for (const a of src) {
      const y = albumYear(a);
      if (y != null) counts.set(y, (counts.get(y) ?? 0) + 1);
    }
    if (!counts.size) return { bars: [] as { year: number; n: number }[], max: 0, min: 0, maxYear: 0 };
    const years = [...counts.keys()].sort((x, z) => x - z);
    const min = years[0], maxYear = years[years.length - 1];
    const bars: { year: number; n: number }[] = [];
    for (let y = min; y <= maxYear; y++) bars.push({ year: y, n: counts.get(y) ?? 0 });
    return { bars, max: Math.max(...counts.values()), min, maxYear };
  });

  /** Repères de décennie sous la frise, alignés sur les barres. */
  const decades = $derived.by(() => {
    const { bars } = histogram;
    if (!bars.length) return [] as { year: number; pct: number }[];
    const out: { year: number; pct: number }[] = [];
    for (let i = 0; i < bars.length; i++) {
      if (bars[i].year % 10 === 0) out.push({ year: bars[i].year, pct: (i / bars.length) * 100 });
    }
    return out;
  });

  const yearCount = $derived(fYear == null ? 0 : src.filter((a) => albumYear(a) === fYear).length);

  /** Position du curseur. Il est TOUJOURS pose sur l'axe — c'est un repere de
   *  parcours, pas un marqueur de filtre.
   *
   *  #1314 : a l'ouverture, il se calait sur l'annee la mieux fournie, a chaque
   *  visite (« systematiquement sur l'annee ayant le plus d'album », Jean
   *  Valjean, fil 1671). Il reprend desormais la derniere annee CHOISIE, et a
   *  defaut l'annee la plus recente — voir `lib/anneeDOuverture.ts`. Le repere
   *  retenu ne filtre rien : seul `fYear` (un clic) attenue la grille. */
  let anneeRepere = $state<number | null>(lireAnneeRepere());
  $effect(() => {
    const an = fYear;
    if (an != null) { anneeRepere = an; ecrireAnneeRepere(an); }
  });
  const anneeParDefaut = $derived(anneeDOuverture(histogram.bars, anneeRepere));
  const cursorYear = $derived(hoverYear ?? fYear ?? anneeParDefaut);
  /** Position en %, au CENTRE du trait de cette annee. */
  const cursorPct = $derived.by(() => {
    const { bars } = histogram;
    if (!bars.length || cursorYear == null) return null;
    const i = bars.findIndex((b) => b.year === cursorYear);
    return i < 0 ? null : ((i + 0.5) / bars.length) * 100;
  });
  const cursorCount = $derived(
    cursorYear == null ? 0 : (histogram.bars.find((b) => b.year === cursorYear)?.n ?? 0)
  );
  /** Le mois n'est montre que pendant le SURVOL : une fois l'annee figee par
   *  un clic, le filtre porte sur l'annee entiere et afficher un mois
   *  laisserait croire qu'il filtre plus fin qu'il ne le fait. */
  const cursorLabel = $derived(
    cursorYear == null ? ''
      : (fYear === null && hoverYear === cursorYear && hoverMonth !== null)
        ? `${MOIS[hoverMonth]} ${cursorYear}`
        : String(cursorYear)
  );

  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');

  /**
   * 🔴 Le rail suit le TRI, il ne suppose plus le titre.
   *
   * « L'utilisation de l'ascenseur alpha pourrait-il tenir compte du choix
   * fait dans l'onglet Bibliothèque sur le tri des albums : Titre / Artiste /
   * Année / Ajout récent » — et, plus tôt, « l'ascenseur alphabétique de la
   * Bibliothèque ne fonctionne pas normalement » (Lulu, forum 1671, 05 et
   * 06/09/2026).
   *
   * Il lisait `a.title` en toutes circonstances. Trié par artiste, cliquer
   * « M » cherchait donc le premier album dont le TITRE commence par M —
   * quelque part au milieu de la liste, sans rapport avec l'ordre affiché.
   * Ce n'était pas un rail imprécis, c'était un rail qui visait autre chose.
   */
  function firstLetter(a: Album): string {
    const source = sortKey === 'artist' ? (a.artist_name ?? '') : (a.title ?? '');
    const c = fold(source).charAt(0).toUpperCase();
    return c >= 'A' && c <= 'Z' ? c : '#';
  }

  /**
   * ⚠️ Et sur un tri CHRONOLOGIQUE, on le retire.
   *
   * Trié par année ou par ajout récent, aucune lettre ne peut correspondre à
   * une position : les initiales sont dispersées dans toute la liste. Un rail
   * qui promet un saut et atterrit au hasard est pire qu'un rail absent — et
   * c'est précisément ce que Lulu décrivait. La frise des années, elle, reste :
   * c'est le bon repère pour ces deux tris, et elle existe déjà.
   */
  const railUtile = $derived(sortKey === 'title' || sortKey === 'artist');

  /**
   * #1313 — triée par année, la grille et la liste s'ouvrent sur un
   * INTERTITRE à chaque changement d'année (« les années n'apparaissent pas
   * lors du défilement », Jean Valjean, fil 1671). Le rail étant retiré sur ce
   * tri et la frise réservée au niveau Intermédiaire, c'était le seul écran de
   * la Bibliothèque sans aucun repère. Voir `lib/intertitresAnnee.ts`.
   */
  const intertitres = $derived(sortKey === 'year' ? intertitresAnnee(affiches, albumYear) : null);

  // `present` (les lettres que le rail allume) est défini plus bas, avec le
  // mode paginé : en pages, on ne connaît pas les initiales de ce qui n'est
  // pas arrivé.
  let gridEl: HTMLDivElement | undefined = $state();
  /**
   * 🔴 #1487 — LE SAUT SE VÉRIFIE, IL NE SE CALCULE PLUS UNE BONNE FOIS.
   *
   * « Je clique sur la lettre N et j'accède aux albums commençant par P. En
   * revanche, si je clique une 2ᵉ fois sur N, ça me renvoie bien aux albums
   * commençant par N » (FabienM, fil « v0.9.162 : divers bugs », 23/09/2026).
   *
   * C'était un `scrollIntoView({ behavior: 'smooth' })`. Sur une grille en
   * `content-visibility:auto` (voir la règle `.card` plus bas), les vignettes
   * jamais rendues valent 210 px d'estimation ; l'animation les traverse, les
   * fait rendre, et chacune rétrécit à sa taille réelle PENDANT le trajet. Le
   * chiffre visé au départ ne désigne plus la même rangée à l'arrivée. Au
   * second clic, tout est déjà mesuré : plus rien ne bouge, le saut tombe
   * juste. Le détail et le remède sont dans `lib/sautAlphabetique`.
   *
   * `gridEl` est bien le conteneur DÉFILANT dans les trois affichages —
   * `.grid`, `.rows` et `.carrou` portent chacun leur `overflow` —, et c'est
   * aussi lui qui abrite les ancres.
   */
  function jump(L: string) {
    if (!nu) { sauterVersAncre(gridEl, `[data-letter="${L}"]`); return; }
    // #4800 — en pages, la lettre est un OFFSET dans la liste du serveur :
    // trouvé par dichotomie (`offsetDeLettre`), sa page est demandée, puis
    // on vise la CASE — `data-i` — qui existe, vide ou pleine, dès que le
    // total est connu. `sauterVersAncre` vérifie le saut comme d'habitude.
    const c = clef;
    if (!c) return;
    void offsetDeLettre(c, L, firstLetter).then(async (offset) => {
      // Le tri a changé pendant la recherche : l'offset ne désigne plus rien.
      if (offset == null || clef !== c) return;
      await demanderPage(c, Math.floor(offset / TAILLE_PAGE));
      await tick();
      sauterVersAncre(gridEl, `[data-i="${offset}"]`);
    });
  }

  /**
   * 🔴 #1222 — FAIRE ENTRER UN ALBUM DANS UN DOSSIER DE « COLLECTIONS ».
   *
   * Lulu (JLuc), fil 1844 : « un bouton permettant le transfert des albums de
   * la "Bibliothèque" vers les répertoires de "Collections" ». Treizième
   * « écrit mais pas branché » de ce client : `api.addAlbumToCollection`
   * existe, le serveur expose la route, et son SEUL appelant vivait dans
   * l'ancienne interface (`LibraryView.svelte:144`).
   *
   * Les collections INTELLIGENTES ne sont pas proposées : leur contenu vient
   * de leurs règles, pas d'une liste d'identifiants. Y « ajouter » un album
   * n'aurait aucun sens. `GET /library/collections` ne rend que les
   * manuelles — les intelligentes ont leur propre route.
   *
   * Le geste lui-même (route, notifications, relecture) vit dans
   * `lib/albumVersCollection` depuis le 23/09/2026 : la fiche album l'appelle
   * aussi, et une seule implémentation vaut mieux que deux copies.
   */
  let collectionsCibles = $state<CollectionCible[]>([]);
  $effect(() => {
    let vivant = true;
    chargerCollectionsCibles().then((cs) => { if (vivant) collectionsCibles = cs; });
    return () => { vivant = false; };
  });

  /** Une entrée par collection. Celles qui contiennent déjà l'album restent
   *  proposées, mais le disent : les retirer se lirait comme « cette
   *  collection n'existe pas ». La liste est RELUE après l'ajout (`apres`). */
  function entreesCollection(a: Album) {
    return entreesAjoutCollection(collectionsCibles, a.id, (k) => $tr(k as any), (relues) => (collectionsCibles = relues));
  }

  function tech(a: Album): string {
    const t = getQualityTier(a);
    const rate = RATES.find((r) => r.v === a.sample_rate)?.l;
    const depth = a.bit_depth ? `${a.bit_depth}-bit` : '';
    // Le multiple vit dans `lib/utils` : le seuil « ≥ 5 MHz ⇒ DSD128 » annonçait
    // DSD128 pour les DSD256 ET les DSD512 — sept albums sur les 49 de la
    // bibliothèque de Bertrand, toujours sous-estimés.
    if (t === 'dsd') { const m = multipleDSD(a.sample_rate); return m ? `DSD · ${m}` : 'DSD'; }
    return [a.format?.toUpperCase(), rate, depth].filter(Boolean).join(' · ');
  }
  function badge(a: Album): string | null {
    const t = getQualityTier(a);
    if (t === 'dsd') return 'DSD';
    if (t === 'hires' || t === 'hires_max') return RATES.find((r) => r.v === a.sample_rate)?.court ?? null;
    return null;
  }

  // ── Onglets de la bibliotheque (brouillon v3 : Albums, Artists, Tracks,
  //    Genres, Years, Labels) ──────────────────────────────────────────────
  //
  // Quatre d'entre eux sont des FACETTES des memes albums : artiste, genre,
  // annee, label sont tous portes par `Album`. On regroupe donc les donnees
  // deja chargees plutot que d'appeler le serveur — c'est instantane, et ca
  // ne peut pas diverger de la grille.
  //
  // Artistes et Pistes partagent le chargement des pistes pour résoudre leurs sources.
  type Tab = 'albums' | 'artists' | 'tracks' | 'genres' | 'years' | 'labels' | 'recent';
  // Mêmes clés que les onglets des Favoris : ce sont les mêmes familles, et
  // les traduire deux fois les ferait diverger.
  const TABS: { id: Tab; label: string; adv?: boolean }[] = [
    { id: 'albums', label: 'favorites.albums' },
    { id: 'artists', label: 'favorites.artists' },
    { id: 'tracks', label: 'favorites.tracks' },
    { id: 'genres', label: 'nav.genres', adv: true },
    { id: 'years', label: 'v2.lib.tabYears', adv: true },
    { id: 'labels', label: 'v2.lib.tabLabels', adv: true },
    // #3039 — porté de l'ancienne Bibliothèque, seule à l'offrir.
    { id: 'recent', label: 'library.recentlyAdded' },
  ];
  // L'ONGLET aussi : revenir à la Bibliothèque après avoir consulté les Titres
  // pour retomber sur les Albums est le même agacement, d'un cran plus haut.
  let tabChoisi = $state<Tab>(lireChoix('lib.tab', TABS.map((t2) => t2.id), 'albums'));
  // C'est le CHOIX qu'on retient, jamais sa substitution ci-dessous : ouvrir
  // un serveur distant ne doit pas effacer l'onglet où l'on était chez soi.
  $effect(() => ecrireChoix('lib.tab', tabChoisi));

  /**
   * 🔴 #1372 — LES ONGLETS RÉELLEMENT OFFERTS, et l'onglet réellement MONTRÉ.
   *
   * Jean Valjean, fil 1856, 20/09/2026 : sous l'en-tête « Tune Server —
   * 192.168.1.10:8888 », l'onglet « Ajouts récents » affichait la
   * bibliothèque LOCALE, et l'écrivait — « Pistes et albums ajoutés à la
   * bibliothèque locale ». `AjoutsRecentsV2` a sa propre source,
   * `/home/recently-added`, une route locale sans paramètre d'hôte, et
   * `LibraryV2` le montait sans lui passer `depot` : c'était le seul point du
   * corps à ignorer le dépôt, alors que le reste du fichier le suit partout
   * (`albumsD`, `facetteCourante`, les vignettes, `AlbumDetailV2 {depot}`).
   *
   * ⚠️ ON NE LUI PASSE PAS `depot` : il n'y a rien à lui passer. Le protocole
   * du dépôt distant (`tuneRemote.ts`) n'expose que `/library/albums`,
   * `/library/albums/{id}/tracks` et `/library/tracks` — aucune route
   * « ajouts récents » n'existe chez l'hôte distant. Un onglet qui ne peut pas
   * répondre pour le serveur qu'on regarde ne doit pas être offert : c'est la
   * règle déjà appliquée au bouton « ajouter des dossiers » (`{#if !depot}`),
   * retiré sur un dépôt parce qu'il agirait sur une autre machine.
   *
   * 🔴 ET LA SUBSTITUTION EST INDISPENSABLE, pas cosmétique. `lib.tab` est
   * persisté d'une visite à l'autre : masquer le seul BOUTON laisserait le
   * corps monter `AjoutsRecentsV2` au retour d'une visite locale passée sur
   * cet onglet — la route locale repartirait, avec un onglet invisible en
   * prime. On lit donc partout `tab`, jamais `tabChoisi`.
   */
  const ONGLETS = $derived(TABS.filter((t2) => !depot || t2.id !== 'recent'));
  const tab = $derived<Tab>(ONGLETS.some((t2) => t2.id === tabChoisi) ? tabChoisi : 'albums');
  /**
   * 🔴 Le carrousel n'est proposé QUE là où il rend quelque chose.
   *
   * Seul l'onglet Albums porte la branche carrousel ; les facettes, les
   * pistes et les ajouts récents ont leurs propres rendus. Sans cette garde,
   * la bascule y offrirait un troisième cran sans effet — un clic mort, que
   * la Bibliothèque vient justement de payer ailleurs (#1957, la pastille
   * d'année qui ne se retirait plus). Un carrousel déjà choisi y retombe donc
   * sur la grille, sans effacer le choix retenu pour la vue Albums.
   */
  const modesAffichage = $derived<readonly Display[]>(
    tab === 'albums' ? AFFICHAGES : (['grid', 'list'] as const),
  );
  const affichageSuivant = $derived<Display>(
    modesAffichage.indexOf(display) < 0
      ? 'grid'
      : modesAffichage[(modesAffichage.indexOf(display) + 1) % modesAffichage.length],
  );
  /** Le carrousel est-il RÉELLEMENT à l'écran ? Le rail et le corps s'y règlent. */
  const enCarrousel = $derived(display === 'carousel' && tab === 'albums');

  /**
   * #929, second jet — l'album mis en avant, et la taille de la bande.
   *
   * 🔴 Les deux viennent de `centrageCarrousel`, jamais d'une mesure faite
   * ici : deux endroits qui décideraient de la géométrie divergeraient, et
   * l'album DÉSIGNÉ ne serait plus celui qui GRANDIT.
   */
  let iCentre = $state(0);
  let geoCarrou = $state<GeometrieCarrousel>(geometrieCarrousel(0, 0));
  // Des fonctions stables : recréées à chaque rendu, elles relanceraient
  // l'action en boucle.
  const marquerCentre = (i: number) => { iCentre = i; };
  const poserGeometrie = (g: GeometrieCarrousel) => { geoCarrou = g; };

  /**
   * Les filtres portent sur les ALBUMS — qualité, fréquence, format,
   * profondeur, année. L'onglet Artistes n'en affiche aucun : les laisser
   * promettait un filtrage qui ne pouvait pas agir, et le compteur
   * « Tout (4255) » annonçait des albums au-dessus d'une grille d'artistes
   * (signalé par Bertrand, capture à l'appui, 02/09/2026).
   *
   * La recherche et la source restent : elles filtrent les artistes.
   */
  /**
   * Les filtres d'ALBUM ne s'affichent pas la ou ils n'agissent pas.
   *
   * Les pistes se filtrent par recherche et source : ni la qualite, ni le
   * format, ni la profondeur, ni l'annee ne touchent la liste des titres. Les
   * puces restaient pourtant affichees sur l'onglet Titres, et le compteur
   * « Tout (n) » y annoncait un nombre d'ALBUMS — 55 albums de 2026 au-dessus
   * de 46 877 titres. En passant d'Albums a Titres, l'ecran gardait donc
   * l'habillage du precedent : « la vue n'est pas bien rafraichie »
   * (Bertrand, 04/09/2026).
   *
   * Le tri etait deja masque ici par `showTools && tab !== 'tracks'` : la
   * regle existait, elle n'etait appliquee qu'a un controle sur cinq.
   *
   * ⚠️ `recent` A ÉTÉ OUBLIÉ. La règle ci-dessus date d'avant l'onglet
   * « Ajouts récents » (#3039), qui monte le composant `AjoutsRecentsV2` :
   * ce composant a sa PROPRE source (`/home/recently-added`), sa propre
   * fenêtre 15/30 jours, et ne reçoit ni `q`, ni `fQuality`, ni `fYear`, ni
   * `sortKey`. Toutes ces commandes y étaient donc rendues MORTES — « le fait
   * de cocher ajouts récents bloque tout, la seule partie qui se met à jour »
   * (Jean Valjean, fil 1856, 20/09/2026 11 h 25, 0.9.158, Windows/Firefox).
   */
  const showFilters = $derived(tab !== 'artists' && tab !== 'tracks' && tab !== 'recent');

  /** Recherche et Source : elles filtrent les albums et les artistes, pas la
   *  fenêtre des Ajouts récents, qui vient d'une autre route. */
  const showSearch = $derived(tab !== 'recent');

  /** Tri et bascule grille/liste : outils de confort, pas de recherche. */
  /** Tri et bascule grille/liste : outils de confort, pas de recherche.
   *  Sans objet sur les artistes — le tri porte sur des champs d'album, et il
   *  n'y a qu'une seule façon d'afficher une grille d'artistes. */
  const showTools = $derived(atLeast(level, 'intermediate') && tab !== 'artists');

  /** A–Z / Années : une navigation dans les ALBUMS. La vue Artistes a son
   *  propre rail A–Z, et « Années » n'a aucun sens sur un artiste. */
  /** Frise, rail A–Z et choix de l'annee : une navigation dans les ALBUMS.
   *  Elle n'a pas plus de sens sur les titres que sur les artistes.
   *
   *  Ni sur les Ajouts récents : cette vue est classée par date d'AJOUT, sur
   *  une fenêtre de 15 ou 30 jours qu'elle porte elle-même. Une frise des
   *  années de parution posée au-dessus ne pilote rien — et c'est justement
   *  la recette du testeur (« Ajouts récents, Tout, Années, Origine sinon
   *  édition »). Le rail A–Z, lui, n'a jamais été rendu ici (`tab === 'albums'`
   *  plus bas) : un rail alphabétique sur un classement chronologique
   *  promettrait un saut qui atterrirait au hasard. */
  const showTimeline = $derived(atLeast(level, 'intermediate') && tab !== 'artists' && tab !== 'tracks' && tab !== 'recent');

  // ── #4800 — LA BIBLIOTHÈQUE PAR PAGES ──────────────────────────────────────
  //
  // Mesuré sur le .18 (9 427 albums) : la coquille chargeait TOUT à chaque
  // ouverture — quatre requêtes en série, 3,5 Mo — et le refaisait à chaque
  // fin de scan. La grille se sert désormais par pages de `TAILLE_PAGE`,
  // demandées quand leurs cases entrent dans le cadre ou au saut A–Z, avec le
  // tri envoyé au SERVEUR. C'est le mode « nu » : la bibliothèque locale, sans
  // dépôt distant, sans portée, sans filtre, sans recherche, sur l'onglet
  // Albums, avec un tri que le serveur sait rendre dans le même ordre.
  //
  // Tout ce qui exige la liste ENTIÈRE en fait sortir, et la demande — une
  // fois, à ce moment-là, jamais au démarrage :
  //  - les facettes et leurs comptes (chaque facette se compte sans elle-même,
  //    sur toute la bibliothèque : le serveur ne compte aucune facette et ne
  //    filtre ni la fréquence, ni la profondeur, ni la source, ni l'année) ;
  //  - la recherche locale `q` (titre + artiste, pliés) ;
  //  - la frise des années (histogramme sur toute la collection) et le filtre
  //    d'année, survolé ou figé ;
  //  - les onglets Genres / Années / Labels (regroupements) et Artistes /
  //    Titres (appartenances par source, album d'une piste) ;
  //  - la portée de répertoire (identifiants à croiser) ;
  //  - le tri par ANNÉE : il descend sous l'année (`comparerAlbumsParAnnee`,
  //    mode origine/édition, intertitres) — le serveur ne trie que `a.year`.
  //
  // Routes serveur qui manquent pour aller plus loin (rapportées dans la PR) :
  // bornes par lettre, comptes de facettes croisés, filtres fréquence /
  // profondeur / source / année / texte sur `/library/albums`, `total` filtré.

  /** Le tri de l'écran, tel que le serveur le nomme. `null` = il ne sait pas. */
  const clef: ClefDeListe | null = $derived.by(() => {
    switch (sortKey) {
      case 'title': return { sort: 'title', order: 'asc' };
      case 'artist': return { sort: 'artist', order: 'asc' };
      case 'added': return { sort: 'added', order: 'desc' };
      case 'dr': return { sort: 'dr', order: 'desc' };
      // La graine de l'écran EST la graine du serveur (#3074) : « re-tirer »
      // change la clef, et donc la liste.
      case 'random': return { sort: 'random', order: 'asc', seed: graineTirage };
      default: return null;
    }
  });

  /** La liste ENTIÈRE est-elle là ? `albums` reste `[]` tant que personne ne l'a demandée. */
  const bibliothequeEntiere = $derived($albums.length > 0);

  const filtreActif = $derived(
    fQuality.length > 0 || fRate.length > 0 || fFormat.length > 0 || fDepth.length > 0
      || fDrMin != null || fDrMax != null || fCompilation != null || fProvenance != null,
  );

  /**
   * Un geste qui exige toute la bibliothèque À L'ÉCRAN — voir la liste
   * ci-dessus. « Ajouts récents » n'en fait pas partie : cet onglet a sa
   * propre route.
   */
  const sortirDesPages = $derived(
    !depot && (
      porteeActive || (tab !== 'albums' && tab !== 'recent') || q !== '' || filtreActif
      || fYear != null || hoverYear != null || (showTimeline && navMode === 'years')
      || clef == null
    ),
  );
  /**
   * Ce qui DEMANDE la liste entière : les gestes ci-dessus, plus l'approche
   * d'un menu de facettes — qui, elle, ne change rien à la grille : les pages
   * restent à l'écran pendant que la liste arrive, et les comptes s'écrivent
   * quand ils sont calculables.
   */
  const besoinDeTout = $derived(sortirDesPages || (!depot && facettesVoulues));

  /** Le mode paginé. */
  const nu = $derived(!depot && !bibliothequeEntiere && !sortirDesPages);

  // La liste entière, quand un geste l'exige et qu'elle n'est pas là. Après
  // une invalidation (`albums` vidé), l'effet se rejoue : un écran monté qui
  // en a toujours besoin la redemande, un écran qui n'en a plus besoin ne
  // coûte rien.
  $effect(() => {
    if (depot || !besoinDeTout || bibliothequeEntiere) return;
    void demanderBibliothequeEntiere().catch(() => {
      /* dit par `libraryLoading` retombé et une grille vide ; le bandeau
         d'`api` a déjà parlé */
    });
  });

  // La première page, dès qu'on est en pages — et à chaque changement de
  // liste (tri, graine) ou de génération (fin de scan). Les pages suivantes
  // viennent des cases qui entrent dans le cadre (`observerCase`).
  $effect(() => {
    if (!nu || !clef) return;
    void $albumsPagines.generation;
    void demanderPage(clef, 0);
  });

  /** Les cases de la grille en pages : une par album du total, vide ou pleine. */
  const cases: (Album | null)[] = $derived.by(() => (nu ? casesDeLaListe($albumsPagines) : []));

  /**
   * Une case VIDE qui entre dans le cadre demande sa page. Un observateur par
   * conteneur défilant (grille, liste ou carrousel — ils se remplacent) ;
   * `rootMargin` à une moitié de cadre pour que la page soit là avant qu'on
   * la voie. Sans `IntersectionObserver` (témoins), on demande tout de suite.
   */
  let observateur: IntersectionObserver | null = null;
  let racineObservee: Element | null = null;
  function demanderCase(i: number) {
    const c = clef;
    if (!nu || !c || !Number.isFinite(i)) return;
    void demanderPage(c, Math.floor(i / TAILLE_PAGE));
  }
  function observerCase(el: HTMLElement, i: number) {
    if (typeof IntersectionObserver === 'undefined') { demanderCase(i); return; }
    const racine = el.parentElement;
    if (!observateur || racineObservee !== racine) {
      observateur?.disconnect();
      racineObservee = racine;
      observateur = new IntersectionObserver((entrees) => {
        for (const e of entrees) {
          if (e.isIntersecting) demanderCase(Number((e.target as HTMLElement).dataset.i));
        }
      }, { root: racine, rootMargin: '50%' });
    }
    observateur.observe(el);
    return { destroy() { observateur?.unobserve(el); } };
  }
  $effect(() => () => { observateur?.disconnect(); observateur = null; racineObservee = null; });

  /** Le compte affiché sur « Tout » : en pages, le total du serveur. */
  const matchCount: number = $derived.by(() => (nu ? ($albumsPagines.total ?? 0) : affiches.length));
  /** Les comptes des menus ne valent que sur la liste entière. */
  const comptesPrets = $derived(!!depot || bibliothequeEntiere);
  /**
   * Les lettres que le rail allume. En pages, on ne connaît pas les initiales
   * de ce qui n'est pas arrivé : toutes sont offertes, et un clic sur une
   * lettre absente atterrit sur la suivante — c'est ce que la dichotomie rend.
   */
  const present = $derived(railUtile ? (nu ? new Set(ALPHA) : new Set(affiches.map(firstLetter))) : new Set<string>());


  /** Facette d'un album pour l'onglet courant. `null` = non renseigne, et on
   *  le dit (« Sans label ») plutot que de faire disparaitre l'album : une
   *  lacune de metadonnee est une information exploitable. */
  function facetOf(a: Album, t: Tab): string | null {
    if (t === 'artists') return a.artist_name?.trim() || null;
    if (t === 'genres') return a.genre?.trim() || null;
    if (t === 'labels') return a.label?.trim() || null;
    if (t === 'years') { const y = albumYear(a); return y == null ? null : String(y); }
    return null;
  }
  // ⚠️ Ces libellés servent AUSSI de clé de regroupement : ils sont résolus
  // ici, une fois, et `groups` compare ensuite des chaînes déjà rendues.
  const FACET_EMPTY: Record<string, string> = $derived({
    artists: $tr('v2.lib.unknownArtist' as any), genres: $tr('v2.lib.noGenre' as any),
    labels: $tr('v2.lib.noLabel' as any), years: $tr('v2.lib.unknownYear' as any) });

  /**
   * Le nom de la facette COTE SERVEUR pour l'onglet courant.
   *
   * L'onglet s'appelle « Genres », la table s'appelle `genre` : le pluriel est
   * un libelle d'interface, pas une cle. Les ecrire au singulier ici evite
   * d'ecrire des favoris que `/library/facets` ne saura jamais relire.
   *
   * `artists` n'y figure pas : un artiste a un IDENTIFIANT, son coeur passe
   * donc par la table des favoris normale, pas par celle des facettes.
   */
  const FACETTE_SERVEUR: Partial<Record<Tab, string>> = {
    genres: 'genre', years: 'year', labels: 'label',
  };

  /** Un depot distant n'a pas de facettes chez nous : ses genres viennent de
   *  SON catalogue, et un favori local ne saurait pas les reselectionner. */
  const facetteCourante = $derived(depot ? null : (FACETTE_SERVEUR[tab] ?? null));

  function estFacetteFavorite(valeur: string): boolean {
    const f = facetteCourante;
    return f ? $favoriteFacetKeys.has(facetFavKey(f, valeur)) : false;
  }

  async function basculerFacette(valeur: string) {
    const f = facetteCourante;
    if (f) await basculerFavoriFacette(f, valeur);
  }

  /**
   * Sauter sur une valeur de facette depuis l'ecran Favoris.
   *
   * La recherche `q` ne conviendrait pas : elle porte sur le titre et
   * l'artiste, pas sur le genre — chercher « Jazz » dans l'onglet Genres
   * n'aurait rien rendu. On change donc d'onglet, on VIDE la recherche (une
   * recherche en cours ferait disparaitre la section visee) et on fait
   * defiler jusqu'a la section, retrouvee par son `data-facette`.
   */
  $effect(() => {
    const surFacette = (e: Event) => {
      const d: any = (e as CustomEvent).detail ?? {};
      if (!TABS.some((t2) => t2.id === d.onglet)) return;
      // Les onglets de facette sont reserves au niveau intermediaire : y
      // envoyer un debutant le poserait sur un onglet qu'il ne voit pas.
      if (!atLeast(level, 'intermediate')) return;
      tabChoisi = d.onglet;
      q = '';
      const valeur = String(d.valeur ?? '');
      tick().then(() => {
        const cible = [...document.querySelectorAll<HTMLElement>('.facet[data-facette]')]
          .find((el) => el.dataset.facette === valeur);
        cible?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    };
    window.addEventListener('tune:v2-facette', surFacette);
    return () => window.removeEventListener('tune:v2-facette', surFacette);
  });

  /** Regroupement pour les onglets facettes : une entree par valeur, avec ses
   *  albums, triee par nom — sauf les annees, triees chronologiquement. */
  const groups = $derived.by(() => {
    // `artists` n'en fait plus partie : cet onglet a sa propre vue, qui lit la
    // table des artistes. Le laisser ici calculerait un regroupement que plus
    // personne n'affiche, sur chaque frappe de la recherche.
    if (tab === 'albums' || tab === 'tracks' || tab === 'artists')
      return [] as { key: string; albums: Album[]; reel: boolean }[];
    const m = new Map<string, Album[]>();
    // 🔴 Une valeur RENSEIGNEE et le libelle de remplacement (« Sans genre »)
    // ne se distinguent plus une fois dans la cle : on note ici, a la source,
    // laquelle est reelle. C'est ce qui decide si le coeur est propose — mettre
    // « Annee inconnue » en favori ecrirait une facette que le serveur ne
    // saurait pas selectionner.
    const reels = new Set<string>();
    for (const a of sorted) {
      if (!matches(a)) continue;
      const brut = facetOf(a, tab);
      const k = brut ?? FACET_EMPTY[tab];
      if (brut != null) reels.add(k);
      const arr = m.get(k); if (arr) arr.push(a); else m.set(k, [a]);
    }
    const out = [...m.entries()].map(([key, albums]) => ({ key, albums, reel: reels.has(key) }));
    if (tab === 'years') {
      out.sort((x, z) => {
        // « Annee inconnue » n'est pas un nombre : il part en dernier quel que
        // soit le sens, comme les albums sans annee dans la grille.
        const nx = Number(x.key), nz = Number(z.key);
        return comparerAnnees(Number.isNaN(nx) ? null : nx, Number.isNaN(nz) ? null : nz, ordreAnnee);
      });
    } else {
      out.sort((x, z) => fold(x.key).localeCompare(fold(z.key)));
    }
    return out;
  });

  /**
   * 🔴 Les onglets de FACETTE s'ouvrent sur une LISTE, pas sur des pochettes.
   *
   * « Dans la biblio, après avoir cliqué sur "Genres", la présentation par
   * ordre alphabétique avec les pochettes d'album affichées oblige à scroller
   * longuement pour atteindre le genre souhaité. Une simple liste cliquable
   * est beaucoup plus rapide, quitte à afficher les pochettes après le choix »
   * (eric, forum 1671, 06/09/2026).
   *
   * Sur cette bibliothèque, l'onglet Genres empilait toutes les valeurs avec
   * leurs grilles : atteindre « Rock » demandait de traverser tous les albums
   * de tous les genres précédents. La liste tient en un écran ; les pochettes
   * arrivent au clic.
   *
   * ⚠️ Remis à zéro quand on change d'onglet ou de recherche : rester sur un
   * genre en passant aux Labels montrerait une valeur qui n'existe pas dans la
   * nouvelle famille — un écran vide sans explication.
   */
  let facetteOuverte = $state<string | null>(null);
  $effect(() => { void tab; void q; facetteOuverte = null; });
  const groupeOuvert = $derived(
    facetteOuverte == null ? null : (groups.find((g) => g.key === facetteOuverte) ?? null),
  );

  // Pistes et appartenances des artistes : un chargement partagé par portée.
  let tracks = $state<Track[]>([]);
  let tracksLoading = $state(false);
  let tracksError = $state<string | null>(null);
  /**
   * La portée sous laquelle `tracks` a été rempli — `undefined` tant qu'aucun
   * chargement n'a eu lieu, `null` pour « toute la bibliothèque ».
   *
   * C'était un simple booléen `tracksLoaded` : la liste se chargeait UNE fois
   * et ne se rechargeait plus jamais. Choisir un répertoire laissait donc les
   * 46 000 titres à l'écran sous la puce du dossier —
   * renesenses/tune-server-rust#3101, mot pour mot : « c'est l'entièreté de la
   * bibliothèque en cours qui s'affiche et non pas celle du répertoire
   * sélectionné ». Une portée, pas un drapeau.
   */
  let porteePistes: string | null | undefined = undefined;
  /**
   * 🔴 Un JETON, pas le nettoyage de l'effet.
   *
   * L'effet se rejoue aussi quand on QUITTE l'onglet (`tab` est sa
   * dépendance). Un drapeau posé par le nettoyage périmerait alors une requête
   * parfaitement valide : au retour, `porteePistes` vaut déjà la portée, aucun
   * rechargement ne part, et l'écran resterait sur « Chargement… » à jamais.
   * Le jeton ne bouge que lorsqu'un NOUVEAU chargement commence.
   */
  let jetonPistes = 0;
  /**
   * Le nombre de pistes ANNONCÉ pendant que la liste charge.
   *
   * `/stats` le rend tout de suite ; `getAllTracks()` met plusieurs secondes
   * sur 46 000 titres. Le compteur affichait donc « 0 titres » tout ce temps —
   * un écran qui annonce zéro pendant qu'il charge se lit comme une
   * bibliothèque vide. « Affichage dès le début du chargement du nb de
   * pistes » (Bertrand, 06/09/2026).
   *
   * Il ne sert QUE pendant le chargement : une fois la liste là, c'est elle
   * qui fait foi — un total du serveur et une liste qui ne coïncideraient pas
   * seraient pires que l'attente.
   */
  let nbPistesServeur = $state<number | null>(null);
  $effect(() => {
    const d = depot;
    const portee = dossierPortee;
    if ((tab !== 'tracks' && tab !== 'artists') || porteePistes === portee) return;
    porteePistes = portee;
    // 🔴 La liste repart VIDE : la portée vient de changer, ce qu'elle
    // contient ne correspond plus à ce que la puce annonce. Un écran vide qui
    // le dit vaut mieux qu'une bibliothèque entière qui ment.
    const jeton = ++jetonPistes;
    tracks = [];
    nbPistesServeur = null;
    tracksLoading = true;
    tracksError = null;
    // Un dépôt distant compte SES pistes, pas les nôtres : on ne lui prête pas
    // le total local, on n'annonce simplement rien.
    // `/library/stats`, pas `/system/stats` : c'est un écran de bibliothèque.
    // Les deux rendent `tracks` (46 877 sur le .18, mesuré le 06/09/2026), le
    // premier sans traîner l'inventaire des zones et des sorties.
    // Sous portée, le total du serveur porte sur TOUTE la bibliothèque : on
    // n'annonce pas un compte qu'on ne servira pas.
    if (!d && !portee) api.getLibraryStats().then((st) => { if (jeton === jetonPistes) nbPistesServeur = st?.tracks ?? null; }).catch(() => {});
    (d ? pistesDistantes(d)
       : portee ? api.getFilteredTracks({ folder: portee, limit: 5000 }).then((r) => r.items ?? [])
       : api.getAllTracks())
      .then((t) => { if (jeton === jetonPistes) tracks = t ?? []; })
      .catch((e) => {
        if (jeton !== jetonPistes) return;
        tracks = [];
        tracksError = e?.message ?? $tr('common.error');
        // L'échec est DIT. Les trois `catch` de l'ancien client écrivaient en
        // console et laissaient la liste précédente à l'écran : c'est le second
        // mécanisme nommé par #3101.
        if (portee) notifications.error($tr('library.scopeLoadError').replace('{d}', nomDeDossier(portee)));
      })
      .finally(() => { if (jeton === jetonPistes) tracksLoading = false; });
  });

  /**
   * Ouvrir l'album d'une piste depuis l'onglet Titres.
   *
   * On rouvre la fiche par l'ALBUM chargé, pas par un objet reconstruit à
   * partir de la piste : la fiche lit `cover_path`, `format`, `sample_rate`,
   * l'année — une piste ne les porte pas tous, et la fiche s'ouvrirait
   * amputée. Sans album correspondant (une piste de service, un dépôt), pas
   * de loupe : un bouton qui ne fait rien est pire qu'un bouton absent.
   */
  function albumDeLaPiste(t: Track): Album | null {
    const aid = (t as any).album_id;
    if (aid == null || depot) return null;
    return $albums.find((a) => a.id === aid) ?? null;
  }
  const pistesRecherche = $derived.by(() => {
    const needle = fold(q);
    return tracks.filter(t => !needle || fold(t.title).includes(needle) || fold(t.artist_name).includes(needle));
  });
  const pistesFiltrees = $derived(pistesRecherche.filter(t => dansSource(t, fProvenance)));
  const visibleTracks = $derived(pistesFiltrees.slice(0, 500));
  // #1501 — l'onglet Artistes n'a plus de fiche : ce sont TOUJOURS les comptes
  // de la grille. Ceux d'une discographie commune (#4330) se lisent désormais
  // sur la page commune, qui porte son propre compte dans son en-tête.
  let comptesArtistes = $state<ComptesArtistesSources>({ comptes: new Map(), total: 0 });
  const comptesAlbums = $derived(comptesProvenance(src, filtresActifs, outilsFacettes));
  const comptesPistes = $derived(compterSources(pistesRecherche.map(t => [provenanceDe(t)])));
  const provenances = $derived.by(() => {
    const counts = new Map(tab === 'artists' ? comptesArtistes.comptes
      : tab === 'tracks' ? comptesPistes : comptesAlbums);
    if (tab !== 'artists' && tab !== 'tracks') {
      counts.set('upnp', [...counts].reduce((n, [s, c]) => n + (s === 'upnp' || s.startsWith('upnp:') ? c : 0), 0));
    }
    // Une recherche sans résultat ne fait pas disparaître les choix.
    for (const source of ['local', 'upnp', ...src.map(provenanceDe), ...tracks.map(provenanceDe), ...sourcesIntegrees]) {
      if (!counts.has(source)) counts.set(source, 0);
    }
    if (fProvenance && !counts.has(fProvenance)) counts.set(fProvenance, 0);
    return [...counts.entries()].sort(([a], [b]) =>
      a === b ? 0 : a === 'local' ? -1 : b === 'local' ? 1 : a === 'upnp' ? -1 : b === 'upnp' ? 1
        : libelleProvenance(a).localeCompare(libelleProvenance(b)));
  });
  // Les artistes peuvent appartenir à plusieurs sources : ne pas sommer leurs comptes.
  const matchCountToutesSources = $derived(tab === 'artists' ? comptesArtistes.total
    : tab === 'tracks' ? pistesRecherche.length : comptesAlbums.reduce((n, [, c]) => n + c, 0));
  const comptesSourcesEnCharge = $derived((tab === 'tracks' || tab === 'artists') && (tracksLoading || tracksError != null));
  const appartenancesArtistes = $derived(sourcesParArtiste(src, tracks));

  // La portée dossier inclut aussi les artistes de pistes de compilation.
  // Sans portée, la table des artistes reste entière, y compris sans album.
  const idsArtistesPortee = $derived<Set<number> | null>(
    !porteeActive || depot ? null : new Set(appartenancesArtistes.keys()),
  );
  const nbPistesAnnonce = $derived(
    tracksLoading && !q && !fProvenance && nbPistesServeur != null ? nbPistesServeur : pistesFiltrees.length,
  );
  /**
   * « Lire à partir d'ici » sur l'onglet Titres — #1061, point 9 de FabienM.
   *
   * La suite, c'est l'ORDRE AFFICHÉ : `visibleTracks`, donc filtres et tri
   * compris. Prendre la bibliothèque entière ferait jouer des titres que
   * l'écran ne montre pas.
   */
  function lireLesTitresDepuis(i: number) {
    const zid = zoneRequise();
    if (zid == null) return;
    lireListeDepuis(visibleTracks as any, i, gestesDeZone(zid))
      .catch(signalerEchecLecture);
  }

  function playTrack(t: Track) {
    const zid = $currentZoneId;
    if (zid == null || t.id == null) return;
    // Un `track_id` n'a de sens que pour le serveur LOCAL : celui d'un serveur
    // distant designerait un tout autre morceau ici. On passe donc par son URL
    // de flux, jouee en `source: upnp`.
    playAndSync(zid, depot ? (corpsLecture(depot, t) as any) : { track_id: t.id }).catch(signalerEchecLecture);
  }
  let opened = $state<Album | null>(null);

  /**
   * 🔴 LA FICHE D'ALBUM EMPILE UNE ENTRÉE D'HISTORIQUE — #1121.
   *
   * FabienM, fil forum 1829, point 10 (v0.9.152) : « BACK navigateur
   * fonctionne mal sur menu Bibliothèque quand on clique sur un album par
   * exemple, le BACK revient à l'accueil alors qu'il devrait revenir au menu
   * Bibliothèque ».
   *
   * MESURÉ au navigateur sur la .18 (v0.9.153) avant d'écrire : l'URL reste
   * `#library` du clic « Bibliothèque » jusqu'à la fiche ouverte. Le Précédent
   * ne se trompe donc pas de destination — il dépile la seule entrée qui
   * existait sous `#library`, celle de l'Accueil, et fait exactement son
   * travail. Ce qui manquait, c'est l'entrée de la fiche : le calque n'écrit
   * rien, puisque l'ouvrir ne change pas `activeView` et que seul
   * `historiqueCoquille` — abonné à la VUE — écrivait.
   *
   * Huit écrans tiennent déjà la règle depuis #980 ; celui-ci en était
   * l'exception NOMMÉE (`calquesAlbumEmpilent980.test.ts` : « dette assumée —
   * six écrivains de `opened`, dont un asynchrone »). Cette dette est ici
   * payée : les six écrivains passent désormais par QUATRE portes, et par
   * elles seules.
   *
   * ⚠️ `untrack` — LE MODE DE PANNE DE CE CORRECTIF. Trois de ces portes sont
   * appelées depuis un `$effect`. Sans `untrack`, y lire `opened` ou `tab`
   * inscrirait une dépendance, et l'effet se relancerait sur sa propre
   * écriture : une entrée empilée par rendu, la pile noyée, le Précédent
   * inutilisable.
   *
   * 🟢 LA DETTE DES CALQUES IMBRIQUÉS EST ÉTEINTE — #1501. `detailOuvert` ne
   * porte qu'une clé, et l'onglet Artistes y rangeait la sienne (`artiste:12`)
   * pour son propre calque : tant qu'il était à l'écran, l'album ouvert
   * par-dessus n'empilait rien, faute de PILE dans `historiqueCoquille`. La
   * fiche d'artiste est désormais une VUE (la page commune), plus un calque
   * dans celle-ci : cet écran est le SEUL à écrire dans le magasin.
   */
  let cleCalqueEmpilee: string | null = null;

  /** Porte 1 — OUVRIR : le calque se montre et l'entrée est empilée. */
  function ouvrirCalqueAlbum(a: Album) {
    untrack(() => {
      opened = a;
      // On pose la CLÉ, jamais l'objet : `history.state` refuse les proxies
      // Svelte (en-tête de `lib/historiqueCoquille.ts`).
      const cle = cleDetailAlbum(a);
      cleCalqueEmpilee = cle;
      if (cle) ouvrirDetail(cle);
    });
  }

  /** Porte 2 — REFERMER, sans rien dire à l'historique. */
  function fermerCalqueAlbum() {
    opened = null;
    cleCalqueEmpilee = null;
  }

  /**
   * Porte 3 — LE BOUTON RETOUR DE LA FICHE : refermer ET dépiler, d'un geste.
   *
   * Refermer sans dépiler laisserait la pile un cran plus haut que le chemin
   * parcouru, et le Précédent suivant ne ferait « rien » une fois de trop.
   *
   * 🔴 Et si RIEN n'a été empilé (onglet Artistes, album sans clé), on ne
   * recule SURTOUT pas : `history.back()` dépilerait l'entrée de la
   * Bibliothèque elle-même et ferait sortir de Tune.
   */
  function retourCalqueAlbum() {
    if (cleCalqueEmpilee == null) { fermerCalqueAlbum(); return; }
    fermerDetailEnReculant(fermerCalqueAlbum);
  }

  /**
   * Porte 4 — REFERMER À LA MAIN : clic sur « Bibliothèque » dans la barre
   * latérale, ou cible externe qui découvre la grille. On ne recule pas et on
   * n'empile pas : on RÉÉCRIT l'entrée courante, sans quoi elle porterait un
   * album que l'écran n'affiche plus.
   */
  function refermerCalqueAlbumSansReculer() {
    const empilee = cleCalqueEmpilee;
    fermerCalqueAlbum();
    if (empilee != null) fermerDetail();
  }

  /**
   * Le Précédent du navigateur a dépilé notre entrée : la coquille repose la
   * clé de l'entrée atteinte dans `detailOuvert`, et le calque doit suivre.
   * Sans ce raccord, le retour reposerait la bonne vue en laissant la fiche
   * par-dessus — entrée en moins, écran inchangé.
   *
   * ⚠️ `untrack` : l'effet ÉCRIT `opened`, qu'il lit aussi. Il ne doit dépendre
   * que du magasin, sinon sa propre écriture le relance.
   */
  $effect(() => {
    const voulu = $detailOuvert;
    untrack(() => {
      if (!opened || cleCalqueEmpilee == null) return;
      if (voulu === cleCalqueEmpilee) return;
      fermerCalqueAlbum();
    });
  });

  /**
   * 🔴 Un clic sur « Bibliothèque » dans la barre latérale REFERME la fiche
   * d'album — #3843.
   *
   * La fiche est un CALQUE posé par-dessus la grille ; tant que `opened` tient
   * une valeur, la grille est cachée. Voir `v2/Sidebar.svelte` (`go`) pour le
   * mécanisme complet : la barre v2 n'émettait pas le signal, et aucun écran
   * v2 ne l'écoutait.
   *
   * 🔴 `$listResetNonce`, PAS `get(listResetNonce)` — exactement le piège
   * déjà payé deux fois juste en dessous (#3708, #3717) : `get()` lit la
   * valeur et se désabonne aussitôt, n'inscrit AUCUNE dépendance sous les
   * runes, et l'effet ne tournerait qu'au montage — c'est-à-dire jamais dans
   * le cas qu'on corrige, puisque le défaut est précisément qu'on ne remonte
   * pas.
   *
   * ⚠️ Déclaré AVANT les effets `pendingLibrary*`. Au montage, les
   * effets d'un composant tournent dans l'ordre de DÉCLARATION : placé après,
   * celui-ci refermerait la fiche que « Aller à l'album » vient d'ouvrir.
   */
  $effect(() => {
    $listResetNonce;
    // #1121 : fermeture À LA MAIN — on RÉÉCRIT l'entrée courante, on ne
    // recule pas. Reculer ici dépilerait l'entrée de la Bibliothèque.
    refermerCalqueAlbumSansReculer();
  });

  /**
   * 🔴 L'album demandé par « Lecture en cours ».
   *
   * « Les hyperliens de l'album et de l'artiste renvoient vers la page
   * d'accueil » (Fabien, v0.9.140, 07/09/2026). `NowPlaying` posait
   * `selectedAlbum`, que douze composants de l'ANCIEN client lisent et
   * qu'aucun de la v2 ne lit : on changeait d'écran sans rien ouvrir.
   *
   * Consommé UNE fois, comme le dossier : le laisser dans le magasin
   * rouvrirait la fiche à chaque retour sur la Bibliothèque.
   *
   * L'album peut ne pas être dans `$albums` — une piste de service, une
   * bibliothèque encore en cours de chargement. On le demande alors au
   * serveur plutôt que d'abandonner en silence.
   */
  // #1501 — plus d'ARTISTE demandé de l'extérieur. « Aller à l'artiste »
  // (menu « … » d'une piste, Lecture en cours, fiche d'album) ouvre la page
  // commune par `ouvrirArtisteDepuis` (#1494) : la Bibliothèque n'a plus de
  // fiche à ouvrir, et `pendingLibraryArtist` n'a plus de lecteur.

  /**
   * L'ALBUM demandé de l'extérieur — jumeau exact de l'effet ci-dessus.
   *
   * 🔴 `$pendingLibraryAlbum`, PAS `get(pendingLibraryAlbum)` — #3717.
   *
   * Même faute, même mesure : `get()` n'inscrit aucune dépendance sous les
   * runes, l'effet ne tournait qu'au montage. Le piège est qu'il PARAISSAIT
   * marcher, parce que ses premiers émetteurs vivaient tous hors de la
   * Bibliothèque (`NowPlaying`, `MenuPisteV1`) : changer de vue remonte
   * l'écran, donc l'effet rejouait. Ses émetteurs INTERNES —
   * `v2/PisteActions.allerAlbum` et `v2/VersionsPistePanneau.ouvrirAlbum`,
   * atteints alors qu'on est déjà dans la Bibliothèque — ne remontaient rien :
   * le magasin était posé, et la fiche ne s'ouvrait pas.
   *
   * Comme son jumeau, l'effet écrit ce qu'il lit (`set(null)`) et se rejoue
   * une fois : la seconde passe sort sur `id == null` sans rien écraser.
   */
  $effect(() => {
    const id = $pendingLibraryAlbum;
    if (id == null) return;
    pendingLibraryAlbum.set(null);
    const connu = $albums.find((a) => a.id === id);
    // #1121 : les DEUX chemins passent par la porte d'ouverture — c'est le
    // sixième écrivain, l'asynchrone, celui que la dette de #980 nommait.
    if (connu) { ouvrirCalqueAlbum(connu); return; }
    api.getAlbum(id).then((a) => { if (a) ouvrirCalqueAlbum(a); }).catch(() => {});
  });

  /**
   * L'ANNÉE demandée de l'extérieur — troisième de la même famille.
   *
   * `NowPlaying` pose `yearFilter` depuis toujours, et `yearFilter` n'est lu
   * que par l'écran de l'ANCIEN client : cliquer « (2003) » à côté du titre
   * d'album amenait ici sans rien filtrer. On consomme donc le contrat v2,
   * exactement comme ses deux jumeaux au-dessus.
   *
   * 🔴 `$pendingLibraryYear`, PAS `get(...)` — #3708 / #3717, deux fois la
   * même faute : `get()` n'inscrit aucune dépendance sous les runes, et
   * l'effet ne tournerait qu'au montage. Or l'année peut être posée alors
   * qu'on est DÉJÀ dans la Bibliothèque, écran de lecture en calque.
   *
   * `navMode = 'years'` avec : une grille filtrée sans que la frise soit à
   * l'écran ne montre aucune cause. Le rail A–Z resterait affiché en face
   * d'une grille de douze albums, ce qui se lit comme une panne.
   */
  $effect(() => {
    const an = $pendingLibraryYear;
    if (an == null) return;
    pendingLibraryYear.set(null);
    fYear = an;
    navMode = 'years';
    tabChoisi = 'albums';
    // Même raison que chez le jumeau Artistes : la fiche est un CALQUE, et la
    // laisser ouverte cacherait la grille qu'on vient de filtrer.
    refermerCalqueAlbumSansReculer();
  });

  /**
   * Album en cours d'édition — le bouton haut-droit de la pochette.
   *
   * `AlbumEditModal` vient du client actuel : c'est la MÊME modale, pas une
   * réécriture. Elle sait déjà éditer titre, artiste, année, genre, label et
   * pochette, et son enregistrement passe par les routes que le serveur
   * attend. En refaire une pour le nouveau client donnerait deux écrans
   * d'édition à maintenir, qui divergeraient.
   */
  let enEdition = $state<Album | null>(null);

  /**
   * Lecture depuis la pochette — le bouton central.
   *
   * Sur un serveur DISTANT, un `album_id` désignerait un tout autre album ici :
   * on ouvre alors le détail plutôt que de lancer la mauvaise chose. Même
   * raisonnement que `playTrack` juste au-dessus, où c'est le `track_id` qui
   * n'a de sens qu'en local.
   */
  function lireAlbum(a: Album) {
    if (depot) {
      ouvrirCalqueAlbum(a);
      return;
    }
    const zid = $currentZoneId;
    if (zid == null || a.id == null) return;
    playAndSync(zid, { album_id: a.id }).catch(signalerEchecLecture);
  }

  function reset() { fQuality = []; fRate = []; q = ''; fYear = null; fFormat = []; fDepth = []; fCompilation = null; fProvenance = null; fDrMin = null; fDrMax = null; }

  // « Aléatoire » — lecture au hasard de toute la bibliothèque, en respectant
  // le filtre texte courant : si l'utilisateur a tapé « jazz », il attend un
  // aléatoire DANS ce qu'il regarde, pas dans les 20 000 titres.
  let shuffling = $state(false);
  /**
   * 🔴 Fil 1917 (Sevy Tabroc, v0.9.163) — les albums que l'aléatoire doit
   * couvrir quand la sélection n'a pas de nom côté serveur : filtres d'album
   * posés, ou groupe ouvert d'un onglet de facette. `null` : la portée du
   * serveur suffit. Seulement sur les onglets qui montrent des ALBUMS : sur
   * Titres et Artistes, ces filtres ne s'affichent pas et n'agissent pas.
   * Voir `albumsDeLaSelection`.
   */
  const albumsAleatoire = $derived(
    depot || !(tab === 'albums' || tab === 'genres' || tab === 'years' || tab === 'labels')
      ? null
      : albumsDeLaSelection({
          filtresAlbum: filtreActif || anneeEffective != null,
          groupe: groupeOuvert?.albums ?? null,
          affiches,
        }),
  );
  /** Le plafond de la file aléatoire, lu au serveur (#2901) ; son défaut s'il
   *  ne répond pas. */
  async function plafondAleatoire(): Promise<number> {
    try { return lireFileAleatoire(await api.getConfig() as Record<string, unknown>); }
    catch { return FILE_ALEATOIRE_DEFAUT; }
  }
  async function shuffleAll() {
    const zid = zoneRequise();
    if (zid == null) return;
    // La sélection se lit sur la liste ENTIÈRE : tant qu'elle arrive, tirer
    // maintenant tirerait dans une grille partielle.
    if (albumsAleatoire != null && enCharge) return;
    shuffling = true;
    try {
      if (depot) await aleatoireDistant(zid);
      else if (albumsAleatoire != null) {
        // Figée AVANT les attentes : un filtre touché pendant le chargement
        // des pistes ne change pas ce qu'on a demandé.
        const albumsVoulus = albumsAleatoire;
        const provenance = fProvenance;
        const [liste, plafond] = await Promise.all([api.getAllTracks(), plafondAleatoire()]);
        const ids = pistesDeLaSelection(liste, albumsVoulus, plafond, (p) => dansSource(p, provenance));
        if (ids.length) await playAndSync(zid, { track_ids: ids });
        else notifications.error($tr('library.noTracks'));
      }
      else if (fProvenance != null) {
        const liste = dossierPortee
          ? (await api.getFilteredTracks({ folder: dossierPortee, limit: 5000 })).items ?? []
          : await api.getAllTracks();
        const needle = fold(q);
        const selection = liste.filter(p => dansSource(p, fProvenance) &&
          (!needle || fold(p.title).includes(needle) || fold(p.artist_name).includes(needle)));
        const ids = melangee(selection).flatMap(p => p.id == null ? [] : [p.id]);
        if (ids.length) await playAndSync(zid, { track_ids: ids });
        else notifications.error($tr('library.noTracks'));
      }
      // 🔴 #882 — la PASTILLE DE RÉPERTOIRE n'était pas transmise. Marco Polo
      // (fil 1614) : « la lecture aléatoire prend sa source dans toute la
      // bibliothèque ; si je passe à l'ancienne interface, elle fonctionne ».
      // La portée était pourtant là — `dossierPortee` filtre déjà l'affichage
      // — elle n'arrivait simplement pas jusqu'au serveur. La règle est
      // partagée avec l'écran actuel pour que les deux ne redivergent pas.
      else await api.shuffleAll(zid, optionsAleatoire({ dossier: dossierPortee, recherche: q }));
    }
    catch (e) { signalerEchecLecture(e); }
    shuffling = false;
  }

  /**
   * L'aléatoire d'un serveur distant : un ALBUM au hasard, joué en entier.
   *
   * `api.shuffleAll` est une opération du serveur LOCAL sur SA base — elle n'a
   * aucun équivalent à distance. Deux issues possibles : griser le bouton, ou
   * en changer le sens. Griser aurait retiré de la vue « iso » une commande
   * qui y figure ; alors on change le sens, ET on le dit dans l'infobulle —
   * un bouton qui fait autre chose sans le dire est pire que pas de bouton.
   *
   * Un aléatoire sur les TITRES supposerait de rapatrier toute la discothèque
   * pour n'en jouer que quelques-uns, et d'empiler les pistes une par une :
   * cher pour le réseau, et lent à démarrer. Un album, c'est une requête.
   */
  async function aleatoireDistant(zid: number) {
    const d = depot!;
    // Le hasard porte sur ce qu'on REGARDE : filtres et recherche compris.
    // Sinon « aleatoire » apres avoir tape « jazz » lancerait autre chose.
    const filtres = sorted.filter(matches);
    const pool = filtres.length ? filtres : src;
    const choix = pool[Math.floor(Math.random() * pool.length)];
    if (!choix?.id) return;
    const pistes = (await pistesAlbumDistant(d, choix.id)).filter((t) => t.id != null);
    if (!pistes.length) return;
    await playAndSync(zid, corpsLecture(d, pistes[0]) as any);
    for (let i = 1; i < pistes.length; i++) {
      await api.addToQueue(zid, corpsLecture(d, pistes[i]) as any);
    }
  }
  // « Ajouter » — les dossiers de musique se déclarent dans les Réglages.
  // On y emmène directement plutôt que d'ouvrir un dialogue natif, bannis
  // dans les vues web.
  function addContent() { activeView.set('settings'); }
</script>


<svelte:window onclick={ddDehors} onkeydown={ddEchap} />
<section class="v2-lib tune-v2">
  <header class="v2-top">
    <div class="v2-titres">
      <h1>{depot ? depot.nom : $tr('library.title' as any)}</h1>
      {#if depot}<span class="dist">{depot.hote}</span>{/if}
    </div>
    <div class="v2-actions">
    <button class="v2-btn" onclick={shuffleAll} disabled={shuffling || $currentZoneId == null || (albumsAleatoire != null && enCharge)}
      title={$currentZoneId == null ? $tr('v2.lib.noActiveZone' as any)
        : depot ? $tr('v2.lib.shuffleDepot' as any).replace('{nom}', depot.nom)
        : $tr('v2.lib.shuffleAll' as any)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20 20 4M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>{shuffling ? $tr('v2.lib.starting' as any) : $tr('v2.album.shuffle' as any)}
    </button>
    {#if !depot}
      <!-- Declarer un dossier de musique est un reglage du serveur LOCAL :
           le proposer sur la bibliotheque d'une autre machine promettrait
           d'agir sur elle, ce qu'on ne fait pas. -->
      <button class="v2-btn" onclick={addContent} title={$tr('v2.lib.addFolders' as any)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>{$tr('v2.tags.add' as any)}
      </button>
    {/if}
    <nav class="tabs">
      <!-- #1372 — `ONGLETS`, et non `TABS` : « Ajouts récents » n'est pas
           offert sur un dépôt distant, faute de route chez lui. -->
      {#each ONGLETS as t (t.id)}
        {#if !t.adv || atLeast(level, 'intermediate')}
          <!-- `data-onglet` : l'onglet se nomme dans le DOM. #929 s'en sert
               pour prouver que le carrousel ne fuit pas hors de la vue Albums,
               sans dépendre du libellé traduit ni de la position. -->
          <button class="tab" data-onglet={t.id} class:active={tab === t.id} onclick={() => (tabChoisi = t.id)}>{$tr(t.label as any)}</button>
        {/if}
      {/each}
    </nav>
    </div>
  </header>

  <!-- La ligne de filtres existe a TOUS les niveaux : chez Levente le champ
       de recherche vit dans la page, a cote des filtres, et c'est le seul
       moyen de chercher en Essentiel depuis que la Recherche a quitte la
       barre laterale. Seules les PUCES de filtrage sont reservees a Avance. -->
  {#if erreurD}<div class="derr">{erreurD}</div>{/if}

  <!-- 🔴 La portée se VOIT et se RETIRE.
       Une bibliothèque amputée sans explication est le défaut inverse de celui
       qu'on corrige : on ne saurait plus si le reste manque ou s'il est
       simplement filtré. La puce nomme le dossier et le clic la retire. -->
  {#if porteeActive}
    <div class="portee">
      <span class="pchip">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        {$tr('v2.lib.scopedFolder' as any).replace('{d}', nomPortee)}
        <button onclick={retirerPortee} aria-label={$tr('v2.lib.scopedClear' as any)}
          title={$tr('v2.lib.scopedClear' as any)}>×</button>
      </span>
    </div>
  {/if}

  <div class="filters">
    {#if tab === 'tracks'}
      <!-- Nombre de pistes après recherche et source, avant la limite d’affichage. -->
      <span class="chip count plain">{$tr('v2.lib.trackCount' as any).replace('{count}', $formatNombre(nbPistesAnnonce))}</span>
    {/if}
    {#if showFilters}
      <button class="chip count" class:active={!fQuality.length && !fRate.length && !q && fYear == null && !fFormat.length && !fDepth.length && fCompilation == null && !fProvenance && fDrMin == null && fDrMax == null} onclick={reset}>{$tr('v2.lib.chipAll' as any).replace('{n}', String(matchCount))}</button>
      <!--
        DERNIERS AJOUTS. Bilou, forum, 05/09/2026 : « manque les derniers ajouts
        en vue bibliothèque ». Le tri existait, enfoui dans le menu « Titre ▾ » ;
        ce qu'on veut voir en arrivant ne doit pas se chercher dans un menu.

        Ce n'est pas un filtre : le chip bascule le TRI, et se rallume quand
        c'est lui qui est actif. On ne cache donc rien de la bibliothèque.
      -->
      {#if hasAddedAt}
        <button class="chip" class:active={sortKey === 'added'}
          onclick={() => (sortKey = sortKey === 'added' ? 'title' : 'added')}
          title={$tr('v2.lib.recentHint' as any)}>{$tr('v2.lib.recent' as any)}</button>
      {/if}
    {/if}
      <!--
        SOURCE (#4152). Rangée ICI, entre « Derniers ajouts » et « Qualité »,
        et pas au bout de la file : Qualité, Fréquence, Format et Profondeur
        décrivent le CONTENU d'un album ; « Source » dit de quelle
        bibliothèque on parle. C'est une portée, comme le fil d'Ariane des
        Répertoires — elle précède les critères qu'elle borne.

        Toujours visible : une bibliothèque locale explique qu'elle n'a pas
        encore de source distante. Les autres filtres ne retirent pas ses entrées.

        Sauf sur les Ajouts récents : `AjoutsRecentsV2` interroge
        `/home/recently-added`, qui ne connaît pas la provenance. Le menu s'y
        ouvrait et se cochait sans que rien ne bouge.
      -->
      {#if showSearch}
        <!-- #4800 — `onpointerenter` : le menu s'ouvre AUSSI au survol
             (`.drop:hover .menu`), et ses comptes veulent la liste entière. -->
        <div class="drop" class:open={ddOpen === 'provenance'} onpointerenter={voirLesFacettes}>
          <button class="chip" class:active={fProvenance !== null} aria-haspopup="menu" aria-expanded={ddOpen === 'provenance'} onclick={() => ddToggle('provenance')}>{$tr('v2.lib.source' as any)}{#if fProvenance}&nbsp;· {libelleProvenance(fProvenance)}{/if}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
          <div class="menu">
            <!-- « Toutes les sources » EST l'absence de filtre, et elle est
                 écrite : la retirer obligerait à passer par « Tout », qui
                 efface aussi la qualité, le format et la recherche. -->
            <button class:on={fProvenance === null} onclick={() => { fProvenance = null; ddClose(); }}>{$tr('v2.lib.sourceAll' as any)} <em>{comptesSourcesEnCharge || !comptesPrets ? "…" : matchCountToutesSources}</em></button>
            {#if tab === 'albums' && !sourcesIntegrees.length && src.every(a => provenanceDe(a) === 'local')}
              <p>{$tr('upnp.sync.localOnly' as any)}</p>
            {/if}
            <!-- Plus de lien « Serveurs multimédia » ici : un menu de FILTRE
                 n'est pas une navigation (Bertrand, 17/09/2026 : « Cette
                 mention ne sert à rien »). -->
            {#each provenances as [cle, n] (cle)}
              <button class:on={fProvenance === cle} onclick={() => { fProvenance = fProvenance === cle ? null : cle; ddClose(); }}>{libelleProvenance(cle)} <em>{comptesSourcesEnCharge || !comptesPrets ? "…" : n}</em></button>
            {/each}
          </div>
        </div>
      {/if}
    {#if showFilters}
      <div class="drop" class:open={ddOpen === 'quality'} onpointerenter={voirLesFacettes}>
        <button class="chip" class:active={fQuality.length > 0} aria-haspopup="menu" aria-expanded={ddOpen === 'quality'} onclick={() => ddToggle('quality')}>{$tr('v2.tcol.quality' as any)}{#if fQuality.length}&nbsp;· {fQuality.map((k) => { const it = QUALITIES.find(x => x.key === k); return it ? (it.cle ? $tr(it.cle as any) : it.label) : k; }).join(', ')}{/if}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="menu">
          <!-- Une valeur a ZERO reste VISIBLE mais inerte : la faire
               disparaitre ferait sauter le menu sous le doigt a chaque filtre
               pose. Le compte dit pourquoi elle ne repond pas. -->
          {#each QUALITIES as it (it.key)}
            {@const n = nQualite.get(it.key) ?? 0}
            <button class:on={fQuality.includes(it.key)} aria-pressed={fQuality.includes(it.key)} disabled={comptesPrets && n === 0 && !fQuality.includes(it.key)}
              onclick={() => (fQuality = basculeFacette(fQuality, it.key as string))}>{it.cle ? $tr(it.cle as any) : it.label} <em>{comptesPrets ? n : '…'}</em></button>
          {/each}
        </div>
      </div>
      <div class="drop" class:open={ddOpen === 'rate'} onpointerenter={voirLesFacettes}>
        <button class="chip" class:active={fRate.length > 0} aria-haspopup="menu" aria-expanded={ddOpen === 'rate'} onclick={() => ddToggle('rate')}>{$tr('v2.tcol.sampleRate' as any)}{#if fRate.length}&nbsp;· {fRate.map((v) => RATES.find(r => r.v === v)?.l ?? v).join(', ')}{/if}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="menu">
          {#each RATES as r (r.v)}
            {@const n = nFrequence.get(r.v) ?? 0}
            <button class:on={fRate.includes(r.v)} aria-pressed={fRate.includes(r.v)} disabled={comptesPrets && n === 0 && !fRate.includes(r.v)}
              onclick={() => (fRate = basculeFacette(fRate, r.v))}>{r.l} <em>{comptesPrets ? n : '…'}</em></button>
          {/each}
        </div>
      </div>
      <!-- FORMAT des le niveau Essentiel : « FLAC ou MP3 ? » est la question de
           base dans une discotheque mixte, et la maquette v3 de Levente le
           place aussi au premier niveau. -->
      <!-- Tranche DR (#2144) : dessinée SEULEMENT si des albums portent un
           DR — ailleurs, une commande qui ne filtre rien. -->
      {#if hasDr}
        <span class="chip dr" class:active={fDrMin != null || fDrMax != null}>
          <span>{$tr('library.drRange' as any)}</span>
          <select aria-label={$tr('library.drMin' as any)} value={fDrMin == null ? '' : String(fDrMin)}
            onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; fDrMin = v === '' ? null : Number(v); }}>
            <option value="">{$tr('library.drAny' as any)}</option>
            {#each valeursDr as v (v)}<option value={String(v)}>{v}</option>{/each}
          </select>
          –
          <select aria-label={$tr('library.drMax' as any)} value={fDrMax == null ? '' : String(fDrMax)}
            onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; fDrMax = v === '' ? null : Number(v); }}>
            <option value="">{$tr('library.drAny' as any)}</option>
            {#each valeursDr as v (v)}<option value={String(v)}>{v}</option>{/each}
          </select>
        </span>
      {/if}
      {#if formats.length > 1}
        <div class="drop" class:open={ddOpen === 'format'} onpointerenter={voirLesFacettes}>
          <button class="chip" class:active={fFormat.length > 0} aria-haspopup="menu" aria-expanded={ddOpen === 'format'} onclick={() => ddToggle('format')}>{$tr('v2.tcol.format' as any)}{#if fFormat.length}&nbsp;· {fFormat.join(', ')}{/if}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
          <div class="menu">
            {#each formats as [f, n] (f)}
              <button class:on={fFormat.includes(f)} aria-pressed={fFormat.includes(f)}
                onclick={() => (fFormat = basculeFacette(fFormat, f))}>{f} <em>{comptesPrets ? n : '…'}</em></button>
            {/each}
          </div>
        </div>
      {/if}
      <!-- COMPILATIONS (#1957). Une bascule, pas un menu : le seul état qui a
           un sens à demander est « montre-moi les compilations ». « Montre-moi
           ce qui n'en est pas » rendrait la bibliothèque entière tant que le
           scan n'a pas repassé dessus — voir `FiltresBibliotheque`.
           Cachée à zéro : c'est l'état normal d'un serveur mis à jour sans
           re-scan, et un filtre qui ne rend rien passe pour un bug. -->
      {#if nCompilations > 0 || fCompilation != null}
        <button class="chip" class:active={fCompilation != null}
          aria-pressed={fCompilation != null}
          title={$tr('v2.lib.compilationsHint' as any)}
          onpointerenter={voirLesFacettes}
          onclick={() => (fCompilation = fCompilation == null ? true : null)}
        >{$tr('v2.lib.compilations' as any)} <em>{comptesPrets ? $formatNombre(nCompilations) : '…'}</em></button>
      {/if}
      {#if showExpert && depths.length > 1}
        <div class="drop" class:open={ddOpen === 'depth'} onpointerenter={voirLesFacettes}>
          <button class="chip" class:active={fDepth.length > 0} aria-haspopup="menu" aria-expanded={ddOpen === 'depth'} onclick={() => ddToggle('depth')}>{$tr('v2.tcol.bitDepth' as any)}{#if fDepth.length}&nbsp;· {fDepth.join(', ')}-bit{/if}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
          <div class="menu">
            {#each depths as [d, n] (d)}
              <button class:on={fDepth.includes(d)} aria-pressed={fDepth.includes(d)}
                onclick={() => (fDepth = basculeFacette(fDepth, d))}>{d}-bit <em>{comptesPrets ? n : '…'}</em></button>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
    <!-- Le champ partagé (`.v2-rech`), comme sur tous les autres écrans. Il
         faisait ici 320 × 42 avec sa loupe en flux, ailleurs 300 × 40 avec la
         loupe en absolu : deux dessins pour un seul geste. -->
    {#if showSearch}
      <div class="v2-rech">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
        <input placeholder={$tr('v2.lib.searchPlaceholder' as any)} bind:value={q} />
        {#if q}
          <button class="clr" onclick={() => (q = '')} aria-label={$tr('common.clear' as any)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        {/if}
      </div>
    {/if}

    <!-- 🔴 Le TRI part sur les Ajouts récents, la BASCULE reste.
         `AjoutsRecentsV2` est trié par date d'ajout, c'est sa définition : lui
         proposer « Titre », « Artiste » ou « Aléatoire » promet un ordre qu'il
         ne peut pas prendre. La bascule grille/liste, elle, n'est pas un tri —
         c'est la forme du même contenu, et le testeur la demande
         explicitement. Elle lui est donc CÂBLÉE (prop `vue`) au lieu d'être
         retirée. -->
    {#if showTools && tab !== 'tracks'}
      {#if tab !== 'recent'}
      <div class="drop right">
        <button class="chip plain">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h10M4 12h7M4 18h4M17 5v14M14 16l3 3 3-3"/></svg>
          {$tr((SORTS.find(x => x.k === sortKey)?.l ?? 'v2.lib.sortTitle') as any)}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="menu">
          {#each availableSorts as o (o.k)}
            <button class:on={sortKey === o.k} onclick={() => (sortKey = o.k)}>{$tr(o.l as any)}</button>
          {/each}
        </div>
      </div>
      <!-- #4558 — le re-tirage n'a de sens que sur un tirage, et #3074 avait
           jugé les deux moitiés indissociables : un ordre aléatoire figé qu'on
           ne peut pas relancer ne sert qu'une fois. -->
      {#if sortKey === 'random'}
        <button class="viewtog" onclick={reTirer}
          aria-label={$tr('library.reshuffle' as any)} title={$tr('library.reshuffle' as any)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>
        </button>
      {/if}
      {/if}
      <!-- #929 — la bascule tourne sur TROIS modes. `data-vue` porte le mode
           COURANT : c'est ce que lit le témoin, et c'est ce qui rend le
           troisième mode atteignable sans inventer un second bouton. L'icône
           et le libellé, eux, annoncent le mode où le clic MÈNE. -->
      <button class="viewtog" data-vue={display} onclick={() => (display = affichageSuivant)}
        aria-label={$tr(LIBELLE_AFFICHAGE[affichageSuivant] as any)}
        title={$tr(LIBELLE_AFFICHAGE[affichageSuivant] as any)}>
        {#if display === 'grid'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        {:else if display === 'list'}
          <!-- Trois pochettes de front, celle du milieu en avant : le geste du
               carrousel, sans promettre une troisième dimension qu'on ne rend pas. -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="4" height="10"/><rect x="8.5" y="4" width="7" height="16"/><rect x="18" y="7" width="4" height="10"/></svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        {/if}
        <!--
          #929 — LA BASCULE DIT OÙ L'ON EST.

          Sur sa capture, Bertrand ne voyait qu'une icône de grille isolée :
          rien n'indiquait le mode courant ni qu'il existât un troisième cran.
          L'icône, elle, annonce la DESTINATION — c'est la convention de ce
          bouton depuis qu'il existe, et la changer tromperait ceux qui la
          connaissent. Une pastille par cran, allumée sur le mode courant,
          ajoute le repère manquant sans toucher au contrôle.

          `aria-hidden` : le libellé du bouton dit déjà tout à un lecteur
          d'écran, et trois puces vides n'y ajouteraient que du bruit.
        -->
        <span class="vpts" aria-hidden="true">
          {#each modesAffichage as m (m)}<i class:on={m === display}></i>{/each}
        </span>
      </button>
    {/if}
  </div>

  <!--
    🔴 `showTimeline || fYear != null` : la PASTILLE existe a tous les niveaux.

    `showTimeline` demande le niveau Intermediaire. En Essentiel, tout ce bloc
    disparaissait — y compris le seul moyen de VOIR le filtre d'annee et de le
    retirer. Une annee posee de l'exterieur (le lien « (2003) » de l'ecran de
    lecture) y aurait reduit la grille a douze albums, sans cause visible et
    sans sortie. Un filtre actif qu'on ne peut ni lire ni annuler est pire que
    le clic mort qu'on vient de corriger.

    Les deux BOUTONS de navigation, eux, restent reserves a l'Intermediaire :
    la frise est bien une option avancee, la pastille est un temoin d'etat.
  -->
  <!-- `tab !== 'recent'` : la pastille d'année est un témoin d'état, mais un
       témoin qui décrit une grille d'albums qu'on ne regarde pas. Sur les
       Ajouts récents elle annoncerait un filtre qui n'y agit pas, et son clic
       n'aurait aucun effet visible. Elle revient dès qu'on quitte l'onglet. -->
  {#if tab !== 'recent' && (showTimeline || fYear != null)}
    <div class="navmode">
      {#if showTimeline}
        <button class:on={navMode === 'alpha'} onclick={() => { navMode = 'alpha'; fYear = null; }}>A–Z</button>
        <button class:on={navMode === 'years'} onclick={() => (navMode = 'years')}>{$tr('v2.lib.navYears' as any)}</button>
      {/if}
      {#if fYear != null}
        <button class="yearpill" onclick={() => (fYear = null)}>
          {fYear} · {$tr((yearCount > 1 ? 'v2.lib.yearAlbumsMany' : 'v2.lib.yearAlbumsOne') as any).replace('{n}', String(yearCount))}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      {/if}
    </div>
  {/if}

  <!--
    Quelle annee, et dans quel sens.

    ELLE VIT ICI, dans la zone de filtres, et PAS dans le corps : `.body` est
    un conteneur flex, et un bloc pose a cote de `.facets` en devient une
    colonne — la barre partait a gauche, a mi-hauteur, la grille serree a
    droite. Bertrand, 04/09/2026 : « horrible ». Sa place est avec les autres
    reglages de navigation, sous A–Z / Annees.

    Visible des que le choix compte : la frise chronologique ET l'onglet
    Annees lisent la meme annee.

    La couverture est ANNONCEE a cote de chaque mode : « origine » ne concerne
    que 90 albums sur 4255 ici, et basculer dessus sans le savoir donne une
    frise presque vide qui se lit comme une panne.
  -->
  {#if tab === 'years' || (showTimeline && navMode === 'years')}
    <div class="anbar">
      <span class="ancl">{$tr('v2.lib.yearBasis' as any)}</span>
      <div class="anmodes">
        {#each MODES_ANNEE as m (m.k)}
          {@const n = couvertureAnnees(src, m.k)}
          <button class:on={modeAnnee === m.k} onclick={() => (modeAnnee = m.k)}>
            {$tr(m.cle as any)}<span class="anc">{n}</span>
          </button>
        {/each}
      </div>
      <button class="anord" onclick={() => (ordreAnnee = ordreAnnee === 'desc' ? 'asc' : 'desc')}>
        {ordreAnnee === 'desc' ? $tr('v2.lib.yearNewestFirst' as any) : $tr('v2.lib.yearOldestFirst' as any)}
      </button>
    </div>
    <!--
      Le nombre qui DISTINGUE les modes.

      Les deux premiers affichent la meme couverture — 3049 chacun — parce que
      les albums qui portent une annee d'origine portent aussi une annee
      d'edition. Deux chiffres identiques laissent croire a deux options
      interchangeables. Celui-ci repond a « qu'est-ce que ca change ? ».
    -->
    {#if changeants > 0}
      <p class="andelta">{$tr('v2.lib.yearDiffer' as any).replace('{count}', $formatNombre(changeants))}</p>
    {/if}
  {/if}

  {#if showTimeline && navMode === 'years' && histogram.bars.length}
    <div class="frise">
      <!-- Peigne d'annees facon regle graduee (maquette Levente, v3) : CHAQUE
           annee porte un trait, meme vide, pour que la frise se lise comme un
           axe continu et non comme des dents isolees. La hauteur dit le
           nombre d'albums ; le trait minimal garde l'axe lisible sur une
           collection clairsemee. -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="bars" onmouseleave={() => { hoverYear = null; hoverMonth = null; }}>
        {#each histogram.bars as b (b.year)}
          <button
            class="tick"
            class:on={fYear === b.year}
            class:vide={b.n === 0}
            title={b.n ? `${b.year} — ${b.n} album${b.n > 1 ? 's' : ''}` : `${b.year} — aucun album`}
            aria-label={`${b.year}, ${b.n} album${b.n > 1 ? 's' : ''}`}
            aria-pressed={fYear === b.year}
            style="--h:{histogram.max ? 34 + Math.round((b.n / histogram.max) * 66) : 34}%"
            onmouseenter={() => (hoverYear = b.year)}
            onmousemove={(e) => surveille(e, b.year)}
            onfocus={() => { hoverMonth = null; }}
            onclick={() => (fYear = fYear === b.year ? null : b.year)}
          ></button>
        {/each}

        <!-- LE CURSEUR. Toujours pose sur l'axe : il suit la souris, se fige
             sur l'annee choisie, et affiche l'annee A LA VERTICALE. C'est lui
             qui parcourt les annees — sans lui la frise n'a pas de repere. -->
        {#if cursorPct !== null && cursorYear !== null}
          <span class="curseur" class:fige={fYear !== null} class:creux={cursorCount === 0}
            style="left:{cursorPct}%"
            aria-hidden="true">{cursorLabel}</span>
        {/if}
      </div>
      <div class="decs">
        {#each decades as d (d.year)}
          <span class="dec" style="left:{d.pct}%">{d.year}</span>
        {/each}
      </div>
    </div>
  {/if}

  <div class="body" class:encarrousel={enCarrousel}>
    {#if tab === 'recent'}
      <!-- #929 — le carrousel est le mode de parcours de la vue ALBUMS. Les
           ajouts récents n'en connaissent que deux ; ils retombent donc sur la
           grille plutôt que de recevoir un mode qu'ils ne savent pas rendre. -->
      <AjoutsRecentsV2 onOuvrir={ouvrirCalqueAlbum} vue={display === 'carousel' ? 'grid' : display} />
    {:else if tab === 'artists'}
      <!-- Les artistes ont leur PROPRE source, `/library/artists`, et non une
           déduction depuis les albums chargés. Ils ne passent donc pas par les
           gardes « bibliothèque vide » ci-dessous : une bibliothèque dont les
           albums ne sont pas encore arrivés a déjà ses artistes. -->
      <ArtistesV2 {q} idsPortee={idsArtistesPortee} nomPortee={porteeActive ? nomPortee : null}
        provenance={fProvenance} sourcesArtistes={appartenancesArtistes}
        sourcesEnCharge={tracksLoading} erreurSources={tracksError} onComptesSources={(c) => (comptesArtistes = c)} />
    {:else if tab !== 'tracks' && enCharge && sorted.length === 0}
      <div class="state">{$tr('v2.lib.loading' as any)}</div>
    {:else if tab !== 'tracks' && nu && sorted.length === 0 && $albumsPagines.erreur}
      <!-- #4800 — la première page n'est pas venue : on le DIT, plutôt que
           d'annoncer une bibliothèque vide qui ne l'est peut-être pas. -->
      <div class="state">{$albumsPagines.erreur}</div>
    {:else if tab !== 'tracks' && (nu ? $albumsPagines.total === 0 : sorted.length === 0)}
      <!-- En pages, « vide » se lit sur le TOTAL du serveur, pas sur ce qui est
           arrivé : après une fin de scan les pages tombent mais le total
           reste, et la grille garde ses cases le temps que la première page
           revienne — sans passer par « bibliothèque vide ». -->
      <!-- « Votre » serait faux sur la bibliotheque d'une autre machine : on
           nomme le serveur, sinon un catalogue distant vide se lirait comme
           un defaut de la sienne. Mesure : 192.168.1.16 rend `[]`. -->
      <div class="state">{depot
          ? $tr('v2.lib.emptyDepot' as any).replace('{nom}', depot.nom).replace('{hote}', depot.hote)
          : $tr('v2.lib.emptyLibrary' as any)}</div>
    {:else}
      <!-- `railUtile` : sur un tri chronologique, le rail est RETIRÉ plutôt
           que laissé à promettre un saut qui atterrirait au hasard. La frise
           des années reste le repère de ces deux tris. -->
      {#if navMode === 'alpha' && tab === 'albums' && railUtile}
        <div class="rail" class:couche={enCarrousel}>
          {#each ALPHA as L (L)}
            <button class="rl" class:hot={present.has(L)} disabled={!present.has(L)} onclick={() => jump(L)}>{L}</button>
          {/each}
        </div>
      {/if}
      {#if tab === 'tracks'}
        <div class="tracklist">
          {#if tracksLoading}
            <div class="state">{$tr('v2.lib.loadingTracks' as any)}</div>
          {:else if tracksError}
            <div class="state">{tracksError}</div>
          {:else if !visibleTracks.length}
            <div class="state">{tracks.length ? $tr('v2.lib.noTrackMatch' as any) : $tr('v2.lib.noTrack' as any)}</div>
          {:else}
            <!-- `ouvertureAlbum` est une FABRIQUE : seule la Bibliothèque sait
                 si l'album de CETTE piste est dans son magasin. Un gestionnaire
                 unique montrerait la loupe sur toutes les lignes, y compris
                 celles qu'elle ne peut pas ouvrir. -->
            <ListePistesV2
              pistes={visibleTracks}
              onLire={(p) => playTrack(p)}
              onLireDepuis={(_p, i) => lireLesTitresDepuis(i)}
              ouvertureAlbum={(p) => {
                const alb = albumDeLaPiste(p);
                return alb ? () => ouvrirCalqueAlbum(alb) : null;
              }}
            />
            {#if pistesFiltrees.length > visibleTracks.length}
              <div class="state">{$tr('v2.lib.shownOfTotal' as any).replace('{n}', String(visibleTracks.length)).replace('{total}', String(pistesFiltrees.length))}</div>
            {/if}
          {/if}
        </div>

      {:else if tab !== 'albums'}
        <!-- 🔴 D'abord la LISTE, les pochettes après le choix (eric, forum
             1671). L'onglet empilait toutes les valeurs avec leurs grilles :
             atteindre « Rock » demandait de traverser tous les albums des
             genres précédents. -->
        {#if groupeOuvert == null}
          <div class="fliste">
            {#if !groups.length}
              <div class="state">{$tr('v2.lib.nothingToGroup' as any)}</div>
            {:else}
              {#each groups as g (g.key)}
                {@const fav = g.reel && facetteCourante ? estFacetteFavorite(g.key) : false}
                <div class="fl">
                  <button class="flnom" onclick={() => (facetteOuverte = g.key)}>
                    <span class="fk">{g.key}</span>
                    <span class="fc">{g.albums.length}</span>
                  </button>
                  {#if facetteCourante && g.reel}
                    <button class="fcoeur" class:on={fav} aria-pressed={fav}
                      title={fav ? $tr('favorites.removeTrack' as any) : $tr('favorites.addTrack' as any)}
                      aria-label={fav ? $tr('favorites.removeTrack' as any) : $tr('favorites.addTrack' as any)}
                      onclick={() => basculerFacette(g.key)}>
                      {#if fav}
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      {:else}
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      {/if}
                    </button>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        {:else}
        <div class="facets">
          <button class="fretour" onclick={() => (facetteOuverte = null)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
            {$tr('common.back' as any)}
          </button>
          {#each [groupeOuvert] as g (g.key)}
            <section class="facet" data-facette={g.key}>
              <h2>
                <span class="fk">{g.key}</span><span class="fc">{g.albums.length}</span>
                <!--
                  Le coeur de FACETTE. Il n'existait que dans l'ancien client, et
                  seulement sur les labels (#2442) : mettre un genre ou une annee
                  en favori etait impossible depuis la v2, ce qui laissait
                  l'ecran Favoris vide de facettes faute de surface pour en
                  creer une (Bertrand, 05/09/2026).

                  Absent sur les valeurs de remplacement (`g.reel`) et sur les
                  depots distants : ni « Sans label » ni le genre d'un catalogue
                  tiers ne se reselectionnent chez nous.
                -->
                {#if facetteCourante && g.reel}
                  {@const fav = estFacetteFavorite(g.key)}
                  <button
                    class="fcoeur"
                    class:on={fav}
                    aria-pressed={fav}
                    title={fav ? $tr('favorites.removeTrack' as any) : $tr('favorites.addTrack' as any)}
                    aria-label={fav ? $tr('favorites.removeTrack' as any) : $tr('favorites.addTrack' as any)}
                    onclick={() => basculerFacette(g.key)}
                  >
                    {#if fav}
                      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    {:else}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    {/if}
                  </button>
                {/if}
              </h2>
              <!-- 🔴 #1419 — la bascule grille/liste est offerte sur ces
                   onglets : la facette ouverte doit donc lire `display`. La
                   grille était écrite en dur, et le clic ne changeait rien
                   (Jean Valjean, fil 1856). Mêmes lignes que la vue Albums,
                   même gabarit `--lcols` ; pas d'intertitres d'année ici, la
                   facette EST déjà une valeur. -->
              {#if display === 'list'}
              <div class="rows facetrows" style="--lcols:{colonnesListe}">
                {#each g.albums as a (a.id)}
                  <button class="lrow" data-letter={firstLetter(a)} onclick={() => ouvrirCalqueAlbum(a)}>
                    <span class="lcv"><AlbumArt coverPath={a.cover_path} albumId={depot ? null : a.id} size={0} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} /></span>
                    <span class="lt"><span class="ltt">{a.title}</span><PastilleCompilation compilation={a.is_compilation} compact /></span>
                    <span class="la">{a.artist_name ?? ''}</span>
                    <span class="ly">{albumYear(a) ?? ''}</span>
                    {#if showBadges}<span class="lb">{#if badge(a)}<span class="bdg flat">{badge(a)}</span>{/if}</span>{/if}
                    {#if showTech}<span class="lq">{tech(a)}</span>{/if}
                  </button>
                {/each}
              </div>
              {:else}
              <div class="grid facetgrid" class:expert={showExpert}>
                {#each g.albums as a (a.id)}
                  <div class="card">
                    <div class="cover">
                      <PochetteActions
                        favori={depot || a.id == null ? null : { albumId: a.id }}
                        etiquettes={depot ? null : cibleEtiquetteAlbum(a)}
                        onEditer={depot ? null : () => (enEdition = a)}
                        onLire={() => lireAlbum(a)}
                        onOuvrir={() => ouvrirCalqueAlbum(a)}
                        menu={depot ? [] : entreesCollection(a)}
                        nom={a.title}
                      >
                        <AlbumArt coverPath={a.cover_path} albumId={depot ? null : a.id} size={0} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} />
                      </PochetteActions>
                      {#if showBadges}{#if badge(a)}<span class="bdg">{badge(a)}</span>{/if}{/if}
                    </div>
                    <button class="meta" onclick={() => ouvrirCalqueAlbum(a)}>
                      <div class="ct" title={a.title}>{a.title}</div>
                      <div class="ca" title={a.artist_name ?? ''}>{a.artist_name ?? ''}</div>
                      <span class="cbot"><QualiteAlbum objet={a} /><PastilleCompilation compilation={a.is_compilation} compact /></span>
                    </button>
                  </div>
                {/each}
              </div>
              {/if}
            </section>
          {/each}
        </div>
        {/if}

      {:else if nu}
        <!-- #4800 — LA GRILLE EN PAGES. Une case par album du total ; celles
             dont la page n'est pas là sont vides et la demandent en entrant
             dans le cadre. Pas d'intertitre d'année : le tri par année sort
             du mode paginé. Les trois dessins sont ceux des snippets. -->
        {#if display === 'list'}
          <div class="rows" style="--lcols:{colonnesListe}" bind:this={gridEl}>
            {#each cases as c, i (c ? c.id : `s${i}`)}
              {#if c}{@render ligne(c, i)}{:else}<div class="lrow sq" data-i={i} use:observerCase={i} aria-hidden="true"><span class="lcv"></span><span class="lt">&nbsp;</span></div>{/if}
            {/each}
          </div>
        {:else if display === 'carousel'}
          <div class="carrou" use:defilementHorizontal bind:this={gridEl}
               use:centrageCarrousel={{ nombre: cases.length, sur: marquerCentre, surGeometrie: poserGeometrie }}
               style="--ccw:{geoCarrou.cote}px; --cch:{geoCarrou.hauteurCarte}px; --ccg:{geoCarrou.gouttiere}px; --ccp:{geoCarrou.margeBord}px; --cce:{geoCarrou.echelle}"
               role="group" aria-label={$tr('v2.lib.viewCarousel' as any)}>
            {#each cases as c, i (c ? c.id : `s${i}`)}
              {#if c}{@render carteCarrou(c, i)}{:else}<div class="ccard sq" class:centre={i === iCentre} data-i={i} use:observerCase={i} aria-hidden="true"><div class="cover"></div><div class="meta"><div class="ct sq">&nbsp;</div><div class="ca sq">&nbsp;</div></div></div>{/if}
            {/each}
          </div>
        {:else}
          <div class="grid" class:expert={showExpert} bind:this={gridEl}>
            {#each cases as c, i (c ? c.id : `s${i}`)}
              {#if c}{@render carte(c, i)}{:else}{@render caseVide(i)}{/if}
            {/each}
          </div>
        {/if}

      {:else if display === 'list'}
        {#if !affiches.length}
          <div class="state">{$tr('library.noAlbumMatchesFilters' as any)}</div>
        {:else}
        <div class="rows" style="--lcols:{colonnesListe}" bind:this={gridEl}>
          {#each affiches as a, i (a.id)}
            {@const it = intertitres?.get(i)}
            {#if it}
              <h3 class="yinter" data-annee={it.annee ?? ''}>
                <span>{it.annee ?? $tr('v2.lib.unknownYear' as any)}</span><span class="yn">{it.n}</span>
              </h3>
            {/if}
            {@render ligne(a, i)}
          {/each}
        </div>
        {/if}

      {:else if display === 'carousel'}
        <!--
          #929 — LE CARROUSEL.

          🔴 Il itère `affiches`, la MÊME source que la grille et la liste.
          Pas de `.slice()`, pas de second tri, pas de « les cinquante
          premiers » : le nombre d'albums affichés ne change pas quand on
          change de mode, et les filtres et le tri de l'écran continuent de
          décider. C'est le deuxième témoin du ticket.

          🔴 Il n'existe QUE dans cette branche. Monter une seconde liste en
          permanence sous la grille est le sujet de #1256, et on n'y ajoute
          pas : `{:else if}` garantit qu'un seul mode est dans l'arbre.

          🔴 Le geste est celui des rangées éditoriales, EMPRUNTÉ et non
          recopié (`use:defilementHorizontal`, #1137 puis #1327). Il porte la
          molette, `Maj`+molette et les flèches, et il laisse la molette
          verticale à la page tant qu'elle peut descendre — le défaut que
          Gros Bidon a signalé le 20/09 et qu'on ne réintroduit pas.

          Pas d'intertitre d'année ici : couché, il couperait la rangée en
          tronçons sans en dire l'endroit. La frise et le rail restent les
          repères, et `jump()` sait désormais viser aussi en largeur.
        -->
        {#if !affiches.length}
          <div class="state">{$tr('library.noAlbumMatchesFilters' as any)}</div>
        {:else}
        <div class="carrou" use:defilementHorizontal bind:this={gridEl}
             use:centrageCarrousel={{ nombre: affiches.length, sur: marquerCentre, surGeometrie: poserGeometrie }}
             style="--ccw:{geoCarrou.cote}px; --cch:{geoCarrou.hauteurCarte}px; --ccg:{geoCarrou.gouttiere}px; --ccp:{geoCarrou.margeBord}px; --cce:{geoCarrou.echelle}"
             role="group" aria-label={$tr('v2.lib.viewCarousel' as any)}>
          {#each affiches as a, i (a.id)}
            {@render carteCarrou(a, i)}
          {/each}
        </div>
        {/if}

      {:else}
        {#if !affiches.length}
          <div class="state">{$tr('library.noAlbumMatchesFilters' as any)}</div>
        {:else}
        <div class="grid" class:expert={showExpert} bind:this={gridEl}>
          {#each affiches as a, i (a.id)}
            {@const it = intertitres?.get(i)}
            {#if it}
              <h3 class="yinter" data-annee={it.annee ?? ''}>
                <span>{it.annee ?? $tr('v2.lib.unknownYear' as any)}</span><span class="yn">{it.n}</span>
              </h3>
            {/if}
            {@render carte(a, i)}
          {/each}
        </div>
        {/if}
      {/if}
    {/if}
  </div>

  <!--
    #4800 — LES TROIS DESSINS D'UN ALBUM, UNE SEULE FOIS.

    La grille en pages (`nu`, ci-dessus) et la grille entière itèrent des
    listes différentes — des CASES qui peuvent être vides, ou des albums — mais
    dessinent la même vignette, la même ligne, la même carte de carrousel.
    Les snippets évitent de les écrire deux fois. `data-i` : la position dans
    la liste, cible du saut A–Z en pages ; `data-letter` : l'initiale, cible
    du saut sur la liste entière (#1487).
  -->
  {#snippet carte(a: Album, i: number)}
    <div class="card" data-letter={firstLetter(a)} data-i={i}>
      <div class="cover">
        <!-- 🔴 La grille PAR DÉFAUT n'avait pas le menu de collections
             que la grille de facette et le carrousel portaient déjà
             (#1222) : c'est pourtant elle que voit tout le monde. -->
        <PochetteActions
          favori={depot || a.id == null ? null : { albumId: a.id }}
          etiquettes={depot ? null : cibleEtiquetteAlbum(a)}
          onEditer={depot ? null : () => (enEdition = a)}
          onLire={() => lireAlbum(a)}
          onOuvrir={() => ouvrirCalqueAlbum(a)}
          menu={depot ? [] : entreesCollection(a)}
          nom={a.title}
        >
          <AlbumArt coverPath={a.cover_path} albumId={depot ? null : a.id} size={0} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} />
        </PochetteActions>
        {#if showBadges}{#key badge(a)}{#if badge(a)}<span class="bdg">{badge(a)}</span>{/if}{/key}{/if}
      </div>
      <button class="meta" onclick={() => ouvrirCalqueAlbum(a)}>
        <div class="ct" title={a.title}>{a.title}</div>
        <div class="ca" title={a.artist_name ?? ''}>{a.artist_name ?? ''}</div>
        <span class="cbot"><QualiteAlbum objet={a} /><PastilleCompilation compilation={a.is_compilation} compact /></span>
        {#if showTech}<div class="cq">{tech(a)}</div>{/if}
      </button>
    </div>
  {/snippet}

  {#snippet ligne(a: Album, i: number)}
    <button class="lrow" data-letter={firstLetter(a)} data-i={i} onclick={() => ouvrirCalqueAlbum(a)}>
      <span class="lcv"><AlbumArt coverPath={a.cover_path} albumId={depot ? null : a.id} size={0} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} /></span>
      <!-- La pastille reste DANS la cellule du titre : une septieme
           colonne decalerait toutes les autres, et seule une poignee de
           lignes la porte (#1957, et la lecon d'alignement du 05/09). -->
      <span class="lt"><span class="ltt">{a.title}</span><PastilleCompilation compilation={a.is_compilation} compact /></span>
      <span class="la">{a.artist_name ?? ''}</span>
      <span class="ly">{albumYear(a) ?? ''}</span>
      <!--
        🔴 Ces deux cellules sont TOUJOURS présentes quand leur mode
        est actif, vides s'il n'y a rien à y mettre.

        Elles étaient posées sous `{#if}` : une ligne sans badge n'avait
        que cinq cellules, et sa fiche technique tombait donc dans la
        colonne du badge. C'est la moitié du désalignement que Bertrand
        a photographié le 05/09/2026 ; l'autre moitié est que chaque
        ligne était sa PROPRE grille (voir `--lcols` plus bas).
      -->
      {#if showBadges}<span class="lb">{#if badge(a)}<span class="bdg flat">{badge(a)}</span>{/if}</span>{/if}
      {#if showTech}<span class="lq">{tech(a)}</span>{/if}
    </button>
  {/snippet}

  {#snippet carteCarrou(a: Album, i: number)}
    <div class="ccard" class:centre={i === iCentre} data-letter={firstLetter(a)} data-i={i}>
      <div class="cover">
        <PochetteActions
          favori={depot || a.id == null ? null : { albumId: a.id }}
          etiquettes={depot ? null : cibleEtiquetteAlbum(a)}
          onEditer={depot ? null : () => (enEdition = a)}
          onLire={() => lireAlbum(a)}
          onOuvrir={() => ouvrirCalqueAlbum(a)}
          menu={depot ? [] : entreesCollection(a)}
          nom={a.title}
        >
          <AlbumArt coverPath={a.cover_path} albumId={depot ? null : a.id} size={0} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} />
        </PochetteActions>
        {#if showBadges}{#if badge(a)}<span class="bdg">{badge(a)}</span>{/if}{/if}
      </div>
      <button class="meta" onclick={() => ouvrirCalqueAlbum(a)}>
        <div class="ct" title={a.title}>{a.title}</div>
        <div class="ca" title={a.artist_name ?? ''}>{a.artist_name ?? ''}</div>
        <span class="cbot"><QualiteAlbum objet={a} /><PastilleCompilation compilation={a.is_compilation} compact /></span>
        {#if showTech}<div class="cq">{tech(a)}</div>{/if}
      </button>
    </div>
  {/snippet}

  <!-- Une case dont la page n'est pas arrivée : même encombrement que la
       vignette qu'elle attend, pour que la hauteur de la liste — et donc le
       saut A–Z et l'ascenseur — soient ceux de la bibliothèque entière. Sa
       mise en vue demande sa page (`observerCase`). -->
  {#snippet caseVide(i: number)}
    <div class="card sq" data-i={i} use:observerCase={i} aria-hidden="true">
      <div class="cover"></div>
      <div class="meta"><div class="ct sq">&nbsp;</div><div class="ca sq">&nbsp;</div><span class="cbot">&nbsp;</span>{#if showTech}<div class="cq">&nbsp;</div>{/if}</div>
    </div>
  {/snippet}

  {#if opened}
    <AlbumDetailV2 album={opened} {depot} onClose={retourCalqueAlbum} />
  {/if}

  {#if enEdition}
    <AlbumEditModal
      album={enEdition}
      onClose={() => (enEdition = null)}
      onSaved={(maj) => {
        // Report dans le MAGASIN, d'où la grille tire ses albums : sans lui,
        // le titre corrigé ne réapparaîtrait qu'au prochain chargement de
        // l'écran. Édition impossible sur un dépôt distant, donc `albums` est
        // bien la source ici. #4800 : dans les PAGES aussi, si elles portent
        // l'album — c'est ce que la grille montre en mode paginé.
        mettreAJourAlbum(maj);
        enEdition = null;
      }}
    />
  {/if}
</section>

<style>
  /* Meme gouttiere que la ligne de filtres juste au-dessus : la barre s'aligne
     avec elle au lieu de flotter. */
  .anbar{display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding:2px 30px 12px}
  .ancl{font:600 10.5px var(--v2-mono); letter-spacing:.05em; color:var(--v2-txt3); text-transform:uppercase}
  .anmodes{display:flex; gap:7px; flex-wrap:wrap}
  .anmodes button, .anord{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2);
    cursor:pointer; border-radius:999px; padding:5px 13px; font:600 11.5px var(--v2-sans)}
  .anmodes button:hover, .anord:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .anmodes button.on{border-color:var(--v2-acc1); color:var(--v2-acc1)}
  /* La couverture est posee DANS la puce : c'est ce qui evite de basculer sur
     un mode qui ne date presque rien sans l'avoir vu. */
  .anc{margin-left:7px; font:10.5px var(--v2-mono); color:var(--v2-txt3)}
  .anord{margin-left:auto}
  .andelta{padding:0 30px 12px; margin-top:-6px; font-size:12px; color:var(--v2-txt3)}
  .dist{font:11px var(--v2-mono); color:var(--v2-txt3); align-self:center; margin-left:-6px}
  .derr{margin:0 30px 10px; padding:9px 14px; border-radius:10px; font-size:13px;
    color:var(--v2-danger); border:1px solid var(--v2-danger); background:var(--v2-danger-soft)}
  .v2-lib{position:relative; display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden; box-sizing:border-box}
  /* padding-right élargi : l'avatar de la coquille est pincé à droite. */
  .tabs{margin-left:auto; display:flex; align-items:center; gap:4px}
  .tab{padding:8px 15px; border-radius:var(--v2-r-pill); border:0; background:transparent; color:var(--v2-txt2);
    font:600 14px var(--v2-sans); cursor:pointer}
  .tab:hover{color:var(--v2-txt)}
  .tab.active{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}

  .filters{display:flex; align-items:center; gap:12px; padding:16px 30px 14px; flex-wrap:wrap}
  .chip{display:inline-flex; align-items:center; gap:8px; height:36px; padding:0 15px; border-radius:var(--v2-r-pill);
    background:var(--v2-surface); border:1px solid transparent; color:var(--v2-txt2); font:600 13.5px var(--v2-sans); cursor:pointer; transition:.15s}
  .chip:hover{color:var(--v2-txt)}
  .chip svg{width:12px; height:12px; opacity:.7}
  .chip.count{background:transparent; border:1px solid var(--v2-line2); color:var(--v2-txt)}
  .chip.active{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); color:var(--v2-on-acc)}
  /* Le compte d'une puce-bascule, dans la puce elle-même : les menus le
     portent sur chaque valeur, une bascule n'en a qu'une à annoncer.
     `currentColor` à l'état actif, sinon le chiffre resterait gris sur le
     dégradé et deviendrait illisible. */
  .chip em{font:9.5px var(--v2-mono); font-style:normal; color:var(--v2-txt3); margin-left:-2px}
  .chip.active em{color:currentColor; opacity:.8}
  .drop{position:relative}
  .drop .menu{position:absolute; top:44px; left:0; z-index:20; min-width:150px; padding:6px;
    background:var(--v2-surface); border:1px solid var(--v2-line2); border-radius:12px; box-shadow:var(--v2-sh-lg);
    display:none; flex-direction:column; gap:2px}
  .drop:hover .menu, .drop.open .menu{display:flex}
  /* PONT des 8 px entre le chip (36 px) et le menu (top:44px). Sans lui, le
     pointeur quitte `.drop` avant d'atteindre le menu et `:hover` tombe : le
     menu est visible mais inatteignable. Transparent, donc invisible. */
  .drop::after{content:""; position:absolute; left:0; right:0; top:36px; height:8px}
  .drop .menu button{text-align:left; border:0; background:transparent; color:var(--v2-txt2); font:600 13px var(--v2-mono);
    padding:8px 10px; border-radius:8px; cursor:pointer}
  .drop .menu button:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .drop .menu button.on{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}

  .body{flex:1; min-height:0; display:flex; padding-left:18px}
  /*
    #929 — EN CARROUSEL, LE RAIL PASSE SOUS LA BANDE.

    Sur la capture de Bertrand, le rail A–Z restait une colonne verticale
    courant sur toute la hauteur, à côté d'une rangée horizontale. Un rail est
    un repère SPATIAL : il dit où l'on est dans la liste, et il ne peut le dire
    qu'en pointant dans la direction où la liste se déroule. Vertical contre
    une bande horizontale, il oblige l'oeil à traduire une direction en une
    autre, et ses lettres ne désignent plus rien de ce qu'on voit.

    On le couche donc, et on le met SOUS la bande — c'est là qu'il y a de la
    place, et c'est là que l'oeil le cherche quand la liste va vers la droite.
    `column-reverse` parce que le rail est le PREMIER enfant du corps : en
    `column` il se retrouverait au-dessus, entre la barre d'outils et les
    pochettes.
  */
  .body.encarrousel{flex-direction:column-reverse}
  .state{flex:1; display:grid; place-items:center; color:var(--v2-txt3); font-size:15px}
  /* Rail A-Z : c'est un REPERE, il doit se lire d'un coup d'oeil et se viser
     au doigt. Auparavant 11 px colles a 1 px d'intervalle contre la grille —
     illisible et impossible a cliquer juste. */
  .rail{display:flex; flex-direction:column; justify-content:center; gap:2px;
    padding:10px 12px 10px 4px; margin-right:6px; position:sticky; top:0;
    border-right:1px solid var(--v2-line)}
  /* Couché : il se déroule en ligne, se pose sur un filet horizontal, et perd
     son adhérence verticale — `sticky` n'a plus de sens sur une seule ligne. */
  .rail.couche{flex-direction:row; position:static; margin:6px 0 0; padding:6px 12px;
    overflow-x:auto; scrollbar-width:none;
    border-right:0; border-top:1px solid var(--v2-line)}
  .rl{width:22px; height:20px; display:grid; place-items:center; border:0; background:transparent;
    font:600 11px var(--v2-mono); color:var(--v2-txt3); cursor:pointer; border-radius:5px; transition:.12s}
  .rl:disabled{opacity:.22; cursor:default}
  .rl.hot{color:var(--v2-txt2)}
  .rl.hot:hover{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .rl:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:1px}
  /* Bascule entre les deux repères de navigation : alphabet ou époque. */
  .navmode{display:flex; align-items:center; gap:4px; padding:2px 30px 10px}
  .navmode > button{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2);
    font:600 11.5px var(--v2-sans); padding:6px 13px; border-radius:var(--v2-r-pill); cursor:pointer; transition:.15s}
  .navmode > button:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .navmode > button.on{color:var(--v2-on-acc); border-color:transparent;
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .navmode .yearpill{display:inline-flex; align-items:center; gap:7px; margin-left:8px;
    color:var(--v2-acc-tint); border-color:var(--v2-acc2); background:var(--v2-acc-soft)}
  .navmode .yearpill svg{width:11px; height:11px}

  /* Frise : une barre par année, hauteur proportionnelle au nombre d'albums.
     Les années sans album restent visibles mais creuses — un trou dans la
     collection est une information, pas un défaut d'affichage. */
  /* COTES RELEVEES AU PIXEL sur la maquette v3 de Levente (variante 3,
     rendue a 1,5x puis ramenee a 1x) :
       trait 2 px · ecart 2 px · pas 4 px · peigne 43 px
       curseur ~9 px de large, debordant de ~23 px au-dessus
       fond #071418 — exactement notre token `--v2-bg`
     Le curseur est le seul ecart assume : porte a 12 px pour que le libelle
     vertical « JUL 1994 » reste lisible, la ou sa maquette n'affiche qu'une
     annee. */
  .frise{padding:8px 30px 14px; user-select:none}
  .bars{position:relative; display:flex; align-items:flex-end; gap:2px; height:43px; padding-top:23px}
  /* Graduation au DOUZIEME : chaque annee est fendue de onze filets, ce qui
     donne la regle fine. Un degrade repete plutot que douze elements — 59
     annees x 12 feraient 708 noeuds pour un trait de 2 px. */
  .tick{position:relative; flex:1 1 0; min-width:2px; height:var(--h); border:0; padding:0; cursor:pointer;
    border-radius:1px; background:var(--v2-line2); transition:background .12s;
    background-image:repeating-linear-gradient(90deg,
      transparent 0, transparent calc(100%/12 - 0.5px),
      var(--v2-bg) calc(100%/12 - 0.5px), var(--v2-bg) calc(100%/12));
    background-clip:padding-box}
  /* Sous 18 px de large la fente ne se voit plus et brouille le trait : on la
     retire plutot que d'afficher une bouillie. */
  @media (max-width:1200px){ .tick{background-image:none} }
  .tick.vide{background:var(--v2-line); cursor:pointer}
  .tick:hover{background:var(--v2-acc2)}
  /* Le curseur deborde le peigne vers le haut : il doit se voir d'un coup
     d'oeil, pas se confondre avec un trait un peu plus grand. */
  .tick.on{background:transparent}
  /* Curseur : pose sur l'axe en permanence, deplace en `left` pour glisser le
     long des annees. `pointer-events:none` — il ne doit jamais voler le survol
     au trait qu'il recouvre, sinon il se bloquerait lui-meme. */
  .curseur{position:absolute; top:0; bottom:0; transform:translateX(-50%);
    width:auto; min-width:12px; display:grid; place-items:center; border-radius:3px; pointer-events:none;
    background:linear-gradient(180deg,var(--v2-acc1),var(--v2-acc2));
    color:var(--v2-on-acc); font:700 8px var(--v2-mono); letter-spacing:.04em;
    writing-mode:vertical-rl; text-orientation:mixed; padding:3px 0;
    box-shadow:0 2px 10px var(--v2-glow-strong);
    transition:left .12s ease, opacity .12s}
  /* Au survol seul le curseur est plus discret : il indique, il ne filtre pas. */
  .curseur:not(.fige){opacity:.82}
  /* Annee sans album : le curseur reste visible mais s'efface — le creux est
     une information, on ne le cache pas. */
  .curseur.creux{background:var(--v2-line2); color:var(--v2-txt2); box-shadow:none}
  .decs{position:relative; height:16px; margin-top:9px}
  .dec{position:absolute; transform:translateX(-50%); font:10.5px var(--v2-mono); color:var(--v2-txt3); white-space:nowrap}

  /* Contrôles de droite : tri et bascule d'affichage. */
  .drop.right{margin-left:0}
  .menu button em{font:9.5px var(--v2-mono); font-style:normal; color:var(--v2-txt3); margin-left:6px}
  /* Une valeur que la combinaison courante ne rend pas : visible, pour que le
     menu ne saute pas sous le doigt, mais inerte et sourde. */
  .menu button:disabled{opacity:.38; cursor:default}
  .menu button:disabled:hover{background:transparent}
  .chip.plain{gap:7px}
  .chip.plain svg:first-child{width:14px; height:14px}
  .viewtog{width:38px; height:38px; flex:0 0 auto; border-radius:10px; cursor:pointer;
    border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); display:grid; place-items:center}
  .viewtog:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .viewtog svg{width:16px; height:16px}
  /* #929 — une pastille par cran, allumée sur le mode courant. Le bouton
     empile icone puis pastilles : 16 + 3 + 4 = 23 px dans une boite de 38. */
  .viewtog:has(.vpts){display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px}
  .vpts{display:flex; gap:3px}
  .vpts i{width:4px; height:4px; border-radius:50%; background:var(--v2-line2)}
  .vpts i.on{background:var(--v2-acc1)}

  /* Vues par facette : une section par valeur (artiste, genre, année, label). */
  .facets{flex:1; overflow-y:auto; padding:8px 30px 40px}
  .facets::-webkit-scrollbar{width:9px}.facets::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  /* La puce de portée : visible sans crier, et son × est la seule action. */
  .portee{padding:2px 30px 6px}
  .pchip{display:inline-flex; align-items:center; gap:8px; padding:6px 8px 6px 12px;
    border-radius:var(--v2-r-pill); font:600 12px var(--v2-sans);
    color:var(--v2-acc1); background:var(--v2-acc-soft);
    border:1px solid color-mix(in srgb, var(--v2-acc1) 40%, transparent)}
  .pchip svg{width:14px; height:14px; flex:none}
  .pchip button{display:flex; align-items:center; justify-content:center; width:18px; height:18px;
    padding:0; border:0; border-radius:50%; cursor:pointer; font:600 14px var(--v2-sans);
    background:transparent; color:inherit; line-height:1}
  .pchip button:hover{background:color-mix(in srgb, var(--v2-acc1) 22%, transparent)}
  .pchip button:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:2px}

  /* La LISTE des valeurs de facette : un écran, pas un déroulé de grilles.
     Deux colonnes dès qu'il y a la place — une bibliothèque compte souvent
     plus de cinquante genres, et une colonne unique redemanderait à faire
     défiler ce qu'on venait d'éviter (eric, forum 1671). */
  .fliste{display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));
    gap:2px 18px; padding:6px 30px 40px; align-content:start; overflow-y:auto}
  .fl{display:flex; align-items:center; gap:6px; border-radius:9px}
  .fl:hover{background:var(--v2-hover)}
  .flnom{display:flex; align-items:center; gap:10px; flex:1; min-width:0;
    padding:10px 12px; border:0; background:transparent; cursor:pointer;
    color:var(--v2-txt2); font:inherit; text-align:left}
  .fl:hover .flnom{color:var(--v2-txt)}
  .flnom:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:-2px; border-radius:9px}
  .flnom .fk{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    font-size:14px}
  /* Le retour vers la liste. Sans lui, on serait entré dans un genre sans
     pouvoir en sortir autrement qu'en changeant d'onglet. */
  .fretour{display:inline-flex; align-items:center; gap:6px; margin:0 30px 8px;
    padding:7px 12px 7px 8px; border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill);
    background:transparent; color:var(--v2-txt2); cursor:pointer; font:600 12.5px var(--v2-sans)}
  .fretour:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .fretour:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:2px}
  .fretour svg{width:15px; height:15px}

  .facet{padding-bottom:26px}
  .facet h2{display:flex; align-items:center; gap:10px; font-size:17px; font-weight:700; padding:6px 0 14px;
    position:sticky; top:0; background:var(--v2-bg); z-index:2}
  .facet .fk{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .facet .fc{font:10px var(--v2-mono); color:var(--v2-txt3); border:1px solid var(--v2-line2);
    border-radius:999px; padding:2px 8px; flex:none}
  /* Le coeur reste discret tant qu'il est vide : c'est un titre de section,
     pas une barre d'actions. Une fois plein, il prend la couleur d'accent et
     ne s'efface plus — c'est l'etat, pas une decoration au survol. */
  /* 🔴 Le MÊME bouton vit à DEUX endroits : dans l'en-tête d'une facette
     ouverte (`.facet h2`) et sur chaque ligne de la liste des facettes
     (`.fl`). Les règles n'étaient écrites que pour le premier : dans la
     liste, le bouton n'héritait d'aucun style et le navigateur lui posait
     son fond par défaut — un carré GRIS opaque sous chaque cœur, sur tout
     l'onglet Genres (Bertrand, 22/09/2026, v0.9.161).
     Les deux emplacements partagent donc désormais les mêmes règles. */
  .facet .fcoeur,
  .fl .fcoeur{flex:none; display:flex; align-items:center; justify-content:center;
    width:26px; height:26px; padding:0; border:0; border-radius:8px; cursor:pointer;
    background:transparent; color:var(--v2-txt3); opacity:.45;
    transition:opacity .12s ease, color .12s ease, background .12s ease}
  .facet h2:hover .fcoeur,
  .fl:hover .fcoeur{opacity:1}
  .facet .fcoeur:hover,
  .fl .fcoeur:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .facet .fcoeur:focus-visible,
  .fl .fcoeur:focus-visible{opacity:1; outline:2px solid var(--v2-acc1); outline-offset:2px}
  .facet .fcoeur.on,
  .fl .fcoeur.on{opacity:1; color:var(--v2-acc1)}
  .facetgrid{overflow:visible; padding:0}
  /* #1419 — la liste d'une facette défile avec la page, comme sa grille. */
  .rows.facetrows{overflow:visible; padding:0; flex:none}

  /* Affichage liste : même données, densité maximale. */
  .rows{flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:1px; padding:4px 30px 40px}
  .rows::-webkit-scrollbar{width:9px}.rows::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .lrow{display:grid; grid-template-columns:var(--lcols, 44px minmax(0,2fr) minmax(0,1.4fr) 52px 46px 150px); align-items:center;
    gap:14px; width:100%; padding:6px 10px; border:0; border-radius:9px; background:transparent;
    color:var(--v2-txt2); cursor:pointer; text-align:left; transition:.12s;
    /*
      🔴 Fil 1919, ticket support 165 — jfpaquet, 6 704 albums, 0.9.163 :
      « using the little button to change between the 3 albums views does not
      work well : hesitating and slow […] I fear that will be a problem with
      40.000+ ».

      Les trois vues sont trois branches `{#if}` SŒURS : basculer détruit
      toutes les vignettes de l'une et construit toutes celles de l'autre.
      `.card` (grille) et `.ccard` (carrousel) amortissent déjà ce prix avec
      `content-visibility` — hors du cadre, une vignette ne coûte ni style,
      ni disposition, ni peinture. La LISTE, elle, ne l'avait pas : c'est la
      seule des trois à payer plein tarif, et donc la transition la plus
      lente des six possibles. Elle rejoint ses deux sœurs ici.

      ⚠️ Ce n'est PAS la guérison : les nœuds sont toujours créés et détruits
      par milliers, et seule une vue unique — ou une fenêtre de rendu —
      supprimerait ce coût. Voir la PR pour le chantier.

      Le mot-clé `auto` fait retenir au navigateur la taille RÉELLE une fois
      la ligne rendue, comme pour `.card` : sans lui, l'estimation fixe
      fausserait la hauteur totale et le saut au « M » du rail A–Z
      atterrirait à côté. 56 px = la pochette de 44 px et ses deux fois
      6 px de marge intérieure.
    */
    content-visibility:auto; contain-intrinsic-size:auto 56px}
  .lrow:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .lcv{width:44px; height:44px; border-radius:6px; overflow:hidden}
  .lrow .lt{display:flex; align-items:center; gap:7px; min-width:0;
    font-size:13.5px; font-weight:600; color:var(--v2-txt)}
  /* C'est le TITRE qui s'elide, pas la pastille : une pastille tronquee ne
     dirait plus rien, alors qu'un titre coupe reste identifiable. */
  .lrow .ltt{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .lrow .la{font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .lrow .ly{font:11px var(--v2-mono); color:var(--v2-txt3); text-align:right; font-variant-numeric:tabular-nums}
  /* La cellule du badge existe meme vide : c'est elle qui tient la colonne. */
  .lrow .lb{display:flex; justify-content:center; min-width:0}
  /* Ferre a DROITE : les fiches techniques n'ont pas la meme longueur, et
     c'est leur bord droit qui doit s'aligner d'une ligne a l'autre. */
  .lrow .lq{font:10px var(--v2-mono); color:var(--v2-acc2); text-align:right;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-variant-numeric:tabular-nums}
  .bdg.flat{position:static; align-self:center}

  /* Onglet Titres. */
  .tracklist{flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:1px; padding:4px 30px 40px}
  .tracklist::-webkit-scrollbar{width:9px}.tracklist::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .trk{display:grid; grid-template-columns:1fr auto auto; align-items:center; gap:14px; width:100%;
    padding:0 10px; border-radius:9px; color:var(--v2-txt2)}
  /* Le clic de LECTURE : c'est lui qui porte la grille du titre, la ligne
     n'etant plus qu'un conteneur depuis qu'elle accueille la barre d'actions. */
  .tclick{display:grid; grid-template-columns:40px 1fr; align-items:center; gap:14px; min-width:0;
    padding:8px 0; border:0; background:transparent; color:inherit; cursor:pointer; text-align:left; font-family:inherit}
  .trk:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .trk .tn{font:11px var(--v2-mono); color:var(--v2-txt3); text-align:right}
  .trk .tt{min-width:0; font-size:13.5px; font-weight:500; display:flex; flex-direction:column; gap:2px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .trk .tt em{font:11px var(--v2-sans); font-style:normal; color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis}
  .trk .td{font:11.5px var(--v2-mono); color:var(--v2-txt3)}

  /* #1313 : l'intertitre d'année traverse toute la grille (`1 / -1`) et reste
     collé en haut pendant le défilement, pour qu'on sache toujours où l'on est. */
  .yinter{grid-column:1 / -1; position:sticky; top:0; z-index:2; display:flex; align-items:baseline; gap:8px;
    margin:0; padding:6px 0 5px; background:var(--v2-bg); border-bottom:1px solid var(--v2-line);
    font:700 15px var(--v2-sans); color:var(--v2-txt)}
  .yinter .yn{font:600 11px var(--v2-mono); color:var(--v2-txt3)}
  .grid{flex:1; overflow-y:auto; display:grid; grid-template-columns:repeat(auto-fill,minmax(148px,1fr));
    gap:22px 18px; align-content:start; padding:8px 30px 40px}
  .grid::-webkit-scrollbar{width:9px}.grid::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  /*
    #929 — LE CARROUSEL : UNE BANDE, ET L'ALBUM DU MILIEU EN GRAND.

    Bertrand, 20/09/2026, capture d'un 27 pouces à l'appui : « il faudrait
    mettre en plus gros l'album du milieu et actif », et la bande n'occupait
    qu'un tiers de la hauteur. Les deux se règlent au même endroit — la
    géométrie est CALCULÉE (voir `lib/centreCarrousel`) et descendue ici en
    variables. Aucune taille de pochette n'est écrite dans ce fichier : une
    constante en dur ne peut pas être juste à la fois sur un portable et sur
    un 27 pouces.

      --ccw  le côté d'une pochette      --ccg  la gouttière
      --cch  la hauteur d'une carte      --ccp  le retrait aux deux bouts
      --cce  l'agrandissement de la pochette centrale

    🔴 PAS DE `scroll-snap`. Les flèches déplacent la bande de `PAS_FLECHE`
    (220 px, la mesure des rangées éditoriales), et le pas d'une vignette de
    carrousel en vaut de 175 à 700 selon l'écran. Un calage par proximité
    ramènerait la bande là d'où elle vient à chaque flèche : la touche
    paraîtrait morte. La mise en avant, elle, n'a pas besoin de calage — elle
    se recalcule en continu depuis la position de défilement.

    `align-items:center` et une origine de transformation au centre : la
    pochette centrale grandit symétriquement, et la place réservée au-dessus
    et au-dessous lui est garantie par le calcul (`hauteurBande <= hauteur`).
  */
  .carrou{flex:1; min-height:0; display:flex; align-items:center; gap:var(--ccg);
    overflow-x:auto; overflow-y:hidden; padding:0 var(--ccp); scrollbar-width:thin; outline:none}
  .carrou::-webkit-scrollbar{height:9px}
  .carrou::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  /* Le focus se voit : l'action rend la rangée atteignable au clavier, et une
     cible de tabulation invisible est une cible perdue. */
  .carrou:focus-visible{box-shadow:inset 0 0 0 2px var(--v2-acc1); border-radius:var(--v2-r-card)}
  /*
    🔴 `flex:0 0` — la vignette ne se laisse ni étirer ni comprimer. Sans lui,
    le défaut (`1 1 auto`) écraserait quatre mille pochettes dans la largeur de
    l'écran, et le pas cesserait d'être constant : le calcul de l'album central
    désignerait alors n'importe qui.

    Même économie que la grille : hors du cadre, une vignette de trente nœuds
    ne coûte ni style, ni disposition, ni peinture.
  */
  .ccard{flex:0 0 var(--ccw); width:var(--ccw);
    border:0; background:transparent; text-align:left; padding:0; color:inherit;
    transform-origin:center center; transition:transform .22s ease;
    content-visibility:auto; contain-intrinsic-size:auto var(--ccw) auto var(--cch)}
  /*
    🔴 UNE TRANSFORMATION, ET RIEN QUI OCCUPE DE LA PLACE.

    Une largeur, une marge ou une police plus grande décaleraient toute la
    bande à chaque fois qu'une pochette devient centrale : le calage se
    mettrait à glisser sous les doigts, et l'album désigné ne serait plus
    celui qu'on vise. `transform` est ignoré de la mise en page — la géométrie
    ne bouge pas d'un pixel.

    `z-index` sans `position` : un élément de `flex` y répond, et la pochette
    agrandie passe ainsi au-dessus de ses voisines. Elle ne les touche pas
    pour autant — la gouttière est calculée pour absorber l'agrandissement.
  */
  .ccard.centre{transform:scale(var(--cce)); z-index:1}
  /*
    🔴 « Une pochette qui enfle à chaque cran est insupportable pour qui a
    désactivé les animations. » Le changement de taille reste — c'est lui qui
    DIT quel album est courant, et le retirer retirerait la fonction — mais il
    devient instantané.
  */
  @media (prefers-reduced-motion: reduce){
    .ccard{transition:none}
  }
  .card{border:0; background:transparent; text-align:left; padding:0; transition:.18s; opacity:1; color:inherit;
    /*
      Les vignettes hors écran ne sont plus rendues.

      Depuis que la pochette porte cinq boutons, une vignette est passée
      d'environ six nœuds à près de trente — SVG et tracés compris. Sur la
      collection Pop de Bertrand, 838 albums, cela fait quelque vingt mille
      éléments de plus à styler et à disposer, et le défilement est devenu
      pâteux (constaté le 02/09/2026, après un premier correctif qui n'avait
      visé que le coût de PEINTURE et n'a rien changé).

      `content-visibility` fait sauter style, disposition et peinture de tout
      ce qui sort du cadre. Les nœuds existent toujours — la recherche par
      lettre du rail A–Z les trouve donc encore —, ils ne coûtent plus rien
      tant qu'on ne les regarde pas.

      Le mot-clé `auto` de `contain-intrinsic-size` fait retenir au navigateur
      la taille RÉELLE une fois la vignette rendue une première fois. Sans lui,
      l'estimation fixe fausserait la hauteur totale, et le saut au « M » du
      rail atterrirait à côté.
    */
    content-visibility:auto; contain-intrinsic-size:auto 210px}
  /* La carte n'est plus un `<button>` : elle porte cinq boutons d'action sur sa
     pochette, et des boutons imbriqués sont du HTML invalide que les
     navigateurs défont. Le bloc de texte reprend donc le rôle cliquable. */
  .meta{display:block; width:100%; border:0; background:transparent; text-align:left; cursor:pointer; padding:0; color:inherit; font:inherit}
  .cover{position:relative; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden; box-shadow:var(--v2-sh-card)}
  .bdg{position:absolute; left:6px; top:6px; font:700 8px var(--v2-mono); letter-spacing:.06em; padding:2px 5px;
    border-radius:3px; background:var(--v2-scrim); color:var(--v2-acc-tint)}
  .ct{margin-top:9px; font:600 12.5px var(--v2-sans); line-height:1.25; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{margin-top:2px; font:11px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  /* Troisieme ligne d'une vignette : la provenance et la qualite, puis la
     pastille « compilation ». `min-width:0` sur les deux enfants, sinon le
     badge de qualite refuse de retrecir et pousse la pastille hors carte. */
  .cbot{display:flex; align-items:center; gap:6px; min-width:0}
  .cbot > :global(*){min-width:0}
  .cq{margin-top:4px; font:9.5px var(--v2-mono); color:var(--v2-acc2); letter-spacing:.02em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .chip.dr{display:inline-flex; align-items:center; gap:5px}
  .chip.dr select{border:0; background:transparent; color:inherit; font:inherit; cursor:pointer}

  /* #4800 — la CASE VIDE d'une page pas encore arrivée : même gabarit que la
     vignette (pochette carrée + deux lignes), en aplat discret ; inerte au
     pointeur. Une case de liste tient la hauteur d'une ligne (pochette 44 px). */
  .sq{pointer-events:none}
  .sq .cover{background:var(--v2-surface); box-shadow:none}
  .sq .ct, .sq .ca, .sq .cbot, .sq .cq{background:var(--v2-surface); border-radius:4px; width:70%; color:transparent}
  .sq .ca{width:50%}
  .lrow.sq{min-height:44px; cursor:default}
  .lrow.sq .lcv{background:var(--v2-surface)}
</style>
