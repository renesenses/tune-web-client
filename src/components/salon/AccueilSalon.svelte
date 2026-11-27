<script lang="ts">
  /**
   * Accueil Roon-like, de haut en bas : la salutation, quatre chiffres de la
   * bibliothèque, le bandeau « Dernièrement » (AJOUTÉ / JOUÉ), « Écouter plus
   * tard », « Nouveautés pour vous », puis les sections du bas
   * (`SectionsAccueilSalon`) et toutes les autres rangées de l'accueil de
   * Tune (`RangeesTuneSalon`). Une section sans données ne s'affiche pas.
   */
  import { onMount } from 'svelte';
  import { t, locale } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import type { Album } from '../../lib/types';
  import { profiles, currentProfileId } from '../../lib/stores/profile';
  import { get } from 'svelte/store';
  import { allerA } from '../../lib/stores/salon';
  import { joursDepuis, prenomDuProfil } from '../../lib/interfaceSalon';
  import IconeSalon, { type NomIcone } from './IconeSalon.svelte';
  import RangeeSalon from './RangeeSalon.svelte';
  import CarteAlbumSalon from './CarteAlbumSalon.svelte';
  import NouveautesSalon from './NouveautesSalon.svelte';
  import SectionsAccueilSalon from './SectionsAccueilSalon.svelte';
  import RangeesTuneSalon from './RangeesTuneSalon.svelte';
  import { widgetParId, type Element } from '../../lib/accueilWidgets';
  import { ouvrirElementSalon } from '../../lib/ouvrirElementSalon';
  import { albums as albumsBiblio } from '../../lib/stores/library';
  import { zones } from '../../lib/stores/zones';

  const prenom = $derived(prenomDuProfil($profiles.find((p) => p.id === $currentProfileId) ?? null));

  let stats = $state<{ artists: number; albums: number; tracks: number } | null>(null);
  let nbCompositeurs = $state<number | null>(null);
  let recents = $state<Album[] | null>(null);
  /** « Dernièrement » › JOUÉ : ce qui a été écouté récemment (widget de
   *  l'accueil de Tune `recemment-ecoutes`). L'onglet n'existe que s'il y a
   *  quelque chose à montrer. */
  let joues = $state<Element[]>([]);
  let ongletDernierement = $state<'ajoute' | 'joue'>('ajoute');
  const ongletsDernierement = $derived([
    { id: 'ajoute', libelle: $t('roonLike.accueil.ajoute' as any) },
    ...(joues.length ? [{ id: 'joue', libelle: $t('roonLike.accueil.joue' as any) }] : []),
  ]);

  onMount(() => {
    api.getLibraryStats().then((s) => { stats = s; }).catch(() => {});
    api.getLibraryFacets(['composer'], undefined, 0).then((f) => { nbCompositeurs = (f.composer ?? []).length; }).catch(() => {});
    api.getRecentAlbums(20).then((l) => { recents = l ?? []; }).catch(() => { recents = []; });
    const w = widgetParId('recemment-ecoutes');
    w?.charger({ profileId: get(currentProfileId), albums: get(albumsBiblio), zones: get(zones), langue: get(locale) })
      .then((els) => { joues = els ?? []; }).catch(() => { joues = []; });
  });

  const tuiles = $derived<{ icone: NomIcone; n: number | null; cle: string; aller: () => void }[]>([
    { icone: 'artistes', n: stats?.artists ?? null, cle: 'roonLike.stats.artistes', aller: () => allerA({ page: 'artistes' }) },
    { icone: 'albums', n: stats?.albums ?? null, cle: 'roonLike.stats.albums', aller: () => allerA({ page: 'albums' }) },
    { icone: 'morceaux', n: stats?.tracks ?? null, cle: 'roonLike.stats.morceaux', aller: () => allerA({ page: 'tune', vue: 'library' }) },
    { icone: 'compositeurs', n: nbCompositeurs, cle: 'roonLike.stats.compositeurs', aller: () => allerA({ page: 'tune', vue: 'library' }) },
  ]);

  function ajoute(a: Album): string {
    const j = joursDepuis(a.added_at);
    if (j == null) return '';
    if (j === 0) return $t('roonLike.ajoute.aujourdhui' as any);
    if (j === 1) return $t('roonLike.ajoute.hier' as any);
    return $t('roonLike.ajoute.ilYA' as any).replace('{n}', String(j));
  }
