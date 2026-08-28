/**
 * Reconnaître un refus d'offre, pour ne pas l'afficher comme une panne.
 *
 * Le serveur garde ses fonctions payantes avec `require_premium` et répond
 * **402 Payment Required**, corps `{"error":"premium_required", …}`
 * (`tune-server/src/premium_guard.rs`). Côté client, ce refus arrive sous
 * DEUX formes selon le chemin emprunté dans `api.ts` :
 *
 *  - `fetchJSON` intercepte le 402 avant `apiError()` et lève un `Error` NU :
 *    ni `status`, ni `code`, seul le message `premium_required` le distingue ;
 *  - les autres chemins construisent un `ApiError` portant `status: 402` et
 *    `code: 'premium_required'`.
 *
 * Un appelant qui n'en lirait qu'une traiterait la moitié des refus comme des
 * pannes. D'où cette fonction, unique et partagée.
 */
export function estRefusPremium(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const err = e as Error & { code?: string; status?: number };
  return (
    err.status === 402 ||
    err.code === 'premium_required' ||
    err.message === 'premium_required'
  );
}
