<script lang="ts">
  /**
   * Le panneau FILE de la vue mini, écrit pour 360 px.
   *
   * Bertrand, essai réel du 01/11/2026 : « affichage file d'attente pourri, en
   * mode mini ». Le panneau montait `QueueV2`, l'écran de BUREAU — ses colonnes
   * se chevauchaient dans 360 px. Ici, une ligne par titre : vignette, titre
   * sur une ligne, artiste dessous, durée à droite, poignée et menu ⋯.
   *
   * - Le titre en cours est mis en évidence et amené à l'écran à l'ouverture.
   * - Lignes de hauteur FIXE : la virtualisation (`fenetreListe`) est exacte,
   *   une longue file ne monte que ce qui se voit.
   * - Toucher une ligne = lire depuis ici ; ⋯ = lire depuis ici, retirer ;
   *   la poignée se glisse pour déplacer.
   * - Les gestes sont ceux de `QueueV2` (mêmes appels, même règle « Vider »).
   */
  import AlbumArt from '../../partages/AlbumArt.svelte';
  import * as api from '../../../lib/api';
  import { currentZoneId, zones, syncZone } from '../../../lib/stores/zones';
  import { shuffleEnabled } from '../../../lib/stores/nowPlaying';
  import { basculerAleatoire } from '../../../lib/aleatoireFile';
  import { libelleAleatoire } from '../../../lib/etatTransport';
  import { notifications } from '../../../lib/stores/notifications';
  import { formatCompactQuality, formatDuration } from '../../../lib/utils';
  import { queueTracks, queuePosition } from '../../../lib/stores/queue';
  import { pisteDeFile } from '../../../lib/pisteDeFile';
  import { fenetreListe } from '../../../lib/fenetreListe';
  import { gesteVider, executerVider } from '../../../lib/viderFile';
  import { feuilleMini } from '../../../lib/vueMini';
  import { HAUTEUR_LIGNE_FILE as H, rangDArrivee, dureeCompacte } from '../../../lib/fileMini';
  import { t } from '../../../lib/i18n';
  import { bulleTexte } from '../../../lib/infobulleTexte';
  import type { Track } from '../../../lib/types';

  /** Hauteur de vue supposée tant que le panneau n'est pas mesuré. */
  const VUE_PAR_DEFAUT = 420;

  const pistes = $derived($queueTracks.map(pisteDeFile) as Track[]);
  const pos = $derived($queuePosition);
  const geste = $derived(gesteVider(pistes.length, pos));
  /** Le titre en cours, en carte ; la liste porte « À suivre » (et ce qui a joué). */
  const enCours = $derived(pistes[pos] ?? null);
  const aSuivre = $derived(Math.max(0, pistes.length - pos - 1));
  const resteMs = $derived(pistes.slice(pos + 1).reduce((s, p) => s + (p.duration_ms ?? 0), 0));
  const resume = $derived(
    $t('queue.upNextSummary' as any).replace('{count}', String(aSuivre)).replace('{time}', formatDuration(resteMs)),
  );

  const zoneCourante = $derived($zones.find((z) => z.id === $currentZoneId) ?? null);
  const aleatoireActif = $derived(zoneCourante?.shuffle ?? $shuffleEnabled);
  const autoplayActif = $derived(zoneCourante?.autoplay_enabled === true);
  let menuTete = $state(false);

  let scroller = $state<HTMLElement | null>(null);
  let defilement = $state(0);
  let hauteurVue = $state(0);
  let occupe = $state(false);
  let erreur = $state<string | null>(null);
  let menuDe = $state<number | null>(null);

  const vue = $derived(hauteurVue > 0 ? hauteurVue : VUE_PAR_DEFAUT);
  /** « À suivre » : les rangs `pos + 1…` de la file. `i` reste le rang dans la file. */
  const base = $derived(pos + 1);
  const suite = $derived(pistes.slice(base));
  const fenetre = $derived(fenetreListe(suite.length, H, defilement, vue));
  const visibles = $derived(suite.slice(fenetre.debut, fenetre.fin).map((p, k) => ({ p, i: base + fenetre.debut + k })));

  async function recharger() {
    const zid = $currentZoneId;
    if (zid == null) return;
    try {
      const qs = await api.getQueue(zid);
      queueTracks.set(qs.tracks ?? []);
      queuePosition.set(qs.position ?? 0);
      erreur = null;
    } catch {
      erreur = $t('v2.queue.loadFailed' as any);
    }
  }

  // À l'ouverture : relire la file. Le titre en cours est la carte du haut,
  // toujours visible ; la liste commence au suivant.
  $effect(() => { void recharger(); });

  function auDefilement() {
    if (!scroller) return;
    defilement = scroller.scrollTop;
    hauteurVue = scroller.clientHeight;
  }

  async function agir(fn: () => Promise<unknown>) {
    if (occupe) return;
    occupe = true;
    menuDe = null;
    try { await fn(); await recharger(); }
    catch { erreur = $t('settings.errActionFailed' as any); }
    occupe = false;
  }
  const lireDepuis = (i: number) => agir(() => api.jumpInQueue($currentZoneId!, i));
  const retirer = (i: number) => agir(() => api.removeFromQueue($currentZoneId!, i));
  const deplacer = (de: number, vers: number) => agir(() => api.moveInQueue($currentZoneId!, de, vers));
  const vider = () => { const g = geste; if (g) void agir(() => executerVider($currentZoneId!, g)); };

  /** Le menu ⋯ de l'en-tête : les gestes de `QueueV2`, mêmes appels. */
  async function basculerAleatoireFile() {
    const z = zoneCourante;
    menuTete = false;
    if (!z?.id) return;
    try {
      const actif = await basculerAleatoire(z.id, !aleatoireActif);
      zones.update((zs) => zs.map((x) => (x.id === z.id ? { ...x, shuffle: actif } : x)));
      shuffleEnabled.set(actif);
      await recharger();
    } catch { erreur = $t('settings.errActionFailed' as any); }
  }
  async function basculerAutoplay() {
    const z = zoneCourante;
    menuTete = false;
    if (!z?.id) return;
    const suivant = !autoplayActif;
    try {
      syncZone(await api.updateZoneAutoplay(z.id, suivant));
      notifications.success($t((suivant ? 'queue.autoplayOn' : 'queue.autoplayOff') as any));
    } catch { notifications.error($t('queue.autoplayFailed' as any)); }
  }

  /* --- Glisser par la poignée ------------------------------------------ */
  let glisse = $state<{ de: number; y0: number; vers: number } | null>(null);
  function saisir(e: PointerEvent, i: number) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    glisse = { de: i, y0: e.clientY, vers: i };
  }
  function glisser(e: PointerEvent) {
    if (!glisse) return;
    glisse = { ...glisse, vers: base + rangDArrivee(glisse.de - base, e.clientY - glisse.y0, suite.length) };
  }
  function lacher() {
    const g = glisse;
    glisse = null;
    if (g && g.vers !== g.de) void deplacer(g.de, g.vers);
  }
