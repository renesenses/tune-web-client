/**
 * Ce qu'on étiquette : un objet de la BIBLIOTHÈQUE, ou un objet de SERVICE — #1238.
 *
 * Patatorz (fil 1846, 19/09/2026) : « De manière à sélectionner des albums à
 * écouter sur Qobuz ou Tidal, je les mets en favoris. Serait-il possible de
 * créer une sorte de tag […] ? » Les étiquettes existaient, mais le client ne
 * savait en poser que sur un objet désigné par un ENTIER de la bibliothèque.
 * Un album Qobuz s'identifie « kxend2k5wdg06 » : il n'avait donc jamais de
 * bouton d'étiquettes, alors que le serveur sait les tenir depuis la v0.9.144
 * (`POST /tags/{id}/streaming-items`, renesenses/tune-server-rust#3699).
 *
 * Une seule forme pour les deux espaces, que le panneau et les pochettes se
 * passent sans savoir de quel côté ils sont. C'est ICI que se décide quelle
 * route part — et c'est ce que le test appelle.
 */
import * as api from './api';
import { estSourceDeBibliotheque } from './provenanceBibliotheque';
import { BANDCAMP_SVC, cleServeur } from './ongletsStreaming';
import type { UserTag } from './types';

/** Un objet de la bibliothèque : un identifiant entier. */
export interface CibleLocale {
  itemType: string;
  itemId: number;
}

/**
 * Un objet de service : la paire `source` + `sourceId`, et l'instantané que
 * l'écran Étiquettes relira sans rappeler le service.
 */
export interface CibleService {
  itemType: string;
  source: string;
  sourceId: string;
  titre?: string | null;
  artiste?: string | null;
  album?: string | null;
  pochette?: string | null;
}

export type CibleEtiquette = CibleLocale | CibleService;

/**
 * La cible d'une playlist INTELLIGENTE (#4798).
 *
 * Un type à elle, `smart_playlist`, et jamais `playlist` avec son numéro :
 * `smart_playlists.id` recouvre `playlists.id` — l'id 1 existe dans les deux
 * tables. Sous `playlist`, l'étiquette se poserait sur une AUTRE playlist,
 * sans que rien ne le dise. C'est ICI que le type est écrit, une fois, pour
 * que les écrans (onglet Smart playlists, Étiquettes) ne le recomposent pas.
 * Le serveur le relit par `/tags/{id}/smart-playlists`, à part lui aussi.
 */
export function cibleSmartPlaylist(id: number): CibleLocale {
  return { itemType: 'smart_playlist', itemId: id };
}

export function estCibleService(c: CibleEtiquette): c is CibleService {
  return (c as CibleService).source != null && (c as CibleService).sourceId != null;
}

/**
 * La cible d'un objet de SERVICE, ou `null` quand il n'en est pas un.
 *
 * Accepte les formes que les écrans manipulent déjà : `source` + `source_id`
 * (recherche, favoris, écran Étiquettes), `artist_name`/`artist`,
 * `album_title`, `cover_path`/`cover_url`. Un objet de la bibliothèque (ou de
 * source `local`/`upnp`) rend `null` : c'est l'identifiant entier qui le
 * désigne, pas cette paire.
 */
export function cibleDeService(itemType: string, o: any): CibleService | null {
  if (!o) return null;
  // 🔴 #1409 — la source part sur le réseau : c'est la clé du SERVEUR, jamais
  // la clé d'ONGLET. La fiche d'un album Bandcamp porte `__bandcamp__`
  // (`BANDCAMP_EXT`, identifiant local de l'onglet) ; posée telle quelle, une
  // étiquette était rangée sous `__bandcamp__` — le serveur ne valide que
  // l'`item_type` — et jamais retrouvée sous `bandcamp`. On repasse par
  // `cleServeur`, la traduction qui existe déjà, ici où TOUTES les cibles de
  // service naissent, plutôt que dans chaque écran.
  const source = cleServeur(o.source == null ? '' : String(o.source).trim()) ?? '';
  const sourceId = o.source_id == null ? '' : String(o.source_id).trim();
  if (!source || !sourceId || estSourceDeBibliotheque(source)) return null;
  return {
    itemType,
    source,
    sourceId,
    titre: o.title ?? o.name ?? null,
    artiste: o.artist_name ?? o.artist ?? null,
    album: o.album_title ?? null,
    pochette: o.cover_path ?? o.cover_url ?? o.image_path ?? null,
  };
}

