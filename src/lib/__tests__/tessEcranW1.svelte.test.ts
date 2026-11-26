// @vitest-environment jsdom
//
// Lot TESS W1 — coquille de l'écran TESS (maquette A1, contrat T01).
//
// Ce que ces témoins prouvent, sur des composants réellement montés et un
// serveur SIMULÉ conforme au contrat (`lib/tessSimulation`, l'API T08 n'étant
// pas encore publiée) :
//   1. CACHÉ sans capacité serveur : face à un serveur sans TESS (404), ni
//      entrée « TESS » dans la barre, ni pastille dans la barre de lecture,
//      et les anciennes entrées (Égaliseur, Crossfeed…) restent ; avec TESS,
//      l'entrée apparaît et les quatre anciennes entrées RESTENT (leur retrait
//      est le lot W8 ; Declick, outil de fichiers, reste aussi : décision Q4) ;
//      l'adresse `#tess` sur un serveur sans TESS ramène à l'accueil, sans
//      lire les préréglages ; une seule sonde de capacité par connexion ;
//   2. ORDRE AFFICHÉ = ORDRE RENVOYÉ : l'écran suit `signal_path` à la lettre,
//      même quand il diffère de l'ordre de `chain.plugins` ; Q9 (Upsampling
//      avant Volume, Dither en dernier) et l'exception DSD ;
//   3. EXCLUSIVITÉ du groupe crossfeed / Crossfeed Pro / Crosstalk : la case
//      du second membre est bloquée, la raison est écrite, et aucun `PUT`
//      ne part ; un membre ajouté arrive décoché ;
//   4. GLISSER-DÉPOSER (et flèches du clavier) : le `PUT` porte le nouvel
//      ordre, l'écran se redessine depuis la réponse ; la réaffectation des
//      canaux ne quitte pas la dernière place.
//
// Ce qu'ils ne prouvent pas : jsdom ne fait ni mise en page ni vrai
// glisser-déposer natif (les événements sont émis à la main), et l'API réelle
// (T08) n'est pas encore là pour une épreuve de bout en bout.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

import { preferences } from '../stores/preferences';
import { activeView } from '../stores/navigation';
import { activeStreamingService, streamingServices } from '../stores/streaming';
import { shortcuts } from '../stores/shortcuts';
import { etatGreffons } from '../stores/greffonsStudio';
import { presenceCrossfeedPro } from '../stores/crossfeedPro';
import { presenceCrosstalk } from '../stores/crosstalk';
import { zones, currentZoneId } from '../stores/zones';
import { licenseState } from '../stores/license';
import { capaciteTess, entreesAvecTess, sonderTess, suivreConnexionTess, renvoyerHorsTessSansCapacite } from '../stores/tess';
import { locale } from '../i18n';
import {
  lignesDuChemin, conflitExclusif, basculerGreffon, ajouterGreffon, deplacerGreffon,
  type ChaineTess, type ReponseTessZone,
} from '../tess';
import { ServeurTessSimule, catalogueSimule, chaineA1 } from '../tessSimulation';
import Sidebar from '../../components/v2/Sidebar.svelte';
import TessV2 from '../../components/v2/tess/TessV2.svelte';
import PastilleTess from '../../components/v2/tess/PastilleTess.svelte';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

vi.setConfig({ testTimeout: 60_000 });

const en = dictionnaire('en');
const ZONE = 7;

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
async function monter(composant: any) {
  monte = mount(composant, { target: hote! });
  await laisserTourner();
}
const tous = (sel: string) => Array.from(hote!.querySelectorAll<HTMLElement>(sel));
const un = (sel: string) => hote!.querySelector<HTMLElement>(sel);
const evenement = (el: Element, type: string, init: Record<string, unknown> = {}) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, init);
  el.dispatchEvent(e);
};
const putsDeZone = () => serveur.puts.filter((p) => p.zoneId === ZONE);
const idsDuPut = (i = -1) => ((putsDeZone().at(i)!.corps as ChaineTess).plugins ?? []).map((p) => p.id);

