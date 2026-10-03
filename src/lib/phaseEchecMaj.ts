/**
 * #1891 — reconnaître une phase d'ÉCHEC telle que le serveur la publie.
 *
 * `GET /system/update/status` ne rend JAMAIS `phase: "failed"` tout court :
 * toutes les sorties d'échec de la mise à jour sont suffixées par leur raison
 * (`tune-server/src/routes/system/update.rs`, `set_phase(&format!("failed: {e}"))`,
 * `"failed: Install failed: {e}"`, `"failed: Install crashed: {msg}"`,
 * `"failed: Extraction failed: {e}"`, `"failed: Cannot determine current exe"`…).
 * Le serveur lui-même reconnaît l'échec par PRÉFIXE
 * (`is_failed = phase.starts_with("failed")`). Le client testait
 * `phase === 'failed'` : l'échec n'était jamais vu, l'écran sondait 180 s puis
 * affichait « Impossible de savoir… », et la raison n'arrivait jamais à l'écran.
 *
 * Les flux appliance (`appliance_storage.rs`) publient, eux, `"failed"` nu et
 * mettent la raison dans un champ `error` séparé : les deux formes passent ici.
 *
 * Rend `null` si la phase n'est pas un échec, `''` pour un échec sans raison
 * (`"failed"` nu), et la raison sinon.
 */
export function raisonEchecPhase(phase: unknown): string | null {
  if (typeof phase !== 'string' || !phase.startsWith('failed')) return null;
  if (phase === 'failed') return '';
  if (phase.startsWith('failed:')) return phase.slice('failed:'.length).trim();
  // Forme inattendue mais préfixée (`failed_…`) : le serveur la tient pour un
  // échec, on la montre telle quelle plutôt que de la taire.
  return phase.trim();
}
