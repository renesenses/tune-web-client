/**
 * Signatures de l'appareil, contre les VECTEURS PARTAGÉS de la caisse Rust.
 *
 * `fixtures/laissez-passer/*.json` : copie à l'identique de
 * `tune-laissez-passer/vecteurs/` (renesenses/tune-server-rust, main
 * baef6fbe7, PR #6606), les mêmes fichiers que le site rejoue
 * (site-mozaiklabs#322, `tests/Fixtures/laissez-passer/`). Les clés y sont
 * PUBLIQUES, réservées aux tests.
 *
 * Ed25519 est déterministe : signer le défi du vecteur avec la graine de test
 * doit redonner, octet pour octet, la signature que la caisse accepte. P-256
 * ne l'est pas : on vérifie la signature du vecteur, puis que la nôtre se
 * vérifie avec la même clé, au format `r ‖ s` de 64 octets.
 */
import { describe, expect, it } from 'vitest';
import cles from './fixtures/laissez-passer/cles_de_test.json';
import valide from './fixtures/laissez-passer/valide.json';
import valideP256 from './fixtures/laissez-passer/valide_p256.json';
import cleDifferente from './fixtures/laissez-passer/cle_appareil_differente.json';
import defiAutreServeur from './fixtures/laissez-passer/defi_autre_serveur.json';
import {
  chargeDuLaissezPasser,
  depuisBase64Url,
  messageDemande,
  messageInscription,
  messageSession,
  versBase64Url,
} from '../laissezPasser/format';
import { creerCleAppareil, signer, type CleAppareil } from '../laissezPasser/cleAppareil';

const subtle = globalThis.crypto.subtle;
const SID = cles.serveur.server_id;

function hex(h: string): Uint8Array {
  return new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));
}

/** Graine Ed25519 de 32 octets → clé privée WebCrypto (PKCS#8). */
async function cleEd25519(graineHex: string, pk: string): Promise<CleAppareil> {
  const prefixe = hex('302e020100300506032b657004220420');
  const pkcs8 = new Uint8Array(prefixe.length + 32);
  pkcs8.set(prefixe);
  pkcs8.set(hex(graineHex), prefixe.length);
  const privee = await subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' } as Algorithm, false, ['sign']);
  return { alg: 'Ed25519', publique: pk, privee };
}

