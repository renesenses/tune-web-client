// @vitest-environment jsdom
//
// rc14 — barre de lecture, retours de Rémi (go de Bertrand du 26/11/2026, 19 h 45).
// Quatre points, un test (au moins) par point :
//
//   1. l'icône TESS n'est PLUS encadrée quand « Bypass all » est coché sur la
//      zone : sans cadre et atténuée, elle dit que TESS est contourné ;
//   2. la fenêtre du chemin du signal est toute verte : plus d'orange pour une
//      étape « traitée », ni pour la pastille à côté de l'icône TESS ;
//   3. l'étape de convolution s'intitule « Convolution » (clé web choisie
//      d'après le type de l'étape), plus « Room correction » ;
//   4. devant le nom de la station, un petit poste de radio en SVG remplace
//      l'antenne satellite (emoji 📡).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import TransportBar from '../../components/partages/TransportBar.svelte';
import PastilleTess from '../../components/v2/tess/PastilleTess.svelte';
import IconeRadio from '../../components/partages/IconeRadio.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { capaciteTess } from '../stores/tess';
import { locale } from '../i18n';
import { tessContourne, traitementTessActif } from '../etatTraitementTess';
import { cleDuTitreDEtape } from '../libelleEtapeChemin';
import { ServeurTessSimule, chaineA1 } from '../tessSimulation';

vi.setConfig({ testTimeout: 60_000 });

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const etape = (code: string, x: Record<string, unknown> = {}) => ({
  name: code, code, plugin_id: null, fixed: true, requested: true, effective: true,
  reason: null, detail: null, params: null, latency_frames: null, ...x,
});
const greffon = (id: string, x: Record<string, unknown> = {}) => etape('plugin', { plugin_id: id, fixed: false, params: {}, ...x });
const chemin = (badge: string, steps: unknown[], x: Record<string, unknown> = {}) => ({
  bit_perfect: badge === 'bit_perfect', steps: [], summary: '', ...x,
  tess: { badge, headroom_db: 0, volume: null, steps },
});
const contourne = (id: string) => greffon(id, { effective: false, reason: 'bypass_all' });

let hote: HTMLDivElement;
let monte: Record<string, any> | null = null;
let serveur: ServeurTessSimule;

async function laisserTourner(n = 20) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

beforeEach(() => {
  locale.set('fr');
  serveur = new ServeurTessSimule();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    if (/\/zones\/\d+\/tess(\?|$)/.test(u)) return serveur.fetch(u, init);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}), text: async () => '{}',
    } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeView.set('home');
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote.remove();
  zones.set([]);
  currentZoneId.set(null);
  capaciteTess.set('inconnue');
  vi.unstubAllGlobals();
});

// ── 1. Icône TESS et « Bypass all » ─────────────────────────────────────────

