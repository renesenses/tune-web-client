/**
 * « AJOUTER AUX RACCOURCIS » DEPUIS LE MENU « … » D'UN OBJET — web#1922
 * (FabienM, fil 2143, point 2, v1.0.0-rc2) : « Il est impossible par exemple
 * de définir un raccourci sur un sous menu, sur une playlist ouverte, un album
 * ouvert, une page artiste... ».
 *
 * La fiche ouverte se déclare déjà comme cible (`setShortcutTarget`, #1918),
 * et le signet de la coquille la fige. Ce module donne le MÊME raccourci
 * depuis le menu « … » d'une vignette ou d'une ligne, sans ouvrir la fiche :
 * il calcule, à partir de l'objet seul, la vue et la cible que la fiche
 * publierait si on l'ouvrait. Mêmes clés, même charge : la déduplication
 * (`shortcutKey`) tient pour un seul raccourci celui posé depuis le menu et
 * celui posé depuis la fiche, et `navigateToShortcut` les rouvre par le même
 * chemin.
 *
 *   • album de la bibliothèque, album d'un service → `lib/raccourciAlbum` ;
 *   • artiste → `lib/raccourciArtiste` (la page commune, #1501) ;
 *   • playlist locale ou de service → l'écran Playlists de la barre latérale
 *     (`playlistmanager`), clés de `PlaylistsV2` (`playlists:12`,
 *     `streamingplaylists:qobuz:123`) ;
 *   • playlist intelligente → `smartplaylists:<id>` ;
 *   • collection, collection intelligente → `collections:` /
 *     `smartcollections:`.
 *
 * 🔴 Ce qui ne se désigne pas n'a PAS d'entrée (`null`) : un album d'un autre
 * serveur Tune, un album Bandcamp (même exclusion que la fiche), un artiste
 * connu par son seul nom, un label. Un raccourci qui rouvrirait autre chose
 * que ce qu'on a désigné serait pire qu'une entrée absente.
 */
import type { View } from './stores/navigation';
import type { PropositionRaccourci, ShortcutTarget } from './stores/shortcuts';
import type { ObjetMenu } from './gestesObjet';
import { cibleRaccourciAlbum, vueDeLaCibleAlbum } from './raccourciAlbum';
import { cibleRaccourciArtiste } from './raccourciArtiste';

const proposition = (view: View, target: ShortcutTarget | null): PropositionRaccourci | null =>
  target ? { view, state: { target: { key: target.key, restore: target.restore } }, label: target.label } : null;

const avecLibelle = (key: string, restore: any, nom: string | null | undefined): ShortcutTarget => {
  const label = (nom ?? '').trim() || undefined;
  return { key, restore, label };
};

export function propositionRaccourciObjet(o: ObjetMenu | null | undefined): PropositionRaccourci | null {
  if (!o) return null;
  const local = o.id != null && Number.isInteger(o.id);
  const service = !local && !!o.service && !!o.sourceId ? o.service : null;
  switch (o.type) {
    case 'album': {
      if (service === 'bandcamp') return null;
      const cible = local
        ? cibleRaccourciAlbum({ album: { id: o.id, source: 'local', title: o.nom ?? '' } })
        : service
          ? cibleRaccourciAlbum({
              album: {
                source_id: o.sourceId, title: o.nom ?? '', cover_path: o.pochette ?? null,
                artist_name: o.artisteNom ?? null, artist_id: o.artisteId ?? null,
              },
              service,
            })
          : null;
      return cible ? proposition(vueDeLaCibleAlbum(cible.key), cible) : null;
    }
    case 'artiste': {
      if (!local && !service) return null;
      const cible = cibleRaccourciArtiste({ service: local ? null : service, id: String(local ? o.id : o.sourceId) }, o.nom);
      return proposition('streamingartist', cible);
    }
    case 'playlist': {
      if (local) return proposition('playlistmanager', avecLibelle(`playlists:${o.id}`, { id: o.id, name: o.nom ?? '' }, o.nom));
      if (!service) return null;
      const pl = {
        source_id: o.sourceId!, name: o.nom ?? '', track_count: 0, duration_ms: 0,
        cover_path: o.pochette ?? null, source: service,
      };
      return proposition(
        'playlistmanager',
        avecLibelle(`streamingplaylists:${service}:${o.sourceId}`, { kind: 'streaming', service, pl }, o.nom),
      );
    }
    case 'playlistIntelligente':
      return local
        ? proposition('smartplaylists', avecLibelle(`smartplaylists:${o.id}`, { id: o.id, name: o.nom ?? '' }, o.nom))
        : null;
    case 'collection':
    case 'collectionIntelligente': {
      if (!local) return null;
      const prefixe = o.type === 'collectionIntelligente' ? 'smartcollections' : 'collections';
      return proposition('collections', avecLibelle(`${prefixe}:${o.id}`, { id: o.id, name: o.nom ?? '' }, o.nom));
    }
    default:
      return null;
  }
}
