/**
 * web#2210 — fil 2302, point 18 (FabienM, rc6) : « L'action "autres versions"
 * d'un titre de service (Qobuz/Bandcamp) ne donne pas la même fenêtre qu'un
 * titre de sa bibliothèque. Il faut harmoniser les fenêtres, prendre celle du
 * local comme référence ».
 *
 * La fenêtre d'un titre LOCAL dessine la réponse regroupée du serveur
 * (`/library/tracks/{id}/version-groups`, tune-server-rust#2264) : des
 * sections, une ligne par exemplaire, la qualité, la durée, le menu « … ».
 * Celle d'un titre de SERVICE n'a qu'un rapprochement par titre et artiste
 * (`versionsParTitre`), rendu jusqu'ici en tuiles plates.
 *
 * Ce module donne au rapprochement la FORME de la réponse regroupée, pour que
 * le panneau n'ait plus qu'un rendu. Un exemplaire par section : rien, dans
 * un rapprochement par titre, ne prouve que deux résultats sont le même
 * enregistrement — les réunir inventerait un lien que le serveur n'a pas
 * établi. Aucun n'est « joué par défaut » : la règle de version du profil ne
 * s'applique qu'à une piste de la bibliothèque, et le bandeau n'aurait rien à
 * désigner (même fil, remarque reprise de web#2017).
 */
import type * as api from './api';
import type { GroupesVersions, MembreGroupe } from './groupesVersions';
import { ordonnerVersionsService, type OrdreVersions } from './versionsPiste';

function membre(m: Omit<MembreGroupe, 'isrc' | 'musicbrainz_recording_id' | 'quality' | 'available' | 'link' | 'is_reference' | 'is_default'>): MembreGroupe {
  return {
    ...m,
    isrc: null, musicbrainz_recording_id: null, quality: null, available: null,
    link: null, is_reference: false, is_default: false,
  };
}

export function groupesParTitre(groupe: api.OtherVersionGroup, ordre: OrdreVersions): GroupesVersions {
  const membres: MembreGroupe[] = [];
  for (const v of groupe.versions ?? []) {
    if (v.track_id == null) continue;
    membres.push(membre({
      source: 'local', track_id: v.track_id, source_id: null,
      title: groupe.title, artist_name: v.artist_name ?? groupe.artist_name ?? '',
      album_title: v.album_title ?? '', album_id: v.album_id, cover_path: v.cover_path,
      kind: 'version', duration_ms: v.duration_ms ?? null,
    }));
  }
  for (const v of ordonnerVersionsService(groupe.streaming ?? [], ordre)) {
    // Une reprise sans destination reste MONTRÉE (c'est une information),
    // comme dans les tuiles : `corpsMembre` la rendra simplement inerte.
    membres.push(membre({
      source: v.service, track_id: null, source_id: v.source_id,
      title: v.title, artist_name: v.artist_name ?? '',
      album_title: v.album_title ?? '', album_id: v.album_id, cover_path: v.cover_path,
      kind: v.kind, duration_ms: v.duration_ms ?? null,
    }));
  }
  return {
    track_id: 0,
    title: groupe.title,
    artist_name: groupe.artist_name,
    rule: 'none',
    rule_origin: 'default',
    groups: membres.map((m) => ({
      identity: null, isrc: null, musicbrainz_recording_id: null,
      contains_reference: false, default: null, members: [m],
    })),
  };
}
