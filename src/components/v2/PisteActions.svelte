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
  import {
    favoriteTrackIds, favoriteStreamingKeys, streamingFavKey,
    favoriteStreamingTrackKeys, clePisteJumelee,
  } from '../../lib/stores/profile';
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
  /**
   * Une piste locale est aussi favorite quand son JUMEAU distant l'est.
   *
   * Bertrand, 05/09/2026. C'est ce que fait deja le serveur pour les regles :
   * `track_favorites_sub` unit les favoris locaux et les pistes locales dont le
   * titre et l'artiste normalises correspondent a un favori de streaming. Le
   * cœur disait le contraire.
   *
   * ⚠️ Consequence assumee, et choisie par Bertrand : un cœur plein PAR JUMEAU
   * qu'on clique cree le favori LOCAL — l'aspect ne change pas, puisqu'il etait
   * deja plein. Un second clic retire le local, et le cœur reste plein par le
   * jumeau. Le geste parait donc sans effet ; il ne l'est pas.
   */
  const parJumeau = $derived(
    local && $favoriteStreamingTrackKeys.has(clePisteJumelee(piste.title, piste.artist_name)),
  );
  const favori = $derived(
    local
      ? $favoriteTrackIds.has(piste.id!) || parJumeau
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
    <!-- Une LISTE dont la lecture entre en tete. L'icone precedente etait
         `skip-forward` — celle de « piste suivante » de la barre de transport :
         deux gestes tres differents sous le meme dessin. -->
    <button class="pa" onclick={ensuite} disabled={occupe}
            title={$t('v2.pa.next' as any)} aria-label={$t('v2.pa.next' as any)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M4 7h9M4 12h9M4 17h6"/>
        <path d="M16 5.6l4.8 2.9-4.8 2.9z" fill="currentColor" stroke="none"/>
      </svg>
    </button>
    <button class="pa" onclick={aLaFile} disabled={occupe}
            title={$t('v2.pa.queue' as any)} aria-label={$t('v2.pa.queue' as any)}>
      <!-- La MEME liste, un plus a la fin : c'est l'accent qui distingue les
           deux gestes, pas le dessin. -->
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M4 7h11M4 12h11M4 17h7"/>
        <path d="M18 14.5v6M15 17.5h6"/>
      </svg>
    </button>
  {/if}
  {#if jouable}
    <button class="pa" onclick={(e) => { stop(e); modalePlaylist = true; }}
            title={$t('v2.pa.playlist' as any)} aria-label={$t('v2.pa.playlist' as any)}>
      <!-- 🔴 Le glyphe des PLAYLISTS, celui de la barre laterale — pas une
           disquette. Bertrand, 05/09/2026 : « l'icone enregistrer pas
           adaptee ». Une disquette dit « enregistrer un fichier », ce qui n'est
           pas le geste : on range un titre dans une liste. Reprendre le dessin
           que la barre laterale porte deja pour « Playlists » le rend lisible
           sans legende. -->
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 7h11M4 12h11M4 17h7"/>
        <path d="M18 15V8l3 .6"/>
        <circle cx="16" cy="16" r="2"/>
      </svg>
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
  /*
    🔴 VISIBLES EN PERMANENCE (Bertrand, 05/09/2026).

    La regle d'origine etait la sienne — « ces boutons ne s'affichent qu'au
    survol de la piste avec la souris » — et elle a ete appliquee. Il est
    revenu deux fois : « PAs de boutons au survol !! », puis « Ma demande de
    coloriser les icones !! ». Coloriser des icones qu'on ne voit pas n'a
    aucun sens : la consigne de couleur a rendu la consigne de survol
    intenable, et c'est la couleur qui gagne.

    Ce que le survol garde : le RENFORCEMENT de chaque bouton — cadre et fond
    — au moment ou on le vise. Il revele plus rien.
  */
  .pactions{display:inline-flex; align-items:center; gap:2px; flex:0 0 auto}

  /* La couleur du THEME. En gris de texte, les icones se confondaient avec la
     duree et le badge de qualite juste a cote : ce sont des ACTIONS, pas de
     l'information. */
  /* 🔴 Chaque couleur porte un REPLI vers le jeton du client actuel.
     Ce composant vit maintenant aussi dans des ecrans de l'ancien client
     montes par la coquille v2 — Ambiance, Oxygen, Repertoires — ou les jetons
     `--v2-*` ne sont pas definis. Sans repli, `color:var(--v2-acc1)` y est
     invalide et l'icone prend une couleur heritee au hasard. */
  .pa{width:28px; height:28px; border-radius:8px; border:1px solid transparent; background:transparent;
    color:var(--v2-acc1, var(--tune-accent, currentColor)); cursor:pointer;
    display:grid; place-items:center; padding:0}
  .pa:hover:not(:disabled){color:var(--v2-acc-tint, var(--tune-accent, currentColor));
    border-color:var(--v2-acc2, var(--tune-border, transparent));
    background:var(--v2-acc-soft, var(--tune-surface-hover, transparent))}
  .pa:disabled{opacity:.4; cursor:default}
  .pa svg{width:14px; height:14px}

  /* Le coeur ACTIF garde le rouge : c'est un ETAT, pas une action. Aux
     couleurs du theme il ne se distinguerait plus des quatre autres, et on ne
     saurait plus d'un coup d'oeil quels titres sont en favori. */
  .coeur.on{color:var(--v2-danger, #ef4444)}
  .coeur.on:hover:not(:disabled){color:var(--v2-danger, #ef4444);
    border-color:var(--v2-danger-bd, #ef4444); background:transparent}
</style>
