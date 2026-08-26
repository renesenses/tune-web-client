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
  import AvatarMenu from './AvatarMenu.svelte';
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
    if (q && !fold(a.title).includes(fold(q)) && !fold(a.artist_name).includes(fold(q))) return false;
    return true;
  }

  const sorted = $derived([...$albums].sort((a, b) => fold(a.title).localeCompare(fold(b.title))));
  const matchCount = $derived(sorted.filter(matches).length);

  // Rail A–Z : première lettre d'un album (non-alpha → « # »).
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
  function reset() { fQuality = null; fRate = null; q = ''; }
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
      <AvatarMenu />
    </nav>
  </header>

  {#if showFilters}
    <div class="filters">
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
      <div class="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
        <input placeholder="Rechercher" bind:value={q} />
      </div>
    </div>
  {/if}

  <div class="body">
    {#if $libraryLoading && sorted.length === 0}
      <div class="state">Chargement de la bibliothèque…</div>
    {:else if sorted.length === 0}
      <div class="state">Votre bibliothèque est vide.</div>
    {:else}
      <div class="rail">
        {#each ALPHA as L (L)}
          <button class="rl" class:hot={present.has(L)} disabled={!present.has(L)} onclick={() => jump(L)}>{L}</button>
        {/each}
      </div>
      <div class="grid" class:expert={showExpert} bind:this={gridEl}>
        {#each sorted as a (a.id)}
          <button class="card" class:dim={!matches(a)} data-letter={firstLetter(a)} onclick={() => activeView.set('library')}>
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
</section>

<style>
  .v2-lib{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden; box-sizing:border-box}
  .top{display:flex; align-items:center; gap:18px; padding:20px 30px 8px}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em}
  .btn{display:inline-flex; align-items:center; gap:8px; height:40px; padding:0 18px; border-radius:var(--v2-r-pill);
    border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt); font:600 14px var(--v2-sans); cursor:pointer}
  .btn:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .btn svg{width:16px; height:16px}
  .tabs{margin-left:auto; display:flex; align-items:center; gap:4px}
  .tab{padding:8px 15px; border-radius:var(--v2-r-pill); border:0; background:transparent; color:var(--v2-txt2);
    font:600 14px var(--v2-sans); cursor:pointer}
  .tab:hover{color:var(--v2-txt)}
  .tab.active{color:#04121a; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}

  .filters{display:flex; align-items:center; gap:12px; padding:16px 30px 14px; flex-wrap:wrap}
  .chip{display:inline-flex; align-items:center; gap:8px; height:36px; padding:0 15px; border-radius:var(--v2-r-pill);
    background:var(--v2-surface); border:1px solid transparent; color:var(--v2-txt2); font:600 13.5px var(--v2-sans); cursor:pointer; transition:.15s}
  .chip:hover{color:var(--v2-txt)}
  .chip svg{width:12px; height:12px; opacity:.7}
  .chip.count{background:transparent; border:1px solid var(--v2-line2); color:var(--v2-txt)}
  .chip.active{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); color:#04121a}
  .drop{position:relative}
  .drop .menu{position:absolute; top:44px; left:0; z-index:20; min-width:150px; padding:6px;
    background:var(--v2-surface); border:1px solid var(--v2-line2); border-radius:12px; box-shadow:0 16px 40px rgba(0,0,0,.5);
    display:none; flex-direction:column; gap:2px}
  .drop:hover .menu{display:flex}
  .drop .menu button{text-align:left; border:0; background:transparent; color:var(--v2-txt2); font:600 13px var(--v2-mono);
    padding:8px 10px; border-radius:8px; cursor:pointer}
  .drop .menu button:hover{background:#0e1a22; color:var(--v2-txt)}
  .drop .menu button.on{color:#04121a; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .search{margin-left:auto; display:flex; align-items:center; gap:10px; height:42px; width:320px; padding:0 16px;
    border-radius:14px; background:var(--v2-surface2); border:1px solid var(--v2-line); color:var(--v2-txt2)}
  .search svg{width:16px; height:16px}
  .search input{background:transparent; border:0; outline:0; color:var(--v2-txt); font:14px var(--v2-sans); width:100%}
  .search input::placeholder{color:var(--v2-txt3)}

  .body{flex:1; min-height:0; display:flex; padding-left:18px}
  .state{flex:1; display:grid; place-items:center; color:var(--v2-txt3); font-size:15px}
  .rail{display:flex; flex-direction:column; gap:1px; padding:10px 8px 0 0; position:sticky; top:0}
  .rl{border:0; background:transparent; font:11px var(--v2-mono); color:var(--v2-txt3); cursor:pointer;
    padding:1px 4px; border-radius:3px; transition:.12s}
  .rl:disabled{opacity:.35; cursor:default}
  .rl.hot:hover{color:var(--v2-acc-tint); background:#0e1f26}
  .grid{flex:1; overflow-y:auto; display:grid; grid-template-columns:repeat(auto-fill,minmax(148px,1fr));
    gap:22px 18px; align-content:start; padding:8px 30px 40px}
  .grid::-webkit-scrollbar{width:9px}.grid::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .card{border:0; background:transparent; text-align:left; cursor:pointer; padding:0; transition:.18s; opacity:1; color:inherit}
  .card.dim{opacity:.22; filter:saturate(.4)}
  .cover{position:relative; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden; box-shadow:0 6px 16px rgba(0,0,0,.35)}
  .bdg{position:absolute; left:6px; top:6px; font:700 8px var(--v2-mono); letter-spacing:.06em; padding:2px 5px;
    border-radius:3px; background:rgba(7,20,24,.8); color:var(--v2-acc-tint)}
  .ct{margin-top:9px; font:600 12.5px var(--v2-sans); line-height:1.25; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{margin-top:2px; font:11px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .cq{margin-top:4px; font:9.5px var(--v2-mono); color:var(--v2-acc2); letter-spacing:.02em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
</style>
