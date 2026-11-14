<script lang="ts">
  import { bulleTexte } from '../../lib/infobulleTexte';
  /**
   * LA GRILLE DE LA PAGE ARTISTE COMMUNE — renesenses/tune-server-rust#4330.
   *
   * Une grille, pour la fiche d'un artiste de la bibliothèque (`ArtistesV2`)
   * comme pour celle d'un artiste de service (`ArtisteServiceV2`) : « Cette
   * page est accessible depuis tout clic sur un artiste, que ce soit à partir
   * de sa bibliothèque ou d'un service streaming » (FabienM, fil 1823).
   *
   * Elle remplace les sections SÉPARÉES par service de #3709. Ce qui les avait
   * fait séparer tient toujours, et c'est tenu ici autrement : le cœur et les
   * étiquettes d'une pochette sont adossés à un identifiant de BIBLIOTHÈQUE.
   * Ils ne sont donc posés que sur une vignette qui A un exemplaire local — et
   * sur cet exemplaire-là. La clé de boucle est la clé d'édition, pas `al.id`.
   *
   * Les règles de fusion, de préférence et de filtre vivent dans
   * `lib/discographieCommune.ts`, où la garde les tient sans monter d'écran.
   */
  import type { Album } from '../../lib/types';
  import type { AlbumsDeService } from '../../lib/albumsArtisteStreaming';
  import type { GroupeCollaborations, JoueAvec } from '../../lib/api';
  import { partagerDiscographie } from '../../lib/discographieConnexes';
  import {
    BIBLIOTHEQUE, basculerProvenance, choixEffectif, CLE_SOURCE_FICHE, relireSource, serialiserSource, compterFocus, compterProvenances, comptesProvenanceFiche, dansProvenances, recentrerSurProvenances,
    filtrerFocus, fusionnerDiscographie, partagerParTypeDeSortie, provenanceCochee, versionsEntree,
    rangerParType, SECTIONS_PAR_TYPE, SEUIL_SECTIONS_PAR_TYPE, type SectionParType,
    detailEdition, editionsCachees,
    type EntreeDiscographie, type Exemplaire, type Qualite,
  } from '../../lib/discographieCommune';
  import { trierAlbums, type CleTriAlbums, type SensTri } from '../../lib/trierAlbums';
  import type { OrigineSection } from '../../lib/focusArtiste';
  import { lireChoix, ecrireChoix, lireTexte } from '../../lib/preferencesEcran';
  import { libelleProvenance, type ComptesArtistesSources } from '../../lib/provenanceBibliotheque';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import LienEntite from '../partages/LienEntite.svelte';
  import type { Entite } from '../../lib/lienEntite';
  import ServiceBadge from '../partages/ServiceBadge.svelte';
  import TriAlbums from '../partages/TriAlbums.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import { cibleEtiquetteAlbum } from '../../lib/cibleEtiquette';
  import { objetAlbum } from '../../lib/gestesObjet';

  interface Props {
    /** Les albums de la bibliothèque — vide pour un artiste qu'elle ne connaît pas. */
    locaux?: Album[];
    /** Ce que chaque service connecté rend pour cet artiste. */
    services?: AlbumsDeService[];
    /** Des services répondent encore : la grille peut encore grandir. */
    servicesEnCharge?: boolean;
    /**
     * Ouvre l'exemplaire PRINCIPAL d'une vignette.
     *
     * `origine` dit de quelle SECTION vient le clic (#4767) : depuis
     * « Compilations » ou « Apparitions », la fiche d'album s'ouvre focalisée
     * sur l'artiste de la page. `null` depuis la discographie.
     */
    onOuvrir: (ex: Exemplaire, origine: OrigineSection) => void;
    onLire: (ex: Exemplaire) => void;
    /**
     * #4767 — les compilations portant au moins une piste de l'artiste, et
     * les albums d'un AUTRE artiste où il tient au moins un titre. Servies
     * par `GET /library/artists/{id}/albums?sections=1` ; absentes quand il
     * n'y en a pas, et la section n'est alors pas rendue.
     */
    compilations?: Album[];
    apparitions?: Album[];
    /**
     * #4767 (crédits, tune-server-rust#4862) — les disques d'autrui où
     * l'artiste est crédité comme musicien, groupés par artiste principal, et
     * ceux où il l'est comme auteur. Lus dans `track_credits` ; absents devant
     * un serveur qui ne les sert pas, et la section n'est alors pas rendue.
     */
    collaborations?: GroupeCollaborations[];
    reprises?: Album[];
    /**
     * Lot 2 (web#2639, tune-server-rust#7767) — « Écriture et production » :
     * les disques hors de sa discographie où l'artiste est compositeur,
     * parolier, arrangeur, producteur, ingénieur ou mixeur (`writing`). Même
     * forme que `reprises` ; absente devant un serveur antérieur, et la
     * section n'est alors pas rendue — jamais remplie depuis `reprises`.
     */
    ecriture?: Album[];
    /**
     * #2794 (lot 2, PR 5, tune-server-rust#7768) — « Joue avec » : les
     * artistes audibles sur les mêmes pistes (`played_with`), dans l'ordre du
     * serveur. Absente devant un serveur antérieur : pas de bloc.
     */
    joueAvec?: JoueAvec[];
    /** Le filtre « Source » de la Bibliothèque : la pastille cochée à l'ouverture. */
    provenance?: string | null;
    /** Les comptes de ce filtre, pour que le menu parle de CETTE discographie. */
    onComptesProvenance?: (c: ComptesArtistesSources) => void;
    /**
     * Le nom de l'artiste de la fiche — ce qui départage, avec l'identifiant
     * résolu chez chaque service, ses albums de ceux qui ne font que le citer
     * (#4651, `lib/discographieConnexes`).
     */
    nomArtiste?: string | null;
    /**
     * #1874 — d'autres sources PEUVENT encore s'ajouter à cette discographie
     * (des services sont interrogés, ou la bibliothèque l'est par le nom) : la
     * rangée des pastilles est rendue dès l'ouverture, et ne surgit plus au
     * milieu de la page quand le deuxième service répond.
     */
    rangeeSources?: boolean;
  }
  /**
   * #2961 — le compte d'un musicien de « Joue avec » : « N albums » quand le
   * serveur dit que ses crédits tiennent tout l'album (`album_wide`, des
   * balises qui recopient le personnel sur chaque piste), sinon « N titres ».
   */
  function compteJoueAvec(j: JoueAvec): string {
    const parAlbum = j.album_wide === true && typeof j.shared_albums === 'number' && j.shared_albums > 0;
    const n = parAlbum ? (j.shared_albums as number) : (j.shared_tracks ?? 0);
    const cle = parAlbum
      ? (n === 1 ? 'v2.disco.sharedAlbumOne' : 'v2.disco.sharedAlbums')
      : (n === 1 ? 'v2.disco.sharedTrackOne' : 'v2.disco.sharedTracks');
    return $t(cle as any).replace('{n}', String(n));
  }

  /** #2961 — la cible du nom : la fiche par `artist_id`, sinon par le nom. */
  function entiteJoueAvec(j: JoueAvec): Entite {
    return typeof j.artist_id === 'number'
      ? { type: 'artiste', nom: j.artist_name, multi: false, artiste: { id: j.artist_id, name: j.artist_name, source: 'local' } }
      : { type: 'personne', nom: j.artist_name, artiste: { name: j.artist_name } };
  }

  let { locaux = [], services = [], servicesEnCharge = false, rangeeSources = false, onOuvrir, onLire, provenance = null, onComptesProvenance, nomArtiste = null, compilations = [], apparitions = [], collaborations = [], reprises = [], ecriture = [], joueAvec = [] }: Props = $props();

  /**
   * #4651 — Qobuz range sous un artiste des reprises et des albums d'autres
   * artistes (15 sur 52 pour Agnes Obel, mesuré sur le .18). La grille
   * principale ne garde que ceux DE l'artiste ; les autres ne sont pas jetés,
   * ils passent sous « Apparitions » (#1839, décision de Bertrand du
   * 30/09/2026 : plus de section « Autres / Connexes » ; les invitations d'un
   * artiste de service vont au même endroit, sous le même libellé, que celles
   * d'un artiste local).
   * Les deux groupes sont fusionnés SÉPARÉMENT : « The Curse » d'Echoes of
   * Maya ne se replie plus sur « The Curse » d'Agnes Obel.
   */
  const partage = $derived(partagerDiscographie(services, nomArtiste));
  const toutes = $derived(fusionnerDiscographie(locaux, partage.propres));
  $effect(() => { onComptesProvenance?.(comptesProvenanceFiche(toutes)); });

  /*
   * #4767 — les sections de FabienM. Fusionnées SÉPARÉMENT, comme « Autres /
   * Connexes » : une compilation homonyme d'un album de l'artiste ne doit pas
   * se replier sur lui. « Collaborations » : une sous-section « Avec
   * {artiste} » par artiste principal, dans l'ordre où le serveur range les
   * groupes (par nom).
   */
  const compilationsToutes = $derived(fusionnerDiscographie(compilations, []));
  // #1839 — les apparitions du serveur (artiste local) ET les albums d'autres
  // artistes que les services rangent sous lui (#4651) : une seule section.
  const apparitionsToutes = $derived(fusionnerDiscographie(apparitions, partage.connexes));
  const reprisesToutes = $derived(fusionnerDiscographie(reprises, []));
  const ecritureToutes = $derived(fusionnerDiscographie(ecriture, []));
  const collaborationsToutes = $derived(
    (collaborations ?? []).map((g, i) => ({
      cle: `${g?.artist_id ?? ''}|${g?.artist_name ?? ''}|${i}`,
      nom: g?.artist_name ?? '',
      entrees: fusionnerDiscographie(g?.albums ?? [], []),
    })),
  );

  // ── Source ───────────────────────────────────────────────────────────────
  // Les pastilles au-dessus de la grille (28/09/2026) : voir
  // `compterProvenances`. Elles filtrent TOUTES les sections de la fiche.
  const provenances = $derived(
    compterProvenances([
      toutes, compilationsToutes, apparitionsToutes, reprisesToutes, ecritureToutes,
      ...collaborationsToutes.map((g) => g.entrees),
    ]),
  );
  /** Les provenances cochées ; vide = toutes. */
  let choix = $state<Set<string>>(new Set());
  // La source choisie dans la grille de la Bibliothèque (#1501) est la
  // pastille cochée à l'OUVERTURE — et plus un filtre invisible qu'on ne
  // pouvait pas retirer depuis la fiche. Sans elle, c'est le DERNIER choix
  // fait sur une fiche artiste (#1874) : « Local » choisi une fois reste
  // « Local » à la fiche suivante, au lieu de revenir à « Toutes ».
  $effect.pre(() => {
    choix = provenance ? new Set([provenance]) : relireSource(lireTexte(CLE_SOURCE_FICHE));
  });
  /**
   * Ce qui s'applique : le choix ramené aux pastilles PRÉSENTES (#1874). Les
   * pastilles arrivent avec les services ; un choix retenu dont la pastille
   * n'est pas (encore) là ne vide pas la fiche, il attend.
   */
  const actif = $derived(choixEffectif(choix, provenances.map((p) => p.cle)));
  // Un ensemble REMPLACÉ, pas modifié en place : `$state` suit l'affectation,
  // et un `Set` muté garderait la même référence. Le geste est RETENU ; la
  // source posée par la Bibliothèque, elle, ne l'est pas — elle n'est pas un
  // choix fait sur la fiche.
  function choisir(n: Set<string>) {
    choix = n;
    ecrireChoix(CLE_SOURCE_FICHE, serialiserSource(n));
  }
  function basculerPastille(cle: string) {
    choisir(basculerProvenance(actif, cle, provenances.map((p) => p.cle)));
  }
  // Filtrer ne suffit pas : la vignette gardée pour son exemplaire Qobuz doit
  // aussi OUVRIR cet exemplaire, pas la copie locale (30/09/2026, Yves Corbat).
  const garder = (liste: EntreeDiscographie[]) =>
    liste.filter((e) => dansProvenances(e, actif)).map((e) => recentrerSurProvenances(e, actif));

  /**
   * Les noms des serveurs UPnP, pour qu'une pastille dise « Sonos » et pas un
   * UDN. Le registre n'est interrogé que si la fiche a un serveur à nommer,
   * et il est CONSULTÉ, jamais exigé : muet, la pastille garde l'UDN abrégé.
   */
  let nomsServeurs = $state<Record<string, string>>({});
  const aDesServeurs = $derived(provenances.some((p) => p.cle.startsWith('upnp:')));
  $effect(() => {
    if (!aDesServeurs) return;
    let vivant = true;
    api.getMediaServers()
      .then((liste) => {
        if (!vivant) return;
        const carte: Record<string, string> = {};
        for (const s of liste) if (s.id && s.name) carte[s.id] = s.name;
        nomsServeurs = carte;
      })
      .catch(() => { /* registre muet : l'UDN abrégé suffit */ });
    return () => { vivant = false; };
  });

  const entrees = $derived(garder(toutes));
  const comptes = $derived(compterFocus(entrees));

  // ── Focus ────────────────────────────────────────────────────────────────
  // La source en est sortie pour devenir les pastilles : il ne garde que la
  // qualité, sur la discographie.
  let focusOuvert = $state(false);
  let qualitesCochees = $state<Set<Qualite>>(new Set());
  const focusActif = $derived(qualitesCochees.size > 0);

  function basculerQualite(q: Qualite) {
    const n = new Set(qualitesCochees);
    if (n.has(q)) n.delete(q); else n.add(q);
    qualitesCochees = n;
  }
  function toutAfficher() {
    qualitesCochees = new Set();
  }

  const filtrees = $derived(filtrerFocus(entrees, { sources: new Set(), qualites: qualitesCochees }));

  // ── Tri ──────────────────────────────────────────────────────────────────
  // Mêmes clés et même mémoire que la fiche d'avant (#4246) : un réglage déjà
  // choisi par l'utilisateur ne doit pas se perdre avec la refonte.
  const CLES_FICHE: readonly CleTriAlbums[] = ['year', 'title', 'release_date', 'added_at'];
  let triAlbums = $state<CleTriAlbums>(lireChoix<CleTriAlbums>('v2.art.albums.tri', CLES_FICHE, 'year'));
  let sensAlbums = $state<SensTri>(lireChoix<SensTri>('v2.art.albums.sens', ['asc', 'desc'], 'asc'));
  $effect(() => { ecrireChoix('v2.art.albums.tri', triAlbums); });
  $effect(() => { ecrireChoix('v2.art.albums.sens', sensAlbums); });

  /**
   * `trierAlbums` trie des `Album` : on lui passe un album par vignette —
   * l'exemplaire principal, complété des champs qu'un autre exemplaire porte
   * quand le sien les laisse vides (un album Qobuz n'a pas de date d'ajout,
   * sa copie locale si) — puis on retrouve la vignette par référence.
   */
  function trier(liste: EntreeDiscographie[], cle: CleTriAlbums, sens: SensTri): EntreeDiscographie[] {
    const parAlbum = new Map<Album, EntreeDiscographie>();
    const albums = liste.map((e) => {
      const complet = { ...e.principal.album } as Album;
      for (const ex of e.exemplaires) {
        complet.year ??= ex.album.year;
        complet.release_date ??= ex.album.release_date;
        complet.added_at ??= ex.album.added_at;
      }
      parAlbum.set(complet, e);
      return complet;
    });
    return trierAlbums(albums, cle, sens).map((a) => parAlbum.get(a)!);
  }
  const triees = $derived(trier(filtrees, triAlbums, sensAlbums));
  const sectionsSortie = $derived(partagerParTypeDeSortie(triees));

  /*
   * web#3032 (Bertrand, recette du 14/11/2026, page Miles Davis) — au-delà de
   * `SEUIL_SECTIONS_PAR_TYPE` vignettes de la BIBLIOTHÈQUE (pas la discographie
   * filtrée : cocher une pastille ne fait pas basculer la mise en page ; ni
   * les albums des services : leur arrivée ne la fait pas basculer non plus), elle
   * se range en sections par type, repliables, chacune avec son compte ; le
   * tri de la page (par année par défaut) vaut dans chaque section. En
   * dessous, rien ne change.
   */
  const parType = $derived(toutes.filter((e) => e.sources.includes(BIBLIOTHEQUE)).length > SEUIL_SECTIONS_PAR_TYPE);
  const sectionsType = $derived(rangerParType(triees));
  const LIBELLES_TYPE: Record<SectionParType, string> = {
    studio: 'v2.disco.studioAlbums', live: 'v2.disco.live', compilations: 'v2.disco.compilations',
    'bandes-originales': 'v2.disco.soundtracks', eps: 'v2.disco.eps', singles: 'v2.disco.singles',
    autres: 'v2.disco.otherReleases',
  };
  /** Les `data-section` d'avant sont gardés pour Live, EP et Singles. */
  const DATA_TYPE: Record<SectionParType, string> = {
    studio: 'albums-studio', live: 'live', compilations: 'compilations-artiste',
    'bandes-originales': 'bandes-originales', eps: 'eps', singles: 'singles', autres: 'autres',
  };
  /** Les sections repliées, retenues d'une fiche à l'autre comme le tri. */
  const CLE_REPLIES = 'v2.art.disco.replies';
  /** La clé de repli et l'identifiant du bloc « Apparaît sur ». */
  const REPLI_APPARAIT = 'appears-on';
  const ID_APPARAIT = 'disco-appears-on';
  function relireReplies(): Set<string> {
    try {
      const v = JSON.parse(lireTexte(CLE_REPLIES) ?? '[]');
      return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    } catch {
      return new Set();
    }
  }
  let replies = $state<Set<string>>(relireReplies());
  function basculerRepli(cle: string) {
    const n = new Set(replies);
    if (n.has(cle)) n.delete(cle); else n.add(cle);
    replies = n;
    ecrireChoix(CLE_REPLIES, JSON.stringify([...n].sort()));
  }

  /*
   * Les sections #4767 : même filtre « Source » et même TRI que la
   * discographie — un seul réglage pour toute la page. Une section (ou un
   * groupe « Avec … ») que le filtre vide ne se rend pas.
   */
  const compilationsTriees = $derived(trier(garder(compilationsToutes), triAlbums, sensAlbums));
  const apparitionsTriees = $derived(trier(garder(apparitionsToutes), triAlbums, sensAlbums));
  const collaborationsTriees = $derived(
    collaborationsToutes
      .map((g) => ({ ...g, entrees: trier(garder(g.entrees), triAlbums, sensAlbums) }))
      .filter((g) => g.entrees.length > 0),
  );
  const collaborationsCompte = $derived(collaborationsTriees.reduce((n, g) => n + g.entrees.length, 0));
  const reprisesTriees = $derived(trier(garder(reprisesToutes), triAlbums, sensAlbums));
  const ecritureTriees = $derived(trier(garder(ecritureToutes), triAlbums, sensAlbums));
  /*
   * Lot 2 (web#2639) — la page se lit en QUATRE sections : Discographie,
   * « Apparaît sur » (apparitions et collaborations, compilations en
   * sous-groupe), « Écriture et production » et Reprises. Le compte d'une
   * section est la somme des listes RENDUES : rien d'autre ne le porte.
   */
  const apparaitSurCompte = $derived(apparitionsTriees.length + collaborationsCompte + compilationsTriees.length);

  /** L'exemplaire local d'une vignette, s'il y en a un — il porte le cœur. */
  const local = (e: EntreeDiscographie) => e.exemplaires.find((x) => x.source === BIBLIOTHEQUE)?.album ?? null;

  /*
   * Le menu « … » des vignettes de cet écran vient de `lib/actionsPochette` et
   * `lib/gestesObjet` (menus d'objets, 26/09/2026) : cet écran ne donne que
   * l'OBJET, et le même album y a le même menu qu'ailleurs.
   */

  /*
   * tune-server-rust#8662 — le choix d'édition (Bertrand, 13/11/2026) : une
   * vignette par album, et quand un service y tient plusieurs éditions de
   * même titre, un badge « N éditions » ouvre leur liste. Une seule liste
   * ouverte à la fois ; la clé porte la section, car une même vignette peut
   * figurer dans deux sections.
   */
  let editionsOuvertes = $state<string | null>(null);
  const cleListe = (e: EntreeDiscographie, origine: OrigineSection) => `${origine ?? 'disco'}|${e.cle}`;
  function basculerEditions(cle: string) {
    editionsOuvertes = editionsOuvertes === cle ? null : cle;
  }
  /** Échap ferme la liste ouverte et rend le focus au badge qui l'a ouverte. */
  function toucheEditions(ev: KeyboardEvent) {
    if (ev.key !== 'Escape' || !editionsOuvertes) return;
    const id = idListe(editionsOuvertes);
    editionsOuvertes = null;
    document.querySelector<HTMLElement>(`.badge-editions[data-liste="${id}"]`)?.focus();
  }
  /** Un identifiant HTML sans espace : `aria-controls` est une liste d'identifiants. */
  const idListe = (cle: string) => `editions-${encodeURIComponent(cle).replace(/[^A-Za-z0-9_-]/g, '_')}`;
  /** Un clic hors de la liste ouverte la referme. */
  $effect(() => {
    if (!editionsOuvertes) return;
    const ferme = (ev: MouseEvent) => {
      const cible = ev.target as HTMLElement | null;
      if (cible?.closest?.('.editions, .badge-editions')) return;
      editionsOuvertes = null;
    };
    window.addEventListener('click', ferme, true);
    return () => window.removeEventListener('click', ferme, true);
  });
  const libelleSource = (source: string) => (source === BIBLIOTHEQUE ? $t('v2.disco.library' as any) : source);

  const LIBELLES_QUALITE: Record<Qualite, string> = {
    dsd: 'v2.disco.dsd', hires: 'v2.disco.hires', cd: 'v2.disco.cd', lossy: 'v2.disco.lossy',
    multichannel: 'v2.disco.multichannel',
  };
  const libelleQualite = (q: Qualite) => $t(LIBELLES_QUALITE[q] as any);
