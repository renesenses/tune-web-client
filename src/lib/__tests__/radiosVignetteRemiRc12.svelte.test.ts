// @vitest-environment jsdom
//
// rc12 — vignette de station, d'après le retour de Rémi (alec_eiffel) sur la
// rc11 (9/11), décidé par Bertrand le 14/11. Numéros de l'inventaire :
//   17 plus d'œil « Voir » : un clic sur le logo (hors ▶ et autres boutons)
//      ouvre la fiche de la station ;
//   19 « + » pour ajouter à Mes radios, à la place de l'icône « livres »
//      (bibliothèque) ; « − » pour retirer une station déjà dans Mes radios ;
//   21 aucun mot « bibliothèque » pour les radios.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { clearViewContext } from '../stores/navigation';

const mocks = vi.hoisted(() => ({
  getRadios: vi.fn(), updateRadio: vi.fn(), playRadio: vi.fn(), deleteRadio: vi.fn(),
  importRadios: vi.fn(), exportRadiosUrl: vi.fn(() => '#'),
  getAnnuaireRadios: vi.fn(), ajouterDepuisAnnuaire: vi.fn(), jouerDepuisAnnuaire: vi.fn(),
  choisirFluxPrefere: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), getConfig: vi.fn(async () => ({ radios_country: '' })), ...mocks }));
