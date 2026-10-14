// @vitest-environment jsdom
//
// web#2095 (FabienM, fil forum 2236, point 3, 1.0.0-rc4) — « Menu Bandcamp :
// mon profil ne remonte rien alors que mon profil public est bien connecté.
// S'il faut activer le plugin il faut le mentionner dans les settings. »
//
// La liaison du pseudo marche sans le greffon, mais la collection passe par
// ses routes `/ext/bandcamp/*`, muettes tant qu'il dort. Le bloc Bandcamp de
// Réglages le dit désormais et propose de l'activer (même geste que
// Réglages › Extensions). Le journal du fil montrait aussi une adresse e-mail
// refusée à la liaison : le champ le dit, et le bouton attend.
//
// Ces témoins MONTENT `SettingsV2` (banc repris de #5427).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { locale } from '../i18n';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import type { V2SettingsTabId } from '../v2Settings';
import { etatGreffonBandcamp, ressembleAUnEmail } from '../greffonBandcamp';
import { identifiantsComplets } from '../identifiantsService';
import lFr from '../locales/fr';

vi.setConfig({ testTimeout: 30_000 });
const fr = lFr as unknown as Record<string, string>;

class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 8) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

let postes: string[] = [];

function serveur(fiche: Record<string, unknown> | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const methode = (init?.method ?? 'GET').toUpperCase();
      let charge: unknown = {};
      if (methode === 'POST' && /\/plugins\/bandcamp\/(install|enable)$/.test(url)) {
        postes.push(url.replace(/^.*\/plugins\//, ''));
        charge = { name: 'bandcamp', enabled: true, restart_required: true, success: true };
      } else if (/\/api\/v1\/plugins$/.test(url)) {
        charge = fiche ? [fiche] : [];
      } else if (url.includes('/streaming/services')) {
        charge = { bandcamp: { enabled: true, authenticated: false } };
      } else if (url.includes('/streaming/bandcamp/status')) {
        charge = { service: 'bandcamp', enabled: true, authenticated: false };
      } else if (url.endsWith('/services/tokens')) charge = [];
      else if (url.includes('/system/health')) charge = { status: 'ok' };
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
  await souffler(12);
  return hote;
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

describe('#2095 — le bloc Bandcamp parle du greffon', () => {
  it('🔴 greffon jamais installé : le bloc le dit, et le bouton l’installe puis l’active', async () => {
    serveur({ name: 'bandcamp', installed: false, enabled: false, loaded: false });
    const h = await monterCarteStreaming();
    const bloc = h.querySelector<HTMLElement>('[data-greffon-bandcamp]');
    expect(bloc, 'le bloc Bandcamp ne dit rien du greffon dormant').toBeTruthy();
    expect(bloc!.dataset.greffonBandcamp).toBe('a_installer');
    expect(bloc!.textContent).toContain(fr['settings.bandcampGreffonManque']);
    h.querySelector<HTMLButtonElement>('button.activer-greffon-bandcamp')!.click();
    await souffler();
    expect(postes).toEqual(['bandcamp/install', 'bandcamp/enable']);
    expect(h.querySelector<HTMLElement>('[data-greffon-bandcamp]')?.textContent)
      .toContain(fr['settings.bandcampGreffonRedemarrer']);
  });

  it('greffon chargé : rien à dire', async () => {
    serveur({ name: 'bandcamp', installed: true, enabled: true, loaded: true, status: 'loaded' });
    const h = await monterCarteStreaming();
    expect(h.querySelector('[data-greffon-bandcamp]')).toBeNull();
  });

  it('🔴 une adresse e-mail dans le champ : le refus se dit, et le bouton attend', async () => {
    serveur({ name: 'bandcamp', installed: true, enabled: true, loaded: true });
    const h = await monterCarteStreaming();
    const champ = h.querySelector<HTMLInputElement>('input[autocomplete="username"][placeholder="' + fr['settings.usernameOnlyPlaceholder'] + '"]');
    expect(champ, 'le champ pseudo Bandcamp').toBeTruthy();
    champ!.value = 'fabien@exemple.fr';
    champ!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(h.querySelector('.bandcamp-email')?.textContent).toBe(fr['settings.bandcampEmailRefused']);
    const bouton = champ!.parentElement!.querySelector<HTMLButtonElement>('button')!;
    expect(bouton.disabled).toBe(true);
    champ!.value = 'fabienm';
    champ!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(h.querySelector('.bandcamp-email')).toBeNull();
    expect(bouton.disabled).toBe(false);
  });
});

describe('#2095 — règles pures', () => {
  it('l’état du greffon d’après GET /plugins', () => {
    expect(etatGreffonBandcamp(null)).toBe('inconnu');
    expect(etatGreffonBandcamp([])).toBe('absent');
    expect(etatGreffonBandcamp([{ name: 'bandcamp', installed: false }])).toBe('a_installer');
    expect(etatGreffonBandcamp([{ name: 'bandcamp', installed: true, enabled: false, loaded: false }])).toBe('a_activer');
    expect(etatGreffonBandcamp([{ name: 'bandcamp', installed: true, enabled: true, loaded: false }])).toBe('a_redemarrer');
    expect(etatGreffonBandcamp([{ name: 'bandcamp', installed: true, enabled: true, status: 'loaded' }])).toBe('actif');
  });

  it('une adresse e-mail n’est pas un pseudo', () => {
    expect(ressembleAUnEmail('a@b.fr')).toBe(true);
    expect(ressembleAUnEmail('fabienm')).toBe(false);
    expect(identifiantsComplets('bandcamp', { user: 'a@b.fr' })).toBe(false);
    expect(identifiantsComplets('bandcamp', { user: 'fabienm' })).toBe(true);
  });
});
