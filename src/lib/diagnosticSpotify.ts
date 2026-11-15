/**
 * Le vérificateur de configuration Spotify — renesenses/tune-server-rust#8198,
 * volet 1 (contrat, section B).
 *
 * `GET /api/v1/streaming/spotify/diagnostic` dit précisément ce qui ne va pas :
 * Client ID, adresse de retour, connexion, accès à l'API (User Management),
 * Premium, dernier refus. Ce module le LIT et le met en lignes lisibles ; la
 * carte (`components/v2/spotify/VerificationSpotify.svelte`) l'affiche.
 *
 * Un serveur plus ancien répond 404 : `chargerDiagnosticSpotify` rend alors
 * `null` et la carte masque le bouton, sans rien afficher d'autre.
 */
import { BASE, fetchJSON } from './api';
import { CLES_CODES_SPOTIFY } from './messagesSpotify';

export interface DiagnosticSpotify {
  service?: string;
  client_id?: {
    etat?: 'ok' | 'absent' | 'forme_invalide' | string;
    /** Spotify accepte-t-il ce Client ID ? (sonde du serveur, ou dernier refus `spotify_client_id_refuse`) */
    spotify?: 'accepte' | 'refuse' | 'non_verifie' | string;
    /** Causes probables, dans l'ordre, quand Spotify le refuse. */
    causes_possibles?: string[];
    /** Les 8 premiers caractères, pour le comparer à l'adresse du tableau de bord. */
    debut?: string | null;
  };
  redirect_uri?: { valeur?: string | null; etat?: 'ok' | 'localhost' | 'http_hors_bouclage' | string; relais?: boolean };
  connexion?: { etat?: 'non_connecte' | 'connecte' | 'session_expiree' | string; compte?: string | null };
  acces_api?: {
    etat?: 'ok' | 'compte_non_autorise' | 'jeton_refuse' | 'non_verifie' | 'erreur' | string;
    detail?: string | null;
  };
  premium?: { etat?: 'oui' | 'non' | 'inconnu' | string };
  derniere_erreur?: { code?: string; quand?: string } | null;
  a_corriger?: string[];
}

/**
 * Le diagnostic, ou `null` si le serveur ne le connaît pas (404).
 * Toute autre erreur remonte : la carte dit alors que la vérification a échoué.
 * `charger` est injecté pour les témoins.
 */
export async function chargerDiagnosticSpotify(
  charger: () => Promise<DiagnosticSpotify> = () =>
    fetchJSON<DiagnosticSpotify>(`${BASE}/streaming/spotify/diagnostic`, undefined, undefined, true),
): Promise<DiagnosticSpotify | null> {
  try {
    const d = await charger();
    return d && typeof d === 'object' ? d : null;
  } catch (e: any) {
    if (e?.status === 404 || e?.status === 405) return null;
    throw e;
  }
}

export type EtatLigne = 'ok' | 'ko' | 'info';

export interface LigneDiagnostic {
  /** Identifiant stable (attribut `data-ligne`). */
  id: 'client_id' | 'redirect_uri' | 'connexion' | 'acces_api' | 'premium';
  /** Clé du libellé de la ligne. */
  libelle: string;
  /** Clé de l'état lu. */
  valeur: string;
  etat: EtatLigne;
  /** Texte brut à montrer à côté (nom du compte, adresse, détail). */
  extra?: string | null;
  /** L'adresse à copier (ligne « adresse de retour »). */
  aCopier?: string | null;
}

function etatClientId(e: string | undefined, spotify?: string): [string, EtatLigne] {
  if (e === 'ok' && spotify === 'refuse') return ['v2.spotify.diag.clientIdRefuseParSpotify', 'ko'];
  if (e === 'ok') return ['v2.spotify.diag.clientIdOk', 'ok'];
  if (e === 'forme_invalide') return ['v2.spotify.diag.clientIdFormeInvalide', 'ko'];
  return ['v2.spotify.diag.clientIdAbsent', 'ko'];
}

