import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isInnerScrollerWheel, NP_INNER_SCROLLER_SELECTOR } from '../npWheelGesture';

/**
 * Écran « Lecture en cours », fil forum 1619 (Jean Valjean, 0.9.126, Firefox).
 * Deux défauts, deux gardes.
 *
 * ## #2900 — dérouler les paroles à la molette ouvrait la file d'attente
 *
 * Le geste « molette vers le bas ⇒ la file apparaît » est posé sur la racine
 * de la vue (`onwheel={handleNpWheel}`) et ne consultait jamais `e.target`.
 * Le cadre des paroles a son propre `overflow-y: auto` : le `wheel` qu'il
 * reçoit remonte jusqu'à la racine, qui l'accumule et ouvre la file par-dessus
 * le texte. Durcir le seuil retomberait sur le fil 1261 (clic-molette
 * accidentel) : les deux besoins ne se départagent que par la CIBLE.
 *
 * ## #2960 — ouvrir le cadre Paroles faisait perdre le haut de la page
 *
 * `.np-scroll` défile ET centrait son contenu par `align-items: center`.
 * Dès que le contenu dépasse le cadre (l'ouverture des paroles ajoute ~300 px),
 * le débordement se répartit en haut et en bas, et le haut est INATTEIGNABLE :
 * `scrollTop` ne descend pas sous zéro. Le centrage doit passer par une marge
 * automatique sur l'enfant, qui s'efface quand la place manque.
 *
 * Reste en environnement `node` : les gardes sur le composant ne lisent que du
 * texte, et la fonction pure est exercée avec un arbre d'éléments factice.
 */
function lire(chemin: string): string {
  return readFileSync(resolve(process.cwd(), chemin), 'utf-8');
}
const NOW_PLAYING = lire('src/components/NowPlaying.svelte');
const PAROLES = lire('src/components/NowPlayingLyrics.svelte');

interface Regle {
  selecteur: string;
  corps: string;
}

/** Règles `sélecteur { déclarations }` du bloc `<style>` d'un composant. */
function regles(source: string): Regle[] {
  const debut = source.indexOf('<style');
  const css = (debut === -1 ? '' : source.slice(debut)).replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Regle[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    // Un `@media (…) {` laisse traîner son ouverture devant le premier
    // sélecteur de son bloc : on ne garde que la dernière ligne, le sélecteur.
    out.push({ selecteur: m[1].trim().split('\n').pop()!.trim(), corps: m[2] });
  }
  return out;
}

/** Valeur d'une propriété dans un corps de règle, ou `null` si absente. */
function declaration(corps: string, propriete: string): string | null {
  const m = corps.match(new RegExp(`(?:^|;)\\s*${propriete}\\s*:\\s*([^;]+)`));
  return m ? m[1].trim() : null;
}

/** La règle rend-elle son élément défilant verticalement ? */
function defile(corps: string): boolean {
  const y = declaration(corps, 'overflow-y') ?? declaration(corps, 'overflow');
  return y === 'auto' || y === 'scroll';
}

/** Arbre d'éléments factice : juste ce qu'il faut pour `closest(sélecteur)`. */
interface Noeud {
  classes: string[];
  parent: Noeud | null;
  closest(selecteur: string): Noeud | null;
}
function element(classes: string[], parent: Noeud | null = null): Noeud {
  const noeud: Noeud = {
    classes,
    parent,
    closest(selecteur) {
      const voulues = selecteur.split(',').map((s) => s.trim().replace(/^\./, ''));
      for (let n: Noeud | null = noeud; n; n = n.parent) {
        if (n.classes.some((c) => voulues.includes(c))) return n;
      }
      return null;
    },
  };
  return noeud;
}

