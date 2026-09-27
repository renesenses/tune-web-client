<script lang="ts">
  // Paire de VU-mètres analogiques (G/D) pour le mode Grand écran — cadrans à
  // aiguille façon appli tvOS, nourris par les niveaux RMS réels du serveur
  // (événements audio_levels). Balistique VU classique : intégration ~300 ms,
  // zone rouge réservée aux vrais −3…0 dBFS, témoin de crête.
  //
  // 🔴 27/09/2026 — LE DESSIN N'EST PLUS ICI. Il est dans
  // `lib/dessinVuMetre.ts`, avec la balistique et la durée du témoin, parce
  // que la barre de lecture affiche désormais les mêmes cadrans (demande de
  // Bertrand, maquette de Levente). Deux copies auraient divergé au premier
  // réglage : deux aiguilles qui ne bougent pas pareil sous le même signal, et
  // personne pour dire laquelle a raison.
  //
  // Ce qui reste ici, et qui appartient bien au Grand écran : DEUX cadrans
  // dans UNE toile, côte à côte, aux deux tiers de sa largeur.
  import { onMount, onDestroy } from 'svelte';
  import { audioLevels } from '../../lib/stores/audioLevels';
  import { MIN_DB, PEAK_LAMP_DBFS } from '../../lib/tvVuScale';
  import {
    avancerAiguille, cadreCadran, dessinerCadran, MAINTIEN_CRETE_MS,
    PALETTE_SOMBRE, paletteVuDepuis, type PaletteVu,
  } from '../../lib/dessinVuMetre';
  import { t } from '../../lib/i18n';

  interface Props {
    playing: boolean;
    /** Largeur totale (les deux cadrans), hauteur déduite. */
    width?: number;
    /**
     * Le Grand écran est-il en mode CLAIR ?
     *
     * 🔴 Ce drapeau ne sert pas à choisir une couleur — c'est la feuille de
     * style de `TvView` qui les porte, sur `.tv-root` et `.tv-root.light`. Il
     * sert à SAVOIR QUAND relire : la palette est lue une fois, et sans lui le
     * cadran garderait l'encre du mode précédent jusqu'à la fermeture de
     * l'écran. Basculer clair/sombre se fait depuis le panneau du Grand écran,
     * sans quitter la page.
     */
    clair?: boolean;
  }
  let { playing, width = 560, clair = false }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let animId: number | null = null;

  // Échelle du cadran : dBFS RMS, de −40 à la pleine échelle (0). Constantes,
  // graduations et courbe dans lib/tvVuScale.ts (testé unitairement) — voir
  // #439 pour l'historique des calages VU broadcast qui collaient les
  // aiguilles en butée dans le rouge.

  // État des aiguilles (balistique) et des témoins de crête.
  let needle = [MIN_DB, MIN_DB];
  /** Instant (ms) jusqu'auquel le témoin de chaque canal reste allumé.
   *
   *  🔴 Un INSTANT, et non un compte d'images : 45 images valaient 750 ms à
   *  60 Hz, 375 ms sur un écran à 120 Hz. Un témoin dont la durée dépend de
   *  l'écran n'est pas un témoin. */
  let peakUntil = [0, 0];

  /** Les couleurs du thème, lues UNE fois au montage : le Grand écran ne
   *  change pas de thème en cours de route, et `getComputedStyle` à chaque
   *  image forcerait un recalcul de style par trame. Hors de `.tune-v2`, les
   *  jetons ne résolvent pas et le repli rend le cadran d'origine. */
  let palette: PaletteVu = PALETTE_SOMBRE;

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function frame(maintenant: number) {
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
    // L'aiguille lit le RMS en dBFS, directement sur l'échelle du cadran.
    const targets = [levels.rms_left_db, levels.rms_right_db].map((db) => {
      if (!playing || db <= -95) return MIN_DB;
      return db;
    });
    const peaks = [levels.peak_left_db, levels.peak_right_db];

    for (let ch = 0; ch < 2; ch++) {
      needle[ch] = avancerAiguille(needle[ch], targets[ch], reducedMotion);
      if (playing && peaks[ch] > PEAK_LAMP_DBFS) peakUntil[ch] = maintenant + MAINTIEN_CRETE_MS;
      // 🔴 `cy` vient du CADRE de la face, et non de 42 % de la hauteur : la
      // face monte à 0,92 rayon au-dessus du centre, donc son haut passait
      // au-dessus du bord de la toile. Le défaut est le même ici que dans la
      // barre de lecture — il ne s'y voyait pas, sur un cadran de 235 px.
      // La toile ne change pas de taille : le cadran s'y pose entier.
      const rayon = (w / 2) * 0.42;
      dessinerCadran(ctx, {
        cx: w * (ch === 0 ? 0.26 : 0.74),
        cy: cadreCadran(rayon).cy,
        rayon,
        libelle: ch === 0 ? 'L' : 'R',
        db: needle[ch],
        creteAllumee: maintenant < peakUntil[ch],
        palette,
      });
    }
    animId = requestAnimationFrame(frame);
  }

  onMount(() => { animId = requestAnimationFrame(frame); });

  // La palette suit le mode de l'ÉCRAN, pas le thème de l'application : voir
  // `clair` ci-dessus et les jetons posés sur `.tv-root` dans `TvView`.
  $effect(() => {
    void clair;
    palette = paletteVuDepuis(canvas);
  });
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
