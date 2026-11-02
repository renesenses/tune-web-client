/**
 * Machine d'états de l'accès par compte (rc8, tune-server-rust#6603).
 *
 * Un FAUX site et un FAUX relais répondent selon les contrats
 * (site-mozaiklabs#322 ; `docs/ecoute-a-distance-contrat.md`) et VÉRIFIENT
 * chaque signature reçue avec la clé publique inscrite, comme le feraient
 * `DeviceKey::verifies` et `tune-laissez-passer`. Les clés sont de vraies
 * clés WebCrypto ; seuls le réseau, l'horloge et la minuterie sont simulés.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { AccesParCompte, REESSAI_S, type Dependances, type SessionOuverte } from '../laissezPasser/machine';
import { creerCleAppareil, signer, type AppareilEnregistre, type MagasinAppareil } from '../laissezPasser/cleAppareil';
import { depuisBase64Url, messageDemande, messageInscription, messageSession } from '../laissezPasser/format';
import type { JetonsOAuth, MagasinJetons } from '../laissezPasser/oauth';
import { presentation } from '../laissezPasser/messages';

const SID = '6f1c1f5e-2b0a-4c2e-9d3b-7a51c0de0001';
const SITE = 'https://mozaiklabs.fr';
const RELAIS = 'https://bridge.mozaiklabs.fr';
const T0 = 1793000000;

function reponse(status: number, corps: unknown): Response {
  return new Response(corps === null ? null : JSON.stringify(corps), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function verifie(alg: string, pk: string, message: string, sig: string): Promise<boolean> {
  const s = globalThis.crypto.subtle;
  const algo = alg === 'Ed25519' ? ({ name: 'Ed25519' } as Algorithm) : { name: 'ECDSA', namedCurve: 'P-256' };
  const cle = await s.importKey('raw', depuisBase64Url(pk)!, algo, false, ['verify']);
  const v = alg === 'Ed25519' ? ({ name: 'Ed25519' } as Algorithm) : { name: 'ECDSA', hash: 'SHA-256' };
  return s.verify(v, cle, depuisBase64Url(sig)!, new TextEncoder().encode(message));
}

/** Laissez-passer factice : le client n'en lit que la charge. */
function jws(charge: Record<string, unknown>): string {
  const b = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b({ alg: 'EdDSA', typ: 'tune-pass+jwt', kid: 'k' })}.${b(charge)}.c2ln`;
}

interface Banc {
  d: Dependances;
  horloge: { t: number };
  minuteries: { quand: number; f: () => void; annulee: boolean }[];
  appels: { url: string; methode: string; corps: any; entetes: Headers }[];
  /** Réglages du faux site et du faux relais. */
  site: {
    cles: boolean;
    appareils: { device_id: string; pk: string; alg: string; name: string }[];
    max: number;
    retires: Set<string>;
    accesValide: string;
    refreshValide: string | null;
    panne: boolean;
    refusLp: string | null;
    /** Appareils d'un AUTRE compte : le site ne les rend ni ne les retire jamais. */
    autres: string[];
  };
  relais: { laissezPasser: boolean; jeton: string; sessions: number; ancien: boolean };
  magasinAppareil: { valeur: AppareilEnregistre | null };
  jetonsOAuth: { valeur: JetonsOAuth | null };
  session: { valeur: SessionOuverte | null };
  avancer(s: number): Promise<void>;
}

function banc(options: { compte?: boolean; stockage?: boolean } = {}): Banc {
  const horloge = { t: T0 };
  const minuteries: Banc['minuteries'] = [];
  const appels: Banc['appels'] = [];
  const site: Banc['site'] = {
    cles: true,
    appareils: [],
    max: 5,
    retires: new Set(),
    accesValide: 'acces-1',
    refreshValide: 'refresh-1',
    panne: false,
    refusLp: null,
    autres: [],
  };
  const relais = { laissezPasser: true, jeton: 'jeton-de-session-256', sessions: 0, ancien: false };
  const defisSite = new Set<string>();
  const defisRelais = new Set<string>();
  const nonces = new Set<string>();
  const magasinAppareil = { valeur: null as AppareilEnregistre | null };
  const jetonsOAuth = {
    valeur: (options.compte ?? true) ? ({ access: 'acces-1', refresh: 'refresh-1', expire: T0 + 30 * 86400 } as JetonsOAuth) : null,
  };
  const session = { valeur: null as SessionOuverte | null };
  let n = 0;

  const faire = async (entree: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(entree);
    const methode = init?.method ?? 'GET';
    const entetes = new Headers(init?.headers ?? undefined);
    let corps: any = null;
    if (typeof init?.body === 'string') {
      corps = entetes.get('Content-Type')?.includes('json') ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body));
    }
    appels.push({ url, methode, corps, entetes });

    if (url.startsWith(SITE)) {
      if (site.panne) throw new TypeError('Failed to fetch');
      const chemin = url.slice(SITE.length);
      if (chemin === '/oauth/token') {
        if (corps.grant_type === 'refresh_token' && corps.refresh_token === site.refreshValide && corps.client_id === 'tune-web-pont') {
          site.accesValide = 'acces-2';
          return reponse(200, { access_token: 'acces-2', refresh_token: 'refresh-2', expires_in: 2592000 });
        }
        return reponse(400, { error: 'invalid_grant' });
      }
      if (entetes.get('Authorization') !== `Bearer ${site.accesValide}`) return reponse(401, { error: 'Invalid or expired token' });
      if (chemin === '/api/v1/remote/devices/challenge' && methode === 'POST') {
        const c = `defi-site-${++n}`;
        defisSite.add(c);
        return reponse(200, { challenge: c, expires_in: 300 });
      }
      if (chemin === '/api/v1/remote/devices' && methode === 'POST') {
        if (!defisSite.delete(corps.challenge)) return reponse(403, { error: 'defi_inconnu' });
        if (!(await verifie(corps.key_alg, corps.public_key, messageInscription(corps.challenge, corps.public_key), corps.signature))) {
          return reponse(403, { error: 'signature' });
        }
        if (corps.replace_device_id) {
          site.appareils = site.appareils.filter((a) => a.device_id !== corps.replace_device_id);
        }
        if (site.appareils.length >= site.max) {
          return reponse(409, {
            error: 'appareils_pleins',
            max: site.max,
            devices: site.appareils.map((a) => ({ device_id: a.device_id, name: a.name, platform: 'ios' })),
          });
        }
        const device_id = `dev_${++n}`;
        site.appareils.push({ device_id, pk: corps.public_key, alg: corps.key_alg, name: corps.name });
        return reponse(201, { device_id, name: corps.name, platform: corps.platform });
      }
      if (chemin === '/api/v1/remote/passes' && methode === 'POST') {
        if (!site.cles) return reponse(503, { error: 'cles_indisponibles' });
        if (site.retires.has(corps.device_id)) return reponse(403, { error: 'appareil_retire' });
        const a = site.appareils.find((x) => x.device_id === corps.device_id);
        if (!a) return reponse(403, { error: 'appareil_inconnu' });
        const msg = messageDemande(corps.server_id, corps.device_id, corps.timestamp, corps.nonce);
        if (!(await verifie(a.alg, a.pk, msg, corps.signature))) return reponse(403, { error: 'signature' });
        if (Math.abs(horloge.t - corps.timestamp) > 120) return reponse(403, { error: 'horodatage' });
        if (nonces.has(corps.nonce)) return reponse(403, { error: 'rejeu' });
        nonces.add(corps.nonce);
        if (site.refusLp) return reponse(403, { error: site.refusLp });
        const iat = horloge.t;
        const exp = iat + 3600;
        return reponse(201, {
          laissez_passer: jws({ sid: corps.server_id, did: a.device_id, cnf: { alg: a.alg, pk: a.pk }, iat, exp, jti: `lp_${++n}` }),
          exp,
          renouveler_a: iat + 2700,
        });
      }
      if (chemin === '/api/v1/remote/devices' && methode === 'GET') {
        return reponse(200, {
          max: site.max,
          devices: site.appareils
            .filter((a) => !site.retires.has(a.device_id))
            .map((a) => ({ device_id: a.device_id, name: a.name, platform: 'web', last_pass_at: null })),
        });
      }
      const retrait = chemin.match(/^\/api\/v1\/remote\/devices\/([^/]+)$/);
      if (retrait && methode === 'DELETE') {
        const id = decodeURIComponent(retrait[1]);
        const sien = site.appareils.some((a) => a.device_id === id) && !site.autres.includes(id);
        if (!sien || site.retires.has(id)) return reponse(404, { error: 'appareil_inconnu' });
        site.retires.add(id);
        return reponse(200, { ok: true });
      }
      return reponse(404, { error: 'introuvable' });
    }

    // Relais
    const chemin = url.slice(RELAIS.length);
    if (relais.ancien) return new Response('Not Found', { status: 404 });
    if (chemin === `/session/defi/${SID}`) {
      if (!relais.laissezPasser) return reponse(503, { code: 'jeu_de_cles_absent' });
      const d = `defi-relais-${++n}`;
      defisRelais.add(d);
      return reponse(200, { defi: d, expire: horloge.t + 60 });
    }
    if (chemin === `/session/${SID}` || chemin === '/session/renouveler') {
      if (!defisRelais.delete(corps.defi)) return reponse(401, { code: 'defi' });
      const charge = JSON.parse(atob(corps.laissez_passer.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (!(await verifie(charge.cnf.alg, charge.cnf.pk, messageSession(SID, corps.defi), corps.signature))) {
        return reponse(401, { code: 'defi' });
      }
      if (chemin === '/session/renouveler') {
        if (entetes.get('X-Bridge-Token') !== relais.jeton) return reponse(401, { code: 'session_expiree' });
        return reponse(200, { jeton: relais.jeton, expire: charge.exp, secours: false });
      }
      relais.sessions++;
      return reponse(200, { jeton: relais.jeton, expire: charge.exp, secours: false });
    }
    return reponse(404, { code: 'introuvable' });
  };

  const magasin: MagasinAppareil = {
    lire: async () => magasinAppareil.valeur,
    ecrire: async (a) => {
      magasinAppareil.valeur = a;
    },
    effacer: async () => {
      magasinAppareil.valeur = null;
    },
  };
  const jetons: MagasinJetons = {
    lire: () => jetonsOAuth.valeur,
    ecrire: (j) => {
      jetonsOAuth.valeur = j;
    },
    effacer: () => {
      jetonsOAuth.valeur = null;
    },
  };

  const d: Dependances = {
    serverId: SID,
    site: SITE,
    relais: RELAIS,
    fetch: faire as typeof fetch,
    maintenant: () => horloge.t,
    programmer: (ms, f) => {
      const m = { quand: horloge.t + ms / 1000, f, annulee: false };
      minuteries.push(m);
      return m;
    },
    annuler: (h) => {
      (h as { annulee: boolean }).annulee = true;
    },
    appareil: options.stockage === false ? null : magasin,
    jetons,
    session: {
      lire: () => session.valeur,
      ecrire: (s) => {
        session.valeur = s;
      },
      effacer: () => {
        session.valeur = null;
      },
    },
    creerCle: () => creerCleAppareil(),
    signer: (cle, message) => signer(cle, message),
    nonce: () => `nonce-unique-${++n}-xxxxxxxx`,
    nomAppareil: () => 'Safari · iPhone',
    versionApp: '1.0.0',
  };

  const b: Banc = {
    d,
    horloge,
    minuteries,
    appels,
    site,
    relais,
    magasinAppareil,
    jetonsOAuth,
    session,
    async avancer(s: number) {
      horloge.t += s;
      for (const m of [...minuteries]) {
        if (!m.annulee && m.quand <= horloge.t) {
          m.annulee = true;
          m.f();
        }
      }
      // Laisse la renouvellement lancé par la minuterie aller au bout.
      for (let i = 0; i < 50; i++) await new Promise((r) => setTimeout(r, 0));
    },
  };
  return b;
}

function chemins(b: Banc): string[] {
  return b.appels.map((a) => `${a.methode} ${a.url.replace(SITE, 'site').replace(RELAIS, 'relais')}`);
}

describe('ouverture', () => {
  let b: Banc;
  beforeEach(() => {
    b = banc();
  });

  it('inscrit l’appareil, demande un laissez-passer, ouvre la session : chaque signature est vérifiée', async () => {
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    expect(m.etat).toMatchObject({ type: 'ouverte', expire: T0 + 3600, renouvelerA: T0 + 2700 });
    expect(m.jeton()).toBe('jeton-de-session-256');
    expect(chemins(b)).toEqual([
      'POST site/api/v1/remote/devices/challenge',
      'POST site/api/v1/remote/devices',
      'POST site/api/v1/remote/passes',
      `GET relais/session/defi/${SID}`,
      `POST relais/session/${SID}`,
    ]);
    const inscription = b.appels[1].corps;
    expect(inscription).toMatchObject({ platform: 'web', name: 'Safari · iPhone', key_alg: 'Ed25519', app_version: '1.0.0' });
    expect(b.magasinAppareil.valeur?.deviceId).toBe(b.site.appareils[0].device_id);
    // La clé reste non extractible dans le magasin.
    expect(b.magasinAppareil.valeur?.cle.privee.extractable).toBe(false);
    // Le jeton OAuth ne va QU'au site, jamais au relais.
    for (const a of b.appels) {
      if (a.url.startsWith(RELAIS)) expect(a.entetes.get('Authorization')).toBeNull();
    }
  });

  it('un appareil déjà inscrit ne se réinscrit pas', async () => {
    await new AccesParCompte(b.d).demarrer();
    b.session.valeur = null;
    b.appels.length = 0;
    await new AccesParCompte(b.d).demarrer();
    expect(chemins(b)[0]).toBe('POST site/api/v1/remote/passes');
    expect(b.site.appareils).toHaveLength(1);
  });

  it('reprend la session de l’onglet après un rechargement, sans un seul appel', async () => {
    await new AccesParCompte(b.d).demarrer();
    b.appels.length = 0;
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    expect(m.jeton()).toBe('jeton-de-session-256');
    expect(b.appels).toHaveLength(0);
  });

  it('sans compte relié : `deconnecte`, aucun appel', async () => {
    const sans = banc({ compte: false });
    const m = new AccesParCompte(sans.d);
    await m.demarrer();
    expect(m.etat.type).toBe('deconnecte');
    expect(sans.appels).toHaveLength(0);
    expect(m.jeton()).toBeNull();
  });

  it('navigation privée (pas d’IndexedDB) : refus clair, aucun appareil consommé', async () => {
    const prive = banc({ stockage: false });
    const m = new AccesParCompte(prive.d);
    await m.demarrer();
    expect(m.etat).toEqual({ type: 'refuse', code: 'navigation_privee' });
    expect(prive.site.appareils).toHaveLength(0);
  });

  it('jeton OAuth expiré : rafraîchi une fois, puis la demande repart', async () => {
    b.site.accesValide = 'autre';
    b.site.refreshValide = 'refresh-1';
    const m = new AccesParCompte(b.d);
    // Le faux site rend `acces-2` au rafraîchissement et l'accepte ensuite.
    await m.demarrer();
    expect(m.etat.type).toBe('ouverte');
    expect(b.jetonsOAuth.valeur?.access).toBe('acces-2');
  });

  it('rafraîchissement refusé : retour à `deconnecte`, jetons oubliés', async () => {
    b.site.accesValide = 'autre';
    b.site.refreshValide = null;
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    expect(m.etat.type).toBe('deconnecte');
    expect(b.jetonsOAuth.valeur).toBeNull();
  });
});

describe('coexistence avec le jeton du pont', () => {
  it('site sans clés (503 `cles_indisponibles`) : `indisponible`, aucun jeton de session', async () => {
    const b = banc();
    b.site.cles = false;
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    expect(m.etat).toEqual({ type: 'indisponible', raison: 'cles_indisponibles' });
    expect(m.jeton()).toBeNull();
    // L'ancien lien reste seul : rien à l'écran s'il existe.
    expect(presentation(m.etat, true, false)).toEqual({ forme: 'rien' });
  });

  it('relais sans jeu de clés (503 `jeu_de_cles_absent`) : `indisponible`', async () => {
    const b = banc();
    b.relais.laissezPasser = false;
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    expect(m.etat).toEqual({ type: 'indisponible', raison: 'jeu_de_cles_absent' });
    expect(m.jeton()).toBeNull();
  });

  it('relais antérieur (pas de route /session) : `indisponible`', async () => {
    const b = banc();
    b.relais.ancien = true;
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    expect(m.etat).toEqual({ type: 'indisponible', raison: 'relais_sans_laissez_passer' });
  });

  it('site injoignable : `indisponible`, l’ancien lien continue', async () => {
    const b = banc();
    b.site.panne = true;
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    expect(m.etat).toEqual({ type: 'indisponible', raison: 'site_injoignable' });
    expect(presentation(m.etat, true, false).forme).toBe('rien');
    expect(presentation(m.etat, false, false).forme).toBe('ecran');
  });
});

describe('renouvellement', () => {
  it('à 45 min : nouveau laissez-passer, MÊME jeton de session, prochain renouvellement planifié', async () => {
    const b = banc();
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    b.appels.length = 0;
    await b.avancer(2700);
    expect(chemins(b)).toEqual([
      'POST site/api/v1/remote/passes',
      `GET relais/session/defi/${SID}`,
      'POST relais/session/renouveler',
    ]);
    expect(b.appels[2].entetes.get('X-Bridge-Token')).toBe('jeton-de-session-256');
    expect(m.jeton()).toBe('jeton-de-session-256');
    expect(m.etat).toMatchObject({ type: 'ouverte', expire: T0 + 2700 + 3600, renouvelerA: T0 + 2700 + 2700 });
    expect(b.relais.sessions).toBe(1);
  });

  it('échec passager : nouvel essai 5 min plus tard, la session continue', async () => {
    const b = banc();
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    b.site.panne = true;
    await b.avancer(2700);
    expect(m.jeton()).toBe('jeton-de-session-256');
    const prochain = b.minuteries.filter((x) => !x.annulee).at(-1)!;
    expect(prochain.quand).toBe(T0 + 2700 + REESSAI_S);
    b.site.panne = false;
    b.appels.length = 0;
    await b.avancer(REESSAI_S);
    expect(chemins(b).at(-1)).toBe('POST relais/session/renouveler');
    expect(m.etat).toMatchObject({ type: 'ouverte', expire: T0 + 2700 + REESSAI_S + 3600 });
  });

  it('jamais renouvelée : la session tombe à son terme, le jeton n’est plus présenté', async () => {
    const b = banc();
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    b.site.panne = true;
    for (let i = 0; i < 4; i++) await b.avancer(i === 0 ? 2700 : REESSAI_S);
    expect(m.jeton()).toBeNull();
    expect(m.etat.type).toBe('indisponible');
  });

  it('relais redémarré (session inconnue) : une nouvelle session, sans rien demander', async () => {
    const b = banc();
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    b.relais.jeton = 'nouveau-jeton';
    await b.avancer(2700);
    expect(m.jeton()).toBe('nouveau-jeton');
    expect(b.relais.sessions).toBe(2);
  });
});

describe('refus', () => {
  it('5 appareils : 409, liste rendue ; « Remplacer » envoie `replace_device_id` et ouvre la session', async () => {
    const b = banc();
    b.site.appareils = Array.from({ length: 5 }, (_, i) => ({ device_id: `dev_x${i}`, pk: 'p', alg: 'Ed25519', name: `iPhone ${i}` }));
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    expect(m.etat).toMatchObject({ type: 'refuse', code: 'appareils_pleins', max: 5 });
    if (m.etat.type !== 'refuse') throw new Error();
    expect(m.etat.appareils?.map((a) => a.device_id)).toEqual(['dev_x0', 'dev_x1', 'dev_x2', 'dev_x3', 'dev_x4']);
    expect(presentation(m.etat, false, false)).toMatchObject({ forme: 'ecran', cle: 'accesCompte.appareilsPleins', params: { max: '5' } });

    await m.remplacerAppareil('dev_x2');
    const inscription = b.appels.filter((a) => a.url.endsWith('/api/v1/remote/devices')).at(-1)!;
    expect(inscription.corps.replace_device_id).toBe('dev_x2');
    expect(m.etat.type).toBe('ouverte');
    expect(b.site.appareils.map((a) => a.device_id)).not.toContain('dev_x2');
  });

  it('serveur d’un autre compte (bibliothèque d’un ami) : refus, message dédié', async () => {
    const b = banc();
    b.site.refusLp = 'serveur_autre_compte';
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    expect(m.etat).toEqual({ type: 'refuse', code: 'serveur_autre_compte', motif: undefined });
    expect(presentation(m.etat, false, false)).toMatchObject({ cle: 'accesCompte.refus.serveurAutreCompte' });
  });

  it('appareil retiré depuis l’espace client : refus, et PAS de réinscription silencieuse', async () => {
    const b = banc();
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    b.site.retires.add(b.site.appareils[0].device_id);
    b.session.valeur = null;
    const m2 = new AccesParCompte(b.d);
    await m2.demarrer();
    expect(m2.etat).toMatchObject({ type: 'refuse', code: 'appareil_retire' });
    expect(b.site.appareils).toHaveLength(1);
    expect(b.magasinAppareil.valeur).toBeNull();
  });

  it('2e écoute ailleurs (politique B) : coupure avec le nom de l’appareil ; « Reprendre ici » rouvre', async () => {
    const b = banc();
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    m.signalerRefusRelais({ code: 'session_coupee', motif: 'ecoute_reprise_ailleurs', appareil: 'iPad de Bertrand' });
    expect(m.etat).toEqual({ type: 'coupee', motif: 'ecoute_reprise_ailleurs', appareil: 'iPad de Bertrand' });
    expect(m.jeton()).toBeNull();
    expect(b.session.valeur).toBeNull();
    // Le renouvellement planifié est annulé : on ne reprend pas la main en douce.
    expect(b.minuteries.every((x) => x.annulee)).toBe(true);
    expect(presentation(m.etat, true, false)).toEqual({
      forme: 'ecran',
      cle: 'accesCompte.repriseAilleurs',
      params: { appareil: 'iPad de Bertrand' },
      action: 'reprendre',
    });
    await m.reprendre();
    expect(m.etat.type).toBe('ouverte');
    expect(b.relais.sessions).toBe(2);
  });

  it('un refus sans session ouverte (ancien lien) est ignoré', () => {
    const b = banc({ compte: false });
    const m = new AccesParCompte(b.d);
    m.signalerRefusRelais({ code: 'session_coupee', motif: 'ecoute_reprise_ailleurs' });
    expect(m.etat.type).toBe('inactif');
  });
});

describe('présentation', () => {
  it('ancien lien seul, relais muet : rien ne change à l’écran', () => {
    expect(presentation({ type: 'deconnecte' }, true, false)).toEqual({ forme: 'rien' });
  });
  it('ancien lien signalé obsolète : bandeau qui invite à se connecter', () => {
    expect(presentation({ type: 'deconnecte' }, true, true)).toMatchObject({ forme: 'bandeau', cle: 'accesCompte.lienObsolete', action: 'connecter' });
  });
  it('ni lien ni compte : écran de connexion', () => {
    expect(presentation({ type: 'deconnecte' }, false, false)).toMatchObject({ forme: 'ecran', action: 'connecter' });
  });
  it('code inconnu : cité dans le message générique, pas avalé', () => {
    expect(presentation({ type: 'refuse', code: 'nouveau_code' }, false, false)).toMatchObject({
      cle: 'accesCompte.refus.generique',
      params: { code: 'nouveau_code' },
    });
  });
});

describe('appareils du compte (Réglages)', () => {
  let b: Banc;
  beforeEach(() => {
    b = banc();
  });

  it('liste les appareils du compte et reconnaît ce navigateur', async () => {
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    b.site.appareils.push({ device_id: 'dev_ipad', pk: 'x', alg: 'Ed25519', name: 'iPad du salon' });
    const r = await m.listerAppareils();
    expect(r).toMatchObject({ ok: true, max: 5, courant: b.magasinAppareil.valeur?.deviceId });
    if (!r.ok) throw new Error('liste refusée');
    expect(r.appareils.map((a) => a.name)).toEqual(['Safari · iPhone', 'iPad du salon']);
    const appel = b.appels[b.appels.length - 1];
    expect(appel.methode).toBe('GET');
    expect(appel.entetes.get('Authorization')).toBe('Bearer acces-1');
  });

  it('retire un autre appareil : la session de ce navigateur continue, le retiré n’a plus de laissez-passer', async () => {
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    b.site.appareils.push({ device_id: 'dev_ipad', pk: 'x', alg: 'Ed25519', name: 'iPad du salon' });
    const r = await m.retirerAppareil('dev_ipad');
    expect(r).toEqual({ ok: true, courant: false });
    expect(b.appels[b.appels.length - 1]).toMatchObject({ methode: 'DELETE', url: `${SITE}/api/v1/remote/devices/dev_ipad` });
    expect(m.etat.type).toBe('ouverte');
    expect(m.jeton()).toBe('jeton-de-session-256');
    expect(b.site.retires.has('dev_ipad')).toBe(true);
    const liste = await m.listerAppareils();
    expect(liste.ok && liste.appareils.map((a) => a.device_id)).not.toContain('dev_ipad');
  });

  it('retire CE navigateur : session arrêtée ici, clé oubliée, refus « appareil retiré »', async () => {
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    const ici = b.magasinAppareil.valeur!.deviceId!;
    const r = await m.retirerAppareil(ici);
    expect(r).toEqual({ ok: true, courant: true });
    expect(m.jeton()).toBeNull();
    expect(b.session.valeur).toBeNull();
    expect(b.magasinAppareil.valeur).toBeNull();
    expect(m.etat).toEqual({ type: 'refuse', code: 'appareil_retire' });
    // Aucun renouvellement ne repart en douce.
    b.appels.length = 0;
    await b.avancer(3600);
    expect(b.appels).toHaveLength(0);
  });

  it('l’appareil d’un autre compte : le site répond 404, rien ne change ici', async () => {
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    b.site.appareils.push({ device_id: 'dev_ami', pk: 'x', alg: 'Ed25519', name: 'Téléphone d’un ami' });
    b.site.autres.push('dev_ami');
    const r = await m.retirerAppareil('dev_ami');
    expect(r).toEqual({ ok: false, raison: 'appareil_inconnu' });
    expect(b.site.retires.has('dev_ami')).toBe(false);
    expect(m.etat.type).toBe('ouverte');
  });

  it('jeton OAuth refusé puis rafraîchi : la liste passe au second essai', async () => {
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    b.site.accesValide = 'acces-tourne';
    b.site.refreshValide = 'refresh-1';
    const r = await m.listerAppareils();
    expect(r.ok).toBe(true);
    expect(b.jetonsOAuth.valeur?.access).toBe('acces-2');
  });

  it('site injoignable : un échec lisible, la session tient', async () => {
    const m = new AccesParCompte(b.d);
    await m.demarrer();
    b.site.panne = true;
    expect(await m.listerAppareils()).toEqual({ ok: false, raison: 'site_injoignable' });
    expect(await m.retirerAppareil('dev_x')).toEqual({ ok: false, raison: 'site_injoignable' });
    expect(m.jeton()).toBe('jeton-de-session-256');
  });
});
