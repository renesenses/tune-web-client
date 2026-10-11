<script lang="ts">
  /**
   * YouTube Music — Tendances, Ambiances et Accueil. Onglet « Découvrir » de
   * YouTube dans `StreamingV2`.
   *
   * tune-server-rust#5247 — les trois routes étaient des TALONS côté serveur
   * (listes vides, « not yet implemented ») : l'écran ne montrait jamais rien.
   * Elles rendent désormais les rayons réels de YouTube Music, tous dans la
   * même forme :
   *
   *     { title, items: [{ kind, id, title, subtitle, cover_path }] }
   *
   * `kind` dit ce que l'élément ouvre : une playlist ou un album (sa liste de
   * titres), un artiste (sa page), un titre (la lecture).
   *
   * LA VIGNETTE EST CELLE DE `StreamingV2` (prop `tuile`) : pochette, cœur,
   * étiquettes, menu « … », ouverture de la fiche — les mêmes actions que sur
   * le reste de l'écran, au lieu d'une grille à part qui n'en avait aucune.
   * Sans `tuile` (montage isolé), un repli minimal lit ou ouvre la playlist.
   *
   * Une erreur du serveur est DITE (`common.error`) : le serveur ne rend plus
   * de liste vide qui ment, l'écran ne doit pas la réinventer.
   */
  import type { Snippet } from 'svelte';
  import * as api from '../../lib/api';
  import type { YtElementRayon, YtRayon, YtCategorieAmbiances } from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { playAndSync } from '../../lib/stores/zones';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import AlbumArt from '../partages/AlbumArt.svelte';

  /**
   * Le pays des tendances : la région de la langue du navigateur (`fr-FR` →
   * `FR`), sinon le classement MONDIAL (`ZZ`, la valeur de YouTube Music).
   * L'écran figeait `FR` pour tout le monde.
   */
  function paysDuNavigateur(): string {
    const langue = typeof navigator !== 'undefined' ? navigator.language ?? '' : '';
    const region = langue.split('-')[1] ?? '';
    return /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : 'ZZ';
  }

  let {
    tuile = null,
    pays = paysDuNavigateur(),
  }: {
    /** La vignette de l'écran hôte, avec ses actions. */
    tuile?: Snippet<[YtElementRayon]> | null;
    /** Pays des tendances (code à deux lettres, `ZZ` = monde). */
    pays?: string;
  } = $props();

  type Onglet = 'charts' | 'moods' | 'home';
  let onglet = $state<Onglet>('charts');
  let chargement = $state(false);
  let erreur = $state<string | null>(null);
  let tendances = $state<YtRayon[]>([]);
  let accueil = $state<YtRayon[]>([]);
  let categories = $state<YtCategorieAmbiances[]>([]);
  let ambiance = $state<{ title: string } | null>(null);
  let rayonsAmbiance = $state<YtRayon[]>([]);

  /** Message d'une erreur `fetchJSON` (le corps texte du serveur). */
  function motif(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }
  const rayonsDe = (r: unknown): YtRayon[] =>
    Array.isArray((r as any)?.sections) ? (r as any).sections : [];

  // tune-server-rust#1897 — chaque onglet n'est demandé QU'UNE fois par
  // montage. Un drapeau non réactif dit « déjà demandé », pas « non vide » :
  // un test sur la longueur relançait le chargement sans fin sur une réponse
  // vide (33 appels mesurés sur les Ambiances).
  const demandes = new Set<Onglet>();
  async function charger(o: Onglet) {
    if (demandes.has(o)) return;
    demandes.add(o);
    chargement = true;
    erreur = null;
    try {
      if (o === 'charts') tendances = rayonsDe(await api.getYouTubeCharts(pays));
      else if (o === 'home') accueil = rayonsDe(await api.getYouTubeHome());
      else {
        const reponse = await api.getYouTubeMoods();
        categories = Array.isArray(reponse) ? reponse : [];
      }
    } catch (e) {
      erreur = motif(e);
      // Revenir sur l'onglet redemande : une panne passagère ne fige pas
      // l'écran jusqu'au prochain montage. L'effet ne se relance que sur un
      // CHANGEMENT d'onglet, jamais en boucle.
      demandes.delete(o);
    }
    chargement = false;
  }
  async function ouvrirAmbiance(item: { title: string; params: string }) {
    chargement = true;
    erreur = null;
    ambiance = { title: item.title };
    rayonsAmbiance = [];
    try { rayonsAmbiance = rayonsDe(await api.getYouTubeMoodSections(item.params)); }
    catch (e) { erreur = motif(e); }
    chargement = false;
  }
  $effect(() => { void charger(onglet); });

  function choisir(o: Onglet) {
    onglet = o;
    ambiance = null;
    rayonsAmbiance = [];
    erreur = null;
  }

  // ── Repli sans vignette hôte ───────────────────────────────────────────
  function jouerPiste(p: any) {
    const zid = zoneRequise();
    const sid = p?.source_id ?? p?.id;
    if (zid == null || !sid) return;
    playAndSync(zid, { source: 'youtube' as any, source_id: String(sid) }).catch(signalerEchecLecture);
  }
  function jouerPlaylist(id: string) {
    const zid = zoneRequise();
    if (zid == null) return;
    playAndSync(zid, { streaming_playlist_id: id, source: 'youtube' as any }).catch(signalerEchecLecture);
  }
  function jouerElement(el: YtElementRayon) {
    if (el.kind === 'track') jouerPiste(el);
    else if (el.kind === 'playlist') jouerPlaylist(el.id);
    else if (el.kind === 'album') {
      const zid = zoneRequise();
      if (zid == null) return;
      playAndSync(zid, { streaming_album_id: el.id, source: 'youtube' as any }).catch(signalerEchecLecture);
    }
  }

  const rayonsAffiches = $derived(
    ambiance ? rayonsAmbiance : onglet === 'charts' ? tendances : onglet === 'home' ? accueil : [],
  );
