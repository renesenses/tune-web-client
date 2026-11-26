/**
 * rc14, refonte TESS (lot 1, spécification § 2.3) — l'icône TESS de la barre
 * de lecture est ENCADRÉE quand un traitement agit, et ne l'est pas sinon.
 *
 * « Agit » se lit sur ce que le SERVEUR publie, jamais sur une supposition.
 * Source : le bloc `tess` du chemin du signal de la zone courante
 * (`zone.signal_path.tess`, T16), déjà rapproché de ce qui tourne. À défaut
 * (zone à l'arrêt : pas de chemin publié), la réponse de
 * `GET /zones/{id}/tess` (son chemin résolu, avec la même règle).
 *
 * Règle : L'ICÔNE DIT VRAI (décision de la relecture de web#3419).
 *   - cadre dès qu'une étape `effective` traite le signal : un GREFFON, un
 *     suréchantillonnage (ou son modulateur DSD), une marge (headroom)
 *     MANUELLE non nulle — QUEL QUE SOIT LE BADGE, `outside_tess` compris :
 *     une zone HQPlayer ou Diretta garde l'égaliseur et la correction de
 *     pièce, l'icône doit le montrer ;
 *   - la marge AUTOMATIQUE seule (−3 dB posés parce qu'un traitement agit)
 *     n'encadre pas, ni le volume ni le dither : ce ne sont pas des
 *     traitements choisis par l'utilisateur ;
 *   - PURE : pas de cadre (plus rien n'est traité).
 */
import { lireCheminTessBarre, type EtapeTessBarre } from './tessBarre';

const estObjet = (x: unknown): x is Record<string, any> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Une étape (effective) qui compte comme un traitement. */
export function etapeQuiTraite(e: EtapeTessBarre | null | undefined, headroomDb?: number | null): boolean {
  if (!e || e.effective !== true) return false;
  switch (e.code) {
    case 'plugin':
    case 'upsampling':
    case 'dsd_modulator':
      return true;
    case 'headroom': {
      const p = estObjet(e.params) ? e.params : {};
      if (p.mode === 'auto') return false;
      const db = typeof p.db === 'number' ? p.db : typeof headroomDb === 'number' ? headroomDb : null;
      return p.mode === 'manual' && db != null && db !== 0;
    }
    default:
      return false;
  }
}

/** D'après le chemin du signal de la zone : `true`/`false`, ou `null` s'il ne dit rien. */
export function traitementActifDuChemin(signalPath: unknown): boolean | null {
  if (!estObjet(signalPath)) return null;
  if (signalPath.pure === true) return false;
  const c = lireCheminTessBarre(signalPath);
  if (!c) return null;
  if (c.steps.some((e) => e.reason === 'pure_mode')) return false;
  return c.steps.some((e) => etapeQuiTraite(e, c.headroom_db));
}

/** D'après `GET /zones/{id}/tess` : `true`/`false`, ou `null` sans réponse lisible. */
export function traitementActifDeLaZone(
  reponse: { badge?: string | null; headroom_db?: number | null; signal_path?: unknown; applicability?: { status?: string } | null } | null | undefined,
): boolean | null {
  if (!reponse || !Array.isArray(reponse.signal_path)) return null;
  const etapes = (reponse.signal_path as unknown[]).filter(estObjet) as EtapeTessBarre[];
  if (etapes.some((e) => e.reason === 'pure_mode')) return false;
  return etapes.some((e) => etapeQuiTraite(e, reponse.headroom_db));
}

/** L'état de l'icône : encadrée (`true`) ou non. PURE l'emporte sur tout. */
export function traitementTessActif(
  signalPath: unknown,
  reponseZone: Parameters<typeof traitementActifDeLaZone>[0],
  pure = false,
): boolean {
  if (pure) return false;
  return traitementActifDuChemin(signalPath) ?? traitementActifDeLaZone(reponseZone) ?? false;
}

/**
 * rc14 (retour de Rémi, go de Bertrand du 26/11) — « Bypass all » est-il
 * coché sur la zone ? L'icône TESS de la barre ne doit alors PLUS être
 * encadrée : sans cadre et atténuée, elle dit que TESS est contourné.
 *
 * Lu, dans cet ordre, sur ce que le serveur publie :
 *   1. le chemin du signal de la zone : une étape éteinte pour le motif
 *      `bypass_all` (`MotifEtape::BypassAll`, `tess/resolution.rs`) le dit ;
 *      une étape qui traite encore dit le contraire (la réponse de la zone,
 *      lue plus tôt, peut dater d'avant le décochage) ;
 *   2. sinon la chaîne de `GET /zones/{id}/tess` : `chain.bypass_all`.
 */
export function tessContourne(
  signalPath: unknown,
  reponseZone: { chain?: { bypass_all?: boolean } | null } | null | undefined,
): boolean {
  const c = lireCheminTessBarre(signalPath);
  if (c) {
    if (c.steps.some((e) => e.reason === 'bypass_all')) return true;
    if (c.steps.some((e) => etapeQuiTraite(e, c.headroom_db))) return false;
  }
  return reponseZone?.chain?.bypass_all === true;
}
