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

/**
 * 🔴 LA FACE, EN UNITÉS DE RAYON — et le cadre qu'elle exige.
 *
 * Bertrand, 27/09/2026, sur le .18 : « Vumètres mal centrés… en hauteur ! ».
 * La face monte à `HAUT_FACE` rayons AU-DESSUS du centre du cadran et descend
 * à `BAS_FACE` en dessous. Le Grand écran plaçait ce centre à 42 % de la
 * hauteur de sa toile : le haut de la face passait donc au-dessus du bord
 * — coupé — et il restait du vide en bas. Invisible sur un cadran de 235 px,
 * criant sur un cadran de 35.
 *
 * `cadreCadran` rend le seul cadre qui contienne la face entière. Les deux
 * surfaces l'appellent : une géométrie décidée à deux endroits redeviendrait
 * deux instruments.
 */
export const HAUT_FACE = 0.92;
export const BAS_FACE = 0.63;

export function cadreCadran(rayon: number): { hauteur: number; cy: number } {
  return { hauteur: (HAUT_FACE + BAS_FACE) * rayon, cy: HAUT_FACE * rayon };
}

/**
 * Plancher de lisibilité des textes, en pixels de dessin.
 *
 * 🔴 Tout le reste du cadran est proportionnel au rayon — c'est ce qui manquait
 * et ce qui cassait les petits cadrans : les graduations et les chiffres
 * étaient posés en pixels ABSOLUS (`arcR + 13`, `9px`), justes vers r ≈ 118 et
 * absurdes vers r ≈ 35, où les chiffres sortaient de la face.
 *
 * Le texte, lui, ne peut pas descendre indéfiniment : à 2,7 px un chiffre n'est
 * plus un chiffre, c'est du bruit. Les trois polices sont donc proportionnelles
 * AVEC un plancher, et le plancher ne mord que sur les petits cadrans — au
 * rayon nominal du Grand écran, les trois valent exactement ce qu'elles
 * valaient : 9, 11 et 12.
 */
const MIN_TICK = 7;
const MIN_TEXTE_DB = 8;
const MIN_CANAL = 9;

/**
 * LA PALETTE DU CADRAN — Bertrand, 27/09/2026 : « vumètres en thème clair ».
 *
 * 🔴 En thème clair, le cadran avait purement DISPARU : face blanche à 5 %,
 * graduations ivoire, bord blanc à 12 % — tout cela écrit en dur pour un fond
 * noir, et rigoureusement invisible sur du blanc.
 *
 * Une toile n'hérite d'aucune couleur : contrairement à du balisage, elle ne
 * peut pas « suivre le thème » toute seule. Il faut donc aller LIRE la
 * couleur. Elle est lue sur les jetons `--v2-vu-*` de `tune-v2.css`, ce qui
 * laisse la décision au thème — les six palettes, et celles de demain, sans
 * une ligne de JavaScript de plus. Un tableau de correspondance écrit ici
 * aurait redonné deux endroits où la couleur se décide.
 *
 * `encre` et `rouge` sont des TRIPLETS `r,g,b` : le cadran en tire plusieurs
 * opacités — l'arc, les graduations, les chiffres et le pivot ne pèsent pas
 * pareil — et une toile ne sait pas appliquer une opacité à une couleur déjà
 * résolue.
 */
export interface PaletteVu {
  faceHaut: string;
  faceBas: string;
  bord: string;
  /** `r,g,b` — l'encre de l'instrument (arc, graduations, chiffres, pivot). */
  encre: string;
  /** `r,g,b` — la zone rouge et le témoin de crête. */
  rouge: string;
  aiguille: string;
  /** Le halo SOUS l'aiguille. Une couleur à part : la toile ne sait pas
   *  appliquer une opacité à une couleur déjà résolue, et un halo opaque
   *  transformerait l'aiguille en trait gras. */
  lueur: string;
}

/**
 * Le cadran d'origine, mot pour mot.
 *
 * C'est le repli de `paletteVuDepuis` : un appelant hors de `.tune-v2` — le
 * Grand écran vit dans la coquille historique — rend donc exactement ce qu'il
 * rendait avant que la palette existe.
 */
