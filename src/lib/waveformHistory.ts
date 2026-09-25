/// Historique de crête du mode « forme d'onde » du lecteur (#2182).
///
/// ## Ce que le mode dessinait
///
/// Une somme de trois sinusoïdes plus un tirage aléatoire :
///
/// ```text
/// Math.sin(x*PI*4 + p)*bass*.4 + Math.sin(x*PI*8 + p*1.7)*mid*.25
///   + Math.sin(x*PI*16 + p*2.3)*treble*.15 + (Math.random()-.5)*.08
/// ```
///
/// où `x = i / WAVE_POINTS` est une position DANS L'IMAGE, pas un instant, et
/// où `bass`/`mid`/`treble` étaient devinés à partir des MÉTADONNÉES de la
/// piste (fréquence d'échantillonnage, profondeur, format). Seule l'amplitude
/// globale suivait les niveaux réels ; le tracé, lui, ne disait rien du
/// signal. C'est ce que Reivax66 a signalé (fil forum 1242).
///
/// ## Ce qu'il dessine maintenant
///
/// L'enveloppe de crête réellement mesurée par le serveur. L'événement
/// `playback.audio_levels` porte déjà `peak_left_db` / `peak_right_db`,
/// calculés sur le PCM décodé par fenêtre de 40 ms — voir
/// `tune-core/src/audio/tap.rs:341` (`window: Duration::from_millis(40)`) et
/// le forwarder cadencé de `tune-core/src/orchestrator.rs:215`, qui recale ces
/// fenêtres sur l'horloge de lecture. Soit 25 trames par seconde.
///
/// En empilant ces crêtes on obtient exactement ce qu'un éditeur audio appelle
/// une forme d'onde : le TEMPS en abscisse, l'AMPLITUDE MESURÉE en ordonnée.
/// C'est le même objet que la vue d'ensemble d'Audacity, à une résolution de
/// 40 ms par colonne.
///
/// ## Pourquoi pas l'API Web Audio
///
/// Elle ne voit le signal que lorsqu'il transite par la page — les zones
/// « navigateur ». Sur une sortie DAC locale, un renderer DLNA ou un endpoint,
/// le navigateur ne voit jamais passer un échantillon. Les crêtes du serveur,
/// elles, existent pour TOUTES les zones : le serveur décode exprès pour les
/// niveaux, y compris sur un passthrough bit-perfect et sur une session proxy
/// Qobuz/Tidal. Le même mode dit donc la vérité partout.
///
/// ## Coût
///
/// Réseau : **nul**. Les deux champs sont déjà dans chaque événement déjà
/// émis ; aucun octet de plus, aucune modification du serveur, aucun flux PCM
/// vers le client. Mémoire : un tampon borné de `WAVE_HISTORY_SLOTS` couples
/// de nombres (~6 s). Calcul : strictement MOINS que l'animation remplacée,
/// qui recalculait 64 sinus et 64 tirages aléatoires à chaque image.
///
/// ## Contrat d'honnêteté
///
/// Sans donnée, l'historique reste VIDE et le mode ne dessine rien. Il n'y a
/// pas de repli animé : mieux vaut une ligne plate qu'une fausse forme d'onde.

/** Durée d'une fenêtre d'analyse du serveur, en millisecondes. */
export const WAVE_SLOT_MS = 40;

/**
 * Nombre de crêtes conservées. 150 × 40 ms = 6 s de signal visible — assez
 * pour lire une phrase musicale, assez court pour que le tracé reste lié à ce
 * qu'on entend.
 */
export const WAVE_HISTORY_SLOTS = 150;

/**
 * Plancher d'affichage, en dBFS. Même échelle que le reste des instruments du
 * lecteur : une échelle linéaire en amplitude écraserait tout, un signal à
 * −20 dBFS ne dessinant que 10 % de hauteur.
 */
export const WAVE_FLOOR_DB = -60;

/** Une colonne de la forme d'onde : la crête des deux voies, en 0…1. */
export interface WaveSample {
  left: number;
  right: number;
}

/**
 * dBFS → hauteur 0…1 sur une échelle en décibels (`WAVE_FLOOR_DB` → 0 dBFS).
 *
 * Tout ce qui est sous le plancher, ou non mesurable, vaut zéro : le silence
 * est plat, il n'ondule pas.
 */
