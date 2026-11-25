<script lang="ts">
  /**
   * Fiche album de Salon : pochette, titre serif, artiste, actions rondes,
   * puce de genre, ligne technique, onglets MORCEAUX / CRÉDITS / VERSIONS.
   *
   * Les crédits sont ceux de la fiche de l'interface actuelle
   * (`CreditsTiroir`, rendu à plat) ; les versions sont les albums du même
   * artiste qui portent le même titre.
   */
  import { bulleTexte } from '../../lib/infobulleTexte';
  import { onMount } from 'svelte';
  import { t, locale } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import type { Album, Track } from '../../lib/types';
  import { allerA } from '../../lib/stores/salon';
  import { favoriteAlbumIds, favoriteTrackIds } from '../../lib/stores/profile';
  import { basculerFavoriLocal } from '../../lib/favorisLocaux';
  import { sasEcouterPlusTard, estDansLeSas, basculerLeSas, chargerSas } from '../../lib/ecouterPlusTard';
  import { demandeAjoutPlaylist } from '../../lib/demandeAjoutPlaylist';
  import { lireAlbum, ajouterAlbumALaFile } from '../../lib/lectureSalon';
  import { duree, minutesTotales, joursDepuis } from '../../lib/interfaceSalon';
  import { fold } from '../../lib/utils';
  import { currentTrackId } from '../../lib/stores/nowPlaying';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import CreditsTiroir from '../partages/CreditsTiroir.svelte';
  import IconeSalon from './IconeSalon.svelte';
  import BoutonLireSalon from './BoutonLireSalon.svelte';
  import CarteAlbumSalon from './CarteAlbumSalon.svelte';

  let { id }: { id: number } = $props();

  let album = $state<Album | null>(null);
  let pistes = $state<Track[] | null>(null);
  let erreur = $state(false);
  let onglet = $state<'morceaux' | 'credits' | 'versions'>('morceaux');
  let versions = $state<Album[] | null>(null);
  let filtre = $state('');
  let filtreOuvert = $state(false);
  let menuPiste = $state<number | null>(null);
  let menuAlbum = $state(false);

  onMount(() => {
    void chargerSas();
    api.getAlbum(id).then((a) => { album = a; }).catch(() => { erreur = true; });
    api.getAlbumTracks(id).then((l) => { pistes = l ?? []; }).catch(() => { pistes = []; });
  });

  $effect(() => {
    if (onglet !== 'versions' || versions !== null || album?.artist_id == null) return;
    const titre = fold(album.title);
    api.getArtistAlbums(album.artist_id)
      .then((l) => { versions = (l ?? []).filter((a) => a.id !== id && fold(a.title) === titre); })
      .catch(() => { versions = []; });
  });

  const genres = $derived(((album?.genres ?? album?.genre) ?? '').split(/[;,/]/).map((g) => g.trim()).filter(Boolean));
  const plusieursDisques = $derived((pistes ?? []).some((p) => (p.disc_number ?? 1) > 1));
  const visibles = $derived(filtre.trim()
    ? (pistes ?? []).filter((p) => fold(p.title).includes(fold(filtre.trim())))
    : (pistes ?? []));

  const dateSortie = $derived.by(() => {
    const brute = album?.release_date ?? album?.original_date ?? null;
    if (brute && /^\d{4}-\d{2}-\d{2}/.test(brute)) {
      const d = new Date(`${brute.slice(0, 10)}T12:00:00`);
      if (!Number.isNaN(d.getTime())) return d.toLocaleDateString($locale, { day: 'numeric', month: 'long', year: 'numeric' });
    }
    return album?.year ? String(album.year) : '';
  });

  /** « FLAC 96kHz 24bit », d'après la première piste (l'album est homogène le plus souvent). */
  const technique = $derived.by(() => {
    const p = (pistes ?? [])[0];
    if (!p) return '';
    const fmt = p.format ? String(p.format).toUpperCase() : '';
    const sr = p.sample_rate ? `${(p.sample_rate / 1000).toLocaleString($locale, { maximumFractionDigits: 1 })}kHz` : '';
    const bd = p.bit_depth ? `${p.bit_depth}bit` : '';
    return [fmt, sr, bd].filter(Boolean).join(' ');
  });

  const ajouteLe = $derived.by(() => {
    if (joursDepuis(album?.added_at) == null) return '';
    const a = album!.added_at!;
    const d = new Date(a < 1e12 ? a * 1000 : a);
    return $t('salon.album.ajouteLe' as any).replace('{date}', d.toLocaleDateString($locale, { day: 'numeric', month: 'long', year: 'numeric' }));
  });

  const infos = $derived([
    pistes?.length ? $t('salon.album.minutes' as any).replace('{n}', String(minutesTotales(pistes.map((p) => p.duration_ms)))) : '',
    technique,
    pistes?.length ? $t('salon.album.morceaux' as any).replace('{n}', String(pistes.length)) : '',
    ajouteLe,
  ].filter(Boolean));

  const favori = $derived($favoriteAlbumIds.has(id));
  const plusTard = $derived(estDansLeSas({ itemType: 'album', itemId: id }, $sasEcouterPlusTard));

  function lirePiste(p: Track) {
    const i = (pistes ?? []).indexOf(p);
    lireAlbum(id, { depuis: Math.max(0, i) });
  }
  function ajouterPlaylist() {
    menuAlbum = false;
    demandeAjoutPlaylist.set({ nom: album?.title ?? '', pistes: async () => pistes ?? [] });
  }
