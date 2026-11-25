/** Tris et regroupements des écrans Nocturne (purs, sans réseau). */
import { estMulticanal, getQualityTier } from '../../lib/utils';
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

/** Les albums d'une collection de la colonne Bibliothèque (filtres de Tune, côté client). */
export function albumsDeCollection(
  liste: Album[],
  cle: import('./navigationNocturne').CleCollection,
  favoris: Set<number>,
  maintenant = Date.now(),
): Album[] {
  const palier = (a: Album) => getQualityTier(a);
  switch (cle) {
    case 'hires': return liste.filter((a) => ['hires', 'hires_max', 'mqa'].includes(palier(a)));
    case 'dsd': return liste.filter((a) => palier(a) === 'dsd');
    case 'cd': return liste.filter((a) => palier(a) === 'cd');
    case 'compresse': return liste.filter((a) => palier(a) === 'lossy');
    case 'mono': return liste.filter((a) => a.max_channels === 1);
    case 'multicanal': return liste.filter((a) => estMulticanal(a));
    case 'favoris': return liste.filter((a) => a.id != null && favoris.has(a.id));
    case 'sansPochette': return liste.filter((a) => !a.cover_path);
    case 'recents': {
      // Les 90 derniers jours (date d'ajout en secondes ou en millisecondes).
      const borne = maintenant - 90 * 86_400_000;
      return trierAlbums(liste.filter((a) => {
        const t = a.added_at ?? 0;
        return (t < 1e12 ? t * 1000 : t) >= borne;
      }), 'ajout');
    }
    case 'doublons': {
      const cleDe = (a: Album) => `${(a.title ?? '').trim().toLowerCase()}\u0000${(a.artist_name ?? '').trim().toLowerCase()}`;
      const n = new Map<string, number>();
      for (const a of liste) n.set(cleDe(a), (n.get(cleDe(a)) ?? 0) + 1);
      return trierAlbums(liste.filter((a) => (n.get(cleDe(a)) ?? 0) > 1), 'titre');
    }
  }
}

/** La clé i18n du libellé de chaque collection. */
export const LIBELLE_COLLECTION: Record<import('./navigationNocturne').CleCollection, string> = {
  hires: 'v2.disco.hires',
  dsd: 'v2.disco.dsd',
  mono: 'zoneConfig.channels_mono',
  favoris: 'nav.favorites',
  recents: 'v2.home.wRecentlyAdded',
  sansPochette: 'nocturne.biblio.sansPochette',
  doublons: 'v2.meta.tabDoublons',
  multicanal: 'v2.disco.multichannel',
  cd: 'v2.disco.cd',
  compresse: 'v2.disco.lossy',
};
