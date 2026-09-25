import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CF_MAX_AMOUNT,
  CF_MAX_DELAY,
  bornesCrossfeed,
  niveauEnPourcent,
  reglagesCrossfeed,
} from '../crossfeed';
import * as api from '../api';
import * as LOCALES from './lesOnzeLangues';

/**
 * tune-server-rust#4683 — « pouvoir pousser le curseur jusqu'à 100 % »
 * (Thierry Clémont).
 *
 * Le curseur de RETARD allait déjà jusqu'à sa borne (5 ms, celle du serveur).
 * Celui qui s'arrêtait « à mi-course » est le NIVEAU : il affichait
 * `amount × 100`, soit « 50 % » en butée, parce que le serveur borne `amount`
 * à 0,5. Or 0,5 est le bout physique de l'échelle — le point mono du moteur
 * (Side × (1 − 2·amount)) — et le relever inverserait le Side. La correction
 * est donc d'échelle : 100 % = la borne du serveur.
 */
describe('#4683 — le niveau s’affiche sur toute la course du curseur', () => {
  it('la borne du serveur vaut 100 %', () => {
    expect(niveauEnPourcent(CF_MAX_AMOUNT)).toBe(100);
    expect(niveauEnPourcent(0)).toBe(0);
    expect(niveauEnPourcent(0.3)).toBe(60);
  });

  it('suit la borne publiée par le serveur, et ne dépasse jamais 100 %', () => {
    expect(niveauEnPourcent(0.4, 0.4)).toBe(100);
    expect(niveauEnPourcent(0.9, 0.5)).toBe(100);
    expect(niveauEnPourcent(Number.NaN)).toBe(0);
  });

  it('prend les bornes du serveur, sinon les constantes', () => {
    expect(bornesCrossfeed(null)).toEqual({ amountMax: CF_MAX_AMOUNT, delayMax: CF_MAX_DELAY });
    expect(bornesCrossfeed({ amount_max: 0.4, delay_ms_max: 2 })).toEqual({ amountMax: 0.4, delayMax: 2 });
    // Une borne nulle ou absurde ne doit pas écraser le curseur à zéro.
    expect(bornesCrossfeed({ amount_max: 0, delay_ms_max: Number.NaN } as any)).toEqual({
      amountMax: CF_MAX_AMOUNT,
      delayMax: CF_MAX_DELAY,
    });
  });

  it('borne la charge utile avec les bornes du serveur', () => {
    expect(reglagesCrossfeed(true, 0.5, 5, { amountMax: 0.4, delayMax: 2 })).toEqual({
      enabled: true,
      amount: 0.4,
      delay_ms: 2,
    });
  });

  const ECRANS = [
    { nom: 'v2/CrossfeedV2.svelte', chemin: '../../components/v2/CrossfeedV2.svelte' },
    { nom: 'NowPlaying.svelte', chemin: '../../components/partages/NowPlaying.svelte' },
  ] as const;

  for (const { nom, chemin } of ECRANS) {
    const source = readFileSync(resolve(__dirname, chemin), 'utf-8');
    it(`${nom} affiche le niveau par niveauEnPourcent et lit crossfeed_limits`, () => {
      expect(source).toContain('niveauEnPourcent(');
      expect(source).toContain('crossfeed_limits');
      expect(source, 'l’ancien affichage « 50 % en butée »').not.toMatch(/amount \* 100/);
      expect(source, 'borne recopiée en dur').not.toMatch(/max="0\.5"|max="5"/);
    });
  }

  it('la phrase qui dit ce que vaut 100 % existe dans les 11 langues', () => {
    const langues = Object.entries(LOCALES).filter(
      ([, v]) => v && typeof v === 'object' && 'v2.cf.amountHint' in (v as object),
    );
    expect(langues.length).toBeGreaterThanOrEqual(11);
    for (const [code, table] of langues) {
      expect((table as Record<string, string>)['v2.cf.amountScaleHint'], code).toBeTruthy();
    }
  });
});

/**
 * tune-server-rust#4684 — préréglages nommés du crossfeed, sur le modèle de
 * « Mes presets » de l'égaliseur.
 */
describe('#4684 — préréglages de crossfeed côté client', () => {
  const fetchMock = vi.fn();
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  // `fetchJSON` lit le jeton dans `localStorage`, absent de cet environnement.
  function stubs() {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    vi.stubGlobal('fetch', fetchMock);
  }

  function repond(body: unknown, status = 200) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
    );
  }

  it('liste, enregistre et supprime par /crossfeed/presets', async () => {
    stubs();
    repond({ presets: [{ id: 'a', name: 'Salon', amount: 0.3, delay_ms: 0.5 }] });
    const liste = await api.listCrossfeedPresets();
    expect(liste.map((p) => p.name)).toEqual(['Salon']);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/crossfeed\/presets$/);

    repond({ id: 'b', name: 'Casque', amount: 0.2, delay_ms: 0.3 }, 201);
    const cree = await api.saveCrossfeedPreset({ name: 'Casque', amount: 0.2, delay_ms: 0.3 });
    expect(cree.id).toBe('b');
    const [url, init] = fetchMock.mock.calls[1];
    expect(String(url)).toMatch(/\/crossfeed\/presets$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'Casque', amount: 0.2, delay_ms: 0.3 });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ deleted: 'b' }), { status: 200 }));
    await api.deleteCrossfeedPreset('b');
    const [urlDel, initDel] = fetchMock.mock.calls[2];
    expect(String(urlDel)).toMatch(/\/crossfeed\/presets\/b$/);
    expect(initDel.method).toBe('DELETE');
  });

  it('un serveur sans la route donne une liste vide', async () => {
    stubs();
    repond({});
    expect(await api.listCrossfeedPresets()).toEqual([]);
  });

  it('l’écran Crossfeed propose d’enregistrer, d’appliquer et de supprimer', () => {
    const source = readFileSync(resolve(__dirname, '../../components/v2/CrossfeedV2.svelte'), 'utf-8');
    expect(source).toContain('api.listCrossfeedPresets(');
    expect(source).toContain('api.saveCrossfeedPreset(');
    expect(source).toContain('api.deleteCrossfeedPreset(');
    // Appliquer passe par le chemin ordinaire (`save` → PUT /zones/{id}/dsp).
    expect(source).toMatch(/function appliquerMonPreset[\s\S]*?applyPreset\(/);
  });
});
