<script lang="ts">
  /**
   * Tiroir de navigation : compte, puis les sections de Tune (streaming,
   * fichiers locaux, outils). Il glisse depuis la gauche par-dessus le contenu
   * flouté, ou reste ouvert (« Garder le panneau ouvert ») : le contenu se
   * décale alors pour lui laisser la place. Les entrées sans écran Nocturne
   * ouvrent l'écran de Tune correspondant dans la coquille.
   */
  import X from '@lucide/svelte/icons/x';
  import Disc3 from '@lucide/svelte/icons/disc-3';
  import MicVocal from '@lucide/svelte/icons/mic-vocal';
  import Heart from '@lucide/svelte/icons/heart';
  import History from '@lucide/svelte/icons/history';
  import Music2 from '@lucide/svelte/icons/music-2';
  import Plus from '@lucide/svelte/icons/plus';
  import Settings2 from '@lucide/svelte/icons/settings-2';
  import Speaker from '@lucide/svelte/icons/speaker';
  import Triangle from '@lucide/svelte/icons/triangle';
  import Brush from '@lucide/svelte/icons/brush';
  import Settings from '@lucide/svelte/icons/settings';
  import CircleHelp from '@lucide/svelte/icons/circle-help';
  import UserRound from '@lucide/svelte/icons/user-round';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Moon from '@lucide/svelte/icons/moon';
  import Sun from '@lucide/svelte/icons/sun';
  import Pin from '@lucide/svelte/icons/pin';
  import { t } from '../../lib/i18n';
  import { profiles, currentProfileId } from '../../lib/stores/profile';
  import { capaciteTess } from '../../lib/stores/tess';
  import { v2SettingsTarget } from '../../lib/stores/v2SettingsNav';
  import type { V2SettingsTabId } from '../../lib/v2Settings';
  import { ecranNocturne, ouvrirRubrique, ouvrirTune, type EcranNocturne } from './navigationNocturne';

  interface Props {
    ouvert: boolean;
    epingle: boolean;
    theme: 'sombre' | 'clair';
    /** Montée dans la coquille de Tune : les écrans de Tune sont disponibles. */
    integree: boolean;
    fermer: () => void;
    basculerEpingle: () => void;
    basculerTheme: () => void;
  }
  let { ouvert, epingle, theme, integree, fermer, basculerEpingle, basculerTheme }: Props = $props();

  const profil = $derived($profiles.find((p) => p.id === $currentProfileId) ?? null);
  const nomProfil = $derived(profil?.display_name || profil?.name || '');

  type Entree = { cle: string; libelle: string; icone: typeof Disc3; aller: () => void; actif: boolean; tune?: boolean };

  function nocturne(e: EcranNocturne, libelle: string, icone: typeof Disc3): Entree {
    const c = $ecranNocturne;
    const actif = c.nom === e.nom || (e.nom === 'albums' && c.nom === 'album') || (e.nom === 'artistes' && c.nom === 'artiste');
    return { cle: e.nom, libelle, icone, aller: () => ouvrirRubrique(e), actif };
  }
  function tune(cle: string, libelle: string, icone: typeof Disc3, vue: string, onglet?: string): Entree {
    const c = $ecranNocturne;
    return {
      cle, libelle, icone, tune: true,
      aller: () => ouvrirTune(vue, onglet),
      actif: c.nom === 'tune' && c.vue === vue && (c.onglet ?? null) === (onglet ?? null),
    };
  }
  function reglages(cle: string, libelle: string, icone: typeof Disc3, tab?: V2SettingsTabId): Entree {
    const e = tune(cle, libelle, icone, 'settings');
    return { ...e, actif: e.actif && !tab, aller: () => { if (tab) v2SettingsTarget.set({ tab }); ouvrirTune('settings'); } };
  }

  const sections = $derived.by(() => {
    const tr = $t;
    const l = [
      { id: 'streaming', titre: tr('nocturne.tiroir.streaming'), entrees: [
        tune('s-albums', tr('common.albums'), Disc3, 'streaming', 'mine'),
        tune('s-artistes', tr('common.artists'), MicVocal, 'favorites', 'artists'),
        tune('s-favoris', tr('nav.favorites'), Heart, 'favorites', 'albums'),
        tune('s-ecoutes', tr('v2.home.wRecentlyPlayed'), History, 'history'),
      ] },
      { id: 'locaux', titre: tr('nocturne.tiroir.locaux'), entrees: [
        nocturne({ nom: 'albums' }, tr('common.albums'), Disc3),
        nocturne({ nom: 'artistes' }, tr('common.artists'), MicVocal),
        tune('l-genres', tr('nav.genres'), Music2, 'library', 'genres'),
        reglages('l-ajouter', tr('nocturne.tiroir.ajouterMusique'), Plus, 'library'),
        tune('l-gerer', tr('nocturne.tiroir.gerer'), Settings2, 'metadata'),
      ] },
      { id: 'outils', titre: tr('v2.nav.tools'), entrees: [
        tune('o-zones', tr('nocturne.tiroir.appareils'), Speaker, 'zonemanager'),
        ...($capaciteTess !== 'non' ? [tune('o-tess', tr('v2.nav.tess'), Triangle, 'tess')] : []),
        reglages('o-perso', tr('nocturne.tiroir.personnaliser'), Brush, 'display'),
        reglages('o-reglages', tr('v2.nav.settings'), Settings),
        tune('o-aide', tr('nocturne.tiroir.aide'), CircleHelp, 'support'),
        reglages('o-compte', tr('nocturne.tiroir.compte'), UserRound, 'access'),
      ] },
    ];
    return l;
  });

  function aller(e: Entree) {
    e.aller();
    if (!epingle) fermer();
  }
  function clavier(e: KeyboardEvent) {
    if (ouvert && !epingle && e.key === 'Escape') fermer();
  }
