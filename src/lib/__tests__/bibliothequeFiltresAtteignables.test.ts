/**
 * Les menus de filtres de la Bibliothèque doivent être ATTEIGNABLES.
 *
 * ## Le défaut
 *
 * Ils s'ouvraient au survol seul :
 *
 * ```css
 * .chip { height: 36px }        /* le chip          *\/
 * .drop { position: relative }   /* épouse le chip   *\/
 * .drop .menu { top: 44px }      /* le menu          *\/
 * .drop:hover .menu { display: flex }
 * ```
 *
 * Huit pixels morts entre le bas de `.drop` (36) et le haut du menu (44). En
 * descendant vers le menu, le pointeur quittait `.drop`, `:hover` tombait, et
 * le menu disparaissait AVANT d'être atteint. Visible, jamais cliquable.
 *
 * Signalé par Bertrand le 01/09/2026 — « les filtres ne sont pas
 * sélectionnables » — sur les Serveurs multimédia puis sur la Bibliothèque :
 * l'écran Serveurs monte le MÊME composant sur un catalogue distant, donc un
 * seul défaut se voyait à deux endroits.
 *
 * ## Ce que le garde tient
 *
 * Deux corrections, et il faut les deux — l'une sans l'autre laisse un trou :
 *
 *  1. le PONT transparent comble les 8 px, pour que le survol reste continu ;
 *  2. le chip ouvre au CLIC. Un menu au survol seul n'existe ni au clavier ni
 *     au toucher : sur tablette, aucun de ces filtres n'était atteignable,
 *     quelle que soit la géométrie. Corriger le pont seul aurait réparé la
 *     souris et laissé le reste.
 *
 * ⚠️ Ce test lit la SOURCE. Il ne remplace pas un essai à la souris — la
 * géométrie réelle dépend du rendu. Il empêche la régression, il ne prouve pas
 * le fonctionnement.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ECRAN = fileURLToPath(
  new URL('../../components/v2/LibraryV2.svelte', import.meta.url),
);
const source = () => readFileSync(ECRAN, 'utf8');

/** Hauteur déclarée d'un sélecteur, en pixels. */
function hauteur(css: string, selecteur: string): number | null {
  const bloc = new RegExp(`\\.${selecteur}\\{[^}]*\\}`).exec(css);
  if (!bloc) return null;
  const h = /height:\s*(\d+)px/.exec(bloc[0]);
  return h ? Number(h[1]) : null;
}

describe('Bibliothèque — les menus de filtres sont atteignables', () => {
  it('aucun trou entre le chip et son menu', () => {
    const src = source();
    const hChip = hauteur(src, 'chip');
    const dessus = /\.drop \.menu\{[^}]*top:\s*(\d+)px/.exec(src);
    expect(hChip, "la hauteur du chip n'est plus déclarée").not.toBeNull();
    expect(dessus, "la position du menu n'est plus déclarée").not.toBeNull();

    const ecart = Number(dessus![1]) - hChip!;
    if (ecart <= 0) return; // menu collé au chip : rien à combler

    // Un écart doit être PONTÉ, sinon le pointeur quitte `.drop` avant
    // d'atteindre le menu et le survol tombe.
    const pont = /\.drop::after\{[^}]*top:\s*(\d+)px[^}]*height:\s*(\d+)px/.exec(src);
    expect(
      pont,
      `${ecart} px séparent le chip (${hChip}px) du menu (top:${dessus![1]}px) et aucun ` +
        'pont ne les relie : le menu sera visible et inatteignable à la souris.',
    ).not.toBeNull();

    const [, ptTop, ptH] = pont!.map(Number);
    expect(ptTop, 'le pont ne part pas du bas du chip').toBeLessThanOrEqual(hChip!);
    expect(
      ptTop + ptH,
      `le pont s'arrête à ${ptTop + ptH}px, avant le menu (${dessus![1]}px) : il reste un trou.`,
    ).toBeGreaterThanOrEqual(Number(dessus![1]));
  });

  it('les menus s’ouvrent aussi au CLIC, pas seulement au survol', () => {
    const src = source();
    // Sans clic : ni clavier, ni tablette. La géométrie n'y peut rien.
    expect(
      src.includes('.drop.open .menu'),
      "l'ouverture au clic a disparu : le menu redevient inaccessible au clavier et au toucher.",
    ).toBe(true);
    const chips = [...src.matchAll(/<button class="chip"(?![^>]*\bplain\b)[^>]*>/g)].map((m) => m[0]);
    const sansClic = chips.filter((c) => !c.includes('onclick=') && c.includes('aria-haspopup'));
    expect(sansClic, `chip(s) de menu sans onclick : ${sansClic.join(' | ')}`).toEqual([]);
  });

  it('un menu ouvert se referme : choix, clic ailleurs, Échap', () => {
    const src = source();
    for (const [quoi, motif] of [
      ['après un choix', 'ddClose()'],
      ['au clic ailleurs', "closest('.drop')"],
      ['à Échap', "e.key === 'Escape'"],
    ] as const) {
      expect(src.includes(motif), `la fermeture ${quoi} a disparu`).toBe(true);
    }
  });
});

