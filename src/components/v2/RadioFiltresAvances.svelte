<script lang="ts">
  /**
   * tune-server-rust#7466 — les critères de recherche de radios, LES MÊMES
   * sur « Mes radios » et sur « Annuaire ». Format, qualité minimale
   * (tune-server-rust#7718), sans perte, haute qualité, Hi-Res, Metadata+ et
   * favoris ; le serveur les combine en ET.
   *
   * Recette rc12 (13/11) : plus de bouton « Plus de filtres » ni de barre
   * repliée. Les critères sont toujours visibles, sur la MÊME ligne que la
   * recherche : la racine est en `display: contents`, ses champs deviennent
   * des éléments de la ligne flexible du parent, qui passe à la ligne sur un
   * écran étroit.
   *
   * Recette rc12 (14/11, Rémi ; décision de Bertrand « deux boutons, termes
   * justes ») : des BOUTONS qui changent de couleur, comme les genres, et non
   * des cases à cocher. Ordre de la ligne : « Mes favoris », « Sans perte »,
   * « Haute qualité », « Hi-Res », la liste « Pays » (rendue par le parent,
   * `pays`), « Tous les formats », « Toute qualité », Metadata+, puis
   * « Effacer ». Les termes :
   *   - « Sans perte » : un flux sans perte par son codec réel ;
   *   - « Haute qualité » : sans perte OU au moins 256 kbit/s (la définition
   *     de Rémi de son « Hi-Res », sous un nom honnête) ;
   *   - « Hi-Res » : sans perte ET au-delà de 48 kHz.
   *
   * Le choix est retenu dans les préférences (`radioFiltres`), comme les
   * autres choix d'affichage : il suit le profil d'un appareil à l'autre.
   */
  import type { Snippet } from 'svelte';
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
    /** La liste « Pays » de l'écran, placée après les boutons. */
    pays?: Snippet;
  }
  let { total = null, pays }: Props = $props();

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

{#snippet bouton(cle: 'favoris' | 'lossless' | 'hauteQualite' | 'hires', libelle: string, bulle: string | null, testid: string)}
  <button type="button" class="bf" class:active={filtres[cle]} aria-pressed={filtres[cle]}
    title={bulle ?? undefined} data-testid={testid}
    onclick={() => poser({ [cle]: !filtres[cle] } as Partial<FiltresRadio>)}>{libelle}</button>
{/snippet}

<div class="rfa" data-testid="radio-filtres-corps">
  {@render bouton('favoris', $t('v2.radio.filters.favorites' as any), null, 'radio-filtres-favoris')}
  {@render bouton('lossless', $t('v2.radio.filters.lossless' as any), $t('v2.radio.filters.losslessTip' as any), 'radio-filtres-lossless')}
  {@render bouton('hauteQualite', $t('v2.radio.filters.highQuality' as any), $t('v2.radio.filters.highQualityTip' as any), 'radio-filtres-hq')}
  {@render bouton('hires', $t('v2.radio.filters.hires' as any), $t('v2.radio.filters.hiresTip' as any), 'radio-filtres-hires')}
  {@render pays?.()}
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
  <button type="button" class="bf badge" class:active={filtres.metadataPlus} aria-pressed={filtres.metadataPlus}
    data-testid="radio-filtres-mdp" title={$t('v2.radio.metadataPlusTip' as any)}
    onclick={() => poser({ metadataPlus: !filtres.metadataPlus })}><BadgeMetadataPlus /></button>
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
  /* Les mêmes boutons que les genres (RadioChipsGenres). */
  .bf{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer; white-space:nowrap;
    font:600 calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); padding:6px 12px; border-radius:var(--v2-r-pill); transition:.15s}
  .bf:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .bf.active{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .bf.badge{padding:5px 10px; line-height:1}
  .bf.badge.active :global(.mdp){color:var(--v2-on-acc); border-color:var(--v2-on-acc)}
  @media (max-width: 640px){ .choix{max-width:none; flex:1} }
</style>
