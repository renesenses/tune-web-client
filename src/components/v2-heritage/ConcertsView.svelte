<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import * as api from '../../lib/api';
  import { refusConcerts, type RefusConcerts } from '../../lib/concertsRefus';
  import { concertsCharge, concertsAttendRedemarrage } from '../../lib/stores/concerts';
  import { activeView } from '../../lib/stores/navigation';
  import { v2SettingsTarget } from '../../lib/stores/v2SettingsNav';
  import { preferences } from '../../lib/stores/preferences';
  import { grouperConcerts, normaliserTriConcerts, type TriConcerts } from '../../lib/concertsTri';

  // L'écran répond à une question, une seule : « les artistes que j'écoute
  // jouent-ils près de chez moi ? » — demande de FabienM et Didier, fil 1540.
  //
  // ⚠️ LE FILTRE EST GRADUÉ, PAS BINAIRE. Les grands groupes ne passent que
  // dans les grandes villes : un rayon strict masquerait précisément les têtes
  // d'affiche, et la fonction paraîtrait cassée. Trois crans, du plus étroit au
  // plus large, et « pays » par défaut — une liste vide se lit « il n'y a
  // rien », pas « le filtre est trop serré ».

  let chargement = $state(false);
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
  let pays = $state('FR');
  let localisee = $state<boolean | null>(null);
  let enregistrement = $state(false);

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

  async function ouvrir() {
    await charger();
    // Un refus vaut pour toutes les routes du greffon : inutile de le récolter
    // une seconde fois (et un second bandeau).
    if (!refus) await lireLocalisation();
  }

  /** Pré-remplir la commune, le code postal et le périmètre enregistrés. */
  async function lireLocalisation() {
    try {
      const l = await api.getLocalisationConcerts();
      if (!l) return;
      if (l.scope) perimetre = l.scope;
      if (l.radius_km) rayon = l.radius_km;
      if (l.city && l.city !== '—') commune = l.city;
      if (l.postal_code) codePostal = l.postal_code;
      if (l.country) pays = l.country;
      // Ne pas écraser le verdict plus frais de `upcoming` : la liste vient
      // d'être servie, c'est elle qui dit si le rayon s'applique.
      if (typeof l.located === 'boolean' && localisee === null) localisee = l.located;
      if (typeof l.ambiguous === 'boolean') ambigue = l.ambiguous;
    } catch (e) {
      const r = refusConcerts(e);
      if (r) refus = r;
      else if ((e as api.ApiError)?.status === 404) serveurTropAncien = true;
      // Toute autre erreur : on garde les valeurs de `upcoming`, rien à dire.
    }
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

  async function charger() {
    chargement = true;
    anomalie = '';
    try {
      const reponse = await api.getConcertsAVenir();
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
      if (reponse.country) pays = reponse.country;
      // Un code d'anomalie est traduisible ; une phrase du serveur ne l'est pas.
      if (reponse.code) anomalie = reponse.code;
    } catch (e) {
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
      chargement = false;
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
    try {
      const reponse = await api.setLocalisationConcerts({
        city: commune.trim() || '—',
        postal_code: codePostal.trim() || null,
        country: pays.trim().toUpperCase(),
        scope: vise,
        radius_km: rayon,
      });
      perimetre = reponse.scope;
      localisee = reponse.located ?? null;
      ambigue = reponse.ambiguous === true;
      perimetreApplique = null;
      refus = null;
      await charger();
    } catch (e) {
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

  /** Réglages ▸ Système ▸ Cloud, où vit le bouton de connexion du compte. */
  function ouvrirCompte() {
    v2SettingsTarget.set({ tab: 'system', section: 'cloud' });
    activeView.set('settings');
  }

  function dateLisible(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
  }
</script>

<div class="cc">
  <header class="cc-tete">
    <h2>{$t('concerts.titre')}</h2>
    <p class="cc-sous">{$t('concerts.sousTitre')}</p>
  </header>

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
    <!-- Décision du 25/09/2026 : pas de version réduite. Un refus clair, et
         aucune liste — ni vide, ni partielle. -->
    <div class="cc-encart cc-refus" data-refus={refus}>
      <p>{$t('concerts.premiumRequis')}</p>
      {#if refus === 'compte'}
        <p class="cc-note">{$t('concerts.compteNonRelie')}</p>
        <button class="cc-principal" onclick={ouvrirCompte}>{$t('concerts.relierCompte')}</button>
      {:else}
        <a class="cc-principal" href="https://mozaiklabs.fr/pricing" target="_blank" rel="noopener">
          {$t('concerts.decouvrirPremium')}
        </a>
      {/if}
    </div>
  {:else}
    {#if serveurTropAncien}
      <p class="cc-note cc-attention cc-trop-ancien">{$t('concerts.serveurTropAncien')}</p>
    {:else}
    <section class="cc-perimetre">
      <div class="cc-crans">
        <!-- Le cran AFFICHÉ actif est celui qui filtre vraiment : un rayon
             sans commune localisée n'est pas « Autour de moi ». -->
        <button class:actif={cranAffiche === 'radius'} onclick={choisirRayon}>
          {$t('concerts.autourDeMoi')}
        </button>
        <button class:actif={cranAffiche === 'country'} onclick={() => enregistrerLocalisation('country')}>
          {$t('concerts.dansMonPays')}
        </button>
        <button class:actif={cranAffiche === 'world'} onclick={() => enregistrerLocalisation('world')}>
          {$t('concerts.partout')}
        </button>
      </div>

      {#if perimetre === 'radius'}
        <div class="cc-commune">
          <input
            type="text"
            bind:value={commune}
            placeholder={$t('concerts.communePlaceholder')}
            aria-label={$t('concerts.commune')}
          />
          <input
            type="text"
            class="cc-cp"
            class:cc-a-preciser={ambigue}
            aria-invalid={ambigue ? 'true' : undefined}
            bind:value={codePostal}
            placeholder={$t('concerts.codePostalPlaceholder')}
            aria-label={$t('concerts.codePostal')}
          />
          <select bind:value={rayon} class:cc-inactif={rayonInactif} aria-label={$t('concerts.rayon')}>
            {#each api.RAYONS_CONCERTS as km (km)}
              <option value={km}>{km} km</option>
            {/each}
          </select>
          <button class="cc-principal" disabled={enregistrement} onclick={() => enregistrerLocalisation()}>
            {$t('concerts.appliquer')}
          </button>
        </div>
        <!-- La commune n'est JAMAIS déduite : le serveur connaît pourtant des
             coordonnées tirées de l'adresse IP, qui derrière un VPN désignent
             un autre pays. -->
        <p class="cc-note">{$t('concerts.communeSaisieNote')}</p>
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

    {#if chargement}
      <p class="cc-muet">{$t('concerts.chargement')}</p>
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
      {#if total !== null}
        <!-- « 100 sur 187 » : la liste peut ne pas tout montrer, et c'est
             désormais dit (tune-server-rust#5369). -->
        <p class="cc-note cc-compte">
          {$t('concerts.nSurTotal').replace('{n}', String(concerts.length)).replace('{total}', String(total))}
        </p>
      {/if}
      <div class="cc-tri" role="group" aria-label={$t('concerts.trier')}>
        <button class:actif={tri === 'artiste'} onclick={() => choisirTri('artiste')}>
          {$t('concerts.triArtiste')}
        </button>
        <button class:actif={tri === 'date'} onclick={() => choisirTri('date')}>
          {$t('concerts.triDate')}
        </button>
      </div>
      <ul class="cc-liste" class:cc-par-date={tri === 'date'}>
        {#each groupes as groupe (groupe.cle)}
          <li>
            <h3>{groupe.artiste}</h3>
            <ul class="cc-dates">
              {#each groupe.concerts as date (date.event_date + (date.venue ?? '') + (date.city ?? ''))}
                <li>
                  <span class="cc-date">{dateLisible(date.event_date)}</span>
                  <span class="cc-lieu">
                    {date.city ?? ''}{date.venue ? ` — ${date.venue}` : ''}
                  </span>
                  {#if date.event_url}
                    <a href={date.event_url} target="_blank" rel="noopener">{$t('concerts.billets')}</a>
                  {/if}
                </li>
              {/each}
            </ul>
          </li>
        {/each}
      </ul>
      {#if resteAVoir}
        <button class="cc-principal cc-plus" disabled={suiteEnCours} onclick={chargerPlus}>
          {$t('concerts.plus')}
        </button>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .cc { padding: 1rem; max-width: 60rem; margin: 0 auto; }
  .cc-tete h2 { margin: 0 0 0.25rem; }
  .cc-sous { color: var(--text-muted, #888); margin: 0 0 1.5rem; }
  .cc-encart { background: var(--tune-surface); padding: 1rem; border-radius: 8px; }
  .cc-principal {
    display: inline-block; margin-top: 0.75rem; padding: 0.45rem 1rem;
    border-radius: 6px; background: var(--accent, #2b7); color: #fff; text-decoration: none;
  }
  .cc-perimetre { margin: 0 0 1.5rem; }
  .cc-crans { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .cc-crans button { padding: 0.4rem 0.9rem; border-radius: 999px; }
  .cc-crans button.actif { background: var(--accent, #2b7); color: #fff; }
  .cc-commune { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0.75rem 0 0.25rem; }
  .cc-commune input { flex: 1; min-width: 8rem; padding: 0.5rem 0.75rem; border-radius: 6px; }
  .cc-commune .cc-cp { flex: 0 0 6rem; min-width: 5rem; }
  .cc-note { color: var(--text-muted, #888); font-size: 0.875rem; margin: 0.35rem 0; }
  .cc-attention { color: var(--warning, #d99a2b); }
  .cc-inactif { opacity: 0.55; }
  .cc-commune .cc-a-preciser { outline: 2px solid var(--warning, #d99a2b); }
  .cc-erreur { color: var(--danger, #e05252); }
  .cc-muet, .cc-vide { color: var(--text-muted, #888); }
  .cc-tri { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0 0 0.75rem; }
  .cc-tri button { padding: 0.35rem 0.85rem; border-radius: 999px; }
  .cc-tri button.actif { background: var(--accent, #2b7); color: #fff; }
  .cc-liste { list-style: none; padding: 0; margin: 0; }
  /* Une ligne par concert : le nom d'artiste se répète, et la séparation
     serrée évite qu'une liste chronologique ne s'étire sur trois écrans. */
  .cc-liste.cc-par-date > li { padding: 0.35rem 0; }
  .cc-liste > li { padding: 0.75rem 0; border-bottom: 1px solid var(--tune-border); }
  .cc-liste h3 { margin: 0 0 0.35rem; font-size: 1rem; }
  .cc-dates { list-style: none; padding: 0; margin: 0; }
  .cc-dates li { display: flex; gap: 0.75rem; flex-wrap: wrap; padding: 0.15rem 0; }
  .cc-date { font-variant-numeric: tabular-nums; min-width: 6.5rem; }
  .cc-lieu { color: var(--text-muted, #aaa); }
  /* Monté DANS la coquille v2 (phase 5, lot 4) : la grappe de lecture est en
     position absolue au-dessus des écrans ; sans cette réserve, la barre
     d'outils de l'écran passerait dessous (garde `gouttiereGrappe`). */
  .cc {
    padding-right: var(--v2-grappe-w, 172px);
    /* 🔴 Bertrand, 27/09/2026 : « on ne peut pas scroller vers le bas ».
       La coquille met `.main` en `overflow:hidden` et n'accorde
       `overflow-y:auto` qu'à un enfant de classe `.dash` (`ShellV2:911,923`) —
       sa seule autre règle, `.main > :global(*)`, ne donne que le
       dimensionnement flex. Chaque écran porte donc son propre défilement, et
       celui-ci était le SEUL des neuf écrans hérités montés par la coquille à
       n'en avoir aucun : la phase 5 lui a bien ajouté la réserve de la grappe
       juste au-dessus, et a oublié le reste.
       `min-height:0` est indispensable : sans lui, un enfant de flex refuse de
       rétrécir sous sa hauteur de contenu et le débordement ne défile pas. */
    min-height: 0;
    overflow-y: auto;
  }
</style>
