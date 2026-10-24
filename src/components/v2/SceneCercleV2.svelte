<script lang="ts">
  /**
   * Tune Circle (rc8) — la scène de la maquette de Levente, au-dessus des
   * blocs de gestion de `CircleV2` (qui portent toujours le consentement).
   *
   * Cinq vues : Monde (globe, lieux posés), Solo, Lien (moi et un contact),
   * Réseau (mes contacts et mes cercles nommés), Genres (grappes). Le décor
   * est dessiné par `ChampCercle` (Canvas 2D, `lib/champCercle`) ; chaque nœud
   * est un VRAI bouton posé par-dessus, à l'endroit que le moteur indique.
   *
   * Vie privée (contrat rc8) :
   * - la taille et les genres d'un contact ne sont demandés QUE s'il partage
   *   déjà sa bibliothèque avec moi (`partages`, T2) ; sinon taille par défaut ;
   * - « Montrer ma ville à mes proches » est ÉTEINT par défaut ; la ville se
   *   pose d'un clic sur le globe (ou deux champs), avec un libellé libre,
   *   arrondie au demi-degré avant l'envoi ; le retrait est un clic ;
   * - aucune présence, aucune écoute en direct, aucune photo : le flux entre
   *   deux planètes dit seulement « partage sa bibliothèque avec moi ».
   *
   * Dégradé : un serveur sans les routes rc8 (404) garde contacts, cercles et
   * mes genres ; le globe, le réglage du lieu et les tailles disparaissent.
   *
   * Accessibilité : vue liste, résumé `aria-live`, flèches entre les nœuds,
   * Échap pour revenir ; `prefers-reduced-motion` = image fixe ; boucle en
   * pause onglet caché ; budget réduit pendant la lecture dans le navigateur
   * et sur petit écran (`budget.ts`).
   */
  import type { Snippet } from 'svelte';
  import { t } from '../../lib/i18n';
  import { bulleTexte } from '../../lib/infobulleTexte';
  import { formatNombre } from '../../lib/formats';
  import { browserAudioPlaying } from '../../lib/stores/browserAudio';
  import { ChampCercle, type PlacementNoeud } from '../../lib/champCercle/moteur';
  import { budgetScene, LARGEUR_PETIT_ECRAN } from '../../lib/champCercle/budget';
  import {
    construireScene, grappesDeGenres, noeudsDeVue, VUES,
    type Vue, type ContactScene, type NoeudScene, type Lieu,
  } from '../../lib/champCercle/scene';
  import { arrondiDemiDegre } from '../../lib/champCercle/tailles';
  import {
    lireMonLieu, lireLieuxContacts, poserMonLieu, retirerMonLieu, lireResumeContact,
    lireMesChiffres, lireMonNom, corpsLieu, LIBELLE_LIEU_MAX,
    type EtatRelais, type ResumeBibliotheque,
  } from '../../lib/circleMonde';
  import { motifCercle, type ContactCercle, type CercleNomme, type PartageRecu } from '../../lib/circle';

  interface Props {
    contacts: ContactCercle[];
    cercles: CercleNomme[];
    /** Les contacts qui partagent leur bibliothèque AVEC MOI (T2). */
    partages: PartageRecu[];
    /** Invitations envoyées en attente. */
    enAttente: number;
    /** Le formulaire d'invitation de l'écran, posé sous le slogan. */
    invitation?: Snippet;
  }
  let { contacts, cercles, partages, enAttente, invitation }: Props = $props();

  const CLE_VUE: Record<Vue, string> = {
    monde: 'v2.circle.scene.view.monde', seul: 'v2.circle.scene.view.seul', lien: 'v2.circle.scene.view.lien',
    reseau: 'v2.circle.scene.view.reseau', genres: 'v2.circle.scene.view.genres',
  };

  // ── Données ─────────────────────────────────────────────────────────────
  let relais = $state<EtatRelais | null>(null);
  let monLieu = $state<Lieu | null>(null);
  let lieux = $state.raw<Map<number, Lieu>>(new Map());
  let resumes = $state<Record<number, ResumeBibliotheque | null>>({});
  let mes = $state.raw<ResumeBibliotheque>({ albums: null, genres: [] });
  let monNom = $state<string | null>(null);
  let fini = false;

  // ── Vue ─────────────────────────────────────────────────────────────────
  let vue = $state<Vue>('seul');
  let vueChoisie = false;
  let precedente = $state<Vue | null>(null);
  let liste = $state(false);
  let selection = $state<string | null>(null);
  let focus = $state<number | null>(null);
  let sansToile = $state(false);

  // ── Budget ──────────────────────────────────────────────────────────────
  let reduit = $state(false);
  let largeur = $state(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const petit = $derived(largeur > 0 && largeur < LARGEUR_PETIT_ECRAN);
  const budget = $derived(budgetScene({
    largeur, lectureLocale: $browserAudioPlaying, mouvementReduit: reduit,
    coeurs: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? null : null,
  }));

  // ── Réglage du lieu ─────────────────────────────────────────────────────
  let poseOuverte = $state(false);
  let saisieLabel = $state('');
  let saisieLat = $state<number | null>(null);
  let saisieLon = $state<number | null>(null);
  let saisiePays = $state('');
  let occupeLieu = $state(false);
  let retourLieu = $state<{ texte: string; erreur: boolean } | null>(null);
  const repere = $derived(poseOuverte && saisieLat != null && saisieLon != null ? { lat: saisieLat, lon: saisieLon } : null);

  const fmt = (n: number) => $formatNombre(n);
  function tr(cle: string, vars: Record<string, string | number> = {}): string {
    let s = $t(cle as any);
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(typeof v === 'number' ? fmt(v) : v);
    return s;
  }

  const partageurs = $derived(new Set(partages.map((p) => p.user_id)));
  const contactsScene = $derived<ContactScene[]>(
    [...contacts].sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
      // 🔴 Rien sans partage T2 : un résumé lu avant une coupure est oublié.
      const r = relais === 'ok' && partageurs.has(c.user_id) ? resumes[c.user_id] ?? null : null;
      return {
        id: c.user_id, nom: c.name, albums: r?.albums ?? null, genres: r?.genres ?? [],
        lieu: relais === 'ok' ? lieux.get(c.user_id) ?? null : null,
      };
    }),
  );
  const nomAffiche = $derived(monNom ?? $t('v2.circle.scene.you' as any));
  const donnees = $derived({
    moi: { nom: nomAffiche, albums: mes.albums, genres: mes.genres, lieu: relais === 'ok' ? monLieu : null },
    contacts: contactsScene,
    cercles: cercles.map((c) => ({ id: c.id, nom: c.name, membres: c.member_ids })),
    focus,
    maxAutour: petit ? 8 : 12,
    maxGrappes: petit ? 4 : 6,
  });
  const scene = $derived(construireScene(donnees));
  const grappes = $derived(grappesDeGenres(donnees, donnees.maxGrappes));
  const vuesDispo = $derived<Vue[]>(relais === 'ok' ? [...VUES] : VUES.filter((v) => v !== 'monde'));
  const noeudsVue = $derived(noeudsDeVue(scene, vue));
  const epingles = $derived(noeudsDeVue(scene, 'monde'));
  const noeudSel = $derived(selection ? scene.noeuds.find((n) => n.id === selection) ?? null : null);
  const enCommun = $derived(grappes.some((g) => g.moi && g.membres.length > 0));

  // ── Lectures ────────────────────────────────────────────────────────────
  async function chargerFond() {
    const [l, m, nom] = await Promise.all([lireMonLieu(), lireMesChiffres(), lireMonNom()]);
    if (fini) return;
    relais = l.relais;
    monLieu = l.lieu;
    mes = m;
    monNom = nom;
    if (l.relais === 'ok') {
      const lx = await lireLieuxContacts();
      if (!fini) lieux = lx;
    }
    choisirVue();
  }

  /** La première vue : le globe s'il y a un lieu, sinon les genres, le réseau, ou moi seul. */
  function choisirVue() {
    if (vueChoisie) return;
    vueChoisie = true;
    if (relais === 'ok' && (monLieu || lieux.size > 0)) vue = 'monde';
    else if (grappes.length > 0) vue = 'genres';
    else if (contacts.length > 0) vue = 'reseau';
    else vue = 'seul';
  }

  $effect(() => { void chargerFond(); return () => { fini = true; }; });

  // Les résumés des contacts QUI PARTAGENT, et eux seuls, une fois chacun.
  const clePartages = $derived(relais === 'ok' ? [...partageurs].sort((a, b) => a - b).join(',') : '');
  $effect(() => {
    if (!clePartages) return;
    for (const uid of clePartages.split(',').map(Number)) {
      if (uid in resumes) continue;
      resumes[uid] = null;
      void lireResumeContact(uid).then((r) => { if (!fini) resumes[uid] = r; });
    }
  });

  // Un contact qui arrive (invitation acceptée) peut avoir posé son lieu.
  const cleContacts = $derived(contacts.map((c) => c.user_id).sort((a, b) => a - b).join(','));
  let derniereCleContacts = '';
  $effect(() => {
    const k = cleContacts;
    if (relais !== 'ok' || k === derniereCleContacts) return;
    const premiere = derniereCleContacts === '';
    derniereCleContacts = k;
    if (premiere) return;
    void lireLieuxContacts().then((lx) => { if (!fini) lieux = lx; });
  });

  // Plus de globe sur ce serveur : on quitte la vue Monde.
  $effect(() => { if (relais !== null && relais !== 'ok' && vue === 'monde') vue = grappes.length ? 'genres' : 'reseau'; });

  // ── Préférences du système ──────────────────────────────────────────────
  $effect(() => {
    if (typeof window === 'undefined') return;
    const surTaille = () => { largeur = window.innerWidth; };
    window.addEventListener('resize', surTaille);
    let mq: MediaQueryList | null = null;
    const surMouvement = () => { reduit = !!mq?.matches; };
    if (typeof window.matchMedia === 'function') {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      reduit = mq.matches;
      mq.addEventListener?.('change', surMouvement);
    }
    return () => { window.removeEventListener('resize', surTaille); mq?.removeEventListener?.('change', surMouvement); };
  });

  // ── Moteur ──────────────────────────────────────────────────────────────
  let toile = $state<HTMLCanvasElement | undefined>();
  let hote = $state<HTMLDivElement | undefined>();
  let moteur = $state.raw<ChampCercle | null>(null);
  const boutons = new Map<string, HTMLButtonElement>();

  function inscrire(el: HTMLButtonElement, id: string) {
    boutons.set(id, el);
    return { destroy() { if (boutons.get(id) === el) boutons.delete(id); } };
  }

  /** Le moteur dit où est chaque nœud ; on y pose son bouton, sans passer par Svelte. */
  function placer(id: string, p: PlacementNoeud | null) {
    const b = boutons.get(id);
    if (!b) return;
    if (!p || p.alpha < 0.05) { if (b.style.visibility !== 'hidden') b.style.visibility = 'hidden'; return; }
    b.style.visibility = 'visible';
    b.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    b.style.setProperty('--r', `${Math.max(12, p.r).toFixed(1)}px`);
    b.style.opacity = String(Math.min(1, p.alpha));
    if (b.dataset.mode !== p.mode) b.dataset.mode = p.mode;
    const grand = p.mode === 'sphere' && p.r > 60 ? '1' : '0';
    if (b.dataset.grand !== grand) b.dataset.grand = grand;
    if (p.mode === 'pin') {
      // Mon épingle écrit son nom à gauche (deux villes proches ne se recouvrent
      // pas) ; toute épingle près du bord droit aussi, pour rester lisible.
      const w = hote?.clientWidth ?? Infinity;
      const cote = p.x > w - 120 || (b.classList.contains('pin-moi') && p.x > 120) ? 'g' : 'd';
      if (b.dataset.cote !== cote) b.dataset.cote = cote;
    }
  }

  function surClicGlobe(l: { lat: number; lon: number }) {
    if (!poseOuverte) return;
    saisieLat = arrondiDemiDegre(l.lat);
    saisieLon = arrondiDemiDegre(l.lon);
    retourLieu = { texte: tr('v2.circle.scene.loc.picked', { lat: String(saisieLat), lon: String(saisieLon) }), erreur: false };
  }

  $effect(() => {
    const c = toile; const h = hote;
    if (!c || !h || liste) return;
    // jsdom et les navigateurs très anciens : pas de mesure, pas de dessin — la vue liste suffit.
    if (typeof ResizeObserver === 'undefined') { sansToile = true; return; }
    const m = new ChampCercle(c, { budget: budgetInitial(), placer, surClicGlobe });
    if (!m.disponible) { m.detruire(); sansToile = true; return; }
    const mesurer = () => { const r = h.getBoundingClientRect(); m.redimensionner(r.width, r.height); };
    const ro = new ResizeObserver(mesurer);
    ro.observe(h);
    mesurer();
    moteur = m;
    return () => { ro.disconnect(); m.detruire(); moteur = null; };
  });
  function budgetInitial() { return budget; }

  $effect(() => { const m = moteur; const s = scene; m?.majScene(s); });
  $effect(() => { const m = moteur; const v = vue; m?.vue(v); });
  $effect(() => { const m = moteur; const s = selection; m?.selection(s); });
  $effect(() => { const m = moteur; const b = budget; m?.majBudget(b); });
  $effect(() => { const m = moteur; const p = poseOuverte && vue === 'monde'; m?.modePose(p); m?.repere(repere); });

  // ── Gestes ──────────────────────────────────────────────────────────────
  function choisir(v: Vue) {
    precedente = null;
    vue = v;
    if (selection && !noeudsDeVue(scene, v).some((n) => n.id === selection)) selection = null;
  }

  function activer(n: NoeudScene) {
    if (n.kind === 'person' && n.contactId != null && vue !== 'lien') {
      focus = n.contactId;
      precedente = vue;
      vue = 'lien';
      selection = n.id;
      return;
    }
    if (n.kind === 'more') { liste = true; return; }
    selection = selection === n.id ? null : n.id;
  }

  function revenir() {
    if (poseOuverte) { annulerPose(); return; }
    if (selection) { selection = null; return; }
    if (precedente) { vue = precedente; precedente = null; }
  }

  function surToucheNoeud(ev: KeyboardEvent) {
    const sens = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0;
    if (ev.key === 'Escape') { ev.preventDefault(); revenir(); return; }
    if (!sens) return;
    const visibles = [...boutons.values()].filter((b) => b.style.visibility === 'visible')
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const i = visibles.indexOf(ev.currentTarget as HTMLButtonElement);
    if (i < 0 || visibles.length < 2) return;
    ev.preventDefault();
    visibles[(i + sens + visibles.length) % visibles.length].focus();
  }

  function surToucheScene(ev: KeyboardEvent) {
    if (ev.target !== ev.currentTarget) return;
    if (ev.key === 'Escape') { ev.preventDefault(); revenir(); return; }
    if (vue !== 'monde' || !moteur) return;
    const pas = 0.12;
    const d: Record<string, [number, number]> = { ArrowLeft: [pas, 0], ArrowRight: [-pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] };
    const v = d[ev.key];
    if (v) { ev.preventDefault(); moteur.tourner(v[0], v[1]); }
  }

  // ── Textes ──────────────────────────────────────────────────────────────
  const liste2 = (xs: string[]) => xs.join(', ');

  function info(n: NoeudScene): string {
    switch (n.kind) {
      case 'self': {
        const base = n.albums != null ? tr('v2.circle.scene.info.self', { n: n.albums }) : tr('v2.circle.scene.info.selfUnknown');
        return mes.genres.length ? `${base} ${tr('v2.circle.scene.info.selfGenres', { list: liste2(mes.genres.slice(0, 5).map((g) => g.genre)) })}` : base;
      }
      case 'person': {
        const c = contactsScene.find((x) => x.id === n.contactId);
        if (!c || !partageurs.has(c.id)) return tr('v2.circle.scene.info.noShare');
        const base = c.albums != null ? tr('v2.circle.scene.info.shares', { n: c.albums }) : tr('v2.circle.scene.info.sharesNoCount');
        return c.genres.length ? `${base} ${tr('v2.circle.scene.info.genres', { list: liste2(c.genres.map((g) => g.genre)) })}` : base;
      }
      case 'genre': {
        const g = grappes.find((x) => x.genre === n.genre);
        if (!g || g.membres.length === 0) return tr('v2.circle.scene.info.genreMine', { genre: n.label });
        const noms = g.membres.map((id) => contactsScene.find((c) => c.id === id)?.nom).filter(Boolean) as string[];
        return tr('v2.circle.scene.info.genre', { genre: n.label, list: liste2(noms) });
      }
      case 'circle': return tr('v2.circle.scene.info.circle', { name: n.label, n: n.members });
      case 'more': return tr('v2.circle.scene.info.more', { n: n.members });
      case 'pin': return n.me ? `${n.place ?? ''} — ${tr('v2.circle.scene.info.pinMe')}` : `${n.place ?? ''} — ${tr('v2.circle.scene.info.pin', { name: n.label })}`;
    }
  }

  /** Ce qu'un bouton annonce : le nom, et de quoi il s'agit. */
  function etiquetteAria(n: NoeudScene): string {
    if (n.kind === 'pin') return `${n.label}, ${n.place ?? ''}`;
    if (n.kind === 'more') return tr('v2.circle.scene.info.more', { n: n.members });
    return `${n.label} — ${info(n)}`;
  }

  const resume = $derived.by(() => {
    const parts: string[] = [];
    const n = contacts.length;
    parts.push(n === 0 ? tr('v2.circle.scene.summaryNone') : n === 1 ? tr('v2.circle.scene.summaryOne') : tr('v2.circle.scene.summaryMany', { n }));
    const communs = grappes.filter((g) => g.membres.length > 0);
    if (communs.length) {
      parts.push(tr('v2.circle.scene.summaryGenres', {
        list: liste2(communs.map((g) => tr('v2.circle.scene.summaryGenre', { genre: g.genre, n: g.membres.length }))),
      }));
    }
    if (epingles.length) parts.push(tr('v2.circle.scene.summaryPlaces', { n: epingles.length }));
    if (enAttente > 0) parts.push(tr('v2.circle.scene.pending', { n: enAttente }));
    return parts.join(' ');
  });

  const albumsDe = (n: NoeudScene) => (n.albums != null && (n.kind === 'self' || n.kind === 'person')
    ? (n.kind === 'self' ? tr('v2.circle.scene.albums', { n: n.albums }) : tr('v2.circle.scene.aboutAlbums', { n: n.albums }))
    : '');

  // ── Lieu : poser, enregistrer, retirer ──────────────────────────────────
  function ouvrirPose() {
    poseOuverte = true;
    retourLieu = null;
    saisieLabel = ''; saisieLat = null; saisieLon = null; saisiePays = '';
    precedente = null;
    vue = 'monde';
  }
  function annulerPose() { poseOuverte = false; retourLieu = null; }

  async function enregistrerLieu(ev: SubmitEvent) {
    ev.preventDefault();
    if (occupeLieu) return;
    const s = { label: saisieLabel, country_code: saisiePays, lat: saisieLat ?? NaN, lon: saisieLon ?? NaN };
    if (!corpsLieu(s)) { retourLieu = { texte: tr('v2.circle.scene.loc.invalid'), erreur: true }; return; }
    occupeLieu = true;
    try {
      monLieu = await poserMonLieu(s);
      poseOuverte = false;
      retourLieu = { texte: tr('v2.circle.scene.loc.saved'), erreur: false };
      if (monLieu) moteur?.centrerSur(monLieu.lat, monLieu.lon);
    } catch (e) {
      retourLieu = { texte: tr(motifCercle(e).cle), erreur: true };
    } finally {
      occupeLieu = false;
    }
  }

  async function retirerLieu() {
    if (occupeLieu) return;
    occupeLieu = true;
    try {
      await retirerMonLieu();
      monLieu = null;
      poseOuverte = false;
      retourLieu = { texte: tr('v2.circle.scene.loc.removed'), erreur: false };
    } catch (e) {
      retourLieu = { texte: tr(motifCercle(e).cle), erreur: true };
    } finally {
      occupeLieu = false;
    }
  }

  function basculerLieu() {
    if (monLieu) void retirerLieu();
    else if (poseOuverte) annulerPose();
    else ouvrirPose();
  }

  const montrerListe = $derived(liste || sansToile);
