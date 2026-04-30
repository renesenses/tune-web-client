<script lang="ts">
  import { onMount } from 'svelte';
  import * as api from '../lib/api';
  import type { SmartCollection } from '../lib/types';
  import SmartCollectionEditor from './SmartCollectionEditor.svelte';
  import { selectedAlbum, albumTracks, libraryTab } from '../lib/stores/library';
  import { activeView } from '../lib/stores/navigation';

  function navigateToAlbum(album: any) {
    selectedAlbum.set(album);
    api.getAlbumTracks(album.id).then(tracks => {
      albumTracks.set(tracks);
      libraryTab.set('albums');
      activeView.set('library');
    });
  }

  let collections = $state<SmartCollection[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let editing = $state<SmartCollection | null | 'new'>(null);
  let selected = $state<SmartCollection | null>(null);
  let selectedAlbums = $state<any[]>([]);
  let albumsLoading = $state(false);

  async function load() {
    loading = true;
    error = null;
    try {
      collections = await api.listSmartCollections();
    } catch (e: any) {
      error = e?.message ?? 'Failed to load smart collections';
    } finally {
      loading = false;
    }
  }

  async function openCollection(col: SmartCollection) {
    selected = col;
    albumsLoading = true;
    try {
      selectedAlbums = await api.getSmartCollectionAlbums(col.id);
    } catch (e) {
      console.error('open smart collection error', e);
      selectedAlbums = [];
    } finally {
      albumsLoading = false;
    }
  }

  async function deleteCollection(col: SmartCollection, ev: MouseEvent) {
    ev.stopPropagation();
    if (!confirm(`Supprimer la Smart Collection "${col.name}" ?`)) return;
    try {
      await api.deleteSmartCollection(col.id);
      collections = collections.filter(c => c.id !== col.id);
      if (selected?.id === col.id) selected = null;
    } catch (e) {
      console.error('delete smart collection error', e);
    }
  }

  function openEditor(col: SmartCollection | null = null) {
    editing = col ?? 'new';
  }

  function onSaved(saved: SmartCollection) {
    const exists = collections.some(c => c.id === saved.id);
    collections = exists
      ? collections.map(c => c.id === saved.id ? saved : c)
      : [...collections, saved];
    editing = null;
    if (selected?.id === saved.id) {
      // Refresh albums after rule change.
      openCollection(saved);
    }
  }

  function ruleSummary(col: SmartCollection): string {
    try {
      const rules = JSON.parse(col.rules ?? '[]');
      if (!rules.length) return 'aucune règle';
      const parts = rules.slice(0, 2).map((r: any) => {
        if (r.field === 'credit') {
          const v = r.value || {};
          return `crédit: ${v.role || 'tout'}=${v.artist_name || '*'}`;
        }
        return `${r.field} ${r.op} ${typeof r.value === 'object' ? '…' : r.value}`;
      });
      const summary = parts.join(col.match_mode === 'all' ? ' ET ' : ' OU ');
      return rules.length > 2 ? `${summary} … (+${rules.length - 2})` : summary;
    } catch {
      return '';
    }
  }

  onMount(load);
</script>

<section class="sc-view">
  <header class="sc-header">
    <h1>Smart Collections</h1>
    <button class="new-btn" onclick={() => openEditor(null)}>+ Nouvelle Smart Collection</button>
  </header>

  {#if loading}
    <div class="state">…</div>
  {:else if error}
    <div class="state err">{error}</div>
  {:else if !collections.length}
    <div class="state">
      Aucune Smart Collection. Le serveur seed normalement 7 collections par défaut au premier démarrage (Hi-Res, DSD, Récents, Sans pochette, …).
      <div class="cta-row">
        <button class="cta" onclick={() => openEditor(null)}>Créer ma première Smart Collection</button>
      </div>
    </div>
  {:else if !selected}
    <div class="grid">
      {#each collections as col}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="card"
          role="button"
          tabindex="0"
          style:border-left-color={col.color}
          onclick={() => openCollection(col)}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openCollection(col); }}
        >
          <div class="card-head">
            <span class="card-color" style:background={col.color}></span>
            <span class="card-name">{col.name}</span>
            <button class="del" onclick={(e) => deleteCollection(col, e)} title="Supprimer">×</button>
          </div>
          <div class="card-rules">{ruleSummary(col)}</div>
          {#if col.description}<div class="card-desc">{col.description}</div>{/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="detail">
      <div class="detail-head">
        <button class="back" onclick={() => selected = null}>← Retour</button>
        <h2 style:color={selected.color}>{selected.name}</h2>
        <button class="edit-btn" onclick={() => openEditor(selected!)}>Modifier les règles</button>
      </div>
      <div class="detail-rules">{ruleSummary(selected)}</div>
      {#if albumsLoading}
        <div class="state">…</div>
      {:else if !selectedAlbums.length}
        <div class="state">
          Aucun album ne correspond aux règles actuelles.
          <div class="hint">
            Astuce : pour les Smart Collections basées sur des crédits (engineer, performer, …), il faut d'abord enrichir
            les credits via <code>POST /library/enrich-credits</code>.
          </div>
        </div>
      {:else}
        <div class="albums-grid">
          {#each selectedAlbums as alb}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="album-card" role="button" tabindex="0" onclick={() => navigateToAlbum(alb)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigateToAlbum(alb); }}>
              <div class="album-card-art">
                <img class="album-cover-img" src={api.artworkUrl(alb.cover_path, 200)} alt={alb.title} loading="lazy" onerror={(e) => ((e.target as HTMLImageElement).style.display='none')} />
              </div>
              <span class="album-card-title truncate" title={alb.title}>{alb.title}</span>
              {#if alb.artist_name}
                <span class="album-card-artist truncate" title={alb.artist_name}>{alb.artist_name}</span>
              {/if}
              {#if alb.year}<span class="album-card-year">{alb.year}</span>{/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if editing !== null}
    <SmartCollectionEditor
      collection={editing === 'new' ? null : editing}
      onSave={onSaved}
      onCancel={() => editing = null}
    />
  {/if}
</section>

<style>
  .sc-view { padding: 1.5rem; max-width: 1200px; margin: 0 auto; }
  .sc-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.2rem; }
  .sc-header h1 { margin: 0; font-size: 1.5rem; color: var(--tune-text); }
  .new-btn { padding: 0.5rem 1rem; background: var(--tune-accent, #6366f1); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 0.9rem; }
  .new-btn:hover { filter: brightness(1.1); }

  .state { padding: 3rem 2rem; text-align: center; color: var(--tune-text-muted); }
  .state.err { color: #dc2626; }
  .cta-row { margin-top: 1rem; }
  .cta { padding: 0.5rem 1.2rem; background: var(--tune-accent, #6366f1); color: white; border: none; border-radius: 8px; cursor: pointer; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 0.8rem; }
  .card {
    text-align: left; padding: 0.9rem 1rem; background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.06);
    border-left: 4px solid var(--tune-accent, #6366f1);
    border-top: none; border-right: none; border-bottom: none;
    border-radius: 8px; cursor: pointer; transition: background 120ms ease;
  }
  .card:hover { background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.12); }
  .card-head { display: flex; align-items: center; gap: 0.5rem; }
  .card-color { display: inline-block; width: 10px; height: 10px; border-radius: 50%; }
  .card-name { flex: 1; font-weight: 600; color: var(--tune-text); font-size: 0.95rem; }
  .del { background: transparent; border: none; color: var(--tune-text-muted); font-size: 1.1rem; cursor: pointer; opacity: 0.5; }
  .del:hover { opacity: 1; color: #dc2626; }
  .card-rules { font-size: 0.78rem; color: var(--tune-text-muted); margin-top: 0.3rem; line-height: 1.4; }
  .card-desc { font-size: 0.78rem; color: var(--tune-text-muted); margin-top: 0.3rem; font-style: italic; }

  .detail-head { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem; }
  .detail-head h2 { flex: 1; margin: 0; font-size: 1.3rem; }
  .back { background: transparent; border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.4); color: var(--tune-text); padding: 0.35rem 0.8rem; border-radius: 6px; cursor: pointer; }
  .edit-btn { background: var(--tune-accent, #6366f1); color: white; border: none; padding: 0.35rem 0.8rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
  .detail-rules { color: var(--tune-text-muted); font-size: 0.85rem; margin-bottom: 1rem; }
  .hint { margin-top: 0.5rem; font-size: 0.8rem; }
  .hint code { background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.12); padding: 0.1rem 0.4rem; border-radius: 4px; font-family: monospace; }

  .albums-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    grid-auto-rows: min-content;
    gap: var(--space-lg, 1rem);
    align-items: start;
  }
  .album-card {
    display: flex; flex-direction: column; gap: var(--space-xs, 0.25rem);
    background: none; border: none; padding: 0; text-align: left; color: var(--tune-text);
    transition: transform 0.15s ease-out;
    cursor: pointer;
  }
  .album-card:hover { transform: translateY(-2px); }
  .album-card-art {
    position: relative; width: 100%; aspect-ratio: 1;
    border-radius: var(--radius-lg, 8px); overflow: hidden;
    background: var(--tune-grey2, #2a2a2a);
    display: flex; align-items: center; justify-content: center;
  }
  .album-card-art::before {
    content: "♪"; position: absolute; font-size: 32px;
    color: var(--tune-text-muted, #555); opacity: 0.3; z-index: 0;
  }
  .album-cover-img {
    width: 100%; height: 100%; object-fit: cover;
    display: block; position: relative; z-index: 1;
  }
  .album-card-title { font-size: 0.85rem; font-weight: 600; color: var(--tune-text); }
  .album-card-artist { font-size: 0.78rem; color: var(--tune-text-muted); }
  .album-card-year { font-size: 0.72rem; color: var(--tune-text-muted); }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
