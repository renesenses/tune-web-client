<script lang="ts">
  interface Mp3Summary {
    scanned: number;
    ok_files: number;
    missing_files: number;
    issues_found: number;
  }

  interface Props {
    summary: Mp3Summary;
    issues: any[];
    repairing: boolean;
    onRepairAll: () => void;
    onRepairOne: (trackId: number) => void;
    onClose: () => void;
  }

  let { summary, issues, repairing, onRepairAll, onRepairOne, onClose }: Props = $props();
</script>

<div class="suggestions-panel">
  <div class="suggestions-header">
    <h3>Diagnostic MP3 — {summary.issues_found} problème{summary.issues_found > 1 ? 's' : ''} sur {summary.scanned}</h3>
    {#if issues.length > 0}
      <button class="action-btn" onclick={onRepairAll} disabled={repairing}>
        {repairing ? 'Réparation…' : `Réparer les ${issues.length}`}
      </button>
    {/if}
    <button class="action-btn ghost" onclick={onClose}>Fermer</button>
  </div>
  {#if issues.length === 0}
    <div class="state">Tous les MP3 sont sains ({summary.ok_files} fichiers OK).</div>
  {:else}
    <div class="dup-groups">
      {#each issues as iss}
        <div class="suggestion-row">
          <span class="suggestion-source">{iss.issue}</span>
          <div class="row-info">
            <div class="row-title">{iss.title || '—'}</div>
            <div class="row-sub">{iss.artist || '?'} — {iss.album || '?'}</div>
            <div class="row-detail">{iss.detail}</div>
            <div class="row-detail">{iss.path}</div>
          </div>
          <button class="action-btn" onclick={() => onRepairOne(iss.track_id)} disabled={!iss.track_id || iss.issue === 'missing_file'}>Réparer</button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .suggestions-panel {
    background: var(--tune-bg-secondary, rgba(255,255,255,0.04));
    border: 1px solid var(--tune-border, rgba(255,255,255,0.1));
    border-radius: 10px;
    padding: 12px;
    margin: 12px 0;
  }
  .suggestions-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .suggestions-header h3 { margin: 0; flex: 1; font-size: 0.95rem; }
  .action-btn { background: var(--tune-accent, #00bcd4); border: none; color: #001; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; }
  .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .action-btn.ghost { background: transparent; border: 1px solid var(--tune-border); color: var(--tune-text-muted); }
  .state { padding: 12px; color: var(--tune-text-muted, rgba(255,255,255,0.6)); font-style: italic; }
  .dup-groups { display: flex; flex-direction: column; gap: 6px; }
  .suggestion-row {
    display: grid;
    grid-template-columns: 90px 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 6px;
    border-radius: 6px;
    background: rgba(255,255,255,0.02);
  }
  .suggestion-source { background: rgba(220,38,38,0.15); color: #f87171; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; text-align: center; }
  .row-info { min-width: 0; }
  .row-title { font-weight: 600; font-size: 13px; color: var(--tune-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row-sub { font-size: 11px; color: var(--tune-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row-detail { font-size: 10px; color: var(--tune-text-muted); margin-top: 2px; word-break: break-all; }
</style>
