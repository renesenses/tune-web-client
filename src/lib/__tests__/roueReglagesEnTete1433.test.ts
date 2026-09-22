// @vitest-environment jsdom
//
// #1433 — « une roue crantée en haut à gauche pour accéder directement aux
// réglages » (recette v0.9.161 de Bertrand, 21/09/2026).
//
// Ce banc MONTE la barre latérale et clique le bouton réellement peint dans
// le bloc de marque. Il ne cherche pas une chaîne dans le fichier.
//
// Les attentes du ticket :
//   - l'icône dans l'en-tête de la barre, à côté du logo ;
//   - même destination que l'entrée existante (menu de l'avatar :
//     `activeView.set('settings')`, sans section imposée) ;
//   - libellé et infobulle traduits ;
//   - cible tactile d'au moins 32 px (vérifiée sur la règle CSS : jsdom ne
//     calcule pas de mise en page).
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import SidebarV2 from '../../components/v2/Sidebar.svelte';
import { activeView } from '../stores/navigation';
import { tiroirOuvert } from '../largeurEcran';
import { locale } from '../i18n';
import lFr from '../locales/fr';
import lEn from '../locales/en';

const fr = lFr as unknown as Record<string, string>;
const en = lEn as unknown as Record<string, string>;

let monte: Record<string, any> | null = null;
let hote: HTMLElement | null = null;

beforeEach(() => {
  locale.set('fr');
  activeView.set('home');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  activeView.set('home');
  tiroirOuvert.set(false);
});

function marque(): HTMLElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SidebarV2, { target: hote });
  flushSync();
  const brand = hote.querySelector('.brand');
  expect(brand, "la barre n'a pas peint de bloc de marque").not.toBeNull();
  return brand as HTMLElement;
}

/** Le bouton de la marque dont le libellé accessible est « Réglages ». */
function roue(brand: HTMLElement): HTMLButtonElement | null {
  return [...brand.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === fr['v2.nav.settings'],
  ) as HTMLButtonElement | null;
}

describe('#1433 — une roue crantée dans l’en-tête de la barre ouvre les Réglages', () => {
  it('🔴 l’en-tête porte un bouton « Réglages », libellé ET infobulle', () => {
    const b = roue(marque());
    expect(b, 'aucun bouton « Réglages » dans l’en-tête de la barre (#1433)').not.toBeNull();
    expect(b!.getAttribute('title')).toBe(fr['v2.nav.settings']);
    expect(b!.querySelector('svg'), 'le bouton n’a pas d’icône').not.toBeNull();
  });

  it('🔴 le clic ouvre l’écran Réglages — la même destination que le menu de l’avatar', () => {
    const b = roue(marque());
    expect(get(activeView)).toBe('home');
    b!.click();
    flushSync();
    expect(get(activeView)).toBe('settings');
    expect(b!.getAttribute('aria-current')).toBe('page');
  });

  it('en tiroir (petit écran), le clic referme le tiroir', () => {
    tiroirOuvert.set(true);
    const b = roue(marque());
    b!.click();
    flushSync();
    expect(get(tiroirOuvert)).toBe(false);
  });

  it('le libellé suit la langue', () => {
    locale.set('en');
    const brand = marque();
    const b = [...brand.querySelectorAll('button')].find(
      (x) => x.getAttribute('aria-label') === en['v2.nav.settings'],
    );
    expect(b, 'le libellé n’est pas traduit').toBeTruthy();
  });

  it('cible d’au moins 32 px', () => {
    const src = readFileSync(resolve(__dirname, '../../components/v2/Sidebar.svelte'), 'utf8');
    const regle = /\.reglages\{[^}]*\}/.exec(src)?.[0] ?? '';
    const l = Number(/width:(\d+)px/.exec(regle)?.[1] ?? 0);
    const h = Number(/height:(\d+)px/.exec(regle)?.[1] ?? 0);
    expect(l).toBeGreaterThanOrEqual(32);
    expect(h).toBeGreaterThanOrEqual(32);
  });

  it('CONTRE-ÉPREUVE — le bouton de repli est toujours là et ne mène pas aux Réglages', () => {
    const brand = marque();
    const repli = brand.querySelector('button.collapse') as HTMLButtonElement | null;
    expect(repli, 'le bouton de repli a disparu').not.toBeNull();
    repli!.click();
    flushSync();
    expect(get(activeView)).toBe('home');
  });
});
