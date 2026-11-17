<script lang="ts">
  /**
   * tune-server-rust#8935 — « Titres recommandés » sous une playlist TIDAL :
   * ce que TIDAL propose d'après la playlist (`playlists/{uuid}/
   * recommendations/items`), dix à la fois. « Autres suggestions » passe aux
   * dix suivants, puis revient au début. Rien ne s'affiche pour un mix, un
   * autre service, une réponse vide ou une route absente.
   *
   * Lecture : le titre cliqué puis ceux qui le suivent dans la liste, vers la
   * zone choisie, comme toute liste de titres.
   */
  import * as api from '../../lib/api';
  import { t as tr } from '../../lib/i18n';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { gestesDeZone } from '../../lib/gestesDeZone';
  import { lireListeDepuis } from '../../lib/lectureEnMasse';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import ListePistesV2 from './ListePistesV2.svelte';
  import {
    chargerRecommandations, decalageSuivant, proposeDesRecommandations, type PageRecommandes,
  } from '../../lib/pourVousTidal';

  let { service, playlist }: { service: string; playlist: { source_id?: unknown } } = $props();

  let page = $state<PageRecommandes | null>(null);
  let enCours = $state(false);
  const visible = $derived(proposeDesRecommandations(service, playlist));

  function charger(offset: number) {
    const svc = service;
    const pl = playlist;
    enCours = true;
    void chargerRecommandations(svc, pl, offset, api.getStreamingPlaylistRecommendations).then((p) => {
      if (svc !== service || pl !== playlist) return;
      page = p;
      enCours = false;
    });
  }
  $effect(() => {
    if (!visible) { page = null; return; }
    charger(0);
  });

  const suivant = $derived(page ? decalageSuivant(page) : null);

  function lireDepuis(i: number) {
    const zid = zoneRequise();
    if (zid == null || !page) return;
    lireListeDepuis(page.tracks as any, i, gestesDeZone(zid)).catch(signalerEchecLecture);
  }
</script>

{#if visible && page?.tracks.length}
  <section class="reco" data-titres-recommandes>
    <div class="tete">
      <h3>{$tr('v2.stream.recommendedTracks' as any)}</h3>
      {#if suivant != null}
        <button type="button" class="lnk" data-autres-suggestions disabled={enCours}
          onclick={() => charger(suivant)}>{$tr('v2.stream.recommendedMore' as any)}</button>
      {/if}
    </div>
    <p class="indice">{$tr('v2.stream.recommendedHint' as any).replace('{s}', 'TIDAL')}</p>
    <ListePistesV2 pistes={page.tracks as any} numerotation="aucune" pochetteEnTableau
      onLire={(_p, i) => lireDepuis(i)} onLireDepuis={(_p, i) => lireDepuis(i)}
      clef={(_p, i) => i} />
  </section>
{/if}

<style>
  .reco{margin-top:28px; padding-top:18px; border-top:1px solid var(--v2-line)}
  .tete{display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap}
  h3{font-size:calc(15px * var(--v2-txt-echelle, 1)); font-weight:700; color:var(--v2-txt); margin:0}
  .indice{color:var(--v2-txt3); font-size:12px; margin:4px 0 10px}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt); border-radius:999px;
    padding:6px 12px; font-size:13px; cursor:pointer; min-height:32px}
  .lnk:hover:not(:disabled){border-color:var(--v2-accent, var(--v2-txt2))}
  .lnk:disabled{opacity:.5; cursor:default}
</style>
