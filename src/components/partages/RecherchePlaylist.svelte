<script lang="ts">
  /**
   * Le champ « Rechercher une playlist » des fenêtres d'ajout à une playlist
   * (Bertrand, 13/10/2026). Un seul composant, posé en haut de la liste de
   * CHAQUE sélecteur : `AddToPlaylistModal` (playlists Tune et de service) et
   * `AjoutPlaylistCercleV2` (playlists de cercle). Le filtre lui-même est dans
   * `lib/filtrePlaylists.ts`.
   *
   * Le champ prend le focus à l'ouverture : on tape tout de suite. Entrée est
   * remonté au parent (`onEntree`), qui sait quoi choisir ou créer.
   */
  import { t } from '../../lib/i18n';

  interface Props {
    valeur: string;
    onEntree?: () => void;
  }
  let { valeur = $bindable(''), onEntree }: Props = $props();

  function focusAuto(el: HTMLInputElement) {
    // Après le montage : la fenêtre vient d'apparaître.
    queueMicrotask(() => el.focus());
  }

  function surTouche(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEntree?.();
    }
  }
</script>

<div class="recherche-playlist">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
  <input
    type="search"
    class="champ-recherche-playlist"
    data-testid="recherche-playlist"
    placeholder={$t('playlist.searchPlaceholder')}
    aria-label={$t('playlist.searchPlaceholder')}
    autocomplete="off"
    spellcheck="false"
    bind:value={valeur}
    onkeydown={surTouche}
    use:focusAuto
  />
</div>

<style>
  .recherche-playlist {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: 1px solid var(--v2-line, var(--tune-border));
    border-radius: var(--radius-sm, 6px);
    background: var(--v2-surface2, var(--tune-bg));
    color: var(--v2-txt3, var(--tune-text-muted));
  }
  .recherche-playlist:focus-within {
    border-color: var(--v2-acc, var(--tune-accent));
  }
  .champ-recherche-playlist {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--v2-txt, var(--tune-text));
    font-family: var(--v2-sans, var(--font-body));
    font-size: 13px;
  }
</style>
