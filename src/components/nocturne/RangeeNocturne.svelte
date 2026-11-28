<script lang="ts">
  /**
   * Une rangée thématique : titre doré + compte ; à droite, remonter la rangée
   * (réorganisation de l'accueil), menu de tri, bascule rangée ↔ grille. En
   * grille, la rangée se déplie.
   */
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import ArrowUpToLine from '@lucide/svelte/icons/arrow-up-to-line';
  import ArrowDownWideNarrow from '@lucide/svelte/icons/arrow-down-wide-narrow';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Check from '@lucide/svelte/icons/check';
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
    /** Remonter la rangée d'un cran (absent : pas de bouton). */
    remonter?: (() => void) | null;
    /** Rangée sobre : titre blanc, ni compte ni outils (historique d'écoute). */
    sobre?: boolean;
    /** Afficher le nombre d'albums à côté du titre. */
    compte?: boolean;
  }
  let { titre, albums, triInitial = null, triable = true, grilleInitiale = false, plafond = 24, remonter = null, sobre = false, compte = true }: Props = $props();

  const LIBELLE_TRI: Record<TriNocturne, string> = {
    ajout: 'v2.home.wRecentlyAdded', titre: 'v2.lib.sortTitle', artiste: 'v2.lib.sortArtist', annee: 'v2.lib.sortYear',
  };
  let menuTri = $state(false);
  let ancreTri: HTMLDivElement | undefined = $state();

  let tri = $state<TriNocturne | 'recu'>('recu');
  let grille = $state(false);
  // Non triable : pas de menu ; l'ordre est celui reçu, ou `triInitial` s'il est donné.
  $effect.pre(() => { tri = triable ? (triInitial ?? 'ajout') : (triInitial ?? 'recu'); grille = grilleInitiale; });

  const tries = $derived(tri === 'recu' ? albums : trierAlbums(albums, tri));
  const visibles = $derived(grille ? tries : tries.slice(0, plafond));
</script>

<svelte:window onclick={(e) => { if (menuTri && ancreTri && !ancreTri.contains(e.target as Node)) menuTri = false; }} />

{#if albums.length}
  <section class="noc-rangee" class:sobre>
    <header class="noc-rangee-entete">
      <h2>{titre}</h2>
      {#if compte && !sobre}<span class="noc-rangee-compte">{albums.length}</span>{/if}
      {#if !sobre}
      <div class="noc-rangee-outils">
        {#if remonter}
          <button type="button" class="noc-icone" onclick={remonter} aria-label={$t('nocturne.rangee.remonter')} title={$t('nocturne.rangee.remonter')}>
            <ArrowUpToLine size={15} />
          </button>
        {/if}
        {#if triable && tri !== 'recu'}
          <div class="noc-tri-ancre" bind:this={ancreTri}>
            <button type="button" class="noc-rangee-tri" aria-haspopup="menu" aria-expanded={menuTri} aria-label={$t('v2.menu.sort')}
              onclick={() => (menuTri = !menuTri)}>
              <ArrowDownWideNarrow size={12} /> {$t(LIBELLE_TRI[tri])} <ChevronDown size={12} />
            </button>
            {#if menuTri}
              <div class="noc-tri-menu" role="menu">
                {#each Object.keys(LIBELLE_TRI) as cle (cle)}
                  <button type="button" role="menuitemradio" aria-checked={tri === cle}
                    onclick={() => { tri = cle as TriNocturne; menuTri = false; }}>
                    <span>{$t(LIBELLE_TRI[cle as TriNocturne])}</span>
                    {#if tri === cle}<Check size={13} />{/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
        <button type="button" class="noc-icone" class:actif={grille} onclick={() => (grille = !grille)}
          aria-pressed={grille} aria-label={grille ? $t('v2.pl.viewList') : $t('v2.zones.viewGrid')}>
          {#if grille}<Rows3 size={17} />{:else}<LayoutGrid size={17} />{/if}
        </button>
      </div>
      {/if}
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
    margin-bottom: 16px;
  }
  .noc-rangee-entete h2 {
    margin: 0;
    font-size: var(--noc-taille-section);
    font-weight: var(--noc-graisse-titre);
    letter-spacing: var(--noc-interlettre-titre);
    color: var(--noc-ambre);
  }
  .sobre .noc-rangee-entete h2 { color: var(--noc-texte); }
  .sobre .noc-rangee-entete { min-height: 26px; }
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
  .noc-tri-ancre { position: relative; }
  .noc-tri-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 30;
    min-width: 190px;
    padding: 5px;
    border-radius: var(--noc-rayon-grand);
    border: 1px solid var(--noc-ligne);
    background: var(--noc-surface-2);
    box-shadow: var(--noc-carte-ombre);
  }
  .noc-tri-menu button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: var(--noc-rayon);
    background: none;
    color: var(--noc-texte);
    font: inherit;
    font-size: var(--noc-taille-petit);
    text-align: left;
    cursor: pointer;
  }
  .noc-tri-menu button span { flex: 1; }
  .noc-tri-menu button:hover { background: var(--noc-surface-3); }
  .noc-tri-menu button[aria-checked='true'] { color: var(--noc-ambre); }
  .noc-rangee-tri {
    display: inline-flex;
    align-items: center;
    gap: 6px;
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
