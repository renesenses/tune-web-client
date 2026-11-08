/**
 * Le catalogue de la boutique, fondu dans la liste des greffons.
 *
 * Porté de l'ancien écran Extensions (`PluginsView`) : il ajoutait à la liste
 * locale les greffons de la boutique qu'elle ne portait pas encore, comme
 * tuiles installables. La règle vit ici pour qu'un test l'APPELLE.
 *
 *  - un greffon déjà présent localement (par nom OU par slug) n'est pas
 *    doublé — le même greffon deux fois, c'est la dérive qu'on redoute ;
 *  - une ligne qui publie l'identifiant de manifeste de son greffon
 *    (`plugin_id`) est reconnue par lui : « Mode Party » (`party-mode`,
 *    `plugin_id: party`) est le greffon local `party` (« Party Mode »),
 *    serveur#7428. Une ligne sans `plugin_id` garde la règle par nom et slug ;
 *  - seules les lignes `wasm` sont installables par le serveur Rust : les
 *    autres restent visibles, marquées incompatibles.
 */
import type { MergedPlugin } from './api';

export interface LigneBoutique {
  slug: string;
  name?: string;
  display_name?: string;
  description?: string;
  version?: string;
  author?: string;
  category?: string;
  downloads?: number;
  platforms?: string | null;
  installed?: boolean;
  /** Identifiant du manifeste du greffon décrit par la ligne (serveur#7428). */
  plugin_id?: string | null;
}

export function ajouterLaBoutique(locaux: MergedPlugin[], boutique: readonly LigneBoutique[]): MergedPlugin[] {
  const connus = new Set(locaux.flatMap((p) => [p.name, p.slug].filter(Boolean) as string[]));
  const extras = boutique
    .filter((m) => !m.installed && !connus.has(m.slug) && !(m.name && connus.has(m.name)))
    .filter((m) => !(m.plugin_id && connus.has(m.plugin_id)))
    .map((m) => ({
      name: m.slug,
      slug: m.slug,
      display_name: m.display_name || m.name || m.slug,
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
    }) as unknown as MergedPlugin);
  return [...locaux, ...extras];
}
