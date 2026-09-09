// @vitest-environment jsdom
//
// jsdom, et pas `node` : ce fichier MONTE le composant réel. Sans `window`, le
// runtime client de Svelte n'installe pas son ordonnanceur, et « la pastille
// s'affiche » passerait au vert sans avoir rien rendu.
//
// ─────────────────────────────────────────────────────────────────────────────
//
// `renesenses/tune-server-rust#1957` — « le drapeau compilation n'apparaît
// nulle part à l'écran ».
//
// Le serveur fait sa part depuis la v0.9.95 : colonne `is_compilation`
// (SQLite et PostgreSQL), écrite au scan, rendue par `Album::to_json`
// (`models.rs`) et par `/library/albums-detailed` (`MAX(al.is_compilation)`),
// avec un filtre `?compilation=true|false` accepté (`albums.rs`). Le client, lui,
// ne déclarait même pas le champ dans son interface `Album` : rien ne le lisait.
//
// Ce que cette garde tient :
//   1. la pastille est rendue par le COMPOSANT réel quand le drapeau est vrai ;
//   2. elle ne dit RIEN quand il est faux ou absent — la valeur d'un album non
//      re-scanné n'est pas une information, et « ce n'est pas une compilation »
//      serait une affirmation fausse ;
//   3. compacte, elle reste nommée pour un lecteur d'écran (pas qu'une couleur) ;
//   4. le filtre de la bibliothèque RETIRE bien les albums non conformes, et son
//      compte se calcule sans lui-même (règle des facettes) ;
//   5. les onze langues portent ses quatre clés, et l'anglais ne retombe pas
//      sur le nom de la clé.
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount } from 'svelte';
import PastilleCompilation from '../../components/v2/PastilleCompilation.svelte';
import { locale } from '../i18n';
import {
  comptesCompilation, comptesFormat, correspond,
  type FiltresBibliotheque, type Outils,
} from '../facettesBibliotheque';
import type { Album } from '../types';
// Tous préfixés `l` : `import it from '../locales/it'` écraserait le `it` de
// Vitest.
import lFr from '../locales/fr';
import lDe from '../locales/de';
import lEn from '../locales/en';
import lEs from '../locales/es';
import lHu from '../locales/hu';
import lIt from '../locales/it';
import lJa from '../locales/ja';
import lKo from '../locales/ko';
import lRo from '../locales/ro';
import lSv from '../locales/sv';
import lZh from '../locales/zh';

const CLES = [
  'v2.album.compilation',
  'v2.album.compilationHint',
  'v2.lib.compilations',
  'v2.lib.compilationsHint',
];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PastilleCompilation, { target: hote, props });
  return hote;
}
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  locale.set('fr');
});

