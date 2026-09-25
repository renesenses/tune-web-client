<script lang="ts">
  /**
   * La fiche « Crédits » d'un titre ou d'un album — #1572.
   *
   * FabienM, fil forum 1921 (24/09/2026) : « visualiser les crédits d'un titre
   * via une nouvelle fonction dans autres actions (...) à l'instar de Roon »,
   * puis « même demande sur la page album ». Sa capture de Roon montre deux
   * blocs — « Compositeurs et interprètes », « Production » — et une ligne par
   * rôle ou par instrument, le nom de l'artiste en lien.
   *
   * Les groupes se décident dans `lib/library/credits` (`blocsDeCredits`), le
   * chargement dans `lib/library/chargerCredits` ; ce composant ne fait que
   * montrer. Le tiroir est celui de « Tous les champs piste » (`TiroirLateral`).
   *
   * Un nom qui porte une fiche d'artiste (`artist_id`) l'ouvre par le chemin
   * de référence (`ouvrirArtisteDepuis`, #1494) ; un nom sans fiche reste du
   * texte — pas de lien qui n'ouvrirait rien.
   *
   * #4993 — un titre ou un album de SERVICE (`service` posé dans la cible) :
   * la route `GET /streaming/{service}/…/credits`, même forme. Ses noms n'ont
   * jamais d'`artist_id` : ils restent du TEXTE. Pas de lien vers la page
   * artiste du service par le nom : un musicien de séance crédité n'y a le
   * plus souvent aucune fiche, et une recherche par nom ouvrirait un
   * homonyme. Pas d'enrichissement MusicBrainz non plus : il écrit dans
   * `track_credits`, que seule la bibliothèque lit. Un refus (501 : le service
   * n'a pas de crédits ; 404 : serveur antérieur) est dit en clair et retenu
   * (`lib/creditsService`) : l'entrée disparaît ensuite pour ce service.
   */
  import { onMount, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import { activeView } from '../../lib/stores/navigation';
  import { ouvrirArtisteDepuis } from '../../lib/ouvrirArtisteDepuis';
  import {
    blocsDeCredits,
    libelleLigne,
    numerosDePistes,
    type CreditAvecPiste,
  } from '../../lib/library/credits';
  import { chargerCreditsAlbum, type PisteDeLAlbum } from '../../lib/library/chargerCredits';
  import TiroirLateral from './TiroirLateral.svelte';
  import { estRefusDeCredits, retenirRefusDeCredits } from '../../lib/creditsService';

  type Cible =
    | {
        type: 'piste'; trackId: number | null; titre?: string | null; artiste?: string | null; album?: string | null;
        /** #4993 — le titre chez son service ; `trackId` est alors nul. */
        service?: { service: string; sourceId: string } | null;
      }
    | {
        type: 'album'; albumId: number | null; titre?: string | null; artiste?: string | null; pistes: PisteDeLAlbum[];
        /** #4993 — l'album chez son service ; `albumId` est alors nul. */
        service?: { service: string; albumId: string } | null;
      };

  interface Props {
    cible: Cible;
    onClose: () => void;
    /**
     * Appelé avant d'ouvrir la page d'un artiste : la fiche d'album se referme
     * d'abord, sinon la page s'ouvrirait derrière elle (même règle que
     * `AlbumDetailV2.allerArtiste`).
     */
    avantDeNaviguer?: () => void;
  }
  let { cible, onClose, avantDeNaviguer }: Props = $props();

  // Relevée une fois : le tiroir s'ouvre pour UN titre ou UN album.
  const c = untrack(() => cible);

  /** Le service de la cible, quand elle en vient (#4993). */
  const service = c.service?.service ?? null;

  let etat = $state<'chargement' | 'pret' | 'erreur' | 'indisponible'>('chargement');
  let credits = $state<CreditAvecPiste[]>([]);
  let enrichissement = $state(false);

  const blocs = $derived(blocsDeCredits(credits));
  const plusieursDisques = $derived(credits.some((x) => (x.disc_number ?? 1) > 1));

  async function lire(): Promise<CreditAvecPiste[]> {
    if (c.type === 'piste') {
      if (c.service) return api.getStreamingTrackCredits(c.service.service, c.service.sourceId);
      if (c.trackId == null) return [];
      return api.getTrackCredits(c.trackId);
    }
    if (c.service) return api.getStreamingAlbumCredits(c.service.service, c.service.albumId);
    if (c.albumId == null) return [];
    return chargerCreditsAlbum(c.albumId, c.pistes);
  }

  async function charger() {
    try {
      const lignes = await lire();
      credits = Array.isArray(lignes) ? lignes : [];
      etat = 'pret';
    } catch (e) {
      if (service && estRefusDeCredits(e)) {
        retenirRefusDeCredits(service);
        etat = 'indisponible';
        return;
      }
      console.warn('[crédits] lecture impossible :', e);
      etat = 'erreur';
    }
  }

  async function enrichir() {
    if (enrichissement || service) return;
    if ((c.type === 'piste' && c.trackId == null) || (c.type === 'album' && c.albumId == null)) return;
    enrichissement = true;
    try {
      if (c.type === 'piste') await api.enrichTrackCredits(c.trackId!);
      else await api.enrichAlbumCredits(c.albumId!);
      await charger();
      if (credits.length === 0) notifications.info($t('credits.enrich.failed'));
    } catch {
      notifications.error($t('credits.enrich.failed'));
    } finally {
      enrichissement = false;
    }
  }

  function ouvrirArtiste(id: number, nom: string) {
    onClose();
    avantDeNaviguer?.();
    void ouvrirArtisteDepuis({ id, name: nom, source: 'local' }, get(activeView));
  }

  onMount(() => { void charger(); });

  const titreTiroir = $derived($t(c.type === 'piste' ? 'credits.trackTitle' : 'credits.albumTitle'));
</script>

<TiroirLateral titre={titreTiroir} {onClose} porte>
  {#snippet entete()}
    {#if c.titre}<p class="objet">{c.titre}</p>{/if}
    {#if c.artiste || (c.type === 'piste' && c.album)}
      <p class="contexte">
        {#if c.type === 'piste' && c.album}<span>{c.album}</span>{/if}
        {#if c.artiste}<span>{c.artiste}</span>{/if}
      </p>
    {/if}
  {/snippet}
  <div class="corps" data-credits={c.type}>
    {#if etat === 'chargement'}
      <p class="etat">{$t('v2.common.loading')}</p>
    {:else if etat === 'erreur'}
      <p class="etat err">{$t('common.error')}</p>
    {:else if etat === 'indisponible'}
      <p class="etat" data-credits-indisponible>{$t('credits.serviceUnavailable')}</p>
    {:else if blocs.length === 0}
      <div class="vide" data-credits-vide>
        {#if service}
          <p>{$t('credits.noneService')}</p>
        {:else}
          <p>{$t(c.type === 'piste' ? 'credits.noneTrack' : 'credits.noneAlbum')}</p>
          <button class="enrichir" onclick={enrichir} disabled={enrichissement}>
            {enrichissement ? $t('credits.enrich.in_progress') : $t('credits.empty.cta_enrich')}
          </button>
        {/if}
      </div>
    {:else}
      {#each blocs as bloc (bloc.famille)}
        <section class="bloc" data-famille={bloc.famille}>
          <h4>{$t(`credits.block.${bloc.famille}`)}</h4>
          {#each bloc.lignes as ligne (ligne.role + '|' + (ligne.instrument ?? ''))}
            <div class="ligne" data-role={ligne.role}>
              <span class="role">{libelleLigne(ligne, (k) => $t(k))}</span>
              <span class="noms">
                {#each ligne.artistes as a (a.artist_id ?? a.artist_name)}
                  <span class="nom">
                    {#if a.artist_id != null}
                      <button class="lien" onclick={() => ouvrirArtiste(a.artist_id!, a.artist_name)}>{a.artist_name}</button>
                    {:else}
                      <span class="texte">{a.artist_name}</span>
                    {/if}
                    {#if c.type === 'album' && a.pistes.length}
                      <span class="pistes" title={a.pistes.map((p) => p.titre).filter(Boolean).join(' · ')}>
                        {$t('credits.onTracks').replace('{liste}', numerosDePistes(a.pistes, plusieursDisques))}
                      </span>
                    {/if}
                  </span>
                {/each}
              </span>
            </div>
          {/each}
        </section>
      {/each}
    {/if}
  </div>
</TiroirLateral>

<style>
  .objet { margin: 4px 0 0; font-size: 14px; color: var(--tune-text); }
  .contexte {
    margin: 2px 0 0; font-size: 12px; color: var(--tune-text-muted);
    display: flex; flex-wrap: wrap; gap: 0 8px;
  }
  .corps {
    flex: 1; overflow-y: auto; padding: 12px 20px 20px;
    display: flex; flex-direction: column; gap: 20px;
  }
  .etat { padding: 12px; color: var(--tune-text-muted); font-size: 13px; text-align: center; }
  .etat.err { color: #ef4444; }
  .vide { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px 8px; text-align: center; }
  .vide p { margin: 0; color: var(--tune-text-muted); font-size: 13px; line-height: 1.5; }
  .enrichir {
    padding: 8px 14px; border-radius: 6px; cursor: pointer;
    font-family: var(--font-label); font-size: 12px; font-weight: 600;
    background: rgba(var(--tune-accent-rgb, 99, 102, 241), 0.15);
    border: 1px solid rgba(var(--tune-accent-rgb, 99, 102, 241), 0.3);
    color: var(--tune-accent);
  }
  .enrichir:disabled { opacity: 0.5; cursor: default; }
  .bloc h4 {
    margin: 0 0 8px;
    font-family: var(--font-label);
    font-size: 13px; font-weight: 600;
    color: var(--tune-text);
  }
  .ligne {
    display: grid; grid-template-columns: minmax(110px, 38%) 1fr;
    gap: 10px; padding: 4px 0; align-items: baseline;
  }
  .role {
    font-family: var(--font-label);
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--tune-text-muted); text-align: right;
  }
  .noms { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .nom { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
  .lien {
    background: none; border: none; padding: 0; cursor: pointer;
    font: inherit; font-size: 14px; font-weight: 600; color: var(--tune-accent);
    text-align: left;
  }
  .lien:hover { text-decoration: underline; }
  .texte { font-size: 14px; font-weight: 600; color: var(--tune-text); }
  .pistes { font-size: 11px; color: var(--tune-text-muted); }
</style>
