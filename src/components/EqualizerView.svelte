<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n';
  import { currentZoneId } from '../lib/stores/zones';
  import * as api from '../lib/api';
  import type { EqBand, EqSettings } from '../lib/api';
  import { notifications } from '../lib/stores/notifications';

  const BANDS: number[] = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  // --- Tune Master Profiler (Assistant mode) ---
  type EqMode = 'assistant' | 'expert';
  let eqMode = $state<EqMode>('assistant');

  // Step 1: Environment
  type ListeningMode = 'headphones' | 'speakers';
  type RoomSize = 'small' | 'medium' | 'large';
  type Placement = 'near_wall' | 'free_standing';

  let listening = $state<ListeningMode>('speakers');
  let roomSize = $state<RoomSize>('medium');
  let placement = $state<Placement>('free_standing');
  let profilerStep = $state(1);

  // Step 2: Perceptual sliders (-12 to +12)
  let bassSlider = $state(0);
  let midSlider = $state(0);
  let trebleSlider = $state(0);

  const PROFILER_STORAGE_KEY = 'tune-master-profiler';

  function saveProfiler() {
    try {
      localStorage.setItem(PROFILER_STORAGE_KEY, JSON.stringify({
        listening, roomSize, placement, bassSlider, midSlider, trebleSlider
      }));
    } catch {}
  }

  function loadProfiler() {
    try {
      const raw = localStorage.getItem(PROFILER_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        listening = p.listening ?? 'speakers';
        roomSize = p.roomSize ?? 'medium';
        placement = p.placement ?? 'free_standing';
        bassSlider = p.bassSlider ?? 0;
        midSlider = p.midSlider ?? 0;
        trebleSlider = p.trebleSlider ?? 0;
      }
    } catch {}
  }

  async function applyProfiler() {
    const zoneId = $currentZoneId;
    if (zoneId === null) return;
    try {
      await api.setDsp(zoneId, {
        eq_profile: {
          enabled: true,
          listening,
          room_size: roomSize,
          speaker_placement: placement,
          bass_gain_db: bassSlider,
          mid_gain_db: midSlider,
          treble_gain_db: trebleSlider,
        }
      });
      saveProfiler();
      notifications.success('Profil acoustique applique');
    } catch (e) {
      console.error('Apply profiler error:', e);
      notifications.error('Erreur lors de l\'application du profil');
    }
  }

  async function resetProfiler() {
    bassSlider = 0;
    midSlider = 0;
    trebleSlider = 0;
    const zoneId = $currentZoneId;
    if (zoneId === null) return;
    try {
      await api.setDsp(zoneId, {
        eq_profile: {
          enabled: false,
          listening,
          room_size: roomSize,
          speaker_placement: placement,
          bass_gain_db: 0,
          mid_gain_db: 0,
          treble_gain_db: 0,
        }
      });
      saveProfiler();
      notifications.success('Profil desactive');
    } catch {}
  }

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
    loadProfiler();
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
    <div class="eq-mode-tabs">
      <button class="eq-mode-tab" class:active={eqMode === 'assistant'} onclick={() => eqMode = 'assistant'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" /></svg>
        Assistant
      </button>
      <button class="eq-mode-tab" class:active={eqMode === 'expert'} onclick={() => eqMode = 'expert'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /></svg>
        Expert
      </button>
    </div>
  </header>

  {#if eqMode === 'assistant'}
    <!-- =================== TUNE MASTER PROFILER =================== -->
    <div class="profiler">
      {#if profilerStep === 1}
        <div class="profiler-step">
          <h2 class="profiler-title">Votre environnement d'ecoute</h2>
          <p class="profiler-desc">Repondez a ces 3 questions pour creer votre profil acoustique personnalise.</p>

          <div class="profiler-question">
            <h3>Qu'ecoutez-vous ?</h3>
            <div class="profiler-options">
              <button class="profiler-option" class:active={listening === 'headphones'} onclick={() => listening = 'headphones'}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path d="M3 18v-6a9 9 0 0118 0v6" /><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5z" /><path d="M3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z" /></svg>
                <span>Casque / Ecouteurs</span>
              </button>
              <button class="profiler-option" class:active={listening === 'speakers'} onclick={() => listening = 'speakers'}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><rect x="4" y="2" width="16" height="20" rx="2" /><circle cx="12" cy="14" r="4" /><circle cx="12" cy="6" r="1" /></svg>
                <span>Enceintes</span>
              </button>
            </div>
          </div>

          {#if listening === 'speakers'}
            <div class="profiler-question">
              <h3>Taille de la piece ?</h3>
              <div class="profiler-options profiler-options--3">
                <button class="profiler-option" class:active={roomSize === 'small'} onclick={() => roomSize = 'small'}>
                  <span class="profiler-icon-text">S</span>
                  <span>Petite</span>
                  <span class="profiler-hint">&lt; 15m²</span>
                </button>
                <button class="profiler-option" class:active={roomSize === 'medium'} onclick={() => roomSize = 'medium'}>
                  <span class="profiler-icon-text">M</span>
                  <span>Moyenne</span>
                  <span class="profiler-hint">15-30m²</span>
                </button>
                <button class="profiler-option" class:active={roomSize === 'large'} onclick={() => roomSize = 'large'}>
                  <span class="profiler-icon-text">L</span>
                  <span>Grande</span>
                  <span class="profiler-hint">&gt; 30m²</span>
                </button>
              </div>
            </div>

            <div class="profiler-question">
              <h3>Placement des enceintes ?</h3>
              <div class="profiler-options">
                <button class="profiler-option" class:active={placement === 'near_wall'} onclick={() => placement = 'near_wall'}>
                  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><rect x="2" y="4" width="6" height="40" rx="1" /><rect x="14" y="12" width="10" height="24" rx="2" /><circle cx="19" cy="28" r="4" /></svg>
                  <span>Contre le mur</span>
                </button>
                <button class="profiler-option" class:active={placement === 'free_standing'} onclick={() => placement = 'free_standing'}>
                  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><rect x="2" y="4" width="6" height="40" rx="1" /><rect x="22" y="12" width="10" height="24" rx="2" /><circle cx="27" cy="28" r="4" /></svg>
                  <span>Degagees du mur</span>
                </button>
              </div>
            </div>
          {/if}

          <button class="profiler-next-btn" onclick={() => profilerStep = 2}>
            Etape suivante
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>

      {:else}
        <div class="profiler-step">
          <button class="profiler-back" onclick={() => profilerStep = 1}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="15 18 9 12 15 6" /></svg>
            Environnement
          </button>

          <h2 class="profiler-title">Ajustez a l'oreille</h2>
          <p class="profiler-desc">Deplacez les curseurs selon vos sensations. Pas besoin de micro !</p>

          <div class="profiler-slider-group">
            <div class="profiler-slider">
              <div class="profiler-slider-header">
                <span class="profiler-slider-label">Basses</span>
                <span class="profiler-slider-value">{bassSlider > 0 ? '+' : ''}{bassSlider} dB</span>
              </div>
              <div class="profiler-slider-hints">
                <span>Sourdes</span>
                <span>Ouvrir le son</span>
              </div>
              <input type="range" min="-12" max="12" step="0.5" bind:value={bassSlider} oninput={applyProfiler} />
            </div>

            <div class="profiler-slider">
              <div class="profiler-slider-header">
                <span class="profiler-slider-label">Voix</span>
                <span class="profiler-slider-value">{midSlider > 0 ? '+' : ''}{midSlider} dB</span>
              </div>
              <div class="profiler-slider-hints">
                <span>Reculees</span>
                <span>Claires</span>
              </div>
              <input type="range" min="-12" max="12" step="0.5" bind:value={midSlider} oninput={applyProfiler} />
            </div>

            <div class="profiler-slider">
              <div class="profiler-slider-header">
                <span class="profiler-slider-label">Aigus</span>
                <span class="profiler-slider-value">{trebleSlider > 0 ? '+' : ''}{trebleSlider} dB</span>
              </div>
              <div class="profiler-slider-hints">
                <span>Sombres</span>
                <span>Aeres</span>
              </div>
              <input type="range" min="-12" max="12" step="0.5" bind:value={trebleSlider} oninput={applyProfiler} />
            </div>
          </div>

          <div class="profiler-actions">
            <button class="profiler-apply-btn" onclick={applyProfiler}>
              Appliquer le profil
            </button>
            <button class="profiler-reset-btn" onclick={resetProfiler}>
              Reinitialiser
            </button>
          </div>
        </div>
      {/if}
    </div>

  {:else}
    <!-- =================== EXPERT EQ =================== -->
    <div class="eq-controls">
      <button class="eq-toggle" class:active={enabled} onclick={toggleEnabled}>
        {enabled ? $t('eq.enabled') : $t('eq.disabled')}
      </button>
      <button class="eq-reset" onclick={resetFlat}>{$t('eq.reset')}</button>
    </div>

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
  {/if}
</section>

<style>
  .equalizer-view {
    padding: 1.5rem;
    max-width: 900px;
    margin: 0 auto;
  }

  .eq-mode-tabs {
    display: flex;
    gap: 4px;
    background: rgba(255,255,255,0.06);
    border-radius: 10px;
    padding: 3px;
  }
  .eq-mode-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--tune-text-muted);
    font-family: var(--font-label);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .eq-mode-tab:hover { color: var(--tune-text); }
  .eq-mode-tab.active {
    background: var(--tune-accent);
    color: white;
  }

  /* --- Tune Master Profiler --- */
  .profiler { padding: 0.5rem 0; }
  .profiler-step { animation: fadeIn 0.2s ease-out; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

  .profiler-title {
    font-family: var(--font-label);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.5px;
    margin-bottom: 6px;
  }
  .profiler-desc {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--tune-text-secondary);
    margin-bottom: 24px;
  }
  .profiler-question {
    margin-bottom: 24px;
  }
  .profiler-question h3 {
    font-family: var(--font-label);
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 12px;
  }
  .profiler-options {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  .profiler-options--3 {
    grid-template-columns: repeat(3, 1fr);
  }
  .profiler-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 20px 16px;
    background: rgba(255,255,255,0.04);
    border: 2px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    color: var(--tune-text);
    cursor: pointer;
    transition: all 0.15s;
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
  }
  .profiler-option:hover { border-color: var(--tune-accent); background: rgba(255,255,255,0.06); }
  .profiler-option.active {
    border-color: var(--tune-accent);
    background: rgba(107,110,217,0.15);
  }
  .profiler-icon-text {
    font-family: var(--font-label);
    font-size: 24px;
    font-weight: 800;
    color: var(--tune-accent);
  }
  .profiler-hint {
    font-size: 11px;
    color: var(--tune-text-muted);
    font-weight: 400;
  }
  .profiler-next-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 24px;
    background: var(--tune-accent);
    border: none;
    border-radius: 10px;
    color: white;
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    margin-top: 16px;
    transition: background 0.15s;
  }
  .profiler-next-btn:hover { background: var(--tune-accent-hover); }
  .profiler-back {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    color: var(--tune-text-muted);
    font-family: var(--font-label);
    font-size: 12px;
    cursor: pointer;
    margin-bottom: 16px;
    transition: color 0.12s;
  }
  .profiler-back:hover { color: var(--tune-accent); }

  /* Perceptual sliders */
  .profiler-slider-group {
    display: flex;
    flex-direction: column;
    gap: 28px;
    margin-bottom: 24px;
  }
  .profiler-slider {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .profiler-slider-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .profiler-slider-label {
    font-family: var(--font-label);
    font-size: 15px;
    font-weight: 700;
  }
  .profiler-slider-value {
    font-family: var(--font-label);
    font-size: 13px;
    color: var(--tune-accent);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .profiler-slider-hints {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--tune-text-muted);
  }
  .profiler-slider input[type="range"] {
    width: 100%;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: rgba(255,255,255,0.1);
    border-radius: 3px;
    outline: none;
    cursor: pointer;
  }
  .profiler-slider input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--tune-accent);
    border: 2px solid white;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  }
  .profiler-actions {
    display: flex;
    gap: 12px;
  }
  .profiler-apply-btn {
    padding: 10px 28px;
    background: var(--tune-accent);
    border: none;
    border-radius: 10px;
    color: white;
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .profiler-apply-btn:hover { background: var(--tune-accent-hover); }
  .profiler-reset-btn {
    padding: 10px 20px;
    background: rgba(255,255,255,0.06);
    border: 1px solid var(--tune-border);
    border-radius: 10px;
    color: var(--tune-text-secondary);
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .profiler-reset-btn:hover { border-color: var(--tune-accent); color: var(--tune-text); }

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
