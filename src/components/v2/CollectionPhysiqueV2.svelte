<!--
  tune-server-rust#7195 — « Ma collection physique » : la collection Discogs
  (vinyles, CD, SACD, cassettes…) comparée à la bibliothèque et à Qobuz /
  TIDAL. Pour chaque disque : « dans ma bibliothèque » (qualité, copié ou
  non pour un CD), « en streaming » (service, Écouter, favori), « nulle
  part ». Filtres par format et par état, avec leurs compteurs.

  La synchronisation tourne sur le serveur, en tâche de fond (Discogs : 60
  requêtes par minute au plus) : l'écran la lance et suit son avancement.
  « Écouter » et « Ajouter aux favoris » sont ceux des albums manquants
  (#6288). L'attribution « Data provided by Discogs » est celle que demandent
  les conditions d'usage de Discogs.

  Bertrand, 31/10/2026 (essai réel sur le .18) : « aucune pochette », et
  l'écran doit se lire comme la Bibliothèque. Grille de pochettes par défaut
  (titre et artiste sous la carte, état en pastille), bascule grille / liste
  de la Bibliothèque (`BasculeAffichage`, `lib/affichage`), choix retenu par
  `lib/preferencesEcran` comme là-bas. La pochette (`pochetteDuDisque`) :
  celle de l'album local s'il est dans la bibliothèque, sinon la vignette
  Discogs, sinon le repli d'`AlbumArt`.

  Cache (Bertrand, 01/11/2026) : la pochette Discogs vient du CACHE du
  serveur (`urlPochette`, ETag et 304), jamais plus du CDN de Discogs. La
  liste se lit tout de suite dans le cache du serveur ; si elle a plus de
  dix minutes, une revalidation discrète tourne (« Mise à jour… » dans
  l'en-tête, pas d'avancement détaillé). « Effacer le cache » est à côté
  du compte.
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import {
    ATTRIBUTION_DISCOGS, ETATS, FAMILLES, LIEN_DISCOGS,
    CLE_AFFICHAGE, CLE_PASTILLE,
    aRevalider, cleErreur, clicSurDisque, codeDeRefus, compteDuJeton, effacerCache, legendeDuDisque,
    lireCollection, lireEtat,
    lireReglages, nomService, nomValide, pastillesDuDisque, pochetteDuDisque, poserCompte, qualiteDe, synchroniser,
    type Collection, type Disque, type EtatDisque, type EtatSynchro, type Famille,
    type Reglages, type SurUnService,
  } from '../../lib/collectionPhysique';
  import { activeView, pendingLibraryAlbum, vueDeRetour } from '../../lib/stores/navigation';
  import { ficheAlbumService } from '../../lib/stores/streaming';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import BasculeAffichage from './BasculeAffichage.svelte';
  import { GRILLE_OU_LISTE, type Affichage } from '../../lib/affichage';
  import { lireChoix, ecrireChoix } from '../../lib/preferencesEcran';
  import { favoriteStreamingKeys } from '../../lib/stores/profile';
  import { isStreamingFavorite, toggleStreamingFavorite, type StreamingRef } from '../../lib/streamingFavorites';
  import { playAndSync } from '../../lib/stores/zones';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { messageEchecLecture } from '../../lib/echecLecture';
  import { notifications } from '../../lib/stores/notifications';
  import { dateEtHeure } from '../../lib/dates';

  let reglages = $state<Reglages | null>(null);
  let etat = $state<EtatSynchro | null>(null);
  let collection = $state<Collection | null>(null);
  let nom = $state('');
  let format = $state<Famille | null>(null);
  let filtreEtat = $state<EtatDisque | null>(null);
  let erreur = $state<string | null>(null);
  let chargement = $state(true);
  let occupe = $state(false);
  let minuterie: ReturnType<typeof setInterval> | null = null;
  /** La synchronisation en cours est la revalidation discrète de
   *  l'ouverture : « Mise à jour… », sans l'avancement détaillé. */
  let revalidation = $state(false);
  /** Grille par défaut, comme la Bibliothèque ; le choix est retenu. */
  let affichage = $state<Affichage>(lireChoix(CLE_AFFICHAGE, GRILLE_OU_LISTE, 'grid'));

  const enCours = $derived(etat?.avancement?.en_cours === true);
  const affinageRestants = $derived(etat?.affinage_musicbrainz?.restants ?? 0);
  const affinageEnCours = $derived(etat?.affinage_musicbrainz?.en_cours === true);

  function texte(cle: string, valeurs: Record<string, string | number> = {}): string {
    let s = $t(cle as any) as string;
    for (const [k, v] of Object.entries(valeurs)) s = s.replace(`{${k}}`, String(v));
    return s;
  }

  async function chargerCollection() {
    try {
      collection = await lireCollection(format, filtreEtat);
    } catch (e) {
      erreur = cleErreur(codeDeRefus(e));
    }
  }

  async function chargerTout() {
    chargement = true;
    erreur = null;
    try {
      reglages = await lireReglages();
      nom = reglages.nom_utilisateur ?? '';
      etat = await lireEtat();
      await chargerCollection();
      if (collection?.statut === 'ok' && aRevalider(etat)) {
        // La grille est déjà là (le cache du serveur) ; la revalidation
        // tourne derrière, discrètement.
        void revalider();
      } else if (etat?.avancement?.en_cours || etat?.affinage_musicbrainz?.en_cours) suivre();
    } catch (e) {
      erreur = cleErreur(codeDeRefus(e));
    } finally {
      chargement = false;
    }
  }

  async function revalider() {
    try {
      const r = await synchroniser();
      if (!r.lance) return;
      revalidation = true;
      etat = etat ? { ...etat, avancement: { ...r.avancement, en_cours: true } } : etat;
      suivre();
    } catch {
      // Discrète : un échec ne dit rien de plus que le cache affiché.
      revalidation = false;
    }
  }

  async function viderLeCache() {
    if (!window.confirm($t('collectionPhysique.effacerCacheConfirmer' as any) as string)) return;
    occupe = true;
    erreur = null;
    try {
      await effacerCache('tout');
      arreterSuivi();
      revalidation = false;
      etat = await lireEtat();
      await chargerCollection();
    } catch (e) {
      erreur = cleErreur(codeDeRefus(e));
    } finally {
      occupe = false;
    }
  }

  function arreterSuivi() {
    if (minuterie) clearInterval(minuterie);
    minuterie = null;
  }

  /** Relit l'avancement toutes les 3 s tant que la synchronisation ou
   *  l'affinage MusicBrainz tourne, et la collection toutes les 15 s :
   *  « En streaming » se remplit pendant la synchronisation, pas à la fin. */
  function suivre() {
    arreterSuivi();
    let tours = 0;
    minuterie = setInterval(async () => {
      try {
        etat = await lireEtat();
        tours += 1;
        if (!etat.avancement.en_cours) revalidation = false;
        if (!etat.avancement.en_cours && !etat.affinage_musicbrainz?.en_cours) {
          arreterSuivi();
          await chargerCollection();
        } else if (tours % 5 === 0) {
          await chargerCollection();
        }
      } catch {
        arreterSuivi();
      }
    }, 3000);
  }

  async function enregistrer() {
    const n = nom.trim();
    if (n && !nomValide(n)) {
      erreur = cleErreur('nom_invalide');
      return;
    }
    occupe = true;
    erreur = null;
    try {
      reglages = await poserCompte(n || null);
      etat = await lireEtat();
      await chargerCollection();
    } catch (e) {
      erreur = cleErreur(codeDeRefus(e));
    } finally {
      occupe = false;
    }
  }

  async function utiliserLeJeton() {
    occupe = true;
    erreur = null;
    try {
      reglages = await compteDuJeton();
      nom = reglages.nom_utilisateur ?? '';
      await chargerCollection();
    } catch (e) {
      erreur = cleErreur(codeDeRefus(e));
    } finally {
      occupe = false;
    }
  }

  async function lancer() {
    erreur = null;
    revalidation = false;
    try {
      const r = await synchroniser();
      etat = etat ? { ...etat, avancement: { ...r.avancement, en_cours: true } } : etat;
      suivre();
    } catch (e) {
      erreur = cleErreur(codeDeRefus(e));
    }
  }

  function filtrer(f: Famille | null, e: EtatDisque | null) {
    format = f;
    filtreEtat = e;
    void chargerCollection();
  }

  const toutFormat = () => filtrer(null, filtreEtat);
  const toutEtat = () => filtrer(format, null);

  function ouvrirAlbum(id: number) {
    pendingLibraryAlbum.set(id);
    activeView.set('library');
  }

  /** Le clic sur une carte : l'album de la bibliothèque, sinon l'album chez
   *  le service, sinon la fiche Discogs (nouvel onglet). */
  function ouvrir(d: Disque) {
    const c = clicSurDisque(d);
    if (c.vers === 'album') {
      ouvrirAlbum(c.albumId);
    } else if (c.vers === 'streaming') {
      vueDeRetour.set('collectionphysique');
      ficheAlbumService.set({
        service: c.service.service as any,
        id: c.service.id,
        titre: c.service.titre,
        pochette: null,
        artiste: c.service.artiste || d.artiste,
      });
      activeView.set('streamingalbum');
    } else {
      window.open(c.url, '_blank', 'noopener,noreferrer');
    }
  }

  function refDe(d: Disque, s: SurUnService): StreamingRef {
    return { itemType: 'album', service: s.service, serviceId: s.id, title: s.titre, artist: s.artiste || d.artiste };
  }

  function ecouter(s: SurUnService) {
    const zid = zoneRequise();
    if (zid == null) return;
    playAndSync(zid, { streaming_album_id: s.id, source: s.service as any }).catch((e) =>
      notifications.error(messageEchecLecture(e, 'library.playbackError')),
    );
  }

  const compteFormat = (f: Famille) => collection?.compteurs?.par_format?.[f] ?? 0;
  const compteEtat = (e: EtatDisque) => collection?.compteurs?.par_etat?.[e] ?? 0;

  onMount(() => { void chargerTout(); });
  onDestroy(arreterSuivi);
</script>

<section class="v2-collection tune-v2" data-collection-physique>
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">Discogs</div>
      <h1>{$t('collectionPhysique.titre' as any)}</h1>
    </div>
    {#if collection?.statut === 'ok'}
      <div class="v2-actions">
        <div class="meta">
          {#if revalidation && enCours}<span data-mise-a-jour>{$t('collectionPhysique.miseAJour' as any)}</span>{/if}
          <span>{texte('collectionPhysique.compteur', { n: collection.compteurs.total })}</span>
        </div>
      </div>
    {/if}
  </header>
  <div class="scroll">
    <p class="intro">{$t('collectionPhysique.intro' as any)}</p>

    <div class="compte">
      <label>
        <span>{$t('collectionPhysique.compte' as any)}</span>
        <input type="text" bind:value={nom} autocomplete="off" spellcheck="false" maxlength="64"
          placeholder={$t('collectionPhysique.comptePlaceholder' as any)} data-nom-discogs />
      </label>
      <button class="v2-btn" onclick={enregistrer} disabled={occupe}>{$t('collectionPhysique.enregistrer' as any)}</button>
      {#if reglages?.jeton === 'personnel'}
        <button class="v2-btn ghost" onclick={utiliserLeJeton} disabled={occupe} data-compte-du-jeton>
          {$t('collectionPhysique.utiliserJeton' as any)}
        </button>
      {/if}
      <button class="v2-btn" onclick={lancer} disabled={enCours || !reglages?.nom_utilisateur} data-synchroniser>
        {#if enCours && !revalidation}{$t('collectionPhysique.enCours' as any)}{:else}{$t('collectionPhysique.synchroniser' as any)}{/if}
      </button>
      <button class="v2-btn ghost" onclick={viderLeCache} disabled={occupe} data-effacer-cache>
        {$t('collectionPhysique.effacerCache' as any)}
      </button>
    </div>
    {#if reglages?.jeton === 'personnel'}
      <p class="aide">{$t('collectionPhysique.jetonPersonnel' as any)}</p>
    {:else}
      <p class="aide">{$t('collectionPhysique.sansJeton' as any)}</p>
    {/if}

    {#if enCours && !revalidation && etat?.avancement?.etape}
      <p class="avancement" data-avancement>
        {$t(`collectionPhysique.etape.${etat.avancement.etape}` as any)}
        {#if etat.avancement.total}— {etat.avancement.fait} / {etat.avancement.total}{/if}
      </p>
    {/if}
    {#if erreur}
      <p class="err" data-erreur>{$t(erreur as any)}</p>
    {:else if etat?.derniere_erreur && !enCours}
      <p class="err" data-erreur>{$t(cleErreur(etat.derniere_erreur) as any)}</p>
    {/if}
    {#if affinageRestants > 0 && (affinageEnCours || !enCours)}
      <p class="aide" data-affinage-musicbrainz>{texte('collectionPhysique.affinageMusicbrainz', { n: affinageRestants })}</p>
    {/if}
    {#if etat?.derniere_synchro}
      <p class="aide">{texte('collectionPhysique.derniere', { date: $dateEtHeure(etat.derniere_synchro * 1000) })}</p>
    {/if}

    {#if chargement}
      <div class="state">{$t('common.loading' as any)}</div>
    {:else if collection?.statut === 'aucun_compte'}
      <div class="state">{$t('collectionPhysique.aucunCompte' as any)}</div>
    {:else if collection?.statut === 'a_synchroniser'}
      <div class="state">{$t('collectionPhysique.aSynchroniser' as any)}</div>
    {:else if collection}
      {#if collection.tronquee}<p class="aide">{$t('collectionPhysique.tronquee' as any)}</p>{/if}
      <div class="filtres" role="group" aria-label={$t('collectionPhysique.filtreFormat' as any)}>
        <button class="puce" class:on={format === null} onclick={toutFormat}>{$t('collectionPhysique.sansFiltre' as any)}</button>
        {#each FAMILLES as f (f)}
          {#if compteFormat(f)}
            <button class="puce" class:on={format === f} aria-pressed={format === f} onclick={() => filtrer(f, filtreEtat)} data-format={f}>
              {$t(`collectionPhysique.format.${f}` as any)} <span class="n">{compteFormat(f)}</span>
            </button>
          {/if}
        {/each}
      </div>
      <div class="filtres" role="group" aria-label={$t('collectionPhysique.filtreEtat' as any)}>
        <span class="vues">
          <BasculeAffichage modes={GRILLE_OU_LISTE} valeur={affichage}
            onChanger={(v) => { affichage = v; ecrireChoix(CLE_AFFICHAGE, v); }} />
        </span>
        <button class="puce" class:on={filtreEtat === null} onclick={toutEtat}>{$t('collectionPhysique.sansFiltre' as any)}</button>
        {#each ETATS as e (e)}
          {#if compteEtat(e) || e !== 'a_verifier'}
            <button class="puce" class:on={filtreEtat === e} aria-pressed={filtreEtat === e} onclick={() => filtrer(format, e)} data-etat={e}>
              {$t(`collectionPhysique.etat.${e}` as any)} <span class="n">{compteEtat(e)}</span>
            </button>
          {/if}
        {/each}
      </div>
      {#if !collection.disques.length}
        <div class="state vide">{$t('collectionPhysique.aucunDisque' as any)}</div>
      {:else if affichage === 'grid'}
        <div class="grid" data-grille-collection>
          {#each collection.disques as d (d.instance_id)}
            {@const p = pochetteDuDisque(d)}
            <div class="card" data-disque={d.release_id} data-etat-disque={d.etat}>
              <button class="cover" onclick={() => ouvrir(d)} aria-label={d.titre} data-ouvrir-disque>
                <AlbumArt coverPath={p.coverPath} albumId={p.albumId} directe={p.directe} size={0} vignette
                  alt={d.titre} fallbackInitials={d.titre?.slice(0, 1)} />
                <span class="pastilles">
                  {#each pastillesDuDisque(d) as pa (pa)}
                    <span class="pastille {pa}" data-pastille={pa}>{$t(CLE_PASTILLE[pa] as any)}</span>
                  {/each}
                </span>
              </button>
              <button class="meta" onclick={() => ouvrir(d)}>
                <div class="ct" title={d.titre}>{d.titre}</div>
                <div class="ca" title={d.artiste}>{d.artiste}</div>
              </button>
            </div>
          {/each}
        </div>
      {:else}
        <ul class="list">
          {#each collection.disques as d (d.instance_id)}
            {@const p = pochetteDuDisque(d)}
            <li class="ligne" data-disque={d.release_id} data-etat-disque={d.etat}>
              <span class="lcv">
                <AlbumArt coverPath={p.coverPath} albumId={p.albumId} directe={p.directe} size={0} vignette
                  alt={d.titre} fallbackInitials={d.titre?.slice(0, 1)} />
              </span>
              <span class="ti">
                <span class="tt" title={d.titre}>{d.titre}</span>
                <em title={[d.artiste, legendeDuDisque(d)].filter(Boolean).join(' · ')}>{d.artiste}{#if legendeDuDisque(d)} · {legendeDuDisque(d)}{/if}</em>
                <span class="fmt" title={d.formats.join(' · ')}>{d.formats.join(' · ')}{#if d.precisions.length} — {d.precisions.join(', ')}{/if}</span>
              </span>
              <span class="ou">
                {#if d.bibliotheque}
                  {@const album = d.bibliotheque}
                  <span class="badge bib">{$t('collectionPhysique.etat.bibliotheque' as any)}</span>
                  {#if qualiteDe(album)}<span class="q">{qualiteDe(album)}</span>{/if}
                  {#if d.copie === true}<span class="q">{$t('collectionPhysique.copie' as any)}</span>{/if}
                  <button class="mini" onclick={() => ouvrirAlbum(album.album_id)} data-ouvrir-album>{$t('collectionPhysique.ouvrirAlbum' as any)}</button>
                {:else if d.streaming.length}
                  {#each d.streaming as s (s.service)}
                    {@const ref = refDe(d, s)}
                    {@const fav = isStreamingFavorite($favoriteStreamingKeys, ref)}
                    <span class="badge st" data-service={s.service}>{nomService(s.service)}</span>
                    <button class="mini" onclick={() => ecouter(s)} data-ecouter>
                      {$t('v2.manquants.ecouterSur' as any).replace('{service}', nomService(s.service))}
                    </button>
                    <button class="mini" class:on={fav} aria-pressed={fav} onclick={() => void toggleStreamingFavorite(ref)} data-favori>
                      {$t((fav ? 'v2.manquants.retirerFavori' : 'v2.manquants.ajouterFavori') as any)}
                    </button>
                  {/each}
                {:else}
                  <span class="badge {d.etat === 'a_verifier' ? 'av' : 'np'}">{$t(`collectionPhysique.etat.${d.etat}` as any)}</span>
                {/if}
                {#if d.proposer_extraction}
                  <span class="q extraire" data-proposer-extraction>{$t('collectionPhysique.nonCopie' as any)}</span>
                {/if}
                <a class="discogs" href={d.lien_discogs} target="_blank" rel="noopener noreferrer external">{$t('collectionPhysique.voirDiscogs' as any)}</a>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
    <p class="attribution" data-attribution>
      <a href={LIEN_DISCOGS} target="_blank" rel="noopener noreferrer external">{ATTRIBUTION_DISCOGS}</a>
    </p>
  </div>
</section>

<style>
  .v2-collection{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .meta{display:flex; gap:16px; margin-left:auto; font:11.5px var(--v2-mono); color:var(--v2-txt3)}
  .scroll{flex:1; overflow-y:auto; padding:4px 0 40px}
  .intro, .aide, .avancement, .err{margin:0; padding:4px 30px; font-size:12.5px; color:var(--v2-txt3); max-width:760px}
  .err{color:var(--v2-danger)}
  .avancement{color:var(--v2-txt2)}
  .compte{display:flex; flex-wrap:wrap; align-items:flex-end; gap:10px; padding:10px 30px 4px}
  .compte label{display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--v2-txt2)}
  .compte input{background:var(--v2-surface); color:var(--v2-txt); border:1px solid var(--v2-line2);
    border-radius:8px; padding:6px 10px; font:13px var(--v2-sans); min-width:220px}
  .state{padding:30px; color:var(--v2-txt3)}
  .filtres{display:flex; flex-wrap:wrap; gap:6px; padding:10px 30px 0}
  .puce{background:transparent; color:var(--v2-txt2); border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill);
    padding:3px 10px; font:12px var(--v2-sans); cursor:pointer}
  .puce.on{color:var(--v2-txt); border-color:var(--v2-acc1)}
  .puce .n{font:11px var(--v2-mono); color:var(--v2-txt3); margin-left:4px}
  .list{list-style:none; margin:0; padding:12px 30px 20px; display:flex; flex-direction:column; gap:1px}
  .vues{margin-left:auto}
  /* La grille et la carte de la Bibliothèque (LibraryV2 : `.grid`, `.card`,
     `.cover`, `.ct`, `.ca`), mêmes mesures. */
  .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(148px,1fr));
    gap:22px 18px; align-content:start; padding:16px 30px 20px}
  .card{min-width:0; content-visibility:auto; contain-intrinsic-size:auto 210px}
  .cover{position:relative; display:block; width:100%; aspect-ratio:1; padding:0; border:0; cursor:pointer;
    background:transparent; border-radius:var(--v2-r-card); overflow:hidden; box-shadow:var(--v2-sh-card)}
  .meta{display:block; width:100%; border:0; background:transparent; text-align:left; cursor:pointer; padding:0; color:inherit; font:inherit}
  .ct{margin-top:9px; font:600 12.5px var(--v2-sans); line-height:1.25; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{margin-top:2px; font:11px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .pastilles{position:absolute; left:6px; top:6px; right:6px; display:flex; flex-wrap:wrap; gap:4px; pointer-events:none}
  .pastille{font:700 8.5px var(--v2-mono); letter-spacing:.04em; padding:2px 5px; border-radius:4px;
    background:var(--v2-scrim); color:var(--v2-txt)}
  .pastille.bibliotheque{background:var(--v2-acc1); color:var(--v2-on-acc)}
  .pastille.streaming{background:var(--v2-acc2); color:var(--v2-on-acc)}
  .pastille.non_copie{color:var(--v2-acc-tint)}
  .lcv{width:40px; height:40px; border-radius:6px; overflow:hidden; flex-shrink:0}
  .ligne{display:grid; grid-template-columns:40px minmax(0,1fr) auto; align-items:center; gap:14px;
    padding:8px 10px; border-radius:9px; color:var(--v2-txt2)}
  .ligne:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .ti{min-width:0; display:flex; flex-direction:column; gap:2px}
  .tt{font-size:13.5px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .ti em, .fmt{font:11px var(--v2-sans); font-style:normal; color:var(--v2-txt3);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .ou{display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:center; gap:6px; max-width:520px}
  .badge{font:600 10.5px var(--v2-sans); border-radius:var(--v2-r-pill); padding:2px 8px; border:1px solid var(--v2-line2)}
  .badge.bib{color:var(--v2-acc1); border-color:var(--v2-acc1)}
  .badge.st{color:var(--v2-acc2); border-color:var(--v2-acc2)}
  .badge.np, .badge.av{color:var(--v2-txt3)}
  .q{font:11px var(--v2-mono); color:var(--v2-txt3)}
  .q.extraire{color:var(--v2-acc2)}
  .mini{padding:2px 8px; border-radius:10px; cursor:pointer; font-size:11px; background:transparent;
    color:var(--v2-txt); border:1px solid var(--v2-line2)}
  .mini.on{color:var(--v2-acc1); border-color:var(--v2-acc1)}
  .discogs{font-size:11px; color:var(--v2-txt3)}
  .discogs:hover{color:var(--v2-txt)}
  .attribution{margin:0; padding:16px 30px 0; font-size:11px; color:var(--v2-txt3)}
  .attribution a{color:inherit}
  @media (max-width: 640px){
    .ligne{grid-template-columns:40px minmax(0,1fr)}
    .ou{grid-column:1 / -1}
    .ou{justify-content:flex-start}
  }
</style>
