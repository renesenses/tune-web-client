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
  import {
    enTranches,
    nomDObjet,
    regrouperParContexte,
  } from '../../lib/historiqueParContexte';
  import '../../styles/tune-v2.css';

  let serveur = $state<HistoryEntry[]>([]);
  let favorisRadio = $state(new Set<string>());
  let occupe = $state<string | null>(null);
  let vidage = $state(false);

  const entrees = $derived(fusionnerHistorique($playbackHistory, serveur));

  /**
   * 🔴 #904 / #903 — l'écran en DEUX niveaux.
   *
   * Les titres nus consécutifs restent un seul tableau ; un objet lancé
   * (album, playlist, artiste) prend une ligne à part, dépliable. Mesuré sur
   * la .18 : 65,8 % des écoutes n'ont AUCUN contexte, donc la liste plate
   * reste la forme dominante de l'écran — c'est aussi ce que montre le schéma
   * de FabienM, où des titres nus voisinent avec des objets.
   */
  const tranches = $derived(enTranches(regrouperParContexte(entrees)));

  /** Les objets DÉPLIÉS, par clé. Repliés par défaut : c'est le « + » du schéma. */
  let deplies = $state(new Set<string>());
  function basculerPli(cle: string) {
    const n = new Set(deplies);
    if (n.has(cle)) n.delete(cle); else n.add(cle);
    deplies = n;
  }

  /** L'entrée en cours de rejeu, désignée par une clé stable et non un rang. */
  let rejeuEnCours = $state<string | null>(null);
  const cleEntree = (e: HistoryEntry) =>
    `${e.track.id ?? e.track.source_id ?? e.track.title ?? ''}@${e.playedAt}`;

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


  async function rejouer(e: HistoryEntry) {
    const zid = $currentZoneId;
    if (zid == null) { notifications.error($tr('queue.noZoneSelected')); return; }
    rejeuEnCours = cleEntree(e);
    try {
      const fait = await rejouerEntree(zid, e);
      notifications.success(`${fait.genre === 'radio' ? 'Radio' : 'Lecture'} : ${fait.libelle}`);
    } catch {
      notifications.error($tr('v2.hist.replayError' as any));
    }
    rejeuEnCours = null;
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
        <!-- 🔴 #904 / #903 — DEUX niveaux. Une tranche de titres nus est un
             tableau ; un objet lancé est une ligne dépliable.

             ⚠️ `clef` : la même piste peut figurer deux fois, écoutée deux
             fois. `id` seul donnerait deux clés identiques, et Svelte
             s'arrêterait sur `each_key_duplicate` — la liste entière
             disparaîtrait. -->
        {#each tranches as tranche, ti (tranche.genre === 'objet' ? tranche.cle : `t${ti}`)}
          {#if tranche.genre === 'titres'}
            {@const lot = tranche.entrees}
            <ListePistesV2
              pistes={lot.map((x) => x.track)}
              numerotation="aucune"
              pochetteEnTableau
              onLire={(_p, i) => rejouer(lot[i])}
              clef={(p, i) => String(p.id ?? p.source_id ?? '') + '@' + lot[i].playedAt}
              apres={suffixeNu}
              largeurApres="164px"
            />
            {#snippet suffixeNu(_p: any, i: number)}
              {@render colonnes(lot[i])}
            {/snippet}
          {:else}
            {@const lot = tranche.entrees}
            {@const nom = nomDObjet(tranche.type, lot)}
            {@const ouvert = deplies.has(tranche.cle)}
            <!-- Le « + » / « − » du schéma de FabienM. L'objet est REPLIÉ par
                 défaut : déplié, l'écran redeviendrait la liste plate qu'il
                 remplace. -->
            <button class="objet" class:ouvert aria-expanded={ouvert}
              onclick={() => basculerPli(tranche.cle)}>
              <span class="pli" aria-hidden="true">{ouvert ? '−' : '+'}</span>
              <span class="otype">{$tr(`v2.hist.ctx.${tranche.type}` as any)}</span>
              <!-- 🔴 Le serveur ne sert AUCUN nom de contexte : seize champs,
                   et pas un titre d'objet. Un album et un artiste se déduisent
                   des pistes ; une playlist, non. On pose alors le seul type,
                   plutôt qu'un nom inventé. -->
              <span class="onom">{nom ?? $tr('v2.hist.ctx.sansNom' as any)}</span>
              <span class="ocompte">{lot.length}</span>
              <span class="when">{depuis(tranche.quand)}</span>
            </button>
            {#if ouvert}
              <div class="tiroir">
                <ListePistesV2
                  pistes={lot.map((x) => x.track)}
                  numerotation="aucune"
                  pochetteEnTableau
                  onLire={(_p, i) => rejouer(lot[i])}
                  clef={(p, i) => String(p.id ?? p.source_id ?? '') + '@' + lot[i].playedAt}
                  apres={suffixeObjet}
                  largeurApres="164px"
                />
                {#snippet suffixeObjet(_p: any, i: number)}
                  {@render colonnes(lot[i])}
                {/snippet}
              </div>
            {/if}
          {/if}
        {/each}

        <!-- Les deux colonnes propres à cet écran — la zone et l'instant, plus
             le cœur d'un titre entendu à la radio — sont les mêmes aux deux
             niveaux. Elles sont donc écrites UNE fois. -->
        {#snippet colonnes(e: HistoryEntry)}
          {@const radio = estRadioEnregistrable(e.track)}
          {@const cle = cleFavoriRadio(e.track.title, e.track.artist_name)}
          <!-- 🔴 LA ZONE, que l'écran actuel affiche depuis toujours
               (`HistoryView.svelte:149`) et que le portage avait perdue.
               FabienM, fil 1739, point 8. -->
          {@const zn = nomDeZone(e, $zones)}
          <span class="quand">
            {#if zn}<span class="zone" title={zn}>{zn}</span>{/if}
            <span class="when" class:busy={rejeuEnCours === cleEntree(e)}>{depuis(e.playedAt)}</span>
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
  /* 🔴 #874 — `.lh` a été RETIRÉE : trois règles pour une classe que ce
     composant ne rend plus depuis le 05/09, quand la ligne est passée à
     `ListePistesV2` (`f2c9a0c3`). Du CSS mort ne casse rien — c'est
     précisément pourquoi il reste : personne ne le voit. Trouvée par la garde
     écrite pour `.row`, qui cherchait un seul sélecteur mort et en a levé
     deux. `.when` garde sa mise en forme par `.quand .when`, juste en
     dessous. */
  /* La zone au-dessus de l'instant : deux lignes serrées, alignées à droite,
     comme dans l'écran actuel. */
  .quand{display:flex; flex-direction:column; align-items:flex-end; gap:1px; min-width:92px}
  .quand .zone{font:600 10.5px var(--v2-mono); color:var(--v2-acc1); letter-spacing:.02em;
    max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .quand .when{font:11px var(--v2-mono); color:var(--v2-txt3)}

  /* Le cœur d'un titre radio DÉJÀ en favori reste visible : sans cela on ne
     peut plus lire lesquels le sont sans les survoler un par un — la même
     règle que sur les pochettes. */
  /* 🔴 #874 — LE SURVOL ÉTAIT UN SÉLECTEUR MORT.
     `.fav` naissait en `opacity:0`, révélé par `.row:hover .fav`. Or ce
     composant ne rend AUCUN `class="row"` : la ligne vient de
     `ListePistesV2`, qui l'appelle `.trow`. Et même en la renommant, la règle
     ne mordrait pas — Svelte porte ses styles par composant, et `.trow` ne
     porte pas le sceau de CELUI-CI.
     Conséquence mesurée : sur un poste de bureau, le cœur d'un titre PAS
     ENCORE en favori était invisible — donc inatteignable. Il ne s'affichait
     que sur tablette, par la règle `@media (hover:none)` juste en dessous.
     Reivax66 (fil 1729) est sous Windows.
     On ne remplace pas par `:global(.trow:hover)` : une règle qui perce la
     portée d'un autre composant se casse à son prochain renommage, en
     silence, exactement comme celle-ci. Le cœur reste VISIBLE — sa colonne
     est déjà réservée (`.fav-vide` fait la même largeur), il ne coûte donc
     aucune place. */
  .fav{width:28px; height:28px; border-radius:8px; border:1px solid transparent; background:transparent;
    color:var(--v2-txt3); cursor:pointer; display:grid; place-items:center; transition:color .12s}
  .fav.on{opacity:1}
  .fav.on{color:var(--v2-danger)}
  .fav:hover:not(:disabled){color:var(--v2-txt); border-color:var(--v2-line2)}
  .fav.on:hover{color:var(--v2-danger)}
  .fav:disabled{opacity:.4; cursor:default}
  .fav svg{width:14px; height:14px}
  .fav-vide{width:28px; height:28px}

  /* #904 — la ligne d'objet du premier niveau, et son tiroir. */
  .objet{display:grid; grid-template-columns:18px auto 1fr auto auto; align-items:center; gap:10px;
    width:100%; text-align:left; padding:9px 12px; border:1px solid var(--v2-line2);
    border-radius:9px; background:var(--v2-surface2, transparent); color:var(--v2-txt);
    cursor:pointer; font-family:inherit}
  .objet:hover{border-color:var(--v2-acc1)}
  .objet .pli{font:600 15px var(--v2-mono); color:var(--v2-txt3); text-align:center}
  .objet.ouvert .pli{color:var(--v2-acc1)}
  .objet .otype{font:600 10.5px var(--v2-mono); letter-spacing:.06em; text-transform:uppercase;
    color:var(--v2-acc1)}
  .objet .onom{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .objet .ocompte{font:11px var(--v2-mono); color:var(--v2-txt3);
    border:1px solid var(--v2-line2); border-radius:10px; padding:1px 7px}
  .objet .when{font:11px var(--v2-mono); color:var(--v2-txt3); min-width:82px; text-align:right}
  .tiroir{padding-left:22px; border-left:2px solid var(--v2-line2); margin:2px 0 6px 8px}

  /* La règle tactile qui vivait ici est devenue sans objet : le cœur est
     visible partout, et il l'était déjà sur tablette par ce seul chemin. */
</style>
