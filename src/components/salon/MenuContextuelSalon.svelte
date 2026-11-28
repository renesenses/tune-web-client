<script lang="ts">
  /**
   * Le menu du clic droit de Roon-like (lot 12, 28/11/2026). Un seul, posé au
   * pointeur et gardé dans la fenêtre ; il se ferme au clic ailleurs, à
   * Échap, au défilement et après une action.
   */
  import { tick } from 'svelte';
  import { menuContextuel, fermerMenuContextuel } from '../../lib/stores/menuContextuelSalon';

  let el = $state<HTMLElement | null>(null);
  let pos = $state<{ x: number; y: number }>({ x: 0, y: 0 });

  $effect(() => {
    const m = $menuContextuel;
    if (!m) return;
    pos = { x: m.x, y: m.y };
    void tick().then(() => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      pos = {
        x: Math.max(8, Math.min(m.x, window.innerWidth - r.width - 8)),
        y: Math.max(8, Math.min(m.y, window.innerHeight - r.height - 8)),
      };
      (el.querySelector('[role="menuitem"]') as HTMLElement | null)?.focus();
    });
  });

  function touche(e: KeyboardEvent) {
    if (!$menuContextuel) return;
    if (e.key === 'Escape') { fermerMenuContextuel(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(el?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const n = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[n]?.focus();
    e.preventDefault();
  }
</script>

<svelte:window onclick={() => { if ($menuContextuel) fermerMenuContextuel(); }} onkeydown={touche}
  onscroll={() => { if ($menuContextuel) fermerMenuContextuel(); }} onresize={() => { if ($menuContextuel) fermerMenuContextuel(); }} />

{#if $menuContextuel}
  <div class="s-menu menu-contextuel" role="menu" bind:this={el} data-menu-contextuel
    style:left="{pos.x}px" style:top="{pos.y}px" onclick={(e) => e.stopPropagation()}
    oncontextmenu={(e) => e.preventDefault()}>
    {#if $menuContextuel.titre}<p class="titre" aria-hidden="true" title={$menuContextuel.titre}>{$menuContextuel.titre}</p>{/if}
    {#each $menuContextuel.entrees as en, i (i)}
      <button role="menuitem" onclick={() => { const f = en.faire; fermerMenuContextuel(); f(); }}>{en.libelle}</button>
    {/each}
  </div>
{/if}

<style>
  .menu-contextuel { position: fixed; z-index: 200; }
  .titre {
    margin: 0; padding: 6px 12px 8px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: var(--s-t-mini); color: var(--s-txt2); border-bottom: 1px solid var(--s-line); margin-bottom: 4px;
  }
</style>
