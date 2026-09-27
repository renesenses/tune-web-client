<script lang="ts">
  /**
   * LA CARTE DE ZONE DE LA PREMIÈRE LIGNE — carré 315 × 315, pochette en plein
   * cadre. Maquette de Levente, 26/09/2026 : « The zones one I've changed to
   * 315x315 so it's more on grid […] better to have 1:1 ratio ».
   *
   * ## Elle ne remplace pas `zones-cartes`
   *
   * L'autre carte — pochette à gauche, informations à droite — reste ce
   * qu'elle est, et son widget aussi. Celle-ci est la carte de la LIGNE
   * D'EN-TÊTE, où la pochette est le sujet et non une vignette.
   *
   * ## Tout se lit dans le magasin VIVANT
   *
   * Le composant ne reçoit qu'un identifiant de zone. `charger` ne s'exécute
   * qu'une fois : en recopiant la position et le titre, la barre de
   * progression resterait figée à l'instant du chargement et la carte
   * annoncerait encore le morceau précédent (06/09/2026).
   *
   * ## Ce que la maquette montre et qui n'est PAS ici : aléatoire et boucle
   *
   * 🔴 Volontaire. `GET /zones` — la route dont vit le magasin — ne porte NI
   * `shuffle` NI `repeat` : ils sont sur `/zones/now-listening`, que cette
   * ligne n'interroge pas. Deux boutons dont on ne sait pas dire l'état sont
   * pires que pas de boutons : on ne peut pas distinguer « aléatoire éteint »
   * de « aléatoire inconnu », et le premier clic ment une fois sur deux.
   * `api.setShuffle` / `api.setRepeat` existent et prennent une zone : le jour
   * où l'état voyagera sur `/zones`, les deux boutons tiennent en dix lignes.
   */
  import AlbumArt from '../../partages/AlbumArt.svelte';
  import { t } from '../../../lib/i18n';
  import { formatTime } from '../../../lib/utils';
  import { switchZone } from '../../../lib/stores/zones';
  import { togglePlayPause } from '../../../lib/playback-controls';
  import type { Zone } from '../../../lib/types';

  let { zone }: { zone: Zone } = $props();

  const piste = $derived((zone as any)?.current_track ?? null);
  const joue = $derived(zone?.state === 'playing');

  /** « 44 kHz · 16 bit » — les deux chiffres que la maquette met en pastille. */
  const tech = $derived.by(() => {
    if (!piste) return '';
    const hz = piste.sample_rate ? `${Math.round(piste.sample_rate / 100) / 10} kHz` : '';
    const bits = piste.bit_depth ? `${piste.bit_depth} bit` : '';
    return [hz, bits].filter(Boolean).join(' · ');
  });

  /** Avancement en pourcentage, BORNÉ : une position au-delà de la durée
   *  arrive sur un flux dont la durée annoncée est fausse, et la barre
   *  déborderait de sa boîte. */
  const avance = $derived.by(() => {
    const d = piste?.duration_ms ?? 0;
    if (!d) return 0;
    return Math.max(0, Math.min(100, ((zone?.position_ms ?? 0) / d) * 100));
  });

  /**
   * Le bouton passe par le chemin PARTAGÉ.
   *
   * `api.pause()` seul ne remet pas le magasin à jour, et une zone à l'arrêt
   * demande de relancer la piste avec le bon corps selon son origine — radio,
   * service ou bibliothèque. `playback-controls` sait tout cela ; le réécrire
   * ici donnerait une deuxième vérité (#1478).
   */
  async function basculer() {
    if (zone?.id == null) return;
    // `state` est OPTIONNEL sur `Zone` — un serveur plus ancien peut ne pas le
    // rendre. « Arrêtée » est le repli sûr : `togglePlayPause` relance alors
    // la piste avec le bon corps selon son origine, au lieu d'envoyer une
    // pause à une zone dont on ne sait rien.
    await togglePlayPause(zone, piste ?? null, zone.state ?? 'stopped');
  }
</script>

