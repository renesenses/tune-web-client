// @vitest-environment jsdom
//
// web#3206 (fils 2898 et 2904, rc12) — deux rapports de bogue sont arrivés
// SANS description. Le testeur avait écrit dans le champ de l'assistant IA
// (« Décrivez ce qui se passe (facultatif) »), monté AU-DESSUS du vrai champ
// « Ce qui se passe », puis envoyé : rien ne l'avait prévenu.
//
// 1. « Ce qui se passe » vient avant le bloc de l'assistant.
// 2. Un envoi sans description demande confirmation ; s'il y a du texte dans
//    le champ de l'assistant, la question dit qu'il ne part pas.
// 3. Refuser n'envoie rien ; accepter envoie, comme avant.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import SupportV2 from '../../components/v2/SupportV2.svelte';
import { licenseState } from '../stores/license';
import { dialogs } from '../stores/dialogs';
import fr from '../locales/fr';

const d = fr as unknown as Record<string, string>;
const respirer = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: { get: () => null },
    json: async () => corps,
    text: async () => (typeof corps === 'string' ? corps : JSON.stringify(corps)),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let posts: string[];

beforeEach(() => {
  posts = [];
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    const u = String(url);
    const method = String(options?.method ?? 'GET').toUpperCase();
    if (method === 'POST' && /\/system\/bug-report\/submit$/.test(u)) {
      posts.push(String(options?.body ?? ''));
      return reponse(200, { status: 'ok', url: 'https://mozaiklabs.fr/forum/t/bug-42' });
    }
    // L'extension « Assistant IA » n'est pas activée sur ce serveur.
    if (u.includes('/ext/assistant-ia/')) return reponse(404, { error: 'api_not_found' });
    return reponse(200, {});
  }));
  licenseState.update((s) => ({ ...s, loaded: true, tier: 'free', licenseKey: null }));
});

afterEach(() => {
  for (const r of get(dialogs)) dialogs.settle(r.id, false);
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function monter(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SupportV2, { target: hote });
  flushSync();
  await respirer();
  flushSync();
  return hote;
}

function saisir(champ: HTMLTextAreaElement, texte: string) {
  champ.value = texte;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}
const champIa = (h: HTMLElement) => h.querySelector('[data-diagnostic-ia] textarea') as HTMLTextAreaElement;
const envoyer = async (h: HTMLElement) => {
  [...h.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(d['v2.sup.bugSend']))!.click();
  await respirer(80);
  flushSync();
};

describe('web#3206 — rapport de bogue sans description', () => {
  it('« Ce qui se passe » est le premier champ, avant le bloc de l’assistant', async () => {
    const h = await monter();
    const desc = h.querySelector('textarea.bogue-desc')!;
    const ia = h.querySelector('[data-diagnostic-ia]')!;
    expect(desc.compareDocumentPosition(ia) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('texte dans le champ de l’assistant, description vide : la question le dit ; refuser n’envoie rien', async () => {
    const h = await monter();
    saisir(champIa(h), 'La lecture s’arrête après deux titres.');
    await envoyer(h);
    const [q] = get(dialogs);
    expect(q?.message).toBe(d['v2.sup.bugDescEmptyIa']);
    dialogs.settle(q.id, false);
    await respirer(80);
    flushSync();
    expect(posts).toEqual([]);
    expect(h.textContent).not.toContain(d['v2.sup.bugSent']);
  });

  it('rien d’écrit nulle part : la question simple ; accepter envoie le rapport', async () => {
    const h = await monter();
    await envoyer(h);
    const [q] = get(dialogs);
    expect(q?.message).toBe(d['v2.sup.bugDescEmpty']);
    dialogs.settle(q.id, true);
    await respirer(80);
    flushSync();
    expect(posts.length).toBe(1);
  });

  it('description remplie : aucune question, le rapport part', async () => {
    const h = await monter();
    saisir(h.querySelector('textarea.bogue-desc') as HTMLTextAreaElement, 'Zone DLNA muette.');
    await envoyer(h);
    expect(get(dialogs)).toEqual([]);
    expect(posts.length).toBe(1);
    expect(JSON.parse(posts[0])).toEqual({ description: 'Zone DLNA muette.' });
  });
});
