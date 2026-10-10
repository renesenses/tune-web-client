/**
 * #2030 — fil forum 2128 (Didier, 09/10/2026) : la saisie de la page d'un
 * service est GARDÉE d'un onglet à l'autre, et elle s'APPLIQUE à l'onglet
 * ouvert. Sur Éditorial, elle cherche dans le catalogue du service (requête
 * serveur) ; sur Playlists, Favoris et Genres, elle FILTRE ce que l'onglet
 * montre déjà. Ce module tient ce filtre, sans rien savoir de l'écran.
 */

/** Minuscules, sans accents : « Éditorial » et « editorial » se valent. */
export function plierTexte(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Le seuil est celui de la recherche du catalogue (deux caractères) : en deçà,
 * aucun filtre — l'onglet montre tout, comme le catalogue ne cherche rien.
 */
export const SEUIL_SAISIE = 2;

function nomDe(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return String(o.name ?? o.title ?? o.nom ?? '');
  }
  return String(v);
}

/** Tout ce qu'une vignette, une ligne ou une puce donne à lire. */
function texteDe(x: any): string {
  if (x == null) return '';
  if (typeof x !== 'object') return String(x);
  return [
    x.name, x.title, x.titre, x.nom, x.label,
    nomDe(x.artist), x.artist_name, x.artiste,
    nomDe(x.album), x.album_title,
    x.owner, x.description,
  ].filter((v) => v != null && v !== '').join(' ');
}

/** Tous les mots de la saisie doivent se trouver dans le texte de l'élément. */
export function correspondASaisie(x: unknown, saisie: string): boolean {
  const s = plierTexte(saisie).trim();
  if (s.length < SEUIL_SAISIE) return true;
  const texte = plierTexte(texteDe(x));
  return s.split(/\s+/).every((mot) => texte.includes(mot));
}

/** La liste telle que l'onglet la montre sous cette saisie. */
export function filtrerParSaisie<T>(items: readonly T[] | null | undefined, saisie: string): T[] {
  const liste = [...(items ?? [])];
  if (plierTexte(saisie).trim().length < SEUIL_SAISIE) return liste;
  return liste.filter((x) => correspondASaisie(x, saisie));
}
