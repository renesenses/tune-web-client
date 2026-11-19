/**
 * Pare-feu de Windows : le réseau actif n'est pas couvert par la règle de Tune
 * (tune-server-rust#7371).
 *
 * TEAC NT-505X (fil VNAV) : seul AirPlay est proposé, le renderer UPnP n'est
 * jamais découvert. La règle « Tune » que pose l'installeur ne couvre que le
 * profil Privé (décision de Bertrand : on ne l'étend pas au Public). Sur un
 * réseau classé Public, la découverte DLNA et l'accès distant sont filtrés.
 * Le serveur le relève au démarrage (`GET /api/v1/system/pare-feu`) ; l'écran
 * des zones le dit, avec la marche à suivre.
 *
 * La charge utile vient du réseau : elle est sondée, pas typée sur parole.
 * Un serveur ancien (404), un serveur hors Windows ou un relevé pas encore
 * fini ne montrent rien.
 */

export type ProfilReseau = 'domaine' | 'prive' | 'public';

const PROFILS: readonly ProfilReseau[] = ['domaine', 'prive', 'public'];

/**
 * tune-server-rust#9083 — POURQUOI le profil actif n'est pas couvert, telle
 * que le relevé du serveur la nomme. Thierry (fil 2926) : réseau Privé,
 * tune-server.exe déjà autorisé, et le bandeau répétait « passez en Privé,
 * autorisez tune-server.exe » — deux gestes déjà faits. `null` : serveur
 * antérieur à #9083, consigne générale.
 */
export type CausePareFeu = 'regle_de_blocage' | 'autre_chemin' | 'profil_non_couvert' | 'aucune_regle';

const CAUSES: readonly CausePareFeu[] = ['regle_de_blocage', 'autre_chemin', 'profil_non_couvert', 'aucune_regle'];

export interface AlertePareFeu {
  /** Les profils actifs que la règle de Tune ne couvre pas. */
  profils: ProfilReseau[];
  /** Une règle « Tune » existe (mais pas pour ce profil). */
  reglePresente: boolean;
  /** #9083 — la cause nommée par le serveur, `null` s'il ne la dit pas. */
  cause: CausePareFeu | null;
  /** #9083 — les règles `Block` qui visent le programme lancé. */
  reglesBloquantes: string[];
  /** #9083 — le programme lancé. */
  programme: string | null;
  /** #9083 — les chemins de tune-server autorisés, autres que le programme lancé. */
  cheminsAutorises: string[];
}

const chaines = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];

export function alertePareFeu(charge: unknown): AlertePareFeu | null {
  if (typeof charge !== 'object' || charge === null) return null;
  const c = charge as { windows?: unknown; alerte?: unknown; releve?: unknown };
  if (c.windows !== true || c.alerte !== true) return null;
  const releve = c.releve as {
    profils_non_couverts?: unknown; regle_presente?: unknown; cause?: unknown;
    regles_bloquantes?: unknown; programme?: unknown; chemins_autorises_ailleurs?: unknown;
  } | null;
  if (typeof releve !== 'object' || releve === null) return null;
  const bruts = Array.isArray(releve.profils_non_couverts) ? releve.profils_non_couverts : [];
  const profils = PROFILS.filter((p) => bruts.includes(p));
  if (profils.length === 0) return null;
  const cause = CAUSES.find((x) => x === releve.cause) ?? null;
  return {
    profils,
    reglePresente: releve.regle_presente === true,
    cause,
    reglesBloquantes: chaines(releve.regles_bloquantes),
    programme: typeof releve.programme === 'string' && releve.programme.trim() !== '' ? releve.programme : null,
    cheminsAutorises: chaines(releve.chemins_autorises_ailleurs),
  };
}

/** Ce que le bandeau affiche : un corps, des lignes de détail, des étapes. */
export interface TexteAlertePareFeu {
  corps: string;
  details: string[];
  etapes: string[];
}

/**
 * #9083 — le texte du bandeau selon la cause. Une consigne déjà suivie n'est
 * jamais répétée :
 *
 *  - règle de blocage → la nommer, et dire où la supprimer (elle n'apparaît
 *    pas dans « Autoriser une application via le pare-feu ») ;
 *  - autre chemin → montrer le programme lancé ET le chemin autorisé, et
 *    faire autoriser le programme lancé ;
 *  - sinon la consigne de #7371, mais « Passez le réseau en Privé »
 *    seulement si un réseau actif est Public : sur un réseau déjà Privé (ou
 *    de domaine), ce geste n'a pas de sens.
 *
 * `t` traduit une clé ; `profilNom` nomme un profil.
 */
export function texteAlertePareFeu(
  a: AlertePareFeu,
  t: (cle: string) => string,
  profilNom: (p: ProfilReseau) => string,
): TexteAlertePareFeu {
  const profils = a.profils.map(profilNom).join(', ');
  const redemarrer = t('pareFeu.etapeRedemarrer');
  if (a.cause === 'regle_de_blocage' && a.reglesBloquantes.length > 0) {
    const regles = a.reglesBloquantes.join(', ');
    return {
      corps: t('pareFeu.corpsBlocage').replace('{profils}', profils).replace('{regles}', regles),
      details: [],
      etapes: [t('pareFeu.etapeSupprimerBlocage').replace('{regles}', regles), redemarrer],
    };
  }
  if (a.cause === 'autre_chemin' && a.cheminsAutorises.length > 0) {
    const lance = a.programme ?? 'tune-server.exe';
    return {
      corps: t('pareFeu.corpsAutreChemin').replace('{profils}', profils),
      details: [
        t('pareFeu.programmeLance').replace('{chemin}', lance),
        t('pareFeu.cheminsAutorises').replace('{chemins}', a.cheminsAutorises.join(' ; ')),
      ],
      etapes: [t('pareFeu.etapeAutoriserLance').replace('{chemin}', lance), redemarrer],
    };
  }
  // « Ou autorisez… » ne se lit qu'APRÈS « Passez le réseau en Privé » ;
  // seule (réseau déjà Privé ou de domaine), l'étape perd son « Ou ».
  const etapes: string[] = [];
  if (a.profils.includes('public')) {
    etapes.push(t('pareFeu.etapePrive'));
    etapes.push(t('pareFeu.etapeAutoriser'));
  } else {
    etapes.push(t('pareFeu.etapeAutoriserSeule'));
  }
  etapes.push(redemarrer);
  return { corps: t('pareFeu.corps').replace('{profils}', profils), details: [], etapes };
}
