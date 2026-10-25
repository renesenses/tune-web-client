/**
 * tune-server-rust#6934 — la navigation par label chez un service (Qobuz),
 * demandée par Pascal Lahet (fils 2420 et 2421) d'après Qobuz Connect.
 *
 * - la page « Label » (`streaminglabel`) : ses albums, page par page
 *   (« Voir tout »), et ses artistes ;
 * - le nom du label cliquable sur la fiche d'un album Qobuz, et sur celle d'un
 *   album de la bibliothèque dont le label est rapproché chez Qobuz ;
 * - le lien de Bibliothèque › Labels vers le catalogue Qobuz du label.
 *
 * Les albums RÉCOMPENSÉS d'un label ne sont pas proposés : l'API Qobuz que lit
 * Tune ne les donne pas pour un label (les distinctions de la presse
 * — `album/getFeatured?type=press-awards` — se filtrent par genre, pas par
 * label).
 */
import { get } from 'svelte/store';
import type { Source } from './types';
import { activeView, vueDeRetour } from './stores/navigation';
import { ficheAlbumService, ficheLabelService } from './stores/streaming';

/** Les albums montrés avant « Voir tout ». */
export const ALBUMS_EN_APERCU = 12;
/** Les artistes montrés avant « Voir tout ». */
export const ARTISTES_EN_APERCU = 12;

/** Ouvre la page du label `id` (son identifiant chez `service`). */
export function ouvrirLabelDeService(c: { service: Source | string; id: string; nom?: string | null }): void {
  const id = String(c.id ?? '').trim();
  if (!id) return;
  const depuis = get(activeView);
  const courante = get(ficheLabelService);
  // Depuis la page d'un label (un autre label), on garde le retour d'origine.
  const garde = depuis === 'streaminglabel' && courante;
  ficheLabelService.set({
    service: c.service as Source,
    id,
    nom: (c.nom ?? '').trim(),
    retour: garde ? courante.retour : depuis,
    retourDuRetour: garde ? courante.retourDuRetour : get(vueDeRetour),
    ficheAlbum: garde ? courante.ficheAlbum : depuis === 'streamingalbum' ? get(ficheAlbumService) : null,
  });
  activeView.set('streaminglabel');
}

/** Le Retour de la page du label : l'écran d'où l'on venait, avec son propre
 *  retour, et la fiche album d'où l'on était parti. */
export function fermerLabelDeService(): void {
  const c = get(ficheLabelService);
  ficheLabelService.set(null);
  if (!c) {
    activeView.set('home');
    return;
  }
  if (c.retour === 'streamingalbum') {
    if (!c.ficheAlbum) {
      vueDeRetour.set(null);
      activeView.set(c.retourDuRetour ?? 'home');
      return;
    }
    ficheAlbumService.set(c.ficheAlbum);
  }
  vueDeRetour.set(c.retourDuRetour);
  activeView.set(c.retour ?? 'home');
}

/** Le début de la page suivante du catalogue, ou `null` quand tout est lu. */
export function pageSuivante(page: { offset: number; limit: number; total: number } | null | undefined): number | null {
  if (!page) return null;
  const suivante = page.offset + page.limit;
  return suivante < page.total ? suivante : null;
}

/** La clé d'un nom de label : casse et espaces de bord ignorés. */
function cle(nom: string | null | undefined): string {
  return (nom ?? '').trim().toLocaleLowerCase();
}

/** L'identifiant Qobuz du label `nom` de la bibliothèque, quand le serveur l'a
 *  rapproché (`qobuz_label_id` de `GET /library/labels`), sinon `null`. */
export function labelQobuzDe(
  nom: string | null | undefined,
  labels: readonly { name: string; qobuz_label_id?: string }[],
): string | null {
  const k = cle(nom);
  if (!k) return null;
  return labels.find((l) => cle(l.name) === k && l.qobuz_label_id)?.qobuz_label_id ?? null;
}

/** Le label de la bibliothèque qui correspond à un label Qobuz : par son
 *  identifiant rapproché d'abord, puis par son nom. `null` s'il n'y en a pas. */
export function labelDeLaBibliotheque(
  qobuzId: string,
  nom: string | null | undefined,
  labels: readonly { name: string; qobuz_label_id?: string; album_count?: number }[],
): string | null {
  const parId = labels.find((l) => l.qobuz_label_id === qobuzId);
  if (parId) return parId.name;
  const k = cle(nom);
  return k ? (labels.find((l) => cle(l.name) === k)?.name ?? null) : null;
}
