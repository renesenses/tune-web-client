// web#2534 — « Voir dans l'application la liste des alarmes déjà programmées »
// (ancien #2448, alec_eiffel, fil de l'alarme FIP : « je ne vois pas dans
// l'application où visualiser les alarmes qui ont été mises »).
//
// Le réveil posé depuis Lecture en cours s'écrit dans la table `alarms`
// (`POST /zones/{id}/alarm`). Deux défauts le rendaient invisible :
//  - `GET /zones/{id}/alarm` rend une LISTE ; l'écran lisait `r.time` sur ce
//    tableau, ne voyait donc jamais de réveil actif, ni son « Annuler » ;
//  - « Annuler » appelait `DELETE /zones/{id}/alarm`, route qui n'existe pas :
//    la seule est `DELETE /zones/{id}/alarm/{alarm_id}`.
// Le panneau liste désormais les réveils de la zone, chacun annulable, et
// mène à l'écran Réveils, qui les montre tous (y compris aux niveaux où la
// barre latérale ne l'affiche pas).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as api from '../api';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

function repondre(corps: unknown) {
  const appels: Array<{ url: string; methode: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    appels.push({ url: String(u), methode: (init?.method ?? 'GET').toUpperCase() });
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  return appels;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('api — réveils de zone', () => {
  it('🔴 getAlarm rend la LISTE du serveur, triée comme il l’envoie', async () => {
    repondre([
      { id: 3, zone_id: 2, time: '07:00', enabled: true, days: '0,1,2,3,4', source_type: 'radio' },
      { id: 9, zone_id: 2, time: '21:31', enabled: false, days: null, source_type: 'radio' },
    ]);
    const r = await api.getAlarm(2);
    expect(r.map((a) => [a.id, a.time, a.enabled])).toEqual([[3, '07:00', true], [9, '21:31', false]]);
  });

  it('un ancien serveur qui rendrait un objet unique reste lu ; un objet vide ne fait pas de réveil', async () => {
    repondre({ id: 5, time: '06:30', enabled: true });
    expect((await api.getAlarm(1)).map((a) => a.id)).toEqual([5]);
    vi.unstubAllGlobals();
    repondre({});
    expect(await api.getAlarm(1)).toEqual([]);
  });

  it('🔴 cancelAlarm vise LE réveil : DELETE /zones/{id}/alarm/{alarm_id}', async () => {
    const appels = repondre({});
    await api.cancelAlarm(2, 9);
    expect(appels).toHaveLength(1);
    expect(appels[0].methode).toBe('DELETE');
    expect(appels[0].url).toMatch(/\/zones\/2\/alarm\/9$/);
  });
});

describe('Lecture en cours — le panneau Réveil liste les réveils de la zone', () => {
  const SOURCE = readFileSync(resolve(process.cwd(), 'src/components/partages/NowPlaying.svelte'), 'utf-8');
  const panneau = SOURCE.slice(SOURCE.indexOf('class="np-alarm-panel"'), SOURCE.indexOf('{#if showLyrics}'));

  it('🔴 l’état actif vient de la liste, plus de `r.time` lu sur un tableau', () => {
    expect(SOURCE).not.toMatch(/alarmActive\s*=\s*!!r\.time/);
    expect(SOURCE).toMatch(/alarmActive\s*=\s*alarmesZone\.some\(/);
  });

  it('chaque réveil a sa ligne et son « Annuler », qui passe son identifiant', () => {
    expect(panneau).toMatch(/\{#each alarmesZone as a \(a\.id\)\}/);
    expect(panneau).toContain('handleCancelAlarm(a.id)');
  });

  it('un lien mène à l’écran Réveils', () => {
    expect(panneau).toContain("activeView.set('alarms')");
    expect(panneau).toContain("nowplaying.alarmsSeeAll");
  });

  it.each(ONZE_LANGUES)('%s : le lien est traduit', (code) => {
    expect(dictionnaire(code)['nowplaying.alarmsSeeAll']).toBeTruthy();
  });
});
