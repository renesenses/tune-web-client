/**
 * Ce que l'utilisateur lit, selon l'état de l'accès par compte.
 *
 * Les codes viennent du site (`RemoteDenied`, site-mozaiklabs#322) et du
 * relais (`docs/ecoute-a-distance-contrat.md`). Un code inconnu n'est pas
 * avalé : il s'affiche dans le message générique, pour qu'un rapport de bogue
 * le cite.
 */
import type { Etat } from './machine';

export type Presentation =
  /** Rien à montrer. */
  | { forme: 'rien' }
  /** Écran qui recouvre l'application : on ne peut rien faire sans lui. */
  | { forme: 'ecran'; cle: string; params?: Record<string, string>; action?: 'connecter' | 'reprendre' | 'remplacer' | 'reessayer' }
  /** Bandeau : l'application reste utilisable (ancien lien, session encore valable). */
  | { forme: 'bandeau'; cle: string; params?: Record<string, string>; action?: 'connecter' | 'reprendre' | 'reessayer' };

const CLES_REFUS: Record<string, string> = {
  serveur_autre_compte: 'accesCompte.refus.serveurAutreCompte',
  serveur_non_relie: 'accesCompte.refus.serveurNonRelie',
  non_eligible: 'accesCompte.refus.nonEligible',
  appareil_retire: 'accesCompte.refus.appareilRetire',
  revoque: 'accesCompte.refus.revoque',
  autre_appareil: 'accesCompte.refus.revoque',
  bloque: 'accesCompte.refus.bloque',
  refuse_par_le_site: 'accesCompte.refus.bloque',
  navigation_privee: 'accesCompte.refus.navigationPrivee',
  serveur_absent: 'accesCompte.refus.serveurAbsent',
};

/**
 * @param heritage un ancien jeton du pont est connu : l'application marche
 *   encore sans session par compte, un bandeau suffit.
 * @param obsolete le relais a signalé l'ancien lien comme obsolète.
 */
export function presentation(etat: Etat, heritage: boolean, obsolete: boolean): Presentation {
  switch (etat.type) {
    case 'inactif':
    case 'ouverte':
      return { forme: 'rien' };
    case 'deconnecte':
      if (!heritage) return { forme: 'ecran', cle: 'accesCompte.intro', action: 'connecter' };
      return obsolete ? { forme: 'bandeau', cle: 'accesCompte.lienObsolete', action: 'connecter' } : { forme: 'rien' };
    case 'en_cours':
      return heritage ? { forme: 'rien' } : { forme: 'ecran', cle: 'accesCompte.connexionEnCours' };
    case 'indisponible':
      // COEXISTENCE : le site ne délivre pas encore de laissez-passer. Avec
      // l'ancien lien, rien ne change ; sans lui, on dit quoi faire.
      return heritage ? { forme: 'rien' } : { forme: 'ecran', cle: 'accesCompte.indisponible', action: 'reessayer' };
    case 'coupee': {
      if (etat.motif === 'ecoute_reprise_ailleurs') {
        return etat.appareil
          ? { forme: 'ecran', cle: 'accesCompte.repriseAilleurs', params: { appareil: etat.appareil }, action: 'reprendre' }
          : { forme: 'ecran', cle: 'accesCompte.repriseAilleursSansNom', action: 'reprendre' };
      }
      if (etat.motif === 'revoquee') return { forme: 'ecran', cle: 'accesCompte.refus.revoque', action: 'connecter' };
      return { forme: 'ecran', cle: 'accesCompte.coupee', action: 'reprendre' };
    }
    case 'refuse': {
      if (etat.code === 'appareils_pleins') {
        return { forme: 'ecran', cle: 'accesCompte.appareilsPleins', params: { max: String(etat.max ?? 5) }, action: 'remplacer' };
      }
      const cle = CLES_REFUS[etat.code];
      const action = etat.code === 'appareil_retire' ? 'connecter' : 'reessayer';
      const p: Presentation = cle
        ? { forme: heritage ? 'bandeau' : 'ecran', cle, action }
        : { forme: heritage ? 'bandeau' : 'ecran', cle: 'accesCompte.refus.generique', params: { code: etat.code }, action };
      return p;
    }
  }
}

/** Remplace `{nom}` par sa valeur. */
export function remplir(texte: string, params?: Record<string, string>): string {
  if (!params) return texte;
  return texte.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));
}
