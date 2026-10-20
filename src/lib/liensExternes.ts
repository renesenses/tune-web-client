/**
 * tune-server-rust#6001 — « Voir sur ProgArchives / Metal Archives /
 * AllMusic » sur la fiche d'un artiste et d'un album.
 *
 * Arbitrage de Bertrand (10/10/2026) : des LIENS seulement, sans recopier les
 * contenus de ces sites. Le serveur tire les adresses des relations d'URL de
 * MusicBrainz (`GET /library/{artists|albums}/{id}/external-links`).
 *
 * L'écran se méfie quand même de ce qu'il reçoit : il n'ouvre qu'une adresse
 * `https` de l'un des trois sites — jamais un autre hôte, jamais un autre
 * schéma (`javascript:`).
 */
export type StatutLiens = 'ok' | 'non_identifie' | 'inconnu' | 'indisponible';

export interface LienExterne {
  site: string;
  nom: string;
  url: string;
}

export interface ReponseLiens {
  statut: StatutLiens;
  mbid: string | null;
  liens: LienExterne[];
}

const HOTES: Record<string, readonly string[]> = {
  progarchives: ['progarchives.com', 'www.progarchives.com'],
  'metal-archives': ['metal-archives.com', 'www.metal-archives.com'],
  allmusic: ['allmusic.com', 'www.allmusic.com'],
};

export function lienSur(l: LienExterne | null | undefined): boolean {
  if (!l || typeof l.url !== 'string' || typeof l.nom !== 'string' || !l.nom.trim()) return false;
  const hotes = HOTES[l.site];
  if (!hotes) return false;
  try {
    const u = new URL(l.url);
    return u.protocol === 'https:' && hotes.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Les liens à afficher : vide hors `ok`, et seulement les liens sûrs. */
export function liensAffichables(r: ReponseLiens | null | undefined): LienExterne[] {
  if (!r || r.statut !== 'ok' || !Array.isArray(r.liens)) return [];
  return r.liens.filter(lienSur);
}
