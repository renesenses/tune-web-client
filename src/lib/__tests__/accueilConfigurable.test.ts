/**
 * Page d'accueil configurable.
 *
 * Chantier ouvert par Bertrand le 02/09/2026 : l'accueil affichait quatre
 * sections figées dans son balisage ; il en veut une page composée par
 * l'utilisateur — ajouter, retirer, réordonner au glisser-déposer, et la
 * disposition rangée PAR PROFIL.
 *
 * ⚠️ Ces tests lisent la SOURCE. Ils tiennent des décisions précises ; ils ne
 * remplacent pas un essai à la souris.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WIDGETS, DISPOSITION_DEFAUT, widgetParId } from '../accueilWidgets';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const ecran = () => lire('../../components/v2/HomeV2.svelte');

describe('Accueil — le registre', () => {
  it('les quatorze widgets demandés sont là', () => {
    // La liste vient mot pour mot de la demande de Bertrand.
    for (const id of [
      'zones', 'reprendre', 'recemment-ajoutes', 'recemment-ecoutes', 'hasard',
      'statistiques', 'nouveautes-artistes', 'nouveau-bibliotheque',
      'autres-versions', 'favoris', 'recommandations', 'radios-artistes',
      'podcasts-abonnements', 'qobuz-selection',
    ]) {
      expect(widgetParId(id), `le widget « ${id} » a disparu du registre`).toBeTruthy();
    }
  });

  it('aucun titre en dur : tous passent par une clé', () => {
    for (const w of WIDGETS) {
      expect(w.cleTitre.startsWith('v2.home.'), `« ${w.id} » n’a pas de clé de traduction`).toBe(true);
    }
  });

  it('tous les widgets sont HORIZONTAUX, sauf les chiffres', () => {
    // Décision de Bertrand : une bande qui défile, pour tous. Mêler grilles et
    // bandes rendrait la hauteur de la page imprévisible.
    for (const w of WIDGETS) {
      expect(['bande', 'chiffres']).toContain(w.forme);
    }
    expect(WIDGETS.filter((w) => w.forme === 'chiffres').map((w) => w.id)).toEqual(['statistiques']);
  });

  it('la disposition par défaut est celle de l’accueil ACTUEL', () => {
    // Personne ne doit voir son écran changer sans l'avoir demandé.
    expect(DISPOSITION_DEFAUT).toEqual([
      'reprendre', 'nouveautes-artistes', 'recemment-ajoutes', 'statistiques',
    ]);
    for (const id of DISPOSITION_DEFAUT) {
      expect(widgetParId(id), `le défaut cite « ${id} », absent du registre`).toBeTruthy();
    }
  });

  it('« au hasard » ne fait AUCUN appel réseau', () => {
    // La bibliothèque est déjà chargée par la coquille : une route « au
    // hasard » ferait payer un aller-retour pour un tirage local.
    const src = lire('../accueilWidgets.ts');
    const i = src.indexOf("id: 'hasard'");
    const bloc = src.slice(i, src.indexOf('},\n  {', i));
    expect(/api\.\w+\(/.test(bloc), '« au hasard » appelle le serveur').toBe(false);
    // Et c'est un vrai tirage sans remise : `sort(() => Math.random() - .5)`
    // n'est pas un mélange, il biaise selon l'algorithme de tri du moteur.
    expect(bloc.includes('splice(Math.floor(Math.random()'), 'le tirage a changé de méthode').toBe(true);
  });
});

describe('Accueil — la configuration', () => {
  it('elle est rangée PAR PROFIL, côté serveur', () => {
    // Choix de Bertrand : chacun sa page, et elle suit d'un appareil à l'autre.
    const src = ecran();
    expect(src.includes('api.getProfilePreferences('), 'la lecture des préférences a disparu').toBe(true);
    expect(src.includes('api.setProfilePreferences('), 'l’écriture a disparu').toBe(true);
    expect(src.includes("const CLE = 'home_widgets'"), 'la clé de rangement a changé').toBe(true);
  });

  it('l’écriture FUSIONNE, elle n’écrase pas', () => {
    // Un écran qui n'envoie que sa clé ne doit pas effacer celles des autres.
    const api = lire('../api.ts');
    const i = api.indexOf('export function setProfilePreferences');
    expect(api.slice(i, i + 300).includes("method: 'PUT'"), 'la méthode a changé').toBe(true);
  });

  it('un identifiant inconnu est IGNORÉ', () => {
    // Un widget retiré du registre laisserait sinon un trou muet dans la page
    // de qui l'avait choisi.
    expect(
      ecran().includes("d.filter((id: any) => typeof id === 'string' && widgetParId(id))"),
      'les identifiants inconnus ne sont plus filtrés.',
    ).toBe(true);
  });

  it('des préférences illisibles ne vident pas la page', () => {
    const src = ecran();
    const i = src.indexOf('async function charger()');
    const bloc = src.slice(i, src.indexOf('\n  }', i));
    expect(bloc.includes('catch'), 'l’échec n’est plus rattrapé').toBe(true);
    expect(/catch\s*\{[^}]*disposition\s*=\s*\[\]/.test(bloc), 'l’échec vide la page').toBe(false);
  });
});

describe('Accueil — le mode édition', () => {
  it('seule la POIGNÉE est déplaçable', () => {
    // Rendre la bande entière `draggable` empêcherait de la faire défiler à la
    // souris, qui est son geste principal.
    const src = ecran();
    const i = src.indexOf('class="poignee"');
    expect(i, 'la poignée a disparu').toBeGreaterThan(-1);
    expect(src.slice(i, i + 400).includes('draggable="true"'), 'la poignée n’est plus déplaçable').toBe(true);
    expect(/class="bande"[^>]*draggable/.test(src), 'la bande entière est devenue déplaçable').toBe(false);
  });

  it('le clavier peut réordonner', () => {
    // Le glisser-déposer n'existe pas au clavier : sans les flèches, qui ne se
    // sert pas d'une souris ne pourrait jamais réordonner sa page.
    const src = ecran();
    expect(src.includes('function auClavier'), 'le déplacement au clavier a disparu').toBe(true);
    expect(src.includes("e.key === 'ArrowUp'"), 'les flèches ne déplacent plus').toBe(true);
    expect(src.includes('tabindex="0"'), 'la poignée n’est plus focalisable').toBe(true);
  });

  it('la cible de dépôt se voit', () => {
    // Sans repère, on lâche à l'aveugle.
    expect(/\.bloc\.cible\{[^}]*border-top-color/.test(ecran()), 'la cible de dépôt n’est plus signalée').toBe(true);
  });

  it('chaque widget se charge SEUL, et son état vit dans UN endroit', () => {
    // Quatorze widgets, jusqu'à quatorze appels : un widget lent ou en panne ne
    // doit pas retenir les autres, et son échec ne doit pas vider la page.
    //
    // 🔴 UN SEUL tableau d'états, muté sur place. Quatre dictionnaires séparés
    // indexés par identifiant laissaient trop de place au doute : les recopies
    // se perdaient entre elles, et même corrigées en écriture directe des
    // widgets restaient figés sur « Chargement… ».
    const src = ecran();
    expect(src.includes('function chargerWidget(id: string)'), 'le chargement par widget a disparu').toBe(true);
    expect(src.includes('let etats = $state<Etat[]>([])'), 'l’état unique a disparu').toBe(true);
    expect(
      /let (contenu|enCours|echecs) = \$state<Record</.test(src),
      'les dictionnaires par identifiant sont revenus : l’état d’un widget peut de nouveau se perdre.',
    ).toBe(false);
    expect(src.includes('v2.home.widgetFailed'), 'l’échec ne se distingue plus d’un widget vide').toBe(true);
  });

  it('AUCUN effet ne lance les chargements', () => {
    // 🔴 C'était la cause de tout : `chargerWidget` ÉCRIT `etats`, et
    // l'affectation `etats = [...etats, e]` le RELISAIT au passage. L'effet qui
    // l'appelait dépendait donc de ce qu'il modifie — Svelte interrompt la
    // boucle, et plus rien ne se charge.
    //
    // J'ai d'abord cru couper le cycle avec un `Set` non réactif pour le garde.
    // Ça ne suffisait pas : la lecture restait dans l'affectation. Trois tours
    // perdus le 02/09/2026.
    const src = ecran();
    // Le chargement suit les GESTES : montage et ajout d'un widget.
    expect(src.includes('function chargerTout()'), 'le lancement explicite a disparu').toBe(true);
    expect(
      /\$effect\(\(\) => \{[^}]*chargerWidget/.test(src),
      'un effet relance les chargements : la boucle de dépendance revient.',
    ).toBe(false);
    // Et l'ajout au tableau ne le RELIT pas.
    expect(src.includes('etats.push({ id,'), 'la mutation sans relecture a disparu').toBe(true);
    expect(
      // Avec le point-virgule : la forme du CODE. Sans lui, la mention dans
      // le commentaire d'explication ferait rougir le garde pour rien.
      src.includes('etats = [...etats, e];'),
      'l’affectation qui relit le tableau est revenue.',
    ).toBe(false);
  });

  it('on n’écrit JAMAIS dans la référence poussée', () => {
    // 🔴 `$state` enveloppe le tableau dans un proxy : `etats.push(objet)` y
    // range une version SUIVIE, tandis que la variable locale pointe encore
    // l'objet BRUT. Muter cette variable ne déclenche aucun rendu — l'écran
    // reste sur « Chargement… » pendant que l'état, lui, a changé.
    //
    // C'est la vraie cause des « Chargement… x4 », après trois correctifs qui
    // visaient ailleurs (02/09/2026).
    const src = ecran();
    expect(src.includes('function majEtat(id: string'), 'l’écriture centralisée a disparu').toBe(true);
    expect(src.includes('majEtat(id, {'), 'l’échec n’écrit plus par `majEtat`').toBe(true);
    expect(
      /\be\.phase\s*=/.test(src),
      'une référence gardée de côté est de nouveau mutée : le rendu ne suivrait pas.',
    ).toBe(false);
  });

  it('une attente ne peut pas être éternelle', () => {
    // Sans limite, une attente ne se distingue pas d'un widget lent. Même
    // remède que sur l'écran Podcasts, où le défaut s'était déjà produit.
    const src = ecran();
    expect(/DELAI_MS\s*=\s*8000/.test(src), 'le délai a disparu ou rallongé').toBe(true);
    expect(src.includes('avecDelai(Promise.resolve(p))'), 'le chargement attend sans limite').toBe(true);
    // Et la RAISON est affichée : « ça a échoué » sans dire pourquoi ne se
    // diagnostique pas.
    expect(src.includes('et.raison'), 'la raison de l’échec n’est plus affichée').toBe(true);
  });

  it('retirer un widget efface son état', () => {
    // Sinon le remettre plus tard n'entraînerait aucun chargement : son état
    // serait toujours là, figé sur ce qu'il contenait.
    expect(
      ecran().includes('etats = etats.filter((e) => e.id !== id);'),
      'l’état survit au retrait : le widget reviendrait figé.',
    ).toBe(true);
  });

  it('une page vidée DIT comment la remplir', () => {
    // Sinon elle se lit comme une panne.
    expect(ecran().includes('v2.home.emptyHint'), 'l’invitation a disparu').toBe(true);
  });
});

/**
 * Les vignettes d'une bande ont toutes la MÊME taille.
 *
 * Un élément de conteneur flexible a `min-width: auto` par défaut : il ne peut
 * pas devenir plus étroit que son contenu. Une pochette de 600 px poussait donc
 * la carte à 600 px malgré `flex-basis: 148px`, et la bande se retrouvait avec
 * des vignettes de tailles toutes différentes — visible sur la capture de
 * Bertrand du 02/09/2026, où Charlie Parker faisait quatre fois la largeur de
 * ses voisines.
 */
describe('Accueil — la taille des vignettes', () => {
  const ecran = () => lire('../../components/v2/HomeV2.svelte');

  it('la carte ne peut pas déborder de sa base', () => {
    const src = ecran();
    const m = /\.carte\{([^}]*)\}/.exec(src);
    expect(m, 'la règle de la carte a disparu').not.toBeNull();
    expect(m![1].includes('min-width:0'), '`min-width: auto` laisserait la pochette pousser la carte').toBe(true);
    expect(m![1].includes('flex:0 0 148px'), 'la base de la carte a changé').toBe(true);
  });

  it('la page ne défile pas horizontalement', () => {
    // Ce sont les BANDES qui défilent, pas l'écran.
    const src = ecran();
    const m = /\.scroll\{([^}]*)\}/.exec(src);
    expect(m![1].includes('min-width:0'), 'la colonne peut de nouveau être poussée').toBe(true);
    expect(m![1].includes('overflow-x:hidden'), 'la page peut de nouveau défiler de travers').toBe(true);
  });
});
