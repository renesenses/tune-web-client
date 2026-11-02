/**
 * L'onglet ouvert est-il encore celui du `web/` que sert le serveur ? (rc10)
 *
 * Constat du 31/10/2026 sur le .18 : nouveau serveur, nouveau `web/`, et le
 * navigateur habituel affichait toujours l'ANCIENNE interface ; seule la
 * navigation privée montrait la nouvelle. Le service worker est corrigé
 * (`src/build/sw.modele.js`) ; ce module est le second filet : il compare
 * l'identifiant de build du bundle CHARGÉ (`__TUNE_BUILD__`) à celui que
 * publie le serveur (`version.json`, champ `build`).
 *
 *  - au démarrage, un écart veut dire que la coquille chargée est périmée :
 *    on recharge, UNE fois (garde anti-boucle en sessionStorage) ;
 *  - plus tard (retour sur l'onglet, intervalle), un écart veut dire que le
 *    serveur a été mis à jour sous un onglet ouvert : un bandeau « Nouvelle
 *    version : recharger », jamais un rechargement imposé — la zone
 *    navigateur peut être en train de jouer.
 *
 * Un identifiant absent d'un côté ou de l'autre (ancien `web/`, relais sans
 * `version.json`, réseau coupé) ne décide RIEN : mieux vaut ne rien dire que
 * recharger à tort.
 */
import { writable } from 'svelte/store';

export type Comparaison = 'identique' | 'differente' | 'inconnue';
export type Moment = 'demarrage' | 'retour';
export type Decision = 'rien' | 'recharger' | 'bandeau';

export const CLE_RECHARGEMENT_VERSION = 'tune-rechargement-version';
export const FENETRE_ANTI_BOUCLE_VERSION_MS = 60_000;
/** Vérification de fond, en plus du retour sur l'onglet. */
export const INTERVALLE_VERIFICATION_MS = 5 * 60_000;

type StockageMinimal = Pick<Storage, 'getItem' | 'setItem'>;

/** Vrai quand le bandeau « Nouvelle version : recharger » doit s'afficher. */
export const interfacePerimee = writable(false);

function propre(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Compare le build chargé et le build servi. */
export function comparerBuilds(charge: unknown, servi: unknown): Comparaison {
  const a = propre(charge);
  const b = propre(servi);
  if (!a || !b) return 'inconnue';
  return a === b ? 'identique' : 'differente';
}

/** Le champ `build` d'un `version.json`, ou `null`. */
export function extraireBuild(doc: unknown): string | null {
  if (!doc || typeof doc !== 'object') return null;
  return propre((doc as { build?: unknown }).build);
}

/**
 * Adresse de `version.json` pour cette page. Par le relais, le client est
 * servi sous `/{server_id}/` : c'est là qu'est son `version.json`.
 */
export function adresseVersionJson(serverId: string | null | undefined): string {
  return serverId ? `/${encodeURIComponent(serverId)}/version.json` : '/version.json';
}

/** Lit le build servi ; `null` sur toute erreur. Jamais depuis un cache. */
export async function lireBuildServi(f: typeof fetch, adresse: string): Promise<string | null> {
  try {
    const r = await f(adresse, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const type = r.headers.get('content-type') ?? '';
    if (type.includes('text/html')) return null;
    return extraireBuild(await r.json());
  } catch {
    return null;
  }
}

/**
 * Que faire d'une comparaison. Au démarrage, recharger si la garde le permet
 * (sinon bandeau : le rechargement n'a pas suffi, on ne boucle pas). Plus
 * tard, toujours le bandeau.
 */
export function deciderApresComparaison(
  c: Comparaison,
  moment: Moment,
  stockage: StockageMinimal | null | undefined,
  maintenant: number,
): Decision {
  if (c !== 'differente') return 'rien';
  if (moment !== 'demarrage') return 'bandeau';
  if (!stockage) return 'bandeau';
  try {
    const precedent = Number(stockage.getItem(CLE_RECHARGEMENT_VERSION));
    if (Number.isFinite(precedent) && precedent > 0 && maintenant - precedent < FENETRE_ANTI_BOUCLE_VERSION_MS) {
      return 'bandeau';
    }
    stockage.setItem(CLE_RECHARGEMENT_VERSION, String(maintenant));
    return 'recharger';
  } catch {
    return 'bandeau';
  }
}

/** Build du bundle chargé. */
export function buildCharge(): string | null {
  return typeof __TUNE_BUILD__ === 'string' ? propre(__TUNE_BUILD__) : null;
}

export interface Environnement {
  fetch: typeof fetch;
  adresse: string;
  charge: string | null;
  stockage: StockageMinimal | null;
  maintenant: () => number;
  recharger: () => void;
}

/** Une vérification ; rend la décision appliquée (pour les bancs). */
export async function verifierVersion(env: Environnement, moment: Moment): Promise<Decision> {
  const servi = await lireBuildServi(env.fetch, env.adresse);
  const d = deciderApresComparaison(comparerBuilds(env.charge, servi), moment, env.stockage, env.maintenant());
  if (d === 'recharger') env.recharger();
  else if (d === 'bandeau') interfacePerimee.set(true);
  return d;
}

function stockageDeSession(fenetre: Window): StockageMinimal | null {
  try {
    return fenetre.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Branche la surveillance : au démarrage, au retour sur l'onglet, quand un
 * nouveau service worker prend la main, et toutes les cinq minutes.
 */
export function installerSurveillanceVersion(fenetre: Window, serverId: string | null): void {
  const env: Environnement = {
    fetch: (...a) => fenetre.fetch(...a),
    adresse: adresseVersionJson(serverId),
    charge: buildCharge(),
    stockage: stockageDeSession(fenetre),
    maintenant: () => Date.now(),
    recharger: () => fenetre.location.reload(),
  };
  if (!env.charge) return;
  void verifierVersion(env, 'demarrage');
  const auRetour = () => {
    if (fenetre.document.visibilityState === 'visible') void verifierVersion(env, 'retour');
  };
  fenetre.document.addEventListener('visibilitychange', auRetour);
  fenetre.addEventListener('pageshow', (e) => {
    // Retour par l'historique (bfcache) : la page n'a pas été rechargée.
    if ((e as PageTransitionEvent).persisted) void verifierVersion(env, 'retour');
  });
  fenetre.navigator.serviceWorker?.addEventListener('controllerchange', () => void verifierVersion(env, 'retour'));
  fenetre.setInterval(() => {
    if (fenetre.document.visibilityState === 'visible') void verifierVersion(env, 'retour');
  }, INTERVALLE_VERIFICATION_MS);
}

/**
 * Enregistre le service worker. `updateViaCache: 'none'` : la vérification de
 * `sw.js` ne passe jamais par le cache HTTP. Au retour sur l'onglet, on
 * redemande la vérification — sans attendre la navigation suivante.
 */
export function enregistrerServiceWorker(fenetre: Window): void {
  const sw = fenetre.navigator.serviceWorker;
  if (!sw) return;
  sw.register('/sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      fenetre.document.addEventListener('visibilitychange', () => {
        if (fenetre.document.visibilityState === 'visible') void reg.update().catch(() => {});
      });
    })
    .catch(() => {});
}
