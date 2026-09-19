/**
 * Le catalogue de la boutique, fondu dans la liste des greffons.
 *
 * Porté de l'ancien écran Extensions (`PluginsView`) : il ajoutait à la liste
 * locale les greffons de la boutique qu'elle ne portait pas encore, comme
 * tuiles installables. La règle vit ici pour qu'un test l'APPELLE.
 *
 *  - un greffon déjà présent localement (par nom OU par slug) n'est pas
 *    doublé — le même greffon deux fois, c'est la dérive qu'on redoute ;
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
}

export function ajouterLaBoutique(locaux: MergedPlugin[], boutique: readonly LigneBoutique[]): MergedPlugin[] {
  const connus = new Set(locaux.flatMap((p) => [p.name, p.slug].filter(Boolean) as string[]));
  const extras = boutique
    .filter((m) => !m.installed && !connus.has(m.slug) && !(m.name && connus.has(m.name)))
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
