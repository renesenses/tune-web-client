import { writable } from 'svelte/store';

export const DELAI_SUIVI_POCHETTES = 60_000;
export type PhasePochettes = 'repos' | 'demande' | 'attente' | 'progression'
  | 'termine' | 'partiel' | 'sans_suivi' | 'interrompu' | 'echec';
export interface CompteursPochettes { current: number; total: number; found: number }
export interface EtatPochettes { phase: PhasePochettes; compteurs: CompteursPochettes | null }
type Evenement = { type?: string; data?: unknown };

export function recherchePochettesOccupee(etat: EtatPochettes): boolean {
  return ['demande', 'attente', 'progression'].includes(etat.phase);
}

function compteursRecus(data: unknown): CompteursPochettes | null {
  if (!data || typeof data !== 'object') return null;
  const c = data as CompteursPochettes;
  if (![c.current, c.total, c.found].every((n) => Number.isSafeInteger(n) && n >= 0)
    || c.current > c.total || c.found > c.current) return null;
  return { current: c.current, total: c.total, found: c.found };
}

/** Contrat rc8.1 : le 202 accepte la demande ; seuls les événements donnent
 * des comptes. Sans job_id, ils décrivent la passe annoncée par le serveur,
 * sans prétendre corréler deux demandes concurrentes. */
export function creerSuiviPochettes(deps: {
  modeSondage: () => boolean;
}) {
  let courant: EtatPochettes = { phase: 'repos', compteurs: null };
  const etat = writable(courant);
  let actif = false;
  let generation = 0;
  let delai: ReturnType<typeof setTimeout> | undefined;
  function poser(phase: PhasePochettes, compteurs = courant.compteurs) {
    courant = { phase, compteurs }; etat.set(courant);
  }
  function effacerDelai() {
    if (delai !== undefined) clearTimeout(delai);
    delai = undefined;
  }
  function perdreLeSuivi(phase: 'sans_suivi' | 'interrompu') {
    generation++; effacerDelai(); poser(phase);
  }
  function armerDelai() {
    effacerDelai();
    delai = setTimeout(() => {
      if (actif && recherchePochettesOccupee(courant)) perdreLeSuivi('sans_suivi');
    }, DELAI_SUIVI_POCHETTES);
  }
  function recevoir(e: Evenement) {
    if (!actif) return;
    if (e.type === '_disconnected' || e.type === '_polling_started') {
      if (recherchePochettesOccupee(courant)) perdreLeSuivi('interrompu');
      return;
    }
    if (e.type !== 'library.artwork.progress' && e.type !== 'library.artwork.completed') return;
    const comptes = compteursRecus(e.data);
    if (!comptes) return;
    if (e.type === 'library.artwork.progress') {
      poser('progression', comptes); armerDelai();
    } else {
      effacerDelai();
      // Le garde Drop du serveur publie aussi une fin lors d'un abandon.
      poser(comptes.current === comptes.total ? 'termine' : 'partiel', comptes);
    }
  }
  async function lancer(demander: () => Promise<unknown>) {
    if (!actif || recherchePochettesOccupee(courant)) return;
    const tour = ++generation;
    poser('demande', null); armerDelai();
    try {
      const reponse = await demander();
      if (!actif || tour !== generation) return;
      // Une petite passe peut se terminer AVANT la réponse du POST.
      if (courant.phase === 'demande') {
        if ((reponse as { status?: unknown } | null)?.status === 'accepted' && !deps.modeSondage()) {
          poser('attente'); armerDelai();
        } else perdreLeSuivi('sans_suivi');
      }
    } catch {
      if (!actif || tour !== generation) return;
      effacerDelai(); poser('echec');
    }
  }
  function abonner(souscrire: (h: (e: Evenement) => void) => () => void) {
    actif = true;
    const arreter = souscrire(recevoir);
    return () => {
      actif = false; generation++; effacerDelai(); arreter();
    };
  }
  return { etat: { subscribe: etat.subscribe }, lancer, abonner };
}
