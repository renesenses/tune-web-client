<script lang="ts">
  /**
   * « Focus » de Salon : les filtres de Tune (facettes de la bibliothèque),
   * dans un panneau déroulant sous la ligne Focus — genre, format, qualité,
   * favoris. Les valeurs viennent du serveur (`/library/facets`), comme dans
   * Oxygen ; l'écran qui l'accueille reçoit les facettes prêtes à envoyer.
   *
   * « Jamais écoutés » n'est pas proposé ici : le serveur n'a pas de facette
   * d'écoutes pour la bibliothèque entière (il l'est sur la fiche album).
   */
  import { t, locale } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import type { FacetParam, FacetValue } from '../../lib/api';

  let { ouvert, onchange }: {
    ouvert: boolean;
    onchange: (f: { facettes: Record<string, FacetParam>; favoris: boolean }) => void;
  } = $props();

  let genres = $state<FacetValue[]>([]);
  let formats = $state<FacetValue[]>([]);
  let frequences = $state<FacetValue[]>([]);
  let genre = $state('');
  let format = $state('');
  let qualite = $state<'' | 'hires' | 'standard'>('');
  let favoris = $state(false);
  let charge = false;

  $effect(() => {
    if (!ouvert || charge) return;
    charge = true;
    api.getLibraryFacets(['genre', 'format', 'sample_rate'], undefined, 0).then((f) => {
      genres = f.genre ?? [];
      formats = f.format ?? [];
      frequences = f.sample_rate ?? [];
    }).catch(() => {});
  });

  /** Hi-Res : toute fréquence au-delà de 48 kHz ; Standard : jusqu'à 48 kHz. */
  function frequencesDe(q: 'hires' | 'standard'): string[] {
    return frequences.map((f) => f.value).filter((v) => (Number(v) > 48000) === (q === 'hires'));
  }

  function publier() {
    const facettes: Record<string, FacetParam> = {};
    if (genre) facettes.genre = genre;
    if (format) facettes.format = format;
    if (qualite) {
      const v = frequencesDe(qualite);
      facettes.sample_rate = v.length ? v : ['0'];
    }
    onchange({ facettes, favoris });
  }

  function effacer() {
    genre = ''; format = ''; qualite = ''; favoris = false;
    publier();
  }

  const actifs = $derived(!!(genre || format || qualite || favoris));
</script>

{#if ouvert}
  <div class="focus-panneau" data-focus-salon>
    <label>
      <span>{$t('salon.focus.genre' as any)}</span>
      <select bind:value={genre} onchange={publier}>
        <option value="">{$t('salon.focus.tous' as any)}</option>
        {#each genres as g (g.value)}<option value={g.value}>{g.value} ({g.count.toLocaleString($locale)})</option>{/each}
      </select>
    </label>
    <label>
      <span>{$t('salon.focus.format' as any)}</span>
      <select bind:value={format} onchange={publier}>
        <option value="">{$t('salon.focus.tous' as any)}</option>
        {#each formats as f (f.value)}<option value={f.value}>{f.value.toUpperCase()}</option>{/each}
      </select>
    </label>
    <label>
      <span>{$t('salon.focus.qualite' as any)}</span>
      <select bind:value={qualite} onchange={publier}>
        <option value="">{$t('salon.focus.tous' as any)}</option>
        <option value="hires">{$t('salon.focus.hires' as any)}</option>
        <option value="standard">{$t('salon.focus.standard' as any)}</option>
      </select>
    </label>
    <button class="s-puce" aria-pressed={favoris} onclick={() => { favoris = !favoris; publier(); }}>{$t('salon.focus.favoris' as any)}</button>
    {#if actifs}<button class="effacer" onclick={effacer}>{$t('salon.focus.effacer' as any)}</button>{/if}
  </div>
{/if}

<style>
  .focus-panneau {
    display: flex; flex-wrap: wrap; align-items: flex-end; gap: 14px 22px;
    padding: 14px 16px; margin: -12px 0 26px;
    background: var(--s-tuile); border: 1px solid var(--s-bord-tuile); border-radius: var(--s-r-pop);
  }
  label { display: flex; flex-direction: column; gap: 4px; font-size: var(--s-t-mini); color: var(--s-txt2); text-transform: uppercase; letter-spacing: var(--s-interlettre-capitales); }
  select {
    font: inherit; text-transform: none; letter-spacing: 0; font-size: var(--s-t-petit); color: var(--s-txt);
    background: var(--s-bg); border: 1px solid var(--s-line); border-radius: var(--s-r-item); padding: 6px 8px; min-width: 150px;
  }
  .s-puce[aria-pressed="true"] { background: var(--s-acc); color: var(--s-sur-acc); }
  .effacer { background: none; border: 0; cursor: pointer; font: inherit; font-size: var(--s-t-petit); color: var(--s-acc-texte); padding: 6px 0; }
</style>
