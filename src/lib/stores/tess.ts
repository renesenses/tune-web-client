/**
 * TESS est-il servi par CE serveur ? (lot W1)
 *
 * Règle du plan (§ 1, « main publiable à tout moment ») : tout l'écran TESS
 * est CACHÉ tant que le serveur ne l'annonce pas. L'annonce est la route
 * elle-même (contrat § 7) : `GET /tess/catalog` (T08, sans zone), sinon
 * `GET /zones/{id}/tess` ; 404 ⇒ pas de TESS.
 * Les anciens écrans (Égaliseur, Crossfeed, Crossfeed Pro, Crosstalk) restent
 * dans la barre dans tous les cas : leur retrait est le lot W8.
 *
 * - `inconnue` : pas encore su (ou panne) — rien ne change dans la barre ;
 * - `oui`      : réponse conforme au contrat que ce client sait lire ;
 * - `non`      : 404, ou contrat d'une version que ce client ne connaît pas.
 */
import { get, writable } from 'svelte/store';
import * as api from '../api';
import { contratCompris, VERSION_CONTRAT_TESS } from '../tess';
import { activeView } from './navigation';

export type CapaciteTess = 'inconnue' | 'oui' | 'non';

export const capaciteTess = writable<CapaciteTess>('inconnue');

let sondeEnCours: Promise<CapaciteTess | null> | null = null;

/**
 * Interroge le serveur sur une zone. Une panne laisse l'état tel quel.
 *
 * UNE sonde par connexion au serveur (contrat § 6 et § 7 : la capacité est
 * celle du SERVEUR, pas de la zone) : une fois `oui` ou `non` su, la sonde ne
 * repart pas — sauf `forcer`, que pose la reconnexion du flux
 * (`suivreConnexionTess`), puisque le serveur a pu changer de version.
 *
 * Lot W2 : la sonde lit d'abord `GET /tess/catalog`, qui ne dépend d'aucune
 * zone (T08 la sert avec `GET /zones/{id}/tess`). Sans elle, un serveur TESS
 * sans zone courante (première installation, zone supprimée) gardait l'écran
 * caché. Si le catalogue manque (404), la route de la zone décide.
 */
export async function sonderTess(
  zoneId: number | null | undefined,
  forcer = false,
): Promise<CapaciteTess | null> {
  const connue = get(capaciteTess);
  if (!forcer && connue !== 'inconnue') return connue;
  if (sondeEnCours) return sondeEnCours;
  sondeEnCours = (async () => {
    try {
      let c: CapaciteTess | null = null;
      // Les deux sondes partent ENSEMBLE : la capacité est connue au même
      // moment qu'avant W2, sans un aller-retour de plus. Le catalogue, quand
      // il répond, l'emporte ; une panne de l'une ne masque pas l'autre.
      const [cat, zone] = await Promise.allSettled([
        api.getTessCatalogueVersion(),
        zoneId == null ? Promise.resolve(null) : api.getTessZone(zoneId),
      ]);
      const version = cat.status === 'fulfilled' ? cat.value : undefined;
      if (typeof version === 'number') c = version === VERSION_CONTRAT_TESS ? 'oui' : 'non';
      else if (zone.status === 'fulfilled' && zone.value) {
        const r = zone.value;
        if (r.ok) c = contratCompris(r.reponse) ? 'oui' : 'non';
        else if ('absent' in r) c = version === null ? 'non' : null;
      } else if (zoneId == null && version === null) c = 'non';
      if (c) capaciteTess.set(c);
      return c;
    } catch {
      return null;
    } finally {
      sondeEnCours = null;
    }
  })();
  return sondeEnCours;
}

type BusConnexion = { onEvent(h: (e: { type: string }) => void): () => void };

/**
 * Reconnexion au serveur après une coupure : la capacité est relue UNE fois
 * (le serveur a pu être mis à jour). La première connexion ne relance rien :
 * la sonde de la barre s'en charge. Rend la fonction de désabonnement.
 */
export function suivreConnexionTess(bus: BusConnexion, zoneCourante: () => number | null): () => void {
  let coupe = false;
  return bus.onEvent((e) => {
    if (e.type === '_disconnected' || e.type === '_polling_started') coupe = true;
    else if (e.type === '_connected' && coupe) {
      coupe = false;
      void sonderTess(zoneCourante(), true);
    }
  });
}

/**
 * Filtre des entrées STUDIO : `tess` n'apparaît que si le serveur l'annonce.
 * Lot W1 : on AJOUTE l'entrée, on ne retire rien. Égaliseur, Crossfeed,
 * Crossfeed Pro et Crosstalk restent dans la barre tant que leurs réglages
 * n'existent pas dans TESS ; leur retrait est le lot W8.
 */
export function entreesAvecTess<T extends { view: string }>(items: T[], capacite: CapaciteTess): T[] {
  return capacite === 'oui' ? items : items.filter((it) => it.view !== 'tess');
}

/**
 * Le plan veut un écran INVISIBLE face à un serveur sans TESS : ouvert par
 * son adresse (`#tess`) alors que la capacité vaut `non`, on revient à
 * l'accueil. Branché une fois par la coquille ; rend le désabonnement.
 */
export function renvoyerHorsTessSansCapacite(): () => void {
  const verifier = () => {
    if (get(activeView) === 'tess' && get(capaciteTess) === 'non') activeView.set('home');
  };
  const a = activeView.subscribe(verifier);
  const b = capaciteTess.subscribe(verifier);
  return () => { a(); b(); };
}
