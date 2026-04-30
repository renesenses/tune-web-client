<script lang="ts">
  interface Props {
    duplicates: any[];
    onResolve: (dupId: number, keepTrackId: number | undefined) => void;
    onClose: () => void;
  }

  let { duplicates, onResolve, onClose }: Props = $props();

  function fmtFormat(c: any): string {
    const fmt = c?.format ?? '?';
    const sr = c?.sample_rate ? `${Math.round(c.sample_rate / 1000)}kHz` : '';
    const bd = c?.bit_depth ? `${c.bit_depth}bit` : '';
    return [fmt, sr, bd].filter(Boolean).join(' ');
  }

  function fmtSize(bytes: number): string {
    return (bytes / 1048576).toFixed(1) + ' Mo';
  }
</script>

<div class="duplicates-panel">
  <div class="dup-header">
    <h3>Doublons détectés ({duplicates.length})</h3>
    <button class="action-btn" onclick={onClose}>Fermer</button>
  </div>
  {#each duplicates as d (d.id)}
    <div class="dup-card">
      <div class="dup-card-top">
        <div class="dup-card-title">{d.a?.title || d.track_a_title || '?'}</div>
        {#if d.type === 'album'}
          <span class="dup-badge dup-badge-album">Album complet ({d.album_duplicate_count} pistes)</span>
        {:else}
          <span class="dup-badge dup-badge-track">Piste seule</span>
        {/if}
      </div>
      {#if d.differences?.length > 0}
        <div class="dup-diff-notice">Métadonnées différentes : {d.differences.join(', ')}</div>
      {/if}
      <div class="dup-compare">
        {#each ['a', 'b'] as side}
          {@const c = d[side]}
          {@const fallbackTitle = side === 'a' ? d.track_a_title : d.track_b_title}
          {@const fallbackPath = side === 'a' ? d.track_a_path : d.track_b_path}
          <div class="dup-copy" class:dup-selected={side === 'a'}>
            <div class="dup-copy-label">Copie {side.toUpperCase()}</div>
            <div class="dup-field"><span class="dup-key">Titre</span> <span class:dup-diff={d.differences?.includes('title')}>{c?.title ?? fallbackTitle ?? '—'}</span></div>
            <div class="dup-field"><span class="dup-key">Artiste</span> <span class:dup-diff={d.differences?.includes('artist')}>{c?.artist ?? '—'}</span></div>
            <div class="dup-field"><span class="dup-key">Album</span> <span class:dup-diff={d.differences?.includes('album')}>{c?.album ?? '—'}</span></div>
            <div class="dup-field"><span class="dup-key">Genre</span> <span class:dup-diff={d.differences?.includes('genre')}>{c?.genre ?? '—'}</span></div>
            <div class="dup-field"><span class="dup-key">Année</span> <span class:dup-diff={d.differences?.includes('year')}>{c?.year ?? '—'}</span></div>
            <div class="dup-field"><span class="dup-key">Format</span> <span>{fmtFormat(c)}</span></div>
            <div class="dup-field dup-path">{c?.path ?? fallbackPath ?? ''}</div>
            {#if c?.size}<div class="dup-field"><span class="dup-key">Taille</span> {fmtSize(c.size)}</div>{/if}
            <button class="btn-keep" onclick={() => onResolve(d.id, c?.track_id)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><polyline points="20 6 9 17 4 12" /></svg>
              Garder {side.toUpperCase()}
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .duplicates-panel {
    background: var(--tune-bg-secondary, rgba(255,255,255,0.04));
    border: 1px solid var(--tune-border, rgba(255,255,255,0.1));
    border-radius: 10px;
    padding: 12px;
    margin: 12px 0;
  }
  .dup-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .dup-header h3 { margin: 0; font-size: 0.95rem; }
  .action-btn { background: transparent; border: 1px solid var(--tune-border); color: var(--tune-text-muted); padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; }
  .dup-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 10px; margin-bottom: 8px; }
  .dup-card-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .dup-card-title { font-weight: 600; flex: 1; }
  .dup-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; }
  .dup-badge-album { background: rgba(168,85,247,0.15); color: #c084fc; }
  .dup-badge-track { background: rgba(0,188,212,0.15); color: var(--tune-accent, #00bcd4); }
  .dup-diff-notice { font-size: 0.8rem; color: #fbbf24; margin-bottom: 8px; }
  .dup-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .dup-copy { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 10px; }
  .dup-selected { border-color: var(--tune-accent, #00bcd4); }
  .dup-copy-label { font-size: 0.7rem; color: var(--tune-text-muted); text-transform: uppercase; margin-bottom: 6px; }
  .dup-field { font-size: 0.8rem; padding: 2px 0; }
  .dup-key { color: var(--tune-text-muted); display: inline-block; width: 70px; }
  .dup-diff { color: #fbbf24; font-weight: 500; }
  .dup-path { font-size: 0.7rem; color: var(--tune-text-muted); word-break: break-all; margin-top: 4px; }
  .btn-keep {
    margin-top: 8px;
    background: var(--tune-accent, #00bcd4);
    border: none;
    color: #001;
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
</style>
