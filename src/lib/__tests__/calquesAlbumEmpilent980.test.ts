/**
 * #980 — tout écran qui ouvre une fiche album en CALQUE doit empiler une entrée
 * d’historique.
 *
 * Fabien, fils 1774 puis 1778 : « quand on clique sur un album → page album, le
 * bouton BACK du navigateur retourne à la page d’accueil » — puis, sur la
 * version suivante, « à l’avant-dernière page consultée ».
 *
 * ## Pourquoi ça arrive
 *
 * Une fiche album est un **calque** : l’ouvrir ne change pas `activeView`, donc
 * `historiqueCoquille` — qui empile sur chaque changement de vue — n’écrit
 * rien. Le Précédent dépile alors l’entrée d’AVANT.
 *
 * ## Ce que cette garde tient, et pourquoi elle vaut plus que le correctif
 *
 * Le défaut n’est pas qu’on ait oublié un écran : c’est que **rien ne pouvait
 * le dire**. Cette garde ÉNUMÈRE les écrans qui montent `AlbumDetailV2` et
 * exige de chacun les trois branchements. Un dixième écran ajouté demain sans
 * eux sera rouge.
 *
 * Trois branchements, et il en faut trois :
 *   • ouvrir empile ;
 *   • le Retour de la fiche referme ET dépile — refermer sans dépiler laisse la
 *     pile un cran plus haut que le chemin parcouru ;
 *   • le Précédent referme le calque — sans quoi il dépile l’entrée et l’écran
 *     reste sur la fiche.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DOSSIER = 'src/components/v2';
const lire = (f: string) => readFileSync(resolve(process.cwd(), DOSSIER, f), 'utf-8');

/**
 * Les écrans qui MONTENT `AlbumDetailV2` — établi en lisant le dossier, jamais
 * recopié : une liste figée ne verrait pas le prochain écran ajouté.
 */
function ecransAvecCalque(): string[] {
  return readdirSync(resolve(process.cwd(), DOSSIER))
    .filter((f) => f.endsWith('.svelte') && f !== 'AlbumDetailV2.svelte')
    .filter((f) => /<AlbumDetailV2\b/.test(lire(f)));
}

/**
 * 🔴 DEUX EXCEPTIONS, et elles sont NOMMÉES — une liste d’exceptions muette
 * serait une garde qui ment.
 *
 * `ShellV2`  — sa fiche album de streaming n’est pas un calque : c’est la VUE
 *              `streamingalbum`, et un changement de vue EST déjà empilé.
 *
 * 🟢 `LibraryV2` A QUITTÉ CETTE LISTE — #1121, campagne du 18/09/2026.
 *
 * Sa dette (« six écrivains de `opened`, dont un asynchrone ») était exactement
 * le point 10 du fil 1829 : « le BACK revient à l’accueil alors qu’il devrait
 * revenir au menu Bibliothèque ». Les six écrivains passent maintenant par
 * quatre portes nommées, et un témoin de COMPORTEMENT
 * (`historiqueAlbumBibliotheque1121.test.ts`) clique une vignette puis appuie
 * sur le Précédent du navigateur. Cette garde-ci reprend donc l’écran.
 */
const EXCEPTIONS: Record<string, string> = {
  'ShellV2.svelte': 'la fiche y est une VUE (streamingalbum), déjà empilée',
  /**
   * 🔴 `ArtistesV2` empile déjà — mais pour sa fiche ARTISTE (#828, #3843), pas
   * pour l'album qui s'ouvre PAR-DESSUS elle. Deux calques imbriqués, et
   * `detailOuvert` est un magasin UNIQUE qui ne porte qu'une clé : brancher le
   * second écraserait le premier, et le Précédent refermerait les deux d'un
   * coup.
   *
   * Le brancher demande une PILE dans `historiqueCoquille`, pas trois lignes
   * ici. C'est un chantier à part, et le laisser sans exception nommée
   * reviendrait à cacher la dette.
   */
  'ArtistesV2.svelte': 'deux calques imbriqués — `detailOuvert` ne porte qu’une clé',
};

