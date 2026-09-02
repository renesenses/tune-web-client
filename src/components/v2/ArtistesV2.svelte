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
   * La vue de l'écran actuel : une grille d'ARTISTES, avatar rond, nom, nombre
   * d'albums, et un rail A–Z. Les artistes viennent de `/library/artists`,
   * leur propre table — pas d'une déduction depuis les albums.
   *
   * On ouvre un artiste pour voir ses albums, comme aujourd'hui.
   *
   * ## Les cinq actions
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
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { currentZoneId } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import type { Album, Artist } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';
  import RenommerModale from './RenommerModale.svelte';

  interface Props {
    /** Filtre texte partagé avec le reste de l'écran. */
    q?: string;
  }
  let { q = '' }: Props = $props();

  let artistes = $state<Artist[]>([]);
  let chargement = $state(true);
  let erreur = $state<string | null>(null);

  /** Artiste ouvert — on montre ses albums. */
  let ouvert = $state<Artist | null>(null);
  let albums = $state<Album[]>([]);
  let albumsChargement = $state(false);
  let albumOuvert = $state<Album | null>(null);
  let enEdition = $state<Artist | null>(null);

  /** Sans accents ni casse : « Éric » doit se ranger et se chercher comme « Eric ». */
  const plier = (s: string | null | undefined) =>
    (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const affiches = $derived.by(() => {
    const aiguille = plier(q);
    const liste = aiguille
      ? artistes.filter((a) => plier(a.name).includes(aiguille))
      : artistes;
    return [...liste].sort((x, z) => plier(x.name).localeCompare(plier(z.name)));
  });

  /** Première lettre, chiffres et symboles rassemblés sous « # ». */
  function lettre(a: Artist): string {
    const c = plier(a.name).charAt(0).toUpperCase();
    return c >= 'A' && c <= 'Z' ? c : '#';
  }
  const ALPHABET = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
  const presentes = $derived(new Set(affiches.map(lettre)));

  let grilleEl = $state<HTMLElement | null>(null);
  function sauter(L: string) {
    grilleEl?.querySelector<HTMLElement>(`[data-lettre="${L}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  async function ouvrir(a: Artist) {
    ouvert = a;
    albums = [];
    albumsChargement = true;
    try {
      albums = (await api.getArtistAlbums(a.id!)) ?? [];
    } catch {
      albums = [];
    }
    albumsChargement = false;
  }

  async function lireArtiste(a: Artist) {
    const zid = $currentZoneId;
    if (zid == null) {
      notifications.error($t('v2.art.noZone' as any));
      return;
    }
    try {
      const liste = (await api.getArtistAlbums(a.id!)) ?? [];
      const premier = liste.find((x) => x?.id != null);
      if (!premier) {
        notifications.error($t('v2.art.noAlbum' as any));
        return;
      }
      await api.play(zid, { album_id: premier.id! });
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
  }

  function lireAlbum(al: Album) {
    const zid = $currentZoneId;
    if (zid == null || al.id == null) return;
    api.play(zid, { album_id: al.id }).catch(() => {});
  }

  /**
   * Une à deux initiales, LETTRES ET CHIFFRES seulement.
   *
   * Sans le filtre, « Accentus - Laurence E. » donnait « A- » : le tiret est
   * un mot pour `split`, sa première lettre est le tiret lui-même. Constaté
   * sur capture le 02/09/2026, avec « A- » débordant de son cercle.
   */
  const initiales = (n: string | null | undefined) =>
    (n ?? '')
      .split(/\s+/)
      .map((m) => m.replace(/[^\p{L}\p{N}]/gu, '').charAt(0))
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();

  onMount(() => {
    void charger();
  });
</script>

{#if ouvert}
  {@const artiste = ouvert}
  <header class="fiche">
    <button class="retour" onclick={() => (ouvert = null)}>← {$t('common.back' as any)}</button>
    <div class="ident">
      <span class="av">
        <AlbumArt coverPath={artiste.image_path} size={0} alt={artiste.name} round
          fallbackInitials={initiales(artiste.name)} />
      </span>
      <div>
        <h1>{artiste.name}</h1>
        <p class="cpt">{albums.length} {$t('v2.art.albums' as any)}</p>
      </div>
    </div>
  </header>

  {#if albumsChargement}
    <div class="etat">{$t('common.loading' as any)}</div>
  {:else if !albums.length}
    <div class="etat">{$t('v2.art.noAlbum' as any)}</div>
  {:else}
    <div class="grille">
      {#each albums as al (al.id)}
        <div class="carte">
          <div class="cv">
            <PochetteActions
              favori={al.id != null ? { albumId: al.id } : null}
              etiquettes={al.id != null ? { itemType: 'album', itemId: al.id } : null}
              onLire={() => lireAlbum(al)}
              onOuvrir={() => (albumOuvert = al)}
              nom={al.title}
            >
              <AlbumArt coverPath={al.cover_path} albumId={al.id} size={0} alt={al.title}
                fallbackInitials={al.title?.slice(0, 1)} />
            </PochetteActions>
          </div>
          <button class="meta" onclick={() => (albumOuvert = al)}>
            <span class="ct">{al.title}</span>
            <span class="ca">{al.year ?? ''}</span>
          </button>
        </div>
      {/each}
    </div>
  {/if}

  {#if albumOuvert}
    <AlbumDetailV2 album={albumOuvert} depot={null} onClose={() => (albumOuvert = null)} />
  {/if}

{:else if chargement}
  <div class="etat">{$t('common.loading' as any)}</div>
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
          <div class="cv rond">
            <PochetteActions
              favori={a.id != null ? { artistId: a.id } : null}
              etiquettes={a.id != null ? { itemType: 'artist', itemId: a.id } : null}
              onEditer={a.id != null ? () => (enEdition = a) : null}
              onLire={() => lireArtiste(a)}
              onOuvrir={() => ouvrir(a)}
              nom={a.name}
            >
              <AlbumArt coverPath={a.image_path} size={0} alt={a.name} round
                fallbackInitials={initiales(a.name)} />
            </PochetteActions>
          </div>
          <!-- Avatar et nom, rien d'autre — comme l'écran actuel.
               `/library/artists` ne rend PAS de nombre d'albums (vérifié sur le
               .18 le 02/09/2026 : bio, discogs_id, id, image_path,
               image_source, musicbrainz_id, name, sort_name). L'afficher
               demanderait une requête par artiste, et en inventer un serait
               pire que de n'en montrer aucun. -->
          <button class="meta centre" onclick={() => ouvrir(a)}>
            <span class="ct">{a.name}</span>
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
  /* L'avatar est ROND, comme dans l'écran actuel — c'est ce qui distingue une
     carte d'artiste d'une carte d'album au premier coup d'œil. */
  .cv.rond { border-radius: 50%; }
  .cv :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  /*
    Les initiales sont CENTRÉES dans leur cercle et ne le débordent pas.
    `AlbumArt` les dimensionne à 32 % de la largeur du conteneur, ce qui
    convient à une seule lettre : à deux, plus l'interlettrage, le mot dépassait
    et le rognage du cercle en montrait un morceau décalé — c'est ce que
    montrait la capture de Bertrand. On resserre, et on interdit le retour à la
    ligne, qui décentrerait verticalement.
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
  .ca {
    display: block; margin-top: 2px;
    font: 11px var(--v2-mono); color: var(--v2-txt3);
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

  .fiche { padding: 18px 30px 6px; }
  .retour {
    background: transparent; border: 0; color: var(--v2-txt2); cursor: pointer;
    font: 600 13px var(--v2-sans); padding: 0 0 10px;
  }
  .retour:hover { color: var(--v2-txt); }
  .ident { display: flex; align-items: center; gap: 16px; }
  .av { display: block; width: 84px; height: 84px; border-radius: 50%; overflow: hidden; flex: none; }
  .av :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .fiche h1 { font-size: 26px; font-weight: 800; letter-spacing: -.01em; }
  .cpt { font: 11px var(--v2-mono); color: var(--v2-txt3); margin-top: 4px; }
</style>
