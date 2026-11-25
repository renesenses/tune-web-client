<script lang="ts">
  /**
   * UN cadran à aiguille, pour UN canal — la barre de lecture à VU-mètres
   * (Bertrand, 27/09/2026, maquette de Levente).
   *
   * 🔴 **Affichage seulement.** Rien ici ne touche à l'audio : l'instrument lit
   * `audio_levels` et le dessine. Le dire compte — un VU-mètre posé dans une
   * barre de lecture peut se lire comme un réglage de niveau.
   *
   * ## Ce qu'il ne refait pas
   *
   * - le dessin du cadran : `lib/dessinVuMetre.ts`, partagé avec le Grand
   *   écran, pour que les deux surfaces ne montrent pas deux instruments ;
   * - l'échelle et la zone rouge : `lib/tvVuScale.ts`, avec ses tests ;
   * - la cadence, la garde d'onglet caché et l'annulation au démontage :
   *   `lib/boucleImages.ts`, comme le crête-mètre et l'analyseur. Une
   *   `requestAnimationFrame` oubliée survit à l'écran qui l'a créée.
   *
   * ## Pourquoi une toile
   *
   * Un cadran, ses graduations et son aiguille redessinés trente fois par
   * seconde feraient quelques centaines de nœuds à remuer. `CreteMetre` et
   * `TvVuMeters` ont tranché de la même façon ; on ne rejoue pas ce
   * raisonnement.
   */
  import { audioLevels, suiviDeFraicheur, suiviSansMesure } from '../../lib/stores/audioLevels';
  import { currentZoneId } from '../../lib/stores/zones';
  import { t } from '../../lib/i18n';
  import { MIN_DB, PEAK_LAMP_DBFS } from '../../lib/tvVuScale';
  import {
    avancerAiguille, cadreCadran, dessinerCadran, MAINTIEN_CRETE_MS,
    PALETTE_SOMBRE, paletteVuDepuis, type PaletteVu,
  } from '../../lib/dessinVuMetre';
  import { RATIO_VU, RAYON_VU, TAILLE_VU_BARRE } from '../../lib/barreVuMetres';
  import { boucleImages } from '../../lib/boucleImages';
  import { ecartDImage } from '../../lib/balistique';
  import { tempsDeDessiner } from '../../lib/cadenceCreteMetre';
  import { cranOuDefaut } from '../../lib/cadenceAnimations';
  import { preferences } from '../../lib/stores/preferences';

  interface Props {
    /** Le canal mesuré. Décide du niveau lu ET de la lettre peinte. */
    canal: 'gauche' | 'droite';
    /** La lecture est-elle en cours ? À l'arrêt, l'aiguille retombe en butée. */
    joue?: boolean;
    /** Côté du cadran en pixels ; la hauteur en découle. */
    taille?: number;
    /**
     * Griser le cadran et dire « pas de mesure » quand la lecture tourne sans
     * niveaux (Bertrand, 25/11/2026, rc14 — radio lue en direct par un lecteur
     * UPnP). `false` par défaut : l'aperçu des Réglages passe `joue` sans
     * qu'aucune lecture ne tourne, et n'a pas à se griser.
     */
    signalerSansMesure?: boolean;
  }
  let { canal, joue = true, taille = TAILLE_VU_BARRE, signalerSansMesure = false }: Props = $props();

  /**
   * La lecture tourne et AUCUNE trame n'arrive : le lecteur lit le flux en
   * direct, Tune ne voit pas le signal. Réactif, mais écrit seulement quand il
   * CHANGE — la boucle le calcule à chaque image.
   */
  let pasDeMesure = $state(false);
  const suiviMesure = suiviSansMesure();

  let toile = $state<HTMLCanvasElement | null>(null);

  /**
   * LES COULEURS DU THÈME — Bertrand, 27/09/2026 : en clair, le cadran avait
   * disparu.
   *
   * ⚠️ HORS `$state`, et relue seulement quand le thème change. Une toile
   * n'hérite d'aucune couleur : il faut aller la lire, et `getComputedStyle`
   * force un recalcul de style. Trente lectures par seconde et par cadran, sur
   * une barre qui est TOUJOURS à l'écran, coûteraient plus cher que tout le
   * reste du dessin.
   */
  let palette: PaletteVu = PALETTE_SOMBRE;

  // État de balistique, HORS `$state` : lu et écrit à chaque image par la
  // boucle, le rendre réactif relancerait le rendu de Svelte pour rien.
  let aiguille = MIN_DB;
  /** Instant (ms) de l'image précédente : la balistique se compte en temps (fil 3025). */
  let imagePrecedente: number | null = null;
  /** Instant (ms) jusqu'auquel le témoin de crête reste allumé. */
  let creteJusqua = 0;
  // #1791 (suite de tune-server-rust#5104) — sans trame depuis
  // `FRAICHEUR_TRAME_MS`, l'aiguille retombe en butée comme à l'arrêt.
  const fraicheur = suiviDeFraicheur();

  /** La hauteur vient du CADRE de la face (`RATIO_VU` en est déduit), jamais
   *  d'une cote recopiée d'une autre surface. */
  const hauteur = $derived(Math.round(taille * RATIO_VU));

  const mouvementReduit =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  /**
   * L'aiguille est-elle retombée, et le témoin éteint ?
   *
   * Sans cette question, la boucle redessinerait un cadran immobile trente
   * fois par seconde tant que la barre est à l'écran — c'est-à-dire toujours.
   * C'est exactement le défaut mesuré par Levente sur « Lecture en cours »
   * (#1256), et il serait ici permanent.
   */
  function auRepos(maintenant: number): boolean {
    return !joue && aiguille <= MIN_DB + 0.05 && maintenant >= creteJusqua;
  }

  function dessiner(ctx: CanvasRenderingContext2D, l: number, h: number, maintenant: number) {
    ctx.clearRect(0, 0, l, h);

    const niv = $audioLevels;
    const rms = canal === 'gauche' ? niv.rms_left_db : niv.rms_right_db;
    const crete = canal === 'gauche' ? niv.peak_left_db : niv.peak_right_db;
    // −95 dBFS et moins : le serveur annonce le silence, pas un niveau. Le
    // repli est la butée basse, jamais une aiguille qui flotte.
    const vivant = fraicheur(niv, maintenant) && joue;
    const absent = signalerSansMesure && suiviMesure(niv, joue, maintenant, $currentZoneId);
    if (absent !== pasDeMesure) pasDeMesure = absent;
    const cible = !vivant || rms <= -95 ? MIN_DB : rms;

    aiguille = avancerAiguille(aiguille, cible, mouvementReduit, ecartDImage(imagePrecedente, maintenant));
    imagePrecedente = maintenant;
    if (vivant && crete > PEAK_LAMP_DBFS) creteJusqua = maintenant + MAINTIEN_CRETE_MS;

    // 🔴 `cy` vient du CADRE, pas d'une fraction de la hauteur. La face monte à
    // 0,92 rayon au-dessus du centre : à 42 % de la hauteur, son haut passait
    // au-dessus du bord de la toile et il restait du vide en bas. C'est ce que
    // Bertrand a vu sur le .18 — « mal centrés… en hauteur ! ».
    dessinerCadran(ctx, {
      cx: l / 2,
      cy: cadreCadran(l * RAYON_VU).cy,
      rayon: l * RAYON_VU,
      libelle: canal === 'gauche' ? 'L' : 'R',
      db: aiguille,
      creteAllumee: maintenant < creteJusqua,
      palette,
    });
  }

  // La cadence vient des Réglages (#1256) : elle est LUE DANS l'effet, donc
  // changer le réglage démonte la boucle et la remonte, sans rechargement.
  // Elle est passée à `boucleImages` comme SA règle de rythme : deux
  // cadenceurs en série qui ne tombent pas d'accord font disparaître une image
  // sur deux.
  $effect(() => {
    const c = toile;
    const enLecture = joue;
    const cran = cranOuDefaut($preferences.cadenceAnimations);
    // 🔴 Le thème est une DÉPENDANCE de cet effet : en changer démonte la
    // boucle et la remonte, ce qui relit la palette. Sans cette ligne, le
    // cadran garderait les couleurs du thème précédent jusqu'au prochain
    // rechargement de la page.
    void $preferences.v2Theme;
    const cote = taille;
    const haut = hauteur;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    palette = paletteVuDepuis(c);
    void enLecture;
    return boucleImages((maintenant) => {
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      if (c.width !== Math.round(cote * dpr) || c.height !== Math.round(haut * dpr)) {
        c.width = Math.round(cote * dpr);
        c.height = Math.round(haut * dpr);
      }
      // 🔴 La mise à l'échelle passe par la transformation : le dessin
      // travaille en pixels CSS. C'est aussi pourquoi `dessinerCadran` ne
      // prend plus de `dpr` — il tire tout du rayon, et multiplier une
      // seconde fois faisait de l'aiguille un trait gras sur écran Retina.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (auRepos(maintenant)) {
        aiguille = MIN_DB;
        // La boucle se gare : à la reprise, la première image ne doit pas
        // compter tout le temps passé à l'arrêt.
        imagePrecedente = null;
        dessiner(ctx, cote, haut, maintenant);
        return false;
      }
      dessiner(ctx, cote, haut, maintenant);
      return true;
    }, { rythme: (maintenant, dernier) => tempsDeDessiner(maintenant, dernier, cran) });
  });
