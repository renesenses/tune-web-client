// 🔴 `renesenses/tune-web-client#914` — « 129 textes tronqués sans infobulle
// dans 27 vues du client web : on ne peut les lire nulle part ».
//
// OÙ EN EST LE CHANTIER — MESURÉ, PAS RELU
// -----------------------------------------
// Le 12/09/2026 sur `origin/main`, en comptant les balises tronquées qui ne
// portent ni `title=`, ni `use:tip`, ni `use:bulleTexte` :
//
//   129 sans infobulle → 48        (la fiche relevait 129)
//    46 avec           → 116
//
// ⚠️ Ce compte-là vient d'un grep sur `.truncate`. Le VRAI compte, celui de
// `sansInfobulle`, est plus large : il lit aussi les classes tronquées
// définies dans le `<style>` de chaque composant. Mesuré par lui, les quatre
// vues de ce lot portaient 23 textes nus, pas 22 — j'en avais raté un,
// `MediaServersView:459`, dont la classe `breadcrumb-current` est locale.
//
// Les deux tiers du chantier étaient donc déjà faits, sans que la fiche le
// dise. Ce lot prend les QUATRE vues les plus chargées de ce qui restait :
//
//   LibraryView 7 · Sidebar 6 · MediaServersView 5 · OfflineView 4  = 22
//
// POURQUOI `use:bulleTexte` ET NON `title=`
// ------------------------------------------
// Un `title` natif est rendu par le navigateur : l'application n'a aucun moyen
// de l'empêcher d'apparaître, et le réglage « ne plus afficher les bulles »
// serait impossible à honorer. L'action, elle, ne pose l'attribut QUE si le
// texte déborde vraiment (`texteDeborde`), et le retire quand il cesse de
// déborder — un panneau qu'on élargit fait tenir un titre qui ne tenait pas.
//
// CE QUE CE FICHIER TIENT
// -----------------------
// Il MONTE les vues et lit le document, comme `listesInfobulles2411` : une
// garde qui cherche `title=` dans le fichier source ne peut voir ni qu'une
// action n'est pas branchée, ni qu'un attribut n'arrive jamais dans le DOM —
// l'angle mort « écrit mais pas branché » de ce dépôt.
//
// CONTRE-ÉPREUVE : le dernier bloc vérifie que le compte des vues NON TRAITÉES
// n'a pas bougé. Sans lui, un lot qui n'aurait rien branché passerait au vert.
import { describe, expect, it } from 'vitest';
import { analyser, sansInfobulle } from './infobullesTronquees';

/** Les quatre vues de ce lot. */
const TRAITEES = ['LibraryView', 'Sidebar', 'MediaServersView', 'OfflineView'];

describe('#914 — les quatre vues les plus chargées', () => {
  it('🔴 plus aucun texte coupé sans infobulle', () => {
    const nus = sansInfobulle(TRAITEES.map(analyser));
    expect(nus, `il reste ${nus.length} texte(s) coupé(s) illisible(s)`).toEqual([]);
  });

  it('chacune porte bien l’action, et non un `title=` écrit à la main', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { resolve } = require('node:path') as typeof import('node:path');
    for (const nom of TRAITEES) {
      const src = readFileSync(
        resolve(__dirname, '../../components', `${nom}.svelte`), 'utf8');
      expect(src.includes('use:bulleTexte'), `${nom} n’emploie pas l’action`).toBe(true);
      expect(
        src.includes("from '../lib/infobulleTexte'"),
        `${nom} n’importe pas le mécanisme`,
      ).toBe(true);
    }
  });
});

describe('#914 — CONTRE-ÉPREUVE : le reste du chantier est intact', () => {
  /**
   * Les vues qu'on n'a PAS traitées, avec ce qu'elles portaient au 12/09.
   *
   * Ce bloc ne demande pas qu'elles soient corrigées — il demande que le
   * compte ne bouge pas à notre insu. S'il DESCEND, tant mieux : quelqu'un a
   * avancé, et il faudra l'écrire ici. S'il MONTE, une régression est entrée.
   */
  const RESTANTES: Record<string, number> = {
    BrowseView: 4,
    OxygenView: 10,
    ProfileSelector: 2,
  };

  it('elles portent toujours exactement ce qu’elles portaient', () => {
    for (const [nom, attendu] of Object.entries(RESTANTES)) {
      const nus = sansInfobulle([analyser(nom)]);
      expect(nus.length, `${nom} : ${nus.length} au lieu de ${attendu}`).toBe(attendu);
    }
  });

  it('le témoin prouve que la mesure VOIT quelque chose', () => {
    // Si `sansInfobulle` rendait toujours une liste vide, le premier bloc
    // passerait au vert sans qu'on ait rien branché. Ces vues-ci doivent
    // ressortir avec des textes nus.
    const total = Object.keys(RESTANTES)
      .map((n) => sansInfobulle([analyser(n)]).length)
      .reduce((a, b) => a + b, 0);
    expect(total, 'la mesure ne voit plus aucun texte nu : elle ne garde rien').toBeGreaterThan(0);
  });
});
