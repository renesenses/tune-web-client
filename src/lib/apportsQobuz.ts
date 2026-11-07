/**
 * tune-server-rust#8077 — les APPORTS QOBUZ d'un album de la bibliothèque :
 * ce que Qobuz complète (label, date de sortie, UPC, ℗ et ©, genres, livret,
 * récompenses, hi-res, pochette HD, crédits), sans jamais écraser une donnée
 * locale. Chaque donnée porte sa source, `qobuz` ; tout se retire d'un geste.
 *
 * Routes (contrat : `docs/apports-qobuz-contrat.md` du serveur) :
 *  - `GET    /library/albums/{id}/apports-qobuz` → {@link ApportsQobuz}
 *  - `DELETE /library/albums/{id}/apports-qobuz` → retrait complet
 *  - `POST   /library/albums/{id}/apports-qobuz/confirmer` → applique un
 *    rapprochement « à confirmer »
 *
 * Ce module lit la réponse sans rien supposer : un champ absent ou mal formé
 * n'est pas affiché, une adresse qui n'est pas en `https` n'est pas proposée.
 */

export type StatutApports = 'applique' | 'a_confirmer' | 'aucun' | 'retire';

export interface ChampApporte<T = unknown> {
  valeur: T;
  source: string;
}

export interface ApportsQobuz {
  source?: string;
  statut: StatutApports | null;
  methode?: string | null;
  service_album_id?: string | null;
  service_url?: string | null;
  motif?: string | null;
  pistes_locales?: number;
  pistes_rapprochees?: number;
  verifie_le?: string;
  service_connecte?: boolean;
  champs?: Record<string, ChampApporte>;
  pistes?: Record<string, Record<string, ChampApporte>>;
}

/** Une ligne de la section, prête à afficher. */
export interface LigneApport {
  /** Clé de traduction du libellé, ou `null` (℗ et © se suffisent). */
  cle: string | null;
  texte: string;
  /** Adresse `https` à ouvrir dans un nouvel onglet. */
  url?: string;
  source: string;
}

function adresseSure(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

const chaine = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Les lignes de la section « Compléments Qobuz », dans l'ordre de la fiche.
 * Rien hors d'un rapprochement appliqué.
 */
export function lignesApports(a: ApportsQobuz | null | undefined): LigneApport[] {
  if (!a || a.statut !== 'applique' || !a.champs) return [];
  const out: LigneApport[] = [];
  const c = a.champs;
  const src = (k: string) => (typeof c[k]?.source === 'string' ? c[k].source : 'qobuz');
  const texte = (k: string, cle: string | null, prefixe = '') => {
    const t = chaine(c[k]?.valeur);
    if (t) out.push({ cle, texte: prefixe + t, source: src(k) });
  };
  texte('label', 'v2.album.qobuz.label');
  texte('date_de_sortie', 'v2.album.qobuz.releaseDate');
  texte('upc', 'v2.album.qobuz.upc');
  texte('phonogramme', null, '℗ ');
  texte('copyright', null, '© ');
  const genres = c.genres?.valeur;
  if (Array.isArray(genres)) {
    const g = genres.map(chaine).filter((x): x is string => !!x);
    if (g.length) out.push({ cle: 'v2.album.qobuz.genres', texte: g.join(', '), source: src('genres') });
  }
  const recompenses = c.recompenses?.valeur;
  if (Array.isArray(recompenses)) {
    for (const r of recompenses as Array<Record<string, unknown>>) {
      const nom = chaine(r?.nom);
      if (!nom) continue;
      const details = [chaine(r.publication), chaine(r.date)].filter(Boolean).join(', ');
      out.push({ cle: 'v2.album.qobuz.awards', texte: details ? `${nom} (${details})` : nom, source: src('recompenses') });
    }
  }
  const h = c.hires?.valeur as { bit_depth?: unknown; sample_rate?: unknown } | undefined;
  if (h && typeof h === 'object') {
    const bits = Number(h.bit_depth);
    const hz = Number(h.sample_rate);
    const parts = [bits > 0 ? `${bits} bits` : '', hz > 0 ? `${(hz / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kHz` : '']
      .filter(Boolean).join(' / ');
    out.push({ cle: 'v2.album.qobuz.hires', texte: parts, source: src('hires') });
  }
  const livrets = c.livrets?.valeur;
  if (Array.isArray(livrets)) {
    for (const l of livrets as Array<Record<string, unknown>>) {
      if (adresseSure(l?.url)) out.push({ cle: 'v2.album.qobuz.booklet', texte: chaine(l.name) ?? '', url: l.url, source: src('livrets') });
    }
  }
  const p = c.pochette_hd?.valeur as { url?: unknown } | undefined;
  if (p && adresseSure(p.url)) out.push({ cle: 'v2.album.qobuz.coverHd', texte: '', url: p.url, source: src('pochette_hd') });
  return out;
}

/** Les crédits d'album repris de Qobuz (`source: "qobuz"`), en lignes « Nom — rôle ». */
export function creditsQobuz(
  credits: Array<{ artist_name?: unknown; role?: unknown; instrument?: unknown; source?: unknown; track_number?: unknown }> | null | undefined,
): Array<{ nom: string; role: string; pistes: number[] }> {
  const par = new Map<string, { nom: string; role: string; pistes: number[] }>();
  for (const c of credits ?? []) {
    if (c?.source !== 'qobuz') continue;
    const nom = chaine(c.artist_name);
    if (!nom) continue;
    const role = [chaine(c.role), chaine(c.instrument)].filter(Boolean).join(', ');
    const k = `${nom}\u0000${role}`;
    const e = par.get(k) ?? { nom, role, pistes: [] };
    const n = Number(c.track_number);
    if (Number.isInteger(n) && n > 0 && !e.pistes.includes(n)) e.pistes.push(n);
    par.set(k, e);
  }
  return [...par.values()];
}

/** Le bouton « Retirer » n'a de sens que s'il y a quelque chose à retirer. */
export function retirable(a: ApportsQobuz | null | undefined): boolean {
  return !!a && a.statut === 'applique';
}

/** « Confirmer » : un rapprochement douteux qui désigne un album Qobuz. */
export function confirmable(a: ApportsQobuz | null | undefined): boolean {
  return !!a && a.statut === 'a_confirmer' && !!chaine(a.service_album_id);
}
