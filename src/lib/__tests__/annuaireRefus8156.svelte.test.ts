// @vitest-environment jsdom
//
// tune-server-rust#8156 (Temps 1, décision de Bertrand du 08/11/2026) — la
// relève de l'annuaire s'identifie auprès de mozaiklabs.fr ; un refus du site
// (401, 403) laisse servir le relevé d'avant, « et l'écran dit pourquoi il
// n'est pas rafraîchi ». Le serveur rend `refus: { status, code:
// "annuaire_refuse" }` depuis la rc12 (#8340) ; le client web ne le lisait pas
// (réouverture du 16/11).
//
// Ce que ce témoin prouve, dans Radios › Annuaire réellement monté :
//   - refus avec une copie : la grille reste, et une mention dit que le site a
//     refusé la mise à jour, avec le statut HTTP ;
//   - refus sans aucune copie : l'annuaire vide dit la raison, au lieu de
//     « pas encore disponible » ;
//   - contre-épreuve : `refus: null` (ou absent, serveur d'avant la rc12) ne
//     montre rien de plus ;
//   - les deux libellés existent dans les quinze langues, avec `{status}`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
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
import { refusDeLAnnuaire } from '../api/annuaireRadios';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';

const fr = dictionnaire('fr');
const fiche = (o: Record<string, unknown>) => ({
  external_id: 'S000973', name: 'FIP', logo_url: null, country_code: 'FR', genre: 'eclectic',
  stream_url: 'https://icecast.radiofrance.fr/fip-hifi.aac', radio_metadata_key: null, now_playing: false,
  my_radio_id: null, my_radio_favorite: null, ...o,
});
const ANNUAIRE = {
  total: 1, offset: 0, limit: 120, count: 1, stations: 836, origine: 'cache', releve_le: '2026-11-15T08:00:00Z',
  items: [fiche({})],
  countries: [{ code: 'FR', count: 1 }], genres: [{ key: 'eclectic', count: 1 }],
  attribution: { name: 'radio-metadata.fr', url: 'https://radio-metadata.fr', support_url: 'https://ko-fi.com/aleceiffel' },
};
const VIDE = { ...ANNUAIRE, total: 0, count: 0, stations: 0, origine: 'aucun', releve_le: null, items: [], countries: [], genres: [] };
const REFUS_403 = { status: 403, code: 'annuaire_refuse' };

const attendre = () => new Promise((r) => setTimeout(r, 0));
const respirer = async () => { for (let i = 0; i < 8; i++) await attendre(); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

beforeEach(() => {
  clearViewContext('radios');
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getRadios.mockResolvedValue([]);
  mocks.exportRadiosUrl.mockReturnValue('#');
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
const mention = () => hote.querySelector<HTMLElement>('[data-annuaire-refus]');

describe('#8156 — l’annuaire dit pourquoi il n’est pas rafraîchi', () => {
  it('🔴 refus 403 avec une copie : la grille reste, la mention donne la raison et le statut', async () => {
    mocks.getAnnuaireRadios.mockResolvedValue({ ...ANNUAIRE, refus: REFUS_403 });
    await ouvrirAnnuaire();
    expect(hote.querySelectorAll('.annuaire .fiche').length).toBe(1);
    const m = mention();
    expect(m).not.toBeNull();
    expect(m!.dataset.annuaireRefus).toBe('403');
    expect(m!.textContent?.trim()).toBe(fr['v2.radio.dir.refused'].replace('{status}', '403'));
    expect(m!.getAttribute('role')).toBe('status');
  });

  it('🔴 refus 401 sans aucune copie : l’annuaire vide dit la raison, pas « pas encore disponible »', async () => {
    mocks.getAnnuaireRadios.mockResolvedValue({ ...VIDE, refus: { status: 401, code: 'annuaire_refuse' } });
    await ouvrirAnnuaire();
    const m = mention();
    expect(m?.textContent?.trim()).toBe(fr['v2.radio.dir.refusedEmpty'].replace('{status}', '401'));
    expect(hote.textContent).not.toContain(fr['v2.radio.dir.empty']);
    // Une seule mention, pas deux.
    expect(hote.querySelectorAll('[data-annuaire-refus]').length).toBe(1);
  });

  it('contre-épreuve : `refus: null`, ou absent (serveur d’avant la rc12), ne montre rien de plus', async () => {
    mocks.getAnnuaireRadios.mockResolvedValue({ ...ANNUAIRE, refus: null });
    await ouvrirAnnuaire();
    expect(hote.querySelectorAll('.annuaire .fiche').length).toBe(1);
    expect(mention()).toBeNull();
    unmount(instance as any); instance = null; hote.remove();

    mocks.getAnnuaireRadios.mockResolvedValue(VIDE);
    await ouvrirAnnuaire();
    expect(mention()).toBeNull();
    expect(hote.textContent).toContain(fr['v2.radio.dir.empty']);
  });

  it('un refus mal formé est ignoré', () => {
    expect(refusDeLAnnuaire({ refus: REFUS_403 })).toEqual(REFUS_403);
    expect(refusDeLAnnuaire({ refus: null })).toBeNull();
    expect(refusDeLAnnuaire({ refus: { code: 'annuaire_refuse' } as any })).toBeNull();
    expect(refusDeLAnnuaire(null)).toBeNull();
  });
});

describe('#8156 — les libellés dans les quinze langues', () => {
  it.each([...ONZE_LANGUES])('%s', (lg) => {
    const d = dictionnaire(lg);
    for (const cle of ['v2.radio.dir.refused', 'v2.radio.dir.refusedEmpty']) {
      expect(typeof d[cle], `${lg} ${cle}`).toBe('string');
      expect(d[cle], `${lg} ${cle}`).toContain('{status}');
      expect(d[cle], `${lg} ${cle}`).toContain('mozaiklabs.fr');
    }
  });
});
