// @vitest-environment jsdom
//
// Refonte de l'écran TESS (rc14, lot 2) — retours de Rémi, GO de Bertrand du
// 25/11. Spécification : coordination/spec-refonte-ux-tess-rc14.md, § 4.
// Un bloc par critère d'acceptation du lot 2 :
//   C3  ouverture avec un greffon demandé (contrat `stores/tessOuverture.ts`) ;
//   C4  plus de sélecteur de zone : l'écran suit la zone courante ;
//   C5  préréglages à droite de « Signal path », surcouche fermée après succès ;
//   C7  interrupteurs partout, plus aucune case à cocher ;
//   C8  Premium visibles, grisés et cadenassés en Free ;
//   C9  éditeur paramétrique : pas de section du haut, pas de « Modifier »,
//       glisser direct, échelle asymétrique et adaptative, bornes publiées ;
//   C11 (voir tessEcranW2 § 5) ; C12 Headroom ; C13 « À l'oreille » ;
//   anciens préréglages d'égaliseur et import PEQ (décisions du 25/11).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

import { activeView } from '../stores/navigation';
import { zones, currentZoneId } from '../stores/zones';
import { licenseState } from '../stores/license';
import { capaciteTess } from '../stores/tess';
import { greffonTessDemande, ouvrirTess } from '../stores/tessOuverture';
import { locale } from '../i18n';
import type { ChaineTess, LienGreffonTess, PreReglagesTess } from '../tess';
import {
  bornesGain, avecHeadroom, headroomDe, avecTonalite, modeEgaliseur, environnementNeutre,
  chaineAvecAncienPreReglage, BORNES_GAIN_DEFAUT, notesOrdreReel, ordreSuivi,
} from '../tessPanneaux';
import { ServeurTessSimule, chaineA1, catalogueSimule } from '../tessSimulation';
import { GRILLES_EQ } from '../eqGrilles';
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
let urls: string[] = [];
let anciens: unknown[] = [];
let apercuPeq: { status: number; corps: unknown } = { status: 404, corps: {} };

async function laisserTourner(n = 30) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}
const apresLeGeste = async () => { await new Promise((r) => setTimeout(r, 420)); await laisserTourner(); };
async function monter() {
  monte = mount(TessV2, { target: hote! });
  await laisserTourner();
}
const un = <T extends HTMLElement = HTMLElement>(sel: string) => hote!.querySelector<T>(sel);
const tous = (sel: string) => Array.from(hote!.querySelectorAll<HTMLElement>(sel));
const putsDeZone = (z = ZONE) => serveur.puts.filter((p) => p.zoneId === z);
const dernierPut = () => putsDeZone().at(-1)!.corps as ChaineTess;
const lienDu = (c: ChaineTess, id: string) => (c.plugins ?? []).find((l) => l.id === id) as LienGreffonTess;
function choisir(id: string) {
  un(`[data-tess-greffon="${id}"] .choisir`)!.click();
  flushSync();
}
function changer(el: HTMLInputElement, v: string) {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}
function liste(): PreReglagesTess {
  return { apply_mode: 'immediately', presets: [{ id: 'evening', name: 'Evening', builtin: false, chain: chaineA1() }] };
}
/** Le catalogue d'un serveur qui publie les bornes du paramétrique (−30 / +15). */
function avecBornes(s: ServeurTessSimule) {
  const p = s.catalogue.plugins.find((x) => x.id === 'equalizer-parametric')!;
  p.settings_schema = { type: 'object', properties: { bands: { items: { properties: { gain: { minimum: -30, maximum: 15 } } } } } };
}
function avecChaine(plugins: LienGreffonTess[]) {
  serveur.zones.get(ZONE)!.chain = { ...chaineA1(), plugins };
}

