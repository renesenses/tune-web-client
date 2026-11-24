// @vitest-environment jsdom
//
// rc14 — recette de la répétition (24/11) :
//   1. Base neuve : l'égaliseur et la réaffectation des canaux, facultatifs,
//      ne sont pas installés. Le serveur rc14 publie `plugin_not_installed`
//      avec `install_package` : TessV2 et CheminTess montrent « Installer »,
//      qui appelle `POST /plugins/{paquet}/install` puis relit le catalogue.
//      Contre-épreuve : `plugin_unavailable` (serveur ancien, ou déclic en
//      direct) garde l'ancien comportement, sans bouton.
//   2. Le refus de l'installation (droits, administrateur) est dit.
//   3. La convolution est ajoutée DÉCOCHÉE tant qu'aucun fichier n'est choisi.
//   4. Recette .18 (zone UPnP, « + Ajouter » → Convolution, rien ne se
//      passait) : l'ajout part bien sur une zone UPnP, et AUCUN échec ne
//      reste sans message — tout `PUT` refusé, et tout ajout impossible,
//      affichent une erreur visible.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import { activeView } from '../stores/navigation';
import { zones, currentZoneId } from '../stores/zones';
import { licenseState } from '../stores/license';
import { capaciteTess } from '../stores/tess';
import { locale } from '../i18n';
import type { ChaineTess, LienGreffonTess } from '../tess';
import { ajouterGreffon } from '../tess';
import { ServeurTessSimule, chaineA1, catalogueSimule } from '../tessSimulation';
import TessV2 from '../../components/v2/tess/TessV2.svelte';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });

const en = dictionnaire('en');
const ZONE = 7;

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
/** Les installations demandées (`POST /plugins/{id}/install`). */
let installations: string[] = [];
/** Réponse forcée de l'installation (sinon 200). */
let refusInstallation: { status: number; corps: unknown } | null = null;
/** Réponse forcée du prochain `PUT` de zone (sinon le serveur simulé). */
let refusPut: { status: number; corps: unknown } | null = null;

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
const lienDu = (c: ChaineTess, id: string) => (c.plugins ?? []).find((l) => l.id === id) as LienGreffonTess;

function choisir(id: string) {
  un(`[data-tess-greffon="${id}"] .choisir`)!.click();
  flushSync();
}

const NON_INSTALLE = { available: false, entitled: true, reason: 'plugin_not_installed', install_package: 'equalizer' };

