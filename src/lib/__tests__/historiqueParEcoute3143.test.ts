// @vitest-environment jsdom
//
// web#3143 — l'Historique, une ligne par TITRE ou une ligne par ÉCOUTE.
//
// FabienM (fil 2637, point 7) : « je joue titre A puis titre B […] si je
// rejoue titre A, le 1er titre A disparaît de l'historique ». C'était voulu
// (Elie : une ligne par titre). Décision de Bertrand du 17/11/2026 : un
// réglage dans Réglages › Affichage, le défaut ne bouge pas.
//
// Le serveur garde chaque écoute (`GET /library/history` : une ligne par
// lecture, sans `GROUP BY`, vérifié au tag v1.0.0-rc12) : seul l'affichage
// web regroupait. Ce témoin tient les deux modes sur la fonction ET sur
// l'écran monté, avec la contre-épreuve à chaque fois : le mode par défaut
// replie toujours A / B / A en deux lignes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import HistoriqueV2 from '../../components/v2/HistoriqueV2.svelte';
import { playbackHistory, type HistoryEntry } from '../stores/history';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';
import { fusionnerHistorique, entreesDepuisServeur } from '../historiqueLecture';
import { MODE_HISTORIQUE_DEFAUT, estModeHistorique, heureDEcoute } from '../modeHistorique';
import { REGLAGES } from '../reglagesIndex';

vi.setConfig({ testTimeout: 60_000 });

/** A à 10 h, B à 10 h 05, A rejoué à 10 h 10 — le scénario de FabienM. */
const SERVEUR_ABA = [
  { id: 3, track_id: 1, title: 'Titre A', artist_name: 'X', source: 'local', duration_ms: 180_000, listened_at: '2026-11-17T10:10:00Z', zone_id: 1 },
  { id: 2, track_id: 2, title: 'Titre B', artist_name: 'X', source: 'local', duration_ms: 180_000, listened_at: '2026-11-17T10:05:00Z', zone_id: 1 },
  { id: 1, track_id: 1, title: 'Titre A', artist_name: 'X', source: 'local', duration_ms: 180_000, listened_at: '2026-11-17T10:00:00Z', zone_id: 1 },
];

function local(id: number, title: string, playedAt: string): HistoryEntry {
  return {
    track: { id, title, artist_name: 'X', source: 'local', duration_ms: 180_000 } as any,
    playedAt,
    zoneId: 1,
    zoneName: 'Salon',
  } as HistoryEntry;
}

describe('web#3143 — fusionnerHistorique selon le mode', () => {
  const serveur = entreesDepuisServeur(SERVEUR_ABA);

  it('contre-épreuve : par défaut (une ligne par titre), A / B / A donne deux lignes', () => {
    const r = fusionnerHistorique([], serveur);
    expect(r.map((e) => e.track.title)).toEqual(['Titre A', 'Titre B']);
    expect(fusionnerHistorique([], serveur, 'titre')).toEqual(r);
  });

  it('une ligne par écoute : A / B / A donne trois lignes, de la plus récente à la plus ancienne', () => {
    const r = fusionnerHistorique([], serveur, 'ecoute');
    expect(r.map((e) => `${e.track.title}@${e.playedAt}`)).toEqual([
      'Titre A@2026-11-17T10:10:00Z',
      'Titre B@2026-11-17T10:05:00Z',
      'Titre A@2026-11-17T10:00:00Z',
    ]);
  });

  it("la même écoute vue par le navigateur et par le serveur (horloges décalées) n'a qu'une ligne", () => {
    // Le navigateur note 20 s après le serveur : ni le titre + instant exact, ni
    // le repli par titre (absent dans ce mode) ne les rapprochaient.
    const locales = [
      local(1, 'Titre A', '2026-11-17T10:10:20Z'),
      local(2, 'Titre B', '2026-11-17T10:05:20Z'),
      local(1, 'Titre A', '2026-11-17T10:00:20Z'),
    ];
    const r = fusionnerHistorique(locales, serveur, 'ecoute');
    expect(r).toHaveLength(3);
    expect(r.map((e) => e.track.title)).toEqual(['Titre A', 'Titre B', 'Titre A']);
  });

  it("chaque écoute du serveur n'absorbe qu'une écoute locale : un titre rejoué aussitôt garde ses deux lignes", () => {
    const serv = entreesDepuisServeur([SERVEUR_ABA[0]]);
    const locales = [local(1, 'Titre A', '2026-11-17T10:10:05Z'), local(1, 'Titre A', '2026-11-17T10:13:10Z')];
    const r = fusionnerHistorique(locales, serv, 'ecoute');
    expect(r).toHaveLength(2);
    // Contre-épreuve : en mode titre, le même lot n'a qu'une ligne.
    expect(fusionnerHistorique(locales, serv, 'titre')).toHaveLength(1);
  });

  it('une écoute locale que le serveur ignore (radio, titre non rattaché) reste', () => {
    const r = fusionnerHistorique([local(9, 'Titre Z', '2026-11-17T11:00:00Z')], serveur, 'ecoute');
    expect(r.map((e) => e.track.title)).toEqual(['Titre Z', 'Titre A', 'Titre B', 'Titre A']);
  });
});

