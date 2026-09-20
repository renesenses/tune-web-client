import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as api from '../api';
import { widgetParId, DISPOSITION_DEFAUT } from '../accueilWidgets';

/**
 * Les trois extraits du tableau de bord (Bertrand, 20/09/2026), plus la
 * semaine. Tous vivent de `GET /library/history/dashboard`, qui porte déjà
 * `top_artists`, `top_radios` et les totaux : aucune route nouvelle.
 */
const LANGUES = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];
const ctx: any = { profileId: null, langue: 'fr' };

function reponse(extra: Record<string, unknown> = {}) {
  return {
    period: '30d',
    range: { from: null, to: '' },
    totals: { plays: 1266, listening_ms: 3_600_000 * 96, unique_tracks: 42, unique_artists: 17 },
    top_artists: [{ artist_name: 'Dionne Warwick', plays: 12, listening_ms: 1, cover_path: '/c.jpg' }],
    top_albums: [], top_tracks: [], trend: [], hourly: [], by_zone: [], by_source: [],
    completion: { completed: 0, skipped: 0, avg_listened_ms: 0, avg_track_duration_ms: 0 },
    ...extra,
  } as any;
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('widgets extraits du tableau de bord', () => {
  it('« Artistes les plus écoutés » rend des éléments, pochette comprise', async () => {
    vi.spyOn(api, 'getDashboard').mockResolvedValue(reponse());
    const els = await widgetParId('top-artistes')!.charger(ctx);
    expect(els.length).toBe(1);
    expect(els[0].titre).toBe('Dionne Warwick');
    expect(els[0].cover).toBe('/c.jpg');
  });

  it('🔴 « Radios » survit à `top_radios` ABSENT, pas seulement vide', async () => {
    // Le serveur OMET le champ quand la liste est vide (skip_serializing_if).
    vi.spyOn(api, 'getDashboard').mockResolvedValue(reponse());
    await expect(widgetParId('top-radios')!.charger(ctx)).resolves.toEqual([]);
  });

  it('une radio se joue par SA route, jamais comme un album', async () => {
    vi.spyOn(api, 'getDashboard').mockResolvedValue(
      reponse({ top_radios: [{ station_name: 'FIP', radio_id: 7, plays: 3, listening_ms: 1 }] }),
    );
    const radio = vi.spyOn(api, 'playRadio').mockResolvedValue(undefined as any);
    const els = await widgetParId('top-radios')!.charger(ctx);
    await els[0].jouer!(2);
    expect(radio).toHaveBeenCalledWith(7, 2);
  });

  it('une radio sans identifiant n’est pas actionnable', async () => {
    vi.spyOn(api, 'getDashboard').mockResolvedValue(
      reponse({ top_radios: [{ station_name: 'Inconnue', radio_id: null, plays: 1, listening_ms: 1 }] }),
    );
    const els = await widgetParId('top-radios')!.charger(ctx);
    expect(els[0].jouer).toBeUndefined();
  });

  it('« Votre semaine » interroge la période 7d et formate ses chiffres', async () => {
    const dash = vi.spyOn(api, 'getDashboard').mockResolvedValue(reponse());
    const chiffres = await widgetParId('stats-semaine')!.chiffres!(ctx);
    expect(dash.mock.calls.some((c) => c[0] === '7d')).toBe(true);
    expect(chiffres.length).toBe(4);
    expect(chiffres.every((c) => typeof c.valeur === 'string' && c.valeur.length > 0)).toBe(true);
  });

  it('🔴 aucun sous-titre ne contient de mot : ce serait du français non traduisible', async () => {
    vi.spyOn(api, 'getDashboard').mockResolvedValue(reponse());
    const els = await widgetParId('top-artistes')!.charger(ctx);
    // `sous` est une DONNÉE produite ici : `check-i18n` ne la lit pas.
    expect(els[0].sous).toMatch(/^[\d\s .,]+$/);
  });

  it('les trois titres existent dans les 11 langues', () => {
    for (const lg of LANGUES) {
      const src = readFileSync(resolve(__dirname, `../locales/${lg}.ts`), 'utf8');
      for (const cle of ['v2.home.wTopArtists', 'v2.home.wTopRadios', 'v2.home.wWeekStats']) {
        expect(src.includes(`"${cle}"`) || src.includes(`'${cle}'`), `${cle} absente de ${lg}`).toBe(true);
      }
    }
  });

  it('🔴 aucun ne s’impose sur l’accueil : la disposition par défaut ne bouge pas', () => {
    // « personne ne doit voir son écran changer sans l'avoir demandé ».
    for (const id of ['top-artistes', 'top-radios', 'stats-semaine']) {
      expect(DISPOSITION_DEFAUT).not.toContain(id);
    }
  });
});