<article class="carte" class:joue>
  <!-- La pochette EST le fond. `size={0}` adopte la boîte du parent : c'est
       `.cv` qui impose le carré, et c'est pour cela que la classe doit exister
       dans ce `<style>` (leçon des favoris Radio, 03/09/2026). -->
  <div class="cv" aria-hidden="true">
    <AlbumArt coverPath={piste?.cover_path ?? null} albumId={piste?.album_id ?? null}
      size={0} alt="" source={piste?.source ?? null}
      fallbackInitials={(piste?.title ?? zone?.name ?? '?').slice(0, 1)} />
  </div>

  <!-- Le voile : sans lui, un titre clair sur une pochette claire est
       illisible, et l'inverse sur une pochette sombre. Deux dégradés, un par
       bord, plutôt qu'un voile uniforme qui ternirait la pochette entière. -->
  <div class="voile" aria-hidden="true"></div>

  <div class="dedans">
    <header class="haut">
      <h3 class="titre" title={piste?.title ?? ''}>
        <strong>{piste?.title ?? '—'}</strong>{#if piste?.artist_name}<span class="tiret"> - </span>{piste.artist_name}{/if}
      </h3>
      <div class="pastilles">
        {#if piste?.format}<span class="pastille fmt">{String(piste.format).toUpperCase()}</span>{/if}
        {#if tech}<span class="pastille">{tech}</span>{/if}
        {#if piste?.year}<span class="annee">{piste.year}</span>{/if}
      </div>
      <!-- Le nom de la ZONE, et non l'appareil : c'est lui qui distingue deux
           cartes, et Bertrand l'avait demandé le 06/09 sur l'autre carte (« le
           nom de la zone n'apparait pas »). Un clic bascule sur cette zone. -->
      <button class="zone" onclick={() => zone?.id != null && switchZone(zone.id)}
        title={$t('v2.home.zoneOf' as any).replace('{z}', zone?.name ?? '')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" aria-hidden="true"><path d="M4 10a8 8 0 0 1 16 0M7.5 13a4.5 4.5 0 0 1 9 0"/><circle cx="12" cy="18" r="1.6"/></svg>
        <span>{zone?.name ?? ''}</span>
      </button>
    </header>

    <button class="galet" onclick={basculer}
      aria-label={$t((joue ? 'common.pause' : 'common.play') as any)}
      title={$t((joue ? 'common.pause' : 'common.play') as any)}>
      {#if joue}
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>
      {/if}
    </button>

    <footer class="transport">
      <span class="temps">{formatTime(zone?.position_ms ?? 0)}</span>
      <div class="piste"><i style:width="{avance}%"></i></div>
      <span class="temps">{piste?.duration_ms ? formatTime(piste.duration_ms) : '--:--'}</span>
    </footer>
  </div>
</article>

<style>
  /* Le CARRÉ. La hauteur vient de la ligne (`--l1-h`), le côté la suit : c'est
     ce qui garantit le 1:1 de Levente quel que soit l'écran. */
  .carte {
    position: relative; flex: 0 0 auto;
    width: var(--l1-h); height: var(--l1-h);
    border-radius: var(--v2-r-card); overflow: hidden;
    border: 1px solid var(--v2-line2); background: var(--v2-surface2);
  }
  /* La zone qui JOUE se distingue à l'œil : c'est l'information principale
     d'une ligne qui en montre plusieurs. */
  .carte.joue { border-color: color-mix(in srgb, var(--v2-acc1) 45%, transparent); }

  .cv { position: absolute; inset: 0; }
  .cv :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }

  .voile {
    position: absolute; inset: 0; pointer-events: none;
    background:
      linear-gradient(to bottom, color-mix(in srgb, var(--v2-scrim) 88%, transparent) 0%,
        color-mix(in srgb, var(--v2-scrim) 30%, transparent) 38%,
        color-mix(in srgb, var(--v2-scrim) 20%, transparent) 58%,
        color-mix(in srgb, var(--v2-scrim) 88%, transparent) 100%);
  }

  .dedans {
    position: absolute; inset: 0; display: flex; flex-direction: column;
    padding: 14px; gap: 10px;
  }

  .haut { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
  .titre {
    margin: 0; min-width: 0; color: #fff;
    font: 400 15px/1.25 var(--v2-sans);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    text-shadow: 0 1px 3px rgba(0, 0, 0, .55);
  }
  .titre strong { font-weight: 600; }
  .tiret { opacity: .75; }

  .pastilles { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .pastille {
    padding: 2px 8px; border-radius: var(--v2-r-pill);
    background: rgba(0, 0, 0, .45); border: 1px solid rgba(255, 255, 255, .22);
    color: #fff; font: 600 11px var(--v2-sans); letter-spacing: .02em;
  }
  .pastille.fmt { background: color-mix(in srgb, var(--v2-acc1) 72%, transparent); border-color: transparent; }
  .annee { color: rgba(255, 255, 255, .78); font: 500 11px var(--v2-sans); }

  .zone {
    align-self: flex-start; display: inline-flex; align-items: center; gap: 6px;
    max-width: 100%; min-width: 0; padding: 3px 9px;
    border-radius: var(--v2-r-pill); border: 1px solid rgba(255, 255, 255, .28);
    background: rgba(0, 0, 0, .42); color: #fff;
    font: 500 11px var(--v2-sans); cursor: pointer;
  }
  .zone:hover { border-color: #fff; }
  .zone svg { width: 13px; height: 13px; flex: 0 0 auto; }
  .zone span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Le galet central : il occupe tout ce qui reste entre l'en-tête et le
     transport, ce qui le centre sans calcul et sans position absolue. */
  .galet {
    flex: 1 1 auto; align-self: center; display: flex;
    align-items: center; justify-content: center;
    width: 100%; border: 0; background: none; color: #fff; cursor: pointer;
  }
  .galet svg {
    width: 62px; height: 62px; padding: 16px; border-radius: 50%;
    background: rgba(0, 0, 0, .38); border: 1px solid rgba(255, 255, 255, .34);
    box-sizing: border-box;
  }
  .galet:hover svg { background: rgba(0, 0, 0, .58); border-color: #fff; }

  .transport { display: flex; align-items: center; gap: 9px; }
  .temps {
    color: rgba(255, 255, 255, .86); font: 500 11px var(--v2-sans);
    font-variant-numeric: tabular-nums; flex: 0 0 auto;
  }
  .piste {
    flex: 1 1 auto; height: 4px; border-radius: 2px; overflow: hidden;
    background: rgba(255, 255, 255, .28);
  }
  .piste i { display: block; height: 100%; background: var(--v2-acc1); }
</style>
