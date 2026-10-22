/**
 * Connexion au compte mozaiklabs depuis le client web servi par le relais.
 *
 * Client OAuth PUBLIC `tune-web-pont` (site-mozaiklabs#322, migration
 * `add_remote_listening_oauth_clients`) : pas de secret, PKCE S256
 * obligatoire, adresse de retour FIXE comparée exactement :
 *
 *     https://bridge.mozaiklabs.fr/oauth/retour
 *
 * Le cahier citait `/{server_id}/` ; le site a retenu une adresse fixe, que
 * l'on peut comparer à l'octet près. Le `server_id` voyage donc dans `state`,
 * à côté d'un aléa qui protège du CSRF ; au retour, on revient sur
 * `/{server_id}/`. C'est ce que dit #322, et c'est ce qui est fait ici.
 */
import { aleatoire, depuisBase64Url, versBase64Url } from './format';

export const SITE = 'https://mozaiklabs.fr';
export const CLIENT_ID = 'tune-web-pont';
export const CHEMIN_RETOUR = '/oauth/retour';

export interface JetonsOAuth {
  access: string;
  refresh: string | null;
  /** Secondes Unix. */
  expire: number;
}

export interface MagasinJetons {
  lire(): JetonsOAuth | null;
  ecrire(j: JetonsOAuth): void;
  effacer(): void;
}

const CLE_JETONS = 'tune.remote.oauth';
const CLE_ATTENTE = 'tune.remote.oauth.attente';

/**
 * Jetons OAuth en `localStorage`. Ils ne suffisent pas à écouter : chaque
 * laissez-passer exige aussi une signature de la clé de l'appareil, qui ne
 * quitte pas IndexedDB (cahier § 5.1).
 */
export function magasinJetonsLocal(stockage: Storage | undefined = globalThis.localStorage): MagasinJetons {
  return {
    lire() {
      try {
        const brut = stockage?.getItem(CLE_JETONS);
        if (!brut) return null;
        const j = JSON.parse(brut);
        return typeof j?.access === 'string' ? j : null;
      } catch {
        return null;
      }
    },
    ecrire(j) {
      try {
        stockage?.setItem(CLE_JETONS, JSON.stringify(j));
      } catch {
        /* navigation privée : jetons en mémoire seulement, perdus au rechargement */
      }
    },
    effacer() {
      try {
        stockage?.removeItem(CLE_JETONS);
      } catch {
        /* rien */
      }
    },
  };
}

export function adresseRetour(origine: string): string {
  return `${origine}${CHEMIN_RETOUR}`;
}

async function defiPkce(verificateur: string): Promise<string> {
  const empreinte = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificateur));
  return versBase64Url(empreinte);
}

/** `state` : le serveur à rejoindre au retour, plus un aléa anti-CSRF. */
export function encoderEtat(serverId: string, alea: string): string {
  return versBase64Url(new TextEncoder().encode(JSON.stringify({ sid: serverId, n: alea })));
}

export function decoderEtat(state: string): { sid: string; n: string } | null {
  const o = depuisBase64Url(state);
  if (!o) return null;
  try {
    const e = JSON.parse(new TextDecoder().decode(o));
    return typeof e?.sid === 'string' && typeof e?.n === 'string' ? e : null;
  } catch {
    return null;
  }
}

/**
 * Prépare l'adresse d'autorisation et garde, pour le retour, le vérificateur
 * PKCE et le `state` attendu. `sessionStorage` : le retour arrive dans le
 * MÊME onglet, et rien n'en reste à sa fermeture.
 */
export async function adresseAutorisation(
  serverId: string,
  origine: string,
  stockage: Storage | undefined = globalThis.sessionStorage,
): Promise<string> {
  const verificateur = aleatoire(48);
  const state = encoderEtat(serverId, aleatoire(16));
  try {
    stockage?.setItem(CLE_ATTENTE, JSON.stringify({ verificateur, state }));
  } catch {
    /* sans stockage, le retour échouera proprement (state inconnu) */
  }
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: adresseRetour(origine),
    code_challenge: await defiPkce(verificateur),
    code_challenge_method: 'S256',
    state,
  });
  return `${SITE}/oauth/authorize?${p.toString()}`;
}

export type IssueRetour =
  | { ok: true; serverId: string; jetons: JetonsOAuth }
  | { ok: false; serverId: string | null; erreur: string };

/**
 * Termine le parcours sur `/oauth/retour?code=…&state=…` : contrôle du
 * `state`, échange du code contre les jetons (`POST /oauth/token`).
 */
export async function terminerAutorisation(
  recherche: string,
  origine: string,
  faire: typeof fetch = fetch,
  maintenant: () => number = () => Math.floor(Date.now() / 1000),
  stockage: Storage | undefined = globalThis.sessionStorage,
): Promise<IssueRetour> {
  const p = new URLSearchParams(recherche);
  const state = p.get('state') ?? '';
  const etat = decoderEtat(state);
  const sid = etat?.sid ?? null;
  let attente: { verificateur: string; state: string } | null = null;
  try {
    attente = JSON.parse(stockage?.getItem(CLE_ATTENTE) ?? 'null');
    stockage?.removeItem(CLE_ATTENTE);
  } catch {
    attente = null;
  }
  if (p.get('error')) return { ok: false, serverId: sid, erreur: p.get('error') as string };
  const code = p.get('code');
  if (!code || !etat || !attente || attente.state !== state) {
    return { ok: false, serverId: sid, erreur: 'etat_invalide' };
  }
  const corps = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: adresseRetour(origine),
    client_id: CLIENT_ID,
    code_verifier: attente.verificateur,
  });
  let r: Response;
  try {
    r = await faire(`${SITE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: corps.toString(),
    });
  } catch {
    return { ok: false, serverId: sid, erreur: 'reseau' };
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || typeof j?.access_token !== 'string') {
    return { ok: false, serverId: sid, erreur: j?.error ?? `http_${r.status}` };
  }
  return {
    ok: true,
    serverId: etat.sid,
    jetons: {
      access: j.access_token,
      refresh: typeof j.refresh_token === 'string' ? j.refresh_token : null,
      expire: maintenant() + (Number(j.expires_in) || 0),
    },
  };
}

/**
 * `grant_type=refresh_token`. `null` : le site refuse, il faut se
 * reconnecter. `'reseau'` : le site ne répond pas, rien n'est perdu.
 */
export async function rafraichir(
  jetons: JetonsOAuth,
  faire: typeof fetch,
  maintenant: () => number,
): Promise<JetonsOAuth | null | 'reseau'> {
  if (!jetons.refresh) return null;
  try {
    const r = await faire(`${SITE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: jetons.refresh, client_id: CLIENT_ID }).toString(),
    });
    if (r.status >= 500) return 'reseau';
    if (!r.ok) return null;
    const j = await r.json();
    if (typeof j?.access_token !== 'string') return null;
    return {
      access: j.access_token,
      refresh: typeof j.refresh_token === 'string' ? j.refresh_token : jetons.refresh,
      expire: maintenant() + (Number(j.expires_in) || 0),
    };
  } catch {
    return 'reseau';
  }
}
