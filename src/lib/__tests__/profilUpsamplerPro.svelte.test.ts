// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Surechantillonnage from '../../components/v2/SurechantillonnageV2.svelte';
import { locale } from '../i18n';
import { currentZoneId } from '../stores/zones';
import { reglageParDefaut } from '../surechantillonnage';

let composant: ReturnType<typeof mount>;
let cible: HTMLDivElement;
let ecritures: unknown[];
let disponible: boolean;

beforeEach(() => {
  locale.set('fr');
  currentZoneId.set(42);
  disponible = true;
  ecritures = [];
  cible = document.createElement('div');
  document.body.appendChild(cible);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(String(url), location.href).pathname;
    let corps: unknown;
    if (path.endsWith('/upsampler/')) {
      corps = { filters: [], ratios: [], premium: true, auto_available: disponible,
        auto_choices: { default_profile: 'p-a', profiles: ['p-a', 'p-b'].map(id => ({ id, labels: { fr: id } })), fields: [{ id: 'a', labels: { fr: 'A' }, choices: [{ id: 'bureau', name: 'Fallback', labels: { fr: 'Choix du banc', en: 'Test choice' } }] }] } };
    } else if (path.endsWith('/zones/42/auto')) {
      corps = { zone_id: 42, decision: { chosen: { design_name: 'Filtre A', filter_rate_hz: 96000, depth: 24, shaper_name: 'Formeur A' } } };
    } else if (path.endsWith('/zones/42')) {
      const settings = init?.method === 'PUT' ? JSON.parse(String(init.body)) : reglageParDefaut();
      if (init?.method === 'PUT') ecritures.push(settings);
      corps = { zone_id: 42, settings, applies_at: 'pending' };
    } else throw new Error(path);
    return new Response(JSON.stringify(corps), { headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(async () => {
  if (composant) await unmount(composant);
  cible.remove();
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});
function ouvrir() {
  composant = mount(Surechantillonnage, { target: cible });
  flushSync();
}
function choisir(valeur: string) {
  const option = [...cible.querySelectorAll('option')].find(o => o.value === valeur)!;
  const select = option.closest('select')!;
  select.value = valeur;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

it('enregistre le profil et le DAC sélectionnés et affiche la décision de la zone', async () => {
  ouvrir();
  await vi.waitFor(() => expect(cible.querySelectorAll('input[type=checkbox]')).toHaveLength(2));
  for (const bouton of cible.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) bouton.click();
  flushSync();
  choisir('p-b');
  choisir('bureau');
  cible.querySelector<HTMLButtonElement>('button.go')!.click();
  await vi.waitFor(() => expect(cible.textContent).toContain('Filtre A'));
  expect(ecritures).toEqual([{ ...reglageParDefaut(), enabled: true, mode: 'auto', profile: 'p-b', declarations: { a: 'bureau' } }]);
  expect(cible.textContent).toContain('Formeur A');
});

it('envoie le profil annoncé par défaut sans toucher au sélecteur', async () => {
  ouvrir();
  await vi.waitFor(() => expect(cible.querySelectorAll('input[type=checkbox]')).toHaveLength(2));
  for (const bouton of cible.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) bouton.click();
  flushSync();
  cible.querySelector<HTMLButtonElement>('button.go')!.click();
  await vi.waitFor(() => expect(ecritures).toHaveLength(1));
  expect(ecritures[0]).toMatchObject({ mode: 'auto', profile: 'p-a' });
  expect(cible.querySelector('option[value=bureau]')?.textContent).toBe('Choix du banc');
});

it('garde le mode manuel quand le serveur ne propose pas le greffon', async () => {
  disponible = false;
  ouvrir();
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await new Promise(r => setTimeout(r, 0));
  flushSync();
  expect(cible.querySelectorAll('input[type=checkbox]')).toHaveLength(1);
  expect(cible.querySelector('option[value=p-b]')).toBeNull();
});
