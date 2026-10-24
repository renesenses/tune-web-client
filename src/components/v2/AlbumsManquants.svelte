<!--
  tune-server-rust#6288 — MetaRust, « Albums manquants » : la discographie
  MusicBrainz de l'artiste (Album et EP), moins la bibliothèque.

  Rien ne part à l'ouverture de la fiche : la comparaison se demande (bouton),
  parce que sa première lecture va au rythme de MusicBrainz. Live et
  compilations sont exclus par défaut (choix prudent, à valider) ; une case
  les ajoute.

  Suite de #6288 : un manque que la fiche a déjà trouvé chez un service
  connecté (`services`, les albums de l'artiste que la fiche charge pour sa
  discographie) propose « Écouter » et « Ajouter aux favoris » sur ce service.
  Aucun appel de plus : l'appariement se fait sur ce qui est déjà là, par le
  titre (`trouverSurUnService`).
-->
<script lang="ts">
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import {
    anneeDe, cleEtat, lienMusicBrainz, reponseDEchec, trouverSurUnService,
    type ManqueSurUnService, type ReponseManquants, type SectionDeService,
  } from '../../lib/albumsManquants';
  import { favoriteStreamingKeys } from '../../lib/stores/profile';
  import { isStreamingFavorite, toggleStreamingFavorite, type StreamingRef } from '../../lib/streamingFavorites';
  import { playAndSync } from '../../lib/stores/zones';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { messageEchecLecture } from '../../lib/echecLecture';
  import { notifications } from '../../lib/stores/notifications';

  interface Props {
    artistId: number;
    /** Les albums de l'artiste chez les services connectés, déjà chargés par
     *  la fiche. Vides ou absents : ni « Écouter » ni favori. */
    services?: readonly SectionDeService[];
  }
  let { artistId, services = [] }: Props = $props();

  const nomService = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);

  function refDe(m: ManqueSurUnService): StreamingRef {
    return {
      itemType: 'album',
      service: m.service,
      serviceId: m.sourceId,
      title: m.album.title ?? undefined,
      artist: m.album.artist_name ?? undefined,
      coverUrl: m.album.cover_path ?? undefined,
      ...(m.album.artist_id != null ? { artistId: String(m.album.artist_id) } : {}),
    };
  }

  function ecouter(m: ManqueSurUnService) {
    const zid = zoneRequise();
    if (zid == null) return;
    playAndSync(zid, { streaming_album_id: m.sourceId, source: m.service as any }).catch((e) =>
      notifications.error(messageEchecLecture(e, 'library.playbackError')),
    );
  }

  let reponse = $state<ReponseManquants | null>(null);
  let enCours = $state(false);
  let avecSecondaires = $state(false);
  let jeton = 0;

  // Un autre artiste : on repart de zéro.
  $effect(() => {
    void artistId;
    jeton++;
    reponse = null;
    enCours = false;
  });

  async function comparer() {
    const j = ++jeton;
    enCours = true;
    try {
      const r = await api.getArtistMissingAlbums(artistId, avecSecondaires);
      if (j === jeton) reponse = r;
    } catch (e) {
      if (j === jeton) reponse = reponseDEchec(e);
    } finally {
      if (j === jeton) enCours = false;
    }
  }
</script>

<section class="manquants" data-albums-manquants>
  <h3>{$t('v2.manquants.titre')}</h3>
  <div class="gestes">
    <button class="ghost" onclick={comparer} disabled={enCours}>
      {$t(enCours ? 'v2.manquants.chargement' : 'v2.manquants.afficher')}
    </button>
    <label class="option">
      <input type="checkbox" bind:checked={avecSecondaires} onchange={() => { if (reponse) void comparer(); }} />
      {$t('v2.manquants.avecSecondaires')}
    </label>
  </div>
  {#if reponse}
    <p class="etat">
      {$t(cleEtat(reponse))
        .replace('{n}', String(reponse.manquants?.length ?? 0))
        .replace('{total}', String(reponse.retenus ?? 0))
        .replace('{possedes}', String(reponse.possedes ?? 0))}
    </p>
    {#if reponse.tronquee}
      <p class="etat">{$t('v2.manquants.tronquee')}</p>
    {/if}
    {#if reponse.statut === 'ok' && reponse.manquants?.length}
      <ul>
        {#each reponse.manquants as g (g.mbid)}
          {@const lien = lienMusicBrainz(g.mbid)}
          {@const surService = trouverSurUnService(g.titre, services)}
          <li>
            <span class="titre">{g.titre}</span>
            {#if anneeDe(g.premiere_sortie)}<span class="annee">{anneeDe(g.premiere_sortie)}</span>{/if}
            {#if g.type_primaire}<span class="type">{[g.type_primaire, ...(g.types_secondaires ?? [])].join(' · ')}</span>{/if}
            {#if lien}<a href={lien} target="_blank" rel="noopener noreferrer external">{$t('v2.manquants.voirMb')}</a>{/if}
            {#if surService}
              {@const ref = refDe(surService)}
              {@const fav = isStreamingFavorite($favoriteStreamingKeys, ref)}
              <span class="service" data-manque-service={surService.service}>
                <button class="mini" onclick={() => ecouter(surService)} data-ecouter
                  title={$t('v2.manquants.ecouterSur' as any).replace('{service}', nomService(surService.service))}>
                  {$t('v2.manquants.ecouterSur' as any).replace('{service}', nomService(surService.service))}
                </button>
                <button class="mini" class:on={fav} aria-pressed={fav} onclick={() => void toggleStreamingFavorite(ref)} data-favori>
                  {$t((fav ? 'v2.manquants.retirerFavori' : 'v2.manquants.ajouterFavori') as any)}
                </button>
              </span>
            {/if}
          </li>
        {/each}
      </ul>
      <p class="attribution">{$t('v2.manquants.source')}</p>
    {/if}
  {/if}
</section>

<style>
  .manquants { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
  .manquants h3 { margin: 0; }
  .gestes { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .ghost {
    padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;
    background: transparent; color: var(--tune-text);
    border: 1px solid var(--tune-border, rgba(127, 127, 127, 0.3));
  }
  .ghost:disabled { opacity: 0.5; cursor: default; }
  .option { font-size: 12px; display: flex; align-items: center; gap: 6px; }
  .etat, .attribution { margin: 0; font-size: 13px; color: var(--tune-text-muted); }
  .attribution { font-size: 11px; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  li { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
  .titre { font-weight: 600; }
  .annee, .type { color: var(--tune-text-muted); }
  li a { color: var(--tune-accent); }
  .service { display: inline-flex; gap: 6px; }
  .mini {
    padding: 2px 8px; border-radius: 10px; cursor: pointer; font-size: 11px;
    background: transparent; color: var(--tune-text);
    border: 1px solid var(--tune-border, rgba(127, 127, 127, 0.3));
  }
  .mini.on { color: var(--tune-accent); border-color: var(--tune-accent); }
</style>
