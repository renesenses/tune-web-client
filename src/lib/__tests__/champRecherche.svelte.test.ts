// @vitest-environment jsdom
/**
 * Recette rc12 (13/11/2026) — Bertrand : « Harmonise la localisation de la
 * zone de recherche dans tous les écrans. » Le champ partagé, `ChampRecherche` :
 * invite « Rechercher dans <écran>… », croix, Échap.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ChampRecherche from '../../components/v2/ChampRecherche.svelte';
import { locale } from '../i18n';

const respirer = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

async function monter(props: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(ChampRecherche, { target: hote, props: props as any });
  flushSync();
  await respirer();
  return hote.querySelector('input') as HTMLInputElement;
}
const croix = () => hote.querySelector<HTMLButtonElement>('button.clr');
function taper(input: HTMLInputElement, v: string) {
  input.value = v;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}
function echap(input: HTMLInputElement) {
  const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  input.dispatchEvent(e);
  flushSync();
  return e;
}

beforeEach(async () => { locale.set('fr'); await respirer(); });
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
});

describe('ChampRecherche — le champ partagé', () => {
  it('invite « Rechercher dans <écran>… », reprise par aria-label', async () => {
    const input = await monter({ ecran: 'Favoris' });
    expect(input.placeholder).toBe('Rechercher dans Favoris…');
    expect(input.getAttribute('aria-label')).toBe('Rechercher dans Favoris…');
    expect(hote.querySelector('.v2-rech[data-champ-recherche]')).not.toBeNull();
  });

  it('l’invite suit la langue', async () => {
    locale.set('en');
    await respirer();
    const input = await monter({ ecran: 'Favorites' });
    expect(input.placeholder).toBe('Search in Favorites…');
  });

  it('pas de croix sur un champ vide ; une croix qui efface dès qu’il y a du texte', async () => {
    const onvider = vi.fn();
    const onsaisie = vi.fn();
    const input = await monter({ ecran: 'Playlists', onvider, onsaisie });
    expect(croix()).toBeNull();
    taper(input, 'miles');
    expect(onsaisie).toHaveBeenLastCalledWith('miles');
    expect(croix(), 'aucune croix avec du texte').not.toBeNull();
    croix()!.click();
    flushSync();
    expect(input.value).toBe('');
    expect(onvider).toHaveBeenCalledTimes(1);
    expect(onsaisie).toHaveBeenLastCalledWith('');
    expect(croix()).toBeNull();
  });

  it('Échap efface le texte (et retient l’événement) ; champ vide, il le laisse passer', async () => {
    const onvider = vi.fn();
    const input = await monter({ ecran: 'Albums', onvider });
    taper(input, 'kind of blue');
    const e1 = echap(input);
    expect(input.value).toBe('');
    expect(onvider).toHaveBeenCalledTimes(1);
    expect(e1.defaultPrevented, 'le premier Échap doit être consommé').toBe(true);
    // Contre-épreuve : champ vide, Échap n'est pas consommé — le gestionnaire
    // de #1872 (Bibliothèque) rend alors le focus.
    const e2 = echap(input);
    expect(e2.defaultPrevented).toBe(false);
    expect(onvider).toHaveBeenCalledTimes(1);
  });

  it('les autres touches vont à l’écran', async () => {
    const onkeydown = vi.fn();
    const input = await monter({ ecran: 'Podcasts', onkeydown });
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onkeydown).toHaveBeenCalledTimes(1);
  });

  it('une recherche en cours : le témoin remplace la croix', async () => {
    await monter({ ecran: 'Qobuz', valeur: 'x', enCours: true });
    expect(hote.querySelector('.spin')).not.toBeNull();
    expect(croix()).toBeNull();
  });

  it('le raccourci existant est annoncé, et seulement lui', async () => {
    const input = await monter({ ecran: 'Albums', raccourci: '/' });
    expect(input.getAttribute('aria-keyshortcuts')).toBe('/');
    unmount(instance as any); instance = null; hote.remove();
    const sans = await monter({ ecran: 'Favoris' });
    expect(sans.hasAttribute('aria-keyshortcuts')).toBe(false);
  });

  it('une précision passe en infobulle, l’invite reste la commune', async () => {
    const input = await monter({ ecran: 'Albums', aide: 'Chercher dans la bibliothèque locale' });
    expect(input.title).toBe('Chercher dans la bibliothèque locale');
    expect(input.placeholder).toBe('Rechercher dans Albums…');
    expect(input.type).toBe('search');
  });
});
