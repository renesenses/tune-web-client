<script lang="ts">
  /**
   * Barre latérale du nouveau client (direction Levente).
   *
   * Une seule barre, trois profondeurs pilotées par le niveau d'interface
   * (`preferences.settingsLevel`, partagé avec la vue Réglages) :
   *   - Essentiel  : le noyau seul (Accueil, Bibliothèque, Radio, Playlists, Recherche)
   *   - Avancé     : + File, Favoris, Zones, Serveurs multimédia
   *   - Expert     : + section « Studio » (EQ, Convertisseur, Métadonnées, Diagnostics)
   *     Les Extensions ont rejoint les Réglages (onglet dédié) le 01/09/2026.
   *
   * Principe de stabilité spatiale : le noyau ne bouge JAMAIS d'un niveau à
   * l'autre — les groupes se révèlent en place, jamais de réorganisation.
   */
  import { activeView, type View } from '../../lib/stores/navigation';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { t } from '../../lib/i18n';
  import { shortcuts, loadShortcuts, navigateToShortcut } from '../../lib/stores/shortcuts';
  import glyph from '../../assets/tune-glyph.png';
  import '../../styles/tune-v2.css';

  type Item = { view: View; label: string; icon: string };

  // Noyau aligné sur le brouillon v3 de Levente (26/08) : cinq entrées, pas
  // plus. Deux ecarts assumes avec notre version precedente :
  //
  //  - PODCASTS remonte dans le noyau. C'est un mode d'ecoute a part entiere,
  //    pas une option avancee.
  //  - RECHERCHE quitte le noyau. Chez Levente elle vit DANS la page, en
  //    champ a cote des filtres — la Bibliotheque en a un, desormais visible
  //    des l'Essentiel. L'ecran Recherche complet (bibliotheque + services +
  //    acoustique) reste atteignable, mais a partir d'Avance : il fait bien
  //    plus que filtrer une grille, et son cout d'attention le justifie.
  const CORE: Item[] = [
    { view: 'home', label: 'Accueil', icon: 'M3 11l9-8 9 8M5 10v10h14V10' },
    // LECTURE EN COURS dans le noyau. L'écran existait et était monté, mais
    // rien dans la barre n'y menait : on ne l'atteignait qu'en cliquant la
    // piste dans la barre de transport — un geste que personne ne devine.
    // Signalé par Bertrand le 02/09/2026 : « il manque l'écran Lecture en
    // cours ».
    { view: 'nowplaying', label: 'Lecture en cours', icon: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0m12-3a3 3 0 1 1-6 0 3 3 0 0 1 6 0' },
    { view: 'library', label: 'Bibliothèque', icon: 'M4 5v14M9 5v14M14 6l5 13' },
    { view: 'radios', label: 'Radio en direct', icon: 'M12 12h.01M7.5 7.5a6 6 0 0 0 0 9M16.5 7.5a6 6 0 0 1 0 9M4.5 4.5a10 10 0 0 0 0 15M19.5 4.5a10 10 0 0 1 0 15' },
    { view: 'podcasts', label: 'Podcasts', icon: 'M12 4a7 7 0 0 0 0 14M12 4a7 7 0 0 1 0 14M9 20h6' },
    // STREAMING dans le noyau (Bertrand, 28/08) : pour qui ecoute surtout en
    // ligne, c'est la porte d'entree principale — la reserver a l'Avance
    // rendait le client inutilisable en Essentiel sur une petite bibliotheque.
    { view: 'streaming', label: 'Streaming', icon: 'M4 15a8 8 0 0 1 16 0M7.5 15a4.5 4.5 0 0 1 9 0' },
    // RECHERCHE dans le noyau (Bertrand, 28/08 : « important »). Le champ de
    // la Bibliotheque ne cherche QUE dans les albums locaux ; cet ecran-ci
    // couvre aussi les services et l'acoustique. Le reserver a l'Avance,
    // c'etait cacher la fonction que l'on cherche en premier.
    { view: 'search', label: 'Recherche', icon: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M21 21l-4-4' },
  ];
  const ADVANCED: Item[] = [
    { view: 'queue', label: "File d'attente", icon: 'M4 6h13M4 11h13M4 16h8M18 15l3 2-3 2z' },
    { view: 'zonemanager', label: 'Zones', icon: 'M6 3h12v18H6zM12 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 7h.01' },
    // SERVEURS MULTIMEDIA en Avance (Bertrand, 28/08). Parcourir la
    // bibliotheque d'une AUTRE machine suppose de savoir qu'il y a un reseau
    // et autre chose dessus — ce n'est pas un geste de premier contact. Mais
    // on y ECOUTE de la musique : ce n'est pas non plus du reglage d'expert.
    { view: 'mediaservers', label: 'Serveurs multimédia', icon: 'M4 5h16v5H4zM4 14h16v5H4zM7.5 7.5h.01M7.5 16.5h.01' },
  ] as unknown as Item[];
  /**
   * SÉLECTIONS — ce que l'utilisateur a mis de côté lui-même.
   *
   * Demandé par Bertrand le 02/09/2026. Les deux entrées répondent à la même
   * question — « ce que j'ai marqué » — et les séparer les rendait toutes deux
   * difficiles à retrouver : les Favoris vivaient dans « Avancé », au milieu de
   * la File et des Zones, qui sont des outils et non des sélections.
   *
   * Les Favoris ne sont pas DUPLIQUÉS : ils ont quitté « Avancé ».
   */
  // Les deux nouveaux groupes sont TRADUITS, là où le reste de la barre porte
  // encore ses libellés en dur (dette connue) : on n'en ajoute pas.
  const SELECTIONS: { view: View; labelKey: string; icon: string }[] = [
    // COLLECTIONS et PLAYLISTS rejoignent le groupe (Bertrand, 02/09/2026) :
    // ce sont des sélections que l'utilisateur a constituées lui-même, au même
    // titre que les étiquettes et les favoris. Dans le noyau, elles voisinaient
    // avec Bibliothèque et Radio — des SOURCES, pas des choix.
    { view: 'collections', labelKey: 'v2.nav.collections', icon: 'M4 6h7v7H4zM13 6h7v7h-7zM4 15h7v3H4zM13 15h7v3h-7z' },
    { view: 'playlists', labelKey: 'v2.nav.playlists', icon: 'M4 7h11M4 12h11M4 17h7M18 15V8l3 .6' },
    { view: 'tags', labelKey: 'v2.nav.tags', icon: 'M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l8.58-8.58a1 1 0 0 0 0-1.42zM6.5 6.5h.01' },
    { view: 'favorites', labelKey: 'v2.nav.favorites', icon: 'M12 20s-6.5-4-9-8C1 9 3 5.5 6.2 5.5c1.8 0 3 1 3.8 2 .8-1 2-2 3.8-2C17 5.5 19 9 17 12c-2.5 4-9 8-9 8z' },
  ];

  const STUDIO: Item[] = [
    { view: 'equalizer', label: 'Égaliseur', icon: 'M6 4v6M6 14v6M12 4v3M12 11v9M18 4v9M18 17v3' },
    // Crossfeed sorti de l'Egaliseur (Bertrand, 27/08) : c'est un reglage de
    // CASQUE, pas une correction de courbe. Melange a l'egaliseur il etait
    // introuvable pour qui le cherche.
    { view: 'crossfeed', label: 'Crossfeed', icon: 'M8 6a6 6 0 0 0 0 12M16 6a6 6 0 0 1 0 12M4 12h4M16 12h4' },
    { view: 'converter', label: 'Convertisseur', icon: 'M4 8h13l-3-3M20 16H7l3 3' },
    { view: 'declick', label: 'Dé-ploc', icon: 'M3 12h4l3-8 4 16 3-8h4' },
    { view: 'metadata', label: 'Métadonnées', icon: 'M20 12l-8 8-9-9V4h7zM8 8h.01' },
    { view: 'diagnostics', label: 'Processing', icon: 'M3 12h4l2 6 4-14 2 8h6' },
  ];

  /**
   * RACCOURCIS — cinq au plus dans la barre, un écran au-delà.
   *
   * Règle posée par Bertrand le 02/09/2026. Les cinq tiennent dans la barre
   * sans la faire grossir ; passé ce nombre, la liste complète part sur son
   * propre écran plutôt que de repousser « Studio » hors de l'écran.
   *
   * Les ÉPINGLÉS d'abord : c'est le sens même de l'épingle, et sans ce tri le
   * cinquième raccourci ajouté chasserait un raccourci épinglé de la barre.
   */
  const RACCOURCIS_BARRE = 5;
  const raccourcisVisibles = $derived(
    [...$shortcuts]
      .sort((a, b) => Number(b.pinned !== false) - Number(a.pinned !== false))
      .slice(0, RACCOURCIS_BARRE),
  );

  const level = $derived($preferences.settingsLevel);
  const showAdvanced = $derived(atLeast(level, 'intermediate'));
  const showStudio = $derived(atLeast(level, 'expert'));

  function go(v: View) { activeView.set(v); }

  // Les raccourcis vivent dans la configuration serveur : sans ce chargement,
  // la barre en montrerait zéro pour toujours.
  $effect(() => {
    void loadShortcuts();
  });

  // Repli de la barre (bouton ⟵ du brouillon v3) : la barre se reduit aux
  // icones. Le choix persiste par navigateur — c'est une preference de
  // place a l'ecran, pas un reglage de compte a synchroniser.
  let collapsed = $state(false);
  $effect(() => {
    try { collapsed = localStorage.getItem('tune_v2_sidebar_collapsed') === '1'; } catch { /* ignore */ }
  });
  function toggleCollapse() {
    collapsed = !collapsed;
    try { localStorage.setItem('tune_v2_sidebar_collapsed', collapsed ? '1' : '0'); } catch { /* ignore */ }
  }
</script>

<aside class="v2-sidebar tune-v2" class:collapsed>
  <div class="brand">
    <div class="logo"><img src={glyph} alt="Tune" /></div>
    <div class="txt">
      <div class="name">Tune</div>
      <div class="sub">MOZAIKLABS</div>
    </div>
    <button class="collapse" onclick={toggleCollapse}
      aria-label={collapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'}
      title={collapsed ? 'Déplier' : 'Replier'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>
    </button>
  </div>

  <div class="navscroll">
    <nav class="grp">
      {#each CORE as it (it.view)}
        <button class="nav" class:active={$activeView === it.view} onclick={() => go(it.view)} title={collapsed ? it.label : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d={it.icon} /></svg>
          <span>{it.label}</span>
        </button>
      {/each}
    </nav>

    <nav class="grp reveal" class:show={showAdvanced} aria-hidden={!showAdvanced}>
      {#each ADVANCED as it (it.view)}
        <button class="nav" class:active={$activeView === it.view} onclick={() => go(it.view)} tabindex={showAdvanced ? 0 : -1} title={collapsed ? it.label : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d={it.icon} /></svg>
          <span>{it.label}</span>
        </button>
      {/each}
    </nav>

    <nav class="grp">
      <!--
        PLUS de bouton « + » ici. Retiré à la demande de Bertrand le
        03/09/2026.

        Il datait du moment où la barre affichait des raccourcis sans qu'on
        puisse jamais en créer. Depuis, le SIGNET de l'en-tête pose un
        raccourci sur n'importe quel écran, en capturant la vue courante — un
        seul endroit à connaître, au lieu de deux gestes pour le même geste.
      -->
      <div class="grp-label"><span>{$t('v2.nav.shortcuts' as any)}</span></div>
        {#each raccourcisVisibles as sc (sc.id)}
          <button class="nav" onclick={() => navigateToShortcut(sc)} title={collapsed ? sc.name : undefined}>
            <span class="emo" aria-hidden="true">{sc.icon}</span>
            <span>{sc.name}</span>
          </button>
        {/each}
      <!-- L'écran complet : présent DÈS QU'IL Y A un raccourci. Il ne sert pas
           qu'à voir les surnuméraires — c'est là qu'on renomme, qu'on change
           d'icône et qu'on épingle. Le réserver au dépassement de cinq rendait
           la gestion inatteignable tant qu'on en avait peu. -->
      {#if $shortcuts.length}
        <button class="nav tous" class:active={$activeView === 'shortcuts'}
          onclick={() => go('shortcuts')} title={collapsed ? $t('v2.nav.allShortcuts' as any) : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          <span>{$t('v2.nav.allShortcuts' as any)} ({$shortcuts.length})</span>
        </button>
      {/if}
    </nav>

    <nav class="grp">
      <div class="grp-label">{$t('v2.nav.selections' as any)}</div>
      {#each SELECTIONS as it (it.view)}
        <button class="nav" class:active={$activeView === it.view} onclick={() => go(it.view)} title={collapsed ? $t(it.labelKey as any) : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d={it.icon} /></svg>
          <span>{$t(it.labelKey as any)}</span>
        </button>
      {/each}
    </nav>

    <nav class="grp reveal" class:show={showStudio} aria-hidden={!showStudio}>
      <div class="grp-label">Studio</div>
      {#each STUDIO as it (it.view)}
        <button class="nav" class:active={$activeView === it.view} onclick={() => go(it.view)} tabindex={showStudio ? 0 : -1} title={collapsed ? it.label : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d={it.icon} /></svg>
          <span>{it.label}</span>
        </button>
      {/each}
    </nav>
  </div>

  <button class="nav support" onclick={() => go('support')}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
    <span>Support</span>
  </button>
</aside>

<style>
  .v2-sidebar{
    display:flex; flex-direction:column; height:100%;
    background:var(--v2-bg); border-right:1px solid var(--v2-line);
    padding:22px 16px 18px; font-family:var(--v2-sans); color:var(--v2-txt);
    box-sizing:border-box; width:236px;
  }
  .v2-sidebar.collapsed{width:72px; padding-left:10px; padding-right:10px}
  .v2-sidebar.collapsed .txt,
  .v2-sidebar.collapsed .nav span,
  .v2-sidebar.collapsed .grp-label{display:none}
  .v2-sidebar.collapsed .brand{justify-content:center; gap:0}
  .v2-sidebar.collapsed .nav{justify-content:center; padding-left:0; padding-right:0}
  .v2-sidebar.collapsed .collapse{position:absolute; top:8px; right:8px; transform:rotate(180deg)}

  /* L'icône d'un raccourci est un EMOJI choisi par l'utilisateur, pas un
     tracé : il occupe la même case que les pictogrammes pour que la colonne
     reste alignée. */
  .emo{width:17px; height:17px; display:grid; place-items:center; font-size:14px; line-height:1; flex:none}
  .brand{position:relative; display:flex; align-items:center; gap:11px; padding:4px 8px 22px}
  .collapse{margin-left:auto; width:26px; height:26px; border-radius:8px; border:0; cursor:pointer;
    background:transparent; color:var(--v2-txt3); display:grid; place-items:center; transition:.15s}
  .collapse:hover{color:var(--v2-txt); background:var(--v2-hover)}
  .collapse svg{width:15px; height:15px}
  .logo{width:40px; height:40px; border-radius:11px; display:grid; place-items:center;
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); box-shadow:0 4px 14px var(--v2-glow-strong)}
  .logo img{width:56%; height:auto; display:block}
  .brand .name{font-weight:700; font-size:18px; line-height:1}
  .brand .sub{font-family:var(--v2-mono); font-size:9.5px; letter-spacing:.18em; color:var(--v2-txt2); margin-top:3px}

  .navscroll{flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; margin:0 -6px; padding:0 6px}
  .navscroll::-webkit-scrollbar{width:6px}
  .navscroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .grp{display:flex; flex-direction:column; gap:4px}
  .reveal{max-height:0; opacity:0; overflow:hidden; transition:max-height .34s ease, opacity .26s ease}
  .reveal.show{max-height:440px; opacity:1}
  .grp-label{font-family:var(--v2-mono); font-size:10px; letter-spacing:.18em; color:var(--v2-txt3);
    padding:16px 14px 8px; text-transform:uppercase; display:flex; align-items:center; gap:10px}
  .grp-label::after{content:""; flex:1; height:1px; background:var(--v2-line)}

  .nav{display:flex; align-items:center; gap:13px; width:100%; padding:11px 14px; border:0; cursor:pointer;
    border-radius:var(--v2-r-pill); background:transparent; color:var(--v2-txt2);
    font-family:inherit; font-size:14.5px; font-weight:500; text-align:left; transition:.15s}
  .nav svg{width:19px; height:19px; flex:0 0 auto}
  .nav:hover{color:var(--v2-txt); background:var(--v2-hover)}
  .nav.active{color:var(--v2-txt); background:linear-gradient(90deg,var(--v2-active1),var(--v2-active2)); box-shadow:inset 0 0 0 1px var(--v2-line2)}
  .nav.active svg{color:var(--v2-acc1)}
  .support{margin-top:8px}
</style>
