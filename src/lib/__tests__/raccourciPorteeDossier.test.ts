// Un raccourci sur la Bibliothèque PORTÉE À UN RÉPERTOIRE rouvrait TOUTE la
// bibliothèque.
//
// Bertrand, 19/09/2026 : « le raccourci Qobuz recordings a perdu son filtre
// basé sur un répertoire ». Mesuré sur le .18 (0.9.155), `/system/config` :
//
//     'Qobuz recordings'  view=library      state={"tab": "albums"}
//     '2026'              view=collections  state={"target": {...}}
//
// L'onglet était figé, la PORTÉE non. `captureCurrentView` ne connaissait de
// la Bibliothèque que `libraryTab` — depuis le tout premier commit du
// mécanisme — et la portée de répertoire est arrivée à l'écran plus tard
// (#3101) sans que les raccourcis l'apprennent. Le raccourci rouvrait donc les
// 4 384 albums de la bibliothèque au lieu des 795 de
// `/mnt/recordings_usb/Qobuz`.
//
// Ce banc appelle les VRAIES fonctions sur les VRAIS magasins : une garde de
// texte serait satisfaite par une ligne morte.
import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { libraryFolderScope, libraryTab } from '../stores/library';
import { activeView } from '../stores/navigation';
import {
  captureCurrentView,
  navigateToShortcut,
  type Shortcut,
} from '../stores/shortcuts';

const QOBUZ = '/mnt/recordings_usb/Qobuz';

const raccourci = (state: Record<string, any>): Shortcut => ({
  id: 'sc-essai',
  name: 'Qobuz recordings',
  icon: '⭐',
  view: 'library',
  state,
});

beforeEach(() => {
  activeView.set('library');
  libraryTab.set('albums');
  libraryFolderScope.set(null);
});

describe('poser le raccourci : la portée part avec lui', () => {
  it('🔴 le répertoire est FIGÉ, pas seulement l’onglet', () => {
    libraryFolderScope.set(QOBUZ);
    const pris = captureCurrentView();
    expect(pris.view).toBe('library');
    expect(pris.state?.tab).toBe('albums');
    expect(pris.state?.folder).toBe(QOBUZ);
  });

  it('sans portée, le champ vaut `null` — il ne MANQUE pas', () => {
    // Un champ absent et un champ nul se relisent pareil ici, mais l'absence
    // rendrait deux raccourcis « toute la bibliothèque » et « un dossier »
    // indiscernables pour la clé de dédoublonnage (voir plus bas).
    expect(captureCurrentView().state?.folder).toBeNull();
  });

  it('l’onglet courant reste figé lui aussi', () => {
    libraryTab.set('folders');
    libraryFolderScope.set(QOBUZ);
    expect(captureCurrentView().state?.tab).toBe('folders');
  });
});

describe('ouvrir le raccourci : la portée revient', () => {
  it('🔴 le répertoire est REPOSÉ avant le changement de vue', () => {
    activeView.set('settings');
    navigateToShortcut(raccourci({ tab: 'albums', folder: QOBUZ }));
    expect(get(libraryFolderScope)).toBe(QOBUZ);
    expect(get(libraryTab)).toBe('albums');
    expect(get(activeView)).toBe('library');
  });

  it('🔴 un raccourci SANS portée EFFACE celle qui traînait', () => {
    // `libraryFolderScope` est un magasin partagé qui survit à l'écran qui
    // l'a posée. Ne reposer que les valeurs non nulles ferait hériter un
    // raccourci « toute la bibliothèque » du dossier du précédent : le même
    // écran mentirait dans l'autre sens.
    libraryFolderScope.set(QOBUZ);
    navigateToShortcut(raccourci({ tab: 'albums', folder: null }));
    expect(get(libraryFolderScope)).toBeNull();
  });

  it('🔴 un raccourci ANCIEN, sans le champ, vaut « toute la bibliothèque »', () => {
    // C'est la forme exacte trouvée sur le .18 : `{"tab": "albums"}`. Elle
    // doit rouvrir ce qu'elle montrait, pas hériter d'une portée courante.
    libraryFolderScope.set(QOBUZ);
    navigateToShortcut(raccourci({ tab: 'albums' }));
    expect(get(libraryFolderScope)).toBeNull();
  });

  it('un raccourci d’une AUTRE vue ne touche pas la portée', () => {
    libraryFolderScope.set(QOBUZ);
    navigateToShortcut({
      id: 'sc-col', name: '2026', icon: '⭐', view: 'collections',
      state: { target: { key: 'smartcollections:33', restore: { id: 33, name: '2026' } } },
    });
    expect(get(libraryFolderScope)).toBe(QOBUZ);
  });
});

describe('deux dossiers, deux raccourcis', () => {
  it('🔴 ils ne se confondent plus à la pose', () => {
    // Avant le correctif, les deux se réduisaient à `{"tab":"albums"}` : la
    // clé de dédoublonnage de `addShortcut` les tenait pour le MÊME raccourci,
    // et le second était refusé sans un mot.
    libraryFolderScope.set(QOBUZ);
    const a = JSON.stringify(captureCurrentView().state);
    libraryFolderScope.set('/data/music');
    const b = JSON.stringify(captureCurrentView().state);
    expect(a).not.toBe(b);
  });
});
