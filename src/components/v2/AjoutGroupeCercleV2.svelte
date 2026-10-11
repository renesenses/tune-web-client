<script lang="ts">
  /**
   * Playlists de cercle — l'ajout GROUPÉ et le partage d'une playlist.
   *
   * Deux gestes, une fenêtre, ouverte depuis n'importe quel menu par
   * `demandeCercle` (`lib/circlePlaylists`) et montée une fois par `ShellV2` :
   *
   * - `ajout`   : un album, une sélection ou une playlist entière rejoint une
   *               playlist de cercle EXISTANTE, en fin de liste, dans l'ordre ;
   * - `partage` : « Partager avec un cercle » d'une playlist (locale,
   *               intelligente ou de service) — une playlist de cercle NEUVE
   *               dans un de MES cercles, COPIE par références dans le même
   *               ordre. L'original ne change pas et n'y reste pas lié : rien
   *               n'est écrit chez un service (décision du 28/09).
   *
   * Les pistes ne sont lues qu'au geste. Le greffon (`bulk-items`) découpe par
   * lots, s'arrête au plafond du cloud et COMPTE ce qui ne se référence pas ;
   * l'écran le dit, compte compris (`phrasesBilan`).
   */
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import { motifCercle, getCercle, estConnecte, type CercleNomme } from '../../lib/circle';
  import {
    listerPlaylistsCercle, creerPlaylistCercle, ajouterPistesEnLot, codeAjoutGroupe, phrasesBilan, idCree,
    entreesDePistes, refusRienAReferencer,
    nomPlaylistValide, NOM_PLAYLIST_MAX, MORCEAUX_MAX,
    type DemandeCercle, type PlaylistCercleResume,
  } from '../../lib/circlePlaylists';

  interface Props {
    demande: DemandeCercle;
    onClose: () => void;
  }
  let { demande, onClose }: Props = $props();

  const partage = $derived(demande.mode === 'partage');

  let playlists = $state<PlaylistCercleResume[] | null>(null);
  let cercles = $state<CercleNomme[] | null>(null);
  let nonConnecte = $state(false);
  let cercleChoisi = $state<number | ''>('');
  let nom = $state('');
  let erreur = $state<string | null>(null);
  let occupe = $state(false);
  let bilan = $state<{ texte: string; alerte: boolean }[] | null>(null);

  function phrase(e: unknown): string {
    const cle = codeAjoutGroupe(e);
    if (cle) return $t(cle as any).replace('{max}', String(cle === 'v2.circle.pl.err.full' ? MORCEAUX_MAX : NOM_PLAYLIST_MAX));
    const m = motifCercle(e);
    const s = $t(m.cle as any);
    return m.minutes != null ? s.replace('{n}', String(m.minutes)) : s;
  }

  async function charger() {
    erreur = null;
    try {
      if (demande.mode === 'partage') {
        nom = [...demande.nom.trim()].slice(0, NOM_PLAYLIST_MAX).join('');
        const etat = await getCercle();
        if (!estConnecte(etat)) { nonConnecte = true; cercles = []; return; }
        cercles = etat.circles ?? [];
        if (cercles.length === 1) cercleChoisi = cercles[0].id;
      } else {
        playlists = await listerPlaylistsCercle();
      }
    } catch (e) {
      cercles = [];
      playlists = [];
      // 404 : un greffon d'avant ces routes — rien à proposer, sans alarme.
      erreur = (e as { status?: number })?.status === 404 ? null : phrase(e);
    }
  }

  async function pistes() {
    const lues = await demande.pistes();
    if (!lues.length) throw Object.assign(new Error('no tracks'), { code: 'circle.no_tracks' });
    return lues;
  }

  function finir(lignes: { texte: string; alerte: boolean }[]) {
    bilan = lignes;
    notifications.success(lignes[0].texte);
  }

  async function ajouterA(p: PlaylistCercleResume) {
    if (occupe) return;
    occupe = true;
    erreur = null;
    try {
      const b = await ajouterPistesEnLot(p.id, await pistes());
      finir(phrasesBilan(b, p.name, (k) => $t(k as any)));
    } catch (e) {
      if ((e as { code?: string })?.code === 'circle.no_tracks') erreur = $t('v2.circle.pl.err.noTracks' as any);
      else if ((e as { status?: number })?.status === 404) {
        await charger();
        erreur = $t('v2.circle.pl.gone' as any);
      } else erreur = phrase(e);
    } finally {
      occupe = false;
    }
  }

  async function partager() {
    if (occupe || cercleChoisi === '') return;
    const n = nomPlaylistValide(nom);
    if (n === null) {
      erreur = $t('v2.circle.pl.err.nameInvalid' as any).replace('{max}', String(NOM_PLAYLIST_MAX));
      return;
    }
    occupe = true;
    erreur = null;
    let creee: string | number | null = null;
    try {
      // Les pistes d'abord : une playlist vide n'est pas créée pour rien, ni
      // pour une suite dont rien ne se référence (une playlist Bandcamp…).
      const lues = await pistes();
      const { entrees, nonReferencables } = entreesDePistes(lues);
      if (!entrees.length) throw refusRienAReferencer(nonReferencables);
      creee = idCree(await creerPlaylistCercle(cercleChoisi, n));
      if (creee == null) throw Object.assign(new Error('invalid playlist'), { status: 502 });
      const b = await ajouterPistesEnLot(creee, lues);
      finir(phrasesBilan(b, n, (k) => $t(k as any), true));
    } catch (e) {
      if ((e as { code?: string })?.code === 'circle.no_tracks') erreur = $t('v2.circle.pl.err.noTracks' as any);
      else if (creee != null) {
        erreur = $t('v2.circle.pl.err.createdEmpty' as any).replace('{name}', n).replace('{reason}', phrase(e));
      } else erreur = phrase(e);
    } finally {
      occupe = false;
    }
  }

  function surFond(e: MouseEvent) { if (e.target === e.currentTarget && !occupe) onClose(); }
  function surTouche(e: KeyboardEvent) { if (e.key === 'Escape' && !occupe) onClose(); }

  $effect(() => { void demande; void charger(); });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fond-groupe-cercle" onclick={surFond} onkeydown={surTouche}>
  <div class="boite tune-v2" role="dialog" aria-modal="true" aria-labelledby="groupe-cercle-titre" aria-busy={occupe}>
    <header class="tete">
      <h3 id="groupe-cercle-titre">
        {$t((partage ? 'v2.circle.pl.shareTitle' : 'v2.circle.pl.bulkTitle') as any).replace('{name}', demande.nom)}
      </h3>
      <button class="lnk fermer" onclick={onClose} disabled={occupe} aria-label={$t('common.close' as any)}>×</button>
    </header>

    {#if bilan}
      <ul class="bilan" data-bilan-cercle aria-live="polite">
        {#each bilan as l, i (i)}
          <li class:alerte={l.alerte}>{l.texte}</li>
        {/each}
      </ul>
      <button class="primaire" onclick={onClose}>{$t('common.close' as any)}</button>
    {:else}
      <p class="note">
        {$t((partage ? 'v2.circle.pl.shareHint' : 'v2.circle.pl.bulkHint') as any).replace('{max}', String(MORCEAUX_MAX))}
      </p>
      {#if partage}
        {#if cercles === null}
          <div class="note">{$t('v2.tool.loading' as any)}</div>
        {:else if nonConnecte}
          <p class="note vide">{$t('v2.circle.err.notConnected' as any)}</p>
        {:else if cercles.length === 0 && !erreur}
          <p class="note vide">{$t('v2.circle.pl.noCircle' as any)}</p>
        {:else if cercles.length}
          <form class="partage" onsubmit={(e) => { e.preventDefault(); void partager(); }}>
            <label>
              <span>{$t('v2.circle.pl.shareCircle' as any)}</span>
              <select bind:value={cercleChoisi} disabled={occupe} data-choix-cercle>
                {#if cercles.length > 1}<option value="">—</option>{/if}
                {#each cercles as c (c.id)}
                  <option value={c.id}>{c.name}</option>
                {/each}
              </select>
            </label>
            <label>
              <span>{$t('v2.circle.pl.shareName' as any)}</span>
              <input type="text" bind:value={nom} maxlength={NOM_PLAYLIST_MAX} disabled={occupe} data-nom-partage />
            </label>
            <button class="primaire" type="submit" disabled={occupe || cercleChoisi === '' || !nom.trim()} data-partager>
              {$t((occupe ? 'v2.circle.pl.working' : 'v2.circle.pl.shareGo') as any)}
            </button>
          </form>
        {/if}
      {:else}
        {#if playlists === null}
          <div class="note">{$t('v2.tool.loading' as any)}</div>
        {:else if playlists.length === 0 && !erreur}
          <p class="note vide">{$t('v2.circle.pl.noneToAdd' as any)}</p>
        {:else}
          <ul class="choix">
            {#each playlists as p (String(p.id))}
              <li>
                <button class="ligne choix-playlist" disabled={occupe} onclick={() => void ajouterA(p)}>
                  <span class="nom" title={p.name}>{p.name}</span>
                  <span class="note">{$t('v2.circle.pl.count' as any).replace('{n}', String(p.count))}</span>
                </button>
              </li>
            {/each}
          </ul>
          {#if occupe}<p class="note" aria-live="polite">{$t('v2.circle.pl.working' as any)}</p>{/if}
        {/if}
      {/if}
    {/if}
    {#if erreur}
      <p class="err" role="alert">{erreur}</p>
    {/if}
  </div>
</div>

<style>
  .fond-groupe-cercle{position:fixed; inset:0; z-index:1000; display:grid; place-items:center; background:rgba(0,0,0,.45); padding:16px}
  .boite{width:min(460px,100%); max-height:80vh; overflow:auto; display:flex; flex-direction:column; gap:10px; padding:16px 18px;
    border-radius:var(--v2-r-card); border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-txt); font-family:var(--v2-sans)}
  .tete{display:flex; align-items:center; gap:10px}
  .tete h3{margin:0; flex:1; font-size:15px; overflow-wrap:anywhere}
  .note{font-size:11.5px; color:var(--v2-txt3); margin:0}
  .vide{margin:0}
  .choix{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px}
  .ligne{width:100%; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 10px; border-radius:var(--v2-r-md);
    border:1px solid var(--v2-line); background:var(--v2-surface2); color:var(--v2-txt); cursor:pointer; font:13px var(--v2-sans); text-align:left}
  .ligne:disabled,.primaire:disabled{opacity:.5; cursor:not-allowed}
  .ligne:focus-visible,.lnk:focus-visible,.primaire:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}
  .nom{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .partage{display:flex; flex-direction:column; gap:10px}
  .partage label{display:flex; flex-direction:column; gap:4px; font-size:12.5px}
  .partage select,.partage input{padding:7px 9px; border-radius:var(--v2-r-md); border:1px solid var(--v2-line); background:var(--v2-surface2);
    color:var(--v2-txt); font:13px var(--v2-sans)}
  .primaire{align-self:flex-end; padding:8px 14px; border-radius:var(--v2-r-md); border:0; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2));
    color:var(--v2-on-acc); cursor:pointer; font:600 13px var(--v2-sans)}
  .bilan{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; font-size:13px}
  .bilan .alerte{color:var(--v2-txt2)}
  .err{margin:0; font-size:12.5px; color:var(--v2-danger)}
  .lnk{border:0; background:transparent; color:var(--v2-acc-tint); cursor:pointer; font-size:18px; padding:2px 6px}
</style>
