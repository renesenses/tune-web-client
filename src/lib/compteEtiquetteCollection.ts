/**
 * Le nombre annoncé à côté d'une étiquette, dans la règle « Étiquette » d'une
 * COLLECTION intelligente.
 *
 * ## Le défaut (tune-server-rust#5026, Sevy Tabroc, fil forum 1937, 0.9.164)
 *
 * Le sélecteur affichait « Sept Oct 2026 (1) », et l'aperçu juste en dessous
 * « 0 albums correspondent ». Le testeur y a lu, à bon droit, « il est indiqué
 * 1 album et celui-ci n'y figure pas ».
 *
 * Le « (1) » était `count` de `GET /tags` (`tag_repo::count_per_tag`) : il
 * compte TOUT objet étiqueté — piste, album, artiste de la bibliothèque, et
 * objet de streaming (`streaming_item_tags`, #3699). La règle, elle
 * (`smart_refs::album_ref_condition`, champ `tag`), ne lit que les ALBUMS et
 * ARTISTES de la bibliothèque. Une étiquette posée sur une piste ou sur un
 * album Qobuz était donc comptée par le sélecteur et jamais rendue par la
 * collection. Le sélecteur promettait ce que la règle ne sait pas tenir.
 *
 * ## Ce qu'on annonce désormais
 *
 * Le nombre d'albums que la règle « porte l'étiquette » rend VRAIMENT, demandé
 * au même endroit que l'aperçu de l'éditeur (`/smart-collections/preview`),
 * donc par le même constructeur SQL que la collection enregistrée. Il ne peut
 * pas diverger de ce que l'on verra en enregistrant.
 *
 * Tant que ce nombre n'est pas connu — requête en cours, ou refusée —, on
 * n'affiche AUCUN nombre plutôt que le `count` de `/tags` : un nombre absent
 * n'induit personne en erreur, un nombre faux si.
 */

/** Ce dont on a besoin d'une étiquette. */
export interface EtiquetteChoisie {
  id: number | null;
  name: string;
}

/** La forme de l'appel d'aperçu (`api.previewSmartCollection`). */
export type Apercu = (payload: { rules: any[]; match_mode?: string }) => Promise<{ total?: number } | null | undefined>;

/** La règle « porte l'étiquette `id` », telle que l'éditeur l'écrit. */
export function regleDEtiquette(id: number) {
  return { field: 'tag', op: 'is', value: String(id) };
}

/**
 * Combien d'albums chaque étiquette ferait entrer dans une collection.
 *
 * 🔴 AUCUN `max_limit` : le serveur calcule `total` comme la LONGUEUR de la
 * liste rendue, une borne ferait mentir le compte (voir l'aperçu de
 * `CollectionSmartEditeurV2`, 05/09/2026).
 *
 * Au plus `parallele` requêtes à la fois : une liste d'étiquettes ne doit pas
 * partir en rafale sur un serveur de NAS. Une étiquette dont l'aperçu échoue
 * n'a simplement pas d'entrée.
 */
export async function comptesDesEtiquettes(
  ids: readonly number[],
  apercu: Apercu,
  parallele = 4,
): Promise<Map<number, number>> {
  const comptes = new Map<number, number>();
  const file = [...ids];
  const ouvrier = async () => {
    for (let id = file.shift(); id !== undefined; id = file.shift()) {
      try {
        const r = await apercu({ rules: [regleDEtiquette(id)], match_mode: 'all' });
        if (typeof r?.total === 'number') comptes.set(id, r.total);
      } catch {
        /* pas de nombre plutôt qu'un nombre faux */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, parallele) }, ouvrier));
  return comptes;
}

/**
 * Le libellé d'une option du sélecteur : le nom, suivi du nombre d'albums que
 * la règle rend, s'il est connu. Jamais le `count` de `/tags`.
 */
export function libelleEtiquette(e: EtiquetteChoisie, comptes: ReadonlyMap<number, number>): string {
  const n = e.id != null ? comptes.get(e.id) : undefined;
  return n != null ? `${e.name} (${n})` : e.name;
}