beforeEach(() => {
  serveur = new ServeurTessSimule();
  serveur.avecCatalogue = true;
  serveur.zones.set(ZONE, { transport: 'local', chain: chaineA1(), volume_db: -18, active_preset: 'evening' });
  serveur.zones.set(8, { transport: 'local', chain: { ...chaineA1(), plugins: [{ id: 'mono-downmix', enabled: true, settings: null }] } });
  serveur.presets = liste();
  urls = [];
  anciens = [];
  apercuPeq = { status: 404, corps: {} };
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    urls.push(`${(init?.method ?? 'GET').toUpperCase()} ${u}`);
    if (/\/eq\/presets(\?|$)/.test(u)) return json(200, { presets: anciens });
    if (/\/eq\/import\/preview/.test(u)) return json(apercuPeq.status, apercuPeq.corps);
    if (/\/room-correction\/ir\/status\/\d+/.test(u)) return json(200, { active: true, files: [], resample: true, in_use: null });
    if (/\/tess(\/|\?|$)/.test(u)) return serveur.fetch(u, init);
    return json(404, {});
  }));
  // jsdom : ni géométrie ni capture du pointeur.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 640, height: 240, right: 640, bottom: 240, x: 0, y: 0, toJSON() {} } as DOMRect);
  (Element.prototype as any).setPointerCapture ??= () => {};
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeView.set('tess');
  capaciteTess.set('inconnue');
  zones.set([{ id: ZONE, name: 'atelier', output_type: 'local' } as any, { id: 8, name: 'salon', output_type: 'local' } as any]);
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('C3 — ouverture avec un greffon demandé (contrat avec la coquille)', () => {
  it('🔴 `ouvrirTess("crossfeed")` : l’écran s’ouvre avec Crossfeed sélectionné à droite, et la demande est consommée', async () => {
    activeView.set('home');
    ouvrirTess('crossfeed');
    expect(get(activeView)).toBe('tess');
    await monter();
    expect(un('[data-tess-reglages="crossfeed"]')).not.toBeNull();
    expect(get(greffonTessDemande)).toBeNull();
  });

  it('l’étage Headroom peut être demandé ; un greffon absent de la chaîne n’ouvre rien et ne crée rien', async () => {
    greffonTessDemande.set('headroom');
    await monter();
    expect(un('[data-tess-panneau-headroom]')).not.toBeNull();
    unmount(monte!); monte = null;
    greffonTessDemande.set('crosstalk');
    await monter();
    expect(un('[data-tess-reglages]')).toBeNull();
    expect(un('.vide')!.textContent).toBe(en['tess.selectPlugin']);
    expect(putsDeZone()).toHaveLength(0);
    expect(get(greffonTessDemande)).toBeNull();
  });
});

describe('C4 — plus de sélecteur de zone : l’écran règle la zone courante', () => {
  it('🔴 aucun sélecteur ; changer la zone courante recharge TESS pour la nouvelle zone', async () => {
    await monter();
    expect(un('[data-tess-zone]')).toBeNull();
    expect(un('[data-ecran-tess] select')).toBeNull();
    expect(un('[data-tess-greffon="convolution"]')).not.toBeNull();
    currentZoneId.set(8);
    await laisserTourner();
    expect(urls.some((u) => /GET .*\/zones\/8\/tess/.test(u))).toBe(true);
    expect(un('[data-tess-greffon="mono-downmix"]')).not.toBeNull();
    expect(un('[data-tess-greffon="convolution"]')).toBeNull();
  });
});

