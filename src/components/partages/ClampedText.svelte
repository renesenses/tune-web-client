<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t as tr } from '../../lib/i18n';

  interface Props {
    /** Number of lines shown when collapsed. */
    lines?: number;
    /**
     * Reactive key: when it changes (e.g. a new album/artist/playlist is
     * selected) the text is folded back and the overflow is measured again.
     */
    resetKey?: unknown;
    /** Libellé du bouton replié (défaut : `common.showMore`). */
    moreLabel?: string;
    /** Libellé du bouton déplié (défaut : `common.showLess`). */
    lessLabel?: string;
    children: Snippet;
  }
  let { lines = 3, resetKey = undefined, moreLabel = undefined, lessLabel = undefined, children }: Props = $props();

  let el = $state<HTMLDivElement | null>(null);
  let expanded = $state(false);
  // Whether the text needs more than `lines` lines. Measured only while
  // collapsed; kept as-is while expanded so the "Réduire" button never blinks
  // out during the expand → collapse round-trip.
  let overflow = $state(false);

  /**
   * Measures the text UNCLAMPED, then compares with the clamped height.
   *
   * 🔴 Fils 2156 et 2158 (rc2, Windows) : la biographie restait coupée à
   * quatre lignes, sans bouton pour la déplier. L'ancienne mesure lisait
   * `scrollHeight - clientHeight` sur le bloc REPLIÉ : elle suppose que le
   * moteur met en page les lignes cachées et les compte dans `scrollHeight`.
   * Ce n'est pas garanti : le `line-clamp` standard jette les lignes au-delà
   * de la coupe (`continue: discard`), et un texte qui grandit sans changer
   * la hauteur repliée n'était jamais remesuré. Dans les deux cas la mesure
   * rendait « pas de débordement », le bouton ne paraissait pas, et le texte
   * restait coupé pour de bon.
   *
   * On retire donc la classe le temps d'une lecture synchrone (aucune
   * peinture entre les deux, donc pas de clignotement), puis on la remet.
   */
  function measure() {
    const node = el;
    if (!node || expanded) return;
    const clamped = node.clientHeight;
    node.classList.remove('clamped');
    const full = node.scrollHeight;
    node.classList.add('clamped');
    overflow = full - clamped > 1;
  }

  // Re-measure when the underlying text changes.
  $effect(() => {
    void resetKey;
    expanded = false;
    // Wait for the DOM to reflect the new content before measuring.
    queueMicrotask(measure);
  });

  // Re-measure when the container is resized (window, sidebar) — the wrap
  // point changes, so overflow does too — and when the TEXT changes without
  // the box changing size: a biography that grows from four lines to forty
  // keeps the same clamped height, which a ResizeObserver never reports.
  $effect(() => {
    const node = el;
    if (!node) return;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(measure);
    mo?.observe(node, { childList: true, subtree: true, characterData: true });
    measure();
    return () => {
      ro.disconnect();
      mo?.disconnect();
    };
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
    <button type="button" class="clamp-toggle" aria-expanded={expanded} onclick={toggle}>
      {expanded ? (lessLabel ?? $tr('common.showLess')) : (moreLabel ?? $tr('common.showMore'))}
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
