/**
 * rc13.91 — pourquoi le suréchantillonnage ne tourne pas, en clair.
 *
 * Relevé de Xavier (Windows, mode partagé, 25/11) : suréchantillonnage activé
 * et enregistré, aucun changement au DAC, et ni TESS ni la page du greffon ne
 * disaient pourquoi. La sortie locale connaît la raison (cadences du DAC non
 * mesurées, mélangeur de Windows, mode exclusif…) ; le serveur la publie,
 * déjà traduite dans la langue de la requête :
 *
 * - sur l'étape `upsampling` du chemin TESS : `params.refusal` (code) et
 *   `params.refusal_text` (phrase), avec `reason: not_in_service` ;
 * - sur `GET /upsampler/zones/{id}` : `observed_refusal: {reason, description}`.
 *
 * Un serveur plus ancien ne publie rien : l'affichage d'avant reste.
 */

/** La phrase du refus portée par une étape `upsampling`, ou `null`. */
export function texteDuRefusSurechantillonnage(
  e: { code?: string; params?: Record<string, unknown> | null } | null | undefined,
): string | null {
  if (e?.code !== 'upsampling') return null;
  const texte = e.params?.refusal_text;
  return typeof texte === 'string' && texte.trim() !== '' ? texte : null;
}

export interface RefusObserve {
  reason: string;
  description: string;
}

/**
 * La phrase du refus observé par la sortie, à montrer sur la page du
 * greffon : seulement quand la zone est réglée « activé » et qu'aucune
 * contrainte de réglage (licence, PURE…) ne parle déjà.
 */
export function texteDuRefusObserve(
  etat: { settings?: { enabled?: boolean }; constraint?: string | null; observed_refusal?: RefusObserve | null } | null | undefined,
): string | null {
  if (!etat?.settings?.enabled) return null;
  if (etat.constraint && etat.constraint !== 'disabled') return null;
  const d = etat.observed_refusal?.description;
  return typeof d === 'string' && d.trim() !== '' ? d : null;
}
