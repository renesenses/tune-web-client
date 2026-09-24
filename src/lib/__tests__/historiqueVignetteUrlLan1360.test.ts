// @vitest-environment jsdom
//
// #1360 — « Historique : des lignes sans vignette » (FabienM, fil 1859,
// point 1, 20/09/2026, 0.9.158, Windows).
//
// ## LA FAMILLE QUE CE TÉMOIN TIENT — ET POURQUOI C'EST CELLE-LÀ
//
// Le premier volet du ticket est livré (`4206a7fe`, PR #1384) : une ligne
// d'objet sans pochette NI album garde une boîte de remplacement au lieu d'un
// trou. Il reste le cas où la ligne porte bien une pochette et n'affiche
// pourtant rien — un MÉLANGE de lignes avec et sans vignette, qui est
// exactement ce que montre la capture de Fabien.
//
// Ce mélange se mesure, et il a une cause nommée.
//
// Jusqu'à la v0.9.157, l'avance sans blanc du serveur remplaçait le condensat
// de pochette par une adresse ABSOLUE de réseau local — `resolve_cover_url`,
// `tune-core/src/orchestrator/commun.rs` — de la forme
// `http://<ip-lan>:8888/api/v1/library/artwork/<condensat>`. Cette valeur est
// littéralement celle qui part en base dans `listen_history.cover_url`
// (`queue.rs` : `ecoute` est bâtie sur `np.cover_path`).
//
// Le serveur a corrigé l'ÉCRITURE — `f0d63c49`, « l'avance gapless garde le
// condensat de pochette au lieu d'une URL LAN absolue » (srv#4446), entré en
// v0.9.157 — mais RIEN ne répare les lignes déjà enregistrées :
// `/library/history` rend `h.cover_url` tel quel et aucune migration n'y
// touche. Fabien est sur la 0.9.158 : son historique porte donc des lignes
// écrites AVANT (adresse LAN) et des lignes écrites APRÈS (condensat). Les
// premières n'ont pas de vignette, les secondes en ont. Le mélange, mot pour
// mot.
//
// Côté client, une valeur qui commence par `http://` partait au RELAIS :
// `…/library/artwork/proxy?url=http%3A%2F%2F192.168…`. Or le relais REFUSE les
// adresses privées — c'est sa raison d'être (`adresse_interdite`,
// `tune-core/src/library/artwork_proxy.rs`) — et répond 403. Son exception
// « pochette de bibliothèque » ne sauve que les URL présentes dans
// `albums.cover_path` ; une ligne d'historique n'y est pas. `AlbumArt` bascule
// alors sur son `onerror` et dessine une boîte grise.
//
// ## LA RÉPARATION SE FAIT À LA LECTURE, ET C'EST LE POINT
//
// L'adresse porte déjà le condensat. On le lit, et on redemande la pochette à
// NOTRE origine — pas par le relais, pas à l'adresse enregistrée (c'était
// celle du serveur le jour de l'écoute : un bail DHCP renouvelé et elle ne
// mène nulle part). Toutes les lignes anciennes sont réparées d'un coup, ce
// qu'une correction d'écriture ne pouvait pas faire.
//
// ⚠️ Ce que ce témoin NE prétend PAS : que c'est bien ce que Fabien a vu. Le
// journal promis n'a jamais été joint. Il tient la famille qui se démontre
// sans lui, et il nomme sa mesure.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import HistoriqueV2 from '../../components/v2/HistoriqueV2.svelte';
import { artworkUrl } from '../api';
import { playbackHistory } from '../stores/history';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

/** Le condensat tel que le serveur le range aujourd'hui. */
const CONDENSAT = '9f2c4b7ae1d05386.jpg';
/** La même pochette, telle que la .157 et ses aînées l'ont écrite en base. */
const URL_LAN = `http://192.168.1.18:8888/api/v1/library/artwork/${CONDENSAT}`;
/** Une pochette VRAIMENT distante : elle, doit continuer de passer par le relais. */
const URL_QOBUZ = 'https://static.qobuz.com/images/covers/aa/bb/0123456789aab_600.jpg';

