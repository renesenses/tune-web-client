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
  import { onMount } from 'svelte';
  import * as api from '../../lib/api';
  import { tuneWS } from '../../lib/websocket';
  import { playbackHistory, type HistoryEntry } from '../../lib/stores/history';
  import { currentZoneId, zones } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import { t as tr } from '../../lib/i18n';
  import ListePistesV2, { LARGEUR_ACTIONS } from './ListePistesV2.svelte';
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
    artisteDObjet,
    pochetteDObjet,
    serviceDePlaylist,
    regrouperParContexte,
  } from '../../lib/historiqueParContexte';
  import { NomsDePlaylists, type FichePlaylist } from '../../lib/nomsDePlaylists';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import { preferences } from '../../lib/stores/preferences';
  import { colonnesRetenues } from '../../lib/colonnesPistes';
  import '../../styles/tune-v2.css';

  /**
   * 🔴 LA LIGNE D'OBJET S'ALIGNE SUR LE TABLEAU DES PISTES — #1009.
   *
   * Fabien, fil « v0.9.148 : v1 divers bugs », point 1, capture à l'appui :
   *
   *   « mauvais alignement des titres vs albums/playlist […] la colonne # du
   *     titre devrait être juste en dessous de la colonne + de l'album »
   *
   * Il avait raison, et la cause est structurelle : cet écran rend DEUX sortes
   * de lignes de premier niveau, et chacune avait sa propre mise en page.
   *
   *   la ligne d'OBJET   grille locale `18px auto 1fr auto auto`,
   *                      gap 10px, padding 9px 12px, bordure 1px
   *   la ligne de TITRE  rendue par `ListePistesV2` : grille CALCULÉE,
   *                      gap 14px, padding 0 10px
   *
   * Aucune colonne commune, ni le même écartement, ni la même marge : elles ne
   * pouvaient s'aligner que par accident.
   *
   * ⚠️ On ne recopie PAS de largeur en dur. Le gabarit du tableau dépend des
   * colonnes que l'utilisateur a cochées — Pierre M en avait vingt (#853) — et
   * un nombre figé ici se serait défait au premier changement de réglage. On
   * lit donc la MÊME source que `ListePistesV2` : `colonnesRetenues`, avec le
   * même mode. Sa première colonne donne la largeur, et le reste de la ligne
   * d'objet suit derrière.
   */
  const largeurPremiereColonne = $derived(
    colonnesRetenues($preferences.v2Colonnes?.[$preferences.settingsLevel] ?? [],
                     $preferences.settingsLevel)[0]?.largeur ?? '44px',
  );

  /**
   * 🔴 ET LA DROITE DE LA LIGNE AUSSI — #1149.
   *
   * #1009 avait réconcilié la PREMIÈRE colonne, la gouttière et la marge
   * gauche. La ligne d'objet gardait pourtant un gabarit à elle pour tout le
   * reste — `var(--col1) auto 1fr auto auto` — dont les trois dernières
   * colonnes ne sortaient d'aucune source commune. « il y a 3 min » sur la
   * ligne d'ALBUM ne tombait donc pas au-dessus de « il y a 9 min » sur la
   * ligne de PISTE, et deux colonnes `auto` se résolvant sur leur contenu, le
   * décalage changeait d'une ligne à l'autre.
   *
   * Le tableau finit par DEUX colonnes fixes : la barre d'actions, puis le
   * suffixe propre à cet écran (la zone, l'instant, le cœur radio). La ligne
   * d'objet se compose maintenant des mêmes :
   *
   *   var(--col1)   la première colonne du tableau        (#1009)
   *   minmax(0,1fr) tout ce qui est entre — le nom
   *   --col-actions LARGEUR_ACTIONS, importée de ListePistesV2
   *   --col-suffixe LARGEUR_SUFFIXE, la valeur passée en `largeurApres`
   *
   * Même boîte, même gouttière, mêmes deux colonnes de queue : leurs bords
   * droits tombent au même endroit, quel que soit le nombre de colonnes de
   * données cochées entre les deux. Rien n'est recopié — la barre d'actions a
   * déjà changé de largeur une fois (178 → 208 px le 16/09/2026), et un nombre
   * figé ici s'en serait détaché en silence.
   */
  const LARGEUR_SUFFIXE = '164px';

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

  /**
   * #988 — le nom (et la pochette) d'une playlist de SERVICE jouée. Le
   * serveur ne nomme que les playlists locales ; pour Qobuz ou Tidal on
   * demande au service, une fois par playlist, et on s'en souvient.
   */
  const noms = new NomsDePlaylists(api.getStreamingPlaylist);
  let fiches = $state(new Map<string, FichePlaylist | null>());
  $effect(() => {
    for (const tr of tranches) {
      if (tr.genre !== 'objet' || fiches.has(tr.cle)) continue;
      if (nomDObjet(tr.type, tr.entrees) != null) continue;
      const service = serviceDePlaylist(tr.type, tr.entrees);
      if (!service) continue;
      const cle = tr.cle;
      noms.resoudre(service, tr.id).then((f) => {
        const n = new Map(fiches); n.set(cle, f); fiches = n;
      });
    }
  });

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

  let invalidateHistory = () => {};
  let reloadHistory = () => {};

  onMount(() => {
    let active = true;
    let generation = 0;
    let loading = false;
    let pending = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function reload() {
      if (!active || vidage || document.hidden) return;
      if (loading) { pending = true; return; }
      loading = true;
      const requestedGeneration = generation;
      try {
        const response = await api.getPlaybackHistory(100);
        if (active && !vidage && requestedGeneration === generation) {
          serveur = entreesDepuisServeur(response?.items ?? []);
        }
      } catch {
        // Keep the last successful snapshot on a transient network failure.
      } finally {
        loading = false;
        if (pending) { pending = false; void reload(); }
      }
    }

    function invalidate() {
      generation += 1;
      pending = false;
      if (debounce !== null) clearTimeout(debounce);
      debounce = null;
    }
    invalidateHistory = invalidate;
    reloadHistory = () => { void reload(); };

    function visibilityChanged() {
      if (document.hidden) {
        if (interval !== null) clearInterval(interval);
        interval = null;
        if (debounce !== null) clearTimeout(debounce);
        debounce = null;
        return;
      }
      // Playback events can precede the history write, especially for browser
      // outputs. Catch up while this screen is visible, including after a lost
      // event or a delayed write; never poll every zone snapshot/position tick.
      if (interval === null) interval = setInterval(() => { void reload(); }, 5000);
      void reload();
    }
    const unsubscribe = tuneWS.onEvent((event) => {
      if (!['playback.started', 'playback.track_changed', '_connected'].includes(event.type)) return;
      if (document.hidden || vidage) return;
      if (debounce !== null) clearTimeout(debounce);
      debounce = setTimeout(() => { debounce = null; void reload(); }, 100);
    });
    document.addEventListener('visibilitychange', visibilityChanged);
    visibilityChanged();
    chargerFavorisRadio().then((s) => { if (active) favorisRadio = s; });

    return () => {
      active = false;
      invalidate();
      if (interval !== null) clearInterval(interval);
      document.removeEventListener('visibilitychange', visibilityChanged);
      unsubscribe();
      invalidateHistory = () => {};
      reloadHistory = () => {};
    };
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
    invalidateHistory();
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
    reloadHistory();
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
      <!-- #1149 — les deux colonnes de queue du tableau, posées une fois pour
           toutes les lignes d'objet de l'écran. `--col1` reste sur la ligne
           elle-même : elle dépend des colonnes cochées (#1009). -->
      <div class="list" style="--col-actions:{LARGEUR_ACTIONS}; --col-suffixe:{LARGEUR_SUFFIXE}">
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
            {@const fiche = fiches.get(tranche.cle) ?? null}
            {@const vignette = fiche?.pochette
              ? { cover_path: fiche.pochette, album_id: null }
              : pochetteDObjet(lot)}
            {@const artiste = artisteDObjet(tranche.type, lot)}
            <!-- Le « + » / « − » du schéma de FabienM. L'objet est REPLIÉ par
                 défaut : déplié, l'écran redeviendrait la liste plate qu'il
                 remplace. -->
            <button class="objet" class:ouvert aria-expanded={ouvert}
              style="--col1:{largeurPremiereColonne}"
              onclick={() => basculerPli(tranche.cle)}>
              <span class="pli" aria-hidden="true">{ouvert ? '−' : '+'}</span>
              <!-- #1149 — QUATRE cellules, pas cinq : le type et le nom
                   partagent la colonne centrale, celle qui absorbe tout ce que
                   le tableau consacre à ses colonnes de données. -->
              <span class="ocorps">
                <span class="otype">{$tr(`v2.hist.ctx.${tranche.type}` as any)}</span>
                <!-- Le nom vient, dans l'ordre : de la playlist de service
                     résolue (#988), du serveur (`context_name`, .151), des
                     pistes (album, artiste) ; et à défaut on pose le seul type,
                     plutôt qu'un nom inventé. -->
                <!-- #991 — l'objet replié est la seule ligne qu'on voit : il
                     porte la pochette de la playlist quand le service l'a
                     donnée, sinon celle de sa première piste. -->
                <span class="onom">
                  {#if vignette}
                    <span class="ovig">
                      <AlbumArt coverPath={vignette.cover_path} albumId={vignette.album_id}
                        size={36} alt={nom ?? ''} source={lot[0]?.track?.source ?? null} />
                    </span>
                  {/if}
                  <span class="otxt">
                    <span class="otitre">{fiche?.nom ?? nom ?? $tr('v2.hist.ctx.sansNom' as any)}</span>
                    <!-- #988, point 11 — l'artiste de l'album joué. -->
                    {#if artiste}<span class="oart">{artiste}</span>{/if}
                  </span>
                </span>
              </span>
              <!-- Le compte occupe la colonne de la barre d'actions, calé à
                   droite comme elle (`.act`). -->
              <span class="ocompte-cell"><span class="ocompte">{lot.length}</span></span>
              <!-- Et l'instant occupe la colonne du suffixe, avec la MÊME
                   structure que les lignes de piste : `.quand`, puis la place
                   du cœur radio. Sans ce second élément l'instant se collerait
                   28 px plus à droite que sur les pistes — la grille serait
                   juste, et le texte toujours décalé. -->
              <span class="osuffixe"><span class="quand"><span class="when">{depuis(tranche.quand)}</span></span><span class="fav-vide" aria-hidden="true"></span></span>
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
  /* #1009 — la PREMIÈRE colonne, l'écartement et la marge horizontale sont ceux
     du tableau des pistes (`.trow` de `ListePistesV2` : gap 14px, padding 0 10px).
     La bordure est comptée dans la marge pour que le bord intérieur tombe au
     même endroit : 10px = 1px de bordure + 9px de remplissage. */
  /* #1149 — et les DEUX colonnes de queue du tableau : la barre d'actions puis
     le suffixe. `--col-actions` et `--col-suffixe` sont posées sur `.list`
     depuis `LARGEUR_ACTIONS` (importée de `ListePistesV2`) et
     `LARGEUR_SUFFIXE` (la valeur passée en `largeurApres`). Plus aucun `auto` :
     une colonne dimensionnée par son contenu ne peut pas tomber en face de
     celle du tableau — c'est la leçon du 07/09/2026 sur l'en-tête. */
  .objet{display:grid;
    grid-template-columns:var(--col1, 44px) minmax(0,1fr) var(--col-actions) var(--col-suffixe);
    align-items:center; gap:14px;
    width:100%; text-align:left; padding:9px; border:1px solid var(--v2-line2);
    border-radius:9px; background:var(--v2-surface2, transparent); color:var(--v2-txt);
    cursor:pointer; font-family:inherit}
  .objet:hover{border-color:var(--v2-acc1)}
  .objet .pli{font:600 15px var(--v2-mono); color:var(--v2-txt3); text-align:right}
  .objet.ouvert .pli{color:var(--v2-acc1)}
  /* La colonne centrale : le type puis le nom, sur une ligne, dans la seule
     cellule qui absorbe les colonnes de données du tableau. */
  .objet .ocorps{display:flex; align-items:center; gap:14px; min-width:0}
  .objet .otype{font:600 10.5px var(--v2-mono); letter-spacing:.06em; text-transform:uppercase;
    color:var(--v2-acc1); flex:none}
  .objet .onom{display:flex; align-items:center; gap:10px; min-width:0}
  .objet .ovig{flex:none; width:36px; height:36px}
  .objet .otxt{display:flex; flex-direction:column; min-width:0; line-height:1.25}
  .objet .otitre, .objet .oart{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .objet .oart{font-size:12px; color:var(--v2-txt3)}
  /* Le compte tient la colonne des actions, calé à droite comme `.act` du
     tableau : la pastille tombe ainsi au-dessus du dernier bouton de la barre,
     et jamais sur la colonne de données voisine. */
  .objet .ocompte-cell{display:flex; align-items:center; justify-content:flex-end}
  .objet .ocompte{font:11px var(--v2-mono); color:var(--v2-txt3);
    border:1px solid var(--v2-line2); border-radius:10px; padding:1px 7px}
  /* La colonne du suffixe, à l'identique de `.td.act` dans `ListePistesV2` :
     flex, calé à droite, AUCUNE gouttière — une gouttière ici décalerait
     l'instant d'autant par rapport aux lignes de piste.
     `.when` n'a plus de mise en forme propre : elle prend celle de
     `.quand .when`, la même que sur les lignes de piste. */
  .objet .osuffixe{display:flex; align-items:center; justify-content:flex-end}
  .tiroir{padding-left:22px; border-left:2px solid var(--v2-line2); margin:2px 0 6px 8px}

  /* Sous 720 px, `ListePistesV2` retire son en-tête et replie ses lignes sur
     `minmax(0,1fr) auto` : il n'y a plus de colonnes à aligner. La ligne
     d'objet se replie avec lui — sinon ses deux colonnes de queue, 372 px à
     elles deux, écraseraient le nom sur un écran de 375 px. */
  @media (max-width: 720px){
    .objet{grid-template-columns:var(--col1, 44px) minmax(0,1fr) auto auto}
  }

  /* La règle tactile qui vivait ici est devenue sans objet : le cœur est
     visible partout, et il l'était déjà sur tablette par ce seul chemin. */
</style>
