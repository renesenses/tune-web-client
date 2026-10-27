/**
 * Machine d'états de l'accès à distance PAR COMPTE (rc8, tune-server-rust#6603).
 *
 *   déconnecté ──connexion OAuth──▶ inscription de l'appareil (une fois)
 *        ▲                              │
 *        │                              ▼
 *        │                    demande de laissez-passer (site, 1 h)
 *        │                              │
 *        │                              ▼
 *        │                    ouverture de session (relais) ──▶ OUVERTE
 *        │                                                        │  ▲
 *        │                         renouvellement à 45 min ───────┘  │
 *        │                         (même jeton, puis toutes les 5 min │
 *        │                          en cas d'échec)                   │
 *        └── jeton OAuth refusé          coupée (écoute reprise ailleurs) ─ reprendre
 *
 * Le jeton de session rendu par le relais prend EXACTEMENT la place de
 * l'ancien jeton du pont : `X-Bridge-Token`, `?token=`
 * (`docs/ecoute-a-distance-contrat.md`). Il ne change pas au renouvellement,
 * ce qui garde valables les adresses de flux déjà posées sur `<audio>`.
 *
 * COEXISTENCE. Tant que le site ne délivre pas de laissez-passer (503
 * `cles_indisponibles` : clés non configurées) ou que le relais n'ouvre pas
 * de session (503 `jeu_de_cles_absent`, relais antérieur), la machine
 * s'arrête en `indisponible` et l'ancien jeton du pont, s'il existe, sert
 * comme avant. Rien n'est cassé pour qui n'a qu'un lien d'accès.
 *
 * Toutes les dépendances sont injectées (réseau, horloge, minuterie, clé,
 * stockage) : la machine se teste sans navigateur.
 */
import { chargeDuLaissezPasser, messageDemande, messageInscription, messageSession } from './format';
import type { CleAppareil, MagasinAppareil, AppareilEnregistre } from './cleAppareil';
import { rafraichir, type MagasinJetons } from './oauth';

/** Appareil tel que le site le décrit (`RemoteDevice::summary`). */
export interface AppareilDuSite {
  device_id: string;
  name: string;
  platform: string;
  app_version?: string | null;
  created_at?: string | null;
  last_pass_at?: string | null;
}

/** Liste des appareils du compte (`GET /api/v1/remote/devices`). */
export type IssueListeAppareils =
  | { ok: true; max: number; appareils: AppareilDuSite[]; courant: string | null }
  | { ok: false; raison: string };

/** Retrait d'un appareil du compte (`DELETE /api/v1/remote/devices/{id}`). */
export type IssueRetraitAppareil = { ok: true; courant: boolean } | { ok: false; raison: string };

export type Etat =
  | { type: 'inactif' }
  | { type: 'deconnecte' }
  | { type: 'en_cours'; etape: 'inscription' | 'demande' | 'ouverture' }
  | { type: 'ouverte'; expire: number; renouvelerA: number; secours: boolean }
  | { type: 'indisponible'; raison: string }
  | { type: 'refuse'; code: string; motif?: string; appareils?: AppareilDuSite[]; max?: number }
  | { type: 'coupee'; motif: string; appareil?: string };

export interface SessionOuverte {
  jeton: string;
  /** Fin de la session côté relais, secondes Unix. */
  expire: number;
  /** Instant du prochain renouvellement, secondes Unix. */
  renouvelerA: number;
  secours: boolean;
}

export interface MagasinSession {
  lire(): SessionOuverte | null;
  ecrire(s: SessionOuverte): void;
  effacer(): void;
}

export interface Dependances {
  serverId: string;
  /** `https://mozaiklabs.fr` */
  site: string;
  /** Origine du relais, `https://bridge.mozaiklabs.fr`. */
  relais: string;
  fetch: typeof fetch;
  /** Secondes Unix. */
  maintenant(): number;
  programmer(ms: number, f: () => void): unknown;
  annuler(h: unknown): void;
  /** `null` : pas de stockage durable (navigation privée). */
  appareil: MagasinAppareil | null;
  jetons: MagasinJetons;
  session: MagasinSession;
  creerCle(): Promise<CleAppareil>;
  signer(cle: CleAppareil, message: string): Promise<string>;
  nonce(): string;
  nomAppareil(): string;
  versionApp?: string;
}

