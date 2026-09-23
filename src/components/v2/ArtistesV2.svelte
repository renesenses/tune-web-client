<script lang="ts">
  /**
   * Onglet « Artistes » de la Bibliothèque — refait.
   *
   * ## Ce qu'il était
   *
   * Une FACETTE des albums : une section par artiste, avec ses albums en
   * dessous. Ce n'est pas une vue d'artistes, c'est la vue Albums rangée
   * autrement. Sur la bibliothèque de Bertrand, cela donnait une page où
   * chaque artiste occupait toute la hauteur pour un seul album, sans avatar
   * ni compte (constaté sur capture, 02/09/2026).
   *
   * Surtout, elle ne montrait que les artistes PORTÉS PAR UN ALBUM chargé.
   * Un artiste sans album en base — ou dont les albums n'étaient pas encore
   * arrivés — n'existait pas.
   *
   * ## Ce qu'il est
   *
   * La vue de l'écran actuel : une grille d'ARTISTES — pochette carrée, au
   * même format que celle d'un album —, nom, et un rail A–Z. Les artistes
   * viennent de `/library/artists`, leur propre table — pas d'une déduction
   * depuis les albums.
   *
   * ## Ce qu'il n'est PLUS — #1501
   *
   * Bertrand, 23/09/2026, suite à #1494 : « l'onglet Artistes de la
   * Bibliothèque garde sa grille, le clic ouvre la page artiste commune, et sa
   * fiche propre est retirée ».
   *
   * Cet écran portait un CALQUE de détail (`#library/artiste:<id>`) avec cinq
   * blocs — édition, étiquettes, enrichissement et biographie, « À propos »,
   * signalement. Depuis #1485, la page commune (`ArtisteServiceV2`, vue
   * `streamingartist`) sait montrer un artiste LOCAL et porte ces cinq blocs,
   * conditionnés à `estLocal`. Depuis #1494, tous les autres points d'entrée
   * (Recherche, actions et menus de piste, Lecture en cours, fiche d'album) y
   * mènent. Cet onglet était le dernier à ouvrir SA fiche : deux pages pour un
   * même artiste, qui auraient divergé au premier correctif.
   *
   * 🔴 Le clic passe donc par `ouvrirArtisteDepuis` — le chemin UNIQUE de la
   * bifurcation local / service (#1494) — et jamais par une recopie :
   * `vueArtisteUnique1494.test.ts` l'interdit. La page commune est une VUE,
   * pas un calque dans une vue : le changement de vue écrit son entrée
   * d'historique, il n'y a plus de clé composée à tenir, et son Retour ramène
   * ici parce que `vueDeRetour` vaut `'library'`.
   *
   * ## Les actions de la vignette
   *
   * L'artiste les a toutes : le favori et les étiquettes existaient déjà côté
   * serveur (`LOCAL_ITEM_TYPES` et `TAGGABLE_ITEM_TYPES` contiennent
   * `artist`), et `PUT /library/artists/{id}` accepte nom, nom de tri et
   * biographie.
   *
   * ⚠️ Le cœur d'artiste n'avait JAMAIS été proposé nulle part avant l'écran
   * actuel : la route et le magasin existaient, aucun écran ne passait
   * `artistId`. C'est ce qui explique le zéro absolu d'artistes favoris en
   * base, mieux que la discrétion du bouton.
   *
   * La lecture passe par le premier album : `POST /zones/{id}/play` n'accepte
   * pas d'`artist_id`. Même compromis que pour les collections.
   */
  import { onMount } from 'svelte';
  import { saveDetailScroll, restoreDetailScroll } from '../../lib/stores/navigation';
  import { ouvrirArtisteDepuis } from '../../lib/ouvrirArtisteDepuis';
  import { sauterVersAncre } from '../../lib/sautAlphabetique';
  import { initialesArtiste } from '../../lib/initialesArtiste';
  import { dansSource, sourceCorrespond, compterSources, type ComptesArtistesSources } from '../../lib/provenanceBibliotheque';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import type { Artist } from '../../lib/types';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import RenommerModale from './RenommerModale.svelte';

  interface Props {
    /** Filtre texte partagé avec le reste de l'écran. */
    q?: string;
    /** Source partagée avec Albums/Pistes ; un artiste peut en avoir plusieurs. */
    provenance?: string | null;
    sourcesArtistes?: Map<number, Set<string>>;
    sourcesEnCharge?: boolean;
    erreurSources?: string | null;
    onComptesSources?: (comptes: ComptesArtistesSources) => void;
    /**
     * PORTÉE À UN RÉPERTOIRE — les identifiants des artistes à montrer, ou
     * `null` quand aucune portée n'est posée.
     *
     * `/library/artists` n'a pas de facette `folder` : la portée arrive donc
     * déjà résolue, depuis les albums du dossier que la Bibliothèque a
     * demandés. Sans elle, choisir un répertoire laissait TOUS les artistes à
     * l'écran sous la puce du dossier — renesenses/tune-server-rust#3101.
     */
    idsPortee?: Set<number> | null;
    /** Le nom du dossier, pour le dire quand la portée ne rend aucun artiste. */
    nomPortee?: string | null;
  }
  let { q = '', provenance = null, sourcesArtistes = new Map(), sourcesEnCharge = false, erreurSources = null, onComptesSources, idsPortee = null, nomPortee = null }: Props = $props();

  let artistes = $state<Artist[]>([]);
  let chargement = $state(true);
  let erreur = $state<string | null>(null);
  let enEdition = $state<Artist | null>(null);

  /**
   * LE RETOUR REPOSE OÙ L'ON ÉTAIT — #864, tenu à travers #1501.
   *
   * « Bibliothèque → Artistes → choix de l'artiste → album(s) → retour → haut
   * de la page » (Jean Valjean, fil 1671). Hier le calque retirait la grille
   * du DOM ; aujourd'hui c'est la VUE entière qui change (`ShellV2` démonte
   * `LibraryV2`), et le Retour de la page commune la remonte à neuf. Dans les
   * deux cas le navigateur n'a plus de conteneur dont restaurer le `scrollTop`.
   *
   * Même remède : la position est mémorisée AVANT de partir, et reposée quand
   * la grille est de nouveau là. La cible est une FONCTION, pas l'élément : au
   * montage la branche « liste » n'est pas encore rendue et `grilleEl` vaut
   * `null` — `restoreDetailScroll` la résout à chaque trame jusqu'à ce que le
   * contenu puisse tenir la position.
   */
  const CLE_DEFILEMENT = 'v2:artistes';

  /**
   * Le clic sur une carte — #1501.
   *
   * `source: 'local'` : un artiste de cette grille vient de `/library/artists`,
   * et `ouvrirArtisteDepuis` en fait la page commune ouverte sur un artiste de
   * la BIBLIOTHÈQUE (`service: null`). `'library'` est la vue de RETOUR : la
   * page referme vers cette grille, et non vers la Recherche d'où l'on serait
   * venu plus tôt — le dépôt n'appartient qu'au geste qui l'a posé.
   *
   * `provenance` suit le geste (#4201) : sous « Source · Sonos », la page ne
   * montre et ne joue que ce qui vient de Sonos, comme la fiche le faisait.
   */
  function ouvrirArtiste(a: Artist) {
    // AVANT de basculer : la vue va être démontée, et une position mesurée
    // après coup vaudrait toujours zéro.
    saveDetailScroll(CLE_DEFILEMENT, () => grilleEl);
    void ouvrirArtisteDepuis({ id: a.id, name: a.name, source: 'local' }, 'library', { provenance });
  }

  /** Sans accents ni casse : « Éric » doit se ranger et se chercher comme « Eric ». */
  const plier = (s: string | null | undefined) =>
    (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /** Les artistes que la PORTÉE laisse passer — tous, sans portée. */
  const dansLaPortee = $derived(
    idsPortee == null ? artistes : artistes.filter((x) => x.id != null && idsPortee!.has(x.id)),
  );
  const artistesRecherche = $derived(dansLaPortee.filter(a => plier(a.name).includes(plier(q))));
  const affiches = $derived(artistesRecherche.filter(a => provenance == null ||
    [...(sourcesArtistes.get(a.id!) ?? [])].some(s => sourceCorrespond(s, provenance)))
    .sort((x, z) => plier(x.name).localeCompare(plier(z.name))));
  $effect(() => {
    onComptesSources?.({
      total: artistesRecherche.length,
      comptes: compterSources(artistesRecherche.map(a => sourcesArtistes.get(a.id!) ?? [])),
    });
  });

  /** Première lettre, chiffres et symboles rassemblés sous « # ». */
  function lettre(a: Artist): string {
    const c = plier(a.name).charAt(0).toUpperCase();
    return c >= 'A' && c <= 'Z' ? c : '#';
  }
  const ALPHABET = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
  const presentes = $derived(new Set(affiches.map(lettre)));

  let grilleEl = $state<HTMLElement | null>(null);
  /**
   * 🔴 #1487 — même rail, même défaut que la Bibliothèque : les cartes portent
   * `content-visibility:auto` (règle `.carte`), donc une estimation de 210 px
   * tant qu'elles n'ont jamais été rendues. Un saut animé les traverse, les
   * fait rétrécir à leur taille réelle en cours de route, et atterrit plus loin
   * que la lettre demandée — au PREMIER clic seulement. On vise, puis on relit.
   * `grilleEl` est le conteneur défilant (`.grille` porte `overflow-y:auto`).
   */
  function sauter(L: string) {
    sauterVersAncre(grilleEl, `[data-lettre="${L}"]`);
  }

  async function charger() {
    chargement = true;
    erreur = null;
    try {
      // La liste ENTIÈRE : `getArtists` plafonne à 100 par défaut, et une vue
      // d'artistes tronquée à 100 se lit comme une bibliothèque incomplète.
      artistes = await api.getAllArtists();
    } catch (e: any) {
      erreur = e?.message ?? $t('common.error' as any);
      artistes = [];
    }
    chargement = false;
  }

  async function lireArtiste(a: Artist) {
    const zid = $currentZoneId;
    if (zid == null) {
      notifications.error($t('v2.art.noZone' as any));
      return;
    }
    try {
      const liste = (await api.getArtistAlbums(a.id!)) ?? [];
      const premier = liste.find((x) => x?.id != null && dansSource(x, provenance));
      if (!premier) {
        notifications.error($t('v2.art.noAlbum' as any));
        return;
      }
      await playAndSync(zid, { album_id: premier.id! });
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
  }

  /**
   * Une à deux initiales, LETTRES ET CHIFFRES seulement — la règle vit
   * dans `lib/initialesArtiste`, partagée avec la page commune (#1232,
   * étape 1). Rien n'a changé de son comportement.
   */
  const initiales = initialesArtiste;

  onMount(async () => {
    await charger();
    // La grille vient d'être rendue : on repose la position mémorisée avant
    // d'ouvrir la page commune (#864). Sans mémoire, la cible vaut zéro.
    restoreDetailScroll(CLE_DEFILEMENT, () => grilleEl);
  });
</script>

{#if chargement || (provenance != null && sourcesEnCharge)}
  <div class="etat">{$t('common.loading' as any)}</div>
{:else if provenance != null && erreurSources}
  <div class="etat err">{erreurSources}</div>
{:else if erreur}
  <div class="etat err">{erreur}</div>
{:else if !affiches.length}
  <div class="etat">{q ? $t('common.noResult' as any) : $t('library.noArtists' as any)}</div>
{:else}
  <div class="zone">
    <div class="grille artistes" bind:this={grilleEl}>
      {#each affiches as a, i (a.id)}
        <!-- `data-lettre` sur la PREMIÈRE carte de chaque lettre seulement :
             le rail cherche une ancre, et la poser sur toutes ferait viser la
             dernière au lieu de la première. -->
        {@const premiere = i === 0 || lettre(affiches[i - 1]) !== lettre(a)}
        <div class="carte" data-lettre={premiere ? lettre(a) : undefined}>
          <div class="cv">
            <PochetteActions
              favori={a.id != null ? { artistId: a.id } : null}
              etiquettes={a.id != null ? { itemType: 'artist', itemId: a.id } : null}
              onEditer={a.id != null ? () => (enEdition = a) : null}
              onLire={() => lireArtiste(a)}
              onOuvrir={() => ouvrirArtiste(a)}
              nom={a.name}
            >
              <AlbumArt coverPath={a.image_path} size={0} alt={a.name}
                fallbackInitials={initiales(a.name)} />
            </PochetteActions>
          </div>
          <!-- Avatar et nom, rien d'autre — comme l'écran actuel.
               `/library/artists` ne rend PAS de nombre d'albums (vérifié sur le
               .18 le 02/09/2026 : bio, discogs_id, id, image_path,
               image_source, musicbrainz_id, name, sort_name). L'afficher
               demanderait une requête par artiste, et en inventer un serait
               pire que de n'en montrer aucun. -->
          <button class="meta centre" onclick={() => ouvrirArtiste(a)}>
            <span class="ct" title={a.name}>{a.name}</span>
          </button>
        </div>
      {/each}
    </div>

    <!-- Rail A–Z, comme l'écran actuel. Les lettres absentes restent visibles
         mais inertes : les faire disparaître ferait bouger le rail à chaque
         recherche. -->
    <nav class="rail" aria-label="A–Z">
      {#each ALPHABET as L (L)}
        <button class:chaud={presentes.has(L)} disabled={!presentes.has(L)}
          onclick={() => sauter(L)}>{L}</button>
      {/each}
    </nav>
  </div>
{/if}

{#if enEdition}
  {@const cible = enEdition}
  <RenommerModale
    titre={$t('v2.edit.artist' as any)}
    nom={cible.name}
    description={cible.bio ?? ''}
    enregistrer={async (v) => {
      // `PUT /library/artists/{id}` prend `bio`, pas `description` : la modale
      // est générique, la traduction se fait ici.
      await api.updateArtist(cible.id!, { name: v.name, bio: v.description });
      artistes = artistes.map((x) =>
        x.id === cible.id ? { ...x, name: v.name, bio: v.description } : x,
      );
    }}
    onClose={() => (enEdition = null)}
  />
{/if}

<style>
  .zone { display: flex; flex: 1; min-height: 0; }
  .grille {
    flex: 1;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
    gap: 22px 18px;
    align-content: start;
    padding: 8px 30px 40px;
  }
  .carte {
    display: flex;
    flex-direction: column;
    /* Les cartes hors écran ne sont pas rendues : cinq boutons par pochette
       font une trentaine de nœuds, et une bibliothèque peut compter des
       milliers d'artistes. */
    content-visibility: auto;
    contain-intrinsic-size: auto 210px;
  }
  .cv { position: relative; aspect-ratio: 1; border-radius: var(--v2-r-card); overflow: hidden; }
  /*
    Pochettes d'artiste CARRÉES, comme les albums — décision de Bertrand du
    03/09/2026, sur trois mesures :

     1. 1651 artistes sur son serveur, ZÉRO image. La forme ne portait donc
        qu'une pastille d'initiales, jamais un portrait.
     2. Les images d'artistes des services sont déjà carrées — celle de John
        Coltrane chez Qobuz fait 550×550. Un cercle en jetait 21 % (1 − π/4),
        pris sur les bords, là où se trouvent les visages d'un groupe.
     3. Les vignettes d'artiste sont enveloppées dans `PochetteActions`, dont
        le cadre est CARRÉ : les quatre icônes de coin tombaient dans le vide
        autour du disque, sur du fond plutôt que sur l'image.

    Ce qui distingue encore une carte d'artiste d'une carte d'album, c'est le
    nom CENTRÉ — les albums alignent le leur à gauche.

    La forme se décide à DEUX endroits, et c'est le piège : ce rayon-ci, et le
    drapeau `round` d'`AlbumArt`, qui pose un `border-radius: 50%` sur l'image
    elle-même. Le 03/09/2026 seul le premier avait été changé — le cadre était
    carré, le disque à l'intérieur restait rond, et c'est ce que Bertrand
    voyait encore. L'appel à `AlbumArt` de cette grille ne passe donc pas
    `round` ; le portrait ROND de l'en-tête appartient à la page commune.
  */
  .cv :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  /*
    Les initiales sont CENTRÉES dans leur vignette et ne la débordent pas.
    `AlbumArt` les dimensionne à 32 % de la largeur du conteneur, ce qui
    convient à une seule lettre : à deux, plus l'interlettrage, le mot dépassait
    et le rognage en montrait un morceau décalé — c'est ce que montrait la
    capture de Bertrand. On resserre, et on interdit le retour à la ligne, qui
    décentrerait verticalement.
  */
  .cv :global(.placeholder-initials) {
    font-size: 26cqw;
    letter-spacing: 0;
    white-space: nowrap;
    text-align: center;
  }
  .meta {
    display: block; width: 100%; border: 0; background: transparent; padding: 0;
    text-align: left; color: inherit; font: inherit; cursor: pointer;
  }
  .meta.centre { text-align: center; }
  .ct {
    display: block; margin-top: 9px;
    font: 600 12.5px var(--v2-sans); line-height: 1.25;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .etat { padding: 30px; color: var(--v2-txt3); font-size: 13.5px; }
  .etat.err { color: var(--v2-danger); }

  .rail {
    display: flex; flex-direction: column; gap: 1px;
    padding: 8px 10px 8px 2px; align-self: start;
    position: sticky; top: 0;
  }
  .rail button {
    border: 0; background: transparent; cursor: pointer;
    font: 600 10px var(--v2-mono); color: var(--v2-txt3);
    padding: 1px 4px; border-radius: 4px; line-height: 1.35;
  }
  .rail button.chaud { color: var(--v2-txt2); }
  .rail button.chaud:hover { color: var(--v2-on-acc); background: var(--v2-acc1); }
  .rail button:disabled { opacity: .35; cursor: default; }
</style>
