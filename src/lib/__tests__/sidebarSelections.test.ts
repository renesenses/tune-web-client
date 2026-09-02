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

  it('l’écran complet n’apparaît QUE s’il y en a plus de cinq', () => {
    const src = barre();
    expect(src.includes('raccourcisEnTrop'), 'la condition a disparu').toBe(true);
    expect(
      /raccourcisEnTrop = \$derived\(\$shortcuts\.length > RACCOURCIS_BARRE\)/.test(src),
      'l’entrée « voir tout » ne dépend plus du dépassement : elle serait un clic pour rien.',
    ).toBe(true);
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
