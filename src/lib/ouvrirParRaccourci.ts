/**
 * Ouvrir un objet PRÉCIS d'un autre écran — playlist, playlist intelligente,
 * collection — depuis les Favoris ou les Étiquettes.
 *
 * On ne se contente PAS d'aller sur la liste : c'est exactement le défaut que
 * Bertrand avait signalé le 05/09/2026 pour les raccourcis (« je sélectionne
 * une smart collection et le raccourci me renvoie sur la liste »). Les écrans
 * cibles savent déjà rouvrir un élément précis — ils écoutent
 * `tune:shortcut-restore`, avec une clé qui porte le TYPE (`playlists:12`,
 * `smartplaylists:12`, `smartcollections:1`). On rejoue ce chemin plutôt que
 * d'en inventer un second.
 *
 * `FavoritesV2` porte la même mécanique en propre (`ouvrirAilleurs`) : ses
 * gardes en lisent le texte, elle y reste. L'écran Étiquettes est la deuxième
 * surface à en avoir besoin (#4798) : c'est d'ici qu'il la prend.
 *
 * `tick()` est nécessaire : l'écran cible n'est pas encore monté au moment du
 * changement de vue, et son écouteur n'existe donc pas encore. Émettre tout de
 * suite ne toucherait personne.
 */
import { tick } from 'svelte';
import { activeView, type View } from './stores/navigation';

export async function ouvrirParRaccourci(
  vue: Extract<View, 'playlists' | 'smartplaylists' | 'collections'>,
  cle: string,
  id: number,
  nom: string,
): Promise<void> {
  activeView.set(vue);
  await tick();
  window.dispatchEvent(
    new CustomEvent('tune:shortcut-restore', {
      detail: { target: { key: cle, restore: { id, name: nom }, label: nom } },
    }),
  );
}

/**
 * Ouvrir une playlist INTELLIGENTE dans son onglet. La clé porte
 * `smartplaylists:` et jamais `playlists:` — les deux tables partagent leurs
 * identifiants, et `SmartPlaylistsView` n'écoute que son propre préfixe.
 */
export function ouvrirSmartPlaylist(sp: { id?: number | null; name?: string | null }): void {
  if (sp?.id == null) return;
  void ouvrirParRaccourci('smartplaylists', `smartplaylists:${sp.id}`, sp.id, sp.name ?? '');
}

/**
 * Ouvrir un DOSSIER ou une collection INTELLIGENTE dans l'écran Collections
 * (#4798, second volet). La clé porte la SORTE — `collections:` ou
 * `smartcollections:` — et jamais le numéro seul : les deux espaces
 * d'identifiants se recouvrent (l'id 1 est à la fois « favorites » et
 * « Audiophile »), et `CollectionsV2` apparie par la clé ET la sorte. La sorte
 * vient de la ROUTE qui a rendu la ligne, pas d'une déduction.
 */
export function ouvrirCollection(c: {
  id?: number | null;
  name?: string | null;
  smart?: boolean;
}): void {
  if (c?.id == null) return;
  void ouvrirParRaccourci(
    'collections',
    `${c.smart ? 'smartcollections' : 'collections'}:${c.id}`,
    c.id,
    c.name ?? '',
  );
}
