/**
 * Reconnaître un refus d'offre, pour ne pas l'afficher comme une panne.
 *
 * Le serveur garde ses fonctions payantes avec `require_premium` et répond
 * **402 Payment Required**, corps `{"error":"premium_required", …}`
 * (`tune-server/src/premium_guard.rs`). Côté client, tous les chemins d'`api.ts`
 * lèvent désormais un `ApiError` portant `status: 402` ET `code:
 * 'premium_required'` : `fetchJSON` interceptait le 402 avant `apiError()` et
 * levait un `Error` NU — ni `status`, ni `code` — ce qui rendait le refus
 * indistinguable d'une panne réseau ; corrigé à la source (#2178).
 *
 * Le test sur le message reste : c'est la forme que portent les clients
 * déjà installés et les appelants qui comparent la chaîne. Les trois lectures
 * décrivent le même refus, aucune n'est redondante avec certitude.
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
