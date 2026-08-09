<script lang="ts">
  // Paire de VU-mètres analogiques (G/D) pour le mode Grand écran — cadrans à
  // aiguille façon appli tvOS, nourris par les niveaux RMS réels du serveur
  // (événements audio_levels). Balistique VU classique : intégration ~300 ms,
  // zone rouge au-dessus de 0 VU, témoin de crête.
  import { onMount, onDestroy } from 'svelte';
  import { audioLevels } from '../lib/stores/audioLevels';
  import { t } from '../lib/i18n';

  interface Props {
    playing: boolean;
    /** Largeur totale (les deux cadrans), hauteur déduite. */
    width?: number;
  }
  let { playing, width = 560 }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let animId: number | null = null;

  // 0 VU est calé sur -14 dBFS (calage usuel des VU numériques) : la zone
  // rouge s'allume sur les passages réellement forts, pas en permanence.
  const ZERO_VU_DBFS = -14;
  const MIN_VU = -20; // graduation basse du cadran
  const MAX_VU = 3;   // graduation haute
  const TICKS = [-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3];

  // Position angulaire d'une valeur VU sur l'arc (gauche → droite).
  const SPAN = Math.PI * 0.66; // ~120°
  function vuToAngle(vu: number): number {
    const t = (Math.min(MAX_VU, Math.max(MIN_VU, vu)) - MIN_VU) / (MAX_VU - MIN_VU);
    // Échelle légèrement logarithmique comme un vrai cadran (resserrée à gauche).
    const warped = Math.pow(t, 0.75);
    return -SPAN / 2 + warped * SPAN;
  }

  // État des aiguilles (balistique) et des témoins de crête.
  let needle = [MIN_VU, MIN_VU];
  let peakHold = [0, 0]; // frames restantes d'allumage du témoin

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function drawDial(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    label: string,
    vu: number,
    peakLit: boolean,
    dpr: number,
  ) {
    // Fond du cadran
    ctx.save();
    ctx.translate(cx, cy);

    const faceR = radius;
    const arcR = radius * 0.82;

    // Face
    const grad = ctx.createLinearGradient(0, -faceR, 0, faceR * 0.4);
    grad.addColorStop(0, 'rgba(255,255,255,0.055)');
    grad.addColorStop(1, 'rgba(255,255,255,0.015)');
    ctx.fillStyle = grad;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.roundRect(-faceR, -faceR * 0.92, faceR * 2, faceR * 1.55, 10 * dpr);
    ctx.fill();
    ctx.stroke();

    // Arc gradué : partie « saine » ivoire, partie > 0 VU rouge
    const a0 = -Math.PI / 2 + vuToAngle(MIN_VU);
    const aZero = -Math.PI / 2 + vuToAngle(0);
    const a1 = -Math.PI / 2 + vuToAngle(MAX_VU);
    ctx.lineWidth = 2.4 * dpr;
    ctx.strokeStyle = 'rgba(237,233,224,0.75)';
    ctx.beginPath();
    ctx.arc(0, faceR * 0.42, arcR, a0, aZero);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(224,82,82,0.95)';
    ctx.beginPath();
    ctx.arc(0, faceR * 0.42, arcR, aZero, a1);
    ctx.stroke();

    // Graduations + chiffres
    ctx.font = `${Math.round(9 * dpr)}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const tick of TICKS) {
      const a = -Math.PI / 2 + vuToAngle(tick);
      const inner = arcR - 6 * dpr;
      const outer = arcR + (tick === 0 ? 7 : 4) * dpr;
      ctx.strokeStyle = tick >= 0 ? 'rgba(224,82,82,0.95)' : 'rgba(237,233,224,0.7)';
      ctx.lineWidth = (tick === 0 ? 2.2 : 1.2) * dpr;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, faceR * 0.42 + Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, faceR * 0.42 + Math.sin(a) * outer);
      ctx.stroke();
      if ([-20, -10, -7, -5, -3, 0, 3].includes(tick)) {
        const tr = arcR + 13 * dpr;
        ctx.fillStyle = tick >= 0 ? 'rgba(224,82,82,0.9)' : 'rgba(237,233,224,0.6)';
        ctx.fillText(String(Math.abs(tick)), Math.cos(a) * tr, faceR * 0.42 + Math.sin(a) * tr);
      }
    }

    // Libellés
    ctx.fillStyle = 'rgba(237,233,224,0.5)';
    ctx.font = `600 ${Math.round(11 * dpr)}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
    ctx.fillText('VU', 0, faceR * 0.06);
    ctx.font = `600 ${Math.round(12 * dpr)}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
    ctx.fillStyle = 'rgba(242,180,65,0.85)';
    ctx.fillText(label, 0, faceR * 0.5);

    // Témoin de crête
    ctx.beginPath();
    ctx.arc(faceR * 0.72, -faceR * 0.6, 4.5 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = peakLit ? 'rgba(224,82,82,1)' : 'rgba(224,82,82,0.18)';
    ctx.fill();
    if (peakLit) {
      ctx.shadowColor = 'rgba(224,82,82,0.9)';
      ctx.shadowBlur = 8 * dpr;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Aiguille
    const na = -Math.PI / 2 + vuToAngle(vu);
    const pivotY = faceR * 0.42;
    ctx.strokeStyle = '#f2b441';
    ctx.lineWidth = 2.2 * dpr;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(242,180,65,0.45)';
    ctx.shadowBlur = 6 * dpr;
    ctx.beginPath();
    ctx.moveTo(Math.cos(na) * (arcR * 0.12), pivotY + Math.sin(na) * (arcR * 0.12));
    ctx.lineTo(Math.cos(na) * (arcR - 3 * dpr), pivotY + Math.sin(na) * (arcR - 3 * dpr));
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Pivot
    ctx.beginPath();
    ctx.arc(0, pivotY, 5 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(237,233,224,0.85)';
    ctx.fill();

    ctx.restore();
  }

  function frame() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || width;
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssW * 0.34 * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.clearRect(0, 0, w, h);

    const levels = $audioLevels;
    const targets = [levels.rms_left_db, levels.rms_right_db].map((db) => {
      if (!playing || db <= -95) return MIN_VU;
      return db - ZERO_VU_DBFS; // dBFS → VU
    });
    const peaks = [levels.peak_left_db, levels.peak_right_db];

    for (let ch = 0; ch < 2; ch++) {
      // Balistique : montée rapide, retombée douce (~300 ms).
      const k = reducedMotion ? 1 : targets[ch] > needle[ch] ? 0.25 : 0.08;
      needle[ch] += (targets[ch] - needle[ch]) * k;
      if (playing && peaks[ch] > ZERO_VU_DBFS + 1) peakHold[ch] = 45;
      else if (peakHold[ch] > 0) peakHold[ch]--;
      const dialR = (w / 2) * 0.42;
      drawDial(
        ctx,
        w * (ch === 0 ? 0.26 : 0.74),
        h * 0.42,
        dialR,
        ch === 0 ? 'L' : 'R',
        needle[ch],
        peakHold[ch] > 0,
        dpr,
      );
    }
    animId = requestAnimationFrame(frame);
  }

  onMount(() => { animId = requestAnimationFrame(frame); });
  onDestroy(() => { if (animId !== null) cancelAnimationFrame(animId); });
</script>

<canvas bind:this={canvas} class="tv-vu" style="max-width: {width}px;" aria-label={$t('tv.stereoVuMeters')}></canvas>

<style>
  .tv-vu {
    display: block;
    width: 100%;
    aspect-ratio: 100 / 34;
  }
</style>
