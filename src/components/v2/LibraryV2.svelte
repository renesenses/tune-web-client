<script lang="ts">
  /**
   * Bibliothèque — grille d'albums du nouveau client (direction Levente).
   *
   * Deux principes de la maquette :
   *  1. Les filtres ATTÉNUENT les albums non conformes au lieu de les retirer
   *     (stabilité spatiale : un album ne saute jamais de place). Le filtre de
   *     fréquence compare la valeur EXACTE — 176,4 kHz ≠ 192 kHz (bug Patatorz,
   *     tune-server-rust#2343).
   *  2. La densité suit le niveau d'interface (`preferences.settingsLevel`) :
   *     - Essentiel : grille nue, pas de filtres, pas de badges.
   *     - Avancé    : filtres Qualité + Fréquence, badges hi-res/DSD.
   *     - Expert    : + filtres Format & Profondeur, + ligne technique par carte.
   */
  import { albums, libraryLoading } from '../../lib/stores/library';
  import { activeView, type View } from '../../lib/stores/navigation';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { getQualityTier, fold, formatDuration, type QualityTier } from '../../lib/utils';
  import type { Album, Track } from '../../lib/types';
  import * as api from '../../lib/api';
  import { currentZoneId } from '../../lib/stores/zones';
  import AlbumArt from '../AlbumArt.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';
  import '../../styles/tune-v2.css';

  const level = $derived($preferences.settingsLevel);
  const showFilters = $derived(atLeast(level, 'intermediate'));
  const showBadges = $derived(atLeast(level, 'intermediate'));
  const showExpert = $derived(atLeast(level, 'expert'));

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
    if (q && !fold(a.title).includes(fold(q)) && !fold(a.artist_name).includes(fold(q))) return false;
    return true;
  }

  const sorted = $derived.by(() => {
    const list = [...$albums];
    const byTitle = (a: Album, b: Album) => fold(a.title).localeCompare(fold(b.title));
    switch (sortKey) {
      case 'artist':
        return list.sort((a, b) => fold(a.artist_name).localeCompare(fold(b.artist_name)) || byTitle(a, b));
      case 'year':
        // Sans annee en DERNIER quel que soit le sens : un album non date ne
        // doit pas squatter la tete de liste.
        return list.sort((a, b) => {
          const ya = albumYear(a), yb = albumYear(b);
          if (ya == null && yb == null) return byTitle(a, b);
          if (ya == null) return 1;
          if (yb == null) return -1;
          return yb - ya || byTitle(a, b);
        });
      case 'added':
        return list.sort((a, b) => (b.added_at ?? 0) - (a.added_at ?? 0) || byTitle(a, b));
      default:
        return list.sort(byTitle);
    }
  });
  const matchCount = $derived(sorted.filter(matches).length);

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
  const showTimeline = $derived(atLeast(level, 'intermediate'));

  /** Année retenue pour un album : l'année d'ORIGINE prime sur celle de
   *  réédition — sur du jazz ou du classique, l'écart se compte en décennies
   *  et c'est l'enregistrement qui situe l'œuvre. */
  function albumYear(a: Album): number | null {
    const y = a.original_year ?? a.year ?? null;
    return typeof y === 'number' && y > 1800 && y < 2200 ? y : null;
  }

  let fYear = $state<number | null>(null);

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
  const hasAddedAt = $derived($albums.some((a) => (a.added_at ?? 0) > 0));
  const availableSorts = $derived(SORTS.filter((s2) => s2.k !== 'added' || hasAddedAt));

  // ── Affichage grille / liste ──────────────────────────────────────────
  type Display = 'grid' | 'list';
  let display = $state<Display>('grid');

  /** Histogramme : une barre par année, du minimum au maximum RÉELS de la
   *  bibliothèque — pas une plage fixe, qui laisserait des décennies vides
   *  chez quelqu'un dont la collection commence en 1985. */
  const histogram = $derived.by(() => {
    const counts = new Map<number, number>();
    for (const a of $albums) {
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

  const yearCount = $derived(fYear == null ? 0 : $albums.filter((a) => albumYear(a) === fYear).length);

  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
  function firstLetter(a: Album): string {
    const c = fold(a.title).charAt(0).toUpperCase();
    return c >= 'A' && c <= 'Z' ? c : '#';
  }
  const present = $derived(new Set(sorted.map(firstLetter)));
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
    if (tab === 'albums' || tab === 'tracks') return [] as { key: string; albums: Album[] }[];
    const m = new Map<string, Album[]>();
    for (const a of sorted) {
      if (!matches(a)) continue;
      const k = facetOf(a, tab) ?? FACET_EMPTY[tab];
      const arr = m.get(k); if (arr) arr.push(a); else m.set(k, [a]);
    }
    const out = [...m.entries()].map(([key, albums]) => ({ key, albums }));
    if (tab === 'years') {
      out.sort((x, z) => {
        const nx = Number(x.key), nz = Number(z.key);
        if (Number.isNaN(nx)) return 1;
        if (Number.isNaN(nz)) return -1;
        return nz - nx;   // du plus recent au plus ancien
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
    if (tab !== 'tracks' || tracksLoaded) return;
    tracksLoaded = true;
    tracksLoading = true;
    api.getAllTracks()
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
    api.play(zid, { track_id: t.id }).catch(() => {});
  }
  let opened = $state<Album | null>(null);
  function reset() { fQuality = null; fRate = null; q = ''; fYear = null; }

  // « Aléatoire » — lecture au hasard de toute la bibliothèque, en respectant
  // le filtre texte courant : si l'utilisateur a tapé « jazz », il attend un
  // aléatoire DANS ce qu'il regarde, pas dans les 20 000 titres.
  let shuffling = $state(false);
  async function shuffleAll() {
    const zid = $currentZoneId;
    if (zid == null) return;
    shuffling = true;
    try { await api.shuffleAll(zid, q.trim() ? { search_query: q.trim() } : undefined); }
    catch { /* le serveur signale déjà l'échec */ }
    shuffling = false;
  }
  // « Ajouter » — les dossiers de musique se déclarent dans les Réglages.
  // On y emmène directement plutôt que d'ouvrir un dialogue natif, bannis
  // dans les vues web.
  function addContent() { activeView.set('settings'); }
</script>

<section class="v2-lib tune-v2">
  <header class="top">
    <h1>Bibliothèque</h1>
    <button class="btn" onclick={shuffleAll} disabled={shuffling || $currentZoneId == null}
      title={$currentZoneId == null ? 'Aucune zone active' : 'Lire toute la bibliothèque au hasard'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20 20 4M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>{shuffling ? 'Lancement…' : 'Aléatoire'}
    </button>
    <button class="btn" onclick={addContent} title="Ajouter des dossiers de musique">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Ajouter
    </button>
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
  <div class="filters">
    {#if showFilters}
      <button class="chip count" class:active={!fQuality && !fRate && !q && fYear == null} onclick={reset}>Tout ({matchCount})</button>
      <div class="drop">
        <button class="chip" class:active={fQuality !== null}>Qualité{#if fQuality}&nbsp;· {QUALITIES.find(x => x.key === fQuality)?.label}{/if}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="menu">
          {#each QUALITIES as it (it.key)}
            <button class:on={fQuality === it.key} onclick={() => fQuality = fQuality === it.key ? null : it.key as string}>{it.label}</button>
          {/each}
        </div>
      </div>
      <div class="drop">
        <button class="chip" class:active={fRate !== null}>Fréquence{#if fRate}&nbsp;· {RATES.find(r => r.v === fRate)?.l} kHz{/if}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="menu">
          {#each RATES as r (r.v)}
            <button class:on={fRate === r.v} onclick={() => fRate = fRate === r.v ? null : r.v}>{r.l} kHz</button>
          {/each}
        </div>
      </div>
      {#if showExpert}
        <button class="chip xo">Format<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
        <button class="chip xo">Profondeur<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
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

    {#if showFilters && tab !== 'tracks'}
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
      <div class="bars">
        {#each histogram.bars as b (b.year)}
          <button
            class="tick"
            class:on={fYear === b.year}
            class:vide={b.n === 0}
            title={b.n ? `${b.year} — ${b.n} album${b.n > 1 ? 's' : ''}` : `${b.year} — aucun album`}
            aria-label={`${b.year}, ${b.n} album${b.n > 1 ? 's' : ''}`}
            aria-pressed={fYear === b.year}
            style="--h:{histogram.max ? 34 + Math.round((b.n / histogram.max) * 66) : 34}%"
            onclick={() => (fYear = fYear === b.year ? null : b.year)}
          >
            <!-- Curseur : barre pleine a l'accent, plus haute que le peigne,
                 avec l'annee ecrite a la VERTICALE dedans. C'est lui qui
                 parcourt les annees. -->
            {#if fYear === b.year}<span class="curseur">{b.year}</span>{/if}
          </button>
        {/each}
      </div>
      <div class="decs">
        {#each decades as d (d.year)}
          <span class="dec" style="left:{d.pct}%">{d.year}</span>
        {/each}
      </div>
    </div>
  {/if}

  <div class="body">
    {#if $libraryLoading && sorted.length === 0}
      <div class="state">Chargement de la bibliothèque…</div>
    {:else if sorted.length === 0}
      <div class="state">Votre bibliothèque est vide.</div>
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
        <div class="facets">
          {#each groups as g (g.key)}
            <section class="facet">
              <h2>{g.key}<span class="fc">{g.albums.length}</span></h2>
              <div class="grid facetgrid" class:expert={showExpert}>
                {#each g.albums as a (a.id)}
                  <button class="card" onclick={() => opened = a}>
                    <div class="cover">
                      <AlbumArt coverPath={a.cover_path} albumId={a.id} size={220} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} />
                      {#if showBadges}{#if badge(a)}<span class="bdg">{badge(a)}</span>{/if}{/if}
                    </div>
                    <div class="ct">{a.title}</div>
                    <div class="ca">{a.artist_name ?? ''}</div>
                  </button>
                {/each}
              </div>
            </section>
          {:else}
            <div class="state">Rien à regrouper avec ces filtres.</div>
          {/each}
        </div>

      {:else if display === 'list'}
        <div class="rows" bind:this={gridEl}>
          {#each sorted as a (a.id)}
            <button class="lrow" class:dim={!matches(a)} data-letter={firstLetter(a)} onclick={() => opened = a}>
              <span class="lcv"><AlbumArt coverPath={a.cover_path} albumId={a.id} size={96} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} /></span>
              <span class="lt">{a.title}</span>
              <span class="la">{a.artist_name ?? ''}</span>
              <span class="ly">{albumYear(a) ?? ''}</span>
              {#if showBadges && badge(a)}<span class="bdg flat">{badge(a)}</span>{/if}
              {#if showExpert}<span class="lq">{tech(a)}</span>{/if}
            </button>
          {/each}
        </div>

      {:else}
        <div class="grid" class:expert={showExpert} bind:this={gridEl}>
          {#each sorted as a (a.id)}
            <button class="card" class:dim={!matches(a)} data-letter={firstLetter(a)} onclick={() => opened = a}>
              <div class="cover">
                <AlbumArt coverPath={a.cover_path} albumId={a.id} size={220} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} />
                {#if showBadges}{#key badge(a)}{#if badge(a)}<span class="bdg">{badge(a)}</span>{/if}{/key}{/if}
              </div>
              <div class="ct">{a.title}</div>
              <div class="ca">{a.artist_name ?? ''}</div>
              {#if showExpert}<div class="cq">{tech(a)}</div>{/if}
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  {#if opened}
    <AlbumDetailV2 album={opened} onClose={() => (opened = null)} />
  {/if}
</section>

<style>
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
  .drop:hover .menu{display:flex}
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
  .frise{padding:8px 30px 14px; user-select:none}
  /* Le peigne s'aligne en BAS : les traits partent d'une ligne d'axe commune,
     ce qui donne la regle graduee plutot qu'une suite de batons flottants. */
  .bars{display:flex; align-items:flex-end; gap:3px; height:56px; padding-top:14px}
  .tick{position:relative; flex:1 1 0; min-width:2px; height:var(--h); border:0; padding:0; cursor:pointer;
    border-radius:1px; background:var(--v2-line2); transition:background .12s}
  .tick.vide{background:var(--v2-line); cursor:pointer}
  .tick:hover{background:var(--v2-acc2)}
  /* Le curseur deborde le peigne vers le haut : il doit se voir d'un coup
     d'oeil, pas se confondre avec un trait un peu plus grand. */
  .tick.on{background:transparent}
  .curseur{position:absolute; left:50%; transform:translateX(-50%); bottom:0; top:-14px;
    min-width:15px; display:grid; place-items:center; border-radius:3px;
    background:linear-gradient(180deg,var(--v2-acc1),var(--v2-acc2));
    color:var(--v2-on-acc); font:700 9px var(--v2-mono); letter-spacing:.06em;
    writing-mode:vertical-rl; text-orientation:mixed; padding:3px 0;
    box-shadow:0 2px 10px var(--v2-glow-strong)}
  .decs{position:relative; height:16px; margin-top:9px}
  .dec{position:absolute; transform:translateX(-50%); font:10.5px var(--v2-mono); color:var(--v2-txt3); white-space:nowrap}

  /* Contrôles de droite : tri et bascule d'affichage. */
  .drop.right{margin-left:0}
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
  .lrow.dim{opacity:.22}
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
  .card{border:0; background:transparent; text-align:left; cursor:pointer; padding:0; transition:.18s; opacity:1; color:inherit}
  .card.dim{opacity:.22; filter:saturate(.4)}
  .cover{position:relative; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden; box-shadow:var(--v2-sh-card)}
  .bdg{position:absolute; left:6px; top:6px; font:700 8px var(--v2-mono); letter-spacing:.06em; padding:2px 5px;
    border-radius:3px; background:var(--v2-scrim); color:var(--v2-acc-tint)}
  .ct{margin-top:9px; font:600 12.5px var(--v2-sans); line-height:1.25; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{margin-top:2px; font:11px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .cq{margin-top:4px; font:9.5px var(--v2-mono); color:var(--v2-acc2); letter-spacing:.02em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
</style>