/**
 * Un filtre doit RETIRER, pas atténuer.
 *
 * La maquette atténuait les albums non conformes (opacité 0,22) au lieu de les
 * retirer, pour la stabilité spatiale — un album ne sautait jamais de place.
 * Bertrand, 01/09/2026 : « les filtres doivent renvoyer les albums
 * correspondants aux critères et pas seulement les mettre en surbrillance ».
 *
 * Le changement met aussi fin à une INCOHÉRENCE : la vue groupée retirait déjà
 * (`if (!matches(a)) continue`). Le même filtre se comportait donc de deux
 * façons selon l'onglet.
 */
describe('Bibliothèque — les filtres retirent, ils n’atténuent pas', () => {
  it('la grille et la liste itèrent sur les albums FILTRÉS', () => {
    const src = source();
    expect(
      src.includes('const affiches = $derived(sorted.filter(matches))'),
      'la liste filtrée a disparu.',
    ).toBe(true);
    expect(
      /\{#each sorted as a \(a\.id\)\}/.test(src),
      'une vue itère de nouveau sur TOUS les albums : le filtre ne filtrerait plus.',
    ).toBe(false);
  });

  it('plus aucune atténuation des non-conformes', () => {
    const src = source();
    expect(
      src.includes('class:dim={!matches(a)}'),
      "l'atténuation est revenue : l'album non conforme resterait affiché.",
    ).toBe(false);
    // Et son style ne doit pas survivre en code mort.
    expect(/\.(lrow|card)\.dim\{/.test(src), 'le style d’atténuation subsiste').toBe(false);
  });

  it('le rail A–Z suit ce qui est AFFICHÉ', () => {
    // Sinon il propose des lettres qui ne mènent nulle part : on clique « M »
    // et la vue ne bouge pas, parce qu'aucun album filtré ne commence par M.
    expect(
      source().includes('const present = $derived(new Set(affiches.map(firstLetter)))'),
      'le rail A–Z est recalculé sur la liste complète : il proposerait des lettres vides.',
    ).toBe(true);
  });

  it('un filtre sans résultat le DIT, au lieu d’une page blanche', () => {
    const src = source();
    expect(src.includes('{#if !affiches.length}'), "l'état vide a disparu").toBe(true);
    expect(
      src.includes('library.noAlbumMatchesFilters'),
      'le message d’absence de résultat a disparu : la grille serait vide et muette.',
    ).toBe(true);
  });
});

/**
 * La ligne technique sous les pochettes est un CHOIX, pas une conséquence du
 * niveau d'interface.
 *
 * Elle suivait `showExpert` seul : tout utilisateur au niveau Expert la voyait
 * sous chaque vignette, sans pouvoir l'enlever. Or « Expert » dit ce qu'on sait
 * faire, pas ce qu'on veut voir. Bertrand, 01/09/2026 : un toggle dans les
 * réglages, et par défaut OFF.
 */
describe('Bibliothèque — ligne technique sous les vignettes', () => {
  it('elle dépend du réglage, pas seulement du niveau', () => {
    const src = source();
    expect(
      src.includes("const showTech = $derived(showExpert && $preferences.v2AlbumTechLine)"),
      'la ligne technique ne dépend plus du réglage : elle redevient imposée à tout Expert.',
    ).toBe(true);
    expect(
      /\{#if showExpert\}<(span class="lq"|div class="cq")>\{tech\(a\)\}/.test(src),
      'une vue affiche encore la ligne technique sur le seul niveau Expert.',
    ).toBe(false);
  });

  it('elle reste conditionnée au niveau Expert', () => {
    // Le réglage ne doit pas la faire apparaître à un niveau où elle n'existe
    // pas : `showTech` exige les DEUX.
    expect(source().includes('showExpert && $preferences.v2AlbumTechLine'), 'le niveau n’est plus exigé').toBe(true);
  });
});

describe('Réglages — le toggle de la ligne technique', () => {
  const REGLAGES = fileURLToPath(
    new URL('../../components/v2/SettingsV2.svelte', import.meta.url),
  );
  const prefs = fileURLToPath(new URL('../stores/preferences.ts', import.meta.url));

  it('le défaut est OFF', () => {
    expect(
      /v2AlbumTechLine:\s*false/.test(readFileSync(prefs, 'utf8')),
      'le défaut n’est plus OFF : la ligne technique reviendrait imposée.',
    ).toBe(true);
  });

  it('le toggle existe et n’est offert qu’au niveau Expert', () => {
    const src = readFileSync(REGLAGES, 'utf8');
    const i = src.indexOf('settings.albumTechLine');
    expect(i, 'le toggle a disparu des Réglages').toBeGreaterThan(-1);
    const avant = src.slice(Math.max(0, i - 400), i);
    expect(
      avant.includes("atLeast(level, 'expert')"),
      "le toggle est proposé sous le niveau Expert : il n'aurait aucun effet.",
    ).toBe(true);
    expect(src.includes('v2AlbumTechLine: (e.currentTarget as HTMLInputElement).checked'),
      'le toggle n’écrit plus la préférence').toBe(true);
  });
});
