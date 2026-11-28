<script lang="ts">
  /** Tous les artistes de la bibliothèque : portraits ronds, ordre alphabétique. */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import type { Artist } from '../../lib/types';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import { allerA } from './navigationNocturne';
  import { revelerParTranches } from './revelation';

  let artistes = $state<Artist[]>([]);
  let chargement = $state(true);
  let limite = $state(150);
  let filtre = $state('');

  const comparer = new Intl.Collator(undefined, { sensitivity: 'base' }).compare;

  $effect(() => {
    api.getAllArtists()
      .then((l) => (artistes = (l ?? []).filter((a) => a.id != null).sort((a, b) => comparer(a.sort_name || a.name, b.sort_name || b.name))))
      .catch(() => {})
      .finally(() => (chargement = false));
  });

  const filtres = $derived.by(() => {
    const f = filtre.trim().toLowerCase();
    return f ? artistes.filter((a) => a.name.toLowerCase().includes(f)) : artistes;
  });
  const visibles = $derived(filtres.slice(0, limite));

  function initiales(nom: string): string {
    return nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase() ?? '').join('');
  }
</script>

<div class="noc-page-liste">
  <header class="noc-liste-entete">
    <div>
      <span class="noc-surtitre">{$t('nav.library')}</span>
      <h1>{$t('common.artists')} <span class="noc-liste-compte">{artistes.length || ''}</span></h1>
    </div>
    <input class="noc-liste-filtre" type="search" bind:value={filtre} placeholder={$t('nav.search')} aria-label={$t('nav.search')} />
  </header>

  {#if chargement}
    <p class="noc-vide">{$t('common.loading')}</p>
  {:else if !filtres.length}
    <p class="noc-vide">{$t('common.noResult')}</p>
  {/if}

  <div class="noc-grille-artistes">
    {#each visibles as a (a.id)}
      <button type="button" class="noc-artiste" onclick={() => a.id != null && allerA({ nom: 'artiste', id: a.id })}>
        <span class="noc-artiste-portrait">
          <AlbumArt coverPath={a.image_path} size={0} vignette recadrer alt={a.name} fallbackInitials={initiales(a.name)} />
        </span>
        <span class="noc-artiste-nom" title={a.name}>{a.name}</span>
      </button>
    {/each}
  </div>
  {#if limite < filtres.length}
    <div class="noc-sentinelle" use:revelerParTranches={() => (limite += 150)}></div>
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
  .noc-liste-filtre {
    width: 240px;
    height: 32px;
    padding: 0 12px;
    border-radius: var(--noc-rayon);
    border: 1px solid var(--noc-ligne);
    background: var(--noc-surface);
    color: var(--noc-texte);
    font: inherit;
    font-size: var(--noc-taille-petit);
  }
  .noc-grille-artistes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 28px 18px;
  }
  .noc-artiste {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    font-family: inherit;
    min-width: 0;
  }
  .noc-artiste-portrait {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 50%;
    overflow: hidden;
    background: var(--noc-pochette-fond);
    transition: box-shadow var(--noc-duree);
  }
  .noc-artiste-portrait :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .noc-artiste:hover .noc-artiste-portrait { box-shadow: 0 0 0 2px var(--noc-ambre); }
  .noc-artiste-nom {
    max-width: 100%;
    color: var(--noc-texte);
    font-size: var(--noc-taille-texte);
    font-weight: var(--noc-graisse-forte);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .noc-artiste:hover .noc-artiste-nom { color: var(--noc-ambre); }
  .noc-sentinelle { height: 1px; }
  .noc-vide { color: var(--noc-texte-3); }
</style>
