<script lang="ts">
  /**
   * Accueil de Salon : la salutation, quatre chiffres de la bibliothèque, le
   * bandeau « Dernièrement », « Écouter plus tard », puis une rangée d'albums
   * à redécouvrir.
   */
  import { onMount } from 'svelte';
  import { t, locale } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import type { Album } from '../../lib/types';
  import { profiles, currentProfileId } from '../../lib/stores/profile';
  import { allerA } from '../../lib/stores/salon';
  import { joursDepuis, prenomDuProfil } from '../../lib/interfaceSalon';
  import IconeSalon, { type NomIcone } from './IconeSalon.svelte';
  import RangeeSalon from './RangeeSalon.svelte';
  import CarteAlbumSalon from './CarteAlbumSalon.svelte';

  const prenom = $derived(prenomDuProfil($profiles.find((p) => p.id === $currentProfileId) ?? null));

  let stats = $state<{ artists: number; albums: number; tracks: number } | null>(null);
  let nbGenres = $state<number | null>(null);
  let recents = $state<Album[] | null>(null);
  let hasard = $state<Album[] | null>(null);

  onMount(() => {
    api.getLibraryStats().then((s) => { stats = s; }).catch(() => {});
    api.getGenres().then((g) => { nbGenres = g?.length ?? 0; }).catch(() => {});
    api.getRecentAlbums(20).then((l) => { recents = l ?? []; }).catch(() => { recents = []; });
    api.getAlbumsPagines({ limit: 15, sort: 'random' }).then((p) => { hasard = p.items; }).catch(() => { hasard = []; });
  });

  const tuiles = $derived<{ icone: NomIcone; n: number | null; cle: string; aller: () => void }[]>([
    { icone: 'artistes', n: stats?.artists ?? null, cle: 'salon.stats.artistes', aller: () => allerA({ page: 'artistes' }) },
    { icone: 'albums', n: stats?.albums ?? null, cle: 'salon.stats.albums', aller: () => allerA({ page: 'albums' }) },
    { icone: 'morceaux', n: stats?.tracks ?? null, cle: 'salon.stats.morceaux', aller: () => allerA({ page: 'tune', vue: 'library' }) },
    { icone: 'genres', n: nbGenres, cle: 'salon.stats.genres', aller: () => allerA({ page: 'genres' }) },
  ]);

  function ajoute(a: Album): string {
    const j = joursDepuis(a.added_at);
    if (j == null) return '';
    if (j === 0) return $t('salon.ajoute.aujourdhui' as any);
    if (j === 1) return $t('salon.ajoute.hier' as any);
    return $t('salon.ajoute.ilYA' as any).replace('{n}', String(j));
  }
</script>

<div class="accueil" data-page-salon="accueil">
  <h1 class="s-titre salut">{prenom ? $t('salon.accueil.bonjourNom' as any).replace('{nom}', prenom) : $t('salon.accueil.bonjour' as any)}</h1>

  <div class="tuiles">
    {#each tuiles as tu (tu.cle)}
      <button class="tuile" onclick={tu.aller}>
        <span class="ic"><IconeSalon nom={tu.icone} taille={34} trait={1.2} /></span>
        <span class="chiffres">
          <span class="n">{tu.n == null ? '—' : tu.n.toLocaleString($locale)}</span>
          <span class="s-surtitre">{$t(tu.cle as any)}</span>
        </span>
      </button>
    {/each}
  </div>

  <RangeeSalon bandeau titre={$t('salon.accueil.dernierement' as any)}
    onglets={[{ id: 'ajoute', libelle: $t('salon.accueil.ajoute' as any) }]} ongletActif="ajoute"
    onPlus={() => allerA({ page: 'albums' })}>
    {#if recents === null}
      <p class="attente">{$t('salon.chargement' as any)}</p>
    {:else}
      {#each recents as a (a.id ?? a.title)}
        <CarteAlbumSalon album={a} surtitre={ajoute(a)} inverse />
      {:else}
        <p class="attente">{$t('salon.accueil.rienDeNeuf' as any)}</p>
      {/each}
    {/if}
  </RangeeSalon>

  <button class="plus-tard" onclick={() => allerA({ page: 'tune', vue: 'ecouterplustard' })}>
    <span class="pt-titre">{$t('v2.nav.later' as any)}</span>
    <span class="pt-texte">
      <span class="pt-grand">{$t('salon.accueil.plusTardTitre' as any)}</span>
      <span class="pt-petit">{$t('salon.accueil.plusTardAide' as any)}</span>
    </span>
  </button>

  <RangeeSalon titre={$t('salon.accueil.redecouvrir' as any)} onPlus={() => allerA({ page: 'albums' })}>
    {#if hasard === null}
      <p class="attente">{$t('salon.chargement' as any)}</p>
    {:else}
      {#each hasard as a (a.id ?? a.title)}
        <CarteAlbumSalon album={a} />
      {/each}
    {/if}
  </RangeeSalon>
</div>

<style>
  .accueil { max-width: var(--s-largeur-accueil); margin: 0 auto; padding: 48px var(--s-marge-fiche) 40px; }
  .salut { font-size: var(--s-t-titre-accueil); margin-bottom: 64px; }
  .tuiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 96px; }
  .tuile {
    display: flex; align-items: center; gap: 16px; height: var(--s-haut-tuile); border-radius: var(--s-r-tuile); padding: 0 30px;
    background: var(--s-tuile); border: 0; cursor: pointer; text-align: left; color: var(--s-txt); font: inherit;
  }
  .tuile:hover { background: var(--s-survol); }
  .ic { color: var(--s-txt); display: grid; }
  .chiffres { display: flex; flex-direction: column; gap: 2px; }
  .n { font-size: var(--s-t-chiffre); font-weight: 500; line-height: 1; }
  .attente { color: inherit; opacity: .75; margin: 0; grid-column: 1 / -1; }
  .plus-tard {
    width: 100%; display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 40px;
    margin: -14px 0 56px; padding: 32px; min-height: 180px;
    background: var(--s-plus-tard); border: 0; cursor: pointer; text-align: left; color: var(--s-txt); font: inherit;
  }
  .pt-titre { font-family: var(--s-police-titre); font-size: var(--s-t-titre-hero); line-height: 1.05; max-width: 6em; }
  .pt-texte { display: flex; flex-direction: column; gap: 8px; text-align: center; }
  .pt-grand { font-family: var(--s-police-titre); font-size: var(--s-t-accroche); }
  .pt-petit { font-size: var(--s-t-corps); color: var(--s-txt2); }
  @media (max-width: 1100px) {
    .tuiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .plus-tard { grid-template-columns: 1fr; }
  }
</style>
