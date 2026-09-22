<script lang="ts">
  /**
   * File d'attente — nouveau client (direction Levente).
   *
   * Niveau Avancé. Densité :
   *   Avancé → ce qui joue, la suite, saut, retrait, vider.
   *   Expert → réordonnancement (monter/descendre) et ligne technique.
   *
   * La file est chargée ICI et rechargée à chaque changement de zone. Comme
   * pour les autres stores partagés, `fetchQueue()` vit dans App.svelte que
   * le mode `?v2` ne monte jamais : sans ce chargement l'écran resterait
   * vide en permanence, ce qui ressemble a une file vide alors que rien n'a
   * été demandé au serveur.
   *
   * Chaque action réécrit l'état depuis la RÉPONSE du serveur (rechargement)
   * plutôt que de deviner localement : sur une file partagée entre plusieurs
   * clients, un état devine diverge en quelques secondes.
   */
  import * as api from '../../lib/api';
  import { t as tr } from '../../lib/i18n';
  // Le SÉPARATEUR de milliers suit la langue : « 1 453 » en français,
  // « 1.453 » en roumain, « 1,453 » en anglais. Une file de 1454 titres
  // est un cas réel (#1126).
  import { formatNombre } from '../../lib/formats';
  import { currentZoneId, zones, syncZone } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import { estFichierAudio } from '../../lib/fichiersAudio';
  import { currentTrack, currentTrackId, playbackState, etatDeLaLigne }
    from '../../lib/stores/nowPlaying';
  import IndicateurLecture from './IndicateurLecture.svelte';
  import { queueTracks, queuePosition } from '../../lib/stores/queue';
  import PisteActions from './PisteActions.svelte';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { formatDuration, formatTime, getQualityTier } from '../../lib/utils';
  import type { Track } from '../../lib/types';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import { fenetreListe } from '../../lib/fenetreListe';
  import '../../styles/tune-v2.css';

  const level = $derived($preferences.settingsLevel);
  const showExpert = $derived(atLeast(level, 'expert'));

  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function reload() {
    const zid = $currentZoneId;
    if (zid == null) { loading = false; return; }
    try {
      const qs = await api.getQueue(zid);
      queueTracks.set(qs.tracks ?? []);
      queuePosition.set(qs.position ?? 0);
      error = null;
    } catch {
      error = $tr('v2.queue.loadFailed' as any);
    }
    loading = false;
  }
  /**
   * AUTOPLAY — jamais porté dans la nouvelle interface.
   *
   * Sandro, fil forum 1740, 09/09/2026 : « L'option d'Autoplay (la lecture
   * automatique basée sur l'artiste que l'on écoute) a disparu. […] Cette
   * absence concerne à la fois la bibliothèque locale et Qobuz. »
   *
   * Rien n'était à écrire côté serveur : le réglage vit sur la ZONE
   * (`autoplay_enabled`), le sondeur le lit pour rallonger la file, et la
   * route existe (`api.updateZoneAutoplay`). Seul l'écran manquait —
   * `QueueView.svelte` le porte depuis toujours, `QueueV2` ne l'avait pas.
   *
   * 🔴 Sandro avait DÉJÀ demandé où trouver ce réglage sur le forum, deux
   * fois, le 08/08/2026, sans réponse : à l'époque la bascule n'écrivait que
   * dans `localStorage` et le serveur n'en entendait jamais parler. Le
   * correctif d'alors a rendu le réglage réel ; il reste opt-in (migration 46
   * l'a coupé pour tout le monde par construction). Le perdre au portage le
   * lui a fait disparaître une seconde fois.
   *
   * On lit la zone dans le magasin plutôt que de la recevoir en propriété :
   * `PATCH` rend la zone à jour, `syncZone` la repose, et toutes les vues
   * suivent sans relecture.
   */
  const zoneCourante = $derived($zones.find((z) => z.id === $currentZoneId) ?? null);
  const autoplayActif = $derived(zoneCourante?.autoplay_enabled === true);
  let autoplayOccupe = $state(false);

  async function basculerAutoplay() {
    const z = zoneCourante;
    if (!z?.id || autoplayOccupe) return;
    const suivant = !autoplayActif;
    autoplayOccupe = true;
    try {
      syncZone(await api.updateZoneAutoplay(z.id, suivant));
      notifications.success($tr(suivant ? 'queue.autoplayOn' : 'queue.autoplayOff'));
    } catch {
      notifications.error($tr('queue.autoplayFailed'));
    } finally {
      autoplayOccupe = false;
    }
  }

  /*
   * Glisser un fichier audio HORS bibliothèque dans la file en cours — porté
   * de l'ancienne file (Sergio : « glisser dans la playlist de la lecture en
   * cours »). Le fichier est téléversé, puis AJOUTÉ à la file comme élément
   * `source: 'upload'` : il ne remplace pas ce qui joue.
   */
  let depotSurvol = $state(false);
  let televersement = $state(false);
  function survolDepot(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    depotSurvol = true;
  }
  async function deposerFichiers(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    depotSurvol = false;
    const zid = $currentZoneId;
    const fichiers = Array.from(e.dataTransfer?.files ?? []).filter((f) => estFichierAudio(f.name));
    if (!fichiers.length || zid == null) return;
    televersement = true;
    for (const f of fichiers) {
      try {
        const r = await api.uploadAudioFile(f);
        await api.addToQueue(zid, {
          source: 'upload',
          source_id: r.file_path,
          title: r.title,
          artist_name: r.artist,
          album_title: r.album,
          duration_ms: r.duration_ms,
        });
        notifications.success(r.title);
      } catch (err: any) {
        notifications.error(`${f.name} : ${err?.message ?? $tr('queue.uploadError')}`);
      }
    }
    televersement = false;
    reload();
  }

  // Se relance sur changement de zone : chaque zone a SA file.
  $effect(() => { void $currentZoneId; loading = true; reload(); });

  const tracks = $derived($queueTracks);
  const pos = $derived($queuePosition);
  const current = $derived(tracks[pos] ?? null);
  const upNext = $derived(tracks.slice(pos + 1));
  /**
   * L'état de la piste en tête de file (#1845).
   *
   * La file MONTRAIT déjà laquelle joue — un encadré teinté, à part — mais
   * jamais si elle joue VRAIMENT : mise en pause, l'écran était identique.
   * C'est le cas que demande le ticket, et c'est ici qu'il se voit le plus,
   * puisque la file est l'écran où l'on vient justement voir où on en est.
   */
  const etatCourant = $derived(
    current ? etatDeLaLigne(current, $currentTrackId, $currentTrack, $playbackState) : null,
  );
  const remainingMs = $derived(upNext.reduce((s, t) => s + (t.duration_ms ?? 0), 0));

  /**
   * 🔴 #1126 — LA FILE ENTIÈRE CONSTRUITE D'UN SEUL TENANT.
   *
   * Alex Campbell, 20/09/2026, playlist Qobuz de 1454 titres : « that seems to
   * break my session ». Cet écran rendait les 1453 lignes restantes, chacune
   * avec sa pochette, sa ligne technique et sa barre d'actions. Mesuré :
   * 1453 lignes, 3 914 ms de fil principal bloqué — et il repartait à chaque
   * rechargement de la file.
   *
   * L'ancienne interface tenait la sienne par du confinement CSS
   * (`content-visibility`, #1126). C'était un demi-remède : il épargne la MISE
   * EN PAGE des lignes hors champ, pas leur CONSTRUCTION. On ne construit donc
   * que ce qui peut être vu, et on remplace le reste par deux cales de la
   * hauteur exacte — la barre de défilement reste celle de la file entière, et
   * la dernière piste reste atteignable.
   *
   * `offsetTop` est mesuré DANS le conteneur, que `position: relative` rend
   * offsetParent de la liste : contrairement à `getBoundingClientRect`, il ne
   * bouge pas avec le défilement, donc rien à recalculer pour le lire.
   */
  const HAUTEUR_LIGNE_ESTIMEE = 55;

  let scroller = $state<HTMLElement | null>(null);
  let listeEl = $state<HTMLElement | null>(null);
  let defilement = $state(0);
  let hauteurVue = $state(0);
  let hauteurLigne = $state(HAUTEUR_LIGNE_ESTIMEE);
  let mesurePrevue = false;

  function mesurer() {
    mesurePrevue = false;
    if (!scroller) return;
    hauteurVue = scroller.clientHeight;
    defilement = scroller.scrollTop - (listeEl?.offsetTop ?? 0);
    // La hauteur réelle d'une ligne se lit d'une ligne à la SUIVANTE : l'écart
    // porte aussi l'interligne de la liste, que `offsetHeight` ignore. Sans
    // lui, les cales dérivent d'un pixel par ligne — 1,4 écran sur la file
    // d'Alex.
    const lignes = listeEl?.querySelectorAll<HTMLElement>('.row');
    if (lignes && lignes.length >= 2) {
      const ecart = lignes[1].offsetTop - lignes[0].offsetTop;
      if (ecart > 0) hauteurLigne = ecart;
    }
  }

  /** Le défilement arrive par rafales : une mesure par image, pas par pixel. */
  function auDefilement() {
    if (mesurePrevue) return;
    mesurePrevue = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(mesurer);
    else mesurer();
  }

  $effect(() => {
    // `upNext.length` en dépendance : changer de file change la fenêtre.
    void upNext.length;
    mesurer();
  });

  $effect(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', auDefilement);
    return () => window.removeEventListener('resize', auDefilement);
  });

  const fenetre = $derived(fenetreListe(upNext.length, hauteurLigne, defilement, hauteurVue));
  const visibles = $derived(upNext.slice(fenetre.debut, fenetre.fin));

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    busy = true;
    try { await fn(); await reload(); }
    catch { error = 'Action impossible.'; }
    busy = false;
  }
  const jump = (i: number) => act(() => api.jumpInQueue($currentZoneId!, i));
  const remove = (i: number) => act(() => api.removeFromQueue($currentZoneId!, i));
  const move = (from: number, to: number) => act(() => api.moveInQueue($currentZoneId!, from, to));
  /**
   * 🔴 UN SEUL geste, et il n'arrête pas la lecture.
   *
   * Règle de Bertrand du 20/09/2026 : « Vider la file d'attente ne doit pas
   * couper la lecture en cours. » Cet écran portait DEUX boutons issus de
   * #1085 — « Vider » (qui coupait) et « Vider la suite » (qui ne coupait
   * pas). Le premier était celui que les testeurs trouvaient, et c'est celui
   * qui produisait le défaut remonté par Laurent, Bilou, Cyrille et GgB.
   *
   * `api.clearQueue` porte désormais `keep_current` par défaut : la piste en
   * cours continue, ce qui la suit est retiré. Arrêter se fait par le bouton
   * de transport (double-clic, ou la touche `S`) — le geste qui le nomme.
   */
  const clear = () => act(() => api.clearQueue($currentZoneId!));

  function tech(t: Track): string {
    if (getQualityTier(t) === 'dsd') return 'DSD';
    const r = t.sample_rate ? `${Math.round(t.sample_rate / 100) / 10} kHz` : '';
    const d = t.bit_depth ? `${t.bit_depth}-bit` : '';
    return [t.format?.toUpperCase(), r, d].filter(Boolean).join(' · ');
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section class="v2-queue tune-v2" class:depot={depotSurvol}
  ondragover={survolDepot} ondragleave={() => (depotSurvol = false)} ondrop={deposerFichiers}>
  {#if depotSurvol}<div class="depot-voile">{$tr('queue.dropFilesHere')}</div>{/if}
  {#if televersement}<div class="depot-barre">{$tr('queue.uploading')}</div>{/if}
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$tr('v2.lbl.currentZone' as any)}</div>
      <h1>{$tr('nav.queue' as any)}</h1>
    </div>
    <div class="v2-actions">
      {#if tracks.length}
        <div class="meta">
          <!-- 🔴 Silviu (roumain, v0.9.161) : ces deux compteurs étaient
               écrits en FRANÇAIS en dur au milieu d'un écran par ailleurs
               traduit. Ils passent par le magasin, comme le reste. -->
          <span>{$tr('v2.queue.upNextCount' as any).replace('{n}', $formatNombre(upNext.length))}</span>
          {#if remainingMs}<span>{$tr('v2.queue.remaining' as any).replace('{d}', formatDuration(remainingMs))}</span>{/if}
        </div>
      {/if}
      <!-- 🔴 HORS du `{#if tracks.length}` : c'est précisément quand la file se
           vide que l'Autoplay compte, et le cacher là le rendrait introuvable
           au moment où on le cherche. -->
      <button class="v2-btn" class:primaire={autoplayActif} onclick={basculerAutoplay}
              disabled={autoplayOccupe || !zoneCourante} aria-pressed={autoplayActif}
              title={$tr('queue.autoplayTip' as any)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
        {$tr('queue.autoplayLabel' as any)}
      </button>
      {#if tracks.length}
        <button class="v2-btn danger" onclick={clear} disabled={busy}
                title={$tr('queue.clearTip' as any)}>{$tr('v2.queue.clear' as any)}</button>
      {/if}
    </div>
  </header>

  {#if error}<div class="err">{error}<button onclick={() => (error = null)} aria-label={$tr('v2.common.close' as any)}>×</button></div>{/if}

  <div class="scroll" bind:this={scroller} onscroll={auDefilement}>
    {#if loading}
      <div class="state">{$tr('v2.queue.loading' as any)}</div>
    {:else if $currentZoneId == null}
      <div class="state">{$tr('v2.queue.noZone' as any)}</div>
    {:else if !tracks.length}
      <div class="state">{$tr('v2.queue.empty' as any)}</div>
    {:else}
      {#if current}
        <section class="sec">
          <h2>{$tr('v2.lbl.inProgress' as any)}</h2>
          <div class="now" aria-current={etatCourant ? 'true' : undefined}>
            <span class="ncv"><AlbumArt coverPath={current.cover_path} albumId={current.album_id ?? null} size={0} alt={current.title} source={current.source} fallbackInitials={current.title?.slice(0,1)} /></span>
            <div class="nmeta">
              <div class="nt"><IndicateurLecture etat={etatCourant} />{current.title}</div>
              <div class="na">{current.artist_name ?? ''}{current.album_title ? ' · ' + current.album_title : ''}</div>
              {#if showExpert && tech(current)}<div class="ntk">{tech(current)}</div>{/if}
            </div>
            <span class="ndur">{formatTime(current.duration_ms ?? 0)}</span>
            <!-- 🔴 #3780 — la piste EN COURS portait zéro action, alors que
                 chaque ligne « à suivre » en dessous porte la barre complète.
                 FabienM, fil 1739 point 6 : « Menu file d'attente : il manque
                 les actions comme sur l'interface actuelle. »
                 C'est la seule ligne de cet écran qu'on regarde à coup sûr, et
                 c'était la seule sans gestes. -->
            <!-- « Lire à partir d'ici » sur la piste EN COURS : c'est un
                 saut au rang courant, donc une reprise du titre depuis son
                 début. Le geste que la file sait faire, et le seul sens que
                 « la suite » ait ici. -->
            <PisteActions piste={current} onLireDepuis={() => jump(pos)} />
          </div>
        </section>
      {/if}

      <section class="sec">
        <h2>{$tr('v2.queue.upNext' as any)}{#if !upNext.length}&nbsp;— {$tr('v2.queue.upNextNone' as any)}{/if}</h2>
        <div class="list" bind:this={listeEl}>
          <!-- Les cales portent la hauteur EXACTE de ce qui n'est pas
               construit : la barre de défilement reste celle de la file
               entière, et rien ne saute quand la fenêtre se déplace. -->
          {#if fenetre.avant > 0}<div class="cale" style:height="{fenetre.avant}px" aria-hidden="true"></div>{/if}
          {#each visibles as t, k (String(t.id ?? '') + '@' + (pos + 1 + fenetre.debut + k))}
            {@const i = fenetre.debut + k}
            {@const idx = pos + 1 + i}
            <div class="row" class:np={t.id != null && t.id === $currentTrackId}>
              <button class="play" onclick={() => jump(idx)} disabled={busy} aria-label={$tr('v2.queue.playTrack' as any).replace('{t}', t.title ?? '')}>
                <span class="n">{i + 1}</span>
                <span class="cv"><AlbumArt coverPath={t.cover_path} albumId={t.album_id ?? null} size={0} alt={t.title} source={t.source} fallbackInitials={t.title?.slice(0,1)} /></span>
                <span class="ti">{t.title}<em>{t.artist_name ?? ''}{t.album_title ? ' · ' + t.album_title : ''}</em></span>
              </button>
              {#if showExpert && tech(t)}<span class="tk">{tech(t)}</span>{/if}
              <span class="dur">{formatTime(t.duration_ms ?? 0)}</span>
              <!-- Les memes actions que partout ailleurs (Bertrand, 05/09/2026 :
                   « Sur file d'attente, il manque des boutons d'action ! »). Les
                   fleches et la croix restent : monter, descendre et retirer
                   sont propres a la FILE, elles n'ont de sens nulle part
                   ailleurs. -->
              <!-- « Lire à partir d'ici » = le saut de file, celui que le
                   grand bouton de la ligne fait déjà. Dans la file, « la
                   suite » n'est pas une liste à renvoyer au serveur : elle est
                   DÉJÀ la file, et `jumpInQueue` la reprend à ce rang. -->
              <PisteActions piste={t} onLireDepuis={() => jump(idx)} />
              {#if showExpert}
                <span class="ord">
                  <button onclick={() => move(idx, idx - 1)} disabled={busy || idx <= pos + 1} aria-label={$tr('v2.queue.moveUp' as any)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 15l6-6 6 6"/></svg>
                  </button>
                  <button onclick={() => move(idx, idx + 1)} disabled={busy || i === upNext.length - 1} aria-label={$tr('v2.queue.moveDown' as any)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>
                  </button>
                </span>
              {/if}
              <button class="del" onclick={() => remove(idx)} disabled={busy} aria-label={$tr('v2.queue.remove' as any)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          {/each}
          {#if fenetre.apres > 0}<div class="cale" style:height="{fenetre.apres}px" aria-hidden="true"></div>{/if}
        </div>
      </section>
    {/if}
  </div>
</section>

<style>
  .v2-queue{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .meta{display:flex; gap:16px; margin-left:auto; font:11.5px var(--v2-mono); color:var(--v2-txt3)}

  .err{display:flex; align-items:center; gap:12px; margin:0 30px 10px; padding:9px 14px; border-radius:10px;
    font-size:12.5px; border:1px solid var(--v2-danger-bd); background:var(--v2-acc-soft)}
  .err button{margin-left:auto; border:0; background:transparent; color:inherit; font-size:16px; cursor:pointer}

  /* `position: relative` n'est pas décoratif : il fait de ce conteneur
     l'offsetParent de la liste, ce qui rend `offsetTop` lisible sans
     recalcul de mise en page (#1126). */
  .scroll{flex:1; position:relative; overflow-y:auto; padding:4px 0 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:30px; color:var(--v2-txt3)}
  .sec{padding:6px 30px 20px}
  .sec h2{font-size:16px; font-weight:700; padding-bottom:12px}

  .now{display:flex; align-items:center; gap:18px; padding:14px 16px; border-radius:14px;
    border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .ncv{width:72px; height:72px; flex:0 0 auto; border-radius:8px; overflow:hidden; box-shadow:var(--v2-sh-card)}
  .nmeta{min-width:0; flex:1}
  .nt{display:flex; align-items:center; gap:8px; min-width:0;
    font-size:16px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .na{margin-top:3px; font-size:13px; color:var(--v2-txt2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .ntk{margin-top:4px; font:10px var(--v2-mono); color:var(--v2-acc2)}
  .ndur{font:12px var(--v2-mono); color:var(--v2-txt3); flex:0 0 auto}

  .list{display:flex; flex-direction:column; gap:1px}
  /* La place des lignes non construites. `flex:0 0 auto` : sans lui le
     conteneur flex les écraserait, et la file entière remonterait. */
  .cale{flex:0 0 auto}
  .row{display:grid; grid-template-columns:1fr auto auto auto auto auto; align-items:center; gap:12px;
    padding:0 8px; border-radius:9px; color:var(--v2-txt2)}
  .row:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .row.np{color:var(--v2-acc1)}
  .play{display:grid; grid-template-columns:26px 40px 1fr; align-items:center; gap:12px; min-width:0;
    border:0; background:transparent; color:inherit; cursor:pointer; text-align:left; padding:7px 0; font-family:inherit}
  .play:disabled{cursor:default}
  .row .n{font:11px var(--v2-mono); color:var(--v2-txt3); text-align:right}
  .row .cv{width:40px; height:40px; border-radius:6px; overflow:hidden}
  .row .ti{min-width:0; font-size:13.5px; font-weight:500; display:flex; flex-direction:column; gap:2px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .row .ti em{font:11px var(--v2-sans); font-style:normal; color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis}
  .row .tk{font:10px var(--v2-mono); color:var(--v2-acc2)}
  .row .dur{font:11.5px var(--v2-mono); color:var(--v2-txt3)}
  .ord{display:flex; gap:2px}
  .ord button, .del{width:26px; height:26px; border-radius:7px; border:1px solid transparent; background:transparent;
    color:var(--v2-txt3); cursor:pointer; display:grid; place-items:center}
  .ord button:hover:not(:disabled){color:var(--v2-txt); border-color:var(--v2-line2)}
  .ord button:disabled{opacity:.25; cursor:default}
  .ord svg{width:13px; height:13px}
  .del:hover:not(:disabled){color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .del svg{width:12px; height:12px}
  .v2-queue.depot{outline:2px dashed var(--v2-acc2); outline-offset:-6px}
  .depot-voile{position:sticky; top:0; z-index:5; padding:14px; text-align:center; border-radius:10px;
    background:var(--v2-acc-soft); color:var(--v2-acc-tint); font:600 13px var(--v2-sans)}
  .depot-barre{padding:8px 12px; font:12px var(--v2-sans); color:var(--v2-txt2)}
</style>
