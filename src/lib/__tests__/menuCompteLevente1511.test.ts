// @vitest-environment jsdom
//
// Levente (designer de Tune), 15/11/2026 — retouches du menu de compte, rc12
// (Figma 6qiK4YtKNXHtL0PRfrkYYh, nœuds 606:5796 et 609:5801) :
//   1. plus de texte d'explication sous la photo ;
//   2. plus de titre « Listening profiles on this server » ni de son aide ;
//   3. plus de liste des profils (on change de profil par « Manage profiles ») ;
//   4. plus d'adresse e-mail ni de « Remove » sous le nom ;
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
  it('l’en-tête garde la photo et le nom, sans e-mail ni « Remove » (4)', async () => {
    const m = await ouvrir();
    expect(m.querySelector('.avname')?.textContent?.trim()).toBe('Levente');
    // La photo locale est bien là : c'est elle qui faisait paraître « Remove ».
    expect(m.querySelector<HTMLImageElement>('.avhead img.avimg')?.getAttribute('src')).toBe(PHOTO_LOCALE);
    expect(m.textContent).not.toContain(EMAIL);
    expect(m.querySelector('.avmail')).toBeNull();
    const libelles = Array.from(m.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(libelles).not.toContain('Remove');
  });

  it('changer de photo reste possible : le rond de l’en-tête ouvre l’explorateur', async () => {
    const m = await ouvrir();
    const rond = m.querySelector<HTMLButtonElement>('.avhead button.avatar.sm');
    expect(rond?.getAttribute('aria-label')).toBeTruthy();
    const champ = hote!.querySelector<HTMLInputElement>('input.fichier[type="file"]');
    const clic = vi.spyOn(champ!, 'click').mockImplementation(() => {});
    rond!.click();
    expect(clic).toHaveBeenCalledOnce();
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
    const chemins = Array.from(svg!.querySelectorAll('path')).map((p) => p.getAttribute('d') ?? '');
    expect(chemins).toHaveLength(2);
    expect(chemins[0].startsWith('M9.671 4.136')).toBe(true);
    expect(chemins[1].startsWith('M15 12C15 13.6569')).toBe(true);
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
