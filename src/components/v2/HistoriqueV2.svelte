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
  import { currentZoneId, zones } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import { t as tr } from '../../lib/i18n';
  import ListePistesV2 from './ListePistesV2.svelte';
  import {
    entreesDepuisServeur,
    fusionnerHistorique,
    estRadioEnregistrable,
    rejouerEntree,
    cleFavoriRadio,
    chargerFavorisRadio,
    basculerFavoriRadio,
    nomDeZone,
  } from '../../lib/historiqueLecture';
  import '../../styles/tune-v2.css';

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
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$tr('v2.hist.eyebrow' as any)}</div>
      <h1>{$tr('history.title')}</h1>
    </div>
    {#if entrees.length}
      <div class="v2-actions">
        <div class="meta"><span>{entrees.length} {$tr('history.plays')}</span></div>
        <button class="v2-btn danger" onclick={vider} disabled={vidage}>{$tr('history.clear')}</button>
      </div>
    {/if}
  </header>

  <div class="scroll">
    {#if !entrees.length}
      <div class="state">{$tr('history.noHistory')}</div>
    {:else}
      <div class="list">
        <!-- LISTE partagée : tableau au mode Essentiel, mêmes lignes qu'avant
             au-dessus. Les deux colonnes propres à cet écran — l'instant, et le
             cœur d'un titre entendu à la radio — passent par le suffixe.

             ⚠️ `clef` : la même piste peut figurer deux fois, écoutée deux
             fois. `id` seul donnerait deux clés identiques, et Svelte
             s'arrêterait sur `each_key_duplicate` — la liste entière
             disparaîtrait. -->
        <ListePistesV2
          pistes={entrees.map((x) => x.track)}
          numerotation="aucune"
          pochetteEnTableau
          onLire={(_p, i) => rejouer(entrees[i], i)}
          clef={(p, i) => String(p.id ?? p.source_id ?? '') + '@' + entrees[i].playedAt}
          apres={suffixe}
          largeurApres="164px"
        />
        {#snippet suffixe(_p: any, i: number)}
          {@const e = entrees[i]}
          {@const radio = estRadioEnregistrable(e.track)}
          {@const cle = cleFavoriRadio(e.track.title, e.track.artist_name)}
          <!-- 🔴 LA ZONE, que l'écran actuel affiche depuis toujours
               (`HistoryView.svelte:149`) et que le portage avait perdue.
               FabienM, fil 1739, point 8. Au-dessus de l'instant, comme dans
               l'écran actuel — c'est cette disposition qu'il montre en
               exemple. -->
          {@const zn = nomDeZone(e, $zones)}
          <span class="quand">
            {#if zn}<span class="zone" title={zn}>{zn}</span>{/if}
            <span class="when" class:busy={enCours === i}>{depuis(e.playedAt)}</span>
          </span>
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
        {/snippet}
      </div>
    {/if}
  </div>
</section>

<style>
  .v2-hist{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .meta{display:flex; gap:16px; margin-left:auto; font:11.5px var(--v2-mono); color:var(--v2-txt3)}

  .scroll{flex:1; overflow-y:auto; padding:4px 0 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:30px; color:var(--v2-txt3)}

  .list{display:flex; flex-direction:column; gap:1px; padding:6px 30px 20px}
  /* Enveloppe : la ligne partagee, plus les deux colonnes propres a
     l'historique. */
  .lh{display:grid; grid-template-columns:1fr auto auto; align-items:center; gap:10px; border-radius:9px}
  .lh.busy{opacity:.55}
  .lh .when{font:11px var(--v2-mono); color:var(--v2-txt3); min-width:82px; text-align:right}
  /* La zone au-dessus de l'instant : deux lignes serrées, alignées à droite,
     comme dans l'écran actuel. */
  .quand{display:flex; flex-direction:column; align-items:flex-end; gap:1px; min-width:92px}
  .quand .zone{font:600 10.5px var(--v2-mono); color:var(--v2-acc1); letter-spacing:.02em;
    max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .quand .when{font:11px var(--v2-mono); color:var(--v2-txt3)}

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
