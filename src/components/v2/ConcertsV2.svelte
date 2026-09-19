<script lang="ts">
  /**
   * CONCERTS À VENIR des artistes de la bibliothèque — porté de l'ancien
   * écran (`ConcertsView`) avant la phase 5 (web#1257). Sans lui, la seule
   * porte vers `GET /ext/concerts/upcoming` disparaissait avec `?v2=0`.
   *
   * La question est la même, une seule : « les artistes que j'écoute
   * jouent-ils près de chez moi ? » (FabienM et Didier, fil 1540). Les
   * concerts sont groupés par ARTISTE : on part de ce qu'on écoute, pas d'une
   * date.
   *
   * ## Ce qui n'est PAS porté : le choix du périmètre
   *
   * L'ancien écran posait une commune et un périmètre par
   * `POST /ext/concerts/location`. Cette route n'est montée par AUCUN serveur
   * livré : le greffon `tune-concerts` d'origin/main ne monte que `/upcoming`
   * (`plugins/tune-concerts/src/lib.rs`, `router()`), et la branche qui
   * ajoutait `/location` (tune-server-rust#2933) a été fermée sans fusion.
   * Porter ces boutons, ce serait porter un 404.
   *
   * ## Le greffon d'abord
   *
   * Rien n'est demandé tant que le routeur du greffon n'est pas monté : sans
   * cette garde, l'écran récolte le 404 nu d'axum (leçon de Bandcamp, #1768).
   */
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import { estRefusPremium } from '../../lib/premiumRefus';
  import {
    concertsCharge, concertsAttendRedemarrage, concertsPlugin, refreshConcertsPlugin,
  } from '../../lib/stores/concerts';
  import { activeView } from '../../lib/stores/navigation';

  let chargement = $state(false);
  let refusePremium = $state(false);
  /** Code d'anomalie STABLE rendu par le greffon — jamais une phrase. */
  let anomalie = $state('');
  let concerts = $state<api.Concert[]>([]);
  let demande = false;

  const parArtiste = $derived.by(() => {
    const groupes = new Map<string, api.Concert[]>();
    for (const c of concerts) {
      const liste = groupes.get(c.artist_name) ?? [];
      liste.push(c);
      groupes.set(c.artist_name, liste);
    }
    return [...groupes.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  });

  onMount(() => {
    // L'état du greffon peut ne pas encore être connu dans cette coquille :
    // on le demande, et l'effet ci-dessous charge dès qu'il est monté.
    if ($concertsPlugin === null) void refreshConcertsPlugin();
  });

  $effect(() => {
    if ($concertsCharge && !demande) {
      demande = true;
      void charger();
    }
  });

  async function charger() {
    chargement = true;
    anomalie = '';
    try {
      const reponse = await api.getConcertsAVenir();
      concerts = reponse.concerts ?? [];
      refusePremium = false;
      if (reponse.code) anomalie = reponse.code;
    } catch (e) {
      // Un refus d'offre n'est pas une panne : l'écran le dit, sans rouge.
      if (estRefusPremium(e)) {
        refusePremium = true;
        concerts = [];
      } else {
        anomalie = 'concerts.unavailable';
      }
    } finally {
      chargement = false;
    }
  }

  function dateLisible(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
  }
</script>

<div class="v2-ecran tune-v2">
  <header class="v2-entete">
    <div>
      <h1>{$t('concerts.titre')}</h1>
      <p class="sous">{$t('concerts.sousTitre')}</p>
    </div>
    {#if $concertsCharge && !refusePremium}
      <button class="v2-btn" disabled={chargement} onclick={() => charger()}>{$t('settings.refresh' as any)}</button>
    {/if}
  </header>

  {#if $concertsPlugin === null}
    <p class="muet">{$t('concerts.chargement')}</p>
  {:else if !$concertsCharge}
    <section class="carte encart">
      {#if $concertsAttendRedemarrage}
        <p>{$t('concerts.attendRedemarrage')}</p>
      {:else}
        <p>{$t('concerts.greffonAInstaller')}</p>
        <button class="v2-btn primaire" onclick={() => activeView.set('plugins')}>
          {$t('concerts.ouvrirGestionnaire')}
        </button>
      {/if}
    </section>
  {:else if refusePremium}
    <section class="carte encart">
      <p>{$t('concerts.premiumRequis')}</p>
      <a class="v2-btn primaire" href="https://mozaiklabs.fr/pricing" target="_blank" rel="noopener">
        {$t('concerts.decouvrirPremium')}
      </a>
    </section>
  {:else if chargement}
    <p class="muet">{$t('concerts.chargement')}</p>
  {:else if anomalie === 'concerts.no_instance_id'}
    <p class="muet">{$t('concerts.pasDInstance')}</p>
  {:else if anomalie}
    <p class="erreur">{$t('concerts.indisponible')}</p>
  {:else if concerts.length === 0}
    <p class="muet">{$t('concerts.aucun')}</p>
  {:else}
    <ul class="liste">
      {#each parArtiste as [artiste, dates] (artiste)}
        <li class="carte artiste">
          <h2>{artiste}</h2>
          <ul class="dates">
            {#each dates as d (d.event_date + (d.venue ?? '') + (d.city ?? ''))}
              <li>
                <span class="date">{dateLisible(d.event_date)}</span>
                <span class="lieu">{d.city ?? ''}{d.venue ? ` — ${d.venue}` : ''}{d.country ? ` (${d.country})` : ''}</span>
                {#if d.event_url}
                  <a href={d.event_url} target="_blank" rel="noopener">{$t('concerts.billets')}</a>
                {/if}
              </li>
            {/each}
          </ul>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .v2-ecran { padding: 24px; max-width: 760px; margin: 0 auto; }
  .v2-entete { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
  .v2-entete h1 { margin: 0; font: 700 22px var(--v2-sans); color: var(--v2-txt); }
  .sous { margin: 4px 0 0; font: 400 13px var(--v2-sans); color: var(--v2-txt2); }
  .carte { background: var(--v2-surface); border: 1px solid var(--v2-line2); border-radius: var(--v2-r-card); }
  .encart { padding: 18px 20px; display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
  .encart p { margin: 0; color: var(--v2-txt2); font: 400 14px var(--v2-sans); }
  .muet { color: var(--v2-txt3); font: 400 14px var(--v2-sans); }
  .erreur { color: var(--v2-danger); font: 400 14px var(--v2-sans); }
  .liste { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .artiste { padding: 14px 16px; }
  .artiste h2 { margin: 0 0 8px; font: 600 15px var(--v2-sans); color: var(--v2-txt); }
  .dates { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .dates li { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; font: 400 13px var(--v2-sans); color: var(--v2-txt2); }
  .date { font-variant-numeric: tabular-nums; color: var(--v2-txt); min-width: 90px; }
  .lieu { flex: 1; }
  .dates a { color: var(--v2-acc-tint); }
</style>
