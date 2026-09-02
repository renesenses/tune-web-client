/**
 * Barre latérale : les groupes « Raccourcis » et « Sélections ».
 *
 * Demandés par Bertrand le 02/09/2026, avec une règle précise pour les
 * raccourcis : « limités à 5 dans la sidebar. Écran sinon. »
 *
 * ⚠️ Ces tests lisent la SOURCE. Ils tiennent des décisions précises, ils ne
 * prouvent pas que l'écran est juste à l'œil.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const barre = () => lire('../../components/v2/Sidebar.svelte');
const shell = () => lire('../../components/v2/ShellV2.svelte');

describe('Barre latérale — les raccourcis', () => {
  it('cinq au plus dans la barre', () => {
    const src = barre();
    expect(/RACCOURCIS_BARRE\s*=\s*5/.test(src), 'le plafond a changé ou disparu').toBe(true);
    expect(
      src.includes('.slice(0, RACCOURCIS_BARRE)'),
      'la liste n’est plus tronquée : la barre grossirait à chaque raccourci ajouté.',
    ).toBe(true);
  });

  it('les ÉPINGLÉS passent devant', () => {
    // Sans ce tri, le cinquième raccourci ajouté chasserait de la barre un
    // raccourci que l'utilisateur avait explicitement épinglé.
    expect(
      barre().includes("Number(b.pinned !== false) - Number(a.pinned !== false)"),
      'le tri par épingle a disparu.',
    ).toBe(true);
  });

  it('l’écran de gestion est atteignable dès le PREMIER raccourci', () => {
    // Il ne sert pas qu'à voir les surnuméraires : c'est là qu'on renomme,
    // qu'on change d'icône et qu'on épingle. Le réserver au dépassement de
    // cinq rendait la gestion inatteignable tant qu'on en avait peu — c'est ce
    // que faisait ma première version.
    const src = barre();
    expect(src.includes('{#if $shortcuts.length}'), 'l’entrée de gestion a disparu').toBe(true);
    expect(
      src.includes('raccourcisEnTrop'),
      'la condition « plus de cinq » est revenue : la gestion redeviendrait inatteignable en dessous.',
    ).toBe(false);
  });

  it('on peut CRÉER un raccourci depuis la barre', () => {
    // Elle les affichait sans qu'aucun geste ne permette d'en poser un.
    const src = barre();
    expect(src.includes('addShortcut(n,'), 'la création a disparu').toBe(true);
    expect(src.includes('class="plus"'), 'le bouton « + » a disparu').toBe(true);
  });

  it('les raccourcis sont CHARGÉS', () => {
    // Ils vivent dans la configuration serveur : sans ce chargement, la barre
    // en montrerait zéro pour toujours.
    expect(barre().includes('loadShortcuts()'), 'le chargement a disparu').toBe(true);
    expect(barre().includes('navigateToShortcut(sc)'), 'un raccourci ne mène plus nulle part').toBe(true);
  });

  it('l’écran des raccourcis est celui du client actuel', () => {
    // En écrire un second donnerait deux gestions d'épinglage à maintenir.
    expect(shell().includes('<ShortcutsView />'), 'l’écran n’est plus monté').toBe(true);
    expect(shell().includes("$activeView === 'shortcuts'"), 'la route a disparu').toBe(true);
  });
});

describe('Barre latérale — les sélections', () => {
  it('le groupe porte les étiquettes ET les favoris', () => {
    const src = barre();
    expect(src.includes("view: 'tags'"), 'les étiquettes ont disparu du groupe').toBe(true);
    expect(src.includes("view: 'favorites'"), 'les favoris ont disparu du groupe').toBe(true);
  });

  it('les favoris ont QUITTÉ « Avancé », ils n’y sont pas dupliqués', () => {
    // Deux entrées « Favoris » dans la même barre laisseraient croire à deux
    // écrans différents.
    const src = barre();
    const i = src.indexOf('const ADVANCED');
    const bloc = src.slice(i, src.indexOf('const SELECTIONS'));
    expect(
      bloc.includes("view: 'favorites'"),
      'les Favoris figurent encore dans « Avancé » : la barre en montrerait deux.',
    ).toBe(false);
  });

  it('l’écran Étiquettes existe et est routé', () => {
    expect(shell().includes('<EtiquettesV2 />'), 'l’écran n’est plus monté').toBe(true);
    expect(shell().includes("$activeView === 'tags'"), 'la route a disparu').toBe(true);
  });

  it('l’écran Étiquettes annonce des ALBUMS, pas un total', () => {
    // `GET /tags/{id}/albums` est la seule route qui liste par étiquette, alors
    // qu'une étiquette porte aussi artistes, playlists, pistes et collections.
    // Annoncer un total qui ne correspond pas à ce qu'on voit serait pire que
    // de ne rien annoncer.
    const src = lire('../../components/v2/EtiquettesV2.svelte');
    expect(src.includes('v2.tags.albumsWithTag'), 'la mention « albums » a disparu').toBe(true);
    expect(src.includes('api.getTagAlbums('), 'la lecture des albums a disparu').toBe(true);
  });

  it('un écran sans étiquette DIT où en poser une', () => {
    // Sinon l'écran vide se lit comme une panne.
    expect(
      lire('../../components/v2/EtiquettesV2.svelte').includes('v2.tags.emptyHint'),
      'l’état vide ne dit plus comment poser une étiquette.',
    ).toBe(true);
  });
});

/**
 * « Lecture en cours » doit être ATTEIGNABLE depuis la barre.
 *
 * L'écran était monté et routé depuis le 01/09/2026, mais rien dans la barre
 * n'y menait : on ne l'atteignait qu'en cliquant la piste dans la barre de
 * transport — un geste que personne ne devine. Bertrand, 02/09/2026 : « il
 * manque l'écran Lecture en cours ».
 */
