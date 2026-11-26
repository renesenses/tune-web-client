<script lang="ts">
  /**
   * Page artiste Nocturne : portrait, sur-titre, nom, lecture et favori,
   * biographie repliable, puis la discographie en rangées (albums, live,
   * compilations, apparitions — les sections que rend le serveur).
   */
  import Play from '@lucide/svelte/icons/play';
  import Heart from '@lucide/svelte/icons/heart';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import type { Album, Artist } from '../../lib/types';
  import { basculerFavoriLocal } from '../../lib/favorisLocaux';
  import { favoriteArtistIds } from '../../lib/stores/profile';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import RangeeNocturne from './RangeeNocturne.svelte';
  import TexteRepliableNocturne from './TexteRepliableNocturne.svelte';
  import { lireArtiste } from './lectureNocturne';

  interface Props { id: number }
  let { id }: Props = $props();

  let artiste = $state<Artist | null>(null);
  let sections = $state<{ cle: string; titre: string; albums: Album[] }[]>([]);
  let bio = $state<string | null>(null);
  let echec = $state(false);

  $effect(() => {
    const cible = id;
    artiste = null; sections = []; bio = null; echec = false;
    api.getArtist(cible).then((a) => { if (cible === id) { artiste = a; if (a?.bio) bio = a.bio; } })
      .catch(() => { if (cible === id) echec = true; });
    api.getArtistBio(cible).then((b) => { if (cible === id && b?.bio) bio = b.bio; }).catch(() => {});
    api.getArtistAlbumsSections(cible).then((s) => {
      if (cible !== id || !s) return;
      const tr = $t;
      sections = [
        { cle: 'albums', titre: tr('v2.disco.discography'), albums: s.albums ?? [] },
        { cle: 'live', titre: tr('v2.disco.live'), albums: s.live ?? [] },
        { cle: 'compilations', titre: tr('v2.disco.compilations'), albums: s.compilations ?? [] },
        { cle: 'appearances', titre: tr('v2.disco.appearsOn'), albums: s.appearances ?? [] },
      ].filter((x) => x.albums.length);
    }).catch(() => {
      // Serveur antérieur aux sections : la liste simple.
      api.getArtistAlbums(cible).then((l) => {
        if (cible === id) sections = [{ cle: 'albums', titre: $t('v2.disco.discography'), albums: l ?? [] }];
      }).catch(() => {});
    });
  });

  const nbAlbums = $derived(sections.reduce((n, s) => n + s.albums.length, 0));
  const favori = $derived(artiste?.id != null && $favoriteArtistIds.has(artiste.id));
  const initiales = $derived((artiste?.name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase() ?? '').join(''));
</script>

{#if echec}
  <p class="noc-vide">{$t('common.error')}</p>
{:else if !artiste}
  <p class="noc-vide">{$t('common.loading')}</p>
{:else}
  <!-- Même langage que la page album : en-tête (visuel, sur-titre, titre,
       ligne d'infos, boutons), puce, texte de présentation, puis les rangées. -->
  <article class="noc-artiste-page">
    <header class="noc-artiste-entete">
      <div class="noc-artiste-portrait">
        <AlbumArt coverPath={artiste.image_path} size={0} recadrer alt={artiste.name} fallbackInitials={initiales} />
      </div>
      <div class="noc-artiste-tete">
        <span class="noc-surtitre">{$t('common.artist')}</span>
        <h1>{artiste.name}</h1>
        {#if nbAlbums}<p class="noc-artiste-infos">{nbAlbums} {$t('v2.art.albums')}</p>{/if}
        <div class="noc-actions">
          <button type="button" class="noc-bouton noc-bouton-plein" onclick={() => artiste?.id != null && lireArtiste(artiste.id)}>
            <Play size={15} fill="currentColor" /> {$t('common.play')}
          </button>
          <button type="button" class="noc-rond" class:actif={favori} aria-pressed={favori}
            aria-label={favori ? $t('v2.manquants.retirerFavori') : $t('v2.manquants.ajouterFavori')}
            onclick={() => artiste?.id != null && basculerFavoriLocal({ artistId: artiste.id })}>
            <Heart size={17} fill={favori ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    </header>

    {#if artiste.country}<span class="noc-puce">{artiste.country}</span>{/if}

    {#if bio}
      <section class="noc-artiste-bio">
        <h2>{$t('v2.art.bio')}</h2>
        <TexteRepliableNocturne texte={bio} />
      </section>
    {/if}

    {#each sections as s (s.cle)}
      <RangeeNocturne titre={s.titre} albums={s.albums} triInitial="annee" />
    {/each}
  </article>
{/if}

<style>
  /* Mesures de la page album (AlbumNocturne) : mêmes jetons, mêmes retraits. */
  .noc-artiste-page { padding: 34px 0 48px; }
  .noc-artiste-entete { display: flex; align-items: center; gap: var(--noc-ecart-entete-page); }
  .noc-artiste-portrait {
    flex: 0 0 auto;
    width: var(--noc-portrait-artiste);
    height: var(--noc-portrait-artiste);
    margin-left: 8px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--noc-pochette-fond);
    box-shadow: var(--noc-pochette-ombre);
  }
  .noc-artiste-portrait :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .noc-artiste-tete { min-width: 0; padding-top: 24px; }
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
    font-size: var(--noc-taille-titre-artiste);
    font-weight: var(--noc-graisse-titre);
    letter-spacing: var(--noc-interlettre-titre);
    line-height: 1.1;
    color: var(--noc-texte);
  }
  .noc-artiste-infos {
    margin: 14px 0 18px;
    color: var(--noc-texte);
    opacity: 0.82;
    font-size: var(--noc-taille-texte);
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
  .noc-artiste-bio { margin-top: 26px; padding-left: 8px; max-width: 980px; }
  .noc-artiste-bio h2 {
    margin: 0 0 10px;
    font-size: var(--noc-taille-section);
    font-weight: var(--noc-graisse-titre);
    letter-spacing: var(--noc-interlettre-titre);
    color: var(--noc-texte);
  }
  .noc-vide { color: var(--noc-texte-3); padding-top: 34px; }
  @media (max-width: 900px) {
    .noc-artiste-entete { flex-direction: column; align-items: flex-start; }
    .noc-artiste-portrait { width: min(var(--noc-portrait-artiste), 100%); height: auto; aspect-ratio: 1; margin-left: 0; }
  }
</style>
