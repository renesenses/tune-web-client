// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PodcastsView from '../../components/PodcastsView.svelte';
import { reinitialiserLeGeste } from '../infobulleTexte';

const titre = 'Une histoire très longue de la musique et de ses interprètes';
const auteur = 'Un collectif de producteurs dont le nom dépasse la carte';
const episode = 'Un épisode au titre complet qui dépasse la largeur de sa ligne';
const suivant = 'Une autre émission avec un titre différent mais toujours très long';
const longs = new Set([titre, auteur, episode, suivant]);
const podcast = { id: 914, name: titre, title: titre, artist: auteur, author: auteur, feed_url: 'https://fixture.invalid/feed' };
let target: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
let large = false;
const observers: ResizeFixture[] = [];
class ResizeFixture {
  active = true;
  constructor(readonly callback: ResizeObserverCallback) { observers.push(this); }
  observe() {}
  unobserve() {}
  disconnect() { this.active = false; }
  fire() { if (this.active) this.callback([], this as unknown as ResizeObserver); }
}
const vertical = (el: Element) => el.matches('.card-title, .trending-title');
const deborde = (el: Element) => !large && longs.has(el.textContent?.trim() ?? '');
async function settle() { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); }
const el = (selector: string) => target.querySelector<HTMLElement>(selector)!;
async function start() { component = mount(PodcastsView, { target }); await settle(); await settle(); }
function clavier(node: HTMLElement) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  node.focus();
}

beforeEach(() => {
  reinitialiserLeGeste();
  large = false;
  observers.length = 0;
  target = document.createElement('div');
  document.body.appendChild(target);
  // jsdom ne calcule pas de boîtes. Ces dimensions contrôlées couvrent
  // distinctement la coupe sur deux lignes et l'ellipse horizontale.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(120);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return vertical(this) ? 40 : 20; });
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) { return deborde(this) && !vertical(this) ? 480 : 120; });
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) { return vertical(this) ? (deborde(this) ? 60 : 40) : 20; });
  vi.stubGlobal('ResizeObserver', ResizeFixture);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    let body: unknown;
    if (url.pathname.endsWith('/podcasts/subscriptions')) body = [podcast];
    else if (url.pathname.endsWith('/podcasts/radiofrance')) body = [podcast];
    else if (url.pathname.endsWith('/system/config')) body = { radiofrance_api_key_set: false };
    else if (url.pathname.endsWith('/podcasts/top')) body = [
      { ...podcast, name: url.searchParams.get('country') === 'de' ? suivant : titre },
      { name: 'Bref', artist: 'Ada', feed_url: 'https://fixture.invalid/short' },
    ];
    else if (url.pathname.includes('/podcasts/episodes')) body = [{ title: episode, audio_url: 'https://fixture.invalid/audio', published: '2026-09-18' }];
    else throw new Error('Requête inattendue : ' + url.pathname);
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  target.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('#914 — les textes tronqués de Podcasts restent lisibles', () => {
  it('expose les titres complets et auteurs, avec coupe verticale et horizontale', async () => {
    await start();
    expect(el('.trending-title').getAttribute('title')).toBe(titre);
    expect(el('.trending-artist').getAttribute('title')).toBe(auteur);
    // La carte Radio France utilise les mêmes classes que les autres grilles.
    expect(el('.card-title').getAttribute('title')).toBe(titre);
    expect(el('.card-artist').getAttribute('title')).toBe(auteur);
    clavier(el('.trending-card'));
    expect(document.querySelector('.bulle-texte-coupe')?.textContent).toBe(titre + '\n' + auteur);
  });

  it('ne répète pas les textes courts et n’ajoute pas de point de tabulation', async () => {
    await start();
    const carte = target.querySelectorAll<HTMLElement>('.trending-card')[1];
    expect(carte.querySelector('.trending-title')?.getAttribute('title')).toBeNull();
    expect(carte.querySelector('.trending-artist')?.getAttribute('title')).toBeNull();
    expect(carte.querySelector('.trending-title')?.hasAttribute('tabindex')).toBe(false);
    clavier(carte);
    expect(document.querySelector('.bulle-texte-coupe')).toBeNull();
  });

  it('couvre abonnements, nouveaux épisodes et titre dans la fiche', async () => {
    await start();
    target.querySelectorAll<HTMLButtonElement>('.view-tab')[1].click();
    await settle();
    expect(el('.card-title').getAttribute('title')).toBe(titre);
    expect(el('.card-artist').getAttribute('title')).toBe(auteur);
    expect(el('.new-ep-title').getAttribute('title')).toBe(episode);
    expect(el('.new-ep-podcast').getAttribute('title')).toBe(titre);
    clavier(el('.podcast-card'));
    el('.podcast-card').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(el('.episode-title').getAttribute('title')).toBe(episode);
    clavier(el('.episode-row'));
    expect(document.querySelector('.bulle-texte-coupe')?.textContent).toBe(episode);
  });

  it('réévalue la coupe au redimensionnement puis le titre après changement de pays', async () => {
    await start();
    expect(el('.trending-title').getAttribute('title')).toBe(titre);
    large = true;
    observers.forEach(observer => observer.fire());
    expect(el('.trending-title').getAttribute('title')).toBeNull();
    large = false;
    observers.forEach(observer => observer.fire());
    expect(el('.trending-title').getAttribute('title')).toBe(titre);
    const pays = target.querySelectorAll<HTMLSelectElement>('.country-select')[1];
    pays.value = 'de';
    pays.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(); await settle();
    expect(el('.trending-title').textContent).toBe(suivant);
    expect(el('.trending-title').getAttribute('title')).toBe(suivant);
  });

  it('retire la bulle clavier et les observateurs au démontage', async () => {
    await start();
    clavier(el('.trending-card'));
    expect(document.querySelector('.bulle-texte-coupe')).not.toBeNull();
    expect(observers.some(observer => observer.active)).toBe(true);
    await unmount(component!);
    component = undefined;
    expect(document.querySelector('.bulle-texte-coupe')).toBeNull();
    expect(observers.every(observer => !observer.active)).toBe(true);
  });
});
