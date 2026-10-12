/**
 * tune-server-rust#6120 — rattacher À LA MAIN une zone locale orpheline à une
 * sortie ASIO présente.
 *
 * Le serveur refuse, à bon droit, de ré-associer seul une zone ASIO : le nom
 * d'un pilote ASIO est son seul identifiant, et un pilote générique porte le
 * même nom pour des appareils différents. La zone restait donc orpheline,
 * réglages compris (Gros Bidon, fil 2215). Ici, c'est l'utilisateur qui
 * désigne la sortie.
 *
 * Le déroulé, sans dessin : demander les candidats au serveur ; aucun ⇒ le
 * dire ; sinon proposer chacun à la confirmation, dans l'ordre, et rattacher
 * le premier accepté. Avec un seul pilote présent (le cas courant), c'est une
 * seule question.
 */
import type { CandidatRattachement } from './api';

export interface DependancesRattachement {
  candidats: (zoneId: number) => Promise<{ candidats: CandidatRattachement[] }>;
  confirmer: (message: string) => Promise<boolean>;
  rattacher: (zoneId: number, deviceId: string) => Promise<unknown>;
  /** Le libellé de la question, `{zone}` et `{device}` à remplacer. */
  question: string;
}

export type IssueRattachement =
  | { issue: 'aucun_candidat' }
  | { issue: 'annule' }
  | { issue: 'rattachee'; deviceId: string };

export async function rattacherZoneOrpheline(
  zoneId: number,
  nomZone: string,
  d: DependancesRattachement,
): Promise<IssueRattachement> {
  const { candidats } = await d.candidats(zoneId);
  if (!candidats.length) return { issue: 'aucun_candidat' };
  for (const c of candidats) {
    const message = d.question.replace('{zone}', nomZone).replace('{device}', c.name);
    if (await d.confirmer(message)) {
      await d.rattacher(zoneId, c.device_id);
      return { issue: 'rattachee', deviceId: c.device_id };
    }
  }
  return { issue: 'annule' };
}
