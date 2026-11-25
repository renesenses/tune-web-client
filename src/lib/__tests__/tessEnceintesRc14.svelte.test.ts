// @vitest-environment jsdom
//
// rc14 (GO du 25/11, demande de Rémi) — le greffon TESS « Réglage des
// enceintes » (`speaker-setup`) :
//   1. fonctions pures : bornes lues dans le `settings_schema`, réglages
//      complets (un champ inconnu survit), délais (écart avec l'enceinte la
//      plus lointaine, 343 m/s), réserve des gains positifs, voies qui
//      arrivent au greffon, noms des voies ;
//   2. ordre : `before_upsampling` ferme la liste, même après la
//      réaffectation (`last_plugin`) ;
//   3. panneau : une ligne par voie (nom, distance et délai, gain, phase),
//      inversion globale, texte d'aide ; chaque geste part par
//      `PUT /zones/{id}/tess` avec des réglages complets ;
//   4. les clés neuves existent dans les 20 langues, traduites.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import { activeView } from '../stores/navigation';
import { zones, currentZoneId } from '../stores/zones';
import { licenseState } from '../stores/license';
import { capaciteTess } from '../stores/tess';
import { locale } from '../i18n';
import type { CatalogueTess, ChaineTess, DescripteurGreffonTess, LienGreffonTess } from '../tess';
import { ajouterGreffon, ordreValide } from '../tess';
import {
  genrePanneau, bornesEnceintes, reglagesEnceintes, voiesAffichees, retardsMs, reserveEnceintesDb, avecVoieEnceinte,
  avecInversionGlobale, lireNombre, voiesQuiArrivent, cleNomDeVoie, BORNES_ENCEINTES_DEFAUT, ID_ENCEINTES,
} from '../tessPanneaux';
import { ServeurTessSimule, catalogueSimule } from '../tessSimulation';
import TessV2 from '../../components/v2/tess/TessV2.svelte';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });

const ZONE = 7;

/** Le descripteur que publie un serveur rc14 (`catalogue_de_reference`). */
function descripteurEnceintes(): DescripteurGreffonTess {
  return {
    id: ID_ENCEINTES,
    name: 'Speaker setup',
    category: 'room_and_filters',
    entitlement: 'free',
    feature: null,
    origin: 'reference',
    settings_schema: {
      type: 'object',
      properties: {
        channels: {
          type: 'array',
          maxItems: 16,
          items: {
            type: 'object',
            properties: {
              distance_cm: { type: 'number', minimum: 0, maximum: 2000, default: 300 },
              gain_db: { type: 'number', minimum: -20, maximum: 10, default: 0 },
              invert: { type: 'boolean', default: false },
            },
            additionalProperties: false,
          },
        },
        invert_all: { type: 'boolean', default: false },
      },
      additionalProperties: false,
    },
    placement: { channels: 'any', position: 'before_upsampling', exclusive_group: null },
  } as DescripteurGreffonTess;
}

function catalogueRc14(): CatalogueTess {
  const c = catalogueSimule();
  c.plugins.push(descripteurEnceintes());
  return c;
}

// ── 1. Fonctions pures ──────────────────────────────────────────────────────