describe('1. icône TESS : « Bypass all » ⇒ sans cadre, atténuée', () => {
  it('règle : une étape éteinte pour `bypass_all`, ou la chaîne de la zone, disent « contourné »', () => {
    expect(tessContourne(chemin('bit_perfect', [contourne('equalizer-graphic')]), null)).toBe(true);
    expect(tessContourne(null, { chain: { bypass_all: true } })).toBe(true);
    // Le chemin qui traite encore l'emporte sur une réponse de zone plus ancienne.
    expect(tessContourne(chemin('processed_by_tess', [greffon('crossfeed')]), { chain: { bypass_all: true } })).toBe(false);
    // Contre-épreuve : rien de contourné.
    expect(tessContourne(chemin('processed_by_tess', [greffon('crossfeed')]), { chain: { bypass_all: false } })).toBe(false);
    expect(tessContourne(null, null)).toBe(false);
  });

  it('🔴 lecture en cours, « Bypass all » coché : PAS de cadre, icône atténuée, infobulle qui le dit', async () => {
    capaciteTess.set('oui');
    const sp = chemin('bit_perfect', [contourne('equalizer-graphic'), contourne('convolution')]);
    monte = mount(PastilleTess, { target: hote, props: { signalPath: sp, zoneId: 3 } });
    await laisserTourner();
    const b = hote.querySelector<HTMLButtonElement>('[data-pastille-tess]')!;
    expect(b.classList.contains('encadree')).toBe(false);
    expect(b.classList.contains('contournee')).toBe(true);
    expect(b.dataset.tessContourne).toBe('oui');
    expect(b.title).toBe('Ouvrir TESS — TESS est contourné (Tout contourner)');
  });

  it('🔴 zone à l’arrêt : la chaîne de `GET /zones/{id}/tess` porte `bypass_all` ⇒ pas de cadre', async () => {
    serveur.zones.set(3, { transport: 'local', chain: { ...chaineA1(), bypass_all: true } });
    capaciteTess.set('oui');
    monte = mount(PastilleTess, { target: hote, props: { signalPath: null, zoneId: 3 } });
    await laisserTourner();
    const b = hote.querySelector<HTMLButtonElement>('[data-pastille-tess]')!;
    expect(b.classList.contains('encadree')).toBe(false);
    expect(b.classList.contains('contournee')).toBe(true);
  });

  it('contre-épreuve : même chaîne SANS « Bypass all » ⇒ encadrée, pas atténuée', async () => {
    serveur.zones.set(3, { transport: 'local', chain: chaineA1() });
    capaciteTess.set('oui');
    monte = mount(PastilleTess, { target: hote, props: { signalPath: null, zoneId: 3 } });
    await laisserTourner();
    const b = hote.querySelector<HTMLButtonElement>('[data-pastille-tess]')!;
    expect(traitementTessActif(null, serveur.reponse(3))).toBe(true);
    expect(b.classList.contains('encadree')).toBe(true);
    expect(b.classList.contains('contournee')).toBe(false);
    expect(b.title).toBe('Ouvrir TESS — un traitement est actif');
  });

  it('les deux clés nouvelles existent dans les vingt langues', () => {
    const langues = ['de', 'el', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nb', 'nl', 'pl', 'ro', 'ru', 'sv', 'tr', 'uk', 'vi', 'zh-Hant', 'zh'];
    for (const l of langues) {
      const src = lire(`../locales/${l}.ts`);
      expect(src, l).toMatch(/"tess\.bar\.bypassed": "[^"]+"/);
      expect(src, l).toMatch(/"signal\.step\.convolution": "[^"]+"/);
    }
  });
});

// ── 2. Fenêtre du chemin du signal : tout en vert ───────────────────────────

describe('2. chemin du signal : plus d’orange pour une étape traitée', () => {
  const AMBRE = /#f59e0b|245,\s*158,\s*11/i;
  const style = (() => {
    const src = lire('../../components/partages/TransportBar.svelte');
    return src.slice(src.lastIndexOf('<style'));
  })();
  /** Les corps des règles CSS dont le sélecteur nomme `classe`. */
  function regles(classe: string): string[] {
    const out: string[] = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(style))) {
      const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, '');
      if (sel.split(',').some((s) => s.includes(classe))) out.push(m[2]);
    }
    return out;
  }

  it('🔴 étapes, traits, points, pastille à côté de l’icône TESS et bouclier : aucune règle ambre', () => {
    for (const classe of ['.sp-icon', '.sp-line', '.sp-ndot', '.signal-led', '.signal-shield-btn', '.sp-lossy']) {
      const r = regles(classe);
      if (classe !== '.signal-shield-btn') expect(r.length, classe).toBeGreaterThan(0);
      for (const corps of r) expect(corps, classe).not.toMatch(AMBRE);
    }
    // La pastille d'un chemin traité (`lossy`) est verte, comme le bit-perfect.
    const led = regles('.signal-led.lossy');
    expect(led.length).toBe(1);
    expect(led[0]).toMatch(/#22c55e/);
  });

  it('contre-épreuve : la garde lit bien le style (l’alerte d’une zone en reprise reste ambre)', () => {
    expect(regles('.zone-selector-btn.zone-recovering').join('')).toMatch(AMBRE);
  });

  it('une étape traitée garde sa classe (Lecture en cours, #1097) : seule la couleur change', async () => {
    zones.set([{ id: 1, name: 'Salon', state: 'playing', online: true, volume: 0.4,
      signal_path: { bit_perfect: false, lossless: true, summary: '', steps: [
        { name: 'Source', description: 'FLAC 44kHz/16bit', bit_perfect: true },
        { name: 'Resampler', description: '44kHz → 192kHz', bit_perfect: false },
      ] } }] as never);
    currentZoneId.set(1);
    monte = mount(TransportBar, { target: hote });
    flushSync();
    const led = hote.querySelector<HTMLButtonElement>('.signal-led')!;
    expect(led.classList.contains('lossy')).toBe(true);
    led.click();
    flushSync();
    expect(hote.querySelectorAll('.sp-row')).toHaveLength(2);
  });
});

