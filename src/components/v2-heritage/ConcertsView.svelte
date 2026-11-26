<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { t, tn, locale } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import * as api from '../../lib/api';
  import { refusConcerts, type RefusConcerts } from '../../lib/concertsRefus';
  import { concertsCharge, concertsAttendRedemarrage } from '../../lib/stores/concerts';
  import { activeView } from '../../lib/stores/navigation';
  import { preferences } from '../../lib/stores/preferences';
  import { grouperConcerts, normaliserTriConcerts, type TriConcerts } from '../../lib/concertsTri';
  import { PAYS_PAR_DEFAUT, codeDePays, optionsDePays } from '../../lib/concertsPays';
  import { creerArret, estArret } from '../../lib/rechercheArretable';
  import { PLUS_TARD, communeEnregistree, lieuDejaApplique, normaliserChoixLieu, normaliserLieuConcerts } from '../../lib/concertsLieu';
  import { artists as artistesBibliotheque } from '../../lib/stores/library';
  import {
    blocDate, casseDeTitre, cleArtiste, filtrerPays, grouperParMois, indexImagesArtistes, initiales, teinteDe,
  } from '../../lib/concertsAffichage';
  import ChoixConcerts from './concerts/ChoixConcerts.svelte';
  import { bulleTexte } from '../../lib/infobulleTexte';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import Globe from '@lucide/svelte/icons/globe';
  import Ticket from '@lucide/svelte/icons/ticket';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';

  // L'écran répond à une question, une seule : « les artistes que j'écoute
  // jouent-ils près de chez moi ? » — demande de FabienM et Didier, fil 1540.
  //
  // ⚠️ LE FILTRE EST GRADUÉ, PAS BINAIRE. Les grands groupes ne passent que
  // dans les grandes villes : un rayon strict masquerait précisément les têtes
  // d'affiche, et la fonction paraîtrait cassée. Trois crans, du plus étroit au
  // plus large, et « pays » par défaut — une liste vide se lit « il n'y a
  // rien », pas « le filtre est trop serré ».

  let chargement = $state(false);
  /** #1752 — la recherche en cours, qu'on peut arrêter ; et le fait qu'elle
   *  l'ait été, pour le dire au lieu d'un « indisponible ». */
  const arret = creerArret();
  let arretee = $state(false);
  /** Refus d'offre : `premium` (module non possédé, 402) ou `compte` (compte
   *  Mozaiklabs non relié). Voir `lib/concertsRefus.ts`. */
  let refus = $state<RefusConcerts>(null);
  /** Le serveur ne connaît pas `/ext/concerts/location` (≤ v0.9.165) : la
   *  liste reste lisible, mais la commune et le périmètre ne se règlent pas. */
  let serveurTropAncien = $state(false);
  let anomalie = $state('');
  let concerts = $state<api.Concert[]>([]);

  let perimetre = $state<api.PerimetreConcerts>('country');
  let rayon = $state<number>(100);
  let commune = $state('');
  let codePostal = $state('');
  // Fil forum 2150 : le pays se CHOISIT (sélecteur ci-dessous). Il valait
  // `'FR'` sans champ pour le changer, si bien qu'une commune suisse partait
  // au géocodeur avec `country=FR` et que « Dans mon pays » montrait la France.
  let pays = $state(PAYS_PAR_DEFAUT);
  let optionsPays = $derived(optionsDePays($locale, pays));
  let localisee = $state<boolean | null>(null);
  let enregistrement = $state(false);
  /** web#1755 — ce profil n'a encore rien dit et le serveur ne garde aucune
   *  commune : l'écran DEMANDE où l'on habite et jusqu'où l'on va. */
  let aDemander = $state(false);

  /** Le périmètre qui a VRAIMENT filtré la liste (`applied_scope`), s'il est
   *  connu. `perimetre` reste le choix, qui pré-remplit le formulaire : un
   *  rayon sans commune localisée retombe sur le pays (tune-server-rust#5368). */
  let perimetreApplique = $state<api.PerimetreConcerts | null>(null);
  /** Le nom saisi désigne plusieurs communes : demander le code postal. */
  let ambigue = $state(false);
  /** `total` et `has_more` de la réponse. `null` / `false` sur un serveur
   *  ancien, qui ne les rend pas : l'écran se tait alors, comme avant
   *  (tune-server-rust#5369). */
  let total = $state<number | null>(null);
  let resteAVoir = $state(false);
  let suiteEnCours = $state(false);

  /** « Autour de moi » ne s'affiche actif que si le rayon s'applique VRAIMENT.
   *  Commune non localisée : le cran effectivement appliqué est le pays. */
  let rayonInactif = $derived(perimetre === 'radius' && localisee === false);
  let cranAffiche = $derived<api.PerimetreConcerts>(
    rayonInactif ? (perimetreApplique ?? 'country') : perimetre,
  );

  /** L'ordre choisi. « Par date » PAR DÉFAUT depuis le 29/09/2026
   *  (web#1718) : les plus proches d'abord, la demande de FabienM (fil 2013,
   *  point 1). Tant que rien n'est choisi, la préférence vaut `null` et le
   *  défaut s'applique ICI — il n'est jamais écrit comme un choix. */
  let tri = $derived(normaliserTriConcerts($preferences.concertsTri));

  /** Le tri lui-même vit dans `lib/concertsTri.ts` : une fonction pure, qui se
   *  mesure sur des listes et non sur la lecture de ce gabarit. */
  let groupes = $derived(grouperConcerts(concerts, tri));

  /** Retenu comme tous les choix d'affichage des écrans voisins — dans les
   *  préférences synchronisées, pas dans un `localStorage` à part. */
  function choisirTri(vise: TriConcerts) {
    preferences.update((p) => ({ ...p, concertsTri: vise }));
  }

  /** Proposer d'élargir n'a de sens que s'il reste un cran au-dessus. */
  let cranPlusLarge = $derived<api.PerimetreConcerts | null>(
    perimetre === 'radius' ? 'country' : perimetre === 'country' ? 'world' : null,
  );

  onMount(() => {
    // Ne RIEN demander tant que le routeur du greffon n'est pas monté : sans ce
    // garde, l'écran tire sur `/api/v1/ext/concerts/…` et récolte le 404 nu
    // d'axum, que l'utilisateur voit tel quel (leçon de Bandcamp, #1768).
    if (!$concertsCharge) return;
    void ouvrir();
  });

  /**
   * web#1755 — la localisation est lue AVANT la recherche (route locale,
   * rapide) : la commune enregistrée pré-remplit l'écran même quand le nuage
   * tarde, et l'écran sait s'il doit poser la question ou rejouer le choix de
   * CE profil (`lib/concertsLieu.ts`).
   */
  async function ouvrir() {
    const lue = await lireLocalisation();
    // Un refus vaut pour toutes les routes du greffon : inutile de le récolter
    // une seconde fois (et un second bandeau).
    if (refus) return;
    const choix = normaliserChoixLieu($preferences.concertsLieu);
    if (lue && !serveurTropAncien) {
      if (choix && choix !== PLUS_TARD && !lieuDejaApplique(choix, lue)) {
        // Un autre profil a réglé le serveur : rejouer celui-ci. La recherche
        // suit l'enregistrement (`enregistrerLocalisation` → `charger`).
        perimetre = choix.scope;
        commune = choix.city;
        codePostal = choix.postal_code ?? '';
        if (codeDePays(choix.country)) pays = codeDePays(choix.country)!;
        rayon = choix.radius_km;
        await enregistrerLocalisation(choix.scope);
        return;
      }
      if (!choix) {
        // Une commune déjà enregistrée (avant ce réglage par profil) est
        // reprise telle quelle : on ne redemande pas ce qui a été dit.
        if (communeEnregistree(lue.city)) retenirLieu(lue.scope ?? perimetre);
        else aDemander = true;
      }
    }
    await charger();
    if (lue && !refus) appliquerLocalisation(lue);
  }

  /** Retenir, pour CE profil, le périmètre et la commune affichés. */
  function retenirLieu(scope: api.PerimetreConcerts) {
    const lieu = normaliserLieuConcerts({
      scope, city: commune.trim(), postal_code: codePostal.trim() || null,
      country: pays.trim().toUpperCase(), radius_km: rayon,
    });
    if (lieu) preferences.update((p) => ({ ...p, concertsLieu: lieu }));
  }

  /** « Pas maintenant » : le comportement d'avant (pays ou Partout, ce que
   *  le serveur applique), sans rien envoyer — et la question ne revient pas
   *  à chaque ouverture. */
  function passerLaQuestion() {
    aDemander = false;
    preferences.update((p) => ({ ...p, concertsLieu: PLUS_TARD }));
  }

  /** Pré-remplir la commune, le code postal et le périmètre enregistrés. */
  async function lireLocalisation(): Promise<api.LocalisationConcerts | null> {
    try {
      const l = await api.getLocalisationConcerts();
      if (!l) return null;
      appliquerLocalisation(l);
      return l;
    } catch (e) {
      const r = refusConcerts(e);
      if (r) refus = r;
      else if ((e as api.ApiError)?.status === 404) serveurTropAncien = true;
      // Toute autre erreur : on garde les valeurs de `upcoming`, rien à dire.
      return null;
    }
  }

  /** Les valeurs de `GET /location` dans le formulaire. Appliquées une seconde
   *  fois APRÈS la recherche (`ouvrir`) : elles priment sur celles de
   *  `upcoming`, comme quand elles étaient lues après elle. */
  function appliquerLocalisation(l: api.LocalisationConcerts) {
    if (l.scope) perimetre = l.scope;
    if (l.radius_km) rayon = l.radius_km;
    if (l.city && l.city !== '—') commune = l.city;
    if (l.postal_code) codePostal = l.postal_code;
    if (codeDePays(l.country)) pays = codeDePays(l.country)!;
    // Ne pas écraser le verdict plus frais de `upcoming` : la liste vient
    // d'être servie, c'est elle qui dit si le rayon s'applique.
    if (typeof l.located === 'boolean' && localisee === null) localisee = l.located;
    if (typeof l.ambiguous === 'boolean') ambigue = l.ambiguous;
  }

  function lirePage(reponse: api.ConcertsAVenir) {
    total = typeof reponse.total === 'number' ? reponse.total : null;
    resteAVoir = reponse.has_more === true;
  }

  /** La page suivante, à la suite de celles déjà affichées. Demandée
   *  seulement si la réponse a dit `has_more` : un serveur ancien ignore
   *  `offset` et renverrait la même liste. */
  async function chargerPlus() {
    if (!resteAVoir || suiteEnCours) return;
    suiteEnCours = true;
    try {
      const reponse = await api.getConcertsAVenir({ offset: concerts.length });
      concerts = [...concerts, ...(reponse.concerts ?? [])];
      lirePage(reponse);
    } catch {
      notifications.error($t('concerts.indisponible'));
    } finally {
      suiteEnCours = false;
    }
  }

  /** #1752 — « Arrêter » : abandonne la requête en vol, rend la main tout de
   *  suite. Quitter l'écran fait de même (`onDestroy`). */
  function arreterRecherche() {
    arret.arreter();
    chargement = false;
    enregistrement = false;
    arretee = true;
  }
  onDestroy(() => { arret.arreter(); });

  async function charger() {
    const signal = arret.nouveau();
    chargement = true;
    arretee = false;
    anomalie = '';
    try {
      const reponse = await api.getConcertsAVenir({}, signal);
      concerts = reponse.concerts ?? [];
      lirePage(reponse);
      refus = null;
      if (reponse.scope) perimetre = reponse.scope;
      // Champs du lot `batch/fix-5369-20260929`. Absents d'un serveur ancien :
      // rien ne change alors, `localisee` garde ce que dit `/location`.
      if (reponse.applied_scope) perimetreApplique = reponse.applied_scope;
      if (typeof reponse.located === 'boolean') localisee = reponse.located;
      if (reponse.radius_km) rayon = reponse.radius_km;
      if (reponse.city) commune = reponse.city;
      if (codeDePays(reponse.country)) pays = codeDePays(reponse.country)!;
      // Un code d'anomalie est traduisible ; une phrase du serveur ne l'est pas.
      if (reponse.code) anomalie = reponse.code;
    } catch (e) {
      // #1752 — arrêtée par l'utilisateur (ou remplacée par une recherche plus
      // récente) : ce n'est pas une panne, rien à afficher en rouge.
      if (estArret(e) || signal.aborted) return;
      // Un refus d'offre n'est pas une panne : l'écran se verrouille et dit ce
      // qu'il refuse, au lieu d'afficher une erreur rouge incompréhensible.
      const r = refusConcerts(e);
      if (r) {
        refus = r;
        concerts = [];
        return;
      }
      // 429 du nuage : `concerts.rate_limited`, qui se dit autrement qu'une panne.
      anomalie = (e as api.ApiError)?.code === 'concerts.rate_limited'
        ? 'concerts.rate_limited'
        : 'concerts.unavailable';
    } finally {
      // Une recherche abandonnée ne touche plus à l'écran : celle qui l'a
      // remplacée, ou « Arrêter », en a déjà la charge.
      if (!signal.aborted) chargement = false;
    }
  }

  /** « Autour de moi » ne fait qu'ouvrir la saisie : c'est « Appliquer » qui
   *  enregistre. Passer par `enregistrerLocalisation('radius')` refusait le
   *  clic tant que la commune était vide — et la commune ne se saisit que
   *  dans le bloc rayon, qui ne s'ouvrait donc jamais. */
  function choisirRayon() {
    if (serveurTropAncien) return;
    perimetre = 'radius';
  }

  async function enregistrerLocalisation(nouveauPerimetre?: api.PerimetreConcerts) {
    if (serveurTropAncien) return;
    const vise = nouveauPerimetre ?? perimetre;
    // Le rayon est le seul cran qui exige une commune : « pays » et « partout »
    // n'ont besoin d'aucun géocodage, et restent donc disponibles même si le
    // géocodeur est injoignable.
    if (vise === 'radius' && !commune.trim()) {
      notifications.error($t('concerts.communeRequise'));
      return;
    }
    enregistrement = true;
    arretee = false;
    const signal = arret.nouveau();
    try {
      const reponse = await api.setLocalisationConcerts({
        city: commune.trim() || '—',
        postal_code: codePostal.trim() || null,
        country: pays.trim().toUpperCase(),
        scope: vise,
        radius_km: rayon,
      }, signal);
      perimetre = reponse.scope;
      localisee = reponse.located ?? null;
      ambigue = reponse.ambiguous === true;
      perimetreApplique = null;
      refus = null;
      // web#1755 — le choix accepté est celui de CE profil.
      aDemander = false;
      retenirLieu(reponse.scope ?? vise);
      await charger();
    } catch (e) {
      if (estArret(e) || signal.aborted) return;
      const r = refusConcerts(e);
      if (r) {
        refus = r;
        concerts = [];
        return;
      }
      // Serveur antérieur à la route : on le dit une fois, à l'écran, au lieu
      // d'un « échec d'enregistrement » qui ferait réessayer en vain.
      if ((e as api.ApiError)?.status === 404) {
        serveurTropAncien = true;
        return;
      }
      notifications.error($t(cleEchecLocalisation(e as api.ApiError)));
    } finally {
      enregistrement = false;
    }
  }

  /** La phrase d'un échec de `POST /location`, par le code du serveur (lot
   *  `batch/concerts-greffon-20260925`) : 422 `concerts.invalid_location`
   *  (+ `field`), 409 `concerts.no_instance_id`, 429 `concerts.rate_limited`,
   *  502 `concerts.unavailable`. Jamais la phrase du serveur. */
  function cleEchecLocalisation(err: api.ApiError | undefined) {
    const corps = (err?.corps ?? null) as { field?: unknown } | null;
    switch (err?.code) {
      case 'concerts.invalid_location':
        return corps?.field === 'city' ? 'concerts.communeInvalide' : 'concerts.localisationInvalide';
      case 'concerts.no_instance_id':
        return 'concerts.pasDInstance';
      case 'concerts.rate_limited':
        return 'concerts.tropDeDemandes';
      case 'concerts.unavailable':
        return 'concerts.indisponible';
      default:
        return 'concerts.enregistrementEchoue';
    }
  }

  // ── Présentation harmonisée (rc14, maquette `concerts.html`) ──────────────
  // Les calculs vivent dans `lib/concertsAffichage.ts` ; ici, seulement le
  // branchement sur l'état de l'écran.

  /** Les options des deux listes au style Tune, à la place des `<select>`. */
  let choixPays = $derived(optionsPays.map((o) => ({ valeur: o.code, libelle: o.nom })));
  const choixRayons = api.RAYONS_CONCERTS.map((km) => ({ valeur: km as number, libelle: `${km} km` }));
  const filtrerChoixPays = (opts: { valeur: string; libelle: string }[], q: string) =>
    filtrerPays(opts.map((o) => ({ ...o, code: o.valeur, nom: o.libelle })), q)
      .map(({ valeur, libelle }) => ({ valeur, libelle }));

  /** Les blocs affichés : par mois (« Par date ») ou par artiste. La colonne de
   *  gauche porte le titre du bloc et son compte ; chaque concert est une carte. */
  interface Bloc { cle: string; titre: string; concerts: api.Concert[]; cles: string[] }
  let blocs = $derived.by<Bloc[]>(() => {
    if (tri === 'date') {
      const liste = groupes.flatMap((g) => g.concerts);
      const cles = groupes.flatMap((g) => g.cles);
      return grouperParMois(liste, cles, $locale).map((m) => ({
        cle: m.cle, titre: m.libelle || $t('concerts.sansDate'), concerts: m.concerts, cles: m.cles,
      }));
    }
    return groupes.map((g) => ({ cle: g.cle, titre: g.artiste, concerts: g.concerts, cles: g.cles }));
  });

  /** web#rc14 — la photo de l'artiste vient de la bibliothèque (image déjà
   *  connue du serveur), sinon les initiales. Lue dans le magasin des artistes
   *  s'il est rempli, sinon demandée UNE fois, après la première liste : un
   *  échec ne coûte que les photos. */
  let imagesArtistes = $state<Map<string, string>>(new Map());
  let imagesDemandees = false;
  async function chargerImagesArtistes() {
    if (imagesDemandees) return;
    imagesDemandees = true;
    try {
      const deja = $artistesBibliotheque;
      const liste = deja.length > 0 ? deja : await api.getAllArtists();
      imagesArtistes = indexImagesArtistes(liste);
    } catch {
      // Rien à dire : les initiales tiennent lieu de photo.
    }
  }
  $effect(() => {
    if (concerts.length > 0) void chargerImagesArtistes();
  });
  const imageDe = (nom: string) => imagesArtistes.get(cleArtiste(nom)) ?? null;

  /** « Montmorot · Juraparc » — la salle en casse de titre si le nuage l'écrit en capitales. */
  function lieuDe(c: api.Concert): string {
    return [casseDeTitre(c.city, $locale), casseDeTitre(c.venue, $locale)].filter(Boolean).join(' · ');
  }
