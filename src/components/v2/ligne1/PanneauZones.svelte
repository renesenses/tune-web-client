<script lang="ts">
  /**
   * LE PANNEAU DES ZONES de la première ligne — maquette « Home Dashboard with
   * Album Grid » de Levente, 15/11/2026.
   *
   * Une ligne par zone : la pochette de ce qui y joue, le nom de la zone, le
   * titre et l'artiste, et le bouton lecture/pause. En tête, le nombre de
   * zones actives ; en pied, le chemin vers l'écran des zones.
   *
   * ## Aucun appel réseau
   *
   * Tout vient du magasin `zones`, que la coquille tient à jour par la
   * WebSocket. Comme les cartes : la ligne lit le magasin VIVANT, jamais une
   * copie figée au chargement (correctif du 27/09/2026).
   *
   * ## Rien de ce que faisaient les cartes ne se perd
   *
   * Le panneau remplace les cartes carrées quand il est coché. Ce qu'elles
   * portaient en plus — aléatoire, répétition, progression — reste dans la
   * barre de lecture et dans le widget « Cartes de zones » ; décocher le
   * panneau en mode « Modifier » rend les cartes.
   *
   * ⚠️ Pas de « Ajouter une zone » ici : la maquette en dessine un, mais
   * l'ajout d'une zone se fait par la découverte des appareils, dans l'écran
   * des zones — c'est là que mène « Gérer les zones ».
   */
  import AlbumArt from '../../partages/AlbumArt.svelte';
  import { t, tn } from '../../../lib/i18n';
  import { zones, switchZone } from '../../../lib/stores/zones';
  import { activeView } from '../../../lib/stores/navigation';
  import { togglePlayPause } from '../../../lib/playback-controls';
  import { LARGEUR_PANNEAU, nbZonesActives, zonesDuPanneau } from '../../../lib/premiereLigne';
  import type { Zone } from '../../../lib/types';
  import PanneauL1 from './PanneauL1.svelte';

  const liste = $derived(zonesDuPanneau($zones));
  const actives = $derived(nbZonesActives($zones));

  /** Ce que dit la ligne sous le nom : le titre et l'artiste, ou rien. */
  function sous(z: Zone): string {
    const p = z.current_track;
    if (!p?.title) return '';
    return [p.title, p.artist_name].filter((x) => x && String(x).trim()).join(' — ');
  }

  async function ouvrir(z: Zone) {
    if (z.id == null) return;
    await switchZone(z.id);
    activeView.set('nowplaying');
  }

  async function basculer(z: Zone) {
    if (z.id == null) return;
    // Même appel que la carte : `togglePlayPause` sait relancer une zone
    // arrêtée avec le bon corps selon l'origine de la piste.
    await togglePlayPause(z, z.current_track ?? null, z.state ?? 'stopped');
  }
</script>

<PanneauL1 titre={$t('v2.home.l1Zones' as any)} largeur={LARGEUR_PANNEAU}>
  {#snippet icone()}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="m3 13 9 5 9-5"/></svg>
  {/snippet}
  {#snippet entete()}
    {#if actives > 0}
      <span class="pastille" data-zones-actives>{$tn('v2.home.l1ZonesActiveN', actives)}</span>
    {/if}
  {/snippet}

  <div class="cadre">
    {#if !liste.length}
      <p class="etat">{$t('v2.home.widgetEmpty' as any)}</p>
    {:else}
      <ul>
        {#each liste as z (z.id)}
          {@const joue = z.state === 'playing'}
          <li class:active={z.state === 'playing' || z.state === 'paused'}>
            <button class="zone" onclick={() => ouvrir(z)} title={z.name}>
              <span class="cv" aria-hidden="true">
                <AlbumArt coverPath={z.current_track?.cover_path ?? null} albumId={null} size={0} vignette
                  alt="" source={z.current_track?.source ?? null} fallbackInitials={z.name?.slice(0, 1) ?? null} />
              </span>
              <span class="txt">
                <span class="nom">{z.name}</span>
                {#if sous(z)}<span class="sous">{sous(z)}</span>{/if}
              </span>
            </button>
            {#if z.current_track}
              <button class="galet" class:joue onclick={() => basculer(z)}
                      title={joue ? $t('common.pause' as any) : $t('common.play' as any)}
                      aria-label={`${joue ? $t('common.pause' as any) : $t('common.play' as any)} — ${z.name}`}>
                {#if joue}
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/></svg>
                {:else}
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>
                {/if}
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <button class="gerer" onclick={() => activeView.set('zonemanager')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>
      {$t('v2.home.l1ManageZones' as any)}
    </button>
  </div>
</PanneauL1>

<style>
  .cadre { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; }
  .etat { margin: 0; color: var(--v2-txt3); font: 400 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); }

  ul { flex: 1 1 auto; min-height: 0; overflow-y: auto; list-style: none; margin: 0; padding: 0;
       display: flex; flex-direction: column; gap: 2px; }
  li { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 3px 4px; border-radius: var(--v2-r-md); }
  li:hover { background: var(--v2-hover); }

  .zone {
    flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 10px;
    padding: 0; border: 0; background: none; color: inherit; text-align: left; cursor: pointer;
  }
  /* `size={0}` : AlbumArt adopte la boîte du parent, c'est `.cv` qui fixe le carré. */
  .cv { flex: 0 0 34px; width: 34px; height: 34px; border-radius: 6px; overflow: hidden; background: var(--v2-surface); }
  .txt { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .nom, .sous { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nom { color: var(--v2-txt); font: 600 calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); }
  li:not(.active) .nom { color: var(--v2-txt2); }
  .sous { color: var(--v2-txt3); font: 400 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-sans); }

  .galet {
    flex: 0 0 auto; display: grid; place-items: center; width: 28px; height: 28px; padding: 0;
    border: 1.5px solid var(--v2-line2); border-radius: 50%; background: none; color: var(--v2-txt2); cursor: pointer;
  }
  .galet.joue { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .galet:hover { color: var(--v2-txt); border-color: var(--v2-acc1); }
  .galet svg { width: 13px; height: 13px; }

  .pastille {
    padding: 2px 9px; border-radius: var(--v2-r-pill);
    border: 1px solid color-mix(in srgb, var(--v2-acc1) 45%, transparent);
    background: color-mix(in srgb, var(--v2-acc1) 12%, transparent);
    color: var(--v2-acc1); font: 600 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-sans); white-space: nowrap;
  }

  .gerer {
    flex: 0 0 auto; align-self: flex-start; display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 12px; border-radius: var(--v2-r-pill); border: 1px solid var(--v2-line2);
    background: var(--v2-surface); color: var(--v2-txt2); cursor: pointer;
    font: 500 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans);
  }
  .gerer:hover { border-color: var(--v2-acc1); color: var(--v2-txt); }
  .gerer svg { width: 14px; height: 14px; }
</style>
