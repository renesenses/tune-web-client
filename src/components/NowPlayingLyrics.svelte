<script lang="ts">
  interface Props {
    loading: boolean;
    lyrics: string | null;
  }
  let { loading, lyrics }: Props = $props();
</script>

<div class="np-lyrics">
  {#if loading}
    <div class="spinner-sm"></div>
  {:else if lyrics}
    <pre class="lyrics-text">{lyrics}</pre>
  {:else}
    <p class="lyrics-empty">Aucune parole disponible</p>
  {/if}
</div>

<style>
  .np-lyrics {
    background: rgba(255,255,255,0.04);
    border-radius: 8px;
    padding: 14px;
    margin-top: 8px;
    max-height: 320px;
    overflow-y: auto;
  }
  .lyrics-text {
    margin: 0;
    white-space: pre-wrap;
    font-family: inherit;
    font-size: 0.9rem;
    line-height: 1.6;
    color: var(--tune-text);
  }
  .lyrics-empty {
    color: var(--tune-text-muted, rgba(255,255,255,0.55));
    font-style: italic;
    text-align: center;
    margin: 12px 0;
  }
  .spinner-sm {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255,255,255,0.1);
    border-top-color: var(--tune-accent, #00bcd4);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    margin: 8px auto;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
