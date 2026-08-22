<script lang="ts">
  import { t } from '../lib/i18n';
  import { choixDepuisBande, canalDepuisChoix } from '../lib/eqChannel';
  import type { EqBand } from '../lib/api';

  // Éditeur paramétrique : jusqu'à 31 bandes libres (fréquence, gain, Q, type),
  // éditées en glissant les points sur la courbe de réponse RÉELLE — calculée
  // avec les mêmes biquads RBJ que le serveur (tune-core/src/audio/eq.rs), pas
  // une interpolation cosmétique.
  let {
    bands = $bindable<EqBand[]>([]),
    enabled = true,
    maxBands = 31,
    onchange,
  }: {
    bands: EqBand[];
    enabled?: boolean;
    maxBands?: number;
    onchange?: () => void;
  } = $props();

  const W = 640;
  const H = 240;
  const F_MIN = 20;
  const F_MAX = 20000;
  const DB_RANGE = 15; // ±15 dB d'affichage (les gains restent bornés ±12)
  const MIN_GAIN = -12;
  const MAX_GAIN = 12;
  const SR = 48000; // affichage seulement — la forme de la réponse est identique

  const BAND_TYPES = ['peak', 'low_shelf', 'high_shelf', 'low_pass', 'high_pass', 'notch'] as const;

  let selected = $state<number | null>(null);
  let dragging = $state(false);

  function xOf(f: number): number {
    return (Math.log10(f / F_MIN) / Math.log10(F_MAX / F_MIN)) * W;
  }
  function fOf(x: number): number {
    return F_MIN * Math.pow(F_MAX / F_MIN, Math.min(1, Math.max(0, x / W)));
  }
  function yOf(db: number): number {
    return H / 2 - (db / DB_RANGE) * (H / 2 - 10);
  }
  function dbOf(y: number): number {
    return ((H / 2 - y) / (H / 2 - 10)) * DB_RANGE;
  }

  // --- Biquads RBJ (miroir de eq.rs) ---
  type Coeffs = { b0: number; b1: number; b2: number; a1: number; a2: number };

  function coeffs(band: EqBand): Coeffs {
    const f = band.freq;
    const gain = band.gain;
    const q = band.q && band.q > 0 ? band.q : 1.0;
    const a = Math.pow(10, gain / 40);
    const w0 = (2 * Math.PI * f) / SR;
    const cw = Math.cos(w0);
    const sw = Math.sin(w0);
    const alpha = sw / (2 * q);
    let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
    switch (band.type ?? 'peak') {
      case 'low_shelf': {
        const s = Math.sqrt(a) * sw * Math.SQRT2 / 2 * 2; // 2*sqrt(a)*alpha with S=1
        b0 = a * (a + 1 - (a - 1) * cw + s);
        b1 = 2 * a * (a - 1 - (a + 1) * cw);
        b2 = a * (a + 1 - (a - 1) * cw - s);
        a0 = a + 1 + (a - 1) * cw + s;
        a1 = -2 * (a - 1 + (a + 1) * cw);
        a2 = a + 1 + (a - 1) * cw - s;
        break;
      }
      case 'high_shelf': {
        const s = Math.sqrt(a) * sw * Math.SQRT2 / 2 * 2;
        b0 = a * (a + 1 + (a - 1) * cw + s);
        b1 = -2 * a * (a - 1 + (a + 1) * cw);
        b2 = a * (a + 1 + (a - 1) * cw - s);
        a0 = a + 1 - (a - 1) * cw + s;
        a1 = 2 * (a - 1 - (a + 1) * cw);
        a2 = a + 1 - (a - 1) * cw - s;
        break;
      }
      case 'low_pass':
        b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2;
        a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case 'high_pass':
        b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2;
        a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      case 'notch':
        b0 = 1; b1 = -2 * cw; b2 = 1;
        a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
        break;
      default: // peak
        b0 = 1 + alpha * a; b1 = -2 * cw; b2 = 1 - alpha * a;
        a0 = 1 + alpha / a; a1 = -2 * cw; a2 = 1 - alpha / a;
    }
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  }

  function magnitudeDb(c: Coeffs, f: number): number {
    const w = (2 * Math.PI * f) / SR;
    const cos1 = Math.cos(w), cos2 = Math.cos(2 * w);
    const sin1 = Math.sin(w), sin2 = Math.sin(2 * w);
    const nr = c.b0 + c.b1 * cos1 + c.b2 * cos2;
    const ni = -(c.b1 * sin1 + c.b2 * sin2);
    const dr = 1 + c.a1 * cos1 + c.a2 * cos2;
    const di = -(c.a1 * sin1 + c.a2 * sin2);
    const mag = Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
    return 20 * Math.log10(Math.max(mag, 1e-9));
  }

  let curvePath = $derived.by(() => {
    if (!bands.length) return `M 0 ${H / 2} L ${W} ${H / 2}`;
    const cs = bands.map(coeffs);
    const pts: string[] = [];
    const N = 160;
    for (let i = 0; i <= N; i++) {
      const f = fOf((i / N) * W);
      let db = 0;
      for (const c of cs) db += magnitudeDb(c, f);
      pts.push(`${((i / N) * W).toFixed(1)} ${yOf(Math.max(-DB_RANGE, Math.min(DB_RANGE, db))).toFixed(1)}`);
    }
    return 'M ' + pts.join(' L ');
  });

  const GRID_FREQS = [50, 100, 200, 500, 1000, 2000, 5000, 10000];

  function freqLabel(f: number): string {
    return f >= 1000 ? `${f / 1000}k` : `${f}`;
  }

  function notify() {
    bands = [...bands];
    onchange?.();
  }

  function addBandAt(x: number, y: number) {
    if (bands.length >= maxBands) return;
    const freq = Math.round(fOf(x));
    const gain = Math.round(Math.max(MIN_GAIN, Math.min(MAX_GAIN, dbOf(y))) * 2) / 2;
    bands.push({ freq, gain, q: 1.41, type: 'peak' } as EqBand);
    selected = bands.length - 1;
    notify();
  }

  let svgEl: SVGSVGElement;

  function svgPoint(e: PointerEvent): { x: number; y: number } {
    const r = svgEl.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  function onPointDown(i: number, e: PointerEvent) {
    selected = i;
    dragging = true;
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointMove(e: PointerEvent) {
    if (!dragging || selected === null) return;
    const { x, y } = svgPoint(e);
    const b = bands[selected];
    b.freq = Math.round(Math.max(F_MIN, Math.min(F_MAX, fOf(x))));
    b.gain = Math.round(Math.max(MIN_GAIN, Math.min(MAX_GAIN, dbOf(y))) * 2) / 2;
    notify();
  }

  function onPointUp() {
    dragging = false;
  }

  function onWheel(i: number, e: WheelEvent) {
    e.preventDefault();
    const b = bands[i];
    const q = b.q && b.q > 0 ? b.q : 1.41;
    const next = q * (e.deltaY < 0 ? 1.12 : 1 / 1.12);
    b.q = Math.round(Math.max(0.1, Math.min(30, next)) * 100) / 100;
    selected = i;
    notify();
  }

  function onPlotDblClick(e: MouseEvent) {
    const r = svgEl.getBoundingClientRect();
    addBandAt(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H);
  }

  function removeBand(i: number) {
    bands.splice(i, 1);
    selected = null;
    notify();
  }

  function updateSelected(patch: Partial<EqBand>) {
    if (selected === null) return;
    Object.assign(bands[selected], patch);
    notify();
  }
</script>

<div class="peq" class:disabled={!enabled}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <svg
    bind:this={svgEl}
    viewBox="0 0 {W} {H}"
    class="peq-plot"
    role="img"
    ondblclick={onPlotDblClick}
    onpointermove={onPointMove}
    onpointerup={onPointUp}
  >
    <!-- Grille -->
    {#each GRID_FREQS as f}
      <line x1={xOf(f)} y1="0" x2={xOf(f)} y2={H} class="grid-v" />
      <text x={xOf(f) + 3} y={H - 4} class="grid-label">{freqLabel(f)}</text>
    {/each}
    {#each [-12, -6, 0, 6, 12] as db}
      <line x1="0" y1={yOf(db)} x2={W} y2={yOf(db)} class={db === 0 ? 'grid-zero' : 'grid-h'} />
      <text x="4" y={yOf(db) - 3} class="grid-label">{db > 0 ? '+' : ''}{db}</text>
    {/each}
    <!-- Réponse cumulée -->
    <path d={curvePath} class="response" />
    <!-- Points de bande -->
    {#each bands as b, i}
      <circle
        cx={xOf(b.freq)}
        cy={yOf(Math.max(MIN_GAIN, Math.min(MAX_GAIN, b.gain)))}
        r={selected === i ? 8 : 6}
        class="band-dot"
        class:selected={selected === i}
        role="slider"
        aria-valuenow={b.gain}
        tabindex="0"
        onpointerdown={(e) => onPointDown(i, e)}
        onwheel={(e) => onWheel(i, e)}
      />
    {/each}
  </svg>

  <div class="peq-toolbar">
    <span class="peq-count">{bands.length}/{maxBands}</span>
    <span class="peq-hint">{$t('eq.peqHint' as any)}</span>
    <button
      class="peq-add"
      disabled={bands.length >= maxBands}
      onclick={() => addBandAt(W / 2, yOf(0))}
    >+ {$t('eq.peqAddBand' as any)}</button>
  </div>

  {#if selected !== null && bands[selected]}
    {@const b = bands[selected]}
    <div class="peq-editor">
      <label>
        <span>{$t('eq.peqFreq' as any)}</span>
        <input type="number" min={F_MIN} max={F_MAX} step="1" value={b.freq}
          oninput={(e) => updateSelected({ freq: Math.max(F_MIN, Math.min(F_MAX, parseFloat((e.target as HTMLInputElement).value) || F_MIN)) })} />
      </label>
      <label>
        <span>{$t('eq.peqGain' as any)}</span>
        <input type="number" min={MIN_GAIN} max={MAX_GAIN} step="0.5" value={b.gain}
          oninput={(e) => updateSelected({ gain: Math.max(MIN_GAIN, Math.min(MAX_GAIN, parseFloat((e.target as HTMLInputElement).value) || 0)) })} />
      </label>
      <label>
        <span>Q</span>
        <input type="number" min="0.1" max="30" step="0.1" value={b.q ?? 1.41}
          oninput={(e) => updateSelected({ q: Math.max(0.1, Math.min(30, parseFloat((e.target as HTMLInputElement).value) || 1.41)) })} />
      </label>
      <label>
        <span>{$t('eq.peqType' as any)}</span>
        <select value={b.type ?? 'peak'}
          onchange={(e) => updateSelected({ type: (e.target as HTMLSelectElement).value as EqBand['type'] })}>
          {#each BAND_TYPES as bt}
            <option value={bt}>{bt}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>{$t('eq.peqChannel' as any)}</span>
        <!--
          Absent = les deux canaux. On envoie donc `undefined` et non `-1` :
          le serveur lit l'absence du champ, et un préréglage qui ne vise pas
          de canal ne doit pas repartir avec une valeur qui en désigne un.
        -->
        <select
          value={choixDepuisBande(b.channel)}
          onchange={(e) =>
            updateSelected({ channel: canalDepuisChoix((e.target as HTMLSelectElement).value) })}
        >
          <option value="both">{$t('eq.peqChannelBoth' as any)}</option>
          <option value="0">{$t('eq.peqChannelLeft' as any)}</option>
          <option value="1">{$t('eq.peqChannelRight' as any)}</option>
        </select>
      </label>
      <button class="peq-del" onclick={() => removeBand(selected!)}>{$t('eq.peqRemove' as any)}</button>
    </div>
  {/if}
</div>

<style>
  .peq { display: flex; flex-direction: column; gap: 0.5rem; }
  /* Bypass : grisé pour signaler l'état « off », mais les points restent
     déplaçables — les éditer rallume l'EQ (onchange → parent). */
  .peq.disabled { opacity: 0.6; }
  .peq-plot {
    width: 100%;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    touch-action: none;
    user-select: none;
  }
  .grid-v, .grid-h { stroke: rgba(255, 255, 255, 0.06); stroke-width: 1; }
  .grid-zero { stroke: rgba(255, 255, 255, 0.18); stroke-width: 1; }
  .grid-label { fill: rgba(255, 255, 255, 0.35); font-size: 9px; }
  .response { fill: none; stroke: var(--tune-accent, #6366f1); stroke-width: 2; }
  .band-dot { fill: var(--tune-accent, #6366f1); opacity: 0.85; cursor: grab; }
  .band-dot.selected { fill: #f59e0b; opacity: 1; }
  .peq-toolbar { display: flex; align-items: center; gap: 0.75rem; font-size: 0.75rem; }
  .peq-count { color: var(--tune-text-dim, #9ca3af); }
  .peq-hint { color: var(--tune-text-dim, #9ca3af); flex: 1; }
  .peq-add, .peq-del {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--tune-text, #e5e7eb);
    border-radius: 6px;
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    font-size: 0.75rem;
  }
  .peq-add:disabled { opacity: 0.4; cursor: default; }
  .peq-del { color: #f87171; }
  .peq-editor {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: end;
    padding: 0.6rem 0.75rem;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 8px;
  }
  .peq-editor label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.7rem; color: var(--tune-text-dim, #9ca3af); }
  .peq-editor input, .peq-editor select {
    width: 5.5rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--tune-text, #e5e7eb);
    border-radius: 6px;
    padding: 0.25rem 0.4rem;
  }
</style>
