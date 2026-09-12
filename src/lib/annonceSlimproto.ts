/**
 * L'ANNONCE de Tune comme serveur Squeezebox (#3809).
 *
 * ## Ce que le serveur porte, mesuré sur le tag `v0.9.147`
 *
 * `tune-server/src/background.rs:1908`
 *
 *     pub(crate) const CLE_ANNONCE_SLIMPROTO: &str = "slimproto_discovery_enabled";
 *
 * Le réglage entre et sort par la config système, comme `squeezebox_enabled` :
 *
 *  - `GET /system/config` le publie, avec un défaut **`true`** posé par la
 *    route elle-même (`routes/system/config.rs:315`, `json!(true)`) ;
 *  - `PATCH /system/config` le persiste (boucle générique de `update_config`,
 *    `value.to_string()` en base).
 *
 * ## Pourquoi un module, et pas trois lignes dans chaque écran
 *
 * Le défaut d'origine est un malentendu de vocabulaire, et il se rejouerait
 * au premier copier-coller. DEUX réglages portent le mot « découverte » et
 * gouvernent des sens OPPOSÉS du protocole :
 *
 *  - `squeezebox_enabled` — Tune **client** d'un Lyrion Music Server : il va
 *    chercher les platines qu'un LMS déclare. C'est le seul interrupteur que
 *    l'écran portait, sous le libellé « Activer la découverte Squeezebox ».
 *  - `slimproto_discovery_enabled` — Tune **serveur** : le répondeur UDP du
 *    port 3483, celui qu'une platine (et Home Assistant) trouve toute seule.
 *
 * Un testeur (fil `bug-bonjour-4s0m58`, v0.9.145) voyait Home Assistant se
 * remplir de découvertes Squeezebox et écrivait : « Que je coche ou pas la
 * découverte Squeezebox dans Tune ne change rien. » Il avait raison — la case
 * qu'il décochait gouvernait l'autre sens.
 *
 * ## La règle de lecture est celle du SERVEUR, recopiée
 *
 * `background::annonce_slimproto_activee` :
 *
 *     !matches!(valeur.map(str::trim), Some("false") | Some("0"))
 *
 * Autrement dit : **seul un `false` explicite éteint**. Absence, `true`, ou
 * n'importe quoi d'autre laisse l'annonce armée. Ce n'est pas une coquetterie :
 * `settings` ne stocke que des chaînes, et `GET /system/config` reparse chaque
 * valeur en JSON quand elle s'y prête. Une base écrite par un chemin ancien
 * peut donc rendre `false` (booléen), `"false"` (chaîne) ou `0` (nombre) pour
 * le même « éteint ». Afficher une case COCHÉE devant l'une de ces trois
 * formes redirait à l'utilisateur exactement le mensonge de l'issue.
 *
 * ## Ce que le serveur NE rend PAS
 *
 * `PATCH /system/config` répond `{"ok": true}` et **rien d'autre** : pas d'écho
 * de la valeur posée (`routes/system/config.rs`, `update_config`). L'état
 * affiché ne peut donc pas venir de la réponse du PATCH — il vient d'une
 * RELECTURE de `GET /system/config`. C'est la différence entre « ce que
 * l'utilisateur a cliqué » et « ce que le serveur a retenu », et un serveur
 * antérieur à #3809, qui ignore la clé, se trahit ainsi tout seul.
 */
import * as api from './api';

/** La clé de réglage, telle que le serveur l'écrit. Une seule définition. */
export const CLE_ANNONCE_SLIMPROTO = 'slimproto_discovery_enabled';

/**
 * L'annonce est-elle armée, d'après la valeur que la config publie ?
 *
 * Recopie de `background::annonce_slimproto_activee` : seul un `false`
 * explicite éteint. `undefined` (serveur antérieur, ou clé jamais écrite)
 * rend `true`, qui est le défaut du serveur ET son comportement historique.
 */
export function annonceSlimprotoActivee(valeur: unknown): boolean {
  if (valeur === false || valeur === 0) return false;
  if (typeof valeur === 'string') {
    const v = valeur.trim();
    return v !== 'false' && v !== '0';
  }
  return true;
}

/** L'état de l'annonce d'après un bloc `GET /system/config` entier. */
export function annonceSlimprotoDepuisConfig(config: unknown): boolean {
  const bloc = config as Record<string, unknown> | null | undefined;
  return annonceSlimprotoActivee(bloc?.[CLE_ANNONCE_SLIMPROTO]);
}

/** Lit l'état de l'annonce sur le serveur. */
export async function lireAnnonceSlimproto(): Promise<boolean> {
  return annonceSlimprotoDepuisConfig(await api.getConfig());
}

/**
 * Demande `souhaitee`, puis rend ce que le serveur a RETENU.
 *
 * Deux requêtes, et c'est voulu : le PATCH ne renvoie que `{"ok": true}`. La
 * relecture est la seule façon d'afficher l'état confirmé — un serveur qui
 * ignore la clé rendra son défaut, et la case reviendra d'elle-même à cet
 * état plutôt que de mentir jusqu'au prochain chargement de page.
 */
export async function basculerAnnonceSlimproto(souhaitee: boolean): Promise<boolean> {
  await api.updateConfig({ [CLE_ANNONCE_SLIMPROTO]: souhaitee });
  return lireAnnonceSlimproto();
}
