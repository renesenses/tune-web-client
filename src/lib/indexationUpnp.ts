/**
 * Indexer une source UPnP dans la bibliothèque : les trois plafonds, et ce
 * qu'on dit quand ils mordent (#4154).
 *
 * ## Pourquoi ces paliers, et pas un champ libre
 *
 * Les trois bornes ne se devinent pas. Un champ de saisie demanderait à
 * l'utilisateur un nombre qu'il n'a aucun moyen de choisir ; des paliers lui
 * demandent un ORDRE DE GRANDEUR, ce dont il dispose (« ma bibliothèque fait
 * dans les 50 000 titres »). Le serveur, lui, accepte n'importe quel entier :
 * les paliers sont une aide, pas un contrat.
 *
 * ## Le défaut qu'on referme
 *
 * `PISTES_DEFAUT` valait 50 000, calé sur les 22 331 pistes d'Asset. La
 * bibliothèque locale de Bertrand en compte **47 056** : 6 % de marge. Et la
 * troncature était MUETTE — l'utilisateur cherchait un album jamais indexé et
 * croyait à un bug de recherche.
 *
 * D'où la règle de ce module : **une annonce de troncature nomme le réglage à
 * relever.** Sans cela elle ne sert à rien.
 */

/** La valeur d'un plafond. `null` = sans limite. */
export type Plafond = number | null;

/** Les trois plafonds, tels que `GET /system/config` les publie. */
export interface Plafonds {
  pistes: Plafond;
  conteneurs: Plafond;
  profondeur: Plafond;
}

/** Les clés de réglage, côté serveur. Elles voyagent dans les DEUX sens : le
 *  `PATCH` les écrit, et la réponse d'indexation les cite pour dire laquelle
 *  relever. */
export const CLES = {
  pistes: 'upnp_index_max_pistes',
  conteneurs: 'upnp_index_max_conteneurs',
  profondeur: 'upnp_index_profondeur_max',
} as const;

export type Axe = keyof typeof CLES;

/**
 * Les paliers proposés, par axe. `null` = « sans limite ».
 *
 * Pistes : les valeurs citées par Bertrand le 14/09/2026. Le défaut serveur
 * est 100 000 — le double de sa bibliothèque.
 *
 * Profondeur : **pas de « sans limite »**, et c'est délibéré. Le serveur borne
 * de toute façon à 64, parce qu'un serveur qui frappe un `ObjectID` neuf à
 * chaque visite ferait descendre le parcours sans fin. Proposer ici un choix
 * que le serveur ramène ensuite en silence afficherait un réglage faux.
 */
export const PALIERS: Record<Axe, Plafond[]> = {
  pistes: [50_000, 100_000, 500_000, 1_000_000, null],
  conteneurs: [1_000, 5_000, 20_000, 100_000, null],
  profondeur: [3, 6, 12, 24, 64],
};

/** Les défauts du serveur, pour que l'écran sache quoi montrer avant toute
 *  réponse — et pour que le test puisse rougir si l'un d'eux dérive. */
export const DEFAUTS: Plafonds = {
  pistes: 100_000,
  conteneurs: 1_000,
  profondeur: 6,
};

/**
 * Lit les trois plafonds d'un corps `GET /system/config`.
 *
 * Une clé ABSENTE retombe sur le défaut : un serveur plus ancien que #4154 ne
 * les publie pas, et l'écran doit alors montrer ce que ce serveur-là
 * appliquera, pas une case vide.
 *
 * Une clé présente à `null` est « sans limite » — c'est la valeur que le
 * serveur publie, et celle qu'on lui repasse.
 */