</script>

<svelte:window onkeydown={toucheEditions} />

<div class="disco">
  {#if provenances.length > 1 || actif.size || rangeeSources}
    <!-- « Toutes » OUVRE la rangée et y est toujours : l'absence de filtre ne
         se dit pas en allumant toutes les autres (#1145, même rangée qu'à la
         Recherche). Une seule source : rien à choisir, pas de rangée — sauf
         quand d'autres sources peuvent encore arriver (#1874) : la rangée est
         alors là dès l'ouverture, et la grille ne descend pas d'un cran quand
         le deuxième service répond. -->
    <div class="pills" role="group" aria-label={$t('v2.disco.source' as any)}>
      <button class="pill raz" data-pastille="tout" class:on={actif.size === 0}
        aria-pressed={actif.size === 0} onclick={() => choisir(new Set())}>{$t('v2.fav.allSources' as any)}</button>
      {#each provenances as p (p.cle)}
        <button class="pill" data-pastille={p.cle} class:on={provenanceCochee(p.cle, actif)}
          aria-pressed={provenanceCochee(p.cle, actif)} onclick={() => basculerPastille(p.cle)}>
          {#if p.cle.startsWith('upnp')}<ServiceBadge source="upnp" compact />{/if}
          {libelleProvenance(p.cle, nomsServeurs, $t('v2.lib.sourceLocal' as any))} <b>{p.n}</b>
        </button>
      {/each}
    </div>
  {/if}

  <div class="barre">
    {#if comptes.qualites.length || focusActif}
      <button class="focus" class:ouvert={focusOuvert} class:actif={focusActif}
        aria-expanded={focusOuvert} onclick={() => (focusOuvert = !focusOuvert)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
        {$t('v2.disco.focus' as any)}
      </button>
    {/if}
    <span class="cpt">{filtrees.length} / {toutes.length} {$t('v2.art.albums' as any)}</span>
    <span class="espace"></span>
    <TriAlbums bind:cle={triAlbums} bind:sens={sensAlbums} cles={CLES_FICHE} />
  </div>

  {#if focusOuvert}
    <div class="panneau">
      {#if comptes.qualites.length}
        <div class="axe">
          <h3>{$t('v2.disco.quality' as any)}</h3>
          {#each comptes.qualites as c (c.qualite)}
            <label class="case">
              <input type="checkbox" checked={qualitesCochees.has(c.qualite)} onchange={() => basculerQualite(c.qualite)} />
              <span>{libelleQualite(c.qualite)}</span>
              <span class="n">({c.n})</span>
            </label>
          {/each}
        </div>
      {/if}
      {#if focusActif}
        <button class="raz-focus" onclick={toutAfficher}>{$t('v2.disco.reset' as any)}</button>
      {/if}
    </div>
  {/if}

  {#if !filtrees.length && toutes.length}
    <div class="etat">{$t('v2.disco.noMatch' as any)}</div>
  {:else}
    <!-- Lot 2 (web#2639) — section 1 sur 4 : la discographie de l'artiste
         (albums, EP, singles, lives, comme avant). Le titre n'est posé que
         s'il y a quelque chose dessous ; les sous-sections de type de sortie
         (#5616, #6464) gardent leur forme, un cran plus bas. -->
    {#if triees.length}
    <section class="bloc" data-section="discographie">
    <h3 class="titre-section">{$t('v2.disco.discography' as any)} <span class="cpt">{triees.length}</span></h3>
    {#if parType}
      <!-- web#3032 — les sections par type, repliables. Une section vide
           n'est pas rendue. -->
      {#each SECTIONS_PAR_TYPE as s (s)}
        {#if sectionsType[s].length}
          {@const ouverte = !replies.has(s)}
          <section class="connexes" data-section={DATA_TYPE[s]} data-repliee={ouverte ? null : ''}>
            <h3 class="titre-connexes">
              <button class="replier" aria-expanded={ouverte} aria-controls={ouverte ? `disco-type-${s}` : undefined} onclick={() => basculerRepli(s)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
                {$t(LIBELLES_TYPE[s] as any)} <span class="cpt">{sectionsType[s].length}</span>
              </button>
            </h3>
            {#if ouverte}
              <div class="gr" id={`disco-type-${s}`}>
                {#each sectionsType[s] as e (e.cle)}
                  {@render carte(e)}
                {/each}
              </div>
            {/if}
          </section>
        {/if}
      {/each}
    {:else if !sectionsSortie.eps.length && !sectionsSortie.singles.length && !sectionsSortie.live.length}
      <div class="gr">
        {#each triees as e (e.cle)}
          {@render carte(e)}
        {/each}
      </div>
    {:else}
      <!-- Section « Live » (Bertrand, 05/10) : AVANT Albums, EP et Singles depuis
           tune-server-rust#6464 (go du 20/10). -->
      {#if sectionsSortie.live.length}
        <section class="connexes" data-section="live">
          <h3 class="titre-connexes">{$t('v2.disco.live' as any)} <span class="cpt">{sectionsSortie.live.length}</span></h3>
          <div class="gr">
            {#each sectionsSortie.live as e (e.cle)}
              {@render carte(e)}
            {/each}
          </div>
        </section>
      {/if}
      {#if sectionsSortie.albums.length}
        <!-- web#2665 — `connexes` porte l'écart au-dessus du titre : sans lui,
             « Albums principaux » se collait aux pochettes des Lives. -->
        <section class="connexes" data-section="albums-principaux">
          <h3 class="titre-connexes">{$t('v2.disco.mainAlbums' as any)} <span class="cpt">{sectionsSortie.albums.length}</span></h3>
          <div class="gr">
            {#each sectionsSortie.albums as e (e.cle)}
              {@render carte(e)}
            {/each}
          </div>
        </section>
      {/if}
      <!-- #5616 — deux sections, « EP » puis « Singles » (Bertrand, 05/10). -->
      {#if sectionsSortie.eps.length}
        <section class="connexes" data-section="eps">
          <h3 class="titre-connexes">{$t('v2.disco.eps' as any)} <span class="cpt">{sectionsSortie.eps.length}</span></h3>
          <div class="gr">
            {#each sectionsSortie.eps as e (e.cle)}
              {@render carte(e)}
            {/each}
          </div>
        </section>
      {/if}
      {#if sectionsSortie.singles.length}
        <section class="connexes" data-section="singles">
          <h3 class="titre-connexes">{$t('v2.disco.singles' as any)} <span class="cpt">{sectionsSortie.singles.length}</span></h3>
          <div class="gr">
            {#each sectionsSortie.singles as e (e.cle)}
              {@render carte(e)}
            {/each}
          </div>
        </section>
      {/if}
    {/if}
    </section>
    {/if}
    {#if servicesEnCharge}
      <div class="etat">{$t('common.loading' as any)}</div>
    {/if}
  {/if}

  <!-- Lot 2 (web#2639) — section 2 sur 4, « Apparaît sur » : les sections
       #4767 de FabienM (apparitions, compilations) et les collaborations de
       #4862 (« Avec {artiste} »), réunies sous un seul titre ; les
       compilations en sous-groupe. Rendue SEULEMENT quand elle porte quelque
       chose : une section vide ne s'explique pas, et le serveur ne renvoie
       même pas la clé. Ouvrir une de ces vignettes focalise la fiche d'album
       sur l'artiste de la page (par artiste de piste pour les apparitions et
       les compilations, par pistes CRÉDITÉES — `focus_track_ids` — pour les
       collaborations). -->
  {#if apparaitSurCompte}
    <section class="bloc" data-section="appears-on">
      {#if parType}
        <!-- web#3032 — repliable aussi quand la discographie l'est. -->
        <h3 class="titre-section">
          <button class="replier" aria-expanded={!replies.has(REPLI_APPARAIT)} aria-controls={replies.has(REPLI_APPARAIT) ? undefined : ID_APPARAIT} onclick={() => basculerRepli(REPLI_APPARAIT)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
            {$t('v2.disco.appearsOn' as any)} <span class="cpt">{apparaitSurCompte}</span>
          </button>
        </h3>
      {:else}
        <h3 class="titre-section">{$t('v2.disco.appearsOn' as any)} <span class="cpt">{apparaitSurCompte}</span></h3>
      {/if}
      {#if !parType || !replies.has(REPLI_APPARAIT)}
      <div id={ID_APPARAIT}>
      {#if apparitionsTriees.length}
        <div class="groupe" data-section="apparitions">
          <div class="gr">
            {#each apparitionsTriees as e (e.cle)}
              {@render carte(e, 'apparitions')}
            {/each}
          </div>
        </div>
      {/if}
      {#each collaborationsTriees as g (g.cle)}
        <div class="groupe" data-section="collaborations" data-groupe={g.nom}>
          <h4 class="titre-groupe">{$t('v2.disco.withArtist' as any).replace('{artist}', g.nom)}</h4>
          <div class="gr">
            {#each g.entrees as e (e.cle)}
              {@render carte(e, 'collaborations')}
            {/each}
          </div>
        </div>
      {/each}
      {#if compilationsTriees.length}
        <div class="groupe" data-section="compilations">
          <h4 class="titre-groupe">{$t('v2.disco.compilations' as any)} <span class="cpt">{compilationsTriees.length}</span></h4>
          <div class="gr">
            {#each compilationsTriees as e (e.cle)}
              {@render carte(e, 'compilations')}
            {/each}
          </div>
        </div>
      {/if}
      </div>
      {/if}
    </section>
  {/if}

  <!-- #2794 (lot 2, PR 5) — « Joue avec » : `played_with` du serveur
       (tune-server-rust#7768), dans l'ordre reçu (le client ne retrie pas).
       #2961 — des puces qui passent à la ligne, nom ENTIER, compte discret
       dans la police du texte (« 13 titres », ou « 1 album » quand le
       serveur dit que les crédits tiennent tout l'album : `album_wide`).
       CHAQUE nom est un lien : la fiche par `artist_id`, sinon par le nom
       (`ouvrirArtisteDepuis` : fiche exacte, à défaut la Recherche). Clé
       absente = pas de bloc, sans message. -->
  {#if joueAvec?.length}
    <section class="bloc" data-section="played-with">
      <h3 class="titre-section">{$t('v2.disco.playedWith' as any)} <span class="cpt">{joueAvec.length}</span></h3>
      <ul class="liste-joue-avec">
        {#each joueAvec as j, i (`${j?.artist_id ?? ''}|${j?.artist_name ?? ''}|${i}`)}
          {@const compte = compteJoueAvec(j)}
          <li data-joue-avec={j.artist_name}>
            <span class="nom-joue-avec"><LienEntite titre={`${j.artist_name} · ${compte}`} entite={entiteJoueAvec(j)} /></span>
            <span class="compte-joue-avec">{compte}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <!-- Lot 2 (web#2639) — section 3 sur 4, « Écriture et production » : la
       clé `writing` du serveur (tune-server-rust#7767). Absente devant un
       serveur antérieur, et la section avec elle : elle ne se remplit JAMAIS
       depuis `reprises`, qui garde sa propre section. Ouvrir une vignette
       focalise la fiche d'album sur les pistes où l'artiste est CRÉDITÉ. -->
  {#if ecritureTriees.length}
    <section class="bloc" data-section="ecriture">
      <h3 class="titre-section">{$t('v2.disco.writing' as any)} <span class="cpt">{ecritureTriees.length}</span></h3>
      <div class="gr">
        {#each ecritureTriees as e (e.cle)}
          {@render carte(e, 'ecriture')}
        {/each}
      </div>
    </section>
  {/if}

  <!-- Section 4 sur 4, « Reprises » (#4862) : inchangée — ses œuvres
       enregistrées par d'autres, sans rôle audible sur le disque. -->
  {#if reprisesTriees.length}
    <section class="bloc" data-section="reprises">
      <h3 class="titre-section">{$t('v2.disco.covers' as any)} <span class="cpt">{reprisesTriees.length}</span></h3>
      <div class="gr">
        {#each reprisesTriees as e (e.cle)}
          {@render carte(e, 'reprises')}
        {/each}
      </div>
    </section>
  {/if}
</div>

{#snippet carte(e: EntreeDiscographie, origine: OrigineSection = null)}
  {@const al = e.principal.album}
  {@const loc = local(e)}
  {@const enBiblio = e.principal.source === BIBLIOTHEQUE}
  {@const cleEd = cleListe(e, origine)}
  {@const ouverte = editionsOuvertes === cleEd}
  <div class="carte" data-sources={e.sources.join(' ')} class:ouverte>
    <div class="cv">
      <PochetteActions
        favori={loc?.id != null ? { albumId: loc.id } : null}
        etiquettes={cibleEtiquetteAlbum(al, e.principal.source)}
        onLire={() => onLire(e.principal)}
        onOuvrir={() => onOuvrir(e.principal, origine)}
        objet={enBiblio && loc ? objetAlbum(loc) : objetAlbum(al, e.principal.source ?? null)}
        nom={al.title}
      >
        <!-- `source` n'est PAS passé à `AlbumArt` : il y poserait sa
             propre puce, et la vignette en afficherait deux. -->
        <AlbumArt coverPath={al.cover_path ?? loc?.cover_path ?? null}
          albumId={e.principal.source === BIBLIOTHEQUE ? al.id : null} size={0} vignette alt={al.title}
          fallbackInitials={al.title?.slice(0, 1)} />
      </PochetteActions>
    </div>
    <button class="meta" onclick={() => onOuvrir(e.principal, origine)}>
      <span class="ct" title={al.title}>{al.title}</span>
      <!-- web#2770 (lot 3) — l'année mène aux albums de cette année. -->
      <span class="ca" use:bulleTexte><LienEntite entite={{ type: 'annee', annee: al.year ?? e.exemplaires.find((x) => x.album.year)?.album.year ?? null }} /></span>
      {#if origine && al.credit_roles?.length}
        <!-- Ce que l'artiste fait sur ce disque, tel que MusicBrainz le nomme
             (`guitar`, `vocals`, `composer`…) — comme le tiroir des crédits
             de piste, qui les montre aussi bruts. -->
        <span class="roles" title={al.credit_roles.join(', ')}>{al.credit_roles.join(' · ')}</span>
      {/if}
    </button>
    <!-- tune-web-client#2829 (Ronin22, ASR #169) — une étiquette par
         plateforme, avec sa résolution, sous la vignette (hors pochette,
         comme #1136) : le même album chez Qobuz et Spotify est UNE vignette
         qui dit ce que chacun sert. -->
    <div class="versions">
      {#each versionsEntree(e) as v (v.source)}
        {@const res = v.resolution ?? (v.qualite === 'lossy' ? $t('v2.disco.lossy' as any) : null)}
        <span class="version" data-source={v.source} title={res ? `${v.source === BIBLIOTHEQUE ? $t('v2.disco.library' as any) : v.source} · ${res}` : null}>
          {#if v.source === BIBLIOTHEQUE}
            <span class="biblio" title={$t('v2.disco.library' as any)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 4v16M10 4v16M15 5l4 15"/></svg>
            </span>
          {:else}
            <ServiceBadge source={v.source} compact />
          {/if}
          {#if res}<span class="res">{res}</span>{/if}
        </span>
      {/each}
      {#if editionsCachees(e)}
        <!-- #8662 — les éditions de même titre qu'un service rend en plusieurs
             exemplaires : une vignette, et le choix ici. -->
        <button class="badge-editions" data-editions={e.editions.length}
          data-liste={idListe(cleEd)} aria-expanded={ouverte} aria-controls={ouverte ? idListe(cleEd) : undefined}
          onclick={() => basculerEditions(cleEd)}>
          {$t('v2.disco.editions' as any).replace('{n}', String(e.editions.length))}
        </button>
      {/if}
    </div>
    {#if ouverte}
      <div class="editions" id={idListe(cleEd)} role="group"
        aria-label={$t('v2.disco.editionsOf' as any).replace('{title}', al.title ?? '')}>
        <ul>
          {#each e.editions as ex, i (`${ex.source}|${ex.album.source_id ?? ex.album.id ?? i}|${i}`)}
            {@const d = detailEdition(ex)}
            {@const res = d.resolution ?? (d.qualite === 'lossy' ? $t('v2.disco.lossy' as any) : null)}
            <li class="edition" data-edition={ex.album.source_id ?? ex.album.id ?? ''} class:principale={ex === e.principal}>
              <button class="ouvrir-edition" title={$t('v2.disco.openEdition' as any)}
                onclick={() => { editionsOuvertes = null; onOuvrir(ex, origine); }}>
                <span class="et">{d.titre}</span>
                <span class="ed">
                  {#if ex.source === BIBLIOTHEQUE}
                    <span>{libelleSource(ex.source)}</span>
                  {:else}
                    <ServiceBadge source={ex.source} compact />
                  {/if}
                  {#if res}<span>{res}</span>{/if}
                  {#if d.date}<span>{d.date}</span>{/if}
                  {#if d.pistes}<span>{$t('v2.disco.editionTracks' as any).replace('{n}', String(d.pistes))}</span>{/if}
                  {#if d.label}<span>{d.label}</span>{/if}
                </span>
              </button>
              <button class="lire-edition" aria-label={`${$t('v2.disco.playEdition' as any)} — ${d.titre}`}
                title={$t('v2.disco.playEdition' as any)} onclick={() => onLire(ex)}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
              </button>
            </li>
          {/each}
        </ul>
        <button class="fermer-editions" onclick={() => { editionsOuvertes = null; }}>{$t('v2.disco.closeEditions' as any)}</button>
      </div>
    {/if}
  </div>
{/snippet}

<style>
  .disco { display: flex; flex-direction: column; }
  .pills { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 0 0 12px; }
  .pill {
    display: inline-flex; align-items: center; gap: 6px;
    border: 1px solid var(--v2-line2); background: transparent; color: var(--v2-txt3); cursor: pointer;
    border-radius: var(--v2-r-pill); padding: 5px 12px; font: 600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans);
  }
  .pill b { font: 700 calc(10px * var(--v2-txt-echelle, 1)) var(--v2-mono); opacity: .75; }
  .pill:hover { color: var(--v2-txt); }
  .pill.on { color: var(--v2-acc-tint); border-color: var(--v2-acc2); background: var(--v2-acc-soft); }
  .pill.raz { border-style: dashed; }
  .barre { display: flex; align-items: center; gap: 14px; padding: 0 0 12px; flex-wrap: wrap; }
  .espace { flex: 1; }
  .focus {
    display: inline-flex; align-items: center; gap: 4px;
    border: 0; background: transparent; cursor: pointer; padding: 0;
    font: 600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt2);
  }
  .focus svg { width: 14px; height: 14px; transition: transform .12s ease; }
  .focus.ouvert svg { transform: rotate(90deg); }
  .focus.actif, .focus:hover { color: var(--v2-acc1); }
  .cpt { font: calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); color: var(--v2-txt3); }
  .panneau {
    display: flex; flex-wrap: wrap; gap: 18px 40px; align-items: flex-start;
    padding: 14px 18px; margin: 0 0 16px;
    border-radius: var(--v2-r-card); background: var(--v2-line2);
  }
  .axe { display: flex; flex-direction: column; gap: 6px; min-width: 140px; }
  .axe h3 {
    margin: 0 0 2px; font: 600 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt3);
    text-transform: uppercase; letter-spacing: .06em;
  }
  .case { display: flex; align-items: center; gap: 7px; font-size: calc(13px * var(--v2-txt-echelle, 1)); color: var(--v2-txt2); cursor: pointer; }
  .case span:first-of-type { text-transform: capitalize; }
  .case .n { font: calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); color: var(--v2-txt3); }
  /* Le « Tout afficher » du panneau Focus. PAS `.raz` : ce nom est aussi celui
     de la pastille « Toutes » (`.pill.raz`), et cette règle, de même poids que
     `.pill` mais écrite après, lui ôtait bordure et marge et la posait en bas
     de la rangée (#1873). */
  .raz-focus {
    align-self: flex-end; border: 0; background: transparent; cursor: pointer; padding: 0;
    font: 600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-acc1);
  }
  .gr {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
    gap: 22px 18px;
    align-content: start;
  }
  .carte { display: flex; flex-direction: column; content-visibility: auto; contain-intrinsic-size: auto 210px; }
  /* #8662 — la liste ouverte passe au-dessus des vignettes voisines :
     `content-visibility` la rognerait, on le lève sur la carte ouverte. */
  .carte.ouverte { position: relative; z-index: 3; content-visibility: visible; }
  .badge-editions {
    border: 1px solid var(--v2-line2); background: transparent; cursor: pointer;
    border-radius: var(--v2-r-pill); padding: 1px 7px;
    font: 600 calc(10px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-acc1);
  }
  .badge-editions:hover, .badge-editions[aria-expanded="true"] { border-color: var(--v2-acc2); background: var(--v2-acc-soft); }
  .badge-editions:focus-visible, .ouvrir-edition:focus-visible, .lire-edition:focus-visible, .fermer-editions:focus-visible {
    outline: 2px solid var(--v2-acc1); outline-offset: 2px;
  }
  .editions {
    position: absolute; top: 100%; left: 0; margin-top: 6px;
    width: max(100%, 280px); max-width: min(360px, 90vw); max-height: 320px; overflow: auto;
    padding: 8px; border-radius: var(--v2-r-card);
    background: var(--v2-surface2); border: 1px solid var(--v2-line2);
    box-shadow: 0 8px 24px rgba(0, 0, 0, .35);
  }
  .editions ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .edition { display: flex; align-items: center; gap: 6px; border-radius: 6px; }
  .edition.principale { background: var(--v2-acc-soft); }
  .ouvrir-edition {
    flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;
    border: 0; background: transparent; color: inherit; cursor: pointer; text-align: left; padding: 6px;
  }
  .ouvrir-edition:hover .et { color: var(--v2-acc1); }
  .et {
    font: 600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ed {
    display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px;
    font: calc(10.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); color: var(--v2-txt3);
  }
  .lire-edition {
    flex: none; display: grid; place-items: center; width: 28px; height: 28px;
    border: 0; border-radius: 50%; background: transparent; color: var(--v2-txt2); cursor: pointer;
  }
  .lire-edition:hover { color: var(--v2-acc1); background: var(--v2-line2); }
  .lire-edition svg { width: 14px; height: 14px; }
  .fermer-editions {
    display: block; margin: 6px 0 0 auto; border: 0; background: transparent; cursor: pointer; padding: 2px 4px;
    font: 600 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt3);
  }
  .cv { position: relative; aspect-ratio: 1; border-radius: var(--v2-r-card); overflow: hidden; }
  .cv :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  /* #2829 — les étiquettes plateforme + résolution, sous le titre. */
  .versions { display: flex; flex-wrap: wrap; gap: 4px 6px; margin-top: 5px; }
  .version {
    display: inline-flex; align-items: center; gap: 4px;
    font: calc(10px * var(--v2-txt-echelle, 1)) var(--v2-mono); color: var(--v2-txt3); white-space: nowrap;
  }
  .version .res { color: var(--v2-txt2); }
  .biblio {
    display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%;
    background: var(--v2-line2); color: var(--v2-txt);
  }
  .biblio svg { width: 10px; height: 10px; }
  .meta {
    display: block; width: 100%; border: 0; background: transparent; padding: 0;
    text-align: left; color: inherit; font: inherit; cursor: pointer;
  }
  .ct {
    display: block; margin-top: 9px;
    font: 600 calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); line-height: 1.25;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ca {
    display: block; margin-top: 2px;
    font: calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); color: var(--v2-txt3);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .connexes { margin-top: 28px; }
  /* Lot 2 (web#2639) — les quatre sections de la page, un cran au-dessus des
     sous-sections `.titre-connexes` (types de sortie) et des groupes
     `.titre-groupe` (« Avec … », compilations). */
  .bloc ~ .bloc { margin-top: 34px; }
  .titre-section {
    display: flex; align-items: baseline; gap: 8px; margin: 0 0 14px;
    font: 600 calc(15px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt);
  }
  .bloc > .connexes:first-of-type { margin-top: 0; }
  .roles {
    display: block; margin-top: 2px;
    font: calc(10.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt3);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .groupe + .groupe { margin-top: 20px; }
  .titre-groupe { margin: 0 0 12px; font: 500 calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt3); }
  .titre-connexes {
    display: flex; align-items: baseline; gap: 8px; margin: 0 0 14px;
    font: 600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt2);
  }
  /* web#3032 — le titre d'une section repliable est un bouton : même police
     que le titre, un chevron qui tourne quand elle est ouverte. */
  .replier {
    display: inline-flex; align-items: baseline; gap: 8px;
    border: 0; background: transparent; padding: 0; cursor: pointer;
    font: inherit; color: inherit; text-align: left;
  }
  .replier svg { width: 14px; height: 14px; align-self: center; transition: transform .12s ease; }
  .replier[aria-expanded="true"] svg { transform: rotate(90deg); }
  .replier:hover { color: var(--v2-acc1); }
  .replier:focus-visible { outline: 2px solid var(--v2-acc1); outline-offset: 2px; }
  .etat { padding: 22px 0; color: var(--v2-txt3); font-size: calc(13.5px * var(--v2-txt-echelle, 1)); }
  /* #2794 / #2961 — « Joue avec » : des puces qui passent à la ligne, le nom
     en entier (il se coupe plutôt que de se tronquer), le compte discret dans
     la police du texte. */
  .liste-joue-avec {
    list-style: none; margin: 0; padding: 0;
    display: flex; flex-wrap: wrap; gap: 8px;
  }
  .liste-joue-avec li {
    display: inline-flex; align-items: baseline; gap: 6px; max-width: 100%;
    padding: 4px 12px; border: 1px solid var(--v2-line2); border-radius: var(--v2-r-pill, 999px);
    font: calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt);
  }
  .nom-joue-avec { min-width: 0; overflow-wrap: anywhere; }
  .compte-joue-avec { flex: none; font-size: 0.92em; color: var(--v2-txt3); white-space: nowrap; }
</style>
