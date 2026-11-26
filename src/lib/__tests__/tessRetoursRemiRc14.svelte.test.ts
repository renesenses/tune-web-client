// @vitest-environment jsdom
//
// rc14 — page TESS, retours de Rémi (GO de Bertrand du 26/11, 19 h 45).
// Un témoin par point, sur l'écran réellement monté contre le serveur TESS
// simulé (`lib/tessSimulation`) :
//   1. « Bypass all » n'est plus un interrupteur vert : un bouton d'état
//      (`aria-pressed`), « TESS bypassed » une fois actif ; même `PUT` ;
//   2. le nom de la zone réglée est rappelé juste avant le badge ;
//   3. sortie réseau (`signal_path` : étape `headroom`, `reason:
//      "not_applied_on_transport"`, tune-core `tess/reseau_upnp.rs`) : le
//      panneau Headroom est grisé (`disabled`) et le dit ; sortie locale :
//      rien ne change ;
//   4. Convolution : le libellé de la ligne d'information (le comportement est
//      couvert par `tessPanneauConvolutionW3`) ;
//   5. Mesure de la pièce : « Without microphone (estimate) » / « With
//      microphone (recommended) », dans les 20 langues ;
//   6. couleurs : « traité par TESS » est vert, jamais l'orange d'un thème.
//
// Ce qu'ils ne prouvent pas : jsdom ne calcule pas les couleurs ; le point 6
// se lit donc dans les feuilles (jetons et règle de la page), et le badge
// rendu porte la classe qui les applique.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { activeView } from '../stores/navigation';
import { zones, currentZoneId } from '../stores/zones';
import { licenseState } from '../stores/license';
import { capaciteTess } from '../stores/tess';
import { greffonTessDemande } from '../stores/tessOuverture';
import { locale } from '../i18n';
import type { ChaineTess } from '../tess';
import { ServeurTessSimule, chaineA1 } from '../tessSimulation';
import TessV2 from '../../components/v2/tess/TessV2.svelte';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });

const en = dictionnaire('en');
const fr = dictionnaire('fr');
const ZONE = 7;
const ANGLAIS_DU_SERVEUR = 'Not applied on this network output: Tune serves this renderer without it';

function json(status: number, corps: unknown) {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

let serveur: ServeurTessSimule;
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function laisserTourner(n = 30) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}
async function monter() {
  monte = mount(TessV2, { target: hote! });
  await laisserTourner();
}
const un = <T extends HTMLElement = HTMLElement>(sel: string) => hote!.querySelector<T>(sel);
const putsDeZone = () => serveur.puts.filter((p) => p.zoneId === ZONE);

/** La sortie réseau telle que le serveur la publie : l'étage Headroom éteint, `not_applied_on_transport`. */
function sortieReseau() {
  const base = serveur.reponse.bind(serveur);
  serveur.reponse = (id: number) => {
    const r = base(id);
    return {
      ...r,
      transport: 'upnp',
      headroom_db: 0,
      signal_path: r.signal_path.map((e) => (e.code === 'headroom'
        ? { ...e, effective: false, reason: 'not_applied_on_transport', detail: ANGLAIS_DU_SERVEUR }
        : e)),
    };
  };
}

