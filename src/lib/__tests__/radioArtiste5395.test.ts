// @vitest-environment jsdom
/**
 * tune-server-rust#5395 — « Radio de l'artiste » devient une vraie radio.
 *
 * Trois choses se prouvent ici, à l'exécution :
 *  1. le bouton appelle la NOUVELLE route, avec l'artiste, le service et
 *     l'identifiant de la fiche (rien de local ne part vers un service) ;
 *  2. sur un serveur PLUS ANCIEN (404 « not found » de la route inconnue), ou
 *     quand le serveur ne trouve rien, `api.radioArtiste` rend `null` sans
 *     bandeau et le geste d'avant — le mélange des titres phares — reprend ;
 *  3. quand la radio part, l'ancien geste ne part PAS en plus.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const erreurs = vi.fn();
vi.mock('../stores/notifications', () => ({
  notifications: { error: erreurs, success: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

const api = await import('../api');
const { corpsRadioArtiste, lancerRadioArtiste } = await import('../radioArtiste');

function repondre(statut: number, corps: unknown) {
  const texte = corps === undefined ? '' : JSON.stringify(corps);
  const f = vi.fn().mockResolvedValue({
    ok: statut < 400,
    status: statut,
    statusText: '',
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => texte,
    json: async () => JSON.parse(texte),
    clone() { return this; },
  });
  vi.stubGlobal('fetch', f);
  return f;
}

beforeEach(() => erreurs.mockClear());

describe('#5395 — le corps de la requête', () => {
  it('une fiche de service part avec son service et son identifiant', () => {
    expect(corpsRadioArtiste({ service: 'qobuz', id: 38324 }, ' Pink Floyd ')).toEqual({
      artist: 'Pink Floyd',
      service: 'qobuz',
      artist_id: '38324',
    });
  });
  it('une fiche de bibliothèque ne prête pas son identifiant LOCAL à un service', () => {
    expect(corpsRadioArtiste({ service: null, id: 12 }, 'Miles Davis')).toEqual({
      artist: 'Miles Davis',
      service: null,
      artist_id: null,
    });
  });
  it('sans nom, pas de requête', () => {
    expect(corpsRadioArtiste({ service: 'qobuz', id: 1 }, '  ')).toBeNull();
  });
});

describe('#5395 — la route du serveur', () => {
  it('appelle POST /zones/{id}/radio/artist et rend la zone quand la radio part', async () => {
    const f = repondre(200, { id: 3, state: 'playing', radio: { count: 25 } });
    const zone = await api.radioArtiste(3, { artist: 'Graine', service: 'qobuz', artist_id: 'g' });
    expect(zone?.radio.count).toBe(25);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toMatch(/\/zones\/3\/radio\/artist$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ artist: 'Graine', service: 'qobuz', artist_id: 'g' });
  });
  it('un serveur plus ancien (route inconnue) rend null, sans bandeau', async () => {
    repondre(404, { error: 'not found', path: '/api/v1/zones/3/radio/artist' });
    await expect(api.radioArtiste(3, { artist: 'X', service: null, artist_id: null })).resolves.toBeNull();
    expect(erreurs).not.toHaveBeenCalled();
  });
  it('une radio sans titre rend null, sans bandeau', async () => {
    repondre(404, { error: 'radio_artiste_vide', artist: 'X' });
    await expect(api.radioArtiste(3, { artist: 'X', service: null, artist_id: null })).resolves.toBeNull();
    expect(erreurs).not.toHaveBeenCalled();
  });
});

describe('#5395 — le repli sur l’ancien geste', () => {
  it('route absente : les titres phares mélangés partent, une fois', async () => {
    const repli = vi.fn().mockResolvedValue(10);
    const issue = await lancerRadioArtiste(corpsRadioArtiste({ service: 'tidal', id: 7 }, 'A'), {
      radio: async () => null,
      repli,
    });
    expect(issue).toBe('repli');
    expect(repli).toHaveBeenCalledTimes(1);
  });
  it('radio partie : l’ancien geste ne part PAS en plus', async () => {
    const repli = vi.fn().mockResolvedValue(10);
    const issue = await lancerRadioArtiste(corpsRadioArtiste({ service: 'tidal', id: 7 }, 'A'), {
      radio: async () => ({ id: 1 }),
      repli,
    });
    expect(issue).toBe('radio');
    expect(repli).not.toHaveBeenCalled();
  });
  it('ni radio ni titres phares : « rien », que l’écran dit', async () => {
    const issue = await lancerRadioArtiste(null, { radio: async () => ({}), repli: async () => 0 });
    expect(issue).toBe('rien');
  });
});

describe('#5395 — le bouton de la fiche', () => {
  const svc = readFileSync(resolve(__dirname, '../../components/v2/ArtisteServiceV2.svelte'), 'utf8');
  it('« Radio de l’artiste » appelle la radio du serveur, plus le seul mélange', () => {
    const bouton = svc.match(/<button[^>]*onclick=\{\(\) => ([a-zA-Z]+)\([^)]*\)\}>\s*\{\$tr\('v2\.fas\.radio'/);
    expect(bouton?.[1], 'le bouton Radio ne passe pas par jouerLaRadio').toBe('jouerLaRadio');
    expect(svc).toContain('radio: (corps) => radioArtisteAndSync(zid, corps)');
  });
});
