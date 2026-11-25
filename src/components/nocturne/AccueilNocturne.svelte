<script lang="ts">
  /**
   * Accueil Nocturne : des rangées de pochettes par thème.
   *  1. Écoutés récemment (historique, rapproché des albums de la bibliothèque)
   *  2. Ajoutés récemment
   *  3. Albums favoris (du profil courant)
   *  4. Les genres les plus fournis de la bibliothèque, une rangée chacun
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import type { Album } from '../../lib/types';
  import { demanderBibliothequeEntiere } from '../../lib/stores/albumsPagines';
  import { albums as albumsBibliotheque } from '../../lib/stores/library';
  import { favoriteAlbumIds, profiles, currentProfileId } from '../../lib/stores/profile';
  import RangeeNocturne from './RangeeNocturne.svelte';
  import { rangeesParGenre } from './triNocturne';

  let recents = $state<Album[]>([]);
  let ecoutes = $state<{ album_id?: number | null; album_title?: string | null; artist_name?: string | null }[]>([]);
  let chargement = $state(true);

  $effect(() => {
    void demanderBibliothequeEntiere().catch(() => []).finally(() => (chargement = false));
    void api.getRecentAlbums(30).then((l) => (recents = l ?? [])).catch(() => {});
    void api.getPlaybackHistory(80).then((r) => (ecoutes = r?.items ?? [])).catch(() => {});
  });

  const tout = $derived($albumsBibliotheque);
  const nom = $derived.by(() => { const p = $profiles.find((x) => x.id === $currentProfileId); return p?.display_name || p?.name || ''; });
  const soir = new Date().getHours() >= 18 || new Date().getHours() < 5;
  const salutation = $derived(
    nom
      ? $t(soir ? 'v2.home.greetEvening' : 'v2.home.greetDay').replace('{nom}', nom)
      : $t(soir ? 'v2.home.greetEveningPlain' : 'v2.home.greetDayPlain'),
  );
  const favoris = $derived(tout.filter((a) => a.id != null && $favoriteAlbumIds.has(a.id)));
  const genres = $derived(rangeesParGenre(tout));

  /** Les écoutes ramenées à des albums de la bibliothèque, sans doublon, dans l'ordre. */
  const ecoutesAlbums = $derived.by(() => {
    if (!ecoutes.length || !tout.length) return [] as Album[];
    const parId = new Map(tout.map((a) => [a.id, a]));
    const parNom = new Map(tout.map((a) => [`${a.title}\u0000${a.artist_name ?? ''}`.toLowerCase(), a]));
    const vus = new Set<number | null>();
    const out: Album[] = [];
    for (const e of ecoutes) {
      const a = (e.album_id != null ? parId.get(e.album_id) : undefined)
        ?? parNom.get(`${e.album_title ?? ''}\u0000${e.artist_name ?? ''}`.toLowerCase());
      if (a && !vus.has(a.id)) { vus.add(a.id); out.push(a); }
      if (out.length >= 20) break;
    }
    return out;
  });
</script>

<div class="noc-accueil">
  <header class="noc-accueil-entete">
    <h1>{salutation}</h1>
    {#if tout.length}
      <p>{[`${tout.length} ${$t('v2.home.sAlbums')}`, favoris.length ? `${favoris.length} ♥` : ''].filter(Boolean).join(' · ')}</p>
    {:else if chargement}
      <p>{$t('common.loading')}</p>
    {/if}
  </header>

  <RangeeNocturne titre={$t('v2.home.wRecentlyPlayed')} albums={ecoutesAlbums} triable={false} />
  <RangeeNocturne titre={$t('v2.home.wRecentlyAdded')} albums={recents} triable={false} />
  <RangeeNocturne titre={$t('v2.home.wFavorites')} albums={favoris} />
  {#each genres as g (g.genre)}
    <RangeeNocturne titre={g.genre} albums={g.albums} />
  {/each}

  {#if !chargement && !tout.length && !recents.length}
    <p class="noc-vide">{$t('v2.home.widgetEmpty')}</p>
  {/if}
</div>

<style>
  .noc-accueil { padding-bottom: 40px; }
  .noc-accueil-entete { padding-top: 34px; }
  .noc-accueil-entete h1 {
    margin: 0;
    line-height: 1.15;
    font-size: var(--noc-taille-accueil);
    font-weight: var(--noc-graisse-titre);
    letter-spacing: var(--noc-interlettre-titre);
    color: var(--noc-texte);
  }
  .noc-accueil-entete p {
    margin: 2px 0 0;
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-sous-titre);
  }
  .noc-vide { color: var(--noc-texte-3); margin-top: 40px; }
</style>
