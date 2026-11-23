// @vitest-environment jsdom
//
// rc12 — en-tête de la page Radio, d'après le retour de Rémi (alec_eiffel) sur
// la rc11 (9/11), décidé par Bertrand le 14/11. Numéros de l'inventaire :
//   2  l'import M3U/PLS devient le 4ᵉ choix de « Nouvelle station » ;
//   3  « Exporter M3U » quitte l'écran ;
//   4  « Nouvelle station » : 4ᵉ case discrète à côté de Mes radios / Annuaire ;
//   32 l'onglet « Carte » est masqué (vraie carte zoomable en rc13).
// (Le point 1, « Dernières écoutées » dans Mes radios seulement, est tenu par
// radioDernieresSepareesAnnuaire2783.)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { clearViewContext, saveViewContext } from '../stores/navigation';

const mocks = vi.hoisted(() => ({
  getRadios: vi.fn(), updateRadio: vi.fn(), playRadio: vi.fn(), deleteRadio: vi.fn(),
  importRadios: vi.fn(), exportRadiosUrl: vi.fn(() => '#'),
  getAnnuaireRadios: vi.fn(), ajouterDepuisAnnuaire: vi.fn(), jouerDepuisAnnuaire: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), getConfig: vi.fn(async () => ({ radios_country: '' })), ...mocks }));
vi.mock('../zoneRequise', () => ({ zoneRequise: () => 3 }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import { locale } from '../i18n';
import fr from '../locales/fr';

const FIP = { id: 7, name: 'FIP', stream_url: 'https://a/fip.aac', favorite: false, genre: 'Éclectique' };
const VIDE = { total: 0, offset: 0, limit: 120, count: 0, stations: 0, items: [], countries: [], genres: [] };

const respirer = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;
async function monter() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(RadiosV2, { target: hote, props: {} });
  flushSync();
  await respirer();
}
const onglets = () => [...hote.querySelectorAll<HTMLButtonElement>('.sections [role=tab]')];
const choix = (k: string) => document.querySelector<HTMLElement>(`[data-choix=${k}]`);
const ouvrirNouvelle = async () => {
  hote.querySelector<HTMLButtonElement>('.sections .nouvelle')!.click();
  await respirer();
};

beforeEach(() => {
  clearViewContext('radios');
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getRadios.mockResolvedValue([FIP]);
  mocks.exportRadiosUrl.mockReturnValue('#');
  mocks.getAnnuaireRadios.mockResolvedValue(VIDE);
  localStorage.clear();
  locale.set('fr');
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
});

describe('rc12 — en-tête de la page Radio (retour de Rémi)', () => {
  it('🔴 points 2, 3, 4 : l’en-tête ne porte plus ni import, ni export, ni « Nouvelle station »', async () => {
    await monter();
    const tete = hote.querySelector('.v2-top')!;
    expect(tete.querySelectorAll('button, a, label, input'), 'action restée dans l’en-tête').toHaveLength(0);
    expect(hote.querySelector('a[download]'), 'lien « Exporter M3U »').toBeNull();
    expect(mocks.exportRadiosUrl).not.toHaveBeenCalled();
  });

  it('🔴 point 4 : « Nouvelle station » est la 4ᵉ case, discrète, et ouvre le choix', async () => {
    await monter();
    const bouton = hote.querySelector<HTMLButtonElement>('.sections .nouvelle');
    expect(bouton, 'pas de case « Nouvelle station » à côté des onglets').not.toBeNull();
    expect(bouton!.textContent?.trim()).toBe(fr['v2.radio.create']);
    expect(bouton!.classList.contains('primaire'), 'fond vert de l’action primaire').toBe(false);
    expect(bouton!.getAttribute('role'), 'ce n’est pas un onglet').toBeNull();
    expect(onglets().at(-1)!.compareDocumentPosition(bouton!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await ouvrirNouvelle();
    expect(choix('saisie')).not.toBeNull();
  });

  it('🔴 point 2 : le 4ᵉ choix importe un fichier M3U/PLS, relit Mes radios et ferme le choix', async () => {
    await monter();
    await ouvrirNouvelle();
    const quatre = [...document.querySelectorAll('[data-choix]')].map((e) => e.getAttribute('data-choix'));
    expect(quatre).toEqual(['annuaire', 'proposer', 'saisie', 'import']);
    expect(choix('import')!.textContent).toContain(fr['v2.radio.new.import']);

    const champ = document.querySelector<HTMLInputElement>('.panneau input[type=file]')!;
    expect(champ.accept).toBe('.m3u,.m3u8,.pls');
    const ouvre = vi.spyOn(champ, 'click').mockImplementation(() => {});
    choix('import')!.click();
    expect(ouvre, 'le choix n’ouvre pas le sélecteur de fichier').toHaveBeenCalled();

    mocks.importRadios.mockResolvedValue({ imported: 2, skipped: 0 });
    const fichier = new File(['#EXTM3U\n'], 'radios.m3u', { type: 'audio/x-mpegurl' });
    Object.defineProperty(champ, 'files', { value: [fichier], configurable: true });
    champ.dispatchEvent(new Event('change', { bubbles: true }));
    await respirer();
    expect(mocks.importRadios).toHaveBeenCalledWith(fichier);
    expect(mocks.getRadios).toHaveBeenCalledTimes(2);
    expect(choix('import'), 'le choix reste ouvert après l’import').toBeNull();
  });

  it('CONTRE-ÉPREUVE : fermer le sélecteur sans fichier n’importe rien', async () => {
    await monter();
    await ouvrirNouvelle();
    const champ = document.querySelector<HTMLInputElement>('.panneau input[type=file]')!;
    champ.dispatchEvent(new Event('change', { bubbles: true }));
    await respirer();
    expect(mocks.importRadios).not.toHaveBeenCalled();
    expect(choix('import')).not.toBeNull();
  });

  it('🔴 point 32 : l’onglet « Carte » est masqué ; restent Mes radios et Annuaire', async () => {
    await monter();
    expect(onglets().map((b) => b.textContent?.trim())).toEqual([fr['v2.radio.tabMine'], fr['v2.radio.tabDirectory']]);
  });

  it('🔴 point 32 : un retour mémorisé sur la Carte rouvre « Mes radios »', async () => {
    saveViewContext('radios', { section: 'carte', q: '', genre: null, ongletFavoris: false });
    await monter();
    expect(onglets()[0].getAttribute('aria-selected')).toBe('true');
    expect(hote.querySelector('.noeuds'), 'la carte s’affiche encore').toBeNull();
    expect(mocks.getAnnuaireRadios).not.toHaveBeenCalled();
  });
});
