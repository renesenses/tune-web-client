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
  import PisteActions from './PisteActions.svelte';
  import BasculeAffichage from './BasculeAffichage.svelte';
  import { LISTE_ET_DEUX_GRILLES, type AffichageEtendu } from '../../lib/affichage';
  import { lireChoix, ecrireChoix } from '../../lib/preferencesEcran';
  import {
    elementsDuSas,
    LIBELLE_GENRE_SAS,
    LIBELLE_TRI_SAS,
    triApplique,
    trierSas,
    trisDisponibles,
    TRIS_SAS,
    type ElementSas,
    type TriSas,
  } from '../../lib/triEcouterPlusTard';

  let albums = $state<Album[]>([]);
  let pistes = $state<Track[]>([]);
  let listes = $state<any[]>([]);
  let chargement = $state(true);

  const total = $derived(albums.length + pistes.length + listes.length);

  /**
   * web#1802 — la vue et le tri, retenus pour CET écran seul (clés
   * `later.display` et `later.sort` de `lib/preferencesEcran`, les mêmes
   * magasins que la Bibliothèque et les Favoris).
   *
   * 🔴 On n'écrit QUE sur un geste de l'utilisateur, jamais le défaut (#1650) :
   * un défaut écrit au premier affichage deviendrait un « choix » que le
   * défaut suivant — la date d'ajout, quand le serveur la rendra — ne
   * pourrait plus jamais atteindre.
   */
  const CLE_VUE = 'later.display';
  const CLE_TRI = 'later.sort';
  /**
   * web#1802, suite — trois crans : liste, petite vignette (`grid`), grande
   * vignette (`gridLarge`). 🔴 Un choix `grid` déjà retenu reste `grid` : c'est
   * EXACTEMENT la grille d'avant (148 px), donc la petite vignette. Aucune
   * valeur à réécrire, et personne ne voit son écran changer.
   */
  let affichage = $state<AffichageEtendu>(lireChoix(CLE_VUE, LISTE_ET_DEUX_GRILLES, 'grid'));
  const LIBELLES_VUE = { grid: 'v2.later.viewSmall' } as const;
  const triRetenu = lireChoix<string>(CLE_TRI, TRIS_SAS, '');
  let choixTri = $state<TriSas | null>(triRetenu === '' ? null : (triRetenu as TriSas));

  const elements = $derived(elementsDuSas(albums, pistes, listes));
  const trisOfferts = $derived(trisDisponibles(elements));
  const tri = $derived(triApplique(choixTri, elements));
  const affiches = $derived(trierSas(elements, tri));
  /** Les titres dans l'ordre AFFICHÉ — la suite de « Lire à partir d'ici ». */
  const pistesAffichees = $derived(affiches.filter((e) => e.genre === 'track').map((e) => e.ligne as Track));

  function changerVue(v: AffichageEtendu) {
    affichage = v;
    ecrireChoix(CLE_VUE, v);
  }
  function changerTri(v: string) {
    if (!(TRIS_SAS as readonly string[]).includes(v)) return;
    choixTri = v as TriSas;
    ecrireChoix(CLE_TRI, v);
  }
  /** Clé de rendu : la FAMILLE en fait partie — l'album 7 et le titre 7 sont deux lignes. */
  function cle(e: ElementSas): string {
    return `${e.genre}:${cleLigneEtiquetee(e.ligne, e.rang)}`;
  }
  /** Tri « type » : un intertitre au début de chaque famille. */
  function debutDeFamille(i: number): boolean {
    return tri === 'type' && (i === 0 || affiches[i - 1].genre !== affiches[i].genre);
  }
  const INTERTITRE: Record<string, string> = {
    album: 'favorites.albums',
    track: 'favorites.tracks',
    playlist: 'favorites.playlists',
  };

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
      const notre = $sasEcouterPlusTard.etiquette;
      /**
       * 🔴 `notre == null` fait relire, il ne fait pas taire.
       *
       * L'événement part depuis `poserEtiquette`, donc AVANT que la bascule
       * écrive l'étiquette dans le magasin. Au tout premier dépôt de la
       * session, cet écran voyait donc `null` d'un côté, l'identifiant tout
       * neuf de l'autre, et se taisait : il continuait d'annoncer « Rien à
       * écouter plus tard » alors qu'on venait d'y déposer un album.
       */
      if (id != null && notre != null && id !== notre) return;
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
  /** « Lire à partir d'ici » — les pistes du sas, dans l'ordre AFFICHÉ (#1061). */
  function lireLesPistesDepuis(p: Track) {
    const zid = zoneRequise();
    if (zid == null) return;
    const i = pistesAffichees.indexOf(p);
    if (i < 0) return;
    lireListeDepuis(pistesAffichees as any, i, gestesDeZone(zid)).catch(signalerEchecLecture);
  }
  function lireListe(pl: any) {
    gestesObjet(objetPlaylist(pl)).lire?.();
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
    {#if !chargement && total > 0}
      <div class="barre">
        <label class="tris">
          <span>{$t('v2.fav.sortBy' as any)}</span>
          <select class="sel" value={tri} onchange={(ev) => changerTri((ev.currentTarget as HTMLSelectElement).value)}>
            {#each trisOfferts as t_ (t_)}
              <option value={t_}>{$t(LIBELLE_TRI_SAS[t_] as any)}</option>
            {/each}
          </select>
        </label>
        <BasculeAffichage modes={LISTE_ET_DEUX_GRILLES} valeur={affichage} onChanger={changerVue}
          iconeDeDestination libelles={LIBELLES_VUE} />
      </div>
    {/if}
  </header>

  {#snippet repliListe()}
    <!-- Une playlist sans image : une vignette PROPRE, jamais un cadre vide ni
         une pochette d'album empruntée. -->
    <span class="repli" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h11M4 12h11M4 17h7M18 15V8l3 .6"/><circle cx="16" cy="17" r="2.2"/></svg>
    </span>
  {/snippet}

  {#snippet vignette(e: ElementSas)}
    {#if e.genre === 'playlist'}
      {#if e.ligne.cover_path}
        <AlbumArt coverPath={e.ligne.cover_path} size={0} alt={e.titre} />
      {:else}
        {@render repliListe()}
      {/if}
    {:else}
      <AlbumArt coverPath={e.ligne.cover_path} albumId={e.genre === 'album' ? e.ligne.id : e.ligne.album_id}
        size={0} alt={e.titre} fallbackInitials={e.titre?.slice(0, 1)} />
    {/if}
  {/snippet}

  {#if chargement}
    <div class="etat">{$t('common.loading' as any)}</div>
  {:else if total === 0}
    <div class="etat">{$t('v2.later.empty' as any)}</div>
  {:else if affichage === 'grid' || affichage === 'gridLarge'}
    <div class="grille" class:grande={affichage === 'gridLarge'} data-vue={affichage} data-tri={tri}>
      {#each affiches as e, i (cle(e))}
        {@const locale = e.ligne.id != null}
        {#if debutDeFamille(i)}<h2 class="fam dans-grille">{$t(INTERTITRE[e.genre] as any)}</h2>{/if}
        <div class="carte" data-genre={e.genre}>
          <div class="cv">
            {#if e.genre === 'album'}
              <PochetteActions
                favori={locale ? { albumId: e.ligne.id } : null}
                etiquettes={cibleEtiquetteAlbum(e.ligne)}
                onLire={() => lireAlbum(e.ligne)}
                onOuvrir={() => ouvrirAlbum(e.ligne)}
                objet={objetAlbum(e.ligne)}
                nom={e.titre}
              >{@render vignette(e)}</PochetteActions>
            {:else if e.genre === 'track'}
              <PochetteActions onLire={() => lirePiste(e.ligne)} nom={e.titre}>{@render vignette(e)}</PochetteActions>
            {:else}
              <PochetteActions
                onLire={() => lireListe(e.ligne)}
                onOuvrir={locale ? () => ouvrirListe(e.ligne) : null}
                objet={objetPlaylist(e.ligne)}
                nom={e.titre}
              >{@render vignette(e)}</PochetteActions>
            {/if}
          </div>
          <!-- Le titre ouvre l'album ou la playlist locale, comme avant ; un
               titre et une playlist de service n'ont pas d'écran où aller. -->
          {#snippet texteCarte()}
            <span class="ct" title={e.titre}>{e.titre}</span>
            <span class="ca" title={e.artiste}>{e.artiste || $t(LIBELLE_GENRE_SAS[e.genre] as any)}</span>
          {/snippet}
          {#if e.genre === 'album' || (e.genre === 'playlist' && locale)}
            <button class="meta" onclick={() => (e.genre === 'album' ? ouvrirAlbum(e.ligne) : ouvrirListe(e.ligne))}>
              {@render texteCarte()}
            </button>
          {:else}
            <div class="meta">{@render texteCarte()}</div>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="lignes" data-vue="list" data-tri={tri}>
      {#each affiches as e, i (cle(e))}
        {@const locale = e.ligne.id != null}
        {#if debutDeFamille(i)}<h2 class="fam dans-liste">{$t(INTERTITRE[e.genre] as any)}</h2>{/if}
        <div class="ligne" data-genre={e.genre}>
          <span class="mini">{@render vignette(e)}</span>
          <!-- Le clic sur la ligne OUVRE l'album ou la playlist locale, et LIT
               un titre — le geste de chaque famille ailleurs dans l'interface.
               Une playlist de service n'a pas d'écran : ligne inerte. -->
          {#snippet texteLigne()}
            <span class="ct" title={e.titre}>{e.titre}</span>
            <span class="ca">
              <span class="genre">{$t(LIBELLE_GENRE_SAS[e.genre] as any)}</span>
              {#if e.artiste}<span title={e.artiste}> · {e.artiste}</span>{/if}
            </span>
          {/snippet}
          {#if e.genre === 'playlist' && !locale}
            <div class="lt inerte">{@render texteLigne()}</div>
          {:else}
            <button class="lt" onclick={() => (e.genre === 'album' ? ouvrirAlbum(e.ligne)
              : e.genre === 'track' ? lirePiste(e.ligne) : ouvrirListe(e.ligne))}>
              {@render texteLigne()}
            </button>
          {/if}
          <span class="actions">
            {#if e.genre === 'track'}
              <PisteActions piste={e.ligne} onLireDepuis={() => lireLesPistesDepuis(e.ligne)} />
            {:else}
              <button class="lire" aria-label={$t('v2.pa.play' as any)} title={$t('v2.pa.play' as any)}
                onclick={() => (e.genre === 'album' ? lireAlbum(e.ligne) : lireListe(e.ligne))}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </button>
              <MenuObjetV2 objet={e.genre === 'album' ? objetAlbum(e.ligne) : objetPlaylist(e.ligne)} nom={e.titre} />
            {/if}
          </span>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .v2-later{height:100%; overflow-y:auto; background:var(--v2-bg); color:var(--v2-txt); font-family:var(--v2-sans)}
  .etat{padding:30px; color:var(--v2-txt3); font-size:13.5px; max-width:60ch}
  .fam{margin:18px 30px 0; font:600 12px var(--v2-sans); letter-spacing:.08em;
    text-transform:uppercase; color:var(--v2-txt3)}

  .barre{display:flex; align-items:center; gap:10px; margin-left:auto}
  .tris{display:inline-flex; align-items:center; gap:8px; font-size:12.5px; color:var(--v2-txt3)}
  .sel{height:32px; border-radius:9px; border:1px solid var(--v2-line2); background:var(--v2-bg);
    color:var(--v2-txt); padding:0 10px; font:inherit; font-size:13px}
  .sel:focus{outline:none; border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .fam.dans-grille{grid-column:1 / -1; margin:6px 0 0}
  .fam.dans-liste{margin:14px 12px 4px}

  /* La vignette de REPLI d'une playlist sans image. */
  .repli{display:flex; align-items:center; justify-content:center; width:100%; height:100%;
    background:linear-gradient(135deg, var(--v2-hover), var(--v2-line2)); color:var(--v2-acc1)}
  .repli svg{width:38%; height:38%}

  .lignes{display:flex; flex-direction:column; gap:2px; padding:12px 24px 40px}
  .ligne{display:grid; grid-template-columns:44px 1fr auto; align-items:center; gap:12px;
    padding:6px 10px; border-radius:9px}
  .ligne:hover{background:var(--v2-hover)}
  .mini{width:44px; height:44px; border-radius:6px; overflow:hidden; display:block}
  .mini :global(img){width:100%; height:100%; object-fit:cover; display:block}
  .mini .repli svg{width:50%; height:50%}
  .lt{display:flex; flex-direction:column; min-width:0; border:0; background:transparent; padding:0;
    text-align:left; color:inherit; font:inherit; cursor:pointer}
  .lt.inerte{cursor:default}
  .lt .ct{margin-top:0}
  .genre{text-transform:uppercase; letter-spacing:.06em}
  .actions{display:inline-flex; align-items:center; gap:6px}
  .lire{width:30px; height:30px; border-radius:50%; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); display:inline-flex; align-items:center; justify-content:center; cursor:pointer}
  .lire:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .lire svg{width:14px; height:14px}

  .grille{display:grid; grid-template-columns:repeat(auto-fill, minmax(148px, 1fr)); gap:22px 18px; padding:12px 30px 24px}
  .grille.grande{grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:28px 24px}
  .carte{display:flex; flex-direction:column; content-visibility:auto; contain-intrinsic-size:auto 210px}
  .cv{position:relative; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden}
  .cv :global(img){width:100%; height:100%; object-fit:cover; display:block}
  .meta{display:block; width:100%; min-width:0; border:0; background:transparent; padding:0; text-align:left; color:inherit; font:inherit}
  button.meta{cursor:pointer}
  .ct{display:block; margin-top:9px; font:600 12.5px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{display:block; margin-top:2px; font:11px var(--v2-mono); color:var(--v2-txt3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
</style>
