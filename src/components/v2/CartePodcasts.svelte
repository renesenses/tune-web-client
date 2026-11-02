<script lang="ts">
  /**
   * La carte des podcasts (web#2450) — pendant de la carte des radios, dans
   * la page Podcasts.
   *
   * Les données sont le catalogue que le serveur réunit
   * (`GET /podcasts/catalogue`, tune-server-rust#7194) : les palmarès Apple de
   * dix-huit boutiques et la sélection de Tune, sans doublon. Chaque émission
   * est placée dans le pays où elle est le mieux classée, et dit si Tune sait
   * la lire (`readable`) : une émission sans flux public est signalée, jamais
   * cachée.
   *
   * Les producteurs qui ont au moins deux émissions forment les groupes du
   * mode « Producteurs » ; les autres sont indépendants.
   *
   * Ouvrir et s'abonner passent par les gestes de l'écran Podcasts
   * (`onOuvrir`, `onAbonner`) : la fiche des épisodes est la même.
   */
  import * as api from '../../lib/api';
  import type { EmissionCatalogue } from '../../lib/api/cataloguePodcasts';
  import { t, locale } from '../../lib/i18n';
  import { nomDuPays } from '../../lib/paysAffichage';
  import { PODCAST_GENRES } from '../../lib/podcast-genres';
  import type { AxeCarte, DimensionCarte, ElementCarte, ModeCarte, RaisonProche } from '../../lib/carteDecouverte';
  import CarteDecouverte from './CarteDecouverte.svelte';

  interface Props {
    /** Ouvrir la fiche des épisodes (le geste de l'écran Podcasts). */
    onOuvrir: (p: Record<string, unknown>) => void;
    onAbonner: (p: Record<string, unknown>, e: MouseEvent) => void;
    estAbonne: (p: Record<string, unknown>) => boolean;
  }
  let { onOuvrir, onAbonner, estAbonne }: Props = $props();

  let emissions = $state<EmissionCatalogue[]>([]);
  let chargement = $state(true);
  let erreur = $state<string | null>(null);
  let enAttente = $state<string[]>([]);

  let jeton = 0;
  async function charger() {
    const moi = ++jeton;
    chargement = true;
    erreur = null;
    try {
      const r = await api.getCataloguePodcasts();
      if (moi !== jeton) return;
      emissions = r.items ?? [];
      enAttente = r.pending_countries ?? [];
    } catch {
      if (moi === jeton) erreur = $t('v2.carte.pod.loadFailed' as any);
    } finally {
      if (moi === jeton) chargement = false;
    }
  }
  $effect(() => { void charger(); });

  /** Catégories Apple → clés de traduction (celles de l'onglet Découvrir,
   *  plus les cinq qu'il ne propose pas). */
  const CLES_CATEGORIES: Record<string, string> = {
    ...Object.fromEntries(PODCAST_GENRES.filter((g) => g.id != null).map((g) => [String(g.id), g.key])),
    1305: 'v2.carte.pod.catKids',
    1307: 'v2.carte.pod.catHealth',
    1309: 'v2.carte.pod.catTvFilm',
    1314: 'v2.carte.pod.catReligion',
    1323: 'v2.carte.pod.catGovernment',
  };
  /** La clé de groupe d'une émission : son identifiant de genre, sinon le libellé brut. */
  const cleCategorie = (e: EmissionCatalogue) => (e.category_id != null ? String(e.category_id) : (e.category ?? '').trim());
  const libelleCategorie = (cle: string) => {
    if (!cle) return $t('v2.carte.pod.noCategory' as any);
    const k = CLES_CATEGORIES[cle];
    return k ? $t(k as any) : cle;
  };
  const nomPays = (code: string) => (code ? nomDuPays(code, $locale, code) : $t('v2.carte.noCountry' as any));

  const producteurs = $derived.by(() => {
    const n = new Map<string, number>();
    for (const e of emissions) if (e.artist) n.set(e.artist, (n.get(e.artist) ?? 0) + 1);
    return n;
  });
  const meilleurRang = (e: EmissionCatalogue) => {
    const r = Object.values(e.charts ?? {});
    return r.length ? Math.min(...r) : null;
  };

  const elements = $derived<ElementCarte[]>(emissions.map((e) => {
    const genre = cleCategorie(e);
    const pays = (e.country ?? '').toUpperCase();
    return {
      id: e.source_id, nom: e.name, image: e.cover_url || null, genre, pays,
      reseau: e.artist && (producteurs.get(e.artist) ?? 0) >= 2 ? e.artist : null,
      lisible: e.readable, rang: meilleurRang(e),
      texte: [e.name, e.artist, e.category ?? '', libelleCategorie(genre), pays, nomPays(pays)].join(' '),
    };
  }));
  const parId = $derived(new Map(emissions.map((e) => [e.source_id, e])));

  /** La fiche telle que l'écran Podcasts l'attend (`author`, `title`). */
  const fiche = (e: EmissionCatalogue): Record<string, unknown> => ({ ...e, title: e.name, author: e.artist });

  function libelleGroupe(d: DimensionCarte, cle: string): string {
    if (d === 'genre') return libelleCategorie(cle);
    if (d === 'pays') return nomPays(cle);
    if (d === 'reseau') return cle;
    return $t('v2.carte.pod.independent' as any);
  }
  function libelleRacine(m: ModeCarte, a: AxeCarte): string {
    if (m === 'reseaux') return $t('v2.carte.pod.producers' as any);
    return a === 'genre' ? $t('v2.carte.pod.categories' as any) : $t('v2.carte.countries' as any);
  }
  const sousTitre = (el: ElementCarte) => {
    const e = parId.get(el.id);
    return [e?.artist, libelleCategorie(el.genre), nomPays(el.pays)].filter(Boolean).join(' · ');
  };
  const unite = (n: number) => $t((n === 1 ? 'v2.carte.pod.one' : 'v2.carte.pod.many') as any).replace('{n}', String(n));
  const libelleRaison = (r: RaisonProche) =>
    r === 'reseau' ? $t('v2.carte.pod.sameProducer' as any) : r === 'genre' ? $t('v2.carte.pod.sameCategory' as any) : $t('v2.carte.sameCountry' as any);
  const classement = (e: EmissionCatalogue) => Object.entries(e.charts ?? {})
    .sort((a, b) => a[1] - b[1]).map(([c, r]) => `#${r} ${nomPays(c.toUpperCase())}`).join(', ');
