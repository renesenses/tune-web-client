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
 * ## Ce que le serveur rend, et ce qu'il rendait avant
 *
 * `PATCH /system/config` répondait `{"ok": true}` et **rien d'autre** : pas
 * d'écho de la valeur posée. L'état affiché ne peut donc pas venir de la
 * réponse du PATCH — il vient d'une RELECTURE de `GET /system/config`. C'est
 * la différence entre « ce que l'utilisateur a cliqué » et « ce que le
 * serveur a retenu », et un serveur qui ignore la clé se trahit ainsi tout
 * seul.
 *
 * Depuis le correctif serveur d'application à chaud, la réponse porte en plus
 * `slimproto_discovery_applied` — voir [`CHAMP_APPLIQUE`]. Elle dit si le
 * répondeur UDP a été armé ou éteint **maintenant**, ou s'il faudra
 * redémarrer. Deux serveurs coexistent donc dans le parc, et l'écran doit
 * pouvoir dire vrai devant les deux : le champ ABSENT signifie « serveur
 * antérieur », pas « pas appliqué ».
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
 * Le champ que le serveur ajoute à la réponse du `PATCH` quand il a appliqué
 * l'annonce **à chaud**.
 *
 * Il n'existe que depuis le correctif serveur qui donne au répondeur UDP une
 * poignée de tâche. Avant lui, le réglage n'était lu qu'au démarrage : la
 * bascule s'écrivait en base et ne changeait rien au réseau jusqu'au prochain
 * lancement.
 */
export const CHAMP_APPLIQUE = 'slimproto_discovery_applied';

/**
 * Le serveur a-t-il appliqué la bascule tout de suite ?
 *
 * Fonction PURE, et volontairement STRICTE : seul un `true` franc compte.
 * L'absence du champ est le cas du serveur antérieur — il faut alors dire à
 * l'utilisateur qu'un redémarrage est nécessaire, parce que c'est vrai chez
 * lui. Traiter l'absence comme « appliqué » ferait taire l'avis devant le
 * serveur qui en a le plus besoin.
 */
export function annonceAppliqueeAChaud(reponsePatch: unknown): boolean {
  const bloc = reponsePatch as Record<string, unknown> | null | undefined;
  return bloc?.[CHAMP_APPLIQUE] === true;
}

/** Ce que la bascule apprend : l'état retenu, et s'il a pris effet. */
export interface BasculeAnnonce {
  /** L'état que le serveur a RETENU, relu par `GET /system/config`. */
  annonce: boolean;
  /** Le répondeur a-t-il été armé ou éteint MAINTENANT ? */
  appliqueAChaud: boolean;
}

/**
 * Demande `souhaitee`, puis rend ce que le serveur a RETENU et s'il l'a
 * APPLIQUÉ.
 *
 * Deux requêtes, et c'est voulu : le `PATCH` ne renvoie pas la configuration.
 * La relecture est la seule façon d'afficher l'état confirmé — un serveur qui
 * ignore la clé rendra son défaut, et la case reviendra d'elle-même à cet état
 * plutôt que de mentir jusqu'au prochain chargement de page.
 *
 * La réponse du `PATCH`, elle, sert à UNE chose : savoir s'il faut réclamer un
 * redémarrage. Le dire à tort serait remettre en place le mensonge de #3809 à
 * l'endroit même qu'on répare — l'utilisateur redémarrerait pour rien et en
 * conclurait que le réglage ne fait rien.
 */
export async function basculerAnnonceSlimproto(souhaitee: boolean): Promise<BasculeAnnonce> {
  const reponsePatch = await api.updateConfig({ [CLE_ANNONCE_SLIMPROTO]: souhaitee });
  return {
    annonce: await lireAnnonceSlimproto(),
    appliqueAChaud: annonceAppliqueeAChaud(reponsePatch),
  };
}
