/**
 * Les deux liens de l'écran Écouter de la vue mini : l'artiste et l'album de
 * la piste en cours.
 *
 * La DÉCISION est celle de `NowPlaying` : `destinationArtiste` pour l'artiste,
 * l'identifiant de bibliothèque pour l'album. On ne la réécrit pas ; on ne fait
 * que l'exécuter. Un album sans identifiant de bibliothèque (radio, service)
 * mène à la Recherche sur son titre plutôt qu'à un lien mort.
 */
import { activeView, pendingSearchQuery } from './stores/navigation';
import { setSearchCriteria } from './stores/shortcuts';
import { destinationArtiste, estUnService, type DestinationArtiste } from './routageArtiste';
import type { NowPlaying } from './types';

export type DestinationAlbum =
  | { type: 'album'; albumId: number }
  | { type: 'recherche'; requete: string; source: string | null };

export function destinationAlbum(piste: NowPlaying | null | undefined): DestinationAlbum | null {
  if (!piste) return null;
  const id = piste.album_id;
  if (typeof id === 'number' && Number.isFinite(id) && !estUnService(piste.source ?? null) && piste.source !== 'radio') {
    return { type: 'album', albumId: id };
  }
  const titre = piste.album_title?.trim() ?? '';
  if (!titre) return null;
  return { type: 'recherche', requete: titre, source: estUnService(piste.source ?? null) ? (piste.source as string) : null };
}

export function destinationArtisteMini(piste: NowPlaying | null | undefined): DestinationArtiste | null {
  if (!piste) return null;
  return destinationArtiste({
    source: piste.source ?? null,
    artist_id: piste.artist_id ?? null,
    artist_name: piste.artist_name ?? null,
  });
}

function chercher(requete: string, source: string | null): void {
  pendingSearchQuery.set(requete);
  setSearchCriteria({ q: requete, source });
  activeView.set('search');
}

export async function ouvrirAlbumMini(piste: NowPlaying | null | undefined): Promise<void> {
  const d = destinationAlbum(piste);
  if (!d) return;
  if (d.type === 'recherche') { chercher(d.requete, d.source); return; }
  const { ouvrirAlbum } = await import('./libraryNavigation');
  await ouvrirAlbum(d.albumId);
}

export async function ouvrirArtisteMini(piste: NowPlaying | null | undefined): Promise<void> {
  const d = destinationArtisteMini(piste);
  if (!d) return;
  const nom = piste?.artist_name?.trim() ?? '';
  switch (d.type) {
    case 'artiste': {
      const { ouvrirArtisteDepuis } = await import('./ouvrirArtisteDepuis');
      await ouvrirArtisteDepuis({ id: d.artistId, name: nom, source: 'local' }, 'nowplaying');
      return;
    }
    case 'artiste-service': {
      const { ouvrirArtisteDeServiceParNom } = await import('./ouvrirArtisteDepuis');
      await ouvrirArtisteDeServiceParNom({ service: d.service, nom: d.nom, id: d.id }, 'nowplaying');
      return;
    }
    case 'recherche':
      chercher(d.requete, d.source);
      return;
    default:
      // `artiste-par-nom` : la Recherche sur le nom, sans périmètre.
      if (nom) chercher(nom, null);
  }
}
