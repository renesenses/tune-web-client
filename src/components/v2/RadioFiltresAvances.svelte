<script lang="ts">
  /**
   * tune-server-rust#7466 — « Plus de filtres » : la barre repliable des
   * critères de recherche de radios, LA MÊME sur « Mes radios » et sur
   * « Annuaire ». Format, débit minimal, sans perte, Hi-Res, Metadata+ et
   * favoris ; le serveur les combine en ET.
   *
   * Le choix est retenu dans les préférences (`radioFiltres`), comme les
   * autres choix d'affichage : il suit le profil d'un appareil à l'autre.
   * La barre se replie, mais reste ouverte d'elle-même quand un critère est
   * actif, pour qu'un filtre ne cache jamais des stations sans le dire.
   */
  import { t } from '../../lib/i18n';
  import { preferences } from '../../lib/stores/preferences';
  import {
    DEBITS_RADIO, FILTRES_RADIO_VIDES, FORMATS_RADIO,
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
  let ouvert = $state(false);
  const deplie = $derived(ouvert || actifs > 0);

  function poser(patch: Partial<FiltresRadio>) {
    const suivant = { ...filtres, ...patch };
    preferences.update((p) => ({ ...p, radioFiltres: suivant }));
  }
  function effacer() {
    preferences.update((p) => ({ ...p, radioFiltres: { ...FILTRES_RADIO_VIDES } }));
  }
</script>

<div class="rfa">
  <div class="tete">
    <button class="v2-btn bascule" class:on={deplie} aria-expanded={deplie}
      onclick={() => (ouvert = !deplie)} data-testid="radio-filtres-bascule">
      {$t('v2.radio.filters.toggle' as any)}{#if actifs} <span class="n">{actifs}</span>{/if}
    </button>
    {#if total != null}
      <span class="total" data-testid="radio-filtres-total">{$t('v2.radio.dir.count' as any).replace('{n}', String(total))}</span>
    {/if}
    {#if actifs}
      <button class="lien" onclick={effacer}>{$t('v2.radio.filters.reset' as any)}</button>
    {/if}
  </div>
  {#if deplie}
    <div class="corps" data-testid="radio-filtres-corps">
      <select class="choix" aria-label={$t('v2.radio.filters.format' as any)}
        value={filtres.codec ?? ''}
        onchange={(e) => poser({ codec: (e.currentTarget as HTMLSelectElement).value || null })}>
        <option value="">{$t('v2.radio.filters.anyFormat' as any)}</option>
        {#each FORMATS_RADIO as f (f)}
          <option value={f}>{f.toUpperCase()}</option>
        {/each}
      </select>
      <select class="choix" aria-label={$t('v2.radio.filters.bitrateMin' as any)}
        value={filtres.bitrateMin == null ? '' : String(filtres.bitrateMin)}
        onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; poser({ bitrateMin: v ? Number(v) : null }); }}>
        <option value="">{$t('v2.radio.filters.anyBitrate' as any)}</option>
        {#each DEBITS_RADIO as d (d)}
          <option value={String(d)}>{$t('v2.radio.filters.kbps' as any).replace('{n}', String(d))}</option>
        {/each}
      </select>
      <label class="case"><input type="checkbox" checked={filtres.lossless}
        onchange={(e) => poser({ lossless: (e.currentTarget as HTMLInputElement).checked })} />
        {$t('v2.radio.filters.lossless' as any)}</label>
      <label class="case"><input type="checkbox" checked={filtres.hires}
        onchange={(e) => poser({ hires: (e.currentTarget as HTMLInputElement).checked })} />
        {$t('v2.radio.filters.hires' as any)}</label>
      <label class="case"><input type="checkbox" checked={filtres.metadataPlus} data-testid="radio-filtres-mdp"
        onchange={(e) => poser({ metadataPlus: (e.currentTarget as HTMLInputElement).checked })} />
        <BadgeMetadataPlus /></label>
      <label class="case"><input type="checkbox" checked={filtres.favoris}
        onchange={(e) => poser({ favoris: (e.currentTarget as HTMLInputElement).checked })} />
        {$t('v2.radio.filters.favorites' as any)}</label>
    </div>
  {/if}
</div>

<style>
  .rfa{display:flex; flex-direction:column; gap:8px}
  .tete{display:flex; flex-wrap:wrap; align-items:center; gap:10px}
  .bascule .n{font:700 9.5px var(--v2-mono); margin-left:4px; padding:0 5px; border-radius:var(--v2-r-pill);
    background:var(--v2-acc2); color:var(--v2-on-acc)}
  .total{font:11px var(--v2-mono); color:var(--v2-txt3)}
  .lien{background:none; border:0; padding:0; cursor:pointer; color:var(--v2-acc2); font:600 11.5px var(--v2-sans)}
  .lien:hover{text-decoration:underline}
  .corps{display:flex; flex-wrap:wrap; gap:8px 14px; align-items:center}
  .choix{background:var(--v2-surface2); color:var(--v2-txt); border:1px solid var(--v2-line2);
    border-radius:var(--v2-r-pill); padding:6px 12px; font:600 11.5px var(--v2-sans); max-width:220px}
  .case{display:inline-flex; align-items:center; gap:6px; font:600 11.5px var(--v2-sans); color:var(--v2-txt2); cursor:pointer}
  @media (max-width: 640px){ .choix{max-width:none; flex:1} }
</style>
