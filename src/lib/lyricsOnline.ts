/**
 * « La recherche en ligne est-elle allumée ? » — le second verrou de
 * renesenses/tune-server-rust#3577.
 *
 * Le serveur ne cherche les paroles chez LRCLIB que si le réglage
 * `lyrics_lrclib_enabled` vaut la CHAÎNE `"true"`
 * (`tune-server/src/routes/library/tracks.rs`) :
 *
 *     let lrclib_enabled = settings.get("lyrics_lrclib_enabled").ok().flatten()
 *         .as_deref() == Some("true");
 *     if !lrclib_enabled { return no_lyrics(); }
 *
 * Sinon il rend `404 {"error":"no_lyrics"}` — le MÊME 404 que pour un titre
 * qu'il a réellement cherché. Le client ne peut donc pas déduire l'état du
 * réglage de la réponse paroles : il faut le lire.
 *
 * `GET /system/config` publie les réglages ENREGISTRÉS plus une liste de
 * défauts dans laquelle `lyrics_lrclib_enabled` ne figure pas
 * (`tune-server/src/routes/system/config.rs`) : sur une installation qui n'y a
 * jamais touché, la clé est simplement ABSENTE. Absente = éteinte, exactement
 * comme le serveur le décide plus haut.
 *
 * Trois états, et le troisième compte : `null` = PAS ÉTABLI (config pas encore
 * lue, ou illisible). L'écran ne nomme alors aucun motif — mieux vaut se taire
 * que d'accuser un réglage qu'on n'a pas lu.
 */
import { get, writable } from 'svelte/store';
import * as api from './api';

/** `true`/`false` = mesuré ; `null` = pas établi. */
export const parolesEnLigneActives = writable<boolean | null>(null);

/**
 * Traduit la valeur brute de `lyrics_lrclib_enabled` telle que
 * `/system/config` la sérialise. Le réglage est stocké en texte puis
 * re-parsé en JSON par la route : on reçoit donc `true` OU `"true"`.
 *
 * Toute autre valeur — `false`, `"false"`, absente — est un NON, parce que
 * c'est ce que le serveur en fait.
 */
export function parolesEnLigneDepuisConfig(valeur: unknown): boolean {
  return valeur === true || valeur === 'true';
}

let enCours: Promise<void> | null = null;

/**
 * Lit le réglage une fois et le met en cache. `force` le relit (après un
 * changement dans les Réglages).
 *
 * Un échec laisse le témoin à `null` : on n'invente pas un « désactivé » à
 * partir d'une requête qui n'a pas abouti.
 */
export function chargerParolesEnLigne(force = false): Promise<void> {
  if (enCours) return enCours;
  if (!force && get(parolesEnLigneActives) !== null) return Promise.resolve();
  enCours = api
    .getConfig()
    .then((c: any) => {
      parolesEnLigneActives.set(parolesEnLigneDepuisConfig(c?.lyrics_lrclib_enabled));
    })
    .catch(() => {
      parolesEnLigneActives.set(null);
    })
    .finally(() => {
      enCours = null;
    });
  return enCours;
}
