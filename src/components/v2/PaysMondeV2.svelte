<script lang="ts">
  import { t, locale } from '../../lib/i18n';
  import { nomPays, rayonCase, FORCES_PAYS, type PaysMonde } from '../../lib/paysMonde';
  let { donnees, afficher, onAfficher, liste = false }: {
    donnees: PaysMonde; afficher: boolean; onAfficher: (v: boolean) => void; liste?: boolean;
  } = $props();
  const lignes = $derived(Object.entries(donnees.pays).map(([code, n]) => ({ code, n, nom: nomPays(code, $locale) }))
    .sort((a, b) => a.nom.localeCompare(b.nom, $locale)));
  const nombre = (n: number | '<5') => n === '<5' ? $t('v2.circle.worldCountries.lessFive') : new Intl.NumberFormat($locale).format(n);
  const niveaux = $derived([$t('v2.circle.worldCountries.lessFive'), '5–19', '20–99', '100–499',
    $t('v2.circle.worldCountries.more').replace('{n}', new Intl.NumberFormat($locale).format(500))]);
</script>

{#if lignes.length || donnees.cases?.length}
  <section class="pays-monde" aria-label={$t('v2.circle.worldCountries.title')}>
    <button type="button" class="lnk pays-interrupteur" role="switch" aria-checked={afficher}
      onclick={() => onAfficher(!afficher)}>{$t('v2.circle.worldCountries.show')}</button>
    <p class="note">{$t('v2.circle.worldCountries.legend')}</p>
    {#if afficher}
      <ul class="pays-legende" aria-label={$t('v2.circle.worldCountries.legend')}>
        {#each niveaux as label, i}<li><span class="pays-teinte" style:opacity={FORCES_PAYS[i]} aria-hidden="true"></span>{label}</li>{/each}
      </ul>
    {/if}
    {#if afficher}
      <p class="note">{$t('v2.circle.worldCountries.cells')}</p>
      <ul class="pays-legende">{#each [3, 10, 100] as n}<li><span class="case-rond" style:width={`${rayonCase(n) * 2}px`} style:height={`${rayonCase(n) * 2}px`} aria-hidden="true"></span>{n}</li>{/each}</ul>
    {/if}
    <details open={liste}>
      <summary>{$t('v2.circle.worldCountries.list')}</summary>
      <div class="pays-tableau"><table>
        <caption class="sr">{$t('v2.circle.worldCountries.legend')}</caption>
        <thead><tr><th scope="col">{$t('v2.circle.worldCountries.country')}</th><th scope="col">{$t('v2.circle.worldCountries.servers')}</th></tr></thead>
        <tbody>{#each lignes as ligne (ligne.code)}<tr><th scope="row">{ligne.nom}</th><td>{nombre(ligne.n)}</td></tr>{/each}</tbody>
      </table></div>
      {#if donnees.cases?.length}<table><caption>{$t('v2.circle.worldCountries.cells')}</caption>
        <thead><tr><th scope="col">{$t('v2.circle.worldCountries.cell')}</th><th scope="col">{$t('v2.circle.worldCountries.servers')}</th></tr></thead>
        <tbody>{#each donnees.cases as c}<tr><th scope="row">{new Intl.NumberFormat($locale).format(c.lat)}°, {new Intl.NumberFormat($locale).format(c.lng)}°</th><td>{new Intl.NumberFormat($locale).format(c.n)}</td></tr>{/each}</tbody>
      </table>{/if}
    </details>
    <p class="note">{$t('v2.circle.worldCountries.updated').replace('{date}', new Intl.DateTimeFormat($locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(donnees.maj)))}</p>
  </section>
{/if}

<style>
  .case-rond{display:inline-block;border-radius:50%;background:var(--v2-acc2);opacity:.45}
  .pays-monde{padding:12px;border:1px solid var(--v2-line);border-radius:var(--v2-r-md);background:var(--v2-surface2);color:var(--v2-txt)}
  .pays-legende{display:flex;flex-wrap:wrap;gap:8px 16px;list-style:none;padding:0}
  .pays-legende li{display:flex;align-items:center;gap:6px;font-size:12px}
  .pays-teinte{display:inline-block;width:18px;height:12px;background:var(--v2-acc2);border:1px solid currentColor;border-radius:2px}
  .pays-interrupteur[aria-checked='true']{color:var(--v2-acc2)}
  .pays-interrupteur:focus-visible,summary:focus-visible{outline:2px solid var(--v2-acc2);outline-offset:3px}
  summary{cursor:pointer}
  .pays-tableau{max-height:260px;overflow:auto}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--v2-line)}
</style>
