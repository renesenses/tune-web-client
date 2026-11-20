<script lang="ts">
  // Tune Circle rc13 — tous les cercles du monde, anonymes, par pays et en
  // tranches (décisions du 20/11/2026). Aucun nom, aucun identifiant : le code
  // pays et deux tranches, rien d'autre. Mes cercles n'y sont pas comptés.
  import { t, locale } from '../../lib/i18n';
  import { FORCES_PAYS, nomPays } from '../../lib/paysMonde';
  import type { CerclesPays, Tranche } from '../../lib/cerclesMonde';
  let { pays, afficher, onAfficher, liste = false }: {
    pays: CerclesPays[]; afficher: boolean; onAfficher: (v: boolean) => void; liste?: boolean;
  } = $props();
  const lignes = $derived(pays.map((p) => ({ ...p, nom: nomPays(p.code, $locale) }))
    .sort((a, b) => a.nom.localeCompare(b.nom, $locale)));
  const nombre = (n: number) => new Intl.NumberFormat($locale).format(n);
  /** Les tranches de la carte /world, dites comme elle. */
  const libelle = (tr: Tranche) => tr === '<5' ? $t('v2.circle.worldCountries.lessFive')
    : tr === '500+' ? $t('v2.circle.worldCountries.more').replace('{n}', nombre(500))
    : tr.split('-').map((x) => nombre(Number(x))).join('–');
  const niveaux = $derived((['<5', '5-19', '20-99', '100-499', '500+'] as Tranche[]).map(libelle));
</script>

{#if lignes.length}
  <section class="cercles-monde" aria-label={$t('v2.circle.worldCircles.title' as any)}>
    <p class="titre">{$t('v2.circle.worldCircles.title' as any)}</p>
    <button type="button" class="lnk cercles-interrupteur" role="switch" aria-checked={afficher}
      onclick={() => onAfficher(!afficher)}>{$t('v2.circle.worldCircles.show' as any)}</button>
    <p class="note">{$t('v2.circle.worldCircles.legend' as any)}</p>
    {#if afficher}
      <ul class="legende" aria-label={$t('v2.circle.worldCircles.circles' as any)}>
        {#each niveaux as label, i}<li><span class="teinte" style:opacity={FORCES_PAYS[i]} aria-hidden="true"></span>{label}</li>{/each}
      </ul>
    {/if}
    <details open={liste}>
      <summary>{$t('v2.circle.worldCountries.list')}</summary>
      <div class="tableau"><table>
        <caption class="sr">{$t('v2.circle.worldCircles.title' as any)}</caption>
        <thead><tr>
          <th scope="col">{$t('v2.circle.worldCountries.country')}</th>
          <th scope="col">{$t('v2.circle.worldCircles.circles' as any)}</th>
          <th scope="col">{$t('v2.circle.worldCircles.members' as any)}</th>
        </tr></thead>
        <tbody>{#each lignes as l (l.code)}<tr><th scope="row">{l.nom}</th><td>{libelle(l.cercles)}</td><td>{libelle(l.membres)}</td></tr>{/each}</tbody>
      </table></div>
    </details>
  </section>
{/if}

<style>
  .cercles-monde{margin-top:8px;padding:12px;border:1px solid var(--v2-line);border-radius:var(--v2-r-md);background:var(--v2-surface2);color:var(--v2-txt);
    font-family:var(--v2-sans);font-size:calc(13px * var(--v2-txt-echelle, 1))}
  .titre{margin:0 0 4px;font-weight:600}
  .lnk{border:0;background:transparent;padding:4px 0;cursor:pointer;color:var(--v2-acc-tint);font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .note{margin:8px 0 4px;font-size:calc(11.5px * var(--v2-txt-echelle, 1));color:var(--v2-txt3)}
  .legende{display:flex;flex-wrap:wrap;gap:8px 16px;list-style:none;padding:0}
  .legende li{display:flex;align-items:center;gap:6px;font-size:calc(12px * var(--v2-txt-echelle, 1))}
  .teinte{display:inline-block;width:18px;height:12px;background:var(--v2-acc2);border:1px solid currentColor;border-radius:2px}
  .cercles-interrupteur[aria-checked='true']{color:var(--v2-acc2)}
  .cercles-interrupteur:focus-visible,summary:focus-visible{outline:2px solid var(--v2-acc2);outline-offset:3px}
  summary{cursor:pointer}
  .tableau{max-height:260px;overflow:auto}
  table{border-collapse:collapse;width:100%;font-size:calc(13px * var(--v2-txt-echelle, 1))}
  th,td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--v2-line)}
  .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
</style>
