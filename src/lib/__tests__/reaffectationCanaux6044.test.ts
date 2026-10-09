/**
 * tune-server-rust#6044 — la grille de la réaffectation des canaux.
 *
 * Le serveur valide et normalise ; ici, on garde ce que l'écran fait de la
 * grille AVANT de l'envoyer : la forme N × M, la lecture d'une case, le
 * redimensionnement qui garde ce qui existe, et le câblage de l'écran.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  identite, redimensionner, lireGain, afficherGain, avecGain, formeValide, nomsDesCanaux,
  setReaffectationZone, LIBELLES_PREREGLAGES,
} from '../reaffectationCanaux';
import fr from '../locales/fr';
import en from '../locales/en';

// `fetchJSON` lit le jeton dans localStorage et pousse des notifications :
// absents de l'environnement `node`, on les remplace (même motif que
// `api.empty-body.test.ts`).
vi.mock('../auth', () => ({ getToken: () => null, clearToken: () => {} }));
vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

describe('grille de réaffectation', () => {
  it('identité : 0 dB sur la diagonale, muet ailleurs', () => {
    const r = identite(4);
    expect(r.gains_db).toEqual([
      [0, null, null, null],
      [null, 0, null, null],
      [null, null, 0, null],
      [null, null, null, 0],
    ]);
    expect(formeValide(r)).toBe(true);
  });

  it('4 → 6 garde les cases existantes et ajoute des sorties muettes', () => {
    const r = redimensionner(identite(4), 4, 6);
    expect(r.outputs).toBe(6);
    expect(r.gains_db[0]).toEqual([0, null, null, null]);
    expect(r.gains_db[4]).toEqual([null, null, null, null]);
    expect(r.gains_db[5]).toEqual([null, null, null, null]);
    expect(r.preset).toBeNull();
    expect(formeValide(r)).toBe(true);
  });

  it('une case se lit en dB, vide = muet, hors bornes = refusée', () => {
    expect(lireGain('')).toBeNull();
    expect(lireGain(' - ')).toBeNull();
    expect(lireGain('-3,01')).toBeCloseTo(-3.01);
    expect(lireGain('−6')).toBe(-6);
    expect(lireGain('12')).toBe(12);
    expect(lireGain('12.5')).toBeUndefined();
    expect(lireGain('-61')).toBeUndefined();
    expect(lireGain('abc')).toBeUndefined();
    expect(afficherGain(null)).toBe('');
    expect(afficherGain(-3.0103)).toBe('-3.01');
  });

  it('poser une case rend un nouveau réglage sans toucher l’ancien', () => {
    const avant = identite(2);
    const apres = avecGain(avant, 0, 1, -6);
    expect(apres.gains_db).toEqual([[0, -6], [null, 0]]);
    expect(avant.gains_db).toEqual([[0, null], [null, 0]]);
  });

  it('une forme qui ne tient pas est refusée avant l’envoi', () => {
    const r = identite(2);
    expect(formeValide({ ...r, gains_db: [[0, null]] })).toBe(false);
    expect(formeValide({ ...r, gains_db: [[0, 40], [null, 0]] })).toBe(false);
    expect(formeValide({ ...r, inputs: 0 })).toBe(false);
  });

  it('les noms suivent l’ordre FLAC/WAV, et se numérotent au-delà de 8', () => {
    expect(nomsDesCanaux(4)).toEqual(['FL', 'FR', 'BL', 'BR']);
    expect(nomsDesCanaux(6)).toEqual(['FL', 'FR', 'FC', 'LFE', 'BL', 'BR']);
    expect(nomsDesCanaux(10)[9]).toBe('10');
  });

  it('chaque préréglage a son libellé en français et en anglais', () => {
    for (const cle of Object.values(LIBELLES_PREREGLAGES)) {
      expect(fr, cle).toHaveProperty([cle]);
      expect(en, cle).toHaveProperty([cle]);
    }
  });
});

describe('routes', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('PUT /channel-remap/zones/{id} porte le réglage complet', async () => {
    const appel = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ saved: true, settings: identite(2), effective: { valid: true } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }),
    );
    await setReaffectationZone(3, identite(2));
    const [url, init] = appel.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toMatch(/\/channel-remap\/zones\/3$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toMatchObject({ inputs: 2, outputs: 2, normalize: true });
  });
});

describe('câblage de l’écran', () => {
  const lire = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');

  it('la vue `reaffectation` monte l’écran, et la carte des greffons l’ouvre', () => {
    expect(lire('src/components/v2/ShellV2.svelte')).toMatch(
      /\$activeView === 'reaffectation'\}\s*<ReaffectationCanauxV2 \/>/,
    );
    expect(lire('src/components/v2/PluginsV2.svelte')).toContain("activeView.set('reaffectation')");
  });

  it('l’écran dit que la réaffectation casse le bit-perfect', () => {
    expect(lire('src/components/v2/ReaffectationCanauxV2.svelte')).toContain("$t('v2.cr.bitPerfect'");
    expect(fr['v2.cr.bitPerfect']).toMatch(/bit-perfect/);
  });
});
