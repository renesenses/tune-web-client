// @vitest-environment jsdom
//
// web#2795 (décision de Bertrand, 11/11) — une station de l'annuaire se
// modifie de nouveau, CHEZ SOI : nom affiché, logo et flux. La fiche n'est
// jamais modifiée ; un repère discret dit la surcharge ; « Revenir à la fiche
// de l'annuaire » l'efface. « Voir » reste. Chaque comportement a sa
// contre-épreuve.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { clearViewContext } from '../stores/navigation';

const mocks = vi.hoisted(() => ({
  getRadios: vi.fn(), updateRadio: vi.fn(), playRadio: vi.fn(), deleteRadio: vi.fn(),
  importRadios: vi.fn(), exportRadiosUrl: vi.fn(() => '#'),
  getAnnuaireRadios: vi.fn(), ajouterDepuisAnnuaire: vi.fn(), jouerDepuisAnnuaire: vi.fn(),
  choisirFluxPrefere: vi.fn(), revenirALaFiche: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), getConfig: vi.fn(async () => ({ radios_country: '' })), ...mocks }));
vi.mock('../zoneRequise', () => ({ zoneRequise: () => 3 }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import { locale } from '../i18n';
import { champsSurchargeAEnvoyer } from '../champsRadio';

const AAC = 'https://icecast.radiofrance.fr/fip-hifi.aac';
const FIP = {
  id: 7, name: 'FIP', stream_url: AAC, favorite: false, genre: 'eclectic', country: 'FR',
  logo_url: 'https://mozaiklabs.fr/storage/radio-logos/fip.webp',
  annuaire: { external_id: 'S000973', rapproche_par: 'id', streams: [] },
  surcharge_locale: false,
};
const MAISON = { id: 8, name: 'Radio Maison', stream_url: 'https://a/maison.mp3', favorite: false, genre: 'Jazz' };

const respirer = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;
async function monter() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(RadiosV2, { target: hote, props: {} as never });
  flushSync();
  await respirer();
}
const tuile = (nom: string) =>
  [...hote.querySelectorAll('.grid .st')].find((t) => t.querySelector('.nm')?.textContent === nom)!;
const bouton = (t: Element, titre: string) =>
  [...t.querySelectorAll<HTMLButtonElement>('button.coin')].find((b) => b.getAttribute('title') === titre)!;
const dialogue = () => document.querySelector('[role=dialog]') as HTMLElement | null;
const champ = (libelle: string) =>
  [...dialogue()!.querySelectorAll('label')].find((l) => l.querySelector('span')?.textContent === libelle)
    ?.querySelector('input') as HTMLInputElement | undefined;
const boutonTexte = (texte: string) =>
  [...dialogue()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texte);

beforeEach(() => {
  clearViewContext('radios');
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getRadios.mockResolvedValue([FIP, MAISON]);
  mocks.exportRadiosUrl.mockReturnValue('#');
  mocks.getAnnuaireRadios.mockResolvedValue({ total: 0, offset: 0, limit: 120, count: 0, items: [], countries: [], genres: [] });
  localStorage.clear();
  locale.set('fr');
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('web#2795 — modifier chez soi une station de l’annuaire', () => {
  it('🔴 le crayon d’une station de l’annuaire ouvre l’éditeur réduit : nom, flux, logo', async () => {
    await monter();
    bouton(tuile('FIP'), 'Modifier').click();
    await respirer();
    expect(dialogue()).not.toBeNull();
    expect(champ('Nom')?.value).toBe('FIP');
    expect(champ('Adresse du flux')?.value).toBe(AAC);
    expect(champ('Logo (URL)')).toBeDefined();
    // Ce que la fiche tient seule n'est pas proposé.
    expect(champ('Genre')).toBeUndefined();
    expect(champ('Pays')).toBeUndefined();
    expect(champ('Site (URL)')).toBeUndefined();
    expect(dialogue()!.textContent).toContain('la fiche de l’annuaire n’est pas modifiée');
    // Pas encore surchargée : rien à effacer.
    expect(boutonTexte('Revenir à la fiche de l’annuaire')).toBeUndefined();
  });

  it('CONTRE-ÉPREUVE : la station saisie à la main garde l’éditeur complet', async () => {
    await monter();
    bouton(tuile('Radio Maison'), 'Modifier').click();
    await respirer();
    expect(champ('Genre')).toBeDefined();
    expect(champ('Site (URL)')).toBeDefined();
    expect(dialogue()!.textContent).not.toContain('la fiche de l’annuaire n’est pas modifiée');
  });

  it('🔴 enregistrer n’envoie que le nom et le logo (flux non touché) et pose le repère', async () => {
    mocks.updateRadio.mockResolvedValue({ ...FIP, name: 'FIP chez moi', surcharge_locale: true });
    await monter();
    expect(tuile('FIP').querySelector('.surch')).toBeNull();
    bouton(tuile('FIP'), 'Modifier').click();
    await respirer();
    const nom = champ('Nom')!;
    nom.value = 'FIP chez moi';
    nom.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    dialogue()!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await respirer();
    expect(mocks.updateRadio).toHaveBeenCalledWith(7, { name: 'FIP chez moi', logo_url: FIP.logo_url });
    expect(dialogue()).toBeNull();
    const t = tuile('FIP chez moi');
    expect(t.querySelector('.surch')?.getAttribute('title')).toBe('Modifiée chez vous');
    // « Voir » reste disponible, et l'œil garde son coin.
    expect(t.querySelector('button.coin.tr')?.getAttribute('title')).toBe('Voir');
  });

  it('🔴 « Revenir à la fiche de l’annuaire » efface la surcharge', async () => {
    mocks.getRadios.mockResolvedValue([{ ...FIP, name: 'FIP chez moi', surcharge_locale: true }, MAISON]);
    mocks.revenirALaFiche.mockResolvedValue({ ...FIP, surcharge_locale: false });
    await monter();
    expect(tuile('FIP chez moi').querySelector('.surch')).not.toBeNull();
    expect(tuile('Radio Maison').querySelector('.surch')).toBeNull();
    bouton(tuile('FIP chez moi'), 'Modifier').click();
    await respirer();
    boutonTexte('Revenir à la fiche de l’annuaire')!.click();
    await respirer();
    expect(mocks.revenirALaFiche).toHaveBeenCalledWith(7);
    expect(mocks.updateRadio).not.toHaveBeenCalled();
    expect(dialogue()).toBeNull();
    expect(tuile('FIP').querySelector('.surch')).toBeNull();
  });

  it('champsSurchargeAEnvoyer : le flux n’est proposé que s’il change (#870)', () => {
    const saisi = { name: 'X', stream_url: AAC, logo_url: '' };
    expect(champsSurchargeAEnvoyer(saisi, { stream_url: AAC })).toEqual({ name: 'X', logo_url: '' });
    expect(champsSurchargeAEnvoyer({ ...saisi, stream_url: 'https://b/x.mp3' }, { stream_url: AAC }))
      .toEqual({ name: 'X', logo_url: '', stream_url: 'https://b/x.mp3' });
  });
});
