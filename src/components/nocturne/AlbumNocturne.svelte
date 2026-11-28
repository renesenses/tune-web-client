<script lang="ts">
  /**
   * Page album Nocturne : en-tête (pochette, sur-titre, titre, artiste ambré,
   * infos, badge qualité, actions), puce de genre, présentation repliable et
   * encadré technique, puis onglets Pistes / Crédits.
   */
  import Play from '@lucide/svelte/icons/play';
  import ListStart from '@lucide/svelte/icons/list-start';
  import ListPlus from '@lucide/svelte/icons/list-plus';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Funnel from '@lucide/svelte/icons/funnel';
  import MenuNocturne from './MenuNocturne.svelte';
  import Heart from '@lucide/svelte/icons/heart';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Shuffle from '@lucide/svelte/icons/shuffle';
  import User from '@lucide/svelte/icons/user';
  import AudioLines from '@lucide/svelte/icons/audio-lines';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import type { Album, Track } from '../../lib/types';
  import { formatDuration, formatTime } from '../../lib/utils';
  import { basculerFavoriLocal } from '../../lib/favorisLocaux';
  import { favoriteAlbumIds, favoriteTrackIds } from '../../lib/stores/profile';
  import { currentTrackId, playbackState } from '../../lib/stores/nowPlaying';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import BadgeQualiteNocturne from './BadgeQualiteNocturne.svelte';
  import { allerA } from './navigationNocturne';
  import { enfilerAlbum, enfilerPiste, lireAlbum } from './lectureNocturne';
  import { genrePrincipal } from './triNocturne';
  import { preferences } from '../../lib/stores/preferences';
  import TexteRepliableNocturne from './TexteRepliableNocturne.svelte';
  // Itération 6 : rangées de voisinage, calculées sur la bibliothèque déjà chargée.
  import RangeeNocturne from './RangeeNocturne.svelte';
  import { albums as albumsBibliotheque } from '../../lib/stores/library';
  import { demanderBibliothequeEntiere } from '../../lib/stores/albumsPagines';
  import { ecoutesDesTitres, derniereEcoute, premiereEcoute, resolution, type PremiereEcoute } from './faitsAlbumNocturne';
  import { albumsDuMemeArtiste, albumsProches, musiciensDesCredits, creditsParRole, type Musicien } from './proximiteNocturne';

  interface Props { id: number }
  let { id }: Props = $props();

  let album = $state<Album | null>(null);
  let pistes = $state<Track[]>([]);
  let presentation = $state<string | null>(null);
  let credits = $state<Musicien[]>([]);
  let echec = $state(false);
  /** Itération 7 : première écoute, lue dans l'historique quand il est complet. */
  let premiere = $state<PremiereEcoute | null>(null);
  let onglet = $state<'pistes' | 'credits'>('pistes');
  let menuOuvert = $state(false);
  /** « Focus » : l'en-tête se resserre, la liste des titres prend la page. */
  let focus = $state(false);
  let filtreOuvert = $state(false);
  let filtre = $state('');
  /** Les titres affichés, avec leur rang dans l'album (pour lire à partir d'eux). */
  const pistesVues = $derived.by(() => {
    const f = filtre.trim().toLowerCase();
    const toutes = pistes.map((p, i) => ({ p, i }));
    return f ? toutes.filter(({ p }) => `${p.title} ${p.artist_name ?? ''}`.toLowerCase().includes(f)) : toutes;
  });

  $effect(() => {
    const cible = id;
    album = null; pistes = []; presentation = null; credits = []; echec = false; onglet = 'pistes'; premiere = null;
    api.getPlaybackHistory(1000).then((h) => { if (cible === id) premiere = premiereEcoute(h, cible); }).catch(() => {});
    api.getAlbum(cible).then((a) => {
      if (cible !== id) return;
      album = a;
      // Pas de présentation de l'album : celle de l'artiste, comme repli.
      api.getAlbumBio(cible)
        .then((b) => b?.bio ?? Promise.reject())
        .catch(() => (a.artist_id != null ? api.getArtistBio(a.artist_id).then((b) => b?.bio ?? null) : null))
        .then((texte) => { if (cible === id) presentation = texte ?? null; })
        .catch(() => {});
    }).catch(() => { if (cible === id) echec = true; });
    api.getAlbumTracks(cible).then((l) => { if (cible === id) pistes = l ?? []; }).catch(() => {});
    api.getAlbumCredits(cible).then((l) => {
      if (cible !== id || !Array.isArray(l)) return;
      credits = musiciensDesCredits(l);
    }).catch(() => {});
  });

  const duree = $derived(pistes.reduce((s, p) => s + (p.duration_ms ?? 0), 0));
  // La bibliothèque entière (partagée, chargée une fois) nourrit les rangées de voisinage.
  $effect(() => { void demanderBibliothequeEntiere().catch(() => {}); });
  const ecoutes = $derived(ecoutesDesTitres(pistes));
  const derniere = $derived(derniereEcoute(pistes));
  const annee = $derived(album?.year ?? (Number((album?.original_date || album?.release_date || '').slice(0, 4)) || null));
  const dateCourte = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    try { return d.toLocaleDateString($preferences.language || undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return iso.slice(0, 10); }
  };
  const duMeme = $derived(album ? albumsDuMemeArtiste($albumsBibliotheque, album) : []);
  const proches = $derived(album ? albumsProches($albumsBibliotheque, album) : []);
  const initialeMusicien = (nom: string) => nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase() ?? '').join('');
  const genre = $derived(album ? genrePrincipal(album) : null);
  const date = $derived(dateLisible(album?.release_date || album?.original_date, album?.year, $preferences.language));

  /** « 13 avril 2001 » dans la langue de l'interface ; l'année seule si la date est partielle. */
  function dateLisible(brute: string | null | undefined, annee: number | null | undefined, langue: string | undefined): string {
    if (brute && /^\d{4}-\d{2}-\d{2}/.test(brute)) {
      const d = new Date(`${brute.slice(0, 10)}T12:00:00`);
      if (!Number.isNaN(d.getTime())) {
        try { return d.toLocaleDateString(langue || undefined, { year: 'numeric', month: 'long', day: 'numeric' }); } catch { /* langue inconnue */ }
      }
    }
    return brute?.slice(0, 4) || (annee ? String(annee) : '');
  }
  const disques = $derived(new Set(pistes.map((p) => p.disc_number ?? 1)).size);
  const favori = $derived(album?.id != null && $favoriteAlbumIds.has(album.id));
  const infos = $derived(
    [date, pistes.length ? `${pistes.length} ${$t('common.tracks')}` : '', duree ? formatDuration(duree) : '', genre ?? '']
      .filter(Boolean),
  );

  function ouvrirArtiste() {
    if (album?.artist_id != null) allerA({ nom: 'artiste', id: album.artist_id });
  }
