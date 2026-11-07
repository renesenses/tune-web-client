<script lang="ts">
  /**
   * renesenses/tune-web-client#2645 — la carte du monde de la Bibliothèque.
   *
   * Un globe (la projection et les terres de la carte du monde existante,
   * `lib/champCercle/globe.ts`), chaque pays teint selon son nombre de
   * morceaux, et la même chose en LISTE : sur un téléphone ou au clavier, un
   * petit pays ne se vise pas sur un globe. Un clic sur un pays, au globe ou
   * dans la liste, le choisit ; l'écran parent en fait un filtre.
   *
   * Les données : la facette `country` du serveur, telle qu'elle est (voir
   * `lib/bibliothequePays.ts` pour ce qu'elle désigne vraiment).
   */
  import { untrack } from 'svelte';
  import { t, locale } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import type { FacetParam } from '../../lib/api';
  import { projeter, deprojeter, DEG, type Orientation } from '../../lib/champCercle/globe';
  import { nomPays } from '../../lib/paysMonde';
  import {
    agregerPays, palier, paysAuLieu, pointsDeTerre, FORCES, PALIERS,
    type AgregatPays, type PaysDeLaBibliotheque,
  } from '../../lib/bibliothequePays';

  let { filtres = {}, choisi = null, onChoisir }: {
    /** Les autres bornes de la Bibliothèque (portée de dossier). */
    filtres?: Record<string, FacetParam>;
    /** Le code du pays choisi, `null` sans filtre. */
    choisi?: string | null;
    onChoisir: (p: PaysDeLaBibliotheque | null) => void;
  } = $props();

  let agregat = $state<AgregatPays | null>(null);
  let erreur = $state(false);
  $effect(() => {
    const f = filtres;
    agregat = null; erreur = false;
    let perime = false;
    api.getLibraryFacets(['country'], f, 0)
      .then((r) => { if (!perime) agregat = agregerPays(r?.country); })
      .catch(() => { if (!perime) erreur = true; });
    return () => { perime = true; };
  });

  const fmt = $derived(new Intl.NumberFormat($locale));
  const lignes = $derived((agregat?.pays ?? []).map((p) => ({ ...p, nom: nomPays(p.code, $locale) })));
  const parCode = $derived(new Map((agregat?.pays ?? []).map((p) => [p.code, p])));
  const morceaux = (n: number) => $t((n === 1 ? 'v2.lib.map.trackOne' : 'v2.lib.map.tracks') as any).replace('{n}', fmt.format(n));
  const horsCarte = (n: number) => $t((n === 1 ? 'v2.lib.map.offMapOne' : 'v2.lib.map.offMap') as any).replace('{n}', fmt.format(n));

  function choisir(code: string | null) {
    if (code == null || code === choisi) { onChoisir(null); return; }
    const p = parCode.get(code);
    if (!p) return;
    centrerSur(code);
    onChoisir(p);
  }

  // ── le globe ──────────────────────────────────────────────────────────
  let toile = $state<HTMLCanvasElement | null>(null);
  let boite = $state<HTMLDivElement | null>(null);
  /** #2710 — vignette par défaut ; le bouton agrandit temporairement. */
  let agrandie = $state(false);
  const TAILLE_VIGNETTE = 200;
  let taille = $state(TAILLE_VIGNETTE);
  function basculer() { agrandie = !agrandie; taille = agrandie ? 320 : TAILLE_VIGNETTE; }
  let survole = $state<string | null>(null);
  let o: Orientation = { lon0: 10 * DEG, tilt: 20 * DEG };
  let couleurs = { pays: '#4cc79d', terre: '#888', choix: '#fff' };

  /** Le centre d'un pays : la moyenne de ses points de terre, sur la sphère. */
  function centreDe(code: string): { lat: number; lon: number } | null {
    let x = 0, y = 0, z = 0, n = 0;
    for (const p of pointsDeTerre()) {
      if (p.code !== code) continue;
      x += Math.cos(p.lat) * Math.cos(p.lon); y += Math.cos(p.lat) * Math.sin(p.lon); z += Math.sin(p.lat); n++;
    }
    if (!n) return null;
    return { lat: Math.atan2(z, Math.hypot(x, y)), lon: Math.atan2(y, x) };
  }
  function centrerSur(code: string) {
    const c = centreDe(code);
    if (!c) return;
    o = { lon0: c.lon, tilt: Math.max(-60 * DEG, Math.min(60 * DEG, c.lat)) };
    dessiner();
  }

  // Au premier chargement, le pays le plus fourni est face à l'écran.
  $effect(() => {
    const premier = agregat?.pays[0]?.code;
    if (premier) untrack(() => centrerSur(choisi ?? premier));
  });

  function lireCouleurs() {
    if (!boite || typeof getComputedStyle === 'undefined') return;
    const cs = getComputedStyle(boite);
    const v = (k: string, d: string) => cs.getPropertyValue(k).trim() || d;
    couleurs = { pays: v('--v2-acc2', couleurs.pays), terre: v('--v2-line2', couleurs.terre), choix: v('--v2-txt', couleurs.choix) };
  }

  function dessiner() {
    const c = toile;
    if (!c) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = c.getContext('2d'); } catch { ctx = null; }
    if (!ctx) return; // jsdom, ou un navigateur sans canevas : la liste suffit.
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const px = Math.round(taille * dpr);
    if (c.width !== px) { c.width = px; c.height = px; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, taille, taille);
    const R = taille * 0.46, cx = taille / 2, cy = taille / 2;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = couleurs.terre;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    const max = agregat?.max ?? 0;
    const pas = Math.max(1.6, R * 0.028);
    for (const p of pointsDeTerre()) {
      const [x, y, z] = projeter(p.lat, p.lon, R, cx, cy, o);
      if (z <= 0) continue;
      const pays = parCode.get(p.code);
      if (pays) {
        ctx.fillStyle = p.code === choisi || p.code === survole ? couleurs.choix : couleurs.pays;
        ctx.globalAlpha = p.code === choisi || p.code === survole ? 1 : FORCES[palier(pays.n, max)];
      } else {
        ctx.fillStyle = couleurs.terre;
        ctx.globalAlpha = 0.35;
      }
      ctx.fillRect(x - pas / 2, y - pas / 2, pas, pas);
    }
    ctx.globalAlpha = 1;
  }

  $effect(() => {
    // Relu à chaque changement de données, de choix, de survol ou de taille.
    void agregat; void choisi; void survole; void taille; void toile;
    untrack(() => { lireCouleurs(); dessiner(); });
  });

  $effect(() => {
    if (!agrandie || !boite || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const l = boite?.clientWidth ?? 0;
      if (l > 0) taille = Math.max(200, Math.min(420, Math.floor(l)));
    });
    ro.observe(boite);
    return () => ro.disconnect();
  });

  // Le thème change par `data-theme` sur <html>.
  $effect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver(() => { lireCouleurs(); dessiner(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => mo.disconnect();
  });

  /** Le pays sous un point de la toile, en coordonnées CSS. */
  function paysSous(ev: PointerEvent | MouseEvent): string | null {
    if (!toile) return null;
    const r = toile.getBoundingClientRect();
    const R = taille * 0.46;
    const lieu = deprojeter(ev.clientX - r.left, ev.clientY - r.top, R, taille / 2, taille / 2, o);
    if (!lieu) return null;
    const code = paysAuLieu(lieu.lat, lieu.lon);
    return code && parCode.has(code) ? code : null;
  }

  // Glisser fait tourner ; un appui sans glissement choisit.
  let appui: { x: number; y: number; o: Orientation; bouge: boolean } | null = null;
  function bas(ev: PointerEvent) {
    appui = { x: ev.clientX, y: ev.clientY, o: { ...o }, bouge: false };
    try { toile?.setPointerCapture(ev.pointerId); } catch { /* pas de capture : sans gravité */ }
  }
  function bouge(ev: PointerEvent) {
    if (!appui) { const s = paysSous(ev); if (s !== survole) survole = s; return; }
    const dx = ev.clientX - appui.x, dy = ev.clientY - appui.y;
    if (!appui.bouge && Math.hypot(dx, dy) < 4) return;
    appui.bouge = true;
    const k = Math.PI / (taille * 0.92);
    o = { lon0: appui.o.lon0 - dx * k, tilt: Math.max(-80 * DEG, Math.min(80 * DEG, appui.o.tilt + dy * k)) };
    dessiner();
  }
  function haut(ev: PointerEvent) {
    const a = appui;
    appui = null;
    if (a && !a.bouge) { const code = paysSous(ev); if (code) choisir(code); }
  }
  function touche(ev: KeyboardEvent) {
    const pas = 15 * DEG;
    if (ev.key === 'ArrowLeft') o = { ...o, lon0: o.lon0 - pas };
    else if (ev.key === 'ArrowRight') o = { ...o, lon0: o.lon0 + pas };
    else if (ev.key === 'ArrowUp') o = { ...o, tilt: Math.min(80 * DEG, o.tilt + pas) };
    else if (ev.key === 'ArrowDown') o = { ...o, tilt: Math.max(-80 * DEG, o.tilt - pas) };
    else return;
    ev.preventDefault();
    dessiner();
  }

  const nomSurvole = $derived(survole ? nomPays(survole, $locale) : null);
</script>

<section class="carte-pays" class:grande={agrandie} class:compacte={!agrandie} data-carte-pays
  data-carte-mode={agrandie ? 'grande' : 'compacte'} aria-label={$t('v2.lib.map.title' as any)}>
  <header>
    <h3>{$t('v2.lib.map.title' as any)}</h3>
    <button type="button" class="agrandir" data-carte-agrandir aria-pressed={agrandie}
      aria-label={$t((agrandie ? 'v2.lib.map.shrink' : 'v2.lib.map.enlarge') as any)}
      title={$t((agrandie ? 'v2.lib.map.shrink' : 'v2.lib.map.enlarge') as any)}
      onclick={basculer}>{agrandie ? '\u2198' : '\u2197'}</button>
  </header>
  {#if agrandie}<p class="note">{$t('v2.lib.map.hint' as any)}</p>{/if}

  {#if erreur}
    <p class="etat" role="alert" data-carte-erreur>{$t('v2.lib.map.error' as any)}</p>
  {:else if agregat == null}
    <p class="etat" aria-busy="true">{$t('v2.lib.map.loading' as any)}</p>
  {:else if !lignes.length}
    <p class="etat" data-carte-vide>{$t('v2.lib.map.empty' as any)}</p>
    {#if agregat.horsCarte > 0}
      <p class="note">{horsCarte(agregat.horsCarte)}</p>
    {/if}
  {:else}
    <div class="corps">
      <div class="globe" bind:this={boite}>
        <!-- Le globe est une aide visuelle ; la liste à côté porte le même
             choix pour le clavier et les lecteurs d'écran. -->
        <canvas bind:this={toile} style:width={`${taille}px`} style:height={`${taille}px`}
          tabindex="0" aria-label={$t('v2.lib.map.globe' as any)}
          onpointerdown={bas} onpointermove={bouge} onpointerup={haut}
          onpointerleave={() => { if (!appui) survole = null; }}
          onkeydown={touche}></canvas>
        <p class="survol" aria-live="polite">{#if nomSurvole}{nomSurvole} · {morceaux(parCode.get(survole!)?.n ?? 0)}{/if}</p>
        <div class="legende" aria-hidden="true">
          <span>{$t('v2.lib.map.less' as any)}</span>
          {#each Array.from({ length: PALIERS }, (_, i) => i) as i}<span class="teinte" style:opacity={FORCES[i]}></span>{/each}
          <span>{$t('v2.lib.map.more' as any)}</span>
        </div>
      </div>
      <div class="liste">
        <h4>{$t('v2.lib.map.list' as any)}</h4>
        <ul>
          {#each lignes as l (l.code)}
            <li>
              <button type="button" data-pays={l.code} class:on={l.code === choisi} aria-pressed={l.code === choisi}
                onclick={() => choisir(l.code)}>
                <span class="teinte" style:opacity={FORCES[palier(l.n, agregat.max)]} aria-hidden="true"></span>
                <span class="nom" title={l.nom}>{l.nom}</span>
                <em>{morceaux(l.n)}</em>
              </button>
            </li>
          {/each}
        </ul>
        {#if agregat.horsCarte > 0}
          <p class="note">{horsCarte(agregat.horsCarte)}</p>
        {/if}
      </div>
    </div>
  {/if}
</section>

<style>
  .carte-pays{margin:8px 0 14px;padding:12px;border:1px solid var(--v2-line);border-radius:var(--v2-r-md);background:var(--v2-surface2);color:var(--v2-txt)}
  header{display:flex;align-items:center;justify-content:space-between;gap:8px}
  header h3{margin:0 0 4px;font-size:14px}
  .agrandir{border:1px solid var(--v2-line2);background:none;color:var(--v2-txt2);border-radius:6px;width:26px;height:26px;cursor:pointer;font-size:14px;line-height:1}
  .agrandir:hover{background:var(--v2-hover)}
  .agrandir:focus-visible{outline:2px solid var(--v2-focus);outline-offset:2px}
  /* #2710 — compacte : une vignette en haut à gauche, jamais plus large que
     globe + liste ; la grille d'albums garde la place. */
  .carte-pays.compacte{align-self:flex-start;max-width:min(560px,100%);box-sizing:border-box;padding:8px 10px}
  .compacte .corps{gap:10px;align-items:stretch}
  .compacte .globe{flex:0 0 200px;max-width:200px}
  .compacte .survol{display:none}
  .compacte .legende{display:none}
  .compacte .liste{flex:1 1 160px;display:flex;flex-direction:column;min-height:0}
  .compacte .liste h4{display:none}
  .compacte .liste ul{max-height:200px}
  .note{margin:4px 0;font-size:12px;color:var(--v2-txt2)}
  .etat{margin:10px 0;font-size:13px;color:var(--v2-txt2)}
  .corps{display:flex;gap:16px;align-items:flex-start}
  .globe{flex:1 1 320px;min-width:0;max-width:420px;display:flex;flex-direction:column;align-items:center}
  canvas{display:block;cursor:grab;touch-action:none;border-radius:50%}
  canvas:active{cursor:grabbing}
  canvas:focus-visible,.liste button:focus-visible{outline:2px solid var(--v2-focus);outline-offset:3px}
  .survol{min-height:1.4em;margin:6px 0 2px;font-size:12px;color:var(--v2-txt2);text-align:center}
  .legende{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--v2-txt3)}
  .teinte{display:inline-block;width:14px;height:10px;border-radius:2px;background:var(--v2-acc2);flex:none}
  .liste{flex:1 1 220px;min-width:0}
  .liste h4{margin:0 0 6px;font-size:12px;font-weight:600;color:var(--v2-txt2)}
  .liste ul{list-style:none;margin:0;padding:0;max-height:360px;overflow:auto}
  .liste button{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:0;border-radius:6px;background:none;color:inherit;font:inherit;font-size:13px;text-align:left;cursor:pointer}
  .liste button:hover{background:var(--v2-hover)}
  .liste button.on{background:var(--v2-acc-tint);color:var(--v2-acc2)}
  .liste .nom{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .liste em{font-style:normal;font-size:12px;color:var(--v2-txt3)}
  /* Téléphone : le globe au-dessus, la liste dessous, toute la largeur. */
  @media (max-width: 640px){
    .corps{flex-direction:column;align-items:stretch}
    .globe{max-width:none}
    .liste ul{max-height:280px}
    .carte-pays.compacte{align-self:stretch;max-width:none}
    .compacte .corps{flex-direction:row;flex-wrap:wrap}
    .compacte .globe{flex:0 0 200px;margin:0 auto}
    .compacte .liste{flex:1 1 100%}
    .compacte .liste ul{max-height:120px}
  }
</style>
