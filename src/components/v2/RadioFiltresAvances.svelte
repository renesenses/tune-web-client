<script lang="ts">
  /**
   * tune-server-rust#7466 — les critères de recherche de radios, LES MÊMES
   * sur « Mes radios » et sur « Annuaire ». Format, qualité minimale
   * (tune-server-rust#7718), sans perte, haute qualité, Metadata+ et favoris ;
   * le serveur les combine en ET.
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
   * « Haute qualité », la liste « Pays » (rendue par le parent,
   * `pays`), « Tous les formats », « Toute qualité », Metadata+, puis
   * « Effacer ». Les termes :
   *   - « Sans perte » : un flux sans perte par son codec réel ;
   *   - « Haute qualité » : sans perte OU au moins 256 kbit/s (la définition
   *     de Rémi de son « Hi-Res », sous un nom honnête).
   *
   * Retour de Rémi sur la rc12 (go de Bertrand du 17/11) : plus de bouton
   * « Hi-Res » (« n'a aucun sens pour les webradios », une douzaine de
   * stations). Le critère `hires` reste compris du serveur ; le client ne
   * l'envoie plus, et une préférence enregistrée l'oublie
   * (`normaliserFiltresRadio`).
   *
   * Le choix est retenu dans les préférences (`radioFiltres`), comme les
   * autres choix d'affichage : il suit le profil d'un appareil à l'autre.
   */
  import type { Snippet } from 'svelte';
  import { t } from '../../lib/i18n';
  import { preferences } from '../../lib/stores/preferences';
  import {
    DEBITS_RADIO, FILTRES_RADIO_VIDES, FORMATS_RADIO, NIVEAUX_SANS_PERTE_RADIO,
    nombreDeFiltresActifs, nombreDeFiltresPanneau, normaliserFiltresRadio, type FiltresRadio,
  } from '../../lib/radioFiltres';
  import ListFilter from '@lucide/svelte/icons/list-filter';
  import BadgeMetadataPlus from '../partages/BadgeMetadataPlus.svelte';

  interface Props {
    /** Le nombre de stations que montre l'écran sous ces critères. */
    total?: number | null;
    /** La liste « Pays » de l'écran, placée après les boutons. */
    pays?: Snippet;
    /**
     * Harmonisation de l'interface (rc14, maquette `radios.html` validée par
     * Bertrand le 26/11) : sur « Mes radios », les critères quittent la ligne
     * et se rangent dans un panneau « Filtres », ouvert par un bouton qui
     * porte le nombre de filtres actifs. `ligne` (défaut) garde la ligne
     * dépliée de la recette rc12, celle de l'Annuaire.
     */
    disposition?: 'ligne' | 'panneau';
    /**
     * « Mes favoris ». Sur « Mes radios », le segment « Toutes les stations /
     * Favoris » de l'écran le remplace : le bouton n'y est plus (doublon).
     */
    avecFavoris?: boolean;
    /** Filtres que l'écran tient lui-même (le pays), comptés sur la pastille. */
    actifsEcran?: number;
    /** « Réinitialiser » efface aussi ce que l'écran tient lui-même. */
    onEffacer?: () => void;
  }
  let { total = null, pays, disposition = 'ligne', avecFavoris = true, actifsEcran = 0, onEffacer }: Props = $props();

  const filtres = $derived(normaliserFiltresRadio($preferences.radioFiltres));
  const actifs = $derived(nombreDeFiltresActifs(filtres));
  /** La pastille du bouton « Filtres » : les critères du panneau, et eux seuls. */
  const actifsPanneau = $derived(nombreDeFiltresPanneau(filtres, actifsEcran));

  let ouvert = $state(false);
  let ancre = $state<HTMLElement | undefined>(undefined);
  let boutonFiltres = $state<HTMLButtonElement | undefined>(undefined);
  function fermer(rendreLeFocus = false) {
    ouvert = false;
    if (rendreLeFocus) boutonFiltres?.focus();
  }
  /* Le panneau se referme au clic ailleurs et à Échap, comme les autres menus. */
  $effect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      if (ancre && e.target instanceof Node && !ancre.contains(e.target)) fermer();
    };
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') fermer(true); };
    window.addEventListener('pointerdown', dehors);
    window.addEventListener('keydown', touche);
    return () => {
      window.removeEventListener('pointerdown', dehors);
      window.removeEventListener('keydown', touche);
    };
  });

  function poser(patch: Partial<FiltresRadio>) {
    const suivant = { ...filtres, ...patch };
    preferences.update((p) => ({ ...p, radioFiltres: suivant }));
  }
  function effacer() {
    // Sur « Mes radios », « Mes favoris » n'a plus de bouton : on le laisse tel quel.
    const garde = avecFavoris ? {} : { favoris: filtres.favoris };
    preferences.update((p) => ({ ...p, radioFiltres: { ...FILTRES_RADIO_VIDES, ...garde } }));
    onEffacer?.();
  }