export function peakDbToAmplitude(db: number): number {
  if (!Number.isFinite(db) || db <= WAVE_FLOOR_DB) return 0;
  if (db >= 0) return 1;
  return (db - WAVE_FLOOR_DB) / -WAVE_FLOOR_DB;
}

/**
 * Tampon glissant borné des crêtes reçues, le plus ancien en tête.
 *
 * Volontairement dépourvu d'horloge : il n'avance que lorsqu'une trame arrive
 * réellement. Si le flux d'événements s'interrompt, le tracé se fige au lieu
 * de défiler sur du vide — se taire est honnête, meubler ne l'est pas.
 *
 * ## Un anneau, pas un tableau qu'on décale (#1554)
 *
 * L'ancienne version empilait en fin de tableau puis retirait la tête par
 * `splice(0, n)`, ce qui recopie TOUTES les colonnes restantes à chaque trame.
 * Remplacer par `shift()` ne change pas l'ordre de grandeur : V8 ne l'accélère
 * que tant que le tableau reste petit. MESURÉ sur Shrek (Node 22), 10⁵
 * poussées :
 *
 *     capacité     splice      shift      anneau
 *          150      98 ms      14 ms      1,9 ms
 *       10 000   1 793 ms      12 ms      1,3 ms
 *       50 000  10 149 ms   8 090 ms      1,4 ms
 *
 * À 150 colonnes et 25 trames/s le coût réel restait de l'ordre de 25 µs par
 * seconde : ce n'était pas un goulet, mais un coût qui croît avec la capacité.
 * L'anneau écrit une case et avance un indice — O(1) quelle que soit la
 * capacité — et ne crée plus d'objet par trame.
 *
 * La lecture (`samples()`) remet les colonnes dans l'ordre chronologique dans
 * un instantané, recalculé au plus une fois par trame reçue : le dessin, à
 * 60 images/s, relit le même tableau sans rien réallouer. L'instantané rendu
 * n'est plus modifié par les poussées suivantes — l'ancien renvoyait le
 * tableau interne, qui bougeait sous les pieds de qui le gardait.
 */
export class WaveformHistory {
  private readonly cap: number;
  private readonly left: Float64Array;
  private readonly right: Float64Array;
  /** Indice de la plus ancienne colonne. */
  private head = 0;
  private count = 0;
  /** Instantané ordonné ; `null` dès qu'une poussée l'a rendu périmé. */
  private snapshot: WaveSample[] | null = [];

  constructor(capacity: number = WAVE_HISTORY_SLOTS) {
    this.cap = Math.max(1, Math.floor(capacity));
    this.left = new Float64Array(this.cap);
    this.right = new Float64Array(this.cap);
  }

  /** Empile la crête d'une fenêtre d'analyse. */
  push(peakLeftDb: number, peakRightDb: number): void {
    let at: number;
    if (this.count < this.cap) {
      at = (this.head + this.count) % this.cap;
      this.count++;
    } else {
      // Plein : la nouvelle colonne prend la place de la plus ancienne.
      at = this.head;
      this.head = (this.head + 1) % this.cap;
    }
    this.left[at] = peakDbToAmplitude(peakLeftDb);
    this.right[at] = peakDbToAmplitude(peakRightDb);
    this.snapshot = null;
  }

  /** Les crêtes retenues, de la plus ancienne à la plus récente. */
  samples(): readonly WaveSample[] {
    if (this.snapshot === null) {
      const out: WaveSample[] = new Array(this.count);
      for (let i = 0; i < this.count; i++) {
        const j = (this.head + i) % this.cap;
        out[i] = { left: this.left[j], right: this.right[j] };
      }
      this.snapshot = out;
    }
    return this.snapshot;
  }

  /** Nombre de colonnes disponibles. */
  get length(): number {
    return this.count;
  }

  /** Capacité de l'anneau, en colonnes. */
  get capacity(): number {
    return this.cap;
  }

  /** Vide le tampon — changement de piste, de zone, ou arrêt. */
  clear(): void {
    this.head = 0;
    this.count = 0;
    this.snapshot = [];
  }
}
