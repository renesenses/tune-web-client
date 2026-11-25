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
 * Règle (arbitrage produit du 25/11) :
 *   - PURE, badge `bit_perfect` ou `outside_tess` ⇒ pas de cadre ;
 *   - cadre dès qu'une étape `effective` est un GREFFON, un suréchantillonnage
 *     (ou son modulateur DSD), ou une marge (headroom) MANUELLE non nulle ;
 *   - la marge AUTOMATIQUE seule (−3 dB posés parce qu'un traitement agit)
 *     n'encadre pas, ni le volume ni le dither : ce ne sont pas des
 *     traitements choisis par l'utilisateur.
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
  if (c.badge === 'bit_perfect' || c.badge === 'outside_tess') return false;
  if (c.steps.some((e) => e.reason === 'pure_mode')) return false;
  return c.steps.some((e) => etapeQuiTraite(e, c.headroom_db));
}

/** D'après `GET /zones/{id}/tess` : `true`/`false`, ou `null` sans réponse lisible. */
export function traitementActifDeLaZone(
  reponse: { badge?: string | null; headroom_db?: number | null; signal_path?: unknown; applicability?: { status?: string } | null } | null | undefined,
): boolean | null {
  if (!reponse || !Array.isArray(reponse.signal_path)) return null;
  if (reponse.applicability?.status === 'outside_tess') return false;
  if (reponse.badge === 'bit_perfect' || reponse.badge === 'outside_tess') return false;
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
