<script lang="ts">
  /**
   * « Lire maintenant », bouton scindé : la moitié gauche lit, la flèche
   * ouvre le menu des gestes — « Lire maintenant » en tête (comme la
   * référence), puis aléatoire, à la suite, en fin de file. Un geste absent
   * (`null`) n'est pas proposé : mieux vaut une entrée absente qu'une entrée
   * morte. Sans autre geste que « lire », pas de flèche.
   */
  import { t } from '../../lib/i18n';
  import IconeSalon from './IconeSalon.svelte';

  let {
    lire,
    aleatoire = null,
    ensuite = null,
    enFile = null,
    desactive = false,
  }: {
    lire: () => void;
    aleatoire?: (() => void) | null;
    ensuite?: (() => void) | null;
    enFile?: (() => void) | null;
    desactive?: boolean;
  } = $props();

  let ouvert = $state(false);
  const autres = $derived([aleatoire, ensuite, enFile].some((f) => f));
  const gestes = $derived([
    { cle: 'roonLike.lire.maintenant', f: lire },
    { cle: 'roonLike.lire.aleatoire', f: aleatoire },
    { cle: 'roonLike.lire.ensuite', f: ensuite },
    { cle: 'roonLike.lire.enFile', f: enFile },
  ].filter((g) => g.f));

  function choisir(f: (() => void) | null) {
    ouvert = false;
    f?.();
  }
</script>

<svelte:window onclick={() => (ouvert = false)} />

<div class="split" data-bouton-lire>
  <button class="principal" disabled={desactive} onclick={lire}>
    <IconeSalon nom="lecture" taille={13} plein trait={1} />
    <span>{$t('roonLike.lire.maintenant' as any)}</span>
  </button>
  {#if autres}
    <button class="fleche" disabled={desactive} aria-haspopup="menu" aria-expanded={ouvert}
      aria-label={$t('roonLike.lire.plus' as any)}
      onclick={(e) => { e.stopPropagation(); ouvert = !ouvert; }}>
      <IconeSalon nom="bas" taille={14} trait={2.2} />
    </button>
  {/if}
  {#if ouvert}
    <div class="s-menu menu" role="menu">
      {#each gestes as g (g.cle)}
        <button role="menuitem" onclick={(e) => { e.stopPropagation(); choisir(g.f); }}>{$t(g.cle as any)}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .split { position: relative; display: inline-flex; height: var(--s-haut-bouton); border-radius: var(--s-r-pilule); background: var(--s-acc); color: var(--s-sur-acc); }
  button { background: none; border: 0; color: inherit; cursor: pointer; font: inherit; }
  button:disabled { opacity: .5; cursor: default; }
  .principal {
    display: inline-flex; align-items: center; gap: 9px;
    padding: 0 22px 0 22px;
    font-size: var(--s-t-corps);
    border-radius: var(--s-r-pilule) 0 0 var(--s-r-pilule);
  }
  .principal:hover, .fleche:hover { background: var(--s-acc-fonce); }
  .fleche {
    width: var(--s-haut-bouton); display: grid; place-items: center;
    border-left: 1px solid var(--s-sur-acc-ligne);
    border-radius: 0 var(--s-r-pilule) var(--s-r-pilule) 0;
  }
  .menu { left: 0; top: calc(100% + 8px); }
</style>
