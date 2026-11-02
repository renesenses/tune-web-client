// @vitest-environment jsdom
//
// #2398 — la lecture en cours d'une radio et le plein écran, après le rapport
// de Rémi (RC7, 25/10/2026). Un test par comportement, chacun avec sa
// contre-épreuve (la même scène sur une piste de bibliothèque).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import TransportBar from '../../components/partages/TransportBar.svelte';
import TvView from '../../components/v2-heritage/TvView.svelte';
import RadioFicheModale from '../../components/partages/RadioFicheModale.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { locale } from '../i18n';
import { trouverStation, ficheDeStation } from '../ficheStation';

vi.setConfig({ testTimeout: 60_000 });

const RADIO = {
  title: 'Song', artist_name: 'Artist', album_title: 'FIP', source: 'radio',
  source_id: 'https://a/fip.aac', duration_ms: 0, metadata_age_ms: 30_000,
};
const LOCALE = {
  track_id: 12, title: 'The Price', artist_name: 'Leprous', album_title: 'Malina',
  source: 'local', duration_ms: 321_000,
};
const zone = (current_track: Record<string, unknown>) =>
  ({ id: 1, name: 'Salon', state: 'playing', online: true, volume: 0.4, output_type: 'dlna',
     position_ms: 1000, queue_length: 3, current_track });

const PAROLES = { synced: true, lines: [{ t_ms: 1000, text: 'un' }, { t_ms: 5000, text: 'deux' }, { t_ms: 9000, text: 'trois' }] };
const json = (corps: unknown) => Promise.resolve(new Response(JSON.stringify(corps),
  { status: 200, headers: { 'Content-Type': 'application/json' } }));

let routes: (url: string) => unknown = () => [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5)); flushSync(); };

function monter(composant: any, props: Record<string, unknown> = {}) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: props as never });
  flushSync();
}

beforeEach(() => {
  locale.set('fr');
  localStorage.clear();
  routes = (url) => (/lyrics\/by-meta/.test(url) ? PAROLES : /\/zones\/\d+\/queue/.test(url) ? { tracks: [], position: 0, length: 0 } : []);
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => json(routes(String(input))));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as never);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as never);
  activeView.set('library');
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  document.body.innerHTML = '';
  zones.set([]); currentZoneId.set(null);
  vi.unstubAllGlobals();
});

describe('barre de lecture : rien qui n’ait de sens pour un flux', () => {
  const commandes = () => ({
    aleatoire: !!hote!.querySelector('.transport-controls button[aria-pressed]'),
    file: !!hote!.querySelector('.transport-controls .queue-btn'),
    boutons: hote!.querySelectorAll('.transport-controls button.small').length,
  });

  it('🔴 radio : ni aléatoire, ni répéter, ni file d’attente', () => {
    zones.set([zone(RADIO)] as never); currentZoneId.set(1);
    monter(TransportBar);
    expect(commandes()).toEqual({ aleatoire: false, file: false, boutons: 0 });
  });

  it('CONTRE-ÉPREUVE : piste de bibliothèque, les trois y sont', () => {
    zones.set([zone(LOCALE)] as never); currentZoneId.set(1);
    monter(TransportBar);
    expect(commandes()).toEqual({ aleatoire: true, file: true, boutons: 3 });
  });
});

describe('plein écran : « Paroles » est un bouton', () => {
  it('🔴 un bouton à bascule (aria-pressed), plus de case à cocher', async () => {
    zones.set([zone(LOCALE)] as never); currentZoneId.set(1);
    monter(TvView);
    await respirer();
    const panneau = hote!.querySelector('.tv-panel')!;
    expect(panneau.querySelector('input[type=checkbox]'), 'case à cocher').toBeNull();
    const b = panneau.querySelector<HTMLButtonElement>('button[aria-pressed]')!;
    expect(b.textContent?.trim()).toBe('Paroles');
    expect(b.getAttribute('aria-pressed')).toBe('true');
    b.click(); flushSync();
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(hote!.querySelector('.tv-lyrics')).toBeNull();
  });
});

describe('plein écran : pas de défilement synchronisé sur une radio', () => {
  async function ouvrirAvec(piste: Record<string, unknown>) {
    zones.set([zone(piste)] as never); currentZoneId.set(1);
    const defile = vi.fn();
    (Element.prototype as any).scrollTo = defile;
    monter(TvView);
    await respirer(20);
    return { defile, texte: hote!.querySelector<HTMLElement>('.tv-lyrics')! };
  }

  it('🔴 radio : paroles en texte simple, aucune ligne active, aucun défilement automatique', async () => {
    const { defile, texte } = await ouvrirAvec(RADIO);
    expect(texte, 'les paroles ne s’affichent pas').not.toBeNull();
    expect(texte.classList.contains('synced')).toBe(false);
    expect(texte.querySelector('.tv-line.active')).toBeNull();
    expect(defile).not.toHaveBeenCalled();
    expect(texte.scrollTop).toBe(0);
  });

  it('CONTRE-ÉPREUVE : mêmes paroles horodatées sur une piste de bibliothèque, elles sont synchronisées', async () => {
    routes = (url) => (/\/lyrics\/\d+|lyrics\?/.test(url) || /lyrics/.test(url) ? PAROLES : []);
    const { texte } = await ouvrirAvec(LOCALE);
    expect(texte.classList.contains('synced')).toBe(true);
  });
});

