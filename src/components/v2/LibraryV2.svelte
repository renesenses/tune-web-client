<script lang="ts">
  // Alias `tr` : `t` est déjà pris comme variable de boucle plus bas
  // ({#each TABS as t}, {#each visibleTracks as t}), et il masquerait le store.
  import { tick } from 'svelte';
  // 🔴 PLUS d'import de `get` : ce fichier n'a plus AUCUN lecteur de magasin
  // par `get()`. Les deux derniers étaient les effets `pendingLibraryArtist`
  // (#3708) et `pendingLibraryAlbum` (#3717), et c'était précisément le
  // défaut — `get()` n'abonne à rien sous les runes. Si un `get(` réapparaît
  // ici, c'est presque sûrement la même faute : préférer `$monMagasin`.
  import { t as tr } from '../../lib/i18n';
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
  // 🔴 `pendingLibraryFolder` n'existe PLUS : `main` l'a remplacé par le
  // magasin `libraryFolderScope` (voir `lib/porteeBibliotheque`) parce qu'un
  // dépôt consommé UNE fois dans l'initialiseur d'un `$state` n'était jamais
  // lu quand la Bibliothèque était déjà montée. On prend sa version.
  // `pendingLibraryAlbum`, lui, reste : c'est le contrat des liens de la
  // lecture en cours (Fabien), et il est toujours consommé plus bas.
  import { activeView, listResetNonce, pendingLibraryAlbum, pendingLibraryArtist, pendingLibraryYear, type View } from '../../lib/stores/navigation';
  import { nomDeDossier } from '../../lib/porteeBibliotheque';
  import { optionsAleatoire } from '../../lib/porteeAleatoire';
  import { notifications } from '../../lib/stores/notifications';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { getQualityTier, multipleDSD, fold, formatDuration,  type QualityTier } from '../../lib/utils';
  import type { Album, Track } from '../../lib/types';
  import { anneeAlbum, couvertureAnnees, albumsQuiChangent, comparerAnnees, comparerAlbumsParAnnee, type ModeAnnee } from '../../lib/anneeAlbum';
  import {
    comptesQualite, comptesFrequence, comptesFormat, comptesProfondeur,
    comptesCompilation,
    type FiltresBibliotheque, type Outils,
  } from '../../lib/facettesBibliotheque';
  import * as api from '../../lib/api';
  import { favoriteFacetKeys, facetFavKey } from '../../lib/stores/profile';
  import { basculerFavoriFacette } from '../../lib/favorisLocaux';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  // Un échec de lecture DOIT se voir : ces appels finissaient tous par un
  // `.catch(() => {})` (#3732). Le message du serveur — qui nomme l'appareil
  // manquant — n'atteignait jamais l'écran.
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import AlbumArt from '../AlbumArt.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import ListePistesV2 from './ListePistesV2.svelte';
  import { lireChoix, ecrireChoix } from '../../lib/preferencesEcran';
  import QualiteAlbum from './QualiteAlbum.svelte';
  import PastilleCompilation from './PastilleCompilation.svelte';
  import AlbumEditModal from '../AlbumEditModal.svelte';
  import ArtistesV2 from './ArtistesV2.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';
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
    api.getAlbumsDetailed({ folder: dossierPortee }, 5000, 0)
      .then((r) => {
        if (perime) return;
        idsPortee = new Set(
          (r.items ?? []).map((a: any) => a.album_id).filter((x: any) => typeof x === 'number'),
        );
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
   *  ni `albumsD` : c'est ce qui rend la vue identique des deux cotes. */
  const src = $derived<Album[]>(
    depot ? albumsD
      : !porteeActive ? $albums
      : idsPortee == null ? []
      : $albums.filter((a) => a.id != null && idsPortee!.has(a.id)),
  );
  const enCharge = $derived(
    depot ? chargementD : (porteeActive && idsPortee == null) || $libraryLoading,
  );

  /**
   * LES ARTISTES DE LA PORTÉE — `null` = aucune portée, on les montre tous.
   *
   * L'onglet Artistes tire sa liste de `/library/artists`, sa propre table :
   * il ignorait donc la portée, et choisir un répertoire laissait les 1 632
   * artistes de la bibliothèque sous la puce du dossier (#3101). Le serveur
   * n'offre pas de facette `folder` sur cette route ; on se sert de ce qu'on
   * a déjà payé — les albums de la portée (`src`) portent leur `artist_id`.
   *
   * Ensemble VIDE tant que la portée n'a pas répondu (`idsPortee == null`) :
   * l'écran attend plutôt que de montrer tout, ce qui serait le défaut même.
   */
  const idsArtistesPortee = $derived<Set<number> | null>(
    !porteeActive || depot
      ? null
      : new Set(
          src.map((a) => (a as any).artist_id).filter((x: any): x is number => typeof x === 'number'),
        ),
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

  // Fréquences en VALEURS EXACTES (jamais un seuil « ≥ »).
  const RATES: { v: number; l: string }[] = [
    { v: 44100, l: '44,1' }, { v: 48000, l: '48' }, { v: 88200, l: '88,2' },
    { v: 96000, l: '96' }, { v: 176400, l: '176,4' }, { v: 192000, l: '192' },
    { v: 352800, l: '352,8' }, { v: 384000, l: '384' },
  ];
  // DSD, Hi-Res et CD sont des NOMS de format : ils s'écrivent pareil dans
  // toutes les langues. « Compressé » est un mot, et porte donc une clé —
  // d'où `cle`, qui distingue les deux sans que le rendu ait à deviner.
  const QUALITIES: { key: QualityTier | 'hires'; label: string; cle?: string }[] = [
    { key: 'dsd', label: 'DSD' }, { key: 'hires', label: 'Hi-Res' },
    { key: 'cd', label: 'CD' }, { key: 'lossy', label: 'Compressé', cle: 'v2.lib.qualityLossy' },
  ];

  let fQuality = $state<string | null>(null);
  let fRate = $state<number | null>(null);
  let fFormat = $state<string | null>(null);
  let fDepth = $state<number | null>(null);
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
  function ddToggle(id: string) { ddOpen = ddOpen === id ? null : id; }
  function ddClose() { ddOpen = null; }
  // Un menu ouvert au clic doit se refermer au clic AILLEURS, sinon il reste
  // planté par-dessus la grille. `.drop` couvre le chip ET son menu.
  function ddDehors(e: MouseEvent) {
    if (ddOpen && !(e.target as HTMLElement)?.closest('.drop')) ddClose();
  }
  function ddEchap(e: KeyboardEvent) { if (e.key === 'Escape') ddClose(); }

  let q = $state('');

  function tierMatches(a: Album, key: string): boolean {
    const t = getQualityTier(a);
    if (key === 'hires') return t === 'hires' || t === 'hires_max';
    return t === key;
  }
  function matches(a: Album): boolean {
    if (fQuality && !tierMatches(a, fQuality)) return false;
    if (fRate && (a.sample_rate ?? 0) !== fRate) return false; // exact
    // 🔴 L'annee EFFECTIVE, pas seulement l'annee choisie : balayer la frise
    // filtre la grille en direct. Voir `anneeEffective`.
    if (anneeEffective != null && albumYear(a) !== anneeEffective) return false;
    if (fFormat && (a.format?.trim().toUpperCase() ?? '') !== fFormat) return false;
    if (fDepth != null && (a.bit_depth ?? 0) !== fDepth) return false;
    // `?? false` : un serveur d'avant la v0.9.95, ou une bibliothèque pas
    // encore re-scannée, ne porte pas le champ. Il vaut « non », comme côté
    // serveur — jamais « on ne sait pas, laissons passer ».
    if (fCompilation != null && (a.is_compilation ?? false) !== fCompilation) return false;
    if (q && !fold(a.title).includes(fold(q)) && !fold(a.artist_name).includes(fold(q))) return false;
    return true;
  }

  const sorted = $derived.by(() => {
    const list = [...src];
    const byTitle = (a: Album, b: Album) => fold(a.title).localeCompare(fold(b.title));
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
  const matchCount = $derived(affiches.length);

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
    compilation: fCompilation,
  });
  const outilsFacettes = $derived<Outils>({
    qualiteDe: tierMatches, anneeDe: albumYear, plier: fold,
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
  type SortKey = 'title' | 'artist' | 'year' | 'added' | 'dr';
  // `l` porte une CLÉ, pas un libellé : le menu de tri restait en français
  // quelle que soit la langue (Bertrand, 06/09/2026).
  const SORTS: { k: SortKey; l: string }[] = [
    { k: 'title', l: 'v2.lib.sortTitle' }, { k: 'artist', l: 'v2.lib.sortArtist' },
    { k: 'year', l: 'v2.lib.sortYear' }, { k: 'added', l: 'v2.fav.sortRecent' },
    // Dynamic Range (#2144) — l'écran actuel l'a depuis longtemps, la nouvelle
    // interface ne l'avait jamais repris. Décroissant : on trie par DR pour
    // remonter ses disques les PLUS dynamiques, pas les plus écrasés.
    { k: 'dr', l: 'library.sortDynamicRange' },
  ];
  /**
   * 🔴 RETENU d'une visite à l'autre (Lulu, forum, 05/09/2026 : « figer le
   * choix de l'organisation de la bibliothèque »). Il repartait sur « Titre »
   * à chaque retour, quel que soit le choix précédent.
   */
  let sortKey = $state<SortKey>(lireChoix('lib.sort', SORTS.map((s2) => s2.k), 'title'));
  $effect(() => ecrireChoix('lib.sort', sortKey));
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

  // ── Affichage grille / liste ──────────────────────────────────────────
  type Display = 'grid' | 'list';
  let display = $state<Display>(lireChoix('lib.display', ['grid', 'list'] as const, 'grid'));
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
   *  parcours, pas un marqueur de filtre. Par defaut il se cale sur l'annee la
   *  mieux fournie : le point ou la collection est la plus dense est le repere
   *  le plus parlant a l'ouverture. */
  const busiestYear = $derived.by(() => {
    const { bars } = histogram;
    if (!bars.length) return null;
    return bars.reduce((best, b) => (b.n > best.n ? b : best), bars[0]).year;
  });
  const cursorYear = $derived(hoverYear ?? fYear ?? busiestYear);
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

  const present = $derived(railUtile ? new Set(affiches.map(firstLetter)) : new Set<string>());
  let gridEl: HTMLDivElement | undefined = $state();
  function jump(L: string) {
    gridEl?.querySelector<HTMLElement>(`[data-letter="${L}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function tech(a: Album): string {
    const t = getQualityTier(a);
    const rate = RATES.find((r) => r.v === a.sample_rate)?.l;
    const depth = a.bit_depth ? `${a.bit_depth}-bit` : '';
    // Le multiple vit dans `lib/utils` : le seuil « ≥ 5 MHz ⇒ DSD128 » annonçait
    // DSD128 pour les DSD256 ET les DSD512 — sept albums sur les 49 de la
    // bibliothèque de Bertrand, toujours sous-estimés.
    if (t === 'dsd') { const m = multipleDSD(a.sample_rate); return m ? `DSD · ${m}` : 'DSD'; }
    return [a.format?.toUpperCase(), rate && `${rate} kHz`, depth].filter(Boolean).join(' · ');
  }
  function badge(a: Album): string | null {
    const t = getQualityTier(a);
    if (t === 'dsd') return 'DSD';
    if (t === 'hires' || t === 'hires_max') return RATES.find((r) => r.v === a.sample_rate)?.l + 'k';
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
  // « Titres » est le seul a demander autre chose : il charge la liste des
  // pistes, une fois, a la premiere ouverture de l'onglet.
  type Tab = 'albums' | 'artists' | 'tracks' | 'genres' | 'years' | 'labels';
  // Mêmes clés que les onglets des Favoris : ce sont les mêmes familles, et
  // les traduire deux fois les ferait diverger.
  const TABS: { id: Tab; label: string; adv?: boolean }[] = [
    { id: 'albums', label: 'favorites.albums' },
    { id: 'artists', label: 'favorites.artists' },
    { id: 'tracks', label: 'favorites.tracks' },
    { id: 'genres', label: 'nav.genres', adv: true },
    { id: 'years', label: 'v2.lib.tabYears', adv: true },
    { id: 'labels', label: 'v2.lib.tabLabels', adv: true },
  ];
  // L'ONGLET aussi : revenir à la Bibliothèque après avoir consulté les Titres
  // pour retomber sur les Albums est le même agacement, d'un cran plus haut.
  let tab = $state<Tab>(lireChoix('lib.tab', TABS.map((t2) => t2.id), 'albums'));
  $effect(() => ecrireChoix('lib.tab', tab));

  /**
   * Les filtres portent sur les ALBUMS — qualité, fréquence, format,
   * profondeur, année. L'onglet Artistes n'en affiche aucun : les laisser
   * promettait un filtrage qui ne pouvait pas agir, et le compteur
   * « Tout (4255) » annonçait des albums au-dessus d'une grille d'artistes
   * (signalé par Bertrand, capture à l'appui, 02/09/2026).
   *
   * La RECHERCHE, elle, reste : elle filtre bien les artistes.
   */
  /**
   * Les filtres d'ALBUM ne s'affichent pas la ou ils n'agissent pas.
   *
   * `visibleTracks` ne filtre que sur la recherche : ni la qualite, ni le
   * format, ni la profondeur, ni l'annee ne touchent la liste des titres. Les
   * puces restaient pourtant affichees sur l'onglet Titres, et le compteur
   * « Tout (n) » y annoncait un nombre d'ALBUMS — 55 albums de 2026 au-dessus
   * de 46 877 titres. En passant d'Albums a Titres, l'ecran gardait donc
   * l'habillage du precedent : « la vue n'est pas bien rafraichie »
   * (Bertrand, 04/09/2026).
   *
   * Le tri etait deja masque ici par `showTools && tab !== 'tracks'` : la
   * regle existait, elle n'etait appliquee qu'a un controle sur cinq.
   */
  const showFilters = $derived(tab !== 'artists' && tab !== 'tracks');

  /** Tri et bascule grille/liste : outils de confort, pas de recherche. */
  /** Tri et bascule grille/liste : outils de confort, pas de recherche.
   *  Sans objet sur les artistes — le tri porte sur des champs d'album, et il
   *  n'y a qu'une seule façon d'afficher une grille d'artistes. */
  const showTools = $derived(atLeast(level, 'intermediate') && tab !== 'artists');

  /** A–Z / Années : une navigation dans les ALBUMS. La vue Artistes a son
   *  propre rail A–Z, et « Années » n'a aucun sens sur un artiste. */
  /** Frise, rail A–Z et choix de l'annee : une navigation dans les ALBUMS.
   *  Elle n'a pas plus de sens sur les titres que sur les artistes. */
  const showTimeline = $derived(atLeast(level, 'intermediate') && tab !== 'artists' && tab !== 'tracks');


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
      tab = d.onglet;
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

  // ── Onglet « Titres » : charge la liste des pistes, PAR PORTÉE ────────
  let tracks = $state<Track[]>([]);
  let tracksLoading = $state(false);
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
    if (tab !== 'tracks' || porteePistes === portee) return;
    porteePistes = portee;
    // 🔴 La liste repart VIDE : la portée vient de changer, ce qu'elle
    // contient ne correspond plus à ce que la puce annonce. Un écran vide qui
    // le dit vaut mieux qu'une bibliothèque entière qui ment.
    const jeton = ++jetonPistes;
    tracks = [];
    nbPistesServeur = null;
    tracksLoading = true;
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
      .catch(() => {
        if (jeton !== jetonPistes) return;
        tracks = [];
        // L'échec est DIT. Les trois `catch` de l'ancien client écrivaient en
        // console et laissaient la liste précédente à l'écran : c'est le second
        // mécanisme nommé par #3101.
        if (portee) notifications.error($tr('library.scopeLoadError').replace('{d}', nomDeDossier(portee)));
      })
      .finally(() => { if (jeton === jetonPistes) tracksLoading = false; });
  });
  const nbPistesAnnonce = $derived(
    tracksLoading && nbPistesServeur != null ? nbPistesServeur : tracks.length,
  );

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
  const visibleTracks = $derived.by(() => {
    const needle = fold(q);
    return tracks.filter((t) =>
      !needle || fold(t.title).includes(needle) || fold(t.artist_name).includes(needle)
    ).slice(0, 500);
  });
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
   * ⚠️ Déclaré AVANT les trois effets `pendingLibrary*`. Au montage, les
   * effets d'un composant tournent dans l'ordre de DÉCLARATION : placé après,
   * celui-ci refermerait la fiche que « Aller à l'album » vient d'ouvrir.
   */
  $effect(() => {
    $listResetNonce;
    opened = null;
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
  /**
   * L'ARTISTE demandé de l'extérieur — « Aller à l'artiste » du menu « … »
   * d'une piste (Bertrand, 07/09/2026).
   *
   * 🔴 DEUX gestes, pas un : basculer sur l'onglet Artistes ne suffit pas, il
   * faut encore OUVRIR la fiche. C'est la moitié qu'on oublie — poser un
   * magasin que personne ne lit est le défaut le plus fréquent de ce client.
   *
   * L'identifiant est consommé ICI puis passé à `ArtistesV2` en propriété :
   * deux consommateurs d'un même dépôt se le voleraient selon l'ordre de
   * montage, et l'onglet n'est monté que quand on l'a choisi.
   *
   * 🔴 `$pendingLibraryArtist`, PAS `get(pendingLibraryArtist)` — #3708.
   *
   * `get()` lit la valeur et se désabonne aussitôt : sous les runes il
   * n'inscrit AUCUNE dépendance, et l'effet ne tournait donc qu'au montage.
   * Mesuré le 09/09/2026 avec un composant sonde (un `$effect` lisant
   * `get(store)`, journal après `store.set(42)` : `[null]` — une seule
   * passe). Cela suffisait tant que la cible n'était posée que depuis une
   * AUTRE vue : `ShellV2` monte `{#if $activeView === 'library'}<LibraryV2/>`,
   * donc changer de vue remontait l'écran et rejouait l'effet. Depuis la fiche
   * d'album, on est DÉJÀ dans la Bibliothèque : rien n'était remonté, et poser
   * le magasin n'aurait rien fait à l'écran.
   *
   * L'effet écrit ce qu'il lit (`set(null)`), ce qui le rejoue une fois : la
   * seconde passe sort sur `id == null` sans rien écraser.
   */
  let artisteADemande = $state<number | null>(null);
  $effect(() => {
    const id = $pendingLibraryArtist;
    if (id == null) return;
    pendingLibraryArtist.set(null);
    artisteADemande = id;
    tab = 'artists';
    // La fiche d'album est un CALQUE par-dessus la grille : la laisser
    // ouverte cacherait l'onglet Artistes qu'on vient d'ouvrir.
    opened = null;
  });

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
    if (connu) { opened = connu; return; }
    api.getAlbum(id).then((a) => { if (a) opened = a; }).catch(() => {});
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
    tab = 'albums';
    // Même raison que chez le jumeau Artistes : la fiche est un CALQUE, et la
    // laisser ouverte cacherait la grille qu'on vient de filtrer.
    opened = null;
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
      opened = a;
      return;
    }
    const zid = $currentZoneId;
    if (zid == null || a.id == null) return;
    playAndSync(zid, { album_id: a.id }).catch(signalerEchecLecture);
  }

  function reset() { fQuality = null; fRate = null; q = ''; fYear = null; fFormat = null; fDepth = null; fCompilation = null; }

  // « Aléatoire » — lecture au hasard de toute la bibliothèque, en respectant
  // le filtre texte courant : si l'utilisateur a tapé « jazz », il attend un
  // aléatoire DANS ce qu'il regarde, pas dans les 20 000 titres.
  let shuffling = $state(false);
  async function shuffleAll() {
    const zid = $currentZoneId;
    if (zid == null) return;
    shuffling = true;
    try {
      if (depot) await aleatoireDistant(zid);
      // 🔴 #882 — la PASTILLE DE RÉPERTOIRE n'était pas transmise. Marco Polo
      // (fil 1614) : « la lecture aléatoire prend sa source dans toute la
      // bibliothèque ; si je passe à l'ancienne interface, elle fonctionne ».
      // La portée était pourtant là — `dossierPortee` filtre déjà l'affichage
      // — elle n'arrivait simplement pas jusqu'au serveur. La règle est
      // partagée avec l'écran actuel pour que les deux ne redivergent pas.
      else await api.shuffleAll(zid, optionsAleatoire({ dossier: dossierPortee, recherche: q }));
    }
    catch { /* le serveur signale déjà l'échec */ }
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
    <button class="v2-btn" onclick={shuffleAll} disabled={shuffling || $currentZoneId == null}
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
      {#each TABS as t (t.id)}
        {#if !t.adv || atLeast(level, 'intermediate')}
          <button class="tab" class:active={tab === t.id} onclick={() => (tab = t.id)}>{$tr(t.label as any)}</button>
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
      <!-- Un compteur qui compte CE QU'ON REGARDE. La recherche, elle, agit
           bien sur les titres : c'est le seul filtre qu'on garde ici. -->
      <span class="chip count plain">{$tr('v2.lib.trackCount' as any).replace('{count}', $formatNombre(nbPistesAnnonce))}</span>
    {/if}
    {#if showFilters}
      <button class="chip count" class:active={!fQuality && !fRate && !q && fYear == null && !fFormat && fDepth == null && fCompilation == null} onclick={reset}>Tout ({matchCount})</button>
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
      <div class="drop" class:open={ddOpen === 'quality'}>
        <button class="chip" class:active={fQuality !== null} aria-haspopup="menu" aria-expanded={ddOpen === 'quality'} onclick={() => ddToggle('quality')}>Qualité{#if fQuality}&nbsp;· {QUALITIES.find(x => x.key === fQuality)?.label}{/if}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="menu">
          <!-- Une valeur a ZERO reste VISIBLE mais inerte : la faire
               disparaitre ferait sauter le menu sous le doigt a chaque filtre
               pose. Le compte dit pourquoi elle ne repond pas. -->
          {#each QUALITIES as it (it.key)}
            {@const n = nQualite.get(it.key) ?? 0}
            <button class:on={fQuality === it.key} disabled={n === 0 && fQuality !== it.key}
              onclick={() => { fQuality = fQuality === it.key ? null : (it.key as string); ddClose(); }}>{it.cle ? $tr(it.cle as any) : it.label} <em>{n}</em></button>
          {/each}
        </div>
      </div>
      <div class="drop" class:open={ddOpen === 'rate'}>
        <button class="chip" class:active={fRate !== null} aria-haspopup="menu" aria-expanded={ddOpen === 'rate'} onclick={() => ddToggle('rate')}>Fréquence{#if fRate}&nbsp;· {RATES.find(r => r.v === fRate)?.l} kHz{/if}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="menu">
          {#each RATES as r (r.v)}
            {@const n = nFrequence.get(r.v) ?? 0}
            <button class:on={fRate === r.v} disabled={n === 0 && fRate !== r.v}
              onclick={() => { fRate = fRate === r.v ? null : r.v; ddClose(); }}>{r.l} kHz <em>{n}</em></button>
          {/each}
        </div>
      </div>
      <!-- FORMAT des le niveau Essentiel : « FLAC ou MP3 ? » est la question de
           base dans une discotheque mixte, et la maquette v3 de Levente le
           place aussi au premier niveau. -->
      {#if formats.length > 1}
        <div class="drop" class:open={ddOpen === 'format'}>
          <button class="chip" class:active={fFormat !== null} aria-haspopup="menu" aria-expanded={ddOpen === 'format'} onclick={() => ddToggle('format')}>Format{#if fFormat}&nbsp;· {fFormat}{/if}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
          <div class="menu">
            {#each formats as [f, n] (f)}
              <button class:on={fFormat === f} onclick={() => { fFormat = fFormat === f ? null : f; ddClose(); }}>{f} <em>{n}</em></button>
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
          onclick={() => (fCompilation = fCompilation == null ? true : null)}
        >{$tr('v2.lib.compilations' as any)} <em>{$formatNombre(nCompilations)}</em></button>
      {/if}
      {#if showExpert && depths.length > 1}
        <div class="drop" class:open={ddOpen === 'depth'}>
          <button class="chip" class:active={fDepth !== null} aria-haspopup="menu" aria-expanded={ddOpen === 'depth'} onclick={() => ddToggle('depth')}>Profondeur{#if fDepth}&nbsp;· {fDepth}-bit{/if}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
          <div class="menu">
            {#each depths as [d, n] (d)}
              <button class:on={fDepth === d} onclick={() => { fDepth = fDepth === d ? null : d; ddClose(); }}>{d}-bit <em>{n}</em></button>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
    <!-- Le champ partagé (`.v2-rech`), comme sur tous les autres écrans. Il
         faisait ici 320 × 42 avec sa loupe en flux, ailleurs 300 × 40 avec la
         loupe en absolu : deux dessins pour un seul geste. -->
    <div class="v2-rech">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
      <input placeholder={$tr('v2.lib.searchPlaceholder' as any)} bind:value={q} />
      {#if q}
        <button class="clr" onclick={() => (q = '')} aria-label={$tr('common.clear' as any)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      {/if}
    </div>

    {#if showTools && tab !== 'tracks'}
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
      <button class="viewtog" onclick={() => (display = display === 'grid' ? 'list' : 'grid')}
        aria-label={$tr((display === 'grid' ? 'v2.lib.viewList' : 'v2.lib.viewGrid') as any)}
        title={$tr((display === 'grid' ? 'v2.lib.viewList' : 'v2.lib.viewGrid') as any)}>
        {#if display === 'grid'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        {/if}
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
  {#if showTimeline || fYear != null}
    <div class="navmode">
      {#if showTimeline}
        <button class:on={navMode === 'alpha'} onclick={() => { navMode = 'alpha'; fYear = null; }}>A–Z</button>
        <button class:on={navMode === 'years'} onclick={() => (navMode = 'years')}>{$tr('v2.lib.navYears' as any)}</button>
      {/if}
      {#if fYear != null}
        <button class="yearpill" onclick={() => (fYear = null)}>
          {fYear} · {yearCount} album{yearCount > 1 ? 's' : ''}
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

  <div class="body">
    {#if tab === 'artists'}
      <!-- Les artistes ont leur PROPRE source, `/library/artists`, et non une
           déduction depuis les albums chargés. Ils ne passent donc pas par les
           gardes « bibliothèque vide » ci-dessous : une bibliothèque dont les
           albums ne sont pas encore arrivés a déjà ses artistes. -->
      <ArtistesV2 {q} idsPortee={idsArtistesPortee} nomPortee={porteeActive ? nomPortee : null}
        ouvrirId={artisteADemande} onOuvert={() => (artisteADemande = null)} />
    {:else if enCharge && sorted.length === 0}
      <div class="state">{$tr('v2.lib.loading' as any)}</div>
    {:else if sorted.length === 0}
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
        <div class="rail">
          {#each ALPHA as L (L)}
            <button class="rl" class:hot={present.has(L)} disabled={!present.has(L)} onclick={() => jump(L)}>{L}</button>
          {/each}
        </div>
      {/if}
      {#if tab === 'tracks'}
        <div class="tracklist">
          {#if tracksLoading}
            <div class="state">{$tr('v2.lib.loadingTracks' as any)}</div>
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
              ouvertureAlbum={(p) => {
                const alb = albumDeLaPiste(p);
                return alb ? () => (opened = alb) : null;
              }}
            />
            {#if tracks.length > visibleTracks.length}
              <div class="state">{visibleTracks.length} titres affichés sur {tracks.length} — affinez la recherche.</div>
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
              <div class="grid facetgrid" class:expert={showExpert}>
                {#each g.albums as a (a.id)}
                  <div class="card">
                    <div class="cover">
                      <PochetteActions
                        favori={depot || a.id == null ? null : { albumId: a.id }}
                        etiquettes={depot || a.id == null ? null : { itemType: 'album', itemId: a.id }}
                        onEditer={depot ? null : () => (enEdition = a)}
                        onLire={() => lireAlbum(a)}
                        onOuvrir={() => (opened = a)}
                        nom={a.title}
                      >
                        <AlbumArt coverPath={a.cover_path} albumId={depot ? null : a.id} size={0} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} />
                      </PochetteActions>
                      {#if showBadges}{#if badge(a)}<span class="bdg">{badge(a)}</span>{/if}{/if}
                    </div>
                    <button class="meta" onclick={() => opened = a}>
                      <div class="ct" title={a.title}>{a.title}</div>
                      <div class="ca" title={a.artist_name ?? ''}>{a.artist_name ?? ''}</div>
                      <span class="cbot"><QualiteAlbum objet={a} /><PastilleCompilation compilation={a.is_compilation} compact /></span>
                    </button>
                  </div>
                {/each}
              </div>
            </section>
          {/each}
        </div>
        {/if}

      {:else if display === 'list'}
        {#if !affiches.length}
          <div class="state">{$tr('library.noAlbumMatchesFilters' as any)}</div>
        {:else}
        <div class="rows" style="--lcols:{colonnesListe}" bind:this={gridEl}>
          {#each affiches as a (a.id)}
            <button class="lrow" data-letter={firstLetter(a)} onclick={() => opened = a}>
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
          {/each}
        </div>
        {/if}

      {:else}
        {#if !affiches.length}
          <div class="state">{$tr('library.noAlbumMatchesFilters' as any)}</div>
        {:else}
        <div class="grid" class:expert={showExpert} bind:this={gridEl}>
          {#each affiches as a (a.id)}
            <div class="card" data-letter={firstLetter(a)}>
              <div class="cover">
                <PochetteActions
                  favori={depot || a.id == null ? null : { albumId: a.id }}
                  etiquettes={depot || a.id == null ? null : { itemType: 'album', itemId: a.id }}
                  onEditer={depot ? null : () => (enEdition = a)}
                  onLire={() => lireAlbum(a)}
                  onOuvrir={() => (opened = a)}
                  nom={a.title}
                >
                  <AlbumArt coverPath={a.cover_path} albumId={depot ? null : a.id} size={0} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} />
                </PochetteActions>
                {#if showBadges}{#key badge(a)}{#if badge(a)}<span class="bdg">{badge(a)}</span>{/if}{/key}{/if}
              </div>
              <button class="meta" onclick={() => opened = a}>
                <div class="ct" title={a.title}>{a.title}</div>
                <div class="ca" title={a.artist_name ?? ''}>{a.artist_name ?? ''}</div>
                <span class="cbot"><QualiteAlbum objet={a} /><PastilleCompilation compilation={a.is_compilation} compact /></span>
                {#if showTech}<div class="cq">{tech(a)}</div>{/if}
              </button>
            </div>
          {/each}
        </div>
        {/if}
      {/if}
    {/if}
  </div>

  {#if opened}
    <AlbumDetailV2 album={opened} {depot} onClose={() => (opened = null)} />
  {/if}

  {#if enEdition}
    <AlbumEditModal
      album={enEdition}
      onClose={() => (enEdition = null)}
      onSaved={(maj) => {
        // Report dans le MAGASIN, d'où la grille tire ses albums : sans lui,
        // le titre corrigé ne réapparaîtrait qu'au prochain chargement de
        // l'écran. Édition impossible sur un dépôt distant, donc `albums` est
        // bien la source ici.
        albums.update((liste) => liste.map((x) => (x.id === maj.id ? { ...x, ...maj } : x)));
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
  .state{flex:1; display:grid; place-items:center; color:var(--v2-txt3); font-size:15px}
  /* Rail A-Z : c'est un REPERE, il doit se lire d'un coup d'oeil et se viser
     au doigt. Auparavant 11 px colles a 1 px d'intervalle contre la grille —
     illisible et impossible a cliquer juste. */
  .rail{display:flex; flex-direction:column; justify-content:center; gap:2px;
    padding:10px 12px 10px 4px; margin-right:6px; position:sticky; top:0;
    border-right:1px solid var(--v2-line)}
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
  .facet .fcoeur{flex:none; display:flex; align-items:center; justify-content:center;
    width:26px; height:26px; padding:0; border:0; border-radius:8px; cursor:pointer;
    background:transparent; color:var(--v2-txt3); opacity:.45;
    transition:opacity .12s ease, color .12s ease, background .12s ease}
  .facet h2:hover .fcoeur{opacity:1}
  .facet .fcoeur:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .facet .fcoeur:focus-visible{opacity:1; outline:2px solid var(--v2-acc1); outline-offset:2px}
  .facet .fcoeur.on{opacity:1; color:var(--v2-acc1)}
  .facetgrid{overflow:visible; padding:0}

  /* Affichage liste : même données, densité maximale. */
  .rows{flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:1px; padding:4px 30px 40px}
  .rows::-webkit-scrollbar{width:9px}.rows::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .lrow{display:grid; grid-template-columns:var(--lcols, 44px minmax(0,2fr) minmax(0,1.4fr) 52px 46px 150px); align-items:center;
    gap:14px; width:100%; padding:6px 10px; border:0; border-radius:9px; background:transparent;
    color:var(--v2-txt2); cursor:pointer; text-align:left; transition:.12s}
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

  .grid{flex:1; overflow-y:auto; display:grid; grid-template-columns:repeat(auto-fill,minmax(148px,1fr));
    gap:22px 18px; align-content:start; padding:8px 30px 40px}
  .grid::-webkit-scrollbar{width:9px}.grid::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
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
</style>