</script>

<svelte:window onkeydown={clavier} />

{#if !epingle}
  <div class="noc-tiroir-voile" class:ouvert onclick={fermer} aria-hidden="true"></div>
{/if}
<nav class="noc-tiroir" class:ouvert={ouvert || epingle} class:epingle aria-label={$t('v2.nav.menu')} inert={!ouvert && !epingle}>
  <div class="noc-tiroir-tete">
    <img class="noc-tiroir-logo" src="/favicon.svg" alt="Tune" width="48" height="48" />
    <div class="noc-tiroir-tete-boutons">
      <button type="button" class="noc-tiroir-fermer" onclick={basculerTheme} aria-pressed={theme === 'clair'}
        aria-label={$t('settings.theme')} title={$t('settings.theme')}>
        {#if theme === 'clair'}<Sun size={14} />{:else}<Moon size={14} />{/if}
      </button>
      {#if !epingle}
        <button type="button" class="noc-tiroir-fermer" onclick={fermer} aria-label={$t('common.close')} title={$t('common.close')}><X size={15} /></button>
      {/if}
    </div>
  </div>

  {#if nomProfil}
    <button type="button" class="noc-tiroir-profil" onclick={() => { if (integree) { v2SettingsTarget.set({ tab: 'access' }); ouvrirTune('settings'); if (!epingle) fermer(); } }}>
      <span class="noc-tiroir-avatar">{nomProfil.slice(0, 1).toUpperCase()}</span>
      <span class="noc-tiroir-nom" title={nomProfil}>{nomProfil}</span>
      <ChevronDown size={14} />
    </button>
  {/if}

  <div class="noc-tiroir-corps">
    {#each sections as s (s.id)}
      <h2>{s.titre}</h2>
      <ul>
        {#each s.entrees as e (e.cle)}
          {@const Icone = e.icone}
          <li>
            <button type="button" class:actif={e.actif} onclick={() => aller(e)}>
              <Icone size={17} /> <span class="noc-tiroir-libelle" title={e.libelle}>{e.libelle}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/each}
  </div>

  <label class="noc-tiroir-epingle">
    <Pin size={15} />
    <span class="noc-tiroir-epingle-textes">
      <span class="noc-tiroir-epingle-titre">{$t('nocturne.tiroir.garderOuvert')}</span>
      <span class="noc-tiroir-epingle-aide">{$t('nocturne.tiroir.garderOuvertAide')}</span>
    </span>
    <input type="checkbox" role="switch" checked={epingle} onchange={basculerEpingle} />
    <span class="noc-bascule" aria-hidden="true"></span>
  </label>
</nav>

<style>
  .noc-tiroir-voile {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: var(--noc-voile);
    backdrop-filter: blur(var(--noc-flou-voile));
    -webkit-backdrop-filter: blur(var(--noc-flou-voile));
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--noc-duree);
  }
  .noc-tiroir-voile.ouvert { opacity: 1; pointer-events: auto; }
  .noc-tiroir {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 51;
    width: var(--noc-largeur-tiroir);
    display: flex;
    flex-direction: column;
    background: var(--noc-fond-tiroir);
    backdrop-filter: blur(var(--noc-flou-tiroir));
    -webkit-backdrop-filter: blur(var(--noc-flou-tiroir));
    border-right: 1px solid var(--noc-ligne);
    transform: translateX(-105%);
    transition: transform calc(var(--noc-duree) * 1.4) ease;
  }
  .noc-tiroir.ouvert { transform: none; }
  .noc-tiroir.epingle { z-index: 20; transition: none; }
  .noc-tiroir-tete {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 20px 18px 0 16px;
  }
  .noc-tiroir-logo {
    width: var(--noc-logo-tiroir);
    height: var(--noc-logo-tiroir);
    border-radius: 14px;
  }
  .noc-tiroir-fermer {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: var(--noc-rayon);
    border: 1px solid var(--noc-ligne);
    background: transparent;
    color: var(--noc-texte-2);
    cursor: pointer;
  }
  .noc-tiroir-fermer:hover { color: var(--noc-texte); }
  .noc-tiroir-tete-boutons { display: flex; gap: 6px; }
  .noc-tiroir-profil {
    width: calc(100% - 32px);
    border: 0;
    border-bottom: 1px solid var(--noc-ligne);
    background: none;
    font: inherit;
    color: var(--noc-texte-2);
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 40px 16px 2px;
    padding-bottom: 26px;
    border-bottom: 1px solid var(--noc-ligne);
  }
  .noc-tiroir-avatar {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--noc-ambre);
    color: var(--noc-sur-ambre);
    font-size: var(--noc-taille-barre-titre);
    font-weight: var(--noc-graisse-titre);
  }
  .noc-tiroir-nom {
    flex: 1;
    min-width: 0;
    color: var(--noc-texte);
    font-size: var(--noc-taille-texte);
    font-weight: var(--noc-graisse-forte);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .noc-tiroir-corps { flex: 1; overflow-y: auto; padding: 0 0 12px; }
  h2 {
    margin: 18px 0 10px;
    padding: 0 24px;
    font-size: var(--noc-taille-section-tiroir);
    font-weight: var(--noc-graisse-forte);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--noc-texte-3);
  }
  ul { list-style: none; margin: 0; padding: 0 8px; }
  li button {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    height: var(--noc-hauteur-rubrique);
    padding: 0 16px;
    border: 0;
    border-radius: var(--noc-rayon);
    background: none;
    color: var(--noc-texte);
    font: inherit;
    font-size: var(--noc-taille-tiroir);
    font-weight: var(--noc-graisse-moyenne);
    text-align: left;
    cursor: pointer;
  }
  li button :global(svg) { color: var(--noc-texte-2); }
  li button:hover { background: var(--noc-surface); }
  li button.actif { background: var(--noc-surface); box-shadow: inset 3px 0 0 var(--noc-ambre); }
  li button.actif :global(svg) { color: var(--noc-ambre); }
  .noc-tiroir-epingle {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 8px 10px;
    padding: 10px 14px;
    border-radius: var(--noc-rayon-grand);
    border: 1px solid var(--noc-ligne);
    background: transparent;
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-petit);
    font-weight: var(--noc-graisse-moyenne);
    cursor: pointer;
  }
  .noc-tiroir-epingle-textes { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .noc-tiroir-epingle-titre { color: var(--noc-texte); font-weight: var(--noc-graisse-forte); }
  .noc-tiroir-epingle-aide { color: var(--noc-texte-2); font-size: var(--noc-taille-mini); font-weight: 400; line-height: 1.3; }
  .noc-tiroir-libelle { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .noc-tiroir-epingle input { position: absolute; opacity: 0; pointer-events: none; }
  .noc-bascule {
    position: relative;
    width: 34px;
    height: 20px;
    border-radius: var(--noc-rayon-pilule);
    background: var(--noc-surface-3);
    transition: background var(--noc-duree);
  }
  .noc-bascule::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--noc-texte);
    transition: transform var(--noc-duree);
  }
  .noc-tiroir-epingle input:checked + .noc-bascule { background: var(--noc-turquoise); }
  .noc-tiroir-epingle input:checked + .noc-bascule::after { transform: translateX(14px); }
  .noc-tiroir-epingle input:focus-visible + .noc-bascule { outline: 2px solid var(--noc-focus); outline-offset: 2px; }
</style>
