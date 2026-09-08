<script lang="ts">
  import { currentZone } from '../lib/stores/zones';
  import { zoneVolume, mutedVolume } from '../lib/stores/nowPlaying';
  import { preferences } from '../lib/stores/preferences';
  import { isBrowserZone, browserSetVolume } from '../lib/stores/browserAudio';
  import { t } from '../lib/i18n';
  import { volumeLocked } from '../lib/stores/audiophile';
  import { notifications } from '../lib/stores/notifications';
  import * as api from '../lib/api';
  import { analyserDb, formaterDb, lineaireDepuisDb } from '../lib/volumeDb';

  let zone = $derived($currentZone);
  let vol = $derived($zoneVolume);
  let isMuted = $derived(vol === 0 && $mutedVolume !== null);

  // #1274 \u2014 le mode dB n'est plus une simple fa\u00E7on d'\u00C9CRIRE le pour-cent : le
  // champ est saisissable, et ce qu'on y tape part tel quel dans `volume_db`.
  let modeDb = $derived($preferences.volumeDisplay === 'dB');

  function volumeDisplay(v: number): string {
    if (modeDb) return formaterDb(v);
    return `${Math.round(v * 100)}`;
  }

  /* --- Saisie directe en dB (#1274) ---------------------------------------
   *
   * \u00AB pas de r\u00E9glage au dB pr\u00E8s \u00BB (zaurux, forum) : le curseur `step="0.01"`
   * ne peut PAS poser \u221220,0 dB \u2014 il n'offre que 10 % (\u221220,0) puis 11 %
   * (\u221219,2). Une valeur exacte se tape, elle ne se vise pas.
   *
   * `saisie` non nulle = l'utilisateur est en train d'\u00E9crire ; le champ montre
   * alors SON texte, et non la valeur vivante qui continuerait de bouger sous
   * ses doigts (le WebSocket republie le volume de la zone). \u00C0 la validation
   * on repasse \u00E0 null, et l'affichage redevient la lecture du serveur.
   */
  let saisie = $state<string | null>(null);

  function ouvrirSaisie() {
    if ($volumeLocked) return;
    saisie = formaterDb(vol);
  }

  async function validerSaisie(texte: string) {
    saisie = null;
    if (!zone?.id || $volumeLocked) return;
    // Rien tapé : le champ rend sa propre valeur, il n'y a aucune commande à
    // envoyer. C'est aussi ce qui évite de refuser « -∞ dB », le texte que le
    // champ affiche LUI-MÊME quand la zone est au silence.
    if (texte === formaterDb(vol)) return;
    const lu = analyserDb(texte);
    if ('refus' in lu) {
      // Un champ qui se remet tout seul \u00E0 sa valeur sans un mot laisse croire
      // \u00E0 un bouton mort : on dit POURQUOI le refus.
      notifications.error(
        lu.refus === 'positif' ? $t('volume.dbAboveFullScale') : $t('volume.dbUnreadable'),
      );
      return;
    }
    const lineaire = lineaireDepuisDb(lu.db);
    if (lineaire === null) return;
    if (lineaire > 0) mutedVolume.set(null);
    zoneVolume.set(lineaire);
    if (isBrowserZone(zone)) browserSetVolume(lineaire);
    // Le dB part TEL QUEL : le repasser en lin\u00E9aire avant l'envoi rendrait la
    // valeur au serveur d\u00E9j\u00E0 entam\u00E9e par un aller-retour de flottant.
    await api.setVolumeDb(zone.id, lu.db);
  }

  function toucheSaisie(e: KeyboardEvent) {
    const champ = e.currentTarget as HTMLInputElement;
    if (e.key === 'Enter') {
      e.preventDefault();
      champ.blur(); // le `onblur` valide \u2014 un seul chemin de validation
    } else if (e.key === 'Escape') {
      e.preventDefault();
      saisie = null;
      champ.blur();
    }
  }

  let _volThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  let _volPending: (() => void) | null = null;

  function handleVolume(e: Event) {
    if (!zone?.id || $volumeLocked) return;
    const val = Number((e.target as HTMLInputElement).value);
    if (val > 0) mutedVolume.set(null);
    zoneVolume.set(val);
    if (isBrowserZone(zone)) browserSetVolume(val);
    const zoneId = zone.id;
    _volPending = () => api.setVolume(zoneId, val);
    if (!_volThrottleTimer) {
      _volPending();
      _volPending = null;
      _volThrottleTimer = setTimeout(() => {
        _volThrottleTimer = null;
        if (_volPending) { _volPending(); _volPending = null; }
      }, 80);
    }
  }

  // Une zone navigateur joue dans CET onglet (<audio>) : le serveur ignore
  // son volume (set_volume_no_device_id) — chaque écriture doit donc aussi
  // passer par browserSetVolume, comme le fait déjà le glissement du slider.
  // Sans ça, le bouton haut-parleur (mute) et les ± étaient inertes sur
  // « Cet ordinateur » (Bertrand, .18).
  function applyVolume(val: number) {
    zoneVolume.set(val);
    if (isBrowserZone(zone)) browserSetVolume(val);
  }

  async function toggleMute() {
    if (!zone?.id || $volumeLocked) return;
    if (vol > 0) {
      mutedVolume.set(vol);
      applyVolume(0);
      await api.setVolume(zone.id, 0);
    } else if ($mutedVolume !== null) {
      const restore = $mutedVolume;
      mutedVolume.set(null);
      applyVolume(restore);
      await api.setVolume(zone.id, restore);
    } else {
      applyVolume(0.5);
      await api.setVolume(zone.id, 0.5);
    }
  }

  const STEP = 0.01;

  async function stepDown() {
    if (!zone?.id || $volumeLocked) return;
    const next = Math.max(0, vol - STEP);
    if (next > 0) mutedVolume.set(null);
    applyVolume(next);
    await api.setVolume(zone.id, next);
  }

  async function stepUp() {
    if (!zone?.id || $volumeLocked) return;
    const next = Math.min(1, vol + STEP);
    mutedVolume.set(null);
    applyVolume(next);
    await api.setVolume(zone.id, next);
  }
