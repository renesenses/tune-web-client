// @vitest-environment jsdom
//
// Levente (designer de Tune), 15/11/2026 — retouches du menu de compte, rc12
// (Figma 6qiK4YtKNXHtL0PRfrkYYh, nœuds 606:5796 et 609:5801) :
//   1. plus de texte d'explication sous la photo ;
//   2. plus de titre « Listening profiles on this server » ni de son aide ;
//   3. plus de liste des profils (on change de profil par « Manage profiles ») ;
//   4. plus de « Remove » sous le nom (Bertrand : l'adresse reste, « Remove »
//      passe dans un petit choix sur le rond) ;
//   5. l'entrée « Settings » porte l'icône `settings` de Levente ;
//   6. sous INTERFACE, une phrase courte.
// Le menu est MONTÉ, avec un compte connecté, une photo locale et trois
// profils : tout ce qui faisait apparaître ces éléments est réuni.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AvatarMenu from '../../components/v2/AvatarMenu.svelte';
import { locale } from '../i18n';
import { currentProfileId, profiles } from '../stores/profile';
import { preferences } from '../stores/preferences';

vi.setConfig({ testTimeout: 30_000 });

class Inerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const EMAIL = 'toth.levente@example.org';
const PHOTO_LOCALE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const souffler = async (n = 10) => {
  for (let i = 0; i < n; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
};

beforeEach(() => {
  locale.set('en');
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const charge: unknown = url.includes('/cloud/sso/status')
      ? { configured: true, connected: true, user: { display_name: 'Levente', email: EMAIL, avatar_url: '' } }
      : [];
    return {
      ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge), json: async () => charge,
    } as unknown as Response;
  }));
  profiles.set([
    { id: 1, name: 'Default', display_name: null, avatar_color: '#555' },
    { id: 2, name: EMAIL, display_name: 'Levente', avatar_color: '#c33' },
    { id: 3, name: 'lea', display_name: 'Léa', avatar_color: '#39c' },
  ] as any);
  currentProfileId.set(2);
  preferences.update((p) => ({ ...p, avatarImage: PHOTO_LOCALE, avatarCompte: EMAIL }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } }
  monte = null;
  hote?.remove();
  hote = null;
  profiles.set([]);
  currentProfileId.set(1);
  preferences.update((p) => ({ ...p, avatarImage: '', avatarCompte: '' }));
  vi.unstubAllGlobals();
});

async function ouvrir() {
  monte = mount(AvatarMenu, { target: hote! });
  await souffler();
  hote!.querySelector<HTMLButtonElement>('button.avatar')!.click();
  await souffler();
  const menu = hote!.querySelector<HTMLElement>('.avmenu');
  expect(menu, 'le menu ne s’est pas ouvert').not.toBeNull();
  return menu!;
}

