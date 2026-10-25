<!--
  tune-server-rust#6782 — sur la page d'un label : ses artistes.

  1. « Dans ma bibliothèque » : les artistes qui ont au moins un album sous ce
     label, du plus grand nombre d'albums au plus petit, avec leur portrait.
  2. « À découvrir (Qobuz) » : les artistes du catalogue Qobuz du label qui ne
     sont pas dans la bibliothèque, chacun avec son album le plus récent.
     Absente sans compte Qobuz connecté (le serveur n'appelle alors rien).

  Rien ne s'affiche tant que la réponse n'est pas là, ni si le serveur est
  plus ancien (404) : la page du label reste celle d'avant.
-->
<script lang="ts">
  import { get } from 'svelte/store';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import { ouvrirArtisteDepuis } from '../../lib/ouvrirArtisteDepuis';
  import { activeView, gestesNavigationService } from '../../lib/stores/navigation';
  import { ouvrirLabelDeService } from '../../lib/labelDeService';

  interface Props {
    label: string;
  }
  let { label }: Props = $props();

  let reponse = $state<api.ArtistesDuLabel | null>(null);
  let jeton = 0;

  $effect(() => {
    const nom = label;
    const j = ++jeton;
    reponse = null;
    void api.getArtistesDuLabel(nom).then((r) => {
      if (j === jeton) reponse = r;
    });
  });

  const initiales = (n: string) => n.trim().slice(0, 1).toUpperCase();

  function ouvrirLocal(a: api.ArtisteDuLabel) {
    void ouvrirArtisteDepuis({ id: a.id, name: a.name }, get(activeView));
  }

  function ouvrirDecouverte(a: api.ArtisteADecouvrir) {
    if (a.qobuz_artist_id) {
      void ouvrirArtisteDepuis({ source: 'qobuz', source_id: a.qobuz_artist_id, name: a.name }, get(activeView));
      return;
    }
    ouvrirAlbumPhare(a);
  }

  function ouvrirAlbumPhare(a: api.ArtisteADecouvrir) {
    get(gestesNavigationService)?.ouvrirAlbum({
      service: 'qobuz',
      albumId: a.album_phare.id,
      titre: a.album_phare.title,
      pochette: a.album_phare.cover_url ?? null,
      artiste: a.name,
      artisteId: a.qobuz_artist_id ?? null,
    });
  }
</script>

{#if reponse && (reponse.bibliotheque.length > 0 || reponse.decouvrir?.length || reponse.qobuz_label_id)}
  <div class="artistes-du-label" data-artistes-du-label>
    <!-- tune-server-rust#6934 — le catalogue Qobuz du label, quand le serveur
         l'a rapproché : sa page « Label » (albums, artistes, « Voir tout »). -->
    {#if reponse.qobuz_label_id}
      {@const idQobuz = reponse.qobuz_label_id}
      <button type="button" class="catalogue" data-catalogue-qobuz
        onclick={() => ouvrirLabelDeService({ service: 'qobuz', id: idQobuz, nom: label })}>
        {$t('v2.label.catalogueQobuz' as any)}
      </button>
    {/if}
    {#if reponse.bibliotheque.length > 0}
      <section data-section="bibliotheque">
        <h3>{$t('v2.label.artistesBibliotheque' as any)}</h3>
        <ul class="rangee">
          {#each reponse.bibliotheque as a (a.id)}
            <li>
              <button class="artiste" onclick={() => ouvrirLocal(a)} title={a.name}>
                <span class="portrait"><AlbumArt coverPath={a.image_url ?? null} size={0} vignette round alt={a.name} fallbackInitials={initiales(a.name)} /></span>
                <span class="nom">{a.name}</span>
                <span class="compte">{$t('v2.rech.labelAlbums' as any).replace('{n}', String(a.album_count))}</span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
    {#if reponse.decouvrir?.length}
      <section data-section="decouvrir">
        <h3>{$t('v2.label.aDecouvrir' as any)}</h3>
        <ul class="rangee">
          {#each reponse.decouvrir as a (a.name)}
            <li>
              <button class="artiste" onclick={() => ouvrirDecouverte(a)} title={a.name}>
                <span class="portrait carre"><AlbumArt coverPath={a.album_phare.cover_url ?? null} size={0} vignette alt={a.album_phare.title} source="qobuz" fallbackInitials={initiales(a.name)} /></span>
                <span class="nom">{a.name}</span>
                <span class="compte">{$t('v2.rech.labelAlbums' as any).replace('{n}', String(a.album_count))}</span>
              </button>
              <button class="phare" onclick={() => ouvrirAlbumPhare(a)} title={$t('v2.label.albumPhare' as any)}>
                {a.album_phare.year ? `${a.album_phare.title} · ${a.album_phare.year}` : a.album_phare.title}
              </button>
            </li>
          {/each}
        </ul>
        <p class="source">{$t('v2.label.sourceQobuz' as any)}</p>
      </section>
    {/if}
  </div>
{/if}

<style>
  .artistes-du-label { display: flex; flex-direction: column; gap: 14px; margin: 4px 0 16px; }
  h3 { margin: 0 0 8px; font: 600 13px var(--v2-sans, inherit); color: var(--v2-txt2, var(--tune-text-muted)); }
  .rangee { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 12px; }
  li { width: 112px; display: flex; flex-direction: column; gap: 2px; }
  .artiste { all: unset; cursor: pointer; display: flex; flex-direction: column; gap: 4px; }
  .artiste:focus-visible { outline: 2px solid var(--tune-accent); outline-offset: 2px; }
  .portrait { width: 112px; height: 112px; border-radius: 50%; overflow: hidden; display: block; }
  .portrait.carre { border-radius: 6px; }
  .nom { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .compte, .source { font-size: 11px; color: var(--v2-txt2, var(--tune-text-muted)); }
  .phare { all: unset; cursor: pointer; font-size: 11px; color: var(--tune-accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .source { margin: 6px 0 0; }
  .catalogue { all: unset; cursor: pointer; align-self: flex-start; font: 500 12px var(--v2-sans, inherit); color: var(--tune-accent); }
  .catalogue:hover { text-decoration: underline; }
  .catalogue:focus-visible { outline: 2px solid var(--tune-accent); outline-offset: 2px; }
</style>
