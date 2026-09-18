// @vitest-environment jsdom
/**
 * 🔴 #1148 — « Menu playlists : quand on rentre dans le menu : erreur bandcamp »
 * (FabienM, fil 1778, v0.9.148).
 *
 * ## L'état du dossier avant ce lot
 *
 * La MOITIÉ visible du défaut est déjà corrigée sur `main` : `#1007`
 * (`6f203906`, 13/09/2026) a retiré le bandeau rouge que `fetchJSON` levait
 * sur un 501, et `src/lib/__tests__/pas501EnPanne.test.ts` le garde. Ce
 * fichier-ci ne rejoue pas cette garde — il tient les DEUX manques qui
 * restaient après elle.
 *
 * ## Manque n° 1 — l'écran ne dit plus RIEN
 *
 * Mesuré sur la .18 le 18/09/2026 :
 *
 * ```text
 * GET /api/v1/streaming/bandcamp/playlists
 *   → 501  « Bandcamp ne fournit pas de playlists »
 * ```
 *
 * `PlaylistsV2` attrape ce refus (`catch { par[n] = [] }`), et `svcEntries`
 * écarte les listes vides : la pastille Bandcamp DISPARAÎT. L'utilisateur qui
 * a connecté Bandcamp et qui ouvre « Playlists » ne voit ni bandeau, ni
 * Bandcamp, ni explication — un silence, là où le serveur a pris la peine
 * d'écrire une phrase lisible. Le bandeau rouge a été remplacé par rien.
 *
 * ## Manque n° 2 — `fetchVoid` est resté sur le seuil nu
 *
 * `fetchJSON` exclut 501 depuis #1007 ; `fetchVoid`, son jumeau, teste
 * toujours `status >= 500` tout court. Le même refus délibéré, sur une route
 * qui ÉCRIT, peint encore « Server error: … ».
 *
 * ⚠️ Mais une écriture n'est pas une lecture : un 501 silencieux sur un
 * `DELETE` serait un geste qui n'a pas eu lieu et que personne n'annonce.
 * `fetchVoid` doit donc dire la phrase du serveur — sans la maquiller en
 * incident.
 *
 * ## Les deux sens
 *
 * Chaque garde a sa contre-épreuve : un VRAI 5xx (500, 502, 503) doit
 * continuer d'alerter, partout. Sans elle, on aurait éteint l'alarme.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

/** Les bandeaux levés, par type — c'est la distinction qui est en jeu. */
const toasts: { type: string; msg: string }[] = [];
vi.mock('../stores/notifications', () => ({
  notifications: {
    error: (m: string) => { toasts.push({ type: 'error', msg: m }); },
    info: (m: string) => { toasts.push({ type: 'info', msg: m }); },
    success: (m: string) => { toasts.push({ type: 'success', msg: m }); },
    avecAction: () => {},
    dismiss: () => {},
  },
}));

import * as api from '../api';
import Playlists from '../../components/v2/PlaylistsV2.svelte';
import { currentZoneId } from '../stores/zones';

const MOTIF = 'Bandcamp ne fournit pas de playlists';

const erreurs = () => toasts.filter((t) => t.type === 'error').map((t) => t.msg);

beforeEach(() => { toasts.length = 0; });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// ───────────────────────────────────────────────────────────────────────────
// Manque n° 2 — `fetchVoid`, la route qui ÉCRIT
// ───────────────────────────────────────────────────────────────────────────

/** Fait répondre le prochain `fetch` par ce corps — une VRAIE `Response`. */
function repond(status: number, corps: string, type = 'text/plain') {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(corps, { status, headers: { 'content-type': type } }),
  );
}

/** Une route qui passe par `fetchVoid` (POST … /favorites/streaming/remove). */
const ecrire = () =>
  api.removeProfileStreamingFavorite(1, { item_type: 'album' as any, service: 'bandcamp', service_id: 'x' });

