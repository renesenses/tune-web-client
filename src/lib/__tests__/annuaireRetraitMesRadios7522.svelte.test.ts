// @vitest-environment jsdom
//
// tune-server-rust#7522 (alec_eiffel ; discussion #7563, go de Bertrand du
// 12/11/2026) — Radios › Annuaire : « pas d'indication des stations déjà dans
// la bibliothèque, et pas de possibilité de les retirer (seulement depuis
// Mes radios) ». Le badge « Dans mes radios » devient visible, et la vignette
// d'une station déjà ajoutée porte « Retirer de Mes radios » : même appel
// (`deleteRadio`) et même confirmation que l'écran « Mes radios ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clearViewContext } from '../stores/navigation';

const mocks = vi.hoisted(() => ({
  getRadios: vi.fn(), updateRadio: vi.fn(), playRadio: vi.fn(), deleteRadio: vi.fn(),
  importRadios: vi.fn(), exportRadiosUrl: vi.fn(() => '#'),
  getAnnuaireRadios: vi.fn(), ajouterDepuisAnnuaire: vi.fn(), jouerDepuisAnnuaire: vi.fn(),
  mettreAJourLeFluxDepuisAnnuaire: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), getConfig: vi.fn(async () => ({ radios_country: '' })), ...mocks }));
vi.mock('../zoneRequise', () => ({ zoneRequise: () => 3 }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import { dialogs } from '../stores/dialogs';
import { notifications } from '../stores/notifications';
import { locale } from '../i18n';
import { dictionnaire } from './onzeDictionnaires';

const fr = dictionnaire('fr');
const FIP_LOCALE = {
  id: 7, name: 'FIP', stream_url: 'https://icecast.radiofrance.fr/fip-hifi.aac', favorite: false,
  annuaire: { external_id: 'S000973', rapproche_par: null },
};
const fiche = (o: Record<string, unknown>) => ({
  external_id: 'S000973', name: 'FIP', logo_url: null, country_code: 'FR', genre: 'eclectic',
  stream_url: 'https://icecast.radiofrance.fr/fip-hifi.aac', radio_metadata_key: null, now_playing: false,
  my_radio_id: null, my_radio_favorite: null, ...o,
});
const ANNUAIRE = {
  total: 2, offset: 0, limit: 120, count: 2, stations: 836, origine: 'reseau',
  items: [
    fiche({ my_radio_id: 7, my_radio_favorite: false }),
    fiche({ external_id: 'S002479', name: 'Radio Paradise', stream_url: 'http://stream.radioparadise.com/flacm' }),
  ],
  countries: [{ code: 'FR', count: 1 }], genres: [{ key: 'eclectic', count: 2 }],
  attribution: { name: 'radio-metadata.fr', url: 'https://radio-metadata.fr', support_url: 'https://ko-fi.com/aleceiffel' },
};

const attendre = () => new Promise((r) => setTimeout(r, 0));
const respirer = async () => { for (let i = 0; i < 8; i++) await attendre(); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

beforeEach(() => {
  clearViewContext('radios');
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getRadios.mockResolvedValue([FIP_LOCALE]);
  mocks.exportRadiosUrl.mockReturnValue('#');
  mocks.getAnnuaireRadios.mockResolvedValue(ANNUAIRE);
  mocks.deleteRadio.mockResolvedValue(undefined);
  for (const n of get(notifications)) notifications.dismiss(n.id);
  locale.set('fr');
});
afterEach(() => {
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
});

async function ouvrirAnnuaire() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(RadiosV2, { target: hote, props: {} });
  flushSync();
  await respirer();
  hote.querySelectorAll<HTMLButtonElement>('.sections button')[1].click();
  await respirer();
  await new Promise((r) => setTimeout(r, 10));
  await respirer();
}

const boutonRetirer = (f: Element) =>
  f.querySelector<HTMLButtonElement>(`.coin[aria-label="${fr['v2.radio.removeFromMine']}"]`);

describe('#7522 — l’annuaire montre et retire ce qui est dans « Mes radios »', () => {
  it('🔴 une station déjà ajoutée porte le badge ET « Retirer » ; les autres non', async () => {
    await ouvrirAnnuaire();
    const fiches = hote.querySelectorAll('.fiche');
    expect(fiches[0].querySelector('.dedans')?.textContent).toContain(fr['v2.radio.dir.inMine']);
    expect(boutonRetirer(fiches[0])).not.toBeNull();
    expect(fiches[1].querySelector('.dedans')).toBeNull();
    expect(boutonRetirer(fiches[1])).toBeNull();
  });

  it('🔴 Retirer : confirmation (la station reste dans l’annuaire), deleteRadio, puis « Ajouter » revient', async () => {
    await ouvrirAnnuaire();
    boutonRetirer(hote.querySelectorAll('.fiche')[0])!.click();
    await respirer();
    const d = get(dialogs);
    expect(d).toHaveLength(1);
    expect(d[0].message).toContain("reste disponible dans l'annuaire");
    dialogs.settle(d[0].id, true);
    await respirer();
    expect(mocks.deleteRadio).toHaveBeenCalledWith(7);
    const f0 = hote.querySelectorAll('.fiche')[0];
    expect(f0.querySelector('.dedans')).toBeNull();
    expect(boutonRetirer(f0)).toBeNull();
    expect(f0.querySelector('.tl2'), 'le bouton Ajouter revient').not.toBeNull();
    // Retour sur « Mes radios » : la station n'y est plus (le serveur, relu,
    // ne la rend plus).
    mocks.getRadios.mockResolvedValue([]);
    hote.querySelectorAll<HTMLButtonElement>('.sections button')[0].click();
    await respirer();
    expect([...hote.querySelectorAll('.st .nm')].map((n) => n.textContent)).not.toContain('FIP');
  });

  it('Annuler : rien n’est retiré', async () => {
    await ouvrirAnnuaire();
    boutonRetirer(hote.querySelectorAll('.fiche')[0])!.click();
    await respirer();
    dialogs.settle(get(dialogs)[0].id, false);
    await respirer();
    expect(mocks.deleteRadio).not.toHaveBeenCalled();
    expect(hote.querySelectorAll('.fiche')[0].querySelector('.dedans')).not.toBeNull();
  });

  it('🔴 double clic sur Retirer : une seule question, un seul deleteRadio', async () => {
    await ouvrirAnnuaire();
    const b = boutonRetirer(hote.querySelectorAll('.fiche')[0])!;
    b.click();
    b.click();
    await respirer();
    const d = get(dialogs);
    expect(d, 'le second clic ouvre une seconde question').toHaveLength(1);
    dialogs.settle(d[0].id, true);
    await respirer();
    expect(mocks.deleteRadio).toHaveBeenCalledTimes(1);
  });

  it('le badge reste à l’échelle du texte (réglage « Taille du texte »)', () => {
    const src = readFileSync(resolve(__dirname, '../../components/v2/RadioAnnuaire.svelte'), 'utf8');
    expect(src).toMatch(/\.dedans\{[^}]*calc\(9\.5px \* var\(--v2-txt-echelle, 1\)\)/);
  });
});
