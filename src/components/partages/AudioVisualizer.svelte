<script lang="ts">
  import { estDuDSD } from '../../lib/utils';
  import { onMount, untrack } from 'svelte';
  import { boucleImages } from '../../lib/boucleImages';
  import { audioLevels, levelsForZone, type AudioLevels } from '../../lib/stores/audioLevels';
  import { freqLabel, spectrumGravesTicks, spectrumIsoTicks, type AnnonceSpectre } from '../../lib/spectrumScale';
  import { cleFormat, capaciteMaintenue, CAPACITE_VIDE, type CapaciteSpectre } from '../../lib/axeSpectre';
  import { WAVE_HISTORY_SLOTS, WaveformHistory } from '../../lib/waveformHistory';

  interface Props {
    playing: boolean;
    mode?: 'spectrum' | 'waveform';
    height?: number;
    mini?: boolean;
    sampleRate?: number | null;
    bitDepth?: number | null;
    format?: string | null;
    /**
     * Zone à suivre. Absent = la zone SÉLECTIONNÉE, comportement d'origine de
     * la barre de transport et de « Lecture en cours ».
     *
     * Nommée, on suit CETTE zone : la bande « Zones d'écoute actives » en
     * affiche plusieurs côte à côte, et elles ne jouent pas la même chose.
     */
    zoneId?: number | null;
  }

  let {
    playing,
    mode = 'spectrum',
    height = 80,
    mini = false,
    sampleRate = null,
    bitDepth = null,
    format = null,
    zoneId = null,
  }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  /** Annulateur de la boucle d'images courante. `null` = aucune en vol. */
  let arreterBoucle: (() => void) | null = null;
  let visible = $state(false);

  // Simulated bar values (32 bars for spectrum)
  let barCount = $derived(mini ? 16 : 32);
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
  /**
   * 🔴 #892 — ce que le serveur annonce de son analyse, retenu de la dernière
   * trame. Sans ça, le module d'échelle recopiait une FFT de 2048 périmée
   * depuis #2866 et refusait le repère 125 Hz au-dessus de 48 kHz.
   */
  let annonceSpectre: AnnonceSpectre | null = null;
  /**
   * 🔴 Fil 1908 (Didier, 24/09/2026) — la fréquence d'échantillonnage que le
   * serveur a RÉELLEMENT analysée, lue sur la trame (`sample_rate` de
   * `playback.audio_levels`, « celle du décodage, pas celle du tag »).
   *
   * L'axe la prenait dans la prop `sampleRate`, c'est-à-dire dans les
   * MÉTADONNÉES de la piste. Or une piste Qobuz de la file peut n'en porter
   * aucune — sur sa capture, ni format, ni fréquence, ni badge de qualité
   * sous le titre — et `spectrumIsoTicks` rend, sans débit, `[]` : les barres
   * s'animaient, l'échelle avait disparu, « aléatoirement sur un album
   * Qobuz ». Et quand elles existent, elles décrivent le fichier, pas
   * l'analyse. Retenue de la dernière trame qui la porte, effacée à l'arrêt
   * comme `serverBandCount`.
   */
  let tauxAnalyse: number | null = null;
  /**
   * Hauteur sous laquelle on ne gradue pas : la vignette de zone (26 px) n'a
   * jamais eu d'échelle — faute de prop `sampleRate`, pas par choix écrit —
   * et 12 px d'étiquettes y écraseraient les barres. Le fil 1908 ne doit pas
   * l'y faire apparaître.
   */
  const HAUTEUR_MIN_AXE = 40;
  /**
   * La capacité de l'analyseur pour le format courant — Bertrand, 13/09/2026.
   *
   * 🔴 `spectrum_frames` VARIE d'une trame à l'autre (mesuré sur la .18 :
   * 1764 puis 1080 puis 1764), et la résolution vraie en dépend. L'axe suivait
   * la dernière trame : le repère 125 Hz clignotait, et une capture prise sur
   * une trame courte ne montrait rien sous 250 Hz. Voir `lib/axeSpectre`.
   */
  let capacite: CapaciteSpectre = CAPACITE_VIDE;
  /** Hauteur réservée sous les barres pour l'échelle, en px CSS. */
  const AXIS_H = 12;
  /** Même corps que la grille de l'égaliseur (`.grid-label`, ParametricEq). */
  const AXIS_FONT = 9;
  // `waveValues` / `waveTargets` ont disparu avec la sinusoide fabriquee
  // (#2182) : le dessin lit desormais `waveHistory`.
  // Mode « forme d'onde » : l'enveloppe de crête RÉELLEMENT mesurée par le
  // serveur, empilée trame par trame. Voir ../lib/waveformHistory.ts pour le
  // détail et pour ce que ce mode dessinait avant #2182 (des sinusoïdes).
  const waveHistory = new WaveformHistory();
  let lastTargetUpdate = 0;
  const TARGET_INTERVAL = 120; // ms between new random targets (~8 Hz)

  /**
   * 🔴 Ticket 150 — PAS de `$state`.
   *
   * Cette valeur n'est lue que par la boucle de dessin et par l'effet
   * ci-dessous ; elle n'apparaît dans aucun balisage. En `$state`, Svelte 5 en
   * faisait un proxy PROFOND (le tableau `spectrum_db` compris) à chaque trame
   * du serveur — ~24 par seconde — et surtout l'effet « en lecture » la lisait,
   * donc se ré-exécutait à chaque trame et refaisait l'agrégation des 32
   * bandes. Mesuré avant : 54 agrégations par seconde pour 30 images
   * dessinées. Les 24 de trop ne changeaient aucun pixel, et tournaient aussi
   * quand l'onglet était caché.
   */
  let realLevels: AudioLevels | null = null;
  let lastRealUpdate = 0;
  // FUSION 04/09/2026 : la source PAR ZONE vient de la ligne du client v2 (la
  // bande « Zones d'écoute actives » en affiche plusieurs côte à côte), le
  // garde-fou d'empilement vient de `main`. Les deux sont nécessaires.
  const source = zoneId != null ? levelsForZone(zoneId) : audioLevels;
  // Dernière trame EMPILÉE, par identité d'objet. Le store est `derived` : il
  // ré-émet le même objet quand la zone courante change ou qu'une autre zone
  // publie. Sans ce garde-fou, une même fenêtre de 40 ms serait comptée
  // plusieurs fois et le tracé avancerait plus vite que le son.
  let lastPushed: AudioLevels | null = null;
  let historyZone: number | null = null;
  const unsub = source.subscribe((l) => {
    if (l.rms_left_db > -90 || l.rms_right_db > -90) {
      realLevels = l;
      lastRealUpdate = performance.now();
    }
    // `zone_id === 0` est le placeholder du store (aucune trame reçue pour la
    // zone choisie) : il ne décrit aucun signal, on ne l'empile pas.
    if (l.zone_id === 0) return;
    if (historyZone !== l.zone_id) {
      // Changement de zone : le passé appartenait à une autre pièce.
      waveHistory.clear();
      historyZone = l.zone_id;
    }
    if (l === lastPushed) return;
    lastPushed = l;
    // Les trames silencieuses comptent : un blanc entre deux mouvements est
    // une information, il doit apparaître plat et non être sauté.
    waveHistory.push(l.peak_left_db, l.peak_right_db);
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

    // `estDuDSD` et non `format === 'dsd'` : les fichiers DSD s'appellent `.dsf`
    // ou `.dff`, et 47 des 49 albums DSD de la bibliothèque de Bertrand sont en
    // `dsf` — l'animation ne les reconnaissait donc pas.
    if (estDuDSD(format)) {
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
    annonceSpectre = levels
      ? { fftSize: levels.spectrum_fft_size, resolus: levels.spectrum_resolved }
      : null;
    if (!levels) return 0;
    // Fil 1908 — ce que le serveur a analysé, pas ce que dit le tag. N'entre
    // que dans l'axe (voir `drawSpectrum`), jamais dans la hauteur des barres.
    if (levels.sample_rate != null && levels.sample_rate > 0) tauxAnalyse = levels.sample_rate;

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

  // NOTE : ne concerne QUE le mode « spectre ». Le mode « forme d'onde » ne
  // passe plus par des cibles fabriquées — il lit `waveHistory`, alimenté par
  // les crêtes du serveur.
  function generateTargets() {
    if (!playing) {
      for (let i = 0; i < barCount; i++) barTargets[i] = 0;
      serverBandCount = 0;
      tauxAnalyse = null;
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

  /**
   * Une image. Rend `false` pour GARER la boucle — voir `lib/boucleImages`,
   * qui porte la cadence (~30 i/s), la garde d'onglet caché et l'annulation au
   * démontage. La limitation à 30 i/s était ici ; elle y est restée jusqu'à la
   * 0.9.158 incluse, mais sans garde de visibilité ni annulateur partagé.
   */
  function draw(timestamp: number): boolean {
    if (!canvas) return false;

    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    // When not playing, clear real levels and decay to zero
    if (!playing) {
      realLevels = null;
      // Le signal a cessé : on efface la forme d'onde au lieu de laisser un
      // tracé figé qui décrirait un son qu'on n'entend plus.
      waveHistory.clear();
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
      );
      // La forme d'onde ne « retombe » pas : elle est vidée à l'arrêt (le
      // signal a cessé, il n'y a plus rien de mesuré à montrer).
      if (maxVal < 0.005 && waveHistory.length === 0) {
        return false;
      }
    }

    const accent = getAccent(timestamp);

    if (mode === 'spectrum') {
      drawSpectrum(ctx, w, h, dpr, accent, decayRate, timestamp);
    } else {
      drawWaveform(ctx, w, h, dpr, accent);
    }

    return visible;
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
    // `spectrumIsoTicks` ne garde que ce que le serveur sait distinguer : dans
    // le grave, une FFT trop courte ne résout pas ses propres bandes, et un
    // repère y serait à côté de la barre qui s'allume.
    //
    // #892 — on lui passe désormais ce que le serveur ANNONCE (taille de FFT,
    // et le booléen par bande quand il est là) au lieu de le laisser rejouer
    // une troncature calculée sur 2048 points en dur. Voir spectrumScale.ts.
    /**
     * L'axe décrit ce que l'analyseur SAIT FAIRE, pas ce qu'une trame écourtée
     * a pu faire — Bertrand, 13/09/2026, « ajoute les fréquences < 250 Hz ».
     *
     * 🔴 Mesuré sur la .18 : `spectrum_frames` varie d'une trame à l'autre
     * (1764, puis 1080, puis 1764), et la résolution vraie vaut
     * `sample_rate / spectrum_frames`. Le repère 125 Hz apparaissait donc et
     * disparaissait plusieurs fois par seconde ; une capture prise sur une
     * trame courte ne montre rien sous 250 Hz.
     *
     * 🔴 Et c'est ICI, pas dans `spectrumTargets` : la garde
     * `spectreSansInvention` interdit — à juste titre — que le calcul des
     * BARRES touche aux métadonnées de la piste. `sampleRate` n'entre que dans
     * l'axe, qui n'est pas une barre.
     */
    /**
     * 🔴 #1454 — Didier, fil 1889, 22/09/2026, FLAC 96 kHz : « l'échelle de
     * fréquence clignote », APRÈS le correctif de #1002 qui est dans sa build.
     *
     * La TAILLE DE FFT annoncée suit la longueur de la trame
     * (`n = m.next_power_of_two().min(8192)`), et `m` varie. À 44,1 kHz 1764 et
     * 1080 donnent tous deux 2048 — rien ne bougeait. À 96 kHz une fenêtre
     * pleine fait 4096 et une écourtée 2048 : la clé de format basculait à
     * chaque trame courte, la mémoire était jetée, et l'axe retombait sur la
     * trame courte. Elle ne fait donc plus partie de la CLÉ ; elle est
     * mémorisée comme une capacité de plus, et c'est la plus grande vue qui
     * nourrit l'axe — sans quoi la troncature rejouée par `spectrumIsoTicks`
     * ferait clignoter les repères par un second chemin, à table identique.
     */
    // 🔴 Fil 1908 — le débit ANALYSÉ, annoncé par la trame, d'abord ; le tag
    // de la piste seulement pour un serveur qui ne l'annonce pas. Voir
    // `tauxAnalyse`.
    const tauxAxe = tauxAnalyse ?? sampleRate;
    capacite = capaciteMaintenue(
      capacite,
      cleFormat(tauxAxe, annonceSpectre?.resolus?.length ?? 0),
      annonceSpectre?.resolus,
      annonceSpectre?.fftSize,
    );
    const iso = mini || height < HAUTEUR_MIN_AXE
      ? []
      : spectrumIsoTicks(tauxAxe, serverBandCount, {
          fftSize: capacite.fftSize,
          resolus: capacite.resolus,
        });
    // 20, 31, 63 Hz sous le premier repère résolu — voir `spectrumGravesTicks`.
    // Seulement quand l'axe existe déjà : pas de graduation sans spectre reçu.
    const ticks = iso.length > 0 ? [...spectrumGravesTicks(tauxAxe, iso[0].hz), ...iso] : iso;
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

    // Bord droit de la dernière étiquette écrite : sur un écran étroit, 20 et
    // 31 Hz se touchent. Le trait reste, l'étiquette qui chevaucherait saute.
    let finPrecedente = -Infinity;
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
      if (cx - halfText < finPrecedente + 4 * dpr) continue;
      finPrecedente = cx + halfText;
      ctx.fillStyle = cachedMuted;
      ctx.fillText(label, cx, plotH + axisH);
    }
    ctx.restore();
  }

  /**
   * Trace l'enveloppe de crête RÉELLEMENT mesurée (#2182).
   *
   * Abscisse = le temps, la trame la plus récente collée au bord droit ; le
   * tracé entre par la droite et s'écoule vers la gauche, comme la tête de
   * lecture d'un éditeur audio. Ordonnée = la crête mesurée, voie gauche
   * au-dessus de l'axe, voie droite en dessous : le stéréo réel, et non un
   * miroir décoratif.
   *
   * Aucune valeur n'est inventée. Tant que rien n'est arrivé, on ne dessine
   * rien — pas de repli animé.
   */
  function drawWaveform(
    ctx: CanvasRenderingContext2D,
    w: number, h: number, dpr: number,
    accent: string,
  ) {
    const samples = waveHistory.samples();
    if (samples.length === 0) return;

    const midY = h / 2;
    const amplitude = h * 0.45;
    // Pas fixe : une colonne = une fenêtre de 40 ms, quelle que soit la
    // quantité déjà reçue. Sinon le tracé se dilaterait en se remplissant,
    // et l'échelle de temps mentirait.
    const step = w / (WAVE_HISTORY_SLOTS - 1);
    const xAt = (i: number) => w - (samples.length - 1 - i) * step;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, adjustAlpha(accent, 0.75));
    grad.addColorStop(0.5, adjustAlpha(accent, 0.35));
    grad.addColorStop(1, adjustAlpha(accent, 0.75));

    ctx.fillStyle = grad;
    ctx.beginPath();
    // Bord supérieur : voie gauche, de la plus ancienne à la plus récente.
    for (let i = 0; i < samples.length; i++) {
      const x = xAt(i);
      const y = midY - samples[i].left * amplitude;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // Bord inférieur : voie droite, en revenant.
    for (let i = samples.length - 1; i >= 0; i--) {
      ctx.lineTo(xAt(i), midY + samples[i].right * amplitude);
    }
    ctx.closePath();
    ctx.fill();

    // Ligne d'axe : repère du zéro, indispensable pour lire une enveloppe.
    ctx.strokeStyle = adjustAlpha(accent, 0.9);
    ctx.lineWidth = Math.max(1, (mini ? 1 : 1.5) * dpr);
    ctx.beginPath();
    ctx.moveTo(xAt(0), midY);
    ctx.lineTo(xAt(samples.length - 1), midY);
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
    if (arreterBoucle) return;
    lastTargetUpdate = 0;
    arreterBoucle = boucleImages((maintenant) => {
      const continuer = draw(maintenant);
      // La boucle s'est garée toute seule (lecture arrêtée, tout retombé) :
      // sans cet oubli, `startAnimation` croirait une boucle encore en vol et
      // la reprise de la lecture ne redessinerait plus rien.
      if (!continuer) arreterBoucle = null;
      return continuer;
    });
  }

  function stopAnimation() {
    arreterBoucle?.();
    arreterBoucle = null;
  }

  // Show when playing, fade-out and hide after decay
  $effect(() => {
    if (playing) {
      visible = true;
      // 🔴 Ticket 150 — `untrack`. Cet effet n'a qu'un travail : la première
      // image d'une reprise ne doit pas partir de barres périmées. Il ne doit
      // PAS se rejouer à chaque trame du serveur — la boucle de dessin refait
      // l'agrégation à l'image suivante de toute façon. `realLevels` n'est
      // plus réactif (voir sa déclaration) ; `untrack` ferme la même porte du
      // côté de l'appelant, pour que rajouter un `$state` dans
      // `generateTargets` ne rouvre pas la fuite en silence.
      untrack(() => generateTargets());
      // Une reprise avant le masquage conserve le canvas et sa visibilité.
      if (canvas) startAnimation();
    }
  });

  $effect(() => {
    if (!playing) {
      const timeout = setTimeout(() => {
        const maxBar = Math.max(...barValues);
        if (maxBar < 0.01 && waveHistory.length === 0) visible = false;
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
