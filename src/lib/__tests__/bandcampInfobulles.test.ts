import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Bandcamp : un texte coupé doit pouvoir se lire au survol.
 *
 * Signalement de Bilou (forum, fil 1547) : « Il serait cohérent, comme pour la
 * bibliothèque locale, ou Qobuz, que les titres (albums / Artistes) soient
 * affichés complets en survol de souris pour la bibliothèque Bandcamp. »
 *
 * Le contrat que respectent déjà la bibliothèque locale et Qobuz est simple :
 * un texte que le CSS tronque porte un `title=` avec sa valeur entière. Il n'y
 * avait AUCUN `title=` sur un texte dans cet écran.
 *
 * Ce test ne liste pas les six `span` fautifs du jour : il rejoue le contrat.
 * Il lit les règles de troncature du `<style>` du composant, en déduit les
 * classes concernées, puis exige un `title=` sur chaque élément qui les porte.
 * Une SEPTIÈME vue Bandcamp écrite demain avec `text-overflow: ellipsis` et
 * sans infobulle échouera ici — c'est précisément la garde qui manquait.
 */

const CHEMIN = resolve(__dirname, '../../components/BandcampView.svelte');
const SOURCE = readFileSync(CHEMIN, 'utf8');

const DEBUT_STYLE = SOURCE.indexOf('<style>');
const MARQUAGE = DEBUT_STYLE === -1 ? SOURCE : SOURCE.slice(0, DEBUT_STYLE);
const STYLE =
  DEBUT_STYLE === -1 ? '' : SOURCE.slice(DEBUT_STYLE, SOURCE.indexOf('</style>'));

/**
 * Les classes que le CSS du composant tronque — par points de suspension ou
 * par `line-clamp`. Lues, jamais recopiées : renommer `.bc-v-titre` ne doit pas
 * désarmer la garde en silence.
 */
function classesTronquees(): Set<string> {
  const sansCommentaires = STYLE.replace(/\/\*[\s\S]*?\*\//g, '');
  const classes = new Set<string>();
  for (const regle of sansCommentaires.split('}')) {
    const accolade = regle.indexOf('{');
    if (accolade === -1) continue;
    const selecteur = regle.slice(0, accolade);
    const corps = regle.slice(accolade + 1);
    const tronque =
      /text-overflow\s*:\s*ellipsis/.test(corps) || /line-clamp\s*:/.test(corps);
    if (!tronque) continue;
    for (const [, nom] of selecteur.matchAll(/\.([\w-]+)/g)) classes.add(nom);
  }
  return classes;
}

/**
 * Les balises ouvrantes du marquage, avec leurs attributs bruts.
 *
 * Un simple `/<[^>]*>/` ne suffit PAS ici : `onclick={() => ouvrir_album(...)}`
 * contient un `>` dans sa flèche, et la balise serait coupée en deux. On suit
 * donc la profondeur d'accolade et les chaînes.
 */
function balisesOuvrantes(markup: string): { ligne: number; tag: string; attrs: string }[] {
  const sorties: { ligne: number; tag: string; attrs: string }[] = [];
  let i = 0;
  while (i < markup.length) {
    const lt = markup.indexOf('<', i);
    if (lt === -1) break;
    const nom = /^<([a-zA-Z][\w-]*)/.exec(markup.slice(lt, lt + 48));
    if (!nom) {
      i = lt + 1;
      continue;
    }
    let j = lt + nom[0].length;
    let accolades = 0;
    let guillemet: string | null = null;
    while (j < markup.length) {
      const c = markup[j];
      if (guillemet) {
        if (c === guillemet) guillemet = null;
      } else if (c === '"' || c === "'") {
        guillemet = c;
      } else if (c === '{') {
        accolades++;
      } else if (c === '}') {
        accolades--;
      } else if (c === '>' && accolades === 0) {
        break;
      }
      j++;
    }
    sorties.push({
      ligne: markup.slice(0, lt).split('\n').length,
      tag: nom[1],
      attrs: markup.slice(lt + nom[0].length, j),
    });
    i = j + 1;
  }
  return sorties;
}

function classesDe(attrs: string): string[] {
  const m = /(?:^|\s)class="([^"]*)"/.exec(attrs);
  return m ? m[1].split(/\s+/).filter(Boolean) : [];
}

