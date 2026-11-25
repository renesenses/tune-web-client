<script lang="ts">
  /** En-tête : menu, retour, accueil à gauche ; zone courante à droite. */
  import Menu from '@lucide/svelte/icons/menu';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import House from '@lucide/svelte/icons/house';
  import { t } from '../../lib/i18n';
  import { currentZone } from '../../lib/stores/zones';
  import { playbackState } from '../../lib/stores/nowPlaying';
  import { retour, retourPossible, ouvrirRubrique } from './navigationNocturne';

  interface Props { ouvrirTiroir: () => void; tiroirEpingle: boolean }
  let { ouvrirTiroir, tiroirEpingle }: Props = $props();
</script>

<header class="noc-entete">
  {#if !tiroirEpingle}
    <button type="button" class="noc-entete-bouton noc-entete-menu" onclick={ouvrirTiroir} aria-label={$t('v2.nav.menu')}><Menu size={17} /></button>
  {/if}
  {#if $retourPossible}
    <button type="button" class="noc-entete-bouton" onclick={retour} aria-label={$t('v2.nav.precedent')}><ChevronLeft size={19} /></button>
  {/if}
  <button type="button" class="noc-entete-bouton" onclick={() => ouvrirRubrique({ nom: 'accueil' })} aria-label={$t('nav.home')}><House size={18} /></button>

  <div class="noc-entete-droite">
    {#if $currentZone}
      <span class="noc-entete-zone">
        <span class="noc-entete-pastille" class:joue={$playbackState === 'playing'}></span>
        {$currentZone.name}
      </span>
    {/if}
  </div>
</header>

<style>
  .noc-entete {
    height: var(--noc-hauteur-entete);
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 var(--noc-marge-page);
    background: var(--noc-fond-entete);
  }
  .noc-entete-bouton {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--noc-texte);
    cursor: pointer;
  }
  .noc-entete-menu { background: var(--noc-surface); }
  .noc-entete-bouton:hover { background: var(--noc-surface-2); }
  .noc-entete-droite { margin-left: auto; display: flex; align-items: center; gap: 18px; }
  .noc-entete-zone {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--noc-texte);
    font-size: var(--noc-taille-mini);
    font-weight: var(--noc-graisse-forte);
  }
  .noc-entete-pastille {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--noc-texte-4);
  }
  .noc-entete-pastille.joue { background: var(--noc-turquoise); }
</style>
