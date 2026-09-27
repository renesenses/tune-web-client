/**
 * LE CADRAN À AIGUILLE, DESSINÉ UNE SEULE FOIS POUR TOUT LE CLIENT.
 *
 * Ce module ne contient AUCUNE décision : l'échelle, la zone rouge et les
 * graduations restent dans `tvVuScale.ts`, où des tests les interrogent
 * (#323, #370, #439 — trois calages successifs, dont deux ont collé les
 * aiguilles en butée). Ici, il n'y a que le trait.
 *
 * ## Pourquoi il sort de `TvVuMeters`
 *
 * Bertrand, 27/09/2026 : « une seconde transport bar via toggle réglages qui
 * affiche les vu-mètres à gauche et droite ». Le cadran existait déjà, dans le
 * mode Grand écran. Le recopier dans la barre de lecture aurait donné DEUX
 * aiguilles : deux balistiques, deux zones rouges, deux témoins de crête, qui
 * auraient divergé au premier réglage — c'est la leçon du `?? onPlay` de
 * #1016 et des deux constructeurs d'erreur d'`api.ts`. Le Grand écran et la
 * barre appellent donc la MÊME fonction, et une garde le mesure.
 *
 * ## Une seule différence entre les deux appelants
 *
 * Le Grand écran dessine les deux cadrans dans une toile ; la barre en dessine
 * UN par toile, parce que la maquette les sépare de part et d'autre des
 * commandes. D'où `dessinerCadran`, qui ne connaît qu'un cadran et son centre
 * — c'est l'appelant qui sait combien il en pose et où.
 */
import { MIN_DB, MAX_DB, RED_FROM_DB, TICKS, LABELED_TICKS, dbToFraction } from './tvVuScale';

/** Ouverture de l'arc — ~120°, comme un cadran de magnétophone. */
export const SPAN = Math.PI * 0.66;

/** Position angulaire d'une valeur dBFS sur l'arc (gauche → droite). */
export function dbToAngle(db: number): number {
  return -SPAN / 2 + dbToFraction(db) * SPAN;
}

/**
 * LA BALISTIQUE, et pourquoi elle est ici plutôt que dans chaque appelant.
 *
 * Montée rapide, retombée douce (~300 ms) : c'est ce qui fait qu'un cadran se
 * lit comme un VU et non comme un crête-mètre. Deux copies de ces deux
 * coefficients, c'est deux instruments qui ne bougent pas pareil sous le même
 * signal — et personne ne saurait lequel a raison.
 */
export const MONTEE = 0.25;
export const RETOMBEE = 0.08;

export function avancerAiguille(actuelle: number, cible: number, mouvementReduit = false): number {
  if (mouvementReduit) return cible;
  return actuelle + (cible - actuelle) * (cible > actuelle ? MONTEE : RETOMBEE);
}

/**
 * Durée d'allumage du témoin de crête, en MILLISECONDES.
 *
 * 🔴 En millisecondes, et non en images. Le Grand écran comptait 45 images —
 * ce qui vaut 750 ms à 60 Hz, 375 ms sur un écran à 120 Hz, et 1,5 s si la
 * cadence de dessin est réglée sur 30 i/s (le réglage de #1256 existe depuis
 * le 23/09/2026). Un témoin dont la durée dépend de l'écran n'est pas un
 * témoin. La valeur retenue est celle que l'écran de Bertrand rendait.
 */
export const MAINTIEN_CRETE_MS = 750;

export interface CadranVu {
  /** Centre du cadran, en pixels de la toile (déjà à l'échelle `dpr`). */
  cx: number;
  cy: number;
  /** Rayon de la face. */
  rayon: number;
  /** « L », « R » — le libellé peint sur la face. */
  libelle: string;
  /** Le RMS que l'aiguille indique, en dBFS. */
  db: number;
  /** Le témoin de crête est-il allumé ? */
  creteAllumee: boolean;
  /** Densité de pixels : les traits et les textes la suivent. */
  dpr: number;
}

/**
 * Dessine UN cadran. Le contexte est laissé tel qu'il a été reçu (`save` /
 * `restore`) : l'appelant en pose plusieurs sans précaution.
 */
export function dessinerCadran(ctx: CanvasRenderingContext2D, o: CadranVu): void {
  const { cx, cy, rayon, libelle, db, creteAllumee, dpr } = o;

  ctx.save();
  ctx.translate(cx, cy);

  const faceR = rayon;
  const arcR = rayon * 0.82;

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

  // Arc gradué : partie « saine » ivoire, zone rouge sur les vrais −3…0 dBFS
  const a0 = -Math.PI / 2 + dbToAngle(MIN_DB);
  const aRed = -Math.PI / 2 + dbToAngle(RED_FROM_DB);
  const a1 = -Math.PI / 2 + dbToAngle(MAX_DB);
  ctx.lineWidth = 2.4 * dpr;
  ctx.strokeStyle = 'rgba(237,233,224,0.75)';
  ctx.beginPath();
  ctx.arc(0, faceR * 0.42, arcR, a0, aRed);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(224,82,82,0.95)';
  ctx.beginPath();
  ctx.arc(0, faceR * 0.42, arcR, aRed, a1);
  ctx.stroke();

  // Graduations + chiffres
  ctx.font = `${Math.round(9 * dpr)}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const tick of TICKS) {
    const a = -Math.PI / 2 + dbToAngle(tick);
    const inner = arcR - 6 * dpr;
    const outer = arcR + (tick === RED_FROM_DB ? 7 : 4) * dpr;
    ctx.strokeStyle = tick >= RED_FROM_DB ? 'rgba(224,82,82,0.95)' : 'rgba(237,233,224,0.7)';
    ctx.lineWidth = (tick === RED_FROM_DB ? 2.2 : 1.2) * dpr;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, faceR * 0.42 + Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, faceR * 0.42 + Math.sin(a) * outer);
    ctx.stroke();
    if (LABELED_TICKS.includes(tick)) {
      const tr = arcR + 13 * dpr;
      ctx.fillStyle = tick >= RED_FROM_DB ? 'rgba(224,82,82,0.9)' : 'rgba(237,233,224,0.6)';
      ctx.fillText(String(Math.abs(tick)), Math.cos(a) * tr, faceR * 0.42 + Math.sin(a) * tr);
    }
  }

  // Libellés. `dB` et « L » / « R » sont des repères d'instrument, pas du
  // texte d'interface : ils ne se traduisent pas (un VU-mètre porte les mêmes
  // lettres dans toutes les langues).
  ctx.fillStyle = 'rgba(237,233,224,0.5)';
  ctx.font = `600 ${Math.round(11 * dpr)}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.fillText('dB', 0, faceR * 0.06);
  ctx.font = `600 ${Math.round(12 * dpr)}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.fillStyle = 'rgba(242,180,65,0.85)';
  ctx.fillText(libelle, 0, faceR * 0.5);

  // Témoin de crête
  ctx.beginPath();
  ctx.arc(faceR * 0.72, -faceR * 0.6, 4.5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = creteAllumee ? 'rgba(224,82,82,1)' : 'rgba(224,82,82,0.18)';
  ctx.fill();
  if (creteAllumee) {
    ctx.shadowColor = 'rgba(224,82,82,0.9)';
    ctx.shadowBlur = 8 * dpr;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Aiguille
  const na = -Math.PI / 2 + dbToAngle(db);
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
