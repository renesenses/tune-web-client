<script lang="ts">
  /**
   * Page d'un genre (27/11/2026), mise en page de la référence : un bandeau
   * photo de bord à bord avec le nom en serif et « Lire maintenant », puis les
   * rangées Albums et Sorties récentes, les genres associés en mosaïque, et
   * enfin tous les albums du genre (la grille de « Mes albums », filtrée).
   */
  import { onMount } from 'svelte';
  import { t, locale } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import type { Album } from '../../lib/types';
  import { allerA } from '../../lib/stores/salon';
  import { lireAuHasard } from '../../lib/lectureSalon';
  import { genresAssocies, parAnneeDecroissante } from '../../lib/interfaceSalon';
  import RangeeSalon from './RangeeSalon.svelte';
  import CarteAlbumSalon from './CarteAlbumSalon.svelte';
  import AlbumsSalon from './AlbumsSalon.svelte';
  import BoutonLireSalon from './BoutonLireSalon.svelte';

  let { nom }: { nom: string } = $props();

  let albums = $state<Album[]>([]);
  let total = $state<number | null>(null);
  let voisins = $state<{ name: string; count: number }[]>([]);
  let tous = $state<HTMLElement | null>(null);

  const photo = $derived(albums.find((a) => a.cover_path)?.cover_path ?? null);
  const recents = $derived(parAnneeDecroissante(albums.filter((a) => a.year != null)).slice(0, 20));

  onMount(() => {
    api.getAlbumsDetailed({ genre: nom }, 200).then((r) => {
      total = r.total;
      albums = r.items.map((d) => ({ id: d.album_id, title: d.title ?? '', artist_name: d.album_artist, cover_path: d.cover_path, year: d.year }) as Album);
    }).catch(() => { albums = []; });
    api.getGenres().then((g) => { voisins = genresAssocies(nom, g ?? []); }).catch(() => {});
  });

  function versTous() { tous?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
</script>

<div class="page" data-page-salon="genre">
  <header class="heros">
    {#if photo}<img src={api.artworkUrl(photo, 1200)} alt="" />{/if}
    <span class="voile"></span>
    <div class="sur">
      <h1>{nom}</h1>
      {#if total != null}<p class="compte">{$t('roonLike.albums.compte' as any).replace('{n}', total.toLocaleString($locale))}</p>{/if}
      <BoutonLireSalon lire={() => lireAuHasard({ genre: nom })} />
    </div>
  </header>

  <div class="corps">
    {#if albums.length}
      <RangeeSalon titre={$t('roonLike.genre.albums' as any)} onPlus={versTous}>
        {#each albums.slice(0, 20) as a, i (a.id ?? i)}<CarteAlbumSalon album={a} />{/each}
      </RangeeSalon>
    {/if}
    {#if recents.length > 5}
      <RangeeSalon titre={$t('roonLike.genre.recents' as any)}>
        {#each recents as a, i (a.id ?? i)}<CarteAlbumSalon album={a} surtitre={String(a.year)} />{/each}
      </RangeeSalon>
    {/if}
    {#if voisins.length}
      <section class="voisins">
        <h2>{$t('roonLike.genre.voisins' as any)}</h2>
        <div class="mosaique">
          {#each voisins as g (g.name)}
            <button class="tuile" onclick={() => allerA({ page: 'genre', nom: g.name })}
              title={$t('roonLike.albums.compte' as any).replace('{n}', g.count.toLocaleString($locale))}>
              <span class="nom">{g.name}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}
  </div>

  <section class="tous" bind:this={tous}>
    <h2 class="titre-tous">{$t('roonLike.genre.tous' as any)}</h2>
    <AlbumsSalon genre={nom} integre />
  </section>
</div>

<style>
  .page { padding-bottom: 24px; }
  button { background: none; border: 0; font: inherit; color: inherit; cursor: pointer; }
  /* Bandeau de bord à bord (référence : ~400 px en portrait, ~510 en paysage). */
  .heros { position: relative; height: var(--s-haut-bandeau-artiste); overflow: hidden; background: var(--s-acc-fort); }
  .heros img { width: 100%; height: 100%; object-fit: cover; display: block; filter: grayscale(1) contrast(1.05); }
  .voile { position: absolute; inset: 0; background: var(--s-voile-photo); }
  .sur { position: absolute; left: var(--s-marge-page); right: var(--s-marge-page); bottom: 36px; color: var(--s-sur-photo); }
  h1 { margin: 0 0 6px; font-family: var(--s-police-titre); font-weight: 400; font-size: var(--s-t-titre); line-height: 1.05; text-shadow: var(--s-ombre-texte-photo); }
  .compte { margin: 0 0 18px; font-size: var(--s-t-texte); opacity: .9; }
  .corps { padding: 40px var(--s-marge-page) 0; }
  h2 { margin: 0 0 20px; font-size: var(--s-t-section); font-weight: 400; border-bottom: 1px solid var(--s-line); padding-bottom: 10px; }
  .voisins { margin-bottom: 40px; }
  .mosaique { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s-ecart-rangee); }
  .tuile {
    aspect-ratio: 2.4; border-radius: var(--s-r-pochette, 4px); background: var(--s-tuile);
    display: grid; place-items: center; padding: 0 12px; text-align: center;
    font-family: var(--s-police-titre); font-size: var(--s-t-accroche);
  }
  .tuile:hover { color: var(--s-acc-texte); }
  .titre-tous { margin: 0 var(--s-marge-page) 0; padding-top: 8px; }
  @media (min-width: 744px) and (max-width: 1024px) { .mosaique { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 743px) {
    .heros { height: 300px; }
    .sur { bottom: 24px; }
    .mosaique { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
