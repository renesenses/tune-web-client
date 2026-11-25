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
  import { get } from 'svelte/store';
  import { allerA } from '../../lib/stores/salon';
  import { gestesNavigationService } from '../../lib/stores/navigation';
  import { joursDepuis, prenomDuProfil } from '../../lib/interfaceSalon';
  import IconeSalon, { type NomIcone } from './IconeSalon.svelte';
  import RangeeSalon from './RangeeSalon.svelte';
  import CarteAlbumSalon from './CarteAlbumSalon.svelte';

  const prenom = $derived(prenomDuProfil($profiles.find((p) => p.id === $currentProfileId) ?? null));

  let stats = $state<{ artists: number; albums: number; tracks: number } | null>(null);
  let nbCompositeurs = $state<number | null>(null);
  let recents = $state<Album[] | null>(null);
  /** « Nouveautés pour vous » : les sorties des artistes suivis, chez les services. */
  type Sortie = { service: string; source_id: string; title: string; cover_path: string | null; year: number | null; artist_name: string };
  let sorties = $state<Sortie[] | null>(null);
  let ongletNouveautes = $state<'albums' | 'singles'>('albums');
  /** Un single ou un EP se reconnaît à son titre : le service ne le dit pas ici. */
  const estSingle = (x: Sortie) => /\b(single|ep)\b/i.test(x.title);
  const nouveautes = $derived((sorties ?? []).filter((x) => (ongletNouveautes === 'singles') === estSingle(x)));
  function ouvrirSortie(x: Sortie) {
    get(gestesNavigationService)?.ouvrirAlbum({ service: x.service, albumId: x.source_id, titre: x.title, pochette: x.cover_path, artiste: x.artist_name });
  }

  onMount(() => {
    api.getLibraryStats().then((s) => { stats = s; }).catch(() => {});
    api.getLibraryFacets(['composer'], undefined, 0).then((f) => { nbCompositeurs = (f.composer ?? []).length; }).catch(() => {});
    api.getRecentAlbums(20).then((l) => { recents = l ?? []; }).catch(() => { recents = []; });
    api.getArtistReleases(24).then((g) => { sorties = (g ?? []).flatMap((x) => x.releases.map((r) => ({ ...r, artist_name: x.artist_name }))); }).catch(() => { sorties = []; });
  });

  const tuiles = $derived<{ icone: NomIcone; n: number | null; cle: string; aller: () => void }[]>([
    { icone: 'artistes', n: stats?.artists ?? null, cle: 'salon.stats.artistes', aller: () => allerA({ page: 'artistes' }) },
    { icone: 'albums', n: stats?.albums ?? null, cle: 'salon.stats.albums', aller: () => allerA({ page: 'albums' }) },
    { icone: 'morceaux', n: stats?.tracks ?? null, cle: 'salon.stats.morceaux', aller: () => allerA({ page: 'tune', vue: 'library' }) },
    { icone: 'compositeurs', n: nbCompositeurs, cle: 'salon.stats.compositeurs', aller: () => allerA({ page: 'tune', vue: 'library' }) },
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

  <RangeeSalon titre={$t('salon.accueil.nouveautes' as any)}
    onglets={[{ id: 'albums', libelle: $t('salon.accueil.albums' as any) }, { id: 'singles', libelle: $t('salon.accueil.singles' as any) }]}
    ongletActif={ongletNouveautes} onOnglet={(id) => (ongletNouveautes = id as 'albums' | 'singles')}
    onPlus={() => allerA({ page: 'tune', vue: 'streaming' })}>
    {#if sorties === null}
      <p class="attente">{$t('salon.chargement' as any)}</p>
    {:else}
      {#each nouveautes as x (`${x.service}:${x.source_id}`)}
        <CarteAlbumSalon album={{ id: null, title: x.title, artist_name: x.artist_name, cover_path: x.cover_path } as Album}
          surtitre={x.year ? String(x.year) : null} onOuvrir={() => ouvrirSortie(x)} />
      {:else}
        <p class="attente">{$t('salon.accueil.aucuneNouveaute' as any)}</p>
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
    background: var(--s-tuile); border: 1px solid var(--s-bord-tuile); cursor: pointer; text-align: left; color: var(--s-txt); font: inherit;
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