describe('Barre latérale — Lecture en cours', () => {
  it('l’entrée existe dans le noyau', () => {
    const src = barre();
    expect(src.includes("view: 'nowplaying'"), 'l’entrée a disparu de la barre').toBe(true);
    // Dans le NOYAU : reléguée en « Avancé », elle resterait cachée aux
    // utilisateurs qui n'ont jamais changé de niveau d'interface.
    const i = src.indexOf('const CORE');
    const j = src.indexOf('const ADVANCED');
    expect(
      src.slice(i, j).includes("view: 'nowplaying'"),
      'l’entrée est sortie du noyau : elle redeviendrait invisible par défaut.',
    ).toBe(true);
  });

  it('l’écran reste monté et routé', () => {
    const src = shell();
    expect(src.includes("$activeView === 'nowplaying'"), 'la route a disparu').toBe(true);
    expect(src.includes('<NowPlaying />'), 'le composant n’est plus monté').toBe(true);
  });
});

/**
 * Un raccourci se pose depuis N'IMPORTE QUEL écran, et retient ce qu'il voit.
 *
 * Bertrand, 02/09/2026 : « il manque l'icône pour créer un raccourci sur chaque
 * écran », puis « un raccourci sur une recherche doit retenir les critères ».
 */
describe('Raccourcis — poser depuis n’importe où', () => {
  const coquille = () => lire('../../components/v2/ShellV2.svelte');
  const magasin = () => lire('../stores/shortcuts.ts');

  it('l’icône est dans la coquille, donc sur tous les écrans', () => {
    // Posée là plutôt que dans chacun des vingt-cinq écrans : un seul endroit
    // à tenir, et elle ne bouge pas d'un écran à l'autre.
    const src = coquille();
    expect(src.includes('class="raccourci"'), 'l’icône a disparu de la coquille').toBe(true);
    expect(src.includes('addShortcut(n,'), 'la pose n’enregistre plus rien').toBe(true);
  });

  it('l’icône est le SIGNET de l’écran actuel', () => {
    // Une étoile ne dit pas la même chose : c'est le pictogramme du favori.
    expect(
      coquille().includes('M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'),
      'le pictogramme n’est plus celui de l’écran actuel.',
    ).toBe(true);
  });

  it('une recherche retient ses critères', () => {
    const m = magasin();
    expect(m.includes('export const currentSearchCriteria'), 'le magasin des critères a disparu').toBe(true);
    expect(m.includes("if (view === 'search')"), 'la capture ignore la recherche').toBe(true);
    expect(m.includes('state.search = c;'), 'les critères ne sont plus figés').toBe(true);
  });

  it('les critères sont reposés AVANT le changement de vue', () => {
    // L'écran de recherche lit le magasin à son montage : le remplir après le
    // laisserait vide une trame, assez pour qu'il cherche à blanc.
    const m = magasin();
    const pose = m.indexOf('currentSearchCriteria.set(shortcut.state.search)');
    const vue = m.indexOf('activeView.set(shortcut.view);');
    expect(pose, 'la restauration a disparu').toBeGreaterThan(-1);
    expect(pose, 'les critères sont reposés après le changement de vue').toBeLessThan(vue);
  });
});

/**
 * Sélections : ce que l'utilisateur a constitué lui-même.
 *
 * Collections et Playlists ont rejoint le groupe le 02/09/2026, sur demande de
 * Bertrand. Dans le noyau elles voisinaient avec Bibliothèque et Radio — des
 * SOURCES, pas des choix.
 */
describe('Barre latérale — Collections et Playlists dans Sélections', () => {
  it('elles ont quitté le noyau', () => {
    const src = barre();
    const noyau = src.slice(src.indexOf('const CORE'), src.indexOf('const ADVANCED'));
    for (const v of ['collections', 'playlists']) {
      expect(
        noyau.includes(`view: '${v}'`),
        `« ${v} » est resté dans le noyau : il y serait en double avec Sélections.`,
      ).toBe(false);
    }
  });

  it('elles sont dans Sélections, avant les étiquettes', () => {
    const src = barre();
    const sel = src.slice(src.indexOf('const SELECTIONS'), src.indexOf('const STUDIO'));
    expect(sel.includes("view: 'collections'"), 'Collections a disparu').toBe(true);
    expect(sel.includes("view: 'playlists'"), 'Playlists a disparu').toBe(true);
  });
});

