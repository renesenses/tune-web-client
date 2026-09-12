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
   * | tag | étiqueter |
   *
   * `PochetteActions` en pose cinq sur une pochette ; en poser huit sur une
   * ligne de titre ferait de chaque ligne un tableau de bord. Ce qui manque —
   * aller à l'album — se fait déjà depuis la pochette.
   *
   * 🔴 L'ÉTIQUETTE a rejoint la liste le 05/09/2026. Bertrand : « on doit
   * pouvoir tagger tous les objets audio, pas uniquement les albums ».
   *
   * Elle en était exclue au motif qu'« étiqueter se fait déjà depuis la
   * pochette ». Ce raisonnement vaut pour un album, qui A une pochette
   * porteuse de gestes ; il ne vaut pas pour une piste, dont la vignette de
   * ligne n'est qu'une image. Le serveur, lui, accepte `track` sur
   * `/tags/for/{type}/{id}` depuis toujours — mesuré sur le .18 : HTTP 200,
   * comme `album` et `artist`. C'est le client qui ne le proposait pas.
   *
   * Elle n'apparaît que sur une piste de la BIBLIOTHÈQUE : une piste de
   * service n'a pas d'identifiant numérique à donner à la route.
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
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import { queuePosition } from '../../lib/stores/queue';
  import {
    favoriteTrackIds, favoriteStreamingKeys,
    favoriteStreamingTrackKeys, clePisteJumelee,
  } from '../../lib/stores/profile';
  import { basculerFavoriLocal } from '../../lib/favorisLocaux';
  import { favKeyOf, toggleStreamingFavorite } from '../../lib/streamingFavorites';
  import { notifications } from '../../lib/stores/notifications';
  import { activeView, gestesNavigationService, pendingLibraryAlbum, pendingLibraryArtist } from '../../lib/stores/navigation';
  import { destinationAlbum } from '../../lib/routageAlbum';
  import { t } from '../../lib/i18n';
  import MenuPisteV2 from './MenuPisteV2.svelte';
  import { entreesMenuPiste } from '../../lib/menuPiste';
  import type { Track } from '../../lib/types';

  interface Props {
    piste: Track;
  }
  let { piste }: Props = $props();

  /** La modale de playlists est portée ICI, chargée à la demande : chaque
   *  écran qui pose la barre l'aurait sinon recopiée, avec son état et son
   *  import. C'est ce que fait déjà `PochetteActions` pour les étiquettes. */
  let modalePlaylist = $state(false);
  let panneauEtiquettes = $state(false);
  let panneauVersions = $state(false);
  /** L'ancre du menu « … » : sa position ÉCRAN, relevée au clic. */
  let ancreMenu = $state<DOMRect | null>(null);

  const local = $derived(estPisteLocale(piste));
  /**
   * 🔴 La clé passe par `favKeyOf`, JAMAIS par `streamingFavKey` en direct.
   *
   * `streamingFavKey` est une concaténation : elle rend une clé pour
   * n'importe quoi. `favKeyOf` est le garde — il refuse un identifiant vide,
   * et depuis #3729 un identifiant PARTAGÉ. Ce composant appelait la
   * concaténation et contournait donc le garde : le garde était écrit, il
   * n'était pas branché ici. Sur une ligne de radio, la clé valait
   * `track:radio:<url du flux>`, la même pour tous les titres de la station,
   * et un seul favori remplissait tous les cœurs (Reivax66, 09/09/2026).
   */
  const cleService = $derived(
    !local && piste.source && piste.source_id
      ? favKeyOf({ itemType: 'track', service: String(piste.source), serviceId: String(piste.source_id) })
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
    // Un toast, donc le chemin commun : `signalerEchecLecture` journalise,
    // accole le message du serveur au lieu du seul « Impossible de lire ce
    // titre », et n'empile pas deux bandeaux identiques (#3732).
    playAndSync(zid, corps as any).catch(signalerEchecLecture);
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

  /* ------------------------------------------------------------------ *
   * Le menu « … » — les gestes que la barre d'icônes ne porte pas.
   *
   * Bertrand, 07/09/2026, capture du client ACTUEL à l'appui : « continue sur
   * le bouton … je veux à minima le contenu de la v0 ». Le client actuel a ce
   * menu depuis longtemps (`TrackContextMenu`) ; trois de ses gestes n'avaient
   * AUCUNE porte ici — « Plus comme ça », « Autres versions » et « Aller à
   * l'artiste ».
   * ------------------------------------------------------------------ */

  /**
   * « Plus comme ça » — une file de titres acoustiquement voisins.
   *
   * Le rapprochement est le SERVEUR qui le fait (`/library/tracks/{id}/similar`,
   * mesuré sur le .18 : 5 voisins rendus pour la piste 2450). Sans empreinte
   * audio calculée, la réponse est VIDE : on le dit, plutôt que de ne rien
   * faire en silence — c'est déjà la règle du client actuel.
   */
  async function plusCommeCa() {
    const zid = $currentZoneId;
    if (zid == null || piste.id == null) return;
    try {
      const res = await api.getSimilarTracks(piste.id, 50);
      const ids = (res.items ?? [])
        .map((x: any) => x.id)
        .filter((x: any): x is number => typeof x === 'number');
      if (ids.length === 0) { notifications.info($t('library.noSimilar' as any)); return; }
      await playAndSync(zid, { track_ids: ids } as any);
    } catch {
      notifications.error($t('library.similarError' as any));
    }
  }

  /**
   * « Aller à l'artiste » / « Aller à l'album » : on POSE la cible puis on
   * change de vue — le même contrat que les liens de la lecture en cours.
   * Le composant ne sait pas naviguer, et n'a pas à le savoir.
   */
  /**
   * L'album et l'artiste de la piste CHEZ SON SERVICE — #3777, famille C.
   *
   * `null` dès que la coquille ne sait pas les ouvrir : l'entrée disparaît
   * alors, au lieu d'ouvrir sur rien. C'est la règle du menu — absent, pas
   * grisé. La coquille ACTUELLE arme désormais ces gestes elle aussi (#888),
   * vers `StreamingView` ; la garde reste, pour tout montage qui n'arme rien.
   */
  const albumDeService = $derived.by(() => {
    if (local || !$gestesNavigationService) return null;
    const d = destinationAlbum({
      source: piste.source ?? null,
      album_id: (piste as any).album_id,
      album_title: piste.album_title ?? null,
    });
    return d?.type === 'album-service'
      ? { service: d.service, albumId: d.albumId, titre: d.titre }
      : null;
  });
  const artisteDeService = $derived.by(() => {
    if (local || !$gestesNavigationService) return null;
    const nom = (piste.artist_name ?? '').trim();
    return piste.source && nom ? { service: piste.source as string, nom } : null;
  });

  function allerArtiste() {
    if (piste.artist_id != null) {
      pendingLibraryArtist.set(piste.artist_id);
      activeView.set('library');
      return;
    }
    if (artisteDeService) $gestesNavigationService?.ouvrirArtiste(artisteDeService);
  }
  function allerAlbum() {
    // 🔴 L'identifiant de BIBLIOTHÈQUE d'abord : une piste locale garde son
    // chemin, et rien ne doit le détourner. `album_id` d'une piste de service
    // est une CHAÎNE — `routageAlbum` tranche, ici on ne devine pas.
    if (typeof piste.album_id === 'number' && piste.album_id > 0) {
      pendingLibraryAlbum.set(piste.album_id);
      activeView.set('library');
      return;
    }
    if (albumDeService) $gestesNavigationService?.ouvrirAlbum(albumDeService);
  }

  /**
   * Le CONTENU du menu est décidé par `lib/menuPiste`, pas ici.
   *
   * Une garde écrite contre ce composant ne pourrait que lire son texte, et un
   * texte présent ne prouve pas qu'il s'exécute : la première version de la
   * garde restait verte quand on préfixait une entrée d'un `if (false)`
   * (contre-épreuve n° 1, 07/09/2026). Le module, lui, s'appelle.
   */
  const entrees = $derived(
    entreesMenuPiste(
      {
        jouable,
        // Les trois routes de bibliothèque prennent un `i64` : une piste de
        // service n'a ni voisins acoustiques, ni versions, ni étiquettes.
        idBibliotheque: local && piste.id != null ? piste.id : null,
        artistId: piste.artist_id ?? null,
        albumId: typeof piste.album_id === 'number' ? piste.album_id : null,
        albumDeService,
        artisteDeService,
      },
      {
        lire: () => lire(new MouseEvent('click')),
        ensuite: () => void ensuite(new MouseEvent('click')),
        aLaFile: () => void aLaFile(new MouseEvent('click')),
        plusCommeCa: () => void plusCommeCa(),
        autresVersions: () => (panneauVersions = true),
        ajouterAPlaylist: () => (modalePlaylist = true),
        allerArtiste,
        allerAlbum,
        etiqueter: () => (panneauEtiquettes = true),
      },
    ),
  );

  function ouvrirMenu(e: MouseEvent) {
    stop(e);
    ancreMenu = (e.currentTarget as HTMLElement).getBoundingClientRect();
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
  {#if local && piste.id != null}
    <button class="pa" class:on={panneauEtiquettes} aria-expanded={panneauEtiquettes}
            onclick={(e) => { e.stopPropagation(); panneauEtiquettes = !panneauEtiquettes; }}
            title={$t('v2.cover.tags' as any)} aria-label={$t('v2.cover.tags' as any)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l8.58-8.58a1 1 0 0 0 0-1.42z"/>
        <circle cx="6.5" cy="6.5" r="1.2" fill="currentColor"/>
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
  <!-- 🔴 Le « … », dernier de la barre, comme dans le client actuel. Il NOMME
       ce que les icônes font sans le dire, et il porte les gestes qu'aucune
       icône ne porte. Absent quand il n'aurait rien à offrir — une piste qu'on
       ne sait pas désigner. -->
  {#if entrees.length}
    <button class="pa" class:on={ancreMenu != null} aria-haspopup="menu" aria-expanded={ancreMenu != null}
            onclick={ouvrirMenu} title={$t('library.moreOptions' as any)}
            aria-label={$t('library.moreOptions' as any)}>
      <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>
      </svg>
    </button>
  {/if}
</span>

{#if ancreMenu}
  <MenuPisteV2 ancre={ancreMenu} {entrees} onClose={() => (ancreMenu = null)} />
{/if}

{#if panneauVersions && piste.id != null}
  {#await import('./VersionsPistePanneau.svelte') then m}
    <m.default trackId={piste.id} titre={piste.title}
      onClose={() => (panneauVersions = false)} />
  {/await}
{/if}

{#if panneauEtiquettes && piste.id != null}
  {#await import('./EtiquettesPanneau.svelte') then m}
    <m.default itemType="track" itemId={piste.id} nom={piste.title}
      onClose={() => (panneauEtiquettes = false)} />
  {/await}
{/if}

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