function etatRedirect(e: string | undefined): [string, EtatLigne] {
  if (e === 'localhost') return ['v2.spotify.diag.redirectLocalhost', 'ko'];
  if (e === 'http_hors_bouclage') return ['v2.spotify.diag.redirectHttp', 'ko'];
  return ['v2.spotify.diag.redirectOk', 'ok'];
}

function etatConnexion(e: string | undefined): [string, EtatLigne] {
  if (e === 'connecte') return ['v2.spotify.diag.connexionOui', 'ok'];
  if (e === 'session_expiree') return ['v2.spotify.diag.connexionExpiree', 'ko'];
  return ['v2.spotify.diag.connexionNon', 'ko'];
}

function etatAcces(e: string | undefined): [string, EtatLigne] {
  switch (e) {
    case 'ok':
      return ['v2.spotify.diag.accesOk', 'ok'];
    case 'compte_non_autorise':
      return ['v2.spotify.diag.accesRefuse', 'ko'];
    case 'jeton_refuse':
      return ['v2.spotify.diag.accesJeton', 'ko'];
    case 'erreur':
      return ['v2.spotify.diag.accesErreur', 'ko'];
    default:
      return ['v2.spotify.diag.accesNonVerifie', 'info'];
  }
}

function etatPremium(e: string | undefined): [string, EtatLigne] {
  if (e === 'oui') return ['v2.spotify.diag.premiumOui', 'ok'];
  if (e === 'non') return ['v2.spotify.diag.premiumNon', 'ko'];
  // Absent en mode développement depuis février 2026 : on dit qu'il est requis.
  return ['v2.spotify.diag.premiumInconnu', 'info'];
}

/** Les cinq lignes lisibles du diagnostic, dans l'ordre du parcours. */
export function lignesDiagnostic(d: DiagnosticSpotify): LigneDiagnostic[] {
  const [vCid, eCid] = etatClientId(d.client_id?.etat, d.client_id?.spotify);
  const debut = debutClientId(d.client_id?.debut);
  const [vRed, eRed] = etatRedirect(d.redirect_uri?.etat);
  const [vCnx, eCnx] = etatConnexion(d.connexion?.etat);
  const [vAcc, eAcc] = etatAcces(d.acces_api?.etat);
  const [vPre, ePre] = etatPremium(d.premium?.etat);
  const uri = d.redirect_uri?.valeur ?? null;
  return [
    { id: 'client_id', libelle: 'v2.spotify.diag.clientId', valeur: vCid, etat: eCid, extra: debut ? `${debut}…` : null },
    {
      id: 'redirect_uri', libelle: 'v2.spotify.diag.redirect', valeur: vRed, etat: eRed,
      extra: d.redirect_uri?.relais ? 'mozaiklabs.fr' : null, aCopier: uri,
    },
    {
      id: 'connexion', libelle: 'v2.spotify.diag.connexion', valeur: vCnx, etat: eCnx,
      extra: d.connexion?.etat === 'connecte' ? (d.connexion?.compte ?? null) : null,
    },
    {
      id: 'acces_api', libelle: 'v2.spotify.diag.acces', valeur: vAcc, etat: eAcc,
      extra: d.acces_api?.etat === 'erreur' ? (d.acces_api?.detail ?? null) : null,
    },
    { id: 'premium', libelle: 'v2.spotify.diag.premium', valeur: vPre, etat: ePre },
  ];
}

/** Valeur de `a_corriger` → clé du geste à faire. */
const CLES_A_CORRIGER: Readonly<Record<string, string>> = {
  client_id_absent: 'v2.spotify.fix.clientIdAbsent',
  client_id_forme_invalide: 'v2.spotify.fix.clientIdFormeInvalide',
  client_id_refuse_par_spotify: 'v2.spotify.fix.clientIdRefuseIntro',
  // Les deux phrases de la carte (#2680) disent déjà le geste.
  redirect_localhost: 'v2.set.spotifyRedirectLocalhost',
  redirect_http_hors_bouclage: 'v2.set.spotifyRedirectInsecure',
  non_connecte: 'v2.spotify.fix.nonConnecte',
  session_expiree: 'v2.spotify.fix.sessionExpiree',
  compte_non_autorise: 'v2.spotify.err.compteNonAutorise',
  jeton_refuse: 'v2.spotify.fix.jetonRefuse',
  premium_absent: 'v2.spotify.fix.premiumAbsent',
};

