<script lang="ts">
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
   *   Avancé+   → pays affiché sur la vignette (#863 : Expert seul avant).
   *   Le codec, lui, se lit dès Essentiel (#5716).
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
  import { estDeLAnnuaire, dernieresLues, memoriserLecture } from '../../lib/mesRadios';
  import { dialogs } from '../../lib/stores/dialogs';
  import type { RadioStation } from '../../lib/types';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import RadioEditModale from './RadioEditModale.svelte';
  import RadioAnnuaire from './RadioAnnuaire.svelte';
  import PaysEcouteRadios from './PaysEcouteRadios.svelte';
  import CarteRadios from './CarteRadios.svelte';
  import RadioRecherche from './RadioRecherche.svelte';
  import RadioChipsGenres from './RadioChipsGenres.svelte';
  import RadioNouvelleStationModale from './RadioNouvelleStationModale.svelte';
  import RadioFicheModale from '../partages/RadioFicheModale.svelte';
  import BadgeMetadataPlus from '../partages/BadgeMetadataPlus.svelte';
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
  }
  const contexte = loadViewContext<ContexteRadios>('radios');
  onDestroy(() => saveViewContext('radios', { section, q, genre, ongletFavoris }));

  let radios = $state<RadioStation[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let q = $state(contexte?.q ?? '');
  let genre = $state<string | null>(contexte?.genre ?? null);
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
   */
  let section = $state<'mes' | 'annuaire' | 'carte'>(contexte?.section ?? 'mes');
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
   * pas. Même confirmation que la suppression d'une station saisie à la main.
   */
  async function retirer(r: RadioStation) {
    const id = r.id;
    if (id == null) return;
    if (!(await dialogs.confirm($t('v2.radio.removeConfirm' as any).replace('{name}', r.name), { danger: true }))) return;
    try {
      await api.deleteRadio(id);
      radios = radios.filter((x) => x.id !== id);
      notifications.success($t('v2.radio.removed' as any).replace('{name}', r.name));
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
  }

  /** Une station vient d'entrer dans « Mes radios » depuis l'annuaire. */
  function stationAjoutee(st: RadioStation) {
    radios = radios.some((x) => x.id === st.id)
      ? radios.map((x) => (x.id === st.id ? { ...x, ...st } : x))
      : [...radios, st];
  }

  /*
   * Importer / exporter une liste M3U — portés de l'ancien écran Radios, seul
   * à les offrir. L'export est la route elle-même, téléchargée par le lien.
   */
  let importEnCours = $state(false);
  async function importerM3u(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f || importEnCours) return;
    importEnCours = true;
    try {
      const r = await api.importRadios(f);
      notifications.success($t('radio.importResult' as any)
        .replace('{imported}', String(r.imported)).replace('{skipped}', String(r.skipped)));
      radios = (await api.getRadios({ limit: 500 })) ?? radios;
    } catch (err: any) {
      notifications.error(err?.message ?? $t('common.error' as any));
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
    if (v === 'mes' && section !== 'mes') charger(true);
    section = v;
  }

  /** Dernières stations lues — la première rangée de « Mes radios ». */
  let lectures = $state(0);
  const recentes = $derived.by(() => { void lectures; return dernieresLues(radios); });

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

  function matches(r: RadioStation): boolean {
    if (genre && radioGenreRayon(r)?.key !== genre) return false;
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
  const favorites = $derived(shown.filter((r) => r.favorite));
  const others = $derived(shown.filter((r) => !r.favorite));

  /**
   * web#2443 — la station de l'annuaire dont la fiche « Voir » est ouverte.
   * Une entrée de l'annuaire se VOIT (œil) ; une station saisie à la main se
   * modifie (crayon).
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
      error = `Lecture impossible : ${r.name}`;
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

  /** La pastille technique : le codec à tous les niveaux (#5716), le pays
   *  dès Avancé (#863). */
  function tech(r: RadioStation, avecPays: boolean): string {
    return [r.codec?.toUpperCase(), avecPays ? pays(r) : null].filter(Boolean).join(' · ');
  }
</script>

<section class="v2-radios tune-v2">
  <!-- En-tête partagé (`styles/tune-v2.css`). L'ordre est le même sur tous les
       écrans : titre, RECHERCHE, actions secondaires, action primaire. Ici la
       recherche passait APRÈS le bouton « Nouvelle station ». -->
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.radio.eyebrow' as any)}</div>
      <h1>{$t('v2.radio.title' as any)}</h1>
    </div>
    <div class="v2-actions">
      <!-- Import et export M3U concernent « Mes radios » seulement. -->
      {#if section === 'mes'}
        <label class="v2-btn" class:occupe={importEnCours}>
          {$t('radio.import' as any)}
          <input type="file" accept=".m3u,.m3u8,.pls" onchange={importerM3u} disabled={importEnCours} hidden />
        </label>
        <a class="v2-btn" href={api.exportRadiosUrl()} download="radios.m3u">{$t('radio.export' as any)}</a>
      {/if}
      <button class="v2-btn primaire" onclick={() => (choixNouvelle = true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        {$t('v2.radio.create' as any)}
      </button>
    </div>
  </header>

  <!-- #6516 — la liste personnelle, ou l'annuaire complet. -->
  <div class="sections" role="tablist">
    <button class="v2-btn" class:on={section === 'mes'} role="tab" aria-selected={section === 'mes'}
      onclick={() => ouvrirSection('mes')}>{$t('v2.radio.tabMine' as any)}</button>
    <button class="v2-btn" class:on={section === 'annuaire'} role="tab" aria-selected={section === 'annuaire'}
      onclick={() => ouvrirSection('annuaire')}>{$t('v2.radio.tabDirectory' as any)}</button>
    <button class="v2-btn" class:on={section === 'carte'} role="tab" aria-selected={section === 'carte'}
      onclick={() => ouvrirSection('carte')}>{$t('v2.radio.tabMap' as any)}</button>
  </div>
  <PaysEcouteRadios mode="radios" />

  <div class="scroll">
    <!-- La recherche et les genres, au MÊME endroit que dans « Annuaire ». -->
    {#if section === 'mes'}
      <div class="filtres"><RadioRecherche bind:valeur={q} /></div>
      {#if showFilters && rayons.length}
        <div class="filtres">
          <RadioChipsGenres
            genres={rayons.map(({ rayon, n }) => ({ cle: rayon.key, libelle: libelle(rayon), n }))}
            choisi={genre} total={shown.length} onChoisir={(c) => (genre = c)} />
        </div>
      {/if}
    {/if}
    {#if section === 'carte'}
      <CarteRadios
        onAjoutee={stationAjoutee}
        enDirect={ficheJouee}
        onJoue={(id) => { ficheJouee = id; playingId = null; }}
      />
    {:else if section === 'annuaire'}
      <RadioAnnuaire
        onAjoutee={stationAjoutee}
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
      <!-- 🔴 #863 — DEUX ONGLETS, et non plus deux sections qui défilent
           ensemble. L'onglet « Favoris » ne s'affiche que s'il y en a : un
           onglet vide serait pire que pas d'onglet. -->
      {#if favorites.length}
        <div class="ronglets" role="tablist">
          <button class="v2-btn" class:on={ongletFavoris} role="tab"
            aria-selected={ongletFavoris} onclick={() => (ongletFavoris = true)}>
            {$t('nav.favorites' as any)} <span class="rn">{favorites.length}</span>
          </button>
          <button class="v2-btn" class:on={!ongletFavoris} role="tab"
            aria-selected={!ongletFavoris} onclick={() => (ongletFavoris = false)}>
            {$t('v2.radio.allStations' as any)} <span class="rn">{shown.length}</span>
          </button>
        </div>
      {/if}
      {#if recentes.length && !q && !genre}
        <section class="sec recentes">
          <h2>{$t('v2.radio.lastPlayed' as any)}</h2>
          <div class="grid rangee">
            {#each recentes as r (r.id)}
              {@render tile(r)}
            {/each}
          </div>
        </section>
      {/if}
      {@const liste = favorites.length && ongletFavoris ? favorites : shown}
      {#if !liste.length}
        <div class="state">{$t('v2.radio.noMatch' as any)}</div>
      {:else}
        <section class="sec">
          <div class="grid">
            {#each liste as r (r.id)}
              {@render tile(r)}
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </div>

  {#if choixNouvelle}
    <RadioNouvelleStationModale
      onClose={() => (choixNouvelle = false)}
      onAnnuaire={() => { choixNouvelle = false; ouvrirSection('annuaire'); }}
      onSaisie={nouvelleStation} />
  {/if}

  {#if enFiche}
    <RadioFicheModale
      station={enFiche}
      onClose={() => (enFiche = null)}
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
        onEditer={r.id != null && !estDeLAnnuaire(r) ? () => (enEdition = r) : null}
        onVoir={r.id != null && estDeLAnnuaire(r) ? () => (enFiche = r) : null}
        libelleVoir={$t('v2.radio.view' as any)}
        onRetirer={r.id != null && estDeLAnnuaire(r) ? () => retirer(r) : null}
        libelleRetirer={$t('v2.radio.removeFromMine' as any)}
        onLire={() => play(r)}
        onOuvrir={() => play(r)}
        nom={r.name}
      >
        <!-- #6516 — le logo de la fiche d'annuaire quand la station n'en a pas. -->
        <AlbumArt coverPath={r.logo_url || r.annuaire?.logo_url || null} albumId={null} size={0} alt={r.name} fallbackInitials={r.name?.slice(0,1)} />
      </PochetteActions>
    </span>
    <span class="nm-ligne">
      <span class="nm" use:bulleTexte>{r.name}</span>
      <!-- web#2443 — la station a une clé radio-metadata.fr. -->
      {#if aMetadataPlus(r)}<BadgeMetadataPlus />{/if}
    </span>
    {#if playingId === r.id && titreEnCours}<span class="encours" use:bulleTexte>{titreEnCours}</span>{/if}
    {#if radioGenreRayon(r)}<span class="gn" use:bulleTexte>{libelle(radioGenreRayon(r)!)}</span>{/if}
    <!-- #863 — Jean Valjean : « pouvoir voir le format d'émission ». Le codec
         existait, réservé à Expert ; il s'est lu dès Avancé, comme les filtres.
         #5716 (décision du 07/10) : il se lit dès Essentiel. Le pays reste
         réservé à Avancé. -->
    {#if tech(r, showFilters)}<span class="tk">{tech(r, showFilters)}</span>{/if}
  </div>
{/snippet}

<style>
  /* #863 — les onglets Favoris / Toutes, et la vue en liste. */
  .ronglets{display:flex; gap:8px; padding:0 30px 12px}
  /* #6516 — Mes radios / Annuaire. */
  .sections{display:flex; gap:8px; padding:0 30px 10px}
  .sections .v2-btn.on{border-color:var(--v2-acc1); color:var(--v2-acc1)}
  .encours{margin-top:2px; font:11px var(--v2-sans); color:var(--v2-acc2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ronglets .rn{font:11px var(--v2-mono); opacity:.7; margin-left:5px}
  /* « Dernières lues » : UNE seule rangée, quelle que soit la largeur. */
  .rangee{grid-template-rows:auto; grid-auto-rows:0; row-gap:0; overflow:hidden}
  .recentes{padding-bottom:4px}
  .filtres{padding:4px 30px 10px}

  .v2-radios{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}

  .scroll{flex:1; overflow-y:auto; padding:4px 0 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:30px; color:var(--v2-txt3)} .state.err{color:var(--v2-danger)}
  .sec{padding:8px 30px 18px}
  .sec h2{font-size:17px; font-weight:700; padding-bottom:14px}
  .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:20px}

  .st{position:relative; display:flex; flex-direction:column}
  .open{position:absolute; inset:0; z-index:1; border:0; background:transparent; cursor:pointer; border-radius:var(--v2-r-card)}
  .open:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
  .cv{position:relative; display:block; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden;
    box-shadow:var(--v2-sh-card); transition:.18s}
  .st:hover .cv{box-shadow:0 10px 24px var(--v2-glow)}
  .nm-ligne{display:flex; align-items:center; gap:6px; min-width:0; margin-top:9px}
  .nm-ligne .nm{margin-top:0; min-width:0}
  .nm{margin-top:9px; font:600 13px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .gn{margin-top:2px; font:11px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .tk{margin-top:2px; font:9.5px var(--v2-mono); color:var(--v2-acc2)}
  .fav{position:absolute; top:8px; right:8px; z-index:2; width:30px; height:30px; border-radius:50%; cursor:pointer;
    border:0; background:rgba(0,0,0,.45); color:#fff; display:grid; place-items:center; opacity:0; transition:.16s}
  .st:hover .fav, .fav.on{opacity:1}
  .fav.on{color:var(--v2-acc1)}
  .fav svg{width:15px; height:15px}
</style>