/** Nouvel essai de renouvellement après un échec (cahier § 2.5). */
export const REESSAI_S = 5 * 60;
/** Renouvellement par défaut, si le site ne dit pas `renouveler_a` : 15 min avant la fin. */
export const AVANCE_RENOUVELLEMENT_S = 15 * 60;

/** Fin anticipée d'un parcours : l'état où la machine s'arrête. */
class Arret extends Error {
  constructor(readonly etat: Etat) {
    super(etat.type);
  }
}

interface Reponse {
  status: number;
  corps: any;
}

async function lire(r: Response): Promise<Reponse> {
  const corps = await r.json().catch(() => null);
  return { status: r.status, corps };
}

/**
 * 401 du SITE mozaiklabs.fr (jeton OAuth refusé). Ni le site ni le relais
 * n'émettent le 402 Premium du serveur Tune (`premium_guard.rs`) : la garde
 * #884 (`refusPremiumBalayage884`) vise les appels AU SERVEUR, pas ceux-ci.
 */
const JETON_OAUTH_REFUSE = 401;

/** Codes du relais qui, reçus sur l'API, le flux ou le WebSocket, concernent la session. */
export const CODES_RELAIS_SESSION = new Set(['session_coupee', 'session_expiree', 'revoque', 'autre_appareil']);

export class AccesParCompte {
  private etatCourant: Etat = { type: 'inactif' };
  private sessionCourante: SessionOuverte | null = null;
  private minuterie: unknown = null;
  private enCours: Promise<void> | null = null;
  private abonnes = new Set<(e: Etat) => void>();

  constructor(private readonly d: Dependances) {}

  get etat(): Etat {
    return this.etatCourant;
  }

  /** Jeton de session utilisable maintenant, ou `null`. */
  jeton(): string | null {
    const s = this.sessionCourante;
    if (!s) return null;
    return s.expire > this.d.maintenant() ? s.jeton : null;
  }

  abonner(f: (e: Etat) => void): () => void {
    this.abonnes.add(f);
    f(this.etatCourant);
    return () => this.abonnes.delete(f);
  }

  private poser(e: Etat): void {
    this.etatCourant = e;
    for (const f of this.abonnes) f(e);
  }

  /** Un compte est-il relié sur ce navigateur ? */
  compteRelie(): boolean {
    return this.d.jetons.lire() !== null;
  }

  /**
   * Premier pas : reprend une session encore valable (rechargement de la
   * page), sinon en ouvre une si un compte est relié, sinon s'arrête en
   * `deconnecte`.
   */
  demarrer(): Promise<void> {
    const s = this.d.session.lire();
    if (s && s.expire > this.d.maintenant() + 30) {
      this.sessionCourante = s;
      this.poser({ type: 'ouverte', expire: s.expire, renouvelerA: s.renouvelerA, secours: s.secours });
      this.planifier(s.renouvelerA);
      return Promise.resolve();
    }
    this.d.session.effacer();
    if (!this.compteRelie()) {
      this.poser({ type: 'deconnecte' });
      return Promise.resolve();
    }
    return this.ouvrir();
  }

  /** Après une coupure ou un refus : l'utilisateur reprend la main ici. */
  reprendre(): Promise<void> {
    if (!this.compteRelie()) {
      this.poser({ type: 'deconnecte' });
      return Promise.resolve();
    }
    return this.ouvrir();
  }

  /** Appareils pleins : remplacer l'un d'eux par ce navigateur (`replace_device_id`). */
  remplacerAppareil(deviceId: string): Promise<void> {
    return this.unique(async () => {
      await this.appareilPret(deviceId);
      await this.ouvrirSansGarde();
    });
  }

  /** Oublie le compte sur ce navigateur. La clé d'appareil reste : se reconnecter ne consomme pas de place. */
  deconnecter(): void {
    this.arreterMinuterie();
    this.d.jetons.effacer();
    this.oublierSession();
    this.poser({ type: 'deconnecte' });
  }

