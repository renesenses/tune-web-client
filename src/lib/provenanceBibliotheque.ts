import type { Album, Track } from './types';

type Provenance = { source?: string | null; source_id?: string | null };

/** La même identité de source pour les albums et les pistes indexées. */
export function provenanceDe(item: Provenance): string {
  const source = item.source?.trim() || 'local';
  if (source !== 'upnp') return source;
  const [udn, identite] = (item.source_id ?? '').split('|');
  return udn?.trim() && identite ? `upnp:${udn.trim()}` : 'upnp';
}

export function sourceCorrespond(source: string, filtre: string | null): boolean {
  return filtre == null || source === filtre || (filtre === 'upnp' && source.startsWith('upnp:'));
}

export function dansSource(item: Provenance, filtre: string | null): boolean {
  return sourceCorrespond(provenanceDe(item), filtre);
}

/** Un artiste peut appartenir à plusieurs serveurs et au local à la fois.
 * Les artistes de piste sont inclus, notamment sur les compilations. */
export function sourcesParArtiste(albums: readonly Album[], pistes: readonly Track[]): Map<number, Set<string>> {
  const resultat = new Map<number, Set<string>>();
  for (const item of [...albums, ...pistes]) {
    if (item.artist_id == null) continue;
    const sources = resultat.get(item.artist_id) ?? new Set<string>();
    sources.add(provenanceDe(item));
    resultat.set(item.artist_id, sources);
  }
  return resultat;
}

/** Chaque entrée représente UNE piste ou UN artiste : l'agrégat UPnP ne
 * compte jamais deux fois un artiste présent sur deux serveurs. */
export function compterSources(items: Iterable<Iterable<string>>): Map<string, number> {
  const comptes = new Map<string, number>();
  for (const sources of items) {
    const uniques = new Set(sources);
    if ([...uniques].some(s => sourceCorrespond(s, 'upnp'))) uniques.add('upnp');
    for (const source of uniques) comptes.set(source, (comptes.get(source) ?? 0) + 1);
  }
  return comptes;
}

export interface ComptesArtistesSources {
  comptes: Map<string, number>;
  total: number;
}

/**
 * 🔴 UNE provenance de BIBLIOTHÈQUE — `local`, `upnp`, `upnp:<udn>`, ou absente.
 *
 * Un serveur UPnP intégré à la bibliothèque (#4201) y dépose ses albums et ses
 * pistes : ils ont un `id` de bibliothèque, et `source: "upnp"` dit leur
 * PROVENANCE, pas un service de streaming. `source_id` y est l'adresse de
 * l'objet sur le serveur UPnP, pas un identifiant distant.
 *
 * Trois prédicats répondaient « bibliothèque ? » par `source === 'local'`
 * seul — la recherche, la clé d'historique d'un album et la file d'une piste.
 * Un album UPnP ouvert depuis la Recherche partait donc demander ses pistes au
 * « service » upnp : « unknown service: upnp » (Bertrand, .18, 17/09/2026 —
 * après le même défaut sur l'Accueil le même jour).
 */
export function estSourceDeBibliotheque(source: string | null | undefined): boolean {
  const s = String(source ?? '').trim().toLowerCase();
  return s === '' || s === 'local' || s === 'upnp' || s.startsWith('upnp:');
}

/** Un objet de la BIBLIOTHÈQUE : un identifiant, et une provenance de bibliothèque. */
export function estDeBibliotheque(x: { id?: unknown; source?: unknown } | null | undefined): boolean {
  return x?.id != null && estSourceDeBibliotheque(x.source == null ? null : String(x.source));
}