</script>

<div class="accueil" data-page-salon="accueil">
  <h1 class="s-titre salut">{prenom ? $t('roonLike.accueil.bonjourNom' as any).replace('{nom}', prenom) : $t('roonLike.accueil.bonjour' as any)}</h1>

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

  <RangeeSalon bandeau titre={$t('roonLike.accueil.dernierement' as any)}
    onglets={ongletsDernierement} ongletActif={ongletDernierement} onOnglet={(id) => (ongletDernierement = id as 'ajoute' | 'joue')}
    onPlus={() => (ongletDernierement === 'joue' ? allerA({ page: 'tune', vue: 'history' }) : allerA({ page: 'albums' }))}>
    {#if ongletDernierement === 'joue'}
      {#each joues as e (e.id)}
        <CarteAlbumSalon album={{ id: null, title: e.titre, artist_name: e.sous ?? null, cover_path: e.cover ?? null } as unknown as Album}
          inverse onOuvrir={() => ouvrirElementSalon(e)} />
      {/each}
    {:else if recents === null}
      <p class="attente">{$t('roonLike.chargement' as any)}</p>
    {:else}
      {#each recents as a (a.id ?? a.title)}
        <CarteAlbumSalon album={a} surtitre={ajoute(a)} inverse />
      {:else}
        <p class="attente">{$t('roonLike.accueil.rienDeNeuf' as any)}</p>
      {/each}
    {/if}
  </RangeeSalon>

  <button class="plus-tard" onclick={() => allerA({ page: 'tune', vue: 'ecouterplustard' })}>
    <span class="pt-titre">{$t('v2.nav.later' as any)}</span>
    <span class="pt-texte">
      <span class="pt-grand">{$t('roonLike.accueil.plusTardTitre' as any)}</span>
      <span class="pt-petit">{$t('roonLike.accueil.plusTardAide' as any)}</span>
    </span>
  </button>

  <NouveautesSalon />
  <SectionsAccueilSalon />
  <RangeesTuneSalon />
</div>

<style>
  .accueil { max-width: var(--s-largeur-accueil); margin: 0 auto; padding: 48px var(--s-marge-fiche) 40px; }
  .salut { font-size: var(--s-t-titre-accueil); margin-bottom: 52px; }
  .tuiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 72px; }
  .tuile {
    display: flex; align-items: center; gap: 12px; height: var(--s-haut-tuile); border-radius: var(--s-r-tuile); padding: 0 24px;
    background: var(--s-tuile); border: 1px solid var(--s-bord-tuile); cursor: pointer; text-align: left; color: var(--s-txt); font: inherit;
  }
  .tuile:hover { background: var(--s-survol); }
  .ic { color: var(--s-txt); display: grid; }
  .chiffres { display: flex; flex-direction: column; gap: 2px; }
  .n { font-size: var(--s-t-chiffre); font-weight: 500; line-height: 1; white-space: nowrap; }
  .attente { color: inherit; opacity: .75; margin: 0; grid-column: 1 / -1; }
  .plus-tard {
    width: 100%; display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 40px;
    margin: -14px 0 48px; padding: 28px; min-height: 150px;
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
  /* Téléphone : tuiles resserrées, le chiffre ne déborde plus. */
  @media (max-width: 760px) {
    .accueil { padding-top: 24px; }
    .salut { margin-bottom: 28px; }
    .tuiles { gap: 10px; margin-bottom: 40px; }
    .tuile { padding: 0 12px; gap: 10px; }
    .ic :global(svg) { width: 24px; height: 24px; }
    .plus-tard { gap: 16px; padding: 20px; }
  }
</style>
