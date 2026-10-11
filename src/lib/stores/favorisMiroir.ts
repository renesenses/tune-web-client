/**
 * rc4 — état du miroir des favoris de service (`tune-server-rust#6011`).
 *
 * Le serveur le publie dans l'en-tête `X-Tune-Favoris-Miroir` de
 * `GET /profiles/{id}/favorites/streaming` :
 *
 * - `ok` : le dernier rafraîchissement a réussi, rien n'attend ;
 * - `en_attente` : des cœurs posés ou retirés dans Tune attendent encore le
 *   service (Qobuz, Tidal) — le serveur réessaiera ;
 * - `echec` : le dernier rafraîchissement depuis le service a échoué ;
 * - `aucun` : aucun service en miroir n'est connecté.
 *
 * `null` = on ne sait pas : serveur d'avant la rc4 (pas d'en-tête), ou liste
 * pas encore lue. Rien ne s'affiche alors — c'est le comportement d'avant.
 */
import { writable } from 'svelte/store';

export type EtatMiroirFavoris = 'ok' | 'en_attente' | 'echec' | 'aucun';

const ETATS: ReadonlySet<string> = new Set(['ok', 'en_attente', 'echec', 'aucun']);

export const etatMiroirFavoris = writable<EtatMiroirFavoris | null>(null);

/** Lit l'en-tête ; une valeur inconnue vaut « on ne sait pas ». */
export function lireEtatMiroir(valeur: string | null | undefined): EtatMiroirFavoris | null {
  const v = (valeur ?? '').trim().toLowerCase();
  return ETATS.has(v) ? (v as EtatMiroirFavoris) : null;
}
