<script lang="ts">
  /**
   * Barre latérale de Salon : EXPLORER, MA BIBLIOTHÈQUE, LISTES DE LECTURE.
   * Les entrées que Salon redessine ouvrent sa page ; les autres montent
   * l'écran de Tune correspondant dans la coquille.
   */
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import { pageSalon, allerA } from '../../lib/stores/salon';
  import { pendingPlaylistId } from '../../lib/stores/playlists';
  import { memePage, type PageSalon } from '../../lib/interfaceSalon';
  import type { Playlist } from '../../lib/types';
  import IconeSalon, { type NomIcone } from './IconeSalon.svelte';

  interface Entree { cle: string; icone: NomIcone; page: PageSalon }
  const tune = (vue: string): PageSalon => ({ page: 'tune', vue });

  const EXPLORER: Entree[] = [
    { cle: 'nav.home', icone: 'accueil', page: { page: 'accueil' } },
    { cle: 'nav.genres', icone: 'genres', page: { page: 'genres' } },
    { cle: 'v2.nav.streaming', icone: 'services', page: tune('streaming') },
    { cle: 'v2.nav.radios', icone: 'radio', page: tune('radios') },
    { cle: 'v2.nav.later', icone: 'plusTard', page: tune('ecouterplustard') },
    { cle: 'salon.nav.etiquettes', icone: 'etiquette', page: tune('tags') },
    { cle: 'nav.history', icone: 'historique', page: tune('history') },
  ];
  const BIBLIOTHEQUE: Entree[] = [
    { cle: 'salon.nav.albums', icone: 'albums', page: { page: 'albums' } },
    { cle: 'salon.nav.artistes', icone: 'artistes', page: { page: 'artistes' } },
    { cle: 'salon.nav.morceaux', icone: 'morceaux', page: tune('library') },
    { cle: 'v2.nav.podcasts', icone: 'podcasts', page: tune('podcasts') },
    { cle: 'v2.nav.favorites', icone: 'favoris', page: tune('favorites') },
    { cle: 'nav.browse', icone: 'dossier', page: tune('browse') },
  ];

  /** L'entrée allumée : la page ouverte, ou la famille d'une fiche. */
  function allumee(e: Entree, p: PageSalon): boolean {
    if (memePage(e.page, p)) return true;
    if (p.page === 'album' && e.page.page === 'albums') return true;
    if (p.page === 'artiste' && e.page.page === 'artistes') return true;
    if (p.page === 'genre' && e.page.page === 'genres') return true;
    return false;
  }

  let listes = $state<Playlist[]>([]);
  onMount(() => {
    api.getPlaylists(200).then((l) => { listes = l ?? []; }).catch(() => { listes = []; });
  });

  /** Une liste précise : l'écran complet, ouvert sur elle (le chemin de
   *  `PlaylistDetailV2` › « Gestionnaire »). Sans liste : l'écran Playlists. */
  function ouvrirListe(id: number | null) {
    if (id == null) { allerA(tune('playlists')); return; }
    pendingPlaylistId.set(id);
    allerA(tune('playlistmanager'));
  }

  let menuOuvert = $state(false);
</script>

<svelte:window onclick={() => (menuOuvert = false)} />

