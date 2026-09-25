<script lang="ts">
  /**
   * Le tiroir latéral partagé : fond, panneau à droite, en-tête et bouton de
   * fermeture. Sorti de `TrackTagsDrawer` (« Tous les champs piste », #851)
   * pour servir aussi la fiche de crédits (#1572) — un seul tiroir, pas deux
   * copies qui divergeraient d'apparence.
   *
   * `porte` : porté à la racine du document (`portail`). La fiche de crédits
   * s'ouvre depuis une LIGNE de piste, et les lignes de la Bibliothèque portent
   * `content-visibility: auto`, qui enfermerait un `position: fixed` dans la
   * ligne (voir `lib/portail`). Hors de son arbre, le tiroir perdrait les
   * variables du thème v2 : il reprend donc la classe `tune-v2` quand il est
   * ouvert depuis la nouvelle interface. Facultatif, pour ne rien changer au
   * tiroir des champs, qui se monte en place depuis toujours.
   */
  import type { Snippet } from 'svelte';
  import { t } from '../../lib/i18n';
  import { portail } from '../../lib/portail';

  interface Props {
    titre: string;
    onClose: () => void;
    /** Sous le titre : de quoi situer ce qu'on regarde. */
    entete?: Snippet;
    children: Snippet;
    /** Porter le tiroir à la racine du document — voir l'en-tête. */
    porte?: boolean;
  }
  let { titre, onClose, entete, children, porte = false }: Props = $props();

  function porter(node: HTMLElement) {
    if (!porte) return;
    if (node.parentElement?.closest('.tune-v2')) node.classList.add('tune-v2');
    return portail(node);
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="modal-backdrop" use:porter onclick={handleBackdropClick} onkeydown={handleKeydown}>
  <div class="drawer" role="dialog" aria-modal="true" aria-label={titre}>
    <div class="drawer-header">
      <div class="drawer-titres">
        <h3>{titre}</h3>
        {#if entete}{@render entete()}{/if}
      </div>
      <button class="close-btn" onclick={onClose} title={$t('common.close')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
    {@render children()}
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex; justify-content: flex-end;
    z-index: 220;
    animation: fade 0.15s ease-out;
  }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }

  .drawer {
    background: var(--tune-surface);
    border-left: 1px solid var(--tune-border);
    width: 480px; max-width: 96vw; height: 100vh;
    display: flex; flex-direction: column;
    animation: slideR 0.22s cubic-bezier(0.2, 0.7, 0.2, 1);
    box-shadow: -8px 0 32px rgba(0, 0, 0, 0.25);
  }
  @keyframes slideR { from { transform: translateX(100%); } to { transform: translateX(0); } }

  .drawer-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--tune-border);
  }
  .drawer-titres { min-width: 0; }
  .drawer-header h3 { font-size: 16px; font-weight: 600; margin: 0; }
  .close-btn {
    background: none; border: none; color: var(--tune-text-muted);
    cursor: pointer; padding: 4px; display: inline-flex;
  }
  .close-btn:hover { color: var(--tune-text); }
</style>
