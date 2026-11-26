// Auth token management for Tune web client
import { writable } from 'svelte/store';
import { signalerSessionExpiree, reprendreLaSession } from './stores/sessionExpiree';
import { baseApi, entetesRelais } from './bridge';

/**
 * rc14 — compteur qui change à chaque changement de session (jeton posé ou
 * retiré, authentification activée). Les écrans qui décident de droits
 * (boutons des actions de la machine, `droitActionsMachine`) le lisent pour
 * se relire sans recharger la page.
 */
export const versionSession = writable(0);
export function signalerChangementDeSession(): void {
  versionSession.update((n) => n + 1);
}


const TOKEN_KEY = 'tune_jwt_token';
/**
 * rc14 — le jeton de renouvellement (`POST /auth/refresh`,
 * tune-server-rust « Session renouvelée tant qu'elle sert »). Opaque, 30 jours
 * glissants, il TOURNE à chaque usage : le serveur en rend un nouveau, et
 * l'ancien ne sert plus. Absent avec un serveur antérieur : tout marche comme
 * avant (un jeton de 24 h, puis l'écran de connexion).
 */
const REFRESH_KEY = 'tune_refresh_token';
/** Renouveler le jeton d'accès cinq minutes avant son échéance. */
export const AVANCE_RENOUVELLEMENT_MS = 5 * 60 * 1000;

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

/**
 * Pose le jeton d'accès — et, rc14, le jeton de renouvellement que la
 * connexion ou le renouvellement rendent (`refresh_token`). `refreshToken`
 * absent : celui déjà rangé est gardé (retour du SSO, activation d'un ancien
 * serveur).
 */
export function setToken(token: string, refreshToken?: string | null): void {
  localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  // Une session qui reprend retire le calque — quel que soit le chemin qui l'a
  // reprise. Le retour du SSO ne passe pas par le formulaire de connexion ;
  // c'est ici, au seul endroit où un jeton neuf existe, que le drapeau tombe.
  reprendreLaSession();
  signalerChangementDeSession();
  programmerLeRenouvellement();
}

/**
 * Le serveur a refusé le jeton (401). rc14 : s'il y a un jeton de
 * renouvellement, on renouvelle d'abord, et l'écran de connexion n'apparaît
 * que si le renouvellement est refusé. La requête qui a reçu le 401 échoue
 * quand même (ses appelants la traitent déjà) ; les suivantes partent avec le
 * nouveau jeton.
 */
export function clearToken(): void {
  if (getRefreshToken()) {
    void renouvelerLaSession().then((issue) => {
      if (issue === 'refusee') expirerLaSession();
    });
    return;
  }
  expirerLaSession();
}

/** Efface la session locale et montre l'écran de connexion. */
export function expirerLaSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  try {
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* stockage indisponible : rien à effacer */
  }
  arreterLeMinuteur();
  signalerChangementDeSession();
  /*
   * 🔴 ICI VIVAIT `window.location.hash = '#login'`, ET PERSONNE NE LE LISAIT.
   *
   * renesenses/tune-web-client#1021, mesuré sur `origin/main` le 14/09/2026 :
   * `App.svelte` n'écoute le `hashchange` que pour `#tv` (`isTvHash`, l. 707)
   * et `ShellV2` ne lit aucun hash — la v2 navigue par `pushState`. Le jeton
   * partait donc en silence : plus rien ne chargeait, aucun message, aucun
   * écran de connexion. L'utilisateur concluait à une panne du serveur.
   *
   * Le hash est remplacé par un magasin que les DEUX coquilles observent, et
   * non doublé : le laisser aurait gardé une seconde navigation concurrente,
   * et un `#login` collé à l'URL que rien n'efface.
   */
  signalerSessionExpiree();
}

export function isLoggedIn(): boolean {
  return getToken() !== null;
}

// ---------------------------------------------------------------------------
// rc14 — renouvellement de la session
// ---------------------------------------------------------------------------

/** `renouvelee` : nouveau jeton posé. `refusee` : le serveur ne veut plus de
 *  cette session (401) — retour à l'écran de connexion. `differee` : réseau
 *  ou serveur indisponible — on garde tout et on réessaiera. */