beforeEach(() => {
  serveur = new ServeurTessSimule();
  serveur.zones.set(ZONE, { transport: 'oaat', chain: chaineA1(), volume_db: -18 });
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    if (/\/tess(\/|\?|$)/.test(u)) return serveur.fetch(u, init);
    if (/\/plugins(\?|$)/.test(u)) return reponseJson([]);
    if (/\/streaming\/services/.test(u)) return reponseJson({});
    if (/\/config/.test(u)) return reponseJson({});
    return reponseJson([]);
  }));
  Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true, writable: true });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  shortcuts.set([]);
  activeStreamingService.set(null);
  streamingServices.set({});
  activeView.set('home');
  etatGreffons.set(null);
  presenceCrossfeedPro.set('actif');
  presenceCrosstalk.set('actif');
  capaciteTess.set('inconnue');
  zones.set([{ id: ZONE, name: 'atelier', output_type: 'oaat' } as any]);
  currentZoneId.set(ZONE);
  licenseState.update((s) => ({ ...s, tier: 'premium' }));
  locale.set('en');
  preferences.update((p) => ({ ...p, settingsLevel: 'expert', barreLaterale: null as any, barreGroupesReplies: [] }));
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote?.remove();
  hote = null;
  licenseState.update((s) => ({ ...s, tier: 'free' }));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const vuesDeLaBarre = () => tous('button.nav[data-vue]').map((b) => b.dataset.vue!);
/** Les sondes de la barre ont lu un faux serveur : on pose les deux greffons
 *  natifs tiers comme ACTIFS, pour voir ce que TESS fait de leurs entrées. */
function natifsActifs() {
  presenceCrossfeedPro.set('actif');
  presenceCrosstalk.set('actif');
  flushSync();
}

