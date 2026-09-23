<script lang="ts">
  import { currentZone, playAndSync } from '../../lib/stores/zones';
  import { playFromHere } from '../../lib/playback';
  import * as api from '../../lib/api';
  import { formatTime, formatAudioBadge, fold } from '../../lib/utils';
  import type { Track } from '../../lib/types';
  import { t as tr } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import { setShortcutTarget, clearShortcutTarget } from '../../lib/stores/shortcuts';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import MosaiquePochettes from '../v2/MosaiquePochettes.svelte';
  import PochetteActions from '../v2/PochetteActions.svelte';
  import { cibleSmartPlaylist } from '../../lib/cibleEtiquette';
  import { quatreDistinctes } from '../../lib/mosaique';
  import { dialogs } from '../../lib/stores/dialogs';
  import { preferences } from '../../lib/stores/preferences';
  import { lireChoix, ecrireChoix } from '../../lib/preferencesEcran';
  import { get } from 'svelte/store';
  import { streamingServices } from '../../lib/stores/streaming';
  import { statutsStreaming } from '../../lib/albumsArtisteStreaming';
  import { sourcesDisponibles, libelleSource } from '../../lib/sourcesRegle';
  import { lireListe, lireListeAleatoire } from '../../lib/lectureEnMasse';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import { optionOperateur } from '../../lib/smartPlaylistOperateurs';
  // La GRAMMAIRE des règles — champs, opérateurs offerts par champ, lecture
  // des règles stockées, mise en forme pour le serveur — a quitté ce fichier
  // pour `lib/smartPlaylistChamps` (#1150) : le nouveau client a désormais le
  // même éditeur, et deux copies auraient divergé à la première addition.
  import {
    CHAMPS as FIELDS,
    operateursDe as opsFor,
    estChampReference as isRefField,
    lireRegles,
    reglesPourServeur,
    regleNeuve,
    type RegleSmartPlaylist,
  } from '../../lib/smartPlaylistChamps';

  let zone = $derived($currentZone);

  interface SmartPlaylist {
    id: number;
    name: string;
    description: string | null;
    rules: string;
    match_mode: string;
    sort_by: string;
    sort_order: string;
    max_tracks: number;
  }

  type Rule = RegleSmartPlaylist;

  let smartPlaylists: SmartPlaylist[] = $state([]);
  let selectedSp: SmartPlaylist | null = $state(null);
  let spTracks: Track[] = $state([]);
  let loading = $state(false);
  let showCreate = $state(false);
  let editingSp: SmartPlaylist | null = $state(null);

  // Create form
  let newName = $state('');
  let newDescription = $state('');
  let newMatchMode = $state('all');
  let newSortBy = $state('title');
  let newSortOrder = $state('asc');
  let newMaxTracks = $state(200);
  let newRules: Rule[] = $state([regleNeuve()]);

  let statutsServices = $state<Record<string, any>>({});

  // Listes pour les sélecteurs de référence (chargées avec la vue).
  let refOptions = $state<{
    collections: any[]; smartCollections: any[]; playlists: any[]; smartPlaylists: any[];
  }>({ collections: [], smartCollections: [], playlists: [], smartPlaylists: [] });

  async function loadRefOptions() {
    const [collections, smartCollections, playlists, spls] = await Promise.all([
      api.getCollections().catch(() => []),
      api.listSmartCollections().catch(() => []),
      api.getPlaylists(500).catch(() => []),
      api.getSmartPlaylists().catch(() => []),
    ]);
    refOptions = {
      collections: collections ?? [],
      smartCollections: smartCollections ?? [],
      playlists: playlists ?? [],
      smartPlaylists: spls ?? [],
    };
  }

  function refName(value: string): string {
    const [kind, idStr] = value.includes(':') ? value.split(':') : ['classic', value];
    const id = parseInt(idStr, 10);
    const lists = kind === 'smart'
      ? [...refOptions.smartCollections, ...refOptions.smartPlaylists]
      : [...refOptions.collections, ...refOptions.playlists];
    return lists.find((x: any) => x.id === id)?.name ?? value;
  }

  // Libellé lisible d'une règle (chips + résumé de carte) : les règles
  // « référence » affichent le nom de la collection/playlist, pas
  // `in_playlist in smart:4`.
  function displayRule(r: Rule): string {
    if (isRefField(r.field)) {
      const fieldLabel = $tr(FIELDS.find(f => f.value === r.field)?.key ?? r.field);
      const opLabel = $tr(
        (r.operator === 'not_in' || r.operator === 'is_not')
          ? 'smartCollection.opRefNotIn'
          : 'smartCollection.opRefIn'
      );
      const valueLabel = r.field === 'favorite'
        ? $tr(r.value === 'album' ? 'smartCollection.favAlbum' : r.value === 'artist' ? 'smartCollection.favArtist' : 'smartCollection.favTrack')
        : refName(r.value);
      return `${fieldLabel} ${opLabel} « ${valueLabel} »`;
    }
    if (r.field === 'source') {
      const fieldLabel = $tr('smartPlaylists.fieldSource');
      const opLabel = r.operator === 'not_equals' ? '≠' : '=';
      return `${fieldLabel} ${opLabel} « ${libelleSource(r.value, $tr('v2.lib.sourceLocal' as any))} »`;
    }
    // Le libellé du menu, pas la valeur interne : le résumé d'une règle doit se
    // lire « bit_depth ≥ "24" », pas « bit_depth gte "24" ».
    const option = optionOperateur(r.operator);
    const opLabel = option ? (option.key ? $tr(option.key) : option.label) : r.operator;
    return `${r.field} ${opLabel} "${r.value}"`;
  }

  const SORT_OPTIONS: { value: string; key: string }[] = [
    { value: 'title', key: 'common.title' },
    { value: 'artist', key: 'common.artist' },
    { value: 'album', key: 'common.album' },
    { value: 'year', key: 'smartPlaylists.fieldYear' },
    { value: 'duration', key: 'smartPlaylists.sortDuration' },
    { value: 'random', key: 'smartPlaylists.sortRandom' },
  ];

  /**
   * Les quatre pochettes de chaque playlist intelligente, par identifiant.
   *
   * Une playlist intelligente n'a pas de pochette à elle : son contenu est
   * calculé. Les images viennent donc de ses PISTES, comme pour les playlists
   * ordinaires (`PlaylistsV2`) et le gestionnaire de playlists.
   */
  let mosaiques = $state<Record<number, string[]>>({});
  const mosaiquesDemandees = new Set<number>();

  /**
   * Le NOMBRE DE PISTES de chaque playlist intelligente, par identifiant.
   *
   * Il ne vient d'aucun champ : la liste `/library/smart-playlists` ne rend ni
   * `track_count` ni équivalent — son contenu est calculé. On le MESURE donc
   * sur ce que le serveur rend, c'est-à-dire la longueur de la liste de pistes
   * déjà demandée pour les pochettes. C'est exactement le nombre que la fiche
   * affiche quand on ouvre la playlist, plafond `max_tracks` compris : deux
   * chiffres différents pour la même playlist seraient pires qu'un seul.
   *
   * `null` — absent de la table — tant que la mesure n'est pas faite. Afficher
   * « 0 » en attendant ferait passer une playlist pleine pour une playlist
   * vide.
   */
  let comptes = $state<Record<number, number>>({});

  /**
   * Oublie ce qu'on sait d'une playlist : ses pochettes et son compte.
   *
   * Modifier les règles change le CONTENU, donc les deux. Sans cet oubli,
   * `mosaiquesDemandees` empêcherait toute nouvelle mesure et la carte
   * garderait l'ancienne mosaïque et l'ancien compte jusqu'au rechargement de
   * la page.
   */
  function oublierContenu(id: number): void {
    mosaiquesDemandees.delete(id);
    const { [id]: _m, ...restePochettes } = mosaiques;
    const { [id]: _c, ...resteComptes } = comptes;
    mosaiques = restePochettes;
    comptes = resteComptes;
  }

  /**
   * Charge les pochettes APRÈS l'affichage de la grille, jamais avant.
   *
   * ⚠️ Une requête PAR playlist, et ici chacune RECALCULE la sélection côté
   * serveur : la grille ne doit donc rien attendre. Elle s'affiche avec son
   * étoile, les mosaïques la rejoignent au fil de l'eau, et un échec ne coûte
   * que sa propre vignette. `mosaiquesDemandees` empêche de redemander la même
   * playlist à chaque re-rendu.
   */
  async function chargerMosaiques(liste: SmartPlaylist[]): Promise<void> {
    await Promise.allSettled(
      (liste ?? []).map(async (sp) => {
        const id = sp?.id;
        if (id == null || mosaiquesDemandees.has(id)) return;
        mosaiquesDemandees.add(id);
        try {
          const pistes = await api.getSmartPlaylistTracks(id);
          // Distinctes : deux titres du même album ne prennent pas deux cases.
          const vues = quatreDistinctes(
            (pistes ?? []).map((t: any) => ({ cover_path: t?.cover_path, title: t?.album_title ?? t?.album })),
          );
          // Le compte est posé même quand AUCUNE pochette n'est exploitable :
          // une playlist de pistes sans image a bien un nombre de pistes.
          comptes = { ...comptes, [id]: (pistes ?? []).length };
          if (vues.length) mosaiques = { ...mosaiques, [id]: vues };
        } catch {
          // Une playlist dont le contenu ne se calcule pas garde son initiale,
          // et ne ment pas sur son compte : on redemandera.
          mosaiquesDemandees.delete(id);
        }
      }),
    );
  }

  async function loadSmartPlaylists() {
    try {
      smartPlaylists = await api.getSmartPlaylists();
      void chargerMosaiques(smartPlaylists);
    } catch (e) {
      console.error('Load smart playlists error:', e);
    }
  }

  /* ------------------------------------------------------------------------
   * La PRÉSENTATION de la liste, reprise de `v2/CollectionsV2` (onglet
   * « smart »).
   *
   * Demande de Bertrand du 22/09/2026 : « Harmonise la présentation des smart
   * playlists idem smart collections ». Les deux écrans montrent la même
   * chose — une liste d'objets calculés par des règles — et ne la montraient
   * pas du tout de la même façon : une bande colorée avec une étoile et deux
   * icônes d'un côté, une grille de vignettes carrées avec leurs cinq gestes
   * de l'autre.
   *
   * On reprend donc, à l'identique : la teinte dérivée du nom, la grande
   * vignette enveloppée de `PochetteActions`, le bloc `.meta`, le rail A-Z et
   * le tri mémorisé. Ce qui n'existe PAS pour une playlist intelligente n'est
   * pas repris — voir le balisage de la carte.
   * --------------------------------------------------------------------- */

  /**
   * La teinte d'une playlist, DÉRIVÉE de son nom.
   *
   * Même fonction que `CollectionsV2` — même formule, donc la même playlist et
   * la collection homonyme portent le même liseré, et une playlist garde sa
   * couleur d'une session à l'autre sans que rien ne soit stocké.
   */
  function teinte(nom: string): string {
    let h = 0;
    for (let i = 0; i < nom.length; i++) h = (h * 31 + nom.charCodeAt(i)) % 360;
    return `hsl(${h} 62% 58%)`;
  }

  /** L'initiale de rail d'un texte : accents repliés, tout le reste sous « # ». */
  function initiale(texte: string | null | undefined): string {
    const c = fold(texte).trim().charAt(0).toUpperCase();
    return c >= 'A' && c <= 'Z' ? c : '#';
  }

  /**
   * Tri de la liste, mémorisé par écran (`lireChoix` / `ecrireChoix`).
   *
   * Deux clés seulement, et c'est une différence assumée avec les collections :
   * `/library/smart-playlists` ne rend pas de date de création, on ne peut donc
   * pas proposer « plus récent / plus ancien » sans l'inventer. Le NOMBRE DE
   * PISTES le remplace — c'est la seule autre donnée que la carte affiche.
   *
   * Le sens est un bouton à part, comme dans l'en-tête d'une collection
   * ouverte : la clé dit sur QUOI on trie, le bouton dans quel sens.
   */
  const TRIS = ['nom', 'pistes'] as const;
  type Tri = (typeof TRIS)[number];
  const SENS = ['asc', 'desc'] as const;
  type Sens = (typeof SENS)[number];
  let tri = $state<Tri>(lireChoix<Tri>('v2.smartplaylists.tri', TRIS, 'nom'));
  let sens = $state<Sens>(lireChoix<Sens>('v2.smartplaylists.sens', SENS, 'asc'));
  $effect(() => { ecrireChoix('v2.smartplaylists.tri', tri); });
  $effect(() => { ecrireChoix('v2.smartplaylists.sens', sens); });
  const LIBELLES_TRI: Record<Tri, string> = {
    nom: 'smartPlaylists.sortName',
    pistes: 'smartPlaylists.sortTracks',
  };

  function parNom(a: SmartPlaylist, b: SmartPlaylist): number {
    // `sensitivity: 'base'` : « Été » et « ete » se suivent. `numeric` pour que
    // « Best 2 » vienne avant « Best 10 ».
    return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base', numeric: true });
  }

  /**
   * ⚠️ Une playlist dont le compte n'est PAS encore mesuré se range en fin de
   * liste dans les deux sens. La mettre en tête d'un tri croissant la ferait
   * passer pour la plus courte, alors qu'on ne sait simplement pas encore.
   */
  function comparer(a: SmartPlaylist, b: SmartPlaylist): number {
    if (tri === 'nom') return sens === 'asc' ? parNom(a, b) : -parNom(a, b);
    const ca = comptes[a.id];
    const cb = comptes[b.id];
    const va = ca == null;
    const vb = cb == null;
    if (va && vb) return parNom(a, b);
    if (va) return 1;
    if (vb) return -1;
    return (sens === 'asc' ? ca - cb : cb - ca) || parNom(a, b);
  }

  const visibles = $derived(smartPlaylists.slice().sort(comparer));

  /**
   * Rail alphabétique de la liste, comme dans Collections (#1153).
   *
   * Il ne paraît que sur le tri par NOM : rangée par nombre de pistes, une
   * lettre ne désigne aucune position, et un saut qui atterrit au hasard se lit
   * comme un rail mort.
   */
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
  const railListe = $derived(tri === 'nom');
  const lettresListe = $derived(
    railListe ? new Set(visibles.map((sp) => initiale(sp.name))) : new Set<string>(),
  );
  let grilleListeEl: HTMLDivElement | undefined = $state();
  function sauterAListe(L: string) {
    grilleListeEl?.querySelector<HTMLElement>(`[data-lettre="${L}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * LIRE une playlist depuis sa vignette — le geste central de
   * `PochetteActions`.
   *
   * On relit ses pistes plutôt que de réutiliser celles de la mosaïque : la
   * mosaïque n'en garde que quatre CHEMINS de pochette, pas les pistes. Même
   * enchaînement que « Tout lire » de la fiche (`lireListe` : la tête part, le
   * reste s'enfile), la liste pouvant être mixte depuis #4299.
   */
  async function lireSmartPlaylist(sp: SmartPlaylist) {
    const zid = zone?.id;
    if (zid == null) return;
    try {
      const pistes = await api.getSmartPlaylistTracks(sp.id);
      if (!pistes?.length) return;
      await lireListe(pistes, {
        lire: (c: any) => playAndSync(zid, c),
        enfiler: (c: any) => api.addToQueue(zid, c),
      });
    } catch (e) {
      signalerEchecLecture(e);
    }
  }

  // A shortcut created on a specific smart playlist must reopen THAT one, not
  // land on the list. Publish the open item generically and reopen it on the
  // shared restore event, keyed by `smartplaylists:<id>`.
  $effect(() => {
    const onRestore = async (e: Event) => {
      const target = (e as CustomEvent).detail?.target;
      const key: string | undefined = target?.key;
      if (!key || !key.startsWith('smartplaylists:')) return;
      const id = target.restore?.id;
      if (id == null) return;
      let sp = smartPlaylists.find(p => p.id === id);
      if (!sp) { await loadSmartPlaylists(); sp = smartPlaylists.find(p => p.id === id); }
      if (sp) selectSp(sp);
    };
    window.addEventListener('tune:shortcut-restore', onRestore);
    return () => window.removeEventListener('tune:shortcut-restore', onRestore);
  });

  async function selectSp(sp: SmartPlaylist) {
    selectedSp = sp;
    setShortcutTarget({
      key: `smartplaylists:${sp.id}`,
      restore: { id: sp.id, name: sp.name },
      label: sp.name,
    });
    loading = true;
    try {
      spTracks = await api.getSmartPlaylistTracks(sp.id);
    } catch (e) {
      console.error('Load smart playlist tracks error:', e);
      spTracks = [];
    }
    loading = false;
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const result = await api.createSmartPlaylist({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        rules: reglesPourServeur(newRules),
        match_mode: newMatchMode,
        sort_by: newSortBy,
        sort_order: newSortOrder,
        max_tracks: newMaxTracks,
      });
      notifications.success($tr('smartPlaylists.created').replace('{name}', newName));
      showCreate = false;
      newName = '';
      newDescription = '';
      newRules = [regleNeuve()];
      await loadSmartPlaylists();
      // Auto-select the new one
      const created = smartPlaylists.find(sp => sp.id === result.id);
      if (created) selectSp(created);
    } catch (e: any) {
      // apiError range le corps `error` du serveur dans e.code (ex. le
      // message de référence circulaire) : le préférer au statut HTTP brut.
      notifications.error(e?.code || e?.message || $tr('common.error'));
    }
  }

  /**
   * SUPPRIMER une playlist intelligente — derrière le menu, et derrière une
   * confirmation.
   *
   * La croix « × » de la carte supprimait SANS rien demander, à portée de
   * pouce d'une carte entièrement cliquable. C'est l'arbitrage déjà posé par
   * `CollectionsV2` qu'on reprend : l'entrée vit dans le menu d'actions de la
   * pochette, teintée `danger`, et elle demande confirmation.
   *
   * 🔴 `dialogs.confirm`, jamais `window.confirm` : les dialogues natifs ne
   * s'affichent pas dans les vues web embarquées.
   */
  async function handleDelete(sp: SmartPlaylist) {
    const question = $tr('smartPlaylists.deleteAsk').replace('{nom}', sp.name ?? '');
    if (!(await dialogs.confirm(question, { danger: true }))) return;
    try {
      await api.deleteSmartPlaylist(sp.id);
      smartPlaylists = smartPlaylists.filter(s => s.id !== sp.id);
      oublierContenu(sp.id);
      if (selectedSp?.id === sp.id) {
        selectedSp = null;
        spTracks = [];
      }
      notifications.success($tr('smartPlaylists.deleted').replace('{name}', sp.name));
    } catch (e: any) {
      // apiError range le corps `error` du serveur dans e.code (ex. le
      // message de référence circulaire) : le préférer au statut HTTP brut.
      notifications.error(e?.code || e?.message || $tr('common.error'));
    }
  }

  function startEdit(sp: SmartPlaylist) {
    editingSp = sp;
    newName = sp.name;
    newDescription = sp.description || '';
    newRules = parseRules(sp);
    newMatchMode = sp.match_mode;
    newSortBy = sp.sort_by;
    newSortOrder = sp.sort_order;
    newMaxTracks = sp.max_tracks;
    showCreate = true;
  }

  async function handleUpdate() {
    if (!editingSp || !newName.trim()) return;
    try {
      await api.updateSmartPlaylist(editingSp.id, {
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        rules: reglesPourServeur(newRules),
        match_mode: newMatchMode,
        sort_by: newSortBy,
        sort_order: newSortOrder,
        max_tracks: newMaxTracks,
      });
      notifications.success($tr('smartPlaylists.updated').replace('{name}', newName));
      // Les règles ont changé : le contenu aussi. Sans cet oubli, la carte
      // garderait l'ancienne mosaïque et l'ancien compte.
      oublierContenu(editingSp.id);
      editingSp = null;
      showCreate = false;
      newName = '';
      newDescription = '';
      newRules = [regleNeuve()];
      await loadSmartPlaylists();
    } catch (e: any) {
      // apiError range le corps `error` du serveur dans e.code (ex. le
      // message de référence circulaire) : le préférer au statut HTTP brut.
      notifications.error(e?.code || e?.message || $tr('common.error'));
    }
  }

  function cancelForm() {
    editingSp = null;
    showCreate = false;
    newName = '';
    newDescription = '';
    newRules = [regleNeuve()];
  }

  /**
   * « Tout lire » — la liste peut être MIXTE depuis #4299 : une règle « Source
   * = Qobuz » ramène des favoris de service, sans identifiant de bibliothèque.
   * `track_ids` les écartait tous ; `lireListe` lance la tête et enfile le
   * reste, locales et services confondus.
   */
  async function playAll() {
    const zid = zone?.id;
    if (zid == null || spTracks.length === 0) return;
    await lireListe(spTracks, {
      lire: (c: any) => playAndSync(zid, c),
      enfiler: (c: any) => api.addToQueue(zid, c),
    }).catch(signalerEchecLecture);
  }

  /**
   * « Lecture aléatoire » — Bertrand, 17/09/2026 (réunion avec Yves, point 4) :
   * « Playlists ou Smart playlists, ajouter bouton lecture aléatoire ». Même
   * mélange que les playlists et les collections (`lectureEnMasse`), sans
   * toucher au mode aléatoire de la zone.
   */
  async function playShuffle() {
    const zid = zone?.id;
    if (zid == null || spTracks.length === 0) return;
    await lireListeAleatoire(spTracks, {
      lire: (c: any) => playAndSync(zid, c),
      enfiler: (c: any) => api.addToQueue(zid, c),
    }).catch(signalerEchecLecture);
  }

  /** Une ligne : par son identifiant si elle est locale, par service sinon. */
  async function playTrack(t: Track) {
    if (!zone?.id) return;
    if (t.id != null) {
      await playAndSync(zone.id, { track_id: t.id }).catch(signalerEchecLecture);
    } else if (t.source && t.source_id) {
      await playAndSync(zone.id, {
        source: t.source,
        source_id: String(t.source_id),
        title: t.title ?? null,
        artist_name: t.artist_name ?? null,
        album_title: t.album_title ?? null,
        cover_path: t.cover_path ?? null,
      } as any).catch(signalerEchecLecture);
    }
  }

  function addRule() {
    newRules = [...newRules, regleNeuve()];
  }

  function removeRule(index: number) {
    newRules = newRules.filter((_, i) => i !== index);
  }

  function parseRules(sp: SmartPlaylist): Rule[] {
    return lireRegles(sp.rules);
  }

  /**
   * Le critère d'une playlist SANS règle — et il y en a (Bertrand, 22/09/2026 :
   * « n'affiche pas la règle ! »).
   *
   * Trois des six playlists du .18 n'ont aucune règle : « 50 Random Tracks »,
   * « Most Played », « Recently Added ». Leur sélection tient dans leur TRI et
   * leur plafond, pas dans une règle. Répondre « aucune règle » ne disait donc
   * rien de ce qu'elles contiennent, alors que le serveur le porte :
   * `sort_by` et `max_tracks`.
   */
  const LIBELLE_TRI: Record<string, string> = {
    title: 'common.title',
    artist: 'common.artist',
    album: 'common.album',
    year: 'smartPlaylists.fieldYear',
    duration: 'smartPlaylists.sortDuration',
    random: 'smartPlaylists.sortRandom',
    play_count: 'smartPlaylists.sortPlayCount',
    added: 'smartPlaylists.sortAdded',
    created_at: 'smartPlaylists.sortAdded',
    date_added: 'smartPlaylists.sortAdded',
  };

  function critereSansRegle(sp: SmartPlaylist): string {
    const tri = (sp as any).sort_by as string | undefined;
    // Un tri inconnu du serveur se montre TEL QUEL plutôt que d'être tu :
    // mieux vaut un mot brut qu'une carte qui ne dit rien.
    const libelle = tri ? (LIBELLE_TRI[tri] ? $tr(LIBELLE_TRI[tri] as any) : tri) : null;
    const max = (sp as any).max_tracks as number | undefined;
    const bouts = [
      libelle ? `${$tr('smartPlaylists.sort' as any)} ${libelle}` : null,
      max ? `${$tr('smartPlaylists.max' as any)} ${max}` : null,
    ].filter(Boolean);
    return bouts.length ? bouts.join(' · ') : $tr('smartPlaylists.noRules');
  }

  function ruleSummary(sp: SmartPlaylist): string {
    const rules = parseRules(sp);
    if (!rules.length) return critereSansRegle(sp);
    const parts = rules.slice(0, 2).map(displayRule);
    const mode = (sp.match_mode || '').replace(/"/g, '');
    const summary = parts.join(mode === 'all' ? ` ${$tr('smartPlaylists.joinAll')} ` : ` ${$tr('smartPlaylists.joinAny')} `);
    return rules.length > 2 ? `${summary} … (+${rules.length - 2})` : summary;
  }

  $effect(() => {
    loadSmartPlaylists();
    loadRefOptions();
    // `get` : une lecture ponctuelle, qui n'abonne pas l'effet au magasin.
    void statutsStreaming(get(streamingServices), api.getStreamingServices, (x) => streamingServices.set(x))
      .then((st) => { statutsServices = st; });
  });
</script>

<div class="sp-view">
  {#if selectedSp}
    <!-- Detail view -->
    <div class="sp-header">
      <button class="back-btn" onclick={() => { selectedSp = null; spTracks = []; clearShortcutTarget(); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6" /></svg>
        {$tr('common.back')}
      </button>
    </div>

    <div class="sp-detail">
      <div class="sp-detail-header">
        <div class="sp-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
        </div>
        <div class="sp-detail-info">
          <h2>{selectedSp.name}</h2>
          {#if selectedSp.description}<p class="sp-desc">{selectedSp.description}</p>{/if}
          <p class="sp-meta">{spTracks.length} {$tr('common.tracks')}</p>
          <div class="sp-rules-display">
            {#each parseRules(selectedSp) as rule}
              <span class="sp-rule-chip">{displayRule(rule)}</span>
            {/each}
          </div>
        </div>
      </div>

      <div class="sp-detail-actions">
        <button class="play-all-btn" onclick={playAll} disabled={spTracks.length === 0}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z" /></svg>
          {$tr('smartPlaylists.playAll')} ({spTracks.length})
        </button>
        <button class="edit-btn" onclick={playShuffle} disabled={spTracks.length === 0} title={$tr('library.shuffle')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>
          {$tr('library.shuffle')}
        </button>
        <button class="edit-btn" onclick={() => { const sp = selectedSp!; selectedSp = null; spTracks = []; startEdit(sp); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          {$tr('smartPlaylists.edit')}
        </button>
      </div>

      {#if loading}
        <div class="loading"><div class="spinner"></div></div>
      {:else}
        <div class="sp-tracks">
          {#each spTracks as t, i}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="sp-track-row" onclick={() => playTrack(t)}>
              <span class="sp-track-num">{i + 1}</span>
              <div class="sp-track-art"><AlbumArt coverPath={t.cover_path} albumId={t.album_id} size={40} alt={t.title} /></div>
              <div class="sp-track-info">
                <span class="sp-track-title truncate">{t.title}</span>
                <span class="sp-track-artist truncate">{t.artist_name ?? ''}</span>
              </div>
              {#if t.format}<span class="audio-format">{formatAudioBadge(t)}</span>{/if}
              <span class="sp-track-duration">{formatTime(t.duration_ms)}</span>
              <button class="play-from-here-btn" onclick={(e) => { e.stopPropagation(); playFromHere(spTracks, i); }} title={$tr('common.playFromHere')} aria-label={$tr('common.playFromHere')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="3" y1="6" x2="14" y2="6" /><line x1="3" y1="12" x2="14" y2="12" /><line x1="3" y1="18" x2="10" y2="18" /><path d="M16 8v8l6-4z" fill="currentColor" stroke="none" /></svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  {:else}
    <!-- List view -->
    <div class="sp-list-header">
      <h2>{$tr('smartPlaylists.title')}</h2>
      <button class="create-btn" onclick={() => { if (showCreate) { cancelForm(); } else { editingSp = null; newName = ''; newDescription = ''; newRules = [regleNeuve()]; newMatchMode = 'all'; newSortBy = 'title'; newSortOrder = 'asc'; newMaxTracks = 200; showCreate = true; } }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        {$tr('smartPlaylists.new')}
      </button>
    </div>

    {#if showCreate}
      <div class="sp-create-form">
        <input type="text" placeholder={$tr('smartPlaylists.namePlaceholder')} bind:value={newName} class="sp-input" />
        <input type="text" placeholder={$tr('smartPlaylists.descPlaceholder')} bind:value={newDescription} class="sp-input" />

        <div class="sp-rules-builder">
          <h4>{$tr('smartPlaylists.rules')}</h4>
          {#each newRules as rule, i}
            <div class="sp-rule-row">
              <select
                class="sp-select"
                value={rule.field}
                onchange={(e) => {
                  const f = (e.target as HTMLSelectElement).value;
                  const ops = opsFor(f);
                  // Changer de famille de champ invalide l'opérateur et la
                  // valeur : on repart sur le premier opérateur valide.
                  newRules = newRules.map((r, idx) =>
                    idx === i ? { field: f, operator: ops[0].value, value: '' } : r);
                }}
              >
                {#each FIELDS as f}<option value={f.value}>{$tr(f.key)}</option>{/each}
              </select>
              <select bind:value={rule.operator} class="sp-select">
                {#each opsFor(rule.field) as op}<option value={op.value}>{op.key ? $tr(op.key) : op.label}</option>{/each}
              </select>
              {#if rule.field === 'in_collection'}
                <select bind:value={rule.value} class="sp-select sp-input-sm">
                  <option value="" disabled>{$tr('smartCollection.refPick')}</option>
                  <optgroup label={$tr('smartCollection.groupCollections')}>
                    {#each refOptions.collections as c}
                      <option value={`classic:${c.id}`}>{c.name}</option>
                    {/each}
                  </optgroup>
                  <optgroup label={$tr('smartCollection.groupSmartCollections')}>
                    {#each refOptions.smartCollections as c}
                      <option value={`smart:${c.id}`}>{c.name}</option>
                    {/each}
                  </optgroup>
                </select>
              {:else if rule.field === 'in_playlist'}
                <select bind:value={rule.value} class="sp-select sp-input-sm">
                  <option value="" disabled>{$tr('smartCollection.refPick')}</option>
                  <optgroup label={$tr('smartCollection.groupPlaylists')}>
                    {#each refOptions.playlists as p}
                      <option value={`classic:${p.id}`}>{p.name}</option>
                    {/each}
                  </optgroup>
                  <optgroup label={$tr('smartCollection.groupSmartPlaylists')}>
                    {#each refOptions.smartPlaylists.filter((p) => p.id !== editingSp?.id) as p}
                      <option value={`smart:${p.id}`}>{p.name}</option>
                    {/each}
                  </optgroup>
                </select>
              {:else if rule.field === 'source'}
                <select bind:value={rule.value} class="sp-select sp-input-sm">
                  <option value="" disabled>{$tr('smartCollection.refPick')}</option>
                  {#each sourcesDisponibles(statutsServices, rule.value) as s (s)}
                    <option value={s}>{libelleSource(s, $tr('v2.lib.sourceLocal' as any))}</option>
                  {/each}
                </select>
              {:else if rule.field === 'favorite'}
                <select bind:value={rule.value} class="sp-select sp-input-sm">
                  <option value="" disabled>{$tr('smartCollection.refPick')}</option>
                  <option value="track">{$tr('smartCollection.favTrack')}</option>
                  <option value="album">{$tr('smartCollection.favAlbum')}</option>
                  <option value="artist">{$tr('smartCollection.favArtist')}</option>
                </select>
              {:else}
                <input type="text" placeholder={$tr('smartPlaylists.valuePlaceholder')} bind:value={rule.value} class="sp-input sp-input-sm" />
              {/if}
              <button class="sp-remove-rule" onclick={() => removeRule(i)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          {/each}
          <button class="sp-add-rule" onclick={addRule}>{$tr('smartPlaylists.addRule')}</button>
        </div>

        <div class="sp-options">
          <label>
            {$tr('smartPlaylists.matchMode')}
            <select bind:value={newMatchMode} class="sp-select">
              <option value="all">{$tr('smartPlaylists.matchAll')}</option>
              <option value="any">{$tr('smartPlaylists.matchAny')}</option>
            </select>
          </label>
          <label>
            {$tr('smartPlaylists.sort')}
            <select bind:value={newSortBy} class="sp-select">
              {#each SORT_OPTIONS as s}<option value={s.value}>{$tr(s.key)}</option>{/each}
            </select>
          </label>
          <label>
            {$tr('smartPlaylists.order')}
            <select bind:value={newSortOrder} class="sp-select">
              <option value="asc">{$tr('smartPlaylists.asc')}</option>
              <option value="desc">{$tr('smartPlaylists.desc')}</option>
            </select>
          </label>
          <label>
            {$tr('smartPlaylists.max')}
            <input type="number" bind:value={newMaxTracks} min="1" max="1000" class="sp-input sp-input-num" />
          </label>
        </div>

        <div class="sp-form-actions">
          <button class="play-all-btn" onclick={editingSp ? handleUpdate : handleCreate} disabled={!newName.trim()}>{editingSp ? $tr('smartPlaylists.modify') : $tr('common.create')}</button>
          <button class="cancel-btn" onclick={cancelForm}>{$tr('common.cancel')}</button>
        </div>
      </div>
    {/if}

    <!-- Le tri de la liste, à droite comme dans Collections. Il est au-dessus
         de la grille et non dans l'en-tête : l'en-tête laisse sa droite à la
         grappe de la coquille. -->
    {#if smartPlaylists.length > 0}
      <div class="sp-barre">
        <label class="tricol">
          <span>{$tr('v2.fav.sortBy')}</span>
          <select bind:value={tri} aria-label={$tr('v2.fav.sortBy')}>
            {#each TRIS as k (k)}<option value={k}>{$tr(LIBELLES_TRI[k])}</option>{/each}
          </select>
          <button class="sens" onclick={() => (sens = sens === 'asc' ? 'desc' : 'asc')}
            title={$tr(sens === 'asc' ? 'common.ascending' : 'common.descending')}
            aria-label={$tr(sens === 'asc' ? 'common.ascending' : 'common.descending')}>
            {#if sens === 'asc'}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M6 13l6 6 6-6"/></svg>
            {/if}
          </button>
        </label>
      </div>
    {/if}

    <!-- Rail et grille sont FRÈRES, comme dans Collections : les imbriquer
         ferait défiler le rail avec la liste. -->
    <div class="aveclettres" bind:this={grilleListeEl}>
      {#if railListe && smartPlaylists.length > 0}
        <div class="rail">
          {#each ALPHA as L (L)}
            <button class="rl" class:hot={lettresListe.has(L)} disabled={!lettresListe.has(L)}
              onclick={() => sauterAListe(L)}>{L}</button>
          {/each}
        </div>
      {/if}
      <div class="grid">
        {#each visibles as sp (sp.id)}
          <!-- Un LISERÉ de couleur, pas un fond : la mosaïque doit rester
               lisible. Même formule de teinte que les collections. -->
          <div class="card" data-lettre={initiale(sp.name)} style="--teinte:{teinte(sp.name)}">
            <span class="cv teintee">
              <!-- Les CINQ gestes, comme sur les smart collections (#4798).
                   Le cœur et les étiquettes manquaient à dessein tant que le
                   serveur ne connaissait pas ce type d'objet ; il le sert
                   depuis renesenses/tune-server-rust#4798. Le favori porte
                   `smartPlaylistId` et l'étiquette le type `smart_playlist`,
                   JAMAIS `playlistId`/`playlist` avec le même numéro : les
                   deux tables partagent leurs identifiants, et l'id 1 y
                   désigne deux playlists différentes. -->
              <PochetteActions
                favori={{ smartPlaylistId: sp.id }}
                etiquettes={cibleSmartPlaylist(sp.id)}
                onEditer={() => startEdit(sp)}
                onLire={() => lireSmartPlaylist(sp)}
                onOuvrir={() => selectSp(sp)}
                menu={[{
                  libelle: $tr('common.delete'),
                  danger: true,
                  faire: () => void handleDelete(sp),
                }]}
                nom={sp.name}
              >
                <!-- Mosaïque ou pochette UNIQUE, au choix (Réglages →
                     Affichage) : le même interrupteur que les collections,
                     sinon deux écrans harmonisés se sépareraient au premier
                     réglage. `[0]` : la mosaïque cycle sur cette liste, on
                     prend sa première case. -->
                {#if $preferences.v2CollectionsMosaique}
                  <MosaiquePochettes pochettes={mosaiques[sp.id] ?? []} initiales={sp.name?.slice(0, 1)} alt={sp.name} />
                {:else}
                  <AlbumArt coverPath={mosaiques[sp.id]?.[0] ?? null} albumId={null} size={0} alt={sp.name}
                    fallbackInitials={sp.name?.slice(0, 1)} />
                {/if}
              </PochetteActions>
            </span>
            <!-- Bertrand, 22/09/2026 : « Ne display pas la règle !! cache la ».
                 La carte ne montre donc QUE le nom et le compte. Le résumé des
                 règles reste en infobulle : il ne prend aucune place, et
                 répond quand on le cherche. -->
            <button class="meta" onclick={() => selectSp(sp)} title={`${sp.name} — ${ruleSummary(sp)}`}>
              <span class="ct" title={sp.name}>{sp.name}</span>
              <!-- Le compte MESURÉ. « … » tant qu'il ne l'est pas : « 0 »
                   ferait passer une playlist pleine pour une playlist vide. -->
              <span class="ca">{comptes[sp.id] != null ? `${comptes[sp.id]} ${$tr('common.tracks')}` : '…'}</span>
              {#if sp.description}<span class="cd" title={sp.description}>{sp.description}</span>{/if}
            </button>
          </div>
        {/each}
        {#if smartPlaylists.length === 0 && !showCreate}
          <p class="sp-empty">{$tr('smartPlaylists.emptyList')}</p>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .sp-view { padding: var(--space-lg) 28px; overflow-y: auto; height: 100%; }
  /* L’écran est monté dans la coquille : son en-tête laisse la place à la grappe. */
  .sp-list-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-lg); padding-right: var(--v2-grappe-w, 172px); }
  .sp-list-header h2 { font-family: var(--font-label); font-size: 28px; font-weight: 600; letter-spacing: -0.8px; color: var(--tune-text); margin: 0; }
  .create-btn { display: flex; align-items: center; gap: var(--space-xs); padding: var(--space-sm) var(--space-md); background: var(--tune-accent); color: white; border: none; border-radius: var(--radius-md); cursor: pointer; font-family: var(--font-label); font-size: 13px; font-weight: 600; transition: opacity 0.12s; }
  .create-btn:hover { opacity: 0.85; }

  /* Create form */
  .sp-create-form { background: var(--tune-surface); border: 1px solid var(--tune-border); border-radius: var(--radius-lg); padding: var(--space-lg); margin-bottom: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-md); }
  .sp-input { background: var(--tune-bg); border: 1px solid var(--tune-border); border-radius: var(--radius-md); padding: var(--space-sm) var(--space-md); color: var(--tune-text); font-family: var(--font-body); font-size: 14px; outline: none; }
  .sp-input:focus { border-color: var(--tune-accent); }
  .sp-input-sm { flex: 1; min-width: 100px; }
  .sp-input-num { width: 80px; }
  .sp-select { background: var(--tune-bg); border: 1px solid var(--tune-border); border-radius: var(--radius-md); padding: var(--space-xs) var(--space-sm); color: var(--tune-text); font-family: var(--font-body); font-size: 13px; outline: none; }
  .sp-rules-builder h4 { font-family: var(--font-label); font-size: 12px; font-weight: 600; color: var(--tune-text-secondary); margin: 0; }
  .sp-rule-row { display: flex; align-items: center; gap: var(--space-sm); margin-top: var(--space-xs); }
  .sp-remove-rule { background: none; border: none; color: var(--tune-text-muted); cursor: pointer; padding: 2px; }
  .sp-remove-rule:hover { color: #ef4444; }
  .sp-add-rule { background: none; border: none; color: var(--tune-accent); cursor: pointer; font-family: var(--font-body); font-size: 13px; padding: var(--space-xs) 0; }
  .sp-options { display: flex; flex-wrap: wrap; gap: var(--space-md); }
  .sp-options label { display: flex; align-items: center; gap: var(--space-xs); font-family: var(--font-body); font-size: 13px; color: var(--tune-text-secondary); }
  .sp-form-actions { display: flex; gap: var(--space-sm); }
  .cancel-btn { background: none; border: 1px solid var(--tune-border); border-radius: var(--radius-md); padding: var(--space-sm) var(--space-md); color: var(--tune-text-secondary); cursor: pointer; font-family: var(--font-label); font-size: 13px; }

  /* ------------------------------------------------------------------------
     La GRILLE, reprise telle quelle de `v2/CollectionsV2` (22/09/2026).

     Les cartes étaient des bandes de 250 px, fond teinté et liseré à gauche,
     avec une étoile de 14 px pour toute image. Ce sont désormais les mêmes
     vignettes carrées que les collections intelligentes : `.card` / `.cv` /
     `.meta`, les jetons `--v2-` de la coquille (l'écran est monté dans
     `.tune-v2`, qui les définit), et le liseré de teinte autour de la
     pochette plutôt que sur le bord de la carte.
     --------------------------------------------------------------------- */
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 18px; padding: 12px 0 30px; }
  .card { display: flex; flex-direction: column; gap: 6px; background: transparent; border: 0; padding: 0; text-align: left; color: inherit; }
  /* Le cadre porte le carré : la mosaïque le remplit, une pochette seule aussi. */
  .cv { display: block; aspect-ratio: 1; width: 100%; border-radius: var(--v2-r-card); overflow: hidden; background: var(--v2-surface); }
  .cv :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cv.teintee { box-shadow: 0 0 0 2px var(--teinte); border-radius: var(--v2-r-card); }
  /* La carte n'est pas un `<button>` : `PochetteActions` en pose cinq, et des
     boutons imbriqués sont du HTML invalide — c'est aussi ce qui a fait
     disparaître le `role="button"` de l'ancienne carte. */
  .meta { display: flex; flex-direction: column; gap: 6px; width: 100%; border: 0; background: transparent;
    padding: 0; text-align: left; color: inherit; font: inherit; cursor: pointer; min-width: 0; }
  .ct { font-weight: 600; font-size: 13.5px; color: var(--v2-txt); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ca { font: 11px var(--v2-mono); color: var(--v2-txt3); display: flex; align-items: center; gap: 6px; }
  /* Le résumé des règles : une ligne, l'infobulle porte le reste. */
  .cd { font-size: 11.5px; color: var(--v2-txt3); font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sp-empty { font-family: var(--font-body); font-size: 14px; color: var(--tune-text-muted); text-align: center; padding: var(--space-2xl); grid-column: 1 / -1; }

  /* Tri de la liste — mêmes commandes que Collections. */
  .sp-barre { display: flex; justify-content: flex-end; padding-right: var(--v2-grappe-w, 172px); }
  .tricol { display: inline-flex; align-items: center; gap: 8px; }
  .tricol span { font: 9.5px var(--v2-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--v2-txt3); }
  .tricol select { height: 30px; padding: 0 8px; border: 1px solid var(--v2-line2); border-radius: var(--v2-r-pill);
    background: var(--v2-surface2); color: var(--v2-txt2); font: 12.5px inherit; cursor: pointer; }
  .tricol select:hover { border-color: var(--v2-acc2); color: var(--v2-txt); }
  .tricol .sens { width: 30px; height: 30px; display: grid; place-items: center; padding: 0;
    border: 1px solid var(--v2-line2); border-radius: var(--v2-r-pill); background: var(--v2-surface2);
    color: var(--v2-txt2); cursor: pointer; }
  .tricol .sens:hover { border-color: var(--v2-acc2); color: var(--v2-txt); }
  .tricol .sens svg { width: 14px; height: 14px; }

  /* Rail A-Z de la liste, repris de Collections (#1153) : les lettres
     ABSENTES sont grisées et inertes — un rail qui propose une lettre ne
     menant nulle part est pire qu'un rail absent. */
  .aveclettres { display: flex; min-height: 0; }
  .aveclettres .grid { flex: 1; min-width: 0; }
  .rail { display: flex; flex-direction: column; justify-content: center; gap: 2px;
    padding: 10px 12px 10px 4px; margin-right: 6px; position: sticky; top: 0; align-self: flex-start;
    border-right: 1px solid var(--v2-line); }
  .rl { width: 22px; height: 20px; display: grid; place-items: center; border: 0; background: transparent;
    font: 600 11px var(--v2-mono); color: var(--v2-txt3); cursor: pointer; border-radius: 5px; transition: .12s; }
  .rl:disabled { opacity: .22; cursor: default; }
  .rl.hot { color: var(--v2-txt2); }
  .rl.hot:hover { color: var(--v2-on-acc); background: linear-gradient(135deg, var(--v2-acc1), var(--v2-acc2)); }
  .rl:focus-visible { outline: 2px solid var(--v2-acc2); outline-offset: 1px; }

  /* Detail */
  .sp-header { margin-bottom: var(--space-md); }
  .back-btn { display: flex; align-items: center; gap: var(--space-xs); background: none; border: none; color: var(--tune-text-secondary); cursor: pointer; font-family: var(--font-body); font-size: 13px; padding: 0; }
  .back-btn:hover { color: var(--tune-accent); }
  .sp-detail-header { display: flex; align-items: flex-start; gap: var(--space-lg); margin-bottom: var(--space-md); }
  .sp-icon { color: var(--tune-accent); padding: var(--space-md); background: var(--tune-surface); border-radius: var(--radius-lg); }
  .sp-detail-info h2 { font-family: var(--font-label); font-size: 28px; font-weight: 600; letter-spacing: -0.8px; color: var(--tune-text); margin: 0; }
  .sp-desc { font-family: var(--font-body); font-size: 13px; color: var(--tune-text-secondary); margin: 2px 0; }
  .sp-meta { font-family: var(--font-body); font-size: 12px; color: var(--tune-text-muted); margin: 0; }
  .sp-rules-display { display: flex; flex-wrap: wrap; gap: 4px; margin-top: var(--space-xs); }
  .sp-rule-chip { font-family: var(--font-body); font-size: 11px; padding: 2px 8px; border-radius: 10px; background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.1); color: var(--tune-accent); }
  .sp-detail-actions { display: flex; gap: var(--space-sm); margin-bottom: var(--space-md); }
  .play-all-btn { display: flex; align-items: center; gap: var(--space-xs); padding: var(--space-sm) var(--space-lg); background: var(--tune-accent); color: white; border: none; border-radius: var(--radius-md); cursor: pointer; font-family: var(--font-label); font-size: 13px; font-weight: 600; }
  .play-all-btn:disabled { opacity: 0.5; cursor: default; }
  .edit-btn { display: flex; align-items: center; gap: var(--space-xs); padding: var(--space-sm) var(--space-lg); background: none; border: 1px solid var(--tune-border); border-radius: var(--radius-md); cursor: pointer; font-family: var(--font-label); font-size: 13px; font-weight: 600; color: var(--tune-text-secondary); transition: border-color 0.12s, color 0.12s; }
  .edit-btn:hover { border-color: var(--tune-accent); color: var(--tune-accent); }

  /* Tracks list */
  .sp-tracks { display: flex; flex-direction: column; }
  .sp-track-row { display: flex; align-items: center; gap: var(--space-md); padding: 8px 0; cursor: pointer; transition: background 0.12s; border-radius: var(--radius-sm); }
  .sp-track-row:hover { background: var(--tune-surface-hover); }
  .play-from-here-btn { width: 28px; height: 28px; border: 1px solid var(--tune-border); border-radius: var(--radius-sm); background: none; color: var(--tune-text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.12s ease-out; opacity: 0; flex-shrink: 0; }
  .sp-track-row:hover .play-from-here-btn { opacity: 1; }
  .play-from-here-btn:hover { border-color: var(--tune-accent); color: var(--tune-accent); }
  .sp-track-num { font-family: var(--font-label); font-size: 13px; color: var(--tune-text-muted); min-width: 28px; text-align: right; }
  .sp-track-art { flex-shrink: 0; }
  .sp-track-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .sp-track-title { font-family: var(--font-body); font-size: 14px; font-weight: 600; color: var(--tune-text); }
  .sp-track-artist { font-family: var(--font-body); font-size: 13px; color: var(--tune-text-secondary); }
  .sp-track-duration { font-family: var(--font-label); font-size: 12px; color: var(--tune-text-muted); }
  .audio-format { font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 8px; background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.1); color: var(--tune-accent); }
  .loading { display: flex; justify-content: center; padding: var(--space-xl); }
</style>
