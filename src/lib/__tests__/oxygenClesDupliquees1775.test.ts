// @vitest-environment jsdom
//
// #1775 — « UI avec Edge » : Oxygen s'affiche puis reste figé, F5 obligatoire,
// et le sélecteur de niveau d'utilisation ne répond plus.
//
// La preuve déposée par Reivax66 le 16/08/2026 :
//
//   Uncaught Error: https://svelte.dev/e/each_key_duplicate
//
// Cette garde MONTE le vrai rail de facettes et lui donne exactement la
// donnée qui produit cette erreur. Elle ne lit aucun fichier : sur `main`
// avant le correctif, `mount()` LÈVE, et le test est rouge pour la même raison
// que l'écran du testeur.
//
// Ce qu'elle n'établit pas — et qu'il ne faut pas lui faire dire :
//   • le symptôme n'a pas été reproduit sous Edge ;
//   • on ne sait pas laquelle des deux listes portait le doublon chez lui
//     (la trace est minifiée et ne nomme aucun composant) ;
//   • « Edge oui, Chrome non » reste inexpliqué. Les deux partagent Blink.
//     `localStorage` étant un magasin par navigateur, une préférence abîmée
//     dans le seul profil Edge y suffirait — c'est cohérent, pas démontré.
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount } from 'svelte';
import OxygenFacetRail from '../../components/OxygenFacetRail.svelte';
import type { FacetValue } from '../api';
import { chainesUniques, sansDoublons } from '../clesUniques';

let monte: Record<string, unknown> | null = null;
let hote: HTMLDivElement | null = null;

function poserRail(props: {
  facets: string[];
  serverFacets: Record<string, FacetValue[]>;
}): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(OxygenFacetRail as never, {
    target: hote,
    props: {
      tracks: [],
      serverFacets: props.serverFacets,
      facets: props.facets,
      limit: 200,
      selected: {},
      onSelect: () => {},
    } as never,
  });
  return hote;
}

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  try { localStorage.clear(); } catch { /* mode privé */ }
});

describe('le rail de facettes survit à une donnée qui porte deux fois la même clé', () => {
  it('une facette listée DEUX FOIS ne fait plus tomber Oxygen', () => {
    // La liste vient de `preferences.oxygenFacets`, donc de `localStorage`.
    const el = poserRail({
      facets: ['genre', 'genre', 'year'],
      serverFacets: {
        genre: [{ value: 'Jazz', count: 12 }],
        year: [{ value: '1971', count: 3 }],
      },
    });
    // Le rail s'est rendu — c'est déjà tout le sujet : avant, `mount` levait.
    expect(el.querySelector('.rail')).not.toBeNull();
    // Et « genre » n'apparaît qu'une fois : un doublon coûte une entrée
    // ignorée, pas un écran mort.
    const titres = [...el.querySelectorAll('.ghtitle')].map((b) => b.textContent?.trim());
    expect(titres.filter((t) => t === titres[0]).length).toBe(1);
    expect(titres.length).toBe(2);
  });

  it('deux valeurs identiques servies par le serveur ne font plus tomber Oxygen', () => {
    const el = poserRail({
      facets: ['genre'],
      // `row.value` est la clé du bloc keyé des valeurs. Les valeurs viennent
      // de la base et des métadonnées ; rien ne les dédoublonnait.
      serverFacets: { genre: [{ value: 'Jazz', count: 12 }, { value: 'Jazz', count: 4 }] },
    });
    expect(el.querySelector('.rail')).not.toBeNull();
    const valeurs = [...el.querySelectorAll('.val .vl')].map((s) => s.textContent);
    expect(valeurs).toEqual(['Jazz']);
    // Aucun compte n'est additionné : on n'affiche que ce que la source a
    // réellement envoyé pour la ligne retenue.
    expect(el.querySelector('.val .vc')?.textContent).toBe('12');
  });

  it('le cas normal est intact : deux facettes distinctes, deux groupes', () => {
    const el = poserRail({
      facets: ['genre', 'year'],
      serverFacets: {
        genre: [{ value: 'Jazz', count: 12 }, { value: 'Blues', count: 5 }],
        year: [{ value: '1971', count: 3 }],
      },
    });
    expect(el.querySelectorAll('.group').length).toBe(2);
    expect([...el.querySelectorAll('.val .vl')].map((s) => s.textContent)).toEqual(
      ['Jazz', 'Blues', '1971'],
    );
  });
});

describe('sansDoublons', () => {
  it('garde la PREMIÈRE occurrence, dans l’ordre', () => {
    const rows = [{ v: 'a', n: 1 }, { v: 'b', n: 2 }, { v: 'a', n: 3 }];
    expect(sansDoublons(rows, (r) => r.v)).toEqual([{ v: 'a', n: 1 }, { v: 'b', n: 2 }]);
  });

  it('rend le tableau D’ORIGINE quand il n’y a rien à retirer', () => {
    // L'identité compte : un `$derived` qui recevrait un nouveau tableau à
    // chaque tour relancerait tout le rail pour rien, dans le cas normal.
    const rows = [{ v: 'a' }, { v: 'b' }];
    expect(sansDoublons(rows, (r) => r.v)).toBe(rows);
  });

  it('chainesUniques traite une liste qui se clave sur elle-même', () => {
    expect(chainesUniques(['genre', 'genre', 'year', 'genre'])).toEqual(['genre', 'year']);
  });
});
