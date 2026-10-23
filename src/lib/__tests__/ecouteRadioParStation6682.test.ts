// @vitest-environment jsdom
//
// tune-server-rust#6682 (Gros Bidon, fil 2353) — « les écoutes radio ne sont
// pas comptabilisées dans les indicateurs "Mon écoute" ». Le serveur rend
// désormais `radio_listening` : le temps d'écoute par station sur la période,
// à part des classements. Le tableau de bord le montre dans SON bloc, et les
// classements de titres n'en reçoivent rien.
//
// 🔴 Le témoin passe par le VRAI catalogue : `donnees` du bloc, puis son
// composant monté, et l'on lit le texte affiché.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import * as api from '../api';
import { BLOCS_TABLEAU_DE_BORD, dureeDEcoute } from '../tableauDeBordWidgets';
import { dictionnaire } from './onzeDictionnaires';

const FR = dictionnaire('fr') as Record<string, string>;

const REPONSE = {
  period: '7d', range: { from: null, to: null },
  totals: { plays: 3, listening_ms: 600_000, unique_tracks: 3, unique_artists: 1 },
  top_artists: [], top_albums: [],
  top_tracks: [{ track_id: 1, title: 'Come Together', artist_name: 'The Beatles', plays: 3, listening_ms: 600_000 }],
  trend: [], hourly: [], by_zone: [], by_source: [],
  completion: { completed: 0, skipped: 0, avg_listened_ms: 0, avg_track_duration_ms: 0 },
  radio_listening: [
    { station_name: 'FIP', radio_id: 7, listening_ms: 3_900_000, sessions: 2 },
    { station_name: 'TSF Jazz', radio_id: null, listening_ms: 1_320_000, sessions: 1 },
  ],
};

let monte: Record<string, any> | null = null;
let hote: HTMLDivElement | null = null;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'getDashboard').mockResolvedValue(REPONSE as any);
});
afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.restoreAllMocks();
});

async function texteDuBloc(id: string): Promise<string> {
  const w = BLOCS_TABLEAU_DE_BORD.find((x) => x.id === id);
  if (!w?.bloc) throw new Error(`bloc ${id} absent du catalogue`);
  const donnees = await w.bloc.donnees({ langue: 'fr' } as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(w.bloc.composant as any, { target: hote, props: { donnees } });
  flushSync();
  return (hote.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('#6682 — Mon écoute : le temps d’écoute radio, par station, à part', () => {
  it('🔴 le bloc Radios nomme chaque station et son temps d’écoute', async () => {
    const txt = await texteDuBloc('tdb-radios');
    expect(txt, 'le bloc Radios ne montre pas FIP').toContain('FIP');
    expect(txt, 'le temps d’écoute de FIP n’est pas affiché').toContain('1 h 05');
    expect(txt).toContain('TSF Jazz');
    expect(txt).toContain('22 min');
    expect(txt.indexOf('FIP'), 'la station la plus écoutée vient en tête').toBeLessThan(txt.indexOf('TSF Jazz'));
  });

  it('les classements de titres n’en reçoivent rien', async () => {
    const txt = await texteDuBloc('tdb-top-titres');
    expect(txt).toContain('Come Together');
    expect(txt).not.toContain('FIP');
  });

  it('sans radio écoutée, le bloc dit la semaine vide (et pas « aucun historique »)', async () => {
    vi.mocked(api.getDashboard).mockResolvedValue({ ...REPONSE, radio_listening: undefined } as any);
    expect(await texteDuBloc('tdb-radios')).toBe(FR['dashboard.emptyLast7Days']);
  });

  it('la durée s’écrit en minutes, puis en heures', () => {
    expect(dureeDEcoute(0)).toBe('0 min');
    expect(dureeDEcoute(42 * 60_000)).toBe('42 min');
    expect(dureeDEcoute(3 * 3_600_000 + 5 * 60_000)).toBe('3 h 05');
  });
});