describe('C5 — préréglages à droite de « Signal path », surcouche fermée après un succès', () => {
  it('🔴 le bouton est dans l’en-tête du chemin, après le titre ; Load ferme la surcouche', async () => {
    serveur.presets!.presets.push({ id: 'b', name: 'B', builtin: false, chain: { ...chaineA1(), plugins: [] } });
    await monter();
    const tete = un('[data-tess-chemin] header')!;
    const bouton = tete.querySelector('[data-tess-preset]')!;
    expect(bouton).not.toBeNull();
    expect(tete.querySelector('h2')!.compareDocumentPosition(bouton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Plus rien au-dessus des colonnes.
    expect(un('.v2-top [data-tess-preset]')).toBeNull();
    (bouton as HTMLElement).click();
    await laisserTourner(5);
    expect(un('[data-tess-surcouche-prereglages] [data-tess-prereglages]')).not.toBeNull();
    un('[data-tess-prereglage="b"] [data-tess-prereglage-charger]')!.click();
    await laisserTourner();
    expect(un('[data-tess-prereglages]')).toBeNull();
  });

  it('Échap et clic à l’extérieur la ferment aussi', async () => {
    await monter();
    un('[data-tess-preset]')!.click();
    await laisserTourner(5);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await laisserTourner(5);
    expect(un('[data-tess-prereglages]')).toBeNull();
    un('[data-tess-preset]')!.click();
    await laisserTourner(5);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await laisserTourner(5);
    expect(un('[data-tess-prereglages]')).toBeNull();
  });
});

describe('C7 — interrupteurs partout, plus aucune case à cocher', () => {
  it('🔴 chemin, en-tête, panneaux crossfeed et réaffectation : seulement des `role="switch"`', async () => {
    avecChaine([
      { id: 'crossfeed', enabled: true, settings: { amount: 0.3, head_shadow_enabled: false } },
      { id: 'channel-remap', enabled: true, settings: null },
    ]);
    await monter();
    const cases = () => tous('[data-ecran-tess] input[type="checkbox"]');
    const ok = () => cases().every((c) => c.getAttribute('role') === 'switch');
    expect(cases().length).toBeGreaterThan(2);
    expect(ok()).toBe(true);
    // rc14 (retours de Rémi) : « Bypass all » est un bouton d'état (`aria-pressed`), plus un interrupteur.
    for (const sel of ['[data-tess-case="crossfeed"]', '[data-tess-appliquer]']) {
      expect(un(sel)!.getAttribute('role'), sel).toBe('switch');
    }
    choisir('crossfeed');
    expect(un('[data-tess-cf="head_shadow_enabled"]')!.getAttribute('role')).toBe('switch');
    expect(un('[data-tess-on="crossfeed"]')!.getAttribute('role')).toBe('switch');
    expect(ok()).toBe(true);
    choisir('channel-remap');
    expect(un('[data-tess-ra="normalize"]')!.getAttribute('role')).toBe('switch');
    expect(ok()).toBe(true);
  });

  it('🔴 chaque genre de panneau, Convolution comprise : aucune case qui ne soit un interrupteur', async () => {
    avecChaine([
      { id: 'convolution', enabled: true, settings: { filter_set: 'a.zip' } },
      { id: 'equalizer-graphic', enabled: true, settings: null },
      { id: 'equalizer-parametric', enabled: true, settings: { bands: [{ freq: 100, gain: 1, q: 1, type: 'peak' }] } },
      { id: 'crossfeed', enabled: true, settings: null },
      { id: 'mono-downmix', enabled: true, settings: null },
      { id: 'room-correction', enabled: false, settings: null },
      { id: 'crossfeed-pro', enabled: false, settings: null },
      { id: 'channel-remap', enabled: true, settings: null },
    ]);
    await monter();
    for (const id of ['convolution', 'equalizer-graphic', 'equalizer-parametric', 'crossfeed', 'mono-downmix', 'room-correction', 'crossfeed-pro', 'channel-remap']) {
      choisir(id);
      await laisserTourner(5);
      const cases = tous('[data-ecran-tess] input[type="checkbox"]');
      expect(cases.filter((c) => c.getAttribute('role') !== 'switch').map((c) => c.outerHTML.slice(0, 80)), id).toEqual([]);
    }
    choisir('convolution');
    await laisserTourner();
    // rc14 (retours de Rémi) : le repli de la convolution est une ligne d'information.
    expect(un('[data-conv-repli]')!.tagName).toBe('P');
    un('[data-tess-choisir-etape="headroom"]')!.click();
    flushSync();
    expect(tous('[data-ecran-tess] input[type="checkbox"]').every((c) => c.getAttribute('role') === 'switch')).toBe(true);
  });

  it('l’interrupteur ne ment pas : il garde l’état du serveur jusqu’à sa réponse', async () => {
    await monter();
    const c = un<HTMLInputElement>('[data-tess-case="crossfeed"]')!;
    expect(c.checked).toBe(false);
    c.click();
    expect(c.checked).toBe(false);
    await laisserTourner();
    expect(lienDu(dernierPut(), 'crossfeed').enabled).toBe(true);
    expect(un<HTMLInputElement>('[data-tess-case="crossfeed"]')!.checked).toBe(true);
  });
});

describe('C8 — tous les greffons visibles ; en Free, les Premium sont grisés et cadenassés', () => {
  it('🔴 compte gratuit : Parametric EQ et Crossfeed Pro listés, verrouillés, et un clic n’envoie rien', async () => {
    licenseState.update((s) => ({ ...s, tier: 'free' }));
    serveur.premium = false;
    await monter();
    un('[data-tess-ajouter]')!.click();
    flushSync();
    for (const id of ['equalizer-parametric', 'crossfeed-pro', 'crosstalk']) {
      const b = un(`[data-tess-ajout="${id}"]`)!;
      expect(b, id).not.toBeNull();
      expect(b.hasAttribute('data-tess-ajout-verrouille'), id).toBe(true);
      expect(b.getAttribute('aria-disabled')).toBe('true');
      expect(b.querySelector('.cadenas')).not.toBeNull();
    }
    un('[data-tess-ajout="equalizer-parametric"]')!.click();
    await laisserTourner();
    expect(putsDeZone()).toHaveLength(0);
    // Un greffon gratuit s'ajoute normalement.
    expect(un('[data-tess-ajout="mono-downmix"]')!.hasAttribute('data-tess-ajout-verrouille')).toBe(false);
  });

  it('contre-épreuve Premium : rien de verrouillé, l’ajout part', async () => {
    await monter();
    un('[data-tess-ajouter]')!.click();
    flushSync();
    expect(un('[data-tess-ajout-verrouille]')).toBeNull();
    un('[data-tess-ajout="equalizer-parametric"]')!.click();
    await laisserTourner();
    expect(lienDu(dernierPut(), 'equalizer-parametric')).toBeTruthy();
  });

  it('un Premium déjà dans la chaîne, sans licence : carte grisée avec cadenas', async () => {
    licenseState.update((s) => ({ ...s, tier: 'free' }));
    serveur.premium = false;
    await monter();
    const carte = un('[data-tess-greffon="convolution"]')!;
    expect(carte.classList.contains('verrouille')).toBe(true);
    expect(carte.querySelector('.cadenas')).not.toBeNull();
  });
});

describe('C9 — éditeur paramétrique de TESS', () => {
  const bande = (gain: number) => ({ freq: 1000, gain, q: 1, type: 'peak' });

  it('🔴 pas de section du haut, pas de bouton « Modifier » : on édite dans la liste', async () => {
    avecChaine([{ id: 'equalizer-parametric', enabled: true, settings: { bands: [bande(-3)] } }]);
    await monter();
    choisir('equalizer-parametric');
    expect(un('.peq')).not.toBeNull();
    expect(un('.peq-editor')).toBeNull();
    expect(un('.peq-edit')).toBeNull();
    un<HTMLButtonElement>('.peq-ligne-num')!.click();
    flushSync();
    expect(un('.peq-editor'), 'même bande sélectionnée : toujours pas de section du haut').toBeNull();
    changer(un<HTMLInputElement>('[data-ligne-cle="gain"]')!, '-5');
    await apresLeGeste();
    expect((lienDu(dernierPut(), 'equalizer-parametric').settings as any).bands[0].gain).toBe(-5);
  });

  it('🔴 on glisse un point aussitôt, sans clic préalable sur « Modifier »', async () => {
    avecChaine([{ id: 'equalizer-parametric', enabled: true, settings: { bands: [bande(0)] } }]);
    await monter();
    choisir('equalizer-parametric');
    const point = un('.band-dot')!;
    point.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 320, clientY: 120, pointerId: 1 }));
    un('.peq-plot')!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 320, clientY: 60, pointerId: 1 }));
    un('.peq-plot')!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    flushSync();
    await apresLeGeste();
    const g = (lienDu(dernierPut(), 'equalizer-parametric').settings as any).bands[0].gain;
    expect(g).toBeGreaterThan(3);
  });

  it('🔴 bornes publiées (−30 / +15) : −20 dB se saisit, et l’échelle descend sous −15 sans écrêter', async () => {
    avecBornes(serveur);
    avecChaine([{ id: 'equalizer-parametric', enabled: true, settings: { bands: [bande(-3)] } }]);
    await monter();
    choisir('equalizer-parametric');
    expect(Number(un('.peq')!.dataset.peqBas)).toBe(-15);
    changer(un<HTMLInputElement>('[data-ligne-cle="gain"]')!, '-20');
    await apresLeGeste();
    expect((lienDu(dernierPut(), 'equalizer-parametric').settings as any).bands[0].gain).toBe(-20);
    const bas = Number(un('.peq')!.dataset.peqBas);
    expect(bas).toBeLessThanOrEqual(-21);
    expect(bas).toBeGreaterThanOrEqual(-30);
    // Le haut ne bouge pas : échelle ASYMÉTRIQUE.
    expect(Number(un('.peq')!.dataset.peqHaut)).toBe(15);
    expect(tous('.grid-label').some((t) => t.textContent === '-18')).toBe(true);
    // La borne basse n'est jamais dépassée.
    changer(un<HTMLInputElement>('[data-ligne-cle="gain"]')!, '-45');
    await apresLeGeste();
    expect((lienDu(dernierPut(), 'equalizer-parametric').settings as any).bands[0].gain).toBe(-30);
  });

  it('🔴 compte gratuit (paramétrique verrouillé) : ni glisser ni double-clic ne changent la courbe, rien ne part', async () => {
    licenseState.update((s) => ({ ...s, tier: 'free' }));
    serveur.premium = false;
    avecChaine([{ id: 'equalizer-parametric', enabled: false, settings: { bands: [bande(0)] } }]);
    await monter();
    choisir('equalizer-parametric');
    expect(un('[data-tess-verrou="equalizer-parametric"]')).not.toBeNull();
    const point = () => un('.band-dot')!;
    const cy = point().getAttribute('cy');
    point().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 320, clientY: 120, pointerId: 1 }));
    un('.peq-plot')!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 320, clientY: 40, pointerId: 1 }));
    un('.peq-plot')!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    un('.peq-plot')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 100, clientY: 60 }));
    flushSync();
    expect(point().getAttribute('cy')).toBe(cy);
    expect(tous('.band-dot')).toHaveLength(1);
    expect((un('.peq-add') as HTMLButtonElement).disabled).toBe(true);
    await apresLeGeste();
    expect(putsDeZone()).toHaveLength(0);
  });

  it('🔴 la courbe CUMULÉE n’est plus écrêtée : deux bandes à −20 dB donnent une échelle jusqu’au plancher du moteur', async () => {
    avecBornes(serveur);
    avecChaine([{ id: 'equalizer-parametric', enabled: true, settings: { bands: [bande(-20), { freq: 1000, gain: -20, q: 1, type: 'peak' }] } }]);
    await monter();
    choisir('equalizer-parametric');
    // −40 dB cumulés : l'échelle descend jusqu'au plancher du moteur (−30), pas au-delà.
    expect(Number(un('.peq')!.dataset.peqBas)).toBe(-30);
  });

  it('🔴 un glisser sous le bas du graphe ne fait pas filer l’échelle : figée pendant le geste, un palier de plus au plus', async () => {
    avecBornes(serveur);
    avecChaine([{ id: 'equalizer-parametric', enabled: true, settings: { bands: [bande(0)] } }]);
    await monter();
    choisir('equalizer-parametric');
    const plot = un('.peq-plot')!;
    un('.band-dot')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 320, clientY: 120, pointerId: 1 }));
    for (const y of [200, 400, 800, 1600]) {
      plot.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 320, clientY: y, pointerId: 1 }));
      flushSync();
      expect(Number(un('.peq')!.dataset.peqBas), `y=${y}`).toBe(-15);
    }
    plot.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    await apresLeGeste();
    const g = (lienDu(dernierPut(), 'equalizer-parametric').settings as any).bands[0].gain;
    expect(g).toBe(-18);
    expect(Number(un('.peq')!.dataset.peqBas)).toBe(-18);
  });

  it('contre-épreuve : sans bornes publiées, −20 est ramené à −12 (ce que tout serveur accepte)', async () => {
    avecChaine([{ id: 'equalizer-parametric', enabled: true, settings: { bands: [bande(-3)] } }]);
    await monter();
    choisir('equalizer-parametric');
    changer(un<HTMLInputElement>('[data-ligne-cle="gain"]')!, '-20');
    await apresLeGeste();
    expect((lienDu(dernierPut(), 'equalizer-parametric').settings as any).bands[0].gain).toBe(-12);
    expect(Number(un('.peq')!.dataset.peqBas)).toBe(-15);
  });

  it('`bornesGain` lit le chemin JSON Schema convenu, sinon ±12', () => {
    const c = catalogueSimule();
    expect(bornesGain(c, 'equalizer-parametric')).toEqual(BORNES_GAIN_DEFAUT);
    const s = new ServeurTessSimule();
    avecBornes(s);
    expect(bornesGain(s.catalogue, 'equalizer-parametric')).toEqual({ min: -30, max: 15 });
    // Incohérentes : ignorées.
    s.catalogue.plugins.find((x) => x.id === 'equalizer-parametric')!.settings_schema =
      { properties: { bands: { items: { properties: { gain: { minimum: 5, maximum: -5 } } } } } };
    expect(bornesGain(s.catalogue, 'equalizer-parametric')).toEqual(BORNES_GAIN_DEFAUT);
  });

  it('import d’un fichier PEQ dans le panneau du paramétrique (aperçu serveur, rien d’enregistré)', async () => {
    apercuPeq = { status: 200, corps: { format: 'parametric_eq', band_count: 2, max_bands: 31, bands: [bande(-4), { freq: 80, gain: 2, q: 0.7, type: 'low_shelf' }] } };
    avecChaine([{ id: 'equalizer-parametric', enabled: true, settings: { bands: [bande(1)] } }]);
    await monter();
    choisir('equalizer-parametric');
    const champ = un<HTMLInputElement>('[data-tess-fichier-peq]')!;
    const fichier = new File(['Filter 1: ON PK Fc 1000 Hz Gain -4 dB Q 1'], 'HD650 ParametricEQ.txt', { type: 'text/plain' });
    Object.defineProperty(champ, 'files', { value: [fichier], configurable: true });
    champ.dispatchEvent(new Event('change', { bubbles: true }));
    await laisserTourner();
    await apresLeGeste();
    expect(urls.some((u) => /POST .*\/eq\/import\/preview/.test(u))).toBe(true);
    expect(urls.some((u) => /\/eq\/import\/autoeq/.test(u))).toBe(false);
    const b = (lienDu(dernierPut(), 'equalizer-parametric').settings as any).bands;
    expect(b.map((x: any) => x.gain)).toEqual([-4, 2]);
    expect(un('[data-tess-import-ok]')!.textContent).toContain('2');
  });
});

