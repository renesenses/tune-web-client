<script lang="ts">
  /**
   * Une rangée thématique : titre ambré + compte, tri, bascule rangée ↔ grille,
   * défilement horizontal par flèches. En grille, la rangée se déplie.
   */
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import Rows3 from '@lucide/svelte/icons/rows-3';
  import { t } from '../../lib/i18n';
  import type { Album } from '../../lib/types';
  import CarteAlbumNocturne from './CarteAlbumNocturne.svelte';
  import { trierAlbums, type TriNocturne } from './triNocturne';

  interface Props {
    titre: string;
    albums: Album[];
    /** Tri de départ quand la rangée est triable (défaut : date d'ajout). Non triable : l'ordre reçu fait foi. */
    triInitial?: TriNocturne | null;
    triable?: boolean;
    grilleInitiale?: boolean;
    /** Nombre de tuiles en mode rangée. */
    plafond?: number;
  }
  let { titre, albums, triInitial = null, triable = true, grilleInitiale = false, plafond = 24 }: Props = $props();

  let tri = $state<TriNocturne | 'recu'>('recu');
  let grille = $state(false);
  $effect.pre(() => { tri = triable ? (triInitial ?? 'ajout') : 'recu'; grille = grilleInitiale; });

  const tries = $derived(tri === 'recu' ? albums : trierAlbums(albums, tri));
  const visibles = $derived(grille ? tries : tries.slice(0, plafond));
</script>

{#if albums.length}
  <section class="noc-rangee">
    <header class="noc-rangee-entete">
      <h2>{titre}</h2>
      <span class="noc-rangee-compte">{albums.length}</span>
      <div class="noc-rangee-outils">
        {#if triable}
          <select class="noc-rangee-tri" bind:value={tri} aria-label={$t('v2.menu.sort')}>
            <option value="ajout">{$t('library.sortAddedDate')}</option>
            <option value="titre">{$t('v2.lib.sortTitle')}</option>
            <option value="artiste">{$t('v2.lib.sortArtist')}</option>
            <option value="annee">{$t('v2.lib.sortYear')}</option>
          </select>
        {/if}
        <button type="button" class="noc-icone" class:actif={grille} onclick={() => (grille = !grille)}
          aria-pressed={grille} aria-label={grille ? $t('v2.pl.viewList') : $t('v2.zones.viewGrid')}>
          {#if grille}<Rows3 size={17} />{:else}<LayoutGrid size={17} />{/if}
        </button>
      </div>
    </header>
    <div class="noc-rangee-piste" class:grille>
      {#each visibles as a (a.id ?? a.title)}
        <div class="noc-rangee-case"><CarteAlbumNocturne album={a} /></div>
      {/each}
    </div>
  </section>
{/if}

<style>
  .noc-rangee { margin-top: var(--noc-ecart-rangees); }
  .noc-rangee:first-child { margin-top: 44px; }
  .noc-rangee-entete {
    display: flex;
    align-items: baseline;
    gap: 9px;
    margin-bottom: 26px;
  }
  .noc-rangee-entete h2 {
    margin: 0;
    font-size: var(--noc-taille-section);
    font-weight: var(--noc-graisse-titre);
    letter-spacing: var(--noc-interlettre-titre);
    color: var(--noc-ambre);
  }
  .noc-rangee-compte {
    font-size: var(--noc-taille-petit);
    font-weight: var(--noc-graisse-moyenne);
    color: var(--noc-texte-2);
    font-variant-numeric: tabular-nums;
  }
  .noc-rangee-outils {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 14px;
    align-self: center;
  }
  .noc-rangee-tri {
    height: 26px;
    padding: 0 8px;
    border-radius: var(--noc-rayon-petit);
    border: 1px solid var(--noc-ligne);
    background: var(--noc-fond);
    color: var(--noc-texte-2);
    font: inherit;
    font-size: var(--noc-taille-mini);
    font-weight: var(--noc-graisse-moyenne);
    cursor: pointer;
  }
  .noc-icone {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: var(--noc-rayon-petit);
    border: 0;
    background: transparent;
    color: var(--noc-texte-3);
    cursor: pointer;
  }
  .noc-icone:hover { color: var(--noc-texte); }
  .noc-icone.actif { color: var(--noc-turquoise); }
  .noc-rangee-piste {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: var(--noc-tuile);
    gap: var(--noc-ecart-tuiles);
    overflow-x: auto;
    scrollbar-width: none;
    scroll-snap-type: x proximity;
    padding-bottom: 2px;
    margin-right: calc(-1 * var(--noc-marge-page));
    padding-right: var(--noc-marge-page);
  }
  .noc-rangee-piste::-webkit-scrollbar { display: none; }
  .noc-rangee-piste.grille {
    grid-auto-flow: row;
    grid-template-columns: repeat(auto-fill, minmax(var(--noc-tuile), 1fr));
    grid-auto-columns: unset;
    row-gap: 32px;
    overflow: visible;
    margin-right: 0;
    padding-right: 0;
  }
  .noc-rangee-case { scroll-snap-align: start; min-width: 0; }
</style>
