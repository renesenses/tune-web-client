// @vitest-environment jsdom
//
// renesenses/tune-web-client#1571 — « quand on clique sur support on voit
// apparaître en haut à droite : + Écrire au support qui disparaît lorsqu'on
// clique dessus » (Bertrand, fil 1920, 0.9.163 Windows).
//
// CAUSE (établie en montant le vrai écran) : ni la route ni un composant non
// monté. C'est l'ÉTAT. Le bouton d'en-tête pose `redaction = true` et se masque
// (`{#if licenseKey && !redaction}`), mais le formulaire est une branche SŒUR de
// `volet === 'diagnostic'` et `volet === 'systeme'` dans la même chaîne
// `{#if}`. Sur l'onglet Diagnostic — celui qu'on voit en arrivant — c'est donc
// toujours le diagnostic qui est rendu : le bouton s'efface, rien ne s'ouvre.
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

describe('#1571 — « Écrire au support » ouvre le formulaire depuis TOUS les volets', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (/\/support\/tickets/.test(String(url))) return reponse(200, { tickets: [] });
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

  const boutons = (h: HTMLElement) => Array.from(h.querySelectorAll('button')) as HTMLButtonElement[];
  const bouton = (h: HTMLElement, cle: keyof typeof fr) =>
    boutons(h).find((b) => b.textContent?.includes(fr[cle] as string));

  for (const [nom, onglet] of [
    ['Diagnostic (onglet d’arrivée)', null],
    ['Mon système', 'v2.sup.tabSystem'],
  ] as const) {
    it(`depuis « ${nom} » : le clic ouvre le formulaire, il ne fait pas que masquer le bouton`, async () => {
      const h = await monter();
      if (onglet) {
        bouton(h, onglet)!.click();
        flushSync();
        await respirer();
        flushSync();
      }
      expect(h.querySelector('form.redac'), 'formulaire déjà rendu avant le clic — témoin sans objet').toBeNull();
      const ouvrir = bouton(h, 'v2.sup.newTicket');
      expect(ouvrir, 'le bouton « Écrire au support » n’est pas rendu — témoin sans objet').toBeTruthy();
      ouvrir!.click();
      flushSync();
      await respirer();
      flushSync();

      expect(
        h.querySelector('form.redac'),
        'le bouton a disparu mais le formulaire ne s’est pas ouvert (#1571)',
      ).toBeTruthy();
      const actif = h.querySelector('nav.volets button.on');
      expect(actif?.textContent).toContain(fr['v2.sup.tabTickets']);
    });
  }
});
