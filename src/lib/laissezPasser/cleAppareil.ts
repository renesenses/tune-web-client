/**
 * Clé de l'appareil : WebCrypto, NON EXTRACTIBLE, rangée dans IndexedDB.
 *
 * Ed25519 d'abord ; ECDSA P-256 en repli quand le navigateur ne connaît pas
 * Ed25519 dans WebCrypto (cahier § 2.2, question Q7). Le site et le relais
 * acceptent les deux, l'algorithme voyage dans `key_alg` puis dans `cnf.alg`.
 *
 * La clé privée est créée avec `extractable: false` : ni ce code ni un script
 * injecté ne peut en lire les octets, seulement s'en servir pour signer
 * depuis cette origine. IndexedDB garde l'objet `CryptoKey` tel quel
 * (clonage structuré), sans jamais le sérialiser.
 */
import { versBase64Url, type AlgCle } from './format';

export interface CleAppareil {
  alg: AlgCle;
  /** Clé publique, base64url (32 octets Ed25519, 65 octets SEC1 P-256). */
  publique: string;
  privee: CryptoKey;
}

/** Ce que l'appareil garde entre deux ouvertures. */
export interface AppareilEnregistre {
  cle: CleAppareil;
  /** `device_id` tiré par le site ; absent tant que l'inscription n'a pas abouti. */
  deviceId: string | null;
  nom: string;
}

export interface MagasinAppareil {
  lire(): Promise<AppareilEnregistre | null>;
  ecrire(a: AppareilEnregistre): Promise<void>;
  effacer(): Promise<void>;
}

function subtilDuNavigateur(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('webcrypto_indisponible');
  return s;
}

export async function creerCleAppareil(subtle: SubtleCrypto = subtilDuNavigateur()): Promise<CleAppareil> {
  try {
    const paire = (await subtle.generateKey({ name: 'Ed25519' } as Algorithm, false, ['sign', 'verify'])) as CryptoKeyPair;
    const brut = await subtle.exportKey('raw', paire.publicKey);
    return { alg: 'Ed25519', publique: versBase64Url(brut), privee: paire.privateKey };
  } catch {
    // Navigateur sans Ed25519 dans WebCrypto : repli P-256.
  }
  const paire = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])) as CryptoKeyPair;
  const brut = await subtle.exportKey('raw', paire.publicKey);
  return { alg: 'P-256', publique: versBase64Url(brut), privee: paire.privateKey };
}

/** Signature base64url de `message` (UTF-8) par la clé de l'appareil. */
export async function signer(cle: CleAppareil, message: string, subtle: SubtleCrypto = subtilDuNavigateur()): Promise<string> {
  const algo: AlgorithmIdentifier | EcdsaParams =
    cle.alg === 'Ed25519' ? ({ name: 'Ed25519' } as Algorithm) : { name: 'ECDSA', hash: 'SHA-256' };
  const sig = await subtle.sign(algo, cle.privee, new TextEncoder().encode(message));
  return versBase64Url(sig);
}

const BASE = 'tune-acces-distant';
const TABLE = 'appareil';
const CLE = 'courant';

function ouvrirBase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(BASE, 1);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => req.result.createObjectStore(TABLE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb'));
  });
}

function operation<T>(mode: IDBTransactionMode, faire: (t: IDBObjectStore) => IDBRequest): Promise<T> {
  return ouvrirBase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(TABLE, mode);
        const req = faire(tx.objectStore(TABLE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result as T);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('indexeddb'));
        };
      }),
  );
}

/**
 * Magasin IndexedDB. `null` quand IndexedDB est absent : la navigation
 * privée de certains navigateurs le retire, ou l'efface à la fermeture, ce
 * qui enregistrerait un nouvel appareil à chaque session (cahier § 5.4).
 */
export function magasinIndexedDb(): MagasinAppareil | null {
  if (typeof indexedDB === 'undefined') return null;
  return {
    lire: () => operation<AppareilEnregistre | undefined>('readonly', (t) => t.get(CLE)).then((a) => a ?? null),
    ecrire: (a) => operation<void>('readwrite', (t) => t.put(a, CLE)),
    effacer: () => operation<void>('readwrite', (t) => t.delete(CLE)),
  };
}

/**
 * Le stockage survivra-t-il à la fermeture de l'onglet ?
 *
 * `navigator.storage.persisted()` ne le dit pas de façon fiable partout ; on
 * s'en tient donc à ce qui est sûr : un IndexedDB qui refuse de s'ouvrir est
 * celui d'une navigation privée. Le site refuse de toute façon un sixième
 * appareil ; ce contrôle évite d'en consommer un pour rien.
 */
export async function stockageUtilisable(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    const db = await ouvrirBase();
    db.close();
    return true;
  } catch {
    return false;
  }
}

/** Nom proposé pour l'appareil (« Safari sur iPhone ») ; l'utilisateur peut le changer. */
export function nomParDefaut(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  const navigateur = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Web';
  const systeme = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : '';
  return (systeme ? `${navigateur} · ${systeme}` : navigateur).slice(0, 80);
}