beforeEach(() => {
  serveur = new ServeurTessSimule();
  serveur.avecCatalogue = true;
  serveur.zones.set(ZONE, { transport: 'local', chain: chaineA1(), volume_db: -18 });
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    if (/\/room-correction\/ir\/status\/\d+/.test(u)) return json(200, { active: true, files: [], resample: true, in_use: null });
    if (/\/tess(\/|\?|$)/.test(u)) return serveur.fetch(u, init);
    return json(404, {});
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeView.set('tess');
  capaciteTess.set('inconnue');
  zones.set([{ id: ZONE, name: 'Salon', output_type: 'local' } as any]);
  currentZoneId.set(ZONE);
  greffonTessDemande.set(null);
  licenseState.update((s) => ({ ...s, tier: 'premium', loaded: true }));
  locale.set('en');
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
  licenseState.update((s) => ({ ...s, tier: 'free' }));
  locale.set('en');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('1. « Bypass all » : un bouton d’état, plus un interrupteur', () => {
  it('🔴 repos : « Bypass all », contour neutre, `aria-pressed="false"`, aucun interrupteur', async () => {
    await monter();
    const b = un<HTMLButtonElement>('[data-tess-bypass]')!;
    expect(b.tagName).toBe('BUTTON');
    expect(b.getAttribute('role')).toBeNull();
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(b.classList.contains('actif')).toBe(false);
    expect(b.textContent?.trim()).toBe(en['tess.bypassAll']);
    expect(un('[data-tess-chemin] header input[type="checkbox"]')).toBeNull();
  });

  it('🔴 un clic : même `PUT` (`bypass_all: true`), puis « TESS bypassed », `aria-pressed="true"` ; un second clic le rétablit', async () => {
    await monter();
    un<HTMLButtonElement>('[data-tess-bypass]')!.click();
    await laisserTourner();
    expect(putsDeZone()).toHaveLength(1);
    const corps = putsDeZone()[0].corps as ChaineTess;
    expect(corps.bypass_all).toBe(true);
    // La chaîne entière part, réglages compris.
    expect(corps.plugins!.map((p) => p.id)).toEqual(chaineA1().plugins!.map((p) => p.id));
    const b = un<HTMLButtonElement>('[data-tess-bypass]')!;
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(b.classList.contains('actif')).toBe(true);
    expect(b.textContent?.trim()).toBe(en['tess.bypassActive']);
    b.click();
    await laisserTourner();
    expect((putsDeZone().at(-1)!.corps as ChaineTess).bypass_all).toBe(false);
    expect(un('[data-tess-bypass]')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('en français : « Tout contourner », puis « TESS contourné »', async () => {
    locale.set('fr');
    serveur.zones.get(ZONE)!.chain = { ...chaineA1(), bypass_all: true };
    await monter();
    expect(un('[data-tess-bypass]')!.textContent?.trim()).toBe('TESS contourné');
    expect(fr['tess.bypassAll']).toBe('Tout contourner');
  });
});

describe('2. rappel de la zone en cours d’édition', () => {
  it('🔴 « Zone: Salon », juste avant le badge', async () => {
    await monter();
    const rappel = un('[data-tess-zone-en-cours]')!;
    expect(rappel.textContent?.trim()).toBe('Zone: Salon');
    const badge = un('[data-tess-badge]')!;
    expect(rappel.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rappel.nextElementSibling).toBe(badge);
  });

  it('suit la zone courante, et se dit en français', async () => {
    locale.set('fr');
    zones.set([{ id: ZONE, name: 'Salon', output_type: 'local' } as any, { id: 8, name: 'Bureau', output_type: 'local' } as any]);
    serveur.zones.set(8, { transport: 'local', chain: chaineA1() });
    await monter();
    expect(un('[data-tess-zone-en-cours]')!.textContent?.trim()).toBe('Zone : Salon');
    currentZoneId.set(8);
    await laisserTourner();
    expect(un('[data-tess-zone-en-cours]')!.textContent?.trim()).toBe('Zone : Bureau');
  });
});

describe('3. Headroom sur une sortie réseau', () => {
  async function ouvrirHeadroom() {
    un('[data-tess-choisir-etape="headroom"]')!.click();
    flushSync();
    await laisserTourner(5);
  }

  it('🔴 `not_applied_on_transport` : panneau grisé (`disabled`) et l’explication traduite', async () => {
    serveur.zones.get(ZONE)!.chain = { ...chaineA1(), fixed: { ...(chaineA1().fixed ?? {}), headroom: { mode: 'manual', db: -6 } } as any };
    sortieReseau();
    await monter();
    await ouvrirHeadroom();
    const panneau = un('[data-tess-panneau-headroom]')!;
    expect(panneau.hasAttribute('data-tess-headroom-non-applique')).toBe(true);
    expect(un<HTMLInputElement>('[data-tess-headroom-auto]')!.disabled).toBe(true);
    expect(un<HTMLInputElement>('[data-tess-headroom-db]')!.disabled).toBe(true);
    expect(un('[data-tess-headroom-reseau]')!.textContent?.trim()).toBe(en['tess.headroom.notAppliedNetwork']);
    // Un seul message pour cet état : pas de « Not applied: {reason} » en plus.
    expect(un('[data-tess-headroom-applique]')).toBeNull();
    // Le réglage reste celui de la chaîne : rien n'est envoyé ni effacé.
    expect(un('[data-tess-headroom-valeur]')!.textContent).toBe('−6 dB');
    expect(putsDeZone()).toHaveLength(0);
  });

  it('contre-épreuve : sortie locale, le panneau reste réglable et ne dit rien du réseau', async () => {
    await monter();
    await ouvrirHeadroom();
    expect(un('[data-tess-panneau-headroom]')!.hasAttribute('data-tess-headroom-non-applique')).toBe(false);
    expect(un<HTMLInputElement>('[data-tess-headroom-auto]')!.disabled).toBe(false);
    expect(un('[data-tess-headroom-reseau]')).toBeNull();
  });

  it('un autre motif d’extinction (rien à protéger) ne grise pas le panneau', async () => {
    serveur.zones.get(ZONE)!.chain = { ...chaineA1(), plugins: [] };
    await monter();
    await ouvrirHeadroom();
    expect(un<HTMLInputElement>('[data-tess-headroom-auto]')!.disabled).toBe(false);
  });
});

describe('4. Convolution : la ligne d’information', () => {
  it('le libellé EN et FR', () => {
    expect(en['tess.conv.resampleInfo']).toBe('The nearest filter is resampled to the source sample rate, preserving phase.');
    expect(fr['tess.conv.resampleInfo']).toBe('Le filtre le plus proche est rééchantillonné à la cadence de la source, en conservant la phase.');
    expect(en['tess.conv.resampleNearest']).toBeUndefined();
    expect(en['tess.conv.resampleHint']).toBeUndefined();
    expect(fr['tess.conv.resampleOff']).toBe('Rééchantillonnage du filtre le plus proche désactivé sur ce serveur.');
  });
});

describe('5. Mesure de la pièce : estimation et recommandation', () => {
  it('🔴 EN et FR', () => {
    expect(en['v2.room.tabNoMic']).toBe('Without microphone (estimate)');
    expect(en['v2.room.tabMic']).toBe('With microphone (recommended)');
    expect(fr['v2.room.tabNoMic']).toBe('Sans micro (estimation)');
    expect(fr['v2.room.tabMic']).toBe('Avec micro (recommandé)');
  });

  it('les 20 langues portent la précision entre parenthèses, et plus l’ancien libellé anglais', () => {
    expect(ONZE_LANGUES).toHaveLength(20);
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const k of ['v2.room.tabNoMic', 'v2.room.tabMic']) {
        expect(d[k], `${l} ${k}`).toMatch(/[(（].+[)）]$/);
      }
      expect(d['v2.room.tabNoMic']).not.toBe(d['v2.room.tabMic']);
      expect(d['v2.room.tabNoMic']).not.toBe('Calibration without a microphone');
      expect(d['v2.room.tabMic']).not.toBe('Microphone measurement');
    }
  });
});

describe('6. couleurs : « traité par TESS » est vert', () => {
  const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
  /** Teinte (0–360°) d'un `#RRGGBB`. */
  function teinte(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
    if (d === 0) return 0;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }

  it('🔴 le badge « Processed by TESS » rendu porte la classe verte', async () => {
    await monter();
    const badge = un('[data-tess-badge]')!;
    expect(badge.dataset.tessBadge).toBe('processed_by_tess');
    expect(badge.classList.contains('traite')).toBe(true);
  });

  it('🔴 chaque thème qui pose le vert TESS le pose VERT (teinte 90–180°, jamais l’orange)', () => {
    const css = lire('src/styles/tune-v2.css');
    const valeurs = [...css.matchAll(/--v2-tess-vert(?:1|2):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]);
    expect(valeurs.length).toBeGreaterThanOrEqual(8);
    for (const v of valeurs) {
      const h = teinte(v);
      expect(h, v).toBeGreaterThanOrEqual(90);
      expect(h, v).toBeLessThanOrEqual(180);
    }
    // Défini dans la base commune, donc sous TOUS les thèmes (orange compris).
    const base = css.slice(css.indexOf('.tune-v2{'), css.indexOf('}', css.indexOf('.tune-v2{')));
    expect(base).toMatch(/--v2-tess-vert1:/);
  });

  it('🔴 la page TESS lit le vert TESS comme accent ; les alertes gardent le rouge', () => {
    const page = lire('src/components/v2/tess/TessV2.svelte');
    expect(page).toMatch(/\.v2-top,\.scroll\{--v2-acc1:var\(--v2-tess-vert1\); --v2-acc2:var\(--v2-tess-vert2\)/);
    expect(page).toMatch(/\.badge\.traite\{color:var\(--v2-tess-vert1\)/);
    expect(page).toMatch(/\.erreur\{color:var\(--v2-danger\)/);
  });
});

describe('i18n des nouveaux libellés', () => {
  it('chaque nouvelle clé existe, non vide, dans les 20 langues ; le rappel garde `{zone}`', () => {
    const cles = ['tess.bypassActive', 'tess.bypassAllHint', 'tess.bypassActiveHint', 'tess.zoneReminder',
      'tess.headroom.notAppliedNetwork', 'tess.conv.resampleInfo', 'tess.conv.resampleOff'];
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const k of cles) expect(d[k], `${l} ${k}`).toBeTruthy();
      expect(d['tess.zoneReminder'], l).toContain('{zone}');
      expect(d['tess.bypassActive'], l).toContain('TESS');
    }
    expect(en['tess.bypassActive']).toBe('TESS bypassed');
    expect(fr['tess.bypassActive']).toBe('TESS contourné');
    expect(en['tess.zoneReminder']).toBe('Zone: {zone}');
    expect(fr['tess.zoneReminder']).toBe('Zone : {zone}');
  });
});
