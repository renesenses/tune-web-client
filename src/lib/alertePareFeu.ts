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

export interface AlertePareFeu {
  /** Les profils actifs que la règle de Tune ne couvre pas. */
  profils: ProfilReseau[];
  /** Une règle « Tune » existe (mais pas pour ce profil). */
  reglePresente: boolean;
}

export function alertePareFeu(charge: unknown): AlertePareFeu | null {
  if (typeof charge !== 'object' || charge === null) return null;
  const c = charge as { windows?: unknown; alerte?: unknown; releve?: unknown };
  if (c.windows !== true || c.alerte !== true) return null;
  const releve = c.releve as { profils_non_couverts?: unknown; regle_presente?: unknown } | null;
  if (typeof releve !== 'object' || releve === null) return null;
  const bruts = Array.isArray(releve.profils_non_couverts) ? releve.profils_non_couverts : [];
  const profils = PROFILS.filter((p) => bruts.includes(p));
  if (profils.length === 0) return null;
  return { profils, reglePresente: releve.regle_presente === true };
}