</script>

<!-- `tune-v2` : racine d’écran V2, comme les autres écrans de la coquille —
     les règles communes de l’en-tête (`.v2-top`, flèches à gauche) s’y appliquent. -->
<div class="cc tune-v2">
  <!-- rc14 — l'en-tête commun des écrans V2 (`.v2-top`, gouttière de la
       grappe comprise) : sur-titre, titre et sous-titre alignés à gauche, à la
       place de la colonne étroite centrée. -->
  <header class="v2-top cc-tete">
    <div class="v2-titres">
      <div class="v2-eyebrow cc-surtitre">{$t('concerts.surtitre')}</div>
      <h1>{$t('concerts.titre')}</h1>
      <p class="cc-sous">{$t('concerts.sousTitre')}</p>
    </div>
  </header>

  <div class="cc-corps">
  {#if !$concertsCharge}
    <!-- Le greffon n'est pas monté. On explique le geste plutôt que de faire
         disparaître une fonction qu'on vient d'annoncer dans le menu. -->
    <div class="cc-encart">
      {#if $concertsAttendRedemarrage}
        <p>{$t('concerts.attendRedemarrage')}</p>
      {:else}
        <p>{$t('concerts.greffonAInstaller')}</p>
        <button class="cc-principal" onclick={() => activeView.set('plugins')}>
          {$t('concerts.ouvrirGestionnaire')}
        </button>
      {/if}
    </div>
  {:else if refus}
    <!-- tune-server-rust#7865 : les concerts ne sont plus Premium. Seul un
         serveur d'avant (rc10) refuse encore ; on lui dit de se mettre à
         jour, sans renvoyer vers l'offre. Aucune liste, ni vide ni partielle. -->
    <div class="cc-encart cc-refus" data-refus={refus}>
      <p>{$t('concerts.serveurAMettreAJour')}</p>
    </div>
  {:else}
    {#if serveurTropAncien}
      <p class="cc-note cc-attention cc-trop-ancien">{$t('concerts.serveurTropAncien')}</p>
    {:else if aDemander}
      <!-- web#1755 (fil 2028) : la première question de l'écran est celle de
           son titre — où j'habite, jusqu'où j'irais. « Pas maintenant » garde
           le comportement d'avant (pays ou Partout). -->
      <section class="cc-perimetre cc-question">
        <p class="cc-question-titre">{$t('concerts.questionLieu')}</p>
        <div class="cc-formulaire cc-commune">
          <label class="cc-champ cc-champ-commune">
            <span class="cc-champ-pre">{$t('concerts.commune')}</span>
            <input
              type="text"
              bind:value={commune}
              placeholder={$t('concerts.communePlaceholder')}
              aria-label={$t('concerts.commune')}
            />
          </label>
          <label class="cc-champ cc-champ-cp">
            <span class="cc-champ-pre">{$t('concerts.codePostal')}</span>
            <input
              type="text"
              class="cc-cp"
              bind:value={codePostal}
              aria-label={$t('concerts.codePostal')}
            />
          </label>
          <div class="cc-pays">
            <ChoixConcerts
              options={choixPays}
              bind:valeur={pays}
              libelle={$t('concerts.pays')}
              recherche={$t('concerts.chercherPays')}
              aucun={$t('concerts.aucunPays')}
              filtrer={filtrerChoixPays}
            />
          </div>
          <div class="cc-rayon">
            <ChoixConcerts options={choixRayons} bind:valeur={rayon} libelle={$t('concerts.rayon')} chiffres />
          </div>
        </div>
        <div class="cc-question-actions">
          <button class="cc-principal" disabled={enregistrement} onclick={() => enregistrerLocalisation('radius')}>
            {$t('concerts.appliquer')}
          </button>
          <button class="cc-secondaire cc-pas-maintenant" disabled={enregistrement} onclick={passerLaQuestion}>
            {$t('concerts.pasMaintenant')}
          </button>
        </div>
        <p class="cc-note cc-aide">{$t('concerts.communeSaisieNote')}</p>
      </section>
    {:else}
    <section class="cc-perimetre">
      <div class="cc-crans">
        <!-- Le cran AFFICHÉ actif est celui qui filtre vraiment : un rayon
             sans commune localisée n'est pas « Autour de moi ». -->
        <button class="cc-pastille" class:actif={cranAffiche === 'radius'} aria-pressed={cranAffiche === 'radius'} onclick={choisirRayon}>
          <MapPin size={16} aria-hidden="true" />{$t('concerts.autourDeMoi')}
        </button>
        <button class="cc-pastille" class:actif={cranAffiche === 'country'} aria-pressed={cranAffiche === 'country'} onclick={() => enregistrerLocalisation('country')}>
          {$t('concerts.dansMonPays')}
        </button>
        <button class="cc-pastille" class:actif={cranAffiche === 'world'} aria-pressed={cranAffiche === 'world'} onclick={() => enregistrerLocalisation('world')}>
          <Globe size={16} aria-hidden="true" />{$t('concerts.partout')}
        </button>
      </div>

      {#if perimetre !== 'world'}
        <!-- Une seule ligne, tous les champs à 36 px, libellé DANS le champ :
             Pays, Commune, Code postal, Rayon, puis Appliquer. -->
        <div class="cc-formulaire">
          <!-- Fil forum 2150 : le pays de la commune ET de « Dans mon pays ».
               Changé sous « Dans mon pays », il s'applique aussitôt ; sous
               « Autour de moi », avec la commune, par « Appliquer ». -->
          <div class="cc-pays">
            <ChoixConcerts
              options={choixPays}
              bind:valeur={pays}
              libelle={$t('concerts.pays')}
              recherche={$t('concerts.chercherPays')}
              aucun={$t('concerts.aucunPays')}
              filtrer={filtrerChoixPays}
              disabled={enregistrement}
              onchoisir={() => { if (perimetre === 'country') void enregistrerLocalisation('country'); }}
            />
          </div>
          {#if perimetre === 'radius'}
            <div class="cc-commune">
              <label class="cc-champ cc-champ-commune">
                <span class="cc-champ-pre">{$t('concerts.commune')}</span>
                <input
                  type="text"
                  bind:value={commune}
                  placeholder={$t('concerts.communePlaceholder')}
                  aria-label={$t('concerts.commune')}
                />
              </label>
              <label class="cc-champ cc-champ-cp" class:cc-a-preciser={ambigue}>
                <span class="cc-champ-pre">{$t('concerts.codePostal')}</span>
                <input
                  type="text"
                  class="cc-cp"
                  aria-invalid={ambigue ? 'true' : undefined}
                  bind:value={codePostal}
                  aria-label={$t('concerts.codePostal')}
                />
              </label>
              <div class="cc-rayon">
                <ChoixConcerts
                  options={choixRayons}
                  bind:valeur={rayon}
                  libelle={$t('concerts.rayon')}
                  inactif={rayonInactif}
                  chiffres
                />
              </div>
              <button class="cc-principal" disabled={enregistrement} onclick={() => enregistrerLocalisation()}>
                {$t('concerts.appliquer')}
              </button>
            </div>
          {/if}
        </div>
      {/if}

      {#if perimetre === 'country'}
        <!-- Fil 2150 (#5807) : un seul pays par instance côté nuage. Pour
             deux pays voisins, c'est le rayon qu'il faut. -->
        <p class="cc-note cc-aide cc-pays-voisins">{$t('concerts.paysVoisinsNote')}</p>
      {/if}

      {#if perimetre === 'radius'}
        <!-- Une seule ligne d'aide : la commune n'est JAMAIS déduite (le
             serveur connaît des coordonnées tirées de l'adresse IP, qui
             derrière un VPN désignent un autre pays), et le rayon du nuage est
             une distance autour d'elle, sans filtre de pays (fil 2150, #5807). -->
        <p class="cc-note cc-aide cc-sans-frontiere">{$t('concerts.aideUneLigne')}</p>
        {#if ambigue && localisee !== false}
          <p class="cc-note cc-attention cc-ambigue">{$t('concerts.communeAmbigue')}</p>
        {/if}
      {/if}
      <!-- HORS du bloc « rayon » : l'avertissement doit rester lisible quel
           que soit le cran ouvert. ⚠️ Le nuage NE renvoie PAS `scope: country`
           quand la commune est introuvable : `scope` reste le choix
           enregistré (`radius`). C'est `located: false` — et, depuis le lot
           `batch/fix-5369-20260929`, `applied_scope` — qui le disent. -->
      {#if localisee === false}
        <p class="cc-note cc-attention cc-introuvable">{$t('concerts.communeIntrouvable')}</p>
        {#if rayonInactif}
          <p class="cc-note cc-attention cc-rayon-inactif">{$t('concerts.rayonInactif')}</p>
        {/if}
      {/if}
    </section>
    {/if}

    {#if chargement || enregistrement}
      <!-- #1752 — l'attente peut durer ~30 s (deux appels au nuage) : on peut
           l'arrêter, et la sortie de l'écran l'arrête aussi. -->
      <div class="cc-attente">
        <p class="cc-muet">{$t('concerts.chargement')}</p>
        <button class="cc-secondaire cc-arreter" onclick={arreterRecherche}>{$t('concerts.arreter')}</button>
      </div>
    {:else if arretee}
      <div class="cc-attente">
        <p class="cc-muet cc-arretee">{$t('concerts.rechercheArretee')}</p>
        <button class="cc-principal" onclick={() => void charger()}>{$t('concerts.relancer')}</button>
      </div>
    {:else if anomalie === 'concerts.rate_limited'}
      <p class="cc-muet cc-trop">{$t('concerts.tropDeDemandes')}</p>
    {:else if anomalie === 'concerts.no_instance_id'}
      <p class="cc-muet">{$t('concerts.pasDInstance')}</p>
    {:else if anomalie}
      <p class="cc-erreur">{$t('concerts.indisponible')}</p>
    {:else if concerts.length === 0}
      <div class="cc-vide">
        <p>{$t('concerts.aucun')}</p>
        <!-- Le geste utile quand la liste est vide n'est pas de recharger,
             c'est d'élargir. -->
        {#if cranPlusLarge && !serveurTropAncien}
          <button
            class="cc-principal"
            onclick={() => enregistrerLocalisation(cranPlusLarge ?? undefined)}
          >
            {cranPlusLarge === 'country' ? $t('concerts.elargirAuPays') : $t('concerts.elargirPartout')}
          </button>
        {/if}
      </div>
    {:else}
      <div class="cc-barre">
        {#if total !== null}
          <!-- « 100 sur 187 » : la liste peut ne pas tout montrer, et c'est
               désormais dit (tune-server-rust#5369). -->
          <p class="cc-compte">
            {$t('concerts.nSurTotal').replace('{n}', String(concerts.length)).replace('{total}', String(total))}
          </p>
        {/if}
        <div class="cc-tri" role="group" aria-label={$t('concerts.trier')}>
          <button class:actif={tri === 'date'} aria-pressed={tri === 'date'} onclick={() => choisirTri('date')}>
            <CalendarDays size={14} aria-hidden="true" />{$t('concerts.triDate')}
          </button>
          <button class:actif={tri === 'artiste'} aria-pressed={tri === 'artiste'} onclick={() => choisirTri('artiste')}>
            {$t('concerts.triArtiste')}
          </button>
        </div>
      </div>
      <!-- Un bloc par mois (« Par date ») ou par artiste : son titre et son
           compte à gauche, une carte par concert à droite. -->
      <ul class="cc-liste" class:cc-par-date={tri === 'date'}>
        {#each blocs as bloc (bloc.cle)}
          <li class="cc-bloc">
            <h3>{bloc.titre}</h3>
            <span class="cc-bloc-n">{$tn('concerts.nConcertsMois', bloc.concerts.length)}</span>
            <ul class="cc-dates">
              {#each bloc.concerts as date, i (bloc.cles[i])}
                {@const jour = blocDate(date.event_date, $locale)}
                {@const image = imageDe(date.artist_name)}
                <li class="cc-carte">
                  <time class="cc-date" datetime={date.event_date}>
                    {#if jour}
                      <span class="cc-date-j">{jour.jour}</span>
                      <span class="cc-date-m">{jour.mois}</span>
                      <span class="cc-date-s">{jour.semaine}</span>
                    {:else}
                      <span class="cc-date-s">{date.event_date}</span>
                    {/if}
                  </time>
                  <div class="cc-photo cc-teinte-{teinteDe(date.artist_name)}">
                    {#if image}
                      <AlbumArt coverPath={image} size={0} vignette recadrer alt="" fallbackInitials={initiales(date.artist_name)} />
                    {:else}
                      <span class="cc-initiales" aria-hidden="true">{initiales(date.artist_name)}</span>
                    {/if}
                  </div>
                  <div class="cc-qui">
                    <span class="cc-artiste" use:bulleTexte>{date.artist_name}</span>
                    <span class="cc-lieu"><MapPin size={14} aria-hidden="true" /><span class="cc-lieu-txt" use:bulleTexte>{lieuDe(date)}</span></span>
                  </div>
                  {#if date.event_url}
                    <a class="cc-billets" href={date.event_url} target="_blank" rel="noopener">
                      <Ticket size={16} aria-hidden="true" /><span class="cc-billets-txt">{$t('concerts.billets')}</span>
                    </a>
                  {/if}
                </li>
              {/each}
            </ul>
          </li>
        {/each}
      </ul>
      {#if resteAVoir}
        <button class="cc-secondaire cc-plus" disabled={suiteEnCours} onclick={chargerPlus}>
          {$t('concerts.plus')}
        </button>
      {/if}
    {/if}
  {/if}
  </div>
</div>

<style>
  /* #6138 : `body` porte la couleur du thème HÉRITÉ, déjà calculée ; le pont
     `--tune-text: var(--v2-txt)` de `.tune-v2` ne la repeint pas. Sans cette
     ligne, artistes, dates et titre s'affichaient en quasi-noir sur le fond
     sombre du thème v2 (forum 2219). */
  .cc { color: var(--tune-text); font-family: var(--v2-sans); }
  /* Monté DANS la coquille v2 (phase 5, lot 4). 🔴 Bertrand, 27/09/2026 :
     « on ne peut pas scroller vers le bas ». La coquille met `.main` en
     `overflow:hidden` et n'accorde `overflow-y:auto` qu'à `.dash` : chaque
     écran porte donc son propre défilement. `min-height:0` est indispensable :
     sans lui, un enfant de flex refuse de rétrécir sous sa hauteur de contenu
     et le débordement ne défile pas. La gouttière de la grappe est réservée
     par l'en-tête commun `.v2-top` : sous lui, rien ne passe sous la grappe. */
  .cc {
    min-height: 0;
    overflow-y: auto;
  }

  /* ── En-tête (maquette : sur-titre 12/600 en capitales, titre 28/700) ── */
  /* La gouttière de la grappe, redite ici comme dans `.v2-top` : la garde
     `gouttiereGrappe` exige que chaque écran hérité la réserve lui-même. */
  .cc-tete { align-items: flex-start; padding-right: var(--v2-grappe-w, 172px); }
  .cc-surtitre {
    font-family: var(--v2-sans); font-size: var(--taille-3); font-weight: var(--graisse-forte);
    letter-spacing: .1em; text-transform: uppercase;
  }
  .cc-tete h1 { font-size: var(--taille-8); font-weight: var(--graisse-grasse); margin: 4px 0 0; }
  .cc-sous { color: var(--v2-txt3); font-size: var(--taille-5); margin: 4px 0 0; }
  .cc-corps { padding: 0 30px 40px; }

  /* ── Boutons et encarts ── */
  .cc-encart { background: var(--tune-surface); padding: 16px; border-radius: var(--rayon-3); }
  .cc-principal, .cc-secondaire {
    height: 36px; padding: 0 16px; border-radius: var(--rayon-plein); display: inline-flex;
    align-items: center; gap: 8px; font: inherit; font-size: var(--taille-4); font-weight: var(--graisse-forte);
    white-space: nowrap; cursor: pointer; text-decoration: none;
  }
  .cc-principal {
    background: linear-gradient(180deg, var(--v2-acc1), var(--v2-acc2)); border: 1px solid transparent;
    color: var(--couleur-sur-accent);
  }
  .cc-secondaire { background: transparent; border: 1px solid var(--v2-line2); color: var(--v2-txt); }
  .cc-secondaire:hover { background: var(--v2-hover); }
  .cc-principal:disabled, .cc-secondaire:disabled { opacity: .6; cursor: default; }
  .cc-encart .cc-principal, .cc-vide .cc-principal { margin-top: 12px; }
  .cc-plus { margin-top: 16px; }

  /* ── Périmètre : pastilles, formulaire en une ligne, aide en une ligne ── */
  .cc-perimetre { margin: 8px 0 0; }
  .cc-crans { display: flex; gap: 8px; flex-wrap: wrap; }
  .cc-pastille {
    height: 32px; padding: 0 12px; border-radius: var(--rayon-plein); display: inline-flex; align-items: center;
    gap: 6px; font: inherit; font-size: var(--taille-4); border: 1px solid var(--v2-line2);
    color: var(--v2-txt2); background: transparent; cursor: pointer; white-space: nowrap;
  }
  .cc-pastille:hover { background: var(--v2-hover); }
  .cc-pastille.actif {
    background: var(--v2-active1); border-color: color-mix(in srgb, var(--v2-acc1) 55%, transparent);
    color: var(--v2-acc1); font-weight: var(--graisse-forte);
  }
  .cc-formulaire { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 12px; }
  .cc-formulaire .cc-commune { display: contents; }
  .cc-pays { width: 210px; }
  .cc-rayon { width: 150px; }
  .cc-champ {
    height: 36px; border-radius: var(--rayon-plein); background: var(--v2-surface2);
    border: 1px solid var(--v2-line2); display: flex; align-items: center; gap: 8px; padding: 0 14px;
    color: var(--v2-txt); font-size: var(--taille-4); min-width: 0;
  }
  .cc-champ:focus-within { border-color: var(--v2-acc1); box-shadow: 0 0 0 3px var(--v2-focus); }
  .cc-champ-commune { width: 260px; }
  .cc-champ-cp { width: 150px; }
  .cc-champ-pre { color: var(--v2-txt3); font-size: var(--taille-3); font-weight: var(--graisse-forte); white-space: nowrap; }
  .cc-champ input {
    flex: 1; min-width: 0; width: 100%; background: none; border: 0; outline: none; padding: 0;
    color: var(--v2-txt); font: inherit; font-size: var(--taille-4);
  }
  .cc-champ input::placeholder { color: var(--v2-txt3); }
  .cc-a-preciser { border-color: var(--pal-alerte); }
  .cc-question-titre { font-weight: var(--graisse-forte); margin: 0 0 4px; }
  .cc-question-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 12px; }
  .cc-note { color: var(--tune-text-muted); font-size: var(--taille-3); margin: 8px 0 0; }
  .cc-aide { max-width: 88ch; }
  .cc-attention { color: var(--pal-alerte); }
  .cc-erreur { color: var(--couleur-danger); }
  .cc-muet, .cc-vide { color: var(--tune-text-muted); }
  .cc-attente { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 16px; }

  /* ── Barre de la liste : compte et sélecteur segmenté ── */
  .cc-barre {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 22px;
    padding-bottom: 12px; border-bottom: 1px solid var(--v2-line);
  }
  .cc-compte { margin: 0; font-size: var(--taille-4); color: var(--v2-txt2); }
  .cc-tri {
    margin-left: auto; display: inline-flex; padding: 3px; border-radius: var(--rayon-plein);
    background: var(--v2-surface2); border: 1px solid var(--v2-line);
  }
  .cc-tri button {
    height: 28px; padding: 0 12px; border-radius: var(--rayon-plein); display: inline-flex; align-items: center;
    gap: 6px; font: inherit; font-size: var(--taille-4); color: var(--v2-txt2); background: none; border: 0; cursor: pointer;
  }
  .cc-tri button.actif {
    background: var(--v2-surface); color: var(--v2-txt); font-weight: var(--graisse-forte);
    box-shadow: 0 1px 2px var(--v2-sh-sm, var(--voile-noir-40));
  }

  /* ── Blocs (mois ou artiste) et cartes ── */
  .cc-liste { list-style: none; padding: 0; margin: 14px 0 0; display: grid; row-gap: 12px; }
  .cc-bloc { display: grid; grid-template-columns: 130px 1fr; grid-template-rows: auto 1fr; column-gap: 0; }
  .cc-bloc h3 {
    grid-column: 1; grid-row: 1; margin: 0; padding-top: 14px; padding-right: 12px;
    font-size: var(--taille-5); font-weight: var(--graisse-forte); overflow-wrap: anywhere;
  }
  .cc-bloc-n {
    grid-column: 1; grid-row: 2; align-self: start; font-family: var(--v2-mono);
    font-size: var(--taille-3); color: var(--v2-txt3);
  }
  .cc-dates {
    grid-column: 2; grid-row: 1 / span 2; list-style: none; padding: 0; margin: 0;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr)); gap: 12px;
  }
  .cc-carte {
    display: flex; align-items: center; gap: 14px; padding: 10px 12px 10px 10px; min-width: 0;
    background: var(--v2-surface2); border: 1px solid var(--v2-line); border-radius: var(--rayon-3);
  }
  .cc-date {
    width: 52px; flex: none; text-align: center; padding-right: 12px; border-right: 1px solid var(--v2-line2);
    display: flex; flex-direction: column; align-items: center;
  }
  .cc-date-j { font-family: var(--v2-mono); font-size: var(--taille-7); font-weight: var(--graisse-grasse); line-height: 1; }
  .cc-date-m {
    font-size: var(--taille-2); font-weight: var(--graisse-forte); letter-spacing: .08em; color: var(--v2-acc1); margin-top: 4px;
  }
  .cc-date-s { font-size: var(--taille-2); color: var(--v2-txt3); }
  .cc-photo {
    width: 60px; height: 60px; flex: none; border-radius: var(--rayon-2); overflow: hidden;
    display: grid; place-items: end start;
    background: linear-gradient(135deg, var(--cc-teinte), color-mix(in srgb, var(--cc-teinte) 30%, var(--v2-bg)));
  }
  .cc-photo :global(img), .cc-photo :global(.placeholder) { width: 100%; height: 100%; object-fit: cover; }
  /* Cinq teintes tirées du thème, pour que deux vignettes voisines sans photo
     ne se confondent pas — aucune couleur écrite en dur. */
  .cc-teinte-0 { --cc-teinte: color-mix(in srgb, var(--v2-txt3) 55%, var(--v2-surface)); }
  .cc-teinte-1 { --cc-teinte: color-mix(in srgb, var(--v2-acc1) 45%, var(--v2-surface)); }
  .cc-teinte-2 { --cc-teinte: color-mix(in srgb, var(--v2-acc2) 35%, var(--v2-line2)); }
  .cc-teinte-3 { --cc-teinte: color-mix(in srgb, var(--v2-txt2) 35%, var(--v2-acc2)); }
  .cc-teinte-4 { --cc-teinte: color-mix(in srgb, var(--v2-line2) 70%, var(--v2-acc1)); }
  .cc-initiales {
    padding: 6px; font-size: var(--taille-2); font-weight: var(--graisse-grasse);
    color: var(--v2-txt); opacity: .8;
  }
  .cc-qui { min-width: 0; flex: 1; display: flex; flex-direction: column; }
  .cc-artiste {
    font-size: var(--taille-5); font-weight: var(--graisse-forte); color: var(--v2-txt);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cc-lieu {
    display: flex; align-items: center; gap: 4px; margin-top: 3px; font-size: var(--taille-4); min-width: 0;
  }
  .cc-lieu { color: var(--tune-text-muted); }
  .cc-lieu :global(svg) { flex: none; }
  .cc-lieu-txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  /* « Billets » : bouton SECONDAIRE gris (arbitrage de la maquette : sept
     boutons orange allumés n'en font ressortir aucun), lien externe. */
  .cc-billets {
    flex: none; height: 36px; padding: 0 14px; border-radius: var(--rayon-plein); display: inline-flex;
    align-items: center; gap: 8px; font-size: var(--taille-4); font-weight: var(--graisse-forte);
    white-space: nowrap; text-decoration: none; background: var(--v2-surface); border: 1px solid transparent;
  }
  .cc-billets { color: var(--v2-txt); }
  .cc-billets:hover { background: var(--v2-hover); border-color: var(--v2-line2); }
  .cc-billets:focus-visible { outline: 2px solid var(--v2-acc1); outline-offset: 2px; }

  /* ── Écran étroit (téléphone, 390 px) ── */
  @media (max-width: 720px) {
    .cc-corps { padding: 0 16px 32px; }
    .cc-pays, .cc-rayon, .cc-champ-commune, .cc-champ-cp { width: 100%; }
    .cc-formulaire .cc-principal { width: 100%; justify-content: center; }
    .cc-bloc { grid-template-columns: 1fr; grid-template-rows: auto; }
    .cc-bloc h3 { grid-row: 1; padding-top: 4px; display: inline; }
    .cc-bloc-n { grid-row: 2; margin-bottom: 8px; }
    .cc-dates { grid-column: 1; grid-row: 3; }
    .cc-carte { gap: 10px; }
    .cc-photo { width: 48px; height: 48px; }
    .cc-billets { width: 36px; padding: 0; justify-content: center; gap: 0; }
    .cc-billets-txt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .cc-tri { margin-left: 0; }
  }
</style>
