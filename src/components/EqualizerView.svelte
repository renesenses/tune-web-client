<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n';
  import { currentZoneId } from '../lib/stores/zones';
  import * as api from '../lib/api';
  import type { EqBand, EqSettings, CrossfeedSettings } from '../lib/api';
  import { notifications } from '../lib/stores/notifications';
  import { isPremium } from '../lib/stores/license';
  import ParametricEq from './ParametricEq.svelte';

  // Grilles ISO : octave (10), 2/3 d'octave (15), 1/3 d'octave (31) — les
  // repères de REW. La résolution vient des Paramètres (clé serveur
  // eq_expert_bands) pour que web/iPad/mobile partagent la même grille.
  const GRIDS: Record<number, number[]> = {
    10: [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
    15: [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000],
    31: [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
         1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000],
  };
  // Q adapté à la largeur de bande ; 10 bandes garde le 1.0 historique pour ne
  // pas changer le rendu des réglages existants.
  const GRID_Q: Record<number, number> = { 10: 1.0, 15: 2.15, 31: 4.32 };
  let bandCount = $state(10);
  let BANDS = $derived(GRIDS[bandCount] ?? GRIDS[10]);

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

  // Debounced apply for slider drags: oninput fires on EVERY step of the
  // range input, which used to send one PUT /zones/{id}/dsp per tick and —
  // when the request failed (e.g. free tier: the endpoint is Premium-gated
  // and returns 402) — one error popup per tick, plus the premium popup
  // fetchJSON already shows. One drag = a storm of popups (bug #1216).
  let profilerSendTimer: ReturnType<typeof setTimeout> | null = null;
  function queueProfilerApply() {
    if (profilerSendTimer) clearTimeout(profilerSendTimer);
    profilerSendTimer = setTimeout(() => {
      profilerSendTimer = null;
      void applyProfiler(true);
    }, 300);
  }

  async function applyProfiler(quiet = false) {
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
      if (!quiet) notifications.success('Profil acoustique applique');
    } catch (e) {
      console.error('Apply profiler error:', e);
      // fetchJSON already showed the dedicated Premium popup for a 402 —
      // don't stack a generic one on top of it.
      if ((e as Error)?.message !== 'premium_required') {
        notifications.error('Erreur lors de l\'application du profil');
      }
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

  let gains = $state<number[]>(Array(10).fill(0)); // redimensionné par la résolution au mount
  // Sous-mode Expert : graphique (grille fixe) ou paramétrique (bandes libres,
  // fréquence/gain/Q/type — le serveur les accepte déjà, routes/eq_pro.rs).
  let expertSubMode = $state<'graphic' | 'parametric'>('graphic');
  let pBands = $state<EqBand[]>([]);
  let enabled = $state(true);
  let activePreset = $state<string | null>('flat');
  let loading = $state(false);

  // « Mes presets » : réglages EQ enregistrés par l'utilisateur (nommés,
  // rappelables). Capturent le sous-mode courant (courbe graphique OU bandes
  // paramétriques). SYNCHRONISÉS CÔTÉ SERVEUR (routes/eq_pro.rs, KV partagé par
  // tous les contrôleurs du serveur → suivent l'utilisateur d'un appareil à
  // l'autre). Cache localStorage pour un paint instantané + résilience offline.
  interface CustomEqPreset {
    id: string;
    name: string;
    mode: 'graphic' | 'parametric';
    gains?: number[];      // grille = gains.length (mode graphique)
    pBands?: EqBand[];     // mode paramétrique
  }
  const PRESETS_CACHE_KEY = 'tune-eq-presets-cache';   // miroir de la liste serveur
  const LEGACY_PRESETS_KEY = 'tune-eq-custom-presets'; // ancien stockage local (migration)
  let customPresets = $state<CustomEqPreset[]>([]);
  let newPresetName = $state('');
  let showSaveInput = $state(false);

  // Persist to localStorage
  const STORAGE_KEY = 'tune-eq-settings';

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ gains, enabled, activePreset, pBands: $state.snapshot(pBands), expertSubMode }));
    } catch { /* ignore */ }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.gains) && adoptGains(parsed.gains)) {
          enabled = parsed.enabled ?? true;
          activePreset = parsed.activePreset ?? null;
        }
        if (Array.isArray(parsed.pBands)) pBands = parsed.pBands;
        if (parsed.expertSubMode === 'parametric') expertSubMode = 'parametric';
      }
    } catch { /* ignore */ }
  }

  function buildBands(): EqBand[] {
    const q = GRID_Q[bandCount] ?? DEFAULT_Q;
    return BANDS.map((freq, i) => ({ freq, gain: gains[i] ?? 0, q }));
  }

  // Rééchantillonne une courbe de gains d'une grille vers une autre
  // (interpolation linéaire en fréquence logarithmique) : changer de
  // résolution ou charger un preset 10 bandes ne remet jamais à zéro.
  function resampleGains(srcGains: number[], srcGrid: number[], dstGrid: number[]): number[] {
    if (srcGains.length !== srcGrid.length || srcGrid.length === 0) return Array(dstGrid.length).fill(0);
    return dstGrid.map((f) => {
      const x = Math.log10(f);
      if (x <= Math.log10(srcGrid[0])) return srcGains[0];
      if (x >= Math.log10(srcGrid[srcGrid.length - 1])) return srcGains[srcGains.length - 1];
      let i = 1;
      while (i < srcGrid.length && Math.log10(srcGrid[i]) < x) i++;
      const x0 = Math.log10(srcGrid[i - 1]);
      const x1 = Math.log10(srcGrid[i]);
      const t = (x - x0) / (x1 - x0);
      return srcGains[i - 1] + t * (srcGains[i] - srcGains[i - 1]);
    });
  }

  /// Adopte une liste de gains provenant d'une grille connue (10/15/31),
  /// rééchantillonnée si elle ne correspond pas à la résolution active.
  function adoptGains(src: number[]): boolean {
    const srcGrid = GRIDS[src.length];
    if (!srcGrid) return false;
    gains = src.length === bandCount ? [...src] : resampleGains(src, srcGrid, BANDS);
    return true;
  }

  let eqSendTimer: ReturnType<typeof setTimeout> | null = null;
  function queueSendToServer() {
    if (eqSendTimer) clearTimeout(eqSendTimer);
    eqSendTimer = setTimeout(() => {
      eqSendTimer = null;
      void sendToServer();
    }, 300);
  }

  async function sendToServer() {
    const zoneId = $currentZoneId;
    if (zoneId === null) return;
    const bands = expertSubMode === 'parametric' ? $state.snapshot(pBands) : buildBands();
    const settings: EqSettings = { bands, enabled };
    try {
      await api.setEq(zoneId, settings);
    } catch {
      // Backend may not support parametric EQ yet -- silently ignore
    }
  }

  function switchExpertSubMode(mode: 'graphic' | 'parametric') {
    if (mode === expertSubMode) return;
    if (mode === 'parametric' && pBands.length === 0) {
      // Première ouverture : partir de la courbe graphique actuelle.
      pBands = buildBands().filter(b => b.gain !== 0);
      if (pBands.length === 0) pBands = [{ freq: 1000, gain: 0, q: 1.41, type: 'peak' }];
    }
    expertSubMode = mode;
    saveLocal();
    queueSendToServer();
  }

  function onParametricChange() {
    // Toucher une bande allume l'égaliseur : sinon la courbe partirait au
    // serveur avec enabled:false et resterait muette (curseurs « morts »).
    if (!enabled) enabled = true;
    saveLocal();
    queueSendToServer();
  }

  function setGain(index: number, value: number) {
    gains[index] = value;
    // Bouger un curseur allume l'égaliseur (comportement attendu d'un EQ) :
    // on ne verrouille plus les bandes tant que l'EQ est en bypass.
    if (!enabled) enabled = true;
    activePreset = detectPreset();
    saveLocal();
    queueSendToServer();
  }

  function applyPreset(key: string) {
    const p = PRESETS[key];
    if (!p) return;
    gains = bandCount === 10 ? [...p.gains] : resampleGains(p.gains, GRIDS[10], BANDS);
    // Choisir un preset active l'EQ pour qu'il soit audible immédiatement.
    if (!enabled) enabled = true;
    activePreset = key;
    saveLocal();
    sendToServer();
  }

  // --- Mes presets (réglages EQ enregistrés par l'utilisateur) ---
  // Conversions preset serveur (bands {freq,gain,q,type} + eq_type) <-> UI.
  function fromServerPreset(sp: import('../lib/api').EqProPreset): CustomEqPreset {
    if (sp.eq_type === 'graphic') {
      return { id: sp.id, name: sp.name, mode: 'graphic', gains: (sp.bands ?? []).map((b) => b.gain) };
    }
    return { id: sp.id, name: sp.name, mode: 'parametric', pBands: (sp.bands ?? []).map((b) => ({ ...b })) };
  }
  function gainsToBands(g: number[]): EqBand[] {
    const grid = GRIDS[g.length] ?? GRIDS[10];
    const q = GRID_Q[g.length] ?? DEFAULT_Q;
    return grid.map((freq, i) => ({ freq, gain: g[i] ?? 0, q }));
  }

  function cacheCustomPresets() {
    try {
      localStorage.setItem(PRESETS_CACHE_KEY, JSON.stringify($state.snapshot(customPresets)));
    } catch { /* ignore */ }
  }

  async function loadCustomPresets() {
    // 1) Paint instantané depuis le cache local.
    try {
      const raw = localStorage.getItem(PRESETS_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) customPresets = parsed.filter((p) => p && p.id && p.name);
    } catch { /* ignore */ }
    // 2) Source de vérité = serveur (partagé entre appareils).
    try {
      const server = await api.listEqPresets();
      await migrateLegacyPresets(server);
      customPresets = (await api.listEqPresets()).map(fromServerPreset);
      cacheCustomPresets();
    } catch { /* serveur indispo / ancien binaire : on garde le cache local */ }
  }

  // Migration one-shot : pousse les presets de l'ancien stockage local (feature
  // v1, avant la synchro serveur) vers le serveur, puis vide la clé héritée.
  async function migrateLegacyPresets(server: import('../lib/api').EqProPreset[]) {
    let legacy: CustomEqPreset[] = [];
    try {
      const raw = localStorage.getItem(LEGACY_PRESETS_KEY);
      const p = raw ? JSON.parse(raw) : null;
      if (Array.isArray(p)) legacy = p.filter((x) => x && x.name);
    } catch { /* ignore */ }
    if (!legacy.length) return;
    const serverNames = new Set(server.map((s) => s.name));
    for (const p of legacy) {
      if (serverNames.has(p.name)) continue;
      const bands = p.mode === 'parametric' ? (p.pBands ?? []) : gainsToBands(p.gains ?? []);
      try { await api.createEqPreset({ name: p.name, eq_type: p.mode, bands }); } catch { /* skip */ }
    }
    try { localStorage.removeItem(LEGACY_PRESETS_KEY); } catch { /* ignore */ }
  }

  async function saveCurrentAsPreset() {
    const name = newPresetName.trim();
    if (!name) return;
    const eq_type = expertSubMode === 'parametric' ? 'parametric' : 'graphic';
    const bands = expertSubMode === 'parametric' ? $state.snapshot(pBands) : buildBands();
    try {
      // Écraser un preset du même nom = supprimer l'ancien puis recréer.
      const dup = customPresets.find((p) => p.name === name);
      if (dup) { try { await api.deleteEqPreset(dup.id); } catch { /* ignore */ } }
      const created = await api.createEqPreset({ name, eq_type, bands });
      customPresets = [...customPresets.filter((p) => p.name !== name), fromServerPreset(created)];
      cacheCustomPresets();
      newPresetName = '';
      showSaveInput = false;
      notifications.success($t('eq.presetSaved' as any).replace('{name}', name));
    } catch (e) {
      if ((e as Error)?.message !== 'premium_required') notifications.error($t('eq.presetSaveFailed' as any));
    }
  }

  function applyCustomPreset(p: CustomEqPreset) {
    if (p.mode === 'parametric' && Array.isArray(p.pBands)) {
      pBands = p.pBands.map((b) => ({ ...b }));
      expertSubMode = 'parametric';
    } else if (Array.isArray(p.gains) && GRIDS[p.gains.length]) {
      // Rééchantillonne si le preset a été enregistré sur une autre résolution.
      gains = p.gains.length === bandCount
        ? [...p.gains]
        : resampleGains(p.gains, GRIDS[p.gains.length], BANDS);
      expertSubMode = 'graphic';
    } else {
      return;
    }
    if (!enabled) enabled = true;
    activePreset = expertSubMode === 'graphic' ? detectPreset() : null;
    saveLocal();
    sendToServer();
  }

  async function deleteCustomPreset(id: string) {
    const prev = customPresets;
    customPresets = customPresets.filter((p) => p.id !== id);
    cacheCustomPresets();
    try {
      await api.deleteEqPreset(id);
    } catch (e) {
      if ((e as Error)?.message !== 'premium_required') {
        customPresets = prev; // revert si le serveur a refusé
        cacheCustomPresets();
      }
    }
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
    if (bandCount !== 10) return null; // presets écrits sur la grille 10 bandes
    for (const [key, p] of Object.entries(PRESETS)) {
      if (p.gains.every((g, i) => g === gains[i])) return key;
    }
    return null;
  }

  // Marge : au-delà de +6 dB de boost cumulable, on rappelle que le soft-clip
  // serveur protège mais qu'une marge de volume évite de l'atteindre.
  let maxBoost = $derived(Math.max(0, ...gains));

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
  // Mode PURE (audiophile) : le serveur contourne TOUT le DSP, égaliseur
  // compris — prévenir au lieu de laisser des curseurs sans effet (BARATOUX).
  let pureActive = $state(false);
  async function loadPure(zoneId: number) {
    try {
      pureActive = (await api.getAudiophileMode(zoneId)).enabled;
    } catch {
      pureActive = false;
    }
  }

  // --- Crossfeed (casque) -------------------------------------------------
  // Lives in the same DSP panel and reads/writes the SAME active zone via the
  // shared /zones/{id}/dsp route (crossfeed sub-object). Local output only.
  const CF_MIN_AMOUNT = 0;
  const CF_MAX_AMOUNT = 0.5;
  const CF_MIN_DELAY = 0;
  const CF_MAX_DELAY = 5;

  let cfEnabled = $state(false);
  let cfAmount = $state(0.30);
  let cfDelay = $state(0.30);

  // amount/delay per preset. Same save path as the EQ (debounced PUT), never
  // one request per slider tick.
  const CF_PRESETS: { key: string; labelKey: string; amount: number; delay: number }[] = [
    { key: 'light',    labelKey: 'dsp.crossfeedPresetLight',    amount: 0.25, delay: 0.3 },
    { key: 'standard', labelKey: 'dsp.crossfeedPresetStandard', amount: 0.30, delay: 0.5 },
    { key: 'strong',   labelKey: 'dsp.crossfeedPresetStrong',   amount: 0.40, delay: 0.7 },
  ];

  let cfSendTimer: ReturnType<typeof setTimeout> | null = null;
  function queueCrossfeedSave() {
    if (cfSendTimer) clearTimeout(cfSendTimer);
    cfSendTimer = setTimeout(() => {
      cfSendTimer = null;
      void saveCrossfeed();
    }, 300);
  }

  async function saveCrossfeed() {
    const zoneId = $currentZoneId;
    if (zoneId === null) return;
    const crossfeed: CrossfeedSettings = {
      enabled: cfEnabled,
      // Clamp to the server's accepted ranges before sending.
      amount: Math.min(CF_MAX_AMOUNT, Math.max(CF_MIN_AMOUNT, cfAmount)),
      delay_ms: Math.min(CF_MAX_DELAY, Math.max(CF_MIN_DELAY, cfDelay)),
    };
    try {
      await api.setDsp(zoneId, { crossfeed });
    } catch (e) {
      // fetchJSON already surfaced the Premium popup on a 402 — don't stack.
      if ((e as Error)?.message !== 'premium_required') {
        console.error('Crossfeed save error:', e);
      }
    }
  }

  function toggleCrossfeed() {
    cfEnabled = !cfEnabled;
    saveCrossfeed();
  }

  function onCrossfeedAmount(e: Event) {
    cfAmount = parseFloat((e.target as HTMLInputElement).value);
    queueCrossfeedSave();
  }

  function onCrossfeedDelay(e: Event) {
    cfDelay = parseFloat((e.target as HTMLInputElement).value);
    queueCrossfeedSave();
  }

  function applyCrossfeedPreset(amount: number, delay: number) {
    cfAmount = amount;
    cfDelay = delay;
    cfEnabled = true;
    saveCrossfeed();
  }

  let cfActivePreset = $derived(
    CF_PRESETS.find(p => p.amount === cfAmount && p.delay === cfDelay)?.key ?? null
  );

  onMount(async () => {
    loadLocal();
    loadProfiler();
    loadCustomPresets();
    const zoneId = $currentZoneId;
    if (zoneId === null) return;
    loadPure(zoneId);
    try {
      const res = await api.getEqExpertSettings();
      if (GRIDS[res.expert_bands] && res.expert_bands !== bandCount) {
        const prevGrid = BANDS;
        const prev = gains;
        bandCount = res.expert_bands;
        gains = resampleGains(prev, prevGrid, GRIDS[bandCount]);
      }
    } catch {
      // Vieux serveur sans la route — on reste en 10 bandes
    }
    try {
      const eq = await api.getEq(zoneId);
      if (eq?.bands?.length) {
        const isGrid = !!GRIDS[eq.bands.length]
          && eq.bands.every((b, i) => b.freq === GRIDS[eq.bands.length][i] && (b.type ?? 'peak') === 'peak');
        if (isGrid && adoptGains(eq.bands.map(b => b.gain))) {
          enabled = eq.enabled;
          activePreset = detectPreset();
          saveLocal();
        } else if (!isGrid) {
          // Courbe paramétrique déjà en place côté serveur : on l'édite telle
          // quelle au lieu de l'écraser sur une grille.
          pBands = eq.bands;
          expertSubMode = 'parametric';
          enabled = eq.enabled;
          saveLocal();
        }
      }
    } catch {
      // Endpoint may not exist — use local values
    }
    // Crossfeed state comes from the shared DSP route (defaults returned even
    // when absent server-side).
    try {
      const dsp = await api.getDsp(zoneId);
      const cf = dsp?.crossfeed;
      if (cf) {
        cfEnabled = !!cf.enabled;
        if (typeof cf.amount === 'number') cfAmount = cf.amount;
        if (typeof cf.delay_ms === 'number') cfDelay = cf.delay_ms;
      }
    } catch {
      // Endpoint gated / unavailable — keep defaults.
    }
  });
