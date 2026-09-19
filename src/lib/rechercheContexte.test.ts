import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { requeteAuMontage } from './rechercheContexte';

/**
 * Le second parcours de Sandro (fil 1553), celui qui restait ouvert.
 *
 *   loupe → « Leprous » → résultats mixtes → on choisit le Qobuz
 *         → discographie → album → Retour
 *
 * Trois manques distincts s'additionnaient pour donner ce qu'il décrit — « je
 * me retrouve sur la page d'accueil principale de Qobuz, les résultats de la
 * recherche globale ont complètement disparu » :
 *
 *  1. la vue Recherche ne survivait pas à son démontage — ici ;
 *  2. elle n'annonçait pas d'où l'on venait (`streamingAlbumOrigin`) — ici
 *     aussi, par une garde sur le code ;
 *  3. `selectArtist` effaçait cette annonce à la seconde où elle arrivait —
 *     garde sur `StreamingView`, plus bas.
 *
 * Le quatrième point, l'ordre entre dépilage et provenance, est prouvé dans
 * `streamingRetour.test.ts`.
 */
describe('requeteAuMontage', () => {
  it('rejoue la recherche du passage précédent', () => {
    // Le retour de Sandro : rien de neuf n'est demandé, mais il avait une
    // recherche en cours avant d'entrer dans Qobuz.
    expect(requeteAuMontage('', 'Leprous')).toBe('Leprous');
  });

  it("une demande venue d'un autre écran prime sur le contexte", () => {
    // La loupe, ou « rechercher cet artiste » depuis le lecteur : c'est un
    // geste que l'utilisateur vient de faire, il ne doit pas être recouvert
    // par la recherche d'avant.
    expect(requeteAuMontage('Opeth', 'Leprous')).toBe('Opeth');
  });

  it('laisse la vue à son écran de découverte quand il n’y a rien à rejouer', () => {
    expect(requeteAuMontage('', '')).toBeNull();
    expect(requeteAuMontage(null, undefined)).toBeNull();
  });

  it('ignore une requête qui ne contient que des espaces', () => {
    // `searchQuery` est enregistré à chaque frappe : un contexte réduit à des
    // espaces ne doit pas déclencher de recherche au montage.
    expect(requeteAuMontage('   ', '  ')).toBeNull();
    expect(requeteAuMontage('   ', 'Leprous')).toBe('Leprous');
  });
});


