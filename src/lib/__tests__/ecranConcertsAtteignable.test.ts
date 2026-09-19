import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * L'écran Concerts doit être ATTEIGNABLE, et sa porte doit se refermer.
 *
 * ⚠️ Une vue déclarée et aiguillée qu'aucun bouton n'atteint compile
 * parfaitement : ni `svelte-check`, ni la vérification i18n, ni les tests
 * unitaires ne voient l'absence de porte d'entrée. C'est arrivé à Bandcamp
 * (#1768) — l'écran existait, personne ne pouvait y aller.
 *
 * Ces tests lisent les fichiers source parce que c'est le seul moyen de
 * vérifier un CHAÎNAGE : type de vue → aiguillage → bouton → garde.
 */

function lire(chemin: string): string {
  return readFileSync(resolve(__dirname, chemin), 'utf8');
}

// Phase 5 : l'ancienne coquille (`App.svelte`, `components/Sidebar.svelte`)
// est partie. Les MÊMES faits sont vérifiés sur la coquille qui reste.
const SIDEBAR = lire('../../components/v2/Sidebar.svelte');
const APP = lire('../../components/v2/ShellV2.svelte');
const NAVIGATION = lire('../stores/navigation.ts');
const ECRAN = lire('../../components/v2-heritage/ConcertsView.svelte');

describe('écran Concerts — le chaînage complet', () => {
  it("'concerts' est une vue déclarée", () => {
    expect(NAVIGATION).toContain("'concerts'");
  });

  it("l'application aiguille bien vers l'écran", () => {
    expect(APP).toContain("import ConcertsView from '../v2-heritage/ConcertsView.svelte'");
    expect(APP).toContain("$activeView === 'concerts'");
    expect(APP).toContain('<ConcertsView />');
  });

  it('la barre latérale porte une entrée, rendue une seule fois', () => {
    const occurrences = SIDEBAR.split("{ view: 'concerts', labelKey: 'nav.concerts'").length - 1;
    expect(
      occurrences,
      "l'entrée Concerts est absente, ou dupliquée par un déplacement",
    ).toBe(1);
  });

  it("l'entrée navigue vers la vue, et pas vers une autre", () => {
    // La barre v2 navigue par la vue de chaque entrée : `go(it.view)`.
    expect(SIDEBAR).toContain("{ view: 'concerts', labelKey: 'nav.concerts'");
    expect(SIDEBAR).toContain('onclick={() => go(it.view)}');
  });

  it("l'entrée disparaît quand le binaire n'embarque pas le greffon", () => {
    // Une entrée qui mène à une porte fermée est pire que pas d'entrée.
    // La barre v2 filtre sa liste au lieu d'entourer un bouton : la garde
    // porte sur l'entrée `concerts`, et la boucle rend la liste FILTRÉE.
    expect(SIDEBAR, 'la garde `$concertsUtilisable` manque').toContain(
      "ADVANCED.filter((it) => it.view !== 'concerts' || $concertsUtilisable)",
    );
    expect(SIDEBAR).toContain('{#each avanceVisibles as it (it.view)}');
  });

  it("l'état du greffon est bien demandé au serveur", () => {
    // Sans cet appel, le store reste `null` et l'entrée n'apparaît JAMAIS —
    // l'écran serait aussi inaccessible qu'en l'absence de bouton.
    expect(SIDEBAR).toContain('refreshConcertsPlugin()');
  });
});

describe('écran Concerts — ce qu il refuse et ce qu il propose', () => {
  it("traite le refus d'offre comme un refus, pas comme une panne", () => {
    // Sans cela, un compte gratuit voit une erreur rouge incompréhensible au
    // lieu d'apprendre que la fonction existe et ce qu'elle coûte.
    expect(ECRAN).toContain('estRefusPremium');
    expect(ECRAN).toContain("$t('concerts.premiumRequis')");
  });

  it('offre les trois crans du périmètre, jamais un choix binaire', () => {
    // Les grands groupes ne passent que dans les grandes villes : un filtre
    // oui/non masquerait précisément les têtes d'affiche.
    expect(ECRAN).toContain("$t('concerts.autourDeMoi')");
    expect(ECRAN).toContain("$t('concerts.dansMonPays')");
    expect(ECRAN).toContain("$t('concerts.partout')");
  });

  it("propose d'élargir quand la liste est vide", () => {
    // Le geste utile devant une liste vide n'est pas de recharger.
    expect(ECRAN).toContain("$t('concerts.elargirAuPays')");
    expect(ECRAN).toContain("$t('concerts.elargirPartout')");
  });

  it("n'interroge pas le greffon tant que ses routes ne sont pas montées", () => {
    // Sans ce garde, l'écran récolte le 404 nu d'axum et l'affiche tel quel.
    expect(ECRAN).toContain('if (!$concertsCharge) return;');
  });
});
