<script lang="ts">
  /**
   * Tune Circle rc12 — l'onglet « Playlists partagées » des maquettes de
   * Levente (15/11/2026) : bandeau, filtres, tri, grille ou liste, « Vos
   * playlists ».
   *
   * AUCUNE donnée inventée : `GET /playlists` rend le nom, le nombre de
   * morceaux, le partageur, le cercle et `updated_at`, rien d'autre. Pas de
   * pochette (une vignette aux couleurs du thème la remplace), pas d'abonnés,
   * pas d'écoutes, pas de tendances : ces blocs de la maquette n'existent pas
   * ici. « Personnes à suivre » non plus : aucune API ne propose de personnes.
   *
   * Les classes `li.playlist-cercle`, `.nom`, `button.lire-playlist-ligne` et
   * `button.ouvrir-playlist` sont celles de l'ancienne liste : les bancs T5 et
   * #2434 les lisent.
   */
  import { t, tn } from '../../lib/i18n';
  import { bulleTexte } from '../../lib/infobulleTexte';
  import type { CercleNomme, CercleOuJeSuisInvite } from '../../lib/circle';
  import type { IdOpaque, PlaylistCercleResume } from '../../lib/circlePlaylists';
  import {
    FILTRES_PLAYLISTS, TRIS_PLAYLISTS, filtrerPlaylists, initiales, proprietaireAffiche,
    type FiltrePlaylists, type TriPlaylists,
  } from '../../lib/circleHabillage';

  interface Props {
    playlists: PlaylistCercleResume[];
    occupe: boolean;
    /** MES cercles : « Créer une playlist » y range la nouvelle. */
    cercles: CercleNomme[];
    /** Les cercles des autres où je suis rangé : « Partager une playlist » y en crée une. */
    invitePar: CercleOuJeSuisInvite[];
    onOuvrir: (id: IdOpaque) => void;
    onLire: (p: PlaylistCercleResume) => void;
    onCreer: (c: CercleNomme) => void;
    onPartager: (m: CercleOuJeSuisInvite) => void;
  }
  let { playlists, occupe, cercles, invitePar, onOuvrir, onLire, onCreer, onPartager }: Props = $props();

  let filtre = $state<FiltrePlaylists>('tout');
  let tri = $state<TriPlaylists>('recentes');
  let affichage = $state<'grille' | 'liste'>('grille');
  let menu = $state<'creer' | 'partager' | null>(null);

  const visibles = $derived(filtrerPlaylists(playlists, filtre, tri));
  const miennes = $derived(playlists.filter((p) => p.mine));
  const morceaux = $derived(playlists.reduce((n, p) => n + p.count, 0));
  const tr = (k: string) => $t(k as any);
  const LIBELLES_FILTRES: Record<FiltrePlaylists, string> = {
    tout: 'v2.circle.msg.filterAll', nouveautes: 'v2.circle.plx.filterNew', amis: 'v2.circle.plx.filterFriends', miennes: 'v2.circle.plx.filterMine',
  };
  const LIBELLES_TRIS: Record<TriPlaylists, string> = {
    recentes: 'v2.circle.plx.sortRecent', nom: 'v2.circle.plx.sortName', titres: 'v2.circle.plx.sortTracks',
  };
  /** La teinte de la vignette : stable par playlist, prise parmi les jetons du thème. */
  const TEINTES = ['t1', 't2', 't3', 't4'] as const;
  function teinte(p: PlaylistCercleResume) {
    let h = 0; for (const ch of String(p.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return TEINTES[h % TEINTES.length];
  }
  function choisir(fn: () => void) { menu = null; fn(); }
  /** Échap ou un clic hors du menu le ferment. */
  function clavier(ev: KeyboardEvent) { if (ev.key === 'Escape' && menu) { menu = null; } }
  function clicDehors(ev: MouseEvent) {
    if (menu && !(ev.target instanceof Element && ev.target.closest('.menu-ancre'))) menu = null;
  }
</script>

<svelte:window onkeydown={clavier} onclick={clicDehors} />

<div class="bandeau-playlists">
  <div class="bandeau-texte">
    <h2 id="circle-playlists">{tr('v2.circle.pl.title')}</h2>
    <p class="note">{tr('v2.circle.pl.hint')}</p>
    <div class="actions-bandeau">
      {#if invitePar.length > 0}
        <div class="menu-ancre">
          <button type="button" class="bouton-plein partager-une-playlist" aria-expanded={menu === 'partager'} disabled={occupe}
            onclick={() => menu = menu === 'partager' ? null : 'partager'}>+ {tr('v2.circle.plx.share')}</button>
          {#if menu === 'partager'}
            <div class="menu-cercles" role="group" aria-label={tr('v2.circle.plx.share')}>
              {#each invitePar as m (m.circle_id)}
                <button type="button" onclick={() => choisir(() => onPartager(m))}>{m.circle_name} <span class="note">· {m.owner_name}</span></button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      {#if cercles.length > 0}
        <div class="menu-ancre">
          <button type="button" class="bouton-contour creer-une-playlist" aria-expanded={menu === 'creer'} disabled={occupe}
            onclick={() => menu = menu === 'creer' ? null : 'creer'}>{tr('v2.circle.plx.create')}</button>
          {#if menu === 'creer'}
            <div class="menu-cercles" role="group" aria-label={tr('v2.circle.plx.create')}>
              {#each cercles as c (c.id)}
                <button type="button" onclick={() => choisir(() => onCreer(c))}>{c.name}</button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
  {#if playlists.length > 0}
    <dl class="chiffres-playlists">
      <div><dt>{tr('v2.circle.plx.statPlaylists')}</dt><dd>{playlists.length}</dd></div>
      <div><dt>{tr('v2.circle.plx.statTracks')}</dt><dd>{morceaux}</dd></div>
    </dl>
  {/if}
</div>

{#if playlists.length > 0}
  <div class="barre-playlists">
    <div class="filtres-playlists" role="group" aria-label={tr('v2.circle.plx.filters')}>
      {#each FILTRES_PLAYLISTS as f (f)}
        <button type="button" class="puce filtre-{f}" aria-pressed={filtre === f} onclick={() => filtre = f}>{tr(LIBELLES_FILTRES[f])}</button>
      {/each}
    </div>
    <div class="reglages-playlists">
      <label class="tri"><span class="sr">{tr('v2.circle.plx.sort')}</span>
        <select class="choix-tri" bind:value={tri}>
          {#each TRIS_PLAYLISTS as x (x)}<option value={x}>{tr(LIBELLES_TRIS[x])}</option>{/each}
        </select>
      </label>
      <div class="bascule-affichage" role="group" aria-label={tr('v2.circle.plx.view')}>
        <button type="button" class="vue-grille" aria-pressed={affichage === 'grille'} aria-label={tr('v2.circle.plx.grid')} onclick={() => affichage = 'grille'}>
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg></button>
        <button type="button" class="vue-liste" aria-pressed={affichage === 'liste'} aria-label={tr('v2.circle.plx.list')} onclick={() => affichage = 'liste'}>
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5 6h14M5 12h14M5 18h14"/></svg></button>
      </div>
    </div>
  </div>

  {#if visibles.length === 0}
    <p class="note vide aucun-resultat">{tr('v2.circle.plx.noMatch')}</p>
  {:else}
    <ul class="playlists-grille" class:en-liste={affichage === 'liste'}>
      {#each visibles as p (String(p.id))}
        {@const proprietaire = proprietaireAffiche(p)}
        <li class="ligne playlist-cercle carte-playlist">
          <div class="vignette teinte-{teinte(p)}">
            <span class="note-vignette" aria-hidden="true">♪</span>
            <button type="button" class="lire-playlist-ligne" disabled={occupe || p.count === 0}
              aria-label={tr('v2.circle.pl.playNamed').replace('{name}', p.name)}
              onclick={() => onLire(p)}>
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
              <span class="sr">{tr('v2.circle.pl.play')}</span>
            </button>
          </div>
          <div class="infos-playlist">
            <button type="button" class="ouvrir-playlist" aria-label={tr('v2.circle.pl.openNamed').replace('{name}', p.name)} onclick={() => onOuvrir(p.id)}>
              <span class="nom" use:bulleTexte>{p.name}</span>
            </button>
            <span class="note meta-playlist" use:bulleTexte>{$tn('v2.common.trackCountN', p.count)}{#if p.circle_name}{' · '}{p.circle_name}{/if}</span>
            {#if proprietaire}
              <span class="proprietaire"><span class="avatar-mini" aria-hidden="true">{initiales(proprietaire)}</span><span class="note">{tr('v2.circle.pl.by').replace('{name}', proprietaire)}</span></span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#if miennes.length > 0}
    <section class="pl-own" aria-labelledby="circle-pl-own">
      <h3 id="circle-pl-own">{tr('v2.circle.plx.yours')}</h3>
      <ul>
        {#each miennes as p (String(p.id))}
          <li class="ma-playlist">
            <span class="vignette mini teinte-{teinte(p)}" aria-hidden="true">♪</span>
            <button type="button" class="ouvrir-ma-playlist" onclick={() => onOuvrir(p.id)}>
              <strong use:bulleTexte>{p.name}</strong>
              <span class="note">{$tn('v2.common.trackCountN', p.count)}</span>
            </button>
            <button type="button" class="lire-ma-playlist" disabled={occupe || p.count === 0}
              aria-label={tr('v2.circle.pl.playNamed').replace('{name}', p.name)} onclick={() => onLire(p)}>
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/if}

<style>
  .bandeau-playlists{display:flex; gap:24px; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; padding:24px 28px;
    border:1px solid var(--v2-line); border-radius:var(--v2-r-card); position:relative;
    background:radial-gradient(120% 140% at 100% 0%, var(--v2-acc-soft), transparent 60%), var(--v2-surface)}
  .bandeau-texte{display:flex; flex-direction:column; gap:10px; max-width:520px; min-width:0}
  .bandeau-texte h2{font-family:var(--font-display, Georgia, serif); font-weight:600; font-size:calc(26px * var(--v2-txt-echelle, 1)); margin:0}
  .bandeau-texte .note{margin:0; font-size:calc(13px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2); line-height:1.5}
  .actions-bandeau{display:flex; gap:10px; flex-wrap:wrap; margin-top:4px}
  .menu-ancre{position:relative}
  .bouton-plein,.bouton-contour{height:38px; padding:0 18px; border-radius:var(--v2-r-pill); cursor:pointer; font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .bouton-plein{border:0; background:var(--v2-acc1); color:var(--v2-on-acc)}
  .bouton-contour{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt)}
  .bouton-plein:disabled,.bouton-contour:disabled{opacity:.4; cursor:not-allowed}
  .menu-cercles{position:absolute; top:calc(100% + 6px); left:0; z-index:3; min-width:200px; display:flex; flex-direction:column; padding:6px;
    border:1px solid var(--v2-line); border-radius:12px; background:var(--v2-surface2); box-shadow:var(--v2-sh-menu)}
  .menu-cercles button{border:0; background:transparent; color:var(--v2-txt); text-align:left; padding:8px 10px; border-radius:8px; cursor:pointer;
    font:calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .menu-cercles button:hover{background:var(--v2-hover)}
  .chiffres-playlists{display:flex; gap:28px; margin:0}
  .chiffres-playlists div{display:flex; flex-direction:column-reverse; align-items:center; gap:2px}
  .chiffres-playlists dd{margin:0; font-size:calc(22px * var(--v2-txt-echelle, 1)); font-weight:700}
  .chiffres-playlists dt{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3)}
  .barre-playlists{display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap}
  .filtres-playlists{display:flex; gap:8px; overflow-x:auto; scrollbar-width:none; min-width:0}
  .puce{flex:none; padding:7px 16px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2);
    cursor:pointer; font:calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .puce[aria-pressed="true"]{background:var(--v2-acc1); border-color:var(--v2-acc1); color:var(--v2-on-acc); font-weight:600}
  .reglages-playlists{display:flex; gap:10px; align-items:center}
  .choix-tri{height:34px; padding:0 12px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2); background:var(--v2-surface); color:var(--v2-txt);
    font:calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .bascule-affichage{display:flex; border:1px solid var(--v2-line2); border-radius:10px; overflow:hidden}
  .bascule-affichage button{display:grid; place-items:center; width:36px; height:32px; border:0; background:transparent; color:var(--v2-txt2); cursor:pointer}
  .bascule-affichage button[aria-pressed="true"]{background:var(--v2-acc1); color:var(--v2-on-acc)}
  .puce:focus-visible,.choix-tri:focus-visible,.bascule-affichage button:focus-visible,.bouton-plein:focus-visible,.bouton-contour:focus-visible,
  .lire-playlist-ligne:focus-visible,.ouvrir-playlist:focus-visible,.menu-cercles button:focus-visible,.ouvrir-ma-playlist:focus-visible,.lire-ma-playlist:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}
  .playlists-grille{list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:20px}
  .carte-playlist{display:flex; flex-direction:column; gap:10px; min-width:0}
  .vignette{position:relative; aspect-ratio:1; border-radius:12px; display:grid; place-items:center; overflow:hidden; border:1px solid var(--v2-line)}
  .teinte-t1{background:linear-gradient(140deg, var(--v2-acc1), var(--v2-acc2))}
  .teinte-t2{background:linear-gradient(160deg, var(--v2-acc2), var(--v2-surface2))}
  .teinte-t3{background:linear-gradient(120deg, var(--v2-surface2), var(--v2-acc1))}
  .teinte-t4{background:radial-gradient(circle at 30% 30%, var(--v2-acc-tint), var(--v2-bg2))}
  .note-vignette{font-size:calc(40px * var(--v2-txt-echelle, 1)); color:var(--v2-on-acc); opacity:.55}
  .lire-playlist-ligne{position:absolute; right:10px; bottom:10px; width:36px; height:36px; border-radius:50%; border:1px solid var(--v2-line2);
    display:grid; place-items:center; cursor:pointer; background:var(--v2-scrim); color:var(--v2-txt); opacity:0; transition:opacity .15s}
  .carte-playlist:hover .lire-playlist-ligne,.lire-playlist-ligne:focus-visible{opacity:1}
  .lire-playlist-ligne:disabled{cursor:not-allowed}
  .carte-playlist:hover .lire-playlist-ligne:disabled{opacity:.4}
  @media (hover: none){ .lire-playlist-ligne{opacity:1} }
  .infos-playlist{display:flex; flex-direction:column; gap:3px; min-width:0}
  .ouvrir-playlist{border:0; background:transparent; padding:0; text-align:left; color:var(--v2-txt); cursor:pointer; min-width:0;
    font:600 calc(13.5px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .ouvrir-playlist:hover .nom{text-decoration:underline}
  .nom{display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .note{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3)}
  .vide{margin:0}
  .meta-playlist{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .proprietaire{display:flex; align-items:center; gap:6px; margin-top:4px; min-width:0}
  .avatar-mini{flex:none; width:22px; height:22px; border-radius:50%; display:grid; place-items:center; background:var(--v2-surface2);
    border:1px solid var(--v2-line2); font-size:calc(9.5px * var(--v2-txt-echelle, 1)); font-weight:700; color:var(--v2-txt2)}
  .en-liste{grid-template-columns:minmax(0, 1fr); gap:0}
  .en-liste .carte-playlist{flex-direction:row; align-items:center; gap:14px; padding:8px 4px; border-bottom:1px solid var(--v2-line)}
  .en-liste .vignette{width:52px; flex:none; border-radius:8px}
  .en-liste .note-vignette{font-size:calc(18px * var(--v2-txt-echelle, 1))}
  .en-liste .lire-playlist-ligne{position:static; opacity:1; width:30px; height:30px; order:3; margin-left:auto}
  .en-liste .vignette .lire-playlist-ligne{position:absolute; inset:0; margin:auto; background:transparent; border:0; opacity:0}
  .en-liste .carte-playlist:hover .vignette .lire-playlist-ligne,.en-liste .vignette .lire-playlist-ligne:focus-visible{opacity:1; background:var(--v2-scrim)}
  .en-liste .infos-playlist{flex:1}
  .pl-own{padding:18px 20px; border:1px solid var(--v2-line); border-radius:var(--v2-r-card); background:var(--v2-surface); max-width:520px}
  .pl-own h3{font-family:var(--font-display, Georgia, serif); font-size:calc(17px * var(--v2-txt-echelle, 1)); margin:0 0 10px}
  .pl-own ul{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px}
  .ma-playlist{display:flex; align-items:center; gap:12px; min-width:0}
  .vignette.mini{width:44px; height:44px; aspect-ratio:auto; flex:none; border-radius:8px; color:var(--v2-on-acc); font-size:calc(16px * var(--v2-txt-echelle, 1))}
  .ouvrir-ma-playlist{flex:1; min-width:0; display:flex; flex-direction:column; align-items:flex-start; border:0; background:transparent; color:var(--v2-txt);
    cursor:pointer; padding:0; text-align:left; font:calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .ouvrir-ma-playlist strong{max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .lire-ma-playlist{flex:none; width:32px; height:32px; border-radius:50%; border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt);
    display:grid; place-items:center; cursor:pointer}
  .lire-ma-playlist:disabled{opacity:.4; cursor:not-allowed}
  .sr{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap}
  @media (max-width: 640px){
    .bandeau-playlists{padding:18px}
    .playlists-grille{grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px}
    .en-liste{grid-template-columns:minmax(0, 1fr)}
    .barre-playlists{flex-direction:column; align-items:stretch}
    .reglages-playlists{justify-content:space-between}
  }
</style>
