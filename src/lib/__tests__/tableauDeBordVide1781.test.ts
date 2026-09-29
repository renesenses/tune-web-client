// @vitest-environment jsdom
//
// #1781 — Tableau de bord, bloc « Ce jour-là » vide : « No listening history
// yet » alors que la Tendance compte 108 écoutes (Levente, fil 1994, reliquat
// de #1671).
//
// ## Le défaut
//
// Huit blocs partageaient `dashboard.empty` (« Pas encore d'historique
// d'écoute »). Cette phrase n'est vraie que si l'historique est vide DE TOUT
// TEMPS. Or :
//
//  - « Ce jour-là » lit la même date les ANNÉES D'AVANT : vide dès que
//    l'historique a moins d'un an ;
//  - Jour × heure, Heures, Albums, Titres, Genres, Zones, Sources et
//    Complétion lisent les SEPT derniers jours (`PERIODE`) : vides après une
//    semaine sans écoute, quel que soit l'historique plus ancien.
//
// Ils mentaient donc. Deux restent justes et gardent `dashboard.empty` :
//
//  - Série : le serveur calcule `streak` sur TOUT l'historique, et
//    `record = 0` n'arrive que quand `listen_history` est vide ;
//  - Tendance : `joursPleins` rend toujours sept jours, le message vide n'est
//    jamais atteint.
//
// ## Ce que ce témoin fait
//
// Il nourrit le VRAI catalogue d'une réponse `/dashboard` qui ressemble à
// celle d'un utilisateur au long historique mais sans écoute cette semaine
// (`streak.best = 12`, tout le reste vide), passe chaque bloc par SON
// `donnees`, monte SON composant, et lit le texte affiché.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import * as api from '../api';
import { BLOCS_TABLEAU_DE_BORD, PERIODE } from '../tableauDeBordWidgets';
import { dictionnaire } from './onzeDictionnaires';

const FR = dictionnaire('fr') as Record<string, string>;

const SEMAINE_VIDE_HISTORIQUE_ANCIEN = {
  period: '7d',
  range: { from: '2026-09-22T00:00:00', to: '2026-09-29T12:00:00' },
  totals: { plays: 0, listening_ms: 0, unique_tracks: 0, unique_artists: 0 },
  top_artists: [],
  top_albums: [],
  top_tracks: [],
  trend: [],
  hourly: [],
  by_zone: [],
  by_source: [],
  completion: { completed: 0, skipped: 0, avg_listened_ms: 0, avg_track_duration_ms: 0 },
  by_genre: [],
  weekday_hourly: [],
  streak: { current: 0, best: 12, last_day: '2026-08-14' },
  on_this_day: [],
};

const PERIODIQUES = [
  'tdb-semaine-heures',
  'tdb-heures',
  'tdb-top-albums',
  'tdb-top-titres',
  'tdb-genres',
  'tdb-zones',
  'tdb-sources',
  'tdb-completion',
];

let monte: Record<string, any> | null = null;
let hote: HTMLDivElement | null = null;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'getDashboard').mockResolvedValue(SEMAINE_VIDE_HISTORIQUE_ANCIEN as any);
  vi.spyOn(api, 'getGenreTree').mockResolvedValue({ tree: {} } as any);
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.restoreAllMocks();
});

async function texteDuBloc(id: string, reponse: any = SEMAINE_VIDE_HISTORIQUE_ANCIEN): Promise<string> {
  vi.mocked(api.getDashboard).mockResolvedValue(reponse);
  const w = BLOCS_TABLEAU_DE_BORD.find((x) => x.id === id);
  if (!w?.bloc) throw new Error(`bloc ${id} absent du catalogue`);
  const donnees = await w.bloc.donnees({ langue: 'fr' } as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(w.bloc.composant as any, { target: hote, props: { donnees } });
  flushSync();
  return (hote.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('#1781 — chaque bloc vide dit la vérité sur SON contenu', () => {
  it('« Ce jour-là » vide dit « rien à cette date les années précédentes », pas « aucun historique »', async () => {
    const txt = await texteDuBloc('tdb-ce-jour-la');
    expect(txt).toBe(FR['dashboard.onThisDayEmpty']);
    expect(txt).not.toContain(FR['dashboard.empty']);
  });

  it.each(PERIODIQUES)('%s, semaine vide : il nomme les 7 derniers jours au lieu de nier tout historique', async (id) => {
    const txt = await texteDuBloc(id);
    expect(txt).toBe(FR['dashboard.emptyLast7Days']);
    expect(txt).not.toContain(FR['dashboard.empty']);
  });

  it('le texte « 7 derniers jours » est vrai : le catalogue interroge bien la période 7d', async () => {
    expect(PERIODE).toBe('7d');
    await texteDuBloc('tdb-heures');
    expect(vi.mocked(api.getDashboard).mock.calls.every((c) => c[0] === '7d')).toBe(true);
  });

  it('Série garde « aucun historique » : il ne s\'affiche que si le serveur n\'a AUCUNE écoute', async () => {
    const txt = await texteDuBloc('tdb-serie', { ...SEMAINE_VIDE_HISTORIQUE_ANCIEN, streak: null });
    expect(txt).toBe(FR['dashboard.empty']);
    // Historique ancien : le record s'affiche, pas le message vide.
    const ancien = await (async () => {
      unmount(monte!); monte = null; hote?.remove();
      return texteDuBloc('tdb-serie');
    })();
    expect(ancien).not.toContain(FR['dashboard.empty']);
    expect(ancien).toContain('12');
  });

  it('Tendance ne montre jamais le message vide : ses sept jours sont toujours là', async () => {
    const txt = await texteDuBloc('tdb-tendance');
    expect(txt).not.toContain(FR['dashboard.empty']);
    expect(hote!.querySelectorAll('.barre').length).toBe(7);
  });

  it('les deux nouveaux messages existent dans les onze langues', async () => {
    const { ONZE_LANGUES } = await import('./onzeDictionnaires');
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l) as Record<string, string>;
      expect(d['dashboard.onThisDayEmpty'], l).toBeTruthy();
      expect(d['dashboard.emptyLast7Days'], l).toBeTruthy();
    }
  });
});
