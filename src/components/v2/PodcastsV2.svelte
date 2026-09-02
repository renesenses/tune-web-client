<script lang="ts">
  /**
   * Podcasts — nouveau client (direction Levente).
   *
   * Entrée du NOYAU depuis l'alignement sur le brouillon v3 : c'est un mode
   * d'écoute à part entière, présent à tous les niveaux.
   *
   * Densité par niveau :
   *   Essentiel → vos abonnements, et les épisodes d'une émission.
   *   Avancé    → onglet « Découvrir » (sélection + populaires) et recherche.
   *   Expert    → durée et date de publication détaillées sur chaque épisode.
   *
   * Les charges lourdes (découverte, épisodes) ne partent QUE lorsque leur
   * onglet est ouvert : ouvrir Podcasts ne doit pas déclencher trois appels
   * réseau dont deux ne seront jamais regardés.
   */
  import * as api from '../../lib/api';
  import { currentZoneId } from '../../lib/stores/zones';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { fold, formatDuration } from '../../lib/utils';
  import AlbumArt from '../AlbumArt.svelte';
  import { PODCAST_GENRES } from '../../lib/podcast-genres';
  import { t } from '../../lib/i18n';
  import '../../styles/tune-v2.css';

  const level = $derived($preferences.settingsLevel);
  const showDiscover = $derived(atLeast(level, 'intermediate'));
  const showExpert = $derived(atLeast(level, 'expert'));

  type Tab = 'subs' | 'discover' | 'search';
  /**
   * DÉCOUVRIR en premier — décision de Bertrand du 02/09/2026, et c'est aussi
   * l'onglet par défaut de l'écran actuel. Ouvrir sur des abonnements vides ne
   * propose rien ; ouvrir sur la découverte propose tout de suite quelque
   * chose à écouter.
   */
  let tab = $state<Tab>('discover');
  let q = $state('');

  let subs = $state<any[]>([]);
  let subsLoading = $state(true);
  let discover = $state<{ curated: any[]; top: any[] } | null>(null);
  let discoverLoading = $state(false);
  let discoverLoaded = false;
  let error = $state<string | null>(null);

  // Émission ouverte + ses épisodes.
  let opened = $state<any | null>(null);
  let episodes = $state<any[]>([]);
  let epLoading = $state(false);
  let playingUrl = $state<string | null>(null);

  $effect(() => {
    api.getPodcastSubscriptions()
      .then((r) => { subs = r ?? []; })
      .catch(() => { error = 'Abonnements indisponibles.'; })
      .finally(() => { subsLoading = false; });
  });

  /**
   * PARITÉ avec l'écran actuel — demandé par Bertrand le 02/09/2026.
   *
   * Trois choses manquaient au nouveau client, et chacune est un usage entier :
   *
   *  - la RECHERCHE de podcasts (`searchPodcasts`), qui n'existait pas ;
   *  - le PALMARÈS par genre et par PAYS (`getTopPodcasts`) : la découverte se
   *    limitait à une sélection figée ;
   *  - RADIO FRANCE (`getRadioFrancePodcasts`), une source à part entière.
   */
  const PAYS = [
    { code: 'fr', drapeau: '🇫🇷', nom: 'France' },
    { code: 'us', drapeau: '🇺🇸', nom: 'USA' },
    { code: 'gb', drapeau: '🇬🇧', nom: 'UK' },
    { code: 'de', drapeau: '🇩🇪', nom: 'Deutschland' },
    { code: 'es', drapeau: '🇪🇸', nom: 'España' },
    { code: 'it', drapeau: '🇮🇹', nom: 'Italia' },
    { code: 'be', drapeau: '🇧🇪', nom: 'Belgique' },
    { code: 'ch', drapeau: '🇨🇭', nom: 'Suisse' },
    { code: 'ca', drapeau: '🇨🇦', nom: 'Canada' },
  ];
  // Le pays vient de la préférence, pas d'un « fr » en dur : les palmarès
  // sortent de l'iTunes Store du pays choisi, et annoncer « France » au-dessus
  // de podcasts américains était le défaut corrigé côté client actuel.
  let pays = $state(api.podcastCountry());

  /**
   * La LANGUE — distincte du pays, et elle ne sert QU'À LA RECHERCHE.
   *
   * L'écran actuel les sépare, et c'est juste : le palmarès vient du magasin
   * d'un PAYS, tandis que la recherche filtre par langue de publication. Les
   * confondre ferait chercher en français dans le magasin américain sans
   * qu'on comprenne pourquoi les résultats manquent.
   */
  const LANGUES = [
    { code: 'fr', nom: 'Français' },
    { code: 'en', nom: 'English' },
    { code: 'de', nom: 'Deutsch' },
    { code: 'es', nom: 'Español' },
    { code: 'it', nom: 'Italiano' },
    { code: 'pt', nom: 'Português' },
    { code: 'nl', nom: 'Nederlands' },
  ];
  let langue = $state(navigator.language?.split('-')[0] || 'fr');


  let genre = $state<number | null>(null);
  /**
   * Titre du palmarès : le nom du genre choisi, « Tendances » sinon.
   *
   * Calculé ICI et non dans le balisage : `{@const}` n'est légal qu'en enfant
   * direct d'un bloc, et l'y glisser sous une `<div>` casse la compilation —
   * vécu à l'instant, l'écran ne s'affichait plus du tout.
   *
   * « Tendances » au-dessus d'une liste filtrée par genre annoncerait autre
   * chose que ce qu'on voit.
   */
  const titrePalmares = $derived.by(() => {
    const cle = PODCAST_GENRES.find((g) => g.id === genre)?.key;
    return cle ? $t(cle as any) : $t('v2.pod.trends' as any);
  });
  let top = $state<any[]>([]);
  let topLoading = $state(false);
  /**
   * Le palmarès se lit en DEUX temps, comme l'écran actuel.
   *
   * Les dix premiers en bandeau, numérotés : un classement dont on ne voit pas
   * le rang n'est plus un classement, c'est une grille dans un ordre
   * arbitraire. Le reste suit en grille.
   */
  const tete = $derived(top.slice(0, 10));
  const suite = $derived(top.slice(10, 50));

  /**
   * Délai au-delà duquel on cesse d'attendre.
   *
   * Un appel qui ne revient JAMAIS laissait « Chargement… » à l'écran pour
   * toujours, sans rien dire — et rien ne distinguait ce cas d'un serveur
   * lent. Le palmarès met environ deux secondes sur le serveur de Bertrand ;
   * quinze laissent une marge large tout en garantissant qu'on finit par
   * afficher quelque chose.
   */
  const DELAI_MS = 15000;

  /** Attend `p`, ou renonce au bout de `DELAI_MS`. */
  function avecDelai<T>(p: Promise<T>): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, rejeter) =>
        setTimeout(() => rejeter(new Error('delai depasse')), DELAI_MS),
      ),
    ]);
  }

  /**
   * Pourquoi le palmarès a échoué, s'il a échoué.
   *
   * 🔴 Déclaré ICI, AVANT l'effet qui l'écrit. Il vivait après : l'effet
   * s'exécute au montage, touchait une variable pas encore initialisée, et
   * levait une `ReferenceError` AVANT même de lancer la requête. `topLoading`
   * restait donc à `true` pour toujours — c'est le « Chargement du palmarès… »
   * éternel que Bertrand voyait (02/09/2026).
   */
  let topErreur = $state<string | null>(null);

  /** Palmarès : rechargé à chaque changement de genre OU de pays. */
  $effect(() => {
    if (tab !== 'discover') return;
    const g = genre;
    const c = pays;
    topLoading = true;
    topErreur = null;
    avecDelai(api.getTopPodcasts(g, 50, c))
      .then((r) => {
        top = r ?? [];
      })
      .catch((e) => {
        top = [];
        // On DIT que ça a échoué : un « aucun podcast » sur une panne réseau
        // se lit comme un catalogue vide, et on cherche au mauvais endroit.
        topErreur = e?.message === 'delai depasse' ? 'delai' : 'erreur';
      })
      .finally(() => {
        topLoading = false;
      });
  });

  // ── Radio France ─────────────────────────────────────────────────────────
  let radioFrance = $state<any[]>([]);
  let rfLoaded = false;
  $effect(() => {
    if (tab !== 'discover' || rfLoaded) return;
    rfLoaded = true;
    api
      .getRadioFrancePodcasts()
      .then((r) => {
        radioFrance = r ?? [];
      })
      .catch(() => {
        // Radio France indisponible : la section disparaît, le reste de la
        // découverte n'en souffre pas.
        radioFrance = [];
      });
  });

  // ── Recherche ────────────────────────────────────────────────────────────
  let recherche = $state('');
  let resultats = $state<any[] | null>(null);
  let rechercheEnCours = $state(false);

  async function chercher() {
    const requete = recherche.trim();
    if (!requete) {
      resultats = null;
      return;
    }
    rechercheEnCours = true;
    try {
      resultats = (await api.searchPodcasts(requete, 30, pays, langue)) ?? [];
    } catch {
      resultats = [];
    }
    rechercheEnCours = false;
  }

  // Découverte : chargée à la PREMIÈRE ouverture de l'onglet seulement.
  $effect(() => {
    if (tab !== 'discover' || discoverLoaded) return;
    discoverLoaded = true;
    discoverLoading = true;
    avecDelai(api.getDiscoverPodcasts())
      .then((d) => { discover = { curated: d?.curated ?? [], top: d?.top ?? [] }; })
      .catch(() => { discover = { curated: [], top: [] }; })
      .finally(() => { discoverLoading = false; });
  });

  function title(p: any): string {
    return p?.name ?? p?.title ?? p?.collectionName ?? 'Sans titre';
  }
  function cover(p: any): string | null {
    return p?.cover_url ?? p?.image_url ?? p?.artworkUrl600 ?? p?.artworkUrl100 ?? null;
  }
  function author(p: any): string {
    return p?.author ?? p?.artistName ?? '';
  }
  function feedOf(p: any): string | null {
    return p?.feed_url ?? p?.feedUrl ?? null;
  }

  function match(p: any): boolean {
    if (!q) return true;
    const n = fold(q);
    return fold(title(p)).includes(n) || fold(author(p)).includes(n);
  }
  const visibleSubs = $derived(subs.filter(match));

  async function openPodcast(p: any) {
    const feed = feedOf(p);
    if (!feed) return;
    opened = p; episodes = []; epLoading = true;
    try {
      episodes = await api.getPodcastEpisodes(feed, 50, undefined, p?.id ?? p?.subscription_id, p?.source_id);
    } catch {
      error = 'Épisodes indisponibles.';
    }
    epLoading = false;
  }

  async function playEpisode(ep: any) {
    const zid = $currentZoneId;
    if (zid == null) { error = 'Aucune zone active.'; return; }
    playingUrl = ep.audio_url;
    try {
      await api.playPodcastEpisode(zid, {
        audio_url: ep.audio_url,
        title: ep.title,
        podcast_name: title(opened),
        cover_url: ep.cover_url ?? cover(opened) ?? undefined,
        duration_ms: ep.duration_ms,
      });
    } catch {
      error = 'Lecture impossible.';
    } finally {
      setTimeout(() => { playingUrl = null; }, 2000);
    }
  }

  const isSubscribed = $derived.by(() => {
    const feeds = new Set(subs.map(feedOf).filter(Boolean));
    return (p: any) => { const f = feedOf(p); return !!f && feeds.has(f); };
  });

  async function toggleSub(p: any, e: MouseEvent) {
    e.stopPropagation();
    const feed = feedOf(p);
    if (!feed) return;
    const existing = subs.find((s) => feedOf(s) === feed);
    try {
      if (existing?.id != null) {
        await api.unsubscribePodcast(existing.id);
        subs = subs.filter((s) => s.id !== existing.id);
      } else {
        const created = await api.subscribePodcast({
          title: title(p), feed_url: feed, author: author(p) || undefined,
          image_url: cover(p) ?? undefined, source_id: p?.source_id ?? undefined,
        });
        subs = [...subs, created ?? { id: null, title: title(p), feed_url: feed }];
      }
    } catch { error = 'Abonnement impossible.'; }
  }

  function epDate(ep: any): string {
    const d = ep?.published_at ?? ep?.pub_date ?? ep?.published;
    if (!d) return '';
    const t = typeof d === 'number' ? new Date(d * (d < 1e12 ? 1000 : 1)) : new Date(d);
    return isNaN(t.getTime()) ? '' : t.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
</script>

<section class="v2-pod tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">À la demande</div>
      <h1>Podcasts</h1>
    </div>
    {#if showDiscover}
      <nav class="tabs">
        <button class:on={tab === 'discover'} onclick={() => (tab = 'discover')}>Découvrir</button>
        <button class:on={tab === 'subs'} onclick={() => (tab = 'subs')}>Mes abonnements</button>
        <button class:on={tab === 'search'} onclick={() => (tab = 'search')}>{$t('v2.pod.search' as any)}</button>
      </nav>
    {/if}
    {#if showDiscover && tab !== 'subs'}
      <!-- Le PAYS commande les palmarès ET la recherche : les deux
           interrogent l'iTunes Store d'un pays donné. -->
      {#if tab === 'search'}
        <!-- La langue ne concerne QUE la recherche : l'afficher au-dessus d'un
             palmarès qu'elle ne filtre pas promettrait un effet inexistant. -->
        <select class="pays" bind:value={langue} aria-label="Langue">
          {#each LANGUES as l (l.code)}
            <option value={l.code}>{l.nom}</option>
          {/each}
        </select>
      {/if}
      <select class="pays" bind:value={pays} aria-label="Pays">
        {#each PAYS as c (c.code)}
          <option value={c.code}>{c.drapeau} {c.nom}</option>
        {/each}
      </select>
    {/if}
    <div class="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input placeholder="Rechercher" bind:value={q} />
    </div>
  </header>

  {#if error}<div class="err" role="status">{error}<button onclick={() => (error = null)} aria-label="Fermer">×</button></div>{/if}

  <div class="scroll">
    {#if tab === 'subs'}
      {#if subsLoading}
        <div class="state">Chargement des abonnements…</div>
      {:else if !subs.length}
        <div class="state">Aucun abonnement.{showDiscover ? ' Passez par « Découvrir » pour en trouver.' : ''}</div>
      {:else if !visibleSubs.length}
        <div class="state">Aucun abonnement ne correspond.</div>
      {:else}
        <div class="grid">
          {#each visibleSubs as p (p.id ?? feedOf(p))}
            {@render tile(p, true)}
          {/each}
        </div>
      {/if}

    {:else if tab === 'search'}
      <form class="rech" onsubmit={(e) => { e.preventDefault(); void chercher(); }}>
        <input bind:value={recherche} placeholder={$t('v2.pod.searchPlaceholder' as any)} aria-label={$t('v2.pod.searchPlaceholder' as any)} />
        <button type="submit" disabled={rechercheEnCours || !recherche.trim()}>
          {rechercheEnCours ? $t('v2.pod.searching' as any) : $t('v2.pod.searchAction' as any)}
        </button>
      </form>
      {#if resultats == null}
        <!-- On DIT ce que la recherche interroge : un résultat vide sur un
             pays qui n'est pas celui qu'on croit se lit comme une panne. -->
        <div class="state">{$t('v2.pod.searchHint' as any)} {PAYS.find((c) => c.code === pays)?.nom ?? pays.toUpperCase()}.</div>
      {:else if !resultats.length}
        <div class="state">Aucun résultat.</div>
      {:else}
        <div class="grid">{#each resultats as p, i (feedOf(p) ?? i)}{@render tile(p, false)}{/each}</div>
      {/if}

    {:else}
      <!-- 🔴 Le palmarès, Radio France et la recherche ne dépendent PLUS de
           `discover`. Tout pendait de `{:else if discover}` : si `/podcasts/
           discover` échouait, l'onglet entier restait vide — y compris les
           sections qui, elles, avaient leurs données. Constaté par Bertrand le
           02/09/2026 : « Découvrir podcasts : vide ». -->
      {#if discoverLoading && !discover}
        <div class="state">Chargement de la sélection…</div>
      {/if}
      {#if discover?.curated.length}
        <section class="sec"><h2>Sélection</h2>
          <div class="grid">{#each discover.curated.filter(match) as p, i (feedOf(p) ?? i)}{@render tile(p, false)}{/each}</div>
        </section>
      {/if}
      {#if discover?.top.length}
        <section class="sec"><h2>Populaires</h2>
          <div class="grid">{#each discover.top.filter(match) as p, i (feedOf(p) ?? i)}{@render tile(p, false)}{/each}</div>
        </section>
      {/if}
      <!-- PALMARÈS par genre. Les puces commandent `getTopPodcasts`, qui
           interroge l'iTunes Store du pays choisi. -->
      <section class="sec">
        <div class="sec-tete">
          <h2>{titrePalmares}</h2>
          <span class="sec-pays">{PAYS.find((c) => c.code === pays)?.nom ?? pays.toUpperCase()}</span>
        </div>
        <div class="puces">
          <!-- PAS de bouton « Tous » ajouté ici : `PODCAST_GENRES` commence
               déjà par `{ id: null, key: 'podcasts.genre.all' }`. En ajouter un
               en donnait DEUX, côte à côte et tous deux actifs. -->
          {#each PODCAST_GENRES as g (g.id)}
            <button class:on={genre === g.id} onclick={() => (genre = g.id)}>{$t(g.key as any)}</button>
          {/each}
        </div>
        {#if topLoading}
          <div class="state">{$t('v2.pod.topLoading' as any)}</div>
        {:else if topErreur}
          <div class="state err-inline">
            {topErreur === 'delai'
              ? $t('v2.pod.topTimeout' as any)
              : $t('v2.pod.topFailed' as any)}
            <button class="relancer" onclick={() => (pays = pays)}>{$t('v2.pod.retry' as any)}</button>
          </div>
        {:else if !top.length}
          <div class="state">{$t('v2.pod.noneInGenre' as any)}</div>
        {:else}
          <!-- Les DIX premiers en bandeau, numérotés. Un classement dont on ne
               voit pas le rang n'est plus un classement. -->
          <div class="tete">
            {#each tete as p, i (feedOf(p) ?? i)}
              <div class="rangee">
                <span class="rang">#{i + 1}</span>
                {@render tile(p, false)}
              </div>
            {/each}
          </div>
          {#if suite.length}
            <div class="grid suite">{#each suite.filter(match) as p, i (feedOf(p) ?? i)}{@render tile(p, false)}{/each}</div>
          {/if}
        {/if}
      </section>

      {#if radioFrance.length}
        <section class="sec"><h2>Radio France</h2>
          <div class="grid">{#each radioFrance.filter(match) as p, i (feedOf(p) ?? i)}{@render tile(p, false)}{/each}</div>
        </section>
      {/if}

      {#if !discoverLoading && !discover?.curated.length && !discover?.top.length && !top.length && !radioFrance.length}
        <div class="state">Découverte indisponible sur ce serveur.</div>
      {/if}

    {/if}
  </div>

  {#if opened}
    <div class="detail">
      <button class="close" onclick={() => (opened = null)} aria-label="Fermer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div class="dhead">
        <span class="dart"><AlbumArt coverPath={cover(opened)} albumId={null} size={0} alt={title(opened)} fallbackInitials={title(opened).slice(0,1)} /></span>
        <div class="dmeta">
          <h1>{title(opened)}</h1>
          {#if author(opened)}<div class="dau">{author(opened)}</div>{/if}
          <div class="dact">
            <button class="lnk" onclick={(e) => toggleSub(opened, e)}>
              {isSubscribed(opened) ? 'Se désabonner' : "S'abonner"}
            </button>
          </div>
        </div>
      </div>
      <div class="eps">
        {#if epLoading}
          <div class="state">Chargement des épisodes…</div>
        {:else if !episodes.length}
          <div class="state">Aucun épisode.</div>
        {:else}
          {#each episodes as ep, i (ep.audio_url ?? i)}
            <button class="ep" class:live={playingUrl === ep.audio_url} onclick={() => playEpisode(ep)}>
              <span class="ei">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8V4z"/></svg>
              </span>
              <span class="et">{ep.title}
                {#if showExpert}<em>{[epDate(ep), ep.duration_ms ? formatDuration(ep.duration_ms) : ''].filter(Boolean).join(' · ')}</em>{/if}
              </span>
              {#if !showExpert && ep.duration_ms}<span class="ed">{formatDuration(ep.duration_ms)}</span>{/if}
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</section>

{#snippet tile(p: any, sub: boolean)}
  <div class="pc">
    <button class="open" onclick={() => openPodcast(p)} aria-label={`Ouvrir ${title(p)}`}></button>
    <span class="cv"><AlbumArt coverPath={cover(p)} albumId={null} size={0} alt={title(p)} fallbackInitials={title(p).slice(0,1)} /></span>
    <span class="nm">{title(p)}</span>
    {#if author(p)}<span class="au">{author(p)}</span>{/if}
    <button class="sub" class:on={sub || isSubscribed(p)} onclick={(e) => toggleSub(p, e)}
      aria-label={isSubscribed(p) ? 'Se désabonner' : "S'abonner"}>
      {#if isSubscribed(p)}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
      {/if}
    </button>
  </div>
{/snippet}

<style>
  .pays{background:var(--v2-surface2); border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill);
    color:var(--v2-txt2); font:600 12.5px var(--v2-sans); padding:8px 12px; cursor:pointer}
  .sec-tete{display:flex; align-items:baseline; gap:10px}
  .sec-pays{font:10px var(--v2-mono); color:var(--v2-txt3)}
  .puces{display:flex; flex-wrap:wrap; gap:6px; margin:10px 0 14px}
  .puces button{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2);
    cursor:pointer; font:600 12px var(--v2-sans); padding:6px 12px; border-radius:var(--v2-r-pill)}
  .puces button:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .puces button.on{color:var(--v2-on-acc); border-color:transparent;
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  /* Bandeau horizontal : les dix premiers défilent, ils ne repoussent pas le
     reste de la page sous la ligne de flottaison. */
  .tete{display:flex; gap:16px; overflow-x:auto; padding-bottom:8px; margin-bottom:22px;
    scrollbar-width:thin}
  .rangee{position:relative; flex:0 0 176px}
  .rang{position:absolute; top:8px; left:8px; z-index:2; padding:2px 7px; border-radius:var(--v2-r-pill);
    background:rgba(18,18,20,.82); color:#fff; font:700 11px var(--v2-mono)}
  .suite{margin-top:4px}
  .err-inline{display:flex; align-items:center; gap:12px; color:var(--v2-danger)}
  .relancer{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2);
    border-radius:var(--v2-r-pill); font:600 12px var(--v2-sans); padding:5px 12px; cursor:pointer}
  .relancer:hover{color:var(--v2-txt)}
  .rech{display:flex; gap:8px; margin-bottom:16px}
  .rech input{flex:1; min-width:0; background:var(--v2-surface2); border:1px solid var(--v2-line2);
    border-radius:10px; color:var(--v2-txt); font:inherit; font-size:13.5px; padding:9px 12px}
  .rech button{border:0; border-radius:10px; background:var(--v2-acc1); color:var(--v2-on-acc);
    font:600 13px var(--v2-sans); padding:9px 16px; cursor:pointer}
  .rech button:disabled{opacity:.5; cursor:default}

  .v2-pod{position:relative; display:flex; flex-direction:column; height:100%; background:var(--v2-bg);
    color:var(--v2-txt); font-family:var(--v2-sans); overflow:hidden}
  .top{display:flex; align-items:flex-end; gap:22px; padding:24px 30px 14px; padding-right:96px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .tabs{display:flex; gap:4px}
  .tabs button{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:600 12px var(--v2-sans); padding:8px 14px; border-radius:var(--v2-r-pill); transition:.15s}
  .tabs button:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .tabs button.on{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .search{position:relative; margin-left:auto; display:flex; align-items:center; width:260px; flex:0 0 auto}
  .search svg{position:absolute; left:14px; width:16px; height:16px; color:var(--v2-txt3); pointer-events:none}
  .search input{width:100%; height:40px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:13px var(--v2-sans); padding:0 14px 0 38px; outline:none}
  .search input:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}

  .err{display:flex; align-items:center; gap:12px; margin:0 30px 10px; padding:9px 14px; border-radius:10px;
    font-size:12.5px; color:var(--v2-txt); border:1px solid var(--v2-danger-bd); background:var(--v2-acc-soft)}
  .err button{margin-left:auto; border:0; background:transparent; color:inherit; font-size:16px; cursor:pointer}

  .scroll{flex:1; overflow-y:auto; padding:4px 0 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:30px; color:var(--v2-txt3)}
  .sec{padding:6px 30px 20px}
  .sec h2{font-size:17px; font-weight:700; padding-bottom:14px}
  .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:20px; padding:0 30px}
  .sec .grid{padding:0}

  .pc{position:relative; display:flex; flex-direction:column}
  .open{position:absolute; inset:0; z-index:1; border:0; background:transparent; cursor:pointer; border-radius:var(--v2-r-card)}
  .open:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
  .cv{display:block; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden; box-shadow:var(--v2-sh-card); transition:.18s}
  .pc:hover .cv{box-shadow:0 10px 24px var(--v2-glow)}
  .nm{margin-top:9px; font:600 13px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .au{margin-top:2px; font:11px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .sub{position:absolute; top:8px; right:8px; z-index:2; width:30px; height:30px; border-radius:50%; cursor:pointer;
    border:0; background:rgba(0,0,0,.5); color:#fff; display:grid; place-items:center; opacity:0; transition:.16s}
  .pc:hover .sub, .sub.on{opacity:1}
  .sub.on{color:var(--v2-acc1)}
  .sub svg{width:15px; height:15px}

  .detail{position:absolute; inset:0; z-index:30; background:var(--v2-bg); overflow-y:auto; padding:26px 34px 40px}
  .close{position:sticky; top:0; width:40px; height:40px; border-radius:12px; cursor:pointer; margin-bottom:8px;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt2); display:grid; place-items:center}
  .close:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .close svg{width:18px; height:18px}
  .dhead{display:flex; gap:28px; padding:4px 0 24px}
  .dart{width:180px; height:180px; flex:0 0 auto; border-radius:8px; overflow:hidden; box-shadow:var(--v2-sh-lg)}
  .dmeta{display:flex; flex-direction:column; gap:10px; padding-top:6px; min-width:0}
  .dmeta h1{font-size:30px; font-weight:800; line-height:1.1}
  .dau{font-size:15px; color:var(--v2-txt2)}
  .dact{margin-top:6px}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:9px 18px; font:600 13px var(--v2-sans)}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}

  .eps{display:flex; flex-direction:column; gap:1px}
  .ep{display:grid; grid-template-columns:34px 1fr auto; align-items:center; gap:14px; width:100%; padding:10px 12px;
    border:0; border-radius:9px; background:transparent; color:var(--v2-txt2); cursor:pointer; text-align:left}
  .ep:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .ep.live{color:var(--v2-acc1)}
  .ei{width:26px; height:26px; border-radius:50%; display:grid; place-items:center;
    border:1px solid var(--v2-line2); color:var(--v2-txt3)}
  .ep:hover .ei{color:var(--v2-acc1); border-color:var(--v2-acc2)}
  .ei svg{width:11px; height:11px; margin-left:1px}
  .et{min-width:0; font-size:13.5px; font-weight:500; display:flex; flex-direction:column; gap:3px;
    overflow:hidden; text-overflow:ellipsis}
  .et em{font:11px var(--v2-mono); font-style:normal; color:var(--v2-txt3)}
  .ed{font:11.5px var(--v2-mono); color:var(--v2-txt3)}
</style>