</script>

{#if echec}
  <p class="noc-vide">{$t('common.error')}</p>
{:else if !album}
  <p class="noc-vide">{$t('common.loading')}</p>
{:else}
  <article class="noc-album" class:focus>
    <header class="noc-album-entete">
      <div class="noc-album-pochette">
        <AlbumArt coverPath={album.cover_path} albumId={album.id} size={0} alt={album.title} source={album.source ?? null} />
      </div>
      <div class="noc-album-tete">
        <span class="noc-surtitre">{$t('v2.album.fiche.eyebrow')}</span>
        <h1>{album.title}</h1>
        {#if album.artist_name}
          <button type="button" class="noc-lien-artiste" onclick={ouvrirArtiste}>{album.artist_name}</button>
        {/if}
        <p class="noc-album-infos">{infos.join(' · ')}</p>
        <div class="noc-album-qualite">
          <BadgeQualiteNocturne format={album.format} sample_rate={album.sample_rate} bit_depth={album.bit_depth} source={album.source ?? null} complet />
        </div>
        {#if album.format || album.label}
          <p class="noc-album-format">{[album.format?.toUpperCase(), album.label].filter(Boolean).join(' · ')}</p>
        {/if}
        <div class="noc-actions">
          <button type="button" class="noc-bouton noc-bouton-plein" onclick={() => album?.id != null && lireAlbum(album.id)}>
            <Play size={14} fill="currentColor" /> {$t('common.play')}
          </button>
          <button type="button" class="noc-bouton" onclick={() => album?.id != null && enfilerAlbum(album.id, true)}>
            <ListStart size={14} /> {$t('v2.album.playNext')}
          </button>
          <button type="button" class="noc-bouton" onclick={() => album?.id != null && enfilerAlbum(album.id, false)}>
            <ListPlus size={14} /> {$t('v2.album.addQueue')}
          </button>
          <button type="button" class="noc-rond" class:actif={favori} aria-pressed={favori}
            aria-label={favori ? $t('v2.manquants.retirerFavori') : $t('v2.manquants.ajouterFavori')}
            onclick={() => album?.id != null && basculerFavoriLocal({ albumId: album.id })}>
            <Heart size={16} fill={favori ? 'currentColor' : 'none'} />
          </button>
          <div class="noc-menu-ancre">
            <button type="button" class="noc-rond" aria-label={$t('v2.cover.more')} aria-expanded={menuOuvert}
              onclick={() => (menuOuvert = !menuOuvert)}>
              <Ellipsis size={16} />
            </button>
            {#if menuOuvert}
              <div class="noc-menu" role="menu">
                <button type="button" role="menuitem" onclick={() => { menuOuvert = false; if (album?.id != null) lireAlbum(album.id, 0, true); }}>
                  <Shuffle size={15} /> {$t('v2.album.shuffle')}
                </button>
                {#if album.artist_id != null}
                  <button type="button" role="menuitem" onclick={() => { menuOuvert = false; ouvrirArtiste(); }}>
                    <User size={15} /> {$t('v2.album.fiche.viewArtist')}
                  </button>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </div>
    </header>

    {#if genre}<span class="noc-puce">{genre}</span>{/if}

    <section class="noc-album-apropos">
      <div class="noc-album-texte"><TexteRepliableNocturne texte={presentation} /></div>
      <div class="noc-album-fiche" data-faits-rapides>
        <!-- Itération 7 : « Faits rapides », données de Tune seulement. -->
        <p class="noc-faits-titre">{$t('nocturne.album.faits' as any)}</p>
        <dl class="noc-faits-liste">
        {#if annee}<div><dt>{$t('v2.album.fiche.release')}</dt><dd>{annee}</dd></div>{/if}
        <div><dt>{$t('v2.disco.quality')}</dt><dd><BadgeQualiteNocturne format={album.format} sample_rate={album.sample_rate} bit_depth={album.bit_depth} source={album.source ?? null} complet /></dd></div>
        {#if duree}<div><dt>{$t('v2.album.fiche.duration')}</dt><dd>{formatDuration(duree)}</dd></div>{/if}
        {#if album.format}<div><dt>{$t('v2.album.fiche.format')}</dt><dd>{album.format.toUpperCase()}{resolution(album) ? ` · ${resolution(album)}` : ''}</dd></div>{/if}
        {#if pistes.length}<div><dt>{$t('v2.album.fiche.tracks')}</dt><dd>{pistes.length}</dd></div>{/if}
        {#if ecoutes != null}<div><dt>{$t('nocturne.album.ecoutes' as any)}</dt><dd>{ecoutes}</dd></div>{/if}
        {#if premiere}<div><dt>{$t('nocturne.album.premiereEcoute' as any)}</dt><dd>{premiere.auPlusTard ? $t('nocturne.album.auPlusTard' as any).replace('{date}', dateCourte(premiere.date)) : dateCourte(premiere.date)}</dd></div>{/if}
        {#if derniere}<div><dt>{$t('nocturne.album.derniereEcoute' as any)}</dt><dd>{dateCourte(derniere)}</dd></div>{/if}
        {#if album.label}<div><dt>{$t('v2.album.fiche.label')}</dt><dd>{album.label}</dd></div>{/if}
        {#if disques > 1}<div><dt>{$t('v2.album.fiche.discs')}</dt><dd>{disques}</dd></div>{/if}
        </dl>
      </div>
    </section>

    <nav class="noc-onglets" aria-label={$t('v2.album.fiche.eyebrow')}>
      <button type="button" class:actif={onglet === 'pistes'} onclick={() => (onglet = 'pistes')}>{$t('v2.album.fiche.tracks')}</button>
      <button type="button" class:actif={onglet === 'credits'} onclick={() => (onglet = 'credits')}>{$t('artist.credits')}</button>
    </nav>

    {#if onglet === 'pistes'}
      <div class="noc-pistes-outils">
        <button type="button" class="noc-focus" aria-pressed={focus} onclick={() => (focus = !focus)}>
          <span class="noc-focus-chevron" class:ouvert={focus}><ChevronRight size={14} /></span>{$t('v2.disco.focus')}
        </button>
        {#if filtreOuvert}
          <!-- svelte-ignore a11y_autofocus -->
          <input class="noc-filtre" type="search" bind:value={filtre} placeholder={$t('nocturne.album.filtrerPistes')}
            aria-label={$t('nocturne.album.filtrerPistes')} autofocus
            onkeydown={(e) => { if (e.key === 'Escape') { filtre = ''; filtreOuvert = false; } }} />
        {/if}
        <button type="button" class="noc-filtrer" class:actif={filtreOuvert || filtre} aria-pressed={filtreOuvert}
          onclick={() => { filtreOuvert = !filtreOuvert; if (!filtreOuvert) filtre = ''; }}>
          <Funnel size={13} /> {$t('roonLike.filtrer')}
        </button>
      </div>
      <ol class="noc-pistes">
        {#each pistesVues as { p, i } (p.id ?? i)}
          {@const enCours = p.id != null && $currentTrackId === p.id}
          {@const aime = p.id != null && $favoriteTrackIds.has(p.id)}
          {#if !filtre && disques > 1 && (i === 0 || (pistes[i - 1].disc_number ?? 1) !== (p.disc_number ?? 1))}
            <li class="noc-disque">{$t('v2.album.fiche.discs')} {p.disc_number ?? 1}{p.disc_subtitle ? ` — ${p.disc_subtitle}` : ''}</li>
          {/if}
          <li class="noc-piste" class:en-cours={enCours} class:paire={i % 2 === 1}>
            <button type="button" class="noc-piste-lire" onclick={() => album?.id != null && lireAlbum(album.id, i)}
              aria-label={$t('v2.queue.playTrack').replace('{t}', p.title)}>
              <span class="noc-piste-num">
                {#if enCours && $playbackState === 'playing'}<AudioLines size={14} />{:else}<Play size={8} fill="currentColor" />{p.track_number ?? i + 1}{/if}
              </span>
              <span class="noc-piste-titres">
                <span class="noc-piste-titre" title={p.title}>{p.title}</span>
                <span class="noc-piste-artiste" title={p.artist_name ?? album.artist_name ?? ''}>{p.artist_name ?? album.artist_name ?? ''}</span>
              </span>
            </button>
            <BadgeQualiteNocturne format={p.format} sample_rate={p.sample_rate} bit_depth={p.bit_depth} source={p.source ?? null} />
            <span class="noc-piste-duree">{formatTime(p.duration_ms)}</span>
            <button type="button" class="noc-piste-geste" class:actif={aime} aria-pressed={aime}
              aria-label={aime ? $t('v2.manquants.retirerFavori') : $t('v2.manquants.ajouterFavori')}
              onclick={() => p.id != null && basculerFavoriLocal({ trackId: p.id })}>
              <Heart size={15} fill={aime ? 'currentColor' : 'none'} />
            </button>
            <MenuNocturne vertical actions={[
              { cle: 'ensuite', libelle: $t('v2.album.playNext'), icone: ListStart, faire: () => p.id != null && enfilerPiste(p.id, true) },
              { cle: 'file', libelle: $t('v2.album.addQueue'), icone: ListPlus, faire: () => p.id != null && enfilerPiste(p.id) },
              ...(album.artist_id != null ? [{ cle: 'artiste', libelle: $t('v2.album.fiche.viewArtist'), icone: User, faire: ouvrirArtiste }] : []),
            ]} />
          </li>
        {/each}
      </ol>
    {:else}
      {#if credits.length}
        <!-- Itération 8 : une rubrique par rôle, les noms en or (liens quand Tune connaît l'artiste). -->
        <div class="noc-credits" data-credits-par-role>
          {#each creditsParRole(credits) as g (g.role)}
            <div class="noc-credit-groupe">
              {#if g.role}<p class="noc-credit-role">{g.role}</p>{/if}
              <p class="noc-credit-noms">
                {#each g.noms as n, i (n.nom)}
                  {#if n.artisteId != null}
                    <button type="button" class="noc-credit-lien" onclick={() => n.artisteId != null && allerA({ nom: 'artiste', id: n.artisteId })}>{n.nom}</button>
                  {:else}
                    <span class="noc-credit-nom">{n.nom}</span>
                  {/if}{#if i < g.noms.length - 1}<span class="noc-credit-sep">, </span>{/if}
                {/each}
              </p>
            </div>
          {/each}
        </div>
      {:else}
        <p class="noc-vide">{$t('common.noResult')}</p>
      {/if}
    {/if}

    {#if !focus}
      <!-- Itération 6 : du même artiste, albums proches (même genre), musiciens. -->
      <div class="noc-voisinage">
        {#if duMeme.length}
          <RangeeNocturne titre={$t('nocturne.album.duMeme' as any).replace('{artiste}', album.artist_name ?? '')} albums={duMeme} triable={false} sobre />
        {/if}
        {#if proches.length}
          <RangeeNocturne titre={$t('nocturne.album.proches' as any)} albums={proches} triable={false} sobre />
        {/if}
        {#if credits.length}
          <section class="noc-musiciens" data-musiciens>
            <h2>{$t('nocturne.album.musiciens' as any)}</h2>
            <ul>
              {#each credits as m (m.nom)}
                <li>
                  <button type="button" class="noc-musicien" disabled={m.artisteId == null}
                    onclick={() => m.artisteId != null && allerA({ nom: 'artiste', id: m.artisteId })}>
                    <span class="noc-musicien-rond" aria-hidden="true">{initialeMusicien(m.nom)}</span>
                    <span class="noc-musicien-nom" title={m.nom}>{m.nom}</span>
                    {#if m.roles.length}<span class="noc-musicien-role" title={m.roles.join(', ')}>{m.roles.join(', ')}</span>{/if}
                  </button>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
      </div>
    {/if}
  </article>
{/if}

<style>
  .noc-voisinage { margin-top: var(--noc-ecart-rangees); display: flex; flex-direction: column; gap: var(--noc-ecart-rangees); }
  .noc-musiciens h2 {
    margin: 0 0 16px;
    font-size: var(--noc-taille-section);
    font-weight: var(--noc-graisse-titre);
    letter-spacing: var(--noc-interlettre-titre);
    color: var(--noc-texte);
  }
  .noc-musiciens ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--noc-largeur-musicien), 1fr));
    gap: var(--noc-ecart-tuiles);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .noc-musicien {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--noc-texte);
    font: inherit;
    text-align: center;
    cursor: pointer;
  }
  .noc-musicien:disabled { cursor: default; }
  .noc-musicien-rond {
    width: var(--noc-rond-musicien);
    height: var(--noc-rond-musicien);
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--noc-surface-3);
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-section);
    font-weight: var(--noc-graisse-forte);
  }
  .noc-musicien:not(:disabled):hover .noc-musicien-nom { color: var(--noc-ambre); }
  .noc-musicien-nom, .noc-musicien-role { max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .noc-musicien-nom { font-size: var(--noc-taille-texte); font-weight: var(--noc-graisse-forte); }
  .noc-musicien-role { color: var(--noc-ambre); font-size: var(--noc-taille-petit); }
  .noc-album { padding: 34px 0 48px; }
  .noc-album-entete {
    display: flex;
    gap: var(--noc-ecart-entete-page);
    align-items: center;
  }
  .noc-album-pochette {
    flex: 0 0 auto;
    width: var(--noc-pochette-album);
    height: var(--noc-pochette-album);
    margin-left: 8px;
    border-radius: var(--noc-rayon-grand);
    overflow: hidden;
    background: var(--noc-pochette-fond);
    box-shadow: var(--noc-pochette-ombre);
  }
  .noc-album-pochette :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .noc-album-tete { min-width: 0; padding-top: 24px; }
  .noc-surtitre {
    display: block;
    font-size: var(--noc-taille-surtitre);
    letter-spacing: var(--noc-interlettre-surtitre);
    text-transform: uppercase;
    font-weight: var(--noc-graisse-forte);
    color: var(--noc-texte-2);
  }
  h1 {
    margin: 10px 0 6px;
    font-size: var(--noc-taille-titre-page);
    font-weight: var(--noc-graisse-titre);
    letter-spacing: var(--noc-interlettre-titre);
    line-height: 1.1;
    color: var(--noc-texte);
  }
  .noc-lien-artiste {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: var(--noc-taille-lien-artiste);
    font-weight: var(--noc-graisse-normale);
    color: var(--noc-ambre);
    cursor: pointer;
  }
  .noc-lien-artiste:hover { color: var(--noc-ambre-vif); text-decoration: underline; }
  .noc-album-infos {
    margin: 22px 0 10px;
    color: var(--noc-texte);
    opacity: 0.82;
    font-size: var(--noc-taille-texte);
  }
  .noc-album-qualite { margin-bottom: 9px; }
  .noc-album-format {
    margin: 0 0 18px;
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-petit);
  }
  .noc-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .noc-bouton {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    height: var(--noc-hauteur-bouton);
    padding: 0 18px;
    border-radius: var(--noc-rayon);
    border: 1px solid var(--noc-ligne);
    background: var(--noc-surface);
    color: var(--noc-texte);
    font: inherit;
    font-size: var(--noc-taille-texte);
    font-weight: var(--noc-graisse-moyenne);
    cursor: pointer;
    transition: background var(--noc-duree);
  }
  .noc-bouton:hover { background: var(--noc-surface-3); }
  .noc-bouton-plein {
    background: var(--noc-ambre);
    border-color: var(--noc-ambre);
    color: var(--noc-sur-ambre);
    padding: 0 24px;
  }
  .noc-bouton-plein:hover { background: var(--noc-ambre-vif); }
  .noc-rond {
    width: var(--noc-hauteur-bouton);
    height: var(--noc-hauteur-bouton);
    display: grid;
    place-items: center;
    border-radius: 50%;
    border: 1px solid var(--noc-ligne);
    background: transparent;
    color: var(--noc-texte-2);
    cursor: pointer;
  }
  .noc-rond:hover { color: var(--noc-texte); background: var(--noc-surface); }
  .noc-rond.actif { color: var(--noc-ambre); border-color: var(--noc-ambre); }
  .noc-menu-ancre { position: relative; }
  .noc-menu {
    position: absolute;
    top: 46px;
    left: 0;
    z-index: 5;
    min-width: 210px;
    padding: 6px;
    border-radius: var(--noc-rayon-grand);
    border: 1px solid var(--noc-ligne);
    background: var(--noc-surface-2);
    box-shadow: var(--noc-carte-ombre);
  }
  .noc-menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 10px;
    border: 0;
    border-radius: var(--noc-rayon);
    background: none;
    color: var(--noc-texte);
    font: inherit;
    font-size: var(--noc-taille-texte);
    text-align: left;
    cursor: pointer;
  }
  .noc-menu button:hover { background: var(--noc-surface-3); }
  .noc-puce {
    display: inline-block;
    margin-top: 34px;
    padding: 6px 15px;
    border-radius: var(--noc-rayon-pilule);
    background: var(--noc-puce);
    color: var(--noc-texte);
    font-size: var(--noc-taille-surtitre);
    font-weight: var(--noc-graisse-forte);
    letter-spacing: var(--noc-interlettre-surtitre);
    text-transform: uppercase;
  }
  .noc-album-apropos {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--noc-largeur-fiche);
    gap: 30px;
    margin-top: 26px;
    padding-left: 8px;
  }
  .noc-album-texte { min-width: 0; }
  .noc-faits-titre {
    margin: 0 0 6px;
    font-size: var(--noc-taille-surtitre);
    font-weight: var(--noc-graisse-forte);
    letter-spacing: var(--noc-interlettre-surtitre);
    text-transform: uppercase;
    color: var(--noc-ambre);
  }
  .noc-faits-liste { margin: 0; }
  .noc-album-fiche {
    margin: 0;
    padding-left: 17px;
    border-left: 1px solid var(--noc-ligne);
    align-self: start;
  }
  .noc-album-fiche div {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    min-height: 28px;
    font-size: var(--noc-taille-petit);
  }
  .noc-album-fiche dt { color: var(--noc-texte-2); }
  .noc-album-fiche dd {
    margin: 0;
    color: var(--noc-texte);
    font-weight: var(--noc-graisse-forte);
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .noc-onglets {
    display: flex;
    gap: 32px;
    margin-top: 40px;
    border-bottom: 1px solid var(--noc-ligne);
  }
  .noc-onglets button {
    padding: 0 0 14px;
    margin-bottom: -1px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--noc-texte-2);
    font: inherit;
    font-size: var(--noc-taille-texte);
    font-weight: var(--noc-graisse-moyenne);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .noc-onglets button:hover { color: var(--noc-texte); }
  .noc-onglets button.actif { color: var(--noc-texte); border-bottom-color: var(--noc-ambre); }
  .noc-pistes-outils {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 18px;
  }
  .noc-focus,
  .noc-filtrer {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--noc-texte-2);
    font: inherit;
    font-size: var(--noc-taille-texte);
    cursor: pointer;
  }
  .noc-focus:hover,
  .noc-filtrer:hover,
  .noc-filtrer.actif { color: var(--noc-texte); }
  .noc-focus[aria-pressed='true'] { color: var(--noc-ambre); }
  .noc-focus-chevron { display: inline-flex; transition: transform var(--noc-duree); }
  .noc-focus-chevron.ouvert { transform: rotate(90deg); }
  .noc-filtrer { margin-left: auto; }
  .noc-filtre {
    margin-left: auto;
    width: 240px;
    height: 30px;
    padding: 0 10px;
    border-radius: var(--noc-rayon);
    border: 1px solid var(--noc-ligne);
    background: var(--noc-surface);
    color: var(--noc-texte);
    font: inherit;
    font-size: var(--noc-taille-petit);
  }
  .noc-filtre + .noc-filtrer { margin-left: 0; }
  .noc-album.focus .noc-puce,
  .noc-album.focus .noc-album-apropos,
  .noc-album.focus .noc-album-format,
  .noc-album.focus .noc-album-qualite { display: none; }
  .noc-album.focus .noc-album-pochette { width: 140px; height: 140px; }
  .noc-album.focus .noc-album-tete { padding-top: 0; }
  .noc-album.focus .noc-album-infos { margin: 10px 0 14px; }
  .noc-pistes {
    list-style: none;
    margin: 14px 0 0;
    padding: 0;
    border-radius: var(--noc-rayon);
    overflow: hidden;
    border: 1px solid var(--noc-ligne);
  }
  .noc-disque {
    padding: 10px 22px;
    background: var(--noc-fond-entete);
    color: var(--noc-texte-3);
    font-size: var(--noc-taille-surtitre);
    font-weight: var(--noc-graisse-forte);
    letter-spacing: var(--noc-interlettre-surtitre);
    text-transform: uppercase;
  }
  .noc-piste {
    display: flex;
    align-items: center;
    gap: 22px;
    min-height: var(--noc-hauteur-piste);
    padding: 0 18px 0 0;
    background: var(--noc-fond);
    border-top: 1px solid var(--noc-ligne);
    box-shadow: inset 3px 0 0 transparent;
  }
  .noc-piste:first-child { border-top: 0; }
  .noc-piste.paire { background: var(--noc-surface); }
  .noc-piste:hover { background: var(--noc-surface-2); }
  .noc-piste.en-cours { box-shadow: inset 3px 0 0 var(--noc-turquoise); }
  .noc-piste-lire {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 9px 0 9px 22px;
    border: 0;
    background: none;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .noc-piste-num {
    width: 32px;
    flex: 0 0 32px;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-petit);
    font-variant-numeric: tabular-nums;
  }
  .noc-piste-lire:hover .noc-piste-num { color: var(--noc-ambre); }
  .noc-piste.en-cours .noc-piste-num { color: var(--noc-turquoise); }
  .noc-piste-titres { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .noc-piste-titre {
    color: var(--noc-texte);
    font-size: var(--noc-taille-texte);
    font-weight: var(--noc-graisse-forte);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .noc-piste.en-cours .noc-piste-titre { color: var(--noc-turquoise); }
  .noc-piste-artiste {
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-petit);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .noc-piste-duree {
    width: 44px;
    text-align: right;
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-texte);
    font-variant-numeric: tabular-nums;
  }
  .noc-piste-geste {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--noc-texte-2);
    cursor: pointer;
  }
  .noc-piste-geste:hover { color: var(--noc-texte); }
  .noc-piste-geste.actif { color: var(--noc-ambre); }
  .noc-credits { display: flex; flex-direction: column; gap: 18px; margin-top: 26px; }
  .noc-credit-role {
    margin: 0 0 4px;
    font-size: var(--noc-taille-petit); /* itération 11 : lisible comme dans la référence */
    font-weight: var(--noc-graisse-forte);
    letter-spacing: var(--noc-interlettre-surtitre);
    text-transform: uppercase;
    color: var(--noc-texte-3);
  }
  .noc-credit-noms { margin: 0; font-size: var(--noc-taille-texte); line-height: 1.6; }
  .noc-credit-nom, .noc-credit-lien { color: var(--noc-ambre); font-weight: var(--noc-graisse-moyenne); }
  .noc-credit-lien { padding: 0; border: 0; background: none; font: inherit; cursor: pointer; }
  .noc-credit-lien:hover { color: var(--noc-ambre-vif); text-decoration: underline; }
  .noc-credit-sep { color: var(--noc-texte-3); }
  .noc-vide { color: var(--noc-texte-3); padding-top: 34px; }

  @media (max-width: 900px) {
    .noc-album-entete { flex-direction: column; align-items: flex-start; }
    .noc-album-pochette { width: min(var(--noc-pochette-album), 100%); height: auto; aspect-ratio: 1; margin-left: 0; }
    .noc-album-apropos { grid-template-columns: 1fr; }
    .noc-album-fiche { padding-left: 0; border-left: 0; }
  }
</style>
