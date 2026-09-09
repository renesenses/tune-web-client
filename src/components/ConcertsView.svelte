<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n';
  import { notifications } from '../lib/stores/notifications';
  import * as api from '../lib/api';
  import { estRefusPremium } from '../lib/premiumRefus';
  import { concertsCharge, concertsAttendRedemarrage } from '../lib/stores/concerts';
  import { activeView } from '../lib/stores/navigation';

  // L'écran répond à une question, une seule : « les artistes que j'écoute
  // jouent-ils près de chez moi ? » — demande de FabienM et Didier, fil 1540.
  //
  // ⚠️ LE FILTRE EST GRADUÉ, PAS BINAIRE. Les grands groupes ne passent que
  // dans les grandes villes : un rayon strict masquerait précisément les têtes
  // d'affiche, et la fonction paraîtrait cassée. Trois crans, du plus étroit au
  // plus large, et « pays » par défaut — une liste vide se lit « il n'y a
  // rien », pas « le filtre est trop serré ».

  let chargement = $state(false);
  let refusePremium = $state(false);
  let anomalie = $state('');
  let concerts = $state<api.Concert[]>([]);

  let perimetre = $state<api.PerimetreConcerts>('country');
  let rayon = $state<number>(100);
  let commune = $state('');
  let codePostal = $state('');
  let pays = $state('FR');
  let localisee = $state<boolean | null>(null);
  let enregistrement = $state(false);

  /** Les concerts groupés par artiste : c'est ainsi que l'utilisateur les
   *  cherche — il part de ce qu'il écoute, pas d'une date. */
  let parArtiste = $derived.by(() => {
    const groupes = new Map<string, api.Concert[]>();
    for (const c of concerts) {
      const liste = groupes.get(c.artist_name) ?? [];
      liste.push(c);
      groupes.set(c.artist_name, liste);
    }
    return [...groupes.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  });

  /** Proposer d'élargir n'a de sens que s'il reste un cran au-dessus. */
  let cranPlusLarge = $derived<api.PerimetreConcerts | null>(
    perimetre === 'radius' ? 'country' : perimetre === 'country' ? 'world' : null,
  );

  onMount(() => {
    // Ne RIEN demander tant que le routeur du greffon n'est pas monté : sans ce
    // garde, l'écran tire sur `/api/v1/ext/concerts/…` et récolte le 404 nu
    // d'axum, que l'utilisateur voit tel quel (leçon de Bandcamp, #1768).
    if (!$concertsCharge) return;
    charger();
  });

  async function charger() {
    chargement = true;
    anomalie = '';
    try {
      const reponse = await api.getConcertsAVenir();
      concerts = reponse.concerts ?? [];
      refusePremium = false;
      if (reponse.scope) perimetre = reponse.scope;
      if (reponse.radius_km) rayon = reponse.radius_km;
      if (reponse.city) commune = reponse.city;
      if (reponse.country) pays = reponse.country;
      // Un code d'anomalie est traduisible ; une phrase du serveur ne l'est pas.
      if (reponse.code) anomalie = reponse.code;
    } catch (e) {
      // Un refus d'offre n'est pas une panne : l'écran se verrouille et dit ce
      // qu'il refuse, au lieu d'afficher une erreur rouge incompréhensible.
      if (estRefusPremium(e)) {
        refusePremium = true;
        concerts = [];
        return;
      }
      anomalie = 'concerts.unavailable';
    } finally {
      chargement = false;
    }
  }

  async function enregistrerLocalisation(nouveauPerimetre?: api.PerimetreConcerts) {
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
      refusePremium = false;
      await charger();
    } catch (e) {
      if (estRefusPremium(e)) {
        refusePremium = true;
        return;
      }
      notifications.error($t('concerts.enregistrementEchoue'));
    } finally {
      enregistrement = false;
    }
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
  {:else if refusePremium}
    <div class="cc-encart">
      <p>{$t('concerts.premiumRequis')}</p>
      <a class="cc-principal" href="https://mozaiklabs.fr/pricing" target="_blank" rel="noopener">
        {$t('concerts.decouvrirPremium')}
      </a>
    </div>
  {:else}
    <section class="cc-perimetre">
      <div class="cc-crans">
        <button class:actif={perimetre === 'radius'} onclick={() => enregistrerLocalisation('radius')}>
          {$t('concerts.autourDeMoi')}
        </button>
        <button class:actif={perimetre === 'country'} onclick={() => enregistrerLocalisation('country')}>
          {$t('concerts.dansMonPays')}
        </button>
        <button class:actif={perimetre === 'world'} onclick={() => enregistrerLocalisation('world')}>
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
            bind:value={codePostal}
            placeholder={$t('concerts.codePostalPlaceholder')}
            aria-label={$t('concerts.codePostal')}
          />
          <select bind:value={rayon} aria-label={$t('concerts.rayon')}>
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
        {#if localisee === false}
          <p class="cc-note cc-attention">{$t('concerts.communeIntrouvable')}</p>
        {/if}
      {/if}
    </section>

    {#if chargement}
      <p class="cc-muet">{$t('concerts.chargement')}</p>
    {:else if anomalie === 'concerts.no_instance_id'}
      <p class="cc-muet">{$t('concerts.pasDInstance')}</p>
    {:else if anomalie}
      <p class="cc-erreur">{$t('concerts.indisponible')}</p>
    {:else if concerts.length === 0}
      <div class="cc-vide">
        <p>{$t('concerts.aucun')}</p>
        <!-- Le geste utile quand la liste est vide n'est pas de recharger,
             c'est d'élargir. -->
        {#if cranPlusLarge}
          <button
            class="cc-principal"
            onclick={() => enregistrerLocalisation(cranPlusLarge ?? undefined)}
          >
            {cranPlusLarge === 'country' ? $t('concerts.elargirAuPays') : $t('concerts.elargirPartout')}
          </button>
        {/if}
      </div>
    {:else}
      <ul class="cc-liste">
        {#each parArtiste as [artiste, dates] (artiste)}
          <li>
            <h3>{artiste}</h3>
            <ul class="cc-dates">
              {#each dates as date (date.event_date + (date.venue ?? '') + (date.city ?? ''))}
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
    {/if}
  {/if}
</div>

<style>
  .cc { padding: 1rem; max-width: 60rem; margin: 0 auto; }
  .cc-tete h2 { margin: 0 0 0.25rem; }
  .cc-sous { color: var(--text-muted, #888); margin: 0 0 1.5rem; }
  .cc-encart { background: var(--surface, #1b1b1b); padding: 1rem; border-radius: 8px; }
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
  .cc-erreur { color: var(--danger, #e05252); }
  .cc-muet, .cc-vide { color: var(--text-muted, #888); }
  .cc-liste { list-style: none; padding: 0; margin: 0; }
  .cc-liste > li { padding: 0.75rem 0; border-bottom: 1px solid var(--border, #2a2a2a); }
  .cc-liste h3 { margin: 0 0 0.35rem; font-size: 1rem; }
  .cc-dates { list-style: none; padding: 0; margin: 0; }
  .cc-dates li { display: flex; gap: 0.75rem; flex-wrap: wrap; padding: 0.15rem 0; }
  .cc-date { font-variant-numeric: tabular-nums; min-width: 6.5rem; }
  .cc-lieu { color: var(--text-muted, #aaa); }
</style>
