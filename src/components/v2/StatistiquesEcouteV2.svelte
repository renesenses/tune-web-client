<script lang="ts">
  /**
   * Les STATISTIQUES d'écoute — onglet de l'Historique du nouveau client.
   *
   * L'ancienne interface les portait dans son « Tableau de bord »
   * (`DashboardView`), qui part avec elle (phase 5, web#1257). Bertrand a
   * tranché : aucune perte d'accès. Leur place naturelle est à côté du journal
   * d'écoute — c'est la même matière, vue d'en haut.
   *
   * Deux routes, les mêmes que l'écran d'origine :
   *
   *   - `GET /library/history/dashboard?period=&top_n=` — les totaux, la
   *     tendance, les classements, la carte semaine × heure, les répartitions ;
   *   - `GET /library/history/at?period=&weekday=&hour=` — ce qui a été écouté
   *     dans UNE case de la carte (Elie : « cliquer une case → ce qu'on
   *     écoutait alors »).
   *
   * Les libellés sont ceux, déjà traduits dans les onze langues, de l'écran
   * d'origine — y compris les légendes de #1155 qui disent CE QUE COMPTE
   * chaque chiffre (Didier, fil 1566).
   */
  import * as api from '../../lib/api';
  import type { DashboardData, DashboardPeriod, SlotTrack } from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { playAndSync } from '../../lib/stores/zones';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import { notifications } from '../../lib/stores/notifications';
  import AlbumArt from '../partages/AlbumArt.svelte';

  const PERIODES: DashboardPeriod[] = ['today', '7d', '30d', 'all'];

  let periode = $state<DashboardPeriod>('30d');
  let donnees = $state<DashboardData | null>(null);
  let chargement = $state(false);
  let echec = $state(false);

  /** Un jeton par demande : changer de période pendant un chargement lent ne
   *  doit pas laisser la réponse de l'ancienne période à l'écran. */
  let jeton = 0;
  async function charger(p: DashboardPeriod) {
    const j = ++jeton;
    chargement = true;
    echec = false;
    try {
      const d = await api.getDashboard(p, { topN: 20 });
      if (j !== jeton) return;
      donnees = d;
    } catch {
      if (j !== jeton) return;
      donnees = null;
      echec = true;
    }
    chargement = false;
  }

  $effect(() => { void charger(periode); });

  /**
   * Les genres écoutés, RANGÉS par l'arbre des genres de l'utilisateur : un
   * sous-genre compte pour sa branche. Un genre hors de l'arbre garde son
   * propre nom — l'écran d'origine le rangeait sous « Hors arbre », une chaîne
   * française en dur qui restait telle quelle dans les dix autres langues.
   */
  let arbre = $state<Record<string, string[]>>({});
  $effect(() => {
    api.getGenreTree().then((r) => { arbre = r?.tree ?? {}; }).catch(() => { arbre = {}; });
  });
  let tousLesGenres = $state(false);
  const branches = $derived.by(() => {
    const parents = new Map<string, string>();
    const versParent = new Map<string, string>();
    for (const [p, enfants] of Object.entries(arbre)) {
      parents.set(p.toLowerCase(), p);
      for (const e of enfants) versParent.set(e.toLowerCase(), p);
    }
    const seaux = new Map<string, number>();
    for (const g of donnees?.by_genre ?? []) {
      const bas = (g.genre || '').toLowerCase();
      const b = parents.get(bas) ?? versParent.get(bas) ?? g.genre;
      if (!b) continue;
      seaux.set(b, (seaux.get(b) ?? 0) + g.plays);
    }
    return [...seaux.entries()].map(([nom, plays]) => ({ nom, plays })).sort((a, b) => b.plays - a.plays);
  });
  const branchesVisibles = $derived(tousLesGenres ? branches : branches.slice(0, 20));

  let exportEnCours = $state(false);
  async function exporter() {
    exportEnCours = true;
    try {
      await api.exportHistoryCsv();
    } catch {
      notifications.error($t('v2.pl.exportError' as any));
    }
    exportEnCours = false;
  }

  function duree(ms: number): string {
    if (!ms) return '0';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h} h ${m} min` : `${m} min`;
  }

  /** Un trait par jour de la période, les jours muets comptés à zéro — sinon
   *  le nombre de traits ne dirait pas la durée étudiée. `all` : les jours
   *  rendus, plafonnés à 90. */
  const tendance = $derived.by(() => {
    const brut = donnees?.trend ?? [];
    const parJour = new Map(brut.map((d) => [d.day, d]));
    const n = periode === 'today' ? 1 : periode === '7d' ? 7 : periode === '30d' ? 30
      : Math.min(Math.max(brut.length, 1), 90);
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const out: { day: string; plays: number }[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push(parJour.get(cle) ?? { day: cle, plays: 0 });
    }
    return out;
  });
  const tendanceMax = $derived(Math.max(0, ...tendance.map((d) => d.plays)));

  /** La carte 7 × 24 : jour ISO 1 = lundi … 7 = dimanche, rendu par le serveur. */
  const grille = $derived.by(() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const c of donnees?.weekday_hourly ?? []) {
      const r = c.weekday - 1;
      if (r >= 0 && r < 7 && c.hour >= 0 && c.hour < 24) g[r][c.hour] = c.plays;
    }
    return g;
  });
  const grilleMax = $derived(Math.max(0, ...grille.flat()));
  const JOURS = $derived([
    $t('alarms.dayMon'), $t('alarms.dayTue'), $t('alarms.dayWed'),
    $t('alarms.dayThu'), $t('alarms.dayFri'), $t('alarms.daySat'), $t('alarms.daySun'),
  ]);

  // ── Une case de la carte ─────────────────────────────────────────────
  let caseOuverte = $state<{ jour: number; heure: number } | null>(null);
  let pistesCase = $state<SlotTrack[]>([]);
  let caseChargement = $state(false);
  let caseEchec = $state(false);

  async function ouvrirCase(jour: number, heure: number) {
    caseOuverte = { jour, heure };
    caseChargement = true;
    caseEchec = false;
    pistesCase = [];
    try {
      const r = await api.getHistoryAtSlot(periode, jour + 1, heure, 100);
      pistesCase = r?.tracks ?? [];
    } catch {
      caseEchec = true;
    }
    caseChargement = false;
  }

  // ── Lecture ──────────────────────────────────────────────────────────
  /** Une piste du classement ou d'une case : par son identifiant local, sinon
   *  par la paire service + identifiant. Rien d'autre à tenter : une piste
   *  locale sans identifiant n'est plus dans la bibliothèque. */
  function corpsPiste(p: { track_id: number | null; source?: string | null; source_id?: string | null }) {
    if (p.track_id) return { track_id: p.track_id };
    if (p.source && p.source !== 'local' && p.source_id) return { source: p.source as any, source_id: p.source_id };
    return null;
  }
  function corpsAlbum(a: { album_id?: number | null; source?: string | null; source_id?: string | null }) {
    if (a.album_id) return { album_id: a.album_id };
    if (a.source && a.source !== 'local' && a.source_id) return { streaming_album_id: a.source_id, source: a.source as any };
    return null;
  }
  function lire(corps: Record<string, unknown> | null) {
    if (!corps) return;
    const zid = zoneRequise();
    if (zid == null) return;
    playAndSync(zid, corps as any).catch(signalerEchecLecture);
  }
  function lireRadio(id: number | null) {
    if (id == null) return;
    const zid = zoneRequise();
    if (zid == null) return;
    api.playRadio(id, zid).catch(signalerEchecLecture);
  }
</script>

<div class="stats">
  <div class="periodes">
    {#each PERIODES as p (p)}
      <button aria-pressed={periode === p} class:on={periode === p}
        onclick={() => (periode = p)}>{$t(`dashboard.period.${p}` as any)}</button>
    {/each}
    <button class="export" onclick={exporter} disabled={exportEnCours}>{$t('settings.exportCsv' as any)}</button>
  </div>

  {#if chargement && !donnees}
    <div class="state">{$t('common.loading' as any)}</div>
  {:else if echec}
    <div class="state err">{$t('v2.hist.statsError' as any)}</div>
  {:else if donnees && donnees.totals.plays === 0}
    <div class="state">{$t('dashboard.empty' as any)}</div>
  {:else if donnees}
    {@const d = donnees}
    <div class="totaux">
      <div class="total"><span class="v">{d.totals.plays.toLocaleString()}</span>
        <span class="l">{$t('dashboard.totals.plays' as any)}</span>
        <span class="h">{$t('dashboard.hint.plays' as any)}</span></div>
      <div class="total"><span class="v">{duree(d.totals.listening_ms)}</span>
        <span class="l">{$t('dashboard.totals.listening_time' as any)}</span>
        <span class="h">{$t('dashboard.hint.listeningTime' as any)}</span></div>
      <div class="total"><span class="v">{d.totals.unique_tracks.toLocaleString()}</span>
        <span class="l">{$t('dashboard.totals.unique_tracks' as any)}</span>
        <span class="h">{$t('dashboard.hint.uniqueTracks' as any)}</span></div>
      <div class="total"><span class="v">{d.totals.unique_artists.toLocaleString()}</span>
        <span class="l">{$t('dashboard.totals.unique_artists' as any)}</span>
        <span class="h">{$t('dashboard.hint.uniqueArtists' as any)}</span></div>
    </div>

    {#if tendance.length}
      <section class="carte">
        <h3>{$t('dashboard.section.trend' as any)}</h3>
        <p class="aide">{$t('dashboard.trend.axis' as any)}</p>
        <div class="traits">
          {#each tendance as j (j.day)}
            <span class="trait" style:height="{tendanceMax ? (j.plays / tendanceMax) * 100 : 0}%"
              title={$t('dashboard.trend.tip' as any).replace('{day}', j.day).replace('{plays}', String(j.plays))}></span>
          {/each}
        </div>
      </section>
    {/if}

    <div class="grille2">
      {#if d.top_artists.length}
        <section class="carte">
          <h3>{$t('dashboard.section.top_artists' as any)}</h3>
          <p class="aide">{$t('dashboard.hint.topArtists' as any)}</p>
          <ol class="rangs">
            {#each d.top_artists as a, i (i)}
              <li><span class="vig"><AlbumArt coverPath={a.cover_path ?? null} size={0} alt={a.artist_name} /></span>
                <span class="nom">{a.artist_name}</span>
                <span class="compte">{a.plays} · {duree(a.listening_ms)}</span></li>
            {/each}
          </ol>
        </section>
      {/if}

      {#if d.top_albums.length}
        <section class="carte">
          <h3>{$t('dashboard.section.top_albums' as any)}</h3>
          <p class="aide">{$t('dashboard.hint.topAlbums' as any)}</p>
          <ol class="rangs">
            {#each d.top_albums as a, i (i)}
              {@const corps = corpsAlbum(a)}
              <li><span class="vig"><AlbumArt coverPath={a.cover_path} size={0} alt={a.album_title} /></span>
                <button class="nom lien" disabled={!corps} onclick={() => lire(corps)}
                  title={$t('library.playAlbum' as any)}>
                  <span class="t">{a.album_title}</span><span class="s">{a.artist_name}</span></button>
                <span class="compte">{a.plays}</span></li>
            {/each}
          </ol>
        </section>
      {/if}

      {#if d.top_tracks.length}
        <section class="carte">
          <h3>{$t('dashboard.section.top_tracks' as any)}</h3>
          <p class="aide">{$t('dashboard.hint.topTracks' as any)}</p>
          <ol class="rangs">
            {#each d.top_tracks as p, i (i)}
              {@const corps = corpsPiste(p)}
              <li><span class="vig"><AlbumArt coverPath={p.cover_path ?? null} size={0} alt={p.title} /></span>
                <button class="nom lien" disabled={!corps} onclick={() => lire(corps)}
                  title={$t('dashboard.slot.play' as any)}>
                  <span class="t">{p.title}</span><span class="s">{p.artist_name}</span></button>
                <span class="compte">{p.plays}</span></li>
            {/each}
          </ol>
        </section>
      {/if}

      {#if d.top_radios?.length}
        <section class="carte">
          <h3>{$t('dashboard.topRadios' as any)}</h3>
          <ol class="rangs">
            {#each d.top_radios as r, i (i)}
              <li><span class="vig"><AlbumArt coverPath={r.cover_path ?? r.cover_url ?? null} size={0} alt={r.station_name} /></span>
                <button class="nom lien" disabled={r.radio_id == null} onclick={() => lireRadio(r.radio_id)}>
                  <span class="t">{r.station_name}</span></button>
                <span class="compte">{r.plays} · {duree(r.listening_ms)}</span></li>
            {/each}
          </ol>
        </section>
      {/if}

      {#if d.streak && (d.streak.best > 0 || d.streak.current > 0)}
        <section class="carte">
          <h3>{$t('dashboard.section.streak' as any)}</h3>
          <div class="serie">
            <div><span class="v">{d.streak.current}</span><span class="l">{$t('dashboard.consecutiveDays' as any)}</span></div>
            <div><span class="v">{d.streak.best}</span><span class="l">{$t('dashboard.personalRecord' as any)}</span></div>
          </div>
        </section>
      {/if}

      {#if d.on_this_day?.length}
        <section class="carte">
          <h3>{$t('dashboard.onThisDay' as any)}</h3>
          <ul class="jadis">
            {#each d.on_this_day.slice(0, 8) as o, i (i)}
              <li><span class="an">{o.year ?? '?'}</span>
                <span class="t">{o.track_title ?? '?'}{#if o.artist_name}<span class="s"> — {o.artist_name}</span>{/if}</span></li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>

    {#if branchesVisibles.length}
      {@const max = branchesVisibles[0].plays}
      <section class="carte">
        <h3>{$t('dashboard.genreBranches' as any)}</h3>
        <ul class="barres">
          {#each branchesVisibles as b (b.nom)}
            <li><span class="bl">{b.nom}</span>
              <span class="bt"><span class="bf" style:width="{max ? (b.plays / max) * 100 : 0}%"></span></span>
              <span class="compte">{b.plays}</span></li>
          {/each}
        </ul>
        {#if branches.length > 20}
          <button class="v2-btn plus" onclick={() => (tousLesGenres = !tousLesGenres)}>
            {tousLesGenres ? $t('dashboard.showLess' as any)
              : $t('dashboard.showMoreGenres' as any).replace('{n}', String(branches.length - 20))}
          </button>
        {/if}
      </section>
    {/if}

    {#if grilleMax > 0}
      <section class="carte">
        <h3>{$t('dashboard.section.weekday_hourly' as any)}</h3>
        <div class="carte-chaleur">
          <div class="ligne-ch">
            <span class="jour"></span>
            {#each Array(24) as _, h (h)}<span class="heure">{h % 3 === 0 ? h : ''}</span>{/each}
          </div>
          {#each JOURS as jour, r (r)}
            <div class="ligne-ch">
              <span class="jour">{jour}</span>
              {#each grille[r] as n, h (h)}
                <button class="case" disabled={n === 0}
                  style:opacity={n === 0 ? 0.08 : 0.2 + (n / grilleMax) * 0.8}
                  title={$t('dashboard.slot.tip' as any).replace('{day}', jour).replace('{hour}', String(h)).replace('{plays}', String(n))}
                  aria-label={$t('dashboard.slot.tip' as any).replace('{day}', jour).replace('{hour}', String(h)).replace('{plays}', String(n))}
                  onclick={() => ouvrirCase(r, h)}></button>
              {/each}
            </div>
          {/each}
        </div>

        {#if caseOuverte}
          {@const c = caseOuverte}
          <div class="detail-case">
            <div class="tete-case">
              <strong>{JOURS[c.jour]} · {c.heure} h – {c.heure + 1} h</strong>
              <button class="v2-btn" onclick={() => (caseOuverte = null)}>{$t('v2.common.close' as any)}</button>
            </div>
            {#if caseChargement}
              <div class="state">{$t('common.loading' as any)}</div>
            {:else if caseEchec}
              <div class="state err">{$t('v2.hist.statsError' as any)}</div>
            {:else if !pistesCase.length}
              <div class="state">{$t('dashboard.slot.empty' as any)}</div>
            {:else}
              <ul class="pistes-case">
                {#each pistesCase as p, i (i)}
                  {@const corps = corpsPiste(p)}
                  <li><button class="nom lien" disabled={!corps} onclick={() => lire(corps)}
                      title={$t('dashboard.slot.play' as any)}>
                      <span class="t">{p.title ?? '—'}</span>
                      <span class="s">{p.artist_name ?? ''}{p.album_title ? ` · ${p.album_title}` : ''}</span></button>
                    {#if p.plays > 1}<span class="compte">×{p.plays}</span>{/if}</li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      </section>
    {/if}

    <div class="grille2">
      {#if d.by_zone.length}
        {@const max = Math.max(...d.by_zone.map((x) => x.plays))}
        <section class="carte">
          <h3>{$t('dashboard.section.by_zone' as any)}</h3>
          <ul class="barres">
            {#each d.by_zone as z, i (i)}
              <li><span class="bl">{z.zone_name ?? `#${z.zone_id}`}</span>
                <span class="bt"><span class="bf" style:width="{max ? (z.plays / max) * 100 : 0}%"></span></span>
                <span class="compte">{z.plays}</span></li>
            {/each}
          </ul>
        </section>
      {/if}
      {#if d.by_source.length}
        {@const max = Math.max(...d.by_source.map((x) => x.plays))}
        <section class="carte">
          <h3>{$t('dashboard.section.by_source' as any)}</h3>
          <ul class="barres">
            {#each d.by_source as s, i (i)}
              <li><span class="bl">{s.source ?? '—'}</span>
                <span class="bt"><span class="bf" style:width="{max ? (s.plays / max) * 100 : 0}%"></span></span>
                <span class="compte">{s.plays}</span></li>
            {/each}
          </ul>
        </section>
      {/if}
      {#if d.completion && d.completion.completed + d.completion.skipped > 0}
        {@const tot = d.completion.completed + d.completion.skipped}
        <section class="carte">
          <h3>{$t('dashboard.section.completion' as any)}</h3>
          <div class="completion">
            <span class="fait" style:width="{(d.completion.completed / tot) * 100}%"></span>
          </div>
          <p class="aide">{$t('dashboard.completion.completed' as any)} · {d.completion.completed}
            — {$t('dashboard.completion.skipped' as any)} · {d.completion.skipped}</p>
        </section>
      {/if}
    </div>
  {/if}
</div>

<style>
  .stats{padding:6px 30px 30px; display:flex; flex-direction:column; gap:16px}
  .state{padding:20px 0; color:var(--v2-txt3)}
  .state.err{color:var(--v2-danger)}

  .periodes{display:flex; gap:4px; flex-wrap:wrap}
  .periodes button{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:600 12px var(--v2-sans); padding:7px 13px; border-radius:var(--v2-r-pill)}
  .periodes button:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .periodes .export{margin-left:auto}
  .plus{margin-top:10px}
  .periodes button.on{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}

  .totaux{display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px}
  .total{display:flex; flex-direction:column; gap:3px; padding:14px; border:1px solid var(--v2-line2); border-radius:var(--v2-r-card); background:var(--v2-surface)}
  .total .v{font:800 22px var(--v2-sans); letter-spacing:-.01em}
  .total .l{font:600 11px var(--v2-mono); color:var(--v2-txt2); text-transform:uppercase; letter-spacing:.05em}
  .total .h{font-size:11.5px; color:var(--v2-txt3); line-height:1.35}

  .grille2{display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:14px}
  .carte{padding:14px; border:1px solid var(--v2-line2); border-radius:var(--v2-r-card); background:var(--v2-surface); min-width:0}
  .carte h3{margin:0 0 4px; font:600 13px var(--v2-sans); color:var(--v2-txt2); text-transform:uppercase; letter-spacing:.05em}
  .aide{margin:0 0 10px; font-size:11.5px; color:var(--v2-txt3)}

  .traits{display:flex; align-items:flex-end; gap:2px; height:90px}
  .trait{flex:1; min-width:2px; background:var(--v2-acc1); border-radius:2px 2px 0 0}

  .rangs{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px}
  .rangs li{display:grid; grid-template-columns:36px minmax(0,1fr) auto; align-items:center; gap:10px}
  .vig{width:36px; height:36px; display:block}
  .nom{display:flex; flex-direction:column; min-width:0; font-size:13px}
  .lien{border:0; background:transparent; color:inherit; padding:0; text-align:left; cursor:pointer; font-family:inherit}
  .lien:hover:not(:disabled) .t{color:var(--v2-acc1)}
  .lien:disabled{cursor:default}
  .t, .s{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .s{font-size:12px; color:var(--v2-txt3)}
  .compte{font:11px var(--v2-mono); color:var(--v2-txt3); white-space:nowrap}

  .serie{display:flex; gap:28px}
  .serie div{display:flex; flex-direction:column}
  .serie .v{font:800 26px var(--v2-sans)}
  .serie .l{font-size:11.5px; color:var(--v2-txt3)}

  .jadis{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:5px; font-size:13px}
  .jadis li{display:flex; gap:10px; min-width:0}
  .jadis .an{font:600 11px var(--v2-mono); color:var(--v2-acc1); flex:none}

  .carte-chaleur{display:flex; flex-direction:column; gap:2px; overflow-x:auto}
  .ligne-ch{display:grid; grid-template-columns:38px repeat(24,minmax(12px,1fr)); gap:2px; align-items:center}
  .jour{font:10.5px var(--v2-mono); color:var(--v2-txt3)}
  .heure{font:9.5px var(--v2-mono); color:var(--v2-txt3); text-align:center}
  .case{height:16px; border:0; border-radius:3px; background:var(--v2-acc1); padding:0; cursor:pointer}
  .case:disabled{cursor:default}
  .case:focus-visible{outline:2px solid var(--v2-focus)}

  .detail-case{margin-top:12px; padding-top:12px; border-top:1px solid var(--v2-line2)}
  .tete-case{display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px}
  .pistes-case{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px}
  .pistes-case li{display:flex; align-items:center; justify-content:space-between; gap:10px}

  .barres{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px}
  .barres li{display:grid; grid-template-columns:minmax(0,120px) minmax(0,1fr) auto; align-items:center; gap:10px; font-size:12.5px}
  .bl{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .bt{height:8px; border-radius:4px; background:var(--v2-line2); overflow:hidden}
  .bf{display:block; height:100%; background:var(--v2-acc1)}

  .completion{height:10px; border-radius:5px; background:var(--v2-line2); overflow:hidden; margin-bottom:8px}
  .completion .fait{display:block; height:100%; background:var(--v2-acc1)}
</style>
