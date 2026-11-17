<script lang="ts">
  /**
   * tune-server-rust#8935 — « Titres recommandés » sous une playlist TIDAL :
   * ce que TIDAL propose d'après la playlist (`playlists/{uuid}/
   * recommendations/items`), dix à la fois. « Autres suggestions » passe à la
   * page suivante ; une page vide garde la section et propose « Revenir au
   * début ». Rien ne s'affiche pour un mix, un autre service, une première
   * réponse vide ou une route absente.
   *
   * Lecture : le titre cliqué puis ceux qui le suivent dans la liste, vers la
   * zone choisie, comme toute liste de titres.
   */
  import { untrack } from 'svelte';
  import * as api from '../../lib/api';
  import { t as tr } from '../../lib/i18n';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { gestesDeZone } from '../../lib/gestesDeZone';
  import { lireListeDepuis } from '../../lib/lectureEnMasse';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import ListePistesV2 from './ListePistesV2.svelte';
  import {
    chargerRecommandations, decalageSuivant, pageEpuisee, proposeDesRecommandations, type PageRecommandes,
  } from '../../lib/pourVousTidal';

  let { service, playlist }: { service: string; playlist: { source_id?: unknown } } = $props();

  /** L'identifiant, pas l'objet : une fiche relue (même playlist, nouvel
   *  objet) ne recharge pas les suggestions et ne les ramène pas au début. */
  const idPlaylist = $derived(typeof playlist?.source_id === 'string' ? playlist.source_id : '');
  const visible = $derived(proposeDesRecommandations(service, { source_id: idPlaylist }));

  let page = $state<PageRecommandes | null>(null);
  let enCours = $state(false);
  /** Le jeton de la dernière demande : une réponse dépassée est ignorée. */
  let demande = 0;

  function charger(offset: number) {
    const svc = service;
    const id = idPlaylist;
    const jeton = ++demande;
    enCours = true;
    void chargerRecommandations(svc, { source_id: id }, offset, api.getStreamingPlaylistRecommendations).then((p) => {
      if (jeton !== demande) return;
      page = p;
      enCours = false;
    });
  }
  $effect(() => {
    const voir = visible;
    // Seuls le service et l'identifiant déclenchent un rechargement.
    void service; void idPlaylist;
    untrack(() => {
      page = null;
      if (voir) charger(0);
    });
  });

  const suivant = $derived(page ? decalageSuivant(page) : null);
  const epuisee = $derived(pageEpuisee(page));

  function lireDepuis(i: number) {
    const zid = zoneRequise();
    if (zid == null || !page) return;
    lireListeDepuis(page.tracks as any, i, gestesDeZone(zid)).catch(signalerEchecLecture);
  }
</script>

{#if visible && (page?.tracks.length || epuisee)}
  <section class="reco" data-titres-recommandes>
    <div class="tete">
      <h3>{$tr('v2.stream.recommendedTracks' as any)}</h3>
      {#if epuisee}
        <button type="button" class="lnk" data-revenir-au-debut disabled={enCours}
          onclick={() => charger(0)}>{$tr('v2.stream.recommendedRestart' as any)}</button>
      {:else if suivant != null}
        <button type="button" class="lnk" data-autres-suggestions disabled={enCours}
          onclick={() => charger(suivant)}>{$tr('v2.stream.recommendedMore' as any)}</button>
      {/if}
    </div>
    <p class="indice">{$tr('v2.stream.recommendedHint' as any).replace('{s}', 'TIDAL')}</p>
    {#if page?.tracks.length}
      <ListePistesV2 pistes={page.tracks as any} numerotation="aucune" pochetteEnTableau
        onLire={(_p, i) => lireDepuis(i)} onLireDepuis={(_p, i) => lireDepuis(i)}
        clef={(_p, i) => i} />
    {/if}
  </section>
{/if}

<style>
  .reco{margin-top:28px; padding-top:18px; border-top:1px solid var(--v2-line)}
  .tete{display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap}
  h3{font-size:calc(15px * var(--v2-txt-echelle, 1)); font-weight:700; color:var(--v2-txt); margin:0}
  .indice{color:var(--v2-txt3); font-size:calc(12px * var(--v2-txt-echelle, 1)); margin:4px 0 10px}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt); border-radius:999px;
    padding:6px 12px; font-size:calc(13px * var(--v2-txt-echelle, 1)); cursor:pointer; min-height:32px}
  .lnk:hover:not(:disabled){border-color:var(--v2-accent, var(--v2-txt2))}
  .lnk:disabled{opacity:.5; cursor:default}
</style>