describe('fiche de la station', () => {
  const FIP = { id: 7, name: 'FIP', stream_url: 'https://a/fip.aac', favorite: false, homepage_url: null,
    annuaire: { external_id: 'S1', description: 'Radio éclectique de Radio France', website_url: 'https://www.radiofrance.fr/fip' } };

  it('trouverStation : par flux d’abord, par nom ensuite, sinon rien', () => {
    const autre = { id: 8, name: 'Fip bis', stream_url: 'https://b', favorite: false };
    expect(trouverStation([autre, FIP] as any, { source_id: 'https://a/fip.aac' })?.id).toBe(7);
    expect(trouverStation([FIP] as any, { source_id: 'inconnu', album_title: ' fip ' })?.id).toBe(7);
    expect(trouverStation([FIP] as any, { source_id: 'x', album_title: 'Nova' })).toBeNull();
    expect(trouverStation([FIP] as any, null)).toBeNull();
  });

  it('ficheDeStation reprend description et site de la fiche d’annuaire', () => {
    const f = ficheDeStation(FIP as any);
    expect(f.description).toContain('éclectique');
    expect(f.site).toBe('https://www.radiofrance.fr/fip');
  });

  it('🔴 la fiche montre la description et un lien vers le site de la station', async () => {
    routes = (url) => (/radios\?|\/radios$/.test(url) ? [FIP] : []);
    monter(RadioFicheModale, { np: { source_id: 'https://a/fip.aac', album_title: 'FIP' }, onClose: () => {} });
    await respirer(20);
    const dlg = document.querySelector('[role=dialog]')!;
    expect(dlg.textContent).toContain('Radio éclectique de Radio France');
    const a = dlg.querySelector<HTMLAnchorElement>('a.site')!;
    expect(a.href).toBe('https://www.radiofrance.fr/fip');
    expect(a.rel).toContain('noopener');
  });

  it('CONTRE-ÉPREUVE : station inconnue (ni Mes radios ni annuaire), la fiche le dit sans lien', async () => {
    routes = (url) => (/directory/.test(url) ? { items: [], total: 0, countries: [], genres: [] } : []);
    monter(RadioFicheModale, { np: { source_id: 'z', album_title: 'Inconnue' }, onClose: () => {} });
    await respirer(20);
    const dlg = document.querySelector('[role=dialog]')!;
    expect(dlg.querySelector('a.site')).toBeNull();
    expect(dlg.textContent).toContain('Aucune information');
  });
});

describe('Lecture en cours : badge LIVE retiré, nom de station cliquable', () => {
  const src = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
  it('🔴 plus de badge « LIVE » ni d’étiquette « EN DIRECT » ; le nom ouvre la fiche', () => {
    const s = src('../../components/partages/NowPlaying.svelte');
    expect(s).not.toContain('art-live-badge');
    expect(s).not.toContain('radio-live-label');
    expect(s).not.toContain("nowplaying.liveNow");
    expect(s).toMatch(/radio-station-lien[\s\S]{0,200}ficheStationOuverte = true/);
  });
  it('🔴 aléatoire, répéter, normalisation, Smart AutoPlay et file : réservés à une piste qui n’est pas une radio', () => {
    const s = src('../../components/partages/NowPlaying.svelte');
    for (const marqueur of ['onclick={toggleShuffle}', 'onclick={cycleRepeat}', 'onclick={toggleNormalization}', 'title="Smart AutoPlay"', 'class="queue-sheet-toggle"']) {
      const i = s.indexOf(marqueur);
      expect(i, `${marqueur} a disparu`).toBeGreaterThan(0);
      // La dernière garde `{#if … isRadio …}` ouverte avant le bouton doit être une garde « pas radio ».
      const avant = s.slice(0, i);
      const garde = [...avant.matchAll(/\{#if ([^}]*)\}|\{\/if\}/g)];
      const pile: string[] = [];
      for (const g of garde) { if (g[0] === '{/if}') pile.pop(); else pile.push(g[1]); }
      expect(pile.some((c) => c.includes('!isRadio')), `${marqueur} n’est pas protégé par !isRadio`).toBe(true);
    }
  });
});
