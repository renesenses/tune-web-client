// @vitest-environment jsdom
//
// rc14 (GO du 24/11, 22 h 30) — les quatre façades de l'égaliseur partagent
// une clé et un moteur : le serveur rc14 les met dans un groupe exclusif
// `equalizer` (politique `refuse`). L'écran réutilise la mécanique du groupe
// crossfeed, avec un texte propre aux égaliseurs ; le groupe crossfeed garde
// le sien.
//
// (Banc repris de tessInstallerRc14 :)
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
import { ajouterGreffon, cleExclusivite } from '../tess';
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
        if ((d as any).install_package === inst[1]) delete serveur.droitsPublies[id];
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

const FACADES = ['equalizer-graphic', 'equalizer-parametric', 'equalizer-headphone', 'room-correction'];
/** Le catalogue d'un serveur rc14 : les façades dans le groupe `equalizer`. */
function avecGroupeEgaliseur(s: ServeurTessSimule) {
  for (const p of s.catalogue.plugins) {
    if (FACADES.includes(p.id)) p.placement.exclusive_group = { id: 'equalizer', priority: 1 } as any;
  }
  s.catalogue.groups = [...(s.catalogue.groups ?? []), { id: 'equalizer', policy: 'refuse' } as any];
}

describe('rc14 — égaliseurs mutuellement exclusifs', () => {
  it('🔴 cocher un second égaliseur : bloqué AVANT le serveur, avec le texte des égaliseurs', async () => {
    avecGroupeEgaliseur(serveur);
    serveur.zones.get(ZONE)!.chain.plugins = [
      { id: 'equalizer-graphic', enabled: true, settings: null },
      { id: 'equalizer-headphone', enabled: false, settings: null },
    ];
    await monter();
    const bloque = un('[data-tess-blocage="equalizer-headphone"]')!.textContent!;
    expect(bloque).toBe(en['tess.exclusiveEq'].replace(/\{a\}/g, 'Headphone EQ').replace(/\{b\}/g, 'Graphic EQ'));
    expect(bloque).not.toContain('Crosstalk');
    expect((un('[data-tess-case="equalizer-headphone"]') as HTMLInputElement).disabled).toBe(true);
    expect(putsDeZone()).toHaveLength(0);
  });

  it('🔴 « + Ajouter » un second égaliseur : il arrive DÉCOCHÉ', async () => {
    avecGroupeEgaliseur(serveur);
    serveur.zones.get(ZONE)!.chain.plugins = [{ id: 'equalizer-graphic', enabled: true, settings: null }];
    await monter();
    un<HTMLButtonElement>('[data-tess-ajouter]')!.click();
    flushSync();
    un<HTMLButtonElement>('[data-tess-ajout="equalizer-headphone"]')!.click();
    await laisserTourner();
    expect(putsDeZone()).toHaveLength(1);
    expect(lienDu(putsDeZone()[0].corps as ChaineTess, 'equalizer-headphone').enabled).toBe(false);
    expect(un('[data-tess-message]')).toBeNull();
  });

  it('🔴 un 409 `mutually_exclusive` sur un égaliseur dit la phrase des égaliseurs', async () => {
    avecGroupeEgaliseur(serveur);
    await monter();
    refusPut = { status: 409, corps: { status: 409, code: 'mutually_exclusive', detail: 'x', plugin_id: 'equalizer-headphone' } };
    un<HTMLButtonElement>('[data-tess-ajouter]')!.click();
    flushSync();
    un<HTMLButtonElement>('[data-tess-ajout="mono-downmix"]')!.click();
    await laisserTourner();
    expect(un('[data-tess-message]')!.textContent).toBe(en['tess.refusal.mutually_exclusive_equalizer']);
  });

  it('contre-épreuve : le groupe crossfeed garde son texte, et un seul égaliseur coché passe', async () => {
    avecGroupeEgaliseur(serveur);
    const cat = serveur.catalogue;
    expect(cleExclusivite(cat, 'crossfeed')).toBe('tess.exclusive');
    expect(cleExclusivite(cat, 'crosstalk')).toBe('tess.exclusive');
    expect(cleExclusivite(cat, 'equalizer-parametric')).toBe('tess.exclusiveEq');
    serveur.zones.get(ZONE)!.chain.plugins = [
      { id: 'equalizer-graphic', enabled: false, settings: null },
      { id: 'crossfeed', enabled: true, settings: null },
      { id: 'crosstalk', enabled: false, settings: null },
    ];
    await monter();
    expect(un('[data-tess-blocage="crosstalk"]')!.textContent).toContain('Crosstalk (for speakers)'.slice(0, 9));
    expect(un('[data-tess-blocage="crosstalk"]')!.textContent).toBe(
      en['tess.exclusive'].replace(/\{a\}/g, 'Crosstalk').replace(/\{b\}/g, 'Crossfeed'),
    );
    expect(un('[data-tess-blocage="equalizer-graphic"]')).toBeNull();
    (un('[data-tess-case="equalizer-graphic"]') as HTMLInputElement).click();
    await laisserTourner();
    expect(putsDeZone()).toHaveLength(1);
    expect(un('[data-tess-message]')).toBeNull();
  });

  it('serveur ancien (sans groupe `equalizer`) : deux égaliseurs restent cochables', async () => {
    serveur.zones.get(ZONE)!.chain.plugins = [
      { id: 'equalizer-graphic', enabled: true, settings: null },
      { id: 'equalizer-headphone', enabled: false, settings: null },
    ];
    await monter();
    expect(un('[data-tess-blocage="equalizer-headphone"]')).toBeNull();
  });

  it('les deux clés existent dans les 20 langues, {a}/{b} gardés, aucun « Ã »', () => {
    expect(ONZE_LANGUES).toHaveLength(20);
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const k of ['tess.exclusiveEq', 'tess.refusal.mutually_exclusive_equalizer']) {
        expect(d[k], `${l} ${k}`).toBeTruthy();
        expect(d[k]).not.toContain('Ã');
        for (const m of (en[k].match(/\{\w+\}/g) ?? [])) expect(d[k], `${l} ${k} ${m}`).toContain(m);
      }
    }
  });
});
