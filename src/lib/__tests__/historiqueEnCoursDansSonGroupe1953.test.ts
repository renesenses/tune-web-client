// @vitest-environment jsdom
//
// Fil forum 1953 — FabienM, v0.9.165 :
//
//   « Quand je lis un album ou une playlist, l'album ou la playlist apparaît
//     bien dans l'historique (avec le + pour voir les titres déjà joués et le
//     titre en cours : très bien), mais je vois également le titre en cours
//     en 1re ligne, au-dessus de l'album : il ne devrait pas apparaître. Seul
//     l'album doit apparaître. »
//
// ## La cause
//
// L'écran fusionne DEUX historiques (`fusionnerHistorique`) :
//
//  - le magasin local `stores/history`, alimenté au `playback.started` depuis
//    la piste de l'ÉVÉNEMENT (#1010, v0.9.164) — il ne porte JAMAIS de
//    contexte ;
//  - `/library/history`, qui note la MÊME écoute avec `context_type = 'album'`
//    (ou `playlist`) et `context_id`.
//
// Les deux lignes avaient des clés différentes (`piste@` contre
// `piste@album`) et des horloges différentes : aucune déduplication ne les
// rapprochait. La locale sortait donc en ligne plate au-dessus du groupe qui
// contient déjà le titre — la capture de Fabien : « Bonbon » (HI-RES, la
// fiche technique du `NowPlaying`) au-dessus de l'album « Floating ».
//
// ## La mesure
//
// Le vrai écran est monté, avec la réponse de `/library/history` telle que la
// sert le serveur pour un album Qobuz (mesurée sur le .18 : `track_id` nul,
// `source_id` en chaîne, `context_type`/`context_id`) et l'écoute en cours
// notée comme `v2Live` la note. Les groupes sont REPLIÉS par défaut : un titre
// qui ne vit que dans son groupe n'a donc AUCUNE raison d'être visible.
//
// 🔴 Contre-épreuves dans le même fichier : une écoute locale que le serveur
// ne connaît pas (radio) reste affichée, et une écoute locale ANCIENNE du même
// titre, sans contexte, aussi — l'effacement ne vaut que pour la même écoute.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import HistoriqueV2 from '../../components/v2/HistoriqueV2.svelte';
import { playbackHistory } from '../stores/history';
import { entreesDepuisServeur, fusionnerHistorique } from '../historiqueLecture';
import { locale } from '../i18n';
import type { Track } from '../types';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const ilYA = (ms: number) => new Date(Date.now() - ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Une ligne de `/library/history` pour un titre Qobuz lancé depuis un objet. */
function ligneServeur(
  titre: string, sourceId: string, depuisMs: number,
  ctx: { type: 'album' | 'playlist'; id: string; nom: string; position: number },
) {
  return {
    id: Number(sourceId),
    track_id: null,
    title: titre,
    artist_name: 'Emile Parisien',
    album_title: 'Floating',
    source: 'qobuz',
    source_id: sourceId,
    album_id: null,
    cover_url: null,
    duration_ms: 314_000,
    listened_at: ilYA(depuisMs),
    zone_id: 3,
    context_type: ctx.type,
    context_id: ctx.id,
    context_position: ctx.position,
    context_name: ctx.nom,
    context_source: null,
  };
}

/**
 * L'écoute EN COURS telle que `v2Live` la note : `nowPlayingToTrack` sur le
 * `NowPlaying` de l'événement — `id` nul pour un titre de service, la fiche
 * technique en plus, et aucun contexte.
 */
function enCours(titre: string, sourceId: string, source = 'qobuz'): Track {
  return {
    id: null,
    track_id: null,
    title: titre,
    artist_name: 'Emile Parisien',
    album_title: 'Floating',
    source,
    source_id: sourceId,
    duration_ms: 314_000,
    format: 'FLAC',
    sample_rate: 88_200,
    bit_depth: 24,
  } as unknown as Track;
}

let lignes: unknown[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

async function poserEcran(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(HistoriqueV2, { target: hote });
  for (let i = 0; i < 20; i++) await respirer();
  flushSync();
  return hote;
}

/** Les titres visibles HORS de tout groupe, écran replié. */
function titresVisibles(racine: HTMLElement): string[] {
  const texte = racine.querySelector('.list')?.textContent ?? '';
  return ['Bonbon', 'Asian Songs', 'Le Flibustier', 'Ne me quitte pas'].filter((t) => texte.includes(t));
}

beforeEach(() => {
  locale.set('fr');
  playbackHistory.clear();
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    const corps = url.includes('/library/history') ? { items: lignes, total: lignes.length } : [];
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps,
      text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  playbackHistory.clear();
  vi.unstubAllGlobals();
});

const ALBUM = { type: 'album' as const, id: '0602455231234', nom: 'Floating' };
const PLAYLIST = { type: 'playlist' as const, id: '2340426', nom: 'Jazz du matin' };

describe('fil 1953 — le titre en cours ne vit QUE dans le groupe de son album ou de sa playlist', () => {
  it('🔴 album Qobuz : « Bonbon » en cours n’apparaît pas au-dessus de l’album', async () => {
    lignes = [
      ligneServeur('Bonbon', '9001', 3_000, { ...ALBUM, position: 1 }),
      ligneServeur('Asian Songs & Rhapsodies', '9000', 300_000, { ...ALBUM, position: 0 }),
    ];
    playbackHistory.add(enCours('Bonbon', '9001'), 'Enfants');
    const racine = await poserEcran();
    expect(racine.querySelectorAll('button.objet').length, 'le groupe de l’album manque').toBe(1);
    expect(titresVisibles(racine), 'un titre de l’album sort de son groupe replié').toEqual([]);
  });

  it('🔴 playlist Qobuz : le titre en cours n’apparaît pas au-dessus de la playlist', async () => {
    lignes = [
      ligneServeur('Le Flibustier', '7702', 2_000, { ...PLAYLIST, position: 4 }),
      ligneServeur('Bonbon', '9001', 400_000, { ...PLAYLIST, position: 3 }),
    ];
    playbackHistory.add(enCours('Le Flibustier', '7702'), 'Salon');
    const racine = await poserEcran();
    expect(racine.querySelectorAll('button.objet').length, 'le groupe de la playlist manque').toBe(1);
    expect(titresVisibles(racine), 'un titre de la playlist sort de son groupe replié').toEqual([]);
  });

  it('TÉMOIN — une écoute locale que le serveur ne connaît pas reste affichée', async () => {
    lignes = [ligneServeur('Bonbon', '9001', 3_000, { ...ALBUM, position: 1 })];
    playbackHistory.add(
      { ...enCours('Ne me quitte pas', 'fip', 'radio'), artist_name: 'Brel' } as Track,
      'Salon',
    );
    const racine = await poserEcran();
    expect(titresVisibles(racine)).toEqual(['Ne me quitte pas']);
  });

  it('TÉMOIN — une écoute locale ANCIENNE du même titre, sans contexte, reste une ligne', () => {
    // Écoutée seule il y a trois heures, bien avant l'album d'aujourd'hui :
    // ce n'est pas la même écoute, elle garde sa ligne.
    const fusion = fusionnerHistorique(
      [{ track: enCours('Bonbon', '9001'), playedAt: ilYA(3 * 3_600_000), zoneName: 'Salon' }],
      entreesDepuisServeur([ligneServeur('Bonbon', '9001', 3_000, { ...ALBUM, position: 1 })]),
    );
    expect(fusion.map((x) => x.contexte?.type ?? null)).toEqual(['album', null]);
  });
});
