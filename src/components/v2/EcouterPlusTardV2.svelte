<script lang="ts">
  /**
   * L'écran du sas « Écouter plus tard » — web#1653, FabienM, fil 1986.
   *
   *     « Et une entrée dans le menu permet de retrouver les objets à écouter
   *     plus tard »
   *
   * La capture 3 du fil montre l'écran de Roon : une entrée de barre latérale,
   * « 1 élément », l'album, son bouton Lecture et son menu « … ». C'est ce que
   * cet écran rend, sur les trois familles que FabienM nomme — album, titre,
   * playlist.
   *
   * ## Il ne lit RIEN de neuf
   *
   * Le sas est une étiquette (voir `lib/ecouterPlusTard`), et son contenu se
   * lit par les mêmes trois routes que l'écran Étiquettes ouvre déjà :
   * `/tags/{id}/albums`, `/tags/{id}/tracks`, `/tags/{id}/playlists`. Chacune
   * rend sa moitié LOCALE et sa moitié STREAMING (`id: null` + la paire),
   * mesuré sur le .18 le 28/09/2026. Les vignettes, les lignes de piste et les
   * menus « … » viennent des mêmes composants qu'ailleurs : le même album a
   * ici le même menu que dans la Bibliothèque.
   *
   * ## Pas d'étiquette, pas d'écran vide
   *
   * Tant que personne n'a rien déposé, l'étiquette n'existe pas — on ne la crée
   * qu'au premier dépôt. L'écran le DIT, et dit comment remplir le sas : un
   * écran vide sans explication se lit comme une panne.
   */
  import { onMount } from 'svelte';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  // Un échec de lecture DOIT se voir (#3732) : jamais un `.catch(() => {})`.
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import { gestesDeZone } from '../../lib/gestesDeZone';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { lireListeDepuis } from '../../lib/lectureEnMasse';
  import { corpsDeLecture } from '../../lib/pisteFile';
  import {
    cibleEtiquetteAlbum,
    cleLigneEtiquetee,
    corpsLectureAlbumEtiquete,
    EVENEMENT_ETIQUETTE_MODIFIEE,
  } from '../../lib/cibleEtiquette';
  import { chargerSas, sasEcouterPlusTard } from '../../lib/ecouterPlusTard';
  import { gestesObjet, objetAlbum, objetPlaylist } from '../../lib/gestesObjet';
  import type { Album, Track } from '../../lib/types';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import MenuObjetV2 from './MenuObjetV2.svelte';
  import ListePistesV2 from './ListePistesV2.svelte';

  let albums = $state<Album[]>([]);
  let pistes = $state<Track[]>([]);
  let listes = $state<any[]>([]);
  let chargement = $state(true);

  const total = $derived(albums.length + pistes.length + listes.length);

  /**
   * Relit les trois familles.
   *
   * 🔴 `chargerSas()` d'abord : c'est LUI qui sait quelle étiquette tient le
   * sas (réglage du profil, ou adoption par le nom). L'écran ne redécide rien
   * de son côté — deux résolutions divergeraient au premier renommage.
   */
  async function charger() {
    chargement = true;
    await chargerSas();
    const tagId = $sasEcouterPlusTard.etiquette;
    if (tagId == null) {
      albums = [];
      pistes = [];
      listes = [];
      chargement = false;
      return;
    }
    // Les trois EN PARALLÈLE, chacune au mieux : une famille qui échoue ne
    // doit pas vider les deux autres.
    const [a, p, l] = await Promise.all([
      api.getTagAlbums(tagId).catch(() => null),
      api.getTagTracks(tagId).catch(() => null),
      api.getTagPlaylists(tagId).catch(() => null),
    ]);
    albums = a?.albums ?? [];
    pistes = p?.tracks ?? [];
    listes = l?.playlists ?? [];
    chargement = false;
  }

  onMount(() => {
    void charger();
    /**
     * #1659 — un retrait fait AILLEURS pendant que cet écran est ouvert (le
     * menu « … » d'une vignette posée par-dessus, le panneau Étiquettes) doit
     * retirer la ligne ici aussi. `poserEtiquette`/`retirerEtiquette` émettent
     * déjà cet événement à chaque geste RÉUSSI : l'écran l'écoute, plutôt que
     * de laisser l'objet retiré à l'écran jusqu'au rechargement de la page.
     */
    const surModification = (ev: Event) => {
      const id = (ev as CustomEvent)?.detail?.tagId;
      if (id != null && id !== $sasEcouterPlusTard.etiquette) return;
      void charger();
    };
    window.addEventListener(EVENEMENT_ETIQUETTE_MODIFIEE, surModification);
    return () => window.removeEventListener(EVENEMENT_ETIQUETTE_MODIFIEE, surModification);
  });

  /** Une piste du sas — la moitié locale par son entier, l'autre par sa paire. */
  function lirePiste(p: Track) {
    const zid = $currentZoneId;
    const corps = corpsDeLecture(p);
    if (zid == null || !corps) return;
    playAndSync(zid, corps as any).catch(signalerEchecLecture);
  }
  /** « Lire à partir d'ici » — les pistes du sas, dans l'ordre affiché (#1061). */
  function lireLesPistesDepuis(i: number) {
    const zid = zoneRequise();
    if (zid == null) return;
    lireListeDepuis(pistes as any, i, gestesDeZone(zid)).catch(signalerEchecLecture);
  }
  function lireAlbum(a: Album) {
    const zid = $currentZoneId;
    const corps = corpsLectureAlbumEtiquete(a as any);
    if (zid == null || !corps) return;
    playAndSync(zid, corps as any).catch(signalerEchecLecture);
  }
  /** Le chemin d'ouverture COMMUN, celui des autres écrans (`lib/gestesObjet`). */
  function ouvrirAlbum(a: Album) {
    gestesObjet(objetAlbum(a)).ouvrir?.();
  }
  function ouvrirListe(pl: any) {
    gestesObjet(objetPlaylist(pl)).ouvrir?.();
  }
