<script lang="ts">
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
  import type { GroupeCollaborations } from '../../lib/api';
  import { partagerDiscographie } from '../../lib/discographieConnexes';
  import {
    BIBLIOTHEQUE, basculerProvenance, compterFocus, compterProvenances, comptesProvenanceFiche, dansProvenances, recentrerSurProvenances,
    filtrerFocus, fusionnerDiscographie, partagerParTypeDeSortie, provenanceCochee,
    type EntreeDiscographie, type Exemplaire, type Qualite,
  } from '../../lib/discographieCommune';
  import { trierAlbums, type CleTriAlbums, type SensTri } from '../../lib/trierAlbums';
  import type { OrigineSection } from '../../lib/focusArtiste';
  import { lireChoix, ecrireChoix } from '../../lib/preferencesEcran';
  import { libelleProvenance, type ComptesArtistesSources } from '../../lib/provenanceBibliotheque';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import AlbumArt from '../partages/AlbumArt.svelte';
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
  }
  let { locaux = [], services = [], servicesEnCharge = false, onOuvrir, onLire, provenance = null, onComptesProvenance, nomArtiste = null, compilations = [], apparitions = [], collaborations = [], reprises = [] }: Props = $props();

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
      toutes, compilationsToutes, apparitionsToutes, reprisesToutes,
      ...collaborationsToutes.map((g) => g.entrees),
    ]),
  );
  /** Les provenances cochées ; vide = toutes. */
  let choix = $state<Set<string>>(new Set());
  // La source choisie dans la grille de la Bibliothèque (#1501) est la
  // pastille cochée à l'OUVERTURE — et plus un filtre invisible qu'on ne
  // pouvait pas retirer depuis la fiche. La fiche démonte cette grille pendant
  // chaque chargement : un autre artiste repart donc de là.
  $effect.pre(() => {
    choix = provenance ? new Set([provenance]) : new Set();
  });
  // Un ensemble REMPLACÉ, pas modifié en place : `$state` suit l'affectation,
  // et un `Set` muté garderait la même référence.
  function basculerPastille(cle: string) {
    choix = basculerProvenance(choix, cle, provenances.map((p) => p.cle));
  }
  // Filtrer ne suffit pas : la vignette gardée pour son exemplaire Qobuz doit
  // aussi OUVRIR cet exemplaire, pas la copie locale (30/09/2026, Yves Corbat).
  const garder = (liste: EntreeDiscographie[]) =>
    liste.filter((e) => dansProvenances(e, choix)).map((e) => recentrerSurProvenances(e, choix));

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

  /** L'exemplaire local d'une vignette, s'il y en a un — il porte le cœur. */
  const local = (e: EntreeDiscographie) => e.exemplaires.find((x) => x.source === BIBLIOTHEQUE)?.album ?? null;

  /*
   * Le menu « … » des vignettes de cet écran vient de `lib/actionsPochette` et
   * `lib/gestesObjet` (menus d'objets, 26/09/2026) : cet écran ne donne que
   * l'OBJET, et le même album y a le même menu qu'ailleurs.
   */

  const libelleQualite = (q: Qualite) =>
    q === 'hires' ? $t('v2.disco.hires' as any) : q === 'cd' ? $t('v2.disco.cd' as any) : $t('v2.disco.lossy' as any);
</script>

