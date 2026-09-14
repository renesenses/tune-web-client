import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * La gestion complète des playlists reste ATTEIGNABLE depuis la future v1.
 *
 * ## Ce qui s'est passé
 *
 * `PlaylistsV2` fait 13 appels d'API ; l'écran de l'ancienne interface en fait
 * 31. Treize n'existaient **nulle part** en v2 : playlists collaboratives,
 * fusionner, comparer, récupérer une playlist supprimée, liens,
 * synchronisation avec les services, réordonner les pistes.
 *
 * Tant que l'ancienne interface était le défaut, personne ne les perdait — le
 * bouton « Playlists » y mène à `playlistmanager`, pas à `playlists`. Depuis
 * la bascule du défaut (#1032), un utilisateur qui n'a jamais rien choisi ne
 * les atteint plus, et `?v2=0` est un secret que personne ne devine.
 *
 * ## Pourquoi la garde tient la ROUTE et pas le composant
 *
 * Trois fois dans ce client, un écran a existé sans que rien n'y mène :
 * `LoginView` (#1021), `OnboardingView` (14/09), et la route ci-dessous aurait
 * été la quatrième si on s'était contenté de la rendre. Vérifier que le
 * composant est monté ne prouve rien : il faut qu'un geste d'utilisateur y
 * conduise.
 */

const RACINE = resolve(process.cwd());
const lire = (c: string) => readFileSync(resolve(RACINE, c), 'utf8');

/** Les commentaires sont retirés : une garde satisfaite par la documentation
 *  de ce qu'elle garde ne garde rien. Ceux d'ici citent tous les noms. */
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('la gestion complète des playlists est atteignable en v2', () => {
  const shell = sansCommentaires(lire('src/components/v2/ShellV2.svelte'));
  const ecran = sansCommentaires(lire('src/components/v2/PlaylistsV2.svelte'));

  it('la coquille v2 REND l’écran de gestion', () => {
    expect(shell).toMatch(/\$activeView === 'playlistmanager'/);
    expect(shell, 'la route existe mais ne monte rien').toMatch(/<PlaylistManagerView[\s/>]/);
  });

  it('un geste d’utilisateur y CONDUIT', () => {
    // Sans ce chemin, la route serait le quatrième écran inatteignable de ce
    // client. C'est l'assertion qui compte vraiment ici.
    expect(
      ecran,
      'rien ne mène à playlistmanager : la gestion complète est perdue pour qui n’a jamais choisi son interface',
    ).toMatch(/activeView\.set\('playlistmanager'\)/);
  });

  it('l’écran de gestion vit dans v2-heritage, pas à la racine', () => {
    // La racine est destinée à disparaître (phase 5). Un écran que la v2 monte
    // ne peut pas y rester, sinon la suppression le casse.
    expect(shell).toMatch(/from '\.\.\/v2-heritage\/PlaylistManagerView\.svelte'/);
  });

  it('les treize appels manquants sont bien dans l’écran monté', () => {
    // Garde de non-régression : si quelqu'un « simplifie » l'écran hérité, il
    // doit voir ce qu'il retire. Ce sont les appels qui n'existent NULLE PART
    // ailleurs en v2 — mesurés le 14/09/2026.
    const gestion = lire('src/components/v2-heritage/PlaylistManagerView.svelte');
    const ABSENTS_AILLEURS = [
      'createCollaborativePlaylist',
      'deleteCollaborativePlaylist',
      'getCollaborativePlaylists',
      'getCollaborativePlaylistTracks',
      'mergePlaylists',
      'diffPlaylists',
      'recoverPlaylist',
      'reorderPlaylistTracks',
      'triggerPlaylistSync',
      'getPlaylistLinks',
      'deletePlaylistLink',
      'deletePlaylistSnapshot',
      'getPlaylistManagerServices',
    ];
    const perdus = ABSENTS_AILLEURS.filter((a) => !new RegExp(`api\\.${a}\\s*\\(`).test(gestion));
    expect(perdus, `appels disparus de l’écran de gestion : ${perdus.join(', ')}`).toEqual([]);
  });
});
