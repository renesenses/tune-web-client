<script lang="ts">
  /**
   * Genres de Salon : une mosaïque de tuiles (une large par rangée), chacune
   * illustrée par la pochette d'un album du genre, en noir et blanc teinté,
   * avec son nom en serif. Le clic ouvre les albums du genre.
   */
  import { onMount } from 'svelte';
  import { t, locale } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import { allerA } from '../../lib/stores/salon';
  import { tuileLarge } from '../../lib/interfaceSalon';
  import { comparerAlphabetique } from '../../lib/ordreAlphabetique';
  import IconeSalon from './IconeSalon.svelte';

  type Tri = 'albums' | 'nom';
  let tri = $state<Tri>('albums');
  let triOuvert = $state(false);
  let genres = $state<{ name: string; count: number }[] | null>(null);
  let images = $state<Record<string, string>>({});

  /** Une pochette par genre, chargée à la demande (les 36 premiers). */
  async function illustrer(noms: string[]) {
    for (const nom of noms) {
      if (images[nom] !== undefined) continue;
      images[nom] = '';
      try {
        const r = await api.getAlbumsDetailed({ genre: nom }, 1);
        const c = r.items.find((a) => a.cover_path)?.cover_path;
        if (c) images[nom] = api.artworkUrl(c, 600);
      } catch { /* tuile sans image : le fond du thème */ }
    }
  }

  onMount(() => {
    api.getGenres().then((g) => { genres = g ?? []; }).catch(() => { genres = []; });
  });

  const tries = $derived.by(() => {
    const l = [...(genres ?? [])];
    if (tri === 'nom') l.sort((a, b) => comparerAlphabetique(a.name, b.name));
    else l.sort((a, b) => b.count - a.count);
    return l;
  });
  $effect(() => { void illustrer(tries.slice(0, 36).map((g) => g.name)); });
</script>

<svelte:window onclick={() => (triOuvert = false)} />

<div class="page" data-page-salon="genres">
  <h1 class="s-titre">{$t('nav.genres' as any)}</h1>
  <div class="ancre">
    <button class="tri" onclick={(e) => { e.stopPropagation(); triOuvert = !triOuvert; }} aria-haspopup="menu" aria-expanded={triOuvert}>
      {$t(tri === 'albums' ? 'roonLike.tri.nbAlbums' as any : 'roonLike.tri.nom' as any)} <IconeSalon nom="bas" taille={12} trait={2.4} />
    </button>
    {#if triOuvert}
      <div class="s-menu menu" role="menu">
        <button role="menuitemradio" aria-checked={tri === 'albums'} class:on={tri === 'albums'} onclick={() => (tri = 'albums')}>{$t('roonLike.tri.nbAlbums' as any)}</button>
        <button role="menuitemradio" aria-checked={tri === 'nom'} class:on={tri === 'nom'} onclick={() => (tri = 'nom')}>{$t('roonLike.tri.nom' as any)}</button>
      </div>
    {/if}
  </div>

  {#if genres === null}
    <p class="s-vide">{$t('roonLike.chargement' as any)}</p>
  {:else if !genres.length}
    <p class="s-vide">{$t('roonLike.genres.aucun' as any)}</p>
  {:else}
    <div class="mosaique">
      {#each tries as g, i (g.name)}
        <button class="tuile" class:large={tuileLarge(i)} onclick={() => allerA({ page: 'genre', nom: g.name })}
          title={$t('roonLike.albums.compte' as any).replace('{n}', g.count.toLocaleString($locale))}>
          {#if images[g.name]}<img src={images[g.name]} alt="" loading="lazy" />{/if}
          <span class="voile"></span>
          <span class="nom">{g.name}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page { max-width: var(--s-largeur-accueil); margin: 0 auto; padding: 48px var(--s-marge-fiche) 48px; }
  button { background: none; border: 0; font: inherit; color: inherit; cursor: pointer; padding: 0; }
  .ancre { position: relative; display: inline-block; margin: 14px 0 40px 12px; }
  .tri { display: inline-flex; align-items: center; gap: 6px; font-size: var(--s-t-petit); color: var(--s-txt2); }
  .tri:hover { color: var(--s-txt); }
  .menu { left: 0; top: calc(100% + 6px); }
  .mosaique { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 13px; }
  .tuile {
    position: relative; aspect-ratio: 1; overflow: hidden; display: grid; place-items: center;
    background: var(--s-genre-fond); border-radius: var(--s-r-tuile);
  }
  .tuile.large { grid-column: span 2; aspect-ratio: auto; }
  .tuile img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) contrast(1.05); transition: transform .3s; }
  .tuile:hover img { transform: scale(1.03); }
  .voile { position: absolute; inset: 0; background: var(--s-voile-genre); mix-blend-mode: multiply; }
  .nom {
    position: relative; font-family: var(--s-police-titre); font-size: var(--s-t-genre);
    color: var(--s-sur-photo); text-shadow: var(--s-ombre-texte-photo); padding: 0 12px; text-align: center;
  }
  @media (max-width: 1000px) {
    .mosaique { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .tuile.large { grid-column: span 2; aspect-ratio: 2; }
  }
</style>