</script>

{#if chargement && !emissions.length}
  <div class="etat">{$t('v2.carte.pod.loading' as any)}</div>
{:else if erreur}
  <div class="etat err">{erreur} <button type="button" class="v2-btn" onclick={() => charger()}>{$t('v2.carte.retry' as any)}</button></div>
{:else if !emissions.length}
  <div class="etat">{$t('v2.carte.pod.empty' as any)}</div>
{:else}
  {#if enAttente.length}
    <div class="etat attente" role="status">
      {$t('v2.carte.pod.pending' as any).replace('{n}', String(enAttente.length))}
      <button type="button" class="v2-btn" onclick={() => charger()}>{$t('v2.carte.retry' as any)}</button>
    </div>
  {/if}
  <CarteDecouverte
    {elements}
    {libelleGroupe}
    {libelleRacine}
    {sousTitre}
    {unite}
    {libelleRaison}
    avecLisibles
    libelleModeReseaux={$t('v2.carte.pod.producers' as any)}
    libelleAxeGenre={$t('v2.carte.pod.byCategory' as any)}
    libelleScene={$t('v2.carte.pod.scene' as any)}
    libelleRecherche={$t('v2.carte.pod.search' as any)}
    titreProches={$t('v2.carte.pod.nearby' as any)}
    invitation={$t('v2.carte.pod.pick' as any)}
    aucunProche={$t('v2.carte.pod.noNearby' as any)}
  >
    {#snippet actions(el: ElementCarte)}
      {@const e = parId.get(el.id)}
      {#if e}
        {#if classement(e)}<p class="rangs">{$t('v2.carte.pod.charts' as any).replace('{list}', classement(e))}</p>{/if}
        <button type="button" class="v2-btn primaire" disabled={!e.readable} onclick={() => onOuvrir(fiche(e))}>{$t('v2.carte.pod.episodes' as any)}</button>
        <button type="button" class="v2-btn" disabled={!e.readable} onclick={(ev) => onAbonner(fiche(e), ev)}>
          {estAbonne(fiche(e)) ? $t('v2.pod.unsubscribe' as any) : $t('v2.pod.subscribe' as any)}
        </button>
      {/if}
    {/snippet}
  </CarteDecouverte>
{/if}

<style>
  .etat{padding:20px 30px; color:var(--v2-txt3)} .etat.err{color:var(--v2-danger)}
  .attente{padding:4px 30px 0; display:flex; gap:10px; align-items:center; flex-wrap:wrap; font-size:12.5px}
  .rangs{flex-basis:100%; margin:0; font:11px var(--v2-mono); color:var(--v2-txt2)}
</style>