</script>

<div class="volume-control" class:locked={$volumeLocked}>
  <button
    class="volume-btn"
    class:muted={isMuted}
    onclick={toggleMute}
    disabled={$volumeLocked}
    title={$volumeLocked ? $t('audiophile.volumeLockedHint' as any) : $t('volume.title')}
  >
    {#if isMuted || vol === 0}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    {:else if vol < 0.5}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    {/if}
  </button>
  <input
    type="range"
    class="volume-slider"
    min="0"
    max="1"
    step="0.01"
    value={vol}
    oninput={handleVolume}
    disabled={$volumeLocked}
    title={$volumeLocked ? $t('audiophile.volumeLockedHint' as any) : undefined}
    aria-label="Volume"
  />
  {#if modeDb}
    <input
      type="text"
      class="volume-value volume-db-input"
      inputmode="decimal"
      autocomplete="off"
      spellcheck="false"
      value={saisie ?? volumeDisplay(vol)}
      disabled={$volumeLocked}
      aria-label={$t('volume.dbEntry')}
      title={$volumeLocked ? $t('audiophile.volumeLockedHint' as any) : $t('volume.dbEntryHint')}
      onfocus={ouvrirSaisie}
      oninput={(e) => { saisie = (e.currentTarget as HTMLInputElement).value; }}
      onkeydown={toucheSaisie}
      onblur={() => { if (saisie !== null) validerSaisie(saisie); }}
    />
  {:else}
    <span class="volume-value">{volumeDisplay(vol)}</span>
  {/if}
</div>

<style>
  .volume-control {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  /* Verrou du mode PURE : le curseur reste lisible (on veut voir qu'il est à
     100 %), mais il n'accepte plus rien — `disabled` sur les contrôles fait le
     vrai travail, ceci ne fait que le dire. */
  .volume-control.locked {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .volume-control.locked :global(input),
  .volume-control.locked :global(button) {
    pointer-events: none;
  }

  .volume-btn {
    background: none;
    border: none;
    color: var(--tune-text-secondary);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: color 0.12s ease-out;
  }

  .volume-btn:hover {
    color: var(--tune-text);
  }

  .volume-btn.muted {
    color: var(--tune-warning);
  }

  .volume-btn svg {
    width: 18px;
    height: 18px;
  }

  .step-btn {
    background: none;
    border: none;
    color: var(--tune-text-muted);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: color 0.12s ease-out;
  }

  .step-btn:hover {
    color: var(--tune-text);
  }

  .volume-slider {
    width: 140px;
    height: 5px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--tune-border);
    border-radius: 2px;
    outline: none;
  }

  .volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--tune-accent);
    cursor: pointer;
  }

  .volume-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--tune-accent);
    border: none;
    cursor: pointer;
  }

  .volume-value {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--tune-text-secondary);
    min-width: 36px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* Saisie directe en dB (#1274). Le champ occupe la place de la valeur — il
     ne s'annonce comme un champ qu'au survol et au focus, pour ne pas
     transformer la barre de lecture en formulaire. */
  .volume-db-input {
    width: 64px;
    min-width: 64px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 1px 4px;
    cursor: text;
    font: inherit;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--tune-text-secondary);
  }

  .volume-db-input:hover:not(:disabled) {
    border-color: var(--tune-border);
  }

  .volume-db-input:focus {
    outline: none;
    border-color: var(--tune-accent);
    color: var(--tune-text);
  }

  .volume-db-input:disabled {
    cursor: not-allowed;
  }

  /* Kiosk mode: larger volume controls for touch */
  :global([data-kiosk]) .volume-slider {
    width: 120px;
    height: 6px;
  }

  :global([data-kiosk]) .volume-slider::-webkit-slider-thumb {
    width: 20px;
    height: 20px;
  }

  :global([data-kiosk]) .volume-slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
  }

  :global([data-kiosk]) .volume-btn {
    min-width: 44px;
    min-height: 44px;
  }

  :global([data-kiosk]) .volume-btn svg {
    width: 22px;
    height: 22px;
  }

  :global([data-kiosk]) .step-btn {
    min-width: 44px;
    min-height: 44px;
  }

  :global([data-kiosk]) .step-btn svg {
    width: 18px;
    height: 18px;
  }

  :global([data-kiosk]) .volume-value {
    font-size: 14px;
    min-width: 40px;
  }
</style>
