<script lang="ts">
  /**
   * La carte des radios (web#2400) — troisième onglet de la page Radio, à côté
   * de « Mes radios » et de l'« Annuaire » (retour de Bertrand du 26/10).
   *
   * Les données sont l'annuaire que le serveur garde en cache
   * (`GET /radios/directory`, 831 fiches le 27/10), lu en une page. Les
   * réseaux sont les mots-clés de chaque fiche — le diffuseur (NPR, BBC,
   * Radio France…), servis depuis tune-server-rust#7194 ; une fiche sans
   * mot-clé est « sans réseau ». Rien n'est deviné du nom de la station,
   * contrairement au prototype.
   *
   * Écouter et ajouter passent par les MÊMES gestes que l'onglet Annuaire.
   */
  import * as api from '../../lib/api';
  import type { FicheAnnuaireRadio } from '../../lib/api/annuaireRadios';
  import type { RadioStation } from '../../lib/types';
  import { t, locale } from '../../lib/i18n';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { ecouterFicheAnnuaire } from '../../lib/ecouteFicheAnnuaire';
  import { radioGenreRayon, radioGenreLabel } from '../../lib/radioGenres';
  import { nomDuPays } from '../../lib/paysAffichage';
  import { notifications } from '../../lib/stores/notifications';
  import type { AxeCarte, DimensionCarte, ElementCarte, ModeCarte, RaisonProche } from '../../lib/carteDecouverte';
  import CarteDecouverte from './CarteDecouverte.svelte';

  interface Props {
    onAjoutee?: (station: RadioStation) => void;
    enDirect?: string | null;
    onJoue?: (externalId: string) => void;
  }
  let { onAjoutee, enDirect = null, onJoue }: Props = $props();

  /** L'annuaire entier tient dans une page (le serveur borne à 1000). */
  const TOUT = 1000;

  let fiches = $state<FicheAnnuaireRadio[]>([]);
  let chargement = $state(true);
  let erreur = $state<string | null>(null);
  let vide = $state(false);

  $effect(() => {
    let vivant = true;
    api.getAnnuaireRadios({ limit: TOUT })
      .then((r) => { if (!vivant) return; fiches = r.items ?? []; vide = r.stations === 0; })
      .catch(() => { if (vivant) erreur = $t('v2.radio.dir.loadFailed' as any); })
      .finally(() => { if (vivant) chargement = false; });
    return () => { vivant = false; };
  });

  const libelleGenre = (cle: string) => {
    if (!cle) return $t('v2.carte.radio.noGenre' as any);
    const rayon = radioGenreRayon({ genre: cle });
    return rayon ? radioGenreLabel(rayon, (k) => $t(k as any)) : cle;
  };
  const nomPays = (code: string) => (code ? nomDuPays(code, $locale, code) : $t('v2.carte.noCountry' as any));
  const reseauDe = (f: FicheAnnuaireRadio) => (f.keywords ?? []).map((k) => k.trim()).find(Boolean) ?? null;

  const elements = $derived<ElementCarte[]>(fiches.map((f) => {
    const genre = (f.genre ?? '').trim().toLowerCase();
    const pays = (f.country_code ?? '').trim().toUpperCase();
    const reseau = reseauDe(f);
    return {
      id: f.external_id, nom: f.name, image: f.logo_url ?? null, genre,
      categories: f.categories ?? [], pays, reseau,
      texte: [f.name, genre, libelleGenre(genre), pays, nomPays(pays), ...(f.keywords ?? []), ...(f.categories ?? [])].join(' '),
    };
  }));
  const parId = $derived(new Map(fiches.map((f) => [f.external_id, f])));

  function libelleGroupe(d: DimensionCarte, cle: string): string {
    if (d === 'genre') return libelleGenre(cle);
    if (d === 'pays') return nomPays(cle);
    if (d === 'reseau') return cle;
    return $t('v2.carte.radio.noNetwork' as any);
  }
  function libelleRacine(m: ModeCarte, a: AxeCarte): string {
    if (m === 'reseaux') return $t('v2.carte.radio.networks' as any);
    return a === 'genre' ? $t('v2.carte.radio.genres' as any) : $t('v2.carte.countries' as any);
  }
  const sousTitre = (e: ElementCarte) => [libelleGenre(e.genre), nomPays(e.pays), e.reseau].filter(Boolean).join(' · ');
  const unite = (n: number) => $t((n === 1 ? 'v2.carte.radio.one' : 'v2.carte.radio.many') as any).replace('{n}', String(n));
  const libelleRaison = (r: RaisonProche) =>
    r === 'reseau' ? $t('v2.carte.radio.sameNetwork' as any) : r === 'genre' ? $t('v2.carte.radio.sameGenre' as any) : $t('v2.carte.sameCountry' as any);

  async function ecouter(e: ElementCarte) {
    const f = parId.get(e.id);
    if (!f) return;
    const zid = zoneRequise();
    if (zid == null) return;
    onJoue?.(f.external_id);
    if (!(await ecouterFicheAnnuaire(f, zid))) {
      notifications.error($t('v2.radio.dir.playFailed' as any).replace('{name}', f.name));
    }
  }
  async function ajouter(e: ElementCarte) {
    const f = parId.get(e.id);
    if (!f) return;
    try {
      const st = await api.ajouterDepuisAnnuaire(f.external_id, false);
      fiches = fiches.map((x) => (x.external_id === f.external_id
        ? { ...x, my_radio_id: st.id, my_radio_favorite: !!st.favorite } : x));
      onAjoutee?.(st);
      notifications.success($t('v2.radio.dir.added' as any).replace('{name}', f.name));
    } catch (err: any) {
      notifications.error(err?.message ?? $t('common.error' as any));
    }
  }
</script>

{#if chargement && !fiches.length}
  <div class="etat">{$t('v2.radio.dir.loading' as any)}</div>
{:else if erreur}
  <div class="etat err">{erreur}</div>
{:else if vide || !fiches.length}
  <div class="etat">{$t('v2.radio.dir.empty' as any)}</div>
{:else}
  <CarteDecouverte
    {elements}
    {libelleGroupe}
    {libelleRacine}
    {sousTitre}
    {unite}
    {libelleRaison}
    libelleModeReseaux={$t('v2.carte.radio.networks' as any)}
    libelleAxeGenre={$t('v2.carte.radio.byGenre' as any)}
    libelleScene={$t('v2.carte.radio.scene' as any)}
    libelleRecherche={$t('v2.carte.radio.search' as any)}
    titreProches={$t('v2.carte.radio.nearby' as any)}
    invitation={$t('v2.carte.radio.pick' as any)}
    aucunProche={$t('v2.carte.radio.noNearby' as any)}
    enCours={enDirect}
  >
    {#snippet actions(e: ElementCarte)}
      <button type="button" class="v2-btn primaire" onclick={() => ecouter(e)}>{$t('v2.carte.radio.play' as any)}</button>
      {#if parId.get(e.id)?.my_radio_id == null}
        <button type="button" class="v2-btn" onclick={() => ajouter(e)}>{$t('v2.radio.dir.add' as any)}</button>
      {:else}
        <span class="dedans">{$t('v2.radio.dir.inMine' as any)}</span>
      {/if}
    {/snippet}
  </CarteDecouverte>
{/if}

<style>
  .etat{padding:20px 30px; color:var(--v2-txt3)} .etat.err{color:var(--v2-danger)}
  .dedans{align-self:center; font:600 10px var(--v2-mono); color:var(--v2-txt3)}
</style>
