/**
 * La FORME D'ONDE d'une piste, dans sa fiche technique — fil du forum 2793
 * (Didier : « une forme d'onde comme iZotope RX pour vérifier la tête du
 * signal et l'état de la compression »), décision de Bertrand du 13/11/2026.
 *
 * `GET /library/tracks/{id}/forme-onde?colonnes=N[&debut_s=&fin_s=]` rend,
 * par canal et par colonne de temps, les crêtes (`min` / `max`, linéaires
 * −1..1) et la RMS (0..1), et en chiffres la crête maximale, la RMS globale,
 * le facteur de crête (PLR) et le nombre d'échantillons écrêtés. Calcul côté
 * serveur à la demande, gardé en cache pour la piste entière ; une PLAGE
 * (`debut_s`, `fin_s`) sert au zoom et se calcule à chaque fois.
 *
 * Même règle que le spectrogramme : une piste de service, sans fichier
 * local, n'a pas de forme d'onde (422). Un serveur antérieur à la route
 * répond 404 / 405 : l'écran dit alors que la fonction n'est pas disponible.
 */
import { authHeaders, BASE } from './api';
import { clearToken } from './auth';
import { genreDeRefus, type GenreErreurSpectrogramme } from './spectrogramme';

/** Colonnes demandées : le défaut du serveur. */
export const COLONNES_FORME_ONDE = 1000;
/** En échelle dB, le bas de l'échelle (le centre du tracé). */
export const PLANCHER_ECHELLE_DB = -60;

export interface SectionFormeOnde {
  etat: 'a_jour' | 'absent';
  url: string;
  colonnes: number;
}

export interface ChiffresOnde {
  crete_dbfs: number | null;
  rms_dbfs: number | null;
  facteur_crete_db: number | null;
  ecretes: number;
}

export interface VoieOnde extends ChiffresOnde {
  canal: number;
  min: number[];
  max: number[];
  rms: number[];
}

export interface FormeOnde {
  version: number;
  track_id: number;
  colonnes: number;
  canaux: number;
  sample_rate: number;
  debut_s: number;
  duree_s: number;
  seuil_ecretage_dbfs: number;
  global: ChiffresOnde;
  voies: VoieOnde[];
  calcule_le?: string;
  duree_calcul_ms?: number;
}

export type GenreErreurFormeOnde = GenreErreurSpectrogramme;

export class ErreurFormeOnde extends Error {
  genre: GenreErreurFormeOnde;
  constructor(genre: GenreErreurFormeOnde, detail = '') {
    super(`forme d'onde: ${genre}${detail ? ` (${detail})` : ''}`);
    this.genre = genre;
  }
}

export interface Plage { debut: number; fin: number }

export async function chargerFormeOnde(
  trackId: number,
  opts: { colonnes?: number; plage?: Plage | null; signal?: AbortSignal } = {},
): Promise<FormeOnde> {
  const p = new URLSearchParams({ colonnes: String(opts.colonnes ?? COLONNES_FORME_ONDE) });
  if (opts.plage) {
    p.set('debut_s', opts.plage.debut.toFixed(3));
    p.set('fin_s', opts.plage.fin.toFixed(3));
  }
  let resp: Response;
  try {
    resp = await fetch(`${BASE}/library/tracks/${trackId}/forme-onde?${p}`, {
      headers: authHeaders({ Accept: 'application/json' }), signal: opts.signal,
    });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new ErreurFormeOnde('reseau');
  }
  if (!resp.ok) {
    const corps = await resp.text().catch(() => '');
    const genre = resp.status === 405 ? 'indisponible' : genreDeRefus(resp.status, corps);
    if (genre === 'session') clearToken();
    throw new ErreurFormeOnde(genre, `${resp.status}`);
  }
  const f = (await resp.json()) as FormeOnde;
  if (!f || !Array.isArray(f.voies)) throw new ErreurFormeOnde('impossible', 'contrat');
  return f;
}

export type Echelle = 'lineaire' | 'db';

/**
 * Une amplitude (−1..1) en ordonnée normalisée (−1..1, 0 au centre).
 * Linéaire : telle quelle. dB : |x| placé entre le plancher (centre) et
 * 0 dBFS (bord), le signe conservé — les faibles niveaux deviennent visibles.
 */
export function versY(x: number, echelle: Echelle, plancher = PLANCHER_ECHELLE_DB): number {
  const a = Math.min(1, Math.abs(x));
  if (echelle === 'lineaire') return Math.sign(x) * a;
  if (a <= 0) return 0;
  const db = 20 * Math.log10(a);
  const v = Math.max(0, (db - plancher) / -plancher);
  return Math.sign(x) * Math.min(1, v);
}

