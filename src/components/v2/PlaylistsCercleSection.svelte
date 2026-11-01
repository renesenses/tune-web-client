<script lang="ts">
  import { bulleTexte } from '../../lib/infobulleTexte';
  /**
   * web#2452 (rc9, go de Bertrand du 27/10/2026) — les playlists Tune Circle
   * dans le menu Playlists : celles qu'on a partagées avec moi (cercles où je
   * suis invité) et celles que je partage, avec leur auteur et leur cercle.
   *
   * 🔴 AUCUNE route nouvelle. Les données sont celles de l'écran Circle :
   * `GET /api/v1/ext/circle/playlists` (`listerPlaylistsCercle`) rend déjà
   * TOUTES les playlists visibles de l'utilisateur — les siennes (`mine`) et
   * celles des cercles dont il est membre ou propriétaire, avec `owner` (le
   * partageur) et `circle_name`. L'ouverture est LA MÊME vue que depuis
   * l'écran Circle (`PlaylistCercleV2`) : lecture, ajout et retrait de titres,
   * date d'ajout de chaque titre, réordonnancement.
   *
   * La section n'existe que si elle a quelque chose à dire :
   *   - pas de compte relié (412), greffon absent ou serveur plus ancien (404),
   *     ou aucune playlist de cercle : RIEN n'est rendu (pas de bruit, pas
   *     d'appel répété) ;
   *   - cloud en panne (503) ou limite (429) : une ligne d'erreur et
   *     « Réessayer » — la section a déjà existé pour cet utilisateur.
   * Tune Circle : aucune crypto, HTTPS seulement ; rien n'est gardé ici.
   */
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { motifCercle } from '../../lib/circle';
  import {
    listerPlaylistsCercle, jouerPlaylistCercle, plusPartagee, codeT5,
    type IdOpaque, type PlaylistCercleResume,
  } from '../../lib/circlePlaylists';
  import PlaylistCercleV2 from './PlaylistCercleV2.svelte';

  interface Props {
    /** Le filtre de recherche de l'écran hôte (déjà en minuscules ou non : comparé sans casse). */
    filtre?: string;
    /** La liste est montrée (pastille « Tune Circle » choisie). Le composant charge quand même : l'hôte sait si la pastille existe. */
    visible?: boolean;
    /** Dit à l'hôte si la section existe (des playlists, ou une panne à signaler). */
    onexiste?: (existe: boolean) => void;
  }
  let { filtre = '', visible = true, onexiste }: Props = $props();

  let playlists = $state<PlaylistCercleResume[]>([]);
  let panne = $state<string | null>(null);
  let ouverte = $state<IdOpaque | null>(null);
  let occupe = $state<string | null>(null);
  let fini = false;

  /** 412 / 401 (pas relié) et 404 (greffon ou serveur sans la route) : la section n'existe pas. */
  function absente(e: unknown): boolean {
    const s = (e as { status?: number } | null)?.status;
    return s === 412 || s === 401 || s === 404;
  }

  function phrase(e: unknown): string {
    const m = motifCercle(e);
    const s = $t(m.cle as any);
    return m.minutes != null ? s.replace('{n}', String(m.minutes)) : s;
  }

  async function charger() {
    try {
      const l = await listerPlaylistsCercle();
      if (fini) return;
      playlists = l;
      panne = null;
    } catch (e) {
      if (fini) return;
      playlists = [];
      panne = absente(e) ? null : phrase(e);
    }
  }
  onMount(() => { void charger(); return () => { fini = true; }; });

  const norme = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const visibles = $derived(
    filtre.trim() ? playlists.filter((p) => norme(p.name).includes(norme(filtre.trim()))) : playlists,
  );
  /** La section existe : des playlists, ou une panne à signaler. */
  const affichee = $derived(playlists.length > 0 || panne != null);

  $effect(() => { onexiste?.(affichee); });

  async function lire(p: PlaylistCercleResume) {
    const zid = zoneRequise();
    if (zid == null || occupe !== null) return;
    occupe = String(p.id);
    try {
      const b = await jouerPlaylistCercle(p.id, zid);
      if (b.lances === 0) notifications.info($t('v2.circle.pl.nothingPlayable' as any));
      else if (b.manquants > 0) notifications.info($t('v2.circle.pl.playedMissing' as any).replace('{m}', String(b.manquants)));
      else notifications.success($t('v2.circle.pl.played' as any));
    } catch (e) {
      if (plusPartagee(e)) { notifications.error($t('v2.circle.pl.gone' as any)); void charger(); }
      else { const c = codeT5(e); notifications.error(c ? $t(c as any) : phrase(e)); }
    } finally {
      occupe = null;
    }
  }

  function fermer(raison: 'retour' | 'plusPartagee' | 'supprimee') {
    ouverte = null;
    if (raison === 'plusPartagee') notifications.error($t('v2.circle.pl.gone' as any));
    else if (raison === 'supprimee') notifications.success($t('v2.circle.pl.deleted' as any));
    void charger();
  }

  /** Les membres que l'on sait nommer : le partageur quand ce n'est pas moi (comme l'écran Circle). */
  function membresDe(pid: IdOpaque): string[] {
    const p = playlists.find((x) => String(x.id) === String(pid));
    return p && !p.mine && p.owner?.name ? [p.owner.name] : [];
  }

  /** Le calque reçoit le focus à l'ouverture : Échap et le clavier y travaillent aussitôt. */
  function prendreLeFocus(n: HTMLElement) { n.focus?.(); }

  function touche(ev: KeyboardEvent) {
    if (ev.key === 'Escape' && ouverte != null) { ev.stopPropagation(); ouverte = null; void charger(); }
  }
