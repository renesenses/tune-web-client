/**
 * Accueil Roon-like : les rangées de l'accueil de Tune, sous « Nouveautés
 * pour vous » (retouche du 27/11/2026, demande de Bertrand).
 *
 * L'accueil Roon-like dessine lui-même la salutation, les quatre chiffres,
 * « Dernièrement », « Écouter plus tard » et « Nouveautés pour vous ». Toutes
 * les AUTRES rangées de l'accueil de Tune — celles que le profil a rangées
 * (ou le défaut) : reprendre l'écoute, radios, playlists, recommandations,
 * classements… — suivent, dans le même langage (titre, flèches, « Plus »).
 *
 * Ne viennent pas en rangée :
 *   - ce que la page Roon-like dessine déjà (`DEJA_SUR_L_ACCUEIL`) ;
 *   - les formes qui ne sont pas une suite de pochettes (`chiffres`,
 *     `zones-cartes`, `bloc` : graphiques et cartes de zone, qui vivent dans
 *     le Tableau de bord et l'écran Zones), voir `FORMES_EN_RANGEE`.
 */
import type { Element, Widget } from './accueilWidgets';

/** Les widgets que la page Roon-like dessine déjà, à sa façon. */
export const DEJA_SUR_L_ACCUEIL: ReadonlySet<string> = new Set([
  'premiere-ligne', 'premiere-ligne-levente', 'statistiques',
  'recemment-ajoutes', 'nouveautes-artistes', 'ecouter-plus-tard',
  // Dessinés par les sections de l'accueil Roon-like (`SectionsAccueilSalon`).
  'recemment-ecoutes', 'parce-que-vous-aimez', 'qobuz-selection',
]);

/** Les formes qui se dessinent en rangée de pochettes. */
export const FORMES_EN_RANGEE: ReadonlySet<string> = new Set(['bande', 'tops']);

/**
 * Les rangées à ajouter, dans l'ordre de la disposition du profil, sans
 * doublon ni identifiant inconnu.
 */
export function rangeesDeLAccueil(disposition: readonly string[], parId: (id: string) => Widget | undefined): Widget[] {
  const vus = new Set<string>();
  const out: Widget[] = [];
  for (const id of disposition) {
    if (vus.has(id) || DEJA_SUR_L_ACCUEIL.has(id)) continue;
    vus.add(id);
    const w = parId(id);
    if (w && FORMES_EN_RANGEE.has(w.forme)) out.push(w);
  }
  return out;
}

/** Ce qu'un clic sur une pochette doit faire, dans la coquille Roon-like. */
export type GesteCarte =
  | { sorte: 'album'; id: number }
  | { sorte: 'albumService'; service: string; albumId: string; titre: string; pochette: string | null; artiste: string | null }
  | { sorte: 'artiste' }
  | { sorte: 'cible' }
  | { sorte: 'zone'; zoneId: number | null }
  | { sorte: 'lire' }
  | { sorte: 'aucun' };

export function gesteDeLaCarte(e: Pick<Element, 'ouvrir' | 'fiche' | 'source' | 'titre' | 'cover' | 'sous' | 'zoneId' | 'jouer' | 'cible' | 'artiste' | 'artisteObjet'>): GesteCarte {
  if (e.ouvrir === 'album' && e.fiche) {
    const f = e.fiche;
    if (f.id != null && Number.isFinite(Number(f.id))) return { sorte: 'album', id: Number(f.id) };
    const service = f.source ?? e.source ?? null;
    const albumId = f.source_id ?? f.id_service ?? null;
    if (service && albumId != null) {
      return { sorte: 'albumService', service, albumId: String(albumId), titre: f.title ?? e.titre, pochette: f.cover_path ?? e.cover ?? null, artiste: f.artist_name ?? e.sous ?? null };
    }
  }
  if (e.ouvrir === 'artiste' && (e.artiste || e.artisteObjet)) return { sorte: 'artiste' };
  if (e.ouvrir === 'cible' && e.cible) return { sorte: 'cible' };
  if (e.ouvrir === 'zone') return { sorte: 'zone', zoneId: e.zoneId ?? null };
  if (e.jouer) return { sorte: 'lire' };
  return { sorte: 'aucun' };
}

/* ── Écoutes récentes : quatre semaines × sept jours ─────────────────── */

export interface SemaineEcoute {
  /** Lundi de la semaine, AAAA-MM-JJ (heure locale). */
  lundi: string;
  totalMs: number;
  /** Lundi → dimanche ; `null` pour un jour à venir. */
  jours: (number | null)[];
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Les quatre dernières semaines (la plus ancienne d'abord, la semaine en
 * cours en dernier), à partir de la tendance quotidienne du tableau de bord
 * (`trend`, un jour = `AAAA-MM-JJ`). Un jour sans écoute vaut 0.
 */
export function grilleEcoutes(
  trend: readonly { day: string; listening_ms: number }[] | null | undefined,
  maintenant: Date = new Date(),
): { totalMs: number; semaines: SemaineEcoute[] } {
  const parJour = new Map<string, number>();
  for (const t of trend ?? []) {
    const k = String(t.day ?? '').slice(0, 10);
    if (k) parJour.set(k, (parJour.get(k) ?? 0) + Math.max(0, Number(t.listening_ms) || 0));
  }
  const aujourdhui = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  const decalage = (aujourdhui.getDay() + 6) % 7; // lundi = 0
  const lundiCourant = new Date(aujourdhui);
  lundiCourant.setDate(aujourdhui.getDate() - decalage);
  const semaines: SemaineEcoute[] = [];
  let totalMs = 0;
  for (let s = 3; s >= 0; s--) {
    const lundi = new Date(lundiCourant);
    lundi.setDate(lundiCourant.getDate() - 7 * s);
    const jours: (number | null)[] = [];
    let total = 0;
    for (let j = 0; j < 7; j++) {
      const d = new Date(lundi);
      d.setDate(lundi.getDate() + j);
      if (d > aujourdhui) { jours.push(null); continue; }
      const ms = parJour.get(iso(d)) ?? 0;
      jours.push(ms);
      total += ms;
    }
    totalMs += total;
    semaines.push({ lundi: iso(lundi), totalMs: total, jours });
  }
  return { totalMs, semaines };
}

/** « 0m », « 45m », « 3h 12m » : une durée d'écoute, courte. */
export function dureeCourte(ms: number | null | undefined): string {
  const min = Math.max(0, Math.round((Number(ms) || 0) / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/* ── Nouveautés pour vous ─────────────────────────────────────────────── */

/** Un single ou un EP se reconnaît à son titre : le service ne le dit pas ici. */
export const estSingle = (titre: string) => /\b(single|ep)\b/i.test(titre);

/** Les onglets à montrer : « Singles » seulement s'il y en a (pas d'onglet vide). */
export function ongletsNouveautes(titres: readonly string[]): ('albums' | 'singles')[] {
  const singles = titres.some(estSingle);
  const albums = titres.some((t) => !estSingle(t));
  const out: ('albums' | 'singles')[] = [];
  if (albums || !singles) out.push('albums');
  if (singles) out.push('singles');
  return out;
}
