<script lang="ts">
  /**
   * La barre d'onglets du bas (maquette A) : Écouter, Bibliothèque,
   * Recherche, Favoris, et « Plus », qui ouvre le menu complet — la barre
   * latérale en tiroir, telle quelle. Rien n'est perdu : toutes les vues de
   * l'application restent à deux gestes.
   */
  import { activeView } from '../../../lib/stores/navigation';
  import { tiroirOuvert } from '../../../lib/largeurEcran';
  import { VUE_DE_L_ONGLET, ongletDeLaVue, feuilleMini, type OngletMini } from '../../../lib/vueMini';
  import { t } from '../../../lib/i18n';

  const ONGLETS: { id: OngletMini; cle: string }[] = [
    { id: 'ecouter', cle: 'mini.ecouter' },
    { id: 'bibliotheque', cle: 'nav.library' },
    { id: 'recherche', cle: 'nav.search' },
    { id: 'favoris', cle: 'v2.nav.favorites' },
  ];

  const actif = $derived(ongletDeLaVue($activeView));

  function aller(o: OngletMini) {
    feuilleMini.set(null);
    tiroirOuvert.set(false);
    activeView.set(VUE_DE_L_ONGLET[o]);
  }
</script>

<nav class="onglets" data-onglets-mini>
  {#each ONGLETS as o (o.id)}
    <button class="onglet" class:on={actif === o.id} aria-current={actif === o.id ? 'page' : undefined}
      onclick={() => aller(o.id)} data-onglet={o.id}>
      {#if o.id === 'ecouter'}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>
      {:else if o.id === 'bibliotheque'}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
      {:else if o.id === 'recherche'}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 21s-7-4.5-9.3-9A5.2 5.2 0 0 1 12 6.3 5.2 5.2 0 0 1 21.3 12C19 16.5 12 21 12 21z"/></svg>
      {/if}
      <span>{$t(o.cle as any)}</span>
    </button>
  {/each}
  <button class="onglet" class:on={$tiroirOuvert || actif === null} onclick={() => { feuilleMini.set(null); tiroirOuvert.update((v) => !v); }}
    aria-expanded={$tiroirOuvert} data-onglet="plus">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    <span>{$t('mini.plus' as any)}</span>
  </button>
</nav>

<style>
  .onglets{flex:0 0 56px; display:flex; border-top:1px solid var(--v2-line); background:var(--v2-player2);
    padding-bottom:env(safe-area-inset-bottom, 0px)}
  .onglet{flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px;
    border:0; background:none; cursor:pointer; color:var(--v2-txt3); font:500 10px var(--v2-sans)}
  .onglet svg{width:20px; height:20px}
  .onglet span{max-width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .onglet.on{color:var(--v2-acc1)}
</style>
