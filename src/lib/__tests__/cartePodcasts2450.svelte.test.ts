// @vitest-environment jsdom
//
// web#2450 — la carte des podcasts : émissions placées par catégorie et par
// pays, données du serveur (`/podcasts/catalogue`, tune-server-rust#7194),
// une émission sans flux lisible SIGNALÉE, jamais cachée.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({ getCataloguePodcasts: vi.fn() }));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mocks }));

import CartePodcasts from '../../components/v2/CartePodcasts.svelte';
import { locale } from '../i18n';
import fr from '../locales/fr';

const em = (o: Record<string, unknown>) => ({
  source_id: 'apple-1', name: 'Les pieds sur terre', artist: 'France Culture', cover_url: 'https://is1-ssl.mzstatic.com/a.jpg',
  feed_url: 'https://radiofrance-podcast.net/podcast09/rss_10078.xml', readable: true, category: 'Society & Culture',
  category_id: 1324, country: 'fr', charts: { fr: 15 }, curated: false, ...o,
});
const CATALOGUE = {
  countries: ['fr', 'us'], pending_countries: [], failed_countries: [], complete: true, count: 3,
  items: [
    em({}),
    em({ source_id: 'apple-2', name: 'Affaires sensibles', artist: 'France Inter', category: 'History', category_id: 1326, charts: { fr: 3 } }),
    em({ source_id: 'apple-3', name: 'The Daily', artist: 'The New York Times', feed_url: '', readable: false, category: 'News', category_id: 1311, country: 'us', charts: { us: 1, fr: 40 } }),
  ],
};

const respirer = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;
const onOuvrir = vi.fn();
const onAbonner = vi.fn();

beforeEach(() => {
  // jsdom n'a pas de canevas : le décor se tait, les nœuds (des boutons) restent.
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
  mocks.getCataloguePodcasts.mockReset();
  mocks.getCataloguePodcasts.mockResolvedValue(CATALOGUE);
  onOuvrir.mockReset();
  onAbonner.mockReset();
  locale.set('fr');
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
});

async function monter() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(CartePodcasts, { target: hote, props: { onOuvrir, onAbonner, estAbonne: () => false } });
  await respirer();
}
const bouton = (texte: string) => [...hote.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texte);
const groupes = () => [...hote.querySelectorAll<HTMLButtonElement>('.noeuds .groupe')].map((b) => b.getAttribute('aria-label'));

describe('web#2450 — la carte des podcasts', () => {
  it('les catégories viennent du serveur et sont traduites', async () => {
    await monter();
    expect(mocks.getCataloguePodcasts).toHaveBeenCalled();
    // Une émission par catégorie : à effectif égal, l'ordre des identifiants Apple.
    expect(groupes()).toEqual([
      `${fr['podcasts.genre.news']}, 1 émission`,
      `${fr['podcasts.genre.society']}, 1 émission`,
      `${fr['podcasts.genre.history']}, 1 émission`,
    ]);
  });

  it('🔴 une émission sans flux lisible est signalée, et ses gestes sont désactivés', async () => {
    await monter();
    bouton(fr['v2.carte.viewList'])!.click();
    await respirer();
    const daily = [...hote.querySelectorAll<HTMLButtonElement>('.liste li button')].find((b) => b.textContent?.includes('The Daily'))!;
    expect(daily.querySelector('.nt')?.textContent).toBe(fr['v2.carte.notReadable']);
    daily.click();
    await respirer();
    expect(hote.querySelector('.volet .etat.non')?.textContent).toBe(fr['v2.carte.notReadableWhy']);
    expect(bouton(fr['v2.carte.pod.episodes'])!.disabled).toBe(true);
    // Une émission lisible ne porte pas la mention.
    const pieds = [...hote.querySelectorAll<HTMLButtonElement>('.liste li button')].find((b) => b.textContent?.includes('Les pieds'))!;
    expect(pieds.querySelector('.nt')).toBeNull();
  });

  it('🔴 le filtre « Lisibles par Tune » retire les émissions sans flux', async () => {
    await monter();
    bouton(fr['v2.carte.viewList'])!.click();
    await respirer();
    expect(hote.querySelectorAll('.liste li').length).toBe(3);
    bouton(fr['v2.carte.readableOnly'])!.click();
    await respirer();
    const noms = [...hote.querySelectorAll('.liste li .t b')].map((b) => b.textContent);
    expect(noms.sort()).toEqual(['Affaires sensibles', 'Les pieds sur terre']);
  });

  it('« Voir les épisodes » ouvre la fiche de l’écran Podcasts, avec l’auteur', async () => {
    await monter();
    bouton(fr['v2.carte.viewList'])!.click();
    await respirer();
    [...hote.querySelectorAll<HTMLButtonElement>('.liste li button')].find((b) => b.textContent?.includes('Affaires'))!.click();
    await respirer();
    bouton(fr['v2.carte.pod.episodes'])!.click();
    expect(onOuvrir).toHaveBeenCalledTimes(1);
    expect(onOuvrir.mock.calls[0][0]).toMatchObject({ name: 'Affaires sensibles', author: 'France Inter', source_id: 'apple-2' });
    expect(hote.querySelector('.volet .rangs')?.textContent).toContain('#3');
  });

  it('une émission est placée dans le pays de son meilleur rang', async () => {
    await monter();
    bouton(fr['v2.carte.axisCountry'])!.click();
    await respirer();
    expect(groupes()).toEqual(['France, 2 émissions', 'États-Unis, 1 émission']);
  });

  it('les pays encore en lecture côté serveur se disent, avec « Réessayer »', async () => {
    mocks.getCataloguePodcasts.mockResolvedValueOnce({ ...CATALOGUE, pending_countries: ['de', 'it'], complete: false });
    await monter();
    expect(hote.querySelector('[role="status"]')?.textContent).toContain(fr['v2.carte.pod.pending'].replace('{n}', '2'));
    bouton(fr['v2.carte.retry'])!.click();
    await respirer();
    expect(mocks.getCataloguePodcasts).toHaveBeenCalledTimes(2);
    expect(hote.querySelector('[role="status"]')).toBeNull();
  });
});
