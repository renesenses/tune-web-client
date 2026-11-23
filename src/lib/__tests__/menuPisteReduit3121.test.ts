// @vitest-environment jsdom
//
// web#3121 (FabienM, fil 2864 ; go de Bertrand du 16/11/2026) — sur toutes
// les lignes de piste, la barre ne garde que Lire, Lire à partir d'ici, le
// cœur et le « … ». Lire ensuite, Ajouter à la file, Ajouter à une playlist
// et Étiquettes passent au menu « … ». L'ancienne option « icônes réduites »
// (#1892, Sandro, fil 2114) devient la seule forme : le réglage disparaît.
//
// Et « Lire » ne joue QUE ce morceau, même sur un album ou une playlist
// (il rejouait la liste à partir de la ligne depuis #2467) ; « Lire à partir
// d'ici » garde le geste de chaque écran.
//
// Contre-épreuve : `PisteActions.svelte` et `ListePistesV2.svelte` remis à
// `origin/main` font rougir les témoins de barre (huit cases) et de lecture
// (`onLire` appelé, aucun `track_id` seul envoyé).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PisteActions from '../../components/v2/PisteActions.svelte';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { currentZoneId } from '../stores/zones';
import { t } from '../i18n';
import { ACTIONS_MASQUABLES } from '../actionsRapides';
import { entreesMenuPiste } from '../menuPiste';

vi.setConfig({ testTimeout: 30_000 });

const LOCALE = { id: 42, title: 'Chanson', artist_name: 'Artiste', album_id: 7, artist_id: 3, duration_ms: 200000, source: 'local' };

const hotes: HTMLDivElement[] = [];
const montes: Record<string, any>[] = [];
function poser(composant: any, props: Record<string, unknown>): HTMLElement {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  hotes.push(hote);
  montes.push(mount(composant, { target: hote, props: props as any }));
  flushSync();
  return hote;
}
const cases = (b: HTMLElement) => Array.from(b.children) as HTMLElement[];
const tr = (k: string) => get(t)(k as any);

