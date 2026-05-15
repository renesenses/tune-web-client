<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n';
  import { currentZoneId } from '../lib/stores/zones';
  import * as api from '../lib/api';
  import type { EqBand, EqSettings } from '../lib/api';
  import { notifications } from '../lib/stores/notifications';

  const BANDS: number[] = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  function freqLabel(f: number): string {
    return f >= 1000 ? `${f / 1000}k` : `${f}`;
  }

  const DEFAULT_Q = 1.0;
  const MIN_GAIN = -12;
  const MAX_GAIN = 12;

  // Preset gain arrays (10 values, one per band)
  const PRESETS: Record<string, { label: string; gains: number[] }> = {
    flat:         { label: 'Flat',          gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    bass_boost:   { label: 'Bass Boost',    gains: [8, 6, 4, 2, 0, 0, 0, 0, 0, 0] },
    treble_boost: { label: 'Treble Boost',  gains: [0, 0, 0, 0, 0, 1, 3, 5, 7, 8] },
    loudness:     { label: 'Loudness',      gains: [6, 4, 0, -2, -1, 0, 2, 4, 5, 6] },
    rock:         { label: 'Rock',          gains: [5, 3, 0, -2, -1, 2, 4, 5, 5, 4] },
    jazz:         { label: 'Jazz',          gains: [3, 2, 0, 2, -1, -1, 0, 2, 4, 5] },
    classical:    { label: 'Classical',     gains: [0, 0, 0, 0, 0, 0, -2, -3, -2, -1] },
  };

  let gains = $state<number[]>(Array(10).fill(0));
  let enabled = $state(true);
  let activePreset = $state<string | null>('flat');
  let loading = $state(false);

  // Persist to localStorage
  const STORAGE_KEY = 'tune-eq-settings';

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ gains, enabled, activePreset }));
    } catch { /* ignore */ }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.gains) && parsed.gains.length === 10) {
          gains = parsed.gains;
          enabled = parsed.enabled ?? true;
          activePreset = parsed.activePreset ?? null;
        }
      }
    } catch { /* ignore */ }
  }

  function buildBands(): EqBand[] {
    return BANDS.map((freq, i) => ({ freq, gain: gains[i], q: DEFAULT_Q }));
  }

  async function sendToServer() {
    const zoneId = $currentZoneId;
    if (zoneId === null) return;
    const settings: EqSettings = { bands: buildBands(), enabled };
    try {
      await api.setEq(zoneId, settings);
    } catch {
      // Backend may not support parametric EQ yet -- silently ignore
    }
  }

  function setGain(index: number, value: number) {
    gains[index] = value;
    activePreset = detectPreset();
    saveLocal();
    sendToServer();
  }

  function applyPreset(key: string) {
    const p = PRESETS[key];
    if (!p) return;
    gains = [...p.gains];
    activePreset = key;
    saveLocal();
    sendToServer();
  }

  function toggleEnabled() {
    enabled = !enabled;
    saveLocal();
    sendToServer();
  }

  function resetFlat() {
    applyPreset('flat');
  }

  function detectPreset(): string | null {
    for (const [key, p] of Object.entries(PRESETS)) {
      if (p.gains.every((g, i) => g === gains[i])) return key;
    }
    return null;
  }

  // Curve path for response visualization
  let curvePath = $derived.by(() => {
    const pts = gains.map((g, i) => ({
      x: (i / (gains.length - 1)) * 500,
      y: 60 - (g / MAX_GAIN) * 55,
    }));
    if (pts.length < 2) return '';
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let j = 1; j < pts.length; j++) {
      const cp1x = pts[j - 1].x + (pts[j].x - pts[j - 1].x) / 3;
      const cp2x = pts[j].x - (pts[j].x - pts[j - 1].x) / 3;
      d += ` C${cp1x},${pts[j - 1].y} ${cp2x},${pts[j].y} ${pts[j].x},${pts[j].y}`;
    }
    return d;
  });

  let curveFillPath = $derived(curvePath + ' L500,120 L0,120 Z');

  let curvePoints = $derived(gains.map((g, i) => ({
    x: (i / (gains.length - 1)) * 500,
    y: 60 - (g / MAX_GAIN) * 55,
  })));

  // Fetch current EQ from server on mount (if the endpoint exists)
  onMount(async () => {
    loadLocal();
    const zoneId = $currentZoneId;
    if (zoneId === null) return;
    try {
      const eq = await api.getEq(zoneId);
      if (eq?.bands?.length === 10) {
        gains = eq.bands.map(b => b.gain);
        enabled = eq.enabled;
        activePreset = detectPreset();
        saveLocal();
      }
    } catch {
      // Endpoint may not exist — use local values
    }
  });
