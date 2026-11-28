<script lang="ts">
  /**
   * Un compositeur (lot 9, 28/11/2026) : grand titre, nombre de compositions,
   * « Lire maintenant » (ses morceaux dans l'ordre de la bibliothèque), le
   * tableau de ses compositions, puis ses albums (la grille de « Mes albums »
   * filtrée sur lui). Pas de teinte propre : la page suit le thème.
   */
  import { onMount } from 'svelte';
  import { t, locale } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import type { Track } from '../../lib/types';
  import { lirePistes } from '../../lib/lectureSalon';
  import { duree, collant } from '../../lib/interfaceSalon';
  import BoutonLireSalon from './BoutonLireSalon.svelte';
  import AlbumsSalon from './AlbumsSalon.svelte';

  let { nom }: { nom: string } = $props();

  let pistes = $state<Track[] | null>(null);
  let total = $state<number | null>(null);
  let grandTitre = $state<HTMLElement | null>(null);

  onMount(() => {
    api.getFilteredTracks({ composer: nom, limit: 500 })
      .then((r) => { pistes = r.items ?? []; total = r.total ?? pistes.length; })
      .catch(() => { pistes = []; total = 0; });
  });

  const ids = $derived((pistes ?? []).flatMap((p) => (p.id == null ? [] : [p.id])));
</script>

<div class="page" data-page-salon="compositeur">
  <div class="s-collant seul" use:collant={grandTitre}><p class="s-collant-titre" aria-hidden="true">{nom}</p></div>
  <p class="surtitre">{$t('roonLike.compositeurs.surtitre' as any)}</p>
  <h1 bind:this={grandTitre} class="s-titre">{nom}</h1>
  <p class="s-compte">{total == null ? '' : $t('roonLike.compositeurs.compositions' as any).replace('{n}', total.toLocaleString($locale))}</p>
  <div class="lire"><BoutonLireSalon lire={() => lirePistes(ids)} aleatoire={() => lirePistes(ids, { aleatoire: true })} desactive={!ids.length} /></div>

  <h2>{$t('roonLike.onglet.compositions' as any)}</h2>
  {#if pistes === null}
    <p class="s-vide">{$t('roonLike.chargement' as any)}</p>
  {:else if !pistes.length}
    <p class="s-vide">{$t('roonLike.compositeurs.aucuneComposition' as any)}</p>
  {:else}
    <ol class="compositions">
      {#each pistes.slice(0, 200) as p, i (p.id ?? i)}
        <li>
          <button class="ligne" onclick={() => lirePistes(ids.slice(i))}>
            <span class="titre" title={p.title}>{p.title}</span>
            <span class="interprete" title={p.artist_name ?? ''}>{p.artist_name ?? ''}</span>
            <span class="album" title={p.album_title ?? ''}>{p.album_title ?? ''}</span>
            <span class="duree">{duree(p.duration_ms)}</span>
          </button>
        </li>
      {/each}
    </ol>
  {/if}

  <h2 class="h2-albums">{$t('roonLike.genre.albums' as any)}</h2>
  <AlbumsSalon compositeur={nom} integre />
</div>

<style>
  .page { padding: 40px var(--s-marge-page) 48px; }
  .surtitre { margin: 0 0 6px; font-size: var(--s-t-mini); letter-spacing: .08em; text-transform: uppercase; color: var(--s-txt2); }
  .lire { margin: 28px 0 40px; }
  h2 { margin: 0 0 14px; font-size: var(--s-t-section); font-weight: 400; border-bottom: 1px solid var(--s-line); padding-bottom: 10px; }
  .h2-albums { margin-top: 40px; }
  .compositions { list-style: none; margin: 0; padding: 0; }
  .ligne {
    width: 100%; display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, 1.2fr) auto; gap: 16px;
    align-items: center; padding: 10px 4px; border: 0; border-bottom: 1px solid var(--s-line); background: none;
    color: var(--s-txt); font: inherit; font-size: var(--s-t-texte); text-align: left; cursor: pointer;
  }
  .ligne:hover { background: var(--s-survol); }
  .titre, .interprete, .album { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .interprete, .album, .duree { color: var(--s-txt2); }
  @media (max-width: 743px) {
    .ligne { grid-template-columns: minmax(0, 1fr) auto; }
    .interprete, .album { display: none; }
  }
</style>