export function lirePlafonds(config: Record<string, unknown> | null | undefined): Plafonds {
  const lu = (cle: string, defaut: Plafond): Plafond => {
    if (!config || !(cle in config)) return defaut;
    const v = config[cle];
    if (v === null) return null;
    const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
    if (!Number.isFinite(n) || n < 0) return defaut;
    // `0` est la forme PERSISTÉE de « sans limite ». Le serveur republie
    // `null`, mais une base écrite à la main peut porter le zéro.
    return n === 0 ? null : n;
  };
  return {
    pistes: lu(CLES.pistes, DEFAUTS.pistes),
    conteneurs: lu(CLES.conteneurs, DEFAUTS.conteneurs),
    profondeur: lu(CLES.profondeur, DEFAUTS.profondeur),
  };
}

/** Le corps d'un `PATCH /system/config` pour UN axe. `null` part tel quel :
 *  c'est ce que le serveur traduit en « sans limite ». */
export function versPatch(axe: Axe, valeur: Plafond): Record<string, Plafond> {
  return { [CLES[axe]]: valeur };
}

/** L'axe auquel une clé de réglage appartient — pour retrouver, depuis une
 *  annonce de troncature, le sélecteur à mettre en avant. */
export function axeDeLaCle(cle: string | null | undefined): Axe | null {
  const trouve = (Object.keys(CLES) as Axe[]).find((a) => CLES[a] === cle);
  return trouve ?? null;
}

/** Ce qu'on écrit sur un palier. « Sans limite » n'est pas un nombre. */
export function libellePalier(valeur: Plafond, sansLimite: string): string {
  return valeur === null ? sansLimite : new Intl.NumberFormat().format(valeur);
}

/** Ce qu'une passe a rapporté — et si elle a été coupée. */
export interface Verdict {
  /** Ce qui est entré en bibliothèque. */
  pistes: number;
  albums: number;
  /** `null` quand rien n'a été tronqué. */
  troncature: {
    /** `'pistes'`, `'conteneurs'` ou `'profondeur'`. */
    nature: string;
    /** L'axe à relever, quand on sait le nommer. */
    axe: Axe | null;
    /** La phrase du serveur — elle nomme déjà le réglage et son chiffre. */
    message: string;
  } | null;
  /** Les erreurs de la passe, s'il y en a eu. */
  erreurs: string[];
}

/**
 * Traduit la réponse d'indexation en ce que l'écran doit montrer.
 *
 * 🔴 **La troncature n'est jamais avalée.** Une passe coupée qui annoncerait
 * seulement « 2 000 pistes indexées » serait un succès apparent : c'est
 * exactement le silence que #4154 referme. Quand `parcours.plafond` est
 * renseigné, le verdict le porte, avec l'axe à relever.
 *
 * Le message vient du SERVEUR, pas d'ici : il connaît la valeur effective du
 * plafond, et deux textes écrits des deux côtés auraient divergé.
 */
export function verdictDe(resultat: {
  parcours?: {
    plafond_atteint?: string | null;
    plafond?: { nature: string; reglage?: string | null; message: string } | null;
  };
  pistes?: { distinctes?: number };
  albums_ajoutes?: number;
  erreurs?: string[];
} | null | undefined): Verdict {
  const plafond = resultat?.parcours?.plafond ?? null;
  const nature = plafond?.nature ?? resultat?.parcours?.plafond_atteint ?? null;
  return {
    pistes: resultat?.pistes?.distinctes ?? 0,
    albums: resultat?.albums_ajoutes ?? 0,
    troncature: nature
      ? {
          nature,
          // Le réglage nommé par le serveur d'abord ; à défaut, la NATURE,
          // qui porte exactement les trois mêmes mots que les axes. Un serveur
          // antérieur à #4154 ne renseigne pas `reglage` — l'écran doit quand
          // même savoir quel sélecteur mettre en avant.
          axe: axeDeLaCle(plafond?.reglage ?? null) ?? (nature in CLES ? (nature as Axe) : null),
          // Un serveur antérieur à #4154 ne porte pas `plafond.message` : on
          // dit au moins CE QUI a coupé, plutôt que de taire la troncature.
          message: plafond?.message ?? `plafond « ${nature} » atteint`,
        }
      : null,
    erreurs: resultat?.erreurs ?? [],
  };
}