describe('W1 — 1. caché sans la capacité serveur', () => {
  it('🔴 serveur SANS TESS (404) : ni entrée TESS ni pastille ; Égaliseur, Crossfeed, Crosstalk restent', async () => {
    serveur.avecTess = false;
    await monter(Sidebar);
    natifsActifs();
    expect(get(capaciteTess)).toBe('non');
    const vues = vuesDeLaBarre();
    expect(vues).not.toContain('tess');
    for (const v of ['equalizer', 'crossfeed', 'crossfeedpro', 'crosstalk', 'declick']) expect(vues).toContain(v);
    unmount(monte!); monte = null;
    await monter(PastilleTess);
    expect(un('[data-pastille-tess]')).toBeNull();
  });

  it('🔴 serveur AVEC TESS : l’entrée apparaît (dans le noyau depuis la refonte rc14) ; les anciens écrans de greffons SORTENT (W8), les outils restent', async () => {
    await monter(Sidebar);
    natifsActifs();
    expect(get(capaciteTess)).toBe('oui');
    const vues = vuesDeLaBarre();
    expect(vues).toContain('tess');
    for (const v of ['equalizer', 'crossfeed', 'crossfeedpro', 'crosstalk']) expect(vues, v).not.toContain(v);
    // Hors chaîne : outils sur fichiers et autres outils, sous « Avancé › Outils » ;
    // État du serveur est passé dans le menu de l'avatar (refonte rc14, lot 1).
    for (const v of ['converter', 'declick', 'alarms', 'metadata']) expect(vues, v).toContain(v);
    expect(vues).not.toContain('diagnostics');
    expect(vues.indexOf('tess')).toBeLessThan(vues.indexOf('converter'));
  });

  it('pastille de la barre de lecture : présente avec TESS, et elle ouvre l’écran', async () => {
    capaciteTess.set('oui');
    await monter(PastilleTess);
    const b = un('[data-pastille-tess]')!;
    expect(b).not.toBeNull();
    // Refonte rc14 (lot 1) : symbole seul ; « TESS » est dans le libellé accessible.
    expect(b.getAttribute('aria-label')).toContain('TESS');
    b.click();
    expect(get(activeView)).toBe('tess');
  });

  it('🔴 `#tess` sur un serveur sans TESS : retour à l’accueil, sans chemin et sans lire les préréglages', async () => {
    serveur.avecTess = false;
    const arreter = renvoyerHorsTessSansCapacite();
    try {
      activeView.set('tess');
      await monter(TessV2);
      expect(get(capaciteTess)).toBe('non');
      expect(get(activeView)).toBe('home');
      expect(un('[data-tess-chemin]')).toBeNull();
      const urls = (fetch as any).mock.calls.map((c: any[]) => String(c[0]));
      expect(urls.some((u: string) => /\/tess\/presets/.test(u))).toBe(false);
    } finally {
      arreter();
    }
  });

  it('contre-épreuve : avec TESS, l’adresse `#tess` reste ouverte et les préréglages sont lus une fois', async () => {
    const arreter = renvoyerHorsTessSansCapacite();
    try {
      activeView.set('tess');
      await monter(TessV2);
      expect(get(capaciteTess)).toBe('oui');
      expect(get(activeView)).toBe('tess');
      const urls = (fetch as any).mock.calls.map((c: any[]) => String(c[0]));
      expect(urls.filter((u: string) => /\/tess\/presets/.test(u))).toHaveLength(1);
    } finally {
      arreter();
    }
  });

  it('une seule sonde par connexion : un changement de zone ne relance rien ; une reconnexion relit la capacité', async () => {
    serveur.avecTess = false;
    const sondes = () => (fetch as any).mock.calls.filter((c: any[]) => /\/zones\/\d+\/tess/.test(String(c[0]))).length;
    expect(await sonderTess(ZONE)).toBe('non');
    expect(await sonderTess(ZONE + 1)).toBe('non');
    expect(await sonderTess(ZONE)).toBe('non');
    expect(sondes()).toBe(1);
    // Le flux : la première connexion ne relance rien, une REconnexion oui.
    let h: (e: { type: string }) => void = () => {};
    const arreter = suivreConnexionTess({ onEvent: (f) => { h = f; return () => {}; } }, () => ZONE);
    h({ type: '_connected' });
    await laisserTourner(5);
    expect(sondes()).toBe(1);
    serveur.avecTess = true;
    h({ type: '_disconnected' });
    h({ type: '_connected' });
    await laisserTourner(5);
    expect(sondes()).toBe(2);
    expect(get(capaciteTess)).toBe('oui');
    arreter();
  });

  it('un contrat d’une autre version : l’écran reste caché (les anciens écrans servent)', async () => {
    const reponse = serveur.reponse.bind(serveur);
    serveur.reponse = (id) => ({ ...reponse(id), contract_version: 2 });
    await monter(Sidebar);
    expect(get(capaciteTess)).toBe('non');
    expect(vuesDeLaBarre()).not.toContain('tess');
  });

  it('filtre pur : `tess` seulement avec la capacité ; avec TESS, les anciennes entrées de greffons sortent (W8)', () => {
    const items = ['tess', 'equalizer', 'crossfeed', 'crossfeedpro', 'crosstalk', 'declick'].map((view) => ({ view }));
    expect(entreesAvecTess(items, 'inconnue').map((i) => i.view)).toEqual(['equalizer', 'crossfeed', 'crossfeedpro', 'crosstalk', 'declick']);
    expect(entreesAvecTess(items, 'non').map((i) => i.view)).toEqual(['equalizer', 'crossfeed', 'crossfeedpro', 'crosstalk', 'declick']);
    expect(entreesAvecTess(items, 'oui').map((i) => i.view)).toEqual(['tess', 'declick']);
  });
});

