/**
 * Le catalogue de la boutique, fondu dans la liste des greffons.
 *
 * Porté de l'ancien écran Extensions (`PluginsView`) : il ajoutait à la liste
 * locale les greffons de la boutique qu'elle ne portait pas encore, comme
 * tuiles installables. La règle vit ici pour qu'un test l'APPELLE.
 *
 *  - un greffon déjà présent localement (par nom OU par slug) n'est pas
 *    doublé — le même greffon deux fois, c'est la dérive qu'on redoute ; le nom
 *    affiché compte aussi, mots dans le désordre (« Mode Party » = « Party Mode ») ;
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

/**
 * Un nom comparable : sans accents ni ponctuation, mots triés. « Mode Party » et
 * « Party Mode » désignent la même extension (tune-server-rust#7428, fil 2536) ;
 * ni l'identifiant ni le slug ne le disent quand le catalogue range le même
 * greffon sous un autre slug.
 */
function nomComparable(nom: string | undefined): string {
  return (nom ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).sort().join(' ');
}

export function ajouterLaBoutique(locaux: MergedPlugin[], boutique: readonly LigneBoutique[]): MergedPlugin[] {
  const connus = new Set(locaux.flatMap((p) => [p.name, p.slug].filter(Boolean) as string[]));
  const noms = new Set(locaux.flatMap((p) => [nomComparable(p.display_name), nomComparable(p.name)]).filter(Boolean));
  const dejaLa = (m: LigneBoutique) =>
    [m.display_name, m.name, m.slug].some((n) => { const c = nomComparable(n); return !!c && noms.has(c); });
  const extras = boutique
    .filter((m) => !m.installed && !connus.has(m.slug) && !(m.name && connus.has(m.name)) && !dejaLa(m))
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
