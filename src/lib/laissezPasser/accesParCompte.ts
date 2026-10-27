/**
 * Branchement de l'accès par compte dans l'application servie par le relais.
 *
 * Appelé par `intercepteurRelais.ts`, avant tout autre module : la session
 * doit être en route quand les premiers magasins lancent leurs `fetch`.
 * Servie normalement (réseau local), rien ne s'active.
 */
import { writable, type Readable } from 'svelte/store';
import { brancherAccesParCompte, serverIdDepuisUrl } from '../bridge';
import { aleatoire } from './format';
import { creerCleAppareil, magasinIndexedDb, nomParDefaut, signer } from './cleAppareil';
import { AccesParCompte, magasinSessionOnglet, type Etat } from './machine';
import { adresseAutorisation, CHEMIN_RETOUR, magasinJetonsLocal, SITE, terminerAutorisation } from './oauth';

/** Page « Écoute à distance » de l'espace client : appareils du compte, écoute en cours. */
export const ESPACE_CLIENT_ECOUTE = `${SITE}/account/remote`;

/** Au plus ce délai d'attente au démarrage : au-delà, l'ancien jeton (s'il existe) sert. */
export const ATTENTE_MAX_MS = 8000;

const etat = writable<Etat>({ type: 'inactif' });
const lienObsolete = writable(false);
let machine: AccesParCompte | null = null;

/** État de la session par compte, pour l'interface. */
export const etatAccesParCompte: Readable<Etat> = { subscribe: etat.subscribe };
/** Le relais a signalé que l'ancien lien d'accès sera désactivé. */
export const lienAccesObsolete: Readable<boolean> = { subscribe: lienObsolete.subscribe };

const CLE_NOM = 'tune.remote.nomAppareil';

export function nomAppareilPropose(): string {
  try {
    return localStorage.getItem(CLE_NOM) || nomParDefaut();
  } catch {
    return nomParDefaut();
  }
}

export function estRetourOAuth(): boolean {
  return typeof window !== 'undefined' && window.location?.pathname === CHEMIN_RETOUR;
}

/**
 * Démarre l'accès par compte si la page vient du relais. Rend la machine,
 * ou `null` servie normalement.
 */
export function demarrerAccesParCompte(): AccesParCompte | null {
  const serverId = serverIdDepuisUrl();
  if (!serverId || typeof window === 'undefined') return null;
  const jetons = magasinJetonsLocal();
  const m = new AccesParCompte({
    serverId,
    site: SITE,
    relais: window.location.origin,
    // Le `fetch` d'ORIGINE : les appels au site et au relais ne doivent pas
    // repasser par l'intercepteur, qui attendrait la session qu'ils ouvrent.
    fetch: window.fetch.bind(window),
    maintenant: () => Math.floor(Date.now() / 1000),
    programmer: (ms, f) => setTimeout(f, ms),
    annuler: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    appareil: magasinIndexedDb(),
    jetons,
    session: magasinSessionOnglet(serverId),
    creerCle: () => creerCleAppareil(),
    signer: (cle, message) => signer(cle, message),
    nonce: () => aleatoire(24),
    nomAppareil: nomAppareilPropose,
    versionApp: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : undefined,
  });
  machine = m;
  m.abonner((e) => etat.set(e));

  let attente: Promise<void> | null = null;
  const demarrage = m.demarrer();
  if (m.compteRelie()) {
    // Les requêtes attendent l'ouverture, mais pas indéfiniment : un site
    // lent ne doit pas geler l'ancien lien d'accès.
    attente = Promise.race([demarrage, new Promise<void>((r) => setTimeout(r, ATTENTE_MAX_MS))]).finally(() => {
      attente = null;
    });
  }
  brancherAccesParCompte({
    jeton: () => m.jeton(),
    actif: m.compteRelie(),
    attente: () => attente,
    refus: (corps) => {
      if (corps.code === 'lien_obsolete') lienObsolete.set(true);
      else m.signalerRefusRelais(corps);
    },
    lienObsolete: () => lienObsolete.set(true),
  });
  return m;
}

export function accesParCompte(): AccesParCompte | null {
  return machine;
}

/** Part se connecter au compte mozaiklabs (navigation vers le site). */
export async function connecterCompte(nomAppareil?: string): Promise<void> {
  const serverId = serverIdDepuisUrl();
  if (!serverId) return;
  if (nomAppareil?.trim()) {
    try {
      localStorage.setItem(CLE_NOM, nomAppareil.trim().slice(0, 80));
    } catch {
      /* rien */
    }
  }
  window.location.href = await adresseAutorisation(serverId, window.location.origin);
}

/**
 * Sur `/oauth/retour` : échange le code, range les jetons, puis revient sur
 * `/{server_id}/`. Rend le message d'erreur à afficher, ou ne rend rien
 * (la page part ailleurs).
 */
export async function traiterRetourOAuth(): Promise<string | null> {
  const issue = await terminerAutorisation(window.location.search, window.location.origin);
  if (issue.ok) {
    magasinJetonsLocal().ecrire(issue.jetons);
    window.location.replace(`/${issue.serverId}/`);
    return null;
  }
  if (issue.serverId && issue.erreur === 'access_denied') {
    window.location.replace(`/${issue.serverId}/`);
    return null;
  }
  return issue.erreur;
}