<nav class="barre" aria-label={$t('salon.nav.titre' as any)}>
  <div class="tete">
    <span class="marque">Tune</span>
    <button class="ico" onclick={() => allerA(tune('settings'))}
      aria-label={$t('v2.nav.settings' as any)} title={$t('v2.nav.settings' as any)}>
      <IconeSalon nom="reglages" taille={14} />
    </button>
    <div class="menu-ancre">
      <button class="ico" aria-haspopup="menu" aria-expanded={menuOuvert}
        aria-label={$t('salon.nav.plus' as any)} title={$t('salon.nav.plus' as any)}
        onclick={(e) => { e.stopPropagation(); menuOuvert = !menuOuvert; }}>
        <IconeSalon nom="points" taille={16} trait={2.4} />
      </button>
      {#if menuOuvert}
        <div class="s-menu menu" role="menu">
          <button role="menuitem" onclick={() => allerA(tune('zonemanager'))}>{$t('nav.zonemanager' as any)}</button>
          <button role="menuitem" onclick={() => allerA(tune('nowplaying'))}>{$t('nav.nowplaying' as any)}</button>
          <button role="menuitem" onclick={() => allerA(tune('plugins'))}>{$t('v2.nav.plugins' as any)}</button>
          <button role="menuitem" onclick={() => allerA(tune('settings'))}>{$t('salon.nav.changerInterface' as any)}</button>
        </div>
      {/if}
    </div>
  </div>

  <div class="defile">
    <h3>{$t('salon.nav.explorer' as any)}</h3>
    <ul>
      {#each EXPLORER as e (e.cle)}
        <li><button class:on={allumee(e, $pageSalon)} aria-current={allumee(e, $pageSalon) ? 'page' : undefined} onclick={() => allerA(e.page)}>
          <IconeSalon nom={e.icone} taille={15} /><span>{$t(e.cle as any)}</span>
        </button></li>
      {/each}
    </ul>

    <h3>{$t('salon.nav.bibliotheque' as any)}</h3>
    <ul>
      {#each BIBLIOTHEQUE as e (e.cle)}
        <li><button class:on={allumee(e, $pageSalon)} aria-current={allumee(e, $pageSalon) ? 'page' : undefined} onclick={() => allerA(e.page)}>
          <IconeSalon nom={e.icone} taille={15} /><span>{$t(e.cle as any)}</span>
        </button></li>
      {/each}
    </ul>

    <div class="h3-ligne">
      <button class="h3-lien" onclick={() => ouvrirListe(null)}>{$t('salon.nav.listes' as any)}
        <IconeSalon nom="suivant" taille={12} trait={2.2} /></button>
      <button class="ico petit" onclick={() => ouvrirListe(null)} aria-label={$t('salon.nav.nouvelleListe' as any)} title={$t('salon.nav.nouvelleListe' as any)}>
        <IconeSalon nom="plus" taille={15} />
      </button>
    </div>
    <ul class="listes">
      {#each listes as l (l.id)}
        <li><button class="liste" onclick={() => ouvrirListe(l.id)} title={l.name}><span>{l.name}</span><IconeSalon nom="listeLecture" taille={11} /></button></li>
      {:else}
        <li class="aucune">{$t('salon.nav.aucuneListe' as any)}</li>
      {/each}
    </ul>
  </div>
</nav>

<style>
  .barre {
    background: var(--s-side); color: var(--s-txt2);
    display: flex; flex-direction: column; min-height: 0;
    border-right: 1px solid var(--s-line);
  }
  .tete { display: flex; align-items: center; gap: 2px; padding: 18px 8px 10px 16px; }
  .marque {
    font-family: var(--s-police-titre); font-size: var(--s-t-marque);
    color: var(--s-txt); margin-right: auto; letter-spacing: .01em; line-height: 1;
  }
  .ico {
    background: none; border: 0; color: var(--s-txt2); cursor: pointer;
    width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
  }
  .ico:hover { background: var(--s-survol); color: var(--s-txt); }
  .ico.petit { width: 22px; height: 22px; }
  .menu-ancre { position: relative; }
  .menu { left: 0; top: 30px; z-index: 40; }
  .defile { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px 20px 8px; }
  h3, .h3-lien {
    font-size: var(--s-t-barre-section); font-weight: 400; letter-spacing: .03em;
    text-transform: uppercase; color: var(--s-txt); margin: 14px 0 4px 8px;
  }
  h3:first-child { margin-top: 4px; }
  .h3-ligne { display: flex; align-items: center; gap: 6px; margin: 18px 0 4px 8px; }
  .h3-lien {
    margin: 0; background: none; border: 0; cursor: pointer; padding: 0;
    display: inline-flex; align-items: center; gap: 2px; font-family: inherit; white-space: nowrap; text-align: left;
  }
  ul { list-style: none; margin: 0; padding: 0; }
  li button {
    width: 100%; display: flex; align-items: center; gap: 9px;
    background: none; border: 0; cursor: pointer; font: inherit;
    font-size: var(--s-t-barre); color: var(--s-txt2);
    padding: 5px 8px; border-radius: var(--s-r-item); text-align: left;
  }
  li button:hover { color: var(--s-txt); background: var(--s-survol); }
  li button.on { color: var(--s-acc); }
  li button span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .liste { color: var(--s-txt3); gap: 5px; }
  .liste :global(svg) { flex: none; color: var(--s-txt3); }
  .aucune { padding: 5px 8px; color: var(--s-txt3); font-size: var(--s-t-barre); }
</style>