describe('rc14 — réglage des enceintes : fonctions pures', () => {
  it('le genre de panneau', () => {
    expect(genrePanneau(ID_ENCEINTES)).toBe('enceintes');
  });

  it('🔴 bornes lues dans le schéma publié ; repli sur les bornes rc14 sans schéma', () => {
    expect(bornesEnceintes(catalogueRc14())).toEqual(BORNES_ENCEINTES_DEFAUT);
    const c = catalogueRc14();
    const p = (c.plugins.at(-1)!.settings_schema as any).properties;
    p.channels.items.properties.gain_db.maximum = 6;
    p.channels.maxItems = 8;
    expect(bornesEnceintes(c).gain).toEqual({ min: -20, max: 6 });
    expect(bornesEnceintes(c).voiesMax).toBe(8);
    // Serveur ancien (schéma minimal) ou greffon absent : les bornes rc14.
    expect(bornesEnceintes(catalogueSimule())).toEqual(BORNES_ENCEINTES_DEFAUT);
  });

  it('🔴 une voie absente n’est PAS complétée : elle reste hors calcul ; champ inconnu conservé', () => {
    const s = { channels: [{ distance_cm: 250, futur: 1 }], invert_all: true, autre: 'x' };
    const r = reglagesEnceintes(s);
    expect(r.channels).toEqual([{ distance_cm: 250, futur: 1 }]);
    expect((r as any).autre).toBe('x');
    const v = voiesAffichees(s, 2);
    expect(v[0]).toEqual({ distance_cm: 250, gain_db: 0, invert: false });
    expect(v[1]).toEqual({ distance_cm: null, gain_db: 0, invert: false });
    // Aucune voie n'a de délai tant qu'une seule a une distance.
    expect(retardsMs(v)).toEqual([0, 0]);
  });

  it('🔴 délai = écart avec l’enceinte la plus lointaine, à 343 m/s ; voie sans distance : aucun', () => {
    const v = voiesAffichees({ channels: [{ distance_cm: 343 }, { distance_cm: 0 }, { distance_cm: 171.5 }, {}] }, 4);
    const d = retardsMs(v);
    expect(d[0]).toBe(0);
    expect(d[1]).toBeCloseTo(10, 9);
    expect(d[2]).toBeCloseTo(5, 9);
    expect(d[3]).toBe(0);
  });

  it('réserve : le plus grand gain positif, retiré à toutes les voies', () => {
    expect(reserveEnceintesDb(voiesAffichees({ channels: [{ gain_db: 4 }, { gain_db: -2 }] }, 2))).toBe(-4);
    expect(reserveEnceintesDb(voiesAffichees({ channels: [{ gain_db: -1 }] }, 2))).toBe(0);
  });

  it('🔴 un geste ne change QUE sa voie ; les voies intercalées restent sans distance', () => {
    const s = avecVoieEnceinte({ channels: [{ distance_cm: 280, x: 1 }] }, 2, 'gain_db', 14) as any;
    expect(s.channels).toEqual([{ distance_cm: 280, x: 1 }, {}, { gain_db: 10 }]);
    expect((avecVoieEnceinte(s, 0, 'distance_cm', -5) as any).channels[0]).toEqual({ distance_cm: 0, x: 1 });
    expect((avecVoieEnceinte(s, 0, 'distance_cm', 312.26) as any).channels[0].distance_cm).toBe(312.5);
    expect((avecVoieEnceinte(s, 1, 'invert', true) as any).channels).toEqual([{ distance_cm: 280, x: 1 }, { invert: true }, { gain_db: 10 }]);
    expect((avecInversionGlobale(s, true) as any).invert_all).toBe(true);
  });

  it('🔴 une saisie vide ou illisible est REFUSÉE (jamais 0)', () => {
    expect(lireNombre('')).toBeNull();
    expect(lireNombre('  ')).toBeNull();
    expect(lireNombre('abc')).toBeNull();
    expect(lireNombre('−3,5')).toBe(-3.5);
    expect(avecVoieEnceinte({ channels: [{ distance_cm: 280 }] }, 0, 'distance_cm', null)).toBeNull();
  });

  it('🔴 voies qui arrivent : résolues par le serveur, sinon réaffectation, sinon source', () => {
    const chaine = (plugins: LienGreffonTess[]): ChaineTess => ({ version: 1, plugins } as ChaineTess);
    const source = (n: number) => ({ code: 'source', plugin_id: null, params: { channels: n } }) as any;
    const etape = (n: number) => ({ code: 'plugin', plugin_id: ID_ENCEINTES, params: { channels: n } }) as any;
    expect(voiesQuiArrivent({ chain: chaine([]), signal_path: [source(2), etape(6)] })).toBe(6);
    const ra: LienGreffonTess = { id: 'channel-remap', enabled: true, settings: { inputs: 2, outputs: 4, gains_db: [] } };
    expect(voiesQuiArrivent({ chain: chaine([ra]), signal_path: [source(2)] })).toBe(4);
    expect(voiesQuiArrivent({ chain: chaine([{ ...ra, enabled: false }]), signal_path: [source(1)] })).toBe(1);
    expect(voiesQuiArrivent(null)).toBe(2);
  });

  it('noms des voies : dispositions usuelles, « Voie n » au-delà', () => {
    expect(cleNomDeVoie(0, 1)).toBe('tess.spk.ch.mono');
    expect([0, 1].map((i) => cleNomDeVoie(i, 2))).toEqual(['tess.spk.ch.fl', 'tess.spk.ch.fr']);
    expect([2, 3, 4, 5].map((i) => cleNomDeVoie(i, 6))).toEqual(['tess.spk.ch.fc', 'tess.spk.ch.lfe', 'tess.spk.ch.bl', 'tess.spk.ch.br']);
    expect(cleNomDeVoie(9, 12)).toBeNull();
  });
});

