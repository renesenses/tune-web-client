<script lang="ts">
  /**
   * Historique d'écoute — écran du nouveau client.
   *
   * Signalé manquant par Bertrand le 05/09/2026 : « Sidebar : manque
   * Historique ». L'écran existait dans le client actuel et la vue `history`
   * était bien déclarée, mais la coquille v2 ne la montait pas et la barre
   * latérale n'y menait pas — écrit, pas branché.
   *
   * Toute la logique — fusion des deux historiques, déduplication, rejeu à
   * quatre chemins, favoris de radio — vit dans `lib/historiqueLecture`,
   * partagée avec l'écran du client actuel. Ici, il n'y a que l'écran.
   */
  import * as api from '../../lib/api';
  import { playbackHistory, type HistoryEntry } from '../../lib/stores/history';
  import { currentZoneId } from '../../lib/stores/zones';
  import { currentTrackId } from '../../lib/stores/nowPlaying';
  import { notifications } from '../../lib/stores/notifications';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { formatDuration } from '../../lib/utils';
  import { t as tr } from '../../lib/i18n';
  import AlbumArt from '../AlbumArt.svelte';
  import {
    entreesDepuisServeur,
    fusionnerHistorique,
    estRadioEnregistrable,
    rejouerEntree,
    cleFavoriRadio,
    chargerFavorisRadio,
    basculerFavoriRadio,
  } from '../../lib/historiqueLecture';
  import '../../styles/tune-v2.css';

  const showExpert = $derived(atLeast($preferences.settingsLevel, 'expert'));

  let serveur = $state<HistoryEntry[]>([]);
  let favorisRadio = $state(new Set<string>());
  let enCours = $state<number | null>(null);
  let occupe = $state<string | null>(null);
  let vidage = $state(false);

  const entrees = $derived(fusionnerHistorique($playbackHistory, serveur));

  $effect(() => {
    api.getPlaybackHistory(100)
      .then((r) => { serveur = entreesDepuisServeur(r?.items ?? []); })
      .catch(() => { serveur = []; });
    chargerFavorisRadio().then((s) => { favorisRadio = s; });
  });

  /**
   * « il y a 3 h » plutôt qu'une date : ce qu'on cherche dans un historique,
   * c'est le RANG — ce que j'écoutais avant, pas le jour exact.
   */
  function depuis(iso: string): string {
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    // `t` ne sait pas interpoler : le nombre est substitué à la main, comme
    // partout ailleurs dans ce client.
    const n = (cle: string, valeur: number) => $tr(cle as any).replace('{n}', String(valeur));
    if (min < 1) return $tr('v2.hist.justNow' as any);
    if (min < 60) return n('v2.hist.minutesAgo', min);
    const h = Math.floor(min / 60);
    if (h < 24) return n('v2.hist.hoursAgo', h);
    return n('v2.hist.daysAgo', Math.floor(h / 24));
  }

  function tech(t: HistoryEntry['track']): string {
    const bits = [t.format, t.sample_rate ? `${(t.sample_rate / 1000).toFixed(1)} kHz` : null,
      t.bit_depth ? `${t.bit_depth} bit` : null].filter(Boolean);
    return bits.join(' · ');
  }

  async function rejouer(e: HistoryEntry, i: number) {
    const zid = $currentZoneId;
    if (zid == null) { notifications.error($tr('queue.noZoneSelected')); return; }
    enCours = i;
    try {
      const fait = await rejouerEntree(zid, e);
      notifications.success(`${fait.genre === 'radio' ? 'Radio' : 'Lecture'} : ${fait.libelle}`);
    } catch {
      notifications.error($tr('v2.hist.replayError' as any));
    }
    enCours = null;
  }

  async function basculerFav(e: HistoryEntry, ev: MouseEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    if (!estRadioEnregistrable(e.track)) return;
    const cle = cleFavoriRadio(e.track.title, e.track.artist_name);
    if (occupe) return;
    occupe = cle;
    try {
      const desormais = await basculerFavoriRadio(e, favorisRadio.has(cle));
      const suivant = new Set(favorisRadio);
      if (desormais) suivant.add(cle); else suivant.delete(cle);
      favorisRadio = suivant;
      notifications.success($tr(desormais ? 'history.radioFavAdded' : 'history.radioFavRemoved'));
    } catch {
      notifications.error($tr('history.radioFavError'));
    }
    occupe = null;
  }

  async function vider() {
    vidage = true;
    try {
      await api.clearPlaybackHistory();
      playbackHistory.clear();
      serveur = [];
      notifications.success($tr('history.cleared'));
    } catch {
      notifications.error($tr('settings.deletionError'));
    }
    vidage = false;
  }
</script>