/**
 * Radio : un seul cœur dans toute l'interface, et un bouton d'édition.
 *
 * La station avait son propre cœur — rond, en haut à droite, d'une autre
 * couleur — parce que son favori ne vit pas dans `favorites` mais dans sa
 * propre table. Deux cœurs différents se lisent comme deux choses différentes
 * (Bertrand, 02/09/2026).
 */
describe('Radio — cœur harmonisé et édition', () => {
  const radios = () => lire('../../components/v2/RadiosV2.svelte');

  it('la station porte le composant des pochettes', () => {
    const src = radios();
    expect(src.includes('<PochetteActions'), 'la station n’utilise plus le composant commun').toBe(true);
    expect(src.includes('favoriExterne={'), 'le cœur externe a disparu').toBe(true);
    // Et plus son cœur à elle.
    expect(/<button class="fav"/.test(src), 'le cœur propre à la radio est revenu').toBe(false);
  });

  it('le cœur externe partage l’apparence, pas la bascule', () => {
    // Une radio ne s'écrit pas dans `favorites` : c'est `PUT /radios/{id}`.
    const pa = lire('../../components/v2/PochetteActions.svelte');
    expect(pa.includes('if (favoriExterne) await favoriExterne.basculer();'), 'la bascule externe a disparu').toBe(true);
    expect(pa.includes('const montreCoeur = $derived(!!favori || !!favoriExterne);'), 'le cœur ne s’affiche plus pour un favori externe').toBe(true);
  });

  it('l’édition n’offre que ce que le serveur accepte', () => {
    const m = lire('../../components/v2/RadioEditModale.svelte');
    for (const champ of ['name:', 'stream_url:', 'logo_url:', 'genre:', 'country:', 'homepage_url:']) {
      expect(m.includes(champ), `le champ ${champ} a disparu`).toBe(true);
    }
    // Le FLUX fait la station : sans lui il n'y a rien à écouter.
    expect(m.includes('bind:value={flux} required'), 'le flux n’est plus obligatoire').toBe(true);
    // Fermer sur échec ferait croire à un enregistrement.
    const i = m.indexOf('} catch (err: any) {');
    expect(m.slice(i, i + 240).includes('onClose()'), 'la modale se ferme sur échec').toBe(false);
  });
});

/**
 * « Lecture en cours » : l'icône du mode TV.
 *
 * C'était le pictogramme universel du plein écran — quatre flèches en biais.
 * Dans un coin d'interface il se lit comme « agrandir la fenêtre », et rien
 * n'indiquait qu'on basculait vers un mode d'affichage distinct.
 */
describe('Lecture en cours — le bouton TV', () => {
  it('l’icône est un téléviseur, plus des flèches de plein écran', () => {
    const src = lire('../../components/NowPlaying.svelte');
    const i = src.indexOf('class="np-tv-btn"');
    expect(i, 'le bouton TV a disparu').toBeGreaterThan(-1);
    const bloc = src.slice(i, i + 1400);
    expect(bloc.includes('<rect x="2" y="4" width="20" height="13"'), 'l’écran a disparu de l’icône').toBe(true);
    expect(
      bloc.includes('polyline points="15 3 21 3 21 9"'),
      'les flèches de plein écran sont revenues : elles se lisent « agrandir la fenêtre ».',
    ).toBe(false);
  });
});

/**
 * Le mode TV : une icône alignée, et une route qui existe.
 *
 * Deux défauts successifs le 02/09/2026 :
 *
 *  1. le bouton d'origine est ancré en haut à droite de « Lecture en cours »,
 *     donc SOUS l'avatar et le signet que la coquille pose au même endroit —
 *     l'icône mordait sur la photo de Bertrand. Je l'ai d'abord décalé de
 *     108 px : ça ne se chevauchait plus, mais un nombre magique ne s'aligne
 *     sur rien et casse au premier bouton ajouté ;
 *  2. la vue `tv` n'était pas routée dans la coquille : le bouton posait
 *     `activeView` sur une vue inconnue, et on tombait sur le repli.
 */
describe('Mode TV — dans la grappe, et routé', () => {
  const coquille = () => lire('../../components/v2/ShellV2.svelte');

  it('le bouton vit dans la grappe, pas décalé au pixel', () => {
    const src = coquille();
    expect(src.includes("$activeView === 'nowplaying'}\n      <button class=\"raccourci\" onclick={modeTv}"), 'le bouton a quitté la grappe').toBe(true);
    expect(
      /right:\s*108px/.test(src),
      'le décalage au pixel est revenu : il ne s’aligne sur rien et casse au premier bouton ajouté.',
    ).toBe(false);
    // Et celui de l'écran est masqué, sinon il y en aurait deux.
    expect(src.includes(':global(.np-tv-btn) { display: none; }'), 'le bouton d’origine réapparaît en double').toBe(true);
  });

  it('la vue TV est routée', () => {
    const src = coquille();
    expect(src.includes("$activeView === 'tv'"), 'la route a disparu : le bouton ne mènerait nulle part').toBe(true);
    expect(src.includes('<TvView />'), 'l’écran TV n’est plus monté').toBe(true);
  });
});
