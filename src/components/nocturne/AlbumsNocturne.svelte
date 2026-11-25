<script lang="ts">
  /** Tous les albums, en grille, avec tri. Rendu progressif (par tranches de 120). */
  import { t } from '../../lib/i18n';
  import { demanderBibliothequeEntiere } from '../../lib/stores/albumsPagines';
  import { albums as albumsBibliotheque, libraryLoading } from '../../lib/stores/library';
  import CarteAlbumNocturne from './CarteAlbumNocturne.svelte';
  import { trierAlbums, type TriNocturne } from './triNocturne';
  import { revelerParTranches } from './revelation';

  let tri = $state<TriNocturne>('ajout');
  let limite = $state(120);

  $effect(() => { void demanderBibliothequeEntiere().catch(() => {}); });

  const tries = $derived(trierAlbums($albumsBibliotheque, tri));
  const visibles = $derived(tries.slice(0, limite));
</script>

<div class="noc-page-liste">
  <header class="noc-liste-entete">
    <div>
      <span class="noc-surtitre">{$t('nav.library')}</span>
      <h1>{$t('common.albums')} <span class="noc-liste-compte">{$albumsBibliotheque.length || ''}</span></h1>
    </div>
    <select class="noc-liste-tri" bind:value={tri} aria-label={$t('v2.menu.sort')} onchange={() => (limite = 120)}>
      <option value="ajout">{$t('library.sortAddedDate')}</option>
      <option value="titre">{$t('v2.lib.sortTitle')}</option>
      <option value="artiste">{$t('v2.lib.sortArtist')}</option>
      <option value="annee">{$t('v2.lib.sortYear')}</option>
    </select>
  </header>

  {#if !$albumsBibliotheque.length && $libraryLoading}
    <p class="noc-vide">{$t('common.loading')}</p>
  {/if}

  <div class="noc-grille">
    {#each visibles as a (a.id ?? a.title)}
      <CarteAlbumNocturne album={a} />
    {/each}
  </div>
  {#if limite < tries.length}
    <div class="noc-sentinelle" use:revelerParTranches={() => (limite += 120)}></div>
  {/if}
</div>

<style>
  .noc-page-liste { padding: 34px 0 40px; }
  .noc-liste-entete {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
  }
  .noc-surtitre {
    font-size: var(--noc-taille-surtitre);
    letter-spacing: var(--noc-interlettre-surtitre);
    text-transform: uppercase;
    font-weight: var(--noc-graisse-forte);
    color: var(--noc-texte-3);
  }
  h1 {
    margin: 2px 0 0;
    font-size: var(--noc-taille-accueil);
    font-weight: var(--noc-graisse-titre);
    letter-spacing: var(--noc-interlettre-titre);
    color: var(--noc-texte);
  }
  .noc-liste-compte {
    font-size: var(--noc-taille-texte);
    font-weight: var(--noc-graisse-moyenne);
    color: var(--noc-ambre);
    vertical-align: middle;
  }
  .noc-liste-tri {
    height: 32px;
    padding: 0 10px;
    border-radius: var(--noc-rayon);
    border: 1px solid var(--noc-ligne);
    background: var(--noc-surface);
    color: var(--noc-texte-2);
    font: inherit;
    font-size: var(--noc-taille-petit);
  }
  .noc-grille {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--noc-tuile), 1fr));
    gap: 26px 18px;
  }
  .noc-sentinelle { height: 1px; }
  .noc-vide { color: var(--noc-texte-3); }
</style>
