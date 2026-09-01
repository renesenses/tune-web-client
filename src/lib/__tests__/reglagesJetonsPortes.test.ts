/**
 * La section « Services & Jetons » des Réglages doit SAISIR les jetons, pas
 * renvoyer ailleurs.
 *
 * Elle affichait :
 *
 *   « Leur saisie n'est pas encore reprise dans ce client : elle reste dans
 *     l'écran Services & Jetons du client actuel. »
 *
 * C'était vrai — l'écran existe bel et bien (`ServiceTokensView.svelte`) — mais
 * demander à l'utilisateur de changer de client pour poser un jeton n'est pas
 * une réponse. La section fait désormais le travail elle-même.
 *
 * ## Ce que ce garde protège vraiment
 *
 * Le point critique n'est PAS « le formulaire existe ». C'est que les champs
 * restent **vides à l'affichage**.
 *
 * `get_config` caviarde les secrets côté serveur (`tune_core::secrets`) : le
 * client ne détient jamais la valeur en clair d'un jeton. Un formulaire qui se
 * pré-remplirait avec ce qu'il a reçu réécrirait donc la version MASQUÉE et
 * détruirait le jeton — sans erreur, puisque l'écriture réussirait. C'est une
 * perte de données silencieuse, la pire espèce.
 *
 * Le garde vérifie donc que les tampons de saisie partent de la chaîne vide, et
 * qu'aucun `bind:value` ne s'alimente d'un champ rendu par le serveur.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ECRAN = fileURLToPath(
  new URL('../../components/v2/SettingsV2.svelte', import.meta.url),
);
const source = () => readFileSync(ECRAN, 'utf8');

/**
 * Le source SANS ses commentaires.
 *
 * Vécu à l'écriture de ce test : le commentaire qui explique pourquoi
 * `window.confirm` est banni contient forcément ces mots-là, et un `includes`
 * naïf y voyait un appel. Un garde-fou qui accuse sa propre documentation ne
 * garde rien — il apprend seulement à ne plus rien commenter.
 */
function codeSansCommentaires(): string {
  return source()
    .replace(/<!--[\s\S]*?-->/g, '') // commentaires de balisage
    .replace(/\/\*[\s\S]*?\*\//g, '') // blocs /* … */
    .replace(/^\s*\/\/.*$/gm, ''); // lignes //
}

/** La tranche de la section « tokens », de sa branche à la suivante. */
function sectionJetons(): string {
  const src = source();
  const debut = src.indexOf("s.id === 'tokens'");
  expect(debut, "la branche de la section « tokens » a disparu").toBeGreaterThan(-1);
  const suite = src.indexOf("{:else if s.id ===", debut + 10);
  return src.slice(debut, suite === -1 ? src.length : suite);
}

describe('Réglages — section Services & Jetons', () => {
  it('ne renvoie plus vers le client actuel', () => {
    const sec = sectionJetons();
    for (const motif of ['client actuel', 'pas encore reprise', 'Services &amp; Jetons']) {
      expect(
        sec.includes(motif),
        `la note « ${motif} » est revenue : la section renvoie de nouveau l'utilisateur ailleurs.`,
      ).toBe(false);
    }
  });

  it('saisit réellement les jetons, au lieu de les décrire', () => {
    const sec = sectionJetons();
    for (const attendu of ['stkSave', 'stkEdit', 'sv.fields']) {
      expect(
        sec.includes(attendu),
        `« ${attendu} » absent : la section n'offre plus de saisie.`,
      ).toBe(true);
    }
  });

  it('les champs de saisie partent VIDES — jamais du serveur', () => {
    const src = source();

    // Les tampons sont initialisés à la chaîne vide, champ par champ.
    expect(
      /for \(const f of s\.fields \?\? \[\]\) buf\[s\.id\]\[f\.key\] = '';/.test(src),
      "les tampons de saisie ne sont plus initialisés à vide : un champ pré-rempli " +
        'réécrirait le secret CAVIARDÉ rendu par le serveur et détruirait le jeton.',
    ).toBe(true);

    // Et rien ne les alimente depuis la réponse du serveur.
    const sec = sectionJetons();
    expect(
      /bind:value=\{[^}]*\b(sv|s)\.(value|token|secret|fields\[[^\]]*\]\.value)/.test(sec),
      "un `bind:value` s'alimente d'une valeur rendue par le serveur : elle est " +
        'caviardée, l\'enregistrer écraserait le jeton réel.',
    ).toBe(false);
  });

  it('la suppression passe par une confirmation EN PAGE', () => {
    // Un effacement de jeton sans confirmation est une fausse manœuvre à un
    // clic ; et le dialogue natif est banni par check-native-dialogs.mjs.
    const code = codeSansCommentaires();
    expect(code.includes('dialogs.confirm('), 'confirmation en page absente').toBe(true);
    expect(code.includes('window.confirm'), 'dialogue natif interdit').toBe(false);
  });

  it('un envoi vide est refusé plutôt qu’exécuté', () => {
    // Envoyer des champs vides effacerait le jeton en place. La section doit
    // refuser, pas « réussir » en détruisant.
    expect(
      source().includes("Object.values(data).every((v) => !v?.trim())"),
      'le garde-fou contre un envoi vide a disparu : il effacerait le jeton en place.',
    ).toBe(true);
  });
});