describe('#2900 — la molette dans un cadre défilant ne révèle pas la file', () => {
  const racine = element(['now-playing']);
  const page = element(['np-scroll'], racine);
  const contenu = element(['content-layout'], page);

  it('un défilement qui agit dans le cadre des paroles est laissé au cadre', () => {
    const paroles = element(['np-lyrics', 'svelte-1abc'], contenu);
    const ligne = element(['lyrics-text'], paroles);
    expect(isInnerScrollerWheel(ligne as unknown as EventTarget)).toBe(true);
  });

  it('un défilement dans les crédits ou la fiche du signal est laissé au cadre', () => {
    const credits = element(['np-credits'], contenu);
    const nom = element(['np-credits-names'], credits);
    expect(isInnerScrollerWheel(nom as unknown as EventTarget)).toBe(true);
    const fiche = element(['signal-path-card'], racine);
    expect(isInnerScrollerWheel(fiche as unknown as EventTarget)).toBe(true);
  });

  it('un défilement sur la pochette ou la page elle-même reste le geste de découverte', () => {
    const pochette = element(['artwork-container'], contenu);
    expect(isInnerScrollerWheel(pochette as unknown as EventTarget)).toBe(false);
    expect(isInnerScrollerWheel(page as unknown as EventTarget)).toBe(false);
  });

  it('une cible absente ou sans `closest` ne bloque pas le geste', () => {
    expect(isInnerScrollerWheel(null)).toBe(false);
    expect(isInnerScrollerWheel({} as EventTarget)).toBe(false);
  });

  it('handleNpWheel consulte la cible AVANT d’accumuler le défilement', () => {
    // Une fonction pure écrite mais jamais appelée ne corrige rien.
    expect(NOW_PLAYING).toMatch(/import \{[^}]*\bisInnerScrollerWheel\b[^}]*\} from '\.\.\/lib\/npWheelGesture'/);
    const debut = NOW_PLAYING.indexOf('function handleNpWheel(');
    expect(debut).toBeGreaterThan(-1);
    const corps = NOW_PLAYING.slice(debut, NOW_PLAYING.indexOf('\n  }\n', debut));
    const garde = corps.indexOf('isInnerScrollerWheel(e.target)');
    const accumulation = corps.indexOf('npWheelAccum += dy');
    expect(garde).toBeGreaterThan(-1);
    expect(accumulation).toBeGreaterThan(-1);
    expect(garde).toBeLessThan(accumulation);
  });

  it('chaque cadre défilant de l’écran est couvert par le sélecteur, et lui seul', () => {
    const couverts = NP_INNER_SCROLLER_SELECTOR.split(',').map((s) => s.trim());
    // `.np-scroll` est le défilement de la PAGE sur un petit écran : c'est
    // précisément celui que le geste doit accompagner, il reste hors liste.
    const cadres = [...regles(NOW_PLAYING), ...regles(PAROLES)]
      .filter((r) => defile(r.corps) && r.selecteur !== '.np-scroll')
      .map((r) => r.selecteur);
    expect(cadres.length).toBeGreaterThan(0);
    for (const cadre of cadres) {
      const classes = [...cadre.matchAll(/\.([\w-]+)/g)].map((m) => `.${m[1]}`);
      expect(classes.some((c) => couverts.includes(c)), `cadre défilant non couvert : ${cadre}`).toBe(true);
    }
    // Une coquille dans la liste rendrait la garde muette : chaque classe
    // listée doit exister dans le balisage de l'écran.
    for (const c of couverts) {
      const classe = c.replace(/^\./, '');
      const dansLeBalisage = new RegExp(`class="[^"]*\\b${classe}\\b`).test(NOW_PLAYING + PAROLES);
      expect(dansLeBalisage, `classe listée introuvable dans le balisage : ${c}`).toBe(true);
    }
  });
});

describe('#2960 — le conteneur qui défile ne centre pas par align-items', () => {
  const npScroll = regles(NOW_PLAYING).find((r) => r.selecteur === '.np-scroll');

  it('.np-scroll défile verticalement', () => {
    expect(npScroll, 'règle .np-scroll introuvable').toBeDefined();
    expect(defile(npScroll!.corps)).toBe(true);
  });

  it('.np-scroll ne centre pas son contenu sur l’axe qui défile', () => {
    const direction = declaration(npScroll!.corps, 'flex-direction') ?? 'row';
    const axeVertical = direction.startsWith('column') ? 'justify-content' : 'align-items';
    const valeur = declaration(npScroll!.corps, axeVertical);
    expect(valeur, `${axeVertical}: center rend le haut inatteignable`).not.toBe('center');
  });

  it('le centrage vertical passe par une marge automatique sur l’enfant', () => {
    const enfant = regles(NOW_PLAYING).find((r) => r.selecteur === '.np-scroll > .content-layout');
    expect(enfant, 'règle .np-scroll > .content-layout introuvable').toBeDefined();
    const marge =
      declaration(enfant!.corps, 'margin-block') ??
      declaration(enfant!.corps, 'margin-top') ??
      declaration(enfant!.corps, 'margin');
    expect(marge ?? '').toMatch(/\bauto\b/);
  });
});
