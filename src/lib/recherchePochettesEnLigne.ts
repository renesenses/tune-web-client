import { writable } from 'svelte/store';

/**
 * Deuxième étape du bouton « Rechercher les covers manquantes »
 * (tune-server-rust#7313, go de Bertrand du 30/10/2026) : la recherche EN LIGNE
 * des pochettes d'albums, `POST /library/artwork/enrich`.
 *
 * La première étape (`/library/artwork/rescan`, #2491) ne fait que RELIRE le
 * disque : pochettes intégrées et images de dossier. Un album sans image sur le
 * disque restait donc sans pochette, alors que le testeur parlait bien d'une
 * « recherche de covers ». Le bouton enchaîne désormais les deux.
 *
 * Contrat serveur lu sur `batch/bugs-rc10-20261030`
 * (`routes/library/artwork.rs::demarrer_pochettes_albums`) :
 *  - `skipped` : aucun album sans pochette, rien à chercher ;
 *  - `202 accepted` + `albums_to_process` : la passe tourne en tâche de fond ;
 *  - un refus arrive en erreur HTTP : 429 quand le quota gratuit du jour est
 *    épuisé (`gate_enrichment`), 402/403 pour une fonction Premium.
 * La passe n'émet AUCUN événement : son avancement se lit par
 * `GET /library/artwork/enrich/status`, dont `albums_without_cover` est
 * recalculé à chaque lecture, et dont `result.status` vaut `running` jusqu'au
 * bilan final.
 */
export const INTERVALLE_SUIVI_EN_LIGNE = 3_000;
/** Lectures d'état ratées d'affilée avant de déclarer le suivi perdu. */
export const ECHECS_SUIVI_EN_LIGNE_MAX = 5;

export type PhaseEnLigne = 'repos' | 'demande' | 'en_cours' | 'termine'
  | 'rien_a_chercher' | 'refus' | 'echec' | 'sans_suivi';

export interface EtatEnLigne {
  phase: PhaseEnLigne;
  /** Albums que la passe cherche (sans pochette à son départ). */
  total: number | null;
  /** Pochettes trouvées jusqu'ici, ou au bilan. */
  trouvees: number | null;
  /** Albums encore sans pochette, relus à l'instant. */
  restantes: number | null;
  /** Motif d'un refus du serveur : quota gratuit du jour, ou Premium requis. */
  motif: 'quota' | 'premium' | null;
}

type ReponseDemarrage = { status?: unknown; albums_to_process?: unknown; missing?: unknown } | null;
type EtatServeur = {
  result?: { status?: unknown; total?: unknown; enriched?: unknown } | null;
  albums_without_cover?: unknown;
} | null;

const entier = (n: unknown): number | null =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;

export function rechercheEnLigneOccupee(etat: EtatEnLigne): boolean {
  return etat.phase === 'demande' || etat.phase === 'en_cours';
}

export function creerRechercheEnLigne(deps: {
  demarrer: () => Promise<ReponseDemarrage>;
  lireEtat: () => Promise<EtatServeur>;
}) {
  const repos: EtatEnLigne = { phase: 'repos', total: null, trouvees: null, restantes: null, motif: null };
  let courant = repos;
  const etat = writable(courant);
  let generation = 0;
  let minuterie: ReturnType<typeof setTimeout> | undefined;

  function poser(e: Partial<EtatEnLigne>) {
    courant = { ...courant, ...e };
    etat.set(courant);
  }
  function arreterMinuterie() {
    if (minuterie !== undefined) clearTimeout(minuterie);
    minuterie = undefined;
  }

  function suivre(tour: number, depart: number, echecs: number) {
    minuterie = setTimeout(async () => {
      minuterie = undefined;
      let lu: EtatServeur;
      try {
        lu = await deps.lireEtat();
      } catch {
        if (tour !== generation) return;
        if (echecs + 1 >= ECHECS_SUIVI_EN_LIGNE_MAX) { poser({ phase: 'sans_suivi' }); return; }
        suivre(tour, depart, echecs + 1);
        return;
      }
      if (tour !== generation) return;
      const restantes = entier(lu?.albums_without_cover);
      const resultat = lu?.result ?? null;
      const enCours = resultat?.status === 'running';
      if (resultat && !enCours) {
        // Bilan final écrit par la passe : il fait foi.
        poser({
          phase: 'termine',
          total: entier(resultat.total) ?? courant.total,
          trouvees: entier(resultat.enriched) ?? courant.trouvees,
          restantes,
        });
        return;
      }
      poser({
        restantes,
        // Pas de compteur pendant la passe côté serveur : ce qu'elle a trouvé
        // se mesure par ce qui ne manque plus.
        trouvees: restantes === null ? courant.trouvees : Math.max(0, depart - restantes),
      });
      suivre(tour, depart, 0);
    }, INTERVALLE_SUIVI_EN_LIGNE);
  }

  async function lancer() {
    if (rechercheEnLigneOccupee(courant)) return;
    arreterMinuterie();
    const tour = ++generation;
    courant = { ...repos, phase: 'demande' };
    etat.set(courant);
    let r: ReponseDemarrage;
    try {
      r = await deps.demarrer();
    } catch (e: any) {
      if (tour !== generation) return;
      const status = e?.status;
      if (status === 429) {
        poser({ phase: 'refus', motif: 'quota' });
      } else if (status === 402 || status === 403) {
        poser({ phase: 'refus', motif: 'premium' });
      } else {
        poser({ phase: 'echec' });
      }
      return;
    }
    if (tour !== generation) return;
    if (r?.status === 'skipped') {
      poser({ phase: 'rien_a_chercher', total: 0, trouvees: 0, restantes: 0 });
      return;
    }
    const total = entier(r?.albums_to_process);
    if (r?.status !== 'accepted' || total === null) {
      // Une réponse non reconnue n'est pas une recherche lancée.
      poser({ phase: 'sans_suivi' });
      return;
    }
    poser({ phase: 'en_cours', total, trouvees: 0, restantes: total });
    suivre(tour, total, 0);
  }

  /** Oublie toute recherche suivie : à appeler au démontage de l'écran. */
  function oublier() {
    generation++;
    arreterMinuterie();
    courant = repos;
    etat.set(courant);
  }

  return { etat: { subscribe: etat.subscribe }, lancer, oublier };
}
