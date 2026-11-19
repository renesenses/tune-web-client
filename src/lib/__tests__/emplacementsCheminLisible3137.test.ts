// @vitest-environment jsdom
/**
 * web#3137 — Réglages › Bibliothèque › Emplacements (rc12, Windows) : le
 * chemin des dossiers était invisible. La ligne était une grille
 * `20px minmax(0,1fr) auto auto auto auto auto` : le chemin, seule colonne
 * élastique, tombait à 0 px quand les cinq commandes (dont « Remplacer le
 * chemin », nouveau en rc12) prenaient la largeur. Tades (fil 2866) et Van
 * Der Graaf Generator (forum-hifi.fr).
 *
 * jsdom ne calcule aucune mise en page : on vérifie ici la STRUCTURE (le
 * chemin dans sa propre tête, les commandes dans un bloc à part qui peut
 * passer dessous) et les RÈGLES CSS qui la portent. Les largeurs réelles ont
 * été mesurées dans Chromium headless (Playwright), à 1440 et à 900 px :
 * 0 px avant, la largeur de la carte après (voir la PR).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { preferences } from '../stores/preferences';
import { oublierCapaciteRemplacerLeChemin } from '../api';
import { couperChemin } from '../couperChemin';

const DOSSIERS = [
  'D:\\Musique\\Classique\\Deutsche Grammophon — intégrales remastérisées',
  '\\\\NAS-SALON\\Partage musique\\Hi-Res 24-192\\Téléchargements Qobuz',
  'C:\\Users\\Tades\\Music',
];

describe('couperChemin : le dernier dossier reste entier', () => {
  it.each([
    ['D:\\Musique\\Classique\\Jazz', 'D:\\Musique\\Classique\\', 'Jazz'],
    ['\\\\NAS\\Partage\\Qobuz', '\\\\NAS\\Partage\\', 'Qobuz'],
    ['/mnt/musique/flac', '/mnt/musique/', 'flac'],
    ['D:\\Musique\\', 'D:\\', 'Musique\\'],
    ['/musique', '', '/musique'],
    ['C:\\', '', 'C:\\'],
    ['/', '', '/'],
    ['Musique', '', 'Musique'],
    ['', '', ''],
  ])('%s', (chemin, debut, fin) => {
    const c = couperChemin(chemin);
    expect(c).toEqual({ debut, fin });
    expect(c.debut + c.fin).toBe(chemin);
  });
});

describe('la règle CSS de la ligne', () => {
  const source = readFileSync(resolve(__dirname, '../../components/v2/SettingsV2.svelte'), 'utf8');
  const style = source.slice(source.lastIndexOf('<style'));
  const regle = (sel: string) => {
    const re = new RegExp(`(?:^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
    return style.match(re)?.[1] ?? null;
  };

  it("aucune grille où le chemin peut tomber à zéro", () => {
    expect(style).not.toMatch(/\.dir[.\w-]*\s*\{[^}]*grid-template-columns:[^}]*minmax\(0,\s*1fr\)/);
    expect(regle('.dir')).toMatch(/display:\s*flex/);
    expect(regle('.dir')).toMatch(/flex-wrap:\s*wrap/);
  });

  it('le chemin garde une largeur minimale à l’échelle du texte', () => {
    const tete = regle('.dir-tete');
    expect(tete).toMatch(/flex:\s*1 1 \d+(\.\d+)?em/);
    expect(tete).toMatch(/var\(--v2-txt-echelle/);
  });

  it('les commandes vont à la ligne plutôt que de déborder', () => {
    const actions = regle('.dir-actions');
    expect(actions).toMatch(/flex-wrap:\s*wrap/);
    expect(actions).toMatch(/max-width:\s*100%/);
  });

  it('troncature au milieu : le début cède, le dernier dossier tient', () => {
    expect(regle('.dp-debut')).toMatch(/flex:\s*0 1 auto/);
    expect(regle('.dp-debut')).toMatch(/text-overflow:\s*ellipsis/);
    expect(regle('.dp-fin')).toMatch(/flex:\s*0 0 auto/);
    expect(regle('.dp-fin')).toMatch(/max-width:\s*100%/);
  });
});

// ─── La ligne, montée dans Réglages › Bibliothèque ─────────────────────────

function json(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

async function attendre(tours = 12) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  oublierCapaciteRemplacerLeChemin();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith('/system/capabilities')) return json({ bibliotheque: { remplacer_le_chemin: true } });
    if (u.endsWith('/system/config')) return json({ music_dirs: DOSSIERS, background_analysis_excluded_roots: [] });
    if (u.endsWith('/library/repertoires/ordre')) return json({ ordre: DOSSIERS });
    return json(/\/(zones|profiles|devices|outputs|playlists|shortcuts|groups|directories)(\?|$)/.test(u) ? [] : {});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  v2SettingsTarget.set(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Réglages › Bibliothèque › Emplacements, chemins Windows', () => {
  it('le chemin a sa propre tête, les cinq commandes un bloc à part', { timeout: 60_000 }, async () => {
    preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
    v2SettingsTarget.set({ tab: 'library', section: 'musicDirs' } as any);
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(SettingsV2, { target: hote, props: {} });
    flushSync();
    await attendre();

    const lignes = [...hote.querySelectorAll<HTMLElement>('[data-reglage="dossiers-declares"] .dir')];
    expect(lignes).toHaveLength(DOSSIERS.length);
    lignes.forEach((ligne, i) => {
      const chemin = DOSSIERS[i];
      const tete = ligne.querySelector<HTMLElement>(':scope > .dir-tete');
      const actions = ligne.querySelector<HTMLElement>(':scope > .dir-actions');
      expect(tete, 'la tête du chemin').not.toBeNull();
      expect(actions, 'le bloc des commandes').not.toBeNull();

      // Le chemin, entier dans le texte et dans l'infobulle.
      const dp = tete!.querySelector<HTMLElement>('.dp')!;
      expect(dp.textContent).toBe(chemin);
      expect(dp.getAttribute('title')).toBe(chemin);
      expect(dp.querySelector('.dp-fin')?.textContent).toBe(couperChemin(chemin).fin);

      // Aucune commande dans la tête : elles ne peuvent plus l'écraser.
      expect(tete!.querySelector('button, input, label')).toBeNull();
      // Toutes les commandes de la ligne sont dans le bloc qui va à la ligne.
      expect(actions!.querySelector('.dir-order')).not.toBeNull();
      expect(actions!.querySelector('.scan-dir')).not.toBeNull();
      expect(actions!.querySelector('.dir-analyse')).not.toBeNull();
      expect(actions!.querySelector('.remplacer-chemin')).not.toBeNull();
      expect(actions!.querySelector('.del')).not.toBeNull();
      // Et rien d'autre ne traîne directement dans la ligne.
      expect([...ligne.children].map((c) => c.className.split(' ')[0])).toEqual(['dir-tete', 'dir-actions']);
    });
  });
});