  /**
   * Un refus du relais vu ailleurs que dans la machine — réponse d'API,
   * fermeture du WebSocket (code 4001), flux coupé. Le contrat :
   * `{code, motif?, appareil?}`.
   */
  signalerRefusRelais(refus: { code?: string; motif?: string; appareil?: string } | null | undefined): void {
    if (!refus?.code || !this.sessionCourante) return;
    switch (refus.code) {
      case 'session_coupee':
        this.arreterMinuterie();
        this.oublierSession();
        this.poser({ type: 'coupee', motif: refus.motif ?? 'coupee', appareil: refus.appareil });
        return;
      case 'session_expiree':
        this.oublierSession();
        void this.ouvrir();
        return;
      case 'revoque':
      case 'autre_appareil':
        this.arreterMinuterie();
        this.oublierSession();
        this.poser({ type: 'refuse', code: refus.code, motif: refus.motif });
        return;
    }
  }

  // ─── Appareils du compte (Réglages) ──────────────────────────────────────

  /**
   * Les appareils actifs du compte, tels que le site les rend : c'est le SITE
   * qui ne rend que ceux du compte du jeton OAuth, jamais l'interface.
   * `courant` : l'identifiant de ce navigateur, s'il est inscrit.
   */
  async listerAppareils(): Promise<IssueListeAppareils> {
    try {
      const r = await this.appelSite('GET', '/api/v1/remote/devices');
      if (r.status !== 200 || !Array.isArray(r.corps?.devices)) {
        return { ok: false, raison: r.corps?.error ?? `http_${r.status}` };
      }
      return { ok: true, max: Number(r.corps.max) || 5, appareils: r.corps.devices, courant: await this.appareilCourant() };
    } catch (e) {
      return { ok: false, raison: raisonDEchec(e) };
    }
  }

  /**
   * Retire un appareil du compte. Le site refuse aussitôt ses laissez-passer
   * et clôt ses sessions : le relais le coupe au battement suivant, et au
   * plus tard au renouvellement du laissez-passer.
   *
   * Ce navigateur retiré par lui-même : sa session s'arrête ici, et sa clé
   * est oubliée (elle appartient désormais à un appareil retiré).
   */
  async retirerAppareil(deviceId: string): Promise<IssueRetraitAppareil> {
    try {
      const r = await this.appelSite('DELETE', `/api/v1/remote/devices/${encodeURIComponent(deviceId)}`);
      if (r.status !== 200) return { ok: false, raison: r.corps?.error ?? `http_${r.status}` };
      const courant = (await this.appareilCourant()) === deviceId;
      if (courant) {
        this.arreterMinuterie();
        this.oublierSession();
        try {
          await this.d.appareil?.effacer();
        } catch {
          /* rien : le site refusera de toute façon cet appareil */
        }
        this.poser({ type: 'refuse', code: 'appareil_retire' });
      }
      return { ok: true, courant };
    } catch (e) {
      return { ok: false, raison: raisonDEchec(e) };
    }
  }

  private async appareilCourant(): Promise<string | null> {
    try {
      return (await this.d.appareil?.lire())?.deviceId ?? null;
    } catch {
      return null;
    }
  }

  // ─── Parcours ────────────────────────────────────────────────────────────

  private unique(f: () => Promise<void>): Promise<void> {
    if (this.enCours) return this.enCours;
    this.enCours = f()
      .catch((e) => {
        this.poser(e instanceof Arret ? e.etat : { type: 'indisponible', raison: 'erreur' });
      })
      .finally(() => {
        this.enCours = null;
      });
    return this.enCours;
  }

  private ouvrir(): Promise<void> {
    return this.unique(() => this.ouvrirSansGarde());
  }

  private async ouvrirSansGarde(): Promise<void> {
    this.arreterMinuterie();
    const lp = await this.demanderLaissezPasser();
    this.poser({ type: 'en_cours', etape: 'ouverture' });
    const { defi, signature } = await this.signerDefi(lp.cle);
    const r = await this.appelRelais('POST', `/session/${encodeURIComponent(this.d.serverId)}`, {
      laissez_passer: lp.jws,
      defi,
      signature,
    });
    if (r.status !== 200 || typeof r.corps?.jeton !== 'string') throw new Arret(this.refusRelais(r));
    this.accepterSession(r.corps.jeton, r.corps, lp.renouvelerA);
  }