</script>

<section class="v2-later tune-v2">
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.later.eyebrow' as any)}</div>
      <h1>{$t('v2.nav.later' as any)}</h1>
      <p class="v2-sous">{total} {$t('v2.later.items' as any)}</p>
    </div>
  </header>

  {#if chargement}
    <div class="etat">{$t('common.loading' as any)}</div>
  {:else if total === 0}
    <div class="etat">{$t('v2.later.empty' as any)}</div>
  {:else}
    {#if albums.length}
      <h2 class="fam">{$t('favorites.albums' as any)}</h2>
      <div class="grille">
        {#each albums as a, i (cleLigneEtiquetee(a, i))}
          <div class="carte">
            <div class="cv">
              <PochetteActions
                favori={a.id != null ? { albumId: a.id } : null}
                etiquettes={cibleEtiquetteAlbum(a)}
                onLire={() => lireAlbum(a)}
                onOuvrir={() => ouvrirAlbum(a)}
                objet={objetAlbum(a)}
                nom={a.title}
              >
                <AlbumArt coverPath={a.cover_path} albumId={a.id} size={0} alt={a.title}
                  fallbackInitials={a.title?.slice(0, 1)} />
              </PochetteActions>
            </div>
            <button class="meta" onclick={() => ouvrirAlbum(a)}>
              <span class="ct" title={a.title}>{a.title}</span>
              <span class="ca" title={a.artist_name ?? ''}>{a.artist_name ?? ''}</span>
            </button>
          </div>
        {/each}
      </div>
    {/if}

    {#if pistes.length}
      <h2 class="fam">{$t('favorites.tracks' as any)}</h2>
      <div class="pistes">
        <ListePistesV2 pistes={pistes} onLire={(p) => lirePiste(p)}
          onLireDepuis={(_p, i) => lireLesPistesDepuis(i)} />
      </div>
    {/if}

    {#if listes.length}
      <h2 class="fam">{$t('favorites.playlists' as any)}</h2>
      <div class="simples">
        <!-- 🔴 La clé porte la PAIRE quand l'identifiant est nul : deux
             playlists de service feraient sinon deux clés `null` identiques, et
             Svelte refuserait de dessiner la liste (`cleLigneEtiquetee`). -->
        {#each listes as pl, i (cleLigneEtiquetee(pl, i))}
          {@const locale = pl.id != null}
          <div class="shote">
            <span class="smenu">
              <MenuObjetV2 objet={objetPlaylist(pl)} nom={pl.name ?? ''} />
            </span>
            <!-- Une playlist LOCALE s'ouvre dans son écran ; une playlist de
                 service (id nul) n'a pas encore d'écran qui l'accueille : on
                 la montre sans la rendre cliquable, comme l'écran Étiquettes. -->
            <svelte:element this={locale ? 'button' : 'div'} class="simple" class:inerte={!locale}
                            onclick={locale ? () => ouvrirListe(pl) : undefined}>
              <span class="si" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h11M4 12h11M4 17h7M18 15V8l3 .6"/></svg>
              </span>
              <span class="sn" title={pl.name ?? ''}>{pl.name ?? ''}</span>
              <span class="sc">{pl.track_count ?? ''}</span>
            </svelte:element>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</section>

<style>
  .v2-later{height:100%; overflow-y:auto; background:var(--v2-bg); color:var(--v2-txt); font-family:var(--v2-sans)}
  .etat{padding:30px; color:var(--v2-txt3); font-size:13.5px; max-width:60ch}
  .fam{margin:18px 30px 0; font:600 12px var(--v2-sans); letter-spacing:.08em;
    text-transform:uppercase; color:var(--v2-txt3)}

  .pistes{display:flex; flex-direction:column; gap:1px; padding:12px 30px 24px}

  .simples{display:flex; flex-direction:column; gap:2px; padding:12px 24px 40px}
  /* Menus d'objets : la ligne et son « … », le menu posé au bout de la ligne. */
  .shote{position:relative}
  .shote > .simple{padding-right:48px}
  .smenu{position:absolute; right:8px; top:50%; transform:translateY(-50%); z-index:1}
  .simple{display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:12px; width:100%;
    padding:9px 12px; border:0; border-radius:9px; background:transparent; color:var(--v2-txt2);
    text-align:left; cursor:pointer; font:inherit}
  .simple:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .simple.inerte{cursor:default}
  .simple.inerte:hover{background:transparent; color:var(--v2-txt2)}
  .simple .si{display:inline-flex; color:var(--v2-acc1)}
  .simple .si svg{width:17px; height:17px}
  .simple .sn{overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px}
  .simple .sc{font:10.5px var(--v2-mono); color:var(--v2-txt3)}

  .grille{display:grid; grid-template-columns:repeat(auto-fill, minmax(148px, 1fr)); gap:22px 18px; padding:12px 30px 24px}
  .carte{display:flex; flex-direction:column; content-visibility:auto; contain-intrinsic-size:auto 210px}
  .cv{position:relative; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden}
  .cv :global(img){width:100%; height:100%; object-fit:cover; display:block}
  .meta{display:block; width:100%; border:0; background:transparent; padding:0; text-align:left; color:inherit; font:inherit; cursor:pointer}
  .ct{display:block; margin-top:9px; font:600 12.5px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{display:block; margin-top:2px; font:11px var(--v2-mono); color:var(--v2-txt3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
</style>