async function cleP256(): Promise<CleAppareil> {
  const privee = await subtle.importKey(
    'pkcs8',
    depuisBase64Url(cles.appareil_p256.pkcs8)!,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  return { alg: 'P-256', publique: cles.appareil_p256.cnf.pk, privee };
}

async function verifie(alg: 'Ed25519' | 'P-256', pk: string, message: string, sig: string): Promise<boolean> {
  const algo = alg === 'Ed25519' ? ({ name: 'Ed25519' } as Algorithm) : { name: 'ECDSA', namedCurve: 'P-256' };
  const cle = await subtle.importKey('raw', depuisBase64Url(pk)!, algo, false, ['verify']);
  const v = alg === 'Ed25519' ? ({ name: 'Ed25519' } as Algorithm) : { name: 'ECDSA', hash: 'SHA-256' };
  return subtle.verify(v, cle, depuisBase64Url(sig)!, new TextEncoder().encode(message));
}

describe('messages signés (formats validés : vecteurs Rust et site-mozaiklabs#322)', () => {
  it('session sur le relais : tune-remote/session/v1\\n<sid>\\n<défi>', () => {
    expect(messageSession('S', 'D')).toBe('tune-remote/session/v1\nS\nD');
  });
  it('inscription sur le site : tune-remote/appareil/v1\\n<défi>\\n<clé>', () => {
    expect(messageInscription('D', 'K')).toBe('tune-remote/appareil/v1\nD\nK');
  });
  it('demande de laissez-passer : tune-remote/laissez-passer/v1\\n<sid>\\n<did>\\n<ts>\\n<nonce>', () => {
    expect(messageDemande('S', 'dev_1', 1793000000, 'N')).toBe('tune-remote/laissez-passer/v1\nS\ndev_1\n1793000000\nN');
  });
});

describe('vecteurs partagés', () => {
  it('Ed25519 : la signature du défi est celle du vecteur `valide`, octet pour octet', async () => {
    const cle = await cleEd25519(cles.appareil_ed25519.graine_hex, cles.appareil_ed25519.cnf.pk);
    const sig = await signer(cle, messageSession(valide.contexte.server_id, valide.defi.defi));
    expect(sig).toBe(valide.defi.signature);
  });

  it('Ed25519 : une autre clé redonne la signature REFUSÉE du vecteur `cle_appareil_differente`', async () => {
    const autre = await cleEd25519(cles.autre_appareil_ed25519.graine_hex, cles.autre_appareil_ed25519.cnf.pk);
    const sig = await signer(autre, messageSession(cleDifferente.contexte.server_id, cleDifferente.defi.defi));
    expect(sig).toBe(cleDifferente.defi.signature);
    // …et elle ne se vérifie pas avec la clé du laissez-passer (`cnf.pk`).
    expect(await verifie('Ed25519', cles.appareil_ed25519.cnf.pk, messageSession(SID, cleDifferente.defi.defi), sig)).toBe(false);
  });

  it('le domaine compte : notre message pour CE serveur ne redonne pas la signature `defi_autre_serveur`', async () => {
    const cle = await cleEd25519(cles.appareil_ed25519.graine_hex, cles.appareil_ed25519.cnf.pk);
    const sig = await signer(cle, messageSession(SID, defiAutreServeur.defi.defi));
    expect(sig).not.toBe(defiAutreServeur.defi.signature);
  });

  it('P-256 : la signature du vecteur se vérifie, et la nôtre aussi (r ‖ s, 64 octets)', async () => {
    const message = messageSession(valideP256.contexte.server_id, valideP256.defi.defi);
    expect(await verifie('P-256', cles.appareil_p256.cnf.pk, message, valideP256.defi.signature)).toBe(true);
    const sig = await signer(await cleP256(), message);
    expect(depuisBase64Url(sig)!.length).toBe(64);
    expect(await verifie('P-256', cles.appareil_p256.cnf.pk, message, sig)).toBe(true);
  });

  it('lit `sid` et `exp` de la charge du laissez-passer (sans prétendre le vérifier)', () => {
    const c = chargeDuLaissezPasser(valide.laissez_passer)!;
    expect(c.sid).toBe(SID);
    expect(c.exp).toBe(1793003000);
    expect(c.jti).toBe('jti-0001');
    expect(chargeDuLaissezPasser('pas.un.jws!')).toBeNull();
  });

  it('base64url sans remplissage, décodage strict', () => {
    expect(versBase64Url(new Uint8Array([251, 255]))).toBe('-_8');
    expect(depuisBase64Url('-_8')).toEqual(new Uint8Array([251, 255]));
    expect(depuisBase64Url('a+b/')).toBeNull();
    expect(depuisBase64Url('ab==')).toBeNull();
  });
});

describe('clé de l’appareil', () => {
  it('Ed25519 non extractible, clé publique de 32 octets', async () => {
    const cle = await creerCleAppareil(subtle);
    expect(cle.alg).toBe('Ed25519');
    expect(cle.privee.extractable).toBe(false);
    expect(depuisBase64Url(cle.publique)!.length).toBe(32);
    const sig = await signer(cle, 'x', subtle);
    expect(await verifie('Ed25519', cle.publique, 'x', sig)).toBe(true);
  });

  it('repli P-256 quand le navigateur ne connaît pas Ed25519 : point SEC1 de 65 octets', async () => {
    const sansEd25519 = new Proxy(subtle, {
      get(cible, nom) {
        if (nom === 'generateKey') {
          return (algo: AlgorithmIdentifier, ...reste: unknown[]) => {
            const n = typeof algo === 'string' ? algo : algo.name;
            if (n === 'Ed25519') return Promise.reject(new DOMException('NotSupportedError'));
            return (cible.generateKey as (...a: unknown[]) => unknown)(algo, ...reste);
          };
        }
        const v = Reflect.get(cible, nom);
        return typeof v === 'function' ? v.bind(cible) : v;
      },
    });
    const cle = await creerCleAppareil(sansEd25519);
    expect(cle.alg).toBe('P-256');
    expect(cle.privee.extractable).toBe(false);
    const brut = depuisBase64Url(cle.publique)!;
    expect(brut.length).toBe(65);
    expect(brut[0]).toBe(4);
    const sig = await signer(cle, 'y', subtle);
    expect(await verifie('P-256', cle.publique, 'y', sig)).toBe(true);
  });
});