// ── 2. Ordre ────────────────────────────────────────────────────────────────

describe('rc14 — réglage des enceintes : il ferme la liste', () => {
  const lien = (id: string): LienGreffonTess => ({ id, enabled: true, settings: null });

  it('🔴 accepté APRÈS la réaffectation ; un greffon ordinaire après lui est refusé', () => {
    const c = catalogueRc14();
    expect(ordreValide([lien('equalizer-graphic'), lien('channel-remap'), lien(ID_ENCEINTES)], c)).toBe(true);
    expect(ordreValide([lien(ID_ENCEINTES), lien('crossfeed')], c)).toBe(false);
    // Contre-épreuve : la réaffectation reste dernière des greffons ordinaires.
    expect(ordreValide([lien('channel-remap'), lien('crossfeed'), lien(ID_ENCEINTES)], c)).toBe(false);
  });

  it('« + Ajouter » : en fin de liste ; un greffon ajouté ensuite passe avant lui', () => {
    const c = catalogueRc14();
    const base = { version: 1, plugins: [lien('equalizer-graphic'), lien('channel-remap')] } as ChaineTess;
    const avec = ajouterGreffon(base, c, ID_ENCEINTES, false)!;
    expect(avec.plugins!.map((l) => l.id)).toEqual(['equalizer-graphic', 'channel-remap', ID_ENCEINTES]);
    expect(avec.plugins!.at(-1)!.enabled).toBe(true); // Free : coché d'office
    const ensuite = ajouterGreffon(avec, c, 'crossfeed', false)!;
    expect(ensuite.plugins!.map((l) => l.id)).toEqual(['equalizer-graphic', 'crossfeed', 'channel-remap', ID_ENCEINTES]);
  });
});

// ── 3. Panneau ──────────────────────────────────────────────────────────────

