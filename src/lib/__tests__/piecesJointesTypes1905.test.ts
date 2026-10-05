// @vitest-environment jsdom
//
// web#1905 (Levente Toth, 1.0.0-rc1 Linux, fil 2134, ticket 227) : la vidéo
// d'un défaut visuel s'ajoute aux pièces jointes de « Écrire au support » sans
// un mot, puis le site la refuse à l'envoi. Le champ n'avait pas d'`accept`,
// et rien ne disait au choix ce que le support admet.
//
// Liste de référence : `StoreSupportTicketRequest` du site,
// `mimes:log,txt,zip,json,csv,xml,md,png,jpg,jpeg`, `max:51200` (Ko) ; le
// serveur la recopie (`ALLOWED_EXT`, `MAX_FILE_BYTES`, routes/support.rs).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SupportV2 from '../../components/v2/SupportV2.svelte';
import { licenseState } from '../stores/license';
import {
  ACCEPT_PIECES_JOINTES,
  EXTENSIONS_PIECES_JOINTES,
  MAX_PIECE_JOINTE_OCTETS,
  refusPieceJointe,
} from '../piecesJointes';
import fr from '../locales/fr';

vi.setConfig({ testTimeout: 60_000 });

describe('#1905 — ce que le support admet', () => {
  it('la liste est celle du site, ni plus ni moins', () => {
    expect([...EXTENSIONS_PIECES_JOINTES]).toEqual(['log', 'txt', 'zip', 'json', 'csv', 'xml', 'md', 'png', 'jpg', 'jpeg']);
    expect(ACCEPT_PIECES_JOINTES).toBe('.log,.txt,.zip,.json,.csv,.xml,.md,.png,.jpg,.jpeg');
    expect(MAX_PIECE_JOINTE_OCTETS).toBe(51200 * 1024);
  });

  it('une vidéo, un PDF ou un fichier sans extension sont refusés pour leur type', () => {
    for (const name of ['defaut.mov', 'defaut.mp4', 'notice.pdf', 'capture.webp', 'journal']) {
      expect(refusPieceJointe({ name, size: 10 }), name).toBe('type');
    }
  });

  it('les types admis passent, majuscules comprises', () => {
    for (const name of ['tune.log', 'notes.TXT', 'Capture.PNG', 'photo.jpeg', 'diag.md', 'a.b.zip']) {
      expect(refusPieceJointe({ name, size: 10 }), name).toBeNull();
    }
  });

  it('au-delà de 50 Mo, le fichier est refusé pour sa taille', () => {
    expect(refusPieceJointe({ name: 'gros.zip', size: MAX_PIECE_JOINTE_OCTETS })).toBeNull();
    expect(refusPieceJointe({ name: 'gros.zip', size: MAX_PIECE_JOINTE_OCTETS + 1 })).toBe('taille');
  });
});

/* ------------------------------------------------------------------ */

const respirer = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: () => null },
    json: async () => corps,
    text: async () => (typeof corps === 'string' ? corps : JSON.stringify(corps)),
  } as unknown as Response;
}

function fichier(nom: string, type: string, taille = 64): File {
  const f = new File([new Uint8Array(64)], nom, { type, lastModified: 1 });
  if (taille !== 64) Object.defineProperty(f, 'size', { value: taille });
  return f;
}

function choisir(champ: HTMLInputElement, fichiers: File[]) {
  Object.defineProperty(champ, 'files', { value: fichiers, configurable: true });
  champ.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

describe('#1905 — le champ des pièces jointes de « Écrire au support »', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (/\/support\/tickets/.test(String(url))) return reponse(200, { tickets: [] });
      return reponse(200, {});
    }));
    licenseState.update((s) => ({ ...s, loaded: true, tier: 'premium', licenseKey: 'TEST-KEY' }));
  });

  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    hote = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    licenseState.update((s) => ({ ...s, loaded: false, tier: 'free', licenseKey: null }));
  });

  async function formulaire(): Promise<HTMLFormElement> {
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
    const ouvrir = (Array.from(hote.querySelectorAll('button')) as HTMLButtonElement[])
      .find((b) => b.textContent?.includes(fr['v2.sup.newTicket']));
    expect(ouvrir, 'le bouton « Écrire au support » n’est pas rendu — témoin sans objet').toBeTruthy();
    ouvrir!.click();
    flushSync();
    const f = hote.querySelector('form.redac') as HTMLFormElement;
    expect(f, 'le formulaire n’est pas rendu — témoin sans objet').toBeTruthy();
    return f;
  }

  it('porte en `accept` les types que le site admet', async () => {
    const champ = (await formulaire()).querySelector('input[type="file"]') as HTMLInputElement;
    expect(champ.getAttribute('accept')).toBe('.log,.txt,.zip,.json,.csv,.xml,.md,.png,.jpg,.jpeg');
  });

  it('une vidéo est refusée dès le choix, avec son nom et les types admis', async () => {
    const f = await formulaire();
    const champ = f.querySelector('input[type="file"]') as HTMLInputElement;
    choisir(champ, [fichier('journal.log', 'text/plain')]);
    choisir(champ, [fichier('Defaut visuel.mov', 'video/quicktime')]);

    expect(f.querySelector('.pj-liste')?.textContent).toContain('journal.log');
    expect(f.querySelector('.pj-liste')?.textContent).not.toContain('Defaut visuel.mov');
    const erreur = f.querySelector('.bogue-err')?.textContent ?? '';
    expect(erreur).toContain('Defaut visuel.mov');
    expect(erreur).toContain('png, jpg, jpeg');

    // Un choix valide efface le message et s'ajoute.
    choisir(champ, [fichier('capture.png', 'image/png')]);
    expect(f.querySelector('.bogue-err')).toBeNull();
    expect(f.querySelector('.pj-liste')?.textContent).toContain('capture.png');
  });

  it('un fichier de plus de 50 Mo est refusé dès le choix', async () => {
    const f = await formulaire();
    const champ = f.querySelector('input[type="file"]') as HTMLInputElement;
    choisir(champ, [fichier('journaux.zip', 'application/zip', MAX_PIECE_JOINTE_OCTETS + 1)]);
    expect(f.querySelector('.pj-liste')).toBeNull();
    expect(f.querySelector('.bogue-err')?.textContent ?? '').toContain('journaux.zip');
  });
});