// ── 3. « Convolution », plus « Room correction » ────────────────────────────

describe('3. l’étape de convolution s’intitule « Convolution »', () => {
  it('la clé vient du TYPE de l’étape ; la correction par égaliseur garde le texte du serveur', () => {
    expect(cleDuTitreDEtape({ code: 'room_correction', kind: 'ir' })).toBe('signal.step.convolution');
    expect(cleDuTitreDEtape({ code: 'room_correction' })).toBe('signal.step.convolution');
    expect(cleDuTitreDEtape({ code: 'room_correction', kind: 'eq' })).toBeNull();
    expect(cleDuTitreDEtape({ code: 'rate_conversion' })).toBeNull();
    expect(cleDuTitreDEtape(null)).toBeNull();
  });

  function ouvrirLeChemin(steps: unknown[]) {
    zones.set([{ id: 1, name: 'Salon', state: 'playing', online: true, volume: 0.4,
      signal_path: { bit_perfect: false, lossless: true, summary: '', steps } }] as never);
    currentZoneId.set(1);
    monte = mount(TransportBar, { target: hote });
    flushSync();
    hote.querySelector<HTMLButtonElement>('.signal-led')!.click();
    flushSync();
    return Array.from(hote.querySelectorAll<HTMLElement>('.sp-row'));
  }

  it('🔴 dans la fenêtre : titre « Convolution » ; le texte du serveur, intact, passe dessous', () => {
    const serveurTexte = 'Room correction: 65536-tap impulse response at 96000 Hz, 12 ms latency';
    const rangs = ouvrirLeChemin([
      { name: 'Source', description: 'FLAC 96kHz/24bit', bit_perfect: true },
      { name: 'Correction de pièce', code: 'room_correction', kind: 'ir', description: serveurTexte, bit_perfect: false, applied: true },
    ]);
    const titre = rangs[1].querySelector('[data-sp-titre]')!.textContent!.trim();
    expect(titre).toBe('Convolution');
    expect(titre).not.toContain('Room correction');
    expect(rangs[1].querySelector('.sp-detail')!.textContent).toBe(serveurTexte);
  });

  it('contre-épreuve : correction de pièce par l’égaliseur (`kind: eq`) : le texte du serveur reste le titre', () => {
    const rangs = ouvrirLeChemin([
      { name: 'Correction de pièce', code: 'room_correction', kind: 'eq', description: 'Room correction: parametric equalizer, 8 bands (profile “Salon”)', bit_perfect: false },
    ]);
    expect(rangs[0].querySelector('[data-sp-titre]')!.textContent).toContain('parametric equalizer');
  });
});

// ── 4. Icône radio ──────────────────────────────────────────────────────────

describe('4. devant la station : un petit poste de radio, plus l’antenne satellite', () => {
  it('🔴 la ligne de la station porte le SVG partagé, plus l’emoji 📡', () => {
    zones.set([{ id: 1, name: 'Salon', state: 'playing', online: true, volume: 0.4, output_type: 'dlna',
      current_track: { id: null, source: 'radio', title: 'So What', artist_name: 'Miles Davis', album_title: 'FIP', source_id: 'https://x.invalid/fip' },
      signal_path: { bit_perfect: false, lossless: false, summary: '', steps: [] } }] as never);
    currentZoneId.set(1);
    monte = mount(TransportBar, { target: hote });
    flushSync();
    const station = hote.querySelector<HTMLElement>('[data-testid="mini-station"]')!;
    expect(station).not.toBeNull();
    expect(station.querySelector('svg[data-icone="radio"]')).not.toBeNull();
    expect(station.textContent).not.toContain('📡');
    expect(lire('../../components/partages/TransportBar.svelte')).not.toMatch(/&#x1F4E1;|📡/);
  });

  it('le dessin : corps, antenne à boule, haut-parleur rond, lignes ; trait léger en `currentColor`', () => {
    monte = mount(IconeRadio, { target: hote, props: { taille: 20 } });
    flushSync();
    const svg = hote.querySelector('svg[data-icone="radio"]')!;
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('stroke-width')).toBe('1.5');
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('rect')).toHaveLength(1);
    expect(svg.querySelectorAll('circle')).toHaveLength(2);
    expect(svg.querySelectorAll('path').length).toBeGreaterThanOrEqual(2);
  });
});
