/**
 * Normalisation de `/system/update/check`.
 *
 * ## Le piège
 *
 * DEUX routes voisines, DEUX conventions de nommage :
 *
 *  - `/system/update/check`  → `current`, `latest`
 *  - `/system/update/status` → `current_version`
 *
 * Mesuré sur le .18 le 06/09/2026 :
 *
 *   check  : {"current":"0.9.138", …, "latest":"0.9.138", "update_available":false}
 *   status : {"current_version":"0.9.138", …, "update_in_progress":false}
 *
 * Le client a retenu `latest_version` / `current_version` comme noms internes.
 * Chaque écran qui lit `check` doit donc TRADUIRE, et l'oubli ne se voit pas :
 * `undefined` ne lève pas, il rend simplement la condition fausse.
 *
 * C'est ce qui est arrivé à `SettingsV2` : tout le bloc de mise à jour vit sous
 * `{#if updateInfo?.latest_version}`. La condition était toujours fausse, donc
 * le bouton d'installation — écrit, avec son traitement des refus 409 — était
 * inatteignable quelle que soit la version disponible. « Mise à jour : manque
 * le bouton de maj » (Bertrand, 06/09/2026, v0.9.138).
 *
 * La traduction vit ici, une fois, plutôt que recopiée dans chaque écran :
 * c'est exactement la duplication qui l'avait fait disparaître d'un des deux.
 */

/** La réponse de `check`, telle que le client la manipule. */
export interface VerificationMaj {
  update_available: boolean;
  latest_version: string | null;
  current_version: string | null;
  /** Les champs bruts du serveur restent accessibles (release_notes, etc.). */
  [k: string]: unknown;
}

/**
 * Rend la réponse sous les noms internes du client.
 *
 * Les deux orthographes sont acceptées en entrée : un serveur qui se mettrait
 * à émettre `latest_version` ne casserait pas l'écran, et l'ordre de lecture
 * privilégie le nom déjà normalisé.
 *
 * `null` en entrée (ou une réponse illisible) rend `null` : l'appelant
 * distingue « pas de réponse » de « pas de mise à jour ».
 */
export function normaliserVerificationMaj(d: any): VerificationMaj | null {
  if (!d || typeof d !== 'object') return null;
  return {
    ...d,
    update_available: d.update_available === true,
    latest_version: d.latest_version ?? d.latest ?? null,
    current_version: d.current_version ?? d.current ?? null,
  };
}