describe('W1 — 2. l’ordre affiché est l’ordre renvoyé par le serveur', () => {
  const ordreAffiche = () => tous('[data-tess-etape], [data-tess-greffon]').map((el) => el.dataset.tessEtape ?? `plugin:${el.dataset.tessGreffon}`);

  it('🔴 Q9 en PCM : Source → Headroom → greffons → Upsampling → Volume → Dither → Output', async () => {
    serveur.zones.get(ZONE)!.chain.fixed!.upsampling = { mode: 'pcm', filter: 'polyvalent', max_ratio: 4, max_rate_hz: null };
    await monter(TessV2);
    expect(ordreAffiche()).toEqual([
      'source', 'headroom', 'plugin:convolution', 'plugin:equalizer-graphic', 'plugin:crossfeed',
      'upsampling', 'volume', 'quantization', 'output',
    ]);
    // Maquette A1 corrigée par Q9 : c'est le Dither qui porte « LAST ».
    expect(un('[data-tess-etape="quantization"] .tag')?.textContent).toContain(en['tess.last']);
    expect(un('[data-tess-etape="upsampling"] .tag')?.textContent).not.toContain(en['tess.last']);
  });

  it('exception DSD : Volume puis modulateur DSD, sans ligne Dither', async () => {
    serveur.zones.get(ZONE)!.chain.fixed!.upsampling = { mode: 'dsd', rate: 'dsd128', filter: 'polyvalent' };
    await monter(TessV2);
    expect(ordreAffiche().slice(-4)).toEqual(['upsampling', 'volume', 'dsd_modulator', 'output']);
  });

  it('🔴 un signal_path dans un AUTRE ordre que chain.plugins : l’écran suit signal_path, sans retrier', async () => {
    const reponse = serveur.reponse.bind(serveur);
    serveur.reponse = (id) => {
      const r = reponse(id);
      const p = r.signal_path;
      // Ordre délibérément inattendu, pour prouver que l'écran ne recalcule rien.
      const parId = (pid: string) => p.find((e) => e.plugin_id === pid)!;
      const code = (c: string) => p.find((e) => e.code === c)!;
      r.signal_path = [code('source'), parId('crossfeed'), code('volume'), parId('convolution'),
        code('headroom'), parId('equalizer-graphic'), code('upsampling'), code('quantization'), code('output')];
      return r;
    };
    await monter(TessV2);
    expect(ordreAffiche()).toEqual([
      'source', 'plugin:crossfeed', 'volume', 'plugin:convolution', 'headroom', 'plugin:equalizer-graphic',
      'upsampling', 'quantization', 'output',
    ]);
  });

  it('lignesDuChemin : un greffon de la chaîne absent du chemin reste gérable, « + Add plugin » après le dernier greffon', () => {
    const r = new ServeurTessSimule();
    r.zones.set(1, { transport: 'local', chain: chaineA1() });
    const z: ReponseTessZone = r.reponse(1);
    z.signal_path = z.signal_path.filter((e) => e.plugin_id !== 'crossfeed');
    const l = lignesDuChemin(z);
    const genres = l.map((x) => (x.genre === 'greffon' ? x.lien.id : x.genre === 'ajout' ? 'ajout' : x.etape.code));
    expect(genres).toEqual(['source', 'headroom', 'convolution', 'equalizer-graphic', 'crossfeed', 'ajout',
      'upsampling', 'volume', 'quantization', 'output']);
  });
});