/** Les graduations de l'échelle, en dBFS, avec leur ordonnée (0..1 depuis le centre). */
export function graduationsOnde(echelle: Echelle): { db: number; y: number }[] {
  const dbs = echelle === 'lineaire' ? [0, -6, -12, -20] : [0, -6, -12, -24, -48];
  return dbs.map((db) => ({ db, y: versY(10 ** (db / 20), echelle) }));
}

/**
 * Le chemin SVG d'une bande : le haut suit `haut`, le bas suit `bas`, sur
 * `largeur` × `hauteur` pixels, centre à mi-hauteur.
 */
export function cheminBande(
  haut: number[], bas: number[], largeur: number, hauteur: number, echelle: Echelle,
): string {
  const n = Math.min(haut.length, bas.length);
  if (n === 0) return '';
  const demi = hauteur / 2;
  const x = (i: number) => (n === 1 ? largeur / 2 : (i / (n - 1)) * largeur);
  const y = (v: number) => demi - versY(v, echelle) * demi;
  const arrondi = (v: number) => Math.round(v * 10) / 10;
  const points: string[] = [];
  for (let i = 0; i < n; i += 1) points.push(`${arrondi(x(i))},${arrondi(y(haut[i]))}`);
  for (let i = n - 1; i >= 0; i -= 1) points.push(`${arrondi(x(i))},${arrondi(y(bas[i]))}`);
  return `M${points.join('L')}Z`;
}

/** Les index des colonnes qui touchent le seuil d'écrêtage (en dBFS). */
export function colonnesEcretees(voie: VoieOnde, seuilDbfs: number): number[] {
  const seuil = 10 ** (seuilDbfs / 20) - 1e-4;
  const out: number[] = [];
  for (let i = 0; i < voie.max.length; i += 1) {
    if (voie.max[i] >= seuil || voie.min[i] <= -seuil) out.push(i);
  }
  return out;
}

/** La forme réduite aux colonnes de la plage (repli du zoom sans serveur). */
export function trancher(f: FormeOnde, plage: Plage): FormeOnde {
  const n = f.colonnes;
  if (n <= 0 || f.duree_s <= 0) return f;
  const parCol = f.duree_s / n;
  const i0 = Math.max(0, Math.min(n - 1, Math.floor((plage.debut - f.debut_s) / parCol)));
  const i1 = Math.max(i0 + 1, Math.min(n, Math.ceil((plage.fin - f.debut_s) / parCol)));
  return {
    ...f,
    colonnes: i1 - i0,
    debut_s: f.debut_s + i0 * parCol,
    duree_s: (i1 - i0) * parCol,
    voies: f.voies.map((v) => ({ ...v, min: v.min.slice(i0, i1), max: v.max.slice(i0, i1), rms: v.rms.slice(i0, i1) })),
  };
}

/**
 * Zoom ×`facteur` autour du centre de la plage (`facteur` < 1 : dézoom),
 * borné à la piste ; rend `null` quand la plage couvre toute la piste.
 */
export function zoomer(plage: Plage | null, facteur: number, duree: number, minimum = 0.05): Plage | null {
  const p = plage ?? { debut: 0, fin: duree };
  const centre = (p.debut + p.fin) / 2;
  const largeur = Math.min(duree, Math.max(minimum, (p.fin - p.debut) / facteur));
  if (largeur >= duree - 1e-9) return null;
  let debut = centre - largeur / 2;
  debut = Math.max(0, Math.min(duree - largeur, debut));
  return { debut, fin: debut + largeur };
}

/** −6,02 → « −6,0 » dans la langue (vrai signe moins) ; `null` → « −∞ ». */
export function nombreDb(v: number | null | undefined, langue: string): string {
  if (v == null || !Number.isFinite(v)) return '−∞';
  const s = new Intl.NumberFormat(langue, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(v));
  return v < -0.05 ? `−${s}` : s;
}

/** Secondes → « m:ss » (ou « m:ss,d » sous dix secondes de plage). */
export function tempsLisible(s: number, fin = false): string {
  const total = Math.max(0, s);
  const m = Math.floor(total / 60);
  const r = total - m * 60;
  const sec = fin ? r.toFixed(1).padStart(4, '0') : String(Math.floor(r)).padStart(2, '0');
  return `${m}:${sec}`;
}
