<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t as tr } from '../lib/i18n';

  interface Props {
    /** Number of lines shown when collapsed. */
    lines?: number;
    /**
     * Reactive key: when it changes (e.g. a new album/artist/playlist is
     * selected) the overflow measurement is re-run, since the observer only
     * fires on size changes and the container element is reused.
     */
    resetKey?: unknown;
    children: Snippet;
  }
  let { lines = 3, resetKey = undefined, children }: Props = $props();

  let el = $state<HTMLDivElement | null>(null);
  let expanded = $state(false);
  // Whether the text overflows the clamped height. Measured only while
  // collapsed; kept as-is while expanded so the "Réduire" button never blinks
  // out during the expand → collapse round-trip.
  let overflow = $state(false);

  function measure() {
    const node = el;
    if (!node || expanded) return;
    // Clamped: scrollHeight > clientHeight ⇔ some lines are hidden.
    overflow = node.scrollHeight - node.clientHeight > 1;
  }

  // Re-measure when the underlying text changes.
  $effect(() => {
    void resetKey;
    expanded = false;
    // Wait for the DOM to reflect the new content before measuring.
    queueMicrotask(measure);
  });

  // Re-measure when the container is resized (window, sidebar): the wrap point
  // changes, so overflow does too.
  $effect(() => {
    const node = el;
    if (!node) return;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    measure();
    return () => ro.disconnect();
  });

  function toggle() {
    expanded = !expanded;
  }
</script>

<div class="clamp-wrap">
  <div
    bind:this={el}
    class="clamp-text"
    class:clamped={!expanded}
    style="--clamp-lines: {lines}"
  >
    {@render children()}
  </div>
  {#if overflow || expanded}
    <button type="button" class="clamp-toggle" onclick={toggle}>
      {expanded ? $tr('common.showLess') : $tr('common.showMore')}
    </button>
  {/if}
</div>

<style>
  .clamp-wrap {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .clamp-text.clamped {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--clamp-lines, 3);
    line-clamp: var(--clamp-lines, 3);
    overflow: hidden;
  }

  .clamp-toggle {
    margin-top: 4px;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-accent);
  }

  .clamp-toggle:hover {
    text-decoration: underline;
  }
</style>