export const PALETTE_SOMBRE: PaletteVu = {
  faceHaut: 'rgba(255,255,255,0.055)',
  faceBas: 'rgba(255,255,255,0.015)',
  bord: 'rgba(255,255,255,0.12)',
  encre: '237,233,224',
  rouge: '224,82,82',
  aiguille: '#f2b441',
  lueur: 'rgba(242,180,65,0.45)',
};

/**
 * Lit la palette sur un élément — ses jetons, ou ceux dont il hérite.
 *
 * ⚠️ `getComputedStyle` coûte cher : on l'appelle quand le THÈME change, pas à
 * chaque image. Trente lectures par seconde et par cadran forceraient un
 * recalcul de style à chaque trame, sur une barre qui est toujours à l'écran.
 *
 * Une valeur vide retombe sur le sombre, jeton par jeton : un thème qui n'en
 * déclarerait qu'une partie rend un cadran cohérent, pas un cadran à moitié
 * peint.
 */
export function paletteVuDepuis(el: Element | null | undefined): PaletteVu {
  if (!el || typeof getComputedStyle !== 'function') return PALETTE_SOMBRE;
  const style = getComputedStyle(el);
  const lire = (nom: string, repli: string) => {
    const v = style.getPropertyValue(nom).trim();
    return v || repli;
  };
  return {
    faceHaut: lire('--v2-vu-face-h', PALETTE_SOMBRE.faceHaut),
    faceBas: lire('--v2-vu-face-b', PALETTE_SOMBRE.faceBas),
    bord: lire('--v2-vu-bord', PALETTE_SOMBRE.bord),
    encre: lire('--v2-vu-encre', PALETTE_SOMBRE.encre),
    rouge: lire('--v2-vu-rouge', PALETTE_SOMBRE.rouge),
    aiguille: lire('--v2-vu-aiguille', PALETTE_SOMBRE.aiguille),
    lueur: lire('--v2-vu-lueur', PALETTE_SOMBRE.lueur),
  };
}

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
  /** Les couleurs du thème. Absente : le cadran d'origine, sur fond sombre. */
  palette?: PaletteVu;
}

/**
 * Dessine UN cadran. Le contexte est laissé tel qu'il a été reçu (`save` /
 * `restore`) : l'appelant en pose plusieurs sans précaution.
 */