<section class="v2-hist tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">{$tr('v2.hist.eyebrow' as any)}</div>
      <h1>{$tr('history.title')}</h1>
    </div>
    {#if entrees.length}
      <div class="meta"><span>{entrees.length} {$tr('history.plays')}</span></div>
      <button class="lnk danger" onclick={vider} disabled={vidage}>{$tr('history.clear')}</button>
    {/if}
  </header>

  <div class="scroll">
    {#if !entrees.length}
      <div class="state">{$tr('history.noHistory')}</div>
    {:else}
      <div class="list">
        {#each entrees as e, i (String(e.track.id ?? e.track.source_id ?? '') + '@' + e.playedAt)}
          {@const radio = estRadioEnregistrable(e.track)}
          {@const cle = cleFavoriRadio(e.track.title, e.track.artist_name)}
          <div class="row" class:np={e.track.id != null && e.track.id === $currentTrackId}
               class:busy={enCours === i}>
            <button class="play" onclick={() => rejouer(e, i)} disabled={enCours === i}
                    aria-label={`${$tr('v2.hist.replay' as any)} — ${e.track.title ?? ''}`}>
              <span class="cv"><AlbumArt coverPath={e.track.cover_path} albumId={e.track.album_id ?? null}
                size={0} alt={e.track.title} source={e.track.source}
                fallbackInitials={e.track.title?.slice(0, 1)} /></span>
              <span class="ti">{e.track.title}<em>{e.track.artist_name ?? ''}{e.track.album_title ? ' · ' + e.track.album_title : ''}</em></span>
            </button>
            {#if showExpert && tech(e.track)}<span class="tk">{tech(e.track)}</span>{/if}
            <span class="dur">{e.track.duration_ms ? formatDuration(e.track.duration_ms) : ''}</span>
            <span class="when">{depuis(e.playedAt)}</span>
            {#if radio}
              <button class="fav" class:on={favorisRadio.has(cle)} disabled={occupe === cle}
                      onclick={(ev) => basculerFav(e, ev)}
                      title={$tr(favorisRadio.has(cle) ? 'history.removeRadioFav' : 'history.saveRadioFav')}
                      aria-label={$tr(favorisRadio.has(cle) ? 'history.removeRadioFav' : 'history.saveRadioFav')}>
                <svg viewBox="0 0 24 24" fill={favorisRadio.has(cle) ? 'currentColor' : 'none'}
                     stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </button>
            {:else}
              <span class="fav-vide" aria-hidden="true"></span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  .v2-hist{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .top{display:flex; align-items:flex-end; gap:20px; padding:24px 30px 14px; padding-right:96px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .meta{display:flex; gap:16px; margin-left:auto; font:11.5px var(--v2-mono); color:var(--v2-txt3)}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:8px 15px; font:600 12px var(--v2-sans)}
  .lnk.danger:hover{border-color:var(--v2-danger-bd); color:var(--v2-danger)}
  .lnk:disabled{opacity:.45; cursor:default}

  .scroll{flex:1; overflow-y:auto; padding:4px 0 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:30px; color:var(--v2-txt3)}

  .list{display:flex; flex-direction:column; gap:1px; padding:6px 30px 20px}
  .row{display:grid; grid-template-columns:1fr auto auto auto auto; align-items:center; gap:14px;
    padding:0 8px; border-radius:9px; color:var(--v2-txt2)}
  .row:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .row.np{color:var(--v2-acc1)}
  .row.busy{opacity:.55}
  .play{display:grid; grid-template-columns:40px 1fr; align-items:center; gap:12px; min-width:0;
    border:0; background:transparent; color:inherit; cursor:pointer; text-align:left; padding:7px 0; font-family:inherit}
  .play:disabled{cursor:default}
  .row .cv{width:40px; height:40px; border-radius:6px; overflow:hidden}
  .row .ti{min-width:0; font-size:13.5px; font-weight:500; display:flex; flex-direction:column; gap:2px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .row .ti em{font:11px var(--v2-sans); font-style:normal; color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis}
  .row .tk{font:10px var(--v2-mono); color:var(--v2-acc2)}
  .row .dur{font:11.5px var(--v2-mono); color:var(--v2-txt3)}
  .row .when{font:11px var(--v2-mono); color:var(--v2-txt3); min-width:82px; text-align:right}

  /* Le cœur d'un titre radio DÉJÀ en favori reste visible : sans cela on ne
     peut plus lire lesquels le sont sans les survoler un par un — la même
     règle que sur les pochettes. */
  .fav{width:28px; height:28px; border-radius:8px; border:1px solid transparent; background:transparent;
    color:var(--v2-txt3); cursor:pointer; display:grid; place-items:center; opacity:0; transition:opacity .12s}
  .row:hover .fav, .fav.on{opacity:1}
  .fav.on{color:var(--v2-danger)}
  .fav:hover:not(:disabled){color:var(--v2-txt); border-color:var(--v2-line2)}
  .fav.on:hover{color:var(--v2-danger)}
  .fav:disabled{opacity:.4; cursor:default}
  .fav svg{width:14px; height:14px}
  .fav-vide{width:28px; height:28px}

  /* Sans survol possible — tactile — rien ne peut rester en réserve. */
  @media (hover:none){ .fav{opacity:1} }
</style>