describe('C12 — l’étage Headroom se règle dans TESS (une seule marge)', () => {
  it('🔴 sélectionnable ; Automatique éteint ⇒ `fixed.headroom = {mode: manual, db: -3}`, puis le curseur', async () => {
    await monter();
    un('[data-tess-choisir-etape="headroom"]')!.click();
    flushSync();
    expect(un('[data-tess-panneau-headroom]')).not.toBeNull();
    const auto = un<HTMLInputElement>('[data-tess-headroom-auto]')!;
    expect(auto.getAttribute('role')).toBe('switch');
    expect(auto.checked).toBe(true);
    // tune-server-rust#9520 : l'Auto n'applique pas −3 dB ; le texte ne l'annonce plus.
    expect(un('[data-tess-headroom-resume]')!.textContent).toContain(en['tess.headroom.autoHelp']);
    expect(en['tess.headroom.autoHelp']).not.toMatch(/3\s*dB/);
    auto.click();
    await laisserTourner();
    expect(dernierPut().fixed!.headroom).toEqual({ mode: 'manual', db: -3 });
    // Le reste de `fixed` est intact.
    expect(dernierPut().fixed!.upsampling).toEqual({ mode: 'off' });
    changer(un<HTMLInputElement>('[data-tess-headroom-db]')!, '-6');
    await laisserTourner();
    expect(dernierPut().fixed!.headroom).toEqual({ mode: 'manual', db: -6 });
    // Le manuel remplace la réserve et n'agit qu'avec un égaliseur coché : c'est dit.
    const note = un('[data-tess-headroom-note-manuel]')!;
    expect(note.textContent).toBe(en['tess.headroom.manualNote']);
    expect(note.classList.contains('alerte'), 'égaliseur graphique coché dans A1').toBe(false);
    // Plus de réserve « Sûre / Réaliste » à part ; la compensation de niveau et
    // la garde de préampli de l'ancien écran sont ici.
    expect(hote!.textContent).not.toContain(en['v2.eq.headroomSafe']);
    expect(un('[data-tess-panneau-headroom] [data-tess-compensation-niveau]')).not.toBeNull();
  });

  it('🔴 Auto : AUCUN « −3 dB » dans le rendu, dans les 20 langues (tune-server-rust#9520)', async () => {
    greffonTessDemande.set('headroom');
    await monter();
    expect(un('[data-tess-panneau-headroom]')).not.toBeNull();
    for (const l of ONZE_LANGUES) {
      locale.set(l as any);
      await laisserTourner(3);
      const texte = un('[data-ecran-tess]')!.textContent!.replace(/\s+/g, ' ');
      expect(texte, l).not.toMatch(/[−-]\s?3([.,]0)?\s?(dB|дБ|децибел)/);
    }
    locale.set('en');
  });

  it('`avecHeadroom` borne à [−24 ; 0] et `headroomDe` relit la chaîne', () => {
    const c = chaineA1();
    expect(headroomDe(c)).toEqual({ auto: true, db: -3 });
    expect(avecHeadroom(c, { auto: false, db: -40 }).fixed!.headroom).toEqual({ mode: 'manual', db: -24 });
    expect(avecHeadroom(c, { auto: false, db: 3 }).fixed!.headroom).toEqual({ mode: 'manual', db: 0 });
    expect(headroomDe(avecHeadroom(c, { auto: false, db: -7.5 }))).toEqual({ auto: false, db: -7.5 });
    expect(avecHeadroom(c, { auto: true, db: -9 }).fixed!.headroom).toEqual({ mode: 'auto' });
  });
});