</script>

<svelte:window onclick={() => { menuPiste = null; menuAlbum = false; }} />

<div class="page" data-page-salon="album">
  {#if erreur}
    <p class="s-vide">{$t('salon.album.introuvable' as any)}</p>
  {:else}
    <section class="haut">
      <div class="pochette">
        <AlbumArt coverPath={album?.cover_path ?? null} albumId={id} size={0} alt={album?.title ?? ''} />
      </div>
      <div class="ident">
        {#if dateSortie}<p class="date">{dateSortie}</p>{/if}
        <h1 class="s-titre titre">{album?.title ?? ''}</h1>
        {#if album?.artist_name}
          {#if album.artist_id != null}
            <button class="artiste" onclick={() => allerA({ page: 'artiste', id: album!.artist_id! })}>{album.artist_name}</button>
          {:else}
            <p class="artiste">{album.artist_name}</p>
          {/if}
        {/if}
        <div class="actions">
          <BoutonLireSalon lire={() => lireAlbum(id)} aleatoire={() => lireAlbum(id, { aleatoire: true })}
            ensuite={() => ajouterAlbumALaFile(id, 'ensuite')} enFile={() => ajouterAlbumALaFile(id, 'fin')} />
          <button class="s-rond" aria-pressed={favori} onclick={() => basculerFavoriLocal({ albumId: id })}
            aria-label={$t('salon.favori' as any)} title={$t('salon.favori' as any)}>
            <IconeSalon nom="favoris" taille={18} plein={favori} />
          </button>
          <button class="s-rond" aria-pressed={plusTard} onclick={() => basculerLeSas({ itemType: 'album', itemId: id })}
            aria-label={$t('v2.nav.later' as any)} title={$t('v2.nav.later' as any)}>
            <IconeSalon nom="plusTard" taille={18} />
          </button>
          <div class="ancre">
            <button class="s-rond" onclick={(e) => { e.stopPropagation(); menuAlbum = !menuAlbum; }} aria-haspopup="menu" aria-expanded={menuAlbum}
              aria-label={$t('salon.plusDActions' as any)} title={$t('salon.plusDActions' as any)}>
              <IconeSalon nom="points" taille={18} trait={2.6} />
            </button>
            {#if menuAlbum}
              <div class="s-menu menu" role="menu">
                <button role="menuitem" onclick={ajouterPlaylist}>{$t('salon.album.ajouterPlaylist' as any)}</button>
                <button role="menuitem" onclick={() => ajouterAlbumALaFile(id, 'ensuite')}>{$t('salon.lire.ensuite' as any)}</button>
                <button role="menuitem" onclick={() => ajouterAlbumALaFile(id, 'fin')}>{$t('salon.lire.enFile' as any)}</button>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </section>

    {#if genres.length}
      <div class="puces">
        {#each genres as g (g)}<button class="s-puce" onclick={() => allerA({ page: 'genre', nom: g })}>{g}</button>{/each}
      </div>
    {/if}
    {#if infos.length}
      <p class="infos">{#each infos as x, i (i)}{#if i}<span class="sep" aria-hidden="true"></span>{/if}<span>{x}</span>{/each}</p>
    {/if}

    <div class="s-onglets" role="tablist">
      <button role="tab" aria-selected={onglet === 'morceaux'} onclick={() => (onglet = 'morceaux')}>{$t('salon.onglet.morceaux' as any)}</button>
      <button role="tab" aria-selected={onglet === 'credits'} onclick={() => (onglet = 'credits')}>{$t('salon.onglet.credits' as any)}</button>
      <button role="tab" aria-selected={onglet === 'versions'} onclick={() => (onglet = 'versions')}>{$t('salon.onglet.versions' as any)}</button>
    </div>

    {#if onglet === 'morceaux'}
      <div class="outils">
        <span class="espace"></span>
        {#if filtreOuvert}
          <!-- svelte-ignore a11y_autofocus -->
          <input class="s-champ" bind:value={filtre} placeholder={$t('salon.filtrer' as any)} autofocus
            onkeydown={(e) => { if (e.key === 'Escape') { filtre = ''; filtreOuvert = false; } }} />
        {:else}
          <button class="filtrer" onclick={() => (filtreOuvert = true)}><IconeSalon nom="recherche" taille={15} />{$t('salon.filtrer' as any)}</button>
        {/if}
      </div>
      {#if pistes === null}
        <p class="s-vide">{$t('salon.chargement' as any)}</p>
      {:else}
        <ol class="pistes">
          {#each visibles as p, i (p.id ?? i)}
            {#if plusieursDisques && (i === 0 || (visibles[i - 1].disc_number ?? 1) !== (p.disc_number ?? 1))}
              <li class="disque">{$t('salon.album.disque' as any).replace('{n}', String(p.disc_number ?? 1))}</li>
            {/if}
            <li class="piste" class:courante={p.id != null && p.id === $currentTrackId}>
              <button class="jouer" onclick={() => lirePiste(p)} aria-label={$t('salon.lire.maintenant' as any)}>
                <span class="disque-lire"><IconeSalon nom="lecture" taille={9} plein trait={1} /></span>
              </button>
              <span class="t">
                <span class="nom" use:bulleTexte>{p.title}</span>
                {#if p.artist_name && p.artist_name !== album?.artist_name}<span class="sous">{p.artist_name}</span>{/if}
              </span>
              {#if p.id != null}
                <button class="coeur" aria-pressed={$favoriteTrackIds.has(p.id)} onclick={() => basculerFavoriLocal({ trackId: p.id })}
                  aria-label={$t('salon.favori' as any)} title={$t('salon.favori' as any)}>
                  <IconeSalon nom="favoris" taille={17} plein={$favoriteTrackIds.has(p.id)} />
                </button>
              {:else}<span></span>{/if}
              <span class="duree">{duree(p.duration_ms)}</span>
              <span class="ecoutes" title={$t('salon.album.ecoutes' as any)}><IconeSalon nom="lecture" taille={8} plein trait={1} />{p.play_count ?? 0}</span>
              <div class="ancre">
                <button class="pts" onclick={(e) => { e.stopPropagation(); menuPiste = menuPiste === i ? null : i; }}
                  aria-label={$t('salon.plusDActions' as any)} aria-haspopup="menu" aria-expanded={menuPiste === i}>
                  <IconeSalon nom="points" taille={18} trait={2.6} />
                </button>
                {#if menuPiste === i}
                  <div class="s-menu menu droite" role="menu">
                    <button role="menuitem" onclick={() => lirePiste(p)}>{$t('salon.lire.maintenant' as any)}</button>
                    {#if p.artist_id != null}
                      <button role="menuitem" onclick={() => allerA({ page: 'artiste', id: p.artist_id! })}>{$t('salon.allerArtiste' as any)}</button>
                    {/if}
                  </div>
                {/if}
              </div>
            </li>
          {/each}
        </ol>
      {/if}
    {:else if onglet === 'credits'}
      <div class="credits">
        <CreditsTiroir enLigne onClose={() => (onglet = 'morceaux')}
          cible={{ type: 'album', albumId: id, titre: album?.title ?? null, artiste: album?.artist_name ?? null,
                   pistes: (pistes ?? []).map((p) => ({ id: p.id, title: p.title, track_number: p.track_number ?? null, disc_number: p.disc_number ?? null })) }} />
      </div>
    {:else}
      {#if versions === null}
        <p class="s-vide">{$t('salon.chargement' as any)}</p>
      {:else if !versions.length}
        <p class="s-vide">{$t('salon.album.aucuneVersion' as any)}</p>
      {:else}
        <div class="s-grille grille">{#each versions as v (v.id)}<CarteAlbumSalon album={v} />{/each}</div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .page { max-width: var(--s-largeur-fiche); margin: 0 auto; padding: 48px var(--s-marge-fiche) 60px; }
  button { background: none; border: 0; font: inherit; color: inherit; cursor: pointer; padding: 0; }
  .haut { display: grid; grid-template-columns: var(--s-pochette-fiche) minmax(0, 1fr); gap: 64px; align-items: start; }
  .pochette { width: var(--s-pochette-fiche); }
  .ident { padding-top: 40px; }
  .date { margin: 0 0 56px; font-size: var(--s-t-corps); color: var(--s-txt); }
  .titre { font-size: var(--s-t-titre-album); margin-bottom: 8px; }
  .artiste { display: block; margin: 0 0 30px; font-size: var(--s-t-sous-titre); color: var(--s-txt); text-align: left; }
  button.artiste:hover { text-decoration: underline; }
  .actions { display: flex; align-items: center; gap: 12px; }
  .ancre { position: relative; }
  .menu { left: 0; top: calc(100% + 6px); }
  .menu.droite { left: auto; right: 0; }
  .puces { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; margin: 38px 0 0; }
  .infos {
    display: flex; justify-content: center; flex-wrap: wrap; align-items: center; gap: 10px;
    margin: 36px 0 26px; font-size: var(--s-t-texte); color: var(--s-txt2);
  }
  .sep { width: 1px; height: 14px; background: var(--s-line); }
  .outils { display: flex; align-items: center; gap: 18px; margin: 26px 0 8px; }
  .espace { flex: 1; }
  .filtrer { display: inline-flex; align-items: center; gap: 6px; font-size: var(--s-t-texte); color: var(--s-txt2); }
  .pistes { list-style: none; margin: 0; padding: 0; }
  .disque { padding: 22px 0 8px; font-size: var(--s-t-legende); letter-spacing: .06em; text-transform: uppercase; color: var(--s-txt2); }
  .piste {
    display: grid; grid-template-columns: 48px minmax(0, 1fr) 40px 64px 48px 40px; align-items: center;
    min-height: var(--s-haut-piste); border-bottom: 1px solid var(--s-line);
  }
  .piste:hover { background: var(--s-survol); }
  .piste.courante .nom { color: var(--s-acc); }
  .jouer { display: grid; place-items: center; width: 48px; height: 48px; }
  .disque-lire { width: 18px; height: 18px; border-radius: 50%; background: var(--s-acc); color: var(--s-sur-acc); display: grid; place-items: center; padding-left: 1px; }
  .t { display: flex; flex-direction: column; min-width: 0; padding-left: 20px; }
  .nom { font-size: var(--s-t-corps); color: var(--s-txt); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sous { font-size: var(--s-t-petit); color: var(--s-txt2); }
  .coeur { color: var(--s-acc); display: grid; place-items: center; }
  .duree { text-align: right; font-size: var(--s-t-texte); color: var(--s-txt); font-variant-numeric: tabular-nums; }
  .ecoutes { display: inline-flex; align-items: center; justify-content: center; gap: 3px; font-size: var(--s-t-mini); color: var(--s-txt2); }
  .pts { color: var(--s-txt); display: grid; place-items: center; width: 40px; height: 40px; }
  .credits { margin-top: 24px; }
  .grille { margin-top: 30px; }
  @media (max-width: 1000px) {
    .haut { grid-template-columns: 1fr; gap: 24px; }
    .pochette { width: min(var(--s-pochette-fiche), 100%); }
    .ident { padding-top: 0; }
  }
</style>
