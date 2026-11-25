/** Tris et regroupements des écrans Nocturne (purs, sans réseau). */
import type { Album } from '../../lib/types';

export type TriNocturne = 'ajout' | 'titre' | 'artiste' | 'annee';

const comparer = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true }).compare;

export function trierAlbums(liste: Album[], tri: TriNocturne): Album[] {
  const c = [...liste];
  switch (tri) {
    case 'ajout':
      return c.sort((a, b) => (b.added_at ?? 0) - (a.added_at ?? 0));
    case 'titre':
      return c.sort((a, b) => comparer(a.title ?? '', b.title ?? ''));
    case 'artiste':
      return c.sort((a, b) => comparer(a.artist_name ?? '', b.artist_name ?? '') || comparer(a.title ?? '', b.title ?? ''));
    case 'annee':
      return c.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  }
}

/** Le premier genre d'un album (la liste multiple est séparée par « ; », « , » ou « / »). */
export function genrePrincipal(a: Album): string | null {
  const brut = (a.genre || a.genres || '').split(/[;,/]/)[0]?.trim();
  return brut ? brut : null;
}

/**
 * Les `n` genres les plus fournis de la bibliothèque, chacun avec ses albums
 * (au moins `minimum` par genre, sans quoi une rangée n'a pas de sens).
 */
export function rangeesParGenre(liste: Album[], n = 6, minimum = 4): { genre: string; albums: Album[] }[] {
  const groupes = new Map<string, Album[]>();
  for (const a of liste) {
    const g = genrePrincipal(a);
    if (!g) continue;
    const cle = g.toLowerCase();
    const l = groupes.get(cle);
    if (l) l.push(a);
    else groupes.set(cle, [a]);
  }
  return [...groupes.values()]
    .filter((l) => l.length >= minimum)
    .sort((a, b) => b.length - a.length)
    .slice(0, n)
    .map((l) => ({ genre: genrePrincipal(l[0]) as string, albums: trierAlbums(l, 'ajout') }));
}
