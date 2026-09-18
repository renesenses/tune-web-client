<script lang="ts">
  /**
   * Collections — nouveau client.
   *
   * Écran ABSENT du client v2 jusqu'ici : la barre latérale n'y menait pas, et
   * aucun composant ne les rendait.
   *
   * DEUX ONGLETS, comme le client actuel (`CollectionsView`) : « Smart
   * Collections » puis « Collections ». J'avais d'abord mêlé les deux sortes
   * dans une liste unique, en jugeant que la distinction était de mécanique et
   * non d'usage ; Bertrand a tranché l'inverse le 02/09/2026, et l'ordre comme
   * les libellés sont ceux de l'écran actuel.
   *
   * ## Deux sortes, deux origines
   *
   * - NORMALE : une liste d'albums choisis à la main (`album_ids`). Stockée
   *   côté serveur dans un blob JSON de `settings`, pas dans une table.
   * - SMART : une RÈGLE, évaluée à la demande. Pas de table d'appartenance ;
   *   son contenu peut changer entre deux affichages, par construction.
   *
   * ## Les pochettes
   *
   * Chaque collection porte une mosaïque, comme les playlists — même règle,
   * même composant : toujours quatre cases, pour que l'assemblage se voie.
   *
   * Le serveur rend désormais le champ `covers` avec la liste (PR serveur
   * #3151). Tant qu'il n'est pas déployé, il est ABSENT, et on retombe sur les
   * albums de la collection — une requête par collection, exactement ce que la
   * PR serveur supprime. Ce repli disparaîtra une fois la version publiée ;
   * jusque-là, l'écran fonctionne contre les deux.
   */
  import { onMount } from 'svelte';
  import { setShortcutTarget, clearShortcutTarget } from '../../lib/stores/shortcuts';
  import * as api from '../../lib/api';
  import { lireListe, lireListeAleatoire } from '../../lib/lectureEnMasse';
  import { t } from '../../lib/i18n';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import { dialogs } from '../../lib/stores/dialogs';
  import { quatreDistinctes } from '../../lib/mosaique';
  import MosaiquePochettes from './MosaiquePochettes.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import QualiteAlbum from './QualiteAlbum.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';
  import { detailOuvert, ouvrirDetail, fermerDetailEnReculant } from '../../lib/historiqueCoquille';
  import { cleDetailAlbum } from '../../lib/cleDetailAlbum';
  import RenommerModale from './RenommerModale.svelte';
  import { lireChoix, ecrireChoix } from '../../lib/preferencesEcran';
  import { trierAlbums } from '../../lib/trierAlbums';
  import { fold } from '../../lib/utils';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import { preferences } from '../../lib/stores/preferences';

  type Sorte = 'normale' | 'smart';
  interface Entree {
    sorte: Sorte;
    id: number;
    nom: string;
    description?: string | null;
    albums: number | null;
    covers: string[];
    /** Date de création, pour le tri par date. Les DEUX familles la portent. */
    creee: string | null;
  }

  type Onglet = 'smart' | 'manuelle';
  let onglet = $state<Onglet>('smart');
  let entrees = $state<Entree[]>([]);
  /** Ce que l'onglet courant montre. Le chargement, lui, reste COMMUN : les
   *  deux listes partent ensemble, sinon changer d'onglet relancerait tout. */
  /**
   * Rangees par ORDRE ALPHABETIQUE (Lulu, forum, 05/09/2026). Elles arrivaient
   * dans l'ordre du serveur — celui de creation — ce qui rend une liste
   * imprevisible des qu'elle depasse une poignee d'entrees.
   *
   * `sensitivity: 'base'` : « Ete » et « ete » se suivent, et les accents ne
   * rejettent pas un nom en fin de liste. `numeric` pour que « Best 2 » vienne
   * avant « Best 10 ».
   */
  /**
   * Tri au CHOIX. Bertrand, 05/09/2026 : « toutes les collections peuvent être
   * filtrées selon différents critères (dates, alpha croissant / décroissant) ».
   *
   * L'ordre alphabétique croissant reste le défaut — c'est celui que Lulu
   * avait demandé, et le seul qui rende une liste prévisible quand on la
   * découvre. Le choix est mémorisé par écran : y revenir ne le rejoue pas.
   *
   * Une collection sans date se range TOUJOURS en fin de liste, dans les deux
   * sens : la mettre en tête d'un tri « plus ancien » ferait passer une
   * absence de donnée pour une ancienneté.
   */
  const TRIS = ['alpha', 'alphaInverse', 'recent', 'ancien'] as const;
  type Tri = (typeof TRIS)[number];
  let tri = $state<Tri>(lireChoix<Tri>('v2.collections.tri', TRIS, 'alpha'));
  $effect(() => { ecrireChoix('v2.collections.tri', tri); });

  function parNom(a: Entree, b: Entree): number {
    return a.nom.localeCompare(b.nom, undefined, { sensitivity: 'base', numeric: true });
  }
  function parDate(a: Entree, b: Entree, recentDabord: boolean): number {
    const ta = a.creee ? Date.parse(a.creee) : NaN;
    const tb = b.creee ? Date.parse(b.creee) : NaN;
    const va = Number.isNaN(ta), vb = Number.isNaN(tb);
    if (va && vb) return parNom(a, b);
    if (va) return 1;
    if (vb) return -1;
    return recentDabord ? tb - ta : ta - tb;
  }

  const visibles = $derived(
    entrees
      .filter((e) => (onglet === 'smart' ? e.sorte === 'smart' : e.sorte === 'normale'))
      .slice()
      .sort((a, b) =>
        tri === 'alpha' ? parNom(a, b)
        : tri === 'alphaInverse' ? -parNom(a, b)
        : parDate(a, b, tri === 'recent'),
      ),
  );

  /* ---------------- Rail A-Z de la LISTE des collections ------------------- */
  /**
   * 🔴 #1153 — « les barres de défilement alphabétique DES RÉPERTOIRES dans
   * Collections ne fonctionnent pas, alors qu'elles sont opérationnelles dans
   * la V0 » (Jean-Luc Cassé, fil 1784, 14/09/2026).
   *
   * Les « répertoires », ce sont les dossiers eux-mêmes. La V0
   * (`CollectionsView.svelte`) porte DEUX rails : un sur les albums d'une
   * collection ouverte, et un sur la liste des collections —
   * `collectionLetters` / `scrollToCollectionLetter`. Le nouvel écran n'avait
   * repris que le premier. Ici, ce n'était donc pas un rail qui ne répondait
   * pas : il n'existait pas.
   *
   * Même arbitrage que partout ailleurs : le rail ne paraît que si la liste
   * est rangée ALPHABÉTIQUEMENT. Rangée par date, une lettre ne désigne
   * aucune position.
   */
  const railListe = $derived(tri === 'alpha' || tri === 'alphaInverse');
  const lettresListe = $derived(
    railListe ? new Set(visibles.map((e) => initiale(e.nom))) : new Set<string>(),
  );
  let grilleListeEl: HTMLDivElement | undefined = $state();
  function sauterAListe(L: string) {
    grilleListeEl?.querySelector<HTMLElement>(`[data-lettre="${L}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Le total d'ALBUMS de l'onglet courant (Lulu : « rajouter le nombre total
   * d'albums de cet onglet »). `null` tant qu'une collection n'a pas rendu son
   * compte : annoncer une somme partielle serait pire que ne rien annoncer.
   */
  const totalAlbums = $derived(
    visibles.some((e) => e.albums == null)
      ? null
      : visibles.reduce((n, e) => n + (e.albums ?? 0), 0),
  );

  /**
   * La teinte d'une collection, DERIVEE de son nom.
   *
   * Lulu : « encadrer de couleurs differentes chaque dossier pour une meilleure
   * lisibilite ». Le serveur porte bien un champ `color`, mais il est vide sur
   * les collections existantes — mesure sur le .18. On en derive donc une,
   * stable : la meme collection garde sa couleur d'une session a l'autre et
   * d'un appareil a l'autre, sans rien stocker ni demander a personne.
   *
   * Saturation et clarte fixes pour que deux teintes voisines restent
   * distinguables sans devenir criardes.
   */
  function teinte(nom: string): string {
    let h = 0;
    for (let i = 0; i < nom.length; i++) h = (h * 31 + nom.charCodeAt(i)) % 360;
    return `hsl(${h} 62% 58%)`;
  }
  let chargement = $state(true);
  let ouverte = $state<Entree | null>(null);
  /** Collection en cours de renommage — le bouton haut-droit de la pochette. */
  let enEdition = $state<Entree | null>(null);

  /**
   * SUPPRIMER une collection — #983.
   *
   * Fabien, fil « v0.9.147 : v1 divers bugs », point 4 : « Je ne vois aucun
   * bouton "Supprimer" une collection ? » Il ne le voyait pas : il n'existait
   * pas. `grep -in "supprimer\|delete" CollectionsV2.svelte` rendait ZÉRO,
   * alors que l'ancienne interface porte une corbeille par carte depuis
   * toujours (`CollectionsView.handleDelete`).
   *
   * ## Deux sortes, deux routes
   *
   * Leurs identifiants se RECOUVRENT — l'id 1 est à la fois la collection
   * « favorites » et l'intelligente « Audiophile » sur le serveur de Bertrand.
   * C'est le même piège que les étiquettes de la carte, et il est déjà
   * commenté dix lignes plus bas : appeler la mauvaise route supprimerait une
   * autre collection que celle qu'on vise.
   *
   * ## Elle est DERRIÈRE le menu, et derrière une confirmation
   *
   * Pas d'icône de corbeille sur la vignette : c'est la règle que `ZonesV2`
   * pose déjà pour ses cartes — « une carte qu'on clique pour activer ne doit
   * pas porter une corbeille à portée de pouce ». Le menu d'actions de
   * `PochetteActions` sait teinter une entrée `danger`, et il est fait pour ça.
   *
   * 🔴 `dialogs.confirm`, jamais `window.confirm` : les dialogues natifs ne
   * s'affichent pas dans les vues web embarquées. L'ancienne interface, elle,
   * supprimait SANS rien demander pour une collection manuelle
   * (`CollectionsView.handleDelete`), et AVEC une confirmation `danger` pour
   * une intelligente (`SmartCollectionsView.deleteCollection`). On reprend la
   * seconde pour les deux : c'est la seule des deux qui protège.
   *
   * ## Elle est aussi dans l'ÉDITEUR — #1143
   *
   * FabienM l'a cherchée deux fois, sur deux versions, dans « Modifier la
   * collection », avant de regarder la vignette. Les deux éditeurs reçoivent
   * donc cette même fonction en rappel ; ils ne rappellent NI la route NI la
   * confirmation — une seconde copie divergerait sur la sorte, donc sur la
   * route, donc sur ce qui disparaît.
   */
  async function supprimerCollection(e: Entree) {
    const question = $t('v2.col.deleteAsk' as any).replace('{nom}', e.nom ?? '');
    if (!(await dialogs.confirm(question, { danger: true }))) return;
    try {
      if (e.sorte === 'smart') await api.deleteSmartCollection(e.id);
      else await api.deleteCollection(e.id);
      // Retirée de la liste sur la PAIRE (sorte, id), pour la même raison que
      // la clé de boucle : l'id seul viserait les deux sortes.
      entrees = entrees.filter((x) => !(x.sorte === e.sorte && x.id === e.id));
      if (ouverte && ouverte.sorte === e.sorte && ouverte.id === e.id) ouverte = null;
      // Appelée DEPUIS un éditeur, il faut le refermer : laisser ouverte la
      // fiche d'une collection qui n'existe plus proposerait de l'enregistrer.
      if (enEdition && enEdition.sorte === e.sorte && enEdition.id === e.id) enEdition = null;
      if (e.sorte === 'smart' && editeurSmart?.id === e.id) editeurSmart = null;
      notifications.success($t('collections.deleted' as any));
    } catch (err) {
      console.error('Delete collection error:', err);
      notifications.error($t('collections.deleteError' as any));
    }
  }

  /**
   * Ouvrir l'édition d'une collection, quelle que soit sa sorte.
   *
   * Bertrand, 09/09/2026 : « Manque le bouton d'édition d'une collection » —
   * copie d'écran de la fiche d'une intelligente. L'édition n'existait que sur
   * la VIGNETTE de la liste (`PochetteActions`) : une fois la collection
   * ouverte, il n'y avait plus aucun chemin vers ses règles, et il fallait
   * revenir en arrière pour le retrouver.
   *
   * Les deux sortes n'ouvrent pas la même chose — l'intelligente ouvre son
   * éditeur de règles, la manuelle son renommage — et c'est précisément
   * pourquoi la bifurcation vit ICI, appelée par la liste ET par la fiche, au
   * lieu d'être recopiée aux deux endroits.
   */
  function editerCollection(e: Entree) {
    if (e.sorte === 'smart') editeurSmart = { id: e.id };
    else enEdition = e;
  }

  /**
   * Lecture d'une collection entière.
   *
   * Il n'existe pas de route « lire la collection » : on lit ses albums, puis
   * on enchaîne le premier. C'est un aller-retour de plus, mais il n'y a pas
   * moyen de faire autrement sans une route serveur, et une pochette sans
   * bouton de lecture serait la seule de l'écran à ne pas en avoir.
   */
  /**
   * « Tout lire » et « Aleatoire » d'une collection ouverte — #1947.
   *
   * `lireCollection`, ci-dessous, ne joue que le PREMIER album : c'est le geste
   * de la vignette, pas celui de la fiche. Le client actuel (`CollectionsView`)
   * porte les deux boutons depuis longtemps ; la fiche du nouveau n'en avait
   * aucun.
   *
   * `api.shuffleAll` ne connait pas les collections : on melange donc la liste
   * cote client. Les pistes viennent de `getAlbumTracksBatch`, a concurrence
   * bornee et avec un reessai par album — un `Promise.all` nu tronquait la file
   * en silence (Sevy, 19 pistes sur 325).
   */
  let masseEnCours = $state(false);
  async function pistesDeLaCollection(): Promise<any[]> {
    const ids = albumsVus.map((a) => a?.id).filter((x): x is number => x != null);
    // Les albums de SERVICE d'une collection intelligente (« Source = Qobuz »,
    // #4299) n'ont pas d'identifiant de bibliothèque : leurs pistes viennent du
    // service. Sans cela « Tout lire » les laissait tomber en silence.
    const deService = albumsVus.filter(estAlbumDeService);
    const [locales, services] = await Promise.all([
      ids.length ? api.getAlbumTracksBatch(ids) : Promise.resolve({ tracks: [], failedAlbums: 0 }),
      Promise.allSettled(deService.map((a) => api.getStreamingAlbumTracks(a.source, String(a.source_id)))),
    ]);
    if (locales.failedAlbums || services.some((r) => r.status === 'rejected')) {
      notifications.error($t('collections.playError' as any));
    }
    return [
      ...locales.tracks,
      ...services.flatMap((r) => (r.status === 'fulfilled' ? r.value ?? [] : [])),
    ];
  }

  /** Un album rendu par un SERVICE : pas d'id, une paire service + `source_id`. */
  function estAlbumDeService(a: any): boolean {
    return a?.id == null && !!a?.source && a?.source_id != null;
  }
  /** La clé de boucle d'un album — l'id ne suffit plus : plusieurs albums de
   *  service ont `id: null`, et deux clés égales font planter la grille. */
  function cleAlbum(a: any): string {
    return a?.id != null ? `album:${a.id}` : `${a?.source}:${a?.source_id}`;
  }
  async function lireCollectionEntiere(aleatoire: boolean) {
    const zid = $currentZoneId;
    if (zid == null) {
      notifications.error($t('v2.col.noZone' as any));
      return;
    }
    masseEnCours = true;
    try {
      const pistes = await pistesDeLaCollection();
      const gestes = {
        lire: (c: any) => playAndSync(zid, c),
        enfiler: (c: any) => api.addToQueue(zid, c),
      };
      const n = aleatoire
        ? await lireListeAleatoire(pistes as any, gestes)
        : await lireListe(pistes as any, gestes);
      if (!n) notifications.error($t('collections.noTracks' as any));
      else notifications.success($t('collections.playingAll' as any).replace('{count}', String(n)));
    } catch (err: any) {
      notifications.error(err?.message ?? $t('common.error' as any));
    }
    masseEnCours = false;
  }
  async function lireCollection(e: Entree) {
    const zid = $currentZoneId;
    if (zid == null) {
      notifications.error($t('v2.col.noZone' as any));
      return;
    }
    try {
      const liste = ((e.sorte === 'smart'
        ? await api.getSmartCollectionAlbums(e.id)
        : await api.getCollectionAlbums(e.id)) as any[]) ?? [];
      const premier = liste.find((a) => a?.id != null || estAlbumDeService(a));
      if (!premier) {
        notifications.error($t('v2.col.emptyCollection' as any));
        return;
      }
      await playAndSync(zid, corpsAlbum(premier));
    } catch (err: any) {
      notifications.error(err?.message ?? $t('common.error' as any));
    }
  }
  let albums = $state<any[]>([]);
  let albumsChargement = $state(false);

  /**
   * Tri des albums d'une collection MANUELLE ouverte. Bertrand, 16/09/2026 :
   * « pouvoir les trier par Titre de l'album, Artistes et les 3 dates en
   * ascendant ou descendant » — Année · Sortie · Ajout.
   *
   * Le tri est fait par le SERVEUR (`?sort=&order=`) : c'est lui qui replie
   * accents et casse, range « CD2 » avant « CD10 », attache la date d'ajout
   * et garde les valeurs manquantes en dernier dans les deux sens. Le trier
   * ici en JavaScript donnerait un autre ordre que celui des autres clients.
   *
   * Les collections INTELLIGENTES n'ont pas ce sélecteur : leur ordre fait
   * partie de leurs règles (`sort_by` / `sort_order`), et il s'édite là.
   *
   * Le choix est mémorisé par écran, comme celui de la liste.
   */
  const TRIS_ALBUMS = ['artist', 'title', 'year', 'release_date', 'added_at'] as const;
  type TriAlbums = (typeof TRIS_ALBUMS)[number];
  const SENS = ['asc', 'desc'] as const;
  type Sens = (typeof SENS)[number];
  let triAlbums = $state<TriAlbums>(lireChoix<TriAlbums>('v2.collection.albums.tri', TRIS_ALBUMS, 'artist'));
  let sensAlbums = $state<Sens>(lireChoix<Sens>('v2.collection.albums.sens', SENS, 'asc'));
  $effect(() => { ecrireChoix('v2.collection.albums.tri', triAlbums); });
  $effect(() => { ecrireChoix('v2.collection.albums.sens', sensAlbums); });
  const LIBELLES_TRI: Record<TriAlbums, string> = {
    artist: 'v2.lib.sortArtist', title: 'v2.lib.sortTitle', year: 'v2.lib.sortYear',
    release_date: 'library.sortReleaseDate', added_at: 'library.sortAddedDate',
  };
  async function chargerAlbums(e: Entree) {
    albumsChargement = true;
    try {
      albums =
        ((e.sorte === 'smart'
          ? await api.getSmartCollectionAlbums(e.id)
          : await api.getCollectionAlbums(e.id, triAlbums, sensAlbums)) as any[]) ?? [];
    } catch {
      albums = [];
    }
    albumsChargement = false;
  }
  /**
   * TRI d'une collection INTELLIGENTE — Bertrand, 17/09/2026 : « toujours pas
   * de tri possible dans les playlists et collections » (capture : « 2026 »,
   * intelligente). L'en-tête écartait les intelligentes, leur ordre étant dans
   * leurs règles ; l'utilisateur veut pouvoir le changer à l'écran.
   *
   * Côté CLIENT, sur la liste reçue : `/smart-collections/{id}/albums` ne prend
   * pas `?sort=`, et ses albums ne portent que titre, artiste et ANNÉE — ni
   * date de sortie, ni date d'ajout. On ne propose donc que ces trois clés.
   * `regles` = l'ordre défini par les règles, le défaut.
   */
  const TRIS_SMART = ['regles', 'artist', 'title', 'year'] as const;
  type TriSmart = (typeof TRIS_SMART)[number];
  let triSmart = $state<TriSmart>(lireChoix<TriSmart>('v2.collection.smart.tri', TRIS_SMART, 'regles'));
  let sensSmart = $state<Sens>(lireChoix<Sens>('v2.collection.smart.sens', SENS, 'asc'));
  $effect(() => { ecrireChoix('v2.collection.smart.tri', triSmart); });
  $effect(() => { ecrireChoix('v2.collection.smart.sens', sensSmart); });
  const LIBELLES_SMART: Record<TriSmart, string> = {
    regles: 'v2.col.sortRules', artist: 'v2.lib.sortArtist', title: 'v2.lib.sortTitle', year: 'v2.lib.sortYear',
  };
  /** Ce que la grille AFFICHE — et ce que « Tout lire » enchaîne. */
  const albumsVus = $derived(
    ouverte?.sorte === 'smart'
      ? trierAlbums(albums, triSmart === 'regles' ? 'pertinence' : triSmart, sensSmart)
      : albums,
  );

  function changerTri(tri: TriAlbums, sens: Sens) {
    triAlbums = tri;
    sensAlbums = sens;
    if (ouverte && ouverte.sorte !== 'smart') chargerAlbums(ouverte);
  }

  /* ---------------- Ascenseur alphabetique d'une collection ouverte -------- */
  /**
   * Lulu, forum, 05/09/2026 : « il manque dans chaque dossier cree l'ascenseur
   * alphabetique a gauche de la fenetre ». La Bibliotheque en a un ; une
   * collection ouverte, non — alors que c'est exactement la meme grille
   * d'albums, et qu'une collection de deux cents disques se parcourt aussi mal
   * sans repere.
   *
   * Meme regle que la Bibliotheque : les lettres ABSENTES sont grisees et
   * inertes. Un rail qui propose des lettres ne menant nulle part est pire
   * qu'un rail absent.
   */
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');

  /**
   * \ud83d\udd34 #1153 \u2014 le rail suit le TRI, il ne suppose plus le titre.
   *
   * Jean-Luc Cass\u00e9, fil 1784, 14/09/2026 : \u00ab les barres de d\u00e9filement
   * alphab\u00e9tique des r\u00e9pertoires dans Collections ne fonctionnent pas, alors
   * qu'elles sont op\u00e9rationnelles dans la V0 \u00bb.
   *
   * Il lisait `a.title` en toutes circonstances, alors que la grille est
   * rang\u00e9e PAR ARTISTE \u2014 c'est le tri par d\u00e9faut, et c'est le SERVEUR qui le
   * fait (`?sort=artist`). Deux cons\u00e9quences, mesur\u00e9es le 18/09/2026 sur une
   * collection ABBA/\u00ab Zoo \u00bb, \u00c9dith Piaf/\u00ab Mothers \u00bb, Frank Zappa/
   * \u00ab Apostrophe \u00bb : le rail proposait A, M, Z \u2014 les initiales des titres \u2014
   * quand la grille se lit A, E, F ; et cliquer une lettre propos\u00e9e
   * atterrissait au milieu de la liste, sans rapport avec l'ordre affich\u00e9.
   * Un rail qui vise autre chose que ce qu'on voit passe pour un rail mort.
   *
   * C'est exactement le d\u00e9faut que Lulu avait signal\u00e9 sur la Biblioth\u00e8que
   * (forum 1671, 05-06/09/2026) et qui y a \u00e9t\u00e9 corrig\u00e9 : `LibraryV2.firstLetter`
   * suit `sortKey`, et `railUtile` retire le rail sur un tri chronologique.
   * Collections portait encore la copie d'AVANT ce correctif \u2014 les deux
   * \u00e9crans avaient bien deux rails diff\u00e9rents. On reprend le sien.
   */
  const cleRail = $derived<'artist' | 'title' | null>(
    ouverte?.sorte === 'smart'
      ? (triSmart === 'artist' || triSmart === 'title' ? triSmart : null)
      : (triAlbums === 'artist' || triAlbums === 'title' ? triAlbums : null),
  );
  /** L'initiale de rail d'un texte : accents repli\u00e9s, tout le reste sous \u00ab # \u00bb. */
  /**
   * 🔴 #1222 — SORTIR un album d'un dossier, l'autre moitié du geste de Lulu.
   *
   * `api.removeAlbumFromCollection` existe et son SEUL appelant vivait dans
   * l'ancienne interface (`CollectionsView.svelte:210`).
   *
   * ⚠️ Réservé aux collections MANUELLES : le contenu d'une intelligente vient
   * de ses règles, on ne l'en retire pas à la main — c'est la règle qu'il faut
   * changer, et elle s'édite ailleurs. Proposer le geste là serait promettre
   * un effet que le prochain recalcul annulerait.
   */
  async function retirerDeLaCollection(a: any) {
    const e = ouverte;
    if (!e || e.sorte === 'smart' || a?.id == null) return;
    try {
      await api.removeAlbumFromCollection(e.id, a.id);
      // Retirer sur place plutôt que tout relire : la grille est déjà triée
      // par le serveur, et une relecture la ferait sauter sous le pointeur.
      albums = albums.filter((x) => x?.id !== a.id);
      notifications.success($t('collections.albumRemoved' as any));
    } catch {
      notifications.error($t('v2.col.removeAlbumFailed' as any));
    }
  }

  function entreesAlbum(a: any) {
    if (!ouverte || ouverte.sorte === 'smart' || a?.id == null) return [];
    return [{
      libelle: $t('v2.col.removeAlbum' as any),
      danger: true,
      faire: () => void retirerDeLaCollection(a),
    }];
  }

  function initiale(texte: string | null | undefined): string {
    const c = fold(texte).trim().charAt(0).toUpperCase();
    return c >= 'A' && c <= 'Z' ? c : '#';
  }
  function lettreDe(a: any): string {
    return initiale(cleRail === 'artist' ? a?.artist_name : a?.title);
  }
  /**
   * \u26a0\ufe0f Et sur un tri CHRONOLOGIQUE (ann\u00e9e, sortie, ajout \u2014 ou l'ordre des
   * r\u00e8gles d'une collection intelligente), on le retire. Aucune lettre ne peut
   * y correspondre \u00e0 une position : les initiales sont dispers\u00e9es dans toute
   * la liste. Promettre un saut qui atterrit au hasard est pire que ne rien
   * promettre. M\u00eame arbitrage que la Biblioth\u00e8que.
   */
  const lettresPresentes = $derived(
    cleRail ? new Set(albumsVus.map(lettreDe)) : new Set<string>(),
  );
  let grilleEl: HTMLDivElement | undefined = $state();
  function sauterA(L: string) {
    grilleEl?.querySelector<HTMLElement>(`[data-lettre="${L}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }


  /**
   * Créer une collection — le geste manquait (Bertrand, 04/09/2026).
   *
   * `api.createCollection` existe depuis toujours et n'avait qu'un appelant :
   * `CollectionsView.svelte`, dans le client actuel. L'écran v2 savait
   * afficher, ouvrir, lire, modifier et étiqueter une collection — pas en
   * créer une. Il renvoyait donc l'utilisateur au client qu'il remplace
   * (« Créez-en une depuis l'écran Collections actuel »), ce qu'un client
   * livrable seul ne peut pas faire.
   *
   * On réutilise `RenommerModale` : nom + description, exactement les deux
   * champs que prend la route. Une modale de création qui ne serait pas celle
   * de la modification divergerait à la première correction.
   *
   * SEULEMENT sur l'onglet manuel : une collection INTELLIGENTE se définit par
   * des règles, pas par un nom — elle a son propre éditeur, non repris ici.
   * Proposer le même bouton sur les deux onglets promettrait une création qui
   * ne produirait pas ce qu'on regarde.
   */
  let creation = $state(false);
  /**
   * Editeur de collection INTELLIGENTE : creation quand il vaut `true`,
   * modification quand il porte la collection.
   *
   * Bertrand, 05/09/2026 : « et comment ajouter une smart collection ? ». On ne
   * pouvait pas — cet ecran savait creer une collection manuelle, mais une
   * intelligente exige des REGLES, donc un editeur.
   */
  let editeurSmart = $state<{ id: number | null } | null>(null);

  async function charger() {
    chargement = true;
    const [n, s] = await Promise.allSettled([
      api.getCollections(),
      api.listSmartCollections(),
    ]);

    const liste: Entree[] = [];
    if (n.status === 'fulfilled') {
      for (const c of (n.value as any[]) ?? []) {
        liste.push({
          sorte: 'normale',
          id: c.id,
          nom: c.name,
          description: c.description,
          albums: Array.isArray(c.album_ids) ? c.album_ids.length : null,
          covers: Array.isArray(c.covers) ? c.covers : [],
          creee: c.created_at ?? null,
        });
      }
    }
    if (s.status === 'fulfilled') {
      for (const c of (s.value as any[]) ?? []) {
        liste.push({
          sorte: 'smart',
          id: c.id,
          nom: c.name,
          description: c.description,
          albums: typeof c.album_count === 'number' ? c.album_count : null,
          covers: Array.isArray((c as any).covers) ? (c as any).covers : [],
          creee: (c as any).created_at ?? null,
        });
      }
    }
    entrees = liste;

    /**
     * La FICHE ouverte suit le rechargement.
     *
     * `ouverte` porte une COPIE de l'entrée, faite au moment du clic. Tant que
     * l'édition ne vivait que sur la vignette de la liste, cela suffisait : on
     * n'était jamais sur la fiche en éditant. Depuis que le bouton d'édition
     * est aussi sur la fiche (09/09/2026), renommer une collection y laissait
     * l'ancien nom affiché jusqu'à ce qu'on ressorte et revienne.
     *
     * On la retrouve par sorte ET par identifiant : les deux espaces d'ids se
     * recouvrent — l'id 1 est à la fois la collection « favorites » et
     * l'intelligente « Audiophile ». Chercher par id seul rouvrirait l'autre.
     *
     * Disparue du serveur (supprimée ailleurs) : on referme la fiche plutôt
     * que d'y laisser une collection qui n'existe plus.
     */
    if (ouverte) {
      ouverte = liste.find((x) => x.sorte === ouverte!.sorte && x.id === ouverte!.id) ?? null;
    }

    chargement = false;

    // Repli : le serveur ne rend pas encore `covers`. On va les chercher, mais
    // seulement pour celles qui en manquent, et APRÈS l'affichage — la grille
    // est déjà à l'écran avec ses cadres, les mosaïques la rejoignent.
    void completerPochettes();
  }

  async function completerPochettes(): Promise<void> {
    const manquantes = entrees.filter((e) => !e.covers.length);
    if (!manquantes.length) return;
    await Promise.allSettled(
      manquantes.map(async (e) => {
        const liste =
          e.sorte === 'smart'
            ? await api.getSmartCollectionAlbums(e.id)
            : await api.getCollectionAlbums(e.id);
        const covers = quatreDistinctes((liste as any[]) ?? []);
        if (!covers.length) return;
        entrees = entrees.map((x) =>
          x.sorte === e.sorte && x.id === e.id ? { ...x, covers } : x,
        );
      }),
    );
  }

  /**
   * CLE D'UN RACCOURCI vers une collection.
   *
   * Bertrand, 05/09/2026 : « bug du raccourci sur la mauvaise cible pas
   * traite ». Poser un raccourci sur une collection precise ramenait sur la
   * LISTE : le mecanisme generique existait — `setShortcutTarget` a
   * l'ouverture, `tune:shortcut-restore` au retour — mais AUCUN ecran du
   * nouveau client n'y participait. Le raccourci ne pouvait donc que poser la
   * vue et s'arreter la.
   *
   * `smartcollections:` est la meme cle que l'ecran du client actuel : un
   * raccourci pose d'un cote se rouvre de l'autre.
   */
  const cleCible = (e: Entree) =>
    `${e.sorte === 'smart' ? 'smartcollections' : 'collections'}:${e.id}`;

  $effect(() => {
    const auRetour = async (ev: Event) => {
      const cible = (ev as CustomEvent).detail?.target;
      const cle: string | undefined = cible?.key;
      if (!cle || !/^(smart)?collections:/.test(cle)) return;
      const id = cible.restore?.id;
      if (id == null) return;
      const smart = cle.startsWith('smartcollections:');
      // L'onglet doit suivre, sinon on rouvrirait une fiche sous un onglet qui
      // ne la contient pas — et la fermer retomberait sur la mauvaise liste.
      onglet = smart ? 'smart' : 'manuelle';
      let e = entrees.find((x) => x.id === id && (x.sorte === 'smart') === smart);
      if (!e) { await charger(); e = entrees.find((x) => x.id === id && (x.sorte === 'smart') === smart); }
      if (e) ouvrir(e);
    };
    window.addEventListener('tune:shortcut-restore', auRetour);
    return () => window.removeEventListener('tune:shortcut-restore', auRetour);
  });

  // Quitter l'ecran doit oublier la cible : sinon le raccourci suivant
  // capturerait une collection qu'on ne regarde plus.
  $effect(() => () => clearShortcutTarget());

  async function ouvrir(e: Entree) {
    ouverte = e;
    setShortcutTarget({ key: cleCible(e), restore: { id: e.id, name: e.nom }, label: e.nom });
    albums = [];
    await chargerAlbums(e);
  }

  /**
   * Fiche d'un album ouvert DEPUIS une collection, et album en cours d'edition.
   *
   * Bertrand, 05/09/2026 : « smart collection, aucun CTA sur les covers
   * d'album. Pas normal ! ». La grille d'une collection ouverte etait un simple
   * bouton avec une pochette nue : ni lecture, ni favori, ni etiquettes, ni
   * ouverture. Et le clic LANCAIT la lecture, la ou toutes les autres grilles
   * du nouveau client ouvrent l'album et laissent les gestes a la pochette.
   */
  let fiche = $state<any | null>(null);
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
    fiche = null;
  }
  function retourCalqueAlbum() {
    fermerDetailEnReculant(fermerCalqueAlbum);
  }
  $effect(() => {
    if ($detailOuvert == null && fiche) fermerCalqueAlbum();
  });
  let albumEnEdition = $state<any | null>(null);

  /** Le corps de lecture d'un album : son id, ou `source` + `streaming_album_id`
   *  (les deux vont TOUJOURS ensemble — voir `ArtistesV2`). */
  function corpsAlbum(a: any): Record<string, unknown> {
    return estAlbumDeService(a)
      ? { streaming_album_id: String(a.source_id), source: a.source }
      : { album_id: a.id };
  }

  async function lireAlbum(a: any, ev?: MouseEvent) {
    ev?.stopPropagation();
    const zid = $currentZoneId;
    if (zid == null) {
      notifications.error($t('v2.col.noZone' as any));
      return;
    }
    try {
      await playAndSync(zid, corpsAlbum(a));
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
  }

  onMount(() => {
    void charger();
  });
</script>

<section class="v2-collections tune-v2">
  {#if ouverte}
    <header class="v2-top detail">
      <div class="v2-titres">
        <button class="back" onclick={() => { ouverte = null; clearShortcutTarget(); }}>← {$t('common.back' as any)}</button>
        <div class="v2-eyebrow">{ouverte.sorte === 'smart' ? $t('v2.col.smart' as any) : $t('v2.col.manual' as any)}</div>
        <h1>{ouverte.nom}</h1>
        {#if ouverte.description}<p class="v2-sous">{ouverte.description}</p>{/if}
      </div>
      <div class="v2-actions fa">
        {#if ouverte.sorte === 'smart'}
          <label class="tricol">
            <span>{$t('v2.fav.sortBy' as any)}</span>
            <select bind:value={triSmart} aria-label={$t('v2.fav.sortBy' as any)}>
              {#each TRIS_SMART as k (k)}<option value={k}>{$t(LIBELLES_SMART[k] as any)}</option>{/each}
            </select>
            <button class="sens" onclick={() => (sensSmart = sensSmart === 'asc' ? 'desc' : 'asc')}
              title={$t((sensSmart === 'asc' ? 'common.ascending' : 'common.descending') as any)}
              aria-label={$t((sensSmart === 'asc' ? 'common.ascending' : 'common.descending') as any)}>
              {#if sensSmart === 'asc'}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M6 13l6 6 6-6"/></svg>
              {/if}
            </button>
          </label>
        {:else}
          <label class="tricol">
            <span>{$t('v2.fav.sortBy' as any)}</span>
            <select value={triAlbums} aria-label={$t('v2.fav.sortBy' as any)}
              onchange={(ev) => changerTri((ev.currentTarget as HTMLSelectElement).value as TriAlbums, sensAlbums)}>
              {#each TRIS_ALBUMS as k (k)}
                <option value={k}>{$t(LIBELLES_TRI[k] as any)}</option>
              {/each}
            </select>
            <button class="sens" onclick={() => changerTri(triAlbums, sensAlbums === 'asc' ? 'desc' : 'asc')}
              title={$t((sensAlbums === 'asc' ? 'common.ascending' : 'common.descending') as any)}
              aria-label={$t((sensAlbums === 'asc' ? 'common.ascending' : 'common.descending') as any)}>
              {#if sensAlbums === 'asc'}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M6 13l6 6 6-6"/></svg>
              {/if}
            </button>
          </label>
        {/if}
        <button class="fab" onclick={() => lireCollectionEntiere(false)}
          disabled={masseEnCours || !albums.length} title={$t('collections.playAll' as any)}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>{$t('collections.playAll' as any)}
        </button>
        <button class="fab creux" onclick={() => lireCollectionEntiere(true)}
          disabled={masseEnCours || !albums.length} title={$t('collections.shuffleAll' as any)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>{$t('collections.shuffleAll' as any)}
        </button>
        <!-- L'édition, ABSENTE de la fiche jusqu'au 09/09/2026 : elle ne vivait
             que sur la vignette de la liste. Une fois la collection ouverte, ses
             règles n'étaient plus atteignables. Même appel que la liste. -->
        <button class="v2-btn" onclick={() => editerCollection(ouverte!)}
          title={$t('v2.cover.edit' as any)} aria-label={$t('v2.cover.edit' as any)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l4 4"/></svg>
          {$t('v2.cover.edit' as any)}
        </button>
      </div>
    </header>

    <!-- #907 : l'en-tête (et son « Retour ») ne part plus avec la grille. -->
    <div class="defil">
    {#if albumsChargement}
      <div class="state">{$t('common.loading' as any)}</div>
    {:else if !albums.length}
      <div class="state">{$t('v2.col.emptyCollection' as any)}</div>
    {:else}
      <!-- Le rail et la grille sont FRERES : le rail est collant, la grille
           defile. Les imbriquer ferait defiler le rail avec elle. -->
      <div class="aveclettres">
        <!-- `cleRail` : sur un tri chronologique, le rail est RETIRÉ plutôt
             que laissé à promettre un saut qui atterrirait au hasard (#1153). -->
        {#if cleRail}
        <div class="rail">
          {#each ALPHA as L (L)}
            <button class="rl" class:hot={lettresPresentes.has(L)} disabled={!lettresPresentes.has(L)}
              onclick={() => sauterA(L)}>{L}</button>
          {/each}
        </div>
        {/if}
        <div class="grid" bind:this={grilleEl}>
        {#each albumsVus as a (cleAlbum(a))}
          <!-- Meme carte que la Bibliotheque : les cinq gestes sur la
               pochette, le texte cliquable, et la troisieme ligne. La carte
               n'est plus un bouton — `PochetteActions` en pose cinq, et un
               bouton dans un bouton est du balisage invalide. -->
          <div class="card" data-lettre={lettreDe(a)}>
            <span class="cv">
              <PochetteActions
                favori={a.id != null ? { albumId: a.id } : null}
                etiquettes={a.id != null ? { itemType: 'album', itemId: a.id } : null}
                onEditer={a.id != null ? () => (albumEnEdition = a) : null}
                onLire={() => lireAlbum(a)}
                onOuvrir={() => { ouvrirCalqueAlbum(a); fiche = a; }}
                menu={entreesAlbum(a)}
                nom={a.title}
              >
                <AlbumArt coverPath={a.cover_path} albumId={a.id} size={0} alt={a.title} fallbackInitials={a.title?.slice(0, 1)} />
              </PochetteActions>
            </span>
            <button class="meta" onclick={() => { ouvrirCalqueAlbum(a); fiche = a; }}>
              <span class="ct" title={a.title}>{a.title}</span>
              <span class="ca" title={a.artist_name ?? ''}>{a.artist_name ?? ''}</span>
            </button>
            <QualiteAlbum objet={a} />
          </div>
        {/each}
        </div>
      </div>
    {/if}
    </div>

  {:else}
    <header class="v2-top">
      <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.col.eyebrow' as any)}</div>
      <h1>{$t('v2.col.title' as any)}</h1>
      </div>
      <div class="v2-actions">
      <!-- Le bouton suit l'ONGLET : creer une collection manuelle et en creer
           une intelligente ne demandent pas la meme chose, et un seul bouton
           qui change de sens serait un piege. -->
      {#if onglet === 'manuelle'}
        <button class="v2-btn primaire" onclick={() => (creation = true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          {$t('v2.col.create' as any)}
        </button>
      {:else}
        <button class="v2-btn primaire" onclick={() => (editeurSmart = { id: null })}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          {$t('v2.smart.newTitle' as any)}
        </button>
      {/if}
      </div>
    </header>

    <nav class="tabs" role="tablist">
      <button class="tab" class:active={onglet === 'smart'} role="tab"
        aria-selected={onglet === 'smart'} onclick={() => (onglet = 'smart')}>{$t('v2.col.tabSmart' as any)}</button>
      <button class="tab" class:active={onglet === 'manuelle'} role="tab"
        aria-selected={onglet === 'manuelle'} onclick={() => (onglet = 'manuelle')}>{$t('v2.col.tabManual' as any)}</button>
      <!-- Le total de l'onglet COURANT. Absent tant qu'une collection n'a pas
           rendu son compte : une somme partielle serait pire que rien. -->
      {#if totalAlbums != null}
        <span class="totalonglet">{$t('v2.col.tabTotal' as any).replace('{n}', String(totalAlbums))}</span>
      {/if}
      <!-- Le tri porte sur les DEUX onglets : ce sont deux vues d'une même
           liste, et changer d'onglet ne doit pas changer l'ordre sous l'œil. -->
      <label class="tricol">
        <span>{$t('v2.fav.sortBy' as any)}</span>
        <select bind:value={tri} aria-label={$t('v2.fav.sortBy' as any)}>
          <option value="alpha">{$t('v2.fav.sortAlpha' as any)}</option>
          <option value="alphaInverse">{$t('v2.fav.sortAlphaDesc' as any)}</option>
          <option value="recent">{$t('v2.fav.sortRecent' as any)}</option>
          <option value="ancien">{$t('v2.fav.sortOldest' as any)}</option>
        </select>
      </label>
    </nav>

    <!-- #855 : seule la liste défile ; l'en-tête et les onglets restent à l'écran,
         comme dans la Bibliothèque. -->
    <div class="defil">
    {#if chargement}
      <div class="state">{$t('common.loading' as any)}</div>
    {:else if !visibles.length}
      <!-- Vide de CET onglet : l'autre peut fort bien être plein, la phrase ne
           doit donc pas dire « aucune collection » tout court. -->
      <div class="state">
        {$t('v2.col.noneInTab' as any)}
        {#if onglet === 'manuelle'}
          <button class="lnkcrea" onclick={() => (creation = true)}>{$t('v2.col.create' as any)}</button>
        {:else}
          <button class="lnkcrea" onclick={() => (editeurSmart = { id: null })}>{$t('v2.smart.newTitle' as any)}</button>
        {/if}
      </div>
    {:else}
      <!-- #1153 : le rail des « répertoires », que la V0 a et que le nouvel
           écran n'avait pas. Rail et grille sont FRERES, comme dans le détail :
           les imbriquer ferait défiler le rail avec la liste. -->
      <div class="aveclettres" bind:this={grilleListeEl}>
        {#if railListe}
        <div class="rail">
          {#each ALPHA as L (L)}
            <button class="rl" class:hot={lettresListe.has(L)} disabled={!lettresListe.has(L)}
              onclick={() => sauterAListe(L)}>{L}</button>
          {/each}
        </div>
        {/if}
      <div class="grid">
        {#each visibles as e (e.sorte + ':' + e.id)}
          <!-- Un LISERE de couleur, pas un fond : une pochette doit rester
               lisible. -->
          <div class="card" data-lettre={initiale(e.nom)} style="--teinte:{teinte(e.nom)}">
            <span class="cv teintee">
              <!-- Les deux sortes portent des `item_type` DISTINCTS : leurs
                   identifiants se recouvrent (l'id 1 est à la fois la
                   collection « favorites » et l'intelligente « Audiophile »
                   sur le serveur de Bertrand). Un type unique mettrait l'une
                   en favori en croyant viser l'autre. -->
              <PochetteActions
                favori={e.sorte === 'smart' ? { smartCollectionId: e.id } : { collectionId: e.id }}
                etiquettes={{ itemType: e.sorte === 'smart' ? 'smart_collection' : 'collection', itemId: e.id }}
                onEditer={() => editerCollection(e)}
                onLire={() => lireCollection(e)}
                onOuvrir={() => ouvrir(e)}
                menu={[{
                  libelle: $t('common.delete' as any),
                  danger: true,
                  faire: () => void supprimerCollection(e),
                }]}
                nom={e.nom}
              >
                <!-- Mosaïque ou pochette UNIQUE, au choix (Réglages →
                     Affichage). Gros Bidon préférait l'écran compact de
                     l'ancien client ; c'est un goût, donc un interrupteur.
                     `covers[0]` : la mosaïque cycle déjà sur cette liste, on
                     prend simplement sa première case. -->
                {#if $preferences.v2CollectionsMosaique}
                  <MosaiquePochettes pochettes={e.covers} initiales={e.nom?.slice(0, 1)} alt={e.nom} />
                {:else}
                  <AlbumArt coverPath={e.covers[0] ?? null} albumId={null} size={0} alt={e.nom}
                    fallbackInitials={e.nom?.slice(0, 1)} />
                {/if}
              </PochetteActions>
            </span>
            <button class="meta" onclick={() => ouvrir(e)}>
              <span class="ct" title={e.nom}>{e.nom}</span>
              <!-- Plus d'étiquette « Intelligente » par carte : l'onglet le dit
                   déjà, et la répéter sur chaque vignette serait du bruit. -->
              <span class="ca" title={String(e.albums ?? 0)}>{e.albums ?? 0}</span>
            </button>
          </div>
        {/each}
      </div>
      </div>
    {/if}
    </div>
  {/if}

  {#if enEdition}
    {@const cible = enEdition}
    <RenommerModale
      titre={$t('v2.edit.collection' as any)}
      nom={cible.nom}
      description={cible.description}
      enregistrer={(v) => api.updateCollection(cible.id, v)}
      onClose={() => (enEdition = null)}
      onSaved={charger}
      supprimer={() => supprimerCollection(cible)}
    />
  {/if}

  {#if fiche}
    <!-- Un album de service s'ouvre AVEC son service : sans lui, la fiche
         resterait sur « Chargement… » (#3709). -->
    <AlbumDetailV2 album={fiche} service={estAlbumDeService(fiche) ? fiche.source : null} onClose={retourCalqueAlbum} />
  {/if}

  {#if albumEnEdition}
    {#await import('../partages/AlbumEditModal.svelte') then m}
      <m.default
        album={albumEnEdition}
        onClose={() => (albumEnEdition = null)}
        onSaved={(maj: any) => {
          // La grille lit `albums` : sans ce report, le titre corrige ne
          // reviendrait qu'en rouvrant la collection.
          albums = albums.map((x: any) => (x.id === maj.id ? { ...x, ...maj } : x));
          albumEnEdition = null;
        }}
      />
    {/await}
  {/if}

  {#if editeurSmart}
    <!-- 🔴 L'entrée est retrouvée sur la PAIRE (sorte, id), jamais sur l'id
         seul : les deux espaces se recouvrent, et l'id 1 désigne aussi une
         collection manuelle. Absente de la liste — création — il n'y a rien à
         supprimer, et le bouton ne se pose pas. -->
    {@const cibleSmart = entrees.find((x) => x.sorte === 'smart' && x.id === editeurSmart!.id) ?? null}
    {#await import('./CollectionSmartEditeurV2.svelte') then m}
      <m.default
        id={editeurSmart.id}
        onClose={() => (editeurSmart = null)}
        onSaved={charger}
        supprimer={cibleSmart ? () => supprimerCollection(cibleSmart) : null}
      />
    {/await}
  {/if}

  {#if creation}
    <RenommerModale
      titre={$t('v2.col.create' as any)}
      nom=""
      description=""
      enregistrer={(v) => api.createCollection(v.name, v.description)}
      onClose={() => (creation = false)}
      onSaved={() => { creation = false; charger(); }}
    />
  {/if}
</section>

<style>
  .v2-collections{height:100%; display:flex; flex-direction:column; overflow:hidden; background:var(--v2-bg); color:var(--v2-txt); font-family:var(--v2-sans)}
  /* #855 / #907 — la SECTION défilait tout entière : en-tête, « Retour »,
     onglets et tri partaient avec la grille. Seul `.defil` défile désormais ;
     le rail A-Z y reste collé (`sticky` dans ce conteneur). */
  .v2-collections > header, .v2-collections > .tabs{flex:none}
  .defil{flex:1; min-height:0; overflow-y:auto}
  .lnkcrea{display:block; margin-top:12px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; border-radius:999px; padding:6px 14px; font:600 11.5px var(--v2-sans)}
  .lnkcrea:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .back{background:transparent; border:0; color:var(--v2-txt2); cursor:pointer; font:600 13px var(--v2-sans); padding:0 0 8px}
  .back:hover{color:var(--v2-txt)}
  /* Le tri se range a DROITE de la barre d'onglets : il commande la liste
     entiere, pas l'un des deux onglets. */
  .tricol{display:inline-flex; align-items:center; gap:8px; margin-left:auto}
  .tricol span{font:9.5px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .tricol select{height:30px; padding:0 8px; border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill);
    background:var(--v2-surface2); color:var(--v2-txt2); font:12.5px inherit; cursor:pointer}
  .tricol select:hover{border-color:var(--v2-acc2); color:var(--v2-txt)}
  /* Le sens, à côté de la clé : un seul bouton qui bascule, l'icône dit
     l'état courant et le titre le nomme. */
  .tricol .sens{width:30px; height:30px; display:grid; place-items:center; padding:0;
    border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill); background:var(--v2-surface2);
    color:var(--v2-txt2); cursor:pointer}
  .tricol .sens:hover{border-color:var(--v2-acc2); color:var(--v2-txt)}
  .tricol .sens svg{width:14px; height:14px}
  /* Dans l'en-tête d'une collection ouverte, le sélecteur ne se pousse pas à
     droite : il précède les boutons de lecture. */
  .fa .tricol{margin-left:0}

  .tabs{display:flex; gap:4px; padding:4px 30px 0}
  .tab{background:transparent; border:0; border-bottom:2px solid transparent; cursor:pointer;
    color:var(--v2-txt3); font:600 13.5px var(--v2-sans); padding:10px 12px}
  .tab:hover{color:var(--v2-txt2)}
  .tab.active{color:var(--v2-txt); border-bottom-color:var(--v2-acc1)}
  .state{padding:30px; color:var(--v2-txt3); font-size:13.5px}
  .grid{display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:18px; padding:12px 30px 30px}
  .card{display:flex; flex-direction:column; gap:6px; background:transparent; border:0; padding:0; text-align:left; color:inherit}
  .cv.teintee{box-shadow:0 0 0 2px var(--teinte); border-radius:var(--v2-r-card)}
  /* Ascenseur alphabetique, repris a l'identique de la Bibliotheque pour que
     les deux ecrans se parcourent de la meme facon. */
  .aveclettres{display:flex; min-height:0; flex:1}
  .aveclettres .grid{flex:1; min-width:0}
  .rail{display:flex; flex-direction:column; justify-content:center; gap:2px;
    padding:10px 12px 10px 4px; margin-right:6px; position:sticky; top:0; align-self:flex-start;
    border-right:1px solid var(--v2-line)}
  .rl{width:22px; height:20px; display:grid; place-items:center; border:0; background:transparent;
    font:600 11px var(--v2-mono); color:var(--v2-txt3); cursor:pointer; border-radius:5px; transition:.12s}
  .rl:disabled{opacity:.22; cursor:default}
  .rl.hot{color:var(--v2-txt2)}
  .rl.hot:hover{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .rl:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:1px}
  .totalonglet{margin-left:auto; align-self:center; font:11.5px var(--v2-mono); color:var(--v2-txt3)}
  /* La carte n'est plus un `<button>` : elle contient les cinq boutons
     d'action de la pochette, et des boutons imbriqués sont du HTML invalide. */
  .meta{display:flex; flex-direction:column; gap:6px; width:100%; border:0; background:transparent;
    padding:0; text-align:left; color:inherit; font:inherit; cursor:pointer}
  /* Le cadre porte le carré : la mosaïque le remplit, une pochette seule aussi. */
  .cv{display:block; aspect-ratio:1; width:100%; border-radius:var(--v2-r-card); overflow:hidden; background:var(--v2-surface)}
  .cv :global(img){width:100%; height:100%; object-fit:cover; display:block}
  .ct{font-weight:600; font-size:13.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .ca{font:11px var(--v2-mono); color:var(--v2-txt3); display:flex; align-items:center; gap:6px}
  .tag{font-style:normal; padding:1px 6px; border-radius:var(--v2-r-pill); background:var(--v2-surface2); color:var(--v2-txt2)}
  .fa{display:flex; gap:10px; margin-top:14px; flex-wrap:wrap}
  .fab{display:inline-flex; align-items:center; gap:8px; height:38px; padding:0 16px;
    border:0; border-radius:var(--v2-r-pill, 999px); cursor:pointer;
    font:700 13px var(--v2-sans, inherit); color:var(--v2-on-acc, #14110a);
    background:linear-gradient(135deg, var(--v2-acc1, #d9a441), var(--v2-acc2, #b8862b))}
  .fab.creux{background:transparent; color:var(--v2-txt, inherit);
    border:1px solid var(--v2-line2, rgba(255,255,255,.16))}
  .fab.creux:hover:not(:disabled){border-color:var(--v2-acc2, #b8862b); color:var(--v2-acc-tint, #e6c176)}
  .fab:disabled{opacity:.5; cursor:default}
  .fab svg{width:15px; height:15px}
</style>
