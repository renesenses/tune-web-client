import { get } from 'svelte/store';
import { t } from './i18n';

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

/**
 * Le corps d'un refus 402, tel que `corps_du_refus()` le compose
 * (`tune-server/src/premium_guard.rs`) :
 *
 *     { "error": "premium_required", "code": "multiroom_sync",
 *       "feature": "Multiroom Sync",
 *       "message": "« Multiroom Sync » nécessite Tune Premium.",
 *       "upgrade_url": "https://mozaiklabs.fr/pricing" }
 *
 * ⚠️ `code` porte le nom du DROIT, pas `premium_required` : c'est le terme
 * stable du contrat (#2392), celui qui permet au client de porter sa propre
 * traduction sans dépendre de ce que le serveur sait dire.
 */
export type CorpsRefusPremium = {
  code?: string;
  message?: string;
  zone_limit?: number;
  zones_actives?: number;
} | null | undefined;

/**
 * La phrase À AFFICHER pour un refus 402 — l'UNIQUE formulation du client.
 *
 * 🔴 #884 — POURQUOI LE `message` DU SERVEUR NE DOIT JAMAIS ÊTRE AFFICHÉ.
 *
 * `require_premium` compose son refus **en français**, « le défaut de
 * l'application, faute de requête sous la main » (`premium_guard.rs:50`).
 * Seul `require_premium_localise` suit l'`Accept-Language`. Relevé le
 * 18/09/2026 sur `origin/main` du serveur : **8 sites d'appel localisés sur
 * 58** — 50 routes refusent encore en français, dont `radios.rs`,
 * `plugins.rs`, `room_correction.rs`, `converter.rs`, `playlist_transfer.rs`
 * et `zones/groupes.rs`, le cas le plus visible : un anglophone qui groupe
 * deux zones lisait « « Multiroom Sync » nécessite Tune Premium. ».
 *
 * Le client web ne peut pas corriger 50 sites Rust ; il peut ne plus JAMAIS
 * montrer leur phrase. Il a de quoi : `premium.required` et
 * `zone.freeCapReached` existent dans les onze langues, et le `code` du corps
 * suffit à choisir entre les deux. Une seule aide, donc une seule formulation
 * — cinquante traductions inventées chacune de leur côté seraient pires que le
 * défaut qu'elles corrigent.
 *
 * ⚠️ Le plafond de zones du palier gratuit n'est PAS une fonction payante
 * (#3672) : il garde sa phrase à lui, qui nomme le nombre de zones.
 */
export function messageRefusPremium(corps?: CorpsRefusPremium): string {
  if (corps?.code === 'free_zone_cap_reached') {
    return get(t)('zone.freeCapReached').replace('{n}', String(corps.zone_limit ?? ''));
  }
  return get(t)('premium.required');
}