  private async renouveler(): Promise<void> {
    const s = this.sessionCourante;
    // Déjà sous `unique` : `ouvrir()` attendrait sa propre promesse.
    if (!s) return this.ouvrirSansGarde();
    try {
      const lp = await this.demanderLaissezPasser(true);
      const { defi, signature } = await this.signerDefi(lp.cle);
      const r = await this.appelRelais(
        'POST',
        '/session/renouveler',
        { laissez_passer: lp.jws, defi, signature },
        { 'X-Bridge-Token': s.jeton },
      );
      if (r.status === 200) {
        this.accepterSession(typeof r.corps?.jeton === 'string' ? r.corps.jeton : s.jeton, r.corps, lp.renouvelerA);
        return;
      }
      const code = r.corps?.code;
      if (code === 'session_expiree' || code === 'non_autorise') {
        // Relais redémarré, ou session perdue : une nouvelle, sans rien demander.
        this.oublierSession();
        await this.ouvrirSansGarde();
        return;
      }
      if (code === 'session_coupee') {
        this.signalerRefusRelais(r.corps);
        return;
      }
      throw new Arret(this.refusRelais(r));
    } catch (e) {
      const etat = e instanceof Arret ? e.etat : ({ type: 'indisponible', raison: 'erreur' } as Etat);
      if (etat.type === 'deconnecte' || etat.type === 'refuse' || etat.type === 'coupee') throw e;
      // Échec passager : la session tient jusqu'à son terme, on réessaie.
      if (this.jeton()) {
        this.planifier(this.d.maintenant() + REESSAI_S);
        return;
      }
      this.oublierSession();
      throw e;
    }
  }

  private accepterSession(jeton: string, corps: any, renouvelerSite: number | null): void {
    const expire = Number(corps?.expire) || this.d.maintenant() + 3600;
    const renouvelerA = Math.min(renouvelerSite ?? expire - AVANCE_RENOUVELLEMENT_S, expire - 60);
    const s: SessionOuverte = { jeton, expire, renouvelerA, secours: corps?.secours === true };
    this.sessionCourante = s;
    this.d.session.ecrire(s);
    this.poser({ type: 'ouverte', expire, renouvelerA, secours: s.secours });
    this.planifier(renouvelerA);
  }

  private planifier(instant: number): void {
    this.arreterMinuterie();
    const ms = Math.max(0, (instant - this.d.maintenant()) * 1000);
    this.minuterie = this.d.programmer(ms, () => {
      this.minuterie = null;
      void this.unique(() => this.renouveler());
    });
  }

  private arreterMinuterie(): void {
    if (this.minuterie !== null) this.d.annuler(this.minuterie);
    this.minuterie = null;
  }

  private oublierSession(): void {
    this.sessionCourante = null;
    this.d.session.effacer();
  }

  // ─── Site ────────────────────────────────────────────────────────────────