const TRONQUEES = classesTronquees();
const BALISES = balisesOuvrantes(MARQUAGE);

describe('Bandcamp — infobulle sur les textes tronqués', () => {
  it('le composant tronque bien du texte (sinon ce test ne garde rien)', () => {
    // Contre-épreuve du test lui-même : si la lecture du CSS retournait un
    // ensemble vide, tous les cas suivants passeraient sans rien vérifier.
    expect(
      TRONQUEES.size,
      "aucune règle de troncature lue dans le <style> — le lecteur de CSS est cassé, pas l'écran",
    ).toBeGreaterThan(0);
    expect([...TRONQUEES].sort()).toContain('bc-v-titre');
    expect([...TRONQUEES].sort()).toContain('bc-v-artiste');
    expect([...TRONQUEES].sort()).toContain('bc-p-titre');
  });

  it('chaque élément tronqué porte un title=', () => {
    const nus: string[] = [];
    for (const b of BALISES) {
      const coupables = classesDe(b.attrs).filter((c) => TRONQUEES.has(c));
      if (coupables.length === 0) continue;
      if (/(?:^|\s)title=/.test(b.attrs)) continue;
      nus.push(`ligne ${b.ligne} : <${b.tag} class="${coupables.join(' ')}"> sans title=`);
    }
    expect(
      nus,
      `BandcampView.svelte coupe du texte sans donner de recours au survol :\n  ${nus.join('\n  ')}`,
    ).toEqual([]);
  });

  it('les quatre vues signalées sont couvertes', () => {
    // Bilou a nommé trois vues (grille découvertes, recherche, discographie
    // d'un artiste) ; la quatrième — la liste de pistes d'un album ouvert —
    // est atteinte par un autre balisage et n'avait pas été observée.
    // On exige la présence des quatre rendus, pour qu'un test « 0 élément nu »
    // ne puisse pas devenir vrai en supprimant les vues.
    const vignettes = BALISES.filter((b) => classesDe(b.attrs).includes('bc-v-titre'));
    expect(vignettes.length, 'les trois vignettes de titre d’album ont bougé').toBe(3);

    const artistes = BALISES.filter((b) => classesDe(b.attrs).includes('bc-v-artiste'));
    expect(artistes.length, 'les vignettes de nom d’artiste ont bougé').toBe(2);

    const pistes = BALISES.filter((b) => classesDe(b.attrs).includes('bc-p-titre'));
    expect(pistes.length, 'la liste de pistes d’un album ouvert a bougé').toBe(1);
  });

  it("le title= porte la valeur affichée, pas un libellé statique", () => {
    // Une infobulle « Album » sur un titre coupé ne servirait à rien : ce que
    // Bilou veut lire, c'est le texte entier. On exige donc que l'expression
    // du `title=` soit celle du contenu de l'élément.
    const paires: { ligne: number; titre: string; contenu: string }[] = [];
    const motif =
      /<span\s+class="(bc-v-titre|bc-v-artiste|bc-p-titre)"\s+title=\{([^}]+)\}>\{([^}]+)\}<\/span>/g;
    for (const m of MARQUAGE.matchAll(motif)) {
      paires.push({
        ligne: MARQUAGE.slice(0, m.index).split('\n').length,
        titre: m[2].trim(),
        contenu: m[3].trim(),
      });
    }
    expect(paires.length, 'aucun span tronqué ne suit la forme title={x}>{x}').toBe(6);
    for (const p of paires) {
      expect(
        p.titre,
        `ligne ${p.ligne} : le title= (${p.titre}) ne reprend pas le texte affiché (${p.contenu})`,
      ).toBe(p.contenu);
    }
  });
});
