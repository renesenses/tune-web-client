// @vitest-environment jsdom
//
// renesenses/tune-server-rust#4664 — « Voir 3 screenshots : système n'accepte
// qu'un seul attachment ?? » (jfpaquet, 0.9.161, ticket support 153).
//
// Le ticket n'a reçu qu'UNE capture sur trois. Aucune borne de la chaîne ne
// plafonne à un fichier : c'est le champ qui remplaçait sa liste à chaque
// sélection (`fichiers = Array.from(input.files)`). Choisies une par une, les
// captures s'écrasaient, et seule la dernière partait.
//
// On monte le VRAI écran, on choisit trois fichiers en TROIS gestes, on envoie,
// et on compte ce qui part sur le réseau. Le même défaut vivait dans le champ
// voisin des captures du rapport au forum (#4564) : il est mesuré de la même
// façon.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SupportV2 from '../../components/v2/SupportV2.svelte';
import { licenseState } from '../stores/license';
import fr from '../locales/fr';

vi.setConfig({ testTimeout: 60_000 });

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

function capture(nom: string, date: number): File {
  return new File([new Uint8Array(64)], nom, { type: 'image/png', lastModified: date });
}

/** Un geste de sélection : le sélecteur natif rend UNE liste, puis `change`. */
function choisir(champ: HTMLInputElement, fichiers: File[]) {
  Object.defineProperty(champ, 'files', { value: fichiers, configurable: true });
  champ.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

describe('#4664 — chaque sélection de fichiers s’AJOUTE à la liste', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;
  let envois: { url: string; corps: FormData | null }[];

  beforeEach(() => {
    envois = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: RequestInit) => {
        const u = String(url);
        const post = String(options?.method ?? 'GET').toUpperCase() === 'POST';
        if (post) envois.push({ url: u, corps: options?.body instanceof FormData ? options.body : null });
        if (post && /\/support\/tickets/.test(u)) return reponse(200, { id: 153 });
        if (/\/support\/tickets/.test(u)) return reponse(200, { tickets: [] });
        if (post && /\/system\/bug-report\/submit$/.test(u)) {
          return reponse(200, { status: 'ok', url: 'https://mozaiklabs.fr/forum/t/bug-42', slug: 'bug-42', images: 3 });
        }
        if (/\/system\/bug-report\/markdown$/.test(u)) return reponse(200, '# Rapport');
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

  async function monter() {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SupportV2, { target: hote });
    flushSync();
    await respirer();
    flushSync();
    return hote;
  }

  it('« Écrire au support » : trois captures choisies une par une partent TOUTES les trois', async () => {
    const h = await monter();
    (Array.from(h.querySelectorAll('button')) as HTMLButtonElement[])
      .find((b) => b.textContent?.includes(fr['v2.sup.tabTickets']))
      ?.click();
    flushSync();
    await respirer();
    flushSync();
    const ouvrir = (Array.from(h.querySelectorAll('button')) as HTMLButtonElement[]).find((b) =>
      b.textContent?.includes(fr['v2.sup.newTicket']),
    );
    expect(ouvrir, 'le bouton « Écrire au support » n’est pas rendu — témoin sans objet').toBeTruthy();
    ouvrir!.click();
    flushSync();

    const formulaire = h.querySelector('form.redac') as HTMLFormElement;
    expect(formulaire, 'le formulaire n’est pas rendu — témoin sans objet').toBeTruthy();
    const sujet = formulaire.querySelector('input.txt') as HTMLInputElement;
    const corps = formulaire.querySelector('textarea.zone') as HTMLTextAreaElement;
    sujet.value = 'Recherche';
    sujet.dispatchEvent(new Event('input', { bubbles: true }));
    corps.value = '119 pistes attendues.';
    corps.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    const champ = formulaire.querySelector('input[type="file"]') as HTMLInputElement;
    expect(champ, 'le champ des pièces jointes n’est pas rendu').toBeTruthy();
    choisir(champ, [capture('Search results.png', 1)]);
    choisir(champ, [capture('Library count.png', 2)]);
    choisir(champ, [capture('Folder view.png', 3)]);

    // Ce que le testeur voit avant d'envoyer : les trois noms.
    for (const nom of ['Search results.png', 'Library count.png', 'Folder view.png']) {
      expect(formulaire.textContent, `« ${nom} » n’est plus listé sous le champ`).toContain(nom);
    }

    formulaire.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await respirer(120);
    flushSync();

    const envoi = envois.find((e) => /\/support\/tickets/.test(e.url));
    expect(envoi?.corps, 'aucun envoi multipart vers /support/tickets').toBeTruthy();
    const pieces = envoi!.corps!.getAll('attachments[]') as File[];
    expect(
      pieces.map((f) => f.name),
      'le ticket ne reçoit pas les trois captures choisies une par une',
    ).toEqual(['Search results.png', 'Library count.png', 'Folder view.png']);
  });

  it('« Écrire au support » : « Retirer » ôte une pièce et elle seule', async () => {
    const h = await monter();
    (Array.from(h.querySelectorAll('button')) as HTMLButtonElement[])
      .find((b) => b.textContent?.includes(fr['v2.sup.tabTickets']))
      ?.click();
    flushSync();
    await respirer();
    flushSync();
    (Array.from(h.querySelectorAll('button')) as HTMLButtonElement[])
      .find((b) => b.textContent?.includes(fr['v2.sup.newTicket']))!
      .click();
    flushSync();
    const formulaire = h.querySelector('form.redac') as HTMLFormElement;
    const champ = formulaire.querySelector('input[type="file"]') as HTMLInputElement;
    choisir(champ, [capture('a.png', 1), capture('b.png', 2)]);
    choisir(champ, [capture('c.png', 3)]);

    const retirer = (Array.from(formulaire.querySelectorAll('button')) as HTMLButtonElement[]).filter(
      (b) => b.textContent?.trim() === fr['v2.sup.fileRemove'],
    );
    expect(retirer).toHaveLength(3);
    retirer[1].click();
    flushSync();
    expect(formulaire.textContent).toContain('a.png');
    expect(formulaire.textContent).not.toContain('b.png');
    expect(formulaire.textContent).toContain('c.png');
  });

  it('« Signaler dans le forum » : trois captures choisies une par une partent toutes', async () => {
    const h = await monter();
    const zone = h.querySelector('textarea.bogue-desc') as HTMLTextAreaElement | null;
    expect(zone, 'le champ de description du bogue n’est pas rendu').toBeTruthy();
    zone!.value = 'La recherche rend 3 pistes.';
    zone!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    // Le champ des captures est le seul à n'accepter que des images.
    const champ = h.querySelector('input[type="file"][accept^="image/"]') as HTMLInputElement;
    expect(champ, 'le champ des captures n’est pas rendu').toBeTruthy();
    choisir(champ, [capture('un.png', 1)]);
    choisir(champ, [capture('deux.png', 2)]);
    choisir(champ, [capture('trois.png', 3)]);

    (Array.from(h.querySelectorAll('button')) as HTMLButtonElement[])
      .find((b) => b.textContent?.includes(fr['v2.sup.bugSend']))!
      .click();
    await respirer(120);
    flushSync();

    const envoi = envois.find((e) => /\/system\/bug-report\/submit$/.test(e.url));
    expect(envoi?.corps, 'aucun envoi multipart vers /system/bug-report/submit').toBeTruthy();
    const images = envoi!.corps!.getAll('images[]') as File[];
    expect(images.map((f) => f.name)).toEqual(['un.png', 'deux.png', 'trois.png']);
  });
});
