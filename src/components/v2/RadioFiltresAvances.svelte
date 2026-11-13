<script lang="ts">
  /**
   * tune-server-rust#7466 — les critères de recherche de radios, LES MÊMES
   * sur « Mes radios » et sur « Annuaire ». Format, qualité minimale
   * (tune-server-rust#7718), sans perte, Hi-Res, Metadata+ et favoris ; le
   * serveur les combine en ET.
   *
   * Recette rc12 (13/11) : plus de bouton « Plus de filtres » ni de barre
   * repliée. Les critères sont toujours visibles, sur la MÊME ligne que la
   * recherche et le filtre « Pays » : la racine est en `display: contents`,
   * ses champs deviennent des éléments de la ligne flexible du parent, qui
   * passe à la ligne sur un écran étroit. Ordre au clavier : recherche, pays,
   * format, qualité, cases, puis « Effacer ».
   *
   * Le choix est retenu dans les préférences (`radioFiltres`), comme les
   * autres choix d'affichage : il suit le profil d'un appareil à l'autre.
   */
  import { t } from '../../lib/i18n';
  import { preferences } from '../../lib/stores/preferences';
  import {
    DEBITS_RADIO, FILTRES_RADIO_VIDES, FORMATS_RADIO, NIVEAUX_SANS_PERTE_RADIO,
    nombreDeFiltresActifs, normaliserFiltresRadio, type FiltresRadio,
  } from '../../lib/radioFiltres';
  import BadgeMetadataPlus from '../partages/BadgeMetadataPlus.svelte';

  interface Props {
    /** Le nombre de stations que montre l'écran sous ces critères. */
    total?: number | null;
  }
  let { total = null }: Props = $props();

  const filtres = $derived(normaliserFiltresRadio($preferences.radioFiltres));
  const actifs = $derived(nombreDeFiltresActifs(filtres));

  function poser(patch: Partial<FiltresRadio>) {
    const suivant = { ...filtres, ...patch };
    preferences.update((p) => ({ ...p, radioFiltres: suivant }));
  }
  function effacer() {
    preferences.update((p) => ({ ...p, radioFiltres: { ...FILTRES_RADIO_VIDES } }));
  }
</script>

<div class="rfa" data-testid="radio-filtres-corps">
  <select class="choix" aria-label={$t('v2.radio.filters.format' as any)}
    value={filtres.codec ?? ''}
    onchange={(e) => poser({ codec: (e.currentTarget as HTMLSelectElement).value || null })}>
    <option value="">{$t('v2.radio.filters.anyFormat' as any)}</option>
    {#each FORMATS_RADIO as f (f)}
      <option value={f}>{f.toUpperCase()}</option>
    {/each}
  </select>
  <select class="choix" aria-label={$t('v2.radio.filters.qualityMin' as any)} data-testid="radio-filtres-qualite"
    value={filtres.qualiteMin ?? ''}
    onchange={(e) => poser({ qualiteMin: (e.currentTarget as HTMLSelectElement).value || null })}>
    <option value="">{$t('v2.radio.filters.anyQuality' as any)}</option>
    {#each DEBITS_RADIO as d (d)}
      <option value={String(d)}>{$t('v2.radio.filters.kbps' as any).replace('{n}', String(d))}</option>
    {/each}
    {#each NIVEAUX_SANS_PERTE_RADIO as [v, q] (v)}
      <option value={v}>{$t('v2.radio.filters.flac' as any).replace('{q}', q)}</option>
    {/each}
  </select>
  <label class="case"><input type="checkbox" checked={filtres.lossless}
    onchange={(e) => poser({ lossless: (e.currentTarget as HTMLInputElement).checked })} />
    {$t('v2.radio.filters.lossless' as any)}</label>
  <label class="case"><input type="checkbox" checked={filtres.hires} data-testid="radio-filtres-hires"
    onchange={(e) => poser({ hires: (e.currentTarget as HTMLInputElement).checked })} />
    {$t('v2.radio.filters.hires' as any)}</label>
  <label class="case"><input type="checkbox" checked={filtres.metadataPlus} data-testid="radio-filtres-mdp"
    onchange={(e) => poser({ metadataPlus: (e.currentTarget as HTMLInputElement).checked })} />
    <BadgeMetadataPlus /></label>
  <label class="case"><input type="checkbox" checked={filtres.favoris}
    onchange={(e) => poser({ favoris: (e.currentTarget as HTMLInputElement).checked })} />
    {$t('v2.radio.filters.favorites' as any)}</label>
  {#if actifs}
    <button class="lien" onclick={effacer} data-testid="radio-filtres-effacer">{$t('v2.radio.filters.reset' as any)}</button>
  {/if}
  {#if total != null}
    <span class="total" data-testid="radio-filtres-total">{$t('v2.radio.dir.count' as any).replace('{n}', String(total))}</span>
  {/if}
</div>

<style>
  /* Les champs rejoignent la ligne flexible du parent (recherche, pays). */
  .rfa{display:contents}
  .total{font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3)}
  .lien{background:none; border:0; padding:0; cursor:pointer; color:var(--v2-acc2); font:600 calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .lien:hover{text-decoration:underline}
  .choix{background:var(--v2-surface2); color:var(--v2-txt); border:1px solid var(--v2-line2);
    border-radius:var(--v2-r-pill); padding:6px 12px; font:600 calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); max-width:220px}
  .case{display:inline-flex; align-items:center; gap:6px; font:600 calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt2); cursor:pointer}
  @media (max-width: 640px){ .choix{max-width:none; flex:1} }
</style>
