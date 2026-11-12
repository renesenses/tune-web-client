<script lang="ts">
  import { notifierErreur } from '../../lib/notifierErreur';
  /**
   * L'annuaire radio-metadata.fr complet, dans « Radio en direct »
   * (tune-server-rust#6516, décisions du 13/10 avec Rémi).
   *
   * Le serveur Tune garde l'annuaire en cache (relevé chaque jour, servi hors
   * ligne) et le rend ici filtré et paginé : la page ne parle jamais à
   * mozaiklabs.fr ni à radio-metadata.fr. « Mes radios » reste la liste
   * personnelle : une station s'y AJOUTE d'un geste, sans doublon — le
   * serveur rend la station existante quand elle y est déjà.
   *
   * Un clic sur la vignette écoute la station tout de suite, sans l'ajouter.
   */
  import { onDestroy, tick } from 'svelte';
  import * as api from '../../lib/api';
  import { bulleTexte } from '../../lib/infobulleTexte';
  import { genresDeLaFiche, type AnnuaireRadios, type FicheAnnuaireRadio } from '../../lib/api/annuaireRadios';
  import type { RadioStation } from '../../lib/types';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { ecouterFicheAnnuaire } from '../../lib/ecouteFicheAnnuaire';
  import { t, locale } from '../../lib/i18n';
  import { radioGenreRayon, radioGenreLabel } from '../../lib/radioGenres';
  import { nomDuPays } from '../../lib/paysAffichage';
  import { notifications } from '../../lib/stores/notifications';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import LienEntite from '../partages/LienEntite.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import { objetRadio } from '../../lib/gestesObjet';
  import RadioRecherche from './RadioRecherche.svelte';
  import RadioChipsGenres from './RadioChipsGenres.svelte';
  import { memoriserTous, compteTous, type MemoTous } from '../../lib/totalTousLesGenres';
  import RadioFicheModale from '../partages/RadioFicheModale.svelte';
  import BadgeMetadataPlus from '../partages/BadgeMetadataPlus.svelte';
  import RadioFiltresAvances from './RadioFiltresAvances.svelte';
  import { preferences } from '../../lib/stores/preferences';
  import { normaliserFiltresRadio, parametresDesFiltres } from '../../lib/radioFiltres';
  import { dialogs } from '../../lib/stores/dialogs';
  import { questionRetraitMesRadios } from '../../lib/mesRadios';

  interface Props {
    /** Une station vient d'entrer dans « Mes radios » (ou d'y changer). */
    onAjoutee?: (station: RadioStation) => void;
    /** Une station vient de quitter « Mes radios » depuis l'annuaire (#7522). */
    onRetiree?: (id: number) => void;
    q?: string;
    pays?: string | null;
    genre?: string | null;
    /** Retrouver toutes les pages déjà visibles avant de rétablir le défilement. */
    limiteInitiale?: number;
    onCharge?: (nombre: number) => void;
    /** La station de l'annuaire qui joue, pour la pastille « en direct ». */
    enDirect?: string | null;
    onJoue?: (externalId: string) => void;
    /** Le titre en cours de la zone, quand c'est une de ces stations qui joue. */
    titreEnCours?: string | null;
  }
  let { onAjoutee, onRetiree, enDirect = null, onJoue, titreEnCours = null, q = $bindable(''), pays = $bindable(null), genre = $bindable(null), limiteInitiale = 120, onCharge }: Props = $props();

  const PAGE = 120;

  let page = $state<AnnuaireRadios | null>(null);
  let items = $state<FicheAnnuaireRadio[]>([]);
  let chargement = $state(true);
  let erreur = $state<string | null>(null);
  /** web#2443 — la fiche « Voir » ouverte (œil de la vignette). */
  let enFiche = $state<FicheAnnuaireRadio | null>(null);

  /** tune-server-rust#7466 — les critères de « Plus de filtres ». */
  const criteres = $derived(parametresDesFiltres(normaliserFiltresRadio($preferences.radioFiltres)));
  const cleCriteres = $derived(JSON.stringify(criteres));
  /** web#2693 — « Tous » suit les filtres actifs (genre mis à part). */
  const cleSansGenre = $derived(JSON.stringify([q, pays, cleCriteres]));
  let memoTous = $state<MemoTous | null>(null);
  const totalTous = $derived(compteTous(memoTous, cleSansGenre));

  let jeton = 0;
  let premiereLecture = true;
  onDestroy(() => { jeton += 1; });
  async function charger(suite = false) {
    const moi = ++jeton;
    // web#2693 — les filtres de CETTE requête, figés avant le premier `await` :
    // relus à la réponse, ils pourraient déjà être ceux de la suivante (pause
    // de frappe de 250 ms), et le mémo de « Tous » prendrait un faux total.
    const cleDeLaRequete = JSON.stringify([q, pays, cleCriteres]);
    const genreDeLaRequete = genre;
    chargement = true;
    erreur = null;
    try {
      const cible = premiereLecture ? Math.max(PAGE, limiteInitiale) : PAGE;
      const debut = suite ? items.length : 0;
      const nouvelles: FicheAnnuaireRadio[] = [];
      let r: AnnuaireRadios;
      do {
        r = await api.getAnnuaireRadios({
          q, country: pays, genre, offset: debut + nouvelles.length,
          limit: Math.min(PAGE, cible - nouvelles.length), criteres,
        });
        if (moi !== jeton) return;
        nouvelles.push(...r.items);
      } while (nouvelles.length < cible && r.items.length > 0 && debut + nouvelles.length < r.total);
      page = r;
      memoTous = memoriserTous(memoTous, cleDeLaRequete, genreDeLaRequete, r.total);
      items = suite ? [...items, ...nouvelles] : nouvelles;
      premiereLecture = false;
      await tick();
      if (moi === jeton) onCharge?.(items.length);
    } catch {
      if (moi === jeton) erreur = $t('v2.radio.dir.loadFailed' as any);
    } finally {
      if (moi === jeton) chargement = false;
    }
  }

  // La recherche part après une courte pause de frappe ; pays et genre tout
  // de suite. Chaque changement repart de la première page.
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const _cles = [q, pays, genre, cleCriteres];
    void _cles;
    clearTimeout(minuterie);
    minuterie = setTimeout(() => charger(false), q ? 250 : 0);
    return () => clearTimeout(minuterie);
  });

  const libelleGenre = (cle: string) => {
    const rayon = radioGenreRayon({ genre: cle });
    return rayon ? radioGenreLabel(rayon, (k) => $t(k as any)) : cle;
  };
  // Une combinaison sans résultat peut omettre les filtres choisis des
  // facettes. Les garder visibles permet de comprendre et modifier le choix.
  const genresAffiches = $derived.by(() => {
    const genres = (page?.genres ?? []).map(g => ({ cle: g.key ?? '', libelle: libelleGenre(g.key ?? ''), n: g.count }));
    if (genre && !genres.some(g => g.cle === genre)) genres.push({ cle: genre, libelle: libelleGenre(genre), n: 0 });
    return genres;
  });
  const nomPays = (code: string | null | undefined) => nomDuPays(code, $locale, code);

  async function ecouter(f: FicheAnnuaireRadio) {
    const zid = zoneRequise();
    if (zid == null) return;
    onJoue?.(f.external_id);
    // Le même geste que la « Carte » (lib/ecouteFicheAnnuaire.ts) : zone
    // navigateur comprise, la page lit elle-même le flux que le serveur rend.
    erreur = null;
    if (!(await ecouterFicheAnnuaire(f, zid, (message) => { erreur = message; }))) {
      erreur ??= $t('v2.radio.dir.playFailed' as any).replace('{name}', f.name);
    }
  }

  function rafraichirLaFiche(f: FicheAnnuaireRadio, st: RadioStation) {
    items = items.map((x) => x.external_id === f.external_id
      ? { ...x, my_radio_id: st.id, my_radio_favorite: !!st.favorite }
      : x);
    onAjoutee?.(st);
  }

  async function ajouter(f: FicheAnnuaireRadio) {
    try {
      const st = await api.ajouterDepuisAnnuaire(f.external_id, false);
      rafraichirLaFiche(f, st);
      notifications.success($t('v2.radio.dir.added' as any).replace('{name}', f.name));
    } catch (e: any) {
      notifierErreur($t('common.error' as any), e, { motifSeul: true });
    }
  }

  /**
   * tune-server-rust#7522 (alec_eiffel ; discussion #7563, go de Bertrand du
   * 12/11/2026) — retirer une station de « Mes radios » SANS quitter
   * l'annuaire. Le même appel (`deleteRadio`) et la même confirmation que
   * l'écran « Mes radios » (#7523 : elle dit que la station reste ici).
   * La fiche perd son badge « Dans mes radios » et retrouve « Ajouter ».
   */
  async function retirer(f: FicheAnnuaireRadio) {
    const id = f.my_radio_id;
    if (id == null) return;
    if (!(await dialogs.confirm(questionRetraitMesRadios((k) => $t(k as any), f.name, true), { danger: true }))) return;
    try {
      await api.deleteRadio(id);
      items = items.map((x) => x.external_id === f.external_id
        ? { ...x, my_radio_id: null, my_radio_favorite: false }
        : x);
      notifications.success($t('v2.radio.removed' as any).replace('{name}', f.name));
      onRetiree?.(id);
    } catch (e: any) {
      notifierErreur($t('common.error' as any), e, { motifSeul: true });
    }
  }

  /** Le cœur : met la station dans « Mes radios » ET en favori, ou l'en retire
   *  des favoris (elle reste dans « Mes radios »). */
  async function basculerFavori(f: FicheAnnuaireRadio) {
    try {
      const st = f.my_radio_id != null && f.my_radio_favorite
        ? await api.updateRadio(f.my_radio_id, { favorite: false })
        : await api.ajouterDepuisAnnuaire(f.external_id, true);
      rafraichirLaFiche(f, st);
    } catch (e: any) {
      notifierErreur($t('common.error' as any), e, { motifSeul: true });
    }
  }
