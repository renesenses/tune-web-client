// @vitest-environment jsdom
//
// web#2771 — démo du 09/11/2026 : « impossible de trouver le contrôle
// parental ». Son seul accès était un bouton sous une ligne de Réglages ›
// Profils, visible seulement pour un administrateur ET un autre profil non
// administrateur. Il a désormais sa section dans Réglages › Général (niveau
// débutant), trouvée par la recherche, qui explique la fonction et guide
// selon le cas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync, mount, unmount } from 'svelte';
import ControleParentalV2 from '../../components/v2/ControleParentalV2.svelte';
import { V2_SETTINGS, searchSettings } from '../v2Settings';
import { locale } from '../i18n';
import { profiles, currentProfileId } from '../stores/profile';
import lFr from '../locales/fr';
import lEn from '../locales/en';

const FR = lFr as Record<string, string>;
const EN = lEn as Record<string, string>;
const ADMIN = { id: 1, name: 'papa', display_name: 'Papa', avatar_color: '#6366f1', is_admin: true };
const ADMIN2 = { id: 3, name: 'maman', display_name: 'Maman', avatar_color: '#ec4899', is_admin: true };
const ENFANT = { id: 2, name: 'lea', display_name: 'Léa', avatar_color: '#10b981', is_admin: false };

describe('web#2771 — une section « Contrôle parental » dans les Réglages', () => {
  const section = () => V2_SETTINGS.find((t) => t.id === 'general')?.sections.find((s) => s.id === 'parental');

  it('existe dans Général, au niveau débutant, titrée « Contrôle parental »', () => {
    expect(section()).toBeTruthy();
    expect(section()!.min).toBe('beginner');
    expect(FR[section()!.titleKey!]).toBe('Contrôle parental');
  });

  it('la recherche des réglages la trouve (« contrôle parental », « enfant », « parental controls »)', () => {
    const tr = (k: string) => FR[k] ?? k;
    for (const q of ['contrôle parental', 'controle parental', 'enfant', 'parental controls']) {
      expect(searchSettings(q, tr).map((h) => h.section.id), q).toContain('parental');
    }
  });

  it('l’écran Réglages monte le guide dans la branche de cette section', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf-8');
    expect(src).toMatch(/\{:else if s\.id === 'parental'\}\s*<ControleParentalV2 \/>/);
  });

  it('les textes du guide existent en français et en anglais', () => {
    for (const k of ['intro', 'notAdmin', 'noChild', 'choose', 'choosePlaceholder']) {
      expect(FR[`parental.guide.${k}`], k).toBeTruthy();
      expect(EN[`parental.guide.${k}`], k).toBeTruthy();
    }
  });
});

describe('web#2771 — le guide, selon le cas', () => {
  let hote: HTMLDivElement;
  let composant: ReturnType<typeof mount> | undefined;
  const stabiliser = async () => { for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };

  beforeEach(() => {
    locale.set('fr');
    hote = document.createElement('div'); document.body.appendChild(hote);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(
      String(url).includes('politique-parentale')
        ? JSON.stringify({ error: 'politique_parentale_absente' }) : '[]',
      { status: String(url).includes('politique-parentale') ? 404 : 200, headers: { 'Content-Type': 'application/json' } },
    )));
  });
  afterEach(async () => {
    if (composant) await unmount(composant);
    composant = undefined; hote.remove(); vi.unstubAllGlobals();
  });
  async function monter(liste: any[], actif: number) {
    profiles.set(liste); currentProfileId.set(actif);
    composant = mount(ControleParentalV2, { target: hote, props: {} });
    await stabiliser();
  }

  it('explique toujours la fonction (plages, budget, explicite)', async () => {
    await monter([ADMIN, ENFANT], 1);
    expect(hote.querySelector('[data-parental-intro]')?.textContent).toBe(FR['parental.guide.intro']);
  });

  it('profil actif NON administrateur : dit comment faire, sans panneau de règles', async () => {
    await monter([ADMIN, ENFANT], 2);
    expect(hote.querySelector('[data-parental-guide="non-admin"]')?.textContent).toBe(FR['parental.guide.notAdmin']);
    expect(hote.querySelector('select')).toBeNull();
  });

  it('profils pas encore chargés : aucun message de guide (pas de « non administrateur » à tort)', async () => {
    await monter([], 1);
    expect(hote.querySelector('[data-parental-guide]')).toBeNull();
    expect(hote.querySelector('[data-parental-intro]')).not.toBeNull();
  });

  it('administrateur sans profil à encadrer : dit de créer le profil de l’enfant', async () => {
    await monter([ADMIN, ADMIN2], 1);
    expect(hote.querySelector('[data-parental-guide="sans-profil"]')?.textContent).toBe(FR['parental.guide.noChild']);
  });

  it('administrateur avec un enfant : choisir le profil ouvre ses règles ici même', async () => {
    await monter([ADMIN, ADMIN2, ENFANT], 1);
    const sel = hote.querySelector<HTMLSelectElement>('[data-parental-guide="choisir"] select')!;
    const options = [...sel.options].map((o) => o.textContent);
    // Seul le profil encadrable est proposé : ni soi-même, ni un autre administrateur.
    expect(options).toEqual([FR['parental.guide.choosePlaceholder'], 'Léa']);
    expect(hote.textContent).not.toContain(FR['parental.none']);
    sel.selectedIndex = 1; sel.dispatchEvent(new Event('change', { bubbles: true }));
    await stabiliser();
    expect(hote.textContent).toContain(FR['parental.none']);
  });
});