export interface Correction {
  item: string;
  /** Clé du geste ; `v2.spotify.fix.inconnu` porte `{code}`, `…clientIdRefuseIntro` porte `{debut}`. */
  cle: string;
  /** Pour un Client ID refusé par Spotify : les clés des causes probables, dans l'ordre. */
  causes?: string[];
}

/** Cause probable d'un Client ID refusé → clé de sa phrase (avec son geste). */
export const CLES_CAUSES: Readonly<Record<string, string>> = {
  connexion_lancee_avant_le_client_id: 'v2.spotify.cause.connexionAvant',
  proprietaire_sans_premium: 'v2.spotify.cause.proprietaireSansPremium',
  application_supprimee_ou_desactivee: 'v2.spotify.cause.applicationSupprimee',
};

/**
 * Les causes à montrer : celles du serveur (`client_id.causes_possibles`),
 * dans son ordre ; s'il n'en donne aucune connue, les trois.
 */
export function causesDuRefus(d: DiagnosticSpotify | null | undefined): string[] {
  const brutes = Array.isArray(d?.client_id?.causes_possibles) ? d!.client_id!.causes_possibles! : [];
  const cles = brutes.map((c) => CLES_CAUSES[c]).filter((c): c is string => !!c);
  return cles.length ? [...new Set(cles)] : Object.values(CLES_CAUSES);
}

/** Une phrase de correction, ses deux marques remplacées. */
export function texteCorrection(gabarit: string, c: Correction, d: DiagnosticSpotify | null | undefined): string {
  return gabarit.replace('{code}', c.item).replace('{debut}', debutClientId(d?.client_id?.debut) ?? '…');
}

/** Les 8 premiers caractères d'un Client ID, ou `null`. */
export function debutClientId(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, 8) : null;
}

/**
 * L'adresse de retour à montrer sous le Client ID de la carte « Services &
 * Jetons » : celle de la ligne `spotify` de `GET /services/tokens`, sinon
 * celle de `GET /system/env` (serveur plus ancien).
 */
export function adresseRetourDeLaLigne(ligne: { spotify_redirect_uri?: unknown } | null | undefined, secours: string | null | undefined): string | null {
  const u = ligne?.spotify_redirect_uri;
  if (typeof u === 'string' && u.trim()) return u.trim();
  return secours ?? null;
}

/**
 * Chaque problème de `a_corriger`, avec son geste. Les codes du tableau A
 * (`derniere_erreur`) reprennent la phrase du refus. Un problème qu'on ne
 * connaît pas encore est montré avec son nom, plutôt que tu.
 */
export function corrections(d: DiagnosticSpotify): Correction[] {
  const vus = new Set<string>();
  const out: Correction[] = [];
  for (const item of Array.isArray(d.a_corriger) ? d.a_corriger : []) {
    if (typeof item !== 'string' || vus.has(item)) continue;
    vus.add(item);
    const cle = CLES_A_CORRIGER[item] ?? CLES_CODES_SPOTIFY[item] ?? 'v2.spotify.fix.inconnu';
    out.push(item === 'client_id_refuse_par_spotify' ? { item, cle, causes: causesDuRefus(d) } : { item, cle });
  }
  return out;
}

/**
 * Juste après une connexion (ou à l'ouverture, avec un ancien jeton) :
 * l'accès à l'API est-il refusé ? La clé de la phrase à montrer, ou `null`.
 */
export function alerteAccesApi(d: DiagnosticSpotify | null | undefined): string | null {
  if (!d || d.connexion?.etat !== 'connecte') return null;
  if (d.acces_api?.etat === 'compte_non_autorise') return 'v2.spotify.err.compteNonAutorise';
  if (d.acces_api?.etat === 'jeton_refuse') return 'v2.spotify.fix.jetonRefuse';
  return null;
}
