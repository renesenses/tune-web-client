/**
 * « Après une indexation, les albums n'apparaissent pas immédiatement dans la
 *  fenêtre Bibliothèque » (Gros Bidon, forum 1688, 06/09/2026), et déjà
 * « pas de rafraîchissement de la vue bibliothèque après ajout d'albums »
 * (Patatorz, forum 1517, 22/08/2026).
 *
 * DOUZIÈME « écrit mais pas branché ». Les événements existent et sont émis
 * depuis longtemps : `library.scan.completed` et `library.updated` sont
 * traités dans SEPT fichiers de l'ancien client et dans AUCUN de la v2. Le
 * magasin `albums` était rempli une fois, au montage, et plus jamais.
 *
 * `LibraryView` porte même le commentaire qui nomme le premier témoin :
 * « il fallait changer d'onglet puis revenir pour voir arriver les albums
 * qu'on venait de déposer (Patatorz, fil #1517) ». Corrigé là-bas en août,
 * jamais porté ici.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('la bibliothèque se recharge quand le serveur le dit', () => {
  /**
   * 🔴 Délai relevé à vingt secondes, et ce n'est pas une complaisance.
   *
   * Ce cas fait `vi.resetModules()` puis `await import('../v2Bootstrap')` : il
   * force donc la RETRANSFORMATION de tout le graphe d'imports du démarrage —
   * `api.ts` et ses quatre mille lignes, les magasins, la couche websocket.
   * Le défaut de cinq secondes de vitest est une convention, pas une exigence
   * de ce test : ce qu'il vérifie est un COMPORTEMENT (deux événements
   * rechargent, un troisième non), jamais une vitesse.
   *
   * Constaté le 08/09/2026 : vert en isolation, rouge dans la passe complète —
   * sur le Mac à charge 150 comme sur Shrek à charge 17, dès que la suite a
   * grossi de neuf cas. Un garde qui tombe au hasard n'apprend plus à
   * personne à croire le rouge.
   *
   * 🔴 Vingt secondes n'ont pas suffi. Le coût n'est pas le test, c'est la
   * TRANSFORMATION du graphe : mesuré sur Shrek, la même suite affiche
   * « transform 646 s » à froid et une fraction de cela ensuite. Une CI part
   * toujours à froid. Soixante secondes, donc — ce cas vérifie un
   * COMPORTEMENT, jamais une vitesse, et le plafond n'est là que pour empêcher
   * un blocage réel de durer.
   */
  it('les deux événements sont écoutés — et INVALIDENT, sans recharger (#4800)', { timeout: 60_000 }, async () => {
    let recu: ((e: any) => void) | null = null;
    const desabonner = vi.fn();
    vi.resetModules();
    vi.doMock('../websocket', () => ({
      tuneWS: { onEvent: (cb: any) => { recu = cb; return desabonner; } },
    }));
    // renesenses/tune-server-rust#4800 : recharger 3,5 Mo à chaque fin de
    // scan était la moitié de la cause 3. L'événement ne doit plus produire
    // AUCUNE requête : il invalide, et les écrans montés redemandent ce
    // qu'ils montrent.
    const requetes: unknown[] = [];
    vi.doMock('../api', () => ({
      getAllAlbums: vi.fn(async () => { requetes.push(1); return []; }),
      getAlbumsPagines: vi.fn(async () => { requetes.push(1); return { items: [], total: 0 }; }),
    }));
    const m = await import('../v2Bootstrap');
    const pagines = await import('../stores/albumsPagines');
    const { get } = await import('svelte/store');
    const avant = get(pagines.generationBibliotheque);
    const stop = m.suivreLaBibliotheque();
    expect(recu, "aucun abonnement n'a été posé").toBeTypeOf('function');

    recu!({ type: 'library.scan.completed' });
    recu!({ type: 'library.updated' });
    await new Promise((r) => setTimeout(r, 0));
    expect(get(pagines.generationBibliotheque) - avant, 'les deux événements doivent invalider').toBe(2);
    expect(requetes.length, "une invalidation ne recharge RIEN d'elle-même").toBe(0);

    // Un événement SANS rapport ne doit rien invalider : sur 46 877 pistes,
    // les écrans montés rechargeraient à chaque battement de transport.
    recu!({ type: 'zone.state.changed' });
    recu!({});
    await new Promise((r) => setTimeout(r, 0));
    expect(get(pagines.generationBibliotheque) - avant).toBe(2);
    expect(requetes.length).toBe(0);

    stop();
    expect(desabonner, "l'abonnement doit se couper au démontage").toHaveBeenCalled();
  });
});

describe('la coquille v2 le branche', () => {
  const shell = sansCommentaires(lire('src/components/v2/ShellV2.svelte'));

  it('elle appelle le suivi, et lui rend son désabonnement', () => {
    expect(shell).toContain("import { bootstrapV2, suivreLaBibliotheque } from '../../lib/v2Bootstrap';");
    // 🔴 `=> suivreLaBibliotheque()` sans accolades : la valeur rendue EST la
    // fonction de nettoyage. Avec des accolades, Svelte ne recevrait rien et
    // l'abonnement survivrait au démontage.
    expect(shell).toMatch(/\$effect\(\(\) => suivreLaBibliotheque\(\)\);/);
  });

});
