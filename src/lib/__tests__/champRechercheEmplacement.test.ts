/**
 * Recette rc12 (13/11/2026) — Bertrand : « Harmonise la localisation de la
 * zone de recherche dans tous les écrans. »
 *
 * LA règle : un seul composant (`ChampRecherche`), dans l'en-tête de l'écran,
 * en PREMIER dans sa grappe d'actions (avant onglets et boutons). Sous 780 px,
 * il prend toute la largeur sous le titre (`styles/tune-v2.css`).
 *
 * Cette garde :
 * 1. chaque écran listé importe ET emploie le composant partagé ;
 * 2. plus aucun écran ne recopie le balisage `.v2-rech` (hors exceptions
 *    nommées ci-dessous, chacune avec sa raison) ;
 * 3. dans un en-tête d'écran, le champ vient avant onglets et boutons ;
 * 4. la règle étroite (< 780 px) est dans la feuille partagée.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';

const lire = (f: string) => readFileSync(f, 'utf8');

/** Spécificité CSS [id, classes, types] — Sélecteurs niveau 4 : `:has()`,
 *  `:not()`, `:is()` valent leur argument, `:where()` rien, `:root` une classe. */
function specificite(sel: string): [number, number, number] {
  let s = sel.replace(/:where\([^)]*\)/g, '');
  const args: string[] = [];
  s = s.replace(/:(?:has|not|is)\(([^)]*)\)/g, (_, a) => { args.push(a); return ''; });
  const base: [number, number, number] = [
    (s.match(/#[\w-]+/g) ?? []).length,
    (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length,
    (s.replace(/[.#:][\w-]+|\[[^\]]*\]/g, ' ').match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length,
  ];
  for (const a of args) { const x = specificite(a.replace(/^\s*[>+~]\s*/, '')); base[0] += x[0]; base[1] += x[1]; base[2] += x[2]; }
  return base;
}
const comparer = (a: number[], b: number[]) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);

const balisage = (f: string) => { const s = lire(f); const i = s.lastIndexOf('<style'); return i < 0 ? s : s.slice(0, i); };

/** Les écrans à recherche, et où le champ se pose. */
const ECRANS: Record<string, 'entete' | 'barre' | 'panneau' | 'rangee-radios'> = {
  'src/components/v2/LibraryV2.svelte': 'entete',            // Albums, Artistes, Titres, Genres, Compositeurs…
  'src/components/v2/FavoritesV2.svelte': 'entete',
  'src/components/v2/PlaylistsV2.svelte': 'entete',
  'src/components/v2/PodcastsV2.svelte': 'entete',           // Mes abonnements
  'src/components/v2/MediaServersV2.svelte': 'entete',
  'src/components/v2/StreamingV2.svelte': 'entete',          // Qobuz, TIDAL, Bandcamp, YouTube…
  'src/components/v2/PluginsV2.svelte': 'entete',
  'src/components/v2/CollectionPhysiqueV2.svelte': 'entete',
  'src/components/v2-heritage/OxygenView.svelte': 'barre',   // l'en-tête d'Oxygen est sa barre
  'src/components/v2-heritage/PlaylistManagerView.svelte': 'barre',
  'src/components/v2/ConverterV2.svelte': 'panneau',         // filtre du sélecteur d'albums
  'src/components/v2/DeclickV2.svelte': 'panneau',
  'src/components/v2/RadioRecherche.svelte': 'rangee-radios', // Mes radios + Annuaire
};

describe('la spécificité calculée par la garde', () => {
  it('compte comme le navigateur', () => {
    expect(specificite('.v2-shell.mini .tune-v2 .v2-top .v2-actions')).toEqual([0, 5, 0]);
    expect(specificite('.v2-shell .tune-v2 .v2-top > .v2-actions:has(> .v2-rech)')).toEqual([0, 5, 0]);
    expect(specificite(':root .v2-shell .tune-v2 .v2-top > .v2-actions:has(> .v2-rech)')).toEqual([0, 6, 0]);
    expect(specificite('html .a:where(.b)')).toEqual([0, 1, 1]);
  });
});

describe('un seul champ de recherche, le même partout', () => {
  it('chaque écran listé importe et emploie ChampRecherche', () => {
    const fautifs: string[] = [];
    for (const f of Object.keys(ECRANS)) {
      const s = lire(f);
      if (!/import ChampRecherche from '(\.\/|\.\.\/v2\/)ChampRecherche\.svelte'/.test(s)) fautifs.push(`${f} : import`);
      if (!balisage(f).includes('<ChampRecherche')) fautifs.push(`${f} : balise`);
    }
    expect(fautifs).toEqual([]);
  });

  it('Radios passe par RadioRecherche, donc par le champ partagé', () => {
    expect(lire('src/components/v2/RadiosV2.svelte')).toContain('<RadioRecherche');
    expect(lire('src/components/v2/RadioAnnuaire.svelte')).toContain('<RadioRecherche');
  });

  it('🔴 plus aucun écran ne recopie le balisage `.v2-rech`', () => {
    // Exceptions : le composant lui-même ; la carte de découverte (radios,
    // podcasts), dont le champ LOCALISE un pays sur la carte à Entrée.
    const permis = new Set(['src/components/v2/ChampRecherche.svelte', 'src/components/v2/CarteDecouverte.svelte']);
    const fautifs = [...globSync('src/components/**/*.svelte')]
      .filter((f) => !permis.has(f) && /class="v2-rech[^"]*"[^>]*>\s*<svg/.test(balisage(f)));
    expect(fautifs).toEqual([]);
  });

  it('dans l’en-tête, le champ vient AVANT onglets et boutons', () => {
    const fautifs: string[] = [];
    for (const [f, ou] of Object.entries(ECRANS)) {
      if (ou !== 'entete') continue;
      const blocs = balisage(f).match(/<header class="v2-top[^"]*"[^>]*>[\s\S]*?<\/header>/g) ?? [];
      const bloc = blocs.find((b) => b.includes('<ChampRecherche'));
      if (!bloc) { fautifs.push(`${f} : pas dans header.v2-top`); continue; }
      const actions = bloc.indexOf('class="v2-actions');
      const rech = bloc.indexOf('<ChampRecherche');
      if (actions < 0 || rech < actions) fautifs.push(`${f} : hors de .v2-actions`);
      for (const apres of ['class="v2-btn', 'class="tabs"', '<nav class="tabs', 'class="tab"', 'class="meta"']) {
        const i = bloc.indexOf(apres, actions);
        if (i >= 0 && i < rech) fautifs.push(`${f} : ${apres} avant la recherche`);
      }
    }
    expect(fautifs).toEqual([]);
  });

  it('la Bibliothèque n’a plus de champ dans la rangée des filtres', () => {
    const s = balisage('src/components/v2/LibraryV2.svelte');
    const filtres = s.slice(s.indexOf('<div class="filters">'));
    expect(filtres.includes('<ChampRecherche')).toBe(false);
    // Le raccourci « / » et la frappe directe (#1872) gardent leur champ.
    expect(s).toMatch(/<ChampRecherche[^>]*bind:champ=\{champRecherche\}[^>]*raccourci="\/"/);
  });

  it('sous 780 px : toute la largeur, sous le titre — une règle, dans la feuille', () => {
    const css = lire('src/styles/tune-v2.css');
    const bloc = css.slice(css.indexOf('@media (max-width:779px)'));
    expect(bloc).toMatch(/\.v2-top:has\(> \.v2-actions > \.v2-rech\)\{flex-wrap:wrap/);
    expect(bloc).toMatch(/\.v2-actions > \.v2-rech\{flex:1 1 100%/);
  });

  it('🔴 sous 780 px, la règle l’EMPORTE sur la vue mini (spécificité, pas ordre de chargement)', () => {
    // Relecture de #3019 : `vue-mini.css` est chargée APRÈS `tune-v2.css` ;
    // à spécificité égale, sa rangée `nowrap` gagnait et la recherche
    // partageait la ligne des onglets. On exige donc une spécificité
    // STRICTEMENT supérieure, propriété par propriété.
    const css = lire('src/styles/tune-v2.css');
    const mini = lire('src/styles/vue-mini.css').replace(/\/\*[\s\S]*?\*\//g, ' ');
    const bloc = css.slice(css.indexOf('@media (max-width:779px)'));
    const regles = [...bloc.slice(0, bloc.indexOf('\n}\n')).matchAll(/^\s*([^{\n@]+)\{([^}]*)\}/gm)]
      .map((m) => ({ sel: m[1].trim(), props: m[2] }));
    expect(regles.length).toBe(4);
    // [cible dans la vue mini, propriété disputée, règle à nous qui la pose]
    const duels: [RegExp, string][] = [
      [/\.v2-top > \.v2-actions:has/, 'flex-wrap'],
      [/> \.v2-titres$/, 'max-width'],
      [/\.v2-top:has\(> \.v2-actions > \.v2-rech\)$/, 'flex-wrap'],
      [/> \.v2-rech$/, 'flex'],
    ];
    const miniRegles = [...mini.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), props: m[2] }));
    const derniere = (s: string) => s.split(/[\s>]+/).filter(Boolean).pop()!.replace(/:has\(.*$/, '');
    for (const [motif, prop] of duels) {
      const notre = regles.find((r) => motif.test(r.sel));
      expect(notre, String(motif)).toBeTruthy();
      expect(notre!.props).toContain(`${prop}:`);
      const cible = derniere(notre!.sel.replace(/:has\([^)]*\)/g, ''));
      const rivales = miniRegles.filter((r) => r.sel.split(',').some((s) => derniere(s.trim()) === cible)
        && new RegExp(`(^|[;\\s])${prop}\\s*:`).test(r.props));
      expect(rivales.length, `aucune règle rivale trouvée pour ${cible} (${prop}) : la garde ne mesure plus rien`).toBeGreaterThan(0);
      for (const r of rivales) {
        for (const s of r.sel.split(',')) {
          if (derniere(s.trim()) !== cible) continue;
          expect(comparer(specificite(notre!.sel), specificite(s.trim())), `${notre!.sel}  vs  ${s.trim()} (${prop})`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('l’invite existe dans les quinze langues, avec son {ecran}', () => {
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu', 'vi', 'el', 'nb', 'pl']) {
      const m = lire(`src/lib/locales/${l}.ts`).match(/"v2\.rech\.dans": "([^"]+)"/);
      expect(m, l).not.toBeNull();
      expect(m![1], l).toContain('{ecran}');
    }
  });
});
