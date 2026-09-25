// @vitest-environment jsdom
//
// Réunion du 23/09/2026 : « Album : manque le bouton "Ajouter à une
// collection" ». La fiche album (`AlbumDetailV2`) n'offrait aucun moyen de
// ranger l'album dans un dossier de « Collections ».
//
// 🔴 CES TÉMOINS MONTENT LA FICHE et cliquent : le bouton, puis une entrée
// du menu. Ils lisent ce qui part sur le réseau — `fetch` est remplacé, pas
// `api.ts` — parce que la promesse du bouton est une ROUTE :
// `POST /library/collections/{id}/albums/{album_id}`, avec l'identifiant de
// la collection MANUELLE. Deux espaces d'identifiants se recouvrent
// (`/library/collections` et `/library/smart-collections`) : la manuelle n° 4
// et l'intelligente n° 4 sont deux objets sans rapport. Le témoin sert une
// intelligente qui porte le MÊME numéro et un autre nom, et vérifie que le
// menu ne la connaît pas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { mount, unmount, flushSync } from 'svelte';
import { t } from '../i18n';
import { activeView } from '../stores/navigation';
import type { Album } from '../types';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';

class ResizeObserverInerte {
  observe() {} unobserve() {} disconnect() {}
}

const ALBUM_ID = 101;
const LOCAL = { id: ALBUM_ID, title: 'Secret Love', artist_name: 'Vincent Herring', year: 1993 } as Album;
/** Forme réelle de `GET /library/collections` (le .18, 18/09/2026). */
const MANUELLES = [
  { id: 1, name: 'favorites', album_ids: [ALBUM_ID] },
  { id: 4, name: 'Jazz', album_ids: [] },
];
/** Une INTELLIGENTE qui porte le même numéro que « Jazz » : l'autre espace. */
const INTELLIGENTES = [{ id: 4, name: 'Rock récent', rules: [] }];

const reponse = (corps: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Map([['content-type', 'application/json']]),
  json: async () => corps,
  text: async () => JSON.stringify(corps),
} as unknown as Response);
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function jusqua(condition: () => boolean, borne = 4000): Promise<void> {
  const fin = Date.now() + borne;
  for (;;) {
    flushSync();
    if (condition()) return;
    if (Date.now() >= fin) return;
    await respirer();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let manuelles: unknown[] = MANUELLES;
/** Tout ce qui est parti : méthode + URL. */
let appels: { methode: string; url: string }[] = [];

beforeEach(() => {
  appels = [];
  manuelles = MANUELLES;
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    const methode = (init?.method ?? 'GET').toUpperCase();
    appels.push({ methode, url: u });
    if (/\/library\/smart-collections/.test(u)) return reponse(INTELLIGENTES);
    if (/\/library\/collections\/\d+\/albums\/\d+/.test(u)) return reponse({ ok: true });
    if (/\/library\/collections(\?|$)/.test(u)) return reponse(manuelles);
    if (/\/library\/albums\/\d+\/tracks/.test(u)) return reponse([]);
    return reponse([]);
  }));
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  activeView.set('library');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.querySelectorAll('.coll-menu').forEach((n) => n.remove());
  vi.unstubAllGlobals();
});

function poser(props: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(AlbumDetailV2, { target: hote, props: { onClose: () => {}, ...props } as any });
  flushSync();
}

/** Le bouton, retrouvé par son libellé traduit — jamais par sa position. */
function bouton(): HTMLButtonElement | null {
  const libelle = get(t)('v2.album.addToCollection');
  return hote?.querySelector<HTMLButtonElement>(`.actions button[title="${libelle}"]`) ?? null;
}
/** Le panneau est porté à la racine du document (`use:portail`). */
const panneau = () => document.body.querySelector<HTMLElement>('.coll-menu');
const entrees = () => Array.from(panneau()?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

describe('la fiche d’un album de la bibliothèque', () => {
  it('porte le bouton, après Étiquettes', async () => {
    poser({ album: LOCAL });
    await jusqua(() => !!bouton());
    const b = bouton();
    expect(b, 'pas de bouton « Ajouter à une collection »').not.toBeNull();
    const boutons = Array.from(hote!.querySelectorAll<HTMLButtonElement>('.actions button'));
    const etiquettes = boutons.findIndex((x) => x.title === get(t)('v2.cover.tags'));
    expect(etiquettes).toBeGreaterThan(-1);
    expect(boutons.indexOf(b!)).toBe(etiquettes + 1);
  });

  it('🔴 clic ⇒ menu des MANUELLES ⇒ POST /library/collections/{id}/albums/{album_id}', async () => {
    poser({ album: LOCAL });
    await jusqua(() => !!bouton());
    bouton()!.click();
    await jusqua(() => entrees().length > 0);

    // Les deux manuelles, et « déjà » pour celle qui contient l'album.
    const libelles = entrees().map((e) => e.textContent?.trim());
    expect(libelles).toEqual([
      get(t)('v2.col.alreadyIn').replace('{name}', 'favorites'),
      get(t)('v2.col.addTo').replace('{name}', 'Jazz'),
    ]);
    // 🔴 L'intelligente n° 4 « Rock récent » n'y est pas — et sa route n'a
    //    même pas été lue.
    expect(libelles.join(' ')).not.toContain('Rock récent');
    expect(appels.some((a) => /smart-collections/.test(a.url))).toBe(false);

    entrees()[1].click();
    await jusqua(() => appels.some((a) => a.methode === 'POST'));
    const post = appels.filter((a) => a.methode === 'POST');
    expect(post).toHaveLength(1);
    expect(post[0].url).toMatch(new RegExp(`/library/collections/4/albums/${ALBUM_ID}$`));
    // Et le menu s'est refermé.
    expect(panneau()).toBeNull();
  });

  it('sans aucune collection : l’état vide, et le lien vers l’écran Collections', async () => {
    manuelles = [];
    poser({ album: LOCAL });
    await jusqua(() => !!bouton());
    bouton()!.click();
    await jusqua(() => !!panneau());
    expect(panneau()?.textContent).toContain(get(t)('v2.album.noCollection'));
    const lien = entrees()[0];
    expect(lien?.textContent?.trim()).toBe(get(t)('v2.nav.collections'));
    lien.click();
    flushSync();
    expect(get(activeView)).toBe('collections');
    expect(appels.filter((a) => a.methode === 'POST')).toHaveLength(0);
  });
});

describe('🔴 pas de bouton quand l’album n’est pas de NOTRE bibliothèque', () => {
  it('dépôt Tune distant : son `id` est celui d’un autre serveur', async () => {
    poser({ album: LOCAL, depot: { base: 'http://10.0.0.2:8080/api/v1', nom: 'Salon', hote: '10.0.0.2' } });
    await jusqua(() => (hote?.querySelectorAll('.actions button').length ?? 0) > 0);
    expect(bouton()).toBeNull();
  });

  it('album de service : pas d’identifiant local', async () => {
    poser({ album: { ...LOCAL, id: null, source: 'qobuz', source_id: 'q-1' } as any, service: 'qobuz' });
    await jusqua(() => (hote?.querySelectorAll('.actions button').length ?? 0) > 0);
    expect(bouton()).toBeNull();
  });
});
