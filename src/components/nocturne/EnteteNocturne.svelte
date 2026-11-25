<script lang="ts">
  /**
   * En-tête : menu, retour, accueil à gauche ; à droite l'état de la liaison
   * au serveur Tune, Aide, Infos et Recherche (écrans de Tune ouverts dans la
   * coquille).
   */
  import Menu from '@lucide/svelte/icons/menu';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import House from '@lucide/svelte/icons/house';
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  import Info from '@lucide/svelte/icons/info';
  import Search from '@lucide/svelte/icons/search';
  import { t } from '../../lib/i18n';
  import { connectionState } from '../../lib/stores/connection';
  import { retour, retourPossible, ouvrirRubrique, ouvrirTune } from './navigationNocturne';

  interface Props { ouvrirTiroir: () => void; tiroirEpingle: boolean }
  let { ouvrirTiroir, tiroirEpingle }: Props = $props();

  const relie = $derived($connectionState === 'connected' || $connectionState === 'polling');
  const etat = $derived(relie ? $t('settings.connected') : $t('nocturne.connexion.horsLigne'));
</script>

<header class="noc-entete">
  {#if !tiroirEpingle}
    <button type="button" class="noc-entete-bouton noc-entete-menu" onclick={ouvrirTiroir} aria-label={$t('v2.nav.menu')} title={$t('v2.nav.menu')}><Menu size={17} /></button>
  {/if}
  {#if $retourPossible}
    <button type="button" class="noc-entete-bouton" onclick={retour} aria-label={$t('v2.nav.precedent')} title={$t('v2.nav.precedent')}><ChevronLeft size={19} /></button>
  {/if}
  <button type="button" class="noc-entete-bouton" onclick={() => ouvrirRubrique({ nom: 'accueil' })} aria-label={$t('nav.home')} title={$t('nav.home')}><House size={18} /></button>

  <div class="noc-entete-droite">
    <span class="noc-entete-liaison" class:relie title={`Tune · ${etat}`}>
      <span class="noc-entete-pastille"></span>Tune
    </span>
    <button type="button" class="noc-entete-bouton" onclick={() => ouvrirTune('support')} aria-label={$t('nocturne.tiroir.aide')} title={$t('nocturne.tiroir.aide')}><CircleHelp size={18} /></button>
    <button type="button" class="noc-entete-bouton" onclick={() => ouvrirTune('diagnostics')} aria-label={$t('v2.menu.info')} title={$t('v2.menu.info')}><Info size={18} /></button>
    <button type="button" class="noc-entete-bouton" onclick={() => ouvrirTune('search')} aria-label={$t('nav.search')} title={$t('nav.search')}><Search size={18} /></button>
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
  .noc-entete-droite { margin-left: auto; display: flex; align-items: center; gap: 12px; }
  .noc-entete-liaison {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-right: 10px;
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-mini);
    font-weight: var(--noc-graisse-forte);
  }
  .noc-entete-liaison.relie { color: var(--noc-texte); }
  .noc-entete-pastille {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--noc-texte-4);
  }
  .noc-entete-liaison.relie .noc-entete-pastille { background: var(--noc-connecte); }
</style>