</script>

<section class="equalizer-view">
  {#if pureActive && $isPremium}
    <div class="eq-pure-banner">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      {$t('eq.pureBypassWarning' as any)}
    </div>
  {/if}
  <header class="eq-header">
    <h1>{$t('eq.title')}</h1>
    {#if $isPremium}
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
    {/if}
  </header>

  {#if !$isPremium}
    <div class="premium-gate">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <span>{$t('eq.premiumGate')} <strong>Tune Premium</strong>.</span>
    </div>

  {:else if eqMode === 'assistant'}
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
              <input type="range" min="-12" max="12" step="0.5" bind:value={bassSlider} oninput={queueProfilerApply} />
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
              <input type="range" min="-12" max="12" step="0.5" bind:value={midSlider} oninput={queueProfilerApply} />
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
              <input type="range" min="-12" max="12" step="0.5" bind:value={trebleSlider} oninput={queueProfilerApply} />
            </div>
          </div>

          <div class="profiler-actions">
            <button class="profiler-apply-btn" onclick={() => applyProfiler()}>
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
      <div class="eq-submode">
        <button class="eq-submode-btn" class:active={expertSubMode === 'graphic'}
          onclick={() => switchExpertSubMode('graphic')}>{$t('eq.subGraphic' as any)}</button>
        <button class="eq-submode-btn" class:active={expertSubMode === 'parametric'}
          onclick={() => switchExpertSubMode('parametric')}>{$t('eq.subParametric' as any)}</button>
      </div>
    </div>

    <!-- Mes presets : réglages EQ enregistrés par l'utilisateur (graphique ou paramétrique) -->
    <div class="my-presets">
      <div class="my-presets-head">
        <span class="my-presets-title">{$t('eq.myPresets' as any)}</span>
        {#if !showSaveInput}
          <button class="my-preset-save-toggle" onclick={() => { showSaveInput = true; newPresetName = ''; }}>
            + {$t('eq.savePreset' as any)}
          </button>
        {/if}
      </div>

      {#if showSaveInput}
        <div class="my-preset-save-row">
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="my-preset-input"
            type="text"
            maxlength="40"
            autofocus
            placeholder={$t('eq.presetNamePlaceholder' as any)}
            bind:value={newPresetName}
            onkeydown={(e) => { if (e.key === 'Enter') saveCurrentAsPreset(); if (e.key === 'Escape') showSaveInput = false; }}
          />
          <button class="my-preset-confirm" disabled={!newPresetName.trim()} onclick={saveCurrentAsPreset}>{$t('eq.save' as any)}</button>
          <button class="my-preset-cancel" onclick={() => { showSaveInput = false; newPresetName = ''; }}>{$t('common.cancel' as any)}</button>
        </div>
      {/if}

      {#if customPresets.length}
        <div class="my-presets-list">
          {#each customPresets as p (p.id)}
            <div class="my-preset-chip">
              <button class="my-preset-apply" title={p.mode === 'parametric' ? $t('eq.subParametric' as any) : $t('eq.subGraphic' as any)} onclick={() => applyCustomPreset(p)}>{p.name}</button>
              <button class="my-preset-del" title={$t('eq.deletePreset' as any)} aria-label={$t('eq.deletePreset' as any)} onclick={() => deleteCustomPreset(p.id)}>×</button>
            </div>
          {/each}
        </div>
      {:else if !showSaveInput}
        <p class="my-presets-empty">{$t('eq.noPresets' as any)}</p>
      {/if}
    </div>

  {#if expertSubMode === 'parametric'}
    <ParametricEq bind:bands={pBands} {enabled} onchange={onParametricChange} />
  {:else}

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
    <div class="sliders" class:dense={bandCount > 10}>
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
            />
            <div class="slider-zero-line"></div>
          </div>
          <div class="slider-freq">{freqLabel(freq)}Hz</div>
        </div>
      {/each}
    </div>
  </div>

  {#if enabled && maxBoost >= 6}
    <div class="headroom-hint">{$t('eq.headroomHint' as any)} (+{maxBoost.toFixed(1)} dB)</div>
  {/if}

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
  {/if}

  <!-- =================== CROSSFEED (CASQUE) =================== -->
  <!-- Same DSP panel, same active zone. Shown for premium in both modes.
       When not premium the top-level premium-gate already covers the whole
       view, so this section is simply part of the gated DSP surface. -->
  {#if $isPremium}
    <section class="crossfeed">
      <div class="crossfeed-header">
        <h2 class="crossfeed-title">{$t('dsp.crossfeedTitle')}</h2>
        <button
          class="crossfeed-toggle"
          class:active={cfEnabled}
          onclick={toggleCrossfeed}
          aria-pressed={cfEnabled}
        >
          {cfEnabled ? $t('dsp.crossfeedOn') : $t('dsp.crossfeedOff')}
        </button>
      </div>

      <p class="crossfeed-desc">{$t('dsp.crossfeedDesc')}</p>

      <div class="crossfeed-presets">
        {#each CF_PRESETS as preset}
          <button
            class="crossfeed-preset-btn"
            class:active={cfActivePreset === preset.key}
            onclick={() => applyCrossfeedPreset(preset.amount, preset.delay)}
          >
            {$t(preset.labelKey)}
          </button>
        {/each}
      </div>

      <div class="crossfeed-sliders" class:disabled={!cfEnabled}>
        <div class="crossfeed-slider">
          <div class="crossfeed-slider-header">
            <span class="crossfeed-slider-label">{$t('dsp.crossfeedAmount')}</span>
            <span class="crossfeed-slider-value">{Math.round(cfAmount * 100)}%</span>
          </div>
          <input
            type="range"
            min={CF_MIN_AMOUNT}
            max={CF_MAX_AMOUNT}
            step="0.01"
            value={cfAmount}
            oninput={onCrossfeedAmount}
            disabled={!cfEnabled}
          />
        </div>

        <div class="crossfeed-slider">
          <div class="crossfeed-slider-header">
            <span class="crossfeed-slider-label">{$t('dsp.crossfeedDelay')}</span>
            <span class="crossfeed-slider-value">{cfDelay.toFixed(2)} ms</span>
          </div>
          <input
            type="range"
            min={CF_MIN_DELAY}
            max={CF_MAX_DELAY}
            step="0.05"
            value={cfDelay}
            oninput={onCrossfeedDelay}
            disabled={!cfEnabled}
          />
        </div>
      </div>
    </section>
  {/if}
</section>

<style>
  .equalizer-view {
    padding: 1.5rem;
    max-width: 900px;
    margin: 0 auto;
  }

  .premium-gate {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 20px;
    background: rgba(99, 102, 241, 0.08);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 10px;
    color: var(--tune-text-secondary, #aaa);
    font-size: 14px;
  }
  .premium-gate strong { color: var(--tune-accent, #6366f1); }

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

  /* Mes presets (réglages EQ enregistrés) */
  .my-presets {
    margin-bottom: 1.25rem;
    padding: 0.6rem 0.75rem;
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.05);
    border-radius: 10px;
  }
  .my-presets-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .my-presets-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--tune-text-secondary);
  }
  .my-preset-save-toggle {
    background: transparent;
    border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.4);
    color: var(--tune-accent, #6366f1);
    border-radius: 999px;
    padding: 0.25rem 0.7rem;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .my-preset-save-row {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.6rem;
  }
  .my-preset-input {
    flex: 1;
    min-width: 0;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: var(--tune-text, #e5e7eb);
    border-radius: 8px;
    padding: 0.35rem 0.6rem;
    font-size: 0.85rem;
  }
  .my-preset-confirm,
  .my-preset-cancel {
    border-radius: 8px;
    padding: 0.35rem 0.8rem;
    font-size: 0.8rem;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.15);
  }
  .my-preset-confirm {
    background: var(--tune-accent, #6366f1);
    color: white;
    border-color: var(--tune-accent, #6366f1);
  }
  .my-preset-confirm:disabled { opacity: 0.4; cursor: default; }
  .my-preset-cancel { background: transparent; color: var(--tune-text-dim, #9ca3af); }
  .my-presets-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.6rem;
  }
  .my-preset-chip {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.35);
    border-radius: 999px;
    overflow: hidden;
  }
  .my-preset-apply {
    background: transparent;
    border: none;
    color: var(--tune-text-secondary);
    padding: 0.35rem 0.5rem 0.35rem 0.9rem;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .my-preset-apply:hover { color: var(--tune-text); }
  .my-preset-del {
    background: transparent;
    border: none;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--tune-text-muted);
    padding: 0 0.55rem;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
  }
  .my-preset-del:hover { color: #f87171; }
  .my-presets-empty {
    margin: 0.5rem 0 0;
    font-size: 0.75rem;
    color: var(--tune-text-muted);
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

  /* EQ en bypass : on grise pour signaler l'état « off » mais on laisse les
     bandes saisissables — les toucher rallume l'EQ (cf. setGain). */
  .sliders-container.disabled {
    opacity: 0.55;
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

  /* 15/31 bandes : chaque bande garde une largeur lisible, le conteneur
     défile horizontalement (surtout iPad/mobile) au lieu d'écraser tout. */
  .sliders.dense { overflow-x: auto; justify-content: flex-start; }
  .sliders.dense .slider-band { min-width: 2.2rem; flex: 0 0 auto; }
  .sliders.dense .slider-value { font-size: 0.55rem; }
  .sliders.dense .slider-freq { font-size: 0.55rem; }

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

  .eq-submode { display: flex; gap: 0.25rem; margin-left: auto; }
  .eq-submode-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--tune-text-dim, #9ca3af);
    border-radius: 6px;
    padding: 0.3rem 0.7rem;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .eq-submode-btn.active {
    color: var(--tune-text, #fff);
    border-color: var(--tune-accent, #6366f1);
    background: rgba(99, 102, 241, 0.15);
  }

  .headroom-hint {
    font-size: 0.7rem;
    color: #f59e0b;
    padding: 0.2rem 0.75rem;
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
  .eq-pure-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    margin-bottom: var(--space-md);
    border: 1px solid rgba(240, 180, 41, 0.5);
    border-radius: var(--radius-md);
    background: rgba(240, 180, 41, 0.12);
    color: #f0b429;
    font-size: 13px;
  }

  /* --- Crossfeed (casque) --- */
  .crossfeed {
    margin-top: 1.5rem;
    padding: 1.2rem 1.2rem 1.4rem;
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.04);
    border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.12);
    border-radius: 12px;
  }
  .crossfeed-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    margin-bottom: 0.5rem;
  }
  .crossfeed-title {
    margin: 0;
    font-size: 1.05rem;
    font-family: var(--font-label);
    font-weight: 700;
    color: var(--tune-text);
  }
  .crossfeed-toggle {
    padding: 0.4rem 1rem;
    border-radius: 999px;
    border: 1px solid var(--tune-border);
    background: transparent;
    color: var(--tune-text-secondary);
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .crossfeed-toggle.active {
    background: var(--tune-accent, #6366f1);
    color: white;
    border-color: var(--tune-accent, #6366f1);
  }
  .crossfeed-desc {
    margin: 0 0 1rem;
    font-family: var(--font-body);
    font-size: 13px;
    line-height: 1.5;
    color: var(--tune-text-secondary);
  }
  .crossfeed-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 1.2rem;
  }
  .crossfeed-preset-btn {
    padding: 0.35rem 0.9rem;
    font-size: 0.85rem;
    border-radius: 999px;
    border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.3);
    background: transparent;
    color: var(--tune-text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }
  .crossfeed-preset-btn:hover {
    border-color: var(--tune-accent, #6366f1);
    color: var(--tune-text);
  }
  .crossfeed-preset-btn.active {
    background: var(--tune-accent, #6366f1);
    color: white;
    border-color: var(--tune-accent, #6366f1);
  }
  .crossfeed-sliders {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    transition: opacity 0.2s;
  }
  .crossfeed-sliders.disabled {
    opacity: 0.35;
    pointer-events: none;
  }
  .crossfeed-slider {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .crossfeed-slider-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .crossfeed-slider-label {
    font-family: var(--font-label);
    font-size: 14px;
    font-weight: 600;
    color: var(--tune-text);
  }
  .crossfeed-slider-value {
    font-family: var(--font-label);
    font-size: 13px;
    color: var(--tune-accent);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .crossfeed-slider input[type="range"] {
    width: 100%;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    outline: none;
    cursor: pointer;
  }
  .crossfeed-slider input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--tune-accent);
    border: 2px solid white;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }
  .crossfeed-slider input[type="range"]::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--tune-accent);
    border: 2px solid white;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }
</style>
