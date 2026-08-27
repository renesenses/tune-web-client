<script lang="ts">
  /**
   * Bibliothèque — grille d'albums du nouveau client (direction Levente).
   *
   * Deux principes de la maquette :
   *  1. Les filtres ATTÉNUENT les albums non conformes au lieu de les retirer
   *     (stabilité spatiale : un album ne saute jamais de place). Le filtre de
   *     fréquence compare la valeur EXACTE — 176,4 kHz ≠ 192 kHz (bug Patatorz,
   *     tune-server-rust#2343).
   *  2. La densité suit le niveau d'interface (`preferences.settingsLevel`) :
   *     - Essentiel : grille nue, pas de filtres, pas de badges.
   *     - Avancé    : filtres Qualité + Fréquence, badges hi-res/DSD.
   *     - Expert    : + filtres Format & Profondeur, + ligne technique par carte.
   */
  import { albums, libraryLoading } from '../../lib/stores/library';
  import { activeView, type View } from '../../lib/stores/navigation';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { getQualityTier, fold, type QualityTier } from '../../lib/utils';
  import type { Album } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';
  import '../../styles/tune-v2.css';

  const level = $derived($preferences.settingsLevel);
  const showFilters = $derived(atLeast(level, 'intermediate'));
  const showBadges = $derived(atLeast(level, 'intermediate'));
  const showExpert = $derived(atLeast(level, 'expert'));

  // Fréquences en VALEURS EXACTES (jamais un seuil « ≥ »).
  const RATES: { v: number; l: string }[] = [
    { v: 44100, l: '44,1' }, { v: 48000, l: '48' }, { v: 88200, l: '88,2' },
    { v: 96000, l: '96' }, { v: 176400, l: '176,4' }, { v: 192000, l: '192' },
    { v: 352800, l: '352,8' }, { v: 384000, l: '384' },
  ];
  const QUALITIES: { key: QualityTier | 'hires'; label: string }[] = [
    { key: 'dsd', label: 'DSD' }, { key: 'hires', label: 'Hi-Res' },
    { key: 'cd', label: 'CD' }, { key: 'lossy', label: 'Compressé' },
  ];

  let fQuality = $state<string | null>(null);
  let fRate = $state<number | null>(null);
  let q = $state('');

  function tierMatches(a: Album, key: string): boolean {
    const t = getQualityTier(a);
    if (key === 'hires') return t === 'hires' || t === 'hires_max';
    return t === key;
  }
  function matches(a: Album): boolean {
    if (fQuality && !tierMatches(a, fQuality)) return false;
    if (fRate && (a.sample_rate ?? 0) !== fRate) return false; // exact
    if (fYear != null && albumYear(a) !== fYear) return false;
    if (q && !fold(a.title).includes(fold(q)) && !fold(a.artist_name).includes(fold(q))) return false;
    return true;
  }

  const sorted = $derived([...$albums].sort((a, b) => fold(a.title).localeCompare(fold(b.title))));
  const matchCount = $derived(sorted.filter(matches).length);

  // Rail A–Z : première lettre d'un album (non-alpha → « # »).
  // ── Frise chronologique (direction Levente, brouillon v3 du 26/08) ────
  //
  // Troisième mode de navigation dans la collection, à côté du rail A–Z :
  // un histogramme du nombre d'albums par année. Sur une discothèque, le
  // repère naturel est souvent l'époque, pas la première lettre.
  //
  // Cohérence avec la règle d'or de l'écran : choisir une année ATTÉNUE les
  // albums d'une autre année, elle ne les retire pas. Les pochettes gardent
  // leur place — c'est la mémoire visuelle qui fait retrouver un album.
  //
  // Disponible à partir d'Avancé : en Essentiel, le rail A–Z suffit et reste
  // le seul repère, conformément au principe « seulement le plus pertinent ».
  type NavMode = 'alpha' | 'years';
  let navMode = $state<NavMode>('alpha');
  const showTimeline = $derived(atLeast(level, 'intermediate'));

  /** Année retenue pour un album : l'année d'ORIGINE prime sur celle de
   *  réédition — sur du jazz ou du classique, l'écart se compte en décennies
   *  et c'est l'enregistrement qui situe l'œuvre. */
  function albumYear(a: Album): number | null {
    const y = a.original_year ?? a.year ?? null;
    return typeof y === 'number' && y > 1800 && y < 2200 ? y : null;
  }

  let fYear = $state<number | null>(null);

  /** Histogramme : une barre par année, du minimum au maximum RÉELS de la
   *  bibliothèque — pas une plage fixe, qui laisserait des décennies vides
   *  chez quelqu'un dont la collection commence en 1985. */
  const histogram = $derived.by(() => {
    const counts = new Map<number, number>();
    for (const a of $albums) {
      const y = albumYear(a);
      if (y != null) counts.set(y, (counts.get(y) ?? 0) + 1);
    }
    if (!counts.size) return { bars: [] as { year: number; n: number }[], max: 0, min: 0, maxYear: 0 };
    const years = [...counts.keys()].sort((x, z) => x - z);
    const min = years[0], maxYear = years[years.length - 1];
    const bars: { year: number; n: number }[] = [];
    for (let y = min; y <= maxYear; y++) bars.push({ year: y, n: counts.get(y) ?? 0 });
    return { bars, max: Math.max(...counts.values()), min, maxYear };
  });

  /** Repères de décennie sous la frise, alignés sur les barres. */
  const decades = $derived.by(() => {
    const { bars } = histogram;
    if (!bars.length) return [] as { year: number; pct: number }[];
    const out: { year: number; pct: number }[] = [];
    for (let i = 0; i < bars.length; i++) {
      if (bars[i].year % 10 === 0) out.push({ year: bars[i].year, pct: (i / bars.length) * 100 });
    }
    return out;
  });

  const yearCount = $derived(fYear == null ? 0 : $albums.filter((a) => albumYear(a) === fYear).length);

  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
  function firstLetter(a: Album): string {
    const c = fold(a.title).charAt(0).toUpperCase();
    return c >= 'A' && c <= 'Z' ? c : '#';
  }
  const present = $derived(new Set(sorted.map(firstLetter)));
  let gridEl: HTMLDivElement | undefined = $state();
  function jump(L: string) {
    gridEl?.querySelector<HTMLElement>(`[data-letter="${L}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function tech(a: Album): string {
    const t = getQualityTier(a);
    const rate = RATES.find((r) => r.v === a.sample_rate)?.l;
    const depth = a.bit_depth ? `${a.bit_depth}-bit` : '';
    if (t === 'dsd') return `DSD · ${a.sample_rate && a.sample_rate >= 5000000 ? 'DSD128' : 'DSD64'}`;
    return [a.format?.toUpperCase(), rate && `${rate} kHz`, depth].filter(Boolean).join(' · ');
  }
  function badge(a: Album): string | null {
    const t = getQualityTier(a);
    if (t === 'dsd') return 'DSD';
    if (t === 'hires' || t === 'hires_max') return RATES.find((r) => r.v === a.sample_rate)?.l + 'k';
    return null;
  }

  const TABS: { view: View; label: string; adv?: boolean }[] = [
    { view: 'library', label: 'Albums' }, { view: 'library', label: 'Artistes' }, { view: 'library', label: 'Titres' },
    { view: 'genres', label: 'Genres', adv: true }, { view: 'genres', label: 'Années', adv: true }, { view: 'genres', label: 'Labels', adv: true },
  ];
  let opened = $state<Album | null>(null);
  function reset() { fQuality = null; fRate = null; q = ''; fYear = null; }
</script>

<section class="v2-lib tune-v2">
  <header class="top">
    <h1>Bibliothèque</h1>
    <button class="btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20 20 4M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>Aléatoire</button>
    <button class="btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Ajouter</button>
    <nav class="tabs">
      {#each TABS as t, i (t.label)}
        {#if !t.adv || atLeast(level, 'intermediate')}
          <button class="tab" class:active={i === 0}>{t.label}</button>
        {/if}
      {/each}
    </nav>
  </header>

  <!-- La ligne de filtres existe a TOUS les niveaux : chez Levente le champ
       de recherche vit dans la page, a cote des filtres, et c'est le seul
       moyen de chercher en Essentiel depuis que la Recherche a quitte la
       barre laterale. Seules les PUCES de filtrage sont reservees a Avance. -->
  <div class="filters">
    {#if showFilters}
      <button class="chip count" class:active={!fQuality && !fRate && !q} onclick={reset}>Tout ({matchCount})</button>
      {#each QUALITIES as it (it.key)}
        <button class="chip" class:active={fQuality === it.key} onclick={() => fQuality = fQuality === it.key ? null : it.key as string}>{it.label}</button>
      {/each}
      <div class="drop">
        <button class="chip" class:active={fRate !== null}>Fréquence{#if fRate}&nbsp;· {RATES.find(r => r.v === fRate)?.l} kHz{/if}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="menu">
          {#each RATES as r (r.v)}
            <button class:on={fRate === r.v} onclick={() => fRate = fRate === r.v ? null : r.v}>{r.l} kHz</button>
          {/each}
        </div>
      </div>
      {#if showExpert}
        <button class="chip xo">Format<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
        <button class="chip xo">Profondeur<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></button>
      {/if}
    {/if}
    <div class="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
      <input placeholder="Rechercher dans la bibliothèque" bind:value={q} />
      {#if q}
        <button class="clr" onclick={() => (q = '')} aria-label="Effacer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      {/if}
    </div>
  </div>

  {#if showTimeline}
    <div class="navmode">
      <button class:on={navMode === 'alpha'} onclick={() => { navMode = 'alpha'; fYear = null; }}>A–Z</button>
      <button class:on={navMode === 'years'} onclick={() => (navMode = 'years')}>Années</button>
      {#if fYear != null}
        <button class="yearpill" onclick={() => (fYear = null)}>
          {fYear} · {yearCount} album{yearCount > 1 ? 's' : ''}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      {/if}
    </div>
  {/if}

  {#if showTimeline && navMode === 'years' && histogram.bars.length}
    <div class="frise">
      <div class="bars">
        {#each histogram.bars as b (b.year)}
          <button
            class="bar"
            class:on={fYear === b.year}
            class:vide={b.n === 0}
            disabled={b.n === 0}
            title={`${b.year} — ${b.n} album${b.n > 1 ? 's' : ''}`}
            aria-label={`${b.year}, ${b.n} albums`}
            style="--h:{histogram.max ? Math.max(8, (b.n / histogram.max) * 100) : 0}%"
            onclick={() => (fYear = fYear === b.year ? null : b.year)}
          >{#if fYear === b.year}<span class="tag">{b.year}</span>{/if}</button>
        {/each}
      </div>
      <div class="decs">
        {#each decades as d (d.year)}
          <span class="dec" style="left:{d.pct}%">{d.year}</span>
        {/each}
      </div>
    </div>
  {/if}

  <div class="body">
    {#if $libraryLoading && sorted.length === 0}
      <div class="state">Chargement de la bibliothèque…</div>
    {:else if sorted.length === 0}
      <div class="state">Votre bibliothèque est vide.</div>
    {:else}
      {#if navMode === 'alpha'}
        <div class="rail">
          {#each ALPHA as L (L)}
            <button class="rl" class:hot={present.has(L)} disabled={!present.has(L)} onclick={() => jump(L)}>{L}</button>
          {/each}
        </div>
      {/if}
      <div class="grid" class:expert={showExpert} bind:this={gridEl}>
        {#each sorted as a (a.id)}
          <button class="card" class:dim={!matches(a)} data-letter={firstLetter(a)} onclick={() => opened = a}>
            <div class="cover">
              <AlbumArt coverPath={a.cover_path} albumId={a.id} size={220} alt={a.title} source={a.source} fallbackInitials={a.title?.slice(0,1)} />
              {#if showBadges}{#key badge(a)}{#if badge(a)}<span class="bdg">{badge(a)}</span>{/if}{/key}{/if}
            </div>
            <div class="ct">{a.title}</div>
            <div class="ca">{a.artist_name ?? ''}</div>
            {#if showExpert}<div class="cq">{tech(a)}</div>{/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if opened}
    <AlbumDetailV2 album={opened} onClose={() => (opened = null)} />
  {/if}
</section>

<style>
  .v2-lib{position:relative; display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden; box-sizing:border-box}
  /* padding-right élargi : l'avatar de la coquille est pincé à droite. */
  .top{display:flex; align-items:center; gap:18px; padding:20px 30px 8px; padding-right:96px}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em}
  .btn{display:inline-flex; align-items:center; gap:8px; height:40px; padding:0 18px; border-radius:var(--v2-r-pill);
    border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt); font:600 14px var(--v2-sans); cursor:pointer}
  .btn:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .btn svg{width:16px; height:16px}
  .tabs{margin-left:auto; display:flex; align-items:center; gap:4px}
  .tab{padding:8px 15px; border-radius:var(--v2-r-pill); border:0; background:transparent; color:var(--v2-txt2);
    font:600 14px var(--v2-sans); cursor:pointer}
  .tab:hover{color:var(--v2-txt)}
  .tab.active{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}

  .filters{display:flex; align-items:center; gap:12px; padding:16px 30px 14px; flex-wrap:wrap}
  .chip{display:inline-flex; align-items:center; gap:8px; height:36px; padding:0 15px; border-radius:var(--v2-r-pill);
    background:var(--v2-surface); border:1px solid transparent; color:var(--v2-txt2); font:600 13.5px var(--v2-sans); cursor:pointer; transition:.15s}
  .chip:hover{color:var(--v2-txt)}
  .chip svg{width:12px; height:12px; opacity:.7}
  .chip.count{background:transparent; border:1px solid var(--v2-line2); color:var(--v2-txt)}
  .chip.active{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); color:var(--v2-on-acc)}
  .drop{position:relative}
  .drop .menu{position:absolute; top:44px; left:0; z-index:20; min-width:150px; padding:6px;
    background:var(--v2-surface); border:1px solid var(--v2-line2); border-radius:12px; box-shadow:var(--v2-sh-lg);
    display:none; flex-direction:column; gap:2px}
  .drop:hover .menu{display:flex}
  .drop .menu button{text-align:left; border:0; background:transparent; color:var(--v2-txt2); font:600 13px var(--v2-mono);
    padding:8px 10px; border-radius:8px; cursor:pointer}
  .drop .menu button:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .drop .menu button.on{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .search{position:relative; margin-left:auto; display:flex; align-items:center; gap:10px; height:42px; width:320px; padding:0 16px;
    border-radius:14px; background:var(--v2-surface2); border:1px solid var(--v2-line); color:var(--v2-txt2)}
  .search svg{width:16px; height:16px}
  .search .clr{position:absolute; right:8px; width:20px; height:20px; border:0; border-radius:50%;
    background:transparent; color:var(--v2-txt3); cursor:pointer; display:grid; place-items:center}
  .search .clr:hover{color:var(--v2-txt)}
  .search .clr svg{width:11px; height:11px}
  .search input{background:transparent; border:0; outline:0; color:var(--v2-txt); font:14px var(--v2-sans); width:100%}
  .search input::placeholder{color:var(--v2-txt3)}

  .body{flex:1; min-height:0; display:flex; padding-left:18px}
  .state{flex:1; display:grid; place-items:center; color:var(--v2-txt3); font-size:15px}
  .rail{display:flex; flex-direction:column; gap:1px; padding:10px 8px 0 0; position:sticky; top:0}
  .rl{border:0; background:transparent; font:11px var(--v2-mono); color:var(--v2-txt3); cursor:pointer;
    padding:1px 4px; border-radius:3px; transition:.12s}
  .rl:disabled{opacity:.35; cursor:default}
  .rl.hot:hover{color:var(--v2-acc-tint); background:var(--v2-hover)}
  /* Bascule entre les deux repères de navigation : alphabet ou époque. */
  .navmode{display:flex; align-items:center; gap:4px; padding:2px 30px 10px}
  .navmode > button{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2);
    font:600 11.5px var(--v2-sans); padding:6px 13px; border-radius:var(--v2-r-pill); cursor:pointer; transition:.15s}
  .navmode > button:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .navmode > button.on{color:var(--v2-on-acc); border-color:transparent;
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .navmode .yearpill{display:inline-flex; align-items:center; gap:7px; margin-left:8px;
    color:var(--v2-acc-tint); border-color:var(--v2-acc2); background:var(--v2-acc-soft)}
  .navmode .yearpill svg{width:11px; height:11px}

  /* Frise : une barre par année, hauteur proportionnelle au nombre d'albums.
     Les années sans album restent visibles mais creuses — un trou dans la
     collection est une information, pas un défaut d'affichage. */
  .frise{padding:2px 30px 14px; user-select:none}
  .bars{display:flex; align-items:flex-end; gap:2px; height:74px}
  .bar{position:relative; flex:1 1 0; min-width:2px; height:var(--h); border:0; padding:0; cursor:pointer;
    border-radius:2px 2px 0 0; background:var(--v2-line2); transition:background .12s, transform .12s}
  .bar:hover:not(:disabled){background:var(--v2-acc2); transform:scaleY(1.06); transform-origin:bottom}
  .bar.vide{background:var(--v2-line); height:3px; cursor:default}
  .bar.on{background:linear-gradient(180deg,var(--v2-acc1),var(--v2-acc2))}
  .bar .tag{position:absolute; bottom:calc(100% + 5px); left:50%; transform:translateX(-50%);
    font:700 9.5px var(--v2-mono); letter-spacing:.04em; color:var(--v2-on-acc); background:var(--v2-acc1);
    padding:2px 6px; border-radius:5px; white-space:nowrap}
  .decs{position:relative; height:16px; margin-top:7px}
  .dec{position:absolute; transform:translateX(-50%); font:10px var(--v2-mono); color:var(--v2-txt3); white-space:nowrap}

  .grid{flex:1; overflow-y:auto; display:grid; grid-template-columns:repeat(auto-fill,minmax(148px,1fr));
    gap:22px 18px; align-content:start; padding:8px 30px 40px}
  .grid::-webkit-scrollbar{width:9px}.grid::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .card{border:0; background:transparent; text-align:left; cursor:pointer; padding:0; transition:.18s; opacity:1; color:inherit}
  .card.dim{opacity:.22; filter:saturate(.4)}
  .cover{position:relative; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden; box-shadow:var(--v2-sh-card)}
  .bdg{position:absolute; left:6px; top:6px; font:700 8px var(--v2-mono); letter-spacing:.06em; padding:2px 5px;
    border-radius:3px; background:var(--v2-scrim); color:var(--v2-acc-tint)}
  .ct{margin-top:9px; font:600 12.5px var(--v2-sans); line-height:1.25; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{margin-top:2px; font:11px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .cq{margin-top:4px; font:9.5px var(--v2-mono); color:var(--v2-acc2); letter-spacing:.02em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
</style>