export type IssueRenouvellement = 'renouvelee' | 'refusee' | 'differee';

let enCours: Promise<IssueRenouvellement> | null = null;

/**
 * `POST /auth/refresh` — une seule requête à la fois (les 401 simultanés de
 * plusieurs appels se rejoignent ici). Passe par le relais comme la connexion
 * (`baseApi`, `entetesRelais`).
 */
export function renouvelerLaSession(): Promise<IssueRenouvellement> {
  if (!enCours) {
    enCours = renouveler().finally(() => {
      enCours = null;
    });
  }
  return enCours;
}

async function renouveler(deuxiemeEssai = false): Promise<IssueRenouvellement> {
  const jeton = getRefreshToken();
  if (!jeton) return 'refusee';
  let resp: Response;
  try {
    resp = await fetch(`${baseApi()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...entetesRelais() },
      body: JSON.stringify({ refresh_token: jeton }),
    });
  } catch {
    programmerLeRenouvellement(60_000);
    return 'differee';
  }
  if (resp.ok) {
    const data = await resp.json().catch(() => null);
    const acces = data?.token || data?.access_token;
    if (!acces) return 'differee';
    setToken(acces, data?.refresh_token);
    return 'renouvelee';
  }
  if (resp.status === 409) {
    // Un autre onglet vient de tourner ce jeton : il a rangé le nouveau dans
    // le même `localStorage`. Le relire ; sinon réessayer une fois.
    await new Promise((r) => setTimeout(r, 500));
    if (getRefreshToken() !== jeton) {
      programmerLeRenouvellement();
      return 'renouvelee';
    }
    return deuxiemeEssai ? 'refusee' : renouveler(true);
  }
  if (resp.status === 401 || resp.status === 400 || resp.status === 422) return 'refusee';
  programmerLeRenouvellement(60_000);
  return 'differee';
}

/** L'échéance (ms depuis l'époque) du jeton d'accès, lue dans son `exp`. */
export function echeanceDuJeton(jeton: string | null): number | null {
  if (!jeton) return null;
  const partie = jeton.split('.')[1];
  if (!partie) return null;
  try {
    const json = atob(partie.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = JSON.parse(json)?.exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

let minuteur: ReturnType<typeof setTimeout> | null = null;

function arreterLeMinuteur(): void {
  if (minuteur) clearTimeout(minuteur);
  minuteur = null;
}

/**
 * Programme le renouvellement AVANT l'échéance du jeton d'accès
 * ([`AVANCE_RENOUVELLEMENT_MS`]), ou dans `delaiMs` s'il est donné. Sans jeton
 * de renouvellement, rien n'est programmé (serveur antérieur).
 */
export function programmerLeRenouvellement(delaiMs?: number): void {
  arreterLeMinuteur();
  if (!getRefreshToken()) return;
  const echeance = echeanceDuJeton(getToken());
  const delai =
    delaiMs ?? (echeance === null ? 0 : echeance - Date.now() - AVANCE_RENOUVELLEMENT_MS);
  minuteur = setTimeout(
    () => {
      minuteur = null;
      void renouvelerLaSession().then((issue) => {
        if (issue === 'refusee') expirerLaSession();
      });
    },
    Math.min(Math.max(delai, 1000), 2 ** 31 - 1),
  );
}

/** Un onglet en arrière-plan voit ses minuteurs ralentis : au retour au
 *  premier plan, renouveler tout de suite si l'échéance est proche. */
function auRetourAuPremierPlan(): void {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  const echeance = echeanceDuJeton(getToken());
  if (getRefreshToken() && echeance !== null && echeance - Date.now() < AVANCE_RENOUVELLEMENT_MS) {
    programmerLeRenouvellement(0);
  }
}

if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  try {
    programmerLeRenouvellement();
    document.addEventListener('visibilitychange', auRetourAuPremierPlan);
    // Un autre onglet a renouvelé : reprogrammer sur la nouvelle échéance.
    window.addEventListener('storage', (e) => {
      if (e.key === TOKEN_KEY) programmerLeRenouvellement();
    });
  } catch {
    /* environnement sans DOM complet (tests) */
  }
}
