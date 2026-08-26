<script lang="ts">
  import { currentZone } from '../lib/stores/zones';
  import { isBrowserZone, browserSeek } from '../lib/stores/browserAudio';
  import * as api from '../lib/api';
  import { formatTime } from '../lib/utils';
  import { t } from '../lib/i18n';
  import { seekPositionMs, startSeekTimer, stopSeekTimer } from '../lib/stores/nowPlaying';
  import {
    ETAT_OUVERTURE_INITIAL,
    suivreOuverture,
    type EtatOuverture,
  } from '../lib/ouvertureFlux';

  interface Props {
    positionMs: number;
    durationMs: number;
    enabled?: boolean;
  }

  let { positionMs = 0, durationMs = 0, enabled = true }: Props = $props();

  let isDragging = $state(false);
  let dragPositionMs = $state(0);
  let trackEl: HTMLElement | undefined = $state();

  let zone = $derived($currentZone);

  $effect(() => {
    if (!isDragging) {
      dragPositionMs = positionMs;
    }
  });

  /** Relance l'interpolation locale UNIQUEMENT si la zone joue vraiment.
   *  Se positionner sur la barre en PAUSE démarrait le ticker : le compteur
   *  grimpait tout seul alors que rien ne sortait (retour Alex Campbell, 09/08).
   *  En pause/arrêt on l'arrête au contraire, la position affichée reste celle
   *  du point choisi jusqu'à la reprise. */
  function syncTicker() {
    if (zone?.state === 'playing') startSeekTimer();
    else stopSeekTimer();
  }

  function pctFromX(x: number): number {
    if (!trackEl || !durationMs) return 0;
    const rect = trackEl.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - rect.left) / rect.width));
  }

  function handleClick(e: MouseEvent) {
    if (!enabled || !durationMs || !zone?.id) return;
    const newPos = Math.floor(pctFromX(e.clientX) * durationMs);
    // Optimistically update the seek position so the progress bar
    // immediately reflects the clicked position without waiting for
    // the server round-trip or the next poller tick.
    seekPositionMs.set(newPos);
    syncTicker();
    if (isBrowserZone(zone)) browserSeek(newPos);
    api.seek(zone.id, newPos);
  }

  function handleMouseDown(e: MouseEvent) {
    if (!enabled || !durationMs) return;
    isDragging = true;
    dragPositionMs = Math.floor(pctFromX(e.clientX) * durationMs);

    function onMove(ev: MouseEvent) {
      dragPositionMs = Math.floor(pctFromX(ev.clientX) * durationMs);
    }
    function onUp() {
      isDragging = false;
      if (zone?.id) {
        // Optimistic update: lock the seek position so the progress bar
        // doesn't snap back to the pre-seek value from the poller.
        seekPositionMs.set(dragPositionMs);
        syncTicker();
        if (isBrowserZone(zone)) browserSeek(dragPositionMs);
        api.seek(zone.id, dragPositionMs);
      }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleTouchStart(e: TouchEvent) {
    if (!enabled || !durationMs) return;
    isDragging = true;
    dragPositionMs = Math.floor(pctFromX(e.touches[0].clientX) * durationMs);

    function onMove(ev: TouchEvent) {
      ev.preventDefault();
      dragPositionMs = Math.floor(pctFromX(ev.touches[0].clientX) * durationMs);
    }
    function onEnd() {
      isDragging = false;
      if (zone?.id) {
        // Optimistic update: lock the seek position so the progress bar
        // doesn't snap back to the pre-seek value from the poller.
        seekPositionMs.set(dragPositionMs);
        syncTicker();
        if (isBrowserZone(zone)) browserSeek(dragPositionMs);
        api.seek(zone.id, dragPositionMs);
      }
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    }
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }

  let displayPositionMs = $derived(isDragging ? dragPositionMs : positionMs);
  let progress = $derived(durationMs > 0 ? (displayPositionMs / durationMs) * 100 : 0);

  // La valeur de droite bascule entre durée totale et temps restant (#2040,
  // Vincent). Les deux nombres nécessaires sont déjà là — c'est une
  // soustraction, pas une donnée de plus à demander au serveur.
  //
  // Le choix se retient : quelqu'un qui préfère le temps restant le préfère
  // sur toutes les pistes, pas seulement celle-ci. localStorage plutôt que le
  // serveur — c'est une préférence d'affichage locale, pas un réglage de zone.
  const REMAINING_KEY = 'tune.seekbar.showRemaining';
  let showRemaining = $state(
    typeof localStorage !== 'undefined' && localStorage.getItem(REMAINING_KEY) === '1'
  );

  function toggleRemaining() {
    showRemaining = !showRemaining;
    try {
      localStorage.setItem(REMAINING_KEY, showRemaining ? '1' : '0');
    } catch {
      // Navigation privée, quota plein : la bascule marche quand même pour
      // cette session. Ne pas faire échouer un affichage sur un stockage.
    }
  }

  // `max(0, …)` : la position peut dépasser la durée d'une fraction de seconde
  // en fin de piste (le pointeur avance entre deux rafraîchissements), et
  // « -0:01 » restant se lit comme un défaut.
  let remainingMs = $derived(Math.max(0, durationMs - displayPositionMs));

  // ── Ouverture du flux (#2267) ────────────────────────────────────────────
  // Tant que le serveur cherche une URL jouable, la barre n'a rien de vrai à
  // montrer : ni position, ni durée. Elle le dit, au lieu de rester figée.
  // Toute la décision — y compris le plafond anti-blocage — vit dans
  // lib/ouvertureFlux, pour être vérifiable sans rendu.
  let etatOuverture = $state<EtatOuverture>(ETAT_OUVERTURE_INITIAL);

  function rafraichirOuverture() {
    etatOuverture = suivreOuverture(etatOuverture, zone, Date.now());
  }

  // Deux déclencheurs, et il faut les deux : la zone, pour réagir tout de
  // suite ; l'horloge, parce que le plafond doit tomber même si plus AUCUNE
  // mise à jour n'arrive — WebSocket coupée, serveur parti. C'est justement le
  // cas où le drapeau reste levé.
  $effect(() => {
    void zone?.resolving;
    void zone?.state;
    rafraichirOuverture();
  });

  $effect(() => {
    if (etatOuverture.depuisMs === null) return;
    const minuteur = setInterval(rafraichirOuverture, 1000);
    return () => clearInterval(minuteur);
  });

  let ouverture = $derived(etatOuverture.visible);
</script>

<div class="seek-bar" class:disabled={!enabled}>
  <span class="time">{formatTime(displayPositionMs)}</span>
  <div class="seek-track" class:ouverture bind:this={trackEl} onclick={handleClick} onmousedown={handleMouseDown} ontouchstart={handleTouchStart} role="slider" aria-valuemin={0} aria-valuemax={durationMs} aria-valuenow={displayPositionMs} aria-label="Seek" aria-busy={ouverture} title={ouverture ? $t('zone.resolving') : undefined} tabindex={0}>
    <div class="seek-fill" style="width: {progress}%"></div>
    <div class="seek-thumb" style="left: {progress}%"></div>
  </div>
  <button
    class="time time-toggle"
    onclick={toggleRemaining}
    title={showRemaining ? $t('player.showTotalTime') : $t('player.showRemainingTime')}
    aria-label={showRemaining ? $t('player.showTotalTime') : $t('player.showRemainingTime')}
  >{showRemaining ? `-${formatTime(remainingMs)}` : formatTime(durationMs)}</button>
</div>

<style>
  .seek-bar {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
  }

  .seek-bar.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .time {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    min-width: 40px;
    font-variant-numeric: tabular-nums;
  }

  .time:last-child {
    text-align: right;
  }

  /* La valeur de droite est un bouton : elle doit rester visuellement
     identique aux deux chiffres qui l'encadrent — un bouton qui ressemble à
     un bouton attirerait l'œil sur une bascule d'affichage, au détriment de
     la lecture du temps. */
  .time-toggle {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font: inherit;
    color: inherit;
  }

  .time-toggle:hover {
    color: var(--tune-text);
  }

  .seek-track {
    flex: 1;
    height: 4px;
    background: rgba(77, 78, 81, 0.5);
    border-radius: 2px;
    position: relative;
    cursor: pointer;
    touch-action: none;
  }

  .seek-track:hover {
    height: 6px;
  }

  .seek-fill {
    height: 100%;
    background: var(--tune-accent);
    border-radius: 2px;
    transition: width 0.1s linear;
  }

  /* Ouverture du flux (#2267).
     Un reflet qui traverse le sillon vide — la forme suggérée par DEvir
     (« une ligne semi-transparente qui avance »), sur l'élément qui existe
     déjà et avec la couleur d'accent du thème. Pas de composant de plus, pas
     de deuxième teinte, aucun changement de gabarit : la barre garde ses 4 px
     et ne pousse rien autour d'elle. C'est volontairement en retrait — Levente
     vient d'arriver, et cette animation doit rester facile à remplacer. */
  .seek-track.ouverture {
    overflow: hidden;
  }

  .seek-track.ouverture::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--tune-accent) 55%, transparent) 50%,
      transparent 100%
    );
    /* Le reflet part hors du cadre et le traverse : sans cette translation
       initiale il « clignote » au premier passage au lieu d'entrer. */
    transform: translateX(-100%);
    animation: seek-ouverture 1.4s ease-in-out infinite;
    pointer-events: none;
  }

  @keyframes seek-ouverture {
    to {
      transform: translateX(100%);
    }
  }

  /* Un mouvement perpétuel est exactement ce que ce réglage système refuse.
     On garde l'information — le sillon s'éclaircit — en retirant le balayage,
     plutôt que de supprimer l'indicateur : quelqu'un qui coupe les animations
     a le même besoin de savoir que le flux s'ouvre. */
  @media (prefers-reduced-motion: reduce) {
    .seek-track.ouverture::after {
      animation: none;
      transform: none;
      background: color-mix(in srgb, var(--tune-accent) 22%, transparent);
    }
  }

  .seek-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--tune-accent);
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    opacity: 0;
    transition: opacity 0.2s;
  }

  .seek-track:hover .seek-thumb {
    opacity: 1;
  }

  /* Kiosk mode: bigger seek bar for touch */
  :global([data-kiosk]) .seek-track {
    height: 28px;
  }

  :global([data-kiosk]) .seek-fill {
    height: 6px;
  }

  :global([data-kiosk]) .seek-thumb {
    width: 20px;
    height: 20px;
    opacity: 1;
  }

  :global([data-kiosk]) .time {
    font-size: 13px;
    min-width: 44px;
  }
</style>
