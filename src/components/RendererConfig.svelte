<script lang="ts">
  import * as api from '../lib/api';
  import { t } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import { rendererProbeErrorKey } from '../lib/rendererProbe';
  import type { Zone, RendererCapabilities } from '../lib/types';

  // Coherent per-renderer output config for a DLNA/OpenHome zone: a discovery
  // check (GetProtocolInfo) plus overrides that respect the server's precedence
  // (forcing WAV wins over native passthrough). Maps to the existing zone flags.
  let { zone }: { zone: Zone } = $props();

  // Optimistic local state, seeded from the zone.
  let nativeFlac = $state(zone.dlna_native_flac ?? false);
  let alacNative = $state(zone.alac_passthrough ?? false);
  let aacNative = $state(zone.aac_passthrough ?? false);
  let cap16 = $state(zone.dlna_cap_16bit ?? false);
  // 'off' | '16' | '24'. 24-bit WAV is offered once a discovery check confirms the
  // renderer advertises audio/L24 or generic audio/wav — capping to 16-bit LPCM on
  // a renderer that only groks L16 plays silence (#1137), so it stays gated + opt-in.
  let forceWav = $state<'off' | '16' | '24'>(
    zone.dlna_wav24 ? '24' : zone.dlna_lpcm ? '16' : 'off'
  );

  // Réduire la profondeur ne réduit PAS la fréquence : un 96 kHz/24 bits devient
  // 96 kHz/16 bits, et reste donc refusé par un renderer qui plafonne à 48 kHz.
  // Les deux réglages vivent dans deux blocs différents de l'écran, sans que rien
  // n'indique que l'un ne suffit pas — Yves y a perdu du temps, il ne sera pas le
  // dernier. On le dit là où la case est cochée, pas dans une infobulle.
  let rateStillUncapped = $derived((cap16 || forceWav !== 'off') && !zone.max_sample_rate);

  // Les deux cases ne se contredisent plus : elles décrivent deux sources
  // différentes. « Forcer le WAV » vise le décodeur ALAC du renderer, donc il
  // ne s'applique QU'AUX sources non-FLAC ; un FLAC avec « FLAC natif » coché
  // part en FLAC (serveur : `wav_override_applies`, forum #1437).
  //
  // Le message précédent disait l'inverse — que le WAV l'emportait et que le
  // FLAC natif était ignoré. C'était exact, ce ne l'est plus : on décrit donc
  // le partage plutôt qu'une précédence.
  let flacAndWavSplitBySource = $derived(nativeFlac && forceWav !== 'off');


  let caps = $state<RendererCapabilities | null>(null);
  let probing = $state(false);
  let probeError = $state<string | null>(null);

  let capChips = $derived(
    caps
      ? [
          { label: 'FLAC', ok: !!caps.flac },
          { label: 'WAV / LPCM 16', ok: !!caps.lpcm16 || !!caps.wav },
          { label: 'LPCM 24', ok: !!caps.lpcm24 },
          { label: 'ALAC', ok: !!caps.alac },
          { label: 'AAC', ok: !!caps.aac },
          { label: 'MP3', ok: !!caps.mp3 },
          { label: 'DSD', ok: !!caps.dsd },
        ]
      : []
  );

  async function check() {
    if (zone.id == null) return;
    probing = true;
    probeError = null;
    caps = null;
    try {
      const r = await api.probeRendererCapabilities(zone.id);
      if (r.probed) caps = r;
      else probeError = $t(rendererProbeErrorKey(r.reason));
    } catch {
      probeError = $t('renderer.probeFailed');
    } finally {
      probing = false;
    }
  }

  async function save(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch {
      notifications.error($t('renderer.saveError'));
    }
  }

  function setNativeFlac(v: boolean) {
    nativeFlac = v;
    if (zone.id != null) save(() => api.updateZoneDlnaNativeFlac(zone.id!, v));
  }
  function setAlac(v: boolean) {
    alacNative = v;
    if (zone.id != null) save(() => api.updateZoneAlacPassthrough(zone.id!, v));
  }
  function setAac(v: boolean) {
    aacNative = v;
    if (zone.id != null) save(() => api.updateZoneAacPassthrough(zone.id!, v));
  }
  function setCap16(v: boolean) {
    cap16 = v;
    if (zone.id != null) save(() => api.updateZoneDlnaCap16bit(zone.id!, v));
  }
  // 24-bit WAV is unlocked once a probe confirms the renderer advertises audio/L24
  // OR generic audio/wav: the dlna_wav24 server path sends a real WAV file WITHOUT
  // the LPCM PN, so any WAV-capable renderer parses the 24-bit header (a genuine
  // 24-bit DAC like the darTZeel LHC-208 accepts WAV but never announces L24). It
  // stays an explicit per-zone opt-in, so a renderer that claims WAV yet can't do
  // 24-bit is the user's call — and it would choke on any 24-bit WAV regardless.
  // If the zone already had it saved (dlna_wav24), keep it selectable even before a
  // fresh probe so the current state isn't silently downgraded.
  let wav24Available = $derived(!!caps?.lpcm24 || !!caps?.wav || forceWav === '24');

  // Le bouton « 24 bits » dépend de `caps`, qui reste null tant que le test de
  // découverte n'a pas tourné : il est donc grisé sur TOUS les renderers à
  // l'ouverture de l'écran, y compris ceux qui savent le faire. Yves en a conclu
  // que le 24 bits ne marchait sur aucun de ses appareils. La raison vivait dans
  // une infobulle posée sur un bouton désactivé — que plusieurs navigateurs
  // n'affichent pas. On invite donc explicitement à lancer le test.
  let wav24NeedsProbe = $derived(caps === null && forceWav !== '24');

  function setForceWav(mode: 'off' | '16' | '24') {
    if (mode === '24' && !wav24Available) return;
    forceWav = mode;
    // dlna_lpcm (16-bit LPCM) and dlna_wav24 (24-bit) are mutually exclusive —
    // one PATCH sets both so the zone never holds a contradictory pair.
    if (zone.id != null) save(() => api.updateZoneWavMode(zone.id!, mode));
  }

  // Start delay (ms) between SetAVTransportURI and Play — gives a renderer with
  // a cold-start under-run (first seconds hachées) time to buffer. 0 = config
  // default. Common presets; server accepts any value.
  let playDelay = $state(zone.dlna_play_delay_ms ?? 0);
  const DELAY_PRESETS: { ms: number; label: string }[] = [
    { ms: 0, label: 'Off' },
    { ms: 1000, label: '1 s' },
    { ms: 2000, label: '2 s' },
    { ms: 3000, label: '3 s' },
  ];
  function setPlayDelay(ms: number) {
    playDelay = ms;
    if (zone.id != null) save(() => api.updateZoneDlnaPlayDelay(zone.id!, ms));
  }
