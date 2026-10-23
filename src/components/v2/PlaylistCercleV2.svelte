<script lang="ts">
  import { bulleTexte } from '../../lib/infobulleTexte';
  /**
   * Tune Circle T5 — UNE playlist collaborative de cercle
   * (renesenses/tune-server-rust#5328, décisions de Bertrand du 28/09/2026 ;
   * rangée et rendue jouable titre par titre par web#2219, go du 19/10/2026).
   *
   * - Tout membre retire et réordonne (glisser-déposer par la poignée, ou
   *   Monter / Descendre dans le menu ⋯ et les flèches sur la poignée).
   * - Le propriétaire du cercle, et lui seul, renomme et supprime.
   * - « ajouté par {nom} » quand le cloud rend un nom (entre contacts
   *   seulement, décision 1), « un membre du cercle » sinon — l'écran ne
   *   complète jamais un nom que le cloud a tu. Un seul contributeur : il est
   *   dit UNE fois, en tête, au lieu de chaque ligne.
   * - Chaque morceau dit où il se rejoue CHEZ MOI (résolution du greffon, non
   *   gardée) : dans ma bibliothèque, via un de mes services, ou INTROUVABLE.
   *   La pastille ne se montre que là où elle diffère de la majorité, que
   *   l'en-tête résume (« 8 titres jouables via Qobuz »).
   * - ▶ sur une ligne (ou double-clic) : la playlist À PARTIR de ce titre ;
   *   menu ⋯ : ce titre seulement, Lire ensuite, Ajouter à la file. Une ligne
   *   introuvable chez moi ne se lance pas, et le dit.
   * - Pochettes : celles de MA bibliothèque ou de MON service, par la
   *   résolution. Rien n'est demandé au serveur du membre qui a ajouté.
   * - Toute écriture porte la `version` ; un 409 remplace l'état par celui du
   *   cloud et refait le geste s'il a encore un sens, sinon le dit.
   * - 🔴 Un 404, à n'importe quel moment : la vue se FERME et le dit. Rien
   *   n'est gardé : ce composant détruit, la playlist part avec lui.
   * - Supprimer ARCHIVE la playlist (décision du 28/09) : les membres
   *   peuvent en récupérer une copie 30 jours durant ; la confirmation le dit.
   * - Pas de bouton « copier » ici (décision 5) : la copie ne s'offre que
   *   pour une playlist d'un cercle supprimé (bloc « Playlists à récupérer »).
   * - web#2287 — la fiche ouverte se relit comme la liste : toutes les
   *   `RELECTURE_CERCLE_MS` ms, onglet visible et aucun geste en cours, et au
   *   retour de l'onglet. Elle ne remplace l'écran que si la `version` a
   *   changé (voir `issueRelecture`).
   */
  import { onDestroy, tick } from 'svelte';
  import { t } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import { dialogs } from '../../lib/stores/dialogs';
  import { formatTime, formatDuration } from '../../lib/utils';
  import { nomService } from '../../lib/convertisseurPlaylists';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { notifications } from '../../lib/stores/notifications';
  import { rangLireEnsuite } from '../../lib/stores/queue';
  import { activeView } from '../../lib/stores/navigation';
  import { currentTrack, currentTrackId, playbackState, etatDeLaLigne } from '../../lib/stores/nowPlaying';
  import { tirageAleatoire } from '../../lib/porteeAleatoire';
  import { plafondFileAleatoire } from '../../lib/fileAleatoire';
  import { motifCercle, RELECTURE_CERCLE_MS } from '../../lib/circle';
  import {
    lirePlaylistCercle, resoudrePlaylistCercle, retirerMorceau, reordonnerMorceaux,
    renommerPlaylistCercle, supprimerPlaylistCercle, jouerPlaylistCercle,
    gesteVersionne, ordreDeplace, contient, issueRelecture, plusPartagee, codeT5, nomPlaylistValide, NOM_PLAYLIST_MAX,
    type IdOpaque, type PlaylistCercle, type MorceauCercle, type EtatResolution, type IssueGeste,
    type SelectionLecture,
  } from '../../lib/circlePlaylists';
  import {
    majorite, pastilleVisible, contributeurUnique, dureeTotaleMs, pochetteDuMorceau, mosaique,
    jouable, corpsDeFileMorceau, designationEnLecture, idsJouables, personnes, initiale,
  } from '../../lib/circlePlaylistVue';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import IndicateurLecture from './IndicateurLecture.svelte';

  interface Props {
    id: IdOpaque;
    /** `plusPartagee` : le cloud a répondu 404 ; `supprimee` : je viens de la supprimer. */
    onFermer: (raison: 'retour' | 'plusPartagee' | 'supprimee') => void;
    /**
     * Les membres que l'écran parent sait nommer : le propriétaire du cercle
     * et, pour MES cercles, leurs membres. Jamais deviné ici.
     */
    membres?: string[];
  }
  let { id, onFermer, membres = [] }: Props = $props();

  let playlist = $state<PlaylistCercle | null>(null);
  let resolution = $state<Map<string, EtatResolution>>(new Map());
  let erreur = $state<string | null>(null);
  let retour = $state<{ texte: string; erreur: boolean } | null>(null);
  let occupe = $state(false);
  let glisse = $state<IdOpaque | null>(null);
  /** Le menu ⋯ ouvert, par `item_id` ; un seul à la fois. */
  let menuOuvert = $state<string | null>(null);
  let fini = false;

  function phraseRefus(e: unknown): string {
    const cle = codeT5(e);
    if (cle) return $t(cle as any).replace('{max}', String(NOM_PLAYLIST_MAX));
    const m = motifCercle(e);
    const s = $t(m.cle as any);
    return m.minutes != null ? s.replace('{n}', String(m.minutes)) : s;
  }

  function fermerSi404(e: unknown): boolean {
    if (!plusPartagee(e)) return false;
    fini = true;
    onFermer('plusPartagee');
    return true;
  }

  async function relireSeule(): Promise<PlaylistCercle> {
    return lirePlaylistCercle(id);
  }

  async function resoudre() {
    try {
      const r = await resoudrePlaylistCercle(id);
      if (!fini) resolution = r;
    } catch (e) {
      // Une résolution qui échoue n'efface pas la playlist : les morceaux
      // restent, sans état. Un 404, lui, dit la fin du partage.
      fermerSi404(e);
    }
  }

  async function charger() {
    try {
      const p = await relireSeule();
      if (fini) return;
      playlist = p;
      erreur = null;
      void resoudre();
    } catch (e) {
      if (fermerSi404(e)) return;
      erreur = phraseRefus(e);
    }
  }

  /**
   * web#2287 — relecture planifiée. Rien pendant un geste (`occupe`) ou un
   * glisser, ni onglet caché ; et un geste commencé pendant la lecture
   * l'emporte : son résultat est plus frais que ce qui revient.
   */
  let minuteur: ReturnType<typeof setTimeout> | null = null;
  let relectureEnCours = false;

  async function relirePlanifie() {
    if (fini || !playlist || occupe || glisse != null || relectureEnCours) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    relectureEnCours = true;
    try {
      const p = await relireSeule();
      if (fini || occupe || !playlist) return;
      const issue = issueRelecture(playlist, p);
      if (!issue.remplacer) return;
      playlist = p;
      if (issue.resoudre) void resoudre();
    } catch (e) {
      // Une relecture qui échoue se tait : l'écran garde ce qu'il montrait,
      // la suivante réessaiera. Seul un 404 dit la fin du partage.
      fermerSi404(e);
    } finally {
      relectureEnCours = false;
    }
  }

  function planifier() {
    if (fini) return;
    if (minuteur) clearTimeout(minuteur);
    minuteur = setTimeout(async () => {
      await relirePlanifie();
      planifier();
    }, RELECTURE_CERCLE_MS);
  }

  function auRetourDeLOnglet() {
    if (!document.hidden) void relirePlanifie();
  }

  /**
   * Un geste sous version. La résolution est refaite si les morceaux ont
   * changé : un ajout d'un autre membre peut arriver avec le 409.
   */
  async function versionne(
    envoyer: (p: PlaylistCercle) => Promise<unknown>,
    rejouer: (p: PlaylistCercle) => ((p: PlaylistCercle) => Promise<unknown>) | null,
  ) {
    if (!playlist || occupe) return;
    occupe = true;
    retour = null;
    try {
      const avant = playlist.items.map((x) => String(x.item_id)).sort().join(',');
      const r: IssueGeste = await gesteVersionne(playlist, envoyer, rejouer, relireSeule);
      if (fini) return;
      playlist = r.playlist;
      if (r.conflit === 'refait') retour = { texte: $t('v2.circle.pl.redone' as any), erreur: false };
      else if (r.conflit === 'change') retour = { texte: $t('v2.circle.pl.changed' as any), erreur: true };
      const apres = r.playlist.items.map((x) => String(x.item_id)).sort().join(',');
      if (apres !== avant) void resoudre();
    } catch (e) {
      if (fermerSi404(e)) return;
      retour = { texte: phraseRefus(e), erreur: true };
    } finally {
      occupe = false;
    }
  }

  function retirer(m: MorceauCercle) {
    menuOuvert = null;
    void versionne(
      (p) => retirerMorceau(id, m.item_id, p.version),
      (p) => (contient(p, m.item_id) ? (q) => retirerMorceau(id, m.item_id, q.version) : null),
    );
  }

  /** Déplace `m` au rang `vers`, sur l'état connu puis, s'il le faut, sur l'état reçu. */
  function deplacer(m: MorceauCercle, vers: number) {
    menuOuvert = null;
    if (!playlist || !ordreDeplace(playlist.items, m.item_id, vers)) return;
    const cible = playlist.items[Math.max(0, Math.min(playlist.items.length - 1, vers))]?.item_id;
    void versionne(
      (p) => reordonnerMorceaux(id, ordreDeplace(p.items, m.item_id, vers)!, p.version),
      (p) => {
        // Sur l'état reçu : même geste — « m à la place de la cible » — si
        // les deux y sont encore ; sinon il n'a plus de sens.
        const rang = cible == null ? -1 : p.items.findIndex((x) => String(x.item_id) === String(cible));
        const ordre = rang < 0 ? null : ordreDeplace(p.items, m.item_id, rang);
        return ordre ? (q) => reordonnerMorceaux(id, ordre, q.version) : null;
      },
    );
  }

  async function renommer() {
    if (!playlist) return;
    const saisi = await dialogs.prompt($t('v2.circle.pl.renamePrompt' as any).replace('{max}', String(NOM_PLAYLIST_MAX)), playlist.name);
    if (saisi === null) return;
    const nom = nomPlaylistValide(saisi);
    if (nom === null) { retour = { texte: $t('v2.circle.pl.err.nameInvalid' as any).replace('{max}', String(NOM_PLAYLIST_MAX)), erreur: true }; return; }
    if (nom === playlist.name) return;
    // Un renommage refait sur l'état reçu garde son sens : c'est le nom choisi.
    void versionne((p) => renommerPlaylistCercle(id, nom, p.version), () => (q) => renommerPlaylistCercle(id, nom, q.version));
  }

  async function supprimer() {
    if (!playlist || occupe) return;
    const ok = await dialogs.confirm($t('v2.circle.pl.confirmDelete' as any).replace('{name}', playlist.name), { danger: true });
    if (!ok) return;
    occupe = true;
    try {
      await supprimerPlaylistCercle(id);
      fini = true;
      onFermer('supprimee');
    } catch (e) {
      if (fermerSi404(e)) return;
      retour = { texte: phraseRefus(e), erreur: true };
    } finally {
      occupe = false;
    }
  }

  /**
   * Lire : toute la playlist, à partir d'un titre, ce titre seul, ou un
   * mélange — toujours par `POST /play`, qui relit la playlist au cloud et
   * remplace la file de la zone.
   */
  async function lire(selection?: SelectionLecture) {
    menuOuvert = null;
    const zid = zoneRequise();
    if (zid == null || occupe) return;
    occupe = true;
    retour = null;
    try {
      const b = await jouerPlaylistCercle(id, zid, selection);
      if (b.lances === 0) notifications.info($t('v2.circle.pl.nothingPlayable' as any));
      else if (b.manquants > 0) {
        notifications.info($t('v2.circle.pl.playedMissing' as any).replace('{m}', String(b.manquants)));
      } else notifications.success($t('v2.circle.pl.played' as any));
    } catch (e) {
      if (!fermerSi404(e)) retour = { texte: phraseRefus(e), erreur: true };
    } finally {
      occupe = false;
    }
  }

  function lireDepuis(m: MorceauCercle) {
    if (!jouable(resOf(m))) return;
    void lire({ depuis: m.item_id });
  }

  function lireSeul(m: MorceauCercle) {
    if (!jouable(resOf(m))) return;
    void lire({ seulement: [m.item_id] });
  }

  /**
   * Aléatoire : les morceaux jouables chez moi, tirés ICI au sort sous le
   * plafond de file aléatoire du serveur (#5284), joués dans cet ordre.
   */
  async function lireAleatoire() {
    if (!playlist) return;
    const ids = idsJouables(playlist.items, resolution);
    if (!ids.length) { void lire(); return; }
    void lire({ seulement: tirageAleatoire(ids, await plafondFileAleatoire()) });
  }

  /**
   * « Lire ensuite » et « Ajouter à la file » : les routes de file
   * existantes, avec la piste que la résolution a trouvée CHEZ MOI.
   */
  let fileOccupee = $state(false);
  async function enfiler(m: MorceauCercle, ensuite: boolean) {
    menuOuvert = null;
    const zid = zoneRequise();
    if (zid == null || fileOccupee) return;
    const corps = corpsDeFileMorceau(m, resOf(m), ensuite ? rangLireEnsuite() : undefined);
    if (!corps) { notifications.error($t('v2.circle.pl.err.itemNotPlayable' as any)); return; }
    fileOccupee = true;
    try {
      await api.addToQueue(zid, corps);
      notifications.success($t((ensuite ? 'v2.pa.queuedNext' : 'v2.pa.queued') as any).replace('{title}', m.title));
    } catch {
      notifications.error($t('v2.pa.queueError' as any));
    } finally {
      fileOccupee = false;
    }
  }

  /** « Ajouter des morceaux » : la Recherche, d'où le menu ⋯ d'un titre ajoute au cercle. */
  function ajouterDesMorceaux() {
    notifications.info($t('v2.circle.pl.addTracksHint' as any));
    activeView.set('search');
  }

  // ── Menu ⋯ d'une ligne ──

  /** L'enveloppe du menu d'un morceau (sans `CSS.escape` : l'identifiant est opaque). */
  function enveloppeDuMenu(k: string): HTMLElement | null {
    return [...document.querySelectorAll<HTMLElement>('.playlist-cercle .menu-wrap')].find((n) => n.dataset.menuMorceau === k) ?? null;
  }

  async function basculerMenu(m: MorceauCercle) {
    const k = String(m.item_id);
    menuOuvert = menuOuvert === k ? null : k;
    if (menuOuvert) {
      await tick();
      (enveloppeDuMenu(k)?.querySelector('[role="menuitem"]:not(:disabled)') as HTMLElement | null)?.focus();
    }
  }

  function clavierMenu(ev: KeyboardEvent, m: MorceauCercle) {
    const k = String(m.item_id);
    const boite = (ev.currentTarget as HTMLElement);
    const entrees = [...boite.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')];
    const i = entrees.indexOf(document.activeElement as HTMLElement);
    if (ev.key === 'Escape') {
      ev.preventDefault();
      menuOuvert = null;
      (enveloppeDuMenu(k)?.querySelector('button.menu-morceau') as HTMLElement | null)?.focus();
    } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const n = entrees.length;
      if (n) entrees[(i + (ev.key === 'ArrowDown' ? 1 : -1) + n) % n].focus();
    }
  }

  function clicDehors(ev: MouseEvent) {
    if (!menuOuvert) return;
    const cible = ev.target as HTMLElement | null;
    if (cible?.closest?.('.menu-wrap')) return;
    menuOuvert = null;
  }

  // ── Glisser-déposer : un raccourci de Monter / Descendre, pas un autre geste ──

  function surDepart(ev: DragEvent, m: MorceauCercle) {
    glisse = m.item_id;
    try { ev.dataTransfer?.setData('text/plain', String(m.item_id)); } catch { /* jsdom */ }
  }
  function surDepot(ev: DragEvent, rang: number) {
    ev.preventDefault();
    const m = playlist?.items.find((x) => String(x.item_id) === String(glisse));
    glisse = null;
    if (m) deplacer(m, rang);
  }
  /** La poignée au clavier : flèches haut et bas. */
  function poigneeClavier(ev: KeyboardEvent, m: MorceauCercle, i: number) {
    if (!playlist || occupe) return;
    if (ev.key === 'ArrowUp' && i > 0) { ev.preventDefault(); deplacer(m, i - 1); }
    else if (ev.key === 'ArrowDown' && i < playlist.items.length - 1) { ev.preventDefault(); deplacer(m, i + 1); }
  }

  function auteur(m: MorceauCercle): string {
    if (m.mine) return $t('v2.circle.pl.addedByMe' as any);
    return m.added_by ? $t('v2.circle.pl.addedBy' as any).replace('{name}', m.added_by.nom) : $t('v2.circle.pl.addedByMember' as any);
  }
  function auteurDeTete(m: MorceauCercle): string {
    if (m.mine) return $t('v2.circle.pl.allAddedByMe' as any);
    return m.added_by ? $t('v2.circle.pl.allAddedBy' as any).replace('{name}', m.added_by.nom) : $t('v2.circle.pl.allAddedByMember' as any);
  }

  function libelleResolution(r: EtatResolution): string {
    if (r.etat === 'bibliotheque') return $t('v2.circle.pl.res.library' as any);
    if (r.etat === 'service') return $t('v2.circle.pl.res.service' as any).replace('{service}', nomService(r.service));
    return $t('v2.circle.pl.res.notFound' as any);
  }
  function phraseMajorite(e: EtatResolution, n: number): string {
    if (e.etat === 'service') {
      return $t('v2.circle.pl.majorityService' as any).replace('{n}', String(n)).replace('{service}', nomService(e.service));
    }
    return $t('v2.circle.pl.majorityLibrary' as any).replace('{n}', String(n));
  }
  const resOf = (m: MorceauCercle) => resolution.get(String(m.item_id)) ?? null;
  const items = $derived(playlist?.items ?? []);
  const introuvables = $derived(items.filter((m) => resOf(m)?.etat === 'introuvable').length);
  const maj = $derived(majorite(items, resolution));
  const unique = $derived(contributeurUnique(items));
  const totalMs = $derived(dureeTotaleMs(items));
  const pochettes = $derived(mosaique(items, resolution));
  /** Quatre pochettes en mosaïque ; moins de quatre : la première, seule. */
  const mosaiqueVue = $derived(pochettes.length >= 4 ? pochettes.slice(0, 4) : pochettes.slice(0, 1));
  const gens = $derived(personnes(membres, items));
  const sousTitre = (m: MorceauCercle) => [m.artist_name, m.album_title].filter(Boolean).join(' · ');

  // Le repère « en cours » : lu une fois par rendu, pas par ligne.
  const npId = $derived($currentTrackId);
  const npPiste = $derived($currentTrack);
  const npEtat = $derived($playbackState);
  const etatLigne = (m: MorceauCercle) => {
    const d = designationEnLecture(resOf(m));
    return d ? etatDeLaLigne(d as any, npId, npPiste, npEtat) : null;
  };

  $effect(() => { void charger(); });
  $effect(() => {
    planifier();
    document.addEventListener('visibilitychange', auRetourDeLOnglet);
    return () => {
      if (minuteur) clearTimeout(minuteur);
      minuteur = null;
      document.removeEventListener('visibilitychange', auRetourDeLOnglet);
    };
  });
  onDestroy(() => { fini = true; if (minuteur) clearTimeout(minuteur); });
