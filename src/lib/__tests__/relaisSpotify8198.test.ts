// @vitest-environment jsdom
//
// renesenses/tune-server-rust#8198, volet 3 — le retour par mozaiklabs.fr
// (contrat, section C) : désactivé par défaut, seul `true` l'active, un
// serveur plus ancien (404) le masque, et `origine` ne part que relais actif.
import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  RELAIS_INCONNU,
  adresseADeclarer,
  avecOrigineSpotify,
  chargerRelais,
  ecrireRelais,
  lireReponseRelais,
  relaisSpotify,
} from '../relaisSpotify';

const RELAIS = 'https://mozaiklabs.fr/spotify-callback';
const LOCALE = 'http://127.0.0.1:8888/api/v1/streaming/spotify/callback';

describe('#8198 — lecture de la réponse du relais', () => {
  it('seul `actif: true` active', () => {
    expect(lireReponseRelais({ actif: true, redirect_uri: RELAIS }).actif).toBe(true);
    expect(lireReponseRelais({ actif: false, redirect_uri: RELAIS }).actif).toBe(false);
    expect(lireReponseRelais({ actif: 'true' as any }).actif).toBe(false);
    expect(lireReponseRelais({}).actif).toBe(false);
    expect(lireReponseRelais(null).redirect_uri).toBeNull();
  });
});

describe('#8198 — chargerRelais / ecrireRelais', () => {
  it('serveur plus ancien (404) : option masquée, sans lever', async () => {
    const e = await chargerRelais(async () => { throw Object.assign(new Error('404'), { status: 404 }); });
    expect(e).toEqual(RELAIS_INCONNU);
    expect(get(relaisSpotify).disponible).toBe(false);
  });

  it('serveur récent : l’état est rangé dans le magasin, inactif par défaut', async () => {
    await chargerRelais(async () => ({ actif: false, redirect_uri: RELAIS }));
    expect(get(relaisSpotify)).toEqual({ disponible: true, actif: false, redirect_uri: RELAIS });
  });

  it('une autre panne remonte', async () => {
    await expect(chargerRelais(async () => { throw Object.assign(new Error('boom'), { status: 500 }); })).rejects.toThrow('boom');
  });

  it('écrire envoie le choix et range la réponse du serveur', async () => {
    const envoyes: boolean[] = [];
    const e = await ecrireRelais(true, async (a) => { envoyes.push(a); return { actif: a, redirect_uri: RELAIS }; });
    expect(envoyes).toEqual([true]);
    expect(e.actif).toBe(true);
    expect(get(relaisSpotify).actif).toBe(true);
  });
});

describe('#8198 — adresse à déclarer et origine', () => {
  const actif = { disponible: true, actif: true, redirect_uri: RELAIS };
  const inactif = { disponible: true, actif: false, redirect_uri: RELAIS };

  it('relais actif : l’adresse du relais ; sinon celle du serveur', () => {
    expect(adresseADeclarer(LOCALE, actif)).toBe(RELAIS);
    expect(adresseADeclarer(LOCALE, inactif)).toBe(LOCALE);
    expect(adresseADeclarer(LOCALE, RELAIS_INCONNU)).toBe(LOCALE);
    expect(adresseADeclarer(null, inactif)).toBeNull();
  });

  it('`origine` ne part que pour Spotify, relais actif', () => {
    const o = 'http://192.168.1.20:8888';
    expect(avecOrigineSpotify('spotify', undefined, actif, o)).toEqual({ origine: o });
    expect(avecOrigineSpotify('spotify', { callback_url: 'x' }, actif, o)).toEqual({ callback_url: 'x', origine: o });
    expect(avecOrigineSpotify('spotify', undefined, inactif, o)).toBeUndefined();
    expect(avecOrigineSpotify('spotify', undefined, RELAIS_INCONNU, o)).toBeUndefined();
    expect(avecOrigineSpotify('tidal', undefined, actif, o)).toBeUndefined();
    const q = { username: 'a', password: 'b' };
    expect(avecOrigineSpotify('qobuz', q, actif, o)).toBe(q);
  });
});
