<script lang="ts">
  /**
   * Serveurs multimédia (UPnP/DLNA) — nouveau client (direction Levente).
   *
   * Niveau AVANCÉ. Parcourir la bibliothèque d'une AUTRE machine n'est pas un
   * geste de premier contact : il suppose qu'on sait qu'il y a un réseau, et
   * qu'il y a autre chose dessus. Mais ce n'est pas non plus du réglage
   * d'expert — on y écoute de la musique, comme dans la Bibliothèque.
   *
   * Trois décisions qui ne se lisent pas dans le code :
   *
   *  1. LE NOM NE SUFFIT PAS À IDENTIFIER UN SERVEUR. Ici, sur le réseau de
   *     Bertrand, les cinq serveurs découverts s'appellent tous « Tune Server ».
   *     L'adresse est donc affichée au même rang que le nom, pas en mention
   *     discrète : c'est elle qui distingue.
   *
   *  2. UN SERVEUR TUNE N'EST PAS UN INCONNU. Sa racine est connue
   *     (`RAYONS_TUNE`, seule source de vérité partagée avec l'app historique) :
   *     on ouvre donc directement sur les albums et on offre les rayons en
   *     puces, au lieu de faire redécouvrir la même racine à chaque visite.
   *     Pour un serveur tiers, on ne présume rien : racine, et c'est tout.
   *
   *  3. UN ONGLET PAR SERVEUR, ET POUR UN SERVEUR TUNE C'EST LA BIBLIOTHÈQUE
   *     ENTIÈRE (Bertrand, 28/08 : « une vue iso library Tune native »). Un
   *     serveur Tune n'expose pas que de l'UPnP : il sert aussi son API REST,
   *     en CORS ouvert, avec la forme `Album` complète — année, fréquence,
   *     profondeur, format. On monte donc `LibraryV2` sur son catalogue :
   *     même grille, mêmes filtres, même frise, même fiche album. Un serveur
   *     TIERS garde l'explorateur UPnP, parce que le DIDL-Lite ne transporte
   *     rien de tout cela et qu'on ne peut pas le lui inventer.
   *
   *  4. LA RECHERCHE PEUT NE PAS ÊTRE SUPPORTÉE PAR LE SERVEUR DISTANT. La
   *     route rend alors `supported: false` ; on filtre le dossier affiché et
   *     ON LE DIT. Laisser croire à une recherche complète sur un repli local
   *     ferait conclure à une absence là où il n'y a qu'un serveur muet.
   */
  import * as api from '../../lib/api';
  import { currentZoneId } from '../../lib/stores/zones';
  import { estUnServeurTune, ouvertureParDefaut, RAYONS_TUNE } from '../../lib/mediaServerHome';
  import { depotDistant } from '../../lib/tuneRemote';
  import LibraryV2 from './LibraryV2.svelte';
  import { filtrerLocalement } from '../../lib/rechercheServeurMedia';
  import { decoderEntitesXml, formatTime } from '../../lib/utils';
  import type {
    MediaServer,
    MediaServerBrowseResult,
    MediaServerContainer,
    MediaServerItem,
  } from '../../lib/types';
  import { t } from '../../lib/i18n';
  import '../../styles/tune-v2.css';

  /** Les rayons d'un serveur Tune, nommés pour cet écran. Les identifiants et
   *  l'ordre viennent de `RAYONS_TUNE` — on ne les redéclare pas. */
  const RAYON_LABEL: Record<string, string> = {
    artists: 'Artistes', albums: 'Albums', genres: 'Genres',
    tracks: 'Titres', radios: 'Radios',
  };

  let servers = $state<MediaServer[]>([]);
  let loadingServers = $state(true);
  let error = $state<string | null>(null);

  // L'onglet actif porte un IDENTIFIANT, pas l'objet : la liste des serveurs
  // se rafraichit, et garder l'objet ferait pointer sur une copie perimee.
  let actif = $state<string | null>(null);
  let browse = $state<MediaServerBrowseResult | null>(null);
  let pile = $state<{ objectId: string; titre: string }[]>([]);
  let busy = $state(false);
  let action = $state<string | null>(null);

  // Recherche dans le serveur distant.
  let q = $state('');
  let toutLeServeur = $state(true);
  let trouve = $state<any | null>(null);
  let cherche = $state(false);
  let repliLocal = $state(false);
  let seq = 0;

  const VIDE: MediaServerBrowseResult = {
    object_id: '0', containers: [], items: [], total_matches: 0, number_returned: 0,
  };

  const objetCourant = $derived(pile.length ? pile[pile.length - 1].objectId : '0');
  const open = $derived(servers.find((s) => s.id === actif) ?? null);
  const estTune = $derived(!!open && estUnServeurTune(open));

  /** Ce qu'on affiche : les résultats s'il y en a, sinon le dossier courant. */
  const vue = $derived.by<MediaServerBrowseResult>(() => {
    if (!q.trim()) return browse ?? VIDE;
    if (trouve && !repliLocal) {
      return {
        object_id: trouve.container, containers: trouve.containers ?? [], items: trouve.items ?? [],
        total_matches: trouve.total_matches ?? 0, number_returned: trouve.number_returned ?? 0,
      };
    }
    if (!browse) return VIDE;
    return filtrerLocalement(browse, q);
  });

  /** Une grille de pochettes plutôt qu'une liste : dès qu'un conteneur en a
   *  une, c'est un rayon d'albums, pas une liste de dossiers. */
  const enGrille = $derived(vue.containers.some((c) => !!c.album_art_uri));

  const fil = $derived.by(() => {
    if (!open) return [];
    // Plus d'entree « Serveurs » : ce niveau est desormais la barre d'onglets.
    const out: { titre: string; objectId: string | null }[] = [
      { titre: open.name, objectId: '0' },
    ];
    for (const e of pile) out.push({ titre: e.titre, objectId: e.objectId });
    return out;
  });

  $effect(() => {
    api.getMediaServers()
      .then((s) => {
        servers = s ?? [];
        // Un ecran d'onglets sans onglet ouvert n'affiche rien : on entre sur
        // le premier serveur, comme l'ecran Streaming entre sur le premier
        // service connecte.
        if (actif == null && servers.length) actif = servers[0].id;
      })
      .catch(() => { error = 'Découverte réseau indisponible.'; })
      .finally(() => { loadingServers = false; });
  });

  /** Ouverture d'un onglet UPnP. Un serveur Tune n'y passe pas : sa vue est
   *  `LibraryV2`, qui charge son propre catalogue par le REST distant. */
  $effect(() => {
    const s = open;
    if (!s || estUnServeurTune(s)) { return; }
    pile = []; browse = null; viderRecherche();
    ouvrirUpnp(s);
  });

  // Recherche différée. Relancée aussi quand la portée change : « ce dossier »
  // et « tout le serveur » ne rendent pas le même résultat.
  $effect(() => {
    const srv = open, besoin = q.trim(), portee = toutLeServeur, ici = objetCourant;
    if (!srv || besoin.length < 2) { trouve = null; repliLocal = false; cherche = false; return; }
    const mien = ++seq;
    cherche = true;
    const t = setTimeout(() => {
      api.searchMediaServer(srv.id, besoin, portee ? '0' : ici)
        .then((r: any) => {
          if (mien !== seq) return;
          trouve = r;
          // `supported: false` : le serveur distant ne sait pas chercher. On
          // filtre ce qui est a l'ecran et on l'annonce.
          repliLocal = !r?.supported;
        })
        .catch(() => { if (mien === seq) { trouve = null; repliLocal = true; } })
        .finally(() => { if (mien === seq) cherche = false; });
    }, 300);
    return () => clearTimeout(t);
  });

  function viderRecherche() { q = ''; trouve = null; repliLocal = false; }

  async function allerA(objectId: string, titre?: string, remplacer = false) {
    if (!open) return;
    busy = true;
    try {
      const r = await api.browseMediaServer(open.id, objectId);
      browse = r;
      if (objectId === '0') pile = [];
      else if (titre) {
        const t = decoderEntitesXml(titre);
        pile = remplacer ? [{ objectId, titre: t }] : [...pile, { objectId, titre: t }];
      }
    } catch { error = 'Ce dossier n’a pas répondu.'; }
    busy = false;
  }

  async function ouvrirUpnp(s: MediaServer) {
    await allerA('0');
    // Un serveur Tune s'ouvre sur ses albums, comme la Bibliotheque locale.
    // Mais SEULEMENT si le rayon repond : un dossier ouvert d'autorite et
    // vide se lirait comme une bibliotheque cassee, alors que la racine, elle,
    // marche toujours.
    const dep = ouvertureParDefaut(s);
    // `courant()` et non `browse` directement : TypeScript fige le type a
    // `null` d'apres l'affectation ci-dessus et ne voit pas qu'un `await`
    // intercale l'a rempli. La lecture indirecte lui rend la verite.
    const courant = () => browse as MediaServerBrowseResult | null;
    const garni = (b: MediaServerBrowseResult | null) =>
      (b?.containers?.length ?? 0) > 0 || (b?.items?.length ?? 0) > 0;
    if (dep && (courant()?.containers?.length ?? 0) > 0) {
      const avant = courant();
      await allerA(dep.objectId, dep.titre);
      if (!garni(courant())) { pile = []; browse = avant; }
    }
  }


  /** Remonter et sauter dans le fil sont le meme geste : on TRONQUE la pile a
   *  la position visee, puis on recharge. `allerA` n'empile que si on lui
   *  passe un titre — ici on n'en passe pas, donc la pile reste celle qu'on
   *  vient de fixer. */
  function versNiveau(reste: { objectId: string; titre: string }[]) {
    pile = reste;
    allerA(reste.length ? reste[reste.length - 1].objectId : '0');
  }

  function remonter() {
    // A la racine il n'y a plus de « dessus » : on y est deja, et l'onglet est
    // le seul moyen de changer de serveur.
    if (!pile.length) return;
    versNiveau(pile.slice(0, -1));
  }

  function auFil(objectId: string | null) {
    if (objectId === null || objectId === '0') { versNiveau([]); return; }
    const i = pile.findIndex((e) => e.objectId === objectId);
    if (i >= 0) versNiveau(pile.slice(0, i + 1));
  }

  /** Changer de rayon n'est pas descendre d'un cran : on REMPLACE la pile,
   *  sinon « Retour » ramenerait au rayon precedent plutot qu'a la racine. */
  function auRayon(objectId: string) {
    viderRecherche();
    allerA(objectId, RAYON_LABEL[objectId] ?? objectId, true);
  }

  function corps(it: MediaServerItem): Record<string, unknown> {
    const b: Record<string, unknown> = { source: 'upnp', source_id: it.res_url };
    if (it.title) b.title = it.title;
    if (it.artist) b.artist_name = it.artist;
    if (it.album) b.album_title = it.album;
    if (it.album_art_uri) b.cover_path = it.album_art_uri;
    if (it.duration_ms) b.duration_ms = it.duration_ms;
    return b;
  }

  async function lire(it: MediaServerItem) {
    const zid = $currentZoneId;
    if (zid == null || !it.res_url) return;
    try { await api.play(zid, corps(it) as any); }
    catch { error = 'Lecture impossible.'; }
  }

  async function enfiler(it: MediaServerItem) {
    const zid = $currentZoneId;
    if (zid == null || !it.res_url) return;
    try { await api.addToQueue(zid, corps(it) as any); }
    catch { error = 'Ajout impossible.'; }
  }

  /** Lance une suite de pistes : la premiere joue, les autres s'empilent. */
  async function enchainer(liste: MediaServerItem[], quoi: string) {
    const jouables = liste.filter((i) => i.res_url);
    if (!jouables.length || $currentZoneId == null) return;
    action = quoi;
    try {
      await lire(jouables[0]);
      for (let i = 1; i < jouables.length; i++) await enfiler(jouables[i]);
    } finally { action = null; }
  }

  function melanger(liste: MediaServerItem[]): MediaServerItem[] {
    const a = [...liste];
    // Tirage STABLE d'un appel a l'autre serait un contresens ici : on veut
    // justement l'aleatoire. Fisher-Yates, sans biais du tri par comparaison.
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Jouer un album depuis sa pochette, sans y naviguer — le geste de la
   *  Bibliotheque : la carte ouvre, le bouton joue. */
  async function lireConteneur(c: MediaServerContainer, e: MouseEvent) {
    e.stopPropagation();
    if (!open) return;
    action = c.id;
    try {
      const r = await api.browseMediaServer(open.id, c.id);
      await enchainer(r.items ?? [], c.id);
    } catch { error = 'Ce dossier n’a pas répondu.'; }
    action = null;
  }

  /** Teinte deterministe tiree du titre, comme sur l'accueil : deux dossiers
   *  sans pochette n'ont jamais la meme vignette. */
  function hue(s: string): number {
    let h = 0;
    for (let i = 0; i < (s ?? '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }
  /** Les titres UPnP arrivent avec une couche d'echappement XML de trop :
   *  « King Gizzard &amp; The Lizard Wizard » s'affichait mot pour mot. */
  const txt = decoderEntitesXml;
</script>

<section class="v2-ms tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">{$t('v2.ms.eyebrow' as any)}</div>
      <h1>{$t('v2.ms.title' as any)}</h1>
    </div>
    {#if open && !estTune}
      <!-- Un serveur Tune a le champ de recherche de la Bibliotheque, dans la
           page, a cote de ses filtres : en ajouter un second ici poserait deux
           recherches concurrentes sur le meme ecran. -->
      <div class="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input placeholder={`Rechercher dans ${open.name}`} bind:value={q} />
        {#if cherche}<span class="spin" aria-hidden="true"></span>
        {:else if q}<button class="clr" onclick={viderRecherche} aria-label="Effacer">×</button>{/if}
      </div>
    {/if}
  </header>

  {#if servers.length}
    <!-- UN ONGLET PAR SERVEUR. L'etiquette est l'ADRESSE, pas le nom : sur ce
         reseau les cinq serveurs s'appellent tous « Tune Server » et une barre
         de cinq onglets identiques ne designerait rien. -->
    <nav class="svcs">
      {#each servers as s (s.id)}
        <button class:on={actif === s.id} onclick={() => (actif = s.id)}>
          {s.host}
          {#if estUnServeurTune(s)}<span class="tag">Tune</span>{/if}
        </button>
      {/each}
    </nav>
  {/if}

  {#if error}<div class="err">{error}<button onclick={() => (error = null)} aria-label="Fermer">×</button></div>{/if}

  {#if open && !estTune}
    <nav class="fil">
      <button class="back" onclick={remonter} aria-label="Retour">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      {#each fil as c, i (c.objectId ?? 'racine')}
        {#if i > 0}<span class="sep">/</span>{/if}
        <button class="crumb" class:last={i === fil.length - 1} onclick={() => auFil(c.objectId)}>{c.titre}</button>
      {/each}
      <span class="host">{open.host}:{open.port}</span>
    </nav>

    {#if estTune}
      <!-- Rayons connus : on ne les propose QUE sur un serveur Tune, dont on
           connait la racine. Chez un tiers, ces dossiers n'existent pas. -->
      <div class="chips">
        {#each RAYONS_TUNE as r (r.objectId)}
          <button class="chip" class:active={objetCourant === r.objectId}
            onclick={() => auRayon(r.objectId)}>{RAYON_LABEL[r.objectId] ?? r.objectId}</button>
        {/each}
      </div>
    {/if}
  {/if}

  {#if estTune && open}
    <!-- LA VUE ISO BIBLIOTHEQUE. Ce n'est pas un ecran qui lui ressemble :
         c'est le MEME composant, monte sur le catalogue REST du serveur
         distant. Tout correctif de la Bibliotheque profite donc aux deux. -->
    <LibraryV2 depot={depotDistant(open)} />
  {:else}
  <div class="scroll">
    {#if !open}
      {#if loadingServers}
        <div class="state">{$t('v2.ms.searching' as any)}</div>
      {:else if !servers.length}
        <div class="notice">
          <p>{$t('v2.ms.none' as any)}</p>
          <p class="sub">{$t('v2.ms.noneHint' as any)}</p>
        </div>
      {:else}
        <div class="state">{$t('v2.ms.pickServer' as any)}</div>
      {/if}

    {:else}
      {#if q.trim() && repliLocal}
        <!-- Dire la verite sur la portee : sans cela, une absence de resultat
             se lirait comme « ce titre n'est pas sur le serveur ». -->
        <div class="warn">
          {open.name} ne sait pas chercher dans son index — filtrage du dossier affiché uniquement.
        </div>
      {:else if q.trim()}
        <div class="scope">
          <button class:on={toutLeServeur} onclick={() => (toutLeServeur = true)}>{$t('v2.ms.wholeServer' as any)}</button>
          <button class:on={!toutLeServeur} onclick={() => (toutLeServeur = false)}>{$t('v2.ms.thisFolder' as any)}</button>
          {#if trouve?.total_matches}<span class="cnt">{(trouve.total_matches > 1 ? $t('v2.ms.resultsMany' as any) : $t('v2.ms.resultsOne' as any)).replace('{count}', String(trouve.total_matches))}</span>{/if}
        </div>
      {/if}

      {#if busy && !vue.containers.length && !vue.items.length}
        <div class="state">Chargement…</div>
      {:else}
        {#if vue.containers.length}
          {#if enGrille}
            <div class="grid">
              {#each vue.containers as c (c.id)}
                <div class="card">
                  <button class="hit" onclick={() => allerA(c.id, c.title)} aria-label={`Ouvrir ${txt(c.title)}`}></button>
                  <span class="cv">
                    {#if c.album_art_uri}
                      <img src={c.album_art_uri} alt="" loading="lazy" />
                    {:else}
                      <span class="blank" style="--hh:{hue(c.title)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
                          <path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>
                        </svg>
                      </span>
                    {/if}
                    <button class="pbtn" onclick={(e) => lireConteneur(c, e)} aria-label={`Lire ${txt(c.title)}`}>
                      {#if action === c.id}
                        <span class="spin sm" aria-hidden="true"></span>
                      {:else}
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8V4z"/></svg>
                      {/if}
                    </button>
                  </span>
                  <span class="ct" title={txt(c.title)}>{txt(c.title)}</span>
                  <span class="ca">{c.artist ? txt(c.artist) : (c.child_count ? `${c.child_count} éléments` : '')}</span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="folders">
              {#each vue.containers as c (c.id)}
                <button class="folder" onclick={() => allerA(c.id, c.title)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                  <span class="fn">{txt(c.title)}</span>
                  {#if c.child_count}<span class="fc">{c.child_count}</span>{/if}
                  <svg class="go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
                </button>
              {/each}
            </div>
          {/if}
        {/if}

        {#if vue.items.length}
          <div class="ihead">
            <h2>{vue.items.length} titre{vue.items.length > 1 ? 's' : ''}</h2>
            <div class="acts">
              <button class="pill" disabled={!!action} onclick={() => enchainer(vue.items, 'all')}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8V4z"/></svg>Tout lire
              </button>
              <button class="pill ghost" disabled={!!action} onclick={() => enchainer(melanger(vue.items), 'shuffle')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3l5 5-5 5M3 8h18M8 21l-5-5 5-5M21 16H3"/></svg>Aléatoire
              </button>
            </div>
          </div>
          <div class="trks">
            {#each vue.items as it, i (it.id ?? i)}
              <div class="trk">
                <button class="tplay" onclick={() => lire(it)} aria-label={`Lire ${txt(it.title)}`}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8V4z"/></svg>
                </button>
                <span class="ti">{txt(it.title)}</span>
                <span class="tar">{[it.artist, it.album].filter(Boolean).map(txt).join(' · ')}</span>
                <span class="td">{it.duration_ms ? formatTime(it.duration_ms) : ''}</span>
                <button class="tq" onclick={() => enfiler(it)} aria-label={$t('v2.ms.addToQueue' as any)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h13M4 11h13M4 16h8M18 15l3 2-3 2z"/></svg>
                </button>
              </div>
            {/each}
          </div>
        {/if}

        {#if !vue.containers.length && !vue.items.length}
          <div class="state">{q.trim() ? 'Aucun résultat.' : 'Ce dossier est vide.'}</div>
        {/if}
      {/if}
    {/if}
  </div>
  {/if}
</section>

<style>
  .v2-ms{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .top{display:flex; align-items:flex-end; justify-content:space-between; gap:20px; padding:24px 30px 12px; padding-right:96px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .search{position:relative; display:flex; align-items:center; width:320px; flex:0 0 auto}
  .search > svg{position:absolute; left:14px; width:16px; height:16px; color:var(--v2-txt3); pointer-events:none}
  .search input{width:100%; height:40px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2);
    background:var(--v2-surface2); color:var(--v2-txt); font:13px var(--v2-sans); padding:0 34px 0 38px; outline:none}
  .search input:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .clr{position:absolute; right:10px; width:20px; height:20px; border:0; background:transparent; cursor:pointer;
    color:var(--v2-txt3); font-size:16px; line-height:1}
  .spin{position:absolute; right:13px; width:13px; height:13px; border:2px solid var(--v2-line2);
    border-top-color:var(--v2-acc1); border-radius:50%; animation:sp .7s linear infinite}
  .spin.sm{position:static; width:12px; height:12px; border-color:var(--v2-on-acc); border-top-color:transparent}
  @keyframes sp{to{transform:rotate(360deg)}}

  .err{display:flex; align-items:center; gap:10px; margin:0 30px 10px; padding:9px 14px; border-radius:10px;
    background:var(--v2-danger-soft); border:1px solid var(--v2-danger); color:var(--v2-danger); font-size:13px}
  .err button{margin-left:auto; border:0; background:transparent; color:inherit; cursor:pointer; font-size:16px}

  .fil{display:flex; align-items:center; gap:7px; flex-wrap:wrap; padding:2px 30px 10px}
  .back{width:30px; height:30px; flex:0 0 auto; border-radius:9px; cursor:pointer; display:grid; place-items:center;
    border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2)}
  .back:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .back svg{width:15px; height:15px}
  .crumb{border:0; background:transparent; cursor:pointer; color:var(--v2-txt2); font:13px var(--v2-sans); padding:2px 2px}
  .crumb:hover{color:var(--v2-acc-tint)}
  .crumb.last{color:var(--v2-txt); font-weight:700; cursor:default}
  .sep{color:var(--v2-txt3); font-size:12px}
  .host{margin-left:auto; font:11px var(--v2-mono); color:var(--v2-txt3)}

  .chips{display:flex; gap:8px; flex-wrap:wrap; padding:0 30px 12px}
  .chip{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:7px 14px; font:600 12px var(--v2-sans)}
  .chip:hover{border-color:var(--v2-acc2); color:var(--v2-txt)}
  .chip.active{color:var(--v2-on-acc); border-color:transparent;
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}

  .scroll{flex:1; overflow-y:auto; padding:4px 30px 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:26px 2px; color:var(--v2-txt3); font-size:14px}
  .notice{display:flex; flex-direction:column; gap:8px; padding:34px 2px; max-width:560px}
  .notice p{color:var(--v2-txt2); font-size:15px}
  .notice .sub{color:var(--v2-txt3); font-size:13px; line-height:1.6}

  /* Liste des serveurs. Le NOM ne suffit pas a distinguer (ils s'appellent
     tous « Tune Server ») : l'adresse est au meme rang, pas en mention. */
  /* Onglets de serveurs — memes formes que les onglets de services de l'ecran
     Streaming : c'est le meme geste, choisir une source. */
  .svcs{display:flex; gap:8px; flex-wrap:wrap; padding:2px 30px 12px}
  .svcs button{display:inline-flex; align-items:center; gap:8px; border:1px solid var(--v2-line2);
    background:transparent; color:var(--v2-txt2); cursor:pointer; border-radius:var(--v2-r-pill);
    padding:8px 16px; font:600 13px var(--v2-mono)}
  .svcs button:hover{border-color:var(--v2-acc2); color:var(--v2-txt)}
  .svcs button.on{color:var(--v2-on-acc); border-color:transparent;
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .svcs .tag{font:700 9px var(--v2-mono); letter-spacing:.1em; text-transform:uppercase; padding:2px 6px;
    border-radius:5px; border:1px solid currentColor; opacity:.75}
  /* La Bibliotheque montee ici est un composant plein ecran : sans cette
     regle elle se dimensionne a son contenu et laisse la coquille vide. */
  .v2-ms > :global(.v2-lib){flex:1; min-height:0}

  .warn{margin:2px 0 14px; padding:9px 14px; border-radius:10px; font-size:12.5px;
    color:var(--v2-txt2); border:1px solid var(--v2-line2); background:var(--v2-surface2)}
  .scope{display:flex; align-items:center; gap:8px; padding:2px 0 14px}
  .scope button{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:6px 13px; font:600 12px var(--v2-sans)}
  .scope button.on{color:var(--v2-on-acc); border-color:transparent;
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .scope .cnt{font:11px var(--v2-mono); color:var(--v2-txt3)}

  .grid{display:grid; grid-template-columns:repeat(auto-fill, minmax(158px, 1fr)); gap:20px 18px; padding-top:4px}
  .card{position:relative; display:flex; flex-direction:column; min-width:0}
  .hit{position:absolute; inset:0; z-index:1; border:0; background:transparent; cursor:pointer; border-radius:var(--v2-r-card)}
  .hit:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
  .cv{position:relative; display:block; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden;
    background:var(--v2-surface2); box-shadow:var(--v2-sh-card); transition:.18s}
  .card:hover .cv{box-shadow:0 10px 24px var(--v2-glow)}
  .cv img{width:100%; height:100%; object-fit:cover; display:block}
  .blank{display:grid; place-items:center; width:100%; height:100%;
    color:hsl(var(--hh) 42% 78% / .65);
    background:linear-gradient(145deg, hsl(var(--hh) 34% 26%), hsl(var(--hh) 30% 15%))}
  .blank svg{width:34px; height:34px}
  .pbtn{position:absolute; right:8px; bottom:8px; z-index:2; width:36px; height:36px; border-radius:50%; border:0;
    cursor:pointer; display:grid; place-items:center; color:var(--v2-on-acc);
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); box-shadow:0 4px 12px rgba(0,0,0,.45);
    opacity:0; transform:translateY(6px); transition:.16s}
  .card:hover .pbtn{opacity:1; transform:none}
  .pbtn svg{width:15px; height:15px; margin-left:2px}
  .ct{margin-top:9px; font:600 13px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{margin-top:2px; font:11px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden;
    text-overflow:ellipsis; min-height:14px}

  .folders{display:flex; flex-direction:column; gap:2px; padding-top:4px}
  .folder{display:flex; align-items:center; gap:12px; width:100%; text-align:left; cursor:pointer;
    padding:11px 12px; border:0; border-radius:10px; background:transparent; color:var(--v2-txt2)}
  .folder:hover{background:var(--v2-surface2); color:var(--v2-txt)}
  .folder > svg{width:18px; height:18px; flex:0 0 auto; color:var(--v2-acc2)}
  .fn{font:500 14px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .fc{margin-left:auto; font:11px var(--v2-mono); color:var(--v2-txt3)}
  .folder .go{width:15px; height:15px; flex:0 0 auto; color:var(--v2-txt3)}

  .ihead{display:flex; align-items:center; justify-content:space-between; gap:16px; padding:24px 0 10px}
  .ihead h2{font-size:16px; font-weight:700}
  .acts{display:flex; gap:9px}
  .pill{display:inline-flex; align-items:center; gap:8px; height:36px; padding:0 16px; border:0; cursor:pointer;
    border-radius:var(--v2-r-pill); font:700 12.5px var(--v2-sans); color:var(--v2-on-acc);
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .pill.ghost{color:var(--v2-txt); background:transparent; border:1px solid var(--v2-line2)}
  .pill.ghost:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .pill:disabled{opacity:.5; cursor:default}
  .pill svg{width:14px; height:14px}

  .trks{display:flex; flex-direction:column; gap:1px}
  .trk{display:grid; grid-template-columns:32px 1fr auto auto 32px; align-items:center; gap:14px;
    padding:9px 10px; border-radius:9px; color:var(--v2-txt2)}
  .trk:hover{background:var(--v2-surface2); color:var(--v2-txt)}
  .tplay,.tq{width:28px; height:28px; border:0; border-radius:8px; cursor:pointer; display:grid; place-items:center;
    background:transparent; color:var(--v2-txt3)}
  .tplay:hover,.tq:hover{color:var(--v2-acc1); background:var(--v2-acc-soft)}
  .tplay svg{width:13px; height:13px; margin-left:1px} .tq svg{width:15px; height:15px}
  .ti{font:500 14px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .tar{font:12px var(--v2-sans); color:var(--v2-txt3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    max-width:340px}
  .td{font:12px var(--v2-mono); color:var(--v2-txt3)}
</style>
