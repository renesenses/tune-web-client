import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * « Le raccourci me renvoie sur la LISTE des smart collections » — issue #729.
 *
 * Le mécanisme générique existait depuis longtemps dans `stores/shortcuts` :
 * l'écran publie l'élément ouvert par `setShortcutTarget`, `captureCurrentView`
 * en prend l'instantané, et `navigateToShortcut` réémet
 * `tune:shortcut-restore`. Trois écrans du client ACTUEL l'honoraient ; aucun
 * du nouveau. Le raccourci ne pouvait donc que poser la vue et s'arrêter là.
 */
describe('Raccourcis : rouvrir l’ÉLÉMENT, pas la liste', () => {
  const ecrans = ['CollectionsV2', 'PlaylistsV2'] as const;

  for (const f of ecrans) {
    const src = sansCommentaires(lire(`src/components/v2/${f}.svelte`));

    it(`${f} publie l'élément ouvert`, () => {
      expect(src).toContain("from '../../lib/stores/shortcuts'");
      expect(src).toContain('setShortcutTarget({');
    });

    it(`${f} écoute la restauration`, () => {
      expect(src).toContain("window.addEventListener('tune:shortcut-restore'");
      expect(src).toContain("window.removeEventListener('tune:shortcut-restore'");
    });

    it(`${f} OUBLIE la cible en quittant`, () => {
      // Sinon le raccourci suivant capturerait un élément qu'on ne regarde
      // plus — le défaut serait juste déplacé.
      expect(src).toContain('clearShortcutTarget()');
      expect(src).toContain('$effect(() => () => clearShortcutTarget());');
    });
  }

  it('les clés sont STABLES et ne se confondent pas entre elles', () => {
    const col = sansCommentaires(lire('src/components/v2/CollectionsV2.svelte'));
    const pl = sansCommentaires(lire('src/components/v2/PlaylistsV2.svelte'));
    // Une collection intelligente et une manuelle peuvent porter le même id.
    expect(col).toContain("`${e.sorte === 'smart' ? 'smartcollections' : 'collections'}:${e.id}`");
    // Idem pour une playlist locale et celle d'un service.
    expect(pl).toContain('`playlists:${it.pl.id}`');
    expect(pl).toContain('`streamingplaylists:${it.service}:${it.pl.source_id}`');
    // `smartcollections:` est la clé de l'écran du client actuel : un raccourci
    // posé d'un côté doit se rouvrir de l'autre.
    expect(lire('src/components/SmartCollectionsView.svelte')).toContain('smartcollections:');
  });

  it("l'onglet suit l'élément rouvert", () => {
    // Rouvrir une fiche sous un onglet qui ne la contient pas ferait retomber
    // sa fermeture sur la mauvaise liste.
    const col = sansCommentaires(lire('src/components/v2/CollectionsV2.svelte'));
    expect(col).toContain("onglet = smart ? 'smart' : 'manuelle';");
  });
});
