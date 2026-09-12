// 🔴 renesenses/tune-web-client#849 — FabienM, fil 1761, v0.9.145 :
// « je constate un débord du label de qualité de l'album retourné en meilleur
// résultat dans la recherche » et « idem quand le meilleur résultat est un
// titre, la durée du titre déborde du cadre ».
//
// LE MÉCANISME, MESURÉ DANS LE NAVIGATEUR (12/09/2026)
// ────────────────────────────────────────────────────
// Sur son cas exact — « wish you were », album Qobuz 192/24, badge
// « Hi-Res Max ✦ FLAC 192/24 » :
//
//   .top-row fixe la colonne à 300 px
//   − 40 px de padding − 110 px de pochette − 16 px de gouttière = 134 px
//
//   AVANT : .top-result-meta fait 134 px pour 245 px de contenu ; le badge
//           (168 px) sortait de 91 px À DROITE de la carte, par-dessus la
//           colonne des artistes voisine.
//   APRÈS : badge 134 px, entièrement dans la carte (20 px de marge).
//
// `.top-result-details` portait déjà `min-width: 0` — c'est pourquoi le TITRE
// se cassait proprement sur deux lignes, et pourquoi le défaut passait pour un
// simple « problème d'alignement ». La rangée de méta, elle, n'avait ni
// `flex-wrap` ni `min-width` : ses enfants sont des blocs insécables, ils
// sortaient. C'est un DÉBORDEMENT, pas un alignement.
//
// CE QUE CE FICHIER TIENT
// ───────────────────────
// jsdom ne met rien en page : aucun pixel n'est mesurable ici. On tient les
// trois règles qui produisent la mesure ci-dessus, et dont le retrait
// ramènerait le débord sans qu'aucun autre test ne bronche.
//
// CONTRE-ÉPREUVE : la dernière suite rejoue la feuille de style d'AVANT et
// exige que chaque prédicat la refuse.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { declarationsDe, lireStyles, type Regle } from './ancrageDefilement';

const source = readFileSync(
  resolve(__dirname, '../../components/SearchView.svelte'), 'utf-8',
);
const regles = lireStyles(source);

/** Les trois invariants, exprimés une seule fois pour servir aussi à la contre-épreuve. */
const PREDICATS = {
  'la rangée de méta se replie': (r: Regle[]) =>
    declarationsDe(r, 'top-result-meta')['flex-wrap'] === 'wrap',
  'la rangée de méta peut rétrécir': (r: Regle[]) =>
    declarationsDe(r, 'top-result-meta')['min-width'] === '0',
  'la carte retient ce qui dépasse': (r: Regle[]) =>
    declarationsDe(r, 'top-result-card').overflow === 'hidden',
};

describe('#849 — le meilleur résultat ne déborde plus de sa carte', () => {
  for (const [nom, predicat] of Object.entries(PREDICATS)) {
    it(nom, () => {
      expect(
        predicat(regles),
        `${nom} : la règle a disparu, le badge de qualité ressortira de la carte`,
      ).toBe(true);
    });
  }

  it('le badge lui-même peut se replier DANS cette carte', () => {
    // Le repli de la rangée ne suffisait pas : seul sur sa ligne, le badge
    // faisait encore 168 px pour 134 px de colonne, et l'`overflow:hidden` le
    // TRONQUAIT. Mesuré : 134 px une fois ce repli interne autorisé.
    const cible = regles.find((r) =>
      /\.top-result-meta\b/.test(r.selecteur) && /quality-badge/.test(r.selecteur));
    expect(
      cible?.declarations['flex-wrap'],
      'sans repli interne, « Hi-Res Max ✦ FLAC 192/24 » est tronqué au lieu de tenir',
    ).toBe('wrap');
  });

  it('la portée reste LOCALE : QualityBadge n’est pas modifié pour tout le reste', () => {
    const badge = readFileSync(
      resolve(__dirname, '../../components/QualityBadge.svelte'), 'utf-8',
    );
    expect(
      declarationsDe(lireStyles(badge), 'quality-badge')['flex-wrap'],
      'QualityBadge sert une vingtaine d’écrans : il doit garder son unique ligne ailleurs',
    ).toBeUndefined();
  });

  it('la colonne du meilleur résultat est bien celle de 300 px qu’on a mesurée', () => {
    // Si la colonne cessait d'être fixe, l'arithmétique ci-dessus — et donc la
    // raison d'être de ce fichier — changerait ; mieux vaut le savoir.
    expect(declarationsDe(regles, 'top-row')['grid-template-columns']).toContain('300px');
  });
});

describe('contre-épreuve — les prédicats refusent la feuille de style d’AVANT', () => {
  // Les règles telles qu'elles étaient sur `main` avant ce correctif.
  const avant = lireStyles(`<style>
    .top-row { display: grid; grid-template-columns: 300px 1fr; }
    .top-result-card { display: flex; width: 100%; position: relative; }
    .top-result-details { display: flex; flex-direction: column; min-width: 0; }
    .top-result-meta { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
  </style>`);

  for (const [nom, predicat] of Object.entries(PREDICATS)) {
    it(`🔴 « ${nom} » est FAUX sur l’ancienne feuille`, () => {
      expect(
        predicat(avant),
        `« ${nom} » reste vrai sans la règle : ce prédicat ne garde rien`,
      ).toBe(false);
    });
  }
});