</script>

<!-- Décoratif : ce que le cadran montre s'entend. Un lecteur d'écran n'a rien
     à faire d'une aiguille, et `CreteMetre` a tranché pareil. -->
<!-- 🔴 « Pas de mesure » ne change RIEN à la mise en page : même boîte, même
     taille ; la mention se pose PAR-DESSUS la toile. Un cadran qui disparaît
     ou qui rétrécit ferait sauter toute la barre de lecture. -->
<span
  class="vu"
  class:sans-mesure={pasDeMesure}
  style="width:{taille}px;height:{hauteur}px"
  title={pasDeMesure ? $t('transport.vuNoMeasureHint') : undefined}
>
  <canvas
    class="vu-toile"
    bind:this={toile}
    style="width:{taille}px;height:{hauteur}px"
    aria-hidden="true"
  ></canvas>
  {#if pasDeMesure}<span class="vu-mention">{$t('transport.vuNoMeasure')}</span>{/if}
</span>

<style>
  .vu { display: block; flex: 0 0 auto; position: relative; }
  .vu-toile { display: block; }
  .sans-mesure .vu-toile { opacity: 0.35; filter: grayscale(1); }
  .vu-mention {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 2px;
    text-align: center;
    font-size: calc(10px * var(--v2-txt-echelle, 1));
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--tune-text-secondary);
    pointer-events: none;
  }
</style>
