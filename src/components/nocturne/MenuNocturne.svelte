<script module lang="ts">
  import type { Component } from 'svelte';
  export interface ActionMenu {
    cle: string;
    libelle: string;
    icone?: Component<any>;
    faire: () => void;
    /** Coche (option active). */
    coche?: boolean;
  }
</script>

<script lang="ts">
  /** Menu « … » de Nocturne : un bouton rond, une liste d'actions en surimpression. */
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
  import Check from '@lucide/svelte/icons/check';
  import { t } from '../../lib/i18n';

  interface Props {
    actions: ActionMenu[];
    /** `rond` (page album), `nu` (ligne de piste, barre). */
    forme?: 'rond' | 'nu';
    vertical?: boolean;
    /** Ouvre vers le haut (barre de lecture). */
    versLeHaut?: boolean;
    aligne?: 'gauche' | 'droite';
  }
  let { actions, forme = 'nu', vertical = false, versLeHaut = false, aligne = 'droite' }: Props = $props();

  let ouvert = $state(false);
  let ancre: HTMLDivElement | undefined = $state();

  function fermerSiDehors(e: MouseEvent) {
    if (ouvert && ancre && !ancre.contains(e.target as Node)) ouvert = false;
  }
</script>

<svelte:window onclick={fermerSiDehors} onkeydown={(e) => { if (e.key === 'Escape') ouvert = false; }} />

<div class="noc-menu-ancre" bind:this={ancre}>
  <button type="button" class="noc-menu-bouton" class:rond={forme === 'rond'} aria-haspopup="menu" aria-expanded={ouvert}
    aria-label={$t('v2.cover.more')} title={$t('v2.cover.more')} onclick={() => (ouvert = !ouvert)}>
    {#if vertical}<EllipsisVertical size={16} />{:else}<Ellipsis size={16} />{/if}
  </button>
  {#if ouvert}
    <div class="noc-menu" class:haut={versLeHaut} class:gauche={aligne === 'gauche'} role="menu">
      {#each actions as a (a.cle)}
        {@const Icone = a.icone}
        <button type="button" role="menuitem" onclick={() => { ouvert = false; a.faire(); }}>
          {#if Icone}<Icone size={15} />{/if}
          <span>{a.libelle}</span>
          {#if a.coche}<Check size={14} />{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .noc-menu-ancre { position: relative; display: inline-flex; }
  .noc-menu-bouton {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--noc-texte-2);
    cursor: pointer;
  }
  .noc-menu-bouton:hover { color: var(--noc-texte); }
  .noc-menu-bouton.rond {
    width: var(--noc-hauteur-bouton);
    height: var(--noc-hauteur-bouton);
    border: 1px solid var(--noc-ligne);
  }
  .noc-menu-bouton.rond:hover { background: var(--noc-surface); }
  .noc-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 35;
    min-width: 220px;
    padding: 6px;
    border-radius: var(--noc-rayon-grand);
    border: 1px solid var(--noc-ligne);
    background: var(--noc-surface-2);
    box-shadow: var(--noc-carte-ombre);
  }
  .noc-menu.gauche { right: auto; left: 0; }
  .noc-menu.haut { top: auto; bottom: calc(100% + 6px); }
  .noc-menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 10px;
    border: 0;
    border-radius: var(--noc-rayon);
    background: none;
    color: var(--noc-texte);
    font: inherit;
    font-size: var(--noc-taille-texte);
    text-align: left;
    cursor: pointer;
  }
  .noc-menu button span { flex: 1; }
  .noc-menu button :global(svg) { color: var(--noc-texte-2); }
  .noc-menu button:hover { background: var(--noc-surface-3); }
</style>
