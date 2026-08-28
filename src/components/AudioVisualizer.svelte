<script lang="ts">
  import { onMount } from 'svelte';
  import { audioLevels, type AudioLevels } from '../lib/stores/audioLevels';
  import { freqLabel, spectrumIsoTicks } from '../lib/spectrumScale';

  interface Props {
    playing: boolean;
    mode?: 'spectrum' | 'waveform';
    height?: number;
    mini?: boolean;
    sampleRate?: number | null;
    bitDepth?: number | null;
    format?: string | null;
  }

  let {
    playing,
    mode = 'spectrum',
    height = 80,
    mini = false,
    sampleRate = null,
    bitDepth = null,
    format = null,
  }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let animId: number | null = null;
  let visible = $state(false);

  // Simulated bar values (32 bars for spectrum, 64 points for waveform)
  let barCount = $derived(mini ? 16 : 32);
  const WAVE_POINTS = 64;
  let barValues: number[] = Array(32).fill(0);
  let barTargets: number[] = Array(32).fill(0);
  // Maintien de crête : la valeur haute atteinte par chaque bande, figée un
  // instant puis redescendue. Sans elle, un pic passe entre deux images et
  // l'œil ne le voit jamais — c'est ce qui rend un analyseur lisible.
  let peakValues: number[] = Array(32).fill(0);
  let peakHoldUntil: number[] = Array(32).fill(0);
  const PEAK_HOLD_MS = 700;
  const PEAK_FALL = 0.92;
  // Balistique : montée quasi immédiate, retombée lente. Une seule constante
  // de lissage (l'ancien comportement) écrête les transitoires à la montée ET
  // fait retomber trop vite à la descente.
  const ATTACK = 0.55;
  const DECAY = 0.12;
  // Plancher d'affichage. L'échelle est en dB, pas en amplitude : une amplitude
  // linéaire écrase tout (−20 dBFS ne ferait que 10 % de hauteur) alors qu'un
  // vu-mètre se lit en dB.
  const FLOOR_DB = -60;
  /**
   * Nombre de bandes de la DERNIÈRE trame réellement mesurée. 0 = rien de
   * mesuré, donc rien à dessiner et rien à graduer : l'échelle des fréquences
   * n'apparaît que sous des barres qui existent.
   */
  let serverBandCount = 0;
  /** Hauteur réservée sous les barres pour l'échelle, en px CSS. */
  const AXIS_H = 12;
  /** Même corps que la grille de l'égaliseur (`.grid-label`, ParametricEq). */
  const AXIS_FONT = 9;
  let waveValues: number[] = Array(WAVE_POINTS).fill(0);
  let waveTargets: number[] = Array(WAVE_POINTS).fill(0);
  let lastFrame = 0;
  let lastTargetUpdate = 0;
  const TARGET_INTERVAL = 120; // ms between new random targets (~8 Hz)
  const FRAME_INTERVAL = 33;  // ~30 fps

  let realLevels: AudioLevels | null = $state(null);
  let lastRealUpdate = 0;
  const unsub = audioLevels.subscribe((l) => {
    if (l.rms_left_db > -90 || l.rms_right_db > -90) {
      realLevels = l;
      lastRealUpdate = performance.now();
    }
  });

  // Cache accent color (avoid getComputedStyle per frame)
  let cachedAccent = '#6B6ED9';
  let cachedMuted = 'rgba(255, 255, 255, 0.4)';
  let accentCacheTime = 0;

  // Derive energy profile from audio metadata
  function getEnergyProfile(): { bass: number; mid: number; treble: number; speed: number } {
    let bass = 0.6, mid = 0.5, treble = 0.4, speed = 1.0;

    if (sampleRate && sampleRate > 96000) {
      treble = 0.7; speed = 1.2;
    } else if (sampleRate && sampleRate > 44100) {
      treble = 0.55; speed = 1.1;
    }

    if (bitDepth && bitDepth >= 24) {
      bass = 0.7; mid = 0.55;
    }

    if (format === 'dsd') {
      bass = 0.75; mid = 0.6; treble = 0.65; speed = 0.9;
    }

    return { bass, mid, treble, speed };
  }

  function dbToLinear(db: number): number {
    return Math.max(0, Math.min(1, Math.pow(10, db / 20)));
  }

  /** dBFS → hauteur 0..1 sur une échelle en décibels (FLOOR_DB → 0 dBFS). */
  function dbToDisplay(db: number): number {
    if (!Number.isFinite(db) || db <= FLOOR_DB) return 0;
    return Math.min(1, (db - FLOOR_DB) / -FLOOR_DB);
  }

  /**
   * Les cibles du mode « spectre ». N'écrit QUE ce que le serveur a mesuré.
   *
   * Rend le nombre de bandes de la trame lue — 0 quand il n'y a rien de
   * mesuré, auquel cas toutes les barres retombent à zéro.
   *
   * ## Ce qui a été retiré, et pourquoi (#2081)
   *
   * Deux replis fabriquaient les barres quand le serveur ne fournissait pas
   * de bandes :
   *
   *  - niveaux sans spectre : la hauteur venait du seul RMS gauche/droite,
   *    multipliée par `0.85 + Math.random() * 0.3` et par un roll-off décidé
   *    à la main. Toutes les barres montaient et descendaient ensemble : ce
   *    n'était pas un spectre, c'était un VU-mètre coupé en 32 morceaux ;
   *  - aucun niveau : la hauteur venait de `getEnergyProfile()`, qui devine
   *    « grave / médium / aigu » d'après la fréquence d'échantillonnage, la
   *    profondeur et le format — les MÉTADONNÉES du fichier, jamais le son.
   *    Plus un tirage aléatoire par bande et par image.
   *
   * Ce second repli était bien dans le paquet publié 0.9.118, pas seulement
   * dans les sources. Il s'affichait notamment au démarrage d'une lecture,
   * avant la première trame de niveaux.
   *
   * On ne pouvait pas graduer ça. Un repère de fréquence posé sur une barre
   * tirée au sort ne rend pas l'affichage lisible : il rend crédible quelque
   * chose de faux. Même contrat que le mode « forme d'onde » (#2182) : sans
   * donnée, on ne dessine rien.
   */
  function spectrumTargets(levels: AudioLevels | null): number {
    for (let i = 0; i < barCount; i++) barTargets[i] = 0;
    if (!levels) return 0;

    // Préféré quand le serveur le fournit : niveau absolu par bande.
    if (levels.spectrum_db && levels.spectrum_db.length > 0) {
      // Serveur ≥ 0.9.63 : chaque bande porte son niveau ABSOLU en dBFS. Plus
      // rien à reconstituer — on mappe directement sur l'échelle d'affichage.
      const spec = levels.spectrum_db;
      for (let i = 0; i < barCount; i++) {
        const from = Math.floor((i * spec.length) / barCount);
        const to = Math.max(from + 1, Math.floor(((i + 1) * spec.length) / barCount));
        let db = -Infinity;
        for (let k = from; k < to && k < spec.length; k++) {
          db = Math.max(db, spec[k] ?? -Infinity);
        }
        barTargets[i] = dbToDisplay(db);
      }
      return spec.length;
    }

    if (levels.spectrum && levels.spectrum.length > 0) {
      const spec = levels.spectrum;
      // Le serveur renvoie une FORME normalisée trame par trame (chaque
      // trame est divisée par sa bande la plus forte, `compute_spectrum`) :
      // telle quelle, la bande dominante vaut toujours 1,0 et un pianissimo
      // dessine la même hauteur qu'un tutti. On rend l'échelle absolue en
      // pesant la forme par le niveau réel de la trame.
      const level = dbToDisplay(Math.max(levels.rms_left_db, levels.rms_right_db));
      for (let i = 0; i < barCount; i++) {
        // AGRÉGER, pas échantillonner : avec 16 barres pour 32 bandes,
        // `spec[i * 32 / 16]` jetait une bande sur deux, et un pic tombé
        // dans une bande écartée disparaissait purement et simplement.
        const from = Math.floor((i * spec.length) / barCount);
        const to = Math.max(from + 1, Math.floor(((i + 1) * spec.length) / barCount));
        let band = 0;
        for (let k = from; k < to && k < spec.length; k++) {
          band = Math.max(band, spec[k] ?? 0);
        }
        barTargets[i] = Math.min(1, band * level);
      }
      return spec.length;
    }

    // Des niveaux, mais pas de bandes (serveur antérieur à `spectrum`) : on
    // ne sait rien de la répartition en fréquence. Rien à montrer.
    return 0;
  }

  function generateTargets() {
    if (!playing) {
      for (let i = 0; i < barCount; i++) barTargets[i] = 0;
      for (let i = 0; i < WAVE_POINTS; i++) waveTargets[i] = 0;
      serverBandCount = 0;
      return;
    }
    const useReal = realLevels && (performance.now() - lastRealUpdate < 500);

    if (mode === 'spectrum') {
      const bandes = spectrumTargets(useReal ? realLevels : null);
      // Une trame en retard ne change pas l'échelle des fréquences : on garde
      // la graduation tant que la lecture dure. La remettre à zéro à chaque
      // hoquet ferait clignoter l'axe et sauter les barres de 12 px. Elle est
      // effacée à l'arrêt, dans la branche `!playing` ci-dessus.
      if (bandes > 0) serverBandCount = bandes;
    } else {
      const profile = getEnergyProfile();
      if (useReal) {
        const left = dbToLinear(realLevels!.rms_left_db);
        const right = dbToLinear(realLevels!.rms_right_db);
        const phase = performance.now() * 0.001;
        for (let i = 0; i < WAVE_POINTS; i++) {
          const x = i / WAVE_POINTS;
          const side = x < 0.5 ? left : right;
          waveTargets[i] = side * Math.sin(x * Math.PI * 4 + phase) * 0.8
            + (Math.random() - 0.5) * side * 0.15;
        }
      } else {
        const phase = performance.now() * 0.001 * profile.speed;
        for (let i = 0; i < WAVE_POINTS; i++) {
          const x = i / WAVE_POINTS;
          waveTargets[i] =
            Math.sin(x * Math.PI * 4 + phase) * profile.bass * 0.4 +
            Math.sin(x * Math.PI * 8 + phase * 1.7) * profile.mid * 0.25 +
            Math.sin(x * Math.PI * 16 + phase * 2.3) * profile.treble * 0.15 +
            (Math.random() - 0.5) * 0.08;
        }
      }
    }
  }

  function getAccent(timestamp: number): string {
    // Refresh accent color every 2 seconds
    if (canvas && timestamp - accentCacheTime > 2000) {
      accentCacheTime = timestamp;
      const style = getComputedStyle(canvas);
      cachedAccent = style.getPropertyValue('--tune-accent').trim() || '#6B6ED9';
      // Le canevas ne peut pas hériter d'une variable CSS : on la lit ici,
      // au même rythme, pour que l'échelle suive le thème comme le reste.
      cachedMuted = style.getPropertyValue('--tune-text-muted').trim() || 'rgba(255,255,255,0.4)';
    }
    return cachedAccent;
  }

  function draw(timestamp: number) {
    if (!canvas) return;

    // Throttle to ~30fps
    if (timestamp - lastFrame < FRAME_INTERVAL) {
      animId = requestAnimationFrame(draw);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    lastFrame = timestamp;

    // When not playing, clear real levels and decay to zero
    if (!playing) {
      realLevels = null;
      generateTargets();
    }

    const profile = getEnergyProfile();
    const smoothing = playing ? 0.12 * profile.speed : 0.06;
    const decayRate = playing ? 0.92 : 0.85;

    // Cadence des cibles. Quand le serveur fournit un vrai spectre (tap PCM,
    // événements cadencés sur l'horloge de lecture), on le suit à chaque
    // image : l'intervalle de 120 ms n'existe que pour espacer les tirages
    // ALÉATOIRES du mode simulé, et l'appliquer au signal réel revenait à
    // ignorer des trames déjà mesurées.
    const followingRealSpectrum =
      playing &&
      realLevels != null &&
      timestamp - lastRealUpdate < 500 &&
      (realLevels.spectrum.length > 0 || realLevels.spectrum_db.length > 0);
    if (playing && (followingRealSpectrum || timestamp - lastTargetUpdate > TARGET_INTERVAL)) {
      lastTargetUpdate = timestamp;
      generateTargets();
    }

    const w = canvas.width;
    const h = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, w, h);

    // Check if all bars are effectively zero — stop animating
    if (!playing) {
      // Les crêtes comptent aussi : s'arrêter en les laissant affichées
      // figerait des traits au-dessus de barres déjà retombées à zéro.
      const maxVal = Math.max(
        ...barValues.slice(0, barCount),
        ...peakValues.slice(0, barCount),
        ...waveValues,
      );
      if (maxVal < 0.005) {
        return;
      }
    }

    const accent = getAccent(timestamp);

    if (mode === 'spectrum') {
      drawSpectrum(ctx, w, h, dpr, accent, decayRate, timestamp);
    } else {
      drawWaveform(ctx, w, h, dpr, accent, smoothing, decayRate);
    }

    if (visible) {
      animId = requestAnimationFrame(draw);
    }
  }

  function drawSpectrum(
    ctx: CanvasRenderingContext2D,
    w: number, h: number, dpr: number,
    accent: string,
    decayRate: number, timestamp: number
  ) {
    const count = barCount;
    const gap = mini ? 1 * dpr : 2 * dpr;
    const barWidth = Math.max(2, (w - gap * (count - 1)) / count);
    const radius = mini ? 1 * dpr : 2 * dpr;

    // Les repères de fréquence. Deux conditions, toutes deux nécessaires :
    //  - pas en mode mini (24 px dans la barre de transport : aucune place) ;
    //  - des bandes RÉELLEMENT reçues à la dernière trame — pas de graduation
    //    sur un analyseur vide, et pas de graduation sur des barres inventées
    //    puisqu'il n'y en a plus.
    // `spectrumIsoTicks` rejoue l'échelle exacte du serveur et n'en garde que
    // ce qu'il sait distinguer : dans le grave, sa FFT de 2048 points ne
    // résout pas ses propres bandes, et un repère y serait à côté de la barre
    // qui s'allume. Voir ../lib/spectrumScale.ts.
    const ticks = mini ? [] : spectrumIsoTicks(sampleRate, serverBandCount);
    const axisH = ticks.length > 0 ? AXIS_H * dpr : 0;
    // Les barres ne descendent plus jusqu'au bas du canevas quand l'échelle
    // est là : elles s'arrêtent au-dessus, sinon les libellés se poseraient
    // par-dessus le signal.
    const plotH = h - axisH;

    const grad = ctx.createLinearGradient(0, plotH, 0, 0);
    grad.addColorStop(0, accent);
    grad.addColorStop(0.5, adjustAlpha(accent, 0.85));
    grad.addColorStop(1, adjustAlpha(accent, 0.5));

    for (let i = 0; i < count; i++) {
      if (playing) {
        // Attaque rapide, retombée lente : un transitoire monte franchement
        // et redescend en laissant le temps de le voir.
        const target = barTargets[i];
        barValues[i] += (target - barValues[i]) * (target > barValues[i] ? ATTACK : DECAY);
      } else {
        barValues[i] *= decayRate;
      }

      // Crête maintenue puis relâchée.
      if (barValues[i] >= peakValues[i]) {
        peakValues[i] = barValues[i];
        peakHoldUntil[i] = timestamp + PEAK_HOLD_MS;
      } else if (timestamp > peakHoldUntil[i]) {
        peakValues[i] *= PEAK_FALL;
      }

      const barH = Math.max(radius * 2, barValues[i] * plotH * 0.9);
      const x = i * (barWidth + gap);
      const y = plotH - barH;

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x, plotH);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.lineTo(x + barWidth - radius, y);
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
      ctx.lineTo(x + barWidth, plotH);
      ctx.closePath();
      ctx.fill();

      // Trait de crête, au-dessus de la barre. Discret en mode mini (barre de
      // transport), plus lisible en grand (Lecture en cours).
      if (peakValues[i] > 0.03) {
        const capH = Math.max(1, (mini ? 1 : 2) * dpr);
        const capY = Math.min(plotH - capH, plotH - peakValues[i] * plotH * 0.9);
        ctx.fillStyle = adjustAlpha(accent, mini ? 0.55 : 0.8);
        ctx.fillRect(x, capY, barWidth, capH);
      }
    }

    drawFreqAxis(ctx, w, plotH, axisH, dpr, ticks);
  }

  /**
   * L'échelle des fréquences, sous les barres (#2081).
   *
   * Reprend la façon de faire de l'égaliseur — grille ISO à l'octave, mêmes
   * libellés (`31`, `1k`, `16k`), même corps de 9 px, trait de grille discret
   * plus étiquette — pour que les deux écrans se lisent l'un contre l'autre.
   * C'était la demande : un égaliseur gradué en ISO à côté d'un spectre nu,
   * ce sont deux instruments qui parlent de la même chose sans partager
   * d'échelle.
   */
  function drawFreqAxis(
    ctx: CanvasRenderingContext2D,
    w: number, plotH: number, axisH: number,
    dpr: number,
    ticks: ReturnType<typeof spectrumIsoTicks>,
  ) {
    if (axisH <= 0 || ticks.length === 0) return;

    ctx.save();
    ctx.font = `${Math.max(8, Math.round(AXIS_FONT * dpr))}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    for (const { hz, pos } of ticks) {
      const x = pos * w;
      // Trait de grille sur toute la hauteur du tracé : c'est lui qui permet
      // de lire à quelle fréquence est une barre, l'étiquette seule ne suffit
      // pas sur 32 barres.
      ctx.strokeStyle = adjustAlpha(cachedMuted, 0.25);
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, plotH);
      ctx.stroke();

      // L'étiquette est recentrée si elle dépasserait d'un bord.
      const label = `${freqLabel(hz)}Hz`;
      const halfText = ctx.measureText(label).width / 2;
      const cx = Math.min(w - halfText, Math.max(halfText, x));
      ctx.fillStyle = cachedMuted;
      ctx.fillText(label, cx, plotH + axisH);
    }
    ctx.restore();
  }

  function drawWaveform(
    ctx: CanvasRenderingContext2D,
    w: number, h: number, dpr: number,
    accent: string,
    smoothing: number, decayRate: number
  ) {
    const midY = h / 2;
    const amplitude = h * 0.4;

    for (let i = 0; i < WAVE_POINTS; i++) {
      if (playing) {
        waveValues[i] += (waveTargets[i] - waveValues[i]) * smoothing;
      } else {
        waveValues[i] *= decayRate;
      }
    }

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, adjustAlpha(accent, 0.3));
    grad.addColorStop(0.5, adjustAlpha(accent, 0.6));
    grad.addColorStop(1, adjustAlpha(accent, 0.3));

    ctx.fillStyle = grad;
    ctx.beginPath();

    // Top wave
    for (let i = 0; i < WAVE_POINTS; i++) {
      const x = (i / (WAVE_POINTS - 1)) * w;
      const y = midY - waveValues[i] * amplitude;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        const prevX = ((i - 1) / (WAVE_POINTS - 1)) * w;
        const cpX = (prevX + x) / 2;
        ctx.quadraticCurveTo(cpX, midY - waveValues[i - 1] * amplitude, x, y);
      }
    }

    // Bottom wave (mirror, slightly smaller)
    for (let i = WAVE_POINTS - 1; i >= 0; i--) {
      const x = (i / (WAVE_POINTS - 1)) * w;
      const y = midY + waveValues[i] * amplitude * 0.8;
      if (i === WAVE_POINTS - 1) {
        ctx.lineTo(x, y);
      } else {
        const nextX = ((i + 1) / (WAVE_POINTS - 1)) * w;
        const cpX = (nextX + x) / 2;
        ctx.quadraticCurveTo(cpX, midY + waveValues[i + 1] * amplitude * 0.8, x, y);
      }
    }

    ctx.closePath();
    ctx.fill();

    // Center stroke line
    ctx.strokeStyle = accent;
    ctx.lineWidth = mini ? 1 * (window.devicePixelRatio || 1) : 1.5 * (window.devicePixelRatio || 1);
    ctx.beginPath();
    for (let i = 0; i < WAVE_POINTS; i++) {
      const x = (i / (WAVE_POINTS - 1)) * w;
      const y = midY - waveValues[i] * amplitude;
      if (i === 0) ctx.moveTo(x, y);
      else {
        const prevX = ((i - 1) / (WAVE_POINTS - 1)) * w;
        const cpX = (prevX + x) / 2;
        ctx.quadraticCurveTo(cpX, midY - waveValues[i - 1] * amplitude, x, y);
      }
    }
    ctx.stroke();
  }

  function adjustAlpha(color: string, alpha: number): string {
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    const match = color.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
    }
    return color;
  }

  function resizeCanvas() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
  }

  function startAnimation() {
    if (animId) return;
    lastFrame = performance.now();
    lastTargetUpdate = 0;
    animId = requestAnimationFrame(draw);
  }

  function stopAnimation() {
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
  }

  // Show when playing, fade-out and hide after decay
  $effect(() => {
    if (playing) {
      visible = true;
      generateTargets();
    }
  });

  $effect(() => {
    if (!playing) {
      const timeout = setTimeout(() => {
        const maxBar = Math.max(...barValues);
        const maxWave = Math.max(...waveValues.map(Math.abs));
        if (maxBar < 0.01 && maxWave < 0.01) visible = false;
      }, 2500);
      return () => clearTimeout(timeout);
    }
  });

  // Start/stop animation loop with canvas and visibility
  $effect(() => {
    if (canvas && visible) {
      resizeCanvas();
      startAnimation();
    }
    return () => stopAnimation();
  });

  onMount(() => {
    const observer = new ResizeObserver(() => resizeCanvas());
    if (canvas) observer.observe(canvas);
    return () => { observer.disconnect(); unsub(); };
  });
</script>

<div
  class="visualizer-container"
  class:mini
  class:visible
  class:playing
  style="height: {height}px"
>
  <canvas bind:this={canvas} class="visualizer-canvas"></canvas>
</div>

<style>
  .visualizer-container {
    width: 100%;
    opacity: 0;
    transition: opacity 0.5s ease-in-out;
    overflow: hidden;
    position: relative;
  }

  .visualizer-container.visible {
    opacity: 1;
  }

  .visualizer-container.visible:not(.playing) {
    opacity: 0.4;
    transition: opacity 1.2s ease-out;
  }

  .visualizer-container.mini {
    flex-shrink: 0;
  }

  .visualizer-canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
