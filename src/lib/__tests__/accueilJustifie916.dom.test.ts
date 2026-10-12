// @vitest-environment jsdom
//
/**
 * web#916 — sur la VRAIE page d'accueil (`PageWidgets`) et dans les VRAIS
 * Réglages (`SuggestionsEcarteesV2`) :
 *
 *  1. la raison s'affiche en petit sous la vignette — et rien sous celle que
 *     le serveur ne justifie pas ;
 *  2. « Pas pour moi » est dans le menu « … » de la vignette, pas dans la
 *     grille ; un clic retire la vignette et poste l'écart ;
 *  3. le message offre « Annuler », qui rétablit et fait revenir la vignette ;
 *  4. la liste des Réglages montre ce qui a été écarté, et « Rétablir » le
 *     rend.
 *
 * Une garde qui n'appellerait que les fonctions resterait verte sur un
 * branchement mort : on clique là où l'auditeur clique.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import { widgetParId } from '../accueilWidgets';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import SuggestionsEcarteesV2 from '../../components/v2/SuggestionsEcarteesV2.svelte';
import { currentProfileId } from '../stores/profile';
import { notifications } from '../stores/notifications';
import { suggestionsEcartees } from '../suggestionsEcartees';

const RECOMMANDATIONS = [
  { id: 12, title: 'Bitches Brew', artist_name: 'Miles Davis', genre: 'Jazz', cover_path: null,
    reason: 'genre_match', raison: { type: 'genre_frequent', genre: 'Jazz' } },
  { id: 13, title: 'Au hasard', artist_name: 'Quelqu’un', cover_path: null, reason: 'random' },
];

let ecartees: any[] = [];
let journal: { url: string; methode: string; corps: any }[] = [];

function poserLeServeur() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any, init?: RequestInit) => {
      const u = String(url);
      const methode = init?.method ?? 'GET';
      const corps = init?.body ? JSON.parse(String(init.body)) : null;
      journal.push({ url: u, methode, corps });
      let rep: any = [];
      if (u.includes('/home/recommendations')) rep = RECOMMANDATIONS;
      else if (u.endsWith('/home/dismissed-suggestions/restore')) {
        ecartees = ecartees.filter((e) => !(e.item_type === corps.item_type && e.item_id === corps.item_id));
        rep = { restored: true };
      } else if (u.endsWith('/home/dismissed-suggestions') && methode === 'POST') {
        ecartees = [corps, ...ecartees];
        rep = { dismissed: true, item: corps };
      } else if (u.endsWith('/home/dismissed-suggestions')) {
        rep = { profile_id: 1, total: ecartees.length, items: ecartees };
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => rep,
        text: async () => JSON.stringify(rep),
      } as unknown as Response;
    }),
  );
}

const souffler = (ms = 60) => new Promise((r) => setTimeout(r, ms));
async function laisserCharger() {
  for (let i = 0; i < 4; i++) {
    await souffler(40);
    flushSync();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function poser(C: any, props: Record<string, unknown> = {}) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(C, { target: hote, props: props as any });
  flushSync();
  await laisserCharger();
  return hote;
}

const cartes = (h: HTMLElement) => [...h.querySelectorAll<HTMLElement>('.bande .carte')];
const titres = (h: HTMLElement) => cartes(h).map((c) => c.querySelector('.ct')?.textContent?.trim());
const entree = (cle: string) =>
  document.querySelector<HTMLButtonElement>(`.fond .menu button[role="menuitem"][data-cle="${cle}"]`);

beforeEach(() => {
  ecartees = [];
  journal = [];
  suggestionsEcartees.set([]);
  currentProfileId.set(1);
  poserLeServeur();
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.querySelectorAll('.fond').forEach((n) => n.remove());
  vi.unstubAllGlobals();
});

describe("web#916 — l'accueil dit pourquoi, et entend « Pas pour moi »", () => {
  async function accueil() {
    return poser(PageWidgets, {
      catalogue: [widgetParId('recommandations')!],
      dispositionDefaut: ['recommandations'],
      cle: 'accueil_916_test',
    });
  }

  it('la raison est sous la vignette qu’elle justifie, et sous elle seule', async () => {
    const page = await accueil();
    const [justifiee, auHasard] = cartes(page);
    expect(justifiee, 'la rangée ne s’est pas remplie').toBeTruthy();
    expect(justifiee.querySelector('.cw')?.textContent?.trim()).toBe('Un genre que vous écoutez souvent : Jazz');
    expect(auHasard.querySelector('.cw'), 'le hasard n’est pas une raison').toBeNull();
    // Pas un bouton de plus dans la grille : « Pas pour moi » vit dans le menu.
    expect(page.textContent).not.toContain('Pas pour moi');
  });

  it('« Pas pour moi » retire la vignette, « Annuler » la rend', async () => {
    const page = await accueil();
    expect(titres(page)).toEqual(['Bitches Brew', 'Au hasard']);

    const coin = cartes(page)[0].querySelector<HTMLButtonElement>('.pa button.coin.bl');
    expect(coin, 'pas de menu « … » sur la vignette').not.toBeNull();
    coin!.click();
    flushSync();
    const pasPourMoi = entree('v2.dismiss.notForMe');
    expect(pasPourMoi?.textContent?.trim()).toBe('Pas pour moi');
    expect(entree('v2.dismiss.notForMeArtist')?.textContent?.trim()).toBe('Ne plus me proposer cet artiste');
    pasPourMoi!.click();
    await laisserCharger();

    expect(titres(page), 'la vignette écartée doit disparaître').toEqual(['Au hasard']);
    const post = journal.find((j) => j.methode === 'POST' && j.url.endsWith('/home/dismissed-suggestions'));
    expect(post?.corps).toMatchObject({ item_type: 'album', source: 'local', item_id: '12', title: 'Bitches Brew' });

    const message = get(notifications).at(-1);
    expect(message?.message).toBe('« Bitches Brew » ne vous sera plus proposé');
    expect(message?.action?.label).toBe('Annuler');
    message!.action!.run();
    await laisserCharger();

    expect(titres(page), '« Annuler » doit rendre la vignette').toEqual(['Bitches Brew', 'Au hasard']);
    const restore = journal.find((j) => j.url.endsWith('/home/dismissed-suggestions/restore'));
    expect(restore?.corps).toEqual({ item_type: 'album', source: 'local', item_id: '12' });
  });

  it('« Ne plus me proposer cet artiste » écarte l’artiste, par son nom', async () => {
    const page = await accueil();
    cartes(page)[0].querySelector<HTMLButtonElement>('.pa button.coin.bl')!.click();
    flushSync();
    entree('v2.dismiss.notForMeArtist')!.click();
    await laisserCharger();
    expect(titres(page)).toEqual(['Au hasard']);
    const post = journal.find((j) => j.methode === 'POST' && j.url.endsWith('/home/dismissed-suggestions'));
    expect(post?.corps).toMatchObject({ item_type: 'artist', item_id: 'Miles Davis' });
  });
});

describe('web#916 — Réglages ▸ « Accueil : suggestions écartées »', () => {
  it('liste ce qui a été écarté et le rétablit', async () => {
    ecartees = [
      { item_type: 'album', source: 'qobuz', item_id: 'q-1', title: 'Live', subtitle: 'Miles Davis' },
      { item_type: 'artist', source: 'nom', item_id: 'bill evans', title: 'Bill Evans' },
    ];
    const reglages = await poser(SuggestionsEcarteesV2);
    const lignes = () => [...reglages.querySelectorAll<HTMLElement>('.ligne')];
    expect(lignes().map((l) => l.querySelector('.tt')?.textContent?.trim())).toEqual(['Live', 'Bill Evans']);
    expect(lignes()[0].querySelector('em')?.textContent).toBe('Album · Qobuz — Miles Davis');
    expect(lignes()[1].querySelector('em')?.textContent).toBe('Artiste');

    lignes()[0].querySelector<HTMLButtonElement>('button')!.click();
    await laisserCharger();
    expect(lignes().map((l) => l.querySelector('.tt')?.textContent?.trim())).toEqual(['Bill Evans']);
    const restore = journal.find((j) => j.url.endsWith('/home/dismissed-suggestions/restore'));
    expect(restore?.corps).toEqual({ item_type: 'album', source: 'qobuz', item_id: 'q-1' });
  });

  it('dit qu’il n’y a rien quand rien n’est écarté', async () => {
    const reglages = await poser(SuggestionsEcarteesV2);
    expect(reglages.textContent).toContain('Aucune suggestion écartée.');
  });
});
