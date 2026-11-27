<script lang="ts">
  /**
   * Page artiste de Salon : grande photo en bandeau (nom serif et actions
   * posés dessus), onglets, puces de genres, biographie, morceaux, albums.
   */
  import { bulleTexte } from '../../lib/infobulleTexte';
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import type { Album, Artist, Track } from '../../lib/types';
  import { allerA } from '../../lib/stores/salon';
  import { favoriteArtistIds } from '../../lib/stores/profile';
  import { basculerFavoriLocal } from '../../lib/favorisLocaux';
  import { sasEcouterPlusTard, estDansLeSas, basculerLeSas, chargerSas } from '../../lib/ecouterPlusTard';
  import { lireArtiste, lirePistes } from '../../lib/lectureSalon';
  import { duree, initiales, sectionsDiscographie } from '../../lib/interfaceSalon';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import IconeSalon from './IconeSalon.svelte';
  import BoutonLireSalon from './BoutonLireSalon.svelte';
  import CarteAlbumSalon from './CarteAlbumSalon.svelte';

  let { id }: { id: number } = $props();

  let artiste = $state<Artist | null>(null);
  let bio = $state<string | null>(null);
  let albums = $state<Album[] | null>(null);
  let pistes = $state<Track[] | null>(null);
  let erreur = $state(false);
  let onglet = $state<'ensemble' | 'discographie' | 'compositions'>('ensemble');
  let menuOuvert = $state(false);
  let edition = $state(false);
  /** Les morceaux dont l'artiste est le COMPOSITEUR (facette `composer`). */
  let compositions = $state<Track[] | null>(null);
  let ongletPistes = $state<'populaires' | 'bibliotheque'>('populaires');
  let bioOuverte = $state(false);
  let photoEchec = $state(false);

  onMount(() => {
    void chargerSas();
    api.getArtist(id).then((a) => { artiste = a; }).catch(() => { erreur = true; });
    api.getArtistBio(id).then((b) => { bio = b?.bio ?? null; }).catch(() => { bio = null; });
    api.getArtistAlbums(id).then((l) => { albums = l ?? []; }).catch(() => { albums = []; });
    api.getArtistTracks(id).then((l) => { pistes = l ?? []; }).catch(() => { pistes = []; });
  });

  const photo = $derived(artiste?.image_path && !photoEchec ? api.artworkUrl(artiste.image_path) : '');
  /** Les genres de ses albums, du plus fréquent au moins fréquent (cinq au plus). */
  const genres = $derived.by(() => {
    const n = new Map<string, number>();
    for (const a of albums ?? []) {
      for (const g of ((a.genres ?? a.genre) ?? '').split(/[;,/]/).map((x) => x.trim()).filter(Boolean)) n.set(g, (n.get(g) ?? 0) + 1);
    }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
  });
  const listePistes = $derived.by(() => {
    const l = [...(pistes ?? [])];
    if (ongletPistes === 'populaires') l.sort((a, b) => (b.play_count ?? 0) - (a.play_count ?? 0));
    return l.slice(0, 9);
  });
  const texteBio = $derived((bio ?? artiste?.bio ?? '').trim());
  const favori = $derived($favoriteArtistIds.has(id));
  const plusTard = $derived(estDansLeSas({ itemType: 'artist', itemId: id }, $sasEcouterPlusTard));

  /** Comme la référence : COMPOSITIONS n'est un onglet que pour un
   *  compositeur (au moins une piste dont il est le compositeur). */
  let estCompositeur = $state(false);
  $effect(() => {
    const nom = artiste?.name;
    if (!nom) return;
    api.getFilteredTracks({ composer: nom, limit: 1 })
      .then((r) => { estCompositeur = (r.items ?? []).length > 0; })
      .catch(() => { estCompositeur = false; });
  });

  $effect(() => {
    if (onglet !== 'compositions' || compositions !== null || !artiste?.name) return;
    api.getFilteredTracks({ composer: artiste.name, limit: 200 })
      .then((r) => { compositions = r.items ?? []; })
      .catch(() => { compositions = []; });
  });

  function lirePiste(p: Track) {
    if (p.id != null) lirePistes([p.id]);
  }
</script>

<svelte:window onclick={() => (menuOuvert = false)} />