</script>

<svelte:window onclick={clicDehors} />

<div class="playlist-cercle">
  <div class="tete">
    <button class="lnk retour-cercle" onclick={() => { fini = true; onFermer('retour'); }}>← {$t('v2.circle.pl.back' as any)}</button>
  </div>

  {#if erreur}
    <div class="err" role="alert"><span>{erreur}</span>
      <button class="lnk reessayer" onclick={() => void charger()}>{$t('v2.circle.retry' as any)}</button></div>
  {:else if !playlist}
    <div class="state">{$t('v2.tool.loading' as any)}</div>
  {:else}
    <header class="en-tete-pl">
      <div class="entete-texte">
        <h2 class="nom-playlist">{playlist.name}</h2>
        <p class="faits">
          <span class="compte">{$t('v2.circle.pl.count' as any).replace('{n}', String(items.length))}</span>
          {#if totalMs > 0}<span aria-hidden="true">·</span><span class="duree-totale">{formatDuration(totalMs)}</span>{/if}
        </p>
        {#if maj}<p class="note resume-majorite">{phraseMajorite(maj.etat, maj.n)}</p>{/if}
        {#if unique}<p class="note auteur-unique">{auteurDeTete(unique)}</p>{/if}
        <p class="note">{$t('v2.circle.pl.refsOnly' as any)}</p>
        <div class="actions">
          <button class="play lire-playlist" disabled={occupe || items.length === 0} onclick={() => void lire()}>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8V4z"/></svg>{$t('v2.circle.pl.play' as any)}
          </button>
          <button class="ghost aleatoire-playlist" disabled={occupe || items.length === 0} onclick={() => void lireAleatoire()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>{$t('library.shuffle')}
          </button>
          <button class="ghost ajouter-morceaux" onclick={ajouterDesMorceaux}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>{$t('v2.circle.pl.addTracks' as any)}
          </button>
          {#if playlist.mine}
            <button class="ghost sm renommer-playlist" disabled={occupe} onclick={() => void renommer()}>{$t('v2.circle.rename' as any)}</button>
            <button class="ghost sm danger supprimer-playlist" disabled={occupe} onclick={() => void supprimer()}>{$t('v2.circle.pl.delete' as any)}</button>
          {/if}
        </div>
      </div>
      <div class="entete-cote">
        <div class="mosaique" class:une={mosaiqueVue.length === 1} aria-hidden="true">
          {#if mosaiqueVue.length === 0}
            <svg class="mosaique-vide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h11M4 12h11M4 17h7M17 17V7l4 2"/></svg>
          {:else}
            {#each mosaiqueVue as p, k (k)}
              <span class="tuile"><AlbumArt coverPath={p.coverPath} albumId={p.albumId} size={0} alt="" /></span>
            {/each}
          {/if}
        </div>
        {#if gens.length}
          <ul class="membres" aria-label={$t('v2.circle.pl.members' as any)}>
            {#each gens.slice(0, 8) as nom (nom)}
              <li class="avatar" title={nom}><span aria-hidden="true">{initiale(nom)}</span><span class="sr">{nom}</span></li>
            {/each}
            {#if gens.length > 8}<li class="avatar plus" title={gens.slice(8).join(', ')}>+{gens.length - 8}</li>{/if}
          </ul>
        {/if}
      </div>
    </header>

    {#if retour}
      <div class={retour.erreur ? 'err retour-playlist' : 'ok retour-playlist'} role={retour.erreur ? 'alert' : 'status'}>
        <span>{retour.texte}</span>
      </div>
    {/if}

    {#if introuvables > 0}
      <p class="note alerte resume-introuvables" role="status">
        {$t('v2.circle.pl.notFoundSummary' as any).replace('{n}', String(introuvables))}
      </p>
    {/if}

    {#if items.length === 0}
      <p class="note vide">{$t('v2.circle.pl.empty' as any)}</p>
    {:else}
      <ol class="morceaux">
        {#each items as m, i (m.item_id)}
          {@const r = resOf(m)}
          {@const peutJouer = jouable(r)}
          {@const enCours = etatLigne(m)}
          {@const poch = pochetteDuMorceau(r)}
          {@const k = String(m.item_id)}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <li class="morceau" class:introuvable={r?.etat === 'introuvable'} class:en-cours={enCours != null}
            class:glisse={glisse != null && String(glisse) === k}
            aria-current={enCours ? 'true' : undefined}
            draggable={!occupe}
            ondragstart={(ev) => surDepart(ev, m)}
            ondragover={(ev) => ev.preventDefault()}
            ondrop={(ev) => surDepot(ev, i)}
            ondblclick={() => lireDepuis(m)}
            data-item={k}>
            <button class="poignee" type="button" disabled={occupe}
              title={$t('v2.liste.poignee' as any)} aria-label={$t('v2.liste.poignee' as any)}
              onkeydown={(ev) => poigneeClavier(ev, m, i)}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/>
                <circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/>
                <circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>
              </svg>
            </button>
            <span class="rang-cell">
              <span class="rang" aria-hidden="true">{i + 1}</span>
              <button class="lire-morceau" type="button" disabled={!peutJouer || occupe}
                title={r?.etat === 'introuvable' ? $t('v2.circle.pl.res.notFound' as any) : $t('v2.circle.pl.playFromNamed' as any).replace('{title}', m.title)}
                aria-label={$t('v2.circle.pl.playFromNamed' as any).replace('{title}', m.title)}
                onclick={() => lireDepuis(m)}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8V4z"/></svg>
              </button>
            </span>
            <span class="vignette">
              <AlbumArt coverPath={poch?.coverPath ?? null} albumId={poch?.albumId ?? null} size={36} alt="" />
            </span>
            <span class="infos">
              <span class="titre-ligne"><IndicateurLecture etat={enCours} /><span class="titre-morceau" use:bulleTexte>{m.title}</span></span>
              {#if sousTitre(m)}<span class="note sous-titre" use:bulleTexte>{sousTitre(m)}</span>{/if}
              {#if !unique}<span class="note auteur">{auteur(m)}</span>{/if}
            </span>
            <span class="note duree">{m.duration_ms ? formatTime(m.duration_ms) : ''}</span>
            <span class={`resolution ${r && pastilleVisible(r, maj) ? `res-${r.etat}` : ''}`}>{r && pastilleVisible(r, maj) ? libelleResolution(r) : ''}</span>
            <span class="menu-wrap" data-menu-morceau={k}>
              <button class="menu-morceau" type="button" data-item={k}
                aria-haspopup="menu" aria-expanded={menuOuvert === k}
                aria-label={$t('v2.circle.pl.moreNamed' as any).replace('{title}', m.title)}
                title={$t('v2.circle.pl.moreNamed' as any).replace('{title}', m.title)}
                onclick={(ev) => { ev.stopPropagation(); void basculerMenu(m); }}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
              </button>
              {#if menuOuvert === k}
                <!-- svelte-ignore a11y_interactive_supports_focus -->
                <div class="menu" role="menu" tabindex="-1" onkeydown={(ev) => clavierMenu(ev, m)}>
                  <button role="menuitem" class="lire-seul" disabled={!peutJouer || occupe} onclick={() => lireSeul(m)}>{$t('v2.circle.pl.playOnly' as any)}</button>
                  <button role="menuitem" class="lire-ensuite" disabled={!peutJouer || fileOccupee} onclick={() => void enfiler(m, true)}>{$t('v2.album.playNext' as any)}</button>
                  <button role="menuitem" class="ajouter-file" disabled={!peutJouer || fileOccupee} onclick={() => void enfiler(m, false)}>{$t('v2.ms.addToQueue' as any)}</button>
                  {#if !peutJouer && r?.etat === 'introuvable'}<span class="raison" role="note">{$t('v2.circle.pl.res.notFound' as any)}</span>{/if}
                  <span class="sep" role="separator"></span>
                  <button role="menuitem" class="monter" disabled={occupe || i === 0}
                    aria-label={$t('v2.circle.pl.upNamed' as any).replace('{title}', m.title)}
                    onclick={() => deplacer(m, i - 1)}>{$t('playlist.moveUp' as any)}</button>
                  <button role="menuitem" class="descendre" disabled={occupe || i === items.length - 1}
                    aria-label={$t('v2.circle.pl.downNamed' as any).replace('{title}', m.title)}
                    onclick={() => deplacer(m, i + 1)}>{$t('playlist.moveDown' as any)}</button>
                  <button role="menuitem" class="danger retirer-morceau" disabled={occupe}
                    aria-label={$t('v2.circle.pl.removeNamed' as any).replace('{title}', m.title)}
                    onclick={() => retirer(m)}>{$t('v2.circle.pl.remove' as any)}</button>
                </div>
              {/if}
            </span>
          </li>
        {/each}
      </ol>
      <p class="note">{$t('v2.circle.pl.dragHint' as any)}</p>
    {/if}
  {/if}
</div>

<style>
  .playlist-cercle{display:flex; flex-direction:column; gap:10px}
  .tete{display:flex; align-items:center}
  .state{color:var(--v2-txt3); font-size:13px}
  .note{font-size:11.5px; color:var(--v2-txt3); margin:0}
  .alerte{color:var(--v2-danger)}
  .vide{margin:0}
  .err,.ok{display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:10px 14px; border-radius:10px; font-size:12.5px}
  .err{border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
  .ok{border:1px solid var(--v2-line); background:var(--v2-acc-soft); color:var(--v2-txt)}
  .sr{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap}

  /* En-tête : le texte et les gestes à gauche, la mosaïque et les membres à
     droite sur grand écran ; empilés sur mobile. */
  .en-tete-pl{display:flex; gap:24px; align-items:flex-start; justify-content:space-between; padding:4px 0 8px}
  .entete-texte{display:flex; flex-direction:column; gap:8px; min-width:0; flex:1}
  .nom-playlist{font-size:22px; font-weight:800; margin:0; overflow-wrap:anywhere; letter-spacing:-.01em}
  .faits{display:flex; gap:8px; margin:0; font:12px var(--v2-mono); color:var(--v2-txt3)}
  .actions{display:flex; gap:10px; flex-wrap:wrap; margin-top:6px}
  .play,.ghost{display:inline-flex; align-items:center; gap:8px; height:38px; padding:0 18px; border-radius:var(--v2-r-pill);
    font:700 13px var(--v2-sans); cursor:pointer; border:0}
  .play{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); box-shadow:0 6px 18px var(--v2-glow-strong)}
  .ghost{color:var(--v2-txt); background:transparent; border:1px solid var(--v2-line2)}
  .ghost:hover:not(:disabled){border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .ghost.sm{padding:0 14px; font-weight:600}
  .ghost.danger{color:var(--v2-danger)}
  .ghost.danger:hover:not(:disabled){border-color:var(--v2-danger-bd); color:var(--v2-danger)}
  .play svg,.ghost svg{width:15px; height:15px}
  .play:disabled,.ghost:disabled{opacity:.35; cursor:not-allowed}
  .entete-cote{display:flex; flex-direction:column; align-items:flex-end; gap:12px; flex:0 0 auto}
  .mosaique{width:150px; height:150px; border-radius:8px; overflow:hidden; display:grid; grid-template-columns:1fr 1fr;
    grid-template-rows:1fr 1fr; box-shadow:var(--v2-sh-lg); color:var(--v2-on-acc);
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .mosaique.une{grid-template-columns:1fr; grid-template-rows:1fr}
  .mosaique .tuile{display:block; min-width:0; min-height:0; overflow:hidden}
  .mosaique-vide{width:64px; height:64px; grid-column:1 / -1; grid-row:1 / -1; place-self:center}
  .membres{list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; justify-content:flex-end; max-width:220px}
  .avatar{width:30px; height:30px; border-radius:50%; display:grid; place-items:center; margin-left:-6px;
    font:700 12px var(--v2-sans); color:var(--v2-txt); background:var(--v2-surface2); border:2px solid var(--v2-bg)}
  .avatar.plus{font-size:10.5px; color:var(--v2-txt2)}

  /* Les lignes. */
  .morceaux{list-style:none; margin:0; padding:0; display:flex; flex-direction:column}
  .morceau{position:relative; display:grid; grid-template-columns:24px 28px 36px minmax(0,1fr) auto auto auto; align-items:center;
    gap:10px; padding:6px 6px; border-bottom:1px solid var(--v2-line); border-radius:8px; font-size:13px; color:var(--v2-txt2)}
  .morceau:hover,.morceau:focus-within{background:var(--v2-hover); color:var(--v2-txt)}
  .morceau.glisse{opacity:.5}
  .morceau.en-cours,.morceau.en-cours .titre-morceau{color:var(--v2-acc1)}
  .morceau.introuvable .titre-morceau,.morceau.introuvable .sous-titre{color:var(--v2-txt3)}
  .morceau.introuvable .vignette{opacity:.45}
  .poignee{width:24px; height:28px; padding:4px; border:0; border-radius:6px; background:transparent; color:var(--v2-txt3);
    cursor:grab; display:flex; align-items:center; justify-content:center; opacity:.45}
  .poignee svg{width:14px; height:14px}
  .morceau:hover .poignee,.poignee:focus-visible{opacity:1}
  .poignee:focus-visible{outline:2px solid var(--v2-focus); outline-offset:1px}
  /* Le numéro, et ▶ à sa place au survol ou au focus — comme les vues d'album. */
  .rang-cell{position:relative; width:28px; height:28px; display:grid; place-items:center}
  .rang{color:var(--v2-txt3); font:12px var(--v2-mono); font-variant-numeric:tabular-nums}
  .lire-morceau{position:absolute; inset:0; border:0; border-radius:50%; background:transparent; color:var(--v2-txt);
    cursor:pointer; display:grid; place-items:center; opacity:0}
  .lire-morceau svg{width:14px; height:14px}
  .morceau:hover .lire-morceau:not(:disabled),.lire-morceau:focus-visible{opacity:1; background:var(--v2-surface2)}
  .morceau:hover .rang-cell:has(.lire-morceau:not(:disabled)) .rang,.rang-cell:has(.lire-morceau:focus-visible) .rang{visibility:hidden}
  .lire-morceau:disabled{cursor:not-allowed}
  .lire-morceau:focus-visible{outline:2px solid var(--v2-focus); outline-offset:1px}
  .vignette{width:36px; height:36px; border-radius:5px; overflow:hidden}
  .infos{display:flex; flex-direction:column; min-width:0}
  .titre-ligne{display:flex; align-items:center; gap:6px; min-width:0; color:var(--v2-txt); font-weight:500}
  .titre-morceau,.sous-titre{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .duree{font-variant-numeric:tabular-nums}
  .resolution{font-size:11px; padding:2px 8px; border-radius:var(--v2-r-pill); white-space:nowrap}
  .resolution:empty{padding:0}
  .res-bibliotheque,.res-service{background:var(--v2-acc-soft); color:var(--v2-txt)}
  .res-introuvable{border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
  .menu-wrap{position:relative}
  .menu-morceau{width:30px; height:30px; border:0; border-radius:8px; background:transparent; color:var(--v2-txt3);
    cursor:pointer; display:grid; place-items:center}
  .menu-morceau svg{width:16px; height:16px}
  .menu-morceau:hover,.menu-morceau[aria-expanded="true"]{color:var(--v2-txt); background:var(--v2-surface2)}
  .menu-morceau:focus-visible{outline:2px solid var(--v2-focus); outline-offset:1px}
  .menu{position:absolute; right:0; top:calc(100% + 4px); z-index:20; min-width:220px; display:flex; flex-direction:column;
    padding:6px; border-radius:10px; border:1px solid var(--v2-line2); background:var(--v2-surface2); box-shadow:var(--v2-sh-lg)}
  .menu button{text-align:left; border:0; background:transparent; color:var(--v2-txt); font:13px var(--v2-sans);
    padding:8px 10px; border-radius:7px; cursor:pointer}
  .menu button:hover:not(:disabled),.menu button:focus-visible{background:var(--v2-hover); outline:none}
  .menu button:disabled{opacity:.4; cursor:not-allowed}
  .menu .danger{color:var(--v2-danger)}
  .menu .raison{font-size:11.5px; color:var(--v2-txt3); padding:2px 10px 6px}
  .menu .sep{height:1px; background:var(--v2-line2); margin:4px 2px}
  .lnk{border:0; background:transparent; color:var(--v2-acc-tint); cursor:pointer; font-size:13px; padding:4px 2px}
  .lnk:disabled{opacity:.35; cursor:not-allowed}
  .play:focus-visible,.ghost:focus-visible,.lnk:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}

  @media (max-width: 760px){
    .en-tete-pl{flex-direction:column-reverse; align-items:stretch}
    .entete-cote{flex-direction:row; align-items:center; justify-content:space-between}
    .mosaique{width:96px; height:96px}
  }
  @media (max-width: 640px){
    .morceau{grid-template-columns:28px 36px minmax(0,1fr) auto}
    .poignee{display:none}
    .duree{display:none}
    .resolution{grid-column:3}
    .menu-wrap{grid-column:4; grid-row:1}
  }
</style>
