// @vitest-environment jsdom
//
// web#3206 (fils 2898 et 2904, rc12) — deux rapports de bogue sont arrivés
// SANS description. Le testeur avait écrit dans le champ de l'assistant IA
// (« Décrivez ce qui se passe (facultatif) »), monté AU-DESSUS du vrai champ
// « Ce qui se passe », puis envoyé : rien ne l'avait prévenu.
//
// 1. « Ce qui se passe » vient avant le bloc de l'assistant.
// 2. Décisions de Bertrand (18/11) :
//    a. sans l'extension active, le bloc de l'assistant est MASQUÉ ;
//    b. le texte du champ de l'assistant n'est pas perdu : à l'envoi, on
//       PROPOSE de le recopier dans la description ; rien ne part en silence ;
//    c. la confirmation se déclenche aussi quand la description est remplie
//       mais qu'un texte attend dans le champ de l'assistant.
// 3. Refuser n'envoie rien ; accepter envoie, comme avant.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import SupportV2 from '../../components/v2/SupportV2.svelte';
import { licenseState } from '../stores/license';
import { dialogs } from '../stores/dialogs';
import { assistantIaAbsent } from '../assistantIa';
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
/** L'extension « Assistant IA » est-elle active sur le serveur simulé ? */
let extensionActive = false;

beforeEach(() => {
  posts = [];
  extensionActive = false;
  assistantIaAbsent.set(false);
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
    if (u.includes('/ext/assistant-ia/')) {
      // Extension inactive : routes non montées, le 404 générique du serveur
      // (tune-server/src/routes/mod.rs, `api_not_found`).
      if (!extensionActive) return reponse(404, { error: 'not found', path: u });
      return reponse(200, { fournisseur: null, cle_definie: false });
    }
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

async function monter(avecExtension: boolean): Promise<HTMLDivElement> {
  extensionActive = avecExtension;
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
const champDesc = (h: HTMLElement) => h.querySelector('textarea.bogue-desc') as HTMLTextAreaElement;
const envoyer = async (h: HTMLElement) => {
  [...h.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(d['v2.sup.bugSend']))!.click();
  await respirer(80);
  flushSync();
};
/** Répond à la question en tête de file et rend son message. */
async function repondre(oui: boolean): Promise<string | undefined> {
  const [q] = get(dialogs);
  if (!q) return undefined;
  dialogs.settle(q.id, oui);
  await respirer(80);
  flushSync();
  return q.message;
}
const question = () => get(dialogs)[0]?.message;

describe('web#3206 — extension IA inactive : le bloc de l’assistant est masqué', () => {
  it('aucun bloc ni champ « Décrivez ce qui se passe (facultatif) »', async () => {
    const h = await monter(false);
    expect(champDesc(h)).toBeTruthy();
    expect(h.querySelector('[data-diagnostic-ia]')).toBeNull();
    expect(h.querySelector(`textarea[placeholder="${d['assistantIa.diag.placeholder']}"]`)).toBeNull();
  });

  it('description vide : la question simple ; refuser n’envoie rien, accepter envoie', async () => {
    const h = await monter(false);
    await envoyer(h);
    expect(await repondre(false)).toBe(d['v2.sup.bugDescEmpty']);
    expect(posts).toEqual([]);
    await envoyer(h);
    expect(await repondre(true)).toBe(d['v2.sup.bugDescEmpty']);
    expect(posts.length).toBe(1);
  });

  it('description remplie : aucune question, le rapport part', async () => {
    const h = await monter(false);
    saisir(champDesc(h), 'Zone DLNA muette.');
    await envoyer(h);
    expect(get(dialogs)).toEqual([]);
    expect(posts.length).toBe(1);
    expect(JSON.parse(posts[0])).toEqual({ description: 'Zone DLNA muette.' });
  });
});

describe('web#3206 — extension IA active', () => {
  it('le bloc est là, APRÈS « Ce qui se passe »', async () => {
    const h = await monter(true);
    const ia = h.querySelector('[data-diagnostic-ia]');
    expect(ia).toBeTruthy();
    expect(champDesc(h).compareDocumentPosition(ia!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('description vide, texte dans l’assistant : proposer de le recopier ; accepter le recopie sans rien envoyer, puis il part', async () => {
    const h = await monter(true);
    saisir(champIa(h), 'La lecture s’arrête après deux titres.');
    await envoyer(h);
    expect(await repondre(true)).toBe(d['v2.sup.bugCopyIa']);
    expect(champDesc(h).value).toBe('La lecture s’arrête après deux titres.');
    expect(posts).toEqual([]);
    expect(get(dialogs)).toEqual([]);
    // Relu : il envoie, sans nouvelle question.
    await envoyer(h);
    expect(question()).toBeUndefined();
    expect(posts.length).toBe(1);
    expect(JSON.parse(posts[0])).toEqual({ description: 'La lecture s’arrête après deux titres.' });
  });

  it('description vide, recopie refusée : on confirme l’envoi sans description ; refuser n’envoie rien', async () => {
    const h = await monter(true);
    saisir(champIa(h), 'La lecture s’arrête après deux titres.');
    await envoyer(h);
    expect(await repondre(false)).toBe(d['v2.sup.bugCopyIa']);
    expect(await repondre(false)).toBe(d['v2.sup.bugDescEmptyIa']);
    expect(posts).toEqual([]);
    expect(champDesc(h).value).toBe('');
  });

  it('description REMPLIE et texte dans l’assistant : la question se pose aussi ; accepter ajoute le texte à la suite', async () => {
    const h = await monter(true);
    saisir(champDesc(h), 'Zone DLNA muette.');
    saisir(champIa(h), 'Depuis la mise à jour.');
    await envoyer(h);
    expect(await repondre(true)).toBe(d['v2.sup.bugCopyIa']);
    expect(champDesc(h).value).toBe('Zone DLNA muette.\n\nDepuis la mise à jour.');
    expect(posts).toEqual([]);
  });

  it('description remplie, recopie refusée : confirmer l’envoi ; le texte de l’assistant ne part PAS en silence', async () => {
    const h = await monter(true);
    saisir(champDesc(h), 'Zone DLNA muette.');
    saisir(champIa(h), 'Depuis la mise à jour.');
    await envoyer(h);
    expect(await repondre(false)).toBe(d['v2.sup.bugCopyIa']);
    expect(await repondre(true)).toBe(d['v2.sup.bugSendWithoutIa']);
    expect(posts.length).toBe(1);
    expect(JSON.parse(posts[0])).toEqual({ description: 'Zone DLNA muette.' });
  });

  it('description remplie, champ de l’assistant vide : aucune question', async () => {
    const h = await monter(true);
    saisir(champDesc(h), 'Zone DLNA muette.');
    await envoyer(h);
    expect(get(dialogs)).toEqual([]);
    expect(posts.length).toBe(1);
  });
});