describe('fetchVoid — un 501 sur une écriture', () => {
  it("ne peint PAS de bandeau « Server error »", async () => {
    repond(501, MOTIF);
    await expect(ecrire()).rejects.toBeTruthy();
    expect(erreurs(), `bandeau rouge levé : ${erreurs().join(' | ')}`).toEqual([]);
  });

  it("dit quand même la phrase du serveur — une écriture qui n'a pas eu lieu ne se tait pas", async () => {
    repond(501, MOTIF);
    await expect(ecrire()).rejects.toBeTruthy();
    // Pas de silence : l'appelant d'une écriture ne rend rien, lui.
    expect(toasts.map((t) => t.msg).join(' | ')).toContain(MOTIF);
  });

  it('REJETTE toujours — l’appelant garde la main', async () => {
    repond(501, MOTIF);
    let attrape: any = null;
    try { await ecrire(); } catch (e) { attrape = e; }
    expect(attrape?.status).toBe(501);
    expect(String(attrape?.message)).toContain('Bandcamp');
  });

  /** 🔴 L'AUTRE SENS. Élargir l'exception ferait taire les vraies pannes. */
  it('un 500, un 502 et un 503 lèvent toujours leur bandeau rouge', async () => {
    for (const st of [500, 502, 503]) {
      toasts.length = 0;
      repond(st, 'panne');
      await expect(ecrire()).rejects.toBeTruthy();
      expect(erreurs().length, `status ${st}`).toBe(1);
      expect(erreurs()[0], `status ${st}`).toContain('Server error');
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Manque n° 1 — l'écran de Fabien
// ───────────────────────────────────────────────────────────────────────────

let target: HTMLDivElement;
let instance: any;
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };

/**
 * Le serveur de Fabien : Bandcamp et Qobuz authentifiés, Qobuz sert quatre
 * playlists, Bandcamp refuse avec `statutBandcamp`.
 */
function serveur(statutBandcamp: number, corpsBandcamp = MOTIF) {
  vi.stubGlobal('fetch', vi.fn(async (url: any) => {
    const path = String(url);
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (path.includes('/streaming/bandcamp/playlists')) {
      return new Response(corpsBandcamp, { status: statutBandcamp, headers: { 'content-type': 'text/plain' } });
    }
    if (path.includes('/streaming/qobuz/playlists')) {
      return json([{ source_id: 'q1', name: 'Ma playlist Qobuz' }]);
    }
    if (path.includes('/streaming/services')) {
      return json({ bandcamp: { authenticated: true }, qobuz: { authenticated: true } });
    }
    if (path.includes('/playlists/smart')) return json([]);
    if (path.includes('/playlists')) return json([]);
    return json([]);
  }));
}

async function ouvrirEcran() {
  currentZoneId.set(1);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  target = document.createElement('div');
  document.body.appendChild(target);
  instance = mount(Playlists, { target });
  await flush();
}

async function fermerEcran() {
  if (instance) await unmount(instance);
  instance = null;
  target?.remove();
}

afterEach(fermerEcran);

describe('Écran Playlists — un service qui ne fournit pas de playlists', () => {
  /** 🔴 LE CAS DE FABIEN. */
  it("n'affiche AUCUN bandeau rouge à l'ouverture", async () => {
    serveur(501);
    await ouvrirEcran();
    expect(erreurs(), `bandeau levé : ${erreurs().join(' | ')}`).toEqual([]);
  });

  it("dit à l'écran POURQUOI Bandcamp n'est pas là, avec la phrase du serveur", async () => {
    serveur(501);
    await ouvrirEcran();
    // Ni bandeau rouge, ni silence : l'écran porte l'explication du serveur.
    expect(target.textContent ?? '').toContain(MOTIF);
  });

  it("n'empêche pas les autres services de s'afficher", async () => {
    serveur(501);
    await ouvrirEcran();
    expect(target.textContent ?? '').toContain('qobuz');
  });

  /** 🔴 L'AUTRE SENS, sur l'écran : une vraie panne reste une panne. */
  it('un 503 sur le même service alerte toujours, et ne devient pas une explication', async () => {
    serveur(503, 'passerelle injoignable');
    await ouvrirEcran();
    expect(erreurs().length, `bandeaux : ${erreurs().join(' | ')}`).toBe(1);
    expect(erreurs()[0]).toContain('Server error');
    // Une panne n'est pas « ce service ne fait pas ça » : pas de note calme.
    expect(target.textContent ?? '').not.toContain('passerelle injoignable');
  });
});
