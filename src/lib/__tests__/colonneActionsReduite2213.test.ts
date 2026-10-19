// @vitest-environment jsdom
//
// web#2213 (Sandro, fil 2317) — « Lorsque les icônes de fonction sont masquées
// via les paramètres, l'espace de la colonne qui leur était réservé reste vide
// au lieu de se réduire. » Au zoom, le tableau des pistes devenait plus large
// que l'écran et poussait le menu « … » hors de la vue.
//
// La colonne d'actions de `ListePistesV2` valait toujours 238 px (huit cases),
// option #1892 (« icônes réduites ») ou non : la barre réduite gardait ses
// quatre cases masquées, VIDES, en tête. Elle compte désormais quatre cases,
// et la colonne — dans le gabarit comme dans le plancher qui fait déborder la
// grille (#853) — et la ligne d'objet de l'Historique (#1149) les suivent.
//
// Le témoin MONTE le tableau et l'Historique et lit les variables CSS qu'ils
// posent, puis vérifie que la largeur réduite correspond à la barre rendue.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import HistoriqueV2 from '../../components/v2/HistoriqueV2.svelte';
import { preferences } from '../stores/preferences';
import { playbackHistory } from '../stores/history';
import { currentZoneId } from '../stores/zones';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const PISTE = { id: 1, title: 'Hejira', artist_name: 'Joni Mitchell', album_id: 7, artist_id: 3,
  source: 'local', duration_ms: 400_000 };

const hotes: HTMLDivElement[] = [];
const montes: Record<string, any>[] = [];
const respirer = () => new Promise((r) => setTimeout(r, 0));

function poserListe(): HTMLElement {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  hotes.push(hote);
  montes.push(mount(ListePistesV2, { target: hote, props: { pistes: [PISTE], onLire: () => {} } as any }));
  flushSync();
  return hote;
}

async function poserHistorique(): Promise<HTMLElement> {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  hotes.push(hote);
  montes.push(mount(HistoriqueV2, { target: hote }));
  for (let i = 0; i < 20; i++) await respirer();
  flushSync();
  return hote;
}

const tbl = (h: HTMLElement) => h.querySelector<HTMLElement>('.tbl')!;
const tcols = (h: HTMLElement) => tbl(h).style.getPropertyValue('--tcols');
const tmin = (h: HTMLElement) => parseFloat(tbl(h).style.getPropertyValue('--tmin'));
/** La dernière piste du gabarit est la colonne d'actions (pas de suffixe ici). */
const colonneActions = (h: HTMLElement) => tcols(h).trim().split(/\s+/).pop();

/** La largeur d'une barre de `n` cases, d'après le CSS de `PisteActions`. */
function largeurBarre(n: number): number {
  const src = readFileSync(resolve(process.cwd(), 'src/components/v2/PisteActions.svelte'), 'utf-8');
  const cote = Number(/\.pa\{[^}]*\bwidth:(\d+)px/.exec(src)![1]);
  const gouttiere = Number(/\.pactions\{[^}]*\bgap:(\d+)px/.exec(src)![1]);
  return n * cote + (n - 1) * gouttiere;
}

beforeEach(() => {
  locale.set('fr');
  currentZoneId.set(1);
  playbackHistory.clear();
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) => {
    const url = String(entree);
    const corps = url.includes('/library/history') ? { items: [], total: 0 } : [];
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => corps, text: async () => JSON.stringify(corps),
    } as unknown as Response;
  }));
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner', v2ActionsReduites: false }));
});

afterEach(() => {
  while (montes.length) unmount(montes.pop()!);
  while (hotes.length) hotes.pop()!.remove();
  playbackHistory.clear();
  preferences.update((p) => ({ ...p, v2ActionsReduites: false }));
  vi.unstubAllGlobals();
});

describe('web#2213 — icônes réduites : la colonne d’actions se réduit', () => {
  it('par défaut, rien ne change : 238 px, huit cases', () => {
    const h = poserListe();
    expect(colonneActions(h)).toBe('238px');
    expect(h.querySelectorAll('.trow .pactions > *').length).toBe(8);
    expect(largeurBarre(8)).toBe(238);
  });

  it('🔴 icônes réduites : la colonne vaut la barre rendue, quatre cases', () => {
    const pleine = poserListe();
    const plancherPlein = tmin(pleine);
    preferences.update((p) => ({ ...p, v2ActionsReduites: true }));
    const h = poserListe();
    const barre = h.querySelectorAll('.trow .pactions > *');
    expect(barre.length).toBe(4);
    expect(colonneActions(h), 'la colonne garde la place des icônes masquées').toBe(`${largeurBarre(4)}px`);
    // Le plancher qui fait DÉBORDER la grille (#853) perd les mêmes 120 px.
    expect(plancherPlein - tmin(h)).toBe(largeurBarre(8) - largeurBarre(4));
  });

  it('🔴 l’Historique compose sa ligne d’objet avec la MÊME largeur (#1149)', async () => {
    playbackHistory.add({ ...PISTE } as any, 'Salon');
    const pleine = await poserHistorique();
    const liste = (h: HTMLElement) => h.querySelector<HTMLElement>('.list');
    expect(liste(pleine), 'Historique vide — témoin sans objet').not.toBeNull();
    expect(liste(pleine)!.style.getPropertyValue('--col-actions')).toBe('238px');
    preferences.update((p) => ({ ...p, v2ActionsReduites: true }));
    flushSync();
    expect(liste(pleine)!.style.getPropertyValue('--col-actions')).toBe(`${largeurBarre(4)}px`);
  });
});