</script>

{#snippet bouton(cle: 'favoris' | 'lossless' | 'hauteQualite', libelle: string, bulle: string | null, testid: string)}
  <button type="button" class="bf" class:active={filtres[cle]} aria-pressed={filtres[cle]}
    title={bulle ?? undefined} data-testid={testid}
    onclick={() => poser({ [cle]: !filtres[cle] } as Partial<FiltresRadio>)}>{libelle}</button>
{/snippet}

{#if disposition === 'panneau'}
<div class="rfa" data-testid="radio-filtres-corps">
  <span class="ancre" bind:this={ancre}>
    <button type="button" class="v2-btn bouton-filtres" class:actif={ouvert} bind:this={boutonFiltres}
      aria-haspopup="dialog" aria-expanded={ouvert} data-testid="radio-filtres-bouton"
      onclick={() => (ouvert = !ouvert)}>
      <ListFilter aria-hidden="true" />
      {$t('v2.radio.filters' as any)}
      {#if actifsPanneau}<span class="pastille" data-testid="radio-filtres-pastille">{actifsPanneau}</span>{/if}
    </button>
    {#if ouvert}
      <div class="panneau" role="dialog" aria-label={$t('v2.radio.filters' as any)} data-testid="radio-filtres-panneau">
        {@render pays?.()}
        <span class="tete">{$t('v2.radio.filters.format' as any)}</span>
        <div class="puces">
          <button type="button" class="bf" class:active={filtres.codec == null} aria-pressed={filtres.codec == null}
            data-testid="radio-filtres-format-any" onclick={() => poser({ codec: null })}>{$t('v2.radio.filters.anyFormat' as any)}</button>
          {#each FORMATS_RADIO as f (f)}
            <button type="button" class="bf" class:active={filtres.codec === f} aria-pressed={filtres.codec === f}
              data-testid="radio-filtres-format-{f}"
              onclick={() => poser({ codec: filtres.codec === f ? null : f })}>{f.toUpperCase()}</button>
          {/each}
        </div>
        <span class="tete">{$t('v2.radio.filtersQuality' as any)}</span>
        <div class="puces">
          {@render bouton('lossless', $t('v2.radio.filters.lossless' as any), $t('v2.radio.filters.losslessTip' as any), 'radio-filtres-lossless')}
          {@render bouton('hauteQualite', $t('v2.radio.filters.highQuality' as any), $t('v2.radio.filters.highQualityTip' as any), 'radio-filtres-hq')}
          {#if avecFavoris}{@render bouton('favoris', $t('v2.radio.filters.favorites' as any), null, 'radio-filtres-favoris')}{/if}
        </div>
        <select class="choix large" aria-label={$t('v2.radio.filters.qualityMin' as any)} data-testid="radio-filtres-qualite"
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
        <button type="button" class="interrupteur" role="switch" aria-checked={filtres.metadataPlus}
          data-testid="radio-filtres-mdp" title={$t('v2.radio.metadataPlusTip' as any)}
          onclick={() => poser({ metadataPlus: !filtres.metadataPlus })}>
          <i class:on={filtres.metadataPlus} aria-hidden="true"></i>
          <span class="libelle">{$t('v2.radio.metadataOnly' as any)}
            <small>{$t('v2.radio.metadataOnlyHint' as any)}</small></span>
        </button>
        <div class="pied">
          <button type="button" class="v2-btn fantome" data-testid="radio-filtres-effacer" onclick={effacer}>{$t('v2.radio.filtersReset' as any)}</button>
          <button type="button" class="v2-btn primaire" data-testid="radio-filtres-montrer" onclick={() => fermer(true)}>
            {$t('v2.radio.filtersShowN' as any).replace('{n}', String(total ?? 0))}</button>
        </div>
      </div>
    {/if}
  </span>
  {#if total != null}
    <span class="total compte" data-testid="radio-filtres-total">{$t('v2.radio.dir.count' as any).replace('{n}', String(total))}</span>
  {/if}
</div>
{:else}
<div class="rfa" data-testid="radio-filtres-corps">
  {@render bouton('favoris', $t('v2.radio.filters.favorites' as any), null, 'radio-filtres-favoris')}
  {@render bouton('lossless', $t('v2.radio.filters.lossless' as any), $t('v2.radio.filters.losslessTip' as any), 'radio-filtres-lossless')}
  {@render bouton('hauteQualite', $t('v2.radio.filters.highQuality' as any), $t('v2.radio.filters.highQualityTip' as any), 'radio-filtres-hq')}
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
{/if}

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
  /* Le badge n'a plus de cadre (rc12) : le seul cadre est celui du bouton. */
  .bf.badge{line-height:1}
  .bf.badge.active :global(.mdp){color:var(--v2-on-acc)}
  @media (max-width: 640px){ .choix{max-width:none; flex:1} }

  /* ── Panneau « Filtres » (harmonisation rc14, maquette radios.html) ────
     Une seule hauteur de commande (36 px), puces de 32 px ; tailles, rayons,
     graisses et polices lus dans fondations.css, couleurs dans --v2-*. */
  .ancre{position:relative; display:inline-flex}
  .bouton-filtres{gap:8px; height:36px; font-size:var(--taille-5)}
  .bouton-filtres.actif{border-color:var(--v2-acc1); color:var(--v2-acc1)}
  .bouton-filtres :global(svg){width:16px; height:16px}
  .pastille{display:inline-grid; place-items:center; min-width:20px; height:20px; padding:0 5px;
    border-radius:var(--rayon-plein); background:var(--v2-acc1); color:var(--v2-on-acc);
    font:var(--graisse-grasse) var(--taille-2) var(--police-chiffres)}
  .compte{margin-left:auto; font:var(--taille-4) var(--police-chiffres); color:var(--v2-txt3)}
  .panneau{position:absolute; top:calc(100% + 8px); left:0; z-index:20; width:360px; max-width:calc(100vw - 32px);
    display:flex; flex-direction:column; padding:16px; border-radius:var(--rayon-3);
    max-height:calc(100vh - 240px); overflow-y:auto; overscroll-behavior:contain;
    background:var(--v2-surface); border:1px solid var(--v2-line2); box-shadow:var(--v2-sh-menu); color:var(--v2-txt)}
  .tete, .panneau :global(.rfp-tete){display:block; margin:14px 0 8px; font:var(--graisse-forte) var(--taille-2) var(--police-texte);
    letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .panneau > :global(:first-child), .panneau > :global(:first-child .rfp-tete){margin-top:0}
  .puces{display:flex; flex-wrap:wrap; gap:6px}
  .puces .bf{height:32px; padding:0 14px; font-size:var(--taille-4)}
  .puces .bf.active{color:var(--v2-acc1); border-color:var(--v2-acc1); background:var(--v2-active1)}
  .choix.large{max-width:none; width:100%; margin-top:8px; height:36px; font-size:var(--taille-4); border-radius:var(--rayon-2)}
  .interrupteur{display:flex; align-items:center; gap:10px; margin-top:14px; padding:0; border:0; background:none;
    color:var(--v2-txt); text-align:left; cursor:pointer; font:var(--taille-4) var(--police-texte)}
  .interrupteur i{position:relative; flex:none; width:34px; height:20px; border-radius:var(--rayon-plein);
    background:var(--v2-line2); transition:background .15s}
  .interrupteur i::after{content:""; position:absolute; left:2px; top:2px; width:16px; height:16px;
    border-radius:50%; background:var(--v2-txt2); transition:transform .15s}
  .interrupteur i.on{background:var(--v2-acc1)}
  .interrupteur i.on::after{transform:translateX(14px); background:var(--v2-on-acc)}
  .interrupteur small{display:block; color:var(--v2-txt3); font-size:var(--taille-3)}
  .interrupteur:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px; border-radius:var(--rayon-2)}
  .pied{display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:16px;
    padding-top:12px; border-top:1px solid var(--v2-line)}
  .pied .v2-btn{height:36px; font-size:var(--taille-4)}
  .pied .fantome{background:transparent; border-color:transparent}
  /* Écran étroit : le panneau prend la largeur de la ligne des outils
     (le parent est positionné), et non celle de son bouton. */
  @media (max-width: 640px){
    .ancre{position:static}
    .panneau{left:0; right:0; width:auto; max-width:none}
    .compte{margin-left:0}
  }
</style>
