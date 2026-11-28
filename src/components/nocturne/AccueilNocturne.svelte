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
  import { ouvrirTune } from './navigationNocturne';
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

  /* ── Ordre des rangées : réorganisable, retenu sur cet appareil ── */
  const CLE_ORDRE = 'tune-nocturne-ordre-rangees';
  function lireOrdre(): string[] {
    try { const v = JSON.parse(localStorage.getItem(CLE_ORDRE) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  let ordre = $state<string[]>(lireOrdre());
  const rangees = $derived([
    // « sobre » : titre blanc, sans compte ni outils (la rangée d'historique) ;
    // « compte » : le nombre d'albums à côté du titre (pas sur les rangées de genre).
    { id: 'ecoutes', titre: $t('v2.home.wRecentlyPlayed'), albums: ecoutesAlbums, triable: false, sobre: true, compte: false },
    { id: 'recents', titre: $t('v2.home.wRecentlyAdded'), albums: recents, triable: false, sobre: false, compte: true },
    { id: 'favoris', titre: $t('v2.home.wFavorites'), albums: favoris, triable: true, sobre: false, compte: true },
    ...genres.map((g) => ({ id: `genre:${g.genre.toLowerCase()}`, titre: g.genre, albums: g.albums, triable: false, sobre: false, compte: false })),
  ].filter((r) => r.albums.length));
  const rangeesOrdonnees = $derived.by(() => {
    const rang = (id: string) => { const i = ordre.indexOf(id); return i < 0 ? 1000 : i; };
    return rangees.map((r, i) => ({ r, i })).sort((a, b) => rang(a.r.id) - rang(b.r.id) || a.i - b.i).map(({ r }) => r);
  });
  function remonter(id: string) {
    const ids = rangeesOrdonnees.map((r) => r.id);
    const i = ids.indexOf(id);
    if (i <= 0) return;
    [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
    ordre = ids;
    try { localStorage.setItem(CLE_ORDRE, JSON.stringify(ids)); } catch { /* ordre de session */ }
  }

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

  {#each rangeesOrdonnees as r (r.id)}
    <RangeeNocturne titre={r.titre} albums={r.albums} triable={r.triable} triInitial={r.id.startsWith('genre:') ? 'ajout' : null}
      sobre={r.sobre} compte={r.compte} remonter={r.sobre ? null : () => remonter(r.id)} />
  {/each}

  {#if !chargement && !tout.length && !recents.length}
    <p class="noc-vide">{$t('v2.home.widgetEmpty')}</p>
  {/if}

  <!-- Itération 8 : le pied d'aide de la référence, vers l'écran Support de Tune. -->
  <p class="noc-accueil-aide" data-aide-accueil>
    {$t('nocturne.accueil.aide' as any)}
    <button type="button" onclick={() => ouvrirTune('support')}>{$t('nocturne.accueil.ecrireSupport' as any)}</button>
  </p>
</div>

<style>
  .noc-accueil { padding-bottom: 40px; }
  .noc-accueil-entete { padding-top: 34px; }
  .noc-accueil-entete h1 {
    margin: 0;
    line-height: 1.05;
    font-size: var(--noc-taille-accueil);
    font-weight: var(--noc-graisse-titre);
    letter-spacing: var(--noc-interlettre-titre);
    color: var(--noc-texte);
  }
  .noc-accueil-entete p {
    margin: -3px 0 0;
    line-height: 1.25;
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-sous-titre);
  }
  /* Rythme relevé : 34 px de la salutation à la première rangée, 49 px après
     la rangée d'historique (plus serrée que l'écart courant entre rangées). */
  .noc-accueil > :global(.noc-rangee:first-of-type) { margin-top: 34px; }
  .noc-accueil > :global(.noc-rangee.sobre + .noc-rangee) { margin-top: 49px; }
  .noc-vide { color: var(--noc-texte-3); margin-top: 40px; }
  .noc-accueil-aide { margin: var(--noc-ecart-rangees) 0 0; text-align: center; color: var(--noc-texte-3); font-size: var(--noc-taille-petit); }
  .noc-accueil-aide button { padding: 0; border: 0; background: none; color: var(--noc-ambre); font: inherit; font-weight: var(--noc-graisse-moyenne); cursor: pointer; }
  .noc-accueil-aide button:hover { text-decoration: underline; }
</style>
