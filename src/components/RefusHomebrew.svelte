<script lang="ts">
  /**
   * Le refus Homebrew, RENDU — avec la commande à taper.
   *
   * Un seul composant pour les trois emplacements (bandeau Système et section
   * À propos du client actuel, section À propos du client v2) : la commande et
   * l'avertissement de divergence doivent dire la même chose partout, et trois
   * copies de balisage divergent toujours.
   */
  import { t } from '../lib/i18n';
  import type { RefusHomebrew } from '../lib/miseAJourHomebrew';

  let { refus }: { refus: RefusHomebrew } = $props();

  const divergence = $derived(
    $t('settings.homebrewMismatch')
      .replace('{binaire}', refus.versionBinaire || '?')
      .replace('{cellar}', refus.versionCellar || '?'),
  );
  const blocage = $derived(
    $t('settings.homebrewCannotSelfUpdate').replace('{detail}', refus.detailBlocage),
  );
</script>

<div class="hb" data-test="refus-homebrew">
  {#if refus.echec}
    <p class="hb-divergence">{refus.echec}</p>
  {/if}
  {#if refus.divergence}
    <p class="hb-divergence">{divergence}</p>
  {/if}
  <p class="hb-texte">{$t('settings.homebrewManaged')}</p>
  {#if !refus.peutSeMettreAJourSeul && refus.detailBlocage}
    <p class="hb-texte">{blocage}</p>
  {/if}
  <pre class="hb-commande"><code>{refus.commande}</code></pre>
</div>

<style>
  .hb {
    margin-top: 0.6rem;
    padding: 0.7rem 0.85rem;
    border: 1px solid rgba(255, 176, 32, 0.45);
    border-radius: 8px;
    background: rgba(255, 176, 32, 0.08);
    font-size: 0.9rem;
    line-height: 1.45;
  }
  .hb-divergence {
    margin: 0 0 0.5rem;
    font-weight: 600;
  }
  .hb-texte {
    margin: 0 0 0.5rem;
  }
  .hb-commande {
    margin: 0;
    padding: 0.5rem 0.6rem;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.28);
    overflow-x: auto;
    white-space: pre;
  }
  .hb-commande code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.86rem;
    user-select: all;
  }
</style>