describe('Ordre réel de la sortie locale (tune-server-rust#9520)', () => {
  const l = (id: string, enabled = true): LienGreffonTess => ({ id, enabled, settings: null });

  it('🔴 un égaliseur séparé du premier par un autre greffon est appliqué AVEC lui ; le repli mono en fin', async () => {
    avecChaine([l('equalizer-graphic'), l('convolution'), l('equalizer-parametric'), l('mono-downmix'), l('crossfeed')]);
    await monter();
    expect(un('[data-tess-rang-reel="equalizer-parametric"]')!.textContent)
      .toBe(en['tess.order.withEq'].replace('{name}', en['tess.plugin.equalizer-graphic']));
    expect(un('[data-tess-rang-reel="mono-downmix"]')!.textContent).toBe(en['tess.order.atEnd']);
    for (const id of ['equalizer-graphic', 'convolution', 'crossfeed']) expect(un(`[data-tess-rang-reel="${id}"]`), id).toBeNull();
    expect(un('[data-tess-ordre-fixe]')).toBeNull();
  });

  it('sortie réseau : l’ordre est fixe, on le dit une fois, sans note par greffon', async () => {
    serveur.zones.get(ZONE)!.transport = 'upnp';
    avecChaine([l('equalizer-graphic'), l('convolution'), l('equalizer-parametric')]);
    await monter();
    expect(un('[data-tess-ordre-fixe]')!.textContent).toBe(en['tess.order.networkFixed']);
    expect(un('[data-tess-rang-reel]')).toBeNull();
  });

  it('règle pure : rien à dire quand la place affichée est la vraie', () => {
    const c = (plugins: LienGreffonTess[]) => ({ ...chaineA1(), plugins });
    expect(notesOrdreReel(c([l('equalizer-graphic'), l('equalizer-parametric'), l('convolution')])).size).toBe(0);
    // Un greffon DÉCOCHÉ entre deux égaliseurs ne compte pas.
    expect(notesOrdreReel(c([l('equalizer-graphic'), l('convolution', false), l('equalizer-parametric')])).size).toBe(0);
    // Repli mono suivi seulement de la réaffectation : à sa vraie place.
    expect(notesOrdreReel(c([l('crossfeed'), l('mono-downmix'), l('channel-remap')])).size).toBe(0);
    // La correction de pièce est une façade de la série.
    expect(notesOrdreReel(c([l('room-correction'), l('crossfeed'), l('equalizer-graphic')])).get('equalizer-graphic'))
      .toEqual({ genre: 'avec-egaliseur', premier: 'room-correction' });
    expect(ordreSuivi('local')).toBe(true);
    expect(ordreSuivi('upnp')).toBe(false);
  });
});

