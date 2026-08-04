<script lang="ts">
  import * as api from '../lib/api';
  import { t } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import type { Zone, RendererCapabilities } from '../lib/types';

  // Coherent per-renderer output config for a DLNA/OpenHome zone: a discovery
  // check (GetProtocolInfo) plus overrides that respect the server's precedence
  // (forcing WAV wins over native passthrough). Maps to the existing zone flags.
  let { zone }: { zone: Zone } = $props();

  // Optimistic local state, seeded from the zone.
  let nativeFlac = $state(zone.dlna_native_flac ?? false);
  let alacNative = $state(zone.alac_passthrough ?? false);
  let cap16 = $state(zone.dlna_cap_16bit ?? false);
  // 'off' | '16' | '24'. 24-bit WAV is offered once a discovery check confirms the
  // renderer advertises audio/L24 or generic audio/wav — capping to 16-bit LPCM on
  // a renderer that only groks L16 plays silence (#1137), so it stays gated + opt-in.
  let forceWav = $state<'off' | '16' | '24'>(
    zone.dlna_wav24 ? '24' : zone.dlna_lpcm ? '16' : 'off'
  );

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
      else probeError = r.message ?? $t('renderer.probeFailed');
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
    <label class="rc-toggle" title={$t('settings.alacPassthroughHint')}>
      <input type="checkbox" checked={alacNative} onchange={(e) => setAlac((e.target as HTMLInputElement).checked)} />
      <span>{$t('settings.alacPassthrough')}</span>
    </label>

    <div class="rc-wav">
      <span class="rc-wav-label">{$t('renderer.forceWav')}</span>
      <div class="rc-seg" role="group">
        <button class:active={forceWav === 'off'} onclick={() => setForceWav('off')}>{$t('renderer.wavOff')}</button>
        <button class:active={forceWav === '16'} onclick={() => setForceWav('16')}>{$t('renderer.wav16')}</button>
        <button class:active={forceWav === '24'} disabled={!wav24Available} title={$t('renderer.wav24Hint')} onclick={() => setForceWav('24')}>{$t('renderer.wav24')}</button>
      </div>
    </div>

    <label class="rc-toggle" title={$t('settings.dlnaCap16bitHint')}>
      <input type="checkbox" checked={cap16} onchange={(e) => setCap16((e.target as HTMLInputElement).checked)} />
      <span>{$t('settings.dlnaCap16bit')}</span>
    </label>

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
