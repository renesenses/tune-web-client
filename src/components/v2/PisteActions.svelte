<script lang="ts">
  /**
   * Les actions posées sur UNE piste, révélées au survol.
   *
   * Demandé par Bertrand le 05/09/2026 : « Au niveau tracks, il faut une liste
   * de boutons […] pour les actions sur les tracks. Ces boutons ne s'affichent
   * qu'au survol de la piste avec la souris. »
   *
   * ## D'où viennent les icônes
   *
   * Du nœud `3-4` de la maquette Figma, qui n'est pas une maquette de barre
   * mais la PALETTE Lucide posée sur le plan de travail par Levente. On y
   * puise, dans l'ordre : `play`, `skip-forward`, `list`, `save`, `heart`.
   * Aucun bouton n'est inventé : chacun correspond à une action que le client
   * sait déjà faire.
   *
   * ## Cinq, comme sur les pochettes
   *
   * | Icône | Action |
   * |---|---|
   * | play | lire maintenant |
   * | skip-forward | lire ensuite — insère juste après la piste en cours |
   * | list | ajouter à la fin de la file |
   * | save | ajouter à une playlist |
   * | heart | favori (bascule) |
   *
   * `PochetteActions` en pose cinq sur une pochette ; en poser huit sur une
   * ligne de titre ferait de chaque ligne un tableau de bord. Ce qui manque —
   * aller à l'album, étiqueter — se fait déjà depuis la pochette.
   *
   * ## Ce qui ne s'applique pas est ABSENT, pas grisé
   *
   * Une piste de service n'a pas d'identifiant de bibliothèque : son cœur
   * passe par les favoris de service, et si elle ne porte ni identifiant ni
   * paire source + identifiant, elle n'a tout simplement aucun bouton.
   *
   * ## Pourquoi le survol
   *
   * Cinq icônes en permanence sur chaque ligne d'une liste de 800 titres
   * seraient du bruit. Deux exceptions, et elles ne sont pas cosmétiques : le
   * cœur ACTIF reste visible — sinon on ne peut plus lire quels titres sont en
   * favori sans les survoler un par un — et sans survol possible (tactile)
   * tout reste visible. C'est la règle déjà appliquée aux pochettes.
   *
   * Le composant ne dessine PAS la ligne : il se pose dedans, en frère du
   * bouton de lecture. Un bouton dans un bouton est du balisage invalide.
   */
  import { get } from 'svelte/store';
  import * as api from '../../lib/api';
  import { corpsDeFile, corpsDeLecture, estPisteLocale } from '../../lib/pisteFile';
  import { currentZoneId } from '../../lib/stores/zones';
  import { queuePosition } from '../../lib/stores/queue';
  import { favoriteTrackIds, favoriteStreamingKeys, streamingFavKey } from '../../lib/stores/profile';
  import { basculerFavoriLocal } from '../../lib/favorisLocaux';
  import { toggleStreamingFavorite } from '../../lib/streamingFavorites';
  import { notifications } from '../../lib/stores/notifications';
  import { t } from '../../lib/i18n';
  import type { Track } from '../../lib/types';

  interface Props {
    piste: Track;
  }
  let { piste }: Props = $props();

  /** La modale de playlists est portée ICI, chargée à la demande : chaque
   *  écran qui pose la barre l'aurait sinon recopiée, avec son état et son
   *  import. C'est ce que fait déjà `PochetteActions` pour les étiquettes. */
  let modalePlaylist = $state(false);

  const local = $derived(estPisteLocale(piste));
  const cleService = $derived(
    !local && piste.source && piste.source_id
      ? streamingFavKey('track', piste.source, String(piste.source_id))
      : null,
  );
  const favori = $derived(
    local
      ? $favoriteTrackIds.has(piste.id!)
      : cleService != null && $favoriteStreamingKeys.has(cleService),
  );
  /** Un cœur n'a de sens que si la piste est désignable d'une façon ou d'une autre. */
  const coeurPossible = $derived(local || cleService != null);
  const jouable = $derived(corpsDeLecture(piste) != null);

  let occupe = $state(false);

  function stop(e: MouseEvent) { e.stopPropagation(); e.preventDefault(); }

  function lire(e: MouseEvent) {
    stop(e);
    const zid = $currentZoneId;
    const corps = corpsDeLecture(piste);
    if (zid == null || !corps) return;
    api.play(zid, corps as any).catch(() => notifications.error($t('v2.pa.playError' as any)));
  }

  /**
   * « Lire ensuite » insère au rang SUIVANT celui qui joue. Sans rang, la
   * route ajoute à la fin — ce serait le bouton d'à côté, pas celui-ci.
   */
  async function ensuite(e: MouseEvent) {
    stop(e);
    await enfiler(get(queuePosition) + 1, 'v2.pa.queuedNext');
  }

  async function aLaFile(e: MouseEvent) {
    stop(e);
    await enfiler(undefined, 'v2.pa.queued');
  }

  async function enfiler(position: number | undefined, cle: string) {
    const zid = $currentZoneId;
    const corps = corpsDeFile(piste, position);
    if (zid == null || !corps || occupe) return;
    occupe = true;
    try {
      await api.addToQueue(zid, corps);
      notifications.success($t(cle as any).replace('{title}', piste.title ?? ''));
    } catch {
      notifications.error($t('v2.pa.queueError' as any));
    }
    occupe = false;
  }

  async function basculerCoeur(e: MouseEvent) {
    stop(e);
    if (occupe || !coeurPossible) return;
    occupe = true;
    try {
      if (local) await basculerFavoriLocal({ trackId: piste.id! });
      else if (piste.source && piste.source_id) {
        await toggleStreamingFavorite({
          itemType: 'track',
          service: piste.source,
          serviceId: String(piste.source_id),
          title: piste.title,
          artist: piste.artist_name ?? undefined,
          album: piste.album_title ?? undefined,
          coverUrl: piste.cover_path ?? undefined,
        });
      }
    } catch {
      notifications.error($t('v2.pa.favError' as any));
    }
    occupe = false;
  }