</script>

<div class="ytm">
  <div class="onglets">
    <button class:on={onglet === 'charts'} onclick={() => choisir('charts')}>{$t('streaming.ytmCharts' as any)}</button>
    <button class:on={onglet === 'moods'} onclick={() => choisir('moods')}>{$t('streaming.ytmMoods' as any)}</button>
    <button class:on={onglet === 'home'} onclick={() => choisir('home')}>{$t('nav.home' as any)}</button>
  </div>

  {#if chargement}
    <div class="etat">{$t('common.loading' as any)}</div>
  {:else if erreur}
    <div class="etat erreur" role="alert">{$t('common.error' as any)} — {erreur}</div>
  {:else}
    {#if ambiance}
      <button class="retour" onclick={() => { ambiance = null; rayonsAmbiance = []; }}>← {ambiance.title}</button>
    {/if}
    {#if onglet === 'moods' && !ambiance}
      {#each categories as c (c.title)}
        <h3>{c.title}</h3>
        <div class="puces">
          {#each c.items as it (it.params)}<button onclick={() => ouvrirAmbiance(it)}>{it.title}</button>{/each}
        </div>
      {:else}
        <div class="etat">—</div>
      {/each}
    {:else}
      {#each rayonsAffiches as r, ri (ri)}
        <section class="rayon">
          <h3>{r.title}</h3>
          <div class="grille">
            {#each r.items as el, i (`${el.kind}:${el.id}:${i}`)}
              {#if tuile}
                {@render tuile(el)}
              {:else}
                <button class="carte" data-kind={el.kind} onclick={() => jouerElement(el)} title={el.subtitle}>
                  <AlbumArt coverPath={el.cover_path} albumId={null} size={0} alt={el.title} />
                  <span class="ti">{el.title}</span>
                  {#if el.subtitle}<span class="ar">{el.subtitle}</span>{/if}
                </button>
              {/if}
            {/each}
          </div>
        </section>
      {:else}
        <div class="etat">—</div>
      {/each}
    {/if}
  {/if}
</div>

<style>
  .ytm{padding:4px 0 24px}
  .onglets{display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px}
  .onglets button,.puces button{padding:5px 11px; border-radius:999px; border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); font:12px var(--v2-sans); cursor:pointer}
  .onglets button.on{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); border-color:transparent}
  h3{margin:16px 0 8px; font:600 11px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .etat{padding:20px 0; color:var(--v2-txt3); font-size:13px}
  .erreur{color:var(--v2-txt2)}
  .puces{display:flex; flex-wrap:wrap; gap:6px}
  .retour{border:0; background:transparent; color:var(--v2-txt2); cursor:pointer; font:600 13px var(--v2-sans); padding:0 0 10px}
  .grille{display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:20px}
  .carte{display:flex; flex-direction:column; gap:6px; padding:0; border:0; background:transparent; color:inherit; text-align:left; cursor:pointer; min-width:0}
  .ti,.ar{overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px}
  .ar{color:var(--v2-txt3); font-size:12px}
</style>
