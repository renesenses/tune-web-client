<script lang="ts">
  interface Props {
    letters: string[];
    activeLetter?: string;
    onSelect: (letter: string) => void;
  }

  let { letters, activeLetter = '', onSelect }: Props = $props();

  let isDragging = $state(false);

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
    >{letter}</span>
  {/each}
</div>

<style>
  .alpha-index {
    position: absolute;
    right: 2px;
    top: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    z-index: 10;
    padding: 8px 0;
    user-select: none;
    -webkit-user-select: none;
  }

  .alpha-letter {
    font-size: 10px;
    font-weight: 600;
    color: var(--tune-text-muted);
    padding: 1px 6px;
    cursor: pointer;
    text-align: center;
    border-radius: 3px;
    transition: color 0.1s, background 0.1s;
    line-height: 1.4;
  }

  .alpha-letter:hover,
  .alpha-letter.active {
    color: var(--tune-accent);
    background: rgba(var(--tune-accent-rgb, 0, 200, 180), 0.12);
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
