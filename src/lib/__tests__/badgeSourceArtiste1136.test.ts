// @vitest-environment jsdom
//
// renesenses/tune-web-client#1136 — FabienM, fil forum 1761 (11/09/2026),
// v0.9.145, point 1 :
//
//   « La recherche d'artistes retourne des vignettes d'artistes avec des
//     labels sur la source. Les sources streaming sont bien indiquées mais pas
//     les artistes de la bibliothèque. Rajouter le label local pour ces
//     derniers. »
//
// Sa capture : la carte « Meilleur résultat » = artiste Pink Floyd, SANS aucun
// badge ; à droite les vignettes de service qui en portent un.
//
// ══════════════════════════════════════════════════════════════════════════
// 🔴 LE PIÈGE DE CE TICKET, ET POURQUOI CE FICHIER EST ÉCRIT AINSI.
//
// Une garde naïve — « chaque vignette porte un badge », cherché n'importe où
// dans la tuile — est VERTE AVANT TOUT CORRECTIF pour les tuiles de service :
// `AlbumArt` pose déjà une incrustation sur la pochette
// (`AlbumArt.svelte:77`). Elle ne rougirait que sur la ligne locale, et encore
// : un `?? 'local'` mal placé la ferait passer. Elle ne mesure donc pas ce qui
// est demandé.
//
// D'où deux exigences, et la seconde est la vraie :
//
//   1. la ligne de BIBLIOTHÈQUE porte un badge `LOCAL` — le point 1 du fil ;
//   2. le badge est un enfant de `.asrc` / `.bsrc`, c'est-à-dire HORS de la
//      pochette (`.acv` / `.bcv`) — comme l'ancienne interface le fait déjà
//      (`SearchView.svelte:1244-1252`, `_sources` rendu sous la vignette), et
//      comme #1129 vient de le trancher pour la section Titres.
//
// La dernière assertion de ce fichier MESURE le piège : elle prouve qu'une
// garde naïve serait verte sur les tuiles de service avant correctif. Un rouge
// qui ne vient pas est un résultat ; celui-là, on le nomme.
//
// 🔴 `AlbumArt` n'est PAS touché. Sa condition `source !== 'local'` est
// partagée par ~18 sites d'appel : la lever peindrait `LOCAL` partout, y
// compris sur des écrans où tout est local par construction. C'est le motif
// de #1129, repris tel quel.
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import SearchV2 from '../../components/v2/SearchV2.svelte';
// #1326 / #1333 — un composant se prend à la COLLECTE, jamais par `await
// import()` dans un cas : la compilation quitte le chronomètre du cas.
import ServiceBadge from '../../components/partages/ServiceBadge.svelte';
import { setSearchCriteria } from '../stores/shortcuts';
import { preferences } from '../stores/preferences';

vi.setConfig({ testTimeout: 30_000 });

const REQUETE = 'Pink Floyd';

const vide = { artists: [], albums: [], tracks: [], playlists: [] };

/** Quatre artistes DISTINCTS, un par provenance : ici on ne fusionne rien,
 *  on regarde qui parle et qui reste muet. C'est exactement sa capture. */
const LOCAL = {
  ...vide,
  artists: [{ id: 42, name: 'Pink Floyd', image_path: '/artists/pf.jpg' }],
};

const SERVICES = {
  qobuz: { ...vide, artists: [{ id: null, source_id: 'q1', name: 'Pink Floyd Tribute', image_path: null }] },
  bandcamp: { ...vide, artists: [{ id: null, source_id: 'b1', name: 'New Pink Floyd', image_path: null }] },
  youtube: { ...vide, artists: [{ id: null, source_id: 'y1', name: 'Pink Floyd Live', image_path: null }] },
};

/** `ServiceBadge` est une table fixe : c'est elle qui nomme, pas ce fichier. */
const ATTENDU: Record<string, string> = {
  local: 'LOCAL', qobuz: 'QOBUZ', bandcamp: 'BANDCAMP', youtube: 'YT',
};

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      if (/\/library\/search/.test(u)) return reponse(LOCAL);
      if (/\/search\?/.test(u)) return reponse({ local: LOCAL, services: SERVICES, radios: [] });
      if (/\/playlists/.test(u)) return reponse([]);
      return reponse([]);
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as unknown as typeof WebSocket);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  setSearchCriteria(null);
  vi.unstubAllGlobals();
});

async function chercher(): Promise<HTMLDivElement> {
  setSearchCriteria({ q: REQUETE });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SearchV2, { target: hote, props: {} as any });
  flushSync();
  await new Promise((r) => setTimeout(r, 320));
  for (let i = 0; i < 10; i++) await respirer();
  flushSync();
  return hote;
}

const vignettes = (el: HTMLElement) => [...el.querySelectorAll('.arow .artile')];
const nom = (t: Element) => (t.querySelector('.an')?.textContent ?? '').trim();

/** Les pastilles RENDUES HORS de la pochette, dans la zone de provenance. */
const pastillesHorsPochette = (t: Element) =>
  [...t.querySelectorAll('.asrc .service-badge')].map((b) => (b.textContent ?? '').trim());

