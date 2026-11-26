<script lang="ts">
  import { notifierErreur } from '../../lib/notifierErreur';
  import { onDestroy } from 'svelte';
  import { loadViewContext, saveViewContext } from '../../lib/stores/navigation';
  import { bulleTexte } from '../../lib/infobulleTexte';
  /**
   * Radio en direct — nouveau client (direction Levente).
   *
   * Entrée du NOYAU : présente à tous les niveaux, comme dans le brouillon v3.
   * Densité par niveau :
   *   Essentiel → favoris en tête, puis toutes les stations. Lecture, favori.
   *   Avancé    → filtres par genre + recherche.
   *   Vignette  → deux lignes sous le logo, à tous les niveaux : le nom,
   *               puis « genre · pays » (retour de Rémi sur la rc12, go de
   *               Bertrand du 17/11). Le format du flux n'y est plus : il se
   *               lit dans la fiche et dans le chemin du signal.
   *
   * Subtilité reprise de l'écran actuel, à ne pas perdre : sur une zone
   * NAVIGATEUR, le serveur ne peut pas sortir le son — il renvoie l'URL du
   * flux et c'est à la page de le lire. Sans ce relais, cliquer sur une
   * station reste silencieux.
   */
  import * as api from '../../lib/api';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { t, locale } from '../../lib/i18n';
  import { currentZoneId, currentZone } from '../../lib/stores/zones';
  import { browserPlay } from '../../lib/stores/browserAudio';
  import { estZoneJouableIci } from '../../lib/zoneNavigateurProprietaire';
  import { signalerZoneNavigateurJoueeAilleurs } from '../../lib/zoneNavigateurRevendication';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { fold } from '../../lib/utils';
  import { radioGenreRayon, radioGenreLabel, type RadioGenreShelf }
    from '../../lib/radioGenres';
  import { nomDuPays } from '../../lib/paysAffichage';
  import { estDeLAnnuaire, dernieresLues, memoriserLecture, sectionsRadio, questionRetraitMesRadios, stationsDuSegment, logoDeStation } from '../../lib/mesRadios';
  import { dialogs } from '../../lib/stores/dialogs';
  import type { RadioStation } from '../../lib/types';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import LienEntite from '../partages/LienEntite.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import { objetRadio } from '../../lib/gestesObjet';
  import RadioEditModale from './RadioEditModale.svelte';
  import RadioAnnuaire from './RadioAnnuaire.svelte';
  import PaysEcouteRadios from './PaysEcouteRadios.svelte';
  import CarteRadios from './CarteRadios.svelte';
  import RadioRecherche from './RadioRecherche.svelte';
  import RadioChipsGenres from './RadioChipsGenres.svelte';
  import RadioFiltresAvances from './RadioFiltresAvances.svelte';
  import { filtresMesRadios, normaliserFiltresRadio, parametresDesFiltres, trierLesPays } from '../../lib/radioFiltres';
  import PochetteRadioGeneree from './PochetteRadioGeneree.svelte';
  import Heart from '@lucide/svelte/icons/heart';
  import Tag from '@lucide/svelte/icons/tag';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import RadioNouvelleStationModale from './RadioNouvelleStationModale.svelte';
  import RadioFicheModale from '../partages/RadioFicheModale.svelte';
  import { aMetadataPlus } from '../../lib/ficheStation';
  import { notifications } from '../../lib/stores/notifications';
  import '../../styles/tune-v2.css';

  const level = $derived($preferences.settingsLevel);
  const showFilters = $derived(atLeast(level, 'intermediate'));
  const showExpert = $derived(atLeast(level, 'expert'));

  // #2473 / serveur#7052 : quitter la vue la démonte ; le retour doit
  // retrouver l'Annuaire (ou la Carte), plutôt que recréer « Mes radios ».
  interface ContexteRadios {
    section: 'mes' | 'annuaire' | 'carte';
    q: string;
    genre: string | null;
    ongletFavoris: boolean;
    /** tune-server-rust#7466 — le pays choisi dans « Mes radios » (ISO). */
    paysChoisi?: string | null;
    annuaire?: { q: string; pays: string | null; genre: string | null; nombre: number; defilement: number };
  }
  const contexte = loadViewContext<ContexteRadios>('radios');
  onDestroy(() => saveViewContext('radios', { section, q, genre, ongletFavoris, paysChoisi,
    annuaire: { q: qAnnuaire, pays: paysAnnuaire, genre: genreAnnuaire, nombre: nombreAnnuaire,
      defilement: section === 'annuaire' ? defilement?.scrollTop ?? defilementAnnuaire : defilementAnnuaire },
  }));
  let qAnnuaire = $state(contexte?.annuaire?.q ?? '');
  let paysAnnuaire = $state<string | null>(contexte?.annuaire?.pays ?? null);
  let genreAnnuaire = $state<string | null>(contexte?.annuaire?.genre ?? null);
  let nombreAnnuaire = $state(contexte?.annuaire?.nombre ?? 120);
  let defilement = $state<HTMLDivElement | undefined>(undefined);
  let defilementAnnuaire = contexte?.annuaire?.defilement ?? 0;
  let retourAnnuaire = contexte?.section === 'annuaire';
  function annuaireCharge(nombre: number) {
    nombreAnnuaire = nombre;
    if (retourAnnuaire && defilement) {
      defilement.scrollTop = defilementAnnuaire;
      retourAnnuaire = false;
    }
  }

  let radios = $state<RadioStation[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let q = $state(contexte?.q ?? '');
  let genre = $state<string | null>(contexte?.genre ?? null);
  let paysChoisi = $state<string | null>(contexte?.paysChoisi ?? null);
  let playingId = $state<number | null>(null);

  /*
   * Plus de vue en liste (Rémi, RC7, #2397) : la liste ne marchait pas sur
   * l'annuaire, et deux dispositions pour un écran de vignettes n'apportaient
   * rien. Toujours la grille.
   */

  /**
   * 🔴 #863 — « un onglet avec ses radios favorites ».
   *
   * Les favoris étaient déjà GROUPÉS en tête, mais dans la même page : les
   * deux sections défilent ensemble, et sur un long catalogue ses favoris
   * disparaissent vers le haut. Sa demande n'est donc pas « rendez-les
   * accessibles » mais « séparez-les vraiment ».
   *
   * ⚠️ Un onglet qui n'aurait rien à montrer serait pire que pas d'onglet :
   * `ongletFavoris` ne s'offre que s'il existe au moins une station en
   * favori, et l'écran retombe sur « toutes » dès que la dernière est retirée.
   */
  let ongletFavoris = $state(contexte?.ongletFavoris ?? false);

  /**
   * tune-server-rust#6516 — « Mes radios » / « Annuaire ».
   *
   * « Mes radios » reste la liste personnelle, avec ses onglets Favoris /
   * Toutes. « Annuaire » montre les stations de radio-metadata.fr que le
   * serveur garde en cache (`RadioAnnuaire`) : on y écoute d'un clic, et on
   * ajoute à « Mes radios » sans doublon.
   *
   * web#2400 — « Carte » : le même annuaire, à parcourir par genres, pays et
   * réseaux (`CarteRadios`), troisième onglet décidé par Bertrand le 26/10.
   *
   * Retour de Rémi sur la rc11 (point 32, décidé le 14/11) : l'onglet est
   * MASQUÉ en rc12. Le code reste ; une vraie carte zoomable, avec les mêmes
   * filtres, vient en rc13. Un retour mémorisé sur la Carte retombe sur
   * « Mes radios ».
   */
  const CARTE_VISIBLE = false;
  let section = $state<'mes' | 'annuaire' | 'carte'>(
    contexte?.section === 'carte' && !CARTE_VISIBLE ? 'mes' : contexte?.section ?? 'mes');
  /** La fiche d'annuaire qui joue, pour sa pastille « en direct ». */
  let ficheJouee = $state<string | null>(null);

  /**
   * Le titre en cours de la zone, quand elle joue une radio — celui que le
   * serveur lit sur le relais radio-metadata.fr, chez le diffuseur ou dans
   * l'ICY. Tant que la station n'a rien publié, le serveur pose son NOM en
   * titre et « Live Radio » en artiste : rien à montrer de plus que la vignette.
   */
  const titreEnCours = $derived.by(() => {
    const np = $currentZone?.current_track;
    if (!np || np.source !== 'radio' || !np.title) return null;
    if (np.title === np.album_title) return null;
    const artiste = np.artist_name && np.artist_name !== 'Live Radio' ? np.artist_name : null;
    return artiste ? `${artiste} — ${np.title}` : np.title;
  });

  /*
   * Plus de bouton « Mettre à jour l'adresse du flux » (Rémi, RC7, #2397) :
   * le flux et le logo d'une station de l'annuaire sont gérés en central et
   * se mettent à jour seuls — côté serveur (tune-server-rust#7043).
   */

  /**
   * Une entrée de l'annuaire se RETIRE de « Mes radios » ; elle ne se modifie
   * pas. #7523 : la confirmation précise que la station reste dans l'annuaire.
   */
  async function retirer(r: RadioStation) {
    const id = r.id;
    if (id == null) return;
    if (!(await dialogs.confirm(questionRetraitMesRadios((k) => $t(k as any), r.name, estDeLAnnuaire(r)), { danger: true }))) return;
    try {
      await api.deleteRadio(id);
      radios = radios.filter((x) => x.id !== id);
      notifications.success($t('v2.radio.removed' as any).replace('{name}', r.name));
    } catch (e: any) {
      notifierErreur($t('common.error' as any), e, { motifSeul: true });
    }
  }

  /** Une station vient d'entrer dans « Mes radios » depuis l'annuaire. */
  function stationAjoutee(st: RadioStation) {
    radios = radios.some((x) => x.id === st.id)
      ? radios.map((x) => (x.id === st.id ? { ...x, ...st } : x))
      : [...radios, st];
  }

  /*
   * Importer une liste M3U/PLS — porté de l'ancien écran Radios. Retour de
   * Rémi sur la rc11 (points 2 et 3, décidés le 14/11) : l'import est le
   * quatrième choix de « Nouvelle station », et « Exporter M3U » quitte
   * l'écran (« on veut que les gens restent dans Tune »).
   */
  let importEnCours = $state(false);
  async function importerM3u(f: File) {
    choixNouvelle = false;
    if (importEnCours) return;
    importEnCours = true;
    try {
      const r = await api.importRadios(f);
      notifications.success($t('radio.importResult' as any)
        .replace('{imported}', String(r.imported)).replace('{skipped}', String(r.skipped)));
      radios = (await api.getRadios({ limit: 500 })) ?? radios;
    } catch (err: any) {
      notifierErreur($t('common.error' as any), err, { motifSeul: true });
    } finally {
      importEnCours = false;
    }
  }

  function charger(silencieux = false) {
    if (!silencieux) loading = true;
    error = null;
    return api.getRadios({ limit: 500 })
      .then((r) => { radios = r ?? []; })
      .catch(() => { error = $t('v2.radio.loadFailed' as any); })
      .finally(() => { loading = false; });
  }
  $effect(() => { charger(); });

  /**
   * Revenir sur « Mes radios » relit la liste : le serveur met à jour seul le
   * flux et le logo des stations de l'annuaire, et l'écran ne doit pas garder
   * ce qu'il a lu à l'ouverture. (« Annuaire » se relit à CHAQUE ouverture :
   * le composant est monté à neuf.)
   */
  function ouvrirSection(v: 'mes' | 'annuaire' | 'carte') {
    if (section === 'annuaire' && v !== section) defilementAnnuaire = defilement?.scrollTop ?? 0;
    if (v === 'annuaire' && section !== v) retourAnnuaire = true;
    if (v === 'mes' && section !== 'mes') charger(true);
    section = v;
  }

  /** Dernières stations lues — la première rangée de « Mes radios ». */
  let lectures = $state(0);
  const recentes = $derived.by(() => { void lectures; return dernieresLues(radios); });
  /**
   * web#2783 — « Dernières écoutées » est SÉPARÉE de la liste filtrée et de
   * l'annuaire : une rangée tout en haut, avant les choix Mes radios /
   * Annuaire / Carte, la même dans les trois, sans dépendre des filtres ni de
   * l'onglet Favoris. Une ligne au plus ; « Voir plus » déplie le reste.
   */
  const recentesUniques = $derived(sectionsRadio([], recentes).recentes);
  let recentesDepliees = $state(false);

  /**
   * Genres réellement présents, comptés — pas une liste figée qui
   * proposerait des rubriques vides.
   *
   * 🔴 SILVIU (testeur roumain, v0.9.161) — les puces disaient « Éclectique,
   * Classique, Jazz, Rock, Électronique, Hip-Hop, Monde, Reggae, Blues,
   * Chanson française, Contemporaine, Culture » dans une interface roumaine.
   *
   * Ce n'était pas du français écrit en dur ICI : le genre est une colonne
   * TEXTE LIBRE du serveur (`radio_stations.genre`), semée en français
   * canonique et recopiée verbatim de l'annuaire mozaiklabs. Cet écran
   * dérivait ses puces des chaînes brutes — `new Set(radios.map(r.genre))` —
   * et affichait donc la donnée telle quelle, quelle que soit la langue.
   *
   * `lib/radioGenres.ts` existait déjà pour exactement ça : replier les
   * vingt-six orthographes sur une quinzaine de clés `radioGenre.*`,
   * traduites dans les onze langues. Il était ÉCRIT MAIS PAS BRANCHÉ — aucun
   * composant ne l'importait, seul son test le connaissait. On le branche.
   *
   * Un genre hors vocabulaire n'est pas caché : son rayon porte sa valeur
   * brute. On n'invente pas de traduction pour un mot qu'on ne connaît pas.
   *
   * ── LE SERVEUR A PRIS LE RELAIS (v0.9.162) ──────────────────────────────
   *
   * tune-server-rust #4713 joint désormais `genre_key`, `genre_label` et
   * `country_code` à chaque station. `radioGenreRayon()` fait l'arbitrage :
   * la clé du serveur d'abord, son libellé déjà traduit ensuite, la table
   * locale en dernier — celle-ci ne sert plus que face à un serveur
   * antérieur, ou pour une station au genre libre.
   *
   * ✅ Le PAYS n'est plus en français : `country_code` est un code ISO 3166-1
   * alpha-2, rendu dans la langue du lecteur par `Intl.DisplayNames`
   * (`lib/paysAffichage.ts`). Le client ne tient toujours AUCUNE table de
   * pays — il lit un code et délègue au navigateur. Sans code — serveur plus
   * ancien, pays écrit à la main —, `country` est rendu tel quel : c'est
   * exactement l'affichage d'avant, jamais une pastille vide.
   */
  /** Le libellé d'un rayon dans la langue courante. */
  const libelle = (rayon: RadioGenreShelf) => radioGenreLabel(rayon, (k) => $t(k as any));

  /** Le pays d'une station, dans la langue du lecteur. */
  const pays = (r: RadioStation) => nomDuPays(r.country_code, $locale, r.country);

  const rayons = $derived.by(() => {
    const m = new Map<string, { rayon: RadioGenreShelf; n: number }>();
    for (const r of radios) {
      const rayon = radioGenreRayon(r);
      if (!rayon) continue;
      const e = m.get(rayon.key);
      if (e) e.n += 1;
      else m.set(rayon.key, { rayon, n: 1 });
    }
    return [...m.values()]
      .sort((a, b) => b.n - a.n || libelle(a.rayon).localeCompare(libelle(b.rayon)))
      .slice(0, 12);
  });

  /**
   * tune-server-rust#7466 — les critères de recherche sur « Mes radios ». Format,
   * débit, sans perte, Hi-Res, Metadata+ et favoris se jugent au SERVEUR
   * (`GET /radios/search`, critères seuls) : la fréquence, la note et
   * Metadata+ ne sont connues que par la fiche d'annuaire de la station. Le
   * serveur rend les stations retenues ; l'écran garde celles-là.
   */
  // rc14 : « Mes favoris » quitte les critères de « Mes radios » — le segment
  // « Toutes les stations / Favoris » le remplace (`filtresMesRadios`).
  const criteresMes = $derived(parametresDesFiltres(filtresMesRadios(normaliserFiltresRadio($preferences.radioFiltres))));
  const cleCriteresMes = $derived(JSON.stringify(criteresMes));
  let retenuesParCriteres = $state<Set<number> | null>(null);
  let jetonCriteres = 0;
  $effect(() => {
    const cle = cleCriteresMes;
    void radios.length;
    const moi = ++jetonCriteres;
    if (cle === '{}') { retenuesParCriteres = null; return; }
    api.rechercherRadiosParCriteres('', JSON.parse(cle))
      .then((r) => {
        if (moi !== jetonCriteres) return;
        retenuesParCriteres = new Set((r.items ?? []).map((x) => x.id).filter((id): id is number => id != null));
      })
      .catch(() => { if (moi === jetonCriteres) retenuesParCriteres = null; });
  });

  /** Les pays de « Mes radios », comptés (code ISO du serveur). */
  const paysDeMesRadios = $derived.by(() => {
    const m = new Map<string, number>();
    for (const r of radios) if (r.country_code) m.set(r.country_code, (m.get(r.country_code) ?? 0) + 1);
    // Recette rc12 (14/11) : dans l'ordre alphabétique de la langue en cours.
    return trierLesPays([...m.entries()], ([code]) => nomDuPays(code, $locale, code), $locale);
  });

  function matches(r: RadioStation): boolean {
    if (genre && radioGenreRayon(r)?.key !== genre) return false;
    if (paysChoisi && r.country_code !== paysChoisi) return false;
    if (retenuesParCriteres && (r.id == null || !retenuesParCriteres.has(r.id))) return false;
    if (q) {
      const n = fold(q);
      // Le libellé AFFICHÉ compte autant que la valeur brute : un lecteur
      // roumain tape « Clasică », pas « Classique » — et « Regatul Unit »,
      // pas « Royaume-Uni ». Les deux formes du pays sont donc cherchées.
      const rayon = radioGenreRayon(r);
      const traduit = rayon ? libelle(rayon) : '';
      if (!fold(r.name).includes(n) && !fold(r.genre).includes(n)
        && !fold(traduit).includes(n) && !fold(r.country).includes(n)
        && !fold(pays(r)).includes(n)) return false;
    }
    return true;
  }
  const shown = $derived(radios.filter(matches));
  /**
   * Harmonisation rc14 (maquette `radios.html`) : UN segment « Toutes les
   * stations / Favoris » sur la ligne des outils, à la place du filtre « Mes
   * favoris » ET des onglets « Favoris · Toutes les stations » (#863), qui
   * disaient la même chose deux fois. `stationsDuSegment` garde la règle de
   * #863 : sans favori, l'écran retombe sur toutes les stations.
   */
  const segment = $derived(stationsDuSegment(shown, ongletFavoris));

  /**
   * web#2443 — la station dont la fiche est ouverte. Retour de Rémi sur la
   * rc11 (point 17, décidé le 14/11) : plus d'œil, la fiche s'ouvre par un
   * clic sur le logo (`onOuvrir`), hors de ▶ et des autres boutons.
   */
  let enFiche = $state<RadioStation | null>(null);

  /** Station en cours d'édition — le bouton haut-droit de la pochette. */
  let enEdition = $state<RadioStation | null>(null);

  /**
   * Gabarit de création : la même modale, sans `id`.
   *
   * L'écran renvoyait au client actuel pour ajouter une station, alors que le
   * formulaire — nom, flux, logo, genre, pays, site — existait déjà ici pour
   * la modification. Il ne manquait que le bouton et l'appel.
   */
  let choixNouvelle = $state(false);
  function nouvelleStation() {
    choixNouvelle = false;
    enEdition = {
      id: null, name: '', stream_url: '', logo_url: '', genre: '', country: '', homepage_url: '',
    } as unknown as RadioStation;
  }

  async function play(r: RadioStation) {
    // #1233 — garde COMPOSÉE, séparée : une radio sans identifiant est un
    // défaut de donnée dont l'utilisateur n'a rien à faire ; une zone absente
    // est une chose qu'il peut corriger, et qu'il faut donc lui dire.
    if (r.id == null) return;
    const zid = zoneRequise();
    if (zid == null) return;
    playingId = r.id;
    memoriserLecture(r.id);
    lectures += 1;
    ficheJouee = null;
    try {
      const res: any = await api.playRadio(r.id, zid);
      // Zone navigateur : le serveur n'a pas de sortie audio, c'est la page
      // qui doit lire le flux qu'il renvoie.
      // rc4 : seulement si c'est la zone de CET appareil (pas celle d'un téléphone).
      if (estZoneJouableIci($currentZone) && res?.stream_url) browserPlay(res.stream_url, false, zid);
      // web#2144 : zone navigateur d'un autre appareil — le dire, proposer de la jouer ici.
      else if (res?.stream_url) {
        const url = res.stream_url as string;
        signalerZoneNavigateurJoueeAilleurs($currentZone, () => browserPlay(url, true, zid));
      }
    } catch {
      error = $t('v2.radio.playFailed' as any).replace('{name}', r.name);
    }
  }

  // `e` n'est plus nécessaire : `PochetteActions` arrête déjà le geste.
  async function toggleFav(r: RadioStation) {
    if (r.id == null) return;
    try {
      const up = await api.updateRadio(r.id, { favorite: !r.favorite });
      radios = radios.map((x) => (x.id === up.id ? up : x));
    } catch { /* le serveur signale déjà l'échec */ }
  }

  /**
   * La deuxième ligne de la vignette : « genre · pays ». Retour de Rémi sur
   * la rc12 (go de Bertrand du 17/11) : deux lignes sous le logo, le nom puis
   * genre et pays ; le format du flux (#863, #5716) quitte la vignette, c'est
   * du « clutter » pour des stations qu'on connaît.
   */
  function sousTitre(r: RadioStation): string {
    const rayon = radioGenreRayon(r);
    return [rayon ? libelle(rayon) : null, pays(r) || null].filter(Boolean).join(' · ');
  }
</script>

<!-- Recette rc12 (14/11) : la liste « Pays », rendue par RadioFiltresAvances après ses boutons. -->
{#snippet listePays()}
  {#if paysDeMesRadios.length > 1}
    <span class="rfp-tete">{$t('v2.radio.country' as any)}</span>
    <select class="choix" data-testid="radio-pays" bind:value={paysChoisi} aria-label={$t('v2.radio.country' as any)}>
      <option value={null}>{$t('v2.radio.dir.allCountries' as any)}</option>
      {#each paysDeMesRadios as [code, n] (code)}
        <option value={code}>{nomDuPays(code, $locale, code)} ({n})</option>
      {/each}
    </select>
  {/if}
{/snippet}

<section class="v2-radios tune-v2">
  <!-- En-tête partagé (`styles/tune-v2.css`). L'ordre est le même sur tous les
       écrans : titre, RECHERCHE, actions secondaires, action primaire. Ici la
       recherche passait APRÈS le bouton « Nouvelle station ». -->
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.radio.eyebrow' as any)}</div>
      <h1>{$t('v2.radio.title' as any)}</h1>
    </div>
  </header>

  <!-- Retour de Rémi sur la rc12 (go de Bertrand du 17/11) : UN seul
       ascenseur pour toute la page, « Dernières écoutées » comprises. Elles
       restaient au-dessus de la zone qui défile, et sur un 13 pouces il ne
       restait qu'une petite bande pour faire défiler « Mes radios ». -->
  <div class="scroll" bind:this={defilement} onscroll={() => { if (section === 'annuaire') defilementAnnuaire = defilement?.scrollTop ?? defilementAnnuaire; }}>
    <!-- Retour de Rémi sur la rc11 (point 1) : « Dernières écoutées » dans
         « Mes radios » seulement, pas dans l'Annuaire. -->
    {#if section === 'mes' && recentesUniques.length}
      <section class="sec recentes" class:depliee={recentesDepliees}>
        <div class="sec-tete">
          <h2>{$t('v2.radio.lastPlayed' as any)}</h2>
          <button class="v2-btn plus" aria-expanded={recentesDepliees}
            onclick={() => (recentesDepliees = !recentesDepliees)}>
            {$t((recentesDepliees ? 'common.showLess' : 'common.showMore') as any)}
            <ChevronRight aria-hidden="true" class={recentesDepliees ? 'tourne' : ''} />
          </button>
        </div>
        <div class="grid" class:rangee={!recentesDepliees}>
          {#each recentesUniques as r (r.id)}
            {@render tile(r)}
          {/each}
        </div>
      </section>
    {/if}

    <!-- #6516 — la liste personnelle, ou l'annuaire complet. Retour de Rémi
         sur la rc11 (point 4) : « Nouvelle station » quitte l'en-tête, réservé
         aux recherches, et se range ici en quatrième case, discrète (sans fond
         vert). C'est un bouton qui ouvre le choix, pas un onglet. -->
    <div class="sections">
      <div class="onglets" role="tablist">
        <button class="v2-btn" class:on={section === 'mes'} role="tab" aria-selected={section === 'mes'}
          onclick={() => ouvrirSection('mes')}>{$t('v2.radio.tabMine' as any)}</button>
        <button class="v2-btn" class:on={section === 'annuaire'} role="tab" aria-selected={section === 'annuaire'}
          onclick={() => ouvrirSection('annuaire')}>{$t('v2.radio.tabDirectory' as any)}</button>
        {#if CARTE_VISIBLE}
          <button class="v2-btn" class:on={section === 'carte'} role="tab" aria-selected={section === 'carte'}
            onclick={() => ouvrirSection('carte')}>{$t('v2.radio.tabMap' as any)}</button>
        {/if}
      </div>
      <button class="v2-btn nouvelle" class:occupe={importEnCours} aria-haspopup="dialog"
        onclick={() => (choixNouvelle = true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        {$t('v2.radio.create' as any)}
      </button>
    </div>
    <PaysEcouteRadios mode="radios" />

    <!-- La recherche et les genres, au MÊME endroit que dans « Annuaire ». -->
    {#if section === 'mes'}
      <!-- web#3176 (Jean Valjean, fil 2881) — recherche, filtres et genres
           restent en haut pendant le défilement des stations : en-tête
           COLLANT dans `.scroll`, sur le fond de l'écran. -->
      <div class="entete-collant" data-testid="radio-entete-collant">
        <div class="filtres ligne">
          <RadioRecherche bind:valeur={q} />
          <!-- Harmonisation rc14 (maquette radios.html) : recherche, segment
               « Toutes les stations / Favoris », bouton « Filtres » (pastille
               du nombre de filtres actifs), puis le compte, sur UNE ligne. Le
               panneau regroupe pays, format, qualité, sans perte, haute
               qualité et Metadata+. -->
          <div class="segment" role="tablist" data-testid="radio-segment">
            <button role="tab" class:on={!segment.surFavoris} aria-selected={!segment.surFavoris}
              data-testid="radio-segment-all" onclick={() => (ongletFavoris = false)}>
              {$t('v2.radio.allStations' as any)} <span class="rn">{shown.length}</span>
            </button>
            <button role="tab" class:on={segment.surFavoris} aria-selected={segment.surFavoris}
              data-testid="radio-segment-favoris" disabled={!segment.favoris.length} onclick={() => (ongletFavoris = true)}>
              <Heart aria-hidden="true" />{$t('nav.favorites' as any)} <span class="rn">{segment.favoris.length}</span>
            </button>
          </div>
          <RadioFiltresAvances disposition="panneau" avecFavoris={false} total={segment.liste.length} pays={listePays}
            actifsEcran={paysChoisi ? 1 : 0} onEffacer={() => (paysChoisi = null)} />
        </div>
        {#if showFilters && rayons.length}
          <div class="filtres genres">
            <RadioChipsGenres
              genres={rayons.map(({ rayon, n }) => ({ cle: rayon.key, libelle: libelle(rayon), n }))}
              choisi={genre} total={shown.length} onChoisir={(c) => (genre = c)} />
          </div>
        {/if}
      </div>
    {/if}
    {#if section === 'carte'}
      <CarteRadios
        onAjoutee={stationAjoutee}
        enDirect={ficheJouee}
        onJoue={(id) => { ficheJouee = id; playingId = null; }}
      />
    {:else if section === 'annuaire'}
      <RadioAnnuaire
        bind:q={qAnnuaire} bind:pays={paysAnnuaire} bind:genre={genreAnnuaire}
        limiteInitiale={nombreAnnuaire} onCharge={annuaireCharge}
        onAjoutee={stationAjoutee}
        onRetiree={(id) => { radios = radios.filter((x) => x.id !== id); }}
        enDirect={ficheJouee}
        titreEnCours={titreEnCours}
        onJoue={(id) => { ficheJouee = id; playingId = null; }}
      />
    {:else if loading}
      <div class="state">{$t('v2.radio.loading' as any)}</div>
    {:else if error}
      <div class="state err">{error}</div>
    {:else if !radios.length}
      <div class="state">{$t('v2.radio.none' as any)}</div>
    {:else if !shown.length}
      <div class="state">{$t('v2.radio.noMatch' as any)}</div>
    {:else}
      <!-- 🔴 #863 — favoris et toutes les stations ne défilent plus ensemble :
           le segment de la ligne des outils choisit la liste (rc14). -->
      {@const sections = sectionsRadio(segment.liste, recentes)}
      <!-- web#2716 — une même station peut figurer dans « Dernières écoutées »
           et dans « Mes radios ». web#2783 : la première est rendue plus
           haut, hors de la liste filtrée. -->
      {#if sections.mes.length}
        <section class="sec mesradios">
          <h2>{$t('v2.radio.tabMine' as any)}</h2>
          <div class="grid">
            {#each sections.mes as r (r.id)}
              {@render tile(r)}
            {/each}
          </div>
        </section>
      {:else}
        <div class="state">{$t('v2.radio.noMatch' as any)}</div>
      {/if}
    {/if}
  </div>

  {#if choixNouvelle}
    <RadioNouvelleStationModale
      onClose={() => (choixNouvelle = false)}
      onAnnuaire={() => { choixNouvelle = false; ouvrirSection('annuaire'); }}
      onSaisie={nouvelleStation}
      onImporter={importerM3u} />
  {/if}

  {#if enFiche}
    <RadioFicheModale
      station={enFiche}
      onClose={() => (enFiche = null)}
      onLue={({ idMienne }) => { if (idMienne != null) { playingId = idMienne; lectures += 1; } ficheJouee = null; }}
      onChange={(maj) => { radios = radios.map((x) => (x.id === maj.id ? { ...x, ...maj } : x)); }}
    />
  {/if}

  {#if enEdition}
    {@const cible = enEdition}
    <RadioEditModale
      radio={cible}
      onClose={() => (enEdition = null)}
      onSaved={(maj) => {
        // Une station CRÉÉE n'est dans aucune ligne à remplacer : elle rejoint
        // la liste. Sans ce cas, le `map` ne trouverait rien et la nouvelle
        // station n'apparaîtrait qu'au prochain chargement de l'écran.
        radios = cible.id == null
          ? [...radios, maj]
          : radios.map((x) => (x.id === maj.id ? { ...x, ...maj } : x));
        enEdition = null;
      }}
      onDeleted={(id) => { radios = radios.filter((x) => x.id !== id); enEdition = null; }}
    />
  {/if}
</section>

{#snippet tile(r: RadioStation)}
  <div class="st" class:live={playingId === r.id}>
    <span class="cv">
      <!-- Le MÊME composant que les pochettes d'album : une seule apparence de
           cœur dans toute l'interface. La radio avait le sien — rond, en haut à
           droite, d'une autre couleur — et deux cœurs différents se lisent
           comme deux choses différentes (Bertrand, 02/09/2026).
           Son favori ne vit pas dans `favorites` mais dans sa propre table,
           d'où `favoriExterne` : même apparence, bascule propre. -->
      <PochetteActions
        favoriExterne={r.id != null
          ? { actif: !!r.favorite, basculer: () => toggleFav(r) }
          : null}
        onEditer={r.id != null ? () => (enEdition = r) : null}
        onRetirer={r.id != null && estDeLAnnuaire(r) ? () => retirer(r) : null}
        libelleRetirer={$t('v2.radio.removeFromMine' as any)}
        onLire={() => play(r)}
        onOuvrir={r.id != null ? () => (enFiche = r) : () => play(r)}
        objet={r.id != null ? objetRadio(r) : null}
        nom={r.name}
      >
        <!-- #6516 — le logo de la fiche d'annuaire quand la station n'en a pas.
             rc14 : sans logo du tout, une pochette générée aux couleurs de
             Tune plutôt qu'une grande lettre seule. -->
        {#if logoDeStation(r)}
          <AlbumArt coverPath={logoDeStation(r)} albumId={null} size={0} alt={r.name} fallbackInitials={r.name?.slice(0,1)} />
        {:else}
          <PochetteRadioGeneree nom={r.name} />
        {/if}
      </PochetteActions>
    </span>
    <span class="nm-ligne">
      <!-- web#2770 (lot 4) — « ouvrir » OUVRE la fiche de la station, il ne
           la lance plus ; le nom est ce lien. La lecture reste sur ▶. -->
      <span class="nm" use:bulleTexte><LienEntite entite={{ type: 'radio', nom: r.name, ouvrir: r.id != null ? () => (enFiche = r) : null }} /></span>
      <!-- web#2443 — la station a une clé radio-metadata.fr. -->
      <!-- rc14 : réduit à une petite étiquette grise, l'explication en infobulle. -->
      {#if aMetadataPlus(r)}<span class="mdp-icone" role="img" data-testid="radio-mdp-icone" aria-label={$t('v2.radio.metadataPlus' as any)} title={$t('v2.radio.metadataPlusTip' as any)}><Tag aria-hidden="true" /></span>{/if}
      <!-- web#2795 — repère discret : la station de l'annuaire est modifiée
           chez soi (nom, logo ou flux). -->
      {#if r.surcharge_locale}<span class="surch" role="img" aria-label={$t('v2.radio.overridden' as any)} title={$t('v2.radio.overridden' as any)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z"/></svg></span>{/if}
    </span>
    <!-- Retour de Rémi sur la rc12 : la deuxième et dernière ligne, genre et
         pays. Le format du flux (#863, #5716) n'est plus sur la vignette.
         Pendant l'écoute, le titre qui passe prend cette ligne, comme dans
         l'Annuaire : toujours deux lignes. -->
    {#if playingId === r.id && titreEnCours}<span class="encours" use:bulleTexte>{titreEnCours}</span>
    {:else if sousTitre(r)}<span class="gn" data-testid="radio-sous-titre" use:bulleTexte>{sousTitre(r)}</span>{/if}
  </div>
{/snippet}

<style>
  /*
   * Harmonisation de l'interface (rc14, maquette `radios.html` validée par
   * Bertrand le 26/11) : une hauteur de commande (36 px), des puces de 32 px ;
   * tailles, rayons, graisses et polices lus dans `fondations.css`, couleurs
   * dans `--v2-*`. Aucune couleur, taille ou police écrite en dur.
   */
  /* #6516 — Mes radios / Annuaire, puis « Nouvelle station ». */
  .sections{display:flex; flex-wrap:wrap; gap:8px; padding:6px 30px 12px}
  .onglets{display:flex; gap:8px}
  .sections .v2-btn{height:36px; padding:0 16px; font-size:var(--taille-5)}
  .sections .v2-btn.on{border-color:var(--v2-acc1); color:var(--v2-acc1); background:var(--v2-active1)}
  /* La quatrième case : discrète, sans fond, au même gabarit que les onglets. */
  .nouvelle{display:inline-flex; align-items:center; gap:6px; background:transparent; color:var(--v2-txt2)}
  .nouvelle svg{width:14px; height:14px}
  .surch{display:inline-flex; flex:none; color:var(--v2-txt3)}
  .surch svg{width:11px; height:11px}
  /* rc14 : Metadata+ n'est plus qu'une petite étiquette grise. */
  .mdp-icone{display:inline-flex; flex:none; color:var(--v2-txt3); opacity:.8}
  .mdp-icone :global(svg){width:12px; height:12px}
  .encours{margin-top:2px; font:var(--taille-3) var(--police-texte); color:var(--v2-acc2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  /* « Dernières lues » : UNE seule rangée, quelle que soit la largeur. */
  .grid.rangee{grid-template-rows:auto; grid-auto-rows:0; row-gap:0; overflow:hidden}
  /* Les vignettes des rangées repliées (hauteur 0) débordaient sur la première
     à 390 px : leurs noms s'affichaient par-dessus. */
  .rangee .st{min-height:0; overflow:hidden}
  .recentes{padding-bottom:4px; flex:none}
  .sec-tete{display:flex; align-items:center; gap:12px; padding-bottom:12px}
  .sec-tete h2{padding-bottom:0}
  .sec-tete .plus{margin-left:auto; height:32px; padding:0 8px 0 12px; gap:4px; border-color:transparent; font-size:var(--taille-4)}
  .sec-tete .plus :global(svg){width:14px; height:14px; transition:transform .15s}
  .sec-tete .plus :global(svg.tourne){transform:rotate(90deg)}
  /* Dépliée, la rangée défile avec la page (un seul ascenseur, rc12). */
  .filtres{padding:4px 30px 10px}
  /* web#3176 — l'en-tête collant : au-dessus des vignettes (leurs gestes
     montent à z-index 2), sur le fond de l'écran dans les deux thèmes. */
  .entete-collant{position:sticky; top:0; z-index:5; background:var(--v2-bg); box-shadow:0 1px 0 var(--v2-line2)}
  .entete-collant .genres{padding-top:2px; padding-bottom:12px}
  /* La ligne des outils : recherche, segment, « Filtres », compte. Elle est
     positionnée : sur écran étroit, le panneau « Filtres » en prend la largeur. */
  .filtres.ligne{position:relative; display:flex; flex-wrap:wrap; gap:10px; align-items:center}
  .filtres.ligne :global(.v2-rech){width:380px; flex:0 1 380px}
  .filtres.ligne :global(.v2-rech input){height:36px}
  .segment{display:inline-flex; align-items:center; gap:2px; padding:2px; height:36px; box-sizing:border-box;
    border:1px solid var(--v2-line2); border-radius:var(--rayon-plein); background:var(--v2-surface2)}
  .segment button{display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 14px; border:0; cursor:pointer;
    border-radius:var(--rayon-plein); background:transparent; color:var(--v2-txt2); white-space:nowrap;
    font:var(--graisse-forte) var(--taille-4) var(--police-texte)}
  .segment button :global(svg){width:14px; height:14px}
  .segment button:hover:not(:disabled){color:var(--v2-txt)}
  .segment button:disabled{opacity:.45; cursor:default}
  .segment button.on{background:var(--v2-active1); color:var(--v2-txt)}
  .segment button:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:1px}
  .rn{font:var(--taille-2) var(--police-chiffres); color:var(--v2-txt3)}
  /* La liste « Pays » du panneau « Filtres ». */
  .choix{width:100%; height:36px; background:var(--v2-surface2); color:var(--v2-txt); border:1px solid var(--v2-line2);
    border-radius:var(--rayon-2); padding:0 12px; font:var(--taille-4) var(--police-texte)}
  @media (max-width: 640px){
    .filtres.ligne :global(.v2-rech){width:auto; flex:1 1 100%}
  }

  .v2-radios{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--police-texte); overflow:hidden}

  .scroll{flex:1; overflow-y:auto; padding:4px 0 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-scrollthumb, var(--v2-line2)); border-radius:var(--rayon-2)}
  .state{padding:30px; color:var(--v2-txt3)} .state.err{color:var(--v2-danger)}
  .sec{padding:8px 30px 18px}
  .sec h2{font:var(--graisse-forte) var(--taille-6) var(--police-texte); padding-bottom:12px}
  .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:16px}

  .st{position:relative; display:flex; flex-direction:column; min-width:0}
  .cv{position:relative; display:block; aspect-ratio:1; border-radius:var(--rayon-2); overflow:hidden;
    box-shadow:var(--v2-sh-card); transition:.18s}
  /* Survol : un liseré d'accent, comme Radio Classique dans la maquette. Un
     calque AU-DESSUS de la pochette et de ses gestes : un `outline` ou une
     ombre intérieure seraient peints sous l'image. */
  .cv::after{content:""; position:absolute; inset:0; z-index:3; border-radius:inherit; pointer-events:none;
    box-shadow:inset 0 0 0 2px var(--v2-acc1); opacity:0}
  .st:hover .cv::after, .st:focus-within .cv::after{opacity:1}
  .nm-ligne{display:flex; align-items:center; gap:6px; min-width:0; margin-top:8px}
  .nm-ligne .nm{margin-top:0; min-width:0}
  .nm{font:var(--graisse-forte) var(--taille-4) var(--police-texte); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .gn{margin-top:2px; font:var(--taille-3) var(--police-texte); color:var(--v2-txt3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  @media (max-width: 640px){
    .sec, .filtres, .sections{padding-left:16px; padding-right:16px}
    .grid{grid-template-columns:repeat(auto-fill,minmax(110px,1fr)); gap:12px}
  }
</style>
