<script lang="ts">
  /**
   * Tiroir de navigation : il glisse depuis la gauche par-dessus le contenu
   * flouté, ou reste ÉPINGLÉ (le contenu se décale alors pour lui laisser la
   * place).
   */
  import X from '@lucide/svelte/icons/x';
  import House from '@lucide/svelte/icons/house';
  import Disc3 from '@lucide/svelte/icons/disc-3';
  import MicVocal from '@lucide/svelte/icons/mic-vocal';
  import ListMusic from '@lucide/svelte/icons/list-music';
  import Moon from '@lucide/svelte/icons/moon';
  import Sun from '@lucide/svelte/icons/sun';
  import Pin from '@lucide/svelte/icons/pin';
  import { t } from '../../lib/i18n';
  import { profiles, currentProfileId } from '../../lib/stores/profile';
  import { ecranNocturne, ouvrirRubrique, type EcranNocturne } from './navigationNocturne';

  interface Props {
    ouvert: boolean;
    epingle: boolean;
    theme: 'sombre' | 'clair';
    fermer: () => void;
    basculerEpingle: () => void;
    basculerTheme: () => void;
    ouvrirFile: () => void;
  }
  let { ouvert, epingle, theme, fermer, basculerEpingle, basculerTheme, ouvrirFile }: Props = $props();

  const profil = $derived($profiles.find((p) => p.id === $currentProfileId) ?? null);
  const nomProfil = $derived(profil?.display_name || profil?.name || '');

  const bibliotheque: { e: EcranNocturne; cle: string; icone: typeof House }[] = [
    { e: { nom: 'accueil' }, cle: 'nav.home', icone: House },
    { e: { nom: 'albums' }, cle: 'common.albums', icone: Disc3 },
    { e: { nom: 'artistes' }, cle: 'common.artists', icone: MicVocal },
  ];

  function aller(e: EcranNocturne) {
    ouvrirRubrique(e);
    if (!epingle) fermer();
  }
  function actif(e: EcranNocturne): boolean {
    const c = $ecranNocturne;
    if (e.nom === 'albums') return c.nom === 'albums' || c.nom === 'album';
    if (e.nom === 'artistes') return c.nom === 'artistes' || c.nom === 'artiste';
    return c.nom === e.nom;
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
    <img class="noc-tiroir-logo" src="/favicon.svg" alt="Tune" width="58" height="58" />
    {#if !epingle}
      <button type="button" class="noc-tiroir-fermer" onclick={fermer} aria-label={$t('common.close')}><X size={15} /></button>
    {/if}
  </div>

  {#if nomProfil}
    <div class="noc-tiroir-profil">
      <span class="noc-tiroir-avatar">{nomProfil.slice(0, 1).toUpperCase()}</span>
      <span class="noc-tiroir-nom" title={nomProfil}>{nomProfil}</span>
    </div>
  {/if}

  <div class="noc-tiroir-corps">
    <h2>{$t('nav.library')}</h2>
    <ul>
      {#each bibliotheque as r (r.cle)}
        {@const Icone = r.icone}
        <li>
          <button type="button" class:actif={actif(r.e)} onclick={() => aller(r.e)}>
            <Icone size={18} /> {$t(r.cle)}
          </button>
        </li>
      {/each}
    </ul>

    <h2>{$t('v2.nav.tools')}</h2>
    <ul>
      <li>
        <button type="button" onclick={() => { if (!epingle) fermer(); ouvrirFile(); }}>
          <ListMusic size={18} /> {$t('nav.queue')}
        </button>
      </li>
      <li>
        <button type="button" onclick={basculerTheme} aria-pressed={theme === 'clair'}>
          {#if theme === 'clair'}<Sun size={18} />{:else}<Moon size={18} />{/if} {$t('settings.theme')}
        </button>
      </li>
    </ul>
  </div>

  <label class="noc-tiroir-epingle">
    <Pin size={15} />
    <span>{$t('v2.sc.pin')}</span>
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
    padding: 18px 18px 0 16px;
  }
  .noc-tiroir-logo {
    width: 58px;
    height: 58px;
    border-radius: 10px;
  }
  .noc-tiroir-fermer {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: var(--noc-rayon);
    border: 1px solid var(--noc-ligne);
    background: var(--noc-fond-tiroir);
    color: var(--noc-texte-2);
    cursor: pointer;
  }
  .noc-tiroir-fermer:hover { color: var(--noc-texte); }
  .noc-tiroir-profil {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 22px 16px 4px;
    padding-bottom: 18px;
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
    color: var(--noc-texte);
    font-size: var(--noc-taille-texte);
    font-weight: var(--noc-graisse-forte);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .noc-tiroir-corps { flex: 1; overflow-y: auto; padding: 6px 0 12px; }
  h2 {
    margin: 22px 0 6px;
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
    height: 44px;
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
    margin: 10px;
    padding: 14px 14px;
    border-radius: var(--noc-rayon-grand);
    border: 1px solid var(--noc-ligne);
    background: var(--noc-fond-tiroir);
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-petit);
    font-weight: var(--noc-graisse-moyenne);
    cursor: pointer;
  }
  .noc-tiroir-epingle span:not(.noc-bascule) { flex: 1; color: var(--noc-texte); }
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
