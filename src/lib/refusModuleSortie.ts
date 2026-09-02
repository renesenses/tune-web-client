/**
 * Lire le refus d'un module de sortie payant — `renesenses/tune-server-rust#2392`.
 *
 * # Ce que ce fichier répare
 *
 * Le 25/08/2026, un bêta-testeur du module Diretta n'a vu AUCUN appareil dans
 * ses Zones. Pas d'erreur, pas d'avertissement. Il en a conclu à un problème
 * d'installation et a tout repris : réinstallation complète de Fedora,
 * changement de système de fichiers (OverlayFS → XFS), trente minutes de
 * recompilation, récupération manuelle de l'interface web. Puis, au bout de
 * tout ça : « Tune Server démarre correctement, mais au final j'ai toujours le
 * même résultat : aucun appareil Diretta n'apparaît. Je ne sais que faire ! »
 *
 * Son droit était valide depuis sept jours. Sa compilation était bonne. Il lui
 * manquait UNE connexion de compte, et rien à l'écran ne pouvait le lui
 * apprendre.
 *
 * # Ce que le serveur envoie déjà
 *
 * Depuis #2392 le serveur NOMME ce refus. `provider_status_snapshot()`
 * (`tune-server/src/discovery_setup.rs:1862`) est publié tel quel par la route
 * `/system/diagnostics` sous la clé `output_providers` :
 *
 * ```json
 * "output_providers": {
 *   "account_linked": false,
 *   "licensed_modules": [],
 *   "providers": [{
 *     "provider": "diretta",
 *     "required_module": "diretta",
 *     "devices": 0,
 *     "refusal": {
 *       "error": "module_required",
 *       "code": "module_account_not_linked",
 *       "module": "diretta",
 *       "action": "link_account",
 *       "message": "the diretta module is a paid add-on: link your …",
 *       "upgrade_url": "https://mozaiklabs.fr/pricing"
 *     }
 *   }]
 * }
 * ```
 *
 * Jusqu'à ce correctif, `output_providers`, `account_linked`,
 * `licensed_modules`, `module_account_not_linked` et `module_not_owned`
 * avaient ZÉRO occurrence dans tout le client. Le refus était nommé par le
 * serveur et lu par personne.
 *
 * # Pourquoi tout est optionnel ici
 *
 * Un type TypeScript déclaré n'est PAS un contrat vérifié : `SmartCollection.
 * max_albums` et `TrackAllTags.db_fields` étaient déclarés et absents du JSON
 * servi — le compilateur validait, l'écran gelait sur « Chargement ». On ne
 * fait donc confiance à aucun champ : tout est sondé à l'exécution, et un
 * serveur plus ancien (qui n'envoie rien du tout) ne produit simplement aucun
 * refus, donc aucun bandeau.
 *
 * # Les deux codes ne se réparent PAS de la même façon
 *
 * `ModuleRefusal::evaluate` (`tune-server/src/premium_guard.rs:61`) tranche
 * dans cet ordre, et l'ordre porte tout le sens :
 *
 * - `module_account_not_linked` — aucun compte relié. Le serveur ne SAIT PAS
 *   si le module est possédé : la liste des droits est vide parce que personne
 *   n'a pu la lire, pas parce que l'achat manque. Annoncer « non possédé » à
 *   quelqu'un qui a payé, c'est le renvoyer acheter deux fois. L'utilisateur
 *   peut agir tout de suite : relier son compte.
 * - `module_not_owned` — compte relié, droits lus, ce module-ci n'y est pas.
 *   C'est un achat.
 *
 * Les confondre serait pire que se taire. C'est pour ça qu'ils ne partagent
 * ici ni message, ni action, ni destination.
 */

/** Aucun compte Mozaiklabs relié : le droit ne peut pas parvenir au serveur. */
export const COMPTE_NON_RELIE = 'module_account_not_linked';

/** Compte relié, droits lus, ce module n'y figure pas : c'est un achat. */
export const MODULE_NON_POSSEDE = 'module_not_owned';

/**
 * Un refus dont le code n'est pas l'un des deux ci-dessus — y compris un
 * `refusal` sans `code` du tout.
 *
 * Ce n'est pas un cas théorique poli : c'est la seule façon de ne JAMAIS
 * retomber dans le silence de #2392 si un serveur plus récent nomme un
 * troisième refus que cette interface ne connaît pas encore. Masquer est la
 * faute déjà commise ici — le bloc de correction FIR masquait son contenu sur
 * les zones incompatibles, ce qui avait fait conclure à un abonné Premium que
 * la fonction n'existait pas. On prévient, on ne masque pas.
 */
export const REFUS_INCONNU = 'autre';

export type CodeRefusModule =
  | typeof COMPTE_NON_RELIE
  | typeof MODULE_NON_POSSEDE
  | typeof REFUS_INCONNU;

/** Un refus tel que le serveur l'écrit. Tout est optionnel : voir l'en-tête. */
export interface RefusServeur {
  error?: unknown;
  code?: unknown;
  module?: unknown;
  action?: unknown;
  message?: unknown;
  upgrade_url?: unknown;
}

