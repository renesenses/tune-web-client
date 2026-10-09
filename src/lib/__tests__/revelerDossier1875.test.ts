// @vitest-environment jsdom
/**
 * #1875 (Marco Polo, fil 2104) — « Localiser sur le disque » : ouvrir le
 * dossier dans l'Explorateur Windows.
 *
 * Tenu ici :
 *  1. le bouton n'existe que si le SERVEUR dit qu'il servirait ; toute erreur
 *     (serveur antérieur : 404, poste distant, non-admin) vaut NON ;
 *  2. les deux routes : `GET /library/reveal/available`,
 *     `POST /library/albums/{id}/reveal` — le client n'envoie QUE l'identifiant
 *     de l'album, jamais un chemin ;
 *  3. les messages d'échec selon le code stable du serveur ;
 *  4. le branchement dans la fiche d'album, et les textes en onze langues.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleEchecRevelation, revelationDisponible } from '../revelerDossier';
import { getRevelationDisponible, revelerDossierAlbum } from '../api';
import de from '../locales/de';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

afterEach(() => vi.unstubAllGlobals());

function stub(status: number, corps: unknown) {
  const f = vi.fn(async () => new Response(typeof corps === 'string' ? corps : JSON.stringify(corps), {
    status, headers: { 'Content-Type': 'application/json' },
  }));
  vi.stubGlobal('fetch', f);
  return f;
}

describe('#1875 — le bouton n’apparaît que si le serveur dit oui', () => {
  it('oui', async () => {
    expect(await revelationDisponible(async () => ({ available: true }))).toBe(true);
  });
  it('non, avec ou sans raison', async () => {
    expect(await revelationDisponible(async () => ({ available: false }))).toBe(false);
    expect(await revelationDisponible(async () => undefined)).toBe(false);
  });
  it('une erreur (serveur antérieur, 403…) vaut NON, sans lever', async () => {
    expect(await revelationDisponible(async () => { throw new Error('404'); })).toBe(false);
  });
  it('par la vraie route : un 404 d’un serveur antérieur vaut NON', async () => {
    stub(404, 'Not Found');
    expect(await revelationDisponible()).toBe(false);
  });
});

describe('#1875 — les routes', () => {
  it('GET /library/reveal/available', async () => {
    const f = stub(200, { available: true });
    expect((await getRevelationDisponible()).available).toBe(true);
    expect(String((f.mock.calls[0] as unknown[])[0])).toMatch(/\/library\/reveal\/available$/);
  });

  it('POST /library/albums/{id}/reveal, sans corps : jamais un chemin', async () => {
    const f = stub(200, { status: 'opened' });
    await revelerDossierAlbum(5);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/library\/albums\/5\/reveal$/);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });
});

describe('#1875 — les messages d’échec', () => {
  it('selon le code du serveur', () => {
    expect(cleEchecRevelation('album_folder_not_found')).toBe('v2.album.revealNotFound');
    expect(cleEchecRevelation('reveal_remote_client')).toBe('v2.album.revealRefused');
    expect(cleEchecRevelation('reveal_proxied')).toBe('v2.album.revealRefused');
    expect(cleEchecRevelation(undefined)).toBe('v2.album.revealFailed');
    expect(cleEchecRevelation('path_outside_music_dirs')).toBe('v2.album.revealFailed');
  });
});

describe('#1875 — branché dans la fiche, et traduit', () => {
  const src = readFileSync(resolve(__dirname, '../../components/v2/AlbumDetailV2.svelte'), 'utf8');

  it('le bouton est conditionné par la réponse du serveur, à côté de « Localiser »', () => {
    expect(src).toMatch(/\{#if revelable\}\s*<button class="ghost reveler" onclick=\{ouvrirDansLExplorateur\}/);
    expect(src).toMatch(/revelationDisponible\(\)\.then/);
    expect(src).toMatch(/revelerDossierAlbum\(album\.id\)/);
  });

  const DICOS = { de, en, es, fr, hu, it: it_, ja, ko, ro, sv, zh } as unknown as Record<string, Record<string, string>>;
  const CLES = ['v2.album.reveal', 'v2.album.revealTip', 'v2.album.revealNotFound', 'v2.album.revealRefused', 'v2.album.revealFailed'];
  it.each(Object.keys(DICOS))('%s porte les cinq textes', (l) => {
    for (const k of CLES) expect(DICOS[l][k]?.trim(), `${l} : ${k}`).toBeTruthy();
  });
});
