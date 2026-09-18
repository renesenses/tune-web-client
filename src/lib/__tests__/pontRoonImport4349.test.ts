// @vitest-environment jsdom
//
// jsdom : sans `window`, `$effect` ne se déclenche pas et l'écran ne lirait
// jamais `GET /ext/pont-roon/` — un test vert qui n'aurait rien exécuté.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PontRoonV2 from '../../components/v2/PontRoonV2.svelte';

/**
 * Écran d'import du Pont Roon — renesenses/tune-server-rust#4349.
 *
 * Sandro, 17/09/2026 : l'extension était installée en v0.9.152 mais aucun
 * écran ne recevait l'archive du moissonneur. Contrat du greffon
 * (`plugins/tune-pont-roon/src/lib.rs`) :
 *
 *   GET  /api/v1/ext/pont-roon/                → {premium, dernier_rapport}
 *   POST /api/v1/ext/pont-roon/import?apercu=  → le rapport ; corps = OCTETS
 *   422  {"error":"export_pont_roon_illisible","detail":"<motif>"}
 *
 * Ce qui est gardé : l'aperçu PRÉCÈDE l'import, le bouton « Importer » est
 * éteint tant qu'aucun aperçu n'a réussi, et le motif d'un refus atteint
 * l'écran (pas le code `export_pont_roon_illisible`).
 */

const RAPPORT = {
  artistes_total: 3, artistes_apparies: 2, artistes_inconnus: ['Inconnu'],
  albums_total: 5, albums_apparies: 4, albums_inconnus: ['X'],
  pistes_total: 40, pistes_appariees: 37,
  credits_a_ecrire: 12, credits_deja_presents: 3, credits_ecrits: 0,
  images_nommees: 6, images_portees: 6,
  images_artistes_a_poser: 2, images_artistes_posees: 0,
  images_albums_a_poser: 1, images_albums_posees: 0,
  core: '10.0.0.1:9330', releve: '2026-09-17', absent_de_l_api: [], archive: true,
};

type Appel = { url: string; method: string; body: unknown; contentType?: string };
let appels: Appel[] = [];
let premium = true;
let refusApercu: { status: number; corps: unknown } | null = null;

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

beforeEach(() => {
  appels = [];
  premium = true;
  refusApercu = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const h = (init?.headers ?? {}) as Record<string, string>;
      appels.push({ url: u, method: (init?.method ?? 'GET').toUpperCase(), body: init?.body, contentType: h['Content-Type'] });
      if (u.includes('/ext/pont-roon/import')) {
        const apercu = u.includes('apercu=true');
        if (apercu && refusApercu) return reponse(refusApercu.status, refusApercu.corps);
        return reponse(200, apercu
          ? { ...RAPPORT, preview: true }
          : { ...RAPPORT, preview: false, credits_ecrits: 12, images_artistes_posees: 2, images_albums_posees: 1 });
      }
      if (u.includes('/ext/pont-roon/')) return reponse(200, { premium, dernier_rapport: null });
      return reponse(200, {});
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function laisserFaire() {
  for (let i = 0; i < 4; i++) await respirer();
  flushSync();
}

async function poserEcran(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PontRoonV2, { target: hote });
  flushSync();
  await laisserFaire();
  return hote;
}

function boutonImporter(el: HTMLElement): HTMLButtonElement {
  const b = el.querySelector('button.go') as HTMLButtonElement | null;
  expect(b, "le bouton « Importer » est absent de l'écran").not.toBeNull();
  return b!;
}

async function choisirFichier(el: HTMLElement, f: File) {
  const input = el.querySelector('input[type="file"]') as HTMLInputElement | null;
  expect(input, 'le sélecteur de fichier est absent').not.toBeNull();
  Object.defineProperty(input!, 'files', { value: [f], configurable: true });
  input!.dispatchEvent(new Event('change', { bubbles: true }));
  await laisserFaire();
}

const ARCHIVE = () => new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])], 'roon.zip', { type: 'application/zip' });

const imports = () => appels.filter((a) => a.url.includes('/ext/pont-roon/import'));

describe('Pont Roon — aperçu puis import (#4349)', () => {
  it("lit l'état du greffon à l'ouverture", async () => {
    await poserEcran();
    expect(appels.some((a) => a.method === 'GET' && /\/api\/v1\/ext\/pont-roon\/$/.test(a.url))).toBe(true);
  });

  it("l'aperçu (apercu=true) précède l'import (apercu=false), avec le corps binaire", async () => {
    const el = await poserEcran();
    const f = ARCHIVE();
    await choisirFichier(el, f);

    expect(imports().map((a) => a.url.split('?')[1])).toEqual(['apercu=true']);
    boutonImporter(el).click();
    await laisserFaire();

    const faits = imports();
    expect(faits.map((a) => a.url.split('?')[1])).toEqual(['apercu=true', 'apercu=false']);
    for (const a of faits) {
      expect(a.method).toBe('POST');
      expect(a.contentType).toBe('application/octet-stream');
      expect(a.body, 'le corps doit être le fichier lui-même, pas du JSON ni du multipart').toBe(f);
    }
    expect(el.querySelector('.rap.final'), 'le rapport final doit s’afficher').not.toBeNull();
  });

  it("« Importer » est éteint avant tout aperçu, et le reste si l'aperçu échoue", async () => {
    refusApercu = { status: 422, corps: { error: 'export_pont_roon_illisible', detail: "ce n'est pas un export du moissonneur" } };
    const el = await poserEcran();
    expect(boutonImporter(el).disabled, 'sans fichier ni aperçu, le bouton doit être éteint').toBe(true);

    await choisirFichier(el, ARCHIVE());
    expect(boutonImporter(el).disabled, 'après un aperçu refusé, le bouton doit rester éteint').toBe(true);
    boutonImporter(el).click();
    await laisserFaire();
    expect(imports().map((a) => a.url.split('?')[1])).toEqual(['apercu=true']);
  });

  it('le motif du refus serveur est affiché, pas son code', async () => {
    refusApercu = { status: 422, corps: { error: 'export_pont_roon_illisible', detail: "ce n'est pas un export du moissonneur" } };
    const el = await poserEcran();
    await choisirFichier(el, ARCHIVE());
    const err = el.querySelector('.err');
    expect(err?.textContent).toContain("ce n'est pas un export du moissonneur");
  });

  it('sans Premium : le message, et aucun sélecteur', async () => {
    premium = false;
    const el = await poserEcran();
    expect(el.querySelector('.premium')).not.toBeNull();
    expect(el.querySelector('input[type="file"]')).toBeNull();
    expect(el.querySelector('button.go')).toBeNull();
  });
});
