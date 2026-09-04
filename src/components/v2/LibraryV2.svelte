<script lang="ts">
  // Alias `tr` : `t` est déjà pris comme variable de boucle plus bas
  // ({#each TABS as t}, {#each visibleTracks as t}), et il masquerait le store.
  import { t as tr } from '../../lib/i18n';
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
  import { albums, libraryLoading } from '../../lib/stores/library';
  import { activeView, type View } from '../../lib/stores/navigation';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { getQualityTier, fold, formatDuration, type QualityTier } from '../../lib/utils';
  import type { Album, Track } from '../../lib/types';
  import { anneeAlbum, couvertureAnnees, comparerAnnees, type ModeAnnee } from '../../lib/anneeAlbum';
  import * as api from '../../lib/api';
  import { currentZoneId } from '../../lib/stores/zones';
  import AlbumArt from '../AlbumArt.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import AlbumEditModal from '../AlbumEditModal.svelte';
  import ArtistesV2 from './ArtistesV2.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';
  import {
    albumsDistants, corpsLecture, pistesAlbumDistant, pistesDistantes, type DepotDistant,
  } from '../../lib/tuneRemote';
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

  /** LA source d'albums de l'ecran. Tout le reste lit `src`, jamais `$albums`
   *  ni `albumsD` : c'est ce qui rend la vue identique des deux cotes. */
  const src = $derived<Album[]>(depot ? albumsD : $albums);
  const enCharge = $derived(depot ? chargementD : $libraryLoading);

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

  // Fréquences en VALEURS EXACTES (jamais un seuil « ≥ »).
  const RATES: { v: number; l: string }[] = [
    { v: 44100, l: '44,1' }, { v: 48000, l: '48' }, { v: 88200, l: '88,2' },
    { v: 96000, l: '96' }, { v: 176400, l: '176,4' }, { v: 192000, l: '192' },
    { v: 352800, l: '352,8' }, { v: 384000, l: '384' },
  ];
  const QUALITIES: { key: QualityTier | 'hires'; label: string }[] = [
    { key: 'dsd', label: 'DSD' }, { key: 'hires', label: 'Hi-Res' },
    { key: 'cd', label: 'CD' }, { key: 'lossy', label: 'Compressé' },
  ];

  let fQuality = $state<string | null>(null);
  let fRate = $state<number | null>(null);
  let fFormat = $state<string | null>(null);
  let fDepth = $state<number | null>(null);

  /** Formats et profondeurs REELLEMENT presents, avec leur compte. Proposer
   *  une liste figee ferait offrir des rubriques vides — et un filtre qui ne
   *  renvoie rien passe pour un bug. */
  const formats = $derived.by(() => {
    const m = new Map<string, number>();
    for (const a of src) {
      const f = a.format?.trim().toUpperCase();
      if (f) m.set(f, (m.get(f) ?? 0) + 1);
    }
    return [...m.entries()].sort((x, z) => z[1] - x[1] || x[0].localeCompare(z[0]));
  });
  const depths = $derived.by(() => {
    const m = new Map<number, number>();
    for (const a of src) {
      const d = a.bit_depth ?? 0;
      if (d > 0) m.set(d, (m.get(d) ?? 0) + 1);
    }
    return [...m.entries()].sort((x, z) => x[0] - z[0]);
  });
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
    if (fYear != null && albumYear(a) !== fYear) return false;
    if (fFormat && (a.format?.trim().toUpperCase() ?? '') !== fFormat) return false;
    if (fDepth != null && (a.bit_depth ?? 0) !== fDepth) return false;
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
        return list.sort((a, b) =>
          comparerAnnees(albumYear(a), albumYear(b), ordreAnnee) || byTitle(a, b),
        );
      case 'added':
        return list.sort((a, b) => (b.added_at ?? 0) - (a.added_at ?? 0) || byTitle(a, b));
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
  let navMode = $state<NavMode>('alpha');
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
   * `release_date` n'est pas propose : mesure a 0 rempli. Un choix qui ne
   * trierait rien n'est pas un choix.
   */
  let modeAnnee = $state<ModeAnnee>('auto');
  let ordreAnnee = $state<'asc' | 'desc'>('desc');
  const albumYear = $derived((a: Album) => anneeAlbum(a, modeAnnee));

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

  /** Annee SURVOLEE dans la frise. Le curseur suit la souris : c'est ce qui
   *  fait qu'il « parcourt les annees » au lieu d'attendre un clic. */
  let hoverYear = $state<number | null>(null);

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
  type SortKey = 'title' | 'artist' | 'year' | 'added';
  const SORTS: { k: SortKey; l: string }[] = [
    { k: 'title', l: 'Titre' }, { k: 'artist', l: 'Artiste' },
    { k: 'year', l: 'Année' }, { k: 'added', l: 'Ajout récent' },
  ];
  let sortKey = $state<SortKey>('title');
  const hasAddedAt = $derived(src.some((a) => (a.added_at ?? 0) > 0));
  const availableSorts = $derived(SORTS.filter((s2) => s2.k !== 'added' || hasAddedAt));

  // ── Affichage grille / liste ──────────────────────────────────────────
  type Display = 'grid' | 'list';
  let display = $state<Display>('grid');

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
  const cursorYear = $derived(fYear ?? hoverYear ?? busiestYear);
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
  function firstLetter(a: Album): string {
    const c = fold(a.title).charAt(0).toUpperCase();
    return c >= 'A' && c <= 'Z' ? c : '#';
  }
  const present = $derived(new Set(affiches.map(firstLetter)));
  let gridEl: HTMLDivElement | undefined = $state();
  function jump(L: string) {
    gridEl?.querySelector<HTMLElement>(`[data-letter="${L}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function tech(a: Album): string {
    const t = getQualityTier(a);
    const rate = RATES.find((r) => r.v === a.sample_rate)?.l;
    const depth = a.bit_depth ? `${a.bit_depth}-bit` : '';
    if (t === 'dsd') return `DSD · ${a.sample_rate && a.sample_rate >= 5000000 ? 'DSD128' : 'DSD64'}`;
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
  const TABS: { id: Tab; label: string; adv?: boolean }[] = [
    { id: 'albums', label: 'Albums' },
    { id: 'artists', label: 'Artistes' },
    { id: 'tracks', label: 'Titres' },
    { id: 'genres', label: 'Genres', adv: true },
    { id: 'years', label: 'Années', adv: true },
    { id: 'labels', label: 'Labels', adv: true },
  ];
  let tab = $state<Tab>('albums');

  /**
   * Les filtres portent sur les ALBUMS — qualité, fréquence, format,
   * profondeur, année. L'onglet Artistes n'en affiche aucun : les laisser
   * promettait un filtrage qui ne pouvait pas agir, et le compteur
   * « Tout (4255) » annonçait des albums au-dessus d'une grille d'artistes
   * (signalé par Bertrand, capture à l'appui, 02/09/2026).
   *
   * La RECHERCHE, elle, reste : elle filtre bien les artistes.
   */
  const showFilters = $derived(tab !== 'artists');

  /** Tri et bascule grille/liste : outils de confort, pas de recherche. */
  /** Tri et bascule grille/liste : outils de confort, pas de recherche.
   *  Sans objet sur les artistes — le tri porte sur des champs d'album, et il
   *  n'y a qu'une seule façon d'afficher une grille d'artistes. */
  const showTools = $derived(atLeast(level, 'intermediate') && tab !== 'artists');

  /** A–Z / Années : une navigation dans les ALBUMS. La vue Artistes a son
   *  propre rail A–Z, et « Années » n'a aucun sens sur un artiste. */
  const showTimeline = $derived(atLeast(level, 'intermediate') && tab !== 'artists');


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
  const FACET_EMPTY: Record<string, string> = {
    artists: 'Artiste inconnu', genres: 'Sans genre', labels: 'Sans label', years: 'Année inconnue',
  };

  /** Regroupement pour les onglets facettes : une entree par valeur, avec ses
   *  albums, triee par nom — sauf les annees, triees chronologiquement. */
  const groups = $derived.by(() => {
    // `artists` n'en fait plus partie : cet onglet a sa propre vue, qui lit la
    // table des artistes. Le laisser ici calculerait un regroupement que plus
    // personne n'affiche, sur chaque frappe de la recherche.
    if (tab === 'albums' || tab === 'tracks' || tab === 'artists')
      return [] as { key: string; albums: Album[] }[];
    const m = new Map<string, Album[]>();
    for (const a of sorted) {
      if (!matches(a)) continue;
      const k = facetOf(a, tab) ?? FACET_EMPTY[tab];
      const arr = m.get(k); if (arr) arr.push(a); else m.set(k, [a]);
    }
    const out = [...m.entries()].map(([key, albums]) => ({ key, albums }));
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

  // ── Onglet « Titres » : charge la liste des pistes une seule fois ───────
  let tracks = $state<Track[]>([]);
  let tracksLoading = $state(false);
  let tracksLoaded = false;
  $effect(() => {
    const d = depot;
    if (tab !== 'tracks' || tracksLoaded) return;
    tracksLoaded = true;
    tracksLoading = true;
    (d ? pistesDistantes(d) : api.getAllTracks())
      .then((t) => { tracks = t ?? []; })
      .catch(() => { tracks = []; })
      .finally(() => { tracksLoading = false; });
  });
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
    api.play(zid, depot ? (corpsLecture(depot, t) as any) : { track_id: t.id }).catch(() => {});
  }
  let opened = $state<Album | null>(null);

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
    api.play(zid, { album_id: a.id }).catch(() => {});
  }

  function reset() { fQuality = null; fRate = null; q = ''; fYear = null; fFormat = null; fDepth = null; }

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
      else await api.shuffleAll(zid, q.trim() ? { search_query: q.trim() } : undefined);
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
    await api.play(zid, corpsLecture(d, pistes[0]) as any);
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
  <header class="top">
    <h1>{depot ? depot.nom : 'Bibliothèque'}</h1>
    {#if depot}<span class="dist">{depot.hote}</span>{/if}
    <button class="btn" onclick={shuffleAll} disabled={shuffling || $currentZoneId == null}
      title={$currentZoneId == null ? 'Aucune zone active'
        : depot ? `Lire un album au hasard de ${depot.nom}` : 'Lire toute la bibliothèque au hasard'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20 20 4M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>{shuffling ? 'Lancement…' : 'Aléatoire'}
    </button>
    {#if !depot}
      <!-- Declarer un dossier de musique est un reglage du serveur LOCAL :
           le proposer sur la bibliotheque d'une autre machine promettrait
           d'agir sur elle, ce qu'on ne fait pas. -->
      <button class="btn" onclick={addContent} title="Ajouter des dossiers de musique">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Ajouter
      </button>
    {/if}
    <nav class="tabs">
      {#each TABS as t (t.id)}
        {#if !t.adv || atLeast(level, 'intermediate')}
          <button class="tab" class:active={tab === t.id} onclick={() => (tab = t.id)}>{t.label}</button>
        {/if}
      {/each}
    </nav>
  </header>

  <!-- La ligne de filtres existe a TOUS les niveaux : chez Levente le champ
       de recherche vit dans la page, a cote des filtres, et c'est le seul
       moyen de chercher en Essentiel depuis que la Recherche a quitte la
       barre laterale. Seules les PUCES de filtrage sont reservees a Avance. -->
  {#if erreurD}<div class="derr">{erreurD}</div>{/if}

  <div class="filters">
    {#if showFilters}
      <button class="chip count" class:active={!fQuality && !fRate && !q && fYear == null && !fFormat && fDepth == null} onclick={reset}>Tout ({matchCount})</button>
      <div class="drop" class:open={ddOpen === 'quality'}>
        <button class="chip" class:active={fQuality !== null} aria-haspopup="menu" aria-expanded={ddOpen === 'quality'} onclick={() => ddToggle('quality')}>Qualité{#if fQuality}&nbsp;· {QUALITIES.find(x => x.key === fQuality)?.label}{/if}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="menu">
          {#each QUALITIES as it (it.key)}
            <button class:on={fQuality === it.key} onclick={() => { fQuality = fQuality === it.key ? null : (it.key as string); ddClose(); }}>{it.label}</button>
          {/each}
        </div>
      </div>
      <div class="drop" class:open={ddOpen === 'rate'}>
        <button class="chip" class:active={fRate !== null} aria-haspopup="menu" aria-expanded={ddOpen === 'rate'} onclick={() => ddToggle('rate')}>Fréquence{#if fRate}&nbsp;· {RATES.find(r => r.v === fRate)?.l} kHz{/if}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="menu">
          {#each RATES as r (r.v)}
            <button class:on={fRate === r.v} onclick={() => { fRate = fRate === r.v ? null : r.v; ddClose(); }}>{r.l} kHz</button>
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
    <div class="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
      <input placeholder="Rechercher dans la bibliothèque" bind:value={q} />
      {#if q}
        <button class="clr" onclick={() => (q = '')} aria-label="Effacer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      {/if}
    </div>

    {#if showTools && tab !== 'tracks'}
      <div class="drop right">
        <button class="chip plain">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h10M4 12h7M4 18h4M17 5v14M14 16l3 3 3-3"/></svg>
          {SORTS.find(x => x.k === sortKey)?.l}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="menu">
          {#each availableSorts as o (o.k)}
            <button class:on={sortKey === o.k} onclick={() => (sortKey = o.k)}>{o.l}</button>
          {/each}
        </div>
      </div>
      <button class="viewtog" onclick={() => (display = display === 'grid' ? 'list' : 'grid')}
        aria-label={display === 'grid' ? 'Affichage liste' : 'Affichage grille'}
        title={display === 'grid' ? 'Affichage liste' : 'Affichage grille'}>
        {#if display === 'grid'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        {/if}
      </button>
    {/if}
  </div>

  {#if showTimeline}
    <div class="navmode">
      <button class:on={navMode === 'alpha'} onclick={() => { navMode = 'alpha'; fYear = null; }}>A–Z</button>
      <button class:on={navMode === 'years'} onclick={() => (navMode = 'years')}>Années</button>
      {#if fYear != null}
        <button class="yearpill" onclick={() => (fYear = null)}>
          {fYear} · {yearCount} album{yearCount > 1 ? 's' : ''}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      {/if}
    </div>
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
            onfocus={() => { hoverYear = b.year; hoverMonth = null; }}
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
      <ArtistesV2 {q} />
    {:else if enCharge && sorted.length === 0}
      <div class="state">Chargement de la bibliothèque…</div>
    {:else if sorted.length === 0}
      <!-- « Votre » serait faux sur la bibliotheque d'une autre machine : on
           nomme le serveur, sinon un catalogue distant vide se lirait comme
           un defaut de la sienne. Mesure : 192.168.1.16 rend `[]`. -->
      <div class="state">{depot ? `${depot.nom} (${depot.hote}) n’expose aucun album.` : 'Votre bibliothèque est vide.'}</div>
    {:else}
      {#if navMode === 'alpha' && tab === 'albums'}
        <div class="rail">
          {#each ALPHA as L (L)}
            <button class="rl" class:hot={present.has(L)} disabled={!present.has(L)} onclick={() => jump(L)}>{L}</button>
          {/each}
        </div>
      {/if}
      {#if tab === 'tracks'}
        <div class="tracklist">
          {#if tracksLoading}
            <div class="state">Chargement des titres…</div>
          {:else if !visibleTracks.length}
            <div class="state">{tracks.length ? 'Aucun titre pour cette recherche.' : 'Aucun titre.'}</div>
          {:else}
            {#each visibleTracks as t, i (t.id ?? i)}
              <button class="trk" onclick={() => playTrack(t)}>
                <span class="tn">{i + 1}</span>
                <span class="tt">{t.title}<em>{t.artist_name ?? ''}{t.album_title ? ' · ' + t.album_title : ''}</em></span>
                <span class="td">{formatDuration(t.duration_ms ?? 0)}</span>
              </button>
            {/each}
            {#if tracks.length > visibleTracks.length}
              <div class="state">{visibleTracks.length} titres affichés sur {tracks.length} — affinez la recherche.</div>
            {/if}
          {/if}
        </div>

      {:else if tab !== 'albums'}
        <!--
          Quelle annee, et dans quel sens. La couverture est ANNONCEE a cote de
          chaque mode : « origine » ne concerne que 90 albums sur 4255 ici, et
          basculer dessus sans le savoir donne une frise presque vide qui se
          lit comme une panne.
        -->
        {#if tab === 'years'}
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
        {/if}
        <div class="facets">
          {#each groups as g (g.key)}
            <section class="facet">
              <h2>{g.key}<span class="fc">{g.albums.length}</span></h2>
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
                      <div class="ct">{a.title}</div>
                      <div class="ca">{a.artist_name ?? ''}</div>
                    </button>
                  </div>
                {/each}
              </div>
            </section>
          {:else}
            <div class="state">Rien à regrouper avec ces filtres.</div>
          {/each}
        </div>

      {:else if display === 'list'}
        {#if !affiches.length}
          <div class="state">{$tr('library.noAlbumMatchesFilters' as any)}</div>
        {:else}
        <div class="rows" bind:this={gridEl}>
          {#each affiches as a (a.id)}
            <button class="lrow" data-letter={firstLetter(a)} onclick={() => opened = a}>
              <span class="lcv"><AlbumArt coverPath={a.cover_path} albumId={depot ? null : a.id} size={0} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} /></span>
              <span class="lt">{a.title}</span>
              <span class="la">{a.artist_name ?? ''}</span>
              <span class="ly">{albumYear(a) ?? ''}</span>
              {#if showBadges && badge(a)}<span class="bdg flat">{badge(a)}</span>{/if}
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
                <div class="ct">{a.title}</div>
                <div class="ca">{a.artist_name ?? ''}</div>
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
  .anbar{display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin:0 0 16px}
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
  .dist{font:11px var(--v2-mono); color:var(--v2-txt3); align-self:center; margin-left:-6px}
  .derr{margin:0 30px 10px; padding:9px 14px; border-radius:10px; font-size:13px;
    color:var(--v2-danger); border:1px solid var(--v2-danger); background:var(--v2-danger-soft)}
  .v2-lib{position:relative; display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden; box-sizing:border-box}
  /* padding-right élargi : l'avatar de la coquille est pincé à droite. */
  .top{display:flex; align-items:center; gap:18px; padding:20px 30px 8px; padding-right:96px}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em}
  .btn{display:inline-flex; align-items:center; gap:8px; height:40px; padding:0 18px; border-radius:var(--v2-r-pill);
    border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt); font:600 14px var(--v2-sans); cursor:pointer}
  .btn:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .btn svg{width:16px; height:16px}
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
  .search{position:relative; margin-left:auto; display:flex; align-items:center; gap:10px; height:42px; width:320px; padding:0 16px;
    border-radius:14px; background:var(--v2-surface2); border:1px solid var(--v2-line); color:var(--v2-txt2)}
  .search svg{width:16px; height:16px}
  .search .clr{position:absolute; right:8px; width:20px; height:20px; border:0; border-radius:50%;
    background:transparent; color:var(--v2-txt3); cursor:pointer; display:grid; place-items:center}
  .search .clr:hover{color:var(--v2-txt)}
  .search .clr svg{width:11px; height:11px}
  .search input{background:transparent; border:0; outline:0; color:var(--v2-txt); font:14px var(--v2-sans); width:100%}
  .search input::placeholder{color:var(--v2-txt3)}

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
  .chip.plain{gap:7px}
  .chip.plain svg:first-child{width:14px; height:14px}
  .viewtog{width:38px; height:38px; flex:0 0 auto; border-radius:10px; cursor:pointer;
    border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); display:grid; place-items:center}
  .viewtog:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .viewtog svg{width:16px; height:16px}

  /* Vues par facette : une section par valeur (artiste, genre, année, label). */
  .facets{flex:1; overflow-y:auto; padding:8px 30px 40px}
  .facets::-webkit-scrollbar{width:9px}.facets::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .facet{padding-bottom:26px}
  .facet h2{display:flex; align-items:center; gap:10px; font-size:17px; font-weight:700; padding:6px 0 14px;
    position:sticky; top:0; background:var(--v2-bg); z-index:2}
  .facet .fc{font:10px var(--v2-mono); color:var(--v2-txt3); border:1px solid var(--v2-line2);
    border-radius:999px; padding:2px 8px}
  .facetgrid{overflow:visible; padding:0}

  /* Affichage liste : même données, densité maximale. */
  .rows{flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:1px; padding:4px 30px 40px}
  .rows::-webkit-scrollbar{width:9px}.rows::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .lrow{display:grid; grid-template-columns:44px minmax(0,2fr) minmax(0,1.4fr) 56px auto auto; align-items:center;
    gap:14px; width:100%; padding:6px 10px; border:0; border-radius:9px; background:transparent;
    color:var(--v2-txt2); cursor:pointer; text-align:left; transition:.12s}
  .lrow:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .lcv{width:44px; height:44px; border-radius:6px; overflow:hidden}
  .lrow .lt{font-size:13.5px; font-weight:600; color:var(--v2-txt); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .lrow .la{font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .lrow .ly{font:11px var(--v2-mono); color:var(--v2-txt3); text-align:right}
  .lrow .lq{font:10px var(--v2-mono); color:var(--v2-acc2)}
  .bdg.flat{position:static; align-self:center}

  /* Onglet Titres. */
  .tracklist{flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:1px; padding:4px 30px 40px}
  .tracklist::-webkit-scrollbar{width:9px}.tracklist::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .trk{display:grid; grid-template-columns:40px 1fr auto; align-items:center; gap:14px; width:100%;
    padding:8px 10px; border:0; border-radius:9px; background:transparent; color:var(--v2-txt2);
    cursor:pointer; text-align:left}
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
  .cq{margin-top:4px; font:9.5px var(--v2-mono); color:var(--v2-acc2); letter-spacing:.02em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
</style>