vi.mock('../zoneRequise', () => ({ zoneRequise: () => 3 }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import { locale } from '../i18n';
import fr from '../locales/fr';

const AAC = 'https://icecast.radiofrance.fr/fip-hifi.aac';
const FIP = {
  id: 7, name: 'FIP', stream_url: AAC, favorite: false, genre: 'eclectic', country_code: 'FR',
  annuaire: { external_id: 'S000973', rapproche_par: 'id', radio_metadata_key: 'fip' },
};
const MAISON = { id: 8, name: 'Radio Maison', stream_url: 'https://a/maison.mp3', favorite: false, genre: 'Jazz' };
const ANNUAIRE = {
  total: 2, offset: 0, limit: 120, count: 2, stations: 836, origine: 'reseau',
  items: [
    { external_id: 'S000973', name: 'FIP', country_code: 'FR', genre: 'eclectic', stream_url: AAC,
      radio_metadata_key: 'fip', now_playing: true, my_radio_id: 7, my_radio_favorite: false },
    { external_id: 'S002479', name: 'Radio Sans Cle', country_code: 'US', genre: 'news', stream_url: 'y',
      now_playing: false, my_radio_id: null, my_radio_favorite: null },
  ],
  countries: [], genres: [],
  attribution: { name: 'radio-metadata.fr', url: 'https://radio-metadata.fr', support_url: 'https://ko-fi.com/aleceiffel' },
};

const respirer = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;
async function monter() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(RadiosV2, { target: hote, props: {} });
  flushSync();
  await respirer();
}
async function ouvrirAnnuaire() {
  await monter();
  [...hote.querySelectorAll<HTMLButtonElement>('.sections [role=tab], .sections button')]
    .find((b) => b.textContent?.trim() === fr['v2.radio.tabDirectory'])!.click();
  await respirer();
}
const tuile = (nom: string, sel: string) =>
  [...hote.querySelectorAll<HTMLElement>(sel)].find((e) => e.querySelector('.nm')?.textContent?.trim() === nom)!;
const dialogue = () => document.querySelector<HTMLElement>('[role=dialog]');
/** L'œil de web#2443 : un œil (amande + pupille) dans un bouton de coin. */
const oeil = (e: Element) => [...e.querySelectorAll('button.coin svg')]
  .some((s) => s.querySelector('circle[r="3"]') && s.querySelector('path[d^="M2 12s"]'));
/** L'icône « livres » d'avant la rc12. */
const livres = (e: Element) => !!e.querySelector('button.coin path[d="M4 4v16M9 4v16"]');

beforeEach(() => {
  clearViewContext('radios');
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getRadios.mockResolvedValue([FIP, MAISON]);
  mocks.exportRadiosUrl.mockReturnValue('#');
  mocks.getAnnuaireRadios.mockResolvedValue(ANNUAIRE);
  mocks.jouerDepuisAnnuaire.mockResolvedValue({});
  mocks.playRadio.mockResolvedValue({});
  localStorage.clear();
  locale.set('fr');
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
});

describe('rc12 — point 17 : plus d’œil, le logo ouvre la fiche', () => {
  it('🔴 Mes radios : aucune station n’a d’œil ; le logo de FIP ouvre sa fiche sans la lancer', async () => {
    await monter();
    for (const nom of ['FIP', 'Radio Maison']) expect(oeil(tuile(nom, '.grid .st')), `œil sur ${nom}`).toBe(false);
    tuile('FIP', '.grid .st').querySelector<HTMLButtonElement>('.cv button.ouvrir')!.click();
    await respirer();
    expect(dialogue()?.querySelector('h2')?.textContent).toBe('FIP');
    expect(mocks.playRadio).not.toHaveBeenCalled();
  });

  it('🔴 Annuaire : aucune fiche n’a d’œil ; le logo ouvre la fiche sans lancer la lecture', async () => {
    await ouvrirAnnuaire();
    for (const nom of ['FIP', 'Radio Sans Cle']) expect(oeil(tuile(nom, '.grille .fiche')), `œil sur ${nom}`).toBe(false);
    tuile('Radio Sans Cle', '.grille .fiche').querySelector<HTMLButtonElement>('.vignette button.ouvrir')!.click();
    await respirer();
    expect(dialogue()?.querySelector('h2')?.textContent).toBe('Radio Sans Cle');
    expect(mocks.jouerDepuisAnnuaire).not.toHaveBeenCalled();
  });

  it('CONTRE-ÉPREUVE : ▶ sur le logo lance toujours la station, sans ouvrir la fiche', async () => {
    await ouvrirAnnuaire();
    tuile('Radio Sans Cle', '.grille .fiche').querySelector<HTMLButtonElement>('.vignette button.centre')!.click();
    await respirer();
    expect(mocks.jouerDepuisAnnuaire).toHaveBeenCalledWith('S002479', 3);
    expect(dialogue()).toBeNull();
  });
});

describe('rc12 — point 19 : « + » pour ajouter, « − » pour retirer', () => {
  it('🔴 hors de Mes radios : un « + » (et plus l’icône livres), libellé « Ajouter à mes radios »', async () => {
    await ouvrirAnnuaire();
    const f = tuile('Radio Sans Cle', '.grille .fiche');
    expect(livres(f), 'l’icône « livres » est encore là').toBe(false);
    const plus = f.querySelector<HTMLButtonElement>('button.coin.ajouter')!;
    expect(plus, 'pas de « + »').not.toBeNull();
    expect(plus.title).toBe(fr['v2.radio.dir.add']);
    expect(plus.querySelector('path')!.getAttribute('d')).toBe('M8 12h8M12 8v8');
    expect(f.querySelector('button.coin.retirer')).toBeNull();
  });

  it('🔴 déjà dans Mes radios : « − » (retirer), pas de « + », dans l’Annuaire comme dans Mes radios', async () => {
    await ouvrirAnnuaire();
    const dansAnnuaire = tuile('FIP', '.grille .fiche');
    expect(dansAnnuaire.querySelector('button.coin.ajouter')).toBeNull();
    expect(dansAnnuaire.querySelector('button.coin.retirer path')!.getAttribute('d')).toBe('M8 12h8');
    hote.querySelectorAll<HTMLButtonElement>('.sections [role=tab]')[0].click();
    await respirer();
    const dansMes = tuile('FIP', '.grid .st');
    expect(dansMes.querySelector('button.coin.ajouter')).toBeNull();
    expect(dansMes.querySelector<HTMLButtonElement>('button.coin.retirer')!.title).toBe(fr['v2.radio.removeFromMine']);
  });

  it('🔴 « + » ajoute la station ; la vignette passe aussitôt au « − »', async () => {
    mocks.ajouterDepuisAnnuaire.mockResolvedValue({ id: 9, name: 'Radio Sans Cle', stream_url: 'y', favorite: false });
    await ouvrirAnnuaire();
    tuile('Radio Sans Cle', '.grille .fiche').querySelector<HTMLButtonElement>('button.coin.ajouter')!.click();
    await respirer();
    expect(mocks.ajouterDepuisAnnuaire).toHaveBeenCalledWith('S002479', false);
    const f = tuile('Radio Sans Cle', '.grille .fiche');
    expect(f.querySelector('button.coin.ajouter')).toBeNull();
    expect(f.querySelector('button.coin.retirer')).not.toBeNull();
  });
});

describe('rc12 — point 21 : pas de « bibliothèque » pour les radios', () => {
  it('garde (déjà vrai sur main) : aucun libellé de bouton de vignette ne parle de bibliothèque', async () => {
    await ouvrirAnnuaire();
    const libelles = [...hote.querySelectorAll('.grille button.coin')].map((b) => `${b.getAttribute('title')} ${b.getAttribute('aria-label')}`);
    expect(libelles.length).toBeGreaterThan(0);
    expect(libelles.filter((l) => /biblioth/i.test(l))).toEqual([]);
  });
});
