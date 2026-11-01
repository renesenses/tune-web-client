/**
 * LE CACHE DES PAGES DE LA BIBLIOTHÈQUE — tune-server-rust#7619, volet L5.
 *
 * Les pages de la Bibliothèque (albums, artistes) sont rangées dans IndexedDB.
 * À l'ouverture, ce qui est en cache s'affiche AUSSITÔT, puis la page est
 * redemandée au serveur et remplace la copie : « afficher, puis revalider ».
 *
 * ## Quand le cache ne vaut plus rien
 *
 * Le serveur tient une RÉVISION de la bibliothèque (`GET /library/revision`,
 * `"<démarrage>-<n>"`), qui change à chaque scan, à chaque modification, et à
 * chaque redémarrage. Le cache est rangé sous une révision ; dès que le
 * serveur en annonce une autre, tout le cache est jeté.
 *
 * La révision est relue à la première utilisation, puis à chaque
 * invalidation de la bibliothèque (`library.updated`, fin de scan : voir
 * `invaliderBibliotheque`).
 *
 * ## Ce qui ne change pas
 *
 * - Un serveur ANCIEN, sans `/library/revision` (404) : le cache reste éteint,
 *   on ne lit ni n'écrit rien — exactement le comportement d'avant.
 * - Hors ligne (la révision ne répond pas) : on LIT le cache sous la dernière
 *   révision connue, sans rien y écrire. Une page en cache vaut mieux qu'une
 *   case vide ; elle est marquée périmée, et la page neuve la remplacera dès
 *   que le réseau revient.
 * - Pas d'IndexedDB (navigation privée stricte, témoins sous jsdom) : rien ne
 *   se passe, aucune erreur ne remonte.
 * - Le relais d'accès à distance : la clef porte l'adresse de l'API et le
 *   profil, donc deux serveurs ou deux profils ne partagent jamais une page.
 */
import { BASE, fetchJSON } from './api';
import { profileHeader } from './profileHeader';

const NOM_BASE = 'tune-bibliotheque';
const MAGASIN = 'pages';
const META = 'meta';
/** Au-delà, on ne range plus : la bibliothèque entière ne va pas dans le cache. */
export const PLAFOND_ENTREES = 400;

export interface EntreeCache<T> {
  revision: string;
  valeur: T;
  t: number;
}

type EtatRevision = 'inconnue' | 'valide' | 'hors-ligne' | 'absente';

let etat: EtatRevision = 'inconnue';
let revision: string | null = null;
let verification: Promise<void> | null = null;
let ouverture: Promise<IDBDatabase | null> | null = null;

export function disponible(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function ouvrir(): Promise<IDBDatabase | null> {
  if (!disponible()) return Promise.resolve(null);
  if (ouverture) return ouverture;
  ouverture = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(NOM_BASE, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(MAGASIN)) db.createObjectStore(MAGASIN);
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return ouverture;
}

function enPromesse<T>(req: IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}

async function lireMeta(cle: string): Promise<string | null> {
  const db = await ouvrir();
  if (!db) return null;
  try {
    const v = await enPromesse(db.transaction(META, 'readonly').objectStore(META).get(cle));
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

async function ecrireMeta(cle: string, valeur: string): Promise<void> {
  const db = await ouvrir();
  if (!db) return;
  try {
    await enPromesse(db.transaction(META, 'readwrite').objectStore(META).put(valeur, cle));
  } catch { /* cache facultatif */ }
}

async function vider(): Promise<void> {
  const db = await ouvrir();
  if (!db) return;
  try {
    await enPromesse(db.transaction(MAGASIN, 'readwrite').objectStore(MAGASIN).clear());
  } catch { /* cache facultatif */ }
}

/** La clef d'une page : adresse de l'API, profil, puis ce que l'appelant nomme. */
export function clefDePage(nom: string): string {
  return `${BASE}|${profileHeader()['X-Profile-Id'] ?? ''}|${nom}`;
}

const CLE_REVISION = () => `revision|${BASE}`;

/**
 * Relit la révision du serveur et jette le cache si elle a changé. Une seule
 * vérification à la fois ; `forcer` en relance une (invalidation).
 */
export function verifierRevision(forcer = false): Promise<void> {
  if (!disponible()) return Promise.resolve();
  if (verification && !forcer) return verification;
  verification = (async () => {
    const connue = await lireMeta(CLE_REVISION());
    let annoncee: string | null = null;
    try {
      const r = await fetchJSON<{ revision?: unknown }>(
        `${BASE}/library/revision`, undefined, (s) => s === 404, true,
      );
      annoncee = typeof r?.revision === 'string' ? r.revision : null;
      if (annoncee === null) {
        // 404 (serveur ancien) ou réponse sans révision : cache éteint.
        etat = 'absente';
        revision = null;
        return;
      }
    } catch {
      // Hors ligne : lecture seule, sous la dernière révision connue.
      etat = connue ? 'hors-ligne' : 'absente';
      revision = connue;
      return;
    }
    if (annoncee !== connue) {
      await vider();
      await ecrireMeta(CLE_REVISION(), annoncee);
    }
    revision = annoncee;
    etat = 'valide';
  })();
  return verification;
}

/** La page rangée sous la révision courante, ou `null`. */
export async function lirePage<T>(nom: string): Promise<T | null> {
  if (!disponible()) return null;
  await verifierRevision();
  if ((etat !== 'valide' && etat !== 'hors-ligne') || !revision) return null;
  const db = await ouvrir();
  if (!db) return null;
  try {
    const e = (await enPromesse(
      db.transaction(MAGASIN, 'readonly').objectStore(MAGASIN).get(clefDePage(nom)),
    )) as EntreeCache<T> | undefined;
    return e && e.revision === revision ? e.valeur : null;
  } catch {
    return null;
  }
}

/** Range une page fraîche. Sans effet hors ligne, sans révision ou au plafond. */
export async function rangerPage<T>(nom: string, valeur: T): Promise<void> {
  if (!disponible()) return;
  await verifierRevision();
  if (etat !== 'valide' || !revision) return;
  const db = await ouvrir();
  if (!db) return;
  try {
    const magasin = db.transaction(MAGASIN, 'readwrite').objectStore(MAGASIN);
    const n = await enPromesse(magasin.count());
    const cle = clefDePage(nom);
    if ((n ?? 0) >= PLAFOND_ENTREES) {
      // Plafond atteint : on ne remplace qu'une entrée déjà là.
      const deja = await enPromesse(
        db.transaction(MAGASIN, 'readonly').objectStore(MAGASIN).getKey(cle),
      );
      if (deja === undefined) return;
    }
    const entree: EntreeCache<T> = { revision, valeur, t: Date.now() };
    await enPromesse(db.transaction(MAGASIN, 'readwrite').objectStore(MAGASIN).put(entree, cle));
  } catch { /* cache facultatif : quota plein, base fermée… */ }
}

/** La bibliothèque a changé : relire la révision (le cache tombe si elle a bougé). */
export function signalerInvalidation(): void {
  void verifierRevision(true);
}

/** Témoins seulement. */
export function _remiseAZeroPourTests(): void {
  etat = 'inconnue';
  revision = null;
  verification = null;
  ouverture = null;
}
