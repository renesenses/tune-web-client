// Chantier `tune-web-client#914` : « un texte coupé se lit en entier », sur
// TOUT `src/components/`, pas sur une liste de vues.
//
// Les gardes précédentes nommaient leurs composants (lot par lot). La V2 a
// remplacé la plupart d'entre eux, et les bulles sont parties avec : au
// 07/10/2026, 170 textes coupés sans recours dans 53 composants. Cette garde
// parcourt le dossier : une vue ajoutée demain, ou une classe tronquante
// ajoutée à une vue existante, sans bulle, la fait rougir.
//
// La troncature se lit dans le CSS (moteur commun `infobullesTronquees.ts`),
// et la couverture est un `title=` qui porte la donnée, un ancêtre qui en
// porte un, ou `use:bulleTexte` — l'action qui mesure, retire la bulle quand
// le texte tient, et l'ouvre au clavier.
import { readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RACINE,
  type Analyse,
  analyser,
  balisesOuvrantes,
  classesDe,
  classesTronquees,
  infobullesCreuses,
  sansInfobulle,
} from './infobullesTronquees';

const COMPOSANTS = resolve(RACINE, 'components');

function tousLesComposants(): string[] {
  const noms: string[] = [];
  (function parcourir(dossier: string) {
    for (const f of readdirSync(dossier)) {
      const p = resolve(dossier, f);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (f.endsWith('.svelte')) noms.push(relative(COMPOSANTS, p).replace(/\.svelte$/, ''));
    }
  })(COMPOSANTS);
  return noms.sort();
}

/**
 * Les seuls cas où une bulle serait du bruit. Chaque entrée dit pourquoi ; la
 * clé est « composant : classes de l'élément », pas un numéro de ligne, pour
 * survivre aux modifications voisines.
 */
const EXEMPTES: Record<string, string> = {
  'partages/ClampedText:clamp-text':
    'le texte replié a son propre bouton « Afficher plus » : une bulle doublerait une biographie entière',
  'v2/ListePistesV2:td act':
    'cellule de commandes (poignée, case à cocher, menu) : des boutons, aucun texte à lire',
  'partages/OxygenFolderFacet:crumb home':
    'le bouton « racine » du fil d’Ariane est une icône ; sa bulle est son libellé, pas une donnée coupée',
};

const EXEMPTIONS = Object.entries(EXEMPTES).map(([cle]) => {
  const [nom, classes] = cle.split(':');
  return { cle, nom, classes: classes.split(' ') };
});

const vraies = tousLesComposants().map(analyser);
const servies = new Set<string>();

/** Les analyses, sans les éléments exemptés — et l'on note quelles exemptions ont servi. */
const analyses: Analyse[] = vraies.map((a) => ({
  ...a,
  coupables: a.coupables.filter(({ b }) => {
    const siennes = classesDe(b.attrs);
    const e = EXEMPTIONS.find((x) => x.nom === a.nom && x.classes.every((c) => siennes.includes(c)));
    if (e) servies.add(e.cle);
    return !e;
  }),
}));

describe('#914 — tout texte coupé du client web se lit en entier', () => {
  it('la garde voit bien des textes coupés (elle ne passe pas à vide)', () => {
    const coupables = vraies.reduce((n, a) => n + a.coupables.length, 0);
    expect(vraies.length).toBeGreaterThan(100);
    expect(coupables).toBeGreaterThan(200);
  });

  it('🔴 aucun texte coupé sans infobulle, dans aucun composant', () => {
    const nus = sansInfobulle(analyses);
    expect(nus, `textes coupés sans recours :\n${nus.join('\n')}`).toEqual([]);
  });

  it('🔴 aucune infobulle creuse sur un texte coupé', () => {
    const creux = infobullesCreuses(analyses);
    expect(creux, `bulles qui ne disent rien :\n${creux.join('\n')}`).toEqual([]);
  });

  it('chaque exemption désigne encore un élément réel', () => {
    for (const { cle } of EXEMPTIONS) expect(servies.has(cle), `exemption morte : ${cle}`).toBe(true);
  });
});

describe('#914 — seul le SUJET du sélecteur est tronqué', () => {
  it('`.facet .nom { text-overflow: ellipsis }` coupe `.nom`, pas `.facet`', () => {
    const c = classesTronquees('.facet .nom { overflow: hidden; text-overflow: ellipsis; }');
    expect([...c]).toEqual(['nom']);
  });

  it('les combinateurs, `:global()` et les listes de sélecteurs', () => {
    const c = classesTronquees(
      '.a > :global(.truncate), .b + .c, .d ~ .e:not(.f) { text-overflow: ellipsis }',
    );
    expect([...c].sort()).toEqual(['c', 'e', 'truncate']);
  });

  it('une règle dans un `@media` est lue', () => {
    const c = classesTronquees('@media (max-width: 600px) { .x { -webkit-line-clamp: 2; line-clamp: 2 } }');
    expect([...c]).toEqual(['x']);
  });
});

describe('#914 — un élément VIDE n’a pas de texte à couper', () => {
  it('case d’en-tête sans libellé, squelette en `&nbsp;` : vides ; un texte : non', () => {
    const [entete, squelette, texte] = balisesOuvrantes(
      '<span class="th" role="columnheader"></span><div class="ct sq">&nbsp;</div><span class="ti">{t.title}</span>',
    );
    expect(entete.vide).toBe(true);
    expect(squelette.vide).toBe(true);
    expect(texte.vide).toBe(false);
  });
});
