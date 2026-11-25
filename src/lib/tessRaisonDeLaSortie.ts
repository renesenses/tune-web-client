/**
 * rc13.91 — pourquoi un étage ou un greffon de TESS ne tourne pas, en clair.
 *
 * Une seule règle, pour toute étape `effective: false` : quand le serveur
 * publie `params.refusal_text` (la raison constatée par la sortie, déjà
 * traduite), c'est elle qui s'affiche, à la place du motif générique
 * (« Requested but not running »). Cas connus : le suréchantillonnage refusé
 * par la sortie, la convolution sautée à la cadence du flux (Rémi, fil 3097 :
 * filtre 384 kHz, radio 48 kHz).
 *
 * Relevé de Xavier (Windows, mode partagé, 25/11) : suréchantillonnage activé
 * et enregistré, aucun changement au DAC, et ni TESS ni la page du greffon ne
 * disaient pourquoi. La sortie locale connaît la raison (cadences du DAC non
 * mesurées, mélangeur de Windows, mode exclusif…) ; le serveur la publie,
 * déjà traduite dans la langue de la requête :
 *
 * - sur l'étape du chemin TESS : `params.refusal` (code) et
 *   `params.refusal_text` (phrase), avec `reason: not_in_service` ;
 * - sur `GET /upsampler/zones/{id}` : `observed_refusal: {reason, description}`.
 *
 * Un serveur plus ancien ne publie rien : l'affichage d'avant reste.
 */

/** La raison publiée par le serveur pour une étape éteinte, ou `null`. */
export function texteDeLaRaisonDeLaSortie(
  e: { effective?: boolean; params?: Record<string, unknown> | null } | null | undefined,
): string | null {
  if (!e || e.effective) return null;
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
