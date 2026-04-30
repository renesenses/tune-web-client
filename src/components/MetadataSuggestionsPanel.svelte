<script lang="ts">
  interface Suggestion {
    id: number;
    field: string;
    current_value?: string | null;
    suggested_value: string;
    source: string;
    confidence?: number;
  }

  interface Props {
    suggestions: Suggestion[];
    onAccept: (id: number) => void;
    onReject: (id: number) => void;
    onAcceptAll: () => void;
    onClose: () => void;
  }

  let { suggestions, onAccept, onReject, onAcceptAll, onClose }: Props = $props();
</script>

<div class="suggestions-panel">
  <div class="suggestions-header">
    <h3>Suggestions ({suggestions.length})</h3>
    <button class="action-btn" onclick={onAcceptAll}>Accepter tout (≥90%)</button>
    <button class="action-btn ghost" onclick={onClose}>Fermer</button>
  </div>
  {#each suggestions as s}
    <div class="suggestion-row">
      <span class="suggestion-field">{s.field}</span>
      <span class="suggestion-current">{s.current_value || '—'}</span>
      <span class="suggestion-arrow">→</span>
      <span class="suggestion-value">{s.suggested_value}</span>
      <span class="suggestion-source">{s.source}</span>
      <span class="suggestion-confidence">{Math.round((s.confidence || 0) * 100)}%</span>
      <button class="btn-accept" onclick={() => onAccept(s.id)}>✓</button>
      <button class="btn-reject" onclick={() => onReject(s.id)}>✕</button>
    </div>
  {/each}
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
  .action-btn.ghost { background: transparent; border: 1px solid var(--tune-border); color: var(--tune-text-muted); }
  .suggestion-row {
    display: grid;
    grid-template-columns: 90px minmax(80px, 1fr) auto minmax(80px, 1fr) 80px 50px auto auto;
    gap: 8px;
    padding: 6px;
    align-items: center;
    border-radius: 6px;
    background: rgba(255,255,255,0.02);
    margin-bottom: 4px;
    font-size: 0.85rem;
  }
  .suggestion-field { font-weight: 600; color: var(--tune-text-muted); text-transform: uppercase; font-size: 0.7rem; }
  .suggestion-current { color: var(--tune-text-muted); }
  .suggestion-arrow { color: var(--tune-accent, #00bcd4); }
  .suggestion-value { color: var(--tune-text); font-weight: 500; }
  .suggestion-source { background: rgba(0,188,212,0.15); color: var(--tune-accent, #00bcd4); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; text-align: center; }
  .suggestion-confidence { color: var(--tune-text-muted); font-size: 0.75rem; text-align: right; }
  .btn-accept { background: rgba(34,197,94,0.15); color: #4ade80; border: none; padding: 3px 8px; border-radius: 4px; cursor: pointer; }
  .btn-reject { background: rgba(220,38,38,0.15); color: #f87171; border: none; padding: 3px 8px; border-radius: 4px; cursor: pointer; }
</style>
