<script lang="ts">
  /** Explication d'un réglage, attachée à SA ligne.
   *
   *  Complète `use:tip` (lib/tooltip.ts) sans le remplacer : cette action-là
   *  pose un `title` natif, parfait pour trois mots sur un bouton. Ici les
   *  explications font deux à trois lignes, doivent s'ouvrir au doigt et se
   *  lire au clavier — trois choses qu'un `title` natif ne sait pas faire.
   *  Même préférence honorée (`tooltipsEnabled`), même contrat : on passe une
   *  CLÉ de traduction, pas un texte.
   *
   *  Les explications vivaient jusqu'ici en bas de section, cinq paragraphes
   *  d'affilée sous cinq interrupteurs : plus rien ne disait laquelle allait
   *  avec quoi (signalement de Bertrand, #409).
   *
   *  Trois contraintes ont dicté la forme :
   *  - la grille des réglages tient en DEUX colonnes ; une explication en
   *    troisième colonne casserait l'alignement, d'où une bulle en surimpression
   *    plutôt qu'un texte dans le flux ;
   *  - le survol n'existe pas au doigt : sur écran tactile, l'icône devient un
   *    bouton qui déplie le texte ;
   *  - une bulle qu'on ne peut pas atteindre au clavier n'existe pas pour qui
   *    n'utilise pas la souris, d'où le focus traité comme le survol.
   *
   *  Respecte la préférence « Bulles d'aide » (`tooltipsEnabled`), déjà offerte
   *  dans Réglages → Général et jusqu'ici sans effet sur cette page.
   */
  import { preferences } from '../lib/stores/preferences';
  import { t } from '../lib/i18n';

  interface Props {
    /** CLÉ de traduction de l'explication — jamais un texte, comme `use:tip`.
     *  Impossible d'oublier la traduction en chemin, et le garde-fou
     *  anti-français-en-dur reste satisfait. */
    k: string;
    /** Clé du libellé du réglage, pour l'étiquette d'accessibilité. */
    labelKey?: string;
  }
  let { k, labelKey = '' }: Props = $props();

  let text = $derived($t(k));
  let label = $derived(labelKey ? $t(labelKey) : '');

  let open = $state(false);
  let hovered = $state(false);
  let enabled = $derived($preferences.tooltipsEnabled !== false);
  let visible = $derived(enabled && (open || hovered));
</script>

{#if enabled && text}
  <span class="hint">
    <button
      type="button"
      class="hint-btn"
      class:on={open}
      aria-expanded={open}
      aria-label={label ? `${label} — aide` : 'aide'}
      onclick={() => (open = !open)}
      onmouseenter={() => (hovered = true)}
      onmouseleave={() => (hovered = false)}
      onfocus={() => (hovered = true)}
      onblur={() => (hovered = false)}
    >
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.6.2-1 .8-1 1.4v.4" />
        <circle cx="12" cy="17" r=".6" fill="currentColor" stroke="none" />
      </svg>
    </button>
    {#if visible}
      <span class="bubble" role="tooltip">{text}</span>
    {/if}
  </span>
{/if}

<style>
  .hint {
    position: relative;
    display: inline-flex;
    align-items: center;
    margin-left: 6px;
    vertical-align: middle;
  }

  .hint-btn {
    background: none;
    border: 0;
    padding: 0;
    display: inline-grid;
    place-items: center;
    color: var(--tune-text-muted);
    cursor: help;
    border-radius: 50%;
  }
  .hint-btn:hover,
  .hint-btn.on,
  .hint-btn:focus-visible {
    color: var(--tune-accent);
  }
  .hint-btn:focus-visible {
    outline: 2px solid var(--tune-accent);
    outline-offset: 2px;
  }

  /* En surimpression : la grille des réglages n'a que deux colonnes, un texte
     dans le flux décalerait tout le reste. */
  .bubble {
    position: absolute;
    left: 0;
    top: calc(100% + 6px);
    z-index: 30;
    width: max-content;
    max-width: min(340px, 70vw);
    background: var(--tune-surface-hover, #2a2a35);
    color: var(--tune-text);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-sm, 6px);
    padding: 8px 10px;
    font-family: var(--font-body);
    font-size: 12.5px;
    line-height: 1.45;
    font-weight: 400;
    white-space: normal;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  }

  /* Écrans étroits : la bulle s'aligne sur le bord gauche de la ligne plutôt
     que de déborder. */
  @media (max-width: 560px) {
    .bubble {
      left: auto;
      right: 0;
      max-width: 78vw;
    }
  }
</style>