<div class="page" data-page-salon="artiste">
  {#if erreur}
    <p class="s-vide">{$t('roonLike.artiste.introuvable' as any)}</p>
  {:else}
    <section class="bandeau" class:sans-photo={!photo}>
      {#if photo}
        <img src={photo} alt="" onerror={() => (photoEchec = true)} />
      {:else}
        <span class="init" aria-hidden="true">{initiales(artiste?.name)}</span>
      {/if}
      <div class="voile"></div>
      <div class="sur">
        <h1 class="s-titre nom">{artiste?.name ?? ''}</h1>
        <div class="actions">
          <BoutonLireSalon lire={() => lireArtiste(id)} aleatoire={() => lireArtiste(id, { aleatoire: true })} />
          <button class="s-rond clair" aria-pressed={favori} onclick={() => basculerFavoriLocal({ artistId: id })}
            aria-label={$t('roonLike.favori' as any)} title={$t('roonLike.favori' as any)}>
            <IconeSalon nom="favoris" taille={18} plein={favori} />
          </button>
          <button class="s-rond clair" aria-pressed={plusTard} onclick={() => basculerLeSas({ itemType: 'artist', itemId: id })}
            aria-label={$t('v2.nav.later' as any)} title={$t('v2.nav.later' as any)}>
            <IconeSalon nom="plusTard" taille={18} />
          </button>
          <div class="ancre">
            <button class="s-rond clair" onclick={(e) => { e.stopPropagation(); menuOuvert = !menuOuvert; }} aria-haspopup="menu" aria-expanded={menuOuvert}
              aria-label={$t('roonLike.plusDActions' as any)} title={$t('roonLike.plusDActions' as any)}>
              <IconeSalon nom="points" taille={18} trait={2.6} />
            </button>
            {#if menuOuvert}
              <div class="s-menu menu" role="menu">
                <button role="menuitem" onclick={() => { menuOuvert = false; onglet = 'discographie'; }}>{$t('roonLike.onglet.discographie' as any)}</button>
                <button role="menuitem" onclick={() => { menuOuvert = false; edition = true; }}>{$t('roonLike.artiste.modifier' as any)}</button>
              </div>
            {/if}
          </div>
        </div>
      </div>
      {#if artiste}
        <button class="ameliorer" onclick={() => (edition = true)}>
          <IconeSalon nom="photo" taille={13} />{$t('roonLike.artiste.ameliorerPhoto' as any)}
        </button>
      {/if}
    </section>
    {#if edition && artiste}
      {#await import('../partages/ArtistEditModal.svelte') then m}
        <m.default artist={artiste} onClose={() => (edition = false)} onSaved={(a) => { artiste = a; photoEchec = false; edition = false; }} />
      {/await}
    {/if}

    <div class="s-onglets onglets" role="tablist">
      <button role="tab" aria-selected={onglet === 'ensemble'} onclick={() => (onglet = 'ensemble')}>{$t('roonLike.onglet.ensemble' as any)}</button>
      <button role="tab" aria-selected={onglet === 'discographie'} onclick={() => (onglet = 'discographie')}>{$t('roonLike.onglet.discographie' as any)}</button>
      {#if estCompositeur}<button role="tab" aria-selected={onglet === 'compositions'} onclick={() => (onglet = 'compositions')}>{$t('roonLike.onglet.compositions' as any)}</button>{/if}
    </div>

    {#if onglet === 'ensemble'}
      {#if genres.length}
        <div class="puces">{#each genres as g (g)}<button class="s-puce" onclick={() => allerA({ page: 'genre', nom: g })}>{g}</button>{/each}</div>
      {/if}
      {#if texteBio || artiste?.country}
        <div class="bio">
          <div class="texte" class:ouverte={bioOuverte} use:bulleTexte>{texteBio || '—'}</div>
          <dl class="faits">
            {#if artiste?.country}<dt>{$t('roonLike.artiste.pays' as any)}</dt><dd>{artiste.country}</dd>{/if}
            {#if albums?.length}<dt>{$t('roonLike.nav.albums' as any)}</dt><dd>{albums.length}</dd>{/if}
          </dl>
        </div>
        {#if texteBio.length > 160}
          <button class="deplier" onclick={() => (bioOuverte = !bioOuverte)} aria-expanded={bioOuverte}
            aria-label={bioOuverte ? $t('roonLike.replier' as any) : $t('roonLike.deplier' as any)}>
            <span class:tourne={bioOuverte}><IconeSalon nom="bas" taille={16} trait={2} /></span>
          </button>
        {/if}
      {/if}

      <section class="morceaux">
        <div class="tete">
          <h2>{$t('roonLike.artiste.morceaux' as any)}</h2>
          <button class="ong" class:on={ongletPistes === 'populaires'} onclick={() => (ongletPistes = 'populaires')}>{$t('roonLike.artiste.populaires' as any)}</button>
          <button class="ong" class:on={ongletPistes === 'bibliotheque'} onclick={() => (ongletPistes = 'bibliotheque')}>{$t('roonLike.artiste.maBibliotheque' as any)}</button>
        </div>
        {#if pistes === null}
          <p class="s-vide">{$t('roonLike.chargement' as any)}</p>
        {:else if !listePistes.length}
          <p class="s-vide">{$t('roonLike.artiste.aucunMorceau' as any)}</p>
        {:else}
          <div class="grille-pistes">
            {#each listePistes as p, i (p.id ?? i)}
              <button class="piste" onclick={() => lirePiste(p)}>
                <span class="ligne1"><span class="pt" use:bulleTexte>{p.title}</span><span class="pd">{duree(p.duration_ms)}</span></span>
                <span class="ligne2">
                  <span class="mini"><AlbumArt coverPath={p.cover_path ?? null} albumId={p.album_id ?? null} size={0} vignette alt="" /></span>
                  {#if p.album_title}<span class="sur-album" use:bulleTexte>{$t('roonLike.artiste.surAlbum' as any).replace('{album}', p.album_title)}</span>{/if}
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    {#if onglet === 'compositions'}
      <section class="morceaux">
        {#if compositions === null}
          <p class="s-vide">{$t('roonLike.chargement' as any)}</p>
        {:else if !compositions.length}
          <p class="s-vide">{$t('roonLike.artiste.aucuneComposition' as any)}</p>
        {:else}
          <ol class="compos">
            {#each compositions as p, i (p.id ?? i)}
              <li><button onclick={() => lirePiste(p)}>
                <span class="pt" use:bulleTexte>{p.title}</span>
                <span class="sur-album" use:bulleTexte>{[p.artist_name, p.album_title].filter(Boolean).join(' · ')}</span>
                <span class="pd">{duree(p.duration_ms)}</span>
              </button></li>
            {/each}
          </ol>
        {/if}
      </section>
    {:else}
    <section class="albums">
      {#if onglet === 'ensemble'}<h2 class="h2-albums">{$t('roonLike.nav.albums' as any)}</h2>{/if}
      {#if albums === null}
        <p class="s-vide">{$t('roonLike.chargement' as any)}</p>
      {:else}
        {#if onglet === 'discographie'}
          <!-- Comme la référence : albums principaux, singles et EP, compilations. -->
          {#each sectionsDiscographie(albums) as sec (sec.section)}
            <h2 class="h2-albums" data-section-discographie={sec.section}>{$t(`roonLike.artiste.sections.${sec.section}` as any)} ({sec.albums.length})</h2>
            <div class="s-grille grille section-disco">{#each sec.albums as a, i (a.id ?? i)}<CarteAlbumSalon album={a} />{/each}</div>
          {/each}
        {:else}
          <div class="s-grille grille">{#each albums as a, i (a.id ?? i)}<CarteAlbumSalon album={a} />{/each}</div>
        {/if}
      {/if}
    </section>
    {/if}
  {/if}
</div>

<style>
  .page { max-width: var(--s-largeur-artiste); margin: 0 auto; padding: 12px var(--s-marge-fiche) 60px; }
  button { background: none; border: 0; font: inherit; color: inherit; cursor: pointer; padding: 0; }
  .bandeau { position: relative; height: var(--s-haut-bandeau-artiste); border-radius: var(--s-r-bandeau); overflow: hidden; background: var(--s-acc-fort); }
  .bandeau img { width: 100%; height: 100%; object-fit: cover; object-position: center 30%; display: block; }
  .bandeau .init {
    position: absolute; inset: 0; display: grid; place-items: center;
    font-family: var(--s-police-titre); font-size: calc(var(--s-t-genre) * 5); color: var(--s-sur-photo-fantome);
  }
  .voile { position: absolute; inset: 0; background: var(--s-voile-photo); }
  /* Le nom et les boutons s'alignent sur la marge gauche de la colonne de contenu. */
  .sur { position: absolute; left: max(24px, calc((100% - var(--s-largeur-colonne)) / 2)); bottom: 30px; right: 40px; color: var(--s-sur-photo); }
  .ameliorer {
    position: absolute; right: 18px; bottom: 16px; display: inline-flex; align-items: center; gap: 6px;
    font-size: var(--s-t-mini); color: var(--s-sur-photo); opacity: .9;
  }
  .ameliorer:hover { opacity: 1; text-decoration: underline; }
  .ancre { position: relative; }
  .menu { left: 0; bottom: calc(100% + 6px); }
  .compos { list-style: none; margin: 20px 0 0; padding: 0; }
  .compos li { border-bottom: 1px solid var(--s-line); }
  .compos button { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 16px; align-items: center; min-height: var(--s-haut-piste); text-align: left; }
  .compos button:hover .pt { color: var(--s-acc-texte); }
  .nom { color: var(--s-sur-photo); text-shadow: var(--s-ombre-texte-photo); font-size: var(--s-t-titre-hero); margin-bottom: 16px; }
  .actions { display: flex; align-items: center; gap: 12px; }
  .s-rond.clair { color: var(--s-sur-photo); border-color: var(--s-sur-photo-bord); }
  .s-rond.clair:hover { background: var(--s-sur-photo-survol); }
  .onglets { margin: 26px 0 0; }
  .puces { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; margin: 22px 0 0; }
  .bio { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 48px; max-width: var(--s-largeur-texte); margin: 26px auto 0; align-items: start; }
  .texte {
    font-size: var(--s-t-corps); line-height: 1.6; color: var(--s-txt);
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-line;
  }
  .texte.ouverte { display: block; }
  .faits { display: grid; grid-template-columns: auto auto; gap: 4px 36px; margin: 0; font-size: var(--s-t-petit); }
  .faits dt { font-weight: var(--s-graisse-forte); }
  .faits dd { margin: 0; color: var(--s-txt2); }
  .deplier { display: block; margin: 8px auto 0; color: var(--s-txt2); }
  .tourne { display: inline-block; transform: rotate(180deg); }
  .morceaux, .albums { max-width: var(--s-largeur-texte); margin: 40px auto 0; }
  .tete { display: flex; align-items: center; gap: 32px; border-bottom: 1px solid var(--s-line); padding-bottom: 10px; margin-bottom: 18px; }
  h2 { margin: 0; font-size: var(--s-t-section); font-weight: 400; }
  .ong { font-size: var(--s-t-petit); letter-spacing: .04em; text-transform: uppercase; color: var(--s-txt2); position: relative; }
  .ong.on { color: var(--s-txt); }
  .ong.on::after { content: ''; position: absolute; left: 50%; bottom: -11px; width: 30px; height: 3px; transform: translateX(-50%); background: var(--s-onglet); border-radius: var(--s-r-trait); }
  .grille-pistes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px 36px; }
  .piste { display: flex; flex-direction: column; gap: 8px; text-align: left; min-width: 0; }
  .ligne1 { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--s-line); padding-bottom: 8px; }
  .pt { font-size: var(--s-t-moyen); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pd { font-size: var(--s-t-petit); color: var(--s-txt2); font-variant-numeric: tabular-nums; }
  .ligne2 { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .mini { width: 32px; height: 32px; flex: none; }
  .sur-album { font-size: var(--s-t-mini); color: var(--s-txt2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .piste:hover .pt { color: var(--s-acc-texte); }
  .h2-albums { border-bottom: 1px solid var(--s-line); padding-bottom: 10px; margin-bottom: 22px; }
  .section-disco { margin-bottom: 40px; }
  /* Tablette : bandeau de bord à bord ; morceaux populaires en 2 colonnes
     en portrait, 3 en paysage (comme la référence). */
  @media (min-width: 744px) and (max-width: 1366px) {
    .page { max-width: none; padding-top: 0; }
    .bandeau { margin: 0 calc(-1 * var(--s-marge-fiche)); }
  }
  @media (min-width: 744px) and (max-width: 1024px) {
    .grille-pistes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 743px) {
    .bandeau { height: 380px; }
    .sur { left: 24px; }
    .grille-pistes { grid-template-columns: 1fr; }
    .bio { grid-template-columns: 1fr; }
  }
</style>