</script>

<div class="annuaire">
  <div class="filtres">
    <RadioRecherche bind:valeur={q} />
    <select class="choix" bind:value={pays} aria-label={$t('v2.radio.country' as any)}>
      <option value={null}>{$t('v2.radio.dir.allCountries' as any)}</option>
      {#if pays && !page?.countries.some(c => c.code === pays)}
        <option value={pays}>{nomPays(pays)}</option>
      {/if}
      {#each page?.countries ?? [] as c (c.code)}
        <option value={c.code}>{nomPays(c.code)} ({c.count})</option>
      {/each}
    </select>
    {#if page}
      <span class="total">{$t('v2.radio.dir.count' as any).replace('{n}', String(page.total))}</span>
    {/if}
  </div>
  <RadioFiltresAvances />
  {#if genresAffiches.length}
    <RadioChipsGenres
      genres={genresAffiches}
      choisi={genre} total={totalTous} onChoisir={(c) => (genre = c)} />
  {/if}

  {#if erreur}
    <div class="etat err">{erreur}</div>
  {/if}
  {#if chargement && !items.length}
    <div class="etat">{$t('v2.radio.dir.loading' as any)}</div>
  {:else if page && page.stations === 0}
    <div class="etat">{$t('v2.radio.dir.empty' as any)}</div>
  {:else if !items.length && !erreur}
    <div class="etat">{$t('v2.radio.dir.noMatch' as any)}</div>
  {:else}
    <div class="grille">
      {#each items as f (f.external_id)}
        <div class="fiche" class:live={enDirect === f.external_id}>
          <span class="vignette">
            <PochetteActions
              favoriExterne={{ actif: !!f.my_radio_favorite, basculer: () => basculerFavori(f) }}
              onAjouter={f.my_radio_id == null ? () => ajouter(f) : null}
              libelleAjouter={$t('v2.radio.dir.add' as any)}
              onVoir={() => (enFiche = f)}
              libelleVoir={$t('v2.radio.view' as any)}
              onRetirer={f.my_radio_id != null ? () => retirer(f) : null}
              libelleRetirer={$t('v2.radio.removeFromMine' as any)}
              onLire={() => ecouter(f)}
              onOuvrir={() => (enFiche = f)}
              objet={f.my_radio_id != null ? objetRadio({ id: f.my_radio_id, name: f.name }) : null}
              nom={f.name}
            >
              <AlbumArt coverPath={f.logo_url ?? null} albumId={null} size={0} alt={f.name} fallbackInitials={f.name?.slice(0, 1)} />
            </PochetteActions>
          </span>
          <!-- web#2770 (lot 4) — « ouvrir » et le nom OUVRENT la fiche ; la lecture reste sur ▶. -->
          <span class="nm" use:bulleTexte><LienEntite entite={{ type: 'radio', nom: f.name, ouvrir: () => (enFiche = f) }} /></span>
          {#if enDirect === f.external_id && titreEnCours}
            <span class="encours" use:bulleTexte>{titreEnCours}</span>
          {:else}
            <span class="gn" use:bulleTexte>{[genresDeLaFiche(f).map(libelleGenre).join(', ') || null, nomPays(f.country_code)].filter(Boolean).join(' · ')}</span>
          {/if}
          <span class="pied">
            <!-- web#2443 — « Metadata+ » : la fiche a une clé radio-metadata.fr,
                 qui publie son titre en cours (c'est ce que disait le ♪). -->
            {#if f.radio_metadata_key || f.now_playing}<BadgeMetadataPlus />{/if}
            {#if f.codec}<span class="tk">{f.codec}{f.bitrate ? ` ${f.bitrate}` : ''}</span>{/if}
            {#if f.my_radio_id != null}
              <!-- #7522 — le badge passait inaperçu (texte gris de 9,5 px) :
                   pastille à la couleur d'accent, avec une coche. -->
              <span class="dedans"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{$t('v2.radio.dir.inMine' as any)}</span>
            {/if}
          </span>
        </div>
      {/each}
    </div>
    {#if page && items.length < page.total}
      <div class="suite">
        <button class="v2-btn" disabled={chargement} onclick={() => charger(true)}>{$t('v2.radio.dir.more' as any)}</button>
      </div>
    {/if}
  {/if}

  {#if enFiche}
    <RadioFicheModale annuaire={enFiche} onClose={() => (enFiche = null)}
      onLue={({ annuaireId }) => { if (annuaireId) onJoue?.(annuaireId); }}
      onChange={(st) => onAjoutee?.(st)} />
  {/if}

  <!-- Mention décidée le 13/10 avec Rémi : la source, et sa page de
       contribution, qui finance le serveur de radio-metadata.fr. -->
  <footer class="source">
    {#if page?.origine === 'cache'}<span class="horsligne">{$t('v2.radio.dir.offline' as any)}</span> · {/if}
    <a href={page?.attribution?.url ?? 'https://radio-metadata.fr'} target="_blank" rel="noopener noreferrer">{$t('v2.radio.dir.source' as any)}</a>
    ·
    <a href={page?.attribution?.support_url ?? 'https://ko-fi.com/aleceiffel'} target="_blank" rel="noopener noreferrer">{$t('v2.radio.dir.support' as any)}</a>
  </footer>
</div>

<style>
  .annuaire{display:flex; flex-direction:column; gap:10px; padding:4px 30px 30px}
  .filtres{display:flex; flex-wrap:wrap; gap:8px; align-items:center}
  .choix{background:var(--v2-surface2); color:var(--v2-txt); border:1px solid var(--v2-line2);
    border-radius:var(--v2-r-pill); padding:6px 12px; font:600 calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); max-width:220px}
  .total{font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3)}
  .etat{padding:20px 0; color:var(--v2-txt3)} .etat.err{color:var(--v2-danger)}
  .grille{display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:20px}
  .fiche{position:relative; display:flex; flex-direction:column; min-width:0}
  .vignette{position:relative; display:block; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden;
    box-shadow:var(--v2-sh-card); transition:.18s}
  .fiche:hover .vignette{box-shadow:0 10px 24px var(--v2-glow)}
  .nm{margin-top:9px; font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .gn,.encours{margin-top:2px; font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .encours{color:var(--v2-acc2)}
  .pied{display:flex; align-items:center; gap:6px; margin-top:4px; min-height:22px}
  .tk{font:calc(9.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-acc2)}
  .dedans{margin-left:auto; display:inline-flex; align-items:center; gap:3px; padding:1px 6px; border:1px solid currentColor; border-radius:999px; font:600 calc(9.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-acc2); white-space:nowrap}
  .dedans svg{width:10px; height:10px; fill:none; stroke:currentColor; stroke-width:3; stroke-linecap:round; stroke-linejoin:round}
  .suite{display:flex; justify-content:center; padding-top:8px}
  .source{margin-top:14px; font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt3)}
  .source a{color:var(--v2-acc2); text-decoration:none}
  .source a:hover{text-decoration:underline}
  .horsligne{color:var(--v2-txt2)}
  @media (max-width: 640px){ .annuaire{padding:4px 16px 24px} .choix{max-width:none; flex:1} }
</style>
