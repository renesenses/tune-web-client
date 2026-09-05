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
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WIDGETS, DISPOSITION_DEFAUT, widgetParId, geste } from '../accueilWidgets';
import * as api from '../api';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
// La page a widgets est desormais GENERIQUE : l'accueil et les ecrans
// editoriaux Qobuz/Tidal l'instancient avec leur propre catalogue. Ces gardes
// tiennent le MECANISME, donc elles lisent le composant generique.
const ecran = () => lire('../../components/v2/PageWidgets.svelte');

describe('Accueil — le registre', () => {
  it('les vingt et un widgets sont là', () => {
    // La liste vient mot pour mot de la demande de Bertrand.
    for (const id of [
      'zones', 'reprendre', 'recemment-ajoutes', 'recemment-ecoutes', 'hasard',
      'statistiques', 'nouveautes-artistes', 'nouveau-bibliotheque',
      'autres-versions', 'favoris', 'recommandations', 'radios-artistes',
      'podcasts-abonnements', 'qobuz-selection',
      // Les sept sections ÉDITORIALES de Qobuz, ajoutées le 02/09/2026 :
      // c'est le contenu que Bertrand jugeait « plus étoffé sur la version
      // actuelle ». Il existait côté serveur ; aucun écran du nouveau client
      // ne le montrait.
      'qobuz-nouveautes', 'qobuz-ventes', 'qobuz-presse', 'qobuz-choix',
      'qobuz-ecoutes', 'qobuz-discotheque', 'qobuz-qobuzissimes',
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
    // La clé est désormais un PARAMÈTRE — une par page, sans quoi composer
    // l'écran Qobuz déferait l'accueil. Celle de l'accueil reste le défaut.
    expect(src.includes("cle: CLE = 'home_widgets'"), 'la clé de rangement a changé').toBe(true);
    // L'accueil n'ajoute AUCUN catalogue, AUCUNE disposition, AUCUNE clé : il
    // prend les défauts de la page générique. `salut` est la seule exception,
    // et elle ne touche pas au rangement — c'est le bandeau qui salue.
    const home = lire('../../components/v2/HomeV2.svelte');
    const balise = /<PageWidgets([^>]*)\/>/.exec(home);
    expect(balise, 'l’accueil n’instancie plus la page générique').not.toBeNull();
    expect(
      balise![1].trim().replace(/\bsalut\b/, '').trim(),
      'l’accueil passe des réglages au lieu de prendre les défauts',
    ).toBe('');
  });

  it('l’écriture FUSIONNE, elle n’écrase pas', () => {
    // Un écran qui n'envoie que sa clé ne doit pas effacer celles des autres.
    //
    // 🔴 Ce garde était un FAUX VERT : il vérifiait `method: 'PUT'` sur une
    // route — `/profiles/{id}/preferences` — qui n'existe pas côté serveur.
    // Il tenait donc sur la seule source du client, et rien n'était jamais
    // enregistré (Bertrand, 05/09/2026).
    //
    // Mesuré sur le .18 : POST /profiles/{id}/settings REMPLACE l'objet
    // entier. La fusion doit donc être faite par le client, en relisant avant
    // d'écrire — c'est ce que le garde vérifie désormais.
    const api = lire('../api.ts');
    const i = api.indexOf('export async function setProfilePreferences');
    expect(i, 'setProfilePreferences a disparu').toBeGreaterThan(-1);
    const corps = api.slice(i, i + 900);
    expect(corps.includes('/settings`'), 'la route n’est pas /settings').toBe(true);
    expect(corps.includes('/preferences`'), 'la route inexistante est revenue').toBe(false);
    expect(corps.includes("method: 'POST'"), 'la méthode n’est pas POST').toBe(true);
    expect(corps.includes('await getProfilePreferences(profileId)'), 'on n’relit plus avant d’écrire').toBe(true);
    expect(corps.includes('{ ...actuel, ...patch }'), 'la fusion a disparu').toBe(true);
  });

  it('la LECTURE vise elle aussi /settings', () => {
    const api = lire('../api.ts');
    const i = api.indexOf('export function getProfilePreferences');
    expect(api.slice(i, i + 200).includes('/settings`'), 'la lecture vise encore /preferences').toBe(true);
  });

  it('un identifiant inconnu est IGNORÉ', () => {
    // Un widget retiré du registre laisserait sinon un trou muet dans la page
    // de qui l'avait choisi.
    expect(
      ecran().includes("d.filter((id: any) => typeof id === 'string' && parId(id))"),
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
  const ecran = () => lire('../../components/v2/PageWidgets.svelte');

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

/**
 * Les clés de liste des widgets.
 *
 * 🔴 Deux plantages le 02/09/2026, dans deux écrans différents, pour la même
 * raison : une clé tirée de l'identifiant de la SOURCE.
 *
 *  - podcasts : `feed_url: ''` sur les cinquante entrées du palmarès ;
 *  - accueil  : `id: 0` sur deux entrées de « Reprendre l'écoute », que
 *    `champ()` rendait fidèlement comme « 0 » — d'où `rep0` en double aux
 *    index 0 et 2, et l'écran entier qui disparaît sur `each_key_duplicate`.
 *
 * Quatorze sources, quatorze occasions de se tromper. L'index, lui, est unique
 * par construction.
 */
describe('Accueil — les clés de liste', () => {
  const reg = () => lire('../accueilWidgets.ts');

  it('l’index fait TOUJOURS partie de la clé', () => {
    expect(
      reg().includes('id: `${prefixe}${i}-${id}`'),
      'la clé ne porte plus l’index : deux objets de même identifiant la partageraient.',
    ).toBe(true);
  });

  it('une entrée sans titre ni pochette est écartée', () => {
    // `/home/continue-listening` en rend deux sur cinq. Affichées, ce sont des
    // cases grises marquées « — » au milieu des vraies.
    const src = reg();
    expect(src.includes('const utiles = (els: Element[])'), 'le filtre a disparu').toBe(true);
    // Et il s'applique à TOUS les chargeurs de bande, pas à quelques-uns.
    const bandes = (src.match(/forme: 'bande'/g) ?? []).length;
    // Pas de `-1` : la définition s'écrit `const utiles = (`, qui ne
    // correspond pas au motif `utiles(`. Ma première version la retranchait
    // quand même, et le garde rougissait sur un décompte juste.
    const filtres = (src.match(/utiles\(/g) ?? []).length;
    expect(filtres, `${bandes} bandes, ${filtres} filtrées`).toBeGreaterThanOrEqual(bandes);
  });
});

/**
 * Chaque source a SA forme — et trois d'entre elles ne sont pas des albums.
 *
 * Vérifiées une par une sur le serveur de Bertrand le 02/09/2026, après que
 * « Nouveautés de vos artistes » se fut affiché vide :
 *
 *  - `/home/artist-releases` rend des ARTISTES portant `releases[]` ;
 *  - `/zones/now-listening` cache la piste dans `now_playing` ;
 *  - `/home/other-versions` porte la pochette sur `versions[0]`.
 *
 * Passées au convertisseur commun, ces trois-là n'avaient ni titre ni pochette :
 * le filtre des entrées vides les retirait TOUTES, et le widget annonçait
 * « rien à montrer » sur des données bien présentes.
 */
describe('Accueil — les formes propres à certaines sources', () => {
  const reg = () => lire('../accueilWidgets.ts');

  /**
   * Le bloc d'UN widget, borné au suivant.
   *
   * Une fenêtre de taille fixe débordait sur le widget d'après, et le garde
   * voyait le `versElement` du voisin — il rougissait sur du code correct.
   */
  function bloc(id: string): string {
    const src = reg();
    const i = src.indexOf(`id: '${id}'`);
    const j = src.indexOf("\n  {\n    id: '", i + 1);
    return src.slice(i, j > i ? j : undefined);
  }

  it('les parutions d’artistes sont DÉPLIÉES', () => {
    const bloc_ = bloc('nouveautes-artistes');
    expect(bloc_.includes('a?.releases ?? []'), 'les parutions ne sont plus dépliées').toBe(true);
    expect(
      bloc_.includes('versElement('),
      'le convertisseur commun est revenu : ces entrées n’ont ni titre ni pochette à leur niveau.',
    ).toBe(false);
  });

  it('la piste d’une zone est lue dans `now_playing`', () => {
    expect(
      bloc('zones').includes('z?.now_playing ?? {}'),
      'la piste est de nouveau cherchée au premier niveau.',
    ).toBe(true);
  });

  it('la pochette d’une autre version vient de la VERSION', () => {
    expect(
      bloc('autres-versions').includes('(o?.versions ?? [])[0]'),
      'on ne descend plus dans les versions.',
    ).toBe(true);
  });
});

/**
 * La page n'est pas BORNÉE.
 *
 * Bertrand, 02/09/2026 : « ne borne pas la homepage comme Roon le fait ».
 * Roon impose des sections courtes et fermées. Ici la bande DÉFILE : rien
 * n'oblige à la couper court, et ce qui sort du cadre ne coûte rien.
 */
describe('Accueil — pas de bornage', () => {
  it('une bande montre ce que la source donne', () => {
    // Cinquante, parce que c'est ce que rendent la plupart des sources.
    expect(/const LIMITE = 50;/.test(lire('../accueilWidgets.ts')), 'la limite par bande a été resserrée').toBe(true);
  });

  it('les vignettes hors cadre ne coûtent rien', () => {
    // Cinquante par bande et jusqu'à vingt et une bandes : sans cela, dérouler
    // la page rendrait plusieurs milliers de vignettes pour rien.
    const m = /\.carte\{([^}]*)\}/.exec(lire('../../components/v2/PageWidgets.svelte'));
    expect(m![1].includes('content-visibility:auto'), 'le rendu hors cadre est revenu').toBe(true);
  });

  it('aucun plafond sur le NOMBRE de widgets', () => {
    // La page se compose librement : rien ne limite combien on en pose.
    const src = lire('../../components/v2/PageWidgets.svelte');
    expect(
      /disposition\.length\s*[<>]=?\s*\d/.test(src),
      'un plafond sur le nombre de widgets est apparu.',
    ).toBe(false);
  });
});

/**
 * Le GESTE d'une vignette.
 *
 * Bertrand, 02/09/2026 : « pas de bouton play sur toutes les covers, exemple :
 * Nouveautés de vos artistes ». La carte n'affiche le disque que si l'élément
 * porte un `jouer` — et huit bandes Qobuz plus les parutions d'artistes n'en
 * avaient aucun, faute de reconnaître un contenant de STREAMING.
 *
 * Ces tests-là ne lisent pas la source : ils appellent la fonction.
 */
describe('Accueil — ce que fait un clic', () => {
  const corps = (o: any, service: string | null, genre: any = 'album') => {
    const f = geste(o, service, genre);
    if (!f) return null;
    const vus: any[] = [];
    // On intercepte l'appel plutôt que de partir sur le réseau. `spyOn` et non
    // une affectation : les exports d'un module ES sont en lecture seule.
    const espion = vi.spyOn(api, 'play').mockImplementation((_z: number, b: any) => {
      vus.push(b);
      return Promise.resolve({} as any);
    });
    try { f(1); } finally { espion.mockRestore(); }
    return vus[0] ?? null;
  };

  it('un album local part par son identifiant local', () => {
    expect(corps({ album_id: 42 }, null)).toEqual({ album_id: 42 });
    expect(corps({ id: 42 }, null)).toEqual({ album_id: 42 });
  });

  it('une piste part par la sienne', () => {
    expect(corps({ track_id: 7 }, null)).toEqual({ track_id: 7 });
  });

  /**
   * 🔴 Le cœur du défaut. Un album éditorial Qobuz vaut
   * `{artist_id, artist_name, cover_path, quality, source_id, title,
   * track_count, year}` : aucun identifiant local, donc aucun geste avant.
   */
  it('un album de streaming part par sa paire service + identifiant', () => {
    expect(corps({ source_id: 'kxend2k5wdg06' }, 'qobuz')).toEqual({
      streaming_album_id: 'kxend2k5wdg06',
      source: 'qobuz',
    });
  });

  it('une playlist de streaming aussi, sous son propre nom de champ', () => {
    expect(corps({ source_id: '69230603' }, 'qobuz', 'playlist')).toEqual({
      streaming_playlist_id: '69230603',
      source: 'qobuz',
    });
  });

  /**
   * 🔴 `source` n'est jamais facultatif à côté d'un `streaming_*_id` : le
   * serveur n'apparie que la PAIRE, et un identifiant seul le fait retomber
   * sur « reprendre la lecture en cours ». C'est le bug des playlists Qobuz.
   */
  it('sans service, un identifiant de streaming ne déclenche RIEN', () => {
    expect(geste({ source_id: 'kxend2k5wdg06' }, null, 'album')).toBeUndefined();
  });

  it('un identifiant nu ne devient pas un album quand on ne l’a pas dit', () => {
    expect(geste({ id: 30 }, null, 'aucun')).toBeUndefined();
  });

  it('rien à jouer ne rend rien — la carte n’affichera pas de disque', () => {
    expect(geste({ titre: 'x' }, null, 'album')).toBeUndefined();
  });
});