</script>

<div class="rc">
  <div class="rc-discovery">
    <button class="rc-check" onclick={check} disabled={probing}>
      {probing ? $t('renderer.checking') : $t('renderer.check')}
    </button>
    {#if caps}
      <div class="rc-caps" title={$t('renderer.capsIntro')}>
        {#each capChips as c (c.label)}
          <span class="rc-chip" class:ok={c.ok} class:no={!c.ok}>{c.label} {c.ok ? '✓' : '✗'}</span>
        {/each}
      </div>
    {:else if probeError}
      <span class="rc-err">{probeError}</span>
    {/if}
  </div>

  <div class="rc-controls">
    <label class="rc-toggle" title={$t('settings.dlnaNativeFlacHint')}>
      <input type="checkbox" checked={nativeFlac} onchange={(e) => setNativeFlac((e.target as HTMLInputElement).checked)} />
      <span>{$t('settings.dlnaNativeFlac')}</span>
    </label>
    {#if flacAndWavSplitBySource}
      <p class="rc-hint">{$t('renderer.flacAndWavSplitBySource')}</p>
    {/if}
    <label class="rc-toggle" title={$t('settings.alacPassthroughHint')}>
      <input type="checkbox" checked={alacNative} onchange={(e) => setAlac((e.target as HTMLInputElement).checked)} />
      <span>{$t('settings.alacPassthrough')}</span>
    </label>
    <!-- Marco Polo (#1424) : « Je le cherche au même endroit que pour forcer
         l'ALAC mais il ne s'y trouve pas. » Le serveur portait le réglage
         depuis la 0.9.83 ; aucun écran ne l'exposait. Il vit donc ICI, contre
         l'ALAC, parce que c'est là qu'on est allé le chercher. -->
    <label class="rc-toggle" title={$t('settings.aacPassthroughHint')}>
      <input type="checkbox" checked={aacNative} onchange={(e) => setAac((e.target as HTMLInputElement).checked)} />
      <span>{$t('settings.aacPassthrough')}</span>
    </label>
    {#if aacNative && forceWav !== 'off'}
      <p class="rc-hint">{$t('renderer.aacIgnoredWhenWavForced')}</p>
    {/if}

    <div class="rc-wav">
      <span class="rc-wav-label">{$t('renderer.forceWav')}</span>
      <div class="rc-seg" role="group">
        <button class:active={forceWav === 'off'} onclick={() => setForceWav('off')}>{$t('renderer.wavOff')}</button>
        <button class:active={forceWav === '16'} onclick={() => setForceWav('16')}>{$t('renderer.wav16')}</button>
        <button class:active={forceWav === '24'} disabled={!wav24Available} title={$t('renderer.wav24Hint')} onclick={() => setForceWav('24')}>{$t('renderer.wav24')}</button>
      </div>
    </div>
    {#if wav24NeedsProbe}
      <p class="rc-warn">{$t('renderer.wav24NeedsProbe')}</p>
    {/if}

    <label class="rc-toggle" title={$t('settings.dlnaCap16bitHint')}>
      <input type="checkbox" checked={cap16} onchange={(e) => setCap16((e.target as HTMLInputElement).checked)} />
      <span>{$t('settings.dlnaCap16bit')}</span>
    </label>

    {#if rateStillUncapped}
      <p class="rc-warn">{$t('renderer.depthCapNotRate')}</p>
    {/if}

    <div class="rc-wav" title={$t('renderer.startDelayHint')}>
      <span class="rc-wav-label">{$t('renderer.startDelay')}</span>
      <div class="rc-seg" role="group">
        {#each DELAY_PRESETS as d (d.ms)}
          <button class:active={playDelay === d.ms} onclick={() => setPlayDelay(d.ms)}>{d.ms === 0 ? $t('renderer.wavOff') : d.label}</button>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .rc {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.02);
  }
  .rc-discovery {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .rc-check {
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 8px;
    padding: 7px 14px;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
  }
  .rc-check:hover:not(:disabled) {
    border-color: var(--tune-accent);
  }
  .rc-check:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .rc-caps {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .rc-chip {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: 0.02em;
    padding: 4px 9px;
    border-radius: 999px;
    border: 1px solid var(--tune-border);
  }
  .rc-chip.ok {
    color: var(--tune-success, #5fd0a0);
    border-color: rgba(95, 208, 160, 0.4);
    background: rgba(95, 208, 160, 0.08);
  }
  .rc-chip.no {
    color: var(--tune-text-muted);
    opacity: 0.7;
  }
  .rc-err {
    color: var(--tune-error, #ef4444);
    font-size: 12px;
  }
  .rc-controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .rc-toggle {
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 13px;
    color: var(--tune-text);
    cursor: pointer;
  }
  .rc-warn {
    margin: -2px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--tune-warning, #d29922);
  }
  /* Même gabarit, ton neutre : le partage FLAC/WAV par source n'est pas un
     avertissement mais une explication de ce qui va se passer. */
  .rc-hint {
    margin: -2px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--tune-text-secondary, #9ca3af);
  }
  .rc-wav {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .rc-wav-label {
    font-size: 13px;
    color: var(--tune-text);
  }
  .rc-seg {
    display: inline-flex;
    border: 1px solid var(--tune-border);
    border-radius: 8px;
    overflow: hidden;
  }
  .rc-seg button {
    font: inherit;
    font-size: 12px;
    color: var(--tune-text-secondary);
    background: transparent;
    border: none;
    border-right: 1px solid var(--tune-border);
    padding: 6px 14px;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .rc-seg button:last-child {
    border-right: none;
  }
  .rc-seg button.active {
    background: var(--tune-accent);
    color: #fff;
  }
  .rc-seg button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