  private async appelSite(methode: string, chemin: string, corps?: unknown, dejaRafraichi = false): Promise<Reponse> {
    const jetons = this.d.jetons.lire();
    if (!jetons) throw new Arret({ type: 'deconnecte' });
    let r: Response;
    try {
      r = await this.d.fetch(`${this.d.site}${chemin}`, {
        method: methode,
        headers: {
          Authorization: `Bearer ${jetons.access}`,
          Accept: 'application/json',
          ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: corps === undefined ? undefined : JSON.stringify(corps),
      });
    } catch {
      throw new Arret({ type: 'indisponible', raison: 'site_injoignable' });
    }
    if (r.status === JETON_OAUTH_REFUSE && !dejaRafraichi) {
      const neufs = await rafraichir(jetons, this.d.fetch, () => this.d.maintenant());
      if (neufs === 'reseau') throw new Arret({ type: 'indisponible', raison: 'site_injoignable' });
      if (!neufs) {
        this.d.jetons.effacer();
        throw new Arret({ type: 'deconnecte' });
      }
      this.d.jetons.ecrire(neufs);
      return this.appelSite(methode, chemin, corps, true);
    }
    if (r.status === JETON_OAUTH_REFUSE) {
      this.d.jetons.effacer();
      throw new Arret({ type: 'deconnecte' });
    }
    const lu = await lire(r);
    if (lu.status >= 500) {
      // 503 `cles_indisponibles` (clés du site non configurées) ou
      // `ecoute_a_distance_suspendue` : c'est la COEXISTENCE, pas une erreur.
      throw new Arret({ type: 'indisponible', raison: lu.corps?.error ?? `http_${lu.status}` });
    }
    return lu;
  }

  /**
   * L'appareil inscrit sur le site, en l'inscrivant au besoin.
   *
   * L'inscription prouve que l'appareil tient sa clé privée : le site donne un
   * défi, l'appareil le signe (`tune-remote/appareil/v1`).
   */
  private async appareilPret(remplacer?: string): Promise<AppareilEnregistre> {
    const magasin = this.d.appareil;
    if (!magasin) throw new Arret({ type: 'refuse', code: 'navigation_privee' });
    let a: AppareilEnregistre | null;
    try {
      a = await magasin.lire();
    } catch {
      throw new Arret({ type: 'refuse', code: 'navigation_privee' });
    }
    if (a?.deviceId && !remplacer) return a;

    this.poser({ type: 'en_cours', etape: 'inscription' });
    if (!a) {
      let cle: CleAppareil;
      try {
        cle = await this.d.creerCle();
      } catch {
        throw new Arret({ type: 'refuse', code: 'cle_impossible' });
      }
      a = { cle, deviceId: null, nom: this.d.nomAppareil() };
      try {
        await magasin.ecrire(a);
      } catch {
        throw new Arret({ type: 'refuse', code: 'navigation_privee' });
      }
    }

    const defi = await this.appelSite('POST', '/api/v1/remote/devices/challenge', {});
    const challenge = defi.corps?.challenge;
    if (typeof challenge !== 'string') throw new Arret({ type: 'refuse', code: defi.corps?.error ?? 'defi' });
    const signature = await this.d.signer(a.cle, messageInscription(challenge, a.cle.publique));
    const r = await this.appelSite('POST', '/api/v1/remote/devices', {
      challenge,
      key_alg: a.cle.alg,
      public_key: a.cle.publique,
      signature,
      name: a.nom,
      platform: 'web',
      app_version: this.d.versionApp ?? null,
      ...(remplacer ? { replace_device_id: remplacer } : {}),
    });
    if (r.status === 409) {
      throw new Arret({
        type: 'refuse',
        code: 'appareils_pleins',
        appareils: Array.isArray(r.corps?.devices) ? r.corps.devices : [],
        max: Number(r.corps?.max) || 5,
      });
    }
    if (r.status !== 201 || typeof r.corps?.device_id !== 'string') {
      throw new Arret({ type: 'refuse', code: r.corps?.error ?? `http_${r.status}` });
    }
    const inscrit: AppareilEnregistre = { ...a, deviceId: r.corps.device_id };
    await magasin.ecrire(inscrit);
    return inscrit;
  }

  /**
   * Demande signée d'un laissez-passer (`tune-remote/laissez-passer/v1`).
   *
   * `appareil_inconnu` (le site ne connaît plus cet appareil) : une nouvelle
   * inscription, une seule fois. `appareil_retire` : l'utilisateur l'a
   * retiré de son espace client — on ne le réinscrit PAS dans son dos.
   */
  private async demanderLaissezPasser(silencieux = false, deuxiemeEssai = false): Promise<{ jws: string; cle: CleAppareil; renouvelerA: number | null }> {
    const a = await this.appareilPret();
    if (!silencieux) this.poser({ type: 'en_cours', etape: 'demande' });
    const horodatage = this.d.maintenant();
    const nonce = this.d.nonce();
    const signature = await this.d.signer(a.cle, messageDemande(this.d.serverId, a.deviceId as string, horodatage, nonce));
    const r = await this.appelSite('POST', '/api/v1/remote/passes', {
      server_id: this.d.serverId,
      device_id: a.deviceId,
      timestamp: horodatage,
      nonce,
      signature,
    });
    if (r.status === 201 && typeof r.corps?.laissez_passer === 'string') {
      const charge = chargeDuLaissezPasser(r.corps.laissez_passer);
      if (charge?.sid && charge.sid !== this.d.serverId) throw new Arret({ type: 'refuse', code: 'serveur' });
      const ra = Number(r.corps.renouveler_a);
      return { jws: r.corps.laissez_passer, cle: a.cle, renouvelerA: Number.isFinite(ra) && ra > 0 ? ra : null };
    }
    const code: string = r.corps?.error ?? `http_${r.status}`;
    if (code === 'appareil_inconnu' && !deuxiemeEssai) {
      await this.d.appareil?.ecrire({ ...a, deviceId: null });
      return this.demanderLaissezPasser(silencieux, true);
    }
    if (code === 'appareil_retire') {
      // Nouvelle clé au prochain essai : l'ancienne appartient à un appareil retiré.
      await this.d.appareil?.effacer();
    }
    throw new Arret({ type: 'refuse', code, motif: r.corps?.motif ?? undefined });
  }

  // ─── Relais ──────────────────────────────────────────────────────────────

  private async appelRelais(methode: string, chemin: string, corps?: unknown, entetes: Record<string, string> = {}): Promise<Reponse> {
    let r: Response;
    try {
      r = await this.d.fetch(`${this.d.relais}${chemin}`, {
        method: methode,
        headers: {
          Accept: 'application/json',
          ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...entetes,
        },
        body: corps === undefined ? undefined : JSON.stringify(corps),
      });
    } catch {
      throw new Arret({ type: 'indisponible', raison: 'relais_injoignable' });
    }
    return lire(r);
  }

  private async signerDefi(cle: CleAppareil): Promise<{ defi: string; signature: string }> {
    const r = await this.appelRelais('GET', `/session/defi/${encodeURIComponent(this.d.serverId)}`);
    if (r.status !== 200 || typeof r.corps?.defi !== 'string') throw new Arret(this.refusRelais(r));
    const defi: string = r.corps.defi;
    return { defi, signature: await this.d.signer(cle, messageSession(this.d.serverId, defi)) };
  }

  /** Traduit un refus du relais en état. */
  private refusRelais(r: Reponse): Etat {
    const code: string | undefined = r.corps?.code;
    // Relais antérieur au laissez-passer : pas de route `/session`, pas de JSON.
    if (!code) return { type: 'indisponible', raison: r.status === 404 ? 'relais_sans_laissez_passer' : `http_${r.status}` };
    if (r.status >= 500) return { type: 'indisponible', raison: code };
    if (code === 'session_coupee') return { type: 'coupee', motif: r.corps?.motif ?? 'coupee', appareil: r.corps?.appareil };
    return { type: 'refuse', code, motif: r.corps?.motif ?? undefined };
  }
}

function raisonDEchec(e: unknown): string {
  if (e instanceof Arret) return e.etat.type === 'indisponible' ? e.etat.raison : e.etat.type;
  return 'erreur';
}

/** Session en `sessionStorage`, par serveur : survit au rechargement, pas à la fermeture de l'onglet. */
export function magasinSessionOnglet(serverId: string, stockage: Storage | undefined = globalThis.sessionStorage): MagasinSession {
  const cle = `tune.remote.session.${serverId}`;
  return {
    lire() {
      try {
        const s = JSON.parse(stockage?.getItem(cle) ?? 'null');
        return typeof s?.jeton === 'string' && typeof s?.expire === 'number' ? s : null;
      } catch {
        return null;
      }
    },
    ecrire(s) {
      try {
        stockage?.setItem(cle, JSON.stringify(s));
      } catch {
        /* rien */
      }
    },
    effacer() {
      try {
        stockage?.removeItem(cle);
      } catch {
        /* rien */
      }
    },
  };
}
