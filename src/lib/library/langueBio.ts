/**
 * LA LANGUE D'UNE BIOGRAPHIE — renesenses/tune-server-rust#8010, sur le
 * contrat de #7930 (rc11).
 *
 * Quand aucune bio n'existe dans la langue de l'interface, le serveur en sert
 * une autre plutôt que rien et le dit :
 *   `bio_provenance.lang` = la langue réellement servie ;
 *   `repli: { raison: "langue_indisponible", langue_demandee, langue_disponible }`
 * (`langue_disponible` est null quand aucune bio n'a pu être servie).
 *
 * Règles :
 *  - pas de `repli` (pas de repli, ou serveur plus ancien) → aucune mention ;
 *  - `repli` sans `langue_disponible` → aucune mention (il n'y a pas de texte
 *    à signaler) ;
 *  - la langue servie sert d'attribut `lang` du bloc de texte (lecteurs
 *    d'écran, césure) ; absente (serveur ancien) → pas d'attribut.
 */
export interface LangueBio {
  /** Langue du texte affiché (`bio_provenance.lang`), ou null. */
  langue: string | null;
  /** Langue du repli, à nommer dans la mention ; null → pas de mention. */
  repliVers: string | null;
}

export const AUCUNE_LANGUE: LangueBio = { langue: null, repliVers: null };

const code = (v: unknown): string | null =>
  typeof v === 'string' && /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/.test(v.trim())
    ? v.trim().replace('_', '-')
    : null;

export function langueBioDe(reponse: unknown): LangueBio {
  const vide: LangueBio = { langue: null, repliVers: null };
  if (!reponse || typeof reponse !== 'object') return vide;
  const r = reponse as Record<string, unknown>;
  const prov = r.bio_provenance;
  const langue =
    prov && typeof prov === 'object' ? code((prov as Record<string, unknown>).lang) : null;
  const repli = r.repli;
  const vers =
    repli && typeof repli === 'object' && !Array.isArray(repli)
      ? code((repli as Record<string, unknown>).langue_disponible)
      : null;
  return { langue, repliVers: vers };
}

/** Le nom d'une langue dans la langue de l'interface (« French » / « français »). */
export function nomLangue(codeLangue: string, interfaceLangue: string): string {
  try {
    const nom = new Intl.DisplayNames([interfaceLangue], { type: 'language' }).of(codeLangue);
    if (nom && nom !== codeLangue) return nom;
  } catch {
    /* environnement sans Intl.DisplayNames : le code, faute de mieux */
  }
  return codeLangue;
}
