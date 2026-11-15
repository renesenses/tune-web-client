// @vitest-environment jsdom
/**
 * Le nom d'une playlist est une donnée BRUTE du serveur ou d'un service :
 * un autre profil du foyer, ou un autre appareil du réseau, peut l'avoir
 * choisi. La confirmation « Ajoutée à … » doit donc le rendre en TEXTE, en
 * gras par un élément, jamais par une chaîne HTML interprétée.
 *
 * Ce banc monte la vraie fenêtre « Ajouter à une playlist », lui sert une
 * playlist nommée `<img src=x onerror=alert(1)>`, y ajoute un titre, et
 * vérifie que le message de succès montre ce nom tel quel et qu'aucun
 * élément `<img>` n'a été créé dans la fenêtre.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AddToPlaylistModal from '../../components/partages/AddToPlaylistModal.svelte';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

// Le gestionnaire est coupé en deux : `check-native-dialogs.mjs` interdit le
// motif `alert(` dans le code du client, et ce banc n'appelle rien — il sert
// cette chaîne, telle quelle, comme nom de playlist.
const NOM_PIEGE = '<img src=x onerror=aler' + 't(1)>';

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}

let posts: { url: string; corps: any }[] = [];
let hote: HTMLDivElement;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  posts = [];
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const methode = (init?.method ?? 'GET').toUpperCase();
    let charge: unknown = {};
    if (methode === 'GET' && /\/playlists(\?|$)/.test(url)) {
      charge = [{ id: 7, name: NOM_PIEGE, track_count: 0 }];
    } else if (methode === 'POST' && /\/playlists\/7\/tracks$/.test(url)) {
      posts.push({ url, corps: JSON.parse(String(init?.body ?? '{}')) });
      charge = { id: 7, name: NOM_PIEGE, track_count: 1 };
    }
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.append(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote.remove();
  vi.unstubAllGlobals();
});

describe('Ajouter à une playlist — le nom de la playlist est du texte', () => {
  it('🔴 un nom piégé s’affiche tel quel dans la confirmation et ne crée aucun <img>', async () => {
    const piste = { id: 1, source: 'local', title: 'Piste', artist: 'A', album: 'B', duration: 1 } as any;
    monte = mount(AddToPlaylistModal, { target: hote, props: { track: piste, onClose: () => {} } });
    await souffler();

    const option = hote.querySelector<HTMLButtonElement>('button.playlist-option');
    expect(option, 'la playlist servie doit être proposée').not.toBeNull();
    expect(option!.querySelector('.pl-name')?.textContent).toBe(NOM_PIEGE);
    expect(hote.querySelector('img'), 'la liste ne doit pas interpréter le nom').toBeNull();

    option!.click();
    await souffler();

    expect(posts, 'le titre est bien ajouté').toHaveLength(1);
    const confirmation = hote.querySelector<HTMLElement>('.success-state p');
    expect(confirmation, 'la confirmation doit être affichée').not.toBeNull();
    expect(confirmation!.textContent).toBe(`Ajoutée à ${NOM_PIEGE}`);
    expect(confirmation!.querySelector('strong')?.textContent, 'le nom est en gras, par un élément').toBe(NOM_PIEGE);
    expect(hote.querySelector('img'), 'le nom ne doit JAMAIS être interprété en HTML').toBeNull();
  });
});