describe('Menu de compte — retouches de Levente (15/11/2026)', () => {
  it('l’en-tête garde la photo, le nom et l’adresse en style secondaire (décision de Bertrand)', async () => {
    const m = await ouvrir();
    expect(m.querySelector('.avname')?.textContent?.trim()).toBe('Levente');
    expect(m.querySelector<HTMLImageElement>('.avhead img.avimg')?.getAttribute('src')).toBe(PHOTO_LOCALE);
    expect(m.querySelector('.avid .avmail')?.textContent?.trim()).toBe(EMAIL);
    // « Remove » n'est plus posé sous le nom : il vit dans le choix du rond.
    expect(m.querySelector('[data-retirer-photo]')).toBeNull();
    expect(Array.from(m.querySelectorAll('button')).map((b) => b.textContent?.trim())).not.toContain('Remove');
  });

  it('avec une photo locale, le rond propose « Change photo » / « Remove »', async () => {
    const m = await ouvrir();
    const champ = hote!.querySelector<HTMLInputElement>('input.fichier[type="file"]');
    const clic = vi.spyOn(champ!, 'click').mockImplementation(() => {});
    m.querySelector<HTMLButtonElement>('.avhead button.avatar.sm')!.click();
    flushSync();
    expect(clic, 'le rond ne doit plus ouvrir l’explorateur d’emblée').not.toHaveBeenCalled();
    const choix = Array.from(m.querySelectorAll<HTMLButtonElement>('[data-choix-photo] button'));
    expect(choix.map((b) => b.textContent?.trim())).toEqual(['Change photo', 'Remove']);
    choix[0].click();
    expect(clic).toHaveBeenCalledOnce();
  });

  it('« Remove » vide la photo locale et retombe sur celle du compte, ou le dégradé', async () => {
    const m = await ouvrir();
    m.querySelector<HTMLButtonElement>('.avhead button.avatar.sm')!.click();
    flushSync();
    m.querySelector<HTMLButtonElement>('[data-retirer-photo]')!.click();
    await souffler(2);
    let prefs: any;
    preferences.subscribe((p) => (prefs = p))();
    expect(prefs.avatarImage).toBe('');
    expect(prefs.avatarCompte).toBe('');
    // Ce compte n'a pas de photo en ligne : plus d'image, le dégradé revient.
    expect(m.querySelector('.avhead img.avimg')).toBeNull();
    expect(hote!.querySelector('button.avatar:not(.sm) img')).toBeNull();
  });

  it('sans photo locale, le rond ouvre l’explorateur directement, sans « Remove »', async () => {
    preferences.update((p) => ({ ...p, avatarImage: '', avatarCompte: '' }));
    const m = await ouvrir();
    const champ = hote!.querySelector<HTMLInputElement>('input.fichier[type="file"]');
    const clic = vi.spyOn(champ!, 'click').mockImplementation(() => {});
    m.querySelector<HTMLButtonElement>('.avhead button.avatar.sm')!.click();
    flushSync();
    expect(clic).toHaveBeenCalledOnce();
    expect(m.querySelector('[data-retirer-photo]')).toBeNull();
  });

  it('plus de texte sur la photo (1), ni rubrique, ni aide, ni liste des profils (2, 3)', async () => {
    const m = await ouvrir();
    const texte = m.textContent ?? '';
    expect(texte).not.toMatch(/Cropped to a square/);
    expect(texte).not.toMatch(/Listening profiles on this server/i);
    expect(texte).not.toMatch(/A profile keeps a listening history/);
    expect(texte).not.toMatch(/Switching profile reloads/);
    expect(m.querySelector('[data-section-profils]')).toBeNull();
    expect(m.querySelector('.profils, button.profil')).toBeNull();
    expect(texte).not.toContain('Léa');
    // Le changement de profil passe par « Manage profiles », toujours là.
    expect(Array.from(m.querySelectorAll('button.item')).map((b) => b.textContent?.trim()))
      .toContain('Manage profiles');
  });

  it('« Settings » porte l’icône de Levente (5)', async () => {
    const m = await ouvrir();
    const reglages = Array.from(m.querySelectorAll<HTMLButtonElement>('button.item'))
      .find((b) => b.textContent?.trim() === 'Settings');
    expect(reglages, 'entrée Settings absente').toBeTruthy();
    const svg = reglages!.querySelector('svg[data-icone="settings"]');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg!.getAttribute('stroke')).toBe('currentColor');
    expect(svg!.getAttribute('stroke-width')).toBe('2');
    // Lucide « settings » (ISC), tracés repris tels quels du fichier de Levente.
    const chemins = Array.from(svg!.querySelectorAll('path')).map((p) => p.getAttribute('d') ?? '');
    expect(chemins).toHaveLength(1);
    expect(chemins[0].startsWith('M9.671 4.136a2.34 2.34 0 0 1 4.659 0')).toBe(true);
    const rond = svg!.querySelector('circle');
    expect([rond?.getAttribute('cx'), rond?.getAttribute('cy'), rond?.getAttribute('r')]).toEqual(['12', '12', '3']);
  });

  it('sous INTERFACE, la phrase courte (6)', async () => {
    const m = await ouvrir();
    expect(m.textContent).toContain('View settings are independent of your plan.');
    expect(m.textContent).not.toContain('What Tune shows you');
  });

  it('… et en français', async () => {
    locale.set('fr');
    const m = await ouvrir();
    expect(m.textContent).toContain("L'affichage ne dépend pas de votre offre.");
  });
});

describe('Menu de compte — serveur relié, compte non montré à cet appareil', () => {
  it('dit « relié », sans nom, sans « Sign in » ni « Sign out »', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const charge: unknown = url.includes('/cloud/sso/status')
        ? { configured: true, connected: true, details_hidden: true }
        : [];
      return {
        ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }),
        text: async () => JSON.stringify(charge), json: async () => charge,
      } as unknown as Response;
    }));
    const m = await ouvrir();
    const en = (await import('../locales/en')).default as unknown as Record<string, string>;
    expect(m.querySelector('.avname')?.textContent?.trim()).toBe(en['settings.accountLinkedNoDetails']);
    const libelles = Array.from(m.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(libelles).not.toContain(en['settings.signIn']);
    expect(libelles).not.toContain(en['settings.signOut']);
  });
});
