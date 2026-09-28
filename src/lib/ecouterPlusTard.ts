/**
 * « Écouter plus tard » — le sas d'écoute, sur le modèle de Roon (web#1653).
 *
 * FabienM, forum fil 1986, 27/09/2026 :
 *
 *     « Parfois on a pas le temps d'écouter un album, un titre ou une playlist
 *     […]. On voudrait les mettre de côté pour les écouter ultérieurement et
 *     voir ce qu'on en fait (rien, mise en favoris, ajout dans une playlist).
 *     C'est une sorte de sas d'écoute où il est facile de déposer et de
 *     retirer des objets à écouter plus tard. »
 *
 * Go de Bertrand le 27/09/2026, cible v0.9.168.
 *
 * ## 🔴 Le rangement est une ÉTIQUETTE, et rien de neuf
 *
 * Mesuré sur le serveur de test (.18, v0.9.167) le 28/09/2026, aller et
 * retour, sur une étiquette de sonde créée puis supprimée :
 *
 *     POST   /api/v1/tags                            → 201 {"id":5}
 *     POST   /api/v1/tags/5/items  {album,11032}     → 201
 *     POST   /api/v1/tags/5/items  {playlist,23}     → 201
 *     POST   /api/v1/tags/5/streaming-items          → 201  (playlist qobuz)
 *     POST   /api/v1/tags/5/streaming-items          → 201  (track tidal)
 *     GET    /api/v1/tags/for/album/11032            → [{"id":5,…}]
 *     GET    /api/v1/tags/for-streaming?…playlist…   → [{"id":5,…}]
 *     GET    /api/v1/tags/5/playlists                → local ET streaming
 *     DELETE /api/v1/tags/5/items/album/11032        → 204, relecture []
 *     POST   /api/v1/tags/5/streaming-items/remove   → 204
 *
 * Les trois objets que FabienM nomme — album, titre, playlist — y entrent
 * donc déjà, de la bibliothèque comme d'un service, et ressortent. Fabriquer
 * une table ou un stockage navigateur pour les mêmes lignes aurait été une
 * seconde vérité : le sas ne survivrait pas à un changement de machine, et
 * l'écran Étiquettes n'en saurait rien.
 *
 * Ce module n'ajoute donc AUCUNE route. Il ajoute le GESTE que l'étiquette ne
 * rend pas, et que FabienM décrit : un clic, une bascule à état visible, sans
 * ouvrir le panneau et choisir une étiquette parmi d'autres.
 *
 * ## Quelle étiquette — l'identifiant, pas le nom
 *
 * Le serveur n'a pas de notion d'étiquette « système » : une étiquette est une
 * ligne comme une autre, qui se renomme et se supprime. Retrouver la nôtre par
 * son NOM à chaque fois, ce serait la perdre au premier renommage, et en
 * fabriquer une seconde dans une autre langue.
 *
 * L'identifiant est donc retenu DANS LE PROFIL, côté serveur —
 * `POST /profiles/{id}/settings`, sous la clé `ecouterPlusTardEtiquette`. Il
 * suit l'utilisateur d'une machine à l'autre, ce qu'un `localStorage` ne fait
 * pas. `api.setProfilePreferences` fusionne (le serveur, lui, REMPLACE tout
 * l'objet) : la clé n'efface pas la disposition d'accueil.
 *
 * ## Adopter l'étiquette que l'utilisateur a déjà faite
 *
 * FabienM a trouvé le contournement seul (réponse 6980) et s'est fabriqué une
 * étiquette « Ecouter plus tard » portant déjà 1 album, 1 piste et 1 playlist.
 * Lui en créer une seconde, homonyme et vide, serait absurde. Faute de réglage
 * enregistré, on adopte donc une étiquette dont le nom NORMALISÉ (sans
 * accents, sans casse) est l'un des noms du sas — et celle-là seulement.
 *
 * 🔴 « À écouter » n'en fait PAS partie, bien qu'elle existe sur le serveur de
 * Bertrand avec 3 objets : c'est une étiquette à lui, faite pour autre chose.
 * Une adoption trop large détournerait le rangement de quelqu'un.
 */
