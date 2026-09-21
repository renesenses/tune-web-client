/**
 * Les entrées STUDIO de la barre latérale qui dépendent d'un greffon (#1261).
 *
 * Depuis la v0.9.156, l'égaliseur, le crossfeed, le convertisseur et le
 * Dé-ploc sont des greffons (SDK audio natif, tune-server-rust#4364 ; égaliseur
 * facultatif, #4453). La barre les listait en dur : un greffon désinstallé ou
 * désactivé gardait son entrée, qui menait à un écran sans rien derrière.
 *
 * Le nom de la vue est le nom du greffon côté serveur — d'où la table
 * d'identité, qu'on garde explicite pour qu'un renommage de vue ne rompe pas
 * le lien en silence.
 */
import { writable } from 'svelte/store';
import type { MergedPlugin } from '../api';

export const VUES_GREFFONS: Record<string, string> = {
  equalizer: 'equalizer',
  crossfeed: 'crossfeed',
  converter: 'converter',
  declick: 'declick',
};

/**
 * Faut-il montrer l'entrée d'un greffon ?
 *
 * - greffon absent de la liste, ou champ `installed` absent : serveur d'avant
 *   la v0.9.156 ⇒ on montre, comme avant (jamais de faux « absent ») ;
 * - sinon : installé ET actif.
 *
 * 🔴 L'ÉGALISEUR N'A PLUS D'EXCEPTION — Bertrand, 21/09/2026 : « je veux que
 * l'égaliseur s'efface de la sidebar ».
 *
 * Il en avait une : non installé mais porteur d'une configuration
 * (`install_proposed`), son entrée restait, parce que son écran proposait
 * l'installation en un geste (#1216). L'intention était bonne et le résultat
 * ne l'était pas : sur une machine SANS égaliseur, l'entrée « Égaliseur »
 * restait dans la barre indéfiniment et laissait croire à une fonction
 * disponible. Une entrée qui mène à une porte fermée est pire que pas
 * d'entrée — la règle que la barre applique déjà à Concerts.
 *
 * ⚠️ Ce que ce retrait coûte, et c'est assumé : l'installation en un clic
 * depuis la barre disparaît. Elle reste accessible par l'écran Extensions,
 * qui est le chemin normal de tous les autres greffons.
 */
export function entreeStudioVisible(p: MergedPlugin | undefined): boolean {
  if (!p || typeof p.installed !== 'boolean') return true;
  return p.installed && (p.enabled ?? (p as any).status === 'active');
}

/** Filtre des entrées STUDIO : les vues sans greffon passent toujours. */
export function entreesStudioVisibles<T extends { view: string }>(
  items: T[],
  greffons: Record<string, MergedPlugin> | null,
): T[] {
  if (!greffons) return items;
  return items.filter((it) => {
    const nom = VUES_GREFFONS[it.view];
    return nom === undefined || entreeStudioVisible(greffons[nom]);
  });
}

/** État connu des greffons, indexé par nom ; `null` tant qu'on ne sait rien. */
export const etatGreffons = writable<Record<string, MergedPlugin> | null>(null);

/** Publie une liste déjà lue (l'écran Extensions la relit après chaque geste). */
export function publierGreffons(liste: MergedPlugin[]): void {
  const index: Record<string, MergedPlugin> = {};
  for (const p of liste ?? []) index[p.name] = p;
  etatGreffons.set(index);
}

/** Relit la liste ; une panne laisse l'état tel quel (la barre ne se vide pas). */
export async function rafraichirGreffons(lire: () => Promise<MergedPlugin[]>): Promise<void> {
  try {
    publierGreffons(await lire());
  } catch {
    /* serveur injoignable : on garde ce qu'on savait */
  }
}
