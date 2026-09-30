// @vitest-environment jsdom
//
// Serveur #5427 (fil 2035) — l'ARL Deezer se saisit sur la carte Streaming.
//
// La carte Deezer de Réglages ▸ Accès ▸ Services de streaming n'offrait que
// « Se connecter », qui postait un corps vide : le serveur répondait
// « deezer: app_id required ». Le champ ARL passe désormais par la route
// d'Accès et jetons (`POST /services/tokens/deezer`) et affiche la réponse
// du serveur : acceptée, refusée ou injoignable.
//
// Il n'est offert que si le serveur annonce `arl_streaming: true` dans
// `GET /services/tokens` : sur un serveur plus ancien, la carte ne change pas.
//
// Ces témoins MONTENT `SettingsV2` et lisent la carte rendue. L'ARL employé
// est factice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import type { V2SettingsTabId } from '../v2Settings';
import { lireRetourArl, offreChampArl } from '../arlDeezer';

vi.setConfig({ testTimeout: 30_000 });

const ARL_FACTICE = 'F'.repeat(192);

class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
let postes: { url: string; corps: unknown }[] = [];

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 8) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

/** Un faux serveur : `drapeau` dit s'il porte #5427, `reponse` ce qu'il rend à l'enregistrement. */
function serveur(drapeau: boolean, reponse: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const methode = (init?.method ?? 'GET').toUpperCase();
      let charge: unknown = {};
      if (url.includes('/services/tokens/deezer') && methode === 'POST') {
        postes.push({ url, corps: init?.body ? JSON.parse(String(init.body)) : null });
        charge = reponse;
      } else if (url.endsWith('/services/tokens')) {
        charge = [
          {
            id: 'deezer', name: 'Deezer', kind: 'arl_token', configured: false,
            fields: [{ key: 'arl', label: 'ARL', type: 'password' }],
            ...(drapeau ? { arl_streaming: true } : {}),
          },
        ];
      } else if (url.includes('/streaming/services')) {
        charge = { deezer: { enabled: true, authenticated: false } };
      } else if (url.includes('/streaming/deezer/status')) {
        charge = { service: 'deezer', enabled: true, authenticated: true, username: 'testeur' };
      } else if (url.includes('/system/health')) charge = { status: 'ok' };
      else if (url.includes('/zones') || url.includes('/devices')) charge = [];
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => JSON.stringify(charge),
        json: async () => charge,
      } as unknown as Response;
    }),
  );
}

async function monterCarteStreaming() {
  locale.set('fr');
  v2SettingsTarget.set({ tab: 'access' as V2SettingsTabId, section: 'streaming' });
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  await souffler();
  return hote;
}

async function saisirEtEnregistrer(h: HTMLElement, arl: string) {
  const champ = h.querySelector<HTMLInputElement>('[data-arl-deezer] input');
  expect(champ, 'le champ ARL doit être offert sur la carte Deezer').toBeTruthy();
  champ!.value = arl;
  champ!.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  h.querySelector<HTMLButtonElement>('[data-arl-enregistrer]')!.click();
  await souffler();
}

beforeEach(() => {
  postes = [];
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  v2SettingsTarget.set(null);
  vi.unstubAllGlobals();
});

