/**
 * #729 — « je sélectionne une smart collection et le raccourci me renvoie sur
 * la liste des smart collections » (Bertrand, 05/09/2026).
 *
 * Le mécanisme générique de `lib/stores/shortcuts.ts` est complet et correct :
 * l'écran de détail publie sa cible (`setShortcutTarget`), `captureCurrentView`
 * la fige, `navigateToShortcut` réémet `tune:shortcut-restore`, et l'écran la
 * rouvre. Mais AUCUN écran du nouveau client n'y participait : le raccourci ne
 * pouvait que poser `activeView` et s'arrêter là.
 *
 * ## Pourquoi une LISTE déclarée, et pas une découverte automatique
 *
 * Le ticket demande « une garde qui vérifie que tout écran v2 déclarant une vue
 * à détail publie ET écoute ». Deviner « a un détail » depuis la source
 * donnerait une garde qui se trompe dans les deux sens — elle réclamerait le
 * mécanisme à `RadiosV2`, qui n'ouvre RIEN (on y joue une station d'un clic),
 * et le manquerait sur un écran dont le détail s'appelle autrement.
 *
 * La liste ci-dessous est donc écrite à la main, et c'est elle le contrat :
 * ajouter un écran à détail sans l'y inscrire n'est pas puni, mais l'y
 * inscrire sans câbler l'est. Les écrans SANS détail y figurent aussi, avec la
 * raison — pour que le prochain lecteur ne se demande pas s'ils ont été
 * oubliés.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const lire = (f: string) => readFileSync(`src/components/v2/${f}`, 'utf8');

/** Les écrans v2 qui ouvrent un élément, et la clef qu'ils doivent poser. */
const A_DETAIL: Array<{ fichier: string; prefixe: string }> = [
  { fichier: 'CollectionsV2.svelte', prefixe: 'collections' },
  { fichier: 'PlaylistsV2.svelte', prefixe: 'playlists' },
  { fichier: 'EtiquettesV2.svelte', prefixe: 'tags' },
  { fichier: 'PodcastsV2.svelte', prefixe: 'podcasts' },
];

/** Ceux qui n'ouvrent rien — et la raison, pour qu'on ne les croie pas oubliés. */
const SANS_DETAIL: Array<{ fichier: string; pourquoi: string }> = [
  { fichier: 'RadiosV2.svelte', pourquoi: 'une station se joue d’un clic, il n’y a pas de fiche à rouvrir' },
  { fichier: 'QueueV2.svelte', pourquoi: 'la file est la vue elle-même' },
  { fichier: 'HistoriqueV2.svelte', pourquoi: 'une liste, sans fiche' },
];

describe('Les écrans v2 à détail participent au mécanisme des raccourcis', () => {
  it.each(A_DETAIL)('$fichier publie sa cible', ({ fichier }) => {
    const src = lire(fichier);
    expect(src, `${fichier} n’appelle pas setShortcutTarget`).toContain('setShortcutTarget(');
  });

  it.each(A_DETAIL)('$fichier ÉCOUTE la restauration', ({ fichier }) => {
    // Publier sans écouter, c'est la moitié du contrat — et celle qui ne se
    // voit pas : le raccourci se crée, il ne rouvre simplement rien.
    const src = lire(fichier);
    expect(src, `${fichier} n’écoute pas tune:shortcut-restore`).toContain("addEventListener('tune:shortcut-restore'");
  });

  it.each(A_DETAIL)('$fichier oublie sa cible en quittant l’écran', ({ fichier }) => {
    // Sinon le raccourci SUIVANT capturerait un élément qu'on ne regarde plus.
    const src = lire(fichier);
    expect(src, `${fichier} ne relâche pas la cible`).toContain('clearShortcutTarget()');
  });

  it.each(A_DETAIL)('$fichier pose une clef préfixée « $prefixe: »', ({ fichier, prefixe }) => {
    // La clef sert à la déduplication autant qu'à la reconnaissance. Le préfixe
    // est ce qui permet à CHAQUE écran de reconnaître les siennes — sans lui,
    // une restauration de collection rouvrirait un podcast.
    //
    // On ne fige pas la FORME de la construction : `CollectionsV2` choisit son
    // préfixe par un ternaire (`smartcollections` ou `collections`), et exiger
    // un gabarit précis aurait interdit ce cas légitime.
    const src = lire(fichier);
    expect(src, `${fichier} ne mentionne aucune clef « ${prefixe}: »`).toContain(`${prefixe}:`);
  });

  it.each(A_DETAIL)('$fichier IGNORE une restauration qui ne le concerne pas', ({ fichier }) => {
    // Sans ce filtre, les quatre écrans se réveilleraient sur le même
    // événement et rouvriraient n'importe quoi — l'événement est unique et
    // porte toutes les cibles.
    const ligne = lire(fichier)
      .split('\n')
      .find((l) => l.includes('if (!cle') && l.includes('return;'));
    expect(ligne, `${fichier} n’a pas de sortie anticipée sur une clef étrangère`).toBeDefined();
  });

  it.each(A_DETAIL)('$fichier retire son écouteur au démontage', ({ fichier }) => {
    const src = lire(fichier);
    expect(src, `${fichier} laisse un écouteur derrière lui`)
      .toContain("removeEventListener('tune:shortcut-restore'");
  });

  it.each(SANS_DETAIL)('$fichier n’a rien à publier — $pourquoi', ({ fichier }) => {
    // Cette moitié compte autant : elle empêche d'ajouter le mécanisme là où
    // il n'a pas d'objet, et documente pourquoi.
    expect(lire(fichier)).not.toContain('setShortcutTarget(');
  });
});

describe('🔴 Le contrat lui-même', () => {
  it('la restauration passe par UN seul événement générique', () => {
    // Les écrans du client actuel ont chacun le leur
    // (`tune:shortcut-restore-playlist`, `-collection`, `-settings`…). En v2
    // on ne rejoue pas cette dispersion : un événement, un `detail.view`.
    const store = readFileSync('src/lib/stores/shortcuts.ts', 'utf8');
    expect(store).toContain("new CustomEvent('tune:shortcut-restore'");
    expect(store).toContain('detail: { view: shortcut.view, target }');
  });

  it('et la cible figée porte la clef ET de quoi rouvrir', () => {
    const store = readFileSync('src/lib/stores/shortcuts.ts', 'utf8');
    expect(store).toContain('state.target = { key: target.key, restore: target.restore }');
  });
});
