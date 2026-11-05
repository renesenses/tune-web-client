// @vitest-environment jsdom
//
// renesenses/tune-server-rust#7920 — « Signaler dans le forum » : joindre un
// journal. Le champ n'acceptait que des images (#4564) : un `tune.log` était
// refusé à l'écran (« n'est pas une image ») et ne pouvait pas partir.
//
// Le site range désormais des journaux avec le fil (site-mozaiklabs#471) et le
// serveur les relaie sous `attachments[]`. On monte le VRAI écran, on choisit
// une capture et un journal, on envoie, et on lit ce qui part sur le réseau.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SupportV2 from '../../components/v2/SupportV2.svelte';
import { licenseState } from '../stores/license';
import { refusPiecesRapport, familleDePiece } from '../piecesRapportBogue';
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

function fichier(nom: string, taille = 64, type = 'application/octet-stream'): File {
  return new File([new Uint8Array(taille)], nom, { type, lastModified: 1 });
}

/** Un fichier de `taille` octets annoncés, sans les allouer. */
function lourd(nom: string, taille: number): Pick<File, 'name' | 'size'> {
  return { name: nom, size: taille };
}

function choisir(champ: HTMLInputElement, fichiers: File[]) {
  Object.defineProperty(champ, 'files', { value: fichiers, configurable: true });
  champ.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

describe('#7920 — les règles des pièces du rapport', () => {
  it('range chaque fichier d’après son extension', () => {
    expect(familleDePiece('capture.PNG')).toBe('image');
    for (const nom of ['tune.log', 'notes.txt', 'etat.json', 'journaux.zip']) {
      expect(familleDePiece(nom), nom).toBe('journal');
    }
    expect(familleDePiece('outil.exe')).toBeNull();
    expect(familleDePiece('sans-extension')).toBeNull();
  });

  it('accepte 3 images et 3 journaux ensemble, dont un journal de 10 Mo tout juste', () => {
    expect(
      refusPiecesRapport([
        lourd('a.png', 10), lourd('b.png', 10), lourd('c.png', 4 * 1024 * 1024),
        lourd('a.log', 10 * 1024 * 1024), lourd('b.txt', 10), lourd('c.zip', 10),
      ]),
    ).toBeNull();
  });

  it('refuse un type interdit en le nommant', () => {
    expect(refusPiecesRapport([lourd('outil.exe', 10)])).toEqual({
      cle: 'v2.sup.bugImagesType',
      params: { nom: 'outil.exe' },
    });
  });

  it('refuse un quatrième journal et un journal de plus de 10 Mo', () => {
    expect(
      refusPiecesRapport([lourd('a.log', 1), lourd('b.log', 1), lourd('c.log', 1), lourd('d.log', 1)])?.cle,
    ).toBe('v2.sup.bugLogsTooMany');
    expect(refusPiecesRapport([lourd('enorme.log', 10 * 1024 * 1024 + 1)])).toEqual({
      cle: 'v2.sup.bugImagesTooLarge',
      params: { nom: 'enorme.log', max: 10 },
    });
  });
});

describe('#7920 — « Signaler dans le forum » envoie le journal sous attachments[]', () => {
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
        if (/\/support\/tickets/.test(u)) return reponse(200, { tickets: [] });
        if (post && /\/system\/bug-report\/submit$/.test(u)) {
          return reponse(200, {
            status: 'ok', url: 'https://mozaiklabs.fr/forum/t/bug-42', slug: 'bug-42', images: 1, attachments: 1,
          });
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
    const zone = hote.querySelector('textarea.bogue-desc') as HTMLTextAreaElement | null;
    expect(zone, 'le champ de description du bogue n’est pas rendu').toBeTruthy();
    zone!.value = 'La lecture s’arrête.';
    zone!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    const champ = hote.querySelector('input[type="file"][accept^="image/"]') as HTMLInputElement;
    expect(champ, 'le champ des pièces du rapport n’est pas rendu').toBeTruthy();
    return { h: hote, champ };
  }

  it('le champ propose les journaux, et l’aide le dit', async () => {
    const { h, champ } = await monter();
    const accept = champ.getAttribute('accept') ?? '';
    for (const ext of ['.log', '.txt', '.json', '.zip']) {
      expect(accept, `le champ ne propose pas les ${ext}`).toContain(ext);
    }
    expect(accept).toContain('image/png');
    expect(h.textContent).toContain(fr['v2.sup.bugImagesHint']);
    expect(fr['v2.sup.bugImagesHint']).toContain('.log');
  });

  it('une capture et un journal partent, chacun sous son champ', async () => {
    const { h, champ } = await monter();
    choisir(champ, [fichier('capture.png', 64, 'image/png')]);
    choisir(champ, [fichier('tune.log', 128, 'text/plain')]);
    expect(h.querySelector('.bogue-err'), 'un refus s’affiche pour un journal accepté').toBeNull();

    (Array.from(h.querySelectorAll('button')) as HTMLButtonElement[])
      .find((b) => b.textContent?.includes(fr['v2.sup.bugSend']))!
      .click();
    await respirer(120);
    flushSync();

    const envoi = envois.find((e) => /\/system\/bug-report\/submit$/.test(e.url));
    expect(envoi?.corps, 'aucun envoi multipart vers /system/bug-report/submit').toBeTruthy();
    expect((envoi!.corps!.getAll('images[]') as File[]).map((f) => f.name)).toEqual(['capture.png']);
    expect(
      (envoi!.corps!.getAll('attachments[]') as File[]).map((f) => f.name),
      'le journal doit partir sous attachments[]',
    ).toEqual(['tune.log']);
    expect(h.textContent).toContain(fr['v2.sup.bugLogsSent'].replace('{n}', '1'));
  });

  it('un type interdit est refusé à l’écran, traduit, et rien ne part', async () => {
    const { h, champ } = await monter();
    choisir(champ, [fichier('outil.exe')]);
    const erreur = h.querySelector('.bogue-err');
    expect(erreur?.textContent).toBe(fr['v2.sup.bugImagesType'].replace('{nom}', 'outil.exe'));
    expect(h.querySelector('.bogue-fnoms'), 'le fichier refusé ne doit pas rester dans la liste').toBeNull();
  });
});
