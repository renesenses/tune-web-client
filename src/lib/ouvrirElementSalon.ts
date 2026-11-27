/**
 * Le clic sur une pochette d'un widget de l'accueil de Tune, dans la coquille
 * Roon-like (accueil, retouche du 27/11/2026). `gesteDeLaCarte` dit quoi
 * faire ; ce module le fait avec les chemins de la coquille.
 */
import { get } from 'svelte/store';
import { t } from './i18n';
import type { Element } from './accueilWidgets';
import { gesteDeLaCarte } from './accueilRoonLike';
import { gestesNavigationService } from './stores/navigation';
import { currentZoneId } from './stores/zones';
import { allerA } from './stores/salon';
import { ouvrirArtisteDepuis } from './ouvrirArtisteDepuis';
import { ouvrirCollection, ouvrirParRaccourci, ouvrirSmartPlaylist } from './ouvrirParRaccourci';
import { notifierErreur } from './notifierErreur';

export function ouvrirElementSalon(e: Element): void {
  const g = gesteDeLaCarte(e);
  switch (g.sorte) {
    case 'album': allerA({ page: 'album', id: g.id }); return;
    case 'albumService':
      get(gestesNavigationService)?.ouvrirAlbum({ service: g.service, albumId: g.albumId, titre: g.titre, pochette: g.pochette, artiste: g.artiste });
      return;
    case 'artiste':
      if (e.artisteObjet) void ouvrirArtisteDepuis(e.artisteObjet, 'home');
      else if (e.artiste) void ouvrirArtisteDepuis(e.artisteService ? { name: e.artiste, service_ecoute: e.artisteService } : { name: e.artiste }, 'home');
      return;
    case 'cible': {
      const c = e.cible!;
      if (c.sorte === 'playlist') void ouvrirParRaccourci('playlists', `playlists:${c.id}`, c.id, c.nom);
      else if (c.sorte === 'smart_playlist') ouvrirSmartPlaylist({ id: c.id, name: c.nom });
      else ouvrirCollection({ id: c.id, name: c.nom, smart: c.sorte === 'smart_collection' });
      return;
    }
    case 'zone':
      if (g.zoneId != null) currentZoneId.set(g.zoneId);
      allerA({ page: 'lecture' });
      return;
    case 'lire': {
      const z = get(currentZoneId);
      if (z != null && e.jouer) Promise.resolve(e.jouer(z)).catch((err) => notifierErreur(get(t)('roonLike.accueil.lectureImpossible' as any), err));
      return;
    }
    default: return;
  }
}
