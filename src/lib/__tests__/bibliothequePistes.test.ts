/**
 * « Bibliothèque Pistes : affichage dès le début du chargement du nb de
 *  pistes ; loupe sur la cover au survol de la souris ; associer CTA modale
 *  album (transformé pour piste) » (Bertrand, 06/09/2026).
 *
 * Trois défauts d'un même écran :
 *
 *  1. `getAllTracks()` met plusieurs secondes sur 46 877 titres (mesuré sur le
 *     .18). Pendant tout ce temps le compteur annonçait « 0 titres » — un
 *     écran qui annonce zéro pendant qu'il charge se lit comme une
 *     bibliothèque vide.
 *  2. La pochette était décorative : on voyait l'album sans pouvoir l'ouvrir.
 *  3. Il fallait retourner à l'onglet Albums et l'y retrouver à la main.
 *
 * ⚠️ La loupe est un BOUTON. La pochette vivait dans le bouton de lecture ;
 * un bouton dans un bouton est du balisage invalide — c'est le piège récurrent
 * de ce client. Elle en sort, et les colonnes de la ligne deviennent donc
 * calculées, sans quoi le `1fr` se poserait sur la mauvaise colonne dès qu'un
 * numéro ou une pochette manque (le défaut d'alignement du 05/09).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('le compteur de pistes', () => {
  const src = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));

  it("part des statistiques du serveur, pas de la liste vide", () => {
    expect(src).toContain('api.getLibraryStats()');
    expect(src).toMatch(/nbPistesServeur = st\?\.tracks \?\? null/);
  });

  it("le total du serveur ne sert QUE pendant le chargement", () => {
    // Une fois la liste là, c'est elle qui fait foi : un total et une liste
    // qui ne coïncident pas seraient pires que l'attente.
    expect(src).toMatch(
      /nbPistesAnnonce = \$derived\(\s*tracksLoading && nbPistesServeur != null \? nbPistesServeur : tracks\.length,?\s*\)/,
    );
  });

  it("c'est bien lui que la puce affiche", () => {
    expect(src).toMatch(/trackCount[\s\S]{0,80}\$formatNombre\(nbPistesAnnonce\)/);
    expect(src, "la puce ne doit plus lire la liste directement").not.toMatch(
      /trackCount[\s\S]{0,80}\$formatNombre\(tracks\.length\)/,
    );
  });

  it("un dépôt distant ne se voit pas prêter le total LOCAL", () => {
    // ⚠️ Cette garde est TEXTUELLE, et elle exigeait littéralement `if (!d)`.
    // La condition en porte une seconde depuis #3101 : sous une PORTÉE de
    // répertoire, le total du serveur porte sur toute la bibliothèque et ne
    // doit pas davantage être prêté à l'écran. Le témoin de COMPORTEMENT de
    // cette seconde moitié est dans `porteeRepertoireV2_3101.test.ts` (« la
    // puce ne prête pas le total du serveur sous une portée ») ; ici on garde
    // la seule chose que le texte prouve — que la condition existe encore.
    expect(src).toMatch(/if \(!d && !portee\) api\.getLibraryStats\(\)/);
  });
});

describe('la loupe sur la pochette', () => {
  const brut = lire('src/components/v2/LignePisteV2.svelte');
  const src = sansCommentaires(brut);

  it('existe, et seulement quand il y a un album à ouvrir', () => {
    expect(src).toContain('{#if onOuvrirAlbum}');
    expect(src).toContain('class="loupe"');
  });

  it("🔴 la pochette est SŒUR du bouton de lecture, jamais dedans", () => {
    // Un bouton dans un bouton est du balisage invalide — le piège récurrent
    // de ce client. La garde lit l'ORDRE : le bouton de pochette doit se
    // fermer avant que celui de lecture s'ouvre.
    const finPochette = src.indexOf('</button>', src.indexOf('class="cvsm cvbtn"'));
    const debutLecture = src.indexOf('<button class="tclick"');
    expect(finPochette).toBeGreaterThan(-1);
    expect(debutLecture).toBeGreaterThan(finPochette);
  });

  it('les colonnes sont CALCULÉES, pas figées', () => {
    // Sinon le `1fr` se pose sur la mauvaise colonne dès qu'un numéro ou une
    // pochette manque : le défaut d'alignement du 05/09, une ligne plus bas.
    expect(src).toMatch(/const colonnes = \$derived\(/);
    expect(src).toContain('style="--tcols:{colonnes}"');
    expect(src).toContain('grid-template-columns:var(--tcols,');
  });

  it("elle est atteignable au CLAVIER, pas seulement à la souris", () => {
    expect(src).toContain('.cvbtn:hover .loupe, .cvbtn:focus-visible .loupe');
    expect(src).toContain('.cvbtn:focus-visible{outline:');
  });

  it('elle est nommée, pas muette', () => {
    expect(src).toContain("aria-label={$t('v2.lib.openAlbum' as any)}");
  });

  it('le mouvement se coupe si le système le demande', () => {
    expect(src).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it("sans album, la pochette reste un simple conteneur", () => {
    expect(src).toContain('{:else}\n      <span class="cvsm">');
  });
});

describe("l'ouverture depuis l'onglet Titres", () => {
  const src = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));

  it("rouvre l'ALBUM chargé, pas un objet reconstruit depuis la piste", () => {
    // La fiche lit `cover_path`, `format`, `sample_rate`, l'année : une piste
    // ne les porte pas tous, et la fiche s'ouvrirait amputée.
    expect(src).toMatch(/function albumDeLaPiste\(t: Track\): Album \| null/);
    expect(src).toMatch(/\$albums\.find\(\(a\) => a\.id === aid\) \?\? null/);
  });

  it('pas de loupe sans album correspondant', () => {
    expect(src).toMatch(/if \(aid == null \|\| depot\) return null/);
    // 🔴 RÉORIENTÉE le 07/09/2026. La liste passe par `ListePistesV2`, et
    // `ouvertureAlbum` est une FABRIQUE : seule la Bibliothèque sait si
    // l'album de CETTE piste est chargé. Ce qu'on protège est identique — la
    // loupe n'apparaît pas là où elle ne pourrait rien ouvrir.
    expect(src).toMatch(/ouvertureAlbum=\{\(p\) => \{/);
    expect(src).toMatch(/return alb \? \(\) => \(opened = alb\) : null;/);
  });
});