</script>

<section class="equalizer-view">
  <header class="eq-header">
    <h1>{$t('eq.title')}</h1>
    <div class="eq-controls">
      <button class="eq-toggle" class:active={enabled} onclick={toggleEnabled}>
        {enabled ? $t('eq.enabled') : $t('eq.disabled')}
      </button>
      <button class="eq-reset" onclick={resetFlat}>{$t('eq.reset')}</button>
    </div>
  </header>

  <!-- Presets -->
  <div class="presets">
    {#each Object.entries(PRESETS) as [key, preset]}
      <button
        class="preset-btn"
        class:active={activePreset === key}
        onclick={() => applyPreset(key)}
      >
        {preset.label}
      </button>
    {/each}
  </div>

  <!-- Sliders -->
  <div class="sliders-container" class:disabled={!enabled}>
    <!-- dB scale on the left -->
    <div class="db-scale">
      <span>+12</span>
      <span>+6</span>
      <span class="db-zero">0</span>
      <span>-6</span>
      <span>-12</span>
    </div>

    <!-- Band sliders -->
    <div class="sliders">
      {#each BANDS as freq, i}
        <div class="slider-band">
          <div class="slider-value" class:positive={gains[i] > 0} class:negative={gains[i] < 0}>
            {gains[i] > 0 ? '+' : ''}{gains[i].toFixed(1)} dB
          </div>
          <div class="slider-track-wrap">
            <input
              type="range"
              class="vertical-slider"
              min={MIN_GAIN}
              max={MAX_GAIN}
              step="0.5"
              value={gains[i]}
              oninput={(e) => setGain(i, parseFloat((e.target as HTMLInputElement).value))}
              orient="vertical"
              disabled={!enabled}
            />
            <div class="slider-zero-line"></div>
          </div>
          <div class="slider-freq">{freqLabel(freq)}Hz</div>
        </div>
      {/each}
    </div>
  </div>

  <!-- Frequency response visualization -->
  <div class="response-curve" class:disabled={!enabled}>
    <svg viewBox="0 0 500 120" preserveAspectRatio="none" class="curve-svg">
      <!-- Grid lines -->
      <line x1="0" y1="60" x2="500" y2="60" stroke="rgba(255,255,255,0.1)" stroke-width="1" />
      <line x1="0" y1="30" x2="500" y2="30" stroke="rgba(255,255,255,0.05)" stroke-width="0.5" stroke-dasharray="4,4" />
      <line x1="0" y1="90" x2="500" y2="90" stroke="rgba(255,255,255,0.05)" stroke-width="0.5" stroke-dasharray="4,4" />
      <!-- Curve -->
      <path d={curvePath} fill="none" stroke="var(--tune-accent, #6366f1)" stroke-width="2" opacity="0.9" />
      <!-- Fill under curve -->
      <path d={curveFillPath} fill="var(--tune-accent, #6366f1)" opacity="0.08" />
      <!-- Dots -->
      {#each curvePoints as pt}
        <circle cx={pt.x} cy={pt.y} r="4" fill="var(--tune-accent, #6366f1)" opacity="0.8" />
      {/each}
    </svg>
  </div>
</section>

<style>
  .equalizer-view {
    padding: 1.5rem;
    max-width: 900px;
    margin: 0 auto;
  }

  .eq-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.2rem;
    flex-wrap: wrap;
    gap: 0.8rem;
  }

  .eq-header h1 {
    margin: 0;
    font-size: 1.5rem;
    color: var(--tune-text);
  }

  .eq-controls {
    display: flex;
    gap: 0.5rem;
  }

  .eq-toggle {
    padding: 0.4rem 1rem;
    border-radius: 999px;
    border: 1px solid var(--tune-border);
    background: transparent;
    color: var(--tune-text-secondary);
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .eq-toggle.active {
    background: var(--tune-accent, #6366f1);
    color: white;
    border-color: var(--tune-accent, #6366f1);
  }

  .eq-reset {
    padding: 0.4rem 1rem;
    border-radius: 999px;
    border: 1px solid var(--tune-border);
    background: transparent;
    color: var(--tune-text-secondary);
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .eq-reset:hover {
    border-color: var(--tune-accent);
    color: var(--tune-accent);
  }

  /* Presets */
  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 1.5rem;
  }

  .preset-btn {
    padding: 0.35rem 0.9rem;
    font-size: 0.85rem;
    border-radius: 999px;
    border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.3);
    background: transparent;
    color: var(--tune-text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .preset-btn:hover {
    border-color: var(--tune-accent, #6366f1);
    color: var(--tune-text);
  }

  .preset-btn.active {
    background: var(--tune-accent, #6366f1);
    color: white;
    border-color: var(--tune-accent, #6366f1);
  }

  /* Sliders */
  .sliders-container {
    display: flex;
    gap: 0;
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.04);
    border-radius: 12px;
    padding: 1.2rem 1rem;
    margin-bottom: 1rem;
    transition: opacity 0.2s;
  }

  .sliders-container.disabled {
    opacity: 0.35;
    pointer-events: none;
  }

  .db-scale {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 200px;
    padding-right: 0.6rem;
    flex-shrink: 0;
  }

  .db-scale span {
    font-size: 0.65rem;
    color: var(--tune-text-muted);
    font-family: var(--font-label);
    font-variant-numeric: tabular-nums;
    text-align: right;
    min-width: 28px;
  }

  .db-zero {
    color: var(--tune-text-secondary);
    font-weight: 600;
  }

  .sliders {
    display: flex;
    flex: 1;
    justify-content: space-around;
    gap: 0;
  }

  .slider-band {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    flex: 1;
    min-width: 0;
  }

  .slider-value {
    font-size: 0.7rem;
    font-family: var(--font-label);
    font-variant-numeric: tabular-nums;
    color: var(--tune-text-muted);
    min-width: 48px;
    text-align: center;
    white-space: nowrap;
  }

  .slider-value.positive { color: var(--tune-accent, #6366f1); }
  .slider-value.negative { color: #f59e0b; }

  .slider-track-wrap {
    position: relative;
    height: 200px;
    width: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .slider-zero-line {
    position: absolute;
    top: 50%;
    left: 2px;
    right: 2px;
    height: 1px;
    background: rgba(255, 255, 255, 0.15);
    pointer-events: none;
  }

  .vertical-slider {
    writing-mode: vertical-lr;
    direction: rtl;
    appearance: slider-vertical;
    -webkit-appearance: slider-vertical;
    width: 24px;
    height: 180px;
    background: transparent;
    cursor: pointer;
    margin: 0;
  }

  /* WebKit slider styling */
  .vertical-slider::-webkit-slider-runnable-track {
    width: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }

  .vertical-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--tune-accent, #6366f1);
    border: 2px solid rgba(255, 255, 255, 0.3);
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
    margin-left: -5px;
  }

  /* Firefox slider styling */
  .vertical-slider::-moz-range-track {
    width: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    border: none;
  }

  .vertical-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--tune-accent, #6366f1);
    border: 2px solid rgba(255, 255, 255, 0.3);
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  }

  .slider-freq {
    font-size: 0.7rem;
    color: var(--tune-text-muted);
    font-family: var(--font-label);
    text-align: center;
    white-space: nowrap;
  }

  /* Response curve */
  .response-curve {
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.04);
    border-radius: 12px;
    padding: 1rem;
    transition: opacity 0.2s;
  }

  .response-curve.disabled {
    opacity: 0.35;
  }

  .curve-svg {
    width: 100%;
    height: 120px;
    display: block;
  }

  @media (max-width: 600px) {
    .equalizer-view {
      padding: 1rem;
    }

    .sliders-container {
      padding: 0.8rem 0.4rem;
    }

    .slider-track-wrap {
      height: 150px;
    }

    .vertical-slider {
      height: 130px;
    }

    .db-scale {
      height: 150px;
    }

    .slider-value {
      font-size: 0.6rem;
      min-width: 36px;
    }

    .slider-freq {
      font-size: 0.6rem;
    }
  }
</style>
