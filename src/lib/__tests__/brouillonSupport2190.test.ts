// @vitest-environment jsdom
//
// web#2190 — fil forum 2276 : « Sortir du support et y revenir efface le
// texte. » On MONTE le vrai écran, on tape, on le DÉMONTE (c'est ce que fait
// la coquille quand on change d'écran), on le remonte, et on lit le champ.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SupportV2 from '../../components/v2/SupportV2.svelte';
import { licenseState } from '../stores/license';
import { viderTousLesBrouillons } from '../brouillonSupport';
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

describe('web#2190 — le brouillon de « Ce qui se passe » survit au départ de l’écran Support', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;

  beforeEach(() => {
    viderTousLesBrouillons();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (/\/system\/bug-report\/submit$/.test(String(url))) {
        return reponse(200, { status: 'ok', url: 'https://mozaiklabs.fr/forum/t/bug-42' });
      }
      return reponse(200, {});
    }));
    licenseState.update((s) => ({ ...s, loaded: true, tier: 'free', licenseKey: null }));
  });

  afterEach(() => {
    demonter();
    viderTousLesBrouillons();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function demonter() {
    if (monte) unmount(monte);
    monte = null;
    if (hote) hote.remove();
    hote = null;
  }

  async function monter() {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SupportV2, { target: hote });
    flushSync();
    await respirer();
    flushSync();
  }

  const champ = () => hote!.querySelector('textarea.bogue-desc') as HTMLTextAreaElement;
  function taper(texte: string) {
    champ().value = texte;
    champ().dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
  }
  const bouton = (libelle: string) =>
    (Array.from(hote!.querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.textContent?.includes(libelle));

  it('quitter l’écran puis y revenir rend le texte tapé', async () => {
    await monter();
    taper('La lecture s’arrête après deux titres.');
    demonter();

    await monter();
    expect(champ().value, 'le texte de « Ce qui se passe » a été perdu en quittant l’écran').toBe(
      'La lecture s’arrête après deux titres.',
    );
  });

  it('un envoi accepté vide le brouillon : au retour, le champ est vierge', async () => {
    await monter();
    taper('Bogue envoyé');
    bouton(fr['v2.sup.bugSend'])!.click();
    await respirer(80);
    flushSync();
    expect(hote!.textContent).toContain(fr['v2.sup.bugSent']);
    demonter();

    await monter();
    expect(champ().value).toBe('');
  });

  it('« Effacer le brouillon » vide le champ et le brouillon gardé', async () => {
    await monter();
    expect(bouton(fr['v2.sup.bugDraftClear']), 'pas de bouton sans texte').toBeUndefined();
    taper('À jeter');
    bouton(fr['v2.sup.bugDraftClear'])!.click();
    flushSync();
    expect(champ().value).toBe('');
    demonter();

    await monter();
    expect(champ().value).toBe('');
  });
});
