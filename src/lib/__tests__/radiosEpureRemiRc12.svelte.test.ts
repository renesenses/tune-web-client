// @vitest-environment jsdom
//
// Retour de Rémi (radio-metadata.fr) sur les radios de la rc12, go de Bertrand
// du 17/11 (tune-web-client#3152). Ce fichier remplace
// radioCodecEssentiel5716.test.ts : le codec quitte la vignette.
//
//  1-2. vignettes de « Mes radios », « Dernières écoutées » et de l'Annuaire :
//       DEUX lignes sous le logo, le nom puis « genre · pays », sans format ;
//  3.   le badge Metadata+ n'a plus de cadre ;
//  4.   plus de filtre « Hi-Res » ; une préférence « Hi-Res » enregistrée est
//       oubliée sans bruit ;
//  5.   un seul ascenseur pour la page (voir aussi #2783 et #2397) ;
//  7.   plus de badge « Dans mes radios » dans l'Annuaire ;
//  8.   l'encadré « Lecture en cours » en bas à gauche, pour une radio : ni
//       format ni « LIVE », la station à la place — rien ne change ailleurs.
// (6 — la fiche d'une station — est vérifié dans ficheRadioClic.svelte.test.ts.)
import { clearViewContext } from '../stores/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({
  getRadios: vi.fn(), updateRadio: vi.fn(), playRadio: vi.fn(),
  importRadios: vi.fn(), exportRadiosUrl: vi.fn(() => '#'),
  getAnnuaireRadios: vi.fn(), ajouterDepuisAnnuaire: vi.fn(), jouerDepuisAnnuaire: vi.fn(),
  rechercherRadiosParCriteres: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), getConfig: vi.fn(async () => ({ radios_country: '' })), ...mocks }));
vi.mock('../zoneRequise', () => ({ zoneRequise: () => 3 }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import RadioAnnuaire from '../../components/v2/RadioAnnuaire.svelte';
import TransportBar from '../../components/partages/TransportBar.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { normaliserFiltresRadio, nombreDeFiltresActifs, parametresDesFiltres, FILTRES_RADIO_VIDES } from '../radioFiltres';
import fr from '../locales/fr';

vi.setConfig({ testTimeout: 60_000 });

const RADIOS = [
  { id: 1, name: 'BBC Radio 3', stream_url: 'https://x.invalid/1', logo_url: null, genre: 'Classique', country: 'Royaume-Uni',
    country_code: 'GB', codec: 'aac', favorite: false, annuaire: { radio_metadata_key: 'bbc3' } },
  // Contre-épreuve : ni genre ni pays — pas de deuxième ligne vide.
  { id: 2, name: 'Radio nue', stream_url: 'https://x.invalid/2', logo_url: null, genre: null, country: null,
    codec: 'mp3', favorite: false },
  // Un genre sans pays : le genre seul, sans « · » orphelin.
  { id: 3, name: 'Jazz seul', stream_url: 'https://x.invalid/3', logo_url: null, genre: 'Jazz', country: null,
    codec: 'flac', favorite: false },
];
const FICHES = [
  { external_id: 'S1', name: 'FIP', stream_url: 'https://x.invalid/fip', country_code: 'FR', genre: 'eclectic',
    genres: ['eclectic', 'jazz'], codec: 'aac', bitrate: 192, radio_metadata_key: 'fip', now_playing: true, my_radio_id: 9 },
  { external_id: 'S2', name: 'Radio Paradise', stream_url: 'https://x.invalid/rp', country_code: 'US', genre: 'rock',
    codec: 'flac', bitrate: null, radio_metadata_key: null, now_playing: false, my_radio_id: null },
];
const annuaire = () => ({
  total: 2, total_all_genres: 2, offset: 0, limit: 120, count: 2, stations: 2, origine: 'reseau', items: FICHES,
  countries: [{ code: 'FR', count: 1 }, { code: 'US', count: 1 }], genres: [{ key: 'eclectic', count: 1 }, { key: 'rock', count: 1 }],
  attribution: { name: 'radio-metadata.fr', url: 'https://radio-metadata.fr', support_url: 'https://ko-fi.com/aleceiffel' },
});

const respirer = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

beforeEach(() => {
  clearViewContext('radios');
  localStorage.clear();
  locale.set('fr');
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getRadios.mockResolvedValue(RADIOS);
  mocks.exportRadiosUrl.mockReturnValue('#');
  mocks.getAnnuaireRadios.mockResolvedValue(annuaire());
  mocks.rechercherRadiosParCriteres.mockResolvedValue({ count: 0, items: [] });
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => ({}), text: async () => '{}',
  }) as unknown as Response));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as any);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert', radioFiltres: null }));
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  preferences.update((p) => ({ ...p, settingsLevel: 'expert', radioFiltres: null }));
  zones.set([]);
  currentZoneId.set(null);
});

