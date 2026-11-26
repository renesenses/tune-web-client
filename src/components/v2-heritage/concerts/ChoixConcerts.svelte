<script lang="ts" generics="V extends string | number">
  import { onDestroy, tick } from 'svelte';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Check from '@lucide/svelte/icons/check';
  import Search from '@lucide/svelte/icons/search';

  /**
   * Liste déroulante au style Tune, à la place du `<select>` natif de l'écran
   * Concerts (maquette `concerts.html`, 26/11/2026) : le libellé est DANS le
   * champ (« Pays France ⌄ »), la liste s'ouvre en panneau, avec une recherche
   * quand `recherche` est fourni (la liste des pays en compte une quarantaine).
   *
   * Propre à cet écran : aucun autre ne l'importe.
   */
  interface Option { valeur: V; libelle: string }
  interface Props {
    options: Option[];
    valeur: V;
    /** Libellé affiché dans le champ, avant la valeur, et nom accessible. */
    libelle: string;
    /** Texte d'appel de la recherche ; absent : pas de recherche. */
    recherche?: string;
    /** Filtre appliqué à la recherche ; par défaut, le libellé contient la saisie. */
    filtrer?: (options: Option[], requete: string) => Option[];
    /** Texte quand la recherche ne trouve rien. */
    aucun?: string;
    disabled?: boolean;
    /** Valeur affichée mais sans effet (rayon sans commune localisée). */
    inactif?: boolean;
    /** Valeur en chiffres : rendue en monospace. */
    chiffres?: boolean;
    onchoisir?: (v: V) => void;
  }
  let {
    options, valeur = $bindable(), libelle, recherche, filtrer, aucun = '',
    disabled = false, inactif = false, chiffres = false, onchoisir,
  }: Props = $props();

  let ouvert = $state(false);
  let requete = $state('');
  let surligne = $state(0);
  let racine: HTMLDivElement | undefined = $state();
  let champ: HTMLInputElement | undefined = $state();
  const id = `cc-choix-${Math.random().toString(36).slice(2, 9)}`;

  let visibles = $derived(
    !recherche || !requete.trim()
      ? options
      : filtrer
        ? filtrer(options, requete)
        : options.filter((o) => o.libelle.toLowerCase().includes(requete.trim().toLowerCase())),
  );
  let courant = $derived(options.find((o) => o.valeur === valeur));

  function fermerDehors(e: PointerEvent) {
    if (racine && !racine.contains(e.target as Node)) ouvert = false;
  }
  $effect(() => {
    if (!ouvert) return;
    document.addEventListener('pointerdown', fermerDehors, true);
    return () => document.removeEventListener('pointerdown', fermerDehors, true);
  });
  onDestroy(() => document.removeEventListener('pointerdown', fermerDehors, true));

  async function basculer() {
    if (disabled) return;
    ouvert = !ouvert;
    if (!ouvert) return;
    requete = '';
    surligne = Math.max(0, options.findIndex((o) => o.valeur === valeur));
    await tick();
    champ?.focus();
  }

  function choisir(o: Option) {
    ouvert = false;
    if (o.valeur === valeur) return;
    valeur = o.valeur;
    onchoisir?.(o.valeur);
  }

  function clavier(e: KeyboardEvent) {
    if (!ouvert) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void basculer(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); ouvert = false; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); surligne = Math.min(visibles.length - 1, surligne + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); surligne = Math.max(0, surligne - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = visibles[surligne]; if (o) choisir(o); }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="cc-choix" class:ouvert bind:this={racine} onkeydown={clavier}>
  <button
    type="button"
    class="cc-champ cc-choix-bouton"
    class:cc-inactif={inactif}
    aria-haspopup="listbox"
    aria-expanded={ouvert}
    aria-controls={id}
    aria-label={libelle}
    {disabled}
    onclick={basculer}
  >
    <span class="cc-champ-pre">{libelle}</span>
    <span class="cc-choix-valeur" class:cc-chiffres={chiffres}>{courant?.libelle ?? ''}</span>
    <span class="cc-choix-chevron" aria-hidden="true"><ChevronDown size={16} /></span>
  </button>
  {#if ouvert}
    <div class="cc-choix-panneau">
      {#if recherche}
        <label class="cc-champ cc-choix-recherche">
          <span aria-hidden="true"><Search size={16} /></span>
          <input
            bind:this={champ}
            bind:value={requete}
            oninput={() => (surligne = 0)}
            placeholder={recherche}
            aria-label={recherche}
            aria-controls={id}
            aria-activedescendant={visibles[surligne] ? `${id}-${surligne}` : undefined}
          />
        </label>
      {/if}
      <ul class="cc-choix-liste" role="listbox" {id} aria-label={libelle} tabindex="-1">
        {#each visibles as o, i (o.valeur)}
          <li
            id={`${id}-${i}`}
            role="option"
            class="cc-choix-option"
            class:sel={o.valeur === valeur}
            class:hl={i === surligne}
            aria-selected={o.valeur === valeur}
            data-valeur={o.valeur}
            onpointerenter={() => (surligne = i)}
            onclick={() => choisir(o)}
            onkeydown={(e) => { if (e.key === 'Enter') choisir(o); }}
          >
            <span class:cc-chiffres={chiffres}>{o.libelle}</span>
            {#if o.valeur === valeur}<span class="cc-choix-coche" aria-hidden="true"><Check size={16} /></span>{/if}
          </li>
        {:else}
          <li class="cc-choix-vide">{aucun}</li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .cc-choix { position: relative; flex: none; }
  .cc-champ {
    height: 36px; border-radius: var(--rayon-plein); background: var(--v2-surface2);
    border: 1px solid var(--v2-line2); display: flex; align-items: center; gap: 8px;
    padding: 0 14px; color: var(--v2-txt); font: inherit; font-size: var(--taille-4);
  }
  .cc-choix-bouton { width: 100%; cursor: pointer; text-align: left; }
  .cc-choix-bouton:disabled { cursor: default; opacity: .6; }
  .cc-choix.ouvert .cc-choix-bouton,
  .cc-choix-bouton:focus-visible {
    outline: none; border-color: var(--v2-acc1); box-shadow: 0 0 0 3px var(--v2-focus);
  }
  .cc-champ-pre { color: var(--v2-txt3); font-size: var(--taille-3); font-weight: var(--graisse-forte); white-space: nowrap; }
  .cc-choix-valeur { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .cc-chiffres { font-family: var(--v2-mono); font-variant-numeric: tabular-nums; }
  .cc-choix-chevron { margin-left: auto; display: inline-flex; color: var(--v2-txt3); transition: transform .15s; }
  .cc-choix.ouvert .cc-choix-chevron { transform: rotate(180deg); }
  .cc-inactif .cc-choix-valeur { opacity: .55; }
  .cc-choix-panneau {
    position: absolute; left: 0; top: calc(100% + 8px); z-index: 30; min-width: 100%; width: max-content;
    max-width: min(320px, calc(100vw - 32px));
    background: var(--v2-surface); border: 1px solid var(--v2-line2); border-radius: var(--rayon-3);
    box-shadow: var(--v2-sh-menu); padding: 6px;
  }
  .cc-choix-recherche { margin: 2px 2px 6px; height: 34px; color: var(--v2-txt3); }
  .cc-choix-recherche input {
    flex: 1; min-width: 0; background: none; border: 0; outline: none; color: var(--v2-txt);
    font: inherit; font-size: var(--taille-4);
  }
  .cc-choix-liste { list-style: none; margin: 0; padding: 0; max-height: 280px; overflow-y: auto; }
  .cc-choix-option {
    display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 10px;
    border-radius: var(--rayon-2); font-size: var(--taille-4); color: var(--v2-txt); cursor: pointer;
    white-space: nowrap;
  }
  .cc-choix-option.hl { background: var(--v2-hover); }
  .cc-choix-option.sel { color: var(--v2-acc1); font-weight: var(--graisse-forte); }
  .cc-choix-coche { margin-left: auto; display: inline-flex; color: var(--v2-acc1); }
  .cc-choix-vide { padding: 8px 10px; color: var(--v2-txt3); font-size: var(--taille-3); }
</style>