describe('W1 — 3. exclusivité crossfeed / Crossfeed Pro / Crosstalk', () => {
  beforeEach(() => {
    serveur.zones.get(ZONE)!.chain.plugins = [
      { id: 'crosstalk', enabled: true, settings: null },
      { id: 'crossfeed', enabled: false, settings: null },
    ];
  });

  it('🔴 la case du second membre est bloquée, la raison est écrite, et aucun PUT ne part', async () => {
    await monter(TessV2);
    const caseCf = un('[data-tess-case="crossfeed"]') as HTMLInputElement;
    expect(caseCf.disabled).toBe(true);
    const texte = un('[data-tess-blocage="crossfeed"]')?.textContent ?? '';
    expect(texte).toContain('Crosstalk');
    expect(texte).toContain('Crossfeed');
    expect(texte).toBe(en['tess.exclusive'].replace(/\{a\}/g, 'Crossfeed').replace(/\{b\}/g, 'Crosstalk'));
    // Même forcée (case réactivée à la main), la coche n'envoie rien.
    caseCf.disabled = false;
    caseCf.checked = true;
    evenement(caseCf, 'change');
    await laisserTourner();
    expect(putsDeZone()).toHaveLength(0);
    expect(un('[data-tess-message]')?.textContent).toContain('Crosstalk');
    expect(caseCf.checked).toBe(false);
  });

  it('décocher Crosstalk libère la case du crossfeed', async () => {
    await monter(TessV2);
    const caseXt = un('[data-tess-case="crosstalk"]') as HTMLInputElement;
    caseXt.checked = false;
    evenement(caseXt, 'change');
    await laisserTourner();
    expect((putsDeZone()[0].corps as ChaineTess).plugins).toEqual([
      { id: 'crosstalk', enabled: false, settings: null },
      { id: 'crossfeed', enabled: false, settings: null },
    ]);
    expect((un('[data-tess-case="crossfeed"]') as HTMLInputElement).disabled).toBe(false);
    expect(un('[data-tess-blocage="crossfeed"]')).toBeNull();
  });

  it('ajouter Crossfeed Pro pendant que Crosstalk est actif : il arrive DÉCOCHÉ', async () => {
    await monter(TessV2);
    (un('[data-tess-ajouter]') as HTMLButtonElement).click();
    await laisserTourner(3);
    (un('[data-tess-ajout="crossfeed-pro"]') as HTMLButtonElement).click();
    await laisserTourner();
    const pro = (putsDeZone()[0].corps as ChaineTess).plugins!.find((p) => p.id === 'crossfeed-pro');
    expect(pro?.enabled).toBe(false);
  });

  it('le refus 409 du serveur (chaîne venue d’ailleurs) est affiché, pas avalé', async () => {
    serveur.zones.get(ZONE)!.chain.plugins = [{ id: 'crossfeed', enabled: true, settings: null }];
    await monter(TessV2);
    // Une seconde fenêtre a coché Crosstalk entre-temps : notre vue est périmée.
    const base = serveur.valider.bind(serveur);
    serveur.valider = () => ({ status: 409, code: 'mutually_exclusive', detail: 'x', plugin_id: 'crosstalk' });
    (un('[data-tess-bypass]') as HTMLInputElement).checked = true;
    evenement(un('[data-tess-bypass]')!, 'change');
    await laisserTourner();
    expect(un('[data-tess-message]')?.textContent).toBe(en['tess.refusal.mutually_exclusive']);
    serveur.valider = base;
  });

  it('fonctions pures : conflit, coche refusée, ajout décoché', () => {
    const cat = catalogueSimule();
    const c: ChaineTess = { version: 1, plugins: [{ id: 'crosstalk', enabled: true }, { id: 'crossfeed', enabled: false }] };
    expect(conflitExclusif(c, cat, 'crossfeed')).toBe('crosstalk');
    expect(basculerGreffon(c, cat, 'crossfeed', true)).toBeNull();
    expect(basculerGreffon(c, cat, 'crosstalk', false)!.plugins![0].enabled).toBe(false);
    // Paquet tiers déjà publié, hors catalogue : reconnu par son préfixe.
    expect(conflitExclusif(c, cat, 'crossfeed-maison')).toBe('crosstalk');
    expect(ajouterGreffon(c, cat, 'crossfeed-pro', true)!.plugins!.at(-1)).toEqual({ id: 'crossfeed-pro', enabled: false, settings: null });
  });
});

describe('W1 — 4. glisser-déposer', () => {
  const lignes = () => tous('[data-tess-greffon]').map((el) => el.dataset.tessGreffon);

  it('🔴 glisser Convolution sous Crossfeed : le PUT porte le nouvel ordre, l’écran suit la réponse', async () => {
    await monter(TessV2);
    expect(lignes()).toEqual(['convolution', 'equalizer-graphic', 'crossfeed']);
    evenement(un('[data-tess-greffon="convolution"]')!, 'dragstart');
    evenement(un('[data-tess-greffon="crossfeed"]')!, 'dragover');
    evenement(un('[data-tess-greffon="crossfeed"]')!, 'drop');
    await laisserTourner();
    expect(putsDeZone()).toHaveLength(1);
    expect(idsDuPut()).toEqual(['equalizer-graphic', 'crossfeed', 'convolution']);
    expect(lignes()).toEqual(['equalizer-graphic', 'crossfeed', 'convolution']);
  });

  it('au clavier : flèche bas sur la poignée descend le greffon d’un cran', async () => {
    await monter(TessV2);
    const poignee = un('[data-tess-greffon="equalizer-graphic"] [data-tess-poignee]')!;
    evenement(poignee, 'keydown', { key: 'ArrowDown' });
    await laisserTourner();
    expect(idsDuPut()).toEqual(['convolution', 'crossfeed', 'equalizer-graphic']);
  });

  it('la réaffectation des canaux ne quitte pas la dernière place (aucun PUT, message)', async () => {
    serveur.zones.get(ZONE)!.chain.plugins!.push({ id: 'channel-remap', enabled: true, settings: null });
    await monter(TessV2);
    evenement(un('[data-tess-greffon="channel-remap"]')!, 'dragstart');
    evenement(un('[data-tess-greffon="convolution"]')!, 'drop');
    await laisserTourner();
    expect(putsDeZone()).toHaveLength(0);
    expect(un('[data-tess-message]')?.textContent).toBe(en['tess.cantMove']);
    // Et un ajout se range AVANT elle.
    const cat = catalogueSimule();
    const c = ajouterGreffon(serveur.zones.get(ZONE)!.chain, cat, 'mono-downmix', true)!;
    expect(c.plugins!.map((p) => p.id).slice(-2)).toEqual(['mono-downmix', 'channel-remap']);
    expect(deplacerGreffon(c, cat, c.plugins!.length - 1, 0)).toBeNull();
  });
});

