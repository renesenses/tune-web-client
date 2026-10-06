// @vitest-environment jsdom
//
// 05/10/2026 — « modifications tenues » : une correction faite dans Tune est
// conservée par le serveur à chaque analyse (`GET /library/tracks/{id}/tenues`).
// Le tiroir des balises la montre, et « Rétablir depuis le fichier »
// (`DELETE …/tenues`) rend la main aux balises.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import TrackTagsDrawer from '../../components/partages/TrackTagsDrawer.svelte';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let tenus: string[] = [];
const appels: string[] = [];

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

beforeEach(() => {
  tenus = ['genre', 'year'];
  appels.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const methode = init?.method ?? 'GET';
    appels.push(`${methode} ${u}`);
    const ok = (corps: unknown) =>
      new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (/\/tracks\/7\/tenues$/.test(u)) {
      if (methode === 'DELETE') {
        tenus = [];
        return ok({ status: 'ok', track_id: 7 });
      }
      return ok({ track_id: 7, fields: tenus });
    }
    if (/\/tracks\/7\/all-tags$/.test(u)) {
      return ok({ track_id: 7, db_fields: { title: 'Piste', genre: 'Jazz', year: 1999 }, file_tags: {}, file_exists: true });
    }
    return ok({});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('champs tenus dans le tiroir des balises', () => {
  it('les libellés existent dans les onze langues', () => {
    for (const code of ONZE_LANGUES) {
      const d = dictionnaire(code);
      for (const cle of ['trackTags.heldFields', 'trackTags.restoreFromFile', 'trackTags.restoredFromFile']) {
        expect(d[cle], `${code} : ${cle}`).toBeTruthy();
      }
      expect(d['trackTags.heldFields']).toContain('{fields}');
    }
  });

  it('montre les champs tenus et « Rétablir depuis le fichier » envoie DELETE …/tenues', { timeout: 30_000 }, async () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(TrackTagsDrawer, { target: hote, props: { trackId: 7, onClose: () => {} } });
    await attendre();
    const bloc = hote.querySelector('[data-champs-tenus]');
    expect(bloc, 'aucun bloc des champs tenus').not.toBeNull();
    expect(bloc!.textContent).toContain(fr['trackTags.heldFields'].replace('{fields}', 'genre, year'));
    const bouton = [...bloc!.querySelectorAll('button')].find(
      (b) => (b.textContent ?? '').trim() === fr['trackTags.restoreFromFile'],
    );
    expect(bouton).toBeDefined();
    bouton!.click();
    await attendre();
    expect(appels.some((a) => /^DELETE .*\/tracks\/7\/tenues$/.test(a))).toBe(true);
    expect(hote.querySelector('[data-champs-tenus]'), 'le bloc reste après rétablissement').toBeNull();
  });

  it('aucun champ tenu : aucun bloc', { timeout: 30_000 }, async () => {
    tenus = [];
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(TrackTagsDrawer, { target: hote, props: { trackId: 7, onClose: () => {} } });
    await attendre();
    expect(hote.querySelector('[data-champs-tenus]')).toBeNull();
  });
});
