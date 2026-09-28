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
  import { audioLevels } from '../../lib/stores/audioLevels';
  import {
    BAR_RELEASE, PLANCHER_DB, PPM_HOLD_MS,
    ECART_LIBELLE_PX, LIBELLES_CANAUX, policeLibelleCanal,
    PALETTE_CRETE_SOMBRE, paletteCreteDepuis,
    fractionDe, suivreLaCrete, suivrePpm, surcharge, zoneIec,
    type EtatPpm, type StyleCreteMetre,
  } from '../../lib/peakMetre';
  import { retombeAuRepos, tempsDeDessiner } from '../../lib/cadenceCreteMetre';
  import { boucleImages } from '../../lib/boucleImages';
  // #1256 — la cadence est un RÉGLAGE depuis le 23/09/2026. Le cran par défaut
  // (`fluide`) rend exactement les 30 i/s livrés : rien ne bouge pour qui n'a
  // rien demandé.
  import { cranOuDefaut } from '../../lib/cadenceAnimations';
  import { preferences } from '../../lib/stores/preferences';

  interface Props {
    style: StyleCreteMetre;
    /** Hauteur en pixels. La barre de lecture en veut peu, la fiche davantage. */
    hauteur?: number;
    /** Largeur en pixels ; `0` = s'étire sur son conteneur. */
    largeur?: number;
    /** La lecture est-elle en cours ? À l'arrêt, tout retombe au plancher. */
    joue?: boolean;
    /**
     * Écrire `L` et `R` en face des deux voies — Bertrand, 28/09/2026.
     *
     * Le défaut est `false` : la barre de lecture n'a pas la largeur de deux
     * lettres de plus, et l'aperçu des Réglages n'a pas à les montrer. Seule
     * la fiche « Lecture en cours » les demande. Les lettres NE se traduisent
     * PAS — voir `LIBELLES_CANAUX`.
     */
    libelles?: boolean;
  }

  let { style, hauteur = 18, largeur = 0, joue = true, libelles = false }: Props = $props();

  let toile = $state<HTMLCanvasElement | null>(null);

  // État de balistique, HORS `$state` : il est lu et écrit soixante fois par
  // seconde par la boucle d'animation, et le rendre réactif relancerait le
  // rendu de Svelte à chaque image pour rien.
  let barres = [PLANCHER_DB, PLANCHER_DB];
  let ppm: EtatPpm[] = [{ db: null, depuisMs: 0 }, { db: null, depuisMs: 0 }];

  /**
   * LES COULEURS VIENNENT DU THÈME — audit du 27/09/2026.
   *
   * 🔴 Elles étaient écrites ici, pour un fond noir. Sur les deux thèmes
   * clairs, il ne restait de l'instrument QUE les barres : le rail (blanc à
   * 6 %), le trait de crête (blanc à 85 %) et l'état ÉTEINT des lampes (blanc
   * à 12 %) sont invisibles sur du blanc — et « éteint » est l'état normal
   * d'une lampe. Les deux témoins de la barre de lecture n'existaient donc
   * pas en thème clair.
   *
   * Hors `$state` : lues au montage et à chaque changement de thème, jamais à
   * chaque image — `getComputedStyle` force un recalcul de style.
   */
  let COULEURS = PALETTE_CRETE_SOMBRE;

  /**
   * LA GÉOMÉTRIE DES DEUX VOIES, EN UN SEUL ENDROIT.
   *
   * 🔴 Le libellé doit tomber EXACTEMENT en face de sa barre, et la seule
   * façon de le garantir est que les deux lisent la MÊME fonction. Deux
   * formules recopiées qui se ressemblent aujourd'hui finissent par diverger :
   * c'est précisément comme ça que le cadran du Grand écran s'est retrouvé mal
   * cadré en hauteur le 27/09 — une cote prise sur une surface où l'écart ne
   * se voyait pas.
   *
   * Les deux visuels ne posent pas leurs voies au même endroit : les lampes
   * sont centrées sur la hauteur, le bargraphe part du haut. La fonction
   * répond pour les deux, et rend le CENTRE de la voie — le seul point dont
   * le texte a besoin.
   */
  function centreDeLaVoie(ch: number, h: number): number {
    if (style === 'lamps') {
      const r = Math.min(h / 2 - 1, 5);
      const ecart = r * 2 + 4;
      return h / 2 - ecart / 2 + ch * ecart;
    }
    const hb = Math.max(3, (h - 6) / 2);
    return ch * (hb + 4) + 2 + hb / 2;
  }

  /**
   * La largeur que le texte réclame à gauche — MESURÉE, jamais devinée.
   *
   * `measureText` parce qu'une largeur en dur serait juste pour `L`/`R` et
   * fausse le jour où ces lettres changent. L'instrument est décalé d'autant
   * et perd cette largeur : il ne s'écrit jamais dessus.
   */
  function gouttiereDesLibelles(ctx: CanvasRenderingContext2D, h: number): number {
    if (!libelles) return 0;
    ctx.font = policeDesLibelles(h);
    const large = Math.max(...LIBELLES_CANAUX.map((texte) => ctx.measureText(texte).width));
    return Math.ceil(large) + ECART_LIBELLE_PX;
  }

  function policeDesLibelles(h: number): string {
    return `600 ${policeLibelleCanal(h)}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  }

  /** `L` et `R`, chacun centré sur sa voie. Rien d'autre ne les place. */
  function dessinerLibelles(ctx: CanvasRenderingContext2D, h: number) {
    ctx.font = policeDesLibelles(h);
    ctx.fillStyle = COULEURS.libelle;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let ch = 0; ch < 2; ch++) {
      ctx.fillText(LIBELLES_CANAUX[ch], 0, centreDeLaVoie(ch, h));
    }
    // Les réglages de texte ne fuient pas vers le reste du dessin : la toile
    // est partagée avec les barres, qui n'en veulent pas.
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

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
    const overs = joue ? [niv.over_left, niv.over_right] : [false, false];
    const maintenant = performance.now();

    for (let ch = 0; ch < 2; ch++) {
      barres[ch] = suivreLaCrete(barres[ch], cretes[ch], BAR_RELEASE);
      ppm[ch] = joue
        ? suivrePpm(ppm[ch], cretes[ch], maintenant, PPM_HOLD_MS)
        : { db: null, depuisMs: 0 };
    }

    // La gouttière d'abord : tout le reste du dessin part de là. `translate`
    // plutôt qu'un `x0` promené de fonction en fonction — c'est la même
    // géométrie qu'avant, simplement décalée.
    const x0 = gouttiereDesLibelles(ctx, h);
    if (x0) dessinerLibelles(ctx, h);
    ctx.save();
    ctx.translate(x0, 0);
    const utileL = Math.max(0, l - x0);
    if (style === 'lamps') dessinerLampes(ctx, utileL, h, cretes, overs);
    else dessinerBargraphe(ctx, utileL, h);
    ctx.restore();
  }

  /** Deux témoins compacts — le seul visuel que la barre de lecture accepte. */
  function dessinerLampes(ctx: CanvasRenderingContext2D, l: number, h: number, cretes: number[], overs: boolean[]) {
    // Le rayon reste ici — le CENTRE des voies, lui, vient de la géométrie
    // partagée : c'est ce qui garantit que `L` et `R` tombent en face.
    const r = Math.min(h / 2 - 1, 5);
    for (let ch = 0; ch < 2; ch++) {
      const etat = joue ? surcharge(cretes[ch], overs[ch]) : 'aucune';
      ctx.beginPath();
      ctx.arc(r + 1, centreDeLaVoie(ch, h), r, 0, Math.PI * 2);
      ctx.fillStyle =
        etat === 'rouge' ? COULEURS.rouge : etat === 'ambre' ? COULEURS.ambre : COULEURS.eteint;
      ctx.fill();
    }
    // Une barre de niveau minuscule à droite du témoin : sans elle, deux
    // pastilles éteintes ne disent pas si quelque chose joue.
    const x0 = r * 2 + 6;
    const large = Math.max(0, l - x0);
    for (let ch = 0; ch < 2; ch++) {
      const y = centreDeLaVoie(ch, h) - 1.5;
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
      const y = centreDeLaVoie(ch, h) - hb / 2;
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
      const etat = joue
        ? surcharge(
            $audioLevels[ch === 0 ? 'peak_left_db' : 'peak_right_db'],
            $audioLevels[ch === 0 ? 'over_left' : 'over_right'],
          )
        : 'aucune';
      ctx.fillStyle =
        etat === 'rouge' ? COULEURS.rouge : etat === 'ambre' ? COULEURS.ambre : COULEURS.eteint;
      ctx.fillRect(utile + 6, y, largeurOver, hb);
    }
  }

  // #1256 — la boucle dessine à ~30 i/s (et non à chaque image de l'écran,
  // jusqu'à 120 Hz), et s'ARRÊTE hors lecture une fois tout retombé au
  // plancher. L'effet lit `joue` : la reprise de la lecture la relance.
  //
  // Ticket 150 — la cadence, la garde d'onglet caché et l'annulation au
  // démontage vivent désormais dans `lib/boucleImages.ts`, partagé avec les
  // deux autres boucles de « Lecture en cours ». Le seuil de repos reste ici,
  // dans `lib/cadenceCreteMetre.ts`, où le test l'appelle.
  //
  // #1256 (23/09) — la cadence vient des Réglages. `cran` est LU DANS l'effet :
  // changer le réglage démonte la boucle et la remonte à la nouvelle cadence,
  // sans rechargement. Il est passé à `boucleImages` comme SA règle de rythme
  // (`rythme`) : c'est le seul cadenceur de cette boucle, et il n'y en aura
  // pas deux — deux cadenceurs en série qui ne tombent pas d'accord font
  // disparaître une image sur deux (variante C de #1499).
  $effect(() => {
    const c = toile;
    const enLecture = joue;
    const cran = cranOuDefaut($preferences.cadenceAnimations);
    if (!c || style === 'off') return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    // Le thème est une DÉPENDANCE de cet effet : en changer démonte la boucle
    // et la remonte, ce qui relit la palette. Sans cela, l'instrument garderait
    // les couleurs du thème précédent jusqu'au rechargement de la page.
    void $preferences.v2Theme;
    COULEURS = paletteCreteDepuis(c);
    return boucleImages(() => {
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const l = largeur || c.clientWidth || 120;
      if (c.width !== Math.round(l * dpr) || c.height !== Math.round(hauteur * dpr)) {
        c.width = Math.round(l * dpr);
        c.height = Math.round(hauteur * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (retombeAuRepos(enLecture, barres, ppm)) {
        // Dernière image, au plancher exact, puis plus rien : un cadran
        // vide n'a pas à être redessiné trente fois par seconde.
        barres = [PLANCHER_DB, PLANCHER_DB];
        dessiner(ctx, l, hauteur);
        return false;
      }
      dessiner(ctx, l, hauteur);
      return true;
    }, { rythme: (maintenant, dernier) => tempsDeDessiner(maintenant, dernier, cran) });
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
