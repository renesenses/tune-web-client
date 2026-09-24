/**
 * Le GESTE « ajouter cet album à une collection » : charger les cibles, poser
 * l'album, prévenir, relire.
 *
 * Réunion du 23/09/2026 : « Album : manque le bouton "Ajouter à une
 * collection" ». Le geste existait sur la VIGNETTE de la Bibliothèque (#1222,
 * menu de `PochetteActions`) — et nulle part ailleurs : ni sur la grille par
 * défaut, ni sur la fiche album.
 *
 * ## Pourquoi un module, et pas une seconde copie
 *
 * `LibraryV2` portait le geste en dur dans son `<script>` : le chargement de
 * `GET /library/collections`, l'appel de la route, les deux notifications, la
 * relecture. La fiche album en avait besoin mot pour mot. Recopier, c'était
 * accepter que les deux dérivent — le reproche déjà fait à `menuPiste` et à
 * `ancrageMenu`. Le geste est ici, les deux écrans l'appellent, un témoin le
 * tient.
 *
 * `lib/collectionsCibles` reste le CHOIX pur (quelles collections, sous quel
 * libellé). Ici vit ce qui touche au réseau et aux notifications.
 *
 * 🔴 DEUX espaces d'identifiants. `GET /library/collections` ne rend que les
 * collections MANUELLES ; les intelligentes vivent sous
 * `/library/smart-collections`, et leurs numéros se recouvrent — la manuelle
 * n° 1 et l'intelligente n° 1 sont deux objets sans rapport. Ce module ne lit
 * que la première route, et `ciblesPourAlbum` exige `id > 0`.
 */
import { get } from 'svelte/store';
import * as api from './api';
import { t } from './i18n';
import { notifications } from './stores/notifications';
import { ciblesPourAlbum, libelleCible, type CollectionCible, type EntreeCible } from './collectionsCibles';

export type { CollectionCible, EntreeCible };

/** Une entrée de menu — celle de `PochetteActions` (`libelle` + `faire`), avec
 *  de quoi la clore (`id`) et la dessiner (`deja`). */
export interface EntreeMenuCollection {
  /** L'identifiant de la collection MANUELLE. */
  id: number;
  libelle: string;
  /** L'album y est déjà : l'entrée le dit, elle n'est pas retirée. */
  deja: boolean;
  faire: () => void;
}

/**
 * Les collections manuelles ; `[]` quand la route échoue. Pas de collections,
 * pas d'entrées : rien à dire — un bandeau d'erreur à chaque ouverture de
 * grille ne rendrait service à personne.
 */
export async function chargerCollectionsCibles(): Promise<CollectionCible[]> {
  try {
    return tableau(await api.getCollections());
  } catch {
    return [];
  }
}

/** La route rend un tableau ; tout le reste (panne, réponse d'un autre
 *  serveur, témoin qui sert un objet) vaut « aucune collection ». Un objet
 *  passé à `for…of` casserait la grille entière. */
function tableau(v: unknown): CollectionCible[] {
  return Array.isArray(v) ? (v as CollectionCible[]) : [];
}

/**
 * Pose l'album dans la collection, prévient, et rend la liste RELUE — c'est
 * `album_ids` qui dira « il y est déjà » au prochain clic.
 *
 * `null` quand il n'y a rien à reprendre : l'ajout a échoué (déjà signalé),
 * ou la relecture n'a rien rendu — l'appelant garde alors sa liste.
 */
export async function ajouterAlbumACollection(
  albumId: number,
  cible: Pick<EntreeCible, 'id'>,
): Promise<CollectionCible[] | null> {
  const traduire = get(t);
  try {
    await api.addAlbumToCollection(cible.id, albumId);
    notifications.success(traduire('library.albumAddedToCollection'));
  } catch {
    notifications.error(traduire('library.collectionAddError'));
    return null;
  }
  try {
    const relues = await api.getCollections();
    // Pas un tableau : rien à reprendre, l'appelant garde sa liste.
    return Array.isArray(relues) ? relues : null;
  } catch {
    return null;
  }
}

/**
 * Une entrée par collection manuelle, prête pour un menu.
 *
 * `traduire` reçoit la clé et rend le gabarit : le module ne dépend pas de
 * l'abonnement `$t` d'un composant. `apres` reçoit la liste relue après un
 * ajout réussi — c'est l'appelant qui la garde en `$state`.
 *
 * Aucune entrée sans identifiant d'album : un album de service ou de dépôt
 * distant n'a pas de numéro dans NOTRE bibliothèque (garde de #1222).
 */
export function entreesAjoutCollection(
  collections: readonly CollectionCible[] | null | undefined,
  albumId: number | null | undefined,
  traduire: (cle: string) => string,
  apres: (relues: CollectionCible[]) => void,
): EntreeMenuCollection[] {
  if (albumId == null) return [];
  return ciblesPourAlbum(tableau(collections), albumId).map((c) => ({
    id: c.id,
    deja: c.deja,
    libelle: c.deja
      ? libelleCible(c, traduire)
      : traduire('v2.col.addTo').replace('{name}', c.nom),
    faire: () => {
      void ajouterAlbumACollection(albumId, c).then((relues) => {
        if (relues) apres(relues);
      });
    },
  }));
}