async function monter(C: any, props: Record<string, unknown> = {}) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  instance = mount(C, { target: hote, props });
  await respirer();
  await respirer();
}
const tuile = (nom: string) => [...hote.querySelectorAll<HTMLElement>('.st')]
  .find((t) => t.querySelector('.nm')?.textContent?.trim() === nom)!;
/** Les lignes de texte posées SOUS le logo d'une vignette, dans l'ordre. */
const lignesSousLeLogo = (carte: HTMLElement) => [...carte.children]
  .filter((e) => !e.classList.contains('cv') && !e.classList.contains('vignette'))
  .map((e) => e.textContent?.replace(/\s+/g, ' ').trim());
const src = (chemin: string) => readFileSync(resolve(__dirname, '../../components', chemin), 'utf8');

describe('rc12 Rémi — 1. vignettes de « Mes radios » : deux lignes, sans format', () => {
  it.each(['beginner', 'intermediate', 'expert'] as const)('%s : le nom, puis « genre · pays »', async (niveau) => {
    preferences.update((p) => ({ ...p, settingsLevel: niveau }));
    await monter(RadiosV2);
    const bbc = tuile('BBC Radio 3');
    expect(bbc).toBeTruthy();
    const lignes = lignesSousLeLogo(bbc);
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toContain('BBC Radio 3');
    expect(lignes[1]).toBe('Classique · Royaume-Uni');
    // Le format du flux n'est plus sur la vignette.
    expect(bbc.querySelector('.tk')).toBeNull();
    expect(bbc.textContent).not.toContain('AAC');
  });

  it('contre-épreuve : sans genre ni pays, une seule ligne ; un genre seul, sans « · »', async () => {
    await monter(RadiosV2);
    expect(lignesSousLeLogo(tuile('Radio nue'))).toEqual(['Radio nue']);
    expect(tuile('Radio nue').textContent).not.toContain('MP3');
    expect(lignesSousLeLogo(tuile('Jazz seul'))).toEqual(['Jazz seul', 'Jazz']);
  });

  it('« Dernières écoutées » : la même vignette à deux lignes', async () => {
    localStorage.setItem('tune.radios.dernieresLues', JSON.stringify([1]));
    await monter(RadiosV2);
    const carte = hote.querySelector<HTMLElement>('.recentes .st')!;
    expect(carte).not.toBeNull();
    expect(lignesSousLeLogo(carte)).toEqual(['BBC Radio 3 Metadata+', 'Classique · Royaume-Uni']);
  });

  it('5. un seul ascenseur : « Dernières écoutées », les choix et la liste défilent ensemble', async () => {
    localStorage.setItem('tune.radios.dernieresLues', JSON.stringify([1]));
    await monter(RadiosV2);
    const scroll = hote.querySelector('.v2-radios > .scroll')!;
    expect(scroll).not.toBeNull();
    expect(scroll.querySelector('.recentes')).not.toBeNull();
    expect(scroll.querySelector('.sections')).not.toBeNull();
    expect(scroll.querySelector('.mesradios')).not.toBeNull();
    // Plus de seconde zone de défilement pour la rangée dépliée.
    expect(src('v2/RadiosV2.svelte')).not.toMatch(/\.recentes\.depliee \.grid\{[^}]*overflow-y:auto/);
  });
});

describe('rc12 Rémi — 2 et 7. vignettes de l’Annuaire : deux lignes, sans badge « Dans mes radios »', () => {
  it('le nom (et Metadata+), puis genres et pays ; ni format ni badge', async () => {
    await monter(RadioAnnuaire);
    const fiches = [...hote.querySelectorAll<HTMLElement>('.fiche')];
    expect(fiches).toHaveLength(2);
    expect(lignesSousLeLogo(fiches[0])).toEqual(['FIP Metadata+', 'Éclectique, Jazz · France']);
    expect(lignesSousLeLogo(fiches[1])).toEqual(['Radio Paradise', 'Rock · États-Unis']);
    for (const f of fiches) {
      expect(f.querySelector('.tk, .pied, .dedans')).toBeNull();
      expect(f.textContent).not.toContain(fr['v2.radio.dir.inMine']);
    }
    expect(fiches[0].textContent).not.toMatch(/aac|192/i);
  });
});

describe('rc12 Rémi — 3. le badge Metadata+ sans cadre', () => {
  it('le badge n’a plus de bordure ; le filtre n’a que le cadre de son bouton', () => {
    const badge = src('partages/BadgeMetadataPlus.svelte');
    const regle = badge.match(/\.mdp\{[^}]*\}/)![0];
    expect(regle).toContain('border:0');
    expect(regle).not.toMatch(/border:1px/);
    const filtres = src('v2/RadioFiltresAvances.svelte');
    expect(filtres).not.toMatch(/:global\(\.mdp\)\{[^}]*border-color/);
  });
});

