// @vitest-environment jsdom
//
// web#2801 (tune-server-rust#8122) — la fiche d'une radio de l'annuaire
// cochait le flux PRINCIPAL. BBC Radio 6 Music écoutée de France : le
// principal « HLS 320 » est réservé au Royaume-Uni et ne joue pas.
// Contrat serveur rc12 (`GET /radios/directory`, #7515) : `par_defaut` et
// `autorise` sur chaque flux.
//
// CONTRE-ÉPREUVE (jouée sur Shrek) :
//  - l'ancien `fluxParDefaut` (fluxActuel, puis `primary`) remis → 3 rouges
//    sur 11 ;
//  - `disabled={enCours !== null}` sans `|| interdit` → 2 rouges ;
//  - `idMienne == null ? url : undefined` (l'url du défaut renvoyée) → 1 rouge.
// Le bouton Lecture central partait déjà sans `stream_url` : ce test-là est
// un garde-fou, pas un rouge.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getRadios: vi.fn(), playRadio: vi.fn(), jouerDepuisAnnuaire: vi.fn(), choisirFluxPrefere: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mocks }));
vi.mock('../zoneRequise', () => ({ zoneRequise: () => 3 }));

import RadioFicheModale from '../../components/partages/RadioFicheModale.svelte';
import { locale } from '../i18n';
import { zones, currentZoneId } from '../stores/zones';
import { fluxParDefautDeFiche } from '../ficheStation';

const UK = 'https://bbc/6music/uk-hls-320.m3u8';
const LIBRE = 'https://bbc/6music/world-aac-128.aac';
const BAS = 'https://bbc/6music/world-aac-48.aac';
const BBC = {
  external_id: 'bbc6', name: 'BBC Radio 6 Music', my_radio_id: null, now_playing: false,
  streams: [
    { url: UK, codec: 'AAC', bitrate: 320, hls: true, primary: true, restricted_to_countries: ['gb'], par_defaut: false, autorise: false },
    { url: LIBRE, codec: 'AAC', bitrate: 128, par_defaut: true, autorise: true },
    { url: BAS, codec: 'AAC', bitrate: 48, par_defaut: false, autorise: true },
  ],
};

const respirer = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;
async function monter(props: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(RadioFicheModale, { target: hote, props: { onClose: () => {}, ...props } as never });
  flushSync();
  await respirer();
}
const dialogue = () => document.querySelector('[role=dialog]') as HTMLElement;
const ligne = (url: string) => dialogue().querySelector<HTMLElement>(`.flux li[data-flux="${url}"]`)!;

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.jouerDepuisAnnuaire.mockResolvedValue({});
  mocks.playRadio.mockResolvedValue({});
  locale.set('fr');
  zones.set([]);
  currentZoneId.set(null);
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
});

describe('fiche radio : le flux par défaut est celui du serveur (#2801)', () => {
  it('🔴 BBC 6 Music depuis la France : le flux libre est coché, le principal grisé avec la mention', async () => {
    await monter({ annuaire: BBC });
    expect(ligne(LIBRE).classList.contains('actuel')).toBe(true);
    expect(ligne(LIBRE).querySelector('.prin')).not.toBeNull();
    expect(ligne(UK).classList.contains('actuel')).toBe(false);
    expect(ligne(UK).querySelector('.prin')).toBeNull();
    expect(ligne(UK).classList.contains('interdit')).toBe(true);
    expect(ligne(UK).querySelector<HTMLButtonElement>('button.flux-lire')!.disabled).toBe(true);
    expect(ligne(UK).querySelector('.pays-refus')?.textContent).toBe('Non disponible dans votre pays');
    expect(ligne(LIBRE).querySelector('.pays-refus')).toBeNull();
  });

  it('🔴 un flux interdit ne se lance pas', async () => {
    await monter({ annuaire: BBC });
    ligne(UK).querySelector<HTMLButtonElement>('button.flux-lire')!.click();
    await respirer();
    expect(mocks.jouerDepuisAnnuaire).not.toHaveBeenCalled();
  });

  it('🔴 Lecture sans changer de flux : POST sans `stream_url`', async () => {
    await monter({ annuaire: BBC });
    dialogue().querySelector<HTMLButtonElement>('.logo button.lecture')!.click();
    await respirer();
    expect(mocks.jouerDepuisAnnuaire).toHaveBeenCalledWith('bbc6', 3);
  });

  it('🔴 choisir le flux déjà par défaut : toujours sans `stream_url`', async () => {
    await monter({ annuaire: BBC });
    ligne(LIBRE).querySelector<HTMLButtonElement>('button.flux-lire')!.click();
    await respirer();
    expect(mocks.jouerDepuisAnnuaire).toHaveBeenCalledWith('bbc6', 3);
  });

  it('choisir un AUTRE flux : il est envoyé', async () => {
    await monter({ annuaire: BBC });
    ligne(BAS).querySelector<HTMLButtonElement>('button.flux-lire')!.click();
    await respirer();
    expect(mocks.jouerDepuisAnnuaire).toHaveBeenCalledWith('bbc6', 3, BAS);
  });

  it('pays d’écoute inconnu (`autorise: null`) : flux choisissable, mention vers les réglages', async () => {
    const f = { ...BBC, streams: BBC.streams.map((s) => (s.url === UK ? { ...s, autorise: null } : s)) };
    await monter({ annuaire: f });
    const b = ligne(UK).querySelector<HTMLButtonElement>('button.flux-lire')!;
    expect(b.disabled).toBe(false);
    expect(ligne(UK).querySelector('.pays-inconnu')?.textContent).toContain('Réglages › Général');
    b.click();
    await respirer();
    expect(mocks.jouerDepuisAnnuaire).toHaveBeenCalledWith('bbc6', 3, UK);
  });

  it('serveur ancien (sans drapeaux) : le principal reste coché, aucune mention', async () => {
    const ancien = { ...BBC, streams: BBC.streams.map(({ par_defaut: _p, autorise: _a, ...s }) => s) };
    await monter({ annuaire: ancien });
    expect(ligne(UK).classList.contains('actuel')).toBe(true);
    expect(dialogue().querySelector('.interdit, .pays-refus, .pays-inconnu')).toBeNull();
  });
});

describe('fluxParDefautDeFiche', () => {
  const s = (url: string, o: Record<string, unknown> = {}) => ({ url, ...o });
  it('le flux enregistré d’une station de « Mes radios » prime', () => {
    expect(fluxParDefautDeFiche([s('a', { par_defaut: true }), s('b')], 'b')).toBe('b');
  });
  it('🔴 sinon le flux `par_defaut` du serveur, pas le principal', () => {
    expect(fluxParDefautDeFiche([s('a', { primary: true, par_defaut: false, autorise: false }), s('b', { par_defaut: true })])).toBe('b');
  });
  it('drapeaux posés sans défaut : le premier flux non interdit, sinon aucun', () => {
    expect(fluxParDefautDeFiche([s('a', { par_defaut: false, autorise: false }), s('b', { par_defaut: false, autorise: null })])).toBe('b');
    expect(fluxParDefautDeFiche([s('a', { par_defaut: false, autorise: false })])).toBeNull();
  });
  it('serveur ancien : le principal, sinon le premier ; liste vide : aucun', () => {
    expect(fluxParDefautDeFiche([s('a'), s('b', { primary: true })])).toBe('b');
    expect(fluxParDefautDeFiche([s('a'), s('b')])).toBe('a');
    expect(fluxParDefautDeFiche([])).toBeNull();
  });
});