let requetes: { url: string; method: string; body: any }[] = [];
beforeEach(() => {
  requetes = [];
  currentZoneId.set(1);
  vi.stubGlobal('fetch', vi.fn(async (input: any, init?: RequestInit) => {
    let body: any = null;
    if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    requetes.push({ url: String(input), method: (init?.method ?? 'GET').toUpperCase(), body });
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => {
  for (const m of montes.splice(0)) unmount(m);
  for (const h of hotes.splice(0)) h.remove();
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});
const respirer = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
const lectures = () => requetes.filter((r) => r.method === 'POST' && /\/zones\/1\/play(\?|$)/.test(r.url));

describe('web#3121 — la barre d’une ligne de piste', () => {
  // 🔄 Fil forum 3009 (FabienM, points 2 et 3 ; go du 23/11/2026) — « Lire à
  // partir d'ici » quitte la barre pour le menu « … » : TROIS cases.
  it('TROIS cases : Lire, le cœur, le « … » (fil 3009)', () => {
    const b = poser(PisteActions, { piste: LOCALE, onLireDepuis: () => {} }).querySelector<HTMLElement>('.pactions')!;
    expect(cases(b).map((el) => el.getAttribute('aria-label'))).toEqual([
      tr('v2.pa.play'), tr('v2.pa.fav'), tr('library.moreOptions'),
    ]);
    expect(cases(b).some((el) => el.classList.contains('vide'))).toBe(false);
  });

  it('Lire ensuite, file, playlist et étiquettes ne sont plus dans la barre…', () => {
    const b = poser(PisteActions, { piste: LOCALE, onLireDepuis: () => {} });
    const l = Array.from(b.querySelectorAll('.pactions button')).map((x) => x.getAttribute('aria-label'));
    for (const k of ['v2.pa.next', 'v2.pa.queue', 'v2.pa.playlist', 'v2.cover.tags']) {
      expect(l, `${k} est encore dans la barre`).not.toContain(tr(k));
    }
  });

  it('… mais restent au menu « … »', () => {
    const fait = () => {};
    const cles = entreesMenuPiste(
      { jouable: true, idBibliotheque: 42, artistId: 3, albumId: 7 },
      { lire: fait, ensuite: fait, aLaFile: fait, ajouterAPlaylist: fait, etiqueter: fait },
    ).map((e) => e.cle);
    for (const k of ACTIONS_MASQUABLES) expect(cles, k).toContain(k);
  });

  it('un geste absent garde sa case, vide (fil 1906) : trois cases toujours', () => {
    // Une piste qu'on ne sait pas désigner : ses trois cases restent, vides.
    const b = poser(PisteActions, { piste: { id: null, title: 'Sans rien', source: 'qobuz', source_id: null } })
      .querySelector<HTMLElement>('.pactions')!;
    expect(cases(b)).toHaveLength(3);
    expect(cases(b).every((el) => el.classList.contains('vide'))).toBe(true);
  });
});

describe('web#3121 — « Lire » ne joue que ce morceau', () => {
  const PISTES = [
    { ...LOCALE, id: 41, title: 'Un', track_number: 1 },
    { ...LOCALE, id: 42, title: 'Deux', track_number: 2 },
    { ...LOCALE, id: 43, title: 'Trois', track_number: 3 },
  ];
  const contexte = { context_type: 'album', context_id: '7', context_source: 'local' };

  it('sur un album : le seul titre, avec son origine ; ni la liste de l’écran, ni `onLire`', async () => {
    const onLire = vi.fn();
    const onLireDepuis = vi.fn();
    const h = poser(ListePistesV2, { pistes: PISTES, contexte, onLire, onLireDepuis });
    const ligne = h.querySelectorAll<HTMLElement>('.trow')[1];
    ligne.querySelector<HTMLButtonElement>(`.pactions button[aria-label="${tr('v2.pa.play')}"]`)!.click();
    await respirer();
    expect(onLire).not.toHaveBeenCalled();
    expect(onLireDepuis).not.toHaveBeenCalled();
    expect(lectures()).toHaveLength(1);
    const corps = lectures()[0].body;
    // `track_ids` + `start_index`, PAS `{track_id}` nu : une demande nue garde
    // la file si la piste y est déjà et la suite de l'album continue
    // (serveur #2876/#4298). Une liste remplace la file par ce seul titre.
    expect(corps.track_ids).toEqual([42]);
    expect(corps.start_index).toBe(0);
    expect(corps.track_id).toBeUndefined();
    // L'origine reste jointe (reprise de lecture, #2467).
    expect(corps).toEqual(expect.objectContaining(contexte));
  });

  it('un titre de SERVICE : `queue_follows`, pour que le serveur ne joue pas son album (#5372/#6469)', async () => {
    const qobuz = { id: null, title: 'Titre Q', artist_name: 'A', source: 'qobuz', source_id: 'q42', duration_ms: 1000 };
    const b = poser(PisteActions, { piste: qobuz, onLireDepuis: () => {} });
    b.querySelector<HTMLButtonElement>(`.pactions button[aria-label="${tr('v2.pa.play')}"]`)!.click();
    await respirer();
    expect(lectures()).toHaveLength(1);
    expect(lectures()[0].body).toEqual(expect.objectContaining({ source: 'qobuz', source_id: 'q42', queue_follows: true }));
  });

  it('`onLire` fourni par l’écran (la File) : Lire le suit, aucun /play envoyé', async () => {
    const onLire = vi.fn();
    const qobuz = { id: null, title: 'Titre Q', artist_name: 'A', source: 'qobuz', source_id: 'q42', duration_ms: 1000 };
    const b = poser(PisteActions, { piste: qobuz, onLire, onLireDepuis: () => {} });
    b.querySelector<HTMLButtonElement>(`.pactions button[aria-label="${tr('v2.pa.play')}"]`)!.click();
    await respirer();
    expect(onLire).toHaveBeenCalledTimes(1);
    expect(lectures()).toHaveLength(0);
  });

  it('« Lire à partir d’ici » garde le geste de l’écran', async () => {
    const onLireDepuis = vi.fn();
    const h = poser(ListePistesV2, { pistes: PISTES, contexte, onLire: () => {}, onLireDepuis });
    // Fil forum 3009 — par le menu « … » de la ligne, plus par la barre.
    h.querySelectorAll<HTMLElement>('.trow')[1].querySelector<HTMLButtonElement>('.pactions button[aria-haspopup="menu"]')!.click();
    flushSync();
    [...document.querySelectorAll<HTMLButtonElement>('.menu button.item')]
      .find((b) => b.textContent?.trim() === tr('common.playFromHere'))!.click();
    await respirer();
    expect(onLireDepuis).toHaveBeenCalledTimes(1);
    expect(onLireDepuis.mock.calls[0][1]).toBe(1);
  });
});

describe('web#3121 — l’ancien réglage « icônes réduites » a disparu', () => {
  const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
  it('ni dans les Réglages, ni dans les préférences, ni dans l’index de recherche des réglages', () => {
    expect(lire('src/components/v2/SettingsV2.svelte')).not.toContain('v2ActionsReduites');
    expect(lire('src/lib/stores/preferences.ts')).not.toContain('v2ActionsReduites');
    expect(lire('src/lib/reglagesIndex.ts')).not.toContain('actions-piste-reduites');
  });
});