describe('rc12 Rémi — 4. plus de filtre Hi-Res', () => {
  it.each([['Mes radios', RadiosV2], ['Annuaire', RadioAnnuaire]] as const)('%s : ni bouton ni libellé Hi-Res ; Sans perte et Haute qualité restent', async (_n, C) => {
    await monter(C);
    expect(hote.querySelector('[data-testid="radio-filtres-hires"]')).toBeNull();
    expect(hote.querySelector('[data-testid="radio-filtres-lossless"]')).not.toBeNull();
    expect(hote.querySelector('[data-testid="radio-filtres-hq"]')).not.toBeNull();
    expect([...hote.querySelectorAll('button')].map((b) => b.textContent?.trim())).not.toContain('Hi-Res');
  });

  it('🔴 une préférence « Hi-Res » enregistrée retombe proprement : rien d’actif, rien envoyé, pas d’« Effacer »', async () => {
    preferences.update((p) => ({ ...p, radioFiltres: { ...FILTRES_RADIO_VIDES, hires: true } as any }));
    await monter(RadiosV2);
    expect(mocks.rechercherRadiosParCriteres).not.toHaveBeenCalled();
    expect(hote.querySelector('[data-testid="radio-filtres-effacer"]')).toBeNull();
    expect(lignesSousLeLogo(tuile('BBC Radio 3'))).toHaveLength(2);
    expect(normaliserFiltresRadio({ hires: true })).toEqual(FILTRES_RADIO_VIDES);
    expect(nombreDeFiltresActifs(normaliserFiltresRadio({ hires: true }))).toBe(0);
  });

  it('contre-épreuve : « Sans perte » enregistré, lui, filtre toujours', async () => {
    preferences.update((p) => ({ ...p, radioFiltres: { ...FILTRES_RADIO_VIDES, hires: true, lossless: true } as any }));
    await monter(RadiosV2);
    expect(mocks.rechercherRadiosParCriteres).toHaveBeenCalledWith('', { lossless: 'true' });
    expect(parametresDesFiltres(normaliserFiltresRadio({ hires: true, lossless: true }))).toEqual({ lossless: 'true' });
  });
});

describe('rc12 Rémi — 8. l’encadré « Lecture en cours » en bas à gauche', () => {
  const SP = { bit_perfect: false, lossless: false, summary: 'MP3 → WAV',
    steps: [{ name: 'Source', bit_perfect: true, description: 'MP3 128 kbit/s 44kHz' }] };
  function zone(piste: Record<string, unknown>) {
    zones.set([{ id: 1, name: 'Salon', state: 'playing', online: true, volume: 0.4, output_type: 'dlna', current_track: piste, signal_path: SP }] as never);
    currentZoneId.set(1);
    activeView.set('home');
  }
  const gauche = () => hote.querySelector<HTMLElement>('.transport-left')!;

  it('🔴 radio avec un titre capté : titre, artiste, puis la station ; ni format ni LIVE', async () => {
    zone({ id: null, source: 'radio', title: 'So What', artist_name: 'Miles Davis', album_title: 'FIP', source_id: 'https://x.invalid/fip' });
    await monter(TransportBar);
    const g = gauche();
    expect(g.querySelector('.mini-title')?.textContent?.trim()).toBe('So What');
    expect(g.querySelector('.mini-artist:not(.mini-station)')?.textContent?.trim()).toBe('Miles Davis');
    expect(g.querySelector('[data-testid="mini-station"]')?.textContent?.trim()).toContain('FIP');
    expect(g.querySelector('.live-badge')).toBeNull();
    expect(g.textContent).not.toContain('LIVE');
    expect(g.querySelector('.tb-quality-badge')).toBeNull();
    expect(g.textContent).not.toContain('MP3 128');
  });

  it('radio sans titre publié : pas de ligne « Live Radio », la station reste', async () => {
    zone({ id: null, source: 'radio', title: 'FIP', artist_name: 'Live Radio', album_title: 'FIP', source_id: 'https://x.invalid/fip' });
    await monter(TransportBar);
    const g = gauche();
    expect(g.textContent).not.toContain('Live Radio');
    expect(g.querySelector('.mini-artist:not(.mini-station)')).toBeNull();
    expect(g.querySelector('[data-testid="mini-station"]')?.textContent?.trim()).toContain('FIP');
  });

  it('contre-épreuve : une piste de bibliothèque garde son badge de format, sans ligne de station', async () => {
    zone({ id: 5, source: 'local', title: 'Blue in Green', artist_name: 'Miles Davis', album_title: 'Kind of Blue',
      format: 'flac', sample_rate: 44100, bit_depth: 16 });
    await monter(TransportBar);
    const g = gauche();
    expect(g.querySelector('.tb-quality-badge')).not.toBeNull();
    expect(g.querySelector('[data-testid="mini-station"]')).toBeNull();
    expect(g.querySelector('.mini-artist')?.textContent).toContain('Miles Davis');
  });
});
