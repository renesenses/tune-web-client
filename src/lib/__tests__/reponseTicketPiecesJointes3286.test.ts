// @vitest-environment jsdom
//
// #3286 (fil 2951) — on ne pouvait joindre un fichier qu'à l'OUVERTURE d'un
// ticket : la zone de réponse d'un fil déjà ouvert n'offrait que du texte.
// Le relais (`routes/support.rs`, `reply`) accepte pourtant le multipart
// (`body` + `attachments[]`), comme le site.
//
// Ce fichier MONTE le vrai écran : il ouvre un ticket, choisit une capture
// dans la zone de réponse, envoie, et lit ce qui part vers le relais.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SupportV2 from '../../components/v2/SupportV2.svelte';
import { licenseState } from '../stores/license';
import fr from '../locales/fr';

const respirer = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: () => null },
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const TICKET = {
  id: 42,
  subject: 'Lecture coupée',
  category: 'playback',
  status: 'answered',
  created_at: '2026-11-20T10:00:00Z',
  updated_at: '2026-11-20T10:00:00Z',
  last_reply_at: null,
  unread_count: 0,
};

describe('#3286 — joindre un fichier en répondant à un ticket', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;
  let envois: { url: string; init?: RequestInit }[] = [];

  beforeEach(() => {
    envois = [];
    try { localStorage.clear(); } catch { /* sans stockage */ }
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        const post = String(init?.method ?? 'GET').toUpperCase() === 'POST';
        if (post && /\/support\/tickets\/42\/reply/.test(u)) {
          envois.push({ url: u, init });
          return reponse(200, { ok: true });
        }
        if (/\/support\/tickets\/42/.test(u)) return reponse(200, { ticket: TICKET, replies: [] });
        if (/\/support\/tickets/.test(u)) return reponse(200, { tickets: [TICKET] });
        return reponse(200, {});
      }),
    );
    licenseState.update((s) => ({ ...s, loaded: true, tier: 'premium', licenseKey: 'TEST-KEY' }));
  });

  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    if (hote) hote.remove();
    hote = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    licenseState.update((s) => ({ ...s, loaded: false, tier: 'free', licenseKey: null }));
  });

  async function ouvrirLeTicket(): Promise<HTMLElement> {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SupportV2, { target: hote });
    flushSync();
    await respirer();
    flushSync();
    (Array.from(hote.querySelectorAll('button')) as HTMLButtonElement[])
      .find((b) => b.textContent?.includes(fr['v2.sup.tabTickets']))?.click();
    flushSync();
    await respirer();
    flushSync();
    const tk = hote.querySelector('button.tk') as HTMLButtonElement | null;
    expect(tk, 'le ticket n’est pas listé — témoin sans objet').toBeTruthy();
    tk!.click();
    flushSync();
    await respirer();
    flushSync();
    const zone = hote.querySelector('.reply') as HTMLElement | null;
    expect(zone, 'la zone de réponse n’est pas rendue — témoin sans objet').toBeTruthy();
    const txt = zone!.querySelector('textarea') as HTMLTextAreaElement;
    txt.value = 'Voici la capture demandée.';
    txt.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    return zone!;
  }

  function choisir(champ: HTMLInputElement, fichiers: File[]) {
    Object.defineProperty(champ, 'files', { value: fichiers, configurable: true });
    champ.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
  }

  async function envoyer(zone: HTMLElement) {
    const bouton = (Array.from(zone.querySelectorAll('button')) as HTMLButtonElement[])
      .find((b) => b.textContent?.includes(fr['v2.sup.reply']));
    expect(bouton, 'le bouton « Répondre » est introuvable').toBeTruthy();
    bouton!.click();
    flushSync();
    await respirer();
    flushSync();
  }

  it('la zone de réponse propose un champ fichier aux types admis', async () => {
    const zone = await ouvrirLeTicket();
    const champ = zone.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(champ, 'aucun moyen de joindre un fichier à une réponse').toBeTruthy();
    expect(champ!.multiple).toBe(true);
    expect(champ!.accept).toContain('.png');
  });

  it('une réponse avec deux captures choisies une par une part en multipart', async () => {
    const zone = await ouvrirLeTicket();
    const champ = zone.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(champ, 'aucun moyen de joindre un fichier à une réponse').toBeTruthy();
    choisir(champ!, [new File(['a'], 'capture1.png', { type: 'image/png' })]);
    choisir(champ!, [new File(['b'], 'journal.txt', { type: 'text/plain' })]);
    expect(zone.textContent).toContain('capture1.png');
    expect(zone.textContent).toContain('journal.txt');
    await envoyer(zone);

    expect(envois.length, 'la réponse n’est pas partie').toBe(1);
    const corps = envois[0].init?.body;
    expect(corps instanceof FormData, 'la réponse part en JSON : la pièce jointe est perdue').toBe(true);
    const form = corps as FormData;
    expect(form.get('body')).toBe('Voici la capture demandée.');
    const pieces = form.getAll('attachments[]') as File[];
    expect(pieces.map((f) => f.name)).toEqual(['capture1.png', 'journal.txt']);
    // Le navigateur pose lui-même le boundary : aucun Content-Type JSON forcé.
    const entetes = new Headers(envois[0].init?.headers as HeadersInit);
    expect(entetes.get('Content-Type') ?? '').not.toContain('application/json');
    // Envoyée : la liste se vide.
    expect(zone.textContent).not.toContain('capture1.png');
  });

  it('un type refusé est écarté dès le choix, avec une phrase', async () => {
    const zone = await ouvrirLeTicket();
    const champ = zone.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(champ, 'aucun moyen de joindre un fichier à une réponse').toBeTruthy();
    choisir(champ!, [new File(['x'], 'programme.exe')]);
    expect(zone.textContent).toContain('programme.exe');
    expect(zone.querySelector('.bogue-err')).toBeTruthy();
    expect(zone.querySelector('.pj-liste')).toBeNull();
  });

  it('sans pièce jointe, la réponse reste en JSON (chemin historique)', async () => {
    const zone = await ouvrirLeTicket();
    await envoyer(zone);
    expect(envois.length).toBe(1);
    expect(typeof envois[0].init?.body).toBe('string');
    expect(JSON.parse(String(envois[0].init?.body))).toEqual({ body: 'Voici la capture demandée.' });
  });
});