describe('#1136 — l’écran rend bien ce qu’on prétend mesurer', () => {
  it('les quatre artistes de la capture sont peints', async () => {
    const el = await chercher();
    expect(
      vignettes(el).map(nom).sort(),
      'la rangée Artistes ne rend pas les quatre vignettes : le témoin ne mesurerait rien',
    ).toEqual(['New Pink Floyd', 'Pink Floyd', 'Pink Floyd Live', 'Pink Floyd Tribute']);
  });
});

describe('#1136 — chaque vignette d’artiste dit sa source, la locale comprise', () => {
  it('🔴 la vignette de BIBLIOTHÈQUE porte enfin son badge LOCAL', async () => {
    const el = await chercher();
    const pf = vignettes(el).find((t) => nom(t) === 'Pink Floyd');
    expect(pf, 'aucune vignette « Pink Floyd »').toBeTruthy();
    expect(
      pastillesHorsPochette(pf!),
      'l’artiste de la bibliothèque ne porte aucun badge — #1136',
    ).toEqual([ATTENDU.local]);
  });

  it('🔴 les quatre provenances parlent, hors de la pochette', async () => {
    const el = await chercher();
    const parNom = new Map(vignettes(el).map((t) => [nom(t), pastillesHorsPochette(t)]));
    expect(parNom.get('Pink Floyd'), 'bibliothèque').toEqual([ATTENDU.local]);
    expect(parNom.get('Pink Floyd Tribute'), 'qobuz').toEqual([ATTENDU.qobuz]);
    expect(parNom.get('New Pink Floyd'), 'bandcamp').toEqual([ATTENDU.bandcamp]);
    expect(parNom.get('Pink Floyd Live'), 'youtube').toEqual([ATTENDU.youtube]);
  });

  it('🔴 la carte MEILLEUR RÉSULTAT le dit aussi — c’est la vignette de sa capture', async () => {
    // Sur sa capture, c'est précisément la grande carte de gauche qui ne porte
    // « aucun badge ».
    const el = await chercher();
    const best = el.querySelector('.best');
    expect(best, 'aucune carte Meilleur résultat').toBeTruthy();
    expect((best!.querySelector('.bt')?.textContent ?? '').trim()).toBe('Pink Floyd');
    const peintes = [...best!.querySelectorAll('.bsrc .service-badge')].map((b) => (b.textContent ?? '').trim());
    expect(peintes, 'le meilleur résultat artiste ne dit pas d’où il vient').toEqual([ATTENDU.local]);
  });

  it('🔴 le badge n’est PAS incrusté dans la pochette', async () => {
    // Une pochette d'artiste ronde de 112 px, en `overflow:hidden` : une
    // pastille `BANDCAMP` compacte y est tronquée. Et l'incrustation écarte
    // `local` — c'est le défaut même de ce ticket. #1129 a tranché pour la
    // section Titres : on REMPLACE l'incrustation, on ne s'y ajoute pas.
    const el = await chercher();
    for (const t of vignettes(el)) {
      expect(
        t.querySelectorAll('.acv .service-badge').length,
        `« ${nom(t)} » porte encore une pastille incrustée dans sa pochette`,
      ).toBe(0);
    }
  });

  it('une source INCONNUE ne ment pas en « LOCAL »', async () => {
    // La règle de `badgeUpnp.test.ts` : mieux vaut aucune pastille qu'une
    // fausse. `ServiceBadge` ne connaît pas `napster` : il ne peint rien.
    const el = document.createElement('div');
    document.body.appendChild(el);
    const m = mount(ServiceBadge as any, { target: el, props: { source: 'napster', compact: true } });
    flushSync();
    expect(el.querySelectorAll('.service-badge').length).toBe(0);
    unmount(m);
    el.remove();
  });
});

describe('#1136 — AlbumArt n’est pas touché', () => {
  it('sa condition partagée reste intacte : ni LOCAL ni RADIO incrustés', () => {
    // ~18 sites d'appel. La lever peindrait `LOCAL` sur tous les écrans où
    // tout est local par construction.
    const art = readFileSync(resolve(__dirname, '../../components/partages/AlbumArt.svelte'), 'utf-8');
    expect(art).toContain("{#if source && source !== 'local' && source !== 'radio'}");
  });
});

describe('#1136 — TÉMOIN : ce qu’une garde naïve aurait raté', () => {
  it('une pastille EXISTE quelque part dans les tuiles de service, badge ou pas', async () => {
    // 🔴 Cette assertion est VERTE AVANT le correctif : `AlbumArt` incruste
    // déjà `QOBUZ`, `BANDCAMP` et `YT`. C'est la garde qu'il ne fallait pas
    // écrire — elle est ici pour le dire, pas pour garder quoi que ce soit.
    // Après correctif elle reste verte, la pastille ayant seulement déménagé.
    const el = await chercher();
    const services = vignettes(el).filter((t) => nom(t) !== 'Pink Floyd');
    expect(services.length).toBe(3);
    for (const t of services) {
      expect(t.querySelectorAll('.service-badge').length).toBeGreaterThan(0);
    }
  });
});
