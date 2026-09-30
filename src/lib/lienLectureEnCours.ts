/**
 * Où mène l'entrée « Lecture en cours » de la barre latérale — web#1784.
 *
 * Didier (fil 2036, 29/09/2026) : « faire en sorte que le lien "Lecture en
 * cours" nous amène directement sur la page de l'album ». FabienM, même fil :
 * « si le titre provient d'une playlist alors aller directement sur la page de
 * la playlist ». Go de Bertrand du 29/09/2026 : oui, derrière un réglage
 * DÉCOCHÉ par défaut (`preferences.lienLectureVersSource`). Décoché, la barre
 * garde son geste d'avant (`activeView.set('nowplaying')`) et ce module n'est
 * même pas appelé.
 *
 * ## D'où vient la lecture : le serveur le dit
 *
 * Le client ne devine rien. `GET /zones/{id}` publie `session_context_type`,
 * `_id` et `_source` : l'objet sur lequel l'auditeur a cliqué « Lire », et
 * chez qui. Ils survivent aux avances automatiques — la troisième piste d'une
 * playlist reste une écoute « playlist » —, ce que `current_track` ne sait
 * pas faire. On relit la zone AU CLIC plutôt que le magasin : les événements
 * de lecture ne portent pas ce contexte, et une lecture lancée depuis un
 * autre appareil laisserait dans le magasin celui d'avant.
 *
 * ## Les destinations
 *
 *   - contexte `playlist`, bibliothèque → la fiche de la playlist locale ;
 *   - contexte `playlist`, service      → la fiche de la playlist du service ;
 *   - tout le reste (album, piste, artiste, aucun contexte) → la fiche de
 *     l'ALBUM de ce qui joue, par `GET /zones/{id}/album-en-cours` — la même
 *     route que le titre d'album de l'écran Lecture en cours (#1361), qui
 *     tranche bibliothèque et service ;
 *   - REPLI SÛR : l'écran Lecture en cours, exactement le geste d'avant. Il
 *     s'applique à la RADIO (une station n'a pas de fiche), quand rien ne
 *     joue, et chaque fois qu'aucune fiche n'a pu être établie (404 de la
 *     route, playlist supprimée, flux sans album, serveur ancien).
 */
import { get } from 'svelte/store';
import * as api from './api';
import { currentZoneId, zones } from './stores/zones';
import {
  activeView,
  gestesNavigationService,
  pendingLibraryAlbum,
} from './stores/navigation';
import { ouvrirParRaccourci, ouvrirPlaylistDeService } from './ouvrirParRaccourci';
import type { Zone } from './types';

export type DestinationLecture =
  | { type: 'playlist'; id: number }
  | { type: 'playlistService'; service: string; id: string }
  | { type: 'album' }
  | { type: 'ecran' };

/**
 * La décision seule, sans effet : ce que la zone désigne.
 *
 * `album` veut dire « demander l'album au serveur » — la réponse peut encore
 * être « aucun », et c'est `ouvrirLienLectureEnCours` qui se replie alors.
 */
export function destinationLienLecture(zone: Zone | null | undefined): DestinationLecture {
  const piste = zone?.current_track;
  if (!zone || !piste) return { type: 'ecran' };
  // Une station n'a ni album ni playlist : sa page, c'est l'écran dédié.
  if (piste.source === 'radio') return { type: 'ecran' };
  const nature = zone.session_context_type ?? null;
  const id = zone.session_context_id ?? null;
  const chez = zone.session_context_source ?? null;
  if (nature === 'playlist' && id) {
    if (chez == null || chez === 'local') {
      const n = Number(id);
      if (Number.isInteger(n) && n > 0) return { type: 'playlist', id: n };
    } else {
      return { type: 'playlistService', service: chez, id };
    }
  }
  return { type: 'album' };
}

/** Le numéro du dernier clic : un clic plus récent, ou un changement d'écran
 *  pendant les requêtes, rend caduque la navigation d'un clic plus ancien. */
let clic = 0;

/**
 * Le geste de l'entrée « Lecture en cours » quand le réglage est coché.
 *
 * Asynchrone : il relit la zone, puis parfois l'album ou la playlist. Si
 * l'utilisateur a changé d'écran entre-temps, on n'y touche plus — l'arracher
 * à l'écran qu'il vient de choisir serait pire que de ne rien ouvrir.
 */
export async function ouvrirLienLectureEnCours(): Promise<void> {
  const moi = ++clic;
  const depart = get(activeView);
  const toujoursLa = () => moi === clic && get(activeView) === depart;
  const ecran = () => { if (toujoursLa()) activeView.set('nowplaying'); };

  const zid = get(currentZoneId);
  if (zid == null) { ecran(); return; }
  // Rien ne joue, ou une radio : inutile d'interroger le serveur.
  const enMagasin = get(zones).find((z) => z.id === zid) ?? null;
  if (destinationLienLecture(enMagasin).type === 'ecran') { ecran(); return; }

  const zone = await api.getZone(zid).catch(() => enMagasin);
  if (!toujoursLa()) return;
  const dest = destinationLienLecture(zone);

  try {
    if (dest.type === 'ecran') { ecran(); return; }

    if (dest.type === 'playlist') {
      // La playlist a pu être supprimée depuis : on vérifie avant de partir,
      // sinon l'écran Playlists s'ouvrirait sur sa liste, sans fiche.
      const pl = await api.getPlaylist(dest.id).catch(() => null);
      if (!toujoursLa()) return;
      if (pl) {
        await ouvrirParRaccourci('playlists', `playlists:${dest.id}`, dest.id, pl.name ?? '');
        return;
      }
    }

    if (dest.type === 'playlistService') {
      // La fiche d'une playlist de service ne relit pas son nom : il vient
      // d'ici. Sans nom, la fiche serait sans titre — on passe à l'album.
      const pl = await api.getStreamingPlaylist(dest.service, dest.id).catch(() => null);
      if (!toujoursLa()) return;
      if (pl?.name) {
        await ouvrirPlaylistDeService(dest.service, {
          source_id: String(pl.source_id ?? dest.id),
          name: pl.name,
          cover_path: pl.cover_path ?? null,
        });
        return;
      }
    }

    // L'album de ce qui joue — la route de #1361. 404 = aucun album connu.
    const ac = await api.getZoneCurrentAlbum(zid).catch(() => null);
    if (!toujoursLa()) return;
    if (ac?.kind === 'library' && ac.album_id) {
      const n = Number(ac.album_id);
      if (Number.isFinite(n) && n > 0) {
        pendingLibraryAlbum.set(n);
        activeView.set('library');
        return;
      }
    }
    const gestes = get(gestesNavigationService);
    if (ac?.kind === 'streaming' && ac.album_id && gestes) {
      const piste = zone?.current_track ?? null;
      gestes.ouvrirAlbum({
        service: ac.service,
        albumId: String(ac.album_id),
        titre: piste?.album_title ?? '',
        pochette: piste?.cover_path ?? null,
        artiste: piste?.artist_name ?? null,
        artisteId: ac.artist_id ?? null,
      });
      return;
    }
  } catch {
    /* le repli ci-dessous */
  }
  ecran();
}
