// @vitest-environment jsdom
//
// Recette de Bertrand, 15/11/2026 : « l'icône réglages sur l'écran d'accueil
// pas à jour ». La #3057 avait posé l'icône de Levente (`settings.svg`, Lucide,
// ISC — Figma 609:5801) dans le menu de compte seulement ; la roue de l'en-tête
// de la barre latérale gardait l'ancienne.
//
// Une seule source désormais : `IconeReglages.svelte`. Ce banc MONTE la barre
// et vérifie l'icône réellement peinte, puis que le tracé n'est recopié nulle
// part ailleurs.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import SidebarV2 from '../../components/v2/Sidebar.svelte';
import { activeView } from '../stores/navigation';
import { tiroirOuvert } from '../largeurEcran';
import { locale } from '../i18n';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;
const TRACE_LEVENTE = 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0';

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

describe('L’icône « Réglages » de Levente, partout dans la V2', () => {
  it('🔴 la roue de l’en-tête de la barre porte l’icône settings.svg', () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SidebarV2, { target: hote });
    flushSync();
    const brand = hote.querySelector('.brand');
    expect(brand, 'pas de bloc de marque').not.toBeNull();
    const roue = [...brand!.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === fr['v2.nav.settings'],
    );
    expect(roue, 'pas de bouton « Réglages » dans l’en-tête').toBeTruthy();
    const svg = roue!.querySelector('svg[data-icone="settings"]');
    expect(svg, 'la roue porte encore l’ancienne icône').not.toBeNull();
    expect(svg!.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg!.getAttribute('stroke')).toBe('currentColor');
    expect(svg!.getAttribute('stroke-width')).toBe('2');
    // Même taille qu'avant : 17 px.
    expect(svg!.getAttribute('width')).toBe('17');
    expect(svg!.getAttribute('height')).toBe('17');
    const chemins = [...svg!.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '');
    expect(chemins).toHaveLength(1);
    expect(chemins[0].startsWith(TRACE_LEVENTE)).toBe(true);
    const rond = svg!.querySelector('circle');
    expect([rond?.getAttribute('cx'), rond?.getAttribute('cy'), rond?.getAttribute('r')]).toEqual(['12', '12', '3']);
  });

  it('🔴 le tracé n’existe qu’à UN endroit : IconeReglages.svelte', () => {
    const racine = resolve(process.cwd(), 'src');
    const porteurs: string[] = [];
    const parcourir = (dossier: string) => {
      for (const e of readdirSync(dossier, { withFileTypes: true })) {
        const chemin = join(dossier, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__') parcourir(chemin); continue; }
        if (!/\.(svelte|ts)$/.test(e.name) || /\.test\.ts$/.test(e.name)) continue;
        if (readFileSync(chemin, 'utf8').includes(TRACE_LEVENTE)) porteurs.push(chemin.slice(racine.length + 1));
      }
    };
    parcourir(racine);
    expect(porteurs).toEqual(['components/v2/IconeReglages.svelte']);
  });

  it('la barre et le menu de compte passent par le composant', () => {
    for (const f of ['Sidebar.svelte', 'AvatarMenu.svelte']) {
      const src = readFileSync(resolve(process.cwd(), 'src/components/v2', f), 'utf8');
      expect(src, f).toContain("import IconeReglages from './IconeReglages.svelte'");
      expect(src, f).toContain('<IconeReglages taille={17} />');
    }
  });
});
