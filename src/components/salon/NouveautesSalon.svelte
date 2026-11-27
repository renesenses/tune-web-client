<script lang="ts">
  /**
   * « Nouveautés pour vous » de l'accueil Roon-like : les parutions des
   * artistes qu'on possède ou qu'on suit, chez les services
   * (`/home/artist-releases`, la même source que l'accueil de Tune).
   *
   * Cartes grises sur trois colonnes : l'artiste en serif, le titre, l'année,
   * la pochette à droite. Quand le service donne un texte de présentation de
   * la première parution, sa carte est haute et le montre. Onglets ALBUMS /
   * SINGLES (« Singles » seulement s'il y en a), flèches, « Plus ».
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { t } from '../../lib/i18n';
  import { bulleTexte } from '../../lib/infobulleTexte';
  import * as api from '../../lib/api';
  import { gestesNavigationService } from '../../lib/stores/navigation';
  import { allerA } from '../../lib/stores/salon';
  import { estSingle, ongletsNouveautes } from '../../lib/accueilRoonLike';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import RangeeSalon from './RangeeSalon.svelte';

  type Sortie = { service: string; source_id: string; title: string; cover_path: string | null; year: number | null; artist_name: string };
  let sorties = $state<Sortie[] | null>(null);
  /** Le texte de présentation de la première parution, s'il existe. */
  let presentation = $state<string | null>(null);
  let onglet = $state<'albums' | 'singles'>('albums');

  const onglets = $derived(ongletsNouveautes((sorties ?? []).map((x) => x.title)));
  $effect(() => { if (!onglets.includes(onglet)) onglet = onglets[0] ?? 'albums'; });
  const liste = $derived((sorties ?? []).filter((x) => (onglet === 'singles') === estSingle(x.title)));
  /** Des pages de cinq (une carte haute et quatre) ou de six. */
  const pages = $derived.by(() => {
    const out: { haute: Sortie | null; autres: Sortie[] }[] = [];
    let reste = [...liste];
    let premiere = true;
    while (reste.length) {
      if (premiere && presentation && onglet === 'albums') {
        out.push({ haute: reste[0], autres: reste.slice(1, 5) });
        reste = reste.slice(5);
      } else {
        out.push({ haute: null, autres: reste.slice(0, 6) });
        reste = reste.slice(6);
      }
      premiere = false;
    }
    return out;
  });

  onMount(() => {
    api.getArtistReleases(24).then(async (g) => {
      sorties = (g ?? []).flatMap((x) => x.releases.map((r) => ({ ...r, artist_name: x.artist_name })));
      const p = sorties.find((x) => !estSingle(x.title));
      if (!p) return;
      try {
        const a = (await api.getStreamingAlbum(p.service, p.source_id)) as unknown as Record<string, unknown>;
        const txt = [a?.description, a?.review, a?.editorial, a?.blurb].find((v) => typeof v === 'string' && v.trim());
        presentation = typeof txt === 'string' ? txt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null;
      } catch { presentation = null; }
    }).catch(() => { sorties = []; });
  });

  function ouvrir(x: Sortie) {
    get(gestesNavigationService)?.ouvrirAlbum({ service: x.service, albumId: x.source_id, titre: x.title, pochette: x.cover_path, artiste: x.artist_name });
  }
</script>

{#if sorties && sorties.length}
  <RangeeSalon titre={$t('roonLike.accueil.nouveautes' as any)} colonnes={1}
    onglets={onglets.map((o) => ({ id: o, libelle: $t(`roonLike.accueil.${o}` as any) }))}
    ongletActif={onglet} onOnglet={(id) => (onglet = id as 'albums' | 'singles')}
    onPlus={() => allerA({ page: 'tune', vue: 'streaming' })}>
    {#each pages as p, i (i)}
      <div class="page" class:avec-haute={!!p.haute}>
        {#if p.haute}
          {@render carte(p.haute, true)}
        {/if}
        {#each p.autres as x (`${x.service}:${x.source_id}`)}
          {@render carte(x, false)}
        {/each}
      </div>
    {/each}
  </RangeeSalon>
{/if}

{#snippet carte(x: Sortie, haute: boolean)}
  <button class="carte" class:haute onclick={() => ouvrir(x)} data-nouveaute>
    <span class="textes">
      <span class="artiste">{x.artist_name}</span>
      <span class="titre">{x.title}</span>
      {#if x.year}<span class="date">{x.year}</span>{/if}
    </span>
    <span class="pochette"><AlbumArt coverPath={x.cover_path} albumId={null} size={0} vignette alt={x.title} /></span>
    {#if haute && presentation}<span class="presentation" use:bulleTexte>{presentation}</span>{/if}
  </button>
{/snippet}

<style>
  .page { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: minmax(var(--s-haut-carte-nouveaute), auto); gap: var(--s-ecart-rangee); align-content: start; }
  .page.avec-haute > .haute { grid-row: span 2; }
  .carte {
    display: grid; grid-template-columns: minmax(0, 1fr) var(--s-pochette-nouveaute); grid-template-rows: auto 1fr; gap: 14px 18px;
    align-items: start; text-align: left; padding: 20px; cursor: pointer; border: 1px solid var(--s-bord-tuile);
    background: var(--s-tuile); color: var(--s-txt); font: inherit; border-radius: var(--s-r-tuile);
  }
  .carte:hover { background: var(--s-survol); }
  .carte.haute { grid-template-columns: minmax(0, 1fr) var(--s-pochette-nouveaute-haute); }
  .textes { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .artiste { font-family: var(--s-police-titre); font-size: var(--s-t-sous-titre); line-height: 1.15; }
  .titre { font-size: var(--s-t-texte); color: var(--s-txt); }
  .date { font-size: var(--s-t-petit); color: var(--s-txt2); }
  .pochette { width: 100%; aspect-ratio: 1; display: block; }
  .pochette :global(.album-art), .pochette :global(img) { width: 100%; height: 100%; border-radius: var(--s-r-pochette); }
  .presentation {
    grid-column: 1 / -1; align-self: end; font-size: var(--s-t-petit); line-height: 1.6; color: var(--s-txt2);
    display: -webkit-box; -webkit-line-clamp: 6; line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden;
  }
  /* Tablette en portrait : 2 colonnes de cartes, comme la référence. */
  @media (min-width: 744px) and (max-width: 1024px) {
    .page { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 760px) {
    .page { grid-template-columns: 1fr; }
    .page.avec-haute > .haute { grid-row: auto; }
  }
</style>