/**
 * La cible d'étiquettes d'un ALBUM, quelle que soit la vignette qui le montre.
 *
 * Bertrand, 25/09/2026 : « Tags sur album de streaming : il manque un CTA sur
 * les covers Qobuz ! » La fiche d'un album de service avait son bouton
 * « Étiquettes » (#1238), ses VIGNETTES non : les bandes éditoriales et
 * l'accueil (`PageWidgets`), la page artiste (`DiscographieCommune`) et
 * l'écran Streaming ne passaient que l'identifiant de bibliothèque, ou une
 * paire sans le repli Bandcamp — chacune avec sa propre ligne. La règle vit
 * donc ICI, une fois, et la fiche (`AlbumDetailV2`) passe par elle aussi :
 *
 *  - un identifiant ENTIER strictement positif → l'album de la bibliothèque ;
 *  - sinon la paire `source` + `source_id` (`cibleDeService`), la source
 *    retombant sur `ongletActif` quand l'objet ne la porte pas (vignettes de
 *    l'écran Streaming, exemplaire d'une discographie), et l'identifiant d'un
 *    album BANDCAMP sur l'adresse de sa page (`url`) — celle que sa fiche
 *    emploie déjà comme `source_id` ;
 *  - rien d'exploitable → `null` : pas de bouton, plutôt qu'un geste muet.
 */
export function cibleEtiquetteAlbum(a: any, ongletActif: string | null = null): CibleEtiquette | null {
  if (!a) return null;
  if (Number.isInteger(a.id) && a.id > 0) return { itemType: 'album', itemId: a.id };
  const source = a.source ?? ongletActif ?? null;
  const bandcamp = source != null && cleServeur(String(source).trim()) === BANDCAMP_SVC;
  return cibleDeService('album', {
    ...a,
    source,
    source_id: a.source_id ?? (bandcamp ? (a.url ?? null) : null),
  });
}

/** Les étiquettes déjà posées sur la cible. */
export function etiquettesPosees(c: CibleEtiquette): Promise<UserTag[]> {
  return estCibleService(c)
    ? api.getTagsForStreamingItem(c.itemType, c.source, c.sourceId)
    : api.getTagsForItem(c.itemType, c.itemId);
}

/** Pose l'étiquette `tagId` sur la cible. */
export function poserEtiquette(tagId: number, c: CibleEtiquette): Promise<void> {
  // 🔴 Un identifiant local est STRICTEMENT positif. Deux lignes `item_id = 0`
  // ont été trouvées sur le .18 le 22/09/2026 : elles ne désignaient aucun
  // album et gonflaient le compteur de leur étiquette. Le serveur les refuse
  // désormais en 400 ; on ne les envoie plus, et l'échec REMONTE — une
  // étiquette qu'on croit posée alors qu'elle ne l'est pas ment à l'écran.
  if (!estCibleService(c) && !(Number.isInteger(c.itemId) && c.itemId > 0)) {
    return Promise.reject(new Error(`identifiant local invalide : ${c.itemId}`));
  }
  if (!estCibleService(c)) return api.tagItem(tagId, c.itemType, c.itemId);
  return api.tagStreamingItem(tagId, {
    item_type: c.itemType,
    source: c.source,
    source_id: c.sourceId,
    title: c.titre ?? null,
    artist: c.artiste ?? null,
    album: c.album ?? null,
    cover_url: c.pochette ?? null,
  });
}

/** Retire l'étiquette `tagId` de la cible. */
export function retirerEtiquette(tagId: number, c: CibleEtiquette): Promise<void> {
  return estCibleService(c)
    ? api.untagStreamingItem(tagId, c.itemType, c.source, c.sourceId)
    : api.untagItem(tagId, c.itemType, c.itemId);
}

/**
 * Clé d'une ligne rendue par `/tags/{id}/albums|tracks` : l'identifiant pour
 * la moitié locale, la paire pour la moitié streaming — qui porte `id: null`.
 * Clé sur `id` seul, deux albums de service étiquetés font deux clés `null`
 * identiques, et Svelte refuse de dessiner la liste.
 */
export function cleLigneEtiquetee(o: { id?: unknown; source?: unknown; source_id?: unknown }, i: number): string {
  if (o?.id != null) return `l:${o.id}`;
  if (o?.source != null && o?.source_id != null) return `s:${o.source}:${o.source_id}`;
  return `i:${i}`;
}

/**
 * Corps de lecture d'un ALBUM rendu par l'écran Étiquettes : l'identifiant
 * pour la bibliothèque, la paire pour un service. `null` s'il ne désigne rien.
 */
export function corpsLectureAlbumEtiquete(a: { id?: number | null; source?: string | null; source_id?: string | null }):
  Record<string, unknown> | null {
  if (a?.id != null) return { album_id: a.id };
  const c = cibleDeService('album', a);
  return c ? { source: c.source, streaming_album_id: c.sourceId } : null;
}