export function dessinerCadran(ctx: CanvasRenderingContext2D, o: CadranVu): void {
  const { cx, cy, rayon, libelle, db, creteAllumee } = o;
  const p = o.palette ?? PALETTE_SOMBRE;
  /** Une opacité de l'encre du thème. */
  const encre = (a: number) => `rgba(${p.encre},${a})`;
  const rouge = (a: number) => `rgba(${p.rouge},${a})`;

  /**
   * 🔴 PLUS AUCUN PIXEL ABSOLU ICI.
   *
   * Les fractions ci-dessous sont celles que les anciennes valeurs valaient au
   * rayon nominal du Grand écran (toile de 560 px, `dpr` 2 ⇒ r = 235,2) : 3/r,
   * 4,8/r, … Le Grand écran rend donc EXACTEMENT le même cadran, et un cadran
   * de barre de lecture rend le même en petit — ce qui n'était pas le cas.
   *
   * `dpr` a disparu du contrat pour la même raison : le rayon le porte déjà.
   * Le multiplier une seconde fois doublait l'épaisseur des traits sur les
   * appelants qui dessinent, eux, en pixels CSS.
   */
  const u = rayon / 117.6;

  ctx.save();
  ctx.translate(cx, cy);

  const faceR = rayon;
  const arcR = rayon * 0.82;

  // Face
  const grad = ctx.createLinearGradient(0, -faceR, 0, faceR * 0.4);
  grad.addColorStop(0, p.faceHaut);
  grad.addColorStop(1, p.faceBas);
  ctx.fillStyle = grad;
  ctx.strokeStyle = p.bord;
  ctx.lineWidth = 1.5 * u;
  ctx.beginPath();
  ctx.roundRect(-faceR, -faceR * HAUT_FACE, faceR * 2, faceR * (HAUT_FACE + BAS_FACE), 10 * u);
  ctx.fill();
  ctx.stroke();

  // Arc gradué : partie « saine » ivoire, zone rouge sur les vrais −3…0 dBFS
  const a0 = -Math.PI / 2 + dbToAngle(MIN_DB);
  const aRed = -Math.PI / 2 + dbToAngle(RED_FROM_DB);
  const a1 = -Math.PI / 2 + dbToAngle(MAX_DB);
  ctx.lineWidth = 2.4 * u;
  ctx.strokeStyle = encre(0.75);
  ctx.beginPath();
  ctx.arc(0, faceR * 0.42, arcR, a0, aRed);
  ctx.stroke();
  ctx.strokeStyle = rouge(0.95);
  ctx.beginPath();
  ctx.arc(0, faceR * 0.42, arcR, aRed, a1);
  ctx.stroke();

  // Graduations + chiffres
  ctx.font = `${Math.round(Math.max(MIN_TICK, 9 * u))}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const tick of TICKS) {
    const a = -Math.PI / 2 + dbToAngle(tick);
    const inner = arcR - 6 * u;
    const outer = arcR + (tick === RED_FROM_DB ? 7 : 4) * u;
    ctx.strokeStyle = tick >= RED_FROM_DB ? rouge(0.95) : encre(0.7);
    ctx.lineWidth = (tick === RED_FROM_DB ? 2.2 : 1.2) * u;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, faceR * 0.42 + Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, faceR * 0.42 + Math.sin(a) * outer);
    ctx.stroke();
    if (LABELED_TICKS.includes(tick)) {
      const tr = arcR + 13 * u;
      ctx.fillStyle = tick >= RED_FROM_DB ? rouge(0.9) : encre(0.6);
      ctx.fillText(String(Math.abs(tick)), Math.cos(a) * tr, faceR * 0.42 + Math.sin(a) * tr);
    }
  }

  // Libellés. `dB` et « L » / « R » sont des repères d'instrument, pas du
  // texte d'interface : ils ne se traduisent pas (un VU-mètre porte les mêmes
  // lettres dans toutes les langues).
  ctx.fillStyle = encre(0.5);
  ctx.font = `600 ${Math.round(Math.max(MIN_TEXTE_DB, 11 * u))}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.fillText('dB', 0, faceR * 0.06);
  ctx.font = `600 ${Math.round(Math.max(MIN_CANAL, 12 * u))}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  ctx.fillStyle = p.aiguille;
  ctx.fillText(libelle, 0, faceR * 0.5);

  // Témoin de crête
  ctx.beginPath();
  ctx.arc(faceR * 0.72, -faceR * 0.6, 4.5 * u, 0, Math.PI * 2);
  ctx.fillStyle = creteAllumee ? rouge(1) : rouge(0.18);
  ctx.fill();
  if (creteAllumee) {
    ctx.shadowColor = rouge(0.9);
    ctx.shadowBlur = 8 * u;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Aiguille
  const na = -Math.PI / 2 + dbToAngle(db);
  const pivotY = faceR * 0.42;
  ctx.strokeStyle = p.aiguille;
  ctx.lineWidth = 2.2 * u;
  ctx.lineCap = 'round';
  ctx.shadowColor = p.lueur;
  ctx.shadowBlur = 6 * u;
  ctx.beginPath();
  ctx.moveTo(Math.cos(na) * (arcR * 0.12), pivotY + Math.sin(na) * (arcR * 0.12));
  ctx.lineTo(Math.cos(na) * (arcR - 3 * u), pivotY + Math.sin(na) * (arcR - 3 * u));
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Pivot
  ctx.beginPath();
  ctx.arc(0, pivotY, 5 * u, 0, Math.PI * 2);
  ctx.fillStyle = encre(0.85);
  ctx.fill();

  ctx.restore();
}

/**
 * Une couleur du thème, à l'opacité demandée.
 *
 * Une toile ne sait pas appliquer une opacité à une couleur déjà résolue : il
 * faut la reconstruire. `#rrggbb` et `rgb(...)` / `rgba(...)` sont acceptés —
 * ce sont les deux formes que `getComputedStyle` rend pour un jeton. Une
 * valeur qu'on ne sait pas lire est rendue telle quelle, plutôt que de peindre
 * du noir : une couleur inattendue vaut mieux qu'une couleur fausse.
 */
export function avecAlpha(couleur: string, alpha: number): string {
  const c = (couleur ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(c)) {
    const n = parseInt(c.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const m = c.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
  return c;
}
