// @vitest-environment jsdom
// tune-server-rust#7597 (démo du 01/11/2026) — une fois un dossier choisi par le
// bouton « Répertoire », le panneau doit offrir le retour à toute la bibliothèque.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ChoixRepertoireBibliotheque from '../../components/v2/ChoixRepertoireBibliotheque.svelte';
import { locale } from '../i18n';

const facette = { path: '/music/Jazz', crumbs: [{ name: 'Jazz', path: '/music/Jazz' }], children: [] };
const response = (body: unknown) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: new Headers({ 'Content-Type': 'application/json' }),
  text: async () => JSON.stringify(body),
  json: async () => body,
} as unknown as Response);
const wait = () => new Promise((resolve) => setTimeout(resolve, 0));

let host: HTMLDivElement;
let component: Record<string, unknown> | null;

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async () => response(facette)));
  host = document.createElement('div');
  document.body.appendChild(host);
  component = null;
});

afterEach(() => {
  if (component) unmount(component);
  host.remove();
  vi.unstubAllGlobals();
});

async function monter(courant: string | null, onToute?: () => void) {
  component = mount(ChoixRepertoireBibliotheque, {
    target: host,
    props: { courant, onChoisir: () => {}, onToute },
  });
  await wait();
  flushSync();
}

describe('panneau « Répertoire » : revenir à toute la bibliothèque', () => {
  it('propose « Voir toute la bibliothèque » quand un dossier est choisi', async () => {
    const onToute = vi.fn();
    await monter('/music/Jazz', onToute);
    const bouton = host.querySelector<HTMLButtonElement>('[data-repertoire-toute]');
    expect(bouton, 'aucun retour à toute la bibliothèque dans le panneau').not.toBeNull();
    expect(bouton!.textContent?.trim()).toBe('Voir toute la bibliothèque');
    bouton!.click();
    expect(onToute).toHaveBeenCalledTimes(1);
  });

  it("ne le propose pas tant qu'aucun dossier n'est choisi", async () => {
    await monter(null, vi.fn());
    expect(host.querySelector('[data-repertoire-toute]')).toBeNull();
  });
});
