/**
 * Catalogue des Extensions du nouveau client — ce que l'ancien écran
 * (`PluginsView`) faisait et que `PluginsV2` ne faisait pas (phase 5, web#1257 :
 * aucune perte d'accès).
 *
 * 1. Le CATALOGUE DISTANT. `GET /plugins` ne rend que ce que le serveur connaît
 *    localement (intégrés, natifs, wasm déjà sur disque) : un greffon du
 *    marketplace pas encore installé n'y figure pas
 *    (`tune-server/src/routes/plugins.rs`, `list_plugins`). L'onglet
 *    « Catalogue » de la v2 ne pouvait donc rien proposer d'autre que
 *    l'installé — et sa branche `installMarketplacePlugin` ne se déclenchait
 *    jamais, faute d'une seule ligne `marketplace: true`.
 *    `GET /marketplace/plugins` est la seconde source ; on la fond ici, avec la
 *    même règle que l'ancien écran.
 *
 * 2. La DÉSINSTALLATION. La v2 passait tout par
 *    `POST /marketplace/plugins/{slug}/uninstall`, qui ne connaît que les
 *    installations du marketplace et rend 404 `plugin_not_installed` pour un
 *    greffon intégré (DJ, karaoké, égaliseur…). `DELETE /plugins/{name}`
 *    (`delete_plugin`) sait retirer les deux ; le marketplace garde les greffons
 *    wasm, dont il tient aussi l'enregistrement.
 */
import type { MarketplaceCatalogPlugin, MergedPlugin } from './api';

/**
 * Local + catalogue distant, en une liste. Une ligne du catalogue déjà connue
 * localement (par `slug` ou par `name`) ou déjà installée n'est pas répétée.
 * Seules les lignes `wasm` sont installables par le serveur Rust : les autres
 * (héritage Python) sont montrées incompatibles, jamais masquées.
 */
export function fusionnerCatalogue(
  locaux: MergedPlugin[],
  distants: MarketplaceCatalogPlugin[],
): MergedPlugin[] {
  const noms = new Set(locaux.map((p) => p.name));
  const extras = distants
    .filter((m) => !noms.has(m.slug) && !noms.has(m.name) && !m.installed)
    .map((m) => ({
      name: m.slug,
      slug: m.slug,
      display_name: m.display_name || m.name,
      description: m.description || '',
      version: m.version || '',
      author: m.author,
      category: m.category || 'system',
      install_count: m.downloads,
      platforms: m.platforms ?? undefined,
      compatible: (m.platforms || '').toLowerCase().includes('wasm'),
      installed: false,
      update_available: false,
      status: 'available',
      marketplace: true,
    }) as MergedPlugin);
  return [...locaux, ...extras];
}

/** Quelle route retire ce greffon : le marketplace pour un wasm, sinon `DELETE /plugins/{name}`. */
export function routeDeDesinstallation(p: MergedPlugin): 'marketplace' | 'serveur' {
  return p.type === 'wasm' || p.marketplace ? 'marketplace' : 'serveur';
}
