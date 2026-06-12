<script lang="ts">
  import { onMount } from 'svelte';
  import { audioLevels, type AudioLevels } from '../lib/stores/audioLevels';

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

  function generateTargets() {
    const profile = getEnergyProfile();
    const useReal = realLevels && (performance.now() - lastRealUpdate < 500);

    if (mode === 'spectrum') {
      if (useReal) {
        const left = dbToLinear(realLevels!.rms_left_db);
        const right = dbToLinear(realLevels!.rms_right_db);
        const avg = (left + right) / 2;
        for (let i = 0; i < barCount; i++) {
          const pos = i / barCount;
          const side = pos < 0.5 ? left : right;
          const base = side * (0.6 + avg * 0.4);
          const variation = 0.85 + Math.random() * 0.3;
          const rolloff = pos < 0.25 ? 1.0 : pos < 0.6 ? 0.9 : 0.7 * (1 - (pos - 0.6));
          barTargets[i] = Math.min(1, Math.max(0.02, base * variation * rolloff));
        }
      } else {
        for (let i = 0; i < barCount; i++) {
          const pos = i / barCount;
          let energy: number;
          if (pos < 0.25) {
            energy = profile.bass * (0.5 + Math.random() * 0.5);
          } else if (pos < 0.6) {
            energy = profile.mid * (0.4 + Math.random() * 0.6);
          } else {
            energy = profile.treble * (0.3 + Math.random() * 0.5) * (1 - (pos - 0.6) * 0.8);
          }
          if (Math.random() < 0.15) energy *= 1.3;
          barTargets[i] = Math.min(1, Math.max(0.02, energy));
        }
      }
    } else {
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

    const profile = getEnergyProfile();
    const smoothing = playing ? 0.12 * profile.speed : 0.06;
    const decayRate = playing ? 0.92 : 0.85;

    // Update targets at controlled interval
    if (playing && timestamp - lastTargetUpdate > TARGET_INTERVAL) {
      lastTargetUpdate = timestamp;
      generateTargets();
    }

    const w = canvas.width;
    const h = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, w, h);

    const accent = getAccent(timestamp);

    if (mode === 'spectrum') {
      drawSpectrum(ctx, w, h, dpr, accent, smoothing, decayRate);
    } else {
      drawWaveform(ctx, w, h, dpr, accent, smoothing, decayRate);
    }

    // Keep animating while visible (bars decaying after pause)
    if (visible) {
      animId = requestAnimationFrame(draw);
    }
  }

  function drawSpectrum(
    ctx: CanvasRenderingContext2D,
    w: number, h: number, dpr: number,
    accent: string,
    smoothing: number, decayRate: number
  ) {
    const count = barCount;
    const gap = mini ? 1 * dpr : 2 * dpr;
    const barWidth = Math.max(2, (w - gap * (count - 1)) / count);
    const radius = mini ? 1 * dpr : 2 * dpr;

    const grad = ctx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, accent);
    grad.addColorStop(0.5, adjustAlpha(accent, 0.85));
    grad.addColorStop(1, adjustAlpha(accent, 0.5));

    for (let i = 0; i < count; i++) {
      if (playing) {
        barValues[i] += (barTargets[i] - barValues[i]) * smoothing;
      } else {
        barValues[i] *= decayRate;
      }

      const barH = Math.max(radius * 2, barValues[i] * h * 0.9);
      const x = i * (barWidth + gap);
      const y = h - barH;

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.lineTo(x + barWidth - radius, y);
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
      ctx.lineTo(x + barWidth, h);
      ctx.closePath();
      ctx.fill();
    }
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