describe('web#3143 — le réglage', () => {
  it('le défaut est « une ligne par titre », et une valeur inconnue y retombe', () => {
    expect(MODE_HISTORIQUE_DEFAUT).toBe('titre');
    expect(estModeHistorique('ecoute')).toBe(true);
    expect(estModeHistorique('titre')).toBe(true);
    expect(estModeHistorique('lignes')).toBe(false);
    expect(estModeHistorique(undefined)).toBe(false);
  });

  it('est indexé dans Réglages › Affichage', () => {
    const r = REGLAGES.find((x) => x.id === 'historique-lignes');
    expect(r?.section).toBe('displayPrefs');
  });

  it("l'heure : seule le jour même, avec le jour sinon ; vide si illisible", () => {
    const maintenant = new Date(2026, 10, 17, 18, 0);
    const meme = heureDEcoute(new Date(2026, 10, 17, 9, 7).toISOString(), maintenant, 'fr');
    expect(meme).toMatch(/09.07/);
    expect(meme).not.toMatch(/nov/i);
    const veille = heureDEcoute(new Date(2026, 10, 16, 9, 7).toISOString(), maintenant, 'fr');
    expect(veille).toMatch(/16/);
    expect(veille).toMatch(/09.07/);
    expect(heureDEcoute('pas une date', maintenant, 'fr')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// L'écran monté
// ---------------------------------------------------------------------------
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
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

describe("web#3143 — l'écran Historique suit le réglage", () => {
  let avant: string;
  beforeEach(() => {
    avant = get(preferences).historiqueLignes;
    locale.set('fr');
    playbackHistory.clear();
    vi.stubGlobal('ResizeObserver', ObservateurInerte);
    vi.stubGlobal('IntersectionObserver', ObservateurInerte);
    vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
      const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
      const corps = url.includes('/library/history') ? { items: SERVEUR_ABA, total: 3 } : [];
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
    preferences.update((p) => ({ ...p, historiqueLignes: avant as any }));
    playbackHistory.clear();
    vi.unstubAllGlobals();
  });

  it('contre-épreuve : par défaut, deux lignes et aucune heure', async () => {
    preferences.update((p) => ({ ...p, historiqueLignes: 'titre' }));
    const ecran = await poserEcran();
    expect(ecran.querySelectorAll('.quand .when')).toHaveLength(2);
    expect(ecran.querySelectorAll('[data-heure-ecoute]')).toHaveLength(0);
  });

  it('une ligne par écoute : trois lignes, chacune avec son heure', async () => {
    preferences.update((p) => ({ ...p, historiqueLignes: 'ecoute' }));
    const ecran = await poserEcran();
    const heures = [...ecran.querySelectorAll('[data-heure-ecoute]')];
    expect(heures).toHaveLength(3);
    for (const h of heures) expect(h.textContent?.trim()).toMatch(/\d{1,2}.\d{2}/);
    // L'infobulle garde le « il y a… ».
    expect(heures[0].getAttribute('title')).toBeTruthy();
  });
});
