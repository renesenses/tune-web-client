<script lang="ts">
  /**
   * La carte de découverte — moteur commun des cartes des radios (web#2400)
   * et des podcasts (web#2450), d'après les prototypes validés du 26/10.
   *
   * On flâne au lieu de chercher : genres → pays → éléments (ou l'inverse),
   * ou par réseau/producteur. Un niveau à la fois.
   *
   * Accessibilité — ce qui distingue cette version du prototype :
   *  - les nœuds sont de VRAIS boutons posés sur la scène, pas des disques
   *    peints sur un canevas : Tab entre dans la scène, les flèches s'y
   *    déplacent (un seul bouton tabulable à la fois), Entrée ouvre, Retour
   *    arrière ou Échap remonte ; chaque bouton dit ce qu'il est ;
   *  - le canevas ne porte que le DÉCOR (planètes de points, anneaux, halo) et
   *    reste muet (`aria-hidden`) ;
   *  - la vue Liste donne exactement la même information, en texte ;
   *  - `prefers-reduced-motion` : image fixe ; onglet caché : boucle en pause ;
   *    lecture dans le navigateur : budget réduit (`champCercle/budget`).
   *
   * Aucune tuile, aucune bibliothèque de carte : la scène est dessinée ici.
   * Les images passent par le serveur Tune (`artworkUrl`), jamais en direct.
   */
  import type { Snippet } from 'svelte';
  import { untrack } from 'svelte';
  import { t } from '../../lib/i18n';
  import { artworkUrl } from '../../lib/api';
  import { browserAudioPlaying } from '../../lib/stores/browserAudio';
  import { budgetScene } from '../../lib/champCercle/budget';
  import {
    construireArbre, cheminVers, noeudDeLElement, correspondances, proches, disposer,
    initiales, teinte, focusSuivant,
    type AxeCarte, type DimensionCarte, type ElementCarte, type ModeCarte, type NoeudCarte, type RaisonProche,
  } from '../../lib/carteDecouverte';

  interface Props {
    elements: ElementCarte[];
    /** Libellé d'un groupe (genre, pays, réseau, « sans réseau »). */
    libelleGroupe: (dimension: DimensionCarte, cle: string) => string;
    /** Libellé de la racine pour ce mode et cet axe. */
    libelleRacine: (mode: ModeCarte, axe: AxeCarte) => string;
    /** Ligne d'information d'un élément (genre · pays · réseau). */
    sousTitre: (e: ElementCarte) => string;
    /** « 12 stations », « 1 émission ». */
    unite: (n: number) => string;
    libelleModeReseaux: string;
    libelleAxeGenre: string;
    libelleScene: string;
    libelleRecherche: string;
    titreProches: string;
    invitation: string;
    aucunProche: string;
    libelleRaison: (r: RaisonProche) => string;
    /** Podcasts : signaler et filtrer les émissions que Tune ne sait pas lire. */
    avecLisibles?: boolean;
    /** L'élément qui joue, pour sa pastille. */
    enCours?: string | null;
    /** Les gestes de l'élément choisi (écouter, ajouter, s'abonner…). */
    actions: Snippet<[ElementCarte]>;
  }
  let {
    elements, libelleGroupe, libelleRacine, sousTitre, unite, libelleModeReseaux, libelleAxeGenre,
    libelleScene, libelleRecherche, titreProches, invitation, aucunProche, libelleRaison,
    avecLisibles = false, enCours = null, actions,
  }: Props = $props();

  let vue = $state<'carte' | 'liste'>('carte');
  let mode = $state<ModeCarte>('arbre');
  let axe = $state<AxeCarte>('genre');
  let lisiblesSeuls = $state(false);
  let requete = $state('');
  let choisi = $state<string | null>(null);
  let annonce = $state('');

  const lisible = (e: ElementCarte) => e.lisible !== false;
  const visibles = $derived(avecLisibles && lisiblesSeuls ? elements.filter(lisible) : elements);
  const racine = $derived(construireArbre(visibles, mode, axe));
  /** La pile des nœuds ouverts : la racine, puis chaque niveau entré. */
  let pile = $state<NoeudCarte[]>([]);
  $effect(() => { const r = racine; untrack(() => { pile = [r]; focus = -1; }); });
  const courant = $derived(pile[pile.length - 1] ?? racine);
  const enfants = $derived(courant.enfants);
  const feuillesSeules = $derived(enfants.length > 0 && enfants[0].type === 'element');

  const trouves = $derived(correspondances(visibles, requete));
  const cherche = $derived(requete.trim().length > 0);
  const repond = (n: NoeudCarte) => !cherche || n.elements.some((e) => trouves.has(e.id));

  const parId = $derived(new Map(elements.map((e) => [e.id, e])));
  const selection = $derived(choisi ? parId.get(choisi) ?? null : null);
  const voisins = $derived(selection ? proches(selection, visibles) : []);
  const idsVoisins = $derived(new Set(voisins.map((p) => p.element.id)));

  const libelleNoeud = (n: NoeudCarte) =>
    n.type === 'element' ? n.element!.nom : n.dimension === 'racine' ? libelleRacine(mode, axe) : libelleGroupe(n.dimension, n.cle);
  const nLisibles = (n: NoeudCarte) => n.elements.filter(lisible).length;

  // ── la scène ──────────────────────────────────────────────────────────
  let scene = $state<HTMLDivElement | null>(null);
  let toile = $state<HTMLCanvasElement | null>(null);
  let largeur = $state(800);
  let hauteur = $state(480);
  $effect(() => {
    const s = scene;
    if (!s) return;
    const mesurer = () => {
      if (s.clientWidth > 0) largeur = s.clientWidth;
      if (s.clientHeight > 0) hauteur = s.clientHeight;
    };
    mesurer();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(mesurer);
    ro.observe(s);
    return () => ro.disconnect();
  });
  const places = $derived(disposer(enfants.map((n) => n.elements.length), feuillesSeules, largeur, hauteur));

  // ── clavier ───────────────────────────────────────────────────────────
  let focus = $state(-1);
  let boutons: (HTMLButtonElement | null)[] = $state([]);
  function dire(texte: string) { annonce = ''; setTimeout(() => (annonce = texte), 30); }
  function decrire(n: NoeudCarte): string {
    if (n.type === 'element') {
      const e = n.element!;
      const l = avecLisibles ? ', ' + (lisible(e) ? $t('v2.carte.readable' as any) : $t('v2.carte.notReadable' as any)) : '';
      return `${e.nom}, ${sousTitre(e)}${l}`;
    }
    return `${libelleNoeud(n)}, ${unite(n.elements.length)}`;
  }
  function aller(nouvelle: NoeudCarte[]) {
    pile = nouvelle;
    focus = -1;
    const n = nouvelle[nouvelle.length - 1];
    const k = n.enfants;
    dire(`${libelleNoeud(n)}, ${k.length && k[0].type === 'element' ? unite(k.length) : $t('v2.carte.groups' as any).replace('{n}', String(k.length))}`);
  }
  function ouvrir(n: NoeudCarte) {
    if (n.type === 'groupe') aller([...pile, n]);
    else choisir(n.element!.id, false);
  }
  function remonter() { if (pile.length > 1) aller(pile.slice(0, -1)); }
  function surTouche(ev: KeyboardEvent) {
    if (ev.key === 'Backspace' || ev.key === 'Escape') {
      if (pile.length > 1) { ev.preventDefault(); remonter(); }
      return;
    }
    const s = focusSuivant(ev.key, focus, enfants.length);
    if (s == null) return;
    ev.preventDefault();
    focus = s;
    boutons[s]?.focus();
  }

  /** Choisir un élément : la carte se place dans son groupe. */
  function choisir(id: string, placer = true) {
    choisi = id;
    const e = parId.get(id);
    if (placer) {
      const n = noeudDeLElement(racine, id);
      if (n?.parent && n.parent !== courant) pile = cheminVers(n.parent);
    }
    if (e) dire(`${e.nom}, ${titreProches} : ${proches(e, visibles).length}`);
  }

  function surRecherche(ev: KeyboardEvent) {
    if (ev.key !== 'Enter' || !trouves.size) return;
    ev.preventDefault();
    const premier = visibles.find((e) => trouves.has(e.id));
    if (premier) choisir(premier.id);
  }
  $effect(() => {
    const n = trouves.size;
    if (!cherche) return;
    untrack(() => dire(n ? $t('v2.carte.matches' as any).replace('{n}', String(n)) : $t('v2.carte.noResult' as any)));
  });

  // ── décor : planètes, anneaux, halo ───────────────────────────────────
  let reduit = $state(false);
  $effect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduit = mq.matches;
    const f = () => (reduit = mq.matches);
    mq.addEventListener?.('change', f);
    return () => mq.removeEventListener?.('change', f);
  });
  const budget = $derived(budgetScene({ largeur, lectureLocale: $browserAudioPlaying, mouvementReduit: reduit }));

  let jetons = { point: '#888', anneau: '#888', lien: '#888', ok: '#888', non: '#888' };
  function lireJetons() {
    if (!scene) return;
    const cs = getComputedStyle(scene);
    const v = (k: string, d: string) => cs.getPropertyValue(k).trim() || d;
    jetons = { point: v('--v2-acc1', '#c9a227'), anneau: v('--v2-acc2', '#6aa'), lien: v('--v2-acc1', '#c9a227'),
      ok: v('--v2-acc2', '#3a8'), non: v('--v2-danger', '#c44') };
  }
  // Le thème change par `data-theme` sur <html>, ou par le système.
  $effect(() => {
    if (!scene) return;
    lireJetons();
    if (typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver(() => { lireJetons(); dessiner(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const f = () => { lireJetons(); dessiner(); };
    mq?.addEventListener?.('change', f);
    return () => { mo.disconnect(); mq?.removeEventListener?.('change', f); };
  });

  const spheres = new Map<number, [number, number, number][]>();
  function sphere(n: number) {
    let s = spheres.get(n);
    if (s) return s;
    s = [];
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / Math.max(1, n - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), th = ga * i;
      s.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    spheres.set(n, s);
    return s;
  }

  let rotation = 0;
  let contexte: CanvasRenderingContext2D | null = null;
  function dessiner() {
    const c = toile;
    if (!c || vue !== 'carte') return;
    if (!contexte) {
      try { contexte = c.getContext('2d'); } catch { contexte = null; }
      if (!contexte) return;
    }
    const ctx = contexte;
    const dpr = Math.min(budget.dprMax, window.devicePixelRatio || 1);
    if (c.width !== Math.round(largeur * dpr)) { c.width = Math.round(largeur * dpr); c.height = Math.round(hauteur * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, largeur, hauteur);
    // Halo de points autour de la scène, comme la planète de Tune Circle.
    ctx.fillStyle = jetons.point;
    const R = Math.min(largeur, hauteur) * 0.48, nh = Math.round(160 * budget.facteur);
    for (let i = 0; i < nh; i++) {
      const a = (i / nh) * 6.2832 + rotation * 0.25, k = ((i * 37) % 17) / 17;
      ctx.globalAlpha = 0.05 + 0.12 * k;
      ctx.fillRect(largeur / 2 + Math.cos(a) * R * (1 + 0.06 * k) * 1.35, hauteur / 2 + Math.sin(a) * R * 0.95 * (1 + 0.06 * k), 1.2, 1.2);
    }
    // Liens vers les éléments proches, dans le groupe affiché.
    if (selection && feuillesSeules) {
      const i0 = enfants.findIndex((n) => n.element?.id === selection.id);
      if (i0 >= 0 && places[i0]) {
        ctx.strokeStyle = jetons.lien; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
        enfants.forEach((n, i) => {
          if (!n.element || !idsVoisins.has(n.element.id) || !places[i]) return;
          ctx.beginPath(); ctx.moveTo(places[i0].x, places[i0].y); ctx.lineTo(places[i].x, places[i].y); ctx.stroke();
        });
      }
    }
    // Planètes des groupes : sphère de points qui tourne, anneau incliné.
    if (!feuillesSeules) {
      const cr = Math.cos(rotation), sr = Math.sin(rotation), ct = Math.cos(0.38), st = Math.sin(0.38);
      enfants.forEach((n, i) => {
        const p = places[i];
        if (!p) return;
        const terne = !repond(n);
        const rx = p.r * 1.35, ry = p.r * 0.33;
        ctx.strokeStyle = jetons.anneau; ctx.lineWidth = 1;
        ctx.globalAlpha = terne ? 0.1 : 0.35;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, -0.38, Math.PI, 6.2832); ctx.stroke();
        ctx.fillStyle = jetons.point;
        const pts = sphere(Math.max(20, Math.round(Math.min(160, p.r * p.r * 0.06 + 26) * budget.facteur)));
        for (const q of pts) {
          const x1 = q[0] * cr - q[2] * sr, z1 = q[0] * sr + q[2] * cr, y2 = q[1] * ct - z1 * st, z2 = q[1] * st + z1 * ct;
          const d = (z2 + 1) / 2, s = 0.8 + d * 1.5;
          ctx.globalAlpha = (terne ? 0.25 : 1) * (0.12 + 0.8 * d * d);
          ctx.fillRect(p.x + x1 * p.r - s / 2, p.y + y2 * p.r - s / 2, s, s);
        }
        ctx.strokeStyle = jetons.anneau;
        ctx.globalAlpha = terne ? 0.1 : 0.6;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, -0.38, 0, Math.PI); ctx.stroke();
        if (avecLisibles) {
          // Part lisible par Tune : un arc sous la planète.
          const ok = nLisibles(n) / (n.elements.length || 1), a0 = Math.PI * 0.62, span = Math.PI * 1.76;
          ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.globalAlpha = terne ? 0.2 : 0.85;
          ctx.strokeStyle = jetons.non; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 5, a0 + span * ok, a0 + span); ctx.stroke();
          if (ok > 0) { ctx.strokeStyle = jetons.ok; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 5, a0, a0 + span * ok); ctx.stroke(); }
          ctx.lineCap = 'butt';
        }
      });
    }
    ctx.globalAlpha = 1;
  }

  // Redessiner quand la scène change ; animer selon le budget.
  $effect(() => {
    void [places, enfants, choisi, trouves, vue, budget, largeur, hauteur, toile];
    untrack(dessiner);
  });
  $effect(() => {
    if (!budget.anime || vue !== 'carte' || typeof requestAnimationFrame === 'undefined') return;
    let id = 0, dernier = 0;
    const pas = 1000 / Math.max(1, budget.ips);
    const tourner = (ts: number) => {
      id = requestAnimationFrame(tourner);
      if (document.hidden || ts - dernier < pas) return;
      const dt = Math.min(0.05, (ts - (dernier || ts)) / 1000);
      dernier = ts;
      rotation += dt * 0.16;
      dessiner();
    };
    id = requestAnimationFrame(tourner);
    return () => cancelAnimationFrame(id);
  });

  const image = (e: ElementCarte, taille: number) => (e.image ? artworkUrl(e.image, taille) : '');
  let imagesCassees = $state(new Set<string>());
  const casser = (id: string) => { imagesCassees = new Set([...imagesCassees, id]); };
</script>

<div class="carte">
  <div class="barre">
    <div class="seg" role="group" aria-label={$t('v2.carte.display' as any)}>
      <button type="button" aria-pressed={vue === 'carte'} onclick={() => (vue = 'carte')}>{$t('v2.carte.viewMap' as any)}</button>
      <button type="button" aria-pressed={vue === 'liste'} onclick={() => (vue = 'liste')}>{$t('v2.carte.viewList' as any)}</button>
    </div>
    <div class="seg" role="group" aria-label={$t('v2.carte.organisation' as any)}>
      <button type="button" aria-pressed={mode === 'arbre'} onclick={() => (mode = 'arbre')}>{$t('v2.carte.modeTree' as any)}</button>
      <button type="button" aria-pressed={mode === 'reseaux'} onclick={() => (mode = 'reseaux')}>{libelleModeReseaux}</button>
    </div>
    <div class="seg" role="group" aria-label={$t('v2.carte.axis' as any)}>
      <button type="button" aria-pressed={axe === 'genre'} onclick={() => (axe = 'genre')}>{libelleAxeGenre}</button>
      <button type="button" aria-pressed={axe === 'pays'} onclick={() => (axe = 'pays')}>{$t('v2.carte.axisCountry' as any)}</button>
    </div>
    {#if avecLisibles}
      <div class="seg" role="group" aria-label={$t('v2.carte.filter' as any)}>
        <button type="button" aria-pressed={!lisiblesSeuls} onclick={() => (lisiblesSeuls = false)}>{$t('v2.carte.all' as any)}</button>
        <button type="button" aria-pressed={lisiblesSeuls} onclick={() => (lisiblesSeuls = true)}>{$t('v2.carte.readableOnly' as any)}</button>
      </div>
    {/if}
    <div class="v2-rech cherche">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input type="search" bind:value={requete} onkeydown={surRecherche} placeholder={libelleRecherche} aria-label={libelleRecherche} autocomplete="off" />
    </div>
  </div>

  <nav class="fil" aria-label={$t('v2.carte.crumbs' as any)}>
    <button type="button" class="retour" disabled={pile.length < 2} onclick={remonter}>{$t('v2.carte.back' as any)}</button>
    {#each pile as n, i (n.id)}
      {#if i}<span class="sep" aria-hidden="true">›</span>{/if}
      {#if i === pile.length - 1}
        <button type="button" aria-current="true">{libelleNoeud(n)}</button>
      {:else}
        <button type="button" onclick={() => aller(pile.slice(0, i + 1))}>{libelleNoeud(n)}</button>
      {/if}
    {/each}
    <span class="compte">
      {unite(courant.elements.length)}{#if avecLisibles} · {$t('v2.carte.readableCount' as any).replace('{n}', String(nLisibles(courant)))}{/if}{#if cherche} · {$t('v2.carte.matches' as any).replace('{n}', String(trouves.size))}{/if}
    </span>
  </nav>

  <div class="grille">
    <div class="principal">
      {#if vue === 'carte'}
        <div class="scene" bind:this={scene}>
          <canvas bind:this={toile} aria-hidden="true"></canvas>
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div class="noeuds" role="group" aria-label={`${libelleScene}. ${$t('v2.carte.sceneHelp' as any)}`} onkeydown={surTouche}>
            {#each enfants as n, i (n.id)}
              {@const p = places[i]}
              {#if p}
                {#if n.type === 'groupe'}
                  <button type="button" class="groupe" class:terne={!repond(n)} class:trouve={cherche && repond(n)}
                    style={`left:${p.x}px; top:${p.y}px; width:${p.r * 2}px; height:${p.r * 2}px`}
                    tabindex={i === focus || (focus < 0 && i === 0) ? 0 : -1}
                    bind:this={boutons[i]} onfocus={() => (focus = i)}
                    aria-label={decrire(n)} onclick={() => ouvrir(n)}>
                    <span class="etiquette" aria-hidden="true">{libelleNoeud(n)} · {n.elements.length}</span>
                  </button>
                {:else}
                  {@const e = n.element!}
                  <button type="button" class="element" class:terne={!repond(n)} class:choisi={choisi === e.id}
                    class:proche={idsVoisins.has(e.id)} class:joue={enCours === e.id}
                    style={`left:${p.x}px; top:${p.y}px; width:${p.r * 2}px; height:${p.r * 2}px; --teinte:${teinte(e.reseau || e.nom)}`}
                    tabindex={i === focus || (focus < 0 && i === 0) ? 0 : -1}
                    bind:this={boutons[i]} onfocus={() => (focus = i)}
                    aria-label={decrire(n)} aria-pressed={choisi === e.id} onclick={() => ouvrir(n)}>
                    {#if e.image && !imagesCassees.has(e.id)}
                      <img src={image(e, 80)} alt="" loading="lazy" onerror={() => casser(e.id)} />
                    {:else}
                      <span class="ini" aria-hidden="true">{initiales(e.nom)}</span>
                    {/if}
                    {#if avecLisibles}<span class="pastille" class:non={!lisible(e)} aria-hidden="true"></span>{/if}
                    <span class="nom" aria-hidden="true">{e.nom}</span>
                  </button>
                {/if}
              {/if}
            {/each}
            {#if !enfants.length}<div class="vide">{$t('v2.carte.noResult' as any)}</div>{/if}
          </div>
          <div class="aide" aria-hidden="true">{$t('v2.carte.hint' as any)}</div>
        </div>
        {#if avecLisibles}
          <div class="legende" aria-hidden="true">
            <span><i class="ok"></i>{$t('v2.carte.readable' as any)}</span>
            <span><i class="non"></i>{$t('v2.carte.notReadable' as any)}</span>
          </div>
        {/if}
      {:else}
        <div class="liste">
          {#each racine.enfants as n (n.id)}{@render branche(n)}{/each}
          {#if !racine.enfants.length || (cherche && !trouves.size)}<p class="vide">{$t('v2.carte.noResult' as any)}</p>{/if}
        </div>
      {/if}
      <div class="sr" aria-live="polite">{annonce}</div>
    </div>

    <aside class="volet" aria-label={$t('v2.carte.selection' as any)}>
      {#if selection}
        {@const e = selection}
        <div class="tete">
          {#if e.image && !imagesCassees.has(e.id)}
            <img class="grande" src={image(e, 160)} alt="" onerror={() => casser(e.id)} />
          {:else}
            <span class="grande ini" style={`--teinte:${teinte(e.reseau || e.nom)}`} aria-hidden="true">{initiales(e.nom)}</span>
          {/if}
          <div class="titres">
            <h2>{e.nom}</h2>
            <p>{sousTitre(e)}</p>
          </div>
        </div>
        {#if avecLisibles}
          <p class="etat" class:non={!lisible(e)}>{lisible(e) ? $t('v2.carte.readable' as any) : $t('v2.carte.notReadableWhy' as any)}</p>
        {/if}
        <div class="gestes">{@render actions(e)}</div>
        <h3>{titreProches}</h3>
        {#if voisins.length}
          <ul class="proches">
            {#each voisins as v (v.element.id)}
              <li>
                <button type="button" onclick={() => choisir(v.element.id)}>
                  <span class="mini" style={`--teinte:${teinte(v.element.reseau || v.element.nom)}`} aria-hidden="true">
                    {#if v.element.image && !imagesCassees.has(v.element.id)}<img src={image(v.element, 64)} alt="" loading="lazy" onerror={() => casser(v.element.id)} />{:else}{initiales(v.element.nom)}{/if}
                  </span>
                  <span class="t"><b>{v.element.nom}</b><small>{v.raisons.map(libelleRaison).join(' · ')}{#if avecLisibles && !lisible(v.element)} · {$t('v2.carte.notReadable' as any)}{/if}</small></span>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="doux">{aucunProche}</p>
        {/if}
      {:else}
        <h2>{titreProches}</h2>
        <p class="doux">{invitation}</p>
      {/if}
    </aside>
  </div>
</div>

{#snippet branche(n: NoeudCarte)}
  {#if repond(n)}
    <details open={cherche}>
      <summary>{libelleNoeud(n)} <small>{cherche ? `${n.elements.filter((e) => trouves.has(e.id)).length} / ` : ''}{unite(n.elements.length)}{#if avecLisibles} · {$t('v2.carte.readableCount' as any).replace('{n}', String(nLisibles(n)))}{/if}</small></summary>
      {#if n.enfants[0]?.type === 'element'}
        <ul>
          {#each n.enfants as f (f.id)}
            {@const e = f.element!}
            {#if !cherche || trouves.has(e.id)}
              <li>
                <button type="button" aria-pressed={choisi === e.id} onclick={() => choisir(e.id, false)}>
                  <span class="mini" style={`--teinte:${teinte(e.reseau || e.nom)}`} aria-hidden="true">
                    {#if e.image && !imagesCassees.has(e.id)}<img src={image(e, 64)} alt="" loading="lazy" onerror={() => casser(e.id)} />{:else}{initiales(e.nom)}{/if}
                  </span>
                  <span class="t"><b>{e.nom}</b><small>{sousTitre(e)}</small>{#if avecLisibles && !lisible(e)}<span class="nt">{$t('v2.carte.notReadable' as any)}</span>{/if}</span>
                </button>
              </li>
            {/if}
          {/each}
        </ul>
      {:else}
        {#each n.enfants as k (k.id)}{@render branche(k)}{/each}
      {/if}
    </details>
  {/if}
{/snippet}

<style>
  .carte{display:flex; flex-direction:column; gap:10px; padding:4px 30px 30px; min-width:0}
  .barre{display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px}
  .seg{display:flex; gap:2px; background:var(--v2-surface2); border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill); padding:3px}
  .seg button{border:0; background:transparent; cursor:pointer; padding:5px 12px; border-radius:var(--v2-r-pill);
    color:var(--v2-txt2); font:600 11.5px var(--v2-sans); white-space:nowrap}
  .seg button[aria-pressed="true"]{background:var(--v2-surface); color:var(--v2-txt); box-shadow:0 0 0 1px var(--v2-line2)}
  .cherche{flex:1 1 200px; min-width:0; max-width:340px}
  button:focus-visible, input:focus-visible, summary:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
  .fil{display:flex; flex-wrap:wrap; align-items:center; gap:6px; min-height:30px}
  .fil button{border:1px solid transparent; background:transparent; cursor:pointer; color:var(--v2-txt2);
    font:13px var(--v2-sans); padding:3px 8px; border-radius:var(--v2-r-pill)}
  .fil button:hover{border-color:var(--v2-line2); color:var(--v2-txt)}
  .fil button[aria-current="true"]{color:var(--v2-txt); font-weight:600; cursor:default}
  .fil .retour{border-color:var(--v2-line2); color:var(--v2-txt)}
  .fil .retour:disabled{opacity:.4; cursor:default}
  .sep{color:var(--v2-txt3)}
  .compte{margin-left:auto; font:11px var(--v2-mono); color:var(--v2-txt3)}
  .grille{display:grid; grid-template-columns:minmax(0,1fr); gap:16px}
  @media (min-width: 980px){ .grille{grid-template-columns:minmax(0,1fr) 320px} }
  .principal{min-width:0; position:relative}
  .scene{position:relative; height:clamp(420px, 60vh, 640px); border:1px solid var(--v2-line2);
    border-radius:var(--v2-r-card); background:var(--v2-surface); overflow:hidden}
  .scene canvas{position:absolute; inset:0; width:100%; height:100%; display:block; pointer-events:none}
  .noeuds{position:absolute; inset:0}
  .groupe, .element{position:absolute; transform:translate(-50%,-50%); padding:0; cursor:pointer; border-radius:50%;
    transition:left .35s ease, top .35s ease, opacity .2s}
  .groupe{border:1px solid transparent; background:transparent}
  .groupe:hover, .groupe.trouve{border-color:var(--v2-acc2)}
  .etiquette{position:absolute; left:50%; top:calc(100% + 8px); transform:translateX(-50%); white-space:nowrap;
    max-width:180px; overflow:hidden; text-overflow:ellipsis; font:600 11.5px var(--v2-sans); color:var(--v2-txt);
    background:var(--v2-surface); padding:0 4px; border-radius:4px}
  .element{border:1.5px solid var(--v2-line2); background:hsl(var(--teinte) 35% 55%); overflow:visible;
    display:grid; place-items:center}
  .element img{width:100%; height:100%; object-fit:contain; border-radius:50%; background:#fff}
  .element .ini, .mini, .grande.ini{font:600 12px var(--v2-sans); color:var(--v2-on-acc)}
  .element .nom{position:absolute; left:50%; top:calc(100% + 4px); transform:translateX(-50%); white-space:nowrap;
    max-width:160px; overflow:hidden; text-overflow:ellipsis; font:600 11px var(--v2-sans); color:var(--v2-txt);
    background:var(--v2-surface); padding:0 4px; border-radius:4px; opacity:0; pointer-events:none}
  .element:hover .nom, .element:focus-visible .nom, .element.choisi .nom{opacity:1; z-index:2}
  .element.choisi, .element.proche, .element:hover{border-color:var(--v2-acc1); border-width:2.5px}
  .element.joue{box-shadow:0 0 0 3px var(--v2-acc2)}
  .terne{opacity:.28}
  .pastille{position:absolute; right:-2px; top:-2px; width:10px; height:10px; border-radius:50%;
    background:var(--v2-acc2); border:2px solid var(--v2-surface)}
  .pastille.non{background:var(--v2-danger)}
  .vide{position:absolute; inset:0; display:grid; place-items:center; color:var(--v2-txt3)}
  .liste .vide{position:static; display:block}
  .aide{position:absolute; left:12px; right:12px; bottom:8px; font:10px var(--v2-mono); color:var(--v2-txt3); pointer-events:none}
  .legende{display:flex; flex-wrap:wrap; gap:14px; margin-top:8px; font:12px var(--v2-sans); color:var(--v2-txt2)}
  .legende i{display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; vertical-align:-1px}
  .legende i.ok{background:var(--v2-acc2)} .legende i.non{background:var(--v2-danger)}
  .liste{border:1px solid var(--v2-line2); border-radius:var(--v2-r-card); background:var(--v2-surface); padding:6px 8px}
  .liste details details{margin-left:14px}
  .liste summary{cursor:pointer; padding:8px 6px; border-radius:8px; font:600 13px var(--v2-sans); color:var(--v2-txt)}
  .liste summary small{color:var(--v2-txt3); font-weight:400; margin-left:6px}
  .liste ul, .proches{list-style:none; margin:0 0 4px 14px; padding:0}
  .proches{margin:0}
  .liste li button, .proches button{display:flex; gap:10px; align-items:center; width:100%; text-align:left; border:0;
    background:transparent; cursor:pointer; padding:5px 6px; border-radius:8px; color:var(--v2-txt)}
  .liste li button:hover, .liste li button[aria-pressed="true"], .proches button:hover{background:var(--v2-hover)}
  .mini{width:30px; height:30px; flex:none; border-radius:50%; overflow:hidden; display:grid; place-items:center;
    background:hsl(var(--teinte) 35% 55%)}
  .mini img{width:100%; height:100%; object-fit:contain; background:#fff}
  .t{min-width:0; display:flex; flex-direction:column}
  .t b{font:500 13px var(--v2-sans); overflow-wrap:anywhere}
  .t small{color:var(--v2-txt3); font-size:11px}
  .nt{font:10px var(--v2-mono); color:var(--v2-danger)}
  .volet{background:var(--v2-surface); border:1px solid var(--v2-line2); border-radius:var(--v2-r-card); padding:14px 16px;
    min-width:0; align-self:start}
  .volet h2{font:700 15px var(--v2-sans); margin:0 0 4px; overflow-wrap:anywhere}
  .volet h3{font:600 10px var(--v2-mono); letter-spacing:.12em; text-transform:uppercase; color:var(--v2-txt3); margin:14px 0 6px}
  .tete{display:flex; gap:12px; align-items:center}
  .grande{width:64px; height:64px; flex:none; border-radius:12px; object-fit:contain; background:#fff}
  .grande.ini{display:grid; place-items:center; background:hsl(var(--teinte) 35% 55%); font-size:20px}
  .titres{min-width:0}
  .titres p, .doux{margin:0; color:var(--v2-txt2); font-size:12.5px}
  .etat{margin:10px 0 0; font:600 12px var(--v2-sans); color:var(--v2-acc2)}
  .etat.non{color:var(--v2-danger); font-weight:500}
  .gestes{display:flex; flex-wrap:wrap; gap:8px; margin-top:12px}
  .sr{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap}
  @media (prefers-reduced-motion: reduce){ .groupe, .element{transition:none} }
  @media (max-width: 640px){ .carte{padding:4px 16px 24px} .cherche{max-width:none} .scene{height:420px} }
</style>