describe('W1 — gestes et contrat', () => {
  it('cocher, retirer, « Bypass all » : chaque geste envoie la chaîne entière', async () => {
    await monter(TessV2);
    const caseCf = un('[data-tess-case="crossfeed"]') as HTMLInputElement;
    caseCf.checked = true;
    evenement(caseCf, 'change');
    await laisserTourner();
    expect((putsDeZone().at(-1)!.corps as ChaineTess).plugins!.find((p) => p.id === 'crossfeed')!.enabled).toBe(true);
    (un('[data-tess-retirer="equalizer-graphic"]') as HTMLButtonElement).click();
    await laisserTourner();
    expect(idsDuPut()).toEqual(['convolution', 'crossfeed']);
    const bypass = un('[data-tess-bypass]') as HTMLInputElement;
    bypass.checked = true;
    evenement(bypass, 'change');
    await laisserTourner();
    expect((putsDeZone().at(-1)!.corps as ChaineTess).bypass_all).toBe(true);
    // Les réglages du greffon ne sont jamais perdus en route.
    expect((putsDeZone().at(-1)!.corps as ChaineTess).plugins![0].settings).toEqual({ filter_set: 'living-room.zip' });
  });

  it('compte gratuit : un greffon Premium décoché ne peut pas être coché, la raison est écrite', async () => {
    licenseState.update((s) => ({ ...s, tier: 'free' }));
    serveur.premium = false;
    serveur.zones.get(ZONE)!.chain.plugins = [{ id: 'convolution', enabled: false, settings: null }];
    await monter(TessV2);
    expect((un('[data-tess-case="convolution"]') as HTMLInputElement).disabled).toBe(true);
    expect(un('[data-tess-blocage="convolution"]')?.textContent).toBe(en['tess.premiumRequired'].replace('{name}', 'Convolution'));
  });

  it('zone HQPlayer : le motif est affiché (Q8)', async () => {
    serveur.zones.get(ZONE)!.transport = 'hqplayer';
    await monter(TessV2);
    expect(un('[data-tess-hors]')?.textContent?.trim()).toBe(en['tess.outside.hqplayer_own_processing']);
  });

  it('la chaîne renvoyée part du JSON brut : un champ inconnu (serveur plus récent) est conservé', () => {
    const c = { ...chaineA1(), futur: { a: 1 } } as ChaineTess;
    c.plugins![0] = { ...c.plugins![0], extra: true };
    const b = basculerGreffon(c, catalogueSimule(), 'crossfeed', true)!;
    expect(b.futur).toEqual({ a: 1 });
    expect(b.plugins![0].extra).toBe(true);
  });

  it('le catalogue simulé suit les décisions : 11 greffons, Mono downmix et Crossfeed Free, Parametric EQ et Declick Premium', () => {
    const cat = catalogueSimule();
    const droit = (id: string) => cat.plugins.find((p) => p.id === id)!.entitlement;
    expect(cat.plugins).toHaveLength(11);
    expect([droit('mono-downmix'), droit('crossfeed')]).toEqual(['free', 'free']);
    expect([droit('equalizer-parametric'), droit('declick-live')]).toEqual(['premium', 'premium']);
  });

  it('les libellés TESS existent dans les seize langues', () => {
    const cles = Object.keys(dictionnaire('en')).filter((k) => k.startsWith('tess.') || k === 'v2.nav.tess');
    expect(cles.length).toBeGreaterThan(100);
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const k of cles) expect(d[k], `${l} ${k}`).toBeTruthy();
    }
  });
});
