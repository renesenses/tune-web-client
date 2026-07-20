<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    open: boolean;
    onToggle: () => void;
    children: Snippet;
  }
  let { title, open, onToggle, children }: Props = $props();
</script>

<div class="artist-section">
  <button class="artist-section-header" onclick={onToggle}>
    <span class="artist-section-title">{title}</span>
    <svg class="artist-section-chevron" class:open viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="6 9 12 15 18 9" /></svg>
  </button>
  {#if open}
    {@render children()}
  {/if}
</div>

<style>
  .artist-section {
    border-top: 1px solid var(--tune-border);
    padding-top: var(--space-sm);
  }

  .artist-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    background: none;
    border: none;
    padding: var(--space-sm) 0;
    cursor: pointer;
    color: var(--tune-text);
  }

  .artist-section-header:hover {
    color: var(--tune-accent);
  }

  .artist-section-title {
    font-family: var(--font-label);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.3px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .artist-section-chevron {
    transition: transform 0.2s ease-out;
    color: var(--tune-text-muted);
  }

  .artist-section-chevron.open {
    transform: rotate(180deg);
  }
</style>
