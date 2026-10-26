<script lang="ts">
  /**
   * tune-web-client#2417 — le motif technique d'un refus du serveur, REPLIÉ.
   *
   * Un écran qui affiche son erreur dans la page (pas en bandeau) montre sa
   * phrase traduite ; le texte brut du serveur (souvent français, ou recopié
   * d'un service tiers) ne s'affiche jamais hors de ce repli. Même rendu que
   * le « Détails » des bandeaux (`ToastContainer`). Rien si pas de détail.
   *
   * Usage : `<DetailsServeur detail={detailServeur(e)} />`
   * (`detailServeur` : `lib/messageServeur.ts`).
   */
  import { t } from '../../lib/i18n';

  let { detail }: { detail?: string | null } = $props();
  const texte = $derived((detail ?? '').trim());
</script>

{#if texte}
  <details class="details-serveur" data-details-serveur>
    <summary>{$t('erreursServeur.details' as any)}</summary>
    <code>{texte}</code>
  </details>
{/if}

<style>
  .details-serveur {
    margin-top: 4px;
    font-size: 12px;
    opacity: 0.85;
  }
  .details-serveur summary { cursor: pointer; }
  .details-serveur code {
    display: block;
    margin-top: 2px;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 8em;
    overflow: auto;
  }
</style>
