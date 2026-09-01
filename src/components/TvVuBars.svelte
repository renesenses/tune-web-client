<script lang="ts">
  // Bargraphe stéréo du mode Grand écran (#2514) — second instrument, à côté
  // des cadrans à aiguille. Nourri par les MÊMES événements `audio_levels` du
  // serveur : rien à ajouter côté serveur, il publie déjà crêtes et moyennes
  // gauche/droite.
  //
  // ⚠ Ce que la barre affiche est du dBFS. Le serveur ne publie aucune mesure
  // de sonie temps réel : ni R128, ni LUFS, ni échelle +9/+18. Voir
  // lib/tvBarScale.ts.
  //
  // Trois des quatre fonctions demandées sont servies ici : la moyenne (le
  // remplissage), la crête (le repère et le témoin), l'échelle commutable (la
  // plage). La quatrième, « amplitude dynamique », est restée sans définition
  // de la part du demandeur : on ne la devine pas, et rien ici n'en prétend une.
  import { onMount, onDestroy } from 'svelte';
  import { audioLevels } from '../lib/stores/audioLevels';
  import { RED_FROM_DB, PEAK_LAMP_DBFS } from '../lib/tvVuScale';
  import {
    BAR_SCALES,
    barFraction,
    redFraction,
    barScaleLabel,
    type BarScaleId,
  } from '../lib/tvBarScale';
  import { t } from '../lib/i18n';

  interface Props {
    playing: boolean;
    /** Identifiant d'échelle ; la plage dessinée en découle entièrement. */
    scale?: BarScaleId;
    /** Largeur totale, hauteur déduite. */
    width?: number;
  }
  let { playing, scale = 'wide', width = 560 }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let animId: number | null = null;

  // Balistique : le remplissage suit la moyenne (montée franche, retombée
  // douce), le repère de crête tombe lentement puis se réarme. Les mêmes
  // constantes que le cadran, pour que les deux instruments racontent la même
  // chose du même son.
  let fill = [-96, -96];
  let peakMark = [-96, -96];
  let peakHold = [0, 0];

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const IVORY = 'rgba(237,233,224,';
  const RED = 'rgba(224,82,82,';
  const AMBER = 'rgba(242,180,65,';

  function drawBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    rmsDb: number,
    peakDb: number,
    peakLit: boolean,
    dpr: number,
  ) {
    const s = BAR_SCALES[scale];
    const r = h / 2;

    // Rail
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.stroke();

    // Remplissage = MOYENNE (RMS). Ivoire jusqu'au seuil rouge, rouge au-delà.
    const f = barFraction(rmsDb, s);
    const redX = x + redFraction(s) * w;
    if (f > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.clip();
      const end = x + f * w;
      ctx.fillStyle = `${IVORY}0.72)`;
      ctx.fillRect(x, y, Math.min(end, redX) - x, h);
      if (end > redX) {
        ctx.fillStyle = `${RED}0.9)`;
        ctx.fillRect(redX, y, end - redX, h);
      }
      ctx.restore();
    }

    // Repère de CRÊTE : un trait fin, distinct du remplissage. C'est la crête
    // qui dit l'écrêtage, pas la moyenne — les confondre était l'erreur du
    // cadran d'origine.
    const pf = barFraction(peakDb, s);
    if (pf > 0) {
      const px = x + pf * w;
      ctx.strokeStyle = peakDb >= RED_FROM_DB ? `${RED}1)` : `${AMBER}0.95)`;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(px, y + 1 * dpr);
      ctx.lineTo(px, y + h - 1 * dpr);
      ctx.stroke();
    }

    // Libellé de canal, à gauche du rail
    ctx.fillStyle = `${AMBER}0.85)`;
    ctx.font = `600 ${Math.round(12 * dpr)}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x - 8 * dpr, y + h / 2);

    // Témoin de crête, à droite : même seuil que le cadran.
    ctx.beginPath();
    ctx.arc(x + w + 12 * dpr, y + h / 2, 4 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = peakLit ? `${RED}1)` : `${RED}0.18)`;
    ctx.fill();
  }

  function drawScale(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    dpr: number,
  ) {
    const s = BAR_SCALES[scale];
    ctx.font = `${Math.round(9 * dpr)}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const tick of s.ticks) {
      const tx = x + barFraction(tick, s) * w;
      ctx.strokeStyle = tick >= RED_FROM_DB ? `${RED}0.9)` : `${IVORY}0.45)`;
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(tx, y);
      ctx.lineTo(tx, y + 4 * dpr);
      ctx.stroke();
      ctx.fillStyle = tick >= RED_FROM_DB ? `${RED}0.85)` : `${IVORY}0.5)`;
      ctx.fillText(String(tick), tx, y + 6 * dpr);
    }
    // L'unité est écrite en toutes lettres sur l'instrument : dBFS, pas « dB »
    // tout court, pour qu'on ne la prenne pas pour une mesure de sonie.
    ctx.textAlign = 'left';
    ctx.fillStyle = `${IVORY}0.5)`;
    ctx.fillText('dBFS', x + w + 2 * dpr, y + 6 * dpr);
  }

  function frame() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || width;
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssW * 0.22 * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.clearRect(0, 0, w, h);

    const s = BAR_SCALES[scale];
    const levels = $audioLevels;
    // Moyennes et crêtes, telles que le serveur les publie. Le silence (ou une
    // lecture à l'arrêt) redescend au bas de l'échelle plutôt que de figer la
    // dernière image.
    const floor = s.minDb;
    const rms = [levels.rms_left_db, levels.rms_right_db].map((db) =>
      !playing || db <= -95 ? floor : db,
    );
    const peaks = [levels.peak_left_db, levels.peak_right_db].map((db) =>
      !playing || db <= -95 ? floor : db,
    );

    const left = Math.round(26 * dpr);
    const right = Math.round(46 * dpr);
    const barW = w - left - right;
    const barH = Math.round(h * 0.2);
    const gap = Math.round(h * 0.1);
    const top = Math.round(h * 0.1);

    for (let ch = 0; ch < 2; ch++) {
      const k = reducedMotion ? 1 : rms[ch] > fill[ch] ? 0.3 : 0.09;
      fill[ch] += (rms[ch] - fill[ch]) * k;
      // Le repère de crête retient la valeur puis redescend doucement.
      if (peaks[ch] >= peakMark[ch]) peakMark[ch] = peaks[ch];
      else peakMark[ch] = Math.max(floor, peakMark[ch] - 0.35);
      if (playing && peaks[ch] > PEAK_LAMP_DBFS) peakHold[ch] = 45;
      else if (peakHold[ch] > 0) peakHold[ch]--;

      drawBar(
        ctx,
        left,
        top + ch * (barH + gap),
        barW,
        barH,
        ch === 0 ? 'L' : 'R',
        fill[ch],
        peakMark[ch],
        peakHold[ch] > 0,
        dpr,
      );
    }

    drawScale(ctx, left, top + 2 * (barH + gap) - gap + 4 * dpr, barW, dpr);
    animId = requestAnimationFrame(frame);
  }

  onMount(() => { animId = requestAnimationFrame(frame); });
  onDestroy(() => { if (animId !== null) cancelAnimationFrame(animId); });
</script>

<canvas
  bind:this={canvas}
  class="tv-bars"
  style="max-width: {width}px;"
  aria-label={`${$t('tv.stereoVuBars' as any)} — ${barScaleLabel(BAR_SCALES[scale])}`}
></canvas>

<style>
  .tv-bars {
    display: block;
    width: 100%;
    aspect-ratio: 100 / 22;
  }
</style>