beforeEach(() => {
  serveur = new ServeurTessSimule();
  serveur.avecCatalogue = true;
  serveur.zones.set(ZONE, { transport: 'local', chain: chaineA1(), volume_db: -18 });
  installations = [];
  refusInstallation = null;
  refusPut = null;
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    const methode = (init?.method ?? 'GET').toUpperCase();
    const inst = u.match(/\/api\/v1\/plugins\/([^/?]+)\/install(?:\?|$)/);
    if (inst && methode === 'POST') {
      installations.push(decodeURIComponent(inst[1]));
      if (refusInstallation) return json(refusInstallation.status, refusInstallation.corps);
      // Installé : le serveur ne publie plus de motif pour ses greffons.
      for (const [id, d] of Object.entries(serveur.droitsPublies)) {
        if (d.install_package === inst[1]) delete serveur.droitsPublies[id];
      }
      return json(200, { success: true, message: 'installed', restart_required: false });
    }
    if (refusPut && methode === 'PUT' && /\/zones\/\d+\/tess(?:\?|$)/.test(u)) {
      const r = refusPut;
      refusPut = null;
      return json(r.status, r.corps);
    }
    if (/\/tess(\/|\?|$)/.test(u)) return serveur.fetch(u, init);
    return json(200, []);
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeView.set('tess');
  capaciteTess.set('inconnue');
  zones.set([{ id: ZONE, name: 'atelier', output_type: 'local' } as any]);
  currentZoneId.set(ZONE);
  licenseState.update((s) => ({ ...s, tier: 'premium' }));
  locale.set('en');
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
  licenseState.update((s) => ({ ...s, tier: 'free' }));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('rc14 — « Installer » un greffon pas encore installé', () => {
  it('🔴 `plugin_not_installed` : pastille, texte et bouton « Installer » dans le chemin et le panneau', async () => {
    serveur.droitsPublies = { 'equalizer-graphic': NON_INSTALLE };
    await monter();
    const pastille = un('[data-tess-verrou-chemin="equalizer-graphic"]')!;
    expect(pastille.getAttribute('data-tess-motif')).toBe('plugin_not_installed');
    expect(pastille.textContent!.trim()).toBe(en['tess.notInstalledBadge']);
    expect(un('[data-tess-installer-chemin="equalizer-graphic"]')).not.toBeNull();
    choisir('equalizer-graphic');
    expect(un('[data-tess-verrou="equalizer-graphic"]')!.textContent).toContain(en['tess.pluginNotInstalled']);
    expect(un('[data-tess-installer="equalizer-graphic"]')!.textContent!.trim()).toBe(en['tess.install']);
  });

  it('🔴 « Installer » appelle `POST /plugins/{install_package}/install`, puis relit le catalogue : le greffon est disponible', async () => {
    serveur.droitsPublies = { 'equalizer-graphic': NON_INSTALLE };
    await monter();
    un<HTMLButtonElement>('[data-tess-installer-chemin="equalizer-graphic"]')!.click();
    await laisserTourner();
    expect(installations).toEqual(['equalizer']);
    expect(un('[data-tess-verrou-chemin="equalizer-graphic"]')).toBeNull();
    expect(un('[data-tess-installer-chemin]')).toBeNull();
    expect(un('[data-tess-message]')).toBeNull();
  });

  it('🔴 le bouton du panneau installe aussi', async () => {
    serveur.droitsPublies = { 'equalizer-graphic': NON_INSTALLE };
    await monter();
    choisir('equalizer-graphic');
    un<HTMLButtonElement>('[data-tess-installer="equalizer-graphic"]')!.click();
    await laisserTourner();
    expect(installations).toEqual(['equalizer']);
    expect(un('[data-tess-installer]')).toBeNull();
  });

  it('contre-épreuve : `plugin_unavailable` (serveur ancien) garde « indisponible », sans bouton', async () => {
    serveur.droitsPublies = { 'equalizer-graphic': { available: false, entitled: true, reason: 'plugin_unavailable' } };
    await monter();
    expect(un('[data-tess-verrou-chemin="equalizer-graphic"]')!.getAttribute('data-tess-motif')).toBe('plugin_unavailable');
    expect(un('[data-tess-installer-chemin]')).toBeNull();
    choisir('equalizer-graphic');
    expect(un('[data-tess-installer]')).toBeNull();
    const v = un('[data-tess-verrou="equalizer-graphic"]')!.textContent!;
    expect(v).toContain(en['tess.pluginUnavailable'].split('{name}')[1].slice(0, 20));
    expect(v).not.toContain(en['tess.pluginNotInstalled']);
  });

  it('contre-épreuve : `plugin_not_installed` sans paquet nommé = indisponible, sans bouton', async () => {
    serveur.droitsPublies = { 'equalizer-graphic': { available: false, entitled: true, reason: 'plugin_not_installed' } };
    await monter();
    expect(un('[data-tess-verrou-chemin="equalizer-graphic"]')!.getAttribute('data-tess-motif')).toBe('plugin_unavailable');
    expect(un('[data-tess-installer-chemin]')).toBeNull();
  });

  it('🔴 refus de l’installation : 403 → « administrateur », 500 → « l’installation a échoué »', async () => {
    serveur.droitsPublies = { 'equalizer-graphic': NON_INSTALLE };
    refusInstallation = { status: 403, corps: { error: 'forbidden', message: 'admin only' } };
    await monter();
    un<HTMLButtonElement>('[data-tess-installer-chemin="equalizer-graphic"]')!.click();
    await laisserTourner();
    expect(un('[data-tess-message]')!.textContent).toBe(en['tess.installForbidden']);
    expect(un('[data-tess-installer-chemin="equalizer-graphic"]')).not.toBeNull();

    refusInstallation = { status: 500, corps: { error: 'boom', message: 'disk full' } };
    un<HTMLButtonElement>('[data-tess-installer-chemin="equalizer-graphic"]')!.click();
    await laisserTourner();
    const m = un('[data-tess-message]')!.textContent!;
    expect(m.startsWith(en['tess.installError'].split('{detail}')[0])).toBe(true);
  });
});

describe('rc14 — convolution et refus toujours visibles (recette .18)', () => {
  it('🔴 `ajouterGreffon` ajoute la convolution DÉCOCHÉE (aucun fichier choisi)', () => {
    const c: ChaineTess = { version: 1, plugins: [] } as any;
    expect(lienDu(ajouterGreffon(c, catalogueSimule(), 'convolution', true)!, 'convolution'))
      .toEqual({ id: 'convolution', enabled: false, settings: null });
    // Contre-épreuve : un autre greffon gratuit arrive coché.
    expect(lienDu(ajouterGreffon(c, catalogueSimule(), 'mono-downmix', true)!, 'mono-downmix').enabled).toBe(true);
  });

  it('🔴 zone UPnP, Crossfeed Pro décoché : « + Ajouter » → Convolution part bien en `PUT`, sans erreur', async () => {
    serveur.zones.set(ZONE, {
      transport: 'dlna',
      chain: {
        version: 1, bypass_all: false,
        plugins: [{ id: 'crossfeed-pro', enabled: false, settings: null }],
        fixed: { headroom: { mode: 'auto' }, upsampling: { mode: 'off' }, quantization: { dither: 'tpdf' } },
      } as any,
      volume_db: -18,
    });
    zones.set([{ id: ZONE, name: 'Eversolo', output_type: 'dlna' } as any]);
    await monter();
    un<HTMLButtonElement>('[data-tess-ajouter]')!.click();
    flushSync();
    un<HTMLButtonElement>('[data-tess-ajout="convolution"]')!.click();
    await laisserTourner();
    expect(putsDeZone()).toHaveLength(1);
    const corps = putsDeZone()[0].corps as ChaineTess;
    expect(lienDu(corps, 'convolution')).toEqual({ id: 'convolution', enabled: false, settings: null });
    expect(lienDu(corps, 'crossfeed-pro').enabled).toBe(false);
    expect(un('[data-tess-greffon="convolution"]')).not.toBeNull();
    expect(un('[data-tess-message]')).toBeNull();
  });

  for (const [status, corps, attendu] of [
    [409, { status: 409, code: 'invalid_settings', detail: 'settings.ir_path is missing', plugin_id: 'convolution' }, 'The settings of'],
    [409, { status: 409, code: 'code_inconnu', detail: 'quelque chose', plugin_id: null }, ''],
    [402, { status: 402, code: 'premium_required', detail: 'x', plugin_id: 'convolution' }, ''],
    [400, { status: 400, code: 'invalid_body', detail: 'x', plugin_id: null }, ''],
    [500, { error: 'internal', message: 'boom' }, en['tess.saveError']],
    [503, 'pas du JSON', en['tess.saveError']],
  ] as const) {
    it(`🔴 un \`PUT\` refusé (${status} ${typeof corps === 'object' && 'code' in corps ? corps.code : '—'}) affiche TOUJOURS une erreur visible`, async () => {
      await monter();
      refusPut = { status, corps };
      un<HTMLButtonElement>('[data-tess-ajouter]')!.click();
      flushSync();
      un<HTMLButtonElement>('[data-tess-ajout="mono-downmix"]')!.click();
      await laisserTourner();
      const m = un('[data-tess-message]');
      expect(m, 'aucun message après un refus').not.toBeNull();
      expect(m!.textContent!.trim().length).toBeGreaterThan(0);
      if (attendu) expect(m!.textContent).toContain(attendu);
    });
  }

  it('🔴 un ajout impossible côté client (chaîne enregistrée hors de l’ordre « dernier greffon ») le dit, sans `PUT`', async () => {
    // Chaîne d'une base ancienne : la réaffectation n'est pas en dernier.
    // `ajouterGreffon` rend `null` : avant rc14, l'écran se taisait.
    serveur.zones.get(ZONE)!.chain.plugins = [
      { id: 'channel-remap', enabled: false, settings: null },
      { id: 'crossfeed', enabled: false, settings: null },
    ];
    await monter();
    un<HTMLButtonElement>('[data-tess-ajouter]')!.click();
    flushSync();
    un<HTMLButtonElement>('[data-tess-ajout="convolution"]')!.click();
    await laisserTourner();
    expect(putsDeZone()).toHaveLength(0);
    const m = un('[data-tess-message]');
    expect(m, 'ajout impossible sans message').not.toBeNull();
    expect(m!.textContent).toBe(en['tess.cantAdd'].replace('{name}', 'Convolution'));
  });
});

describe('rc14 — traductions', () => {
  const CLES = [
    'tess.notInstalledBadge', 'tess.pluginNotInstalled', 'tess.install', 'tess.installing', 'tess.installError',
    'tess.installForbidden', 'tess.cantAdd', 'tess.reason.no_filter_selected', 'tess.reason.plugin_not_installed',
  ];
  it('chaque clé existe, non vide, dans les 20 langues ; les {marques} sont gardées ; aucun « Ã »', () => {
    expect(ONZE_LANGUES).toHaveLength(20);
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const k of CLES) {
        expect(d[k], `${l} ${k}`).toBeTruthy();
        expect(d[k], `${l} ${k}`).not.toContain('Ã');
        for (const m of (en[k].match(/\{\w+\}/g) ?? [])) expect(d[k], `${l} ${k} ${m}`).toContain(m);
      }
    }
  });
});