</script>

{#if affichee && visible}
  <section class="pl-cercle" aria-labelledby="pl-cercle-titre">
    <h3 id="pl-cercle-titre">{$t('v2.pl.circle.title' as any)}</h3>
    <p class="note">{$t('v2.pl.circle.hint' as any)}</p>
    {#if panne}
      <div class="err" role="alert"><span>{panne}</span>
        <button class="lnk reessayer" onclick={() => void charger()}>{$t('v2.circle.retry' as any)}</button></div>
    {:else}
      <ul>
        {#each visibles as p (String(p.id))}
          <li class="ligne playlist-cercle">
            <span class="nom" use:bulleTexte>{p.name}</span>
            <span class="note">
              {$t('v2.circle.pl.count' as any).replace('{n}', String(p.count))}
              · {p.mine ? $t('v2.pl.circle.mine' as any) : (p.owner?.name ? $t('v2.circle.pl.by' as any).replace('{name}', p.owner.name) : '')}{#if p.circle_name} · {p.circle_name}{/if}
            </span>
            <span class="gestes">
              <button class="lnk lire-playlist-cercle" disabled={occupe !== null || p.count === 0}
                aria-label={$t('v2.circle.pl.playNamed' as any).replace('{name}', p.name)}
                onclick={() => void lire(p)}>{$t('v2.circle.pl.play' as any)}</button>
              <button class="lnk ouvrir-playlist-cercle"
                aria-label={$t('v2.circle.pl.openNamed' as any).replace('{name}', p.name)}
                onclick={() => { ouverte = p.id; }}>{$t('v2.circle.pl.open' as any)}</button>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

{#if ouverte != null}
  <!-- La MÊME vue que depuis l'écran Circle, posée en calque sur l'écran Playlists. -->
  <div class="calque-cercle" role="dialog" aria-modal="true" tabindex="-1" use:prendreLeFocus aria-label={$t('v2.pl.circle.title' as any)} onkeydown={touche}>
    {#key String(ouverte)}
      <PlaylistCercleV2 id={ouverte} onFermer={fermer} membres={membresDe(ouverte)} />
    {/key}
  </div>
{/if}

<style>
  .pl-cercle{display:flex; flex-direction:column; gap:8px; margin:0 0 20px; font-family:var(--v2-sans); color:var(--v2-txt)}
  .pl-cercle h3{font-size:15px; font-weight:700; margin:0}
  .pl-cercle ul{list-style:none; margin:0; padding:0; display:flex; flex-direction:column}
  .note{font-size:11.5px; color:var(--v2-txt3); margin:0}
  .ligne{display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:10px;
    padding:8px 6px; border-bottom:1px solid var(--v2-line); font-size:13px}
  .nom{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .gestes{display:flex; gap:10px; align-items:center}
  .err{display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:10px 14px; border-radius:10px; font-size:12.5px;
    border:1px solid var(--v2-danger-bd); color:var(--v2-danger)}
  .lnk{border:0; background:transparent; color:var(--v2-acc-tint); cursor:pointer; font-size:13px; padding:4px 2px}
  .lnk:disabled{opacity:.35; cursor:not-allowed}
  .lnk:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}
  .calque-cercle{position:fixed; inset:0; z-index:60; overflow-y:auto; padding:16px 24px 40px;
    background:var(--v2-bg); color:var(--v2-txt)}
  @media (max-width: 640px){
    .ligne{grid-template-columns:minmax(0,1fr) auto}
    .ligne .note{grid-column:1}
    .calque-cercle{padding:12px 16px 32px}
  }
</style>
