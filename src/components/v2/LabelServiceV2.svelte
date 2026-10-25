<!--
  tune-server-rust#6934 — la page « Label » d'un service (Qobuz), demandée par
  Pascal Lahet (fils 2420 et 2421) d'après Qobuz Connect.

  - Albums : la première page du catalogue (`GET /streaming/{service}/labels/{id}`),
    un aperçu puis « Voir tout », qui lit la suite page par page.
  - Artistes : `GET /streaming/{service}/labels/{id}/artists`, un aperçu puis
    « Voir tout ». Absents sur un serveur plus ancien : la page garde ses albums.
  - Lien vers le même label dans la Bibliothèque, quand il y est.

  Pas de rangée « Récompensés » : l'API Qobuz que lit Tune ne donne pas les
  albums récompensés d'un label (voir `lib/labelDeService.ts`).
-->
<script lang="ts">
  import { get } from 'svelte/store';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import { ficheLabelService } from '../../lib/stores/streaming';
  import { activeView, gestesNavigationService } from '../../lib/stores/navigation';
  import { ouvrirArtisteDepuis } from '../../lib/ouvrirArtisteDepuis';
  import { ouvrirLabelDansLaBibliotheque } from '../../lib/artistesDuLabel';
  import {
    ALBUMS_EN_APERCU, ARTISTES_EN_APERCU, fermerLabelDeService, labelDeLaBibliotheque, pageSuivante,
  } from '../../lib/labelDeService';
  import type { Album } from '../../lib/types';

  let page = $state<api.StreamingLabelPage | null>(null);
  let albums = $state<Album[]>([]);
  let artistes = $state<api.ArtisteADecouvrir[] | null>(null);
  let echec = $state(false);
  let enCours = $state(false);
  let tousLesAlbums = $state(false);
  let tousLesArtistes = $state(false);
  let labelLocal = $state<string | null>(null);
  let jeton = 0;

  const cible = $derived($ficheLabelService);
  const nom = $derived(page?.name || cible?.nom || '');

  $effect(() => {
    const c = cible;
    const j = ++jeton;
    page = null; albums = []; artistes = null; echec = false;
    tousLesAlbums = false; tousLesArtistes = false; labelLocal = null;
    if (!c) return;
    enCours = true;
    void api.getStreamingLabel(c.service, c.id).then((p) => {
      if (j !== jeton) return;
      enCours = false;
      if (!p) { echec = true; return; }
      page = p;
      albums = p.albums;
      void api.getLibraryLabels().then((labels) => {
        if (j === jeton) labelLocal = labelDeLaBibliotheque(c.id, p.name || c.nom, labels);
      });
    });
    void api.getStreamingLabelArtists(c.service, c.id).then((r) => {
      if (j === jeton) artistes = r?.artists ?? null;
    });
  });

  const suivante = $derived(pageSuivante(page));
  const albumsMontres = $derived(tousLesAlbums ? albums : albums.slice(0, ALBUMS_EN_APERCU));
  const artistesMontres = $derived(
    artistes ? (tousLesArtistes ? artistes : artistes.slice(0, ARTISTES_EN_APERCU)) : [],
  );

  async function chargerLaSuite() {
    const c = cible;
    const debut = suivante;
    if (!c || debut == null || enCours) return;
    const j = jeton;
    enCours = true;
    const p = await api.getStreamingLabel(c.service, c.id, debut);
    if (j !== jeton) return;
    enCours = false;
    if (!p) return;
    page = p;
    const vus = new Set(albums.map((a) => a.source_id));
    albums = [...albums, ...p.albums.filter((a) => !vus.has(a.source_id))];
  }

  function voirTousLesAlbums() {
    tousLesAlbums = true;
    if (albums.length <= ALBUMS_EN_APERCU && suivante != null) void chargerLaSuite();
  }

  function ouvrirAlbum(a: Album) {
    const c = cible;
    if (!c || !a.source_id) return;
    get(gestesNavigationService)?.ouvrirAlbum({
      service: c.service,
      albumId: a.source_id,
      titre: a.title,
      pochette: a.cover_path ?? null,
      artiste: a.artist_name ?? null,
      artisteId: (a as any).artist_id != null ? String((a as any).artist_id) : null,
    });
  }

  function ouvrirArtiste(a: api.ArtisteADecouvrir) {
    const c = cible;
    if (!c) return;
    if (a.qobuz_artist_id) {
      void ouvrirArtisteDepuis({ source: c.service, source_id: a.qobuz_artist_id, name: a.name }, get(activeView));
      return;
    }
    get(gestesNavigationService)?.ouvrirAlbum({
      service: c.service,
      albumId: a.album_phare.id,
      titre: a.album_phare.title,
      pochette: a.album_phare.cover_url ?? null,
      artiste: a.name,
      artisteId: null,
    });
  }

  function versLaBibliotheque() {
    const l = labelLocal;
    if (!l) return;
    ficheLabelService.set(null);
    void ouvrirLabelDansLaBibliotheque(l);
  }

  const initiales = (n: string | null | undefined) => (n ?? '').trim().slice(0, 1).toUpperCase();
</script>

