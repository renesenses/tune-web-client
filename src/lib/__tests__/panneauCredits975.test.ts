/**
 * #975 — le panneau « Crédits » s’ouvrait en LAMELLE, illisible.
 *
 * Deux testeurs, le 13/09/2026, indépendamment l’un de l’autre :
 *
 *   Fabien (fil « v0.9.147 : v1 divers bugs », point 16) — « Quand j’ai cliqué
 *   sur la boite "Crédits", une nouvelle boite À CÔTÉ de crédits est apparue
 *   mais trop peu large et est donc illisible. »
 *
 *   Alex Campbell, capture à l’appui — « When clicking on Credits it opens an
 *   unmanageable window. » Sa capture montre, entre les boutons « Credits » et
 *   « Lyrics », une bande où « ARTIST / F.S. Blumm / Nils Frahm » se lit une
 *   lettre à la fois.
 *
 * ## La cause
 *
 * `.np-extra-btns` est une RANGÉE flex (`display:flex`, sans `flex-wrap`). Le
 * panneau y était rendu entre le bouton « Crédits » et le bouton « Paroles » :
 * un item flex comme les six boutons voisins, que `flex-shrink: 1` réduit à la
 * place qui reste.
 *
 * ## La règle que cette garde tient
 *
 * **Les BOUTONS dans la rangée, les PANNEAUX sous elle.** Elle était déjà
 * tenue par `np-alarm-panel` et par `.np-lyrics` — c’est d’ailleurs pourquoi
 * les paroles, elles, s’affichaient correctement. Les crédits étaient la seule
 * exception.
 *
 * ## Ce qu’elle ne tient PAS
 *
 * La largeur RÉELLE du panneau une fois sorti. Une garde de source ne mesure
 * pas un écran ; elle empêche seulement le panneau de retomber dans la rangée.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = () =>
  readFileSync(resolve(process.cwd(), 'src/components/NowPlaying.svelte'), 'utf-8');

/**
 * Les bornes de la rangée `.np-extra-btns` — de son `<div>` à son `</div>`,
 * repéré par l’indentation, comme le ferait l’œil.
 */
function bornesDeLaRangee(texte: string): [number, number] {
  const lignes = texte.split('\n');
  const debut = lignes.findIndex((l) => l.includes('class="np-extra-btns"'));
  expect(debut, 'la rangée .np-extra-btns a disparu').toBeGreaterThan(-1);
  const marge = lignes[debut].length - lignes[debut].trimStart().length;
  let fin = -1;
  for (let i = debut + 1; i < lignes.length; i++) {
    const l = lignes[i];
    if (l.trim() === '</div>' && l.length - l.trimStart().length === marge) { fin = i; break; }
  }
  expect(fin, 'la rangée ne se referme pas').toBeGreaterThan(debut);
  return [debut, fin];
}

/** Les classes rendues entre deux lignes, boutons exclus. */
function panneauxEntre(texte: string, a: number, b: number): string[] {
  const lignes = texte.split('\n').slice(a, b + 1);
  const trouves: string[] = [];
  for (const l of lignes) {
    for (const m of l.matchAll(/class="(np-[a-z-]+)"/g)) {
      const c = m[1];
      if (!c.includes('btn') && !trouves.includes(c)) trouves.push(c);
    }
  }
  return trouves;
}

describe('#975 — les boutons dans la rangée, les panneaux sous elle', () => {
  /** 🔴 LE DÉFAUT LUI-MÊME. */
  it('le panneau des crédits n’est PLUS dans la rangée de boutons', () => {
    const t = src();
    const [a, b] = bornesDeLaRangee(t);
    const dedans = panneauxEntre(t, a, b);
    expect(dedans).not.toContain('np-credits');
    expect(dedans).not.toContain('np-credits-empty');
  });

  it('il est rendu APRÈS elle, comme le panneau du réveil', () => {
    const t = src();
    const [, b] = bornesDeLaRangee(t);
    const apres = t.split('\n').slice(b + 1).join('\n');
    expect(apres).toContain('class="np-credits"');
    expect(apres).toContain('class="np-alarm-panel"');
  });

  /**
   * 🔴 Le piège du déplacement : le bloc vivait DANS
   * `{#if !isRadio && normalizedTrack?.id != null}`. L’en sortir sans reprendre
   * cette condition afficherait des crédits sur une radio — qui n’a pas
   * d’identifiant de bibliothèque, et pour laquelle `getTrackCredits` n’a rien
   * à demander.
   */
  it('la condition de piste a été REPRISE avec lui', () => {
    const t = src();
    const [, b] = bornesDeLaRangee(t);
    const apres = t.split('\n').slice(b + 1).join('\n');
    const i = apres.indexOf('class="np-credits"');
    const garde = apres.lastIndexOf('{#if showCredits', i);
    expect(garde, 'le panneau n’est plus gardé par showCredits').toBeGreaterThan(-1);
    const ligne = apres.slice(garde, apres.indexOf('}', garde) + 1);
    expect(ligne).toContain('!isRadio');
    expect(ligne).toContain('normalizedTrack?.id != null');
  });

  it('la rangée reste une rangée — on n’a pas déplacé le problème', () => {
    const t = src();
    const i = t.indexOf('.np-extra-btns {');
    expect(i).toBeGreaterThan(-1);
    const regle = t.slice(i, t.indexOf('}', i));
    expect(regle).toContain('display: flex');
  });

  /**
   * Contre-épreuve du DÉTECTEUR : sur un texte où le panneau EST dans la
   * rangée, `panneauxEntre` doit le voir. Sans ce cas, la garde pourrait être
   * verte parce qu’elle ne regarde rien.
   */
  it('le détecteur voit bien un panneau resté dans la rangée', () => {
    const temoin = [
      '          <div class="np-extra-btns">',
      '            <button class="np-credits-btn">Crédits</button>',
      '            <div class="np-credits">…</div>',
      '          </div>',
    ].join('\n');
    const lignes = temoin.split('\n');
    const debut = lignes.findIndex((l) => l.includes('class="np-extra-btns"'));
    const fin = lignes.length - 1;
    expect(panneauxEntre(temoin, debut, fin)).toContain('np-credits');
  });
});
