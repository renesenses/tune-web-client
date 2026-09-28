<script lang="ts">
  /**
   * Tune Circle T5 — UNE playlist collaborative de cercle
   * (renesenses/tune-server-rust#5328, décisions de Bertrand du 28/09/2026).
   *
   * - Tout membre retire et réordonne (glisser-déposer, ou Monter / Descendre
   *   au clavier) ; l'ajout se fait depuis le menu « … » d'un titre.
   * - Le propriétaire du cercle, et lui seul, renomme et supprime.
   * - « ajouté par {nom} » quand le cloud rend un nom (entre contacts
   *   seulement, décision 1), « un membre du cercle » sinon — l'écran ne
   *   complète jamais un nom que le cloud a tu.
   * - Chaque morceau dit où il se rejoue CHEZ MOI (résolution du greffon, non
   *   gardée) : dans ma bibliothèque, via un de mes services, ou INTROUVABLE.
   * - Toute écriture porte la `version` ; un 409 remplace l'état par celui du
   *   cloud et refait le geste s'il a encore un sens, sinon le dit.
   * - 🔴 Un 404, à n'importe quel moment : la vue se FERME et le dit. Rien
   *   n'est gardé : ce composant détruit, la playlist part avec lui.
   * - Pas de bouton « copier » ici (décision 5) : la copie ne s'offre que
   *   pour une playlist d'un cercle supprimé (bloc « Playlists à récupérer »).
   */
  import { onDestroy } from 'svelte';
  import { t } from '../../lib/i18n';
  import { dialogs } from '../../lib/stores/dialogs';
  import { formatTime } from '../../lib/utils';
  import { nomService } from '../../lib/convertisseurPlaylists';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { notifications } from '../../lib/stores/notifications';
  import { motifCercle } from '../../lib/circle';
  import {
    lirePlaylistCercle, resoudrePlaylistCercle, retirerMorceau, reordonnerMorceaux,
    renommerPlaylistCercle, supprimerPlaylistCercle, jouerPlaylistCercle,
    gesteVersionne, ordreDeplace, contient, plusPartagee, codeT5, nomPlaylistValide, NOM_PLAYLIST_MAX,
    type IdOpaque, type PlaylistCercle, type MorceauCercle, type EtatResolution, type IssueGeste,
  } from '../../lib/circlePlaylists';

  interface Props {
    id: IdOpaque;
    /** `plusPartagee` : le cloud a répondu 404 ; `supprimee` : je viens de la supprimer. */
    onFermer: (raison: 'retour' | 'plusPartagee' | 'supprimee') => void;
  }
  let { id, onFermer }: Props = $props();

  let playlist = $state<PlaylistCercle | null>(null);
  let resolution = $state<Map<string, EtatResolution>>(new Map());
  let erreur = $state<string | null>(null);
  let retour = $state<{ texte: string; erreur: boolean } | null>(null);
  let occupe = $state(false);
  let glisse = $state<IdOpaque | null>(null);
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
    void versionne(
      (p) => retirerMorceau(id, m.item_id, p.version),
      (p) => (contient(p, m.item_id) ? (q) => retirerMorceau(id, m.item_id, q.version) : null),
    );
  }

  /** Déplace `m` au rang `vers`, sur l'état connu puis, s'il le faut, sur l'état reçu. */
  function deplacer(m: MorceauCercle, vers: number) {
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

  async function lire() {
    const zid = zoneRequise();
    if (zid == null || occupe) return;
    occupe = true;
    try {
      const b = await jouerPlaylistCercle(id, zid);
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

  function auteur(m: MorceauCercle): string {
    if (m.mine) return $t('v2.circle.pl.addedByMe' as any);
    return m.added_by ? $t('v2.circle.pl.addedBy' as any).replace('{name}', m.added_by.nom) : $t('v2.circle.pl.addedByMember' as any);
  }

  function libelleResolution(r: EtatResolution): string {
    if (r.etat === 'bibliotheque') return $t('v2.circle.pl.res.library' as any);
    if (r.etat === 'service') return $t('v2.circle.pl.res.service' as any).replace('{service}', nomService(r.service));
    return $t('v2.circle.pl.res.notFound' as any);
  }
  const resOf = (m: MorceauCercle) => resolution.get(String(m.item_id)) ?? null;
  const introuvables = $derived(playlist ? playlist.items.filter((m) => resOf(m)?.etat === 'introuvable').length : 0);
  const sousTitre = (m: MorceauCercle) => [m.artist_name, m.album_title].filter(Boolean).join(' · ');

  $effect(() => { void charger(); });
  onDestroy(() => { fini = true; });
</script>

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
    <header class="titre">
      <h2 class="nom-playlist">{playlist.name}</h2>
      <span class="note compte">{$t('v2.circle.pl.count' as any).replace('{n}', String(playlist.items.length))}</span>
      <span class="gestes">
        <button class="go lire-playlist" disabled={occupe || playlist.items.length === 0} onclick={() => void lire()}>{$t('v2.circle.pl.play' as any)}</button>
        {#if playlist.mine}
          <button class="lnk renommer-playlist" disabled={occupe} onclick={() => void renommer()}>{$t('v2.circle.rename' as any)}</button>
          <button class="lnk danger supprimer-playlist" disabled={occupe} onclick={() => void supprimer()}>{$t('v2.circle.pl.delete' as any)}</button>
        {/if}
      </span>
    </header>
    <p class="note">{$t('v2.circle.pl.refsOnly' as any)}</p>

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

    {#if playlist.items.length === 0}
      <p class="note vide">{$t('v2.circle.pl.empty' as any)}</p>
    {:else}
      <ol class="morceaux">
        {#each playlist.items as m, i (m.item_id)}
          {@const r = resOf(m)}
          <li class="morceau" class:introuvable={r?.etat === 'introuvable'} class:glisse={glisse != null && String(glisse) === String(m.item_id)}
            draggable={!occupe}
            ondragstart={(ev) => surDepart(ev, m)}
            ondragover={(ev) => ev.preventDefault()}
            ondrop={(ev) => surDepot(ev, i)}
            data-item={String(m.item_id)}>
            <span class="rang">{i + 1}</span>
            <span class="infos">
              <span class="titre-morceau">{m.title}</span>
              {#if sousTitre(m)}<span class="note sous-titre">{sousTitre(m)}</span>{/if}
              <span class="note auteur">{auteur(m)}</span>
            </span>
            <span class="note duree">{m.duration_ms ? formatTime(m.duration_ms) : ''}</span>
            <span class={`resolution ${r ? `res-${r.etat}` : ''}`}>{r ? libelleResolution(r) : ''}</span>
            <span class="gestes">
              <button class="lnk monter" disabled={occupe || i === 0}
                aria-label={$t('v2.circle.pl.upNamed' as any).replace('{title}', m.title)}
                onclick={() => deplacer(m, i - 1)}>↑</button>
              <button class="lnk descendre" disabled={occupe || i === playlist.items.length - 1}
                aria-label={$t('v2.circle.pl.downNamed' as any).replace('{title}', m.title)}
                onclick={() => deplacer(m, i + 1)}>↓</button>
              <button class="lnk danger retirer-morceau" disabled={occupe}
                aria-label={$t('v2.circle.pl.removeNamed' as any).replace('{title}', m.title)}
                onclick={() => retirer(m)}>{$t('v2.circle.pl.remove' as any)}</button>
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
  .titre{display:flex; align-items:center; gap:12px; flex-wrap:wrap}
  .nom-playlist{font-size:17px; font-weight:700; margin:0; flex:1; min-width:0; overflow-wrap:anywhere}
  .state{color:var(--v2-txt3); font-size:13px}
  .note{font-size:11.5px; color:var(--v2-txt3); margin:0}
  .alerte{color:var(--v2-danger)}
  .vide{margin:0}
  .err,.ok{display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:10px 14px; border-radius:10px; font-size:12.5px}
  .err{border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
  .ok{border:1px solid var(--v2-line); background:var(--v2-acc-soft); color:var(--v2-txt)}
  .gestes{display:flex; gap:8px; align-items:center}
  .morceaux{list-style:none; margin:0; padding:0; display:flex; flex-direction:column}
  .morceau{display:grid; grid-template-columns:28px minmax(0,1fr) auto auto auto; align-items:center; gap:10px;
    padding:8px 6px; border-bottom:1px solid var(--v2-line); font-size:13px; cursor:grab}
  .morceau.glisse{opacity:.5}
  .morceau.introuvable .titre-morceau{color:var(--v2-txt3)}
  .rang{color:var(--v2-txt3); font-variant-numeric:tabular-nums; text-align:right}
  .infos{display:flex; flex-direction:column; min-width:0}
  .titre-morceau,.sous-titre{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .duree{font-variant-numeric:tabular-nums}
  .resolution{font-size:11px; padding:2px 8px; border-radius:var(--v2-r-pill); white-space:nowrap}
  .resolution:empty{padding:0}
  .res-bibliotheque,.res-service{background:var(--v2-acc-soft); color:var(--v2-txt)}
  .res-introuvable{border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
  .go{height:34px; padding:0 18px; border-radius:var(--v2-r-pill); border:0; cursor:pointer; font:700 12.5px var(--v2-sans);
    color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .go:disabled{opacity:.35; cursor:not-allowed}
  .lnk{border:0; background:transparent; color:var(--v2-acc-tint); cursor:pointer; font-size:13px; padding:4px 2px}
  .lnk:disabled{opacity:.35; cursor:not-allowed}
  .go:focus-visible,.lnk:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}
  .danger{color:var(--v2-danger)}
  @media (max-width: 640px){
    .morceau{grid-template-columns:24px minmax(0,1fr) auto}
    .duree,.resolution{grid-column:2}
  }
</style>