describe('la pastille « compilation » (#1957)', () => {
  it('affiche le libellé quand le serveur dit que oui', () => {
    const el = poser({ compilation: true });
    expect(el.textContent).toContain((lFr as Record<string, string>)['v2.album.compilation']);
    // L'infobulle dit D'OÙ vient le drapeau : sans elle, un utilisateur qui
    // n'en voit aucune sur sa bibliothèque n'a aucun moyen de comprendre que
    // c'est le scan qui n'est pas repassé.
    expect(el.querySelector('.cpl')?.getAttribute('title'))
      .toBe((lFr as Record<string, string>)['v2.album.compilationHint']);
  });

  // 🔴 Le cœur du sujet. La colonne est écrite AU SCAN : sur une bibliothèque
  // indexée avant la v0.9.95, tout vaut `false`, et le verdict vient encore de
  // changer pour les albums à cheval sur plusieurs lots (serveur `ef2de52e`).
  // Une mention « ce n'est pas une compilation » serait donc une affirmation
  // que la base ne soutient pas.
  it('ne rend RIEN quand le drapeau est faux, absent ou nul', () => {
    for (const props of [{ compilation: false }, {}, { compilation: null }]) {
      const el = poser(props);
      expect(el.querySelector('.cpl')).toBeNull();
      expect(el.textContent?.trim()).toBe('');
      if (monte) unmount(monte);
      monte = null;
      el.remove();
      hote = null;
    }
  });

  // Contre-épreuve du point ci-dessus : la garde ne passe pas au vert parce que
  // le composant ne rend jamais rien.
  it('contre-épreuve : le même montage AVEC le drapeau rend bien un élément', () => {
    expect(poser({ compilation: true }).querySelector('.cpl')).not.toBeNull();
  });

  it('compacte, elle reste NOMMÉE — pas seulement une couleur', () => {
    const el = poser({ compilation: true, compact: true });
    const pastille = el.querySelector('.cpl');
    expect(pastille).not.toBeNull();
    // Le libellé disparaît (la place manque sur une vignette), mais le nom
    // reste porté par `aria-label` et l'icône reste visible.
    expect(el.querySelector('.lbl')).toBeNull();
    expect(pastille?.getAttribute('aria-label'))
      .toBe((lFr as Record<string, string>)['v2.album.compilation']);
    expect(el.querySelector('svg')).not.toBeNull();
  });

  it("suit la langue choisie, et l'anglais ne retombe pas sur le nom de la clé", () => {
    locale.set('en');
    const el = poser({ compilation: true });
    const attendu = (lEn as Record<string, string>)['v2.album.compilation'];
    expect(attendu).not.toBe('v2.album.compilation');
    expect(el.textContent).toContain(attendu);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Le FILTRE. `?compilation=true` était accepté par le serveur depuis la
// v0.9.95 et exposé par aucun écran.
// ─────────────────────────────────────────────────────────────────────────────
const OUTILS: Outils = {
  qualiteDe: () => true,
  anneeDe: (a) => a.year ?? null,
  plier: (s) => (s ?? '').toLowerCase(),
};
const AUCUN: FiltresBibliotheque = {
  qualite: null, frequence: null, annee: null,
  format: null, profondeur: null, recherche: '', compilation: null,
};
const alb = (id: number, o: Partial<Album> = {}): Album =>
  ({ id, title: `A${id}`, ...o }) as Album;
const BIBLIO: Album[] = [
  alb(1, { is_compilation: true, format: 'FLAC' }),
  alb(2, { is_compilation: false, format: 'FLAC' }),
  // Un album servi par un serveur ancien : le champ n'est pas là du tout.
  alb(3, { format: 'MP3' }),
];

describe('le filtre « compilations » de la bibliothèque (#1957)', () => {
  it('sans filtre, tout passe', () => {
    expect(BIBLIO.filter((a) => correspond(a, AUCUN, OUTILS)).map((a) => a.id))
      .toEqual([1, 2, 3]);
  });

  it('RETIRE les albums qui ne sont pas des compilations', () => {
    const f: FiltresBibliotheque = { ...AUCUN, compilation: true };
    expect(BIBLIO.filter((a) => correspond(a, f, OUTILS)).map((a) => a.id)).toEqual([1]);
  });

  // Le champ absent vaut « non », comme côté serveur (`drapeau_compilation`
  // décode NULL en faux) — jamais « on ne sait pas, laissons passer ».
  it('un album sans le champ n’est pas une compilation', () => {
    const f: FiltresBibliotheque = { ...AUCUN, compilation: true };
    expect(correspond(alb(9), f, OUTILS)).toBe(false);
    expect(correspond(alb(9, { is_compilation: true }), f, OUTILS)).toBe(true);
  });

  it('le compte tient compte des AUTRES filtres', () => {
    expect(comptesCompilation(BIBLIO, AUCUN, OUTILS)).toBe(1);
    expect(comptesCompilation(BIBLIO, { ...AUCUN, format: 'MP3' }, OUTILS)).toBe(0);
  });

  // La règle des facettes : une facette se compte SANS elle-même, sinon le
  // menu devient un cul-de-sac dès qu'on a cliqué.
  it('le compte ne se compte pas lui-même', () => {
    const f: FiltresBibliotheque = { ...AUCUN, compilation: true };
    expect(comptesCompilation(BIBLIO, f, OUTILS)).toBe(1);
    // …et les AUTRES facettes, elles, voient bien la restriction.
    expect(comptesFormat(BIBLIO, f, OUTILS)).toEqual([['FLAC', 1]]);
  });
});

describe('les onze langues portent les clés de la pastille', () => {
  const langues: [string, Record<string, string>][] = [
    ['fr', lFr], ['en', lEn], ['de', lDe], ['es', lEs], ['hu', lHu], ['it', lIt],
    ['ja', lJa], ['ko', lKo], ['ro', lRo], ['sv', lSv], ['zh', lZh],
  ];
  it('onze fichiers, quatre clés chacun, aucune valeur vide', () => {
    expect(langues).toHaveLength(11);
    for (const [nom, dict] of langues) {
      for (const cle of CLES) {
        expect(`${nom}:${cle}:${dict[cle] ?? ''}`.length).toBeGreaterThan(nom.length + cle.length + 2);
      }
    }
  });
});
