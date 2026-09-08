<script lang="ts">
  /**
   * Les crête-mètres — #452, spécifiés par Xavijol le 14/08/2026.
   *
   * 🔴 **Affichage seulement.** Rien ici ne touche à l'audio : l'instrument lit
   * `audio_levels` et le dessine. Le dire compte — un « peakmètre » posé dans
   * les Réglages peut se lire comme un limiteur.
   *
   * Trois visuels, un modèle commun (`lib/peakMetre.ts`) qui porte les seuils,
   * la balistique et l'échelle. Le dessin ne décide de rien : il colorie ce
   * que le modèle a calculé, et c'est le modèle que les tests interrogent.
   *
   * ## Pourquoi une toile plutôt que du DOM
   *
   * Soixante rafraîchissements par seconde sur deux barres segmentées font
   * quelques centaines de nœuds à remuer. `TvVuMeters` a tranché de la même
   * façon pour les cadrans du Grand écran ; on ne rejoue pas ce raisonnement.
   */
  import { audioLevels } from '../lib/stores/audioLevels';
  import {
    BAR_RELEASE, PLANCHER_DB, PPM_HOLD_MS,
    fractionDe, suivreLaCrete, suivrePpm, surcharge, zoneIec,
    type EtatPpm, type StyleCreteMetre,
  } from '../lib/peakMetre';

  interface Props {
    style: StyleCreteMetre;
    /** Hauteur en pixels. La barre de lecture en veut peu, la fiche davantage. */
    hauteur?: number;
    /** Largeur en pixels ; `0` = s'étire sur son conteneur. */
    largeur?: number;
    /** La lecture est-elle en cours ? À l'arrêt, tout retombe au plancher. */
    joue?: boolean;
  }

  let { style, hauteur = 18, largeur = 0, joue = true }: Props = $props();

  let toile = $state<HTMLCanvasElement | null>(null);

  // État de balistique, HORS `$state` : il est lu et écrit soixante fois par
  // seconde par la boucle d'animation, et le rendre réactif relancerait le
  // rendu de Svelte à chaque image pour rien.
  let barres = [PLANCHER_DB, PLANCHER_DB];
  let ppm: EtatPpm[] = [{ db: null, depuisMs: 0 }, { db: null, depuisMs: 0 }];

  const COULEURS = {
    fond: 'rgba(255,255,255,0.06)',
    vert: '#4ade80',
    ambre: '#fbbf24',
    rouge: '#ef4444',
    ppm: 'rgba(255,255,255,0.85)',
    eteint: 'rgba(255,255,255,0.12)',
  };

  function couleurSegment(db: number): string {
    if (style === 'iec') {
      const z = zoneIec(db);
      return z === 'rouge' ? COULEURS.rouge : z === 'ambre' ? COULEURS.ambre : COULEURS.vert;
    }
    // DAT : la barre reste neutre, seuls les témoins OVER parlent. C'est le
    // parti de l'instrument d'origine — un VFD ne change pas de couleur.
    return COULEURS.vert;
  }

  function dessiner(ctx: CanvasRenderingContext2D, l: number, h: number) {
    ctx.clearRect(0, 0, l, h);
    if (style === 'off') return;

    const niv = $audioLevels;
    const cretes = joue ? [niv.peak_left_db, niv.peak_right_db] : [PLANCHER_DB, PLANCHER_DB];
    const maintenant = performance.now();

    for (let ch = 0; ch < 2; ch++) {
      barres[ch] = suivreLaCrete(barres[ch], cretes[ch], BAR_RELEASE);
      ppm[ch] = joue
        ? suivrePpm(ppm[ch], cretes[ch], maintenant, PPM_HOLD_MS)
        : { db: null, depuisMs: 0 };
    }

    if (style === 'lamps') return dessinerLampes(ctx, l, h, cretes);
    dessinerBargraphe(ctx, l, h);
  }

  /** Deux témoins compacts — le seul visuel que la barre de lecture accepte. */
  function dessinerLampes(ctx: CanvasRenderingContext2D, l: number, h: number, cretes: number[]) {
    const r = Math.min(h / 2 - 1, 5);
    const ecart = r * 2 + 4;
    for (let ch = 0; ch < 2; ch++) {
      const etat = joue ? surcharge(cretes[ch]) : 'aucune';
      ctx.beginPath();
      ctx.arc(r + 1, h / 2 - ecart / 2 + ch * ecart, r, 0, Math.PI * 2);
      ctx.fillStyle =
        etat === 'rouge' ? COULEURS.rouge : etat === 'ambre' ? COULEURS.ambre : COULEURS.eteint;
      ctx.fill();
    }
    // Une barre de niveau minuscule à droite du témoin : sans elle, deux
    // pastilles éteintes ne disent pas si quelque chose joue.
    const x0 = r * 2 + 6;
    const large = Math.max(0, l - x0);
    for (let ch = 0; ch < 2; ch++) {
      const y = h / 2 - ecart / 2 + ch * ecart - 1.5;
      ctx.fillStyle = COULEURS.fond;
      ctx.fillRect(x0, y, large, 3);
      ctx.fillStyle = COULEURS.vert;
      ctx.fillRect(x0, y, large * fractionDe(barres[ch]), 3);
    }
  }

  /** DAT PCM-7030 et IEC 268-18 : même format horizontal, échelles distinctes. */
  function dessinerBargraphe(ctx: CanvasRenderingContext2D, l: number, h: number) {
    const largeurOver = 26;
    const utile = Math.max(0, l - largeurOver - 6);
    const hb = Math.max(3, (h - 6) / 2);

    for (let ch = 0; ch < 2; ch++) {
      const y = ch * (hb + 4) + 2;
      ctx.fillStyle = COULEURS.fond;
      ctx.fillRect(0, y, utile, hb);

      // Segments de 1 dB : c'est un bargraphe, pas un dégradé — on doit
      // pouvoir COMPTER les décibels.
      const n = Math.round(fractionDe(barres[ch]) * 60);
      const pas = utile / 60;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = couleurSegment(PLANCHER_DB + i + 1);
        ctx.fillRect(i * pas, y, Math.max(1, pas - 1), hb);
      }

      // Le trait PPM, qui tient 1,2 s.
      if (ppm[ch].db !== null) {
        const x = fractionDe(ppm[ch].db as number) * utile;
        ctx.fillStyle = COULEURS.ppm;
        ctx.fillRect(Math.min(utile - 1, x), y, 1.5, hb);
      }

      // OVER à droite, comme sur l'appareil d'origine.
      const etat = joue ? surcharge($audioLevels[ch === 0 ? 'peak_left_db' : 'peak_right_db']) : 'aucune';
      ctx.fillStyle =
        etat === 'rouge' ? COULEURS.rouge : etat === 'ambre' ? COULEURS.ambre : COULEURS.eteint;
      ctx.fillRect(utile + 6, y, largeurOver, hb);
    }
  }

  $effect(() => {
    const c = toile;
    if (!c || style === 'off') return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const battre = () => {
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const l = largeur || c.clientWidth || 120;
      if (c.width !== Math.round(l * dpr) || c.height !== Math.round(hauteur * dpr)) {
        c.width = Math.round(l * dpr);
        c.height = Math.round(hauteur * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dessiner(ctx, l, hauteur);
      raf = requestAnimationFrame(battre);
    };
    raf = requestAnimationFrame(battre);
    return () => cancelAnimationFrame(raf);
  });
</script>

{#if style !== 'off'}
  <canvas
    class="crete"
    bind:this={toile}
    style={largeur ? `width:${largeur}px;height:${hauteur}px` : `height:${hauteur}px`}
    aria-hidden="true"
  ></canvas>
{/if}

<style>
  .crete { display: block; width: 100%; }
</style>