describe('#5427 — l’ARL Deezer sur la carte Streaming', () => {
  it('🔴 le champ, masqué, passe par la route d’Accès et jetons, et la réponse acceptée se lit', async () => {
    serveur(true, { valid: true, etat: 'accepte', validation_message: 'ARL accepté : connecté à Deezer (testeur).' });
    const h = await monterCarteStreaming();

    const champ = h.querySelector<HTMLInputElement>('[data-arl-deezer] input');
    expect(champ, 'le champ ARL doit être offert sur la carte Deezer (#5427)').toBeTruthy();
    expect(champ!.type, 'l’ARL est masqué par défaut').toBe('password');
    const bascule = [...h.querySelectorAll<HTMLButtonElement>('[data-arl-deezer] button')].find(
      (b) => (b.textContent ?? '').trim() === 'Afficher',
    );
    expect(bascule, 'un bouton doit afficher l’ARL').toBeTruthy();
    bascule!.click();
    flushSync();
    expect(h.querySelector<HTMLInputElement>('[data-arl-deezer] input')!.type).toBe('text');

    await saisirEtEnregistrer(h, ARL_FACTICE);

    expect(postes.length, 'l’ARL doit partir vers POST /services/tokens/deezer').toBe(1);
    expect(postes[0].corps).toEqual({ arl: ARL_FACTICE });
    const retour = h.querySelector('[data-arl-retour]');
    expect(retour?.getAttribute('data-arl-retour')).toBe('accepte');
    expect(retour?.textContent).toContain('ARL accepté par Deezer');
    expect(h.textContent, 'la carte ne doit jamais réafficher l’ARL').not.toContain(ARL_FACTICE);
  });

  it('un ARL refusé se dit refusé', async () => {
    serveur(true, {
      valid: false, etat: 'refuse',
      validation_message: 'Erreur : deezer: ARL refusé par Deezer (ARL invalide ou expiré)',
    });
    const h = await monterCarteStreaming();
    await saisirEtEnregistrer(h, 'M'.repeat(192));
    const retour = h.querySelector('[data-arl-retour]');
    expect(retour?.getAttribute('data-arl-retour')).toBe('refuse');
    expect(retour?.textContent).toContain('ARL refusé par Deezer');
    expect(retour?.textContent).toContain('ARL invalide ou expiré');
  });

  it('Deezer injoignable se distingue d’un refus', async () => {
    serveur(true, {
      valid: false, etat: 'injoignable',
      validation_message: 'Erreur : deezer: ARL non vérifié, Deezer injoignable (délai dépassé)',
    });
    const h = await monterCarteStreaming();
    await saisirEtEnregistrer(h, 'I'.repeat(192));
    const retour = h.querySelector('[data-arl-retour]');
    expect(retour?.getAttribute('data-arl-retour')).toBe('injoignable');
    expect(retour?.textContent).toContain('Deezer injoignable');
  });

  it('sur un serveur plus ancien (sans `arl_streaming`), la carte ne change pas', async () => {
    serveur(false, { valid: true, validation_message: 'Pas de validation disponible.' });
    const h = await monterCarteStreaming();
    expect(h.querySelector('[data-arl-deezer]'), 'aucun champ ARL sur un serveur antérieur à #5427').toBeNull();
    const boutons = [...h.querySelectorAll<HTMLButtonElement>('.svc button')].map((b) => (b.textContent ?? '').trim());
    expect(boutons, 'le bouton « Se connecter » d’avant reste là').toContain('Se connecter');
  });
});

describe('#5427 — la lecture du drapeau et de la réponse', () => {
  it('le drapeau doit valoir exactement `true`', () => {
    expect(offreChampArl([{ id: 'deezer', arl_streaming: true } as any])).toBe(true);
    expect(offreChampArl([{ id: 'deezer' } as any])).toBe(false);
    expect(offreChampArl([{ id: 'deezer', arl_streaming: 'oui' } as any])).toBe(false);
    expect(offreChampArl(null)).toBe(false);
  });

  it('les trois états, et un repli sur `valid` sans `etat`', () => {
    expect(lireRetourArl({ valid: false, etat: 'injoignable' } as any).etat).toBe('injoignable');
    expect(lireRetourArl({ valid: false, etat: 'refuse' } as any).etat).toBe('refuse');
    expect(lireRetourArl({ valid: true, etat: 'accepte' } as any).etat).toBe('accepte');
    expect(lireRetourArl({ valid: true }).etat).toBe('accepte');
    expect(lireRetourArl({ valid: false }).etat).toBe('refuse');
  });
});
