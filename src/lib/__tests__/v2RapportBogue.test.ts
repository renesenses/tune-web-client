// @vitest-environment jsdom
//
// Le rapport de bogue envoyé au FORUM survit à la phase 5.
//
// Il n'existait que dans `DiagnosticsView` (client actuel), en `fetch` direct
// vers `POST /system/bug-report/submit` — hors de `api.ts`, donc invisible pour
// l'inventaire des capacités sans chemin. La phase 5 supprime cet écran : sans
// ce portage, un utilisateur SANS licence n'avait plus aucun canal de retour
// (le ticket de support v2 exige une clé).
//
// On monte le vrai écran et on lit le DOM : vérifier qu'une fonction est citée
// ne prouve pas que le geste marche.
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
    text: async () => (typeof corps === 'string' ? corps : JSON.stringify(corps)),
  } as unknown as Response;
}

describe('Support v2 — signaler un bogue au forum (porté de DiagnosticsView)', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;
  let envoi: { status: number; corps: unknown };
  let appels: { url: string; method: string; body: string | null }[];

  beforeEach(() => {
    envoi = { status: 200, corps: { status: 'ok', url: 'https://mozaiklabs.fr/forum/t/bug-42', slug: 'bug-42' } };
    appels = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: RequestInit) => {
        const u = String(url);
        const method = String(options?.method ?? 'GET').toUpperCase();
        appels.push({ url: u, method, body: (options?.body as string) ?? null });
        if (/\/system\/bug-report\/submit$/.test(u)) return reponse(envoi.status, envoi.corps);
        if (/\/system\/bug-report\/markdown$/.test(u)) return reponse(200, '# Rapport\n\njournaux…');
        return reponse(200, {});
      }),
    );
    // SANS licence : le rapport au forum doit rester accessible.
    licenseState.update((s) => ({ ...s, loaded: true, tier: 'free', licenseKey: null }));
  });

  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    if (hote) hote.remove();
    hote = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function monterEtEnvoyer(description: string) {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SupportV2, { target: hote });
    flushSync();
    await respirer();
    flushSync();

    const zone = hote.querySelector('textarea.bogue-desc') as HTMLTextAreaElement | null;
    expect(zone, 'le champ de description du bogue n’est pas rendu dans le volet Diagnostic').toBeTruthy();
    zone!.value = description;
    zone!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    const bouton = (Array.from(hote.querySelectorAll('button')) as HTMLButtonElement[]).find((b) =>
      b.textContent?.includes(fr['v2.sup.bugSend']),
    );
    expect(bouton, 'le bouton « Envoyer au forum » n’est pas rendu').toBeTruthy();
    bouton!.click();
    await respirer(80);
    flushSync();
  }

  it('envoie la description à POST /system/bug-report/submit et affiche le fil créé', async () => {
    await monterEtEnvoyer('  La lecture s’arrête après deux titres.  ');

    const post = appels.find((a) => a.method === 'POST' && /\/system\/bug-report\/submit$/.test(a.url));
    expect(post, 'aucun POST vers /system/bug-report/submit : le geste ne part pas').toBeTruthy();
    // Même contrat que DiagnosticsView : `{ description }`, rognée.
    expect(JSON.parse(post!.body!)).toEqual({ description: 'La lecture s’arrête après deux titres.' });

    expect(hote!.textContent).toContain(fr['v2.sup.bugSent']);
    const lien = hote!.querySelector('a[href="https://mozaiklabs.fr/forum/t/bug-42"]');
    expect(lien, 'le lien vers le fil créé n’est pas affiché').toBeTruthy();
  });

  it('un refus du service affiche une erreur lisible, avec le motif', async () => {
    envoi = { status: 502, corps: { error: 'cloud rejected the report', status: 422 } };
    await monterEtEnvoyer('Bogue');

    const err = hote!.querySelector('.bogue-err');
    expect(err, 'aucune erreur affichée après un refus').toBeTruthy();
    expect(err!.textContent).toContain(fr['v2.sup.bugSendError']);
    expect(err!.textContent).toContain('cloud rejected the report');
    expect(hote!.textContent).not.toContain(fr['v2.sup.bugSent']);
  });
});
