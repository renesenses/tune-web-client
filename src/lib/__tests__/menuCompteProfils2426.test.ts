// @vitest-environment jsdom
//
// #2426 — Alex (rc8) voit en haut du menu de l'avatar son COMPTE Mozaiklabs
// (nom, e-mail, photo), puis une section « PROFILES » avec un profil du même
// nom et une pastille « A » : « Are the profiles not one of the same? ».
// Le modèle ne change pas ; l'écran doit distinguer les deux :
//   - un intitulé explicite et une ligne d'aide ;
//   - le profil du compte connecté montre la photo du compte ;
//   - un profil seul n'est pas une liste à choisir.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import AvatarMenu from '../../components/v2/AvatarMenu.svelte';
import { locale } from '../i18n';
import { currentProfileId, profiles } from '../stores/profile';
import { estProfilDuCompte, formeDeLaSection } from '../profilDuCompte';

vi.setConfig({ testTimeout: 30_000 });

class Inerte { observe() {} unobserve() {} disconnect() {} }
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const PHOTO = 'https://static.example/alex.jpg';
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
      ? { configured: true, connected: true, user: { display_name: 'Alex Campbell', email: 'alex@example.org', avatar_url: PHOTO } }
      : [];
    return {
      ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge), json: async () => charge,
    } as unknown as Response;
  }));
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
  vi.unstubAllGlobals();
});

async function ouvrir() {
  monte = mount(AvatarMenu, { target: hote! });
  await souffler();
  hote!.querySelector<HTMLButtonElement>('button.avatar')!.click();
  await souffler();
  return hote!;
}

const DEFAULT = { id: 1, name: 'Default', display_name: null, avatar_color: '#555' };
const ALEX = { id: 2, name: 'alex@example.org', display_name: 'Alex Campbell', avatar_color: '#c33' };
const LEA = { id: 3, name: 'lea', display_name: 'Léa', avatar_color: '#39c' };

describe('#2426 — le compte n’est pas le profil', () => {
  it('🔴 l’intitulé dit que ce sont des profils d’écoute de CE serveur, avec une ligne d’aide', async () => {
    profiles.set([DEFAULT, ALEX, LEA]);
    currentProfileId.set(2);
    const h = await ouvrir();
    const titre = h.querySelector('[data-section-profils]')?.textContent?.trim();
    expect(titre).toBe('Listening profiles on this server');
    const aide = h.querySelector('[data-profils-aide]')?.textContent ?? '';
    expect(aide).toMatch(/history/i);
    expect(aide).toMatch(/favou?rites/i);
    expect(aide).toMatch(/preferences/i);
    expect(aide).toMatch(/household/i);
  });

  it('🔴 le profil du compte connecté montre la photo du compte, pas la pastille', async () => {
    profiles.set([DEFAULT, ALEX, LEA]);
    currentProfileId.set(2);
    const h = await ouvrir();
    const celuiDuCompte = h.querySelector('[data-profil-du-compte="oui"]');
    expect(celuiDuCompte, 'le profil Alex doit être reconnu comme celui du compte').not.toBeNull();
    const img = celuiDuCompte!.querySelector<HTMLImageElement>('img.pphoto');
    expect(img?.getAttribute('src'), 'la photo du compte').toBe(PHOTO);
    expect(celuiDuCompte!.querySelector('span.pastille')).toBeNull();
    // Un autre profil garde sa pastille.
    const autres = Array.from(h.querySelectorAll('button.profil')).filter((b) => !b.hasAttribute('data-profil-du-compte'));
    expect(autres.length).toBe(1);
    expect(autres[0].querySelector('img')).toBeNull();
    expect(autres[0].querySelector('span.pastille')?.textContent).toBe('L');
  });

  it('🔴 un profil seul n’est pas une liste à choisir : un geste, sans état « actif »', async () => {
    // Sur « Default », avec un seul profil personnel proposé.
    profiles.set([DEFAULT, ALEX]);
    currentProfileId.set(1);
    const h = await ouvrir();
    const section = h.querySelector('[data-section-profils]');
    expect(section?.getAttribute('data-section-profils')).toBe('unique');
    const boutons = h.querySelectorAll('button.profil');
    expect(boutons.length).toBe(1);
    expect(boutons[0].textContent).toContain('Use the profile Alex Campbell');
    expect(boutons[0].classList.contains('actif')).toBe(false);
    expect(h.querySelector('.profils.unique')).not.toBeNull();
  });

  it('un seul profil, déjà le courant : aucune section', async () => {
    profiles.set([ALEX]);
    currentProfileId.set(2);
    const h = await ouvrir();
    expect(h.querySelector('[data-section-profils]')).toBeNull();
  });

  it('traduit dans la langue de l’interface', async () => {
    locale.set('fr');
    profiles.set([DEFAULT, ALEX, LEA]);
    currentProfileId.set(2);
    const h = await ouvrir();
    expect(h.querySelector('[data-section-profils]')?.textContent).toContain('Profils d’écoute de ce serveur');
  });

  it('le lien profil ↔ compte est un NOM, sans casse, et exige un compte connecté', () => {
    const compte = { connected: true, name: 'Alex Campbell', email: 'Alex@Example.org' };
    expect(estProfilDuCompte(ALEX, compte)).toBe(true);
    expect(estProfilDuCompte({ name: 'x', display_name: 'ALEX CAMPBELL' }, compte)).toBe(true);
    expect(estProfilDuCompte(LEA, compte)).toBe(false);
    expect(estProfilDuCompte(ALEX, { ...compte, connected: false })).toBe(false);
    expect(estProfilDuCompte(ALEX, { connected: true, name: '', email: '' })).toBe(false);
    expect(get(profiles)).toBeTruthy();
  });

  it('la forme de la section', () => {
    expect(formeDeLaSection(3, false)).toBe('liste');
    expect(formeDeLaSection(2, true)).toBe('liste');
    expect(formeDeLaSection(1, false)).toBe('unique');
    expect(formeDeLaSection(1, true)).toBe('aucune');
    expect(formeDeLaSection(0, false)).toBe('aucune');
  });
});