</script>

<div class="file" data-file-mini>
  <header class="tete">
    <h3 use:bulleTexte data-resume-file><span class="nom">{$t('queue.title' as any)}</span> · {resume}</h3>
    <button class="rond" onclick={() => (menuTete = !menuTete)} aria-label={$t('mini.file.actions' as any)}
      aria-expanded={menuTete} data-menu-tete>
      <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
    </button>
    <button class="rond" onclick={() => feuilleMini.set(null)} aria-label={$t('common.close' as any)} data-fermer-file>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
    </button>
    {#if menuTete}
      <div class="menu menu-tete" role="menu" data-menu-tete-ouvert>
        <button role="menuitemcheckbox" aria-checked={aleatoireActif} onclick={basculerAleatoireFile} data-menu-aleatoire>
          {libelleAleatoire($t, aleatoireActif)}
        </button>
        <button role="menuitemcheckbox" aria-checked={autoplayActif} onclick={basculerAutoplay} data-menu-similaires>
          {$t('queue.autoplayLabel' as any)}{autoplayActif ? ' ✓' : ''}
        </button>
        {#if geste}
          <button role="menuitem" onclick={vider} disabled={occupe} data-vider-file>
            {geste === 'tout' ? $t('queue.clearAllLabel' as any) : $t('v2.queue.clear' as any)}
          </button>
        {/if}
      </div>
    {/if}
  </header>
  {#if enCours}
    <div class="en-cours" data-en-cours-file>
      <span class="cv cv40"><AlbumArt coverPath={enCours.cover_path ?? null} albumId={enCours.album_id ?? null} size={40} alt={enCours.title ?? ''} /></span>
      <span class="tx">
        <span class="t1" use:bulleTexte>{enCours.title ?? $t('queue.unknownTrack' as any)}</span>
        <span class="t2" use:bulleTexte>{enCours.artist_name ?? ''}</span>
        {#if formatCompactQuality(enCours)}<span class="fmt" use:bulleTexte>{formatCompactQuality(enCours)}</span>{/if}
      </span>
      <span class="du">{dureeCompacte(enCours.duration_ms)}</span>
    </div>
  {/if}
  {#if erreur}<p class="erreur">{erreur}</p>{/if}

  <div class="defile" bind:this={scroller} onscroll={auDefilement} data-defile-file>
    {#if pistes.length === 0}
      <p class="vide">{$t('v2.queue.empty' as any)}</p>
    {:else if suite.length === 0}
      <p class="vide">{$t('queue.nothingNext' as any)}</p>
    {:else}
      <ol class="liste" style:padding-top="{fenetre.debut * H}px" style:padding-bottom="{(suite.length - fenetre.fin) * H}px" data-a-suivre>
        {#each visibles as { p, i } (i)}
          <li class="ligne"
            class:glissee={glisse?.de === i} class:cible={glisse && glisse.vers === i && glisse.de !== i}
            data-rang={i}>
            <button class="poignee" aria-label={$t('mini.file.deplacer' as any)}
              onpointerdown={(e) => saisir(e, i)} onpointermove={glisser} onpointerup={lacher} onpointercancel={() => (glisse = null)}
              data-poignee>
              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
            </button>
            <button class="corps" onclick={() => lireDepuis(i)} disabled={occupe} data-lire-ligne>
              <span class="cv"><AlbumArt coverPath={p.cover_path ?? null} albumId={p.album_id ?? null} size={38} alt={p.title ?? ''} /></span>
              <span class="tx">
                <span class="t1" use:bulleTexte>{p.title ?? $t('queue.unknownTrack' as any)}</span>
                <span class="t2" use:bulleTexte>{p.artist_name ?? ''}</span>
              </span>
              <span class="du">{dureeCompacte(p.duration_ms)}</span>
            </button>
            <button class="plus" onclick={() => (menuDe = menuDe === i ? null : i)} aria-label={$t('mini.file.actions' as any)}
              aria-expanded={menuDe === i} data-menu-ligne>
              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
            </button>
            {#if menuDe === i}
              <div class="menu" role="menu">
                <button role="menuitem" onclick={() => lireDepuis(i)} data-menu-lire>{$t('common.playFromHere' as any)}</button>
                <button role="menuitem" onclick={() => retirer(i)} data-menu-retirer>{$t('v2.queue.remove' as any)}</button>
              </div>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</div>

<style>
  .file{display:flex; flex-direction:column; min-width:0; min-height:0; height:100%; overflow-x:hidden;
    font-family:var(--v2-sans); color:var(--v2-txt)}
  .tete{position:relative; flex:0 0 auto; min-width:0; display:flex; align-items:center; gap:4px; padding:2px 6px 6px 14px}
  .tete h3{flex:1; min-width:0; margin:0; font-size:13px; font-weight:500; color:var(--v2-txt2);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .tete .nom{font-size:15px; font-weight:700; color:var(--v2-txt)}
  .rond{flex:0 0 auto; width:32px; height:32px; display:grid; place-items:center; border:0; border-radius:50%;
    background:none; color:var(--v2-txt2); cursor:pointer}
  .rond svg{width:16px; height:16px}
  .menu-tete{top:38px; right:44px}
  .en-cours{flex:0 0 auto; min-width:0; display:flex; align-items:center; gap:10px; margin:0 10px 6px; padding:8px 10px;
    border-radius:10px; background:var(--v2-active1); box-shadow:inset 3px 0 0 var(--v2-acc1)}
  .en-cours .t1{color:var(--v2-acc1)}
  .cv40{flex:0 0 40px; width:40px; height:40px}
  .fmt{font:500 10px var(--v2-mono); color:var(--v2-txt3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .erreur, .vide{padding:12px 14px; font-size:12.5px; color:var(--v2-txt2)}
  .defile{flex:1; min-width:0; min-height:0; overflow-y:auto; overflow-x:hidden; overscroll-behavior:contain}
  .liste{list-style:none; margin:0; padding-left:0; padding-right:0; min-width:0; box-sizing:border-box}
  .ligne{position:relative; min-width:0; height:56px; display:flex; align-items:center; gap:2px; padding:0 4px 0 2px; box-sizing:border-box}
  .ligne.glissee{opacity:.4}
  .ligne.cible{box-shadow:inset 0 2px 0 var(--v2-acc1)}
  .poignee{flex:0 0 28px; height:44px; display:grid; place-items:center; border:0; background:none;
    color:var(--v2-txt3); cursor:grab; touch-action:none}
  .poignee svg{width:14px; height:14px}
  .corps{flex:1; min-width:0; height:100%; display:flex; align-items:center; gap:10px; border:0; background:none;
    padding:0; color:inherit; cursor:pointer; text-align:left}
  .cv{flex:0 0 38px; width:38px; height:38px; border-radius:4px; overflow:hidden}
  .tx{flex:1; min-width:0; display:flex; flex-direction:column; gap:2px}
  .t1{font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .t2{font-size:11.5px; color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .du{flex:0 0 auto; font:500 11px var(--v2-mono); color:var(--v2-txt3); padding-left:4px}
  .plus{flex:0 0 36px; height:44px; display:grid; place-items:center; border:0; background:none; color:var(--v2-txt2); cursor:pointer}
  .plus svg{width:16px; height:16px}
  .menu{position:absolute; right:8px; top:46px; z-index:3; min-width:170px; display:flex; flex-direction:column;
    padding:4px; border-radius:10px; background:var(--v2-surface); border:1px solid var(--v2-line2); box-shadow:var(--v2-sh-lg)}
  .menu button{border:0; background:none; text-align:left; padding:9px 12px; border-radius:6px;
    color:var(--v2-txt); font:500 13px var(--v2-sans); cursor:pointer}
  .menu button:hover{background:var(--v2-hover)}
</style>