describe('C13 — « À l’oreille » (l’ancien Assistant) dans l’égaliseur graphique', () => {
  const courbe = () => ({
    listening: 'speakers', room_size: 'small', speaker_placement: 'near_wall',
    bass_gain_db: 0, mid_gain_db: 0, treble_gain_db: 0,
    bands: GRILLES_EQ[10].map((f, i) => ({ freq: f, gain: i === 2 ? 3 : 0, q: 1, type: 'peak' })),
  });

  it('🔴 passer « À l’oreille » sur une courbe demande confirmation, puis vide la courbe et remet l’environnement au neutre', async () => {
    avecChaine([{ id: 'equalizer-graphic', enabled: true, settings: courbe() }]);
    await monter();
    choisir('equalizer-graphic');
    un('[data-tess-mode-eq="oreille"]')!.click();
    flushSync();
    expect(un('[data-tess-confirmer-mode="oreille"]')).not.toBeNull();
    expect(putsDeZone()).toHaveLength(0);
    un('[data-tess-confirmer-oui]')!.click();
    await apresLeGeste();
    const s = lienDu(dernierPut(), 'equalizer-graphic').settings as any;
    expect(s.bands).toEqual([]);
    expect([s.listening, s.room_size, s.speaker_placement]).toEqual(['speakers', 'medium', 'free_standing']);
    changer(un<HTMLInputElement>('[data-tess-tonalite="bass"]')!, '2.5');
    await apresLeGeste();
    const s2 = lienDu(dernierPut(), 'equalizer-graphic').settings as any;
    expect(s2.bass_gain_db).toBe(2.5);
    expect(s2.bands).toEqual([]);
  });

  it('la confirmation a un nom accessible et prend le focus ; Échap sur « Annuler » la ferme', async () => {
    avecChaine([{ id: 'equalizer-graphic', enabled: true, settings: courbe() }]);
    await monter();
    choisir('equalizer-graphic');
    un('[data-tess-mode-eq="oreille"]')!.click();
    flushSync();
    await laisserTourner(3);
    const d = un('[data-tess-confirmer-mode]')!;
    expect(d.getAttribute('role')).toBe('alertdialog');
    const id = d.getAttribute('aria-labelledby')!;
    expect(document.getElementById(id)!.textContent).toBe(en['tess.eq.switchToEar']);
    expect(document.activeElement).toBe(un('[data-tess-confirmer-oui]'));
    un('[data-tess-confirmer-non]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(un('[data-tess-confirmer-mode]')).toBeNull();
    expect(putsDeZone()).toHaveLength(0);
  });

  it('environnement hérité non neutre : une note visible le dit', async () => {
    avecChaine([{ id: 'equalizer-graphic', enabled: true, settings: { ...courbe(), bands: [], bass_gain_db: 1 } }]);
    await monter();
    choisir('equalizer-graphic');
    expect(un('[data-tess-oreille]')).not.toBeNull();
    expect(un('[data-tess-env-herite]')!.textContent).toBe(en['tess.eq.envReset']);
  });

  it('règles pures : mode, tonalité bornée, environnement neutre', () => {
    expect(modeEgaliseur(courbe())).toBe('courbe');
    expect(modeEgaliseur({ ...courbe(), bands: [] })).toBe('oreille');
    expect(modeEgaliseur({ bands: [] })).toBe('courbe');
    const t = avecTonalite(courbe(), { bass: 9, mid: -0.3, treble: 1 }) as any;
    expect([t.bass_gain_db, t.mid_gain_db, t.treble_gain_db]).toEqual([6, -0.5, 1]);
    expect(environnementNeutre(t)).toBe(true);
    expect(t.bands).toEqual([]);
  });
});

describe('Anciens préréglages de l’égaliseur, relus dans TESS (rien ne se perd)', () => {
  const graphique = { id: 'g1', name: 'Warm', eq_type: 'graphic', bands: GRILLES_EQ[10].map((f, i) => ({ freq: f, gain: i < 2 ? 4 : 0, q: 1 })) };
  const parametrique = { id: 'p1', name: 'HD650', eq_type: 'parametric', bands: [{ freq: 100, gain: -6, q: 0.7, type: 'low_shelf' }] };

  it('🔴 « Warm » (graphique) : sa courbe va dans l’égaliseur graphique de la chaîne, la surcouche se ferme', async () => {
    anciens = [graphique, parametrique];
    await monter();
    un('[data-tess-preset]')!.click();
    await laisserTourner(5);
    expect(tous('[data-tess-ancien-prereglage]').map((e) => e.dataset.tessAncienPrereglage)).toEqual(['g1', 'p1']);
    un('[data-tess-ancien-prereglage="g1"] [data-tess-ancien-charger]')!.click();
    await laisserTourner();
    const s = lienDu(dernierPut(), 'equalizer-graphic').settings as any;
    expect(s.bands.slice(0, 3).map((b: any) => b.gain)).toEqual([4, 4, 0]);
    expect(lienDu(dernierPut(), 'equalizer-graphic').enabled).toBe(true);
    expect(un('[data-tess-prereglages]')).toBeNull();
    expect(un('[data-tess-reglages="equalizer-graphic"]')).not.toBeNull();
  });

  it('🔴 compte gratuit : un ancien préréglage paramétrique ne s’applique pas, le motif Premium est dit', async () => {
    licenseState.update((s) => ({ ...s, tier: 'free' }));
    serveur.premium = false;
    anciens = [parametrique];
    await monter();
    un('[data-tess-preset]')!.click();
    await laisserTourner(5);
    un('[data-tess-ancien-charger]')!.click();
    await laisserTourner();
    expect(putsDeZone()).toHaveLength(0);
    expect(un('[data-tess-message]')!.textContent).toContain('Premium');
  });

  it('pure : le paramétrique absent est AJOUTÉ avant la réaffectation, allumé', () => {
    const c: ChaineTess = { ...chaineA1(), plugins: [{ id: 'channel-remap', enabled: true, settings: null }] };
    const r = chaineAvecAncienPreReglage(c, catalogueSimule(), parametrique as any)!;
    expect(r.id).toBe('equalizer-parametric');
    expect(r.chaine.plugins!.map((l) => l.id)).toEqual(['equalizer-parametric', 'channel-remap']);
    expect((r.chaine.plugins![0].settings as any).bands[0].gain).toBe(-6);
  });
});

describe('Langues — nouvelles clés de la refonte', () => {
  const CLES = [
    'tess.configure', 'tess.eq.mode', 'tess.eq.modeCurve', 'tess.eq.modeEar', 'tess.eq.earIntro', 'tess.eq.envReset',
    'tess.eq.switchToEar', 'tess.eq.switchToCurve', 'tess.eq.switchContinue', 'tess.peq.import', 'tess.peq.imported',
    'tess.headroom.auto', 'tess.headroom.autoHelp', 'tess.headroom.manual', 'tess.headroom.help',
    'tess.presets.legacyTitle', 'tess.presets.legacyIntro', 'tess.presets.legacyLoaded',
    'tess.headroom.manualNote', 'tess.order.withEq', 'tess.order.atEnd', 'tess.order.networkFixed',
  ];
  it('🔴 chaque clé dans les 20 langues, traduite (pas l’anglais recopié), {marques} gardées, aucun « Ã »', () => {
    expect(ONZE_LANGUES).toHaveLength(20);
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      for (const k of CLES) {
        expect(d[k], `${l} ${k}`).toBeTruthy();
        expect(d[k]).not.toContain('Ã');
        if (l !== 'en') expect(d[k], `${l} ${k} traduit`).not.toBe(en[k]);
        for (const m of (en[k].match(/\{\w+\}/g) ?? [])) expect(d[k], `${l} ${k} ${m}`).toContain(m);
      }
    }
  });
});
