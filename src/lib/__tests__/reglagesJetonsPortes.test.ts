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

/**
 * Le menu avatar ne doit jamais être un état sans issue.
 *
 * Il savait dire « non connecté » et retirait « Se déconnecter » — proposer de
 * quitter une session inexistante aurait menti. Mais il n'offrait AUCUN moyen
 * d'entrer : l'utilisateur lisait son statut et ne pouvait rien en faire.
 *
 * Relevé par Bertrand en regardant l'écran tourner — « où se trouve le bouton
 * se connecter ? ». Aucun test ne pouvait le voir : rien n'était cassé, il
 * manquait simplement une porte.
 */
describe('Menu avatar — entrer et sortir', () => {
  const AVATAR = fileURLToPath(
    new URL('../../components/v2/AvatarMenu.svelte', import.meta.url),
  );
  const menu = () =>
    readFileSync(AVATAR, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('offre les DEUX chemins : se connecter et se déconnecter', () => {
    const src = menu();
    expect(src.includes("$t('settings.signIn')"), 'aucun moyen de se connecter').toBe(true);
    expect(src.includes("$t('settings.signOut')"), 'aucun moyen de se déconnecter').toBe(true);
  });

  it('chaque chemin ne s’affiche que quand il a un sens', () => {
    const src = menu();
    expect(
      src.includes('{#if !ssoConnected && ssoConfigured}'),
      "« Se connecter » n'est plus conditionné : il apparaîtrait alors qu'une session " +
        "est ouverte, ou sur un serveur où le nuage n'existe pas.",
    ).toBe(true);
    expect(
      src.includes('{#if ssoConnected}'),
      '« Se déconnecter » n\'est plus conditionné : il proposerait de quitter une ' +
        'session inexistante.',
    ).toBe(true);
  });

  it('le drapeau de retour est posé AVANT la redirection', () => {
    // Le serveur redirige vers « / » sans indicateur : sans drapeau posé avant
    // le départ, l'application ne sait pas d'où l'utilisateur revient.
    const src = menu();
    const drapeau = src.indexOf("localStorage.setItem('tune_sso_pending'");
    const depart = src.indexOf("window.location.href = '/api/v1/cloud/sso/authorize'");
    expect(drapeau, 'le drapeau de retour a disparu').toBeGreaterThan(-1);
    expect(drapeau, 'le drapeau est posé APRÈS le départ : il ne sera jamais écrit').toBeLessThan(depart);
  });

  it('serveur injoignable : on ne propose pas d’entrer', () => {
    // Statut illisible = on ignore si le nuage existe. Proposer « Se connecter »
    // mènerait à une page d'autorisation inexistante.
    expect(
      /catch \{[\s\S]*?ssoConfigured = false;/.test(menu()),
      "l'échec de lecture ne remet plus `ssoConfigured` à false : le menu proposerait " +
        "de se connecter à un nuage dont il ne sait rien.",
    ).toBe(true);
  });
});

/**
 * La photo du compte doit être SUR le bouton, pas seulement dans le menu ouvert.
 *
 * Premier jet : je l'affichais dans l'en-tête du menu, donc uniquement une fois
 * le menu déplié. Le bouton rond — la seule chose visible en permanence —
 * restait un dégradé. Relevé par Bertrand : « je veux voir ma photo dans la
 * zone avatar ». C'est le second manque que seul le regard a trouvé, après le
 * bouton « Se connecter ».
 */
describe('Menu avatar — la photo du compte', () => {
  const AVATAR = fileURLToPath(
    new URL('../../components/v2/AvatarMenu.svelte', import.meta.url),
  );
  const menu = () =>
    readFileSync(AVATAR, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('la photo est portée par le BOUTON, visible menu fermé', () => {
    const src = menu();
    const bouton = src.indexOf('<button class="avatar"');
    const finBouton = src.indexOf('</button>', bouton);
    expect(bouton, 'le bouton avatar a disparu').toBeGreaterThan(-1);
    expect(
      src.slice(bouton, finBouton).includes('ssoAvatar'),
      'la photo n’est plus sur le bouton : elle ne se verrait qu’une fois le menu ouvert, ' +
        'alors que le bouton est la seule chose visible en permanence.',
    ).toBe(true);
  });

  it('le statut est lu au MONTAGE, sinon le bouton n’a rien à afficher', () => {
    // La photo doit être connue avant toute ouverture du menu.
    expect(
      /onMount\(\(\) => \{\s*void loadSso\(\);/.test(menu()),
      'le statut n’est plus lu au montage : le bouton resterait un dégradé jusqu’à ' +
        'la première ouverture du menu.',
    ).toBe(true);
  });

  it('une photo injoignable retombe sur le dégradé', () => {
    // Hébergeur muet, fichier supprimé : sans ce repli, il resterait un rond
    // vide — pire que pas de photo.
    expect(
      menu().includes("onerror={() => (ssoAvatar = '')}"),
      'le repli sur échec de chargement a disparu : une photo morte laisserait un rond vide.',
    ).toBe(true);
  });

  it('l’URL du serveur ne passe pas par du CSS', () => {
    // Elle vient du serveur. Dans `background-image:url(…)`, une valeur mal
    // formée s’échappe hors de la parenthèse ; un `<img src>` ne peut porter
    // qu’une source.
    expect(
      /background-image[^;]*ssoAvatar/.test(menu()),
      'l’URL de la photo est injectée dans du CSS : passer par `<img src>`.',
    ).toBe(false);
  });
});
