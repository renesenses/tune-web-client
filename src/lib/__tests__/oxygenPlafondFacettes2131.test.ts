// @vitest-environment jsdom
//
// #2131 — « atteindre les facettes demande trop d'étapes sur une grande
// bibliothèque » (Patatorz, fil `oxygen-mode-de-fonctionnement-xiaz2a`,
// 16/08/2026) :
//
//   « quand je fais une recherche, la plupart du temps il faut faire une
//     dizaine de clics pour charger une bibliothèque de 50k titres et accéder
//     aux filtres »
//
// ## Le chemin établi (dans le CODE, pas chez lui)
//
// Le rail N'EST PAS caché : au-delà de 780 px il est une colonne visible dès
// l'ouverture d'Oxygen (`railCollapsed = false`), et sous 780 px un seul clic
// sur ☰ l'ouvre. Ce n'est donc pas là que se logent dix gestes.
//
// Ce qui coûte cher, c'est d'atteindre une VALEUR : `oxygenFacetLimit` vaut
// 200 et le serveur tronque à ce plafond. Sur 8 873 artistes, 8 673 sont hors
// d'atteinte — et la bande A→Z ne rattrape rien, puisqu'elle est construite à
// partir des valeurs reçues : une lettre absente des 200 n'existe même pas
// comme bouton. Le seul chemin restant traversait les Réglages (Paramètres →
// Bibliothèque → « Valeurs par facette », réglage de niveau EXPERT donc
// masqué par défaut), puis le retour à Oxygen : une dizaine de gestes pour
// changer un réglage global et permanent au profit d'une recherche ponctuelle.
//
// ⚠️ Le chemin exact de Patatorz reste INCONNU : la question lui a été posée
// le 17/08 et il n'a jamais répondu. Rien ici ne prétend rejouer son geste.
//
// ## Ce que cette garde tient
//
// Elle monte le vrai rail et joue le geste : une facette butée sur son plafond
// offre « Tout afficher », et le clic remonte au parent, qui redemande la
// facette entière. Une facette complète, elle, n'affiche rien — sinon le
// bouton serait un bruit permanent.
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount } from 'svelte';
import OxygenFacetRail from '../../components/OxygenFacetRail.svelte';
import type { FacetValue } from '../api';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

let monte: Record<string, unknown> | null = null;
let hote: HTMLDivElement | null = null;

function poserRail(props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(OxygenFacetRail as never, {
    target: hote,
    props: {
      tracks: [],
      serverFacets: {},
      facets: ['artist'],
      limit: 200,
      selected: {},
      onSelect: () => {},
      ...props,
    } as never,
  });
  return hote;
}

/** Une facette servie par le serveur, tronquée à `n` valeurs. */
function valeurs(n: number, prefixe = 'Artiste '): FacetValue[] {
  return Array.from({ length: n }, (_, i) => ({ value: `${prefixe}${i}`, count: n - i }));
}

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  try { localStorage.clear(); } catch { /* mode privé */ }
});

const bouton = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('.allvals');

describe('la facette butée sur son plafond offre une issue, sur place', () => {
  it('« Tout afficher » apparaît quand la liste est tronquée', () => {
    const el = poserRail({ limit: 200, serverFacets: { artist: valeurs(200) } });
    const b = bouton(el);
    expect(b, '« Tout afficher » absent sur une facette tronquée').not.toBeNull();
    expect(b!.textContent?.trim()).toBe(fr['oxygen.facetShowAll']);
    expect(b!.getAttribute('aria-label')).toBe(fr['oxygen.facetShowAll']);
  });

  it('il n’apparaît PAS quand la facette tient tout entière', () => {
    // Sinon c'est un bruit permanent qui ne mène nulle part.
    const el = poserRail({ limit: 200, serverFacets: { artist: valeurs(37) } });
    expect(bouton(el)).toBeNull();
  });

  it('il n’apparaît pas non plus quand le plafond est déjà « sans limite »', () => {
    const el = poserRail({ limit: 0, serverFacets: { artist: valeurs(900) } });
    expect(bouton(el)).toBeNull();
  });

  it('le clic remonte LA facette au parent — un seul geste, sur place', () => {
    const demandes: string[] = [];
    const el = poserRail({
      limit: 200,
      serverFacets: { artist: valeurs(200) },
      onToutAfficher: (f: string) => demandes.push(f),
    });
    bouton(el)!.click();
    expect(demandes).toEqual(['artist']);
  });

  it('une fois le plafond levé, le bouton disparaît et la liste entière est rendue', () => {
    const el = poserRail({
      limit: 200,
      sansPlafond: ['artist'],
      serverFacets: { artist: valeurs(640) },
    });
    expect(bouton(el)).toBeNull();
    expect(el.querySelectorAll('.val').length).toBe(640);
  });
});

describe('le plafond levé vaut aussi pour les facettes agrégées côté client', () => {
  // Les champs hors `SERVER_FACET_FIELDS` sont comptés dans le navigateur sur
  // la fenêtre chargée, et cette agrégation appliquait le même plafond. Sans
  // ce point, « Tout afficher » n'aurait rien fait sur ces facettes-là.
  const pistes = Array.from({ length: 300 }, (_, i) => ({ id: i, genre: `Genre ${i}` }));

  it('sans le geste, la liste reste plafonnée', () => {
    const el = poserRail({ facets: ['genre'], limit: 50, tracks: pistes });
    expect(el.querySelectorAll('.val').length).toBe(50);
    expect(bouton(el)).not.toBeNull();
  });

  it('avec le geste, elle est entière', () => {
    const el = poserRail({ facets: ['genre'], limit: 50, sansPlafond: ['genre'], tracks: pistes });
    expect(el.querySelectorAll('.val').length).toBe(300);
    expect(bouton(el)).toBeNull();
  });
});

describe('la clé de traduction existe dans les ONZE langues', () => {
  // Une clé manquante rendrait le nom de la clé à l'écran, pas une erreur.
  it('oxygen.facetShowAll est traduite partout', async () => {
    const langues = ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh'];
    for (const l of langues) {
      const mod = await import(`../locales/${l}.ts`);
      const table = mod.default as Record<string, string>;
      const v = table['oxygen.facetShowAll'];
      expect(v, `oxygen.facetShowAll absente de ${l}`).toBeTruthy();
      expect(v).not.toBe('oxygen.facetShowAll');
    }
  });
});
