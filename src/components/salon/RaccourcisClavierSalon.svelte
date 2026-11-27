<script lang="ts">
  /**
   * Réglages › Raccourcis clavier (Roon-like seulement, 27/11/2026) : le
   * tableau des raccourcis qui EXISTENT déjà dans le client — ceux de
   * `lib/keyboard.ts` (lecture), de `lib/memoireNavigation.ts` (navigation)
   * et de la recherche des Réglages. Aucun raccourci nouveau ici.
   */
  import { t } from '../../lib/i18n';
  import { RACCOURCIS_ROON_LIKE } from '../../lib/interfaceSalon';
</script>

<section class="raccourcis" data-reglages-raccourcis>
  <h2>{$t('roonLike.raccourcis.titre' as any)}</h2>
  <table>
    <thead><tr><th>{$t('roonLike.raccourcis.action' as any)}</th><th>{$t('roonLike.raccourcis.touches' as any)}</th></tr></thead>
    <tbody>
      {#each RACCOURCIS_ROON_LIKE as r (r.cle)}
        <tr>
          <td>{$t(`roonLike.raccourcis.${r.cle}` as any)}</td>
          <td>{#each r.touches as combinaison, i (i)}{#if i}<span class="ou"> · </span>{/if}{#each combinaison as k, j (j)}{#if j}+{/if}<kbd>{k}</kbd>{/each}{/each}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

<style>
  .raccourcis { padding: 8px 0 32px; }
  h2 { margin: 0 0 18px; font-size: var(--s-t-section); font-weight: 400; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: var(--s-t-mini); letter-spacing: .05em; text-transform: uppercase; color: var(--s-txt2); padding: 8px 0; border-bottom: 1px solid var(--s-line); }
  td { padding: 12px 0; border-bottom: 1px solid var(--s-line); font-size: var(--s-t-texte); }
  td:last-child { white-space: nowrap; }
  kbd {
    display: inline-block; min-width: 22px; padding: 2px 7px; margin: 0 2px; text-align: center;
    border: 1px solid var(--s-line); border-radius: var(--s-r-pochette); background: var(--s-tuile);
    font-family: var(--s-police-texte); font-size: var(--s-t-mini);
  }
  .ou { color: var(--s-txt3); }
</style>
