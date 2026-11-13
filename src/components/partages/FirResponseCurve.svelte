<script lang="ts">
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';

  // Courbe de réponse du filtre FIR (convolver) chargé sur une zone.
  // Le serveur pré-calcule ~200 points log 20 Hz → 20 kHz :
  //   GET /api/v1/zones/{id}/convolver/response
  //   → { loaded, taps, sample_rate, latency_ms, points: [{ f, db, phase_deg }],
  //       channels?: [{ channel, taps, latency_ms, points }] }
  // `points` = canal 0 (rétrocompatibilité). `channels` (tune-server-rust#8349)
  // porte une entrée par canal de l'IR : à deux canaux ou plus, une trace par
  // canal (gauche, droite, puis « Canal n »), web#1427.
  // Tolérance : endpoint absent (404/405), zone inconnue ou loaded:false
  // → on n'affiche rien, sans erreur visible.

  interface ResponsePoint {
    f: number;
    db: number;
    phase_deg?: number | null;
  }
  interface ChannelResponse {
    channel?: number;
    taps?: number;
    latency_ms?: number;
    points?: ResponsePoint[];
  }
  interface ConvolverResponse {
    loaded: boolean;
    taps?: number;
    sample_rate?: number;
    latency_ms?: number;
    points?: ResponsePoint[];
    channels?: ChannelResponse[];
  }
  interface Trace {
    index: number;
    points: ResponsePoint[];
  }

  let {
    zoneId,
    refreshKey = 0,
    currentSampleRate = null,
  }: {
    zoneId: number;
    /** Incrémenté par le parent après upload/remplacement du filtre → re-fetch. */
    refreshKey?: number;
    /** Sample rate courant de la zone (piste en lecture), pour l'avertissement doux. */
    currentSampleRate?: number | null;
  } = $props();

  let data = $state<ConvolverResponse | null>(null);
  let showPhase = $state(false);

  $effect(() => {
    // Dépendances explicites : re-fetch à l'ouverture, au changement de zone
    // et après chaque upload (refreshKey).
    const id = zoneId;
    void refreshKey;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.fetchJSON<ConvolverResponse>(`${api.BASE}/zones/${id}/convolver/response`);
        if (cancelled) return;
        data = res?.loaded && Array.isArray(res.points) && res.points.length > 1 ? res : null;
      } catch {
        // 404/405 (endpoint absent, zone inconnue) ou réseau : silence.
        if (!cancelled) data = null;
      }
    })();
    return () => { cancelled = true; };
  });

  // Une trace par canal quand le serveur en donne au moins deux ; sinon
  // (serveur plus ancien, IR mono) la seule courbe `points`.
  let traces = $derived.by<Trace[]>(() => {
    if (!data) return [];
    const ch = Array.isArray(data.channels)
      ? data.channels.filter(c => Array.isArray(c?.points) && c.points.length > 1)
      : [];
    if (ch.length >= 2) {
      return ch.map((c, i) => ({ index: Number.isInteger(c.channel) ? (c.channel as number) : i, points: c.points! }));
    }
    return [{ index: 0, points: data.points ?? [] }];
  });
  let multi = $derived(traces.length > 1);

  function channelLabel(index: number): string {
    if (index === 0) return $t('zoneConfig.firChannelLeft');
    if (index === 1) return $t('zoneConfig.firChannelRight');
    return $t('zoneConfig.firChannelN').replace('{n}', String(index + 1));
  }

  // --- Géométrie (même approche que ParametricEq.svelte) ---
  const W = 640;
  const H = 240;
  const F_MIN = 20;
  const F_MAX = 20000;
  const PAD_Y = 12; // marge haut/bas pour que la courbe ne colle pas au cadre

  function xOf(f: number): number {
    const fc = Math.min(F_MAX, Math.max(F_MIN, f));
    return (Math.log10(fc / F_MIN) / Math.log10(F_MAX / F_MIN)) * W;
  }

  // Échelle dB adaptative : un filtre de correction peut dépasser ±12 dB,
  // on choisit la plus petite plage « ronde » qui contient la courbe.
  const DB_RANGES = [6, 12, 18, 24, 36, 48, 60];
  let dbMax = $derived.by(() => {
    let m = 0;
    for (const tr of traces) {
      for (const p of tr.points) {
        if (Number.isFinite(p.db)) m = Math.max(m, Math.abs(p.db));
      }
    }
    for (const r of DB_RANGES) if (m <= r * 0.92) return r;
    return Math.ceil(m / 12) * 12;
  });
  let dbStep = $derived(dbMax <= 6 ? 3 : dbMax <= 24 ? 6 : 12);
  let dbGrid = $derived.by(() => {
    const lines: number[] = [];
    for (let v = -dbMax; v <= dbMax; v += dbStep) lines.push(v);
    return lines;
  });

  function yOf(db: number): number {
    const c = Math.min(dbMax, Math.max(-dbMax, db));
    return H / 2 - (c / dbMax) * (H / 2 - PAD_Y);
  }

  // Phase repliée dans [-180°, 180°] (le serveur peut l'envoyer déroulée).
  function wrapDeg(deg: number): number {
    let d = ((deg + 180) % 360 + 360) % 360 - 180;
    return d;
  }
  function yPhase(deg: number): number {
    return H / 2 - (wrapDeg(deg) / 180) * (H / 2 - PAD_Y);
  }

  function magPath(points: ResponsePoint[]): string {
    const pts = points.filter(p => Number.isFinite(p.f) && Number.isFinite(p.db));
    if (pts.length < 2) return '';
    return 'M ' + pts
      .map(p => `${xOf(p.f).toFixed(1)} ${yOf(p.db).toFixed(1)}`)
      .join(' L ');
  }

  let hasPhase = $derived(traces.some(tr => tr.points.some(p => Number.isFinite(p.phase_deg as number))));

  // La phase repliée saute de +180° à −180° : on coupe le tracé à chaque
  // repli (|Δ| > 180°) pour éviter les traits verticaux parasites.
  function phasePath(points: ResponsePoint[]): string {
    const pts = points.filter(p => Number.isFinite(p.f) && Number.isFinite(p.phase_deg as number));
    if (pts.length < 2) return '';
    let d = '';
    let prev: number | null = null;
    for (const p of pts) {
      const w = wrapDeg(p.phase_deg as number);
      const cmd = prev === null || Math.abs(w - prev) > 180 ? 'M' : 'L';
      d += `${cmd} ${xOf(p.f).toFixed(1)} ${yPhase(p.phase_deg as number).toFixed(1)} `;
      prev = w;
    }
    return d.trim();
  }

  const GRID_FREQS = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
  function freqLabel(f: number): string {
    return f >= 1000 ? `${f / 1000}k` : `${f}`;
  }

  function fmtKHz(sr: number): string {
    return `${(sr / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kHz`;
  }
  function fmtLatency(ms: number): string {
    return ms.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  let rateMismatch = $derived(
    data?.sample_rate && currentSampleRate && data.sample_rate !== currentSampleRate
      ? $t('zoneConfig.firRateMismatch')
          .replace('{filter}', fmtKHz(data.sample_rate))
          .replace('{zone}', fmtKHz(currentSampleRate))
      : null
  );
</script>

{#if data}
  <div class="fir-curve">
    <div class="fir-curve-head">
      <span class="fir-curve-title">{$t('zoneConfig.firResponseTitle')}</span>
      {#if hasPhase}
        <button
          class="phase-toggle"
          class:active={showPhase}
          onclick={() => (showPhase = !showPhase)}
        >{$t('zoneConfig.firPhase')}</button>
      {/if}
    </div>

    <svg viewBox="0 0 {W} {H}" class="fir-plot" role="img" aria-label={$t('zoneConfig.firResponseTitle')}>
      <!-- Grille fréquences -->
      {#each GRID_FREQS as f}
        <line x1={xOf(f)} y1="0" x2={xOf(f)} y2={H} class="grid-v" />
        <text x={xOf(f) + 3} y={H - 4} class="grid-label">{freqLabel(f)}</text>
      {/each}
      <!-- Grille dB (adaptative) -->
      {#each dbGrid as db}
        <line x1="0" y1={yOf(db)} x2={W} y2={yOf(db)} class={db === 0 ? 'grid-zero' : 'grid-h'} />
        <text x="4" y={yOf(db) - 3} class="grid-label">{db > 0 ? '+' : ''}{db}</text>
      {/each}
      <!-- Échelle phase à droite -->
      {#if showPhase}
        {#each [-180, -90, 0, 90, 180] as deg}
          <text x={W - 4} y={yPhase(deg) - 3} class="grid-label phase-label">{deg > 0 ? '+' : ''}{deg}°</text>
        {/each}
        {#each traces as tr, i (tr.index)}
          <path d={phasePath(tr.points)} class="phase phase-{i % 4}" />
        {/each}
      {/if}
      <!-- Magnitude : une trace par canal -->
      {#each traces as tr, i (tr.index)}
        <path d={magPath(tr.points)} class="magnitude trace-{i % 4}" data-channel={tr.index} />
      {/each}
    </svg>

    {#if multi}
      <div class="fir-legend">
        {#each traces as tr, i (tr.index)}
          <span class="legend-item"><span class="legend-swatch trace-{i % 4}"></span>{channelLabel(tr.index)}</span>
        {/each}
      </div>
    {/if}

    <div class="fir-meta">
      {#if data.taps != null}
        <span class="meta-item">{data.taps.toLocaleString()} {$t('zoneConfig.firTaps')}</span>
      {/if}
      {#if data.sample_rate != null}
        <span class="meta-item">{fmtKHz(data.sample_rate)}</span>
      {/if}
      {#if data.latency_ms != null}
        <span class="meta-item">{$t('zoneConfig.firLatency')} {fmtLatency(data.latency_ms)} ms</span>
      {/if}
    </div>

    {#if rateMismatch}
      <div class="fir-rate-warning">{rateMismatch}</div>
    {/if}
  </div>
{/if}

<style>
  .fir-curve {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 10px;
  }
  .fir-curve-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .fir-curve-title {
    font-family: var(--font-label);
    font-size: calc(10px * var(--v2-txt-echelle, 1));
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--tune-text-muted);
  }
  .phase-toggle {
    background: none;
    border: 1px solid var(--tune-border);
    color: var(--tune-text-muted);
    border-radius: var(--radius-sm);
    padding: 1px 8px;
    font-family: var(--font-label);
    font-size: calc(10px * var(--v2-txt-echelle, 1));
    cursor: pointer;
    transition: all 0.12s;
  }
  .phase-toggle:hover { color: var(--tune-text); }
  .phase-toggle.active {
    color: var(--tune-accent);
    border-color: var(--tune-accent);
  }
  .fir-plot {
    width: 100%;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
  }
  .grid-v, .grid-h { stroke: rgba(255, 255, 255, 0.06); stroke-width: 1; }
  .grid-zero { stroke: rgba(255, 255, 255, 0.18); stroke-width: 1; }
  .grid-label { fill: rgba(255, 255, 255, 0.35); font-size: calc(9px * var(--v2-txt-echelle, 1)); }
  .phase-label { text-anchor: end; }
  .magnitude { fill: none; stroke: #f59e0b; stroke-width: 2; }
  .magnitude.trace-1 { stroke: #38bdf8; }
  .magnitude.trace-2 { stroke: #a78bfa; }
  .magnitude.trace-3 { stroke: #34d399; }
  .fir-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    font-family: var(--font-body);
    font-size: calc(11px * var(--v2-txt-echelle, 1));
    color: var(--tune-text-muted);
  }
  .legend-item { display: inline-flex; align-items: center; gap: 6px; }
  .legend-swatch { display: inline-block; width: 14px; height: 2px; background: #f59e0b; }
  .legend-swatch.trace-1 { background: #38bdf8; }
  .legend-swatch.trace-2 { background: #a78bfa; }
  .legend-swatch.trace-3 { background: #34d399; }
  .phase {
    fill: none;
    stroke: rgba(255, 255, 255, 0.45);
    stroke-width: 1.5;
    stroke-dasharray: 4 4;
  }
  .fir-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    font-family: var(--font-body);
    font-size: calc(11px * var(--v2-txt-echelle, 1));
    color: var(--tune-text-muted);
  }
  .fir-rate-warning {
    font-family: var(--font-body);
    font-size: calc(11px * var(--v2-txt-echelle, 1));
    color: #f59e0b;
  }
</style>