import { get, writable } from 'svelte/store';
import * as api from './api';
import {
  estCibleService,
  poserEtiquette,
  retirerEtiquette,
  type CibleEtiquette,
} from './cibleEtiquette';
import { currentProfileId } from './stores/profile';
import { t } from './i18n';
import { notifications } from './stores/notifications';
import type { UserTag } from './types';

/** La clé du réglage de profil qui retient l'identifiant de l'étiquette. */
export const CLE_REGLAGE = 'ecouterPlusTardEtiquette';

/** Le nom donné à l'étiquette quand il faut la créer. */
export const NOM_ETIQUETTE = 'Écouter plus tard';

/** La couleur du sas — la même que celle des étiquettes créées à la main. */
export const COULEUR_ETIQUETTE = '#808080';

/**
 * Les noms qu'on ADOPTE faute de réglage, normalisés.
 *
 * Volontairement courte : ce sont les traductions du geste lui-même, pas les
 * étiquettes qui y ressemblent. Voir l'en-tête — « à écouter » n'y est pas.
 */
export const NOMS_ADOPTABLES: readonly string[] = [
  'ecouter plus tard',
  'listen later',
  'a ecouter plus tard',
];

/** Minuscules, sans accents, espaces réduits : « Ecouter  Plus Tard » = le nom. */
export function normaliserNom(nom: unknown): string {
  return String(nom ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** L'étiquette du sas parmi celles du serveur, par son nom — ou `null`. */
export function etiquetteAdoptable(tags: readonly UserTag[] | null | undefined): UserTag | null {
  for (const tag of tags ?? []) {
    if (tag?.id == null) continue;
    if (NOMS_ADOPTABLES.includes(normaliserNom(tag.name))) return tag;
  }
  return null;
}

/**
 * La clé d'un objet dans le sas.
 *
 * 🔴 Deux espaces d'identifiants, deux familles de clés — la leçon de
 * `titreBanni` et de `cleLigneEtiquetee`. L'album 7 de la bibliothèque et
 * l'album Qobuz « 7 » ne se confondent jamais, et le TYPE en fait partie : la
 * piste 23 et la playlist 23 sont deux lignes différentes du serveur.
 */
export function cleCible(c: CibleEtiquette | null | undefined): string | null {
  if (!c) return null;
  if (estCibleService(c)) {
    const source = String(c.source ?? '').trim().toLowerCase();
    const sourceId = String(c.sourceId ?? '').trim();
    if (!source || !sourceId) return null;
    return `s:${c.itemType}:${source}:${sourceId}`;
  }
  // Un identifiant local est STRICTEMENT positif : `poserEtiquette` refuse les
  // autres (deux lignes `item_id = 0` trouvées sur le .18 le 22/09/2026).
  if (!Number.isInteger(c.itemId) || c.itemId <= 0) return null;
  return `l:${c.itemType}:${c.itemId}`;
}

/**
 * La clé d'une LIGNE rendue par `/tags/{id}/albums|tracks|playlists`.
 *
 * La moitié locale porte son identifiant, la moitié streaming porte
 * `id: null` et la paire — mesuré : `{"id":null,"name":"Sonde 1653",
 * "source":"qobuz","source_id":"70608857"}`.
 */
export function cleLigne(
  itemType: string,
  o: { id?: unknown; source?: unknown; source_id?: unknown } | null | undefined,
): string | null {
  if (!o) return null;
  if (typeof o.id === 'number' && Number.isInteger(o.id) && o.id > 0) {
    return `l:${itemType}:${o.id}`;
  }
  const source = String(o.source ?? '').trim().toLowerCase();
  const sourceId = String(o.source_id ?? '').trim();
  if (!source || !sourceId) return null;
  return `s:${itemType}:${source}:${sourceId}`;
}

/** Ce que l'écran sait du sas. `etiquette` à `null` : pas encore de sas. */
export interface EtatSas {
  /** L'identifiant de l'étiquette qui tient le sas, ou `null`. */
  etiquette: number | null;
  /** Les clés des objets qui y sont (`cleCible`). */
  membres: ReadonlySet<string>;
  /** La liste a-t-elle été lue au moins une fois ? */
  charge: boolean;
}

const VIDE: EtatSas = { etiquette: null, membres: new Set(), charge: false };

export const sasEcouterPlusTard = writable<EtatSas>(VIDE);

/**
 * L'objet est-il dans le sas, aux yeux de l'écran ?
 *
 * SYNCHRONE : un menu se compose à l'ouverture, et une grille de 6 704 albums
 * (fil 1919) ne doit pas partir en 6 704 requêtes `/tags/for/…`. La liste est
 * lue UNE fois (`chargerSas`), puis tenue à jour par les bascules.
 */
export function estDansLeSas(
  c: CibleEtiquette | null | undefined,
  etat: EtatSas = get(sasEcouterPlusTard),
): boolean {
  const cle = cleCible(c);
  return cle != null && etat.membres.has(cle);
}

/** L'objet peut-il entrer dans le sas ? (Il se désigne, donc il s'étiquette.) */
export function rangeableDansLeSas(c: CibleEtiquette | null | undefined): boolean {
  return cleCible(c) != null;
}

/**
 * L'identifiant de l'étiquette du sas, sans jamais en créer une.
 *
 * Le réglage du profil d'abord ; on VÉRIFIE qu'elle existe encore (elle se
 * supprime depuis l'écran Étiquettes, et un identifiant mort ferait ranger
 * dans le vide, en 404 muet). Sinon l'adoption par le nom.
 */
export async function resoudreEtiquette(profileId: number | null): Promise<number | null> {
  let voulu: number | null = null;
  if (profileId != null) {
    try {
      const reglages = await api.getProfilePreferences(profileId);
      const brut = reglages?.[CLE_REGLAGE];
      const n = typeof brut === 'number' ? brut : Number.parseInt(String(brut ?? ''), 10);
      if (Number.isInteger(n) && n > 0) voulu = n;
    } catch {
      // Réglages illisibles : on retombe sur l'adoption par le nom plutôt que
      // de dire « pas de sas » à quelqu'un qui en a un.
    }
  }
  let tags: UserTag[] = [];
  try {
    tags = (await api.getTags()) ?? [];
  } catch {
    // Le serveur ne répond pas : on ne sait rien, et on ne CRÉE surtout rien —
    // ce serait un doublon au prochain chargement réussi.
    return voulu;
  }
  if (voulu != null && tags.some((tag) => tag?.id === voulu)) return voulu;
  const adoptee = etiquetteAdoptable(tags);
  return adoptee?.id ?? null;
}

/**
 * L'identifiant de l'étiquette du sas, en la créant au besoin.
 *
 * Appelé au PREMIER dépôt, jamais au chargement : une installation où personne
 * ne s'en sert n'a pas à porter une étiquette vide dans son écran Étiquettes.
 */
export async function assurerEtiquette(profileId: number | null): Promise<number | null> {
  const deja = await resoudreEtiquette(profileId);
  if (deja != null) {
    await retenirEtiquette(profileId, deja);
    return deja;
  }
  let cree: number | null = null;
  try {
    cree = (await api.createTag(NOM_ETIQUETTE, COULEUR_ETIQUETTE))?.id ?? null;
  } catch {
    return null;
  }
  if (cree != null) await retenirEtiquette(profileId, cree);
  return cree;
}

/** Retient l'identifiant dans le profil. Un échec n'empêche pas le geste. */
async function retenirEtiquette(profileId: number | null, tagId: number): Promise<void> {
  if (profileId == null) return;
  try {
    await api.setProfilePreferences(profileId, { [CLE_REGLAGE]: tagId });
  } catch {
    // Le sas marche quand même pour cette session : l'adoption par le nom le
    // retrouvera au prochain chargement.
  }
}

/**
 * Les clés des objets rangés dans l'étiquette.
 *
 * Trois lectures, une fois : albums, pistes, playlists — les trois familles
 * que FabienM nomme. Les artistes et les collections s'étiquettent aussi, mais
 * le sas ne les propose pas : on ne lit pas ce qu'on ne sait pas y déposer.
 */
export async function membresEtiquette(tagId: number): Promise<Set<string>> {
  const cles = new Set<string>();
  const [albums, pistes, listes] = await Promise.all([
    api.getTagAlbums(tagId).catch(() => null),
    api.getTagTracks(tagId).catch(() => null),
    api.getTagPlaylists(tagId).catch(() => null),
  ]);
  for (const a of albums?.albums ?? []) {
    const cle = cleLigne('album', a as any);
    if (cle) cles.add(cle);
  }
  for (const p of pistes?.tracks ?? []) {
    const cle = cleLigne('track', p as any);
    if (cle) cles.add(cle);
  }
  for (const l of listes?.playlists ?? []) {
    const cle = cleLigne('playlist', l as any);
    if (cle) cles.add(cle);
  }
  return cles;
}

let lecture: Promise<void> | null = null;

/**
 * Lit le sas UNE fois. Idempotent : les vingt menus d'une grille qui
 * l'appellent au montage ne font qu'une lecture.
 */
export function chargerSas(): Promise<void> {
  if (lecture) return lecture;
  lecture = (async () => {
    const profileId = get(currentProfileId);
    const tagId = await resoudreEtiquette(profileId);
    if (tagId == null) {
      // Pas encore de sas : c'est un état LU, pas une ignorance. Le premier
      // dépôt le créera.
      sasEcouterPlusTard.set({ etiquette: null, membres: new Set(), charge: true });
      return;
    }
    const membres = await membresEtiquette(tagId);
    sasEcouterPlusTard.set({ etiquette: tagId, membres, charge: true });
  })().catch(() => {
    // Rien de lu : on réessaiera au prochain regard plutôt que d'annoncer un
    // sas vide qui ne l'est pas.
    lecture = null;
  });
  return lecture;
}

/** Pour les tests, et pour un changement de profil : tout oublier. */
export function oublierSas(): void {
  lecture = null;
  sasEcouterPlusTard.set({ etiquette: null, membres: new Set(), charge: false });
}

/**
 * Dépose l'objet dans le sas, ou l'en retire — LA bascule, la même pour un
 * album, un titre et une playlist.
 *
 * Rend l'état APRÈS le geste. L'état local ne bouge qu'après l'accord du
 * serveur : un sas qui montre un objet que le serveur n'a pas rangé ment à
 * l'écran, et c'est exactement le reproche de #1659.
 */
export async function basculerLeSas(c: CibleEtiquette | null | undefined): Promise<boolean> {
  const cle = cleCible(c);
  if (cle == null || !c) return false;
  const traduire = (k: string) => get(t)(k as any);
  try {
    await chargerSas();
    const etat = get(sasEcouterPlusTard);
    if (etat.membres.has(cle)) {
      if (etat.etiquette == null) return true;
      await retirerEtiquette(etat.etiquette, c);
      sasEcouterPlusTard.update((e) => {
        const membres = new Set(e.membres);
        membres.delete(cle);
        return { ...e, membres };
      });
      notifications.success(traduire('v2.later.removed'));
      return false;
    }
    const tagId = etat.etiquette ?? (await assurerEtiquette(get(currentProfileId)));
    if (tagId == null) {
      notifications.error(traduire('common.error'));
      return false;
    }
    await poserEtiquette(tagId, c);
    sasEcouterPlusTard.update((e) => {
      const membres = new Set(e.membres);
      membres.add(cle);
      return { etiquette: tagId, membres, charge: true };
    });
    notifications.success(traduire('v2.later.added'));
    return true;
  } catch {
    // 🔴 L'état local n'a pas bougé : il ne bouge qu'après l'accord du serveur.
    // Un sas qui montre un objet que le serveur n'a pas rangé ment à l'écran —
    // c'est le reproche de #1659, et il ne se répète pas ici.
    notifications.error(traduire('common.error'));
    return estDansLeSas(c);
  }
}
