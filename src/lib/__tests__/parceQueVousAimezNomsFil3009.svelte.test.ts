// @vitest-environment jsdom
/**
 * Fil forum 3009 (FabienM, point 5 ; go de Bertrand du 23/11/2026) — widget
 * « Parce que vous aimez » :
 *
 *   5.1 — « chaque playlist doit être nommée de la façon suivante : nom de
 *         l'artiste qu'on aime » ;
 *   5.2 — « quand on clique sur la playlist, le champ de saisie "Nom de la
 *         playlist" doit contenir le titre par défaut suivant : "Mix " suivi
 *         du nom de l'artiste ».
 *
 * Le témoin charge le VRAI widget (route mockée) et monte la VRAIE fenêtre de
 * la playlist, puis lit le champ. Contre-épreuve : `accueilWidgets.ts` et
 * `PlaylistGenereeV2.svelte` remis à `origin/main`, les deux premières
 * épreuves rougissent (« Parce que vous aimez Miles Davis » au lieu de
 * « Miles Davis », puis du « Mix Miles Davis » attendu).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({ getBecauseYouLike: vi.fn() }));
vi.mock('../api', async (orig) => ({ ...(await orig<any>()), ...mocks }));

import { widgetParId } from '../accueilWidgets';
import { locale } from '../i18n';
import PlaylistGenereeV2 from '../../components/v2/PlaylistGenereeV2.svelte';
import type { PlaylistGeneree } from '../parceQueVousAimez';

const MILES: PlaylistGeneree = {
  id: 'pvaa-1',
  artist: 'Miles Davis',
  track_count: 1,
  similar_artists: ['John Coltrane'],
  covers: [],
  tracks: [{ source: 'local', track_id: 11, title: 'So What', artist_name: 'Miles Davis', duration_ms: 1000 }],
} as unknown as PlaylistGeneree;

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  mocks.getBecauseYouLike.mockReset();
  locale.set('fr');
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  document.querySelectorAll('.fond').forEach((n) => n.remove());
  locale.set('fr');
});

function champNom(): HTMLInputElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PlaylistGenereeV2, { target: hote, props: { playlist: MILES, onClose: () => {} } });
  flushSync();
  const input = document.querySelector<HTMLInputElement>('form.pied input');
  expect(input, 'le champ « Nom de la playlist » est introuvable').not.toBeNull();
  return input!;
}

describe('fil 3009, point 5.1 — la playlist porte le nom de l’artiste aimé', () => {
  it('la vignette du widget s’appelle « Miles Davis », sans la phrase', async () => {
    mocks.getBecauseYouLike.mockResolvedValue({ playlists: [MILES] });
    const [el] = await widgetParId('parce-que-vous-aimez')!.charger({} as any);
    expect(el.titre).toBe('Miles Davis');
    expect(el.titre).not.toContain('Parce que vous aimez');
  });
});

describe('fil 3009, point 5.2 — le nom proposé est « Mix <artiste> »', () => {
  it('en français : « Mix Miles Davis »', () => {
    expect(champNom().value).toBe('Mix Miles Davis');
  });

  it('dans une autre langue, la forme de la langue (anglais : « Miles Davis Mix »)', () => {
    locale.set('en');
    expect(champNom().value).toBe('Miles Davis Mix');
  });

  it('le nom reste modifiable : ce qu’on tape n’est pas écrasé', () => {
    const input = champNom();
    input.value = 'Ma sélection';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(input.value).toBe('Ma sélection');
  });

  it('chaque langue porte « v2.home.becauseYouLikeMixName », avec {artiste}', () => {
    const dossier = resolve(__dirname, '../locales');
    const langues = readdirSync(dossier).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
    expect(langues.length).toBeGreaterThanOrEqual(20);
    for (const f of langues) {
      const src = readFileSync(resolve(dossier, f), 'utf8');
      expect(src, f).toMatch(/"v2\.home\.becauseYouLikeMixName": "[^"]*\{artiste\}[^"]*"/);
    }
  });
});
