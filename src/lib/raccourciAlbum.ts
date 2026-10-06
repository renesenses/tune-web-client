/**
 * UN RACCOURCI SUR UNE FICHE D'ALBUM — fil forum 2143, point 2 (FabienM,
 * v1.0.0-rc2) : « Il est impossible par exemple de définir un raccourci sur
 * un sous menu, sur une playlist ouverte, un album ouvert, une page
 * artiste... ».
 *
 * Même modèle que la page d'artiste (`raccourciArtiste`, #1501) : la fiche se
 * déclare comme cible (`setShortcutTarget`), `captureCurrentView` la fige, et
 * le raccourci la rouvre par le chemin qu'emprunte déjà « Aller à l'album » :
 *
 *   • album de la BIBLIOTHÈQUE → `pendingLibraryAlbum` + vue `library`
 *     (le contrat que `LibraryV2` lit, `gestesObjet.ouvrirParDefaut`) ;
 *   • album d'un SERVICE → `ficheAlbumService` + vue `streamingalbum`
 *     (la fiche de la coquille, #1361).
 *
 * La fiche est un CALQUE monté par une douzaine d'écrans (Bibliothèque,
 * Favoris, Collections, Étiquettes, Recherche, Streaming…) : le raccourci ne
 * retient pas l'écran d'où il a été posé, il retient l'ALBUM. Le rouvrir
 * depuis n'importe où montre la même fiche.
 *
 * `key` est l'identité stable de l'album, service compris : l'album 42 de
 * Qobuz n'est pas l'album 42 de la bibliothèque (`cleDetailAlbum`, #980).
 *
 * Ne sont PAS visés, et la fiche ne publie alors rien (le raccourci retombe
 * sur l'écran, comme avant) : un album d'un autre serveur Tune (`depot`, ses
 * identifiants ne sont pas les nôtres) et un album Bandcamp (désigné par une
 * URL, sans route de fiche commune).
 */
import { get } from 'svelte/store';
import type { ShortcutTarget } from './stores/shortcuts';
import { activeView, pendingLibraryAlbum, vueDeRetour, type View } from './stores/navigation';
import { ficheAlbumService, type CibleFicheAlbumService } from './stores/streaming';
import { estDeBibliotheque } from './provenanceBibliotheque';

/** Le préfixe de clé de toutes les cibles d'album. */
export const PREFIXE_CIBLE_ALBUM = 'album:';

/** Ce que la fiche sait d'elle-même au moment où elle se déclare. */
export interface FicheAlbumPourRaccourci {
  album: any;
  service?: string | null;
  depot?: unknown;
  bandcamp?: string | null;
}

export function cibleRaccourciAlbum(f: FicheAlbumPourRaccourci): ShortcutTarget | null {
  const a = f?.album;
  if (!a || f.depot || f.bandcamp) return null;
  const titre = String(a.title ?? '').trim();
  const label = titre || undefined;
  if (!f.service) {
    if (!estDeBibliotheque(a) || !Number.isInteger(a.id)) return null;
    return { key: `${PREFIXE_CIBLE_ALBUM}local:${a.id}`, restore: { id: a.id, titre }, label };
  }
  const id = a.source_id == null ? '' : String(a.source_id).trim();
  if (!id) return null;
  const fiche: CibleFicheAlbumService = {
    service: f.service as CibleFicheAlbumService['service'],
    id,
    titre,
    pochette: a.cover_path ?? null,
    artiste: a.artist_name ?? null,
    artisteId: a.artist_id == null ? null : String(a.artist_id),
  };
  return { key: `${PREFIXE_CIBLE_ALBUM}${f.service}:${id}`, restore: { fiche }, label };
}

export function estCibleAlbum(cle: string | null | undefined): boolean {
  return typeof cle === 'string' && cle.startsWith(PREFIXE_CIBLE_ALBUM);
}

/** La vue que le raccourci retient pour cette cible d'album. */
export function vueDeLaCibleAlbum(cle: string): View {
  return cle.startsWith(`${PREFIXE_CIBLE_ALBUM}local:`) ? 'library' : 'streamingalbum';
}

/**
 * Rouvrir la fiche. `depuis` : l'écran d'où l'on clique le raccourci, pour que
 * le Retour d'une fiche de service y ramène (même contrat que la page
 * d'artiste). Rend `false` quand la charge est illisible : l'appelant garde
 * alors le chemin ordinaire.
 */
export function ouvrirRaccourciAlbum(restore: any, depuis: View = get(activeView)): boolean {
  if (Number.isInteger(restore?.id)) {
    pendingLibraryAlbum.set(restore.id);
    activeView.set('library');
    return true;
  }
  const fiche = restore?.fiche as CibleFicheAlbumService | undefined;
  if (fiche?.service && fiche?.id) {
    vueDeRetour.set(depuis === 'streamingalbum' ? 'home' : depuis);
    ficheAlbumService.set({ ...fiche });
    activeView.set('streamingalbum');
    return true;
  }
  return false;
}