/** Un fournisseur de sortie hors-arbre, tel que le serveur l'écrit. */
export interface FournisseurSortie {
  provider?: unknown;
  required_module?: unknown;
  devices?: unknown;
  refusal?: RefusServeur | null;
}

/** L'instantané complet, sous la clé `output_providers` de `/system/diagnostics`. */
export interface InstantaneFournisseurs {
  account_linked?: unknown;
  licensed_modules?: unknown;
  providers?: unknown;
}

/** Un refus prêt à afficher : un code, les modules concernés, où aller. */
export interface RefusAffichable {
  code: CodeRefusModule;
  /** Noms des modules concernés, dédoublonnés et triés (rendu déterministe). */
  modules: string[];
  /** `upgrade_url` du serveur, jamais inventée ici. `null` s'il n'en donne pas. */
  upgradeUrl: string | null;
}

/** Une chaîne non vide, ou `null`. Ni `0`, ni `false`, ni `"  "`. */
function texte(valeur: unknown): string | null {
  if (typeof valeur !== 'string') return null;
  const net = valeur.trim();
  return net.length > 0 ? net : null;
}

/**
 * Le nom à montrer pour un fournisseur refusé.
 *
 * Trois sources, de la plus précise à la plus large. `refusal.module` est
 * celle que le serveur compose exprès pour l'affichage ; `required_module` est
 * le droit exigé ; `provider` est le nom du fournisseur, toujours renseigné en
 * pratique (`provider.provider_name()`). `null` si aucune ne tient : l'appelant
 * retombe alors sur un nom générique traduit, plutôt que d'afficher un vide.
 */
function nomDuModule(f: FournisseurSortie, refus: RefusServeur): string | null {
  return texte(refus.module) ?? texte(f.required_module) ?? texte(f.provider);
}

/** Le code d'un refus, ramené aux trois cas que l'interface sait dire. */
function codeDuRefus(refus: RefusServeur): CodeRefusModule {
  const brut = texte(refus.code);
  if (brut === COMPTE_NON_RELIE) return COMPTE_NON_RELIE;
  if (brut === MODULE_NON_POSSEDE) return MODULE_NON_POSSEDE;
  return REFUS_INCONNU;
}

/**
 * Les refus à afficher, groupés par code.
 *
 * Rend une liste VIDE — donc aucun bandeau, et c'est le témoin qui compte —
 * quand :
 *
 * - l'instantané est absent (`null`/`undefined`), ce qu'envoie tout serveur
 *   antérieur à #2392 ;
 * - l'instantané est `null` côté serveur, ce qui est déjà une réponse : aucun
 *   fournisseur hors-arbre n'est compilé dans ce binaire ;
 * - `providers` est vide ;
 * - **aucun fournisseur n'a de `refusal`** — c'est le cas de l'utilisateur
 *   dont le compte EST relié et qui possède le module. Il ne doit rien voir
 *   changer, même si sa liste d'appareils est vide : `devices: 0` sans refus
 *   veut dire « il cherche vraiment et ne trouve rien », ce qui n'est pas un
 *   problème de droit et ne se répare pas en reliant un compte.
 *
 * Le nombre d'appareils n'entre JAMAIS dans la décision. Un utilisateur qui a
 * déjà un Sonos a une liste de zones non vide et reste pourtant privé de son
 * module Diretta en silence : conditionner l'avertissement à une liste vide
 * rejouerait le défaut sur lui.
 */
export function refusAAfficher(instantane: unknown): RefusAffichable[] {
  if (!instantane || typeof instantane !== 'object') return [];

  const fournisseurs = (instantane as InstantaneFournisseurs).providers;
  if (!Array.isArray(fournisseurs)) return [];

  // `Map` et non objet : l'ordre d'insertion est garanti, donc le rendu est
  // stable d'une passe à l'autre.
  const parCode = new Map<CodeRefusModule, { modules: Set<string>; upgradeUrl: string | null }>();

  for (const brut of fournisseurs) {
    if (!brut || typeof brut !== 'object') continue;
    const f = brut as FournisseurSortie;

    const refus = f.refusal;
    // Pas de refus = ce fournisseur va bien. C'est la sortie du témoin.
    if (!refus || typeof refus !== 'object') continue;

    const code = codeDuRefus(refus);
    let entree = parCode.get(code);
    if (!entree) {
      entree = { modules: new Set<string>(), upgradeUrl: null };
      parCode.set(code, entree);
    }

    const nom = nomDuModule(f, refus);
    if (nom) entree.modules.add(nom);

    // Première URL rencontrée pour ce code. On ne compose jamais d'URL nous-
    // mêmes : si le serveur n'en donne pas, l'interface n'offre pas de lien.
    entree.upgradeUrl ??= texte(refus.upgrade_url);
  }

  return [...parCode.entries()].map(([code, { modules, upgradeUrl }]) => ({
    code,
    modules: [...modules].sort(),
    upgradeUrl,
  }));
}