// ───────────────────────────────────────────────────────────────────────────
// 1 · L'adresse construite, seule.
// ───────────────────────────────────────────────────────────────────────────
describe('artworkUrl — une pochette de NOTRE serveur ne repasse pas par le relais', () => {
  it('🔴 une adresse LAN absolue se redemande par son condensat', () => {
    const src = artworkUrl(URL_LAN);
    expect(
      src.includes('/artwork/proxy'),
      'la pochette part au relais, qui refuse les adresses privées par 403 : la vignette ' +
      'est perdue pour toutes les écoutes enregistrées avant la v0.9.157 — c’est #1360',
    ).toBe(false);
    expect(src.endsWith(`/library/artwork/${encodeURIComponent(CONDENSAT)}`)).toBe(true);
    expect(src.includes('192.168.1.18'), 'l’adresse du serveur le jour de l’écoute est conservée : ' +
      'un bail DHCP renouvelé et elle ne mène plus nulle part').toBe(false);
  });

  it('CONTRE-ÉPREUVE : une pochette réellement distante passe TOUJOURS par le relais', () => {
    // Sans elle, on ne saurait pas si le correctif répare ou s'il casse : les
    // 179 écoutes Qobuz mesurées sur la .18 (#991) portent toutes une URL de
    // CDN, et c'est le relais qui les sert — le navigateur ne peut pas les
    // demander lui-même (origine tierce, pas de CORS).
    const src = artworkUrl(URL_QOBUZ);
    expect(src).toContain('/library/artwork/proxy?url=');
    expect(src).toContain(encodeURIComponent(URL_QOBUZ));
  });

  it('la route du relais elle-même n’est pas prise pour un condensat', () => {
    // `…/library/artwork/proxy?url=…` finit par le segment « proxy ». Le
    // renvoyer à la branche « condensat » demanderait une pochette nommée
    // « proxy ».
    const relais = 'http://tune.local:8888/api/v1/library/artwork/proxy?url=https%3A%2F%2Fx%2F1.jpg';
    expect(artworkUrl(relais)).toContain('/library/artwork/proxy?url=');
    // Les deux formes déjà traitées ne bougent pas.
    expect(artworkUrl('/api/v1/library/artwork/abc.jpg')).toBe('/api/v1/library/artwork/abc.jpg');
    expect(artworkUrl(null)).toBe('');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2 · L'écran réel : la ligne d'historique a sa vignette.
// ───────────────────────────────────────────────────────────────────────────
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

/** Quatre écoutes d'un même album, pochette écrite en adresse LAN. */
const LIGNES_URL_LAN = Array.from({ length: 4 }, (_, i) => ({
  id: i + 1,
  track_id: null,
  title: `Piste ${i + 1}`,
  artist_name: 'Un artiste',
  album_title: 'Un album',
  source: 'qobuz',
  source_id: String(900 + i),
  album_id: null,
  cover_url: URL_LAN,
  duration_ms: 180_000,
  listened_at: `2026-09-20T09:0${i}:00Z`,
  zone_id: 99,
  context_type: 'album',
  context_id: 'album-4343',
  context_position: i,
  context_name: 'Un album',
}));

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

function corpsPour(url: string): unknown {
  if (url.includes('/library/history')) return { items: LIGNES_URL_LAN, total: LIGNES_URL_LAN.length };
  return [];
}

beforeEach(() => {
  locale.set('fr');
  playbackHistory.clear();
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
    const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
    const corps = corpsPour(url);
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
  try { localStorage.clear(); } catch { /* idem */ }
  vi.unstubAllGlobals();
});

describe('#1360 — une écoute d’avant la .157 retrouve sa vignette', () => {
  it('🔴 la ligne d’historique demande sa pochette à NOTRE serveur, pas au relais', async () => {
    const el = await poserEcran();

    const objet = el.querySelector<HTMLElement>('.objet');
    expect(objet, 'aucune ligne d’objet rendue : le décor n’a pas pris').not.toBeNull();

    const img = objet!.querySelector<HTMLImageElement>('.onom .ovig .album-art img');
    expect(
      img,
      'la ligne ne dessine AUCUNE image alors qu’elle porte une pochette : la vignette manque',
    ).not.toBeNull();

    const src = img!.getAttribute('src') ?? '';
    expect(
      src.includes('/artwork/proxy'),
      'la pochette est demandée au relais, qui refuse les adresses privées par 403 : la ligne ' +
      'retombe sur la boîte grise de `AlbumArt` — « il manque des vignettes à mon historique »',
    ).toBe(false);
    expect(src).toContain(`/library/artwork/${encodeURIComponent(CONDENSAT)}`);
  });
});
