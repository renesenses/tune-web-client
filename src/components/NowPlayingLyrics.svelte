<script lang="ts">
  import { seekPositionMs } from '../lib/stores/nowPlaying';

  interface Props {
    loading: boolean;
    lyrics: string | null;
    syncedLines: { time: number; text: string }[];
    karaokeMode: boolean;
    onToggleKaraoke: () => void;
  }
  let { loading, lyrics, syncedLines, karaokeMode, onToggleKaraoke }: Props = $props();

  let karaokePanel = $state<HTMLElement | null>(null);

  let currentLine = $derived.by(() => {
    if (!karaokeMode || syncedLines.length === 0) return -1;
    const pos = $seekPositionMs ?? 0;
    let idx = -1;
    for (let i = 0; i < syncedLines.length; i++) {
      if (syncedLines[i].time <= pos) idx = i;
      else break;
    }
    return idx;
  });

  // Auto-scroll to keep current line centered
  $effect(() => {
    const lineIdx = currentLine;
    if (lineIdx < 0 || !karaokePanel) return;
    const lineEl = karaokePanel.children[lineIdx] as HTMLElement | undefined;
    if (lineEl) {
      lineEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
</script>

<div class="np-lyrics">
  {#if loading}
    <div class="spinner-sm"></div>
  {:else if lyrics || syncedLines.length > 0}
    {#if syncedLines.length > 0}
      <div class="lyrics-toolbar">
        <button
          class="karaoke-toggle"
          class:active={karaokeMode}
          onclick={onToggleKaraoke}
          title={karaokeMode ? 'Texte simple' : 'Karaoké'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
          Karaoké
        </button>
      </div>
    {/if}

    {#if karaokeMode && syncedLines.length > 0}
      <div class="karaoke-panel" bind:this={karaokePanel}>
        {#each syncedLines as line, i}
          <p
            class="karaoke-line"
            class:active={i === currentLine}
            class:past={i < currentLine}
            class:future={i > currentLine}
          >
            {line.text || '♪'}
          </p>
        {/each}
      </div>
    {:else if lyrics}
      <pre class="lyrics-text">{lyrics}</pre>
    {/if}
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
    max-height: 380px;
    overflow-y: auto;
  }
  .lyrics-toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 8px;
  }
  .karaoke-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px solid var(--tune-border);
    border-radius: 12px;
    padding: 2px 10px;
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
    cursor: pointer;
    transition: all 0.15s ease-out;
  }
  .karaoke-toggle:hover, .karaoke-toggle.active {
    color: var(--tune-accent);
    border-color: var(--tune-accent);
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.08);
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

  /* Karaoke panel */
  .karaoke-panel {
    padding: 4px 0;
    text-align: center;
    scroll-behavior: smooth;
  }
  .karaoke-line {
    font-family: var(--font-display);
    font-size: 18px;
    line-height: 2;
    margin: 0;
    padding: 2px 0;
    transition: all 0.35s ease-out;
    color: var(--tune-text-muted);
    opacity: 0.35;
  }
  .karaoke-line.active {
    font-size: 22px;
    font-weight: 700;
    color: var(--tune-accent);
    opacity: 1;
    text-shadow: 0 0 24px rgba(var(--tune-accent-rgb, 99, 102, 241), 0.45);
  }
  .karaoke-line.past {
    color: var(--tune-text-secondary);
    opacity: 0.55;
  }
  .karaoke-line.future {
    opacity: 0.35;
  }
</style>