describe('#980 — les calques album empilent une entrée', () => {
  it('le dossier en contient bien plusieurs — la garde regarde quelque chose', () => {
    const tous = ecransAvecCalque();
    expect(tous.length, 'aucun écran ne monte AlbumDetailV2 ?').toBeGreaterThanOrEqual(8);
  });

  it('chaque écran concerné empile à l’ouverture', () => {
    const manquants = ecransAvecCalque()
      .filter((f) => !(f in EXCEPTIONS))
      .filter((f) => !lire(f).includes('ouvrirDetail'));
    expect(manquants, `n’empilent rien : ${manquants.join(', ')}`).toEqual([]);
  });

  it('chacun dépile au Retour de la fiche', () => {
    const manquants = ecransAvecCalque()
      .filter((f) => !(f in EXCEPTIONS))
      .filter((f) => !lire(f).includes('fermerDetailEnReculant'));
    expect(manquants, `referment sans dépiler : ${manquants.join(', ')}`).toEqual([]);
  });

  /**
   * 🔴 DEUX FORMES pour le même contrat, et la garde doit voir les deux.
   *
   * La plupart des écrans n’ont qu’UN calque : `$detailOuvert == null` y suffit,
   * puisque toute clé posée est forcément la leur. `LibraryV2` (#1121) coexiste
   * avec le calque de l’onglet Artistes : il compare la clé ATTEINTE à celle
   * qu’il a lui-même empilée. C’est plus strict, pas moins — mais c’est une
   * autre écriture, et une garde qui n’en verrait qu’une repasserait `LibraryV2`
   * en exception muette.
   */
  const REFERME_AU_RETOUR = [
    /\$detailOuvert == null/,       // un seul calque : toute clé est la sienne
    /voulu === cleCalqueEmpilee/,   // LibraryV2 : la clé qu’il a lui-même empilée
  ];

  it('chacun referme son calque quand le Précédent dépile', () => {
    const manquants = ecransAvecCalque()
      .filter((f) => !(f in EXCEPTIONS))
      .filter((f) => !REFERME_AU_RETOUR.some((r) => r.test(lire(f))));
    expect(manquants, `le Précédent n’y referme rien : ${manquants.join(', ')}`).toEqual([]);
  });

  /** On pose la CLÉ, jamais l’objet : `history.state` refuse les proxies Svelte. */
  it('aucun écran ne passe l’album lui-même à `ouvrirDetail`', () => {
    for (const f of ecransAvecCalque()) {
      const src = lire(f);
      for (const m of src.matchAll(/ouvrirDetail\(([^)]*)\)/g)) {
        const arg = m[1].trim();
        expect(arg, `${f} passe « ${arg} » — ce doit être une clé`).toMatch(/cle|`/);
      }
    }
  });

  /** Les exceptions doivent rester VRAIES : une dette réglée doit sortir d’ici. */
  it('les exceptions sont encore justifiées', () => {
    const tous = ecransAvecCalque();
    for (const f of Object.keys(EXCEPTIONS)) {
      expect(tous, `${f} ne monte plus de calque : retirer l’exception`).toContain(f);
    }
    // ShellV2 : sa fiche est bien rendue sous une condition de VUE.
    expect(lire('ShellV2.svelte')).toMatch(/\$activeView === 'streamingalbum'/);
    // LibraryV2 n’est plus une exception (#1121) : elle doit donc rester
    // branchée. Si quelqu’un la débranche, ce sont les trois témoins ci-dessus
    // qui rougissent — on vérifie ici qu’elle est bien DANS le champ balayé.
    expect(tous, 'LibraryV2 ne monte plus de calque album').toContain('LibraryV2.svelte');
    expect(Object.keys(EXCEPTIONS), 'LibraryV2 est redevenue une exception').not.toContain('LibraryV2.svelte');
    // ArtistesV2 : l'exception ne vaut que TANT QUE les deux calques coexistent.
    const art = lire('ArtistesV2.svelte');
    // 🔴 La clé ne s'écrit plus en toutes lettres ici — #1142. Elle vient de
    // `cleDetailArtiste`, partagée avec l'écran qui ENVOIE vers la fiche : deux
    // littéraux dans deux fichiers auraient fini par diverger, et l'entrée
    // composée aurait été doublée par celle de l'écran d'arrivée.
    expect(art, 'ArtistesV2 n’a plus de calque artiste').toMatch(/ouvrirDetail\(cle\)/);
    expect(art, 'ArtistesV2 n’emploie plus la clé partagée').toContain('cleDetailArtiste(a.id)');
    expect(art, 'ArtistesV2 n’a plus de calque album').toMatch(/<AlbumDetailV2\b/);
  });
});