</script>

<section class="sc" aria-labelledby="sc-titre">
  <div class="sc-barre">
    <h2 id="sc-titre">{$t('v2.circle.contacts' as any)}</h2>
    <div class="sc-vues" role="group" aria-label={$t('v2.circle.scene.viewsLabel' as any)}>
      {#each vuesDispo as v (v)}
        <button type="button" class="sc-vue vue-{v}" aria-pressed={vue === v} onclick={() => choisir(v)}>{$t(CLE_VUE[v] as any)}</button>
      {/each}
    </div>
    {#if !sansToile}
      <button type="button" class="sc-vue sc-bascule-liste" aria-pressed={liste} onclick={() => { liste = !liste; }}>{$t('v2.circle.scene.listView' as any)}</button>
    {/if}
  </div>

  {#if relais === 'absent'}
    <p class="note sc-degrade">{$t('v2.circle.scene.relay.absent' as any)}</p>
  {:else if relais === 'indisponible'}
    <p class="note sc-degrade">{$t('v2.circle.scene.relay.down' as any)}</p>
  {/if}

  <p class="sr sc-resume" aria-live="polite">{resume}</p>

  {#if !montrerListe}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div class="sc-scene" bind:this={hote} role="region" aria-label={$t('v2.circle.scene.stageLabel' as any)}
      tabindex={vue === 'monde' ? 0 : -1} onkeydown={surToucheScene}>
      <canvas bind:this={toile} aria-hidden="true"></canvas>
      <div class="sc-noeuds">
        {#each scene.noeuds as n (n.id)}
          <button type="button" class="sc-noeud sorte-{n.kind}" class:pin-moi={n.kind === 'pin' && n.me} use:inscrire={n.id}
            data-mode={n.kind === 'pin' ? 'pin' : n.kind === 'more' ? 'more' : n.kind === 'genre' || n.kind === 'circle' ? 'cluster' : 'sphere'}
            data-grand={n.kind === 'self' ? '1' : '0'}
            data-cote={n.kind === 'pin' && n.me ? 'g' : 'd'}
            aria-label={etiquetteAria(n)} aria-pressed={selection === n.id}
            onclick={() => activer(n)} onkeydown={surToucheNoeud}
            onpointerenter={() => moteur?.survol(n.id)} onpointerleave={() => moteur?.survol(null)}
            onfocus={() => moteur?.survol(n.id)} onblur={() => moteur?.survol(null)}>
            <span class="sc-etiquette" aria-hidden="true">
              <span class="sc-nom" use:bulleTexte>{n.label}</span>
              {#if albumsDe(n)}<span class="sc-albums">{albumsDe(n)}</span>{/if}
              {#if n.kind === 'pin' && n.place}<span class="sc-albums">{n.place}</span>{/if}
            </span>
          </button>
        {/each}
      </div>
      {#if vue === 'monde' && epingles.length === 0 && !poseOuverte}
        <div class="sc-vide">
          <p>{$t('v2.circle.scene.world.empty' as any)}</p>
          {#if relais === 'ok'}<button type="button" class="go sc-poser" onclick={ouvrirPose}>{$t('v2.circle.scene.loc.toggle' as any)}</button>{/if}
        </div>
      {:else if vue === 'monde' && poseOuverte}
        <p class="sc-astuce">{$t('v2.circle.scene.loc.pick' as any)}</p>
      {:else if vue === 'monde'}
        <p class="sc-astuce">{$t('v2.circle.scene.world.rotate' as any)}</p>
      {:else if vue === 'genres' && grappes.length === 0}
        <p class="sc-vide">{$t('v2.circle.scene.genres.empty' as any)}</p>
      {:else if vue === 'lien' && contacts.length === 0}
        <p class="sc-vide">{$t('v2.circle.scene.link.empty' as any)}</p>
      {/if}
    </div>
  {:else}
    <div class="sc-liste-bloc">
      <h3>{$t(CLE_VUE[vue] as any)}</h3>
      {#if noeudsVue.length === 0}
        <p class="note">{$t((vue === 'monde' ? 'v2.circle.scene.world.empty' : vue === 'genres' ? 'v2.circle.scene.genres.empty' : 'v2.circle.scene.link.empty') as any)}</p>
      {:else}
        <ul class="sc-liste">
          {#each noeudsVue as n (n.id)}
            <li class="sc-ligne">
              <button type="button" class="lnk sc-ligne-nom" aria-pressed={selection === n.id} onclick={() => activer(n)}>
                {n.kind === 'pin' ? `${n.label} · ${n.place ?? ''}` : n.label}
              </button>
              <span class="note">{info(n)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  <div class="sc-bas">
    <div class="sc-gauche">
      <p class="sc-slogan">
        <span>{$t('v2.circle.scene.slogan1' as any)}</span><br />
        <span>{$t('v2.circle.scene.slogan2' as any)}</span><br />
        <span class="sc-slogan-acc">{$t('v2.circle.scene.slogan3' as any)}</span>
      </p>
      {@render invitation?.()}
      {#if enAttente > 0}<p class="note sc-attente">{tr('v2.circle.scene.pending', { n: enAttente })}</p>{/if}
    </div>
    <div class="sc-cartes">
      {#if noeudSel}
        <div class="sc-carte sc-detail" role="status">
          <div class="sc-carte-tete">
            <h3>{noeudSel.kind === 'pin' ? `${noeudSel.label} · ${noeudSel.place ?? ''}` : noeudSel.label}</h3>
            <button type="button" class="lnk sc-fermer" onclick={() => { selection = null; }}>{$t('v2.circle.scene.close' as any)}</button>
          </div>
          <p>{info(noeudSel)}</p>
        </div>
      {/if}
      {#if enCommun}
        <div class="sc-carte sc-badge">
          <span class="sc-onde" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" /></svg>
          </span>
          <p>{$t('v2.circle.scene.badge1' as any)}<br />{$t('v2.circle.scene.badge2' as any)}</p>
        </div>
      {/if}
    </div>
  </div>

  {#if relais === 'ok'}
    <div class="sc-lieu partage">
      <button type="button" class="interrupteur interrupteur-lieu" role="switch" aria-checked={monLieu !== null}
        disabled={occupeLieu} onclick={basculerLieu}>
        <span class="piste-interrupteur" aria-hidden="true"><span class="bouton-interrupteur"></span></span>
        <span>{$t('v2.circle.scene.loc.toggle' as any)}</span>
      </button>
      <p class="note">{$t('v2.circle.scene.loc.what' as any)}</p>
      {#if monLieu}
        <p class="note sc-lieu-actuel">
          {tr('v2.circle.scene.loc.current', { label: monLieu.label })}
          <button type="button" class="lnk danger sc-retirer-lieu" disabled={occupeLieu} onclick={() => void retirerLieu()}>{$t('v2.circle.scene.loc.remove' as any)}</button>
        </p>
      {/if}
      {#if poseOuverte}
        <form class="sc-pose" onsubmit={enregistrerLieu}>
          <p class="note">{$t('v2.circle.scene.loc.pick' as any)}</p>
          <label class="sc-champ">
            <span>{$t('v2.circle.scene.loc.label' as any)}</span>
            <input class="champ sc-libelle" type="text" maxlength={LIBELLE_LIEU_MAX} autocomplete="off" bind:value={saisieLabel} />
          </label>
          <div class="rangee">
            <label class="sc-champ"><span>{$t('v2.circle.scene.loc.lat' as any)}</span>
              <input class="champ sc-lat" type="number" min="-90" max="90" step="any" bind:value={saisieLat} /></label>
            <label class="sc-champ"><span>{$t('v2.circle.scene.loc.lon' as any)}</span>
              <input class="champ sc-lon" type="number" min="-180" max="180" step="any" bind:value={saisieLon} /></label>
            <label class="sc-champ"><span>{$t('v2.circle.scene.loc.country' as any)}</span>
              <input class="champ sc-pays" type="text" maxlength="2" autocomplete="off" bind:value={saisiePays} /></label>
          </div>
          <div class="rangee">
            <button type="submit" class="go sc-enregistrer-lieu" disabled={occupeLieu}>{$t('v2.circle.scene.loc.save' as any)}</button>
            <button type="button" class="lnk sc-annuler-lieu" onclick={annulerPose}>{$t('v2.circle.scene.loc.cancel' as any)}</button>
          </div>
        </form>
      {/if}
      {#if retourLieu}
        <p class={retourLieu.erreur ? 'note sc-retour-lieu alerte' : 'note sc-retour-lieu'} role={retourLieu.erreur ? 'alert' : 'status'}>{retourLieu.texte}</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .sc{--sc-fond:#121b20; --sc-or:#deb268; --sc-ligne:#22323a; --sc-txt:#e7eef0; --sc-txt2:#9fb0b6; --sc-vert:#4cc79d;
    display:flex; flex-direction:column; gap:10px; min-width:0}
  .sc-barre{display:flex; flex-wrap:wrap; align-items:center; gap:10px 14px}
  .sc-barre h2{font-size:15px; font-weight:700; margin:0; flex:1 1 auto}
  .sc-vues{display:flex; flex-wrap:wrap; gap:2px; padding:3px; border-radius:999px; border:1px solid var(--v2-line); background:var(--v2-surface2)}
  .sc-vue{border:0; background:transparent; color:var(--v2-txt2); font:500 12px var(--v2-sans); padding:6px 13px; border-radius:999px; cursor:pointer}
  .sc-vue[aria-pressed="true"]{background:var(--v2-acc-soft, rgba(0,212,170,.14)); color:var(--v2-txt)}
  .sc-bascule-liste{border:1px solid var(--v2-line)}
  .sc-vue:focus-visible,.sc-noeud:focus-visible,.sc-scene:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}
  .sc-degrade{margin:0}
  .sc-scene{position:relative; height:clamp(380px, 58vh, 640px); border-radius:var(--v2-r-card, 16px); overflow:hidden;
    background:radial-gradient(ellipse at 50% 45%, #18262b 0%, var(--sc-fond) 70%); color:var(--sc-txt)}
  .sc-scene canvas{position:absolute; inset:0; width:100%; height:100%; display:block}
  .sc-noeuds{position:absolute; inset:0; pointer-events:none}
  .sc-noeud{position:absolute; left:0; top:0; visibility:hidden; pointer-events:auto; --r:16px;
    width:calc(var(--r) * 2); height:calc(var(--r) * 2); margin:calc(var(--r) * -1) 0 0 calc(var(--r) * -1);
    border:0; border-radius:50%; background:transparent; color:#fff; cursor:pointer; padding:0;
    display:flex; align-items:center; justify-content:center; font:600 13px var(--v2-sans); text-shadow:0 1px 8px rgba(0,0,0,.7)}
  .sc-etiquette{display:flex; flex-direction:column; align-items:center; gap:1px; pointer-events:none}
  .sc-nom{white-space:nowrap; max-width:220px; overflow:hidden; text-overflow:ellipsis}
  .sc-albums{font-size:11px; font-weight:500; color:#d9c39a; white-space:nowrap}
  .sc-noeud:not([data-grand="1"])[data-mode="sphere"] .sc-etiquette{position:absolute; top:calc(100% + 4px)}
  .sc-noeud[data-grand="1"] .sc-nom{font:700 clamp(18px, calc(var(--r) * 0.27), 60px) var(--v2-sans); max-width:none}
  .sc-noeud[data-grand="1"] .sc-albums{font-size:clamp(11px, calc(var(--r) * 0.075), 16px)}
  .sc-noeud[data-mode="cluster"] .sc-nom{font:600 clamp(11px, calc(var(--r) * 0.4), 19px) var(--v2-sans); max-width:calc(var(--r) * 1.85);
    white-space:normal; overflow:visible; text-overflow:clip; overflow-wrap:anywhere; text-align:center; line-height:1.05}
  .sc-noeud[data-mode="pin"]{width:28px; height:28px; margin:-14px 0 0 -14px}
  .sc-noeud[data-mode="pin"] .sc-etiquette{position:absolute; left:calc(100% + 2px); top:-6px; align-items:flex-start}
  /* Étiquette d'épingle à GAUCHE : la mienne, et celles du bord droit (voir `placer`). */
  .sc-noeud[data-mode="pin"][data-cote="g"] .sc-etiquette{left:auto; right:calc(100% + 2px); align-items:flex-end}
  .sc-noeud[data-mode="more"]{width:44px; height:28px; margin:-14px 0 0 -22px; border-radius:999px; background:rgba(15,24,28,.92); border:1px solid var(--sc-ligne)}
  .sc-noeud[aria-pressed="true"] .sc-nom{color:var(--sc-or)}
  .sc-vide,.sc-astuce{position:absolute; left:50%; transform:translateX(-50%); margin:0; text-align:center; max-width:min(440px, 90%);
    color:var(--sc-txt2); font-size:13px}
  .sc-vide{top:50%; transform:translate(-50%, -50%); display:flex; flex-direction:column; align-items:center; gap:10px;
    background:rgba(15,24,28,.82); padding:14px 16px; border-radius:12px}
  .sc-vide p{margin:0}
  .sc-astuce{bottom:10px}
  .sc-liste-bloc{padding:12px 14px; border-radius:var(--v2-r-card, 16px); border:1px solid var(--v2-line); background:var(--v2-surface2)}
  .sc-liste-bloc h3{font-size:14px; margin:0 0 6px}
  .sc-liste{list-style:none; margin:0; padding:0; display:flex; flex-direction:column}
  .sc-ligne{display:flex; flex-wrap:wrap; gap:4px 12px; align-items:baseline; padding:6px 0; border-bottom:1px solid var(--v2-line)}
  .sc-ligne-nom{font-weight:600}
  .sc-bas{display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:16px}
  .sc-gauche{display:flex; flex-direction:column; gap:10px; min-width:0; flex:1 1 320px}
  .sc-slogan{font:400 clamp(22px, 2.6vw, 30px)/1.15 var(--v2-sans); margin:0}
  .sc-slogan-acc{color:var(--v2-acc1)}
  .sc-attente{margin:0}
  .sc-cartes{display:flex; flex-direction:column; gap:10px; align-items:flex-end; min-width:0; flex:0 1 300px}
  .sc-carte{width:min(300px, 100%); padding:14px 16px; border-radius:14px; border:1px solid var(--v2-line); background:var(--v2-surface2)}
  .sc-carte h3{font-size:14px; margin:0; flex:1; min-width:0; overflow-wrap:anywhere}
  .sc-carte p{margin:0; font-size:12.5px; color:var(--v2-txt2)}
  .sc-carte-tete{display:flex; gap:8px; align-items:baseline; margin-bottom:4px}
  .sc-badge{display:flex; align-items:center; gap:14px}
  .sc-badge p{color:var(--v2-txt)}
  .sc-onde{width:42px; height:42px; border-radius:50%; background:var(--sc-fond); color:var(--sc-or); display:grid; place-items:center; flex:none}
  .sc-onde svg{width:22px; height:22px}
  .sc-lieu{display:flex; flex-direction:column; gap:6px; padding:8px 0; border-top:1px solid var(--v2-line); border-bottom:1px solid var(--v2-line)}
  .sc-lieu .note{margin:0}
  .sc-lieu-actuel{display:flex; flex-wrap:wrap; gap:8px; align-items:center}
  .sc-retour-lieu.alerte{color:var(--v2-danger)}
  .sc-pose{display:flex; flex-direction:column; gap:8px}
  .sc-champ{display:flex; flex-direction:column; gap:3px; font-size:12px; color:var(--v2-txt2); min-width:0}
  .sc-lat,.sc-lon{width:110px}
  .sc-pays{width:70px; text-transform:uppercase}
  .sc-libelle{max-width:320px}
  .note{font-size:11.5px; color:var(--v2-txt3)}
  .rangee{display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap}
  .champ{height:34px; padding:0 12px; border-radius:var(--v2-r-md); border:1px solid var(--v2-line2); background:var(--v2-surface);
    color:var(--v2-txt); font:13px var(--v2-sans); min-width:0}
  .champ:focus-visible,.go:focus-visible,.lnk:focus-visible,.interrupteur:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}
  .go{height:34px; padding:0 18px; border-radius:var(--v2-r-pill); border:0; cursor:pointer; font:700 12.5px var(--v2-sans);
    color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .go:disabled{opacity:.35; cursor:not-allowed}
  .lnk{border:0; background:transparent; color:var(--v2-acc-tint); cursor:pointer; font-size:13px; padding:4px 2px}
  .lnk:disabled{opacity:.35; cursor:not-allowed}
  .danger{color:var(--v2-danger)}
  .partage{display:flex; flex-direction:column}
  .interrupteur{display:inline-flex; align-items:center; gap:10px; border:0; background:transparent; color:var(--v2-txt);
    font:600 13px var(--v2-sans); cursor:pointer; padding:2px 0; align-self:flex-start}
  .interrupteur:disabled{opacity:.35; cursor:not-allowed}
  .piste-interrupteur{position:relative; width:34px; height:20px; border-radius:10px; background:var(--v2-line2); flex:none; transition:background .15s}
  .bouton-interrupteur{position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:var(--v2-surface); transition:left .15s}
  .interrupteur[aria-checked="true"] .piste-interrupteur{background:var(--v2-acc2)}
  .interrupteur[aria-checked="true"] .bouton-interrupteur{left:16px}
  .sr{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap}
  @media (max-width: 767px){
    .sc-scene{height:clamp(320px, 62vh, 460px)}
    .sc-vue{padding:6px 10px}
    .sc-cartes{align-items:stretch; flex-basis:100%}
    .sc-carte{width:100%}
    .sc-detail{position:sticky; bottom:0}
  }
  @media (prefers-reduced-motion: reduce){
    .piste-interrupteur,.bouton-interrupteur{transition:none}
  }
</style>
