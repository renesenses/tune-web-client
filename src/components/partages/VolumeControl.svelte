<script lang="ts">
  import { volumeCommandable, sourdineCommandable } from '../../lib/capacitesVolumeSortie';
  import { currentZone } from '../../lib/stores/zones';
  import { zoneVolume } from '../../lib/stores/nowPlaying';
  import { preferences } from '../../lib/stores/preferences';
  import { isBrowserZone, browserSetVolume } from '../../lib/stores/browserAudio';
  import { t } from '../../lib/i18n';
  import DeviceVolumeObservation from './DeviceVolumeObservation.svelte';
  import { volumeLocked, refreshAudiophile, isVolumeLocked } from '../../lib/stores/audiophile';
  import { envoyerVolumeOuReverrouiller } from '../../lib/refusDeVolume';
  import { notifications } from '../../lib/stores/notifications';
  import * as api from '../../lib/api';
  import { analyserDb, formaterDb, lineaireDepuisDb } from '../../lib/volumeDb';
  import { gainDeLaZone, volumeDepuisGain } from '../../lib/courbeDeVolume';
  import { creerLimiteurVolume } from '../../lib/limiteurVolume';
  import {
    PAS_BOUTON,
    bornerCurseur,
    cibleDuPas,
    plusEnButee,
    serveurConnaitLesLimites,
  } from '../../lib/limitesVolume';
  import { basculerSourdineZone, leverSourdineSiBesoin } from '../../lib/sourdine';

  let zone = $derived($currentZone);
  let vol = $derived($zoneVolume);
  // #6700 — la sourdine est l'état `muted` de la zone, pas un volume à zéro.
  let isMuted = $derived(zone?.muted === true);
  let idZoneVolume = $derived(zone?.id ?? null);
  let volumeAutorise = $derived(!$volumeLocked && volumeCommandable(zone));
  let sourdineAutorisee = $derived(!$volumeLocked && sourdineCommandable(zone));

  // #1274 \u2014 le mode dB n'est plus une simple fa\u00E7on d'\u00C9CRIRE le pour-cent : le
  // champ est saisissable, et ce qu'on y tape part tel quel dans `volume_db`.
  let modeDb = $derived($preferences.volumeDisplay === 'dB');

  // tune-server-rust#6787 — le dB affiché est celui du GAIN, lu sur la loi de
  // la zone (`volume_curve`) : 50 % valent −30 dB sur une sortie logicielle.
  function dbDuCurseur(v: number): string {
    return formaterDb(gainDeLaZone(zone, v));
  }

  function volumeDisplay(v: number): string {
    if (modeDb) return dbDuCurseur(v);
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
    if (!volumeAutorise) return;
    saisie = dbDuCurseur(vol);
  }

  async function validerSaisie(texte: string) {
    saisie = null;
    if (!zone?.id || !volumeAutorise) return;
    // Rien tapé : le champ rend sa propre valeur, il n'y a aucune commande à
    // envoyer. C'est aussi ce qui évite de refuser « -∞ dB », le texte que le
    // champ affiche LUI-MÊME quand la zone est au silence.
    if (texte === dbDuCurseur(vol)) return;
    const lu = analyserDb(texte);
    if ('refus' in lu) {
      // Un champ qui se remet tout seul \u00E0 sa valeur sans un mot laisse croire
      // \u00E0 un bouton mort : on dit POURQUOI le refus.
      notifications.error(
        lu.refus === 'positif' ? $t('volume.dbAboveFullScale') : $t('volume.dbUnreadable'),
      );
      return;
    }
    const gain = lineaireDepuisDb(lu.db);
    if (gain === null) return;
    // #6787 — le dB tapé est un dB de gain : le curseur va à la position qui
    // le rend (le serveur fait la même conversion sur `volume_db`).
    const lineaire = volumeDepuisGain(zone, gain);
    if (zone.id != null) leverSourdineSiBesoin({ ...zone, id: zone.id }, lineaire);
    zoneVolume.set(lineaire);
    if (isBrowserZone(zone)) browserSetVolume(lineaire, zone);
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

  const limiterEnvoi = creerLimiteurVolume();
  let contexteVolume = 0;
  $effect(() => {
    // Les primitives évitent d'annuler un glissement sur un simple écho de volume.
    const id = idZoneVolume;
    const autorise = volumeAutorise;
    if (id == null || !autorise) limiterEnvoi.annuler();
    return () => {
      contexteVolume += 1;
      limiterEnvoi.annuler();
      saisie = null;
    };
  });

  function handleVolume(e: Event) {
    if (!zone?.id || !volumeAutorise) return;
    const champ = e.target as HTMLInputElement;
    // tune-server-rust#6541 — le serveur borne le curseur (confort, sécurité) ;
    // l'écran le montre au lieu de laisser le pouce filer plus haut que le son.
    const val = bornerCurseur(zone, Number(champ.value), vol);
    if (val !== Number(champ.value)) champ.value = String(val);
    leverSourdineSiBesoin({ ...zone, id: zone.id }, val);
    zoneVolume.set(val);
    if (isBrowserZone(zone)) browserSetVolume(val, zone);
    const zoneId = zone.id;
    const contexte = contexteVolume;
    limiterEnvoi(() => { void envoyerVolume(zoneId, val, contexte); });
  }

  // tune-server-rust#6721 — un refus du serveur (PURE « Forcer à 100 % »
  // armé ailleurs, ou mal lu ici) relit le verrou : le curseur se grise.
  function envoyerVolume(zoneId: number, val: number, contexte: number) {
    if (zone?.id !== zoneId || !volumeAutorise || contexte !== contexteVolume) return Promise.resolve();
    return envoyerVolumeOuReverrouiller(zoneId, val, {
      envoyer: api.setVolume,
      relireVerrou: refreshAudiophile,
      verrouille: isVolumeLocked,
      direVerrou: () => notifications.error($t('audiophile.volumeLockedHint' as any)),
    });
  }

  // Une zone navigateur joue dans CET onglet (<audio>) : le serveur ignore
  // son volume (set_volume_no_device_id) — chaque écriture doit donc aussi
  // passer par browserSetVolume, comme le fait déjà le glissement du slider.
  // Sans ça, le bouton haut-parleur (mute) et les ± étaient inertes sur
  // « Cet ordinateur » (Bertrand, .18).
  function applyVolume(val: number) {
    zoneVolume.set(val);
    if (isBrowserZone(zone)) browserSetVolume(val, zone);
  }

  // #6700 — décision de Bertrand du 21/10 : une VRAIE sourdine. Le volume
  // n'est pas touché, lever la sourdine rend le son au volume d'avant.
  async function toggleMute() {
    if (!zone?.id || !sourdineAutorisee) return;
    await basculerSourdineZone({ ...zone, id: zone.id }).catch(() => {});
  }

  // tune-server-rust#6541 — boutons + / − : le serveur fait le pas depuis le
  // volume COURANT et le borne par la seule limite de sécurité (au-dessus du
  // confort, seuls les boutons montent). Un serveur antérieur, sans la route,
  // reçoit l'ancien `PUT /volume`.
  async function pas(direction: 'up' | 'down') {
    if (!zone?.id || !volumeAutorise) return;
    if (!serveurConnaitLesLimites(zone) || isBrowserZone(zone)) {
      // web#2292 — borné par la sécurité de la zone, pas seulement par 100 %.
      const next = cibleDuPas(zone, vol, direction);
      if (next === vol) return;
      if (direction === 'up') leverSourdineSiBesoin({ ...zone, id: zone.id }, next);
      applyVolume(next);
      await api.setVolume(zone.id, next);
      return;
    }
    try {
      const zoneId = zone.id;
      const contexte = contexteVolume;
      const r = await api.stepVolume(zoneId, direction, PAS_BOUTON);
      if (zone?.id !== zoneId || !volumeAutorise || contexte !== contexteVolume) return;
      // tune-server-rust#6787 — la réponse porte le GAIN : le curseur en est
      // la position sur la loi de la zone.
      const curseur = volumeDepuisGain(zone, r.volume);
      if (direction === 'up') leverSourdineSiBesoin({ ...zone, id: zone.id }, curseur);
      applyVolume(curseur);
      if (r.limited) notifications.info($t('volume.limitedBySafety'));
    } catch {
      notifications.error($t('volume.stepFailed'));
    }
  }

  let enButee = $derived(plusEnButee(zone, vol));
  // web#2292 — les boutons − et + sont une OPTION des Réglages, désactivée par
  // défaut : seul le curseur s'affiche tant qu'on ne l'a pas choisie.
  let boutonsPas = $derived($preferences.volumeStepButtons === true);
</script>

<div class="volume-control" class:locked={$volumeLocked}>
  <button
    class="volume-btn"
    class:muted={isMuted}
    onclick={toggleMute}
    disabled={!sourdineAutorisee}
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
  {#if boutonsPas}
  <button
    class="step-btn"
    onclick={() => pas('down')}
    disabled={!volumeAutorise || vol <= 0}
    title={$t('volume.stepDown')}
    aria-label={$t('volume.stepDown')}
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
  </button>
  {/if}
  <input
    type="range"
    class="volume-slider"
    min="0"
    max="1"
    step="0.01"
    value={vol}
    oninput={handleVolume}
    disabled={!volumeAutorise}
    title={$volumeLocked ? $t('audiophile.volumeLockedHint' as any) : undefined}
    aria-label="Volume"
  />
  {#if boutonsPas}
  <button
    class="step-btn"
    onclick={() => pas('up')}
    disabled={!volumeAutorise || enButee}
    title={enButee ? $t('volume.limitedBySafety') : $t('volume.stepUp')}
    aria-label={$t('volume.stepUp')}
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
  </button>
  {/if}
  {#if modeDb}
    <input
      type="text"
      class="volume-value volume-db-input"
      inputmode="decimal"
      autocomplete="off"
      spellcheck="false"
      value={saisie ?? volumeDisplay(vol)}
      disabled={!volumeAutorise}
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
  <DeviceVolumeObservation {zone} />
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
.volume-slider:disabled, .volume-btn:disabled, .step-btn:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