</script>

<span class="pactions" class:a-favori={favori}>
  {#if jouable}
    <button class="pa" onclick={lire} title={$t('v2.pa.play' as any)} aria-label={$t('v2.pa.play' as any)}>
      <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 4l14 8-14 8z"/></svg>
    </button>
    <button class="pa" onclick={ensuite} disabled={occupe}
            title={$t('v2.pa.next' as any)} aria-label={$t('v2.pa.next' as any)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4l10 8-10 8z"/><path d="M19 5v14"/></svg>
    </button>
    <button class="pa" onclick={aLaFile} disabled={occupe}
            title={$t('v2.pa.queue' as any)} aria-label={$t('v2.pa.queue' as any)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h12M3 12h12M3 18h8M18 15v6M15 18h6"/></svg>
    </button>
  {/if}
  {#if jouable}
    <button class="pa" onclick={(e) => { stop(e); modalePlaylist = true; }}
            title={$t('v2.pa.playlist' as any)} aria-label={$t('v2.pa.playlist' as any)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
    </button>
  {/if}
  {#if coeurPossible}
    <button class="pa coeur" class:on={favori} onclick={basculerCoeur} disabled={occupe}
            title={$t(favori ? 'v2.pa.unfav' as any : 'v2.pa.fav' as any)}
            aria-label={$t(favori ? 'v2.pa.unfav' as any : 'v2.pa.fav' as any)}>
      <svg viewBox="0 0 24 24" fill={favori ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
  </button>
  {/if}
</span>

{#if modalePlaylist}
  {#await import('../AddToPlaylistModal.svelte') then m}
    <m.default track={piste} onClose={() => (modalePlaylist = false)} />
  {/await}
{/if}

<style>
  .pactions{display:inline-flex; align-items:center; gap:2px; flex:0 0 auto;
    opacity:0; transition:opacity .12s}
  /* Le survol de la LIGNE révèle la barre — c'est la ligne qui est survolée,
     pas la barre, sinon il faudrait viser des icônes invisibles. */
  :global(.trk:hover) .pactions,
  :global(.row:hover) .pactions,
  :global(.tr:hover) .pactions,
  .pactions:focus-within{opacity:1}
  /* Un cœur ACTIF ne se cache pas : sans lui on ne peut plus lire quels titres
     sont en favori sans les survoler un par un. */
  .pactions.a-favori{opacity:1}
  .pactions.a-favori .pa:not(.coeur){opacity:0; transition:opacity .12s}
  :global(.trk:hover) .pactions.a-favori .pa,
  :global(.row:hover) .pactions.a-favori .pa,
  :global(.tr:hover) .pactions.a-favori .pa{opacity:1}

  .pa{width:28px; height:28px; border-radius:8px; border:1px solid transparent; background:transparent;
    color:var(--v2-txt3); cursor:pointer; display:grid; place-items:center; padding:0}
  .pa:hover:not(:disabled){color:var(--v2-txt); border-color:var(--v2-line2); background:var(--v2-surface2)}
  .pa:disabled{opacity:.4; cursor:default}
  .pa svg{width:14px; height:14px}
  .coeur.on{color:var(--v2-danger)}
  .coeur.on:hover:not(:disabled){color:var(--v2-danger)}

  /* Sans survol possible, rien ne peut rester en réserve : c'est le tactile
     qui paierait le plus cher une affordance pensée à la souris. */
  @media (hover:none){
    .pactions, .pactions.a-favori .pa{opacity:1}
  }
</style>
