<script lang="ts">
  interface Props {
    letters: string[];
    activeLetter?: string;
    onSelect: (letter: string) => void;
    formatLabel?: (key: string) => string;
    // When the index lives inside a single-scroll region (Artists/Genres tabs,
    // where the whole .library-view scrolls as one), pin it so it stays visible
    // on scroll instead of scrolling away with the grid (Benjithom, #1104). The
    // Albums tab keeps its own inner-scrolling viewport, so it leaves this off.
    sticky?: boolean;
  }

  let { letters, activeLetter = '', onSelect, formatLabel, sticky = false }: Props = $props();

  let isDragging = $state(false);
  let compact = $derived(letters.length > 30);

  function handleClick(letter: string) {
    onSelect(letter);
  }

  function handleTouchMove(e: TouchEvent) {
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el && el.dataset.letter) {
      onSelect(el.dataset.letter);
    }
  }

  function handleMouseDown() {
    isDragging = true;
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function handleMouseOver(letter: string) {
    if (isDragging) {
      onSelect(letter);
    }
  }
</script>

<svelte:window onmouseup={handleMouseUp} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="alpha-index"
  class:compact
  class:sticky
  onmousedown={handleMouseDown}
  ontouchmove={handleTouchMove}
  role="navigation"
  aria-label="Alphabetical index"
>
  {#each letters as letter}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span
      class="alpha-letter"
      class:active={activeLetter === letter}
      data-letter={letter}
      onclick={() => handleClick(letter)}
      onmouseover={() => handleMouseOver(letter)}
    >{formatLabel ? formatLabel(letter) : letter}</span>
  {/each}
</div>

<style>
  .alpha-index {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    flex-shrink: 0;
    padding: 4px 2px;
    user-select: none;
    -webkit-user-select: none;
    overflow-y: auto;
    max-height: 100%;
    scrollbar-width: none;
  }

  /* Pin the index to the top of the scroll viewport in single-scroll tabs so it
     doesn't scroll away with the grid (#1104). align-self:flex-start keeps it at
     its content height (not stretched), and the viewport-bounded max-height lets
     long date/letter lists scroll internally on short screens. */
  .alpha-index.sticky {
    position: sticky;
    top: 0;
    align-self: flex-start;
    max-height: calc(100vh - 120px);
  }

  .alpha-index::-webkit-scrollbar {
    display: none;
  }

  .alpha-letter {
    font-size: 10px;
    font-weight: 600;
    color: var(--tune-text-secondary);
    padding: 1px 6px;
    cursor: pointer;
    text-align: center;
    border-radius: 4px;
    transition: color 0.1s, background 0.1s;
    line-height: 1.3;
  }

  .alpha-index.compact .alpha-letter {
    font-size: 8px;
    padding: 0px 4px;
    line-height: 1.15;
  }

  .alpha-letter:hover,
  .alpha-letter.active {
    color: var(--tune-accent);
    background: rgba(var(--tune-accent-rgb, 0, 200, 180), 0.18);
    font-weight: 700;
  }

  @media (max-width: 768px) {
    .alpha-index {
      right: 0;
      padding: 4px 0;
    }

    .alpha-letter {
      font-size: 9px;
      padding: 0.5px 4px;
    }
  }
</style>
