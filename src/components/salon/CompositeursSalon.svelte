<script lang="ts">
  /**
   * Mes compositeurs (lot 9, 28/11/2026), mise en page de la référence : grand
   * titre, compte, Filtrer, puis les compositeurs en portraits ronds (leurs
   * initiales), avec le nombre de morceaux. Les données sont la facette
   * « compositeur » de la bibliothèque ; sans compositeur, un état vide.
   */
  import { onMount } from 'svelte';
  import { t, locale } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import { allerA } from '../../lib/stores/salon';
  import { fold } from '../../lib/utils';
  import { collant } from '../../lib/interfaceSalon';
  import IconeSalon from './IconeSalon.svelte';
  import RondArtisteSalon from './RondArtisteSalon.svelte';

  let compositeurs = $state<{ value: string; count: number }[] | null>(null);
  let filtre = $state('');
  let filtreOuvert = $state(false);
  let grandTitre = $state<HTMLElement | null>(null);

  onMount(() => {
    api.getLibraryFacets(['composer'], undefined, 0)
      .then((r) => { compositeurs = (r?.composer ?? []).filter((c) => c?.value); })
      .catch(() => { compositeurs = []; });
  });

  const visibles = $derived((compositeurs ?? []).filter((c) => !filtre.trim() || fold(c.value).includes(fold(filtre.trim()))));
</script>

<div class="page" data-page-salon="compositeurs">
  <h1 bind:this={grandTitre} class="s-titre">{$t('roonLike.compositeurs.titre' as any)}</h1>
  <p class="s-compte">{compositeurs == null ? '' : $t('roonLike.compositeurs.compte' as any).replace('{n}', compositeurs.length.toLocaleString($locale))}</p>

  <div class="s-collant" use:collant={grandTitre}><p class="s-collant-titre" aria-hidden="true">{$t('roonLike.compositeurs.titre' as any)}</p>
    <div class="outils">
      <span class="espace"></span>
      {#if filtreOuvert}
        <!-- svelte-ignore a11y_autofocus -->
        <input class="s-champ" bind:value={filtre} placeholder={$t('roonLike.filtrer' as any)} autofocus
          onkeydown={(e) => { if (e.key === 'Escape') { filtre = ''; filtreOuvert = false; } }} />
      {:else}
        <button class="filtrer" onclick={() => (filtreOuvert = true)}><IconeSalon nom="recherche" taille={15} />{$t('roonLike.filtrer' as any)}</button>
      {/if}
    </div>
  </div>

  {#if compositeurs === null}
    <p class="s-vide">{$t('roonLike.chargement' as any)}</p>
  {:else if !compositeurs.length}
    <p class="vide-carte" data-compositeurs-vide>{$t('roonLike.compositeurs.aucun' as any)}</p>
  {:else}
    <div class="s-grille grille">
      {#each visibles as c (c.value)}
        <button class="compositeur" onclick={() => allerA({ page: 'compositeur', nom: c.value })}>
          <RondArtisteSalon nom={c.value} />
          <span class="nom" title={c.value}>{c.value}</span>
          <span class="n">{$t('roonLike.compositeurs.morceaux' as any).replace('{n}', c.count.toLocaleString($locale))}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page { padding: 40px var(--s-marge-page) 48px; }
  button { background: none; border: 0; font: inherit; color: inherit; cursor: pointer; padding: 0; }
  .outils { display: flex; align-items: center; gap: 18px; margin: 28px 0; }
  .espace { flex: 1; }
  .filtrer { display: inline-flex; align-items: center; gap: 6px; font-size: var(--s-t-texte); color: var(--s-txt2); }
  .filtrer:hover { color: var(--s-txt); }
  .compositeur { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; text-align: center; }
  .compositeur :global(.rond) { margin-bottom: 6px; }
  .nom { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--s-t-texte); }
  .compositeur:hover .nom { color: var(--s-acc-texte); }
  .n { font-size: var(--s-t-mini); color: var(--s-txt2); }
  .vide-carte {
    margin: 24px 0; padding: 56px 24px; border-radius: var(--s-r-bandeau); background: var(--s-tuile);
    color: var(--s-txt2); text-align: center; font-family: var(--s-police-titre); font-size: var(--s-t-accroche);
  }
</style>
