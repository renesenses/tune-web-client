<!--
  PlaylistsHub.svelte — POC v0.7.30 unified Playlists tab.

  Four sub-tabs: Mes Playlists (unified library) · Transferts · Liens
  auto-sync · Snapshots. The first tab is fully wired; the rest are
  placeholders that will land progressively v0.7.31 → v0.7.39.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import * as api from '../lib/api';
  import type { Playlist, StreamingPlaylist } from '../lib/types';
  import { streamingServices as streamingServicesStore } from '../lib/stores/streaming';

  type HubTab = 'library' | 'transfers' | 'sync' | 'snapshots';
  let activeTab = $state<HubTab>('library');

  // --- Library state ---
  let localPlaylists = $state<Playlist[]>([]);
  let streamingPlaylists = $state<Record<string, StreamingPlaylist[]>>({});
  let loading = $state(true);
  let searchQuery = $state('');
  let serviceFilter = $state<string>('all'); // 'all' | 'local' | service name

  type UnifiedPlaylist = {
    id: string; // unique key: "local-123" or "tidal-abc"
    name: string;
    source: string; // 'local' | 'tidal' | 'qobuz' | …
    cover_path: string | null;
    track_count: number;
    raw: Playlist | StreamingPlaylist; // for downstream actions
  };

  let unified = $derived.by<UnifiedPlaylist[]>(() => {
    const out: UnifiedPlaylist[] = [];
    for (const p of localPlaylists) {
      out.push({
        id: `local-${p.id}`,
        name: p.name,
        source: 'local',
        cover_path: null,
        track_count: p.track_count ?? 0,
        raw: p,
      });
    }
    for (const [svc, list] of Object.entries(streamingPlaylists)) {
      for (const p of list) {
        out.push({
          id: `${svc}-${p.source_id}`,
          name: p.name,
          source: svc,
          cover_path: p.cover_path ?? null,
          track_count: p.track_count,
          raw: p,
        });
      }
    }
    return out;
  });

  let filtered = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    return unified.filter((p) => {
      if (serviceFilter !== 'all' && p.source !== serviceFilter) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  let serviceCounts = $derived.by(() => {
    const counts: Record<string, number> = { all: unified.length, local: 0 };
    for (const p of unified) counts[p.source] = (counts[p.source] ?? 0) + 1;
    return counts;
  });

  // --- Selection (multi-select via long-press) ---
  let selected = $state<Set<string>>(new Set());
  let selectionMode = $derived(selected.size > 0);

  function toggleSelection(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    selected = next;
  }
  function clearSelection() { selected = new Set(); }

  // --- Detail sheet ---
  let detailPlaylist = $state<UnifiedPlaylist | null>(null);

  function openDetail(p: UnifiedPlaylist) {
    if (selectionMode) {
      toggleSelection(p.id);
    } else {
      detailPlaylist = p;
    }
  }

  function onCardLongPress(p: UnifiedPlaylist) {
    if (!selected.has(p.id)) toggleSelection(p.id);
  }

  // --- Loading ---
  async function loadAll() {
    loading = true;
    try {
      const [local, services] = await Promise.all([
        api.getPlaylists().catch(() => []),
        api.getStreamingServices().catch(() => ({})),
      ]);
      localPlaylists = local;
      // Pull each authenticated streaming service's playlists in parallel.
      const auths = Object.entries(services as any)
        .filter(([_, s]: any) => s?.authenticated)
        .map(([name]) => name);
      const fetched: Record<string, StreamingPlaylist[]> = {};
      await Promise.all(auths.map(async (svc) => {
        try {
          fetched[svc] = await api.getStreamingPlaylists(svc);
        } catch {
          fetched[svc] = [];
        }
      }));
      streamingPlaylists = fetched;
    } finally {
      loading = false;
    }
  }

  onMount(loadAll);

  // --- Service color palette (reused inside cards + filter chips) ---
  const serviceColor: Record<string, string> = {
    local: '#6366f1',
    tidal: '#000000',
    qobuz: '#0070d8',
    spotify: '#1db954',
    deezer: '#a238ff',
    youtube: '#ff0000',
    amazon: '#00a8e1',
    apple: '#fa243c',
  };
  const serviceLabel: Record<string, string> = {
    local: 'Local',
    tidal: 'Tidal',
    qobuz: 'Qobuz',
    spotify: 'Spotify',
    deezer: 'Deezer',
    youtube: 'YouTube',
    amazon: 'Amazon',
    apple: 'Apple Music',
  };

  // Long-press detection (touch + mouse)
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  function startPress(p: UnifiedPlaylist) {
    pressTimer = setTimeout(() => {
      onCardLongPress(p);
      pressTimer = null;
    }, 450);
  }
  function endPress() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  }
</script>

<div class="hub">
  <!-- ── Header ─────────────────────────────────────── -->
  <header class="hub-header">
    {#if selectionMode}
      <button class="icon-btn" onclick={clearSelection} aria-label="Annuler">✕</button>
      <h2>{selected.size} sélectionnée{selected.size > 1 ? 's' : ''}</h2>
      <div class="actions">
        <button class="icon-btn" title="Transférer">→</button>
        <button class="icon-btn" title="Backup">💾</button>
        <button class="icon-btn" title="Supprimer">🗑</button>
      </div>
    {:else}
      <h2>Playlists</h2>
      <div class="actions">
        <button class="icon-btn" title="Nouveau transfert" aria-label="Nouveau transfert">+</button>
      </div>
    {/if}
  </header>

  <!-- ── Sub-tabs ───────────────────────────────────── -->
  <nav class="tabs" role="tablist">
    <button class="tab" class:active={activeTab === 'library'}
            onclick={() => activeTab = 'library'} role="tab">Mes Playlists</button>
    <button class="tab" class:active={activeTab === 'transfers'}
            onclick={() => activeTab = 'transfers'} role="tab">Transferts</button>
    <button class="tab" class:active={activeTab === 'sync'}
            onclick={() => activeTab = 'sync'} role="tab">Liens auto-sync</button>
    <button class="tab" class:active={activeTab === 'snapshots'}
            onclick={() => activeTab = 'snapshots'} role="tab">Snapshots</button>
  </nav>

  <!-- ── Tab content ────────────────────────────────── -->
  {#if activeTab === 'library'}
    <!-- Filter chips -->
    <div class="chips">
      {#each ['all', 'local', ...Object.keys(streamingPlaylists)] as svc (svc)}
        <button
          class="chip"
          class:active={serviceFilter === svc}
          style:--chip-color={serviceColor[svc] ?? '#888'}
          onclick={() => serviceFilter = svc}
        >
          {svc === 'all' ? 'Toutes' : serviceLabel[svc] ?? svc}
          <span class="count">{serviceCounts[svc] ?? 0}</span>
        </button>
      {/each}
    </div>

    <!-- Search -->
    <div class="search">
      <input
        type="search"
        placeholder="Rechercher dans {filtered.length} playlist{filtered.length > 1 ? 's' : ''}…"
        bind:value={searchQuery}
      />
    </div>

    <!-- List -->
    <div class="grid">
      {#if loading}
        <div class="loading">Chargement…</div>
      {:else if filtered.length === 0}
        <div class="empty">Aucune playlist ne correspond.</div>
      {:else}
        {#each filtered as p (p.id)}
          {@const checked = selected.has(p.id)}
          <button
            class="card"
            class:selected={checked}
            onclick={() => openDetail(p)}
            onmousedown={() => startPress(p)}
            onmouseup={endPress}
            onmouseleave={endPress}
            ontouchstart={() => startPress(p)}
            ontouchend={endPress}
          >
            <div class="cover" style:background={serviceColor[p.source] ?? '#444'}>
              <div class="cover-inner">
                {#if p.cover_path}
                  <img src={p.cover_path} alt="" loading="lazy" />
                {:else}
                  <span class="cover-fallback">♪</span>
                {/if}
              </div>
              <span class="cover-badge" style:--badge-color={serviceColor[p.source]} title={serviceLabel[p.source] ?? p.source}>
                {(serviceLabel[p.source] ?? p.source).slice(0, 1)}
              </span>
              {#if checked}
                <span class="check">✓</span>
              {/if}
            </div>
            <div class="name" title={p.name}>{p.name}</div>
            <div class="sub">
              <span class="badge" style:--badge-color={serviceColor[p.source]}>{serviceLabel[p.source] ?? p.source}</span>
              <span class="trk">{p.track_count} trk</span>
            </div>
          </button>
        {/each}
      {/if}
    </div>

    <!-- FAB quick-play -->
    <button class="fab" title="Lire dans la zone active" aria-label="Lire">⏵</button>

  {:else if activeTab === 'transfers'}
    <div class="placeholder">
      <h3>Transferts</h3>
      <p>Wizard de transfert cross-service — arrive en <strong>v0.7.30</strong> avec
        le matching ISRC + AcoustID. Pour l'instant utilise l'ancienne UI
        Playlist Manager.</p>
    </div>

  {:else if activeTab === 'sync'}
    <div class="placeholder">
      <h3>Liens auto-sync</h3>
      <p>Sync bidirectionnel entre playlists de services différents — arrive en
        <strong>v0.7.32</strong> avec la résolution de conflits.</p>
    </div>

  {:else if activeTab === 'snapshots'}
    <div class="placeholder">
      <h3>Snapshots</h3>
      <p>Timeline des versions de chaque playlist + diff visuel — arrive en
        <strong>v0.7.33</strong>.</p>
    </div>
  {/if}
</div>

<!-- Detail bottom sheet -->
{#if detailPlaylist}
  <div class="sheet-backdrop" onclick={() => detailPlaylist = null} role="presentation"></div>
  <div class="sheet" role="dialog" aria-label="Détail playlist">
    <div class="sheet-handle"></div>
    <header class="sheet-header">
      <div class="sheet-cover" style:background={serviceColor[detailPlaylist.source] ?? '#444'}>
        {#if detailPlaylist.cover_path}
          <img src={detailPlaylist.cover_path} alt="" />
        {:else}
          <span class="cover-fallback big">♪</span>
        {/if}
      </div>
      <div class="sheet-meta">
        <div class="sheet-name">{detailPlaylist.name}</div>
        <div class="sheet-sub">
          <span class="badge" style:--badge-color={serviceColor[detailPlaylist.source]}>
            {serviceLabel[detailPlaylist.source] ?? detailPlaylist.source}
          </span>
          · {detailPlaylist.track_count} tracks
        </div>
      </div>
    </header>
    <div class="sheet-actions">
      <button class="action primary">⏵ Lire dans la zone active</button>
      <button class="action">+ Ajouter à la file</button>
      <div class="action-row">
        <button class="action small">Transférer →</button>
        <button class="action small">↻ Lier auto-sync</button>
      </div>
      <div class="action-row">
        <button class="action small">💾 Backup</button>
        <button class="action small">⇄ Comparer</button>
      </div>
    </div>
    <div class="sheet-tracks">
      <p class="muted">Liste des tracks à venir dans la prochaine itération.</p>
    </div>
  </div>
{/if}

<style>
  .hub {
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--tune-text);
    background: var(--tune-bg);
  }
  .hub-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1rem 0.5rem;
  }
  .hub-header h2 { flex: 1; margin: 0; font-size: 1.25rem; font-weight: 600; }
  .actions { display: flex; gap: 0.25rem; }
  .icon-btn {
    background: var(--tune-surface);
    color: var(--tune-text);
    border: none;
    border-radius: 50%;
    width: 36px; height: 36px;
    font-size: 1.1rem;
    cursor: pointer;
  }
  .icon-btn:hover { background: var(--tune-surface-2, #2a2a2a); }

  .tabs {
    display: flex;
    overflow-x: auto;
    border-bottom: 1px solid var(--tune-divider, #333);
    padding: 0 0.5rem;
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar { display: none; }
  .tab {
    background: transparent;
    color: var(--tune-text-secondary, #aaa);
    border: none;
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
  }
  .tab.active {
    color: var(--tune-accent, #6366f1);
    border-bottom-color: var(--tune-accent, #6366f1);
  }

  .chips {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding: 0.75rem 1rem;
    scrollbar-width: none;
  }
  .chips::-webkit-scrollbar { display: none; }
  .chip {
    background: var(--tune-surface);
    color: var(--tune-text);
    border: 1px solid var(--tune-divider, #333);
    border-radius: 999px;
    padding: 0.35rem 0.75rem;
    font-size: 0.8rem;
    cursor: pointer;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .chip.active {
    background: var(--chip-color);
    color: white;
    border-color: var(--chip-color);
  }
  .chip .count {
    background: rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    padding: 0 0.4rem;
    font-size: 0.7rem;
    min-width: 1.4em;
    text-align: center;
  }
  .chip:not(.active) .count {
    background: var(--tune-divider, #333);
  }

  .search { padding: 0 1rem 0.5rem; }
  .search input {
    width: 100%;
    background: var(--tune-surface);
    color: var(--tune-text);
    border: 1px solid var(--tune-divider, #333);
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
    font-size: 0.9rem;
  }

  .grid {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 1rem 5rem;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.75rem;
    align-content: start;
  }
  @media (min-width: 600px) {
    .grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
  }
  @media (min-width: 1200px) {
    .grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
  }
  .loading, .empty {
    grid-column: 1 / -1;
    color: var(--tune-text-secondary, #888);
    text-align: center;
    padding: 2rem;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    background: var(--tune-surface);
    border: 1px solid transparent;
    border-radius: 10px;
    padding: 0.5rem;
    cursor: pointer;
    transition: border-color 80ms, transform 80ms;
    text-align: left;
    color: inherit;
    overflow: hidden;
  }
  .card:hover {
    border-color: var(--tune-divider, #333);
    transform: translateY(-2px);
  }
  .card.selected {
    border-color: var(--tune-accent, #6366f1);
    background: color-mix(in srgb, var(--tune-accent, #6366f1) 12%, var(--tune-surface));
  }

  .cover {
    /* padding-bottom 100% trick: makes the box square based on its
       parent's width. More reliable than aspect-ratio across the
       browsers our testers actually run. */
    width: 100%;
    height: 0;
    padding-bottom: 100%;
    border-radius: 8px;
    overflow: hidden;
    position: relative;
    flex-shrink: 0;
  }
  .cover-inner {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .cover img { width: 100%; height: 100%; object-fit: cover; }
  .cover-fallback {
    color: rgba(255, 255, 255, 0.85);
    font-size: 2.4rem;
  }
  .cover-fallback.big { font-size: 3rem; }
  .cover-badge {
    position: absolute;
    top: 0.4rem;
    left: 0.4rem;
    background: var(--badge-color, rgba(0, 0, 0, 0.7));
    color: white;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 700;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  .check {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    font-weight: bold;
  }

  .card .name {
    font-weight: 500;
    font-size: 0.9rem;
    color: var(--tune-text, #f5f5f5);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card .sub {
    font-size: 0.7rem;
    color: var(--tune-text-secondary, #aaa);
    display: flex;
    gap: 0.4rem;
    align-items: center;
    justify-content: space-between;
  }
  .badge {
    background: var(--badge-color, #444);
    color: white;
    padding: 0.05rem 0.4rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 500;
  }

  .fab {
    position: absolute;
    right: 1rem;
    bottom: 5rem;
    width: 56px; height: 56px;
    border-radius: 50%;
    border: none;
    background: var(--tune-accent, #6366f1);
    color: white;
    font-size: 1.4rem;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }
  .fab:hover { transform: scale(1.05); }

  .placeholder {
    flex: 1;
    padding: 2rem 1.5rem;
    color: var(--tune-text-secondary, #aaa);
  }
  .placeholder h3 { color: var(--tune-text); margin-top: 0; }

  /* Bottom sheet */
  .sheet-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.55);
    z-index: 90;
  }
  .sheet {
    position: fixed;
    left: 0; right: 0; bottom: 0;
    max-height: 80vh;
    background: var(--tune-bg);
    border-top-left-radius: 18px;
    border-top-right-radius: 18px;
    box-shadow: 0 -6px 24px rgba(0,0,0,0.5);
    z-index: 91;
    display: flex;
    flex-direction: column;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .sheet-handle {
    width: 40px; height: 4px;
    background: var(--tune-divider, #333);
    border-radius: 2px;
    margin: 0.6rem auto 0.4rem;
  }
  .sheet-header {
    display: flex;
    gap: 0.75rem;
    padding: 0.5rem 1rem 0.75rem;
  }
  .sheet-cover {
    width: 64px; height: 64px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .sheet-cover img { width: 100%; height: 100%; object-fit: cover; }
  .sheet-meta { flex: 1; min-width: 0; }
  .sheet-name { font-size: 1.05rem; font-weight: 600; }
  .sheet-sub { font-size: 0.85rem; color: var(--tune-text-secondary, #888); margin-top: 0.2rem; }

  .sheet-actions {
    padding: 0.5rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .action-row { display: flex; gap: 0.5rem; }
  .action {
    flex: 1;
    background: var(--tune-surface);
    color: var(--tune-text);
    border: 1px solid var(--tune-divider, #333);
    border-radius: 8px;
    padding: 0.7rem;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .action.primary {
    background: var(--tune-accent, #6366f1);
    color: white;
    border-color: var(--tune-accent, #6366f1);
  }
  .action.small { padding: 0.55rem; font-size: 0.85rem; }
  .action:hover { background: var(--tune-surface-2, #2a2a2a); }
  .action.primary:hover { filter: brightness(1.08); }

  .sheet-tracks { padding: 0.75rem 1rem 1.5rem; }
  .muted { color: var(--tune-text-secondary, #888); font-size: 0.85rem; }
</style>