<div class="disco">
  {#if provenances.length > 1 || choix.size}
    <!-- « Toutes » OUVRE la rangée et y est toujours : l'absence de filtre ne
         se dit pas en allumant toutes les autres (#1145, même rangée qu'à la
         Recherche). Une seule source : rien à choisir, pas de rangée. -->
    <div class="pills" role="group" aria-label={$t('v2.disco.source' as any)}>
      <button class="pill raz" data-pastille="tout" class:on={choix.size === 0}
        aria-pressed={choix.size === 0} onclick={() => (choix = new Set())}>{$t('v2.fav.allSources' as any)}</button>
      {#each provenances as p (p.cle)}
        <button class="pill" data-pastille={p.cle} class:on={provenanceCochee(p.cle, choix)}
          aria-pressed={provenanceCochee(p.cle, choix)} onclick={() => basculerPastille(p.cle)}>
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
        <button class="raz" onclick={toutAfficher}>{$t('v2.disco.reset' as any)}</button>
      {/if}
    </div>
  {/if}

  {#if !filtrees.length && toutes.length}
    <div class="etat">{$t('v2.disco.noMatch' as any)}</div>
  {:else}
    {#if !sectionsSortie.epSingles.length}
      <div class="gr">
        {#each triees as e (e.cle)}
          {@render carte(e)}
        {/each}
      </div>
    {:else}
      {#if sectionsSortie.albums.length}
        <section data-section="albums-principaux">
          <h3 class="titre-connexes">{$t('v2.disco.mainAlbums' as any)} <span class="cpt">{sectionsSortie.albums.length}</span></h3>
          <div class="gr">
            {#each sectionsSortie.albums as e (e.cle)}
              {@render carte(e)}
            {/each}
          </div>
        </section>
      {/if}
      <section class="connexes" data-section="ep-singles">
        <h3 class="titre-connexes">{$t('v2.disco.epSingles' as any)} <span class="cpt">{sectionsSortie.epSingles.length}</span></h3>
        <div class="gr">
          {#each sectionsSortie.epSingles as e (e.cle)}
            {@render carte(e)}
          {/each}
        </div>
      </section>
    {/if}
    {#if servicesEnCharge}
      <div class="etat">{$t('common.loading' as any)}</div>
    {/if}
  {/if}

  <!-- #4767 — les deux sections que FabienM demande d'après Roon. Rendues
       SEULEMENT quand elles portent quelque chose : une section vide ne
       s'explique pas, et le serveur ne renvoie même pas la clé. Le compte est
       la longueur de la liste rendue — rien d'autre ne le porte, donc rien ne
       peut diverger. Ouvrir une de ces vignettes focalise la fiche d'album
       sur l'artiste de la page. -->
  {#if compilationsTriees.length}
    <section class="connexes" data-section="compilations">
      <h3 class="titre-connexes">{$t('v2.disco.compilations' as any)} <span class="cpt">{compilationsTriees.length}</span></h3>
      <div class="gr">
        {#each compilationsTriees as e (e.cle)}
          {@render carte(e, 'compilations')}
        {/each}
      </div>
    </section>
  {/if}

  {#if apparitionsTriees.length}
    <section class="connexes" data-section="apparitions">
      <h3 class="titre-connexes">{$t('v2.disco.appearances' as any)} <span class="cpt">{apparitionsTriees.length}</span></h3>
      <div class="gr">
        {#each apparitionsTriees as e (e.cle)}
          {@render carte(e, 'apparitions')}
        {/each}
      </div>
    </section>
  {/if}

  <!-- #4767 (crédits) — mêmes règles : rendues seulement quand elles portent
       quelque chose. Ouvrir une de ces vignettes focalise la fiche d'album sur
       les pistes où l'artiste est CRÉDITÉ (`focus_track_ids`). -->
  {#if collaborationsCompte}
    <section class="connexes" data-section="collaborations">
      <h3 class="titre-connexes">{$t('v2.disco.collaborations' as any)} <span class="cpt">{collaborationsCompte}</span></h3>
      {#each collaborationsTriees as g (g.cle)}
        <div class="groupe" data-groupe={g.nom}>
          <h4 class="titre-groupe">{$t('v2.disco.withArtist' as any).replace('{artist}', g.nom)}</h4>
          <div class="gr">
            {#each g.entrees as e (e.cle)}
              {@render carte(e, 'collaborations')}
            {/each}
          </div>
        </div>
      {/each}
    </section>
  {/if}

  {#if reprisesTriees.length}
    <section class="connexes" data-section="reprises">
      <h3 class="titre-connexes">{$t('v2.disco.covers' as any)} <span class="cpt">{reprisesTriees.length}</span></h3>
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
  <div class="carte" data-sources={e.sources.join(' ')}>
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
          albumId={e.principal.source === BIBLIOTHEQUE ? al.id : null} size={0} alt={al.title}
          fallbackInitials={al.title?.slice(0, 1)} />
      </PochetteActions>
      <div class="pastilles">
        {#each e.sources as s (s)}
          {#if s === BIBLIOTHEQUE}
            <span class="biblio" title={$t('v2.disco.library' as any)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 4v16M10 4v16M15 5l4 15"/></svg>
            </span>
          {:else}
            <ServiceBadge source={s} compact />
          {/if}
        {/each}
      </div>
    </div>
    <button class="meta" onclick={() => onOuvrir(e.principal, origine)}>
      <span class="ct" title={al.title}>{al.title}</span>
      <span class="ca">{al.year ?? e.exemplaires.find((x) => x.album.year)?.album.year ?? ''}</span>
      {#if origine && al.credit_roles?.length}
        <!-- Ce que l'artiste fait sur ce disque, tel que MusicBrainz le nomme
             (`guitar`, `vocals`, `composer`…) — comme le tiroir des crédits
             de piste, qui les montre aussi bruts. -->
        <span class="roles" title={al.credit_roles.join(', ')}>{al.credit_roles.join(' · ')}</span>
      {/if}
    </button>
  </div>
{/snippet}

<style>
  .disco { display: flex; flex-direction: column; }
  .pills { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 0 0 12px; }
  .pill {
    display: inline-flex; align-items: center; gap: 6px;
    border: 1px solid var(--v2-line2); background: transparent; color: var(--v2-txt3); cursor: pointer;
    border-radius: var(--v2-r-pill); padding: 5px 12px; font: 600 12px var(--v2-sans);
  }
  .pill b { font: 700 10px var(--v2-mono); opacity: .75; }
  .pill:hover { color: var(--v2-txt); }
  .pill.on { color: var(--v2-acc-tint); border-color: var(--v2-acc2); background: var(--v2-acc-soft); }
  .pill.raz { border-style: dashed; }
  .barre { display: flex; align-items: center; gap: 14px; padding: 0 0 12px; flex-wrap: wrap; }
  .espace { flex: 1; }
  .focus {
    display: inline-flex; align-items: center; gap: 4px;
    border: 0; background: transparent; cursor: pointer; padding: 0;
    font: 600 13px var(--v2-sans); color: var(--v2-txt2);
  }
  .focus svg { width: 14px; height: 14px; transition: transform .12s ease; }
  .focus.ouvert svg { transform: rotate(90deg); }
  .focus.actif, .focus:hover { color: var(--v2-acc1); }
  .cpt { font: 11px var(--v2-mono); color: var(--v2-txt3); }
  .panneau {
    display: flex; flex-wrap: wrap; gap: 18px 40px; align-items: flex-start;
    padding: 14px 18px; margin: 0 0 16px;
    border-radius: var(--v2-r-card); background: var(--v2-line2);
  }
  .axe { display: flex; flex-direction: column; gap: 6px; min-width: 140px; }
  .axe h3 {
    margin: 0 0 2px; font: 600 11px var(--v2-sans); color: var(--v2-txt3);
    text-transform: uppercase; letter-spacing: .06em;
  }
  .case { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--v2-txt2); cursor: pointer; }
  .case span:first-of-type { text-transform: capitalize; }
  .case .n { font: 11px var(--v2-mono); color: var(--v2-txt3); }
  .raz {
    align-self: flex-end; border: 0; background: transparent; cursor: pointer; padding: 0;
    font: 600 12px var(--v2-sans); color: var(--v2-acc1);
  }
  .gr {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
    gap: 22px 18px;
    align-content: start;
  }
  .carte { display: flex; flex-direction: column; content-visibility: auto; contain-intrinsic-size: auto 210px; }
  .cv { position: relative; aspect-ratio: 1; border-radius: var(--v2-r-card); overflow: hidden; }
  .cv :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  /* SOUS les icônes de coin de `PochetteActions` (z-index 1) : au survol, ce
     sont elles qui doivent se lire. */
  .pastilles {
    position: absolute; left: 6px; bottom: 6px; z-index: 0;
    display: flex; gap: 4px; align-items: center; pointer-events: none;
  }
  .biblio {
    display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%;
    background: rgba(18, 18, 20, 0.82); color: #fff;
  }
  .biblio svg { width: 11px; height: 11px; }
  .meta {
    display: block; width: 100%; border: 0; background: transparent; padding: 0;
    text-align: left; color: inherit; font: inherit; cursor: pointer;
  }
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
  .connexes { margin-top: 28px; }
  .roles {
    display: block; margin-top: 2px;
    font: 10.5px var(--v2-sans); color: var(--v2-txt3);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .groupe + .groupe { margin-top: 20px; }
  .titre-groupe { margin: 0 0 12px; font: 500 12.5px var(--v2-sans); color: var(--v2-txt3); }
  .titre-connexes {
    display: flex; align-items: baseline; gap: 8px; margin: 0 0 14px;
    font: 600 13px var(--v2-sans); color: var(--v2-txt2);
  }
  .etat { padding: 22px 0; color: var(--v2-txt3); font-size: 13.5px; }
</style>