<div class="v2-label tune-v2" data-page-label>
  <button class="close" onclick={fermerLabelDeService} aria-label={$t('v2.label.retour' as any)}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
  </button>

  {#if cible}
    <header class="tete">
      <span class="logo"><AlbumArt coverPath={page?.image_url ?? null} size={0} vignette alt={nom} source={cible.service} fallbackInitials={initiales(nom)} /></span>
      <div class="meta">
        <div class="surtitre">{$t('v2.label.qobuzTitre' as any)}</div>
        <h1>{nom}</h1>
        {#if page}
          <div class="faits">{$t('v2.label.albumsTotal' as any).replace('{n}', String(page.total))}</div>
        {/if}
        {#if labelLocal}
          <button type="button" class="lien" data-label-bibliotheque onclick={versLaBibliotheque}>{$t('v2.label.dansMaBibliotheque' as any)}</button>
        {/if}
      </div>
    </header>

    {#if echec}
      <p class="vide" data-label-echec>{$t('v2.label.indisponible' as any)}</p>
    {:else if !page}
      <p class="vide">{$t('v2.label.chargement' as any)}</p>
    {/if}

    {#if albums.length > 0}
      <section data-section="albums">
        <div class="titre-section">
          <h2>{$t('v2.label.albums' as any)}</h2>
          {#if !tousLesAlbums && (albums.length > ALBUMS_EN_APERCU || suivante != null)}
            <button type="button" class="lien" data-voir-tout="albums" onclick={voirTousLesAlbums}>{$t('v2.label.voirTout' as any)}</button>
          {:else if tousLesAlbums}
            <button type="button" class="lien" onclick={() => (tousLesAlbums = false)}>{$t('v2.label.voirMoins' as any)}</button>
          {/if}
        </div>
        <ul class="grille">
          {#each albumsMontres as a (a.source_id)}
            <li>
              <button type="button" class="carte" onclick={() => ouvrirAlbum(a)} title={a.title}>
                <span class="pochette"><AlbumArt coverPath={a.cover_path ?? null} size={0} vignette alt={a.title} source={cible.service} fallbackInitials={initiales(a.title)} /></span>
                <span class="nom">{a.title}</span>
                <span class="sous">{a.year ? `${a.artist_name ?? ''} · ${a.year}` : (a.artist_name ?? '')}</span>
              </button>
            </li>
          {/each}
        </ul>
        {#if tousLesAlbums && suivante != null}
          <button type="button" class="suite" data-charger-suite disabled={enCours} onclick={chargerLaSuite}>{$t('v2.label.chargerPlus' as any)}</button>
        {/if}
      </section>
    {/if}

    {#if artistes && artistes.length > 0}
      <section data-section="artistes">
        <div class="titre-section">
          <h2>{$t('v2.label.artistes' as any)}</h2>
          {#if artistes.length > ARTISTES_EN_APERCU}
            <button type="button" class="lien" data-voir-tout="artistes" onclick={() => (tousLesArtistes = !tousLesArtistes)}>
              {$t((tousLesArtistes ? 'v2.label.voirMoins' : 'v2.label.voirTout') as any)}
            </button>
          {/if}
        </div>
        <ul class="grille">
          {#each artistesMontres as a (a.name)}
            <li>
              <button type="button" class="carte" onclick={() => ouvrirArtiste(a)} title={a.name}>
                <span class="pochette ronde"><AlbumArt coverPath={a.album_phare.cover_url ?? null} size={0} vignette round alt={a.name} source={cible.service} fallbackInitials={initiales(a.name)} /></span>
                <span class="nom">{a.name}</span>
                <span class="sous">{$t('v2.rech.labelAlbums' as any).replace('{n}', String(a.album_count))}</span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {:else}
    <p class="vide">{$t('v2.label.indisponible' as any)}</p>
  {/if}
</div>

<style>
  .v2-label{position:absolute; inset:0; z-index:30; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow-y:auto; padding:26px 34px 40px}
  .close{position:sticky; top:0; margin-bottom:8px; width:40px; height:40px; border-radius:12px; cursor:pointer;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt2); display:grid; place-items:center}
  .close:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .close svg{width:18px; height:18px}
  .tete{display:flex; gap:20px; align-items:flex-end; margin-bottom:22px}
  .logo{width:140px; height:140px; border-radius:12px; overflow:hidden; flex:0 0 auto; display:block}
  .meta{display:flex; flex-direction:column; gap:6px; min-width:0}
  .surtitre{font:600 11px var(--v2-sans); letter-spacing:.06em; text-transform:uppercase; color:var(--v2-txt2)}
  h1{margin:0; font:700 28px var(--v2-sans); overflow-wrap:anywhere}
  .faits{font-size:13px; color:var(--v2-txt2)}
  .titre-section{display:flex; align-items:baseline; gap:14px; margin:18px 0 10px}
  h2{margin:0; font:600 16px var(--v2-sans)}
  .lien{all:unset; cursor:pointer; font:500 12px var(--v2-sans); color:var(--tune-accent)}
  .lien:hover{text-decoration:underline}
  .lien:focus-visible, .carte:focus-visible, .suite:focus-visible{outline:2px solid var(--tune-accent); outline-offset:2px}
  .grille{list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:16px}
  .carte{all:unset; cursor:pointer; display:flex; flex-direction:column; gap:4px; width:100%}
  .pochette{width:100%; aspect-ratio:1; border-radius:8px; overflow:hidden; display:block}
  .pochette.ronde{border-radius:50%}
  .nom{font-weight:600; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .sous{font-size:11px; color:var(--v2-txt2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .suite{margin-top:16px; padding:8px 14px; border-radius:10px; cursor:pointer; border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:500 13px var(--v2-sans)}
  .suite:disabled{opacity:.6; cursor:default}
  .vide{color:var(--v2-txt2); font-size:13px}
  @media (max-width: 600px){
    .v2-label{padding:18px 16px 32px}
    .logo{width:96px; height:96px}
    h1{font-size:22px}
  }
</style>
