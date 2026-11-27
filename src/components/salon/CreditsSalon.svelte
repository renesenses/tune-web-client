<script lang="ts">
  /**
   * Onglet CRÉDITS de l'album, mise en page de la référence (27/11/2026) :
   * les interprètes en portraits ronds, rôles dessous ; la production et le
   * reste en colonnes de noms. Sans crédit, la fiche de Tune (`CreditsTiroir`)
   * reprend la main : elle porte l'état vide et le bouton d'enrichissement.
   */
  import { onMount } from 'svelte';
  import { t, locale } from '../../lib/i18n';
  import { blocsDeCredits, libelleLigne, type CreditAvecPiste } from '../../lib/library/credits';
  import { chargerCreditsAlbum, type PisteDeLAlbum } from '../../lib/library/chargerCredits';
  import { personnesDesCredits } from '../../lib/interfaceSalon';
  import { allerA } from '../../lib/stores/salon';
  import CreditsTiroir from '../partages/CreditsTiroir.svelte';
  import RondArtisteSalon from './RondArtisteSalon.svelte';

  let { albumId, titre = null, artiste = null, pistes, onFermer }: {
    albumId: number; titre?: string | null; artiste?: string | null; pistes: PisteDeLAlbum[]; onFermer: () => void;
  } = $props();

  let credits = $state<CreditAvecPiste[] | null>(null);
  onMount(() => {
    chargerCreditsAlbum(albumId, pistes).then((c) => { credits = Array.isArray(c) ? c : []; }).catch(() => { credits = []; });
  });

  const blocs = $derived(credits ? blocsDeCredits(credits, $locale) : []);
  const traduire = (k: string) => $t(k as any);
</script>

{#if credits === null}
  <p class="s-vide">{$t('roonLike.chargement' as any)}</p>
{:else if !blocs.length}
  <CreditsTiroir enLigne onClose={onFermer} cible={{ type: 'album', albumId, titre, artiste, pistes }} />
{:else}
  <div class="credits-salon">
    {#each blocs as bloc (bloc.famille)}
      {@const personnes = personnesDesCredits(bloc.lignes, (l) => libelleLigne(l, traduire))}
      <section data-famille={bloc.famille}>
        <h2>{$t(`credits.block.${bloc.famille}` as any)}</h2>
        {#if bloc.famille === 'interpretes'}
          <div class="portraits">
            {#each personnes as p (p.cle)}
              <button class="personne" disabled={p.artist_id == null}
                onclick={() => { if (p.artist_id != null) allerA({ page: 'artiste', id: p.artist_id }); }}>
                <RondArtisteSalon nom={p.nom} />
                <span class="nom" title={p.nom}>{p.nom}</span>
                <span class="roles" title={p.roles.join(', ')}>{p.roles.join(', ')}</span>
              </button>
            {/each}
          </div>
        {:else}
          <div class="colonnes">
            {#each personnes as p (p.cle)}
              <div class="ligne">
                {#if p.artist_id != null}
                  <button class="nom lien" title={p.nom} onclick={() => allerA({ page: 'artiste', id: p.artist_id! })}>{p.nom}</button>
                {:else}<span class="nom" title={p.nom}>{p.nom}</span>{/if}
                <span class="roles" title={p.roles.join(', ')}>{p.roles.join(', ')}</span>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  </div>
{/if}

<style>
  .credits-salon { display: flex; flex-direction: column; gap: 40px; }
  h2 { margin: 0 0 20px; font-size: var(--s-t-section); font-weight: 400; border-bottom: 1px solid var(--s-line); padding-bottom: 10px; }
  button { background: none; border: 0; font: inherit; color: inherit; cursor: pointer; padding: 0; text-align: inherit; }
  button:disabled { cursor: default; }
  /* Portraits : 6 par rangée sur le bureau, 5 sur tablette, 3 au téléphone. */
  .portraits { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 28px var(--s-ecart-rangee); }
  .personne { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; min-width: 0; }
  .personne :global(.rond) { width: 78%; margin-bottom: 8px; }
  .personne:not(:disabled):hover .nom { color: var(--s-acc-texte); }
  .nom, .roles { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nom { font-size: var(--s-t-texte); }
  .roles { font-size: var(--s-t-mini); color: var(--s-txt2); }
  .colonnes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px var(--s-ecart-rangee); }
  .ligne { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .lien:hover { color: var(--s-acc-texte); }
  @media (max-width: 1366px) { .portraits { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
  @media (max-width: 1024px) { .colonnes { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 743px) {
    .portraits { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .colonnes { grid-template-columns: 1fr; }
  }
</style>
