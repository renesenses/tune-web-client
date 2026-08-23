import type { MediaServer } from './types';

/**
 * Sur quel dossier ouvrir un serveur de médias.
 *
 * Ouvrir sur la racine UPnP est le comportement neutre, et c'est le bon pour
 * un serveur tiers : on ne sait pas ce qu'il expose ni comment il l'appelle.
 *
 * Mais un **autre serveur Tune** n'est pas un inconnu. Sa racine est
 * `Artists / Albums / Genres / All Tracks / Radio`, dans cet ordre et sous ces
 * identifiants — c'est `ROOT_CONTAINERS` dans `tune-core/src/upnp_server.rs`,
 * qui s'en déclare la seule source de vérité. Faire cliquer l'utilisateur une
 * fois de plus pour arriver aux albums, c'est lui faire redécouvrir à chaque
 * visite ce qu'on sait déjà.
 *
 * On ouvre donc directement sur les albums, comme la bibliothèque locale
 * s'ouvre sur les albums. La racine reste à un clic, dans le fil d'Ariane.
 */
export const CONTENEUR_ALBUMS = 'albums';

/** Ce que Tune annonce dans sa description UPnP (`upnp_server.rs`). */
const FABRICANT_TUNE = 'mozaik labs';
const MODELE_TUNE = 'tune';

/**
 * Ce serveur est-il un autre Tune ?
 *
 * Les deux champs comptent. Le modèle seul dirait « Tune » pour n'importe quel
 * appareil qui aurait choisi ce nom ; le fabricant seul laisserait passer un
 * futur produit de la maison qui n'exposerait pas la même racine.
 */
export function estUnServeurTune(s: Pick<MediaServer, 'manufacturer' | 'model'>): boolean {
  const fab = (s.manufacturer ?? '').trim().toLowerCase();
  const mod = (s.model ?? '').trim().toLowerCase();
  return fab === FABRICANT_TUNE && mod === MODELE_TUNE;
}

/**
 * Le dossier d'ouverture, et son titre pour le fil d'Ariane.
 *
 * `null` = la racine, c'est-à-dire le comportement d'avant. C'est le repli, et
 * il doit le rester : un dossier qu'on ouvre d'autorité et qui se révèle vide
 * se lit comme une bibliothèque cassée, pas comme un raccourci.
 */
export function ouvertureParDefaut(
  s: Pick<MediaServer, 'manufacturer' | 'model'>,
): { objectId: string; titre: string } | null {
  return estUnServeurTune(s) ? { objectId: CONTENEUR_ALBUMS, titre: 'Albums' } : null;
}

/**
 * Les rayons d'un serveur Tune, tels que sa racine les expose.
 *
 * `ROOT_CONTAINERS` dans `tune-core/src/upnp_server.rs` — ordre et
 * identifiants compris, ce fichier s'en déclare la seule source de vérité.
 *
 * Les afficher en onglets evite l'aller-retour par la racine : c'est ce qui
 * separait « une grille d'albums » de « la vue bibliotheque ». On ne les
 * propose QUE sur un serveur Tune, puisqu'on ne connait la racine que de
 * celui-la.
 */
export const RAYONS_TUNE: { objectId: string; cle: string }[] = [
  { objectId: 'artists', cle: 'favorites.artists' },
  { objectId: 'albums', cle: 'favorites.albums' },
  { objectId: 'genres', cle: 'nav.genres' },
  { objectId: 'tracks', cle: 'favorites.tracks' },
  { objectId: 'radios', cle: 'nav.radios' },
];
