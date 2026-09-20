/**
 * Lot 6 — quatre accès qui manquaient, quatre fiches de testeurs.
 *
 * #1011 (Fabien) : l'éditeur de playlists intelligentes existait, la vue
 * aussi — la coquille ne la montait pas. #919 (FabienM) : aucun bouton vers
 * la file d'attente sur la barre de lecture. #863 (Jean Valjean) : le codec
 * d'une radio n'était lisible qu'en Expert. #862 (Marco Polo) : rien ne
 * disait qu'un album vient d'une feuille CUE.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dictionnaire } from './onzeDictionnaires';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8')
  .replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'ro', 'sv', 'hu', 'ja', 'ko', 'zh'];

describe('#1011 — l’éditeur de playlists intelligentes est monté, et atteignable', () => {
  const shell = lire('src/components/v2/ShellV2.svelte');
  it('🔴 la coquille monte `SmartPlaylistsView` sous la vue `smartplaylists`', () => {
    expect(shell).toContain("import SmartPlaylistsView from '../v2-heritage/SmartPlaylistsView.svelte';");
    expect(shell).toMatch(/\{:else if \$activeView === 'smartplaylists'\}\s*<SmartPlaylistsView \/>/);
    expect(shell).toContain("smartplaylists: 'v2.pl.tabSmart'");
  });
  /**
   * ⚠️ 18/09/2026, web#1150 — CE BOUTON NE QUITTE PLUS L'ÉCRAN.
   *
   * Il basculait la vue sur `smartplaylists`, l'écran de l'ancienne interface,
   * parce que c'était le seul à savoir créer une règle. Il ouvre désormais
   * `PlaylistSmartEditeurV2`, sur place (FabienM, fil 1778 point 8 : la v2
   * listait et jouait, elle ne créait pas).
   *
   * Ce que ce cas garde n'a pas changé : UNE porte, dans l'onglet, AVANT la
   * liste — c'est quand il n'y a rien à voir que le bouton sert le plus. Seule
   * sa destination a bougé, et la garde dit maintenant laquelle.
   */
  it('🔴 l’onglet « Intelligentes » porte le bouton qui y mène — avant la liste, vide ou non', () => {
    const src = lire('src/components/v2/PlaylistsV2.svelte');
    const i = src.indexOf("{:else if onglet === 'smart'}");
    const bouton = src.indexOf("onclick={() => (editeurSmart = { id: null })}", i);
    const vide = src.indexOf("{#if !smart.length}", i);
    expect(bouton).toBeGreaterThan(i);
    expect(bouton).toBeLessThan(vide);
    expect(src).toContain("{$t('smartPlaylists.new')}");
    // Et il n'en reste QU'UNE : rouvrir la porte vers l'ancien écran en plus
    // de l'éditeur v2 ferait deux chemins vers la même fonction — le doublon
    // que web#1127 vient de retirer de la rangée du gestionnaire.
    expect(
      src.includes("activeView.set('smartplaylists')"),
      'deux portes vers la création d’une playlist intelligente',
    ).toBe(false);
  });
});

describe('#919 — la file d’attente depuis la barre de lecture', () => {
  const barre = lire('src/components/partages/TransportBar.svelte');
  it('🔴 un bouton vers la file, à côté de « répéter »', () => {
    const repeter = barre.indexOf('onclick={cycleRepeat}');
    const file = barre.indexOf("onclick={() => activeView.set('queue')}");
    expect(repeter).toBeGreaterThan(-1);
    expect(file).toBeGreaterThan(repeter);
    expect(file - repeter).toBeLessThan(1500);
    expect(barre).toContain("aria-label={$t('nav.queue')}");
    expect(barre).toContain("class:active={$activeView === 'queue'}");
  });
});

describe('#863 — le codec d’une radio se lit dès Avancé', () => {
  it('🔴 `tech(r)` est conditionné par `showFilters` (intermediate), plus par `showExpert`', () => {
    const src = lire('src/components/v2/RadiosV2.svelte');
    expect(src).toContain('{#if showFilters && tech(r)}');
    expect(src).not.toContain('{#if showExpert && tech(r)}');
    expect(src).toContain("const showFilters = $derived(atLeast(level, 'intermediate'));");
  });
});

describe('#862 — la pastille CUE sur la fiche album', () => {
  const fiche = lire('src/components/v2/AlbumDetailV2.svelte');
  it('🔴 dès qu’une piste porte `cue_media_path`, la fiche le dit', () => {
    expect(fiche).toContain('const depuisCue = $derived(tracks.some((t) => !!t.cue_media_path));');
    expect(fiche).toMatch(/\{#if depuisCue\}<div class="qbadge cue" title=\{\$tr\('v2\.album\.cueTip' as any\)\}>\{\$tr\('v2\.album\.cue' as any\)\}<\/div>\{\/if\}/);
    expect(lire('src/lib/types.ts')).toContain('cue_media_path?: string | null;');
  });
  it('l’infobulle existe dans les onze langues', async () => {
    for (const code of LANGUES) {
      const dico = dictionnaire(code);
      expect(dico['v2.album.cueTip'], code).toContain('CUE');
    }
  });
});