function reponseJson(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
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
async function apresLeGeste() {
  await new Promise((r) => setTimeout(r, 420));
  await laisserTourner();
}
const un = <T extends HTMLElement = HTMLElement>(sel: string) => hote!.querySelector<T>(sel);
const tous = (sel: string) => Array.from(hote!.querySelectorAll<HTMLElement>(sel));
const dernierPut = () => serveur.puts.filter((p) => p.zoneId === ZONE).at(-1)!.corps as ChaineTess;
const reglagesPutes = () => (dernierPut().plugins ?? []).find((l) => l.id === ID_ENCEINTES)!.settings as any;
function changer(el: HTMLInputElement, valeur: string) {
  el.value = valeur;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

describe('rc14 — réglage des enceintes : le panneau', () => {
  beforeEach(() => {
    serveur = new ServeurTessSimule();
    serveur.avecCatalogue = true;
    serveur.catalogue = catalogueRc14();
    serveur.zones.set(ZONE, {
      transport: 'local',
      chain: {
        version: 1,
        bypass_all: false,
        plugins: [
          { id: 'equalizer-graphic', enabled: true, settings: null },
          {
            id: ID_ENCEINTES, enabled: true,
            settings: { channels: [{ distance_cm: 343, gain_db: 0, invert: false }, { distance_cm: 0, gain_db: -3, invert: false }], invert_all: false },
          },
        ],
      } as ChaineTess,
    });
    vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
    if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
    vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
      const u = String(url);
      if (/\/tess(\/|\?|$)/.test(u)) return serveur.fetch(u, init);
      return reponseJson([]);
    }));
    hote = document.createElement('div');
    document.body.appendChild(hote);
    activeView.set('tess');
    capaciteTess.set('inconnue');
    zones.set([{ id: ZONE, name: 'salon', output_type: 'local' } as any]);
    currentZoneId.set(ZONE);
    licenseState.update((s) => ({ ...s, tier: 'free' }));
    locale.set('en');
  });

  afterEach(() => {
    if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
    hote?.remove();
    hote = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function ouvrir() {
    monte = mount(TessV2, { target: hote! });
    await laisserTourner();
    un(`[data-tess-greffon="${ID_ENCEINTES}"] .choisir`)!.click();
    flushSync();
    await laisserTourner(5);
  }

  it('🔴 une ligne par voie : nom, distance et délai, gain, phase ; aide et inversion globale', async () => {
    await ouvrir();
    expect(un('[data-tess-genre="enceintes"]')).not.toBeNull();
    expect(un('[data-tess-enceintes]')!.dataset.tessVoies).toBe('2');
    const lignes = tous('[data-tess-voie]');
    expect(lignes).toHaveLength(2);
    expect(lignes[0].querySelector('th')!.textContent).toBe('Front left');
    expect(lignes[1].querySelector('th')!.textContent).toBe('Front right');
    expect(un<HTMLInputElement>('[data-tess-spk-distance="0"]')!.value).toBe('343');
    expect(un('[data-tess-spk-delai="0"]')!.textContent).toBe('0.00 ms');
    expect(un('[data-tess-spk-delai="1"]')!.textContent).toBe('10.00 ms');
    expect(un<HTMLInputElement>('[data-tess-spk-gain="1"]')!.value).toBe('-3');
    expect(un('[data-tess-spk-phase="0"]')).not.toBeNull();
    expect(un('[data-tess-spk-inversion-globale]')).not.toBeNull();
    const aide = un('[data-tess-enceintes-aide]')!.textContent!;
    expect(aide).toMatch(/distances first/);
    expect(aide).toMatch(/sound level meter or a calibrated microphone/);
    expect(un('[data-tess-spk-latence]')!.textContent).toContain('10.00 ms');
    // Aucun gain positif : pas de réserve annoncée.
    expect(un('[data-tess-spk-reserve]')).toBeNull();
  });

  it('🔴 distance, gain, phase et inversion globale partent par `PUT`, réglages complets', async () => {
    await ouvrir();
    changer(un<HTMLInputElement>('[data-tess-spk-distance="1"]')!, '171.5');
    await apresLeGeste();
    expect(reglagesPutes().channels).toEqual([
      { distance_cm: 343, gain_db: 0, invert: false },
      { distance_cm: 171.5, gain_db: -3, invert: false },
    ]);
    expect(un('[data-tess-spk-delai="1"]')!.textContent).toBe('5.00 ms');
    // Le reste de la chaîne n'a pas bougé.
    expect(dernierPut().plugins!.map((l) => l.id)).toEqual(['equalizer-graphic', ID_ENCEINTES]);

    changer(un<HTMLInputElement>('[data-tess-spk-gain="0"]')!, '4');
    await apresLeGeste();
    expect(reglagesPutes().channels[0].gain_db).toBe(4);
    expect(un('[data-tess-spk-reserve]')!.textContent).toContain('−4.0 dB');

    const phase = un<HTMLInputElement>('[data-tess-spk-phase="1"]')!;
    phase.click();
    flushSync();
    await apresLeGeste();
    expect(reglagesPutes().channels[1].invert).toBe(true);

    un<HTMLInputElement>('[data-tess-spk-inversion-globale]')!.click();
    flushSync();
    await apresLeGeste();
    expect(reglagesPutes().invert_all).toBe(true);
  });

  it('🔴 saisie vide : refusée, la valeur d’avant revient, rien ne part', async () => {
    await ouvrir();
    const avant = serveur.puts.length;
    const champ = un<HTMLInputElement>('[data-tess-spk-distance="1"]')!;
    changer(champ, '');
    await apresLeGeste();
    expect(serveur.puts.length).toBe(avant);
    expect(champ.value).toBe('0');
    changer(un<HTMLInputElement>('[data-tess-spk-gain="0"]')!, 'abc');
    await apresLeGeste();
    expect(serveur.puts.length).toBe(avant);
  });

  it('🔴 voie sans réglage : affichée sans distance ni délai ; un geste sur elle ne touche pas l’autre', async () => {
    const z = serveur.zones.get(ZONE)!;
    (z.chain.plugins!.find((l) => l.id === ID_ENCEINTES) as any).settings = { channels: [{ distance_cm: 280, futur: 1 }] };
    await ouvrir();
    expect(un<HTMLInputElement>('[data-tess-spk-distance="1"]')!.value).toBe('');
    expect(un('[data-tess-spk-delai="1"]')!.textContent).toBe('—');
    changer(un<HTMLInputElement>('[data-tess-spk-gain="1"]')!, '-2');
    await apresLeGeste();
    expect(reglagesPutes().channels).toEqual([{ distance_cm: 280, futur: 1 }, { gain_db: -2 }]);
  });

  it('les voies suivent la réaffectation cochée (4 sorties ⇒ 4 lignes)', async () => {
    const z = serveur.zones.get(ZONE)!;
    z.chain.plugins!.splice(1, 0, { id: 'channel-remap', enabled: true, settings: { inputs: 2, outputs: 4, gains_db: [[0, null], [null, 0], [null, null], [null, null]], normalize: true, preset: null } });
    await ouvrir();
    expect(tous('[data-tess-voie]')).toHaveLength(4);
    expect(tous('[data-tess-voie] th').map((t) => t.textContent)).toEqual(['Front left', 'Front right', 'Rear left', 'Rear right']);
  });
});

// ── 4. Langues ──────────────────────────────────────────────────────────────

describe('rc14 — réglage des enceintes : 20 langues', () => {
  const CLES = [
    'tess.plugin.speaker-setup', 'tess.desc.speaker-setup', 'tess.spk.help', 'tess.spk.channelsNote',
    'tess.spk.channel', 'tess.spk.distance', 'tess.spk.cm', 'tess.spk.delay', 'tess.spk.gain', 'tess.spk.phase', 'tess.spk.invert',
    'tess.spk.invertAll', 'tess.spk.latency', 'tess.spk.reserve', 'tess.reason.neutral_settings',
    ...['mono', 'fl', 'fr', 'fc', 'lfe', 'bl', 'br', 'sl', 'sr', 'bc', 'other'].map((c) => `tess.spk.ch.${c}`),
  ];

  it('🔴 chaque clé existe dans les 20 langues, avec ses paramètres', () => {
    expect(ONZE_LANGUES).toHaveLength(20);
    const en = dictionnaire('en');
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const k of CLES) {
        expect(typeof d[k], `${l} ${k}`).toBe('string');
        expect(d[k].length, `${l} ${k}`).toBeGreaterThan(0);
        for (const p of en[k].match(/\{\w+\}/g) ?? []) expect(d[k], `${l} ${k}`).toContain(p);
      }
    }
  });

  it('les textes longs sont TRADUITS (pas une copie de l’anglais)', () => {
    const en = dictionnaire('en');
    for (const l of ONZE_LANGUES.filter((x) => x !== 'en')) {
      const d = dictionnaire(l);
      for (const k of ['tess.spk.help', 'tess.desc.speaker-setup', 'tess.spk.invertAll', 'tess.spk.channelsNote', 'tess.spk.reserve']) {
        expect(d[k], `${l} ${k}`).not.toBe(en[k]);
      }
    }
  });
});

describe('rc14 — réglage des enceintes : la réserve se rattrape au volume', () => {
  it('le texte de la réserve dit que le niveau global baisse et qu’on le rattrape au volume', () => {
    expect(dictionnaire('en')['tess.spk.reserve']).toMatch(/overall level drops.*volume/);
    expect(dictionnaire('fr')['tess.spk.reserve']).toMatch(/niveau global baisse.*volume/);
  });
});
