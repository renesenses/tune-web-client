<!--
  tune-server-rust#6288 — MetaRust, « Albums manquants » : la discographie
  MusicBrainz de l'artiste (Album et EP), moins la bibliothèque.

  Rien ne part à l'ouverture de la fiche : la comparaison se demande (bouton),
  parce que sa première lecture va au rythme de MusicBrainz. Live et
  compilations sont exclus par défaut (choix prudent, à valider) ; une case
  les ajoute.
-->
<script lang="ts">
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { anneeDe, cleEtat, lienMusicBrainz, reponseDEchec, type ReponseManquants } from '../../lib/albumsManquants';

  interface Props {
    artistId: number;
  }
  let { artistId }: Props = $props();

  let reponse = $state<ReponseManquants | null>(null);
  let enCours = $state(false);
  let avecSecondaires = $state(false);
  let jeton = 0;

  // Un autre artiste : on repart de zéro.
  $effect(() => {
    void artistId;
    jeton++;
    reponse = null;
    enCours = false;
  });

  async function comparer() {
    const j = ++jeton;
    enCours = true;
    try {
      const r = await api.getArtistMissingAlbums(artistId, avecSecondaires);
      if (j === jeton) reponse = r;
    } catch (e) {
      if (j === jeton) reponse = reponseDEchec(e);
    } finally {
      if (j === jeton) enCours = false;
    }
  }
</script>

<section class="manquants" data-albums-manquants>
  <h3>{$t('v2.manquants.titre')}</h3>
  <div class="gestes">
    <button class="ghost" onclick={comparer} disabled={enCours}>
      {$t(enCours ? 'v2.manquants.chargement' : 'v2.manquants.afficher')}
    </button>
    <label class="option">
      <input type="checkbox" bind:checked={avecSecondaires} onchange={() => { if (reponse) void comparer(); }} />
      {$t('v2.manquants.avecSecondaires')}
    </label>
  </div>
  {#if reponse}
    <p class="etat">
      {$t(cleEtat(reponse))
        .replace('{n}', String(reponse.manquants?.length ?? 0))
        .replace('{total}', String(reponse.retenus ?? 0))
        .replace('{possedes}', String(reponse.possedes ?? 0))}
    </p>
    {#if reponse.tronquee}
      <p class="etat">{$t('v2.manquants.tronquee')}</p>
    {/if}
    {#if reponse.statut === 'ok' && reponse.manquants?.length}
      <ul>
        {#each reponse.manquants as g (g.mbid)}
          {@const lien = lienMusicBrainz(g.mbid)}
          <li>
            <span class="titre">{g.titre}</span>
            {#if anneeDe(g.premiere_sortie)}<span class="annee">{anneeDe(g.premiere_sortie)}</span>{/if}
            {#if g.type_primaire}<span class="type">{[g.type_primaire, ...(g.types_secondaires ?? [])].join(' · ')}</span>{/if}
            {#if lien}<a href={lien} target="_blank" rel="noopener noreferrer external">{$t('v2.manquants.voirMb')}</a>{/if}
          </li>
        {/each}
      </ul>
      <p class="attribution">{$t('v2.manquants.source')}</p>
    {/if}
  {/if}
</section>

<style>
  .manquants { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
  .manquants h3 { margin: 0; }
  .gestes { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .ghost {
    padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;
    background: transparent; color: var(--tune-text);
    border: 1px solid var(--tune-border, rgba(127, 127, 127, 0.3));
  }
  .ghost:disabled { opacity: 0.5; cursor: default; }
  .option { font-size: 12px; display: flex; align-items: center; gap: 6px; }
  .etat, .attribution { margin: 0; font-size: 13px; color: var(--tune-text-muted); }
  .attribution { font-size: 11px; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  li { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
  .titre { font-weight: 600; }
  .annee, .type { color: var(--tune-text-muted); }
  li a { color: var(--tune-accent); }
</style>
