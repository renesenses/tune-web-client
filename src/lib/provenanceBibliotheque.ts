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

/**
 * Le libellé d'une provenance — menu « Source » de la Bibliothèque et
 * pastilles de la fiche artiste.
 *
 * Un serveur UPnP s'affiche sous le NOM qu'il s'annonce au registre
 * (`GET /network/media-servers`, `id` = son UDN) ; Bertrand, 14/09/2026 : jamais
 * `upnp` ni une IP quand un nom existe. À défaut, l'UDN abrégé, qui reste
 * distinctif quand deux serveurs cohabitent.
 */
export function libelleProvenance(cle: string, nomsServeurs: Record<string, string>, libelleLocal: string): string {
  if (cle === 'local') return libelleLocal;
  if (!cle.startsWith('upnp:')) return cle.toUpperCase();
  const udn = cle.slice(cle.indexOf(':') + 1);
  return nomsServeurs[udn] ?? `${udn.slice(0, 18)}…`;
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

/**
 * LE FILTRE « SOURCE » DE LA BIBLIOTHÈQUE, RETENU — web#2836 (Didier, fil 2753,
 * rc11) : « Local » choisi, un détour par Streaming › Qobuz, et la Bibliothèque
 * revenait à « Toutes les sources ».
 *
 * Même règle que la fiche artiste (#1874, `CLE_SOURCE_FICHE`) : une préférence
 * d'AFFICHAGE, dans le navigateur (`preferencesEcran`), lue au montage et
 * écrite à chaque changement. Clé distincte : les deux écrans ne filtrent pas
 * la même chose (une clé unique ici, un ensemble de pastilles là-bas).
 */
export const CLE_SOURCE_BIBLIOTHEQUE = 'v2.lib.source';

/**
 * La source relue. Vide, illisible ou démesurée (valeur d'une autre version,
 * stockage trafiqué) rend `null` = « Toutes les sources » : un filtre qu'on ne
 * sait pas relire ne doit pas vider la Bibliothèque.
 */
export function relireProvenance(texte: string | null | undefined): string | null {
  const v = texte?.trim();
  return v && v.length <= 200 ? v : null;
}

/**
 * Ce qu'on fait d'une source RETENUE, une fois la Bibliothèque connue.
 *
 * - seul un serveur UPnP précis (`upnp:<udn>`) peut disparaître : retiré
 *   depuis, il vaut « Toutes les sources » — `oublier` — plutôt qu'une grille
 *   vide sur une entrée « 0 » ;
 * - tout le reste est GARDÉ : `local` et `upnp` sont des entrées fixes du
 *   menu, et une source de service (`qobuz`…) n'arrive dans la grille
 *   qu'avec les favoris de service, chargés à part et plus tard — l'oublier
 *   avant serait perdre le choix au retour de Streaming › Qobuz ;
 * - tant que la bibliothèque (`presentes`) et la liste des serveurs indexés
 *   (`serveurs`) ne sont pas arrivées : `attendre`. `serveurs` vaut `[]`
 *   quand le serveur Tune ne sait pas la donner.
 */
export function verdictProvenanceRetenue(
  cle: string,
  connues: { presentes: readonly string[] | null; serveurs: readonly string[] | null },
): 'garder' | 'oublier' | 'attendre' {
  if (!cle.startsWith('upnp:')) return 'garder';
  if (connues.presentes?.includes(cle) || connues.serveurs?.includes(cle)) return 'garder';
  if (connues.presentes == null || connues.serveurs == null) return 'attendre';
  return 'oublier';
}
