<script lang="ts">
  /**
   * tune-server-rust#8077 — « Compléments Qobuz » de la fiche d'un album de
   * la BIBLIOTHÈQUE : ce que Qobuz a complété sans rien écraser (label, date,
   * UPC, ℗ et ©, genres, récompenses, hi-res, livret, pochette HD, crédits),
   * chaque ligne avec sa source. Un rapprochement douteux se confirme ; tous
   * les apports se retirent d'un geste.
   *
   * Rien ne s'affiche tant qu'il n'y a ni apport ni confirmation à proposer :
   * un album jamais retrouvé chez Qobuz garde sa fiche telle quelle.
   */
  import { t as tr } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import {
    confirmable,
    creditsQobuz,
    lignesApports,
    retirable,
    type ApportsQobuz,
  } from '../../lib/apportsQobuz';

  interface Props {
    albumId: number;
  }
  let { albumId }: Props = $props();

  let apports = $state.raw<ApportsQobuz | null>(null);
  let credits = $state.raw<ReturnType<typeof creditsQobuz>>([]);
  let enCours = $state(false);
  let erreur = $state<string | null>(null);
  let retire = $state(false);

  async function charger(id: number) {
    const a = await api.getApportsQobuz(id).catch(() => null);
    if (id !== albumId) return;
    apports = a;
    credits = a?.statut === 'applique'
      ? creditsQobuz(await api.getAlbumCredits(id).catch(() => []) as any)
      : [];
  }

  $effect(() => {
    apports = null;
    credits = [];
    retire = false;
    erreur = null;
    void charger(albumId);
  });

  const lignes = $derived(lignesApports(apports));

  async function retirer() {
    enCours = true;
    erreur = null;
    try {
      await api.retirerApportsQobuz(albumId);
      retire = true;
      await charger(albumId);
    } catch (e) {
      erreur = e instanceof Error ? e.message : String(e);
    } finally {
      enCours = false;
    }
  }

  async function confirmer() {
    const id = apports?.service_album_id;
    if (!id) return;
    enCours = true;
    erreur = null;
    try {
      await api.confirmerApportsQobuz(albumId, id);
      await charger(albumId);
    } catch (e) {
      erreur = e instanceof Error ? e.message : String(e);
    } finally {
      enCours = false;
    }
  }
</script>

{#if lignes.length || credits.length || confirmable(apports) || retire}
  <section class="apports-qobuz" data-apports-qobuz aria-labelledby="apports-qobuz-titre-{albumId}">
    <h3 id="apports-qobuz-titre-{albumId}">{$tr('v2.album.qobuz.title' as any)}</h3>
    {#if confirmable(apports)}
      <p class="a-confirmer">{$tr('v2.album.qobuz.toConfirm' as any)}</p>
      <div class="gestes">
        <button class="ghost" data-confirmer-qobuz onclick={confirmer} disabled={enCours}>
          {$tr('v2.album.qobuz.confirm' as any)}
        </button>
        {#if apports?.service_url}
          <a class="ghost" href={apports.service_url} target="_blank" rel="noopener noreferrer">
            {$tr('v2.album.qobuz.openOnQobuz' as any)}
          </a>
        {/if}
      </div>
    {/if}
    {#if lignes.length}
      <dl>
        {#each lignes as l, i (i)}
          <div class="ligne">
            {#if l.cle}<dt>{$tr(l.cle as any)}</dt>{/if}
            <dd>
              {#if l.url}
                <a href={l.url} target="_blank" rel="noopener noreferrer">{l.texte || $tr(l.cle as any)}</a>
              {:else}
                {l.texte}
              {/if}
              <span class="source" data-source={l.source}>{$tr('v2.album.qobuz.source' as any)}</span>
            </dd>
          </div>
        {/each}
      </dl>
    {/if}
    {#if credits.length}
      <h4>{$tr('v2.album.qobuz.credits' as any)}</h4>
      <ul class="credits">
        {#each credits as c (c.nom + c.role)}
          <li>
            {c.nom}{c.role ? ` — ${c.role}` : ''}{c.pistes.length ? ` (${c.pistes.join(', ')})` : ''}
            <span class="source" data-source="qobuz">{$tr('v2.album.qobuz.source' as any)}</span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if retirable(apports)}
      <button class="ghost" data-retirer-qobuz onclick={retirer} disabled={enCours}>
        {$tr('v2.album.qobuz.remove' as any)}
      </button>
    {:else if retire}
      <p role="status">{$tr('v2.album.qobuz.removed' as any)}</p>
    {/if}
    {#if erreur}<p role="alert">{erreur}</p>{/if}
  </section>
{/if}

<style>
  .apports-qobuz { margin: 1rem 0; padding: .75rem 1rem; border: 1px solid var(--tune-border, rgba(127,127,127,.25)); border-radius: 8px; }
  h3 { margin: 0 0 .5rem; font-size: 1rem; }
  h4 { margin: .75rem 0 .25rem; font-size: .9rem; }
  dl { margin: 0; display: grid; gap: .25rem; }
  .ligne { display: flex; gap: .5rem; flex-wrap: wrap; }
  dt { font-weight: 600; min-width: 9rem; }
  dd { margin: 0; }
  .credits { margin: 0; padding-left: 1.2rem; }
  .source { margin-left: .4rem; font-size: .75rem; opacity: .7; }
  .gestes { display: flex; gap: .5rem; margin: .25rem 0 .5rem; flex-wrap: wrap; }
  .a-confirmer { margin: 0 0 .25rem; }
</style>
