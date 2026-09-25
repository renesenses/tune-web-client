<script lang="ts">
  /**
   * LE MODE « MODIFIER » DE LA FICHE ALBUM — GO de Bertrand, 25/09/2026.
   *
   * Monté par `AlbumDetailV2` à la place de la liste de pistes, pour un album
   * de la BIBLIOTHÈQUE dont le serveur sert `GET /library/albums/{id}/edition`.
   * Les règles (brouillon, déplacements, corps du PUT) vivent dans
   * `lib/editionAlbum` ; ce composant ne fait que les rendre et les brancher.
   *
   * Le réordonnancement reprend l'idiome de `ListePistesV2` (#1524) : une
   * POIGNÉE focalisable qui répond à ↑ / ↓ — le geste accessible — et qui
   * se saisit à la souris (HTML5 `draggable`). La poignée seule, et non la
   * ligne : une ligne de CHAMPS `draggable` volerait leur sélection. Une piste
   * change de disque en glissant sur un autre disque, ou par le menu
   * « Déplacer vers le disque N », atteignable au clavier.
   *
   * 🔴 Rien ne part avant « Enregistrer » : UN seul PUT, avec ce qui a changé.
   * « Annuler » n'appelle rien. Seuls « Détacher » et « Ajouter un disque »
   * écrivent tout de suite — ce sont des opérations du serveur, pas des
   * champs — et ils attendent donc qu'il n'y ait rien d'autre en suspens.
   *
   * « Écrire dans les fichiers » (tranche 4) suit la même règle : il reporte
   * dans les balises ce qui est ENREGISTRÉ, donc il est grisé tant que
   * quelque chose ne l'est pas. Plan d'abord (`dry_run`, confirmation), puis
   * écriture et résultat.
   */
  import { tick, untrack } from 'svelte';
  import * as api from '../../lib/api';
  import { t as tr } from '../../lib/i18n';
  import { dialogs } from '../../lib/stores/dialogs';
  import { formatDuration } from '../../lib/utils';
  import type { Album } from '../../lib/types';
  import {
    brouillonDepuis, corpsEdition, deplacer, deplacerPiste, validerBrouillon,
    TYPES_DE_SORTIE, type Brouillon, type EditionReponse, type ModeCompilation,
    champsDuPlan, ecritureBalisesAnnoncee, estRapportBalises, nomDeFichier, raisonsIgnorees,
    RAISONS_IGNORE, type RapportBalises,
  } from '../../lib/editionAlbum';

  let { albumId, donnees, onFermer, onEnregistre, onRecharger }: {
    albumId: number;
    donnees: EditionReponse;
    onFermer: () => void;
    /** Après un PUT réussi : la fiche se recharge et quitte le mode. */
    onEnregistre: (r: EditionReponse) => void;
    /** Après un détachement ou un ajout : la fiche relit ses pistes. */
    onRecharger?: () => void;
  } = $props();

  /** La réponse du serveur, référence de « ce qui a changé ». */
  let source = $state.raw<EditionReponse>(untrack(() => donnees));
  let b = $state<Brouillon>(brouillonDepuis(untrack(() => donnees)));

  const corps = $derived(corpsEdition(source, $state.snapshot(b) as Brouillon));
  const modifie = $derived(Object.keys(corps).length > 0);
  const afficherDisques = $derived(b.disques.length > 1 || source.album.coffret != null);
  /** Le type actuel, s'il n'est pas l'un de ceux que le client connaît. */
  const typeInconnu = $derived(
    b.release_type !== '' && !(TYPES_DE_SORTIE as readonly string[]).includes(b.release_type)
      ? b.release_type : null,
  );

  /** L'erreur affichée : une CLÉ et le détail du serveur, traduits au rendu. */
  let erreur = $state<{ cle: string; detail?: string } | null>(null);
  let enCours = $state(false);

  const CLES_VALIDATION: Record<string, string> = {
    titreVide: 'v2.edition.errTitle',
    anneeInvalide: 'v2.edition.errYear',
    titrePisteVide: 'v2.edition.errTrackTitle',
  };

  function erreurDe(e: unknown, cle: string): { cle: string; detail?: string } {
    const x = e as { status?: number; message?: string } | null;
    if (x?.status === 404 || x?.status === 405 || x?.status === 501) return { cle: 'v2.edition.errUpdateServer' };
    if (x?.status === 422) return { cle: 'v2.edition.errRefused', detail: x?.message || undefined };
    return { cle, detail: x?.message || undefined };
  }

  async function enregistrer() {
    if (enCours) return;
    const brut = $state.snapshot(b) as Brouillon;
    const v = validerBrouillon(brut);
    if (v) { erreur = { cle: CLES_VALIDATION[v] }; return; }
    const c = corpsEdition(source, brut);
    if (!Object.keys(c).length) return;
    enCours = true;
    erreur = null;
    try {
      const r = await api.putAlbumEdition(albumId, c);
      onEnregistre(r);
    } catch (e) {
      erreur = erreurDe(e, 'v2.edition.errFailed');
    } finally {
      enCours = false;
    }
  }

  /** Relit la fiche d'édition après une opération du serveur. */
  async function relire() {
    const r = await api.getAlbumEdition(albumId);
    source = r;
    b = brouillonDepuis(r);
    balisesPossibles = ecritureBalisesAnnoncee(r);
    onRecharger?.();
  }

  async function detacher(i: number) {
    const d = b.disques[i];
    if (!d || modifie || enCours) return;
    const ok = await dialogs.confirm(
      $tr('v2.edition.detachAsk' as any).replace('{n}', String(i + 1)),
      { danger: true },
    );
    if (!ok) return;
    enCours = true;
    erreur = null;
    try {
      await api.detachAlbumDisc(albumId, d.number);
      await relire();
    } catch (e) {
      erreur = erreurDe(e, 'v2.edition.errOperation');
    } finally {
      enCours = false;
    }
  }

  /* ── « Ajouter un disque » : chercher un album de la bibliothèque ── */
  let ajoutOuvert = $state(false);
  let requete = $state('');
  let resultats = $state<Album[] | null>(null);

  async function chercher(e: SubmitEvent) {
    e.preventDefault();
    const q = requete.trim();
    if (!q) return;
    try {
      const r = await api.searchLibrary(q, 20);
      resultats = (r?.albums ?? []).filter((a) => a.id != null && a.id !== albumId);
    } catch (err) {
      resultats = [];
      erreur = erreurDe(err, 'v2.edition.errOperation');
    }
  }

  async function attacher(a: Album) {
    if (a.id == null || modifie || enCours) return;
    enCours = true;
    erreur = null;
    try {
      await api.attachAlbumDisc(albumId, a.id);
      ajoutOuvert = false;
      resultats = null;
      requete = '';
      await relire();
    } catch (e) {
      erreur = erreurDe(e, 'v2.edition.errOperation');
    } finally {
      enCours = false;
    }
  }

  /* ── Réordonnancement : l'idiome de `ListePistesV2` ── */
  type Saisie = { sorte: 'disque'; i: number } | { sorte: 'piste'; d: number; j: number };
  let saisie = $state<Saisie | null>(null);
  let survol = $state<string | null>(null);

  function saisir(e: DragEvent, s: Saisie) {
    e.stopPropagation();
    saisie = s;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify(s));
    }
  }
  function survoler(e: DragEvent, cle: string, accepte: boolean) {
    if (!saisie || !accepte) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    survol = cle;
  }
  function relacher() { saisie = null; survol = null; }

  /** Dépôt sur un DISQUE : un disque s'y range, une piste y va en fin. */
  function deposerSurDisque(e: DragEvent, i: number) {
    e.preventDefault();
    e.stopPropagation();
    const s = saisie;
    relacher();
    if (!s) return;
    if (s.sorte === 'disque') {
      if (s.i !== i) b.disques = deplacer($state.snapshot(b.disques) as Brouillon['disques'], s.i, i);
    } else {
      b.disques = deplacerPiste($state.snapshot(b.disques) as Brouillon['disques'], { disque: s.d, rang: s.j }, { disque: i });
    }
  }
  /** Dépôt sur une PISTE : la piste saisie prend sa place. */
  function deposerSurPiste(e: DragEvent, d: number, j: number) {
    const s = saisie;
    if (!s || s.sorte !== 'piste') return;
    e.preventDefault();
    e.stopPropagation();
    relacher();
    if (s.d === d && s.j === j) return;
    b.disques = deplacerPiste($state.snapshot(b.disques) as Brouillon['disques'], { disque: s.d, rang: s.j }, { disque: d, rang: j });
  }

  /** Les poignées, pour que le focus SUIVE l'élément déplacé au clavier. */
  const poignees = () => Array.from(document.querySelectorAll<HTMLElement>('.edition .ed-poignee'));
  async function disqueAuClavier(e: KeyboardEvent, i: number) {
    const vers = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null;
    if (vers == null || vers < 0 || vers >= b.disques.length) return;
    e.preventDefault();
    e.stopPropagation();
    b.disques = deplacer($state.snapshot(b.disques) as Brouillon['disques'], i, vers);
    await tick();
    poignees().find((x) => x.dataset.disqueRang === String(vers))?.focus();
  }
  async function pisteAuClavier(e: KeyboardEvent, d: number, j: number) {
    const vers = e.key === 'ArrowUp' ? j - 1 : e.key === 'ArrowDown' ? j + 1 : null;
    if (vers == null || vers < 0 || vers >= b.disques[d].pistes.length) return;
    e.preventDefault();
    e.stopPropagation();
    b.disques = deplacerPiste($state.snapshot(b.disques) as Brouillon['disques'], { disque: d, rang: j }, { disque: d, rang: vers });
    await tick();
    poignees().find((x) => x.dataset.piste === [d, vers].join('-'))?.focus();
  }
  /** Le menu « Déplacer vers le disque N » : la piste va en fin du disque. */
  function versDisque(e: Event, d: number, j: number) {
    const sel = e.currentTarget as HTMLSelectElement;
    const cible = Number(sel.value);
    sel.value = '';
    if (!Number.isInteger(cible) || cible < 0 || cible === d) return;
    b.disques = deplacerPiste($state.snapshot(b.disques) as Brouillon['disques'], { disque: d, rang: j }, { disque: cible });
  }

  /* ── « Écrire dans les fichiers » (tranche 4) ──────────────────────────
     Reporte dans les BALISES ce que la base tient DÉJÀ : grisé tant qu'il
     reste des modifications non enregistrées. D'abord le plan (`dry_run`),
     dit dans une confirmation ; puis l'écriture, et son résultat.
     Sonde : `ecriture_balises` dans la fiche d'édition ; un 404/405 au clic
     retire aussi le bouton. */
  let balisesPossibles = $state(untrack(() => ecritureBalisesAnnoncee(donnees)));
  let balisesEnCours = $state(false);
  let rapportBalises = $state.raw<RapportBalises | null>(null);

  const libelleRaison = (raison: string): string =>
    (RAISONS_IGNORE as readonly string[]).includes(raison)
      ? $tr(`v2.edition.tagsSkip.${raison}` as any)
      : raison;

  /** Un échec de la route, en clé traduite au rendu. */
  function echecBalises(e: unknown) {
    const x = e as { status?: number; message?: string } | null;
    if (x?.status === 404 || x?.status === 405) {
      balisesPossibles = false;
      erreur = { cle: 'v2.edition.errWriteTagsServer' };
      return;
    }
    erreur = { cle: 'v2.edition.errWriteTags', detail: x?.message || undefined };
  }

  async function ecrireBalises() {
    if (modifie || enCours || balisesEnCours) return;
    balisesEnCours = true;
    erreur = null;
    rapportBalises = null;
    try {
      const plan = await api.ecrireBalisesAlbum(albumId, true);
      if (!estRapportBalises(plan)) throw { status: 404 };
      if (plan.a_ecrire === 0) {
        rapportBalises = plan;
        return;
      }
      let question = $tr('v2.edition.writeTagsAsk' as any)
        .replace('{n}', String(plan.a_ecrire))
        .replace('{champs}', champsDuPlan(plan).join(', '));
      if (plan.ignores.length) {
        question += ' ' + $tr('v2.edition.writeTagsAskSkipped' as any)
          .replace('{n}', String(plan.ignores.length))
          .replace('{raisons}', raisonsIgnorees(plan)
            .map(({ raison, n }) => `${libelleRaison(raison)} (${n})`).join(', '));
      }
      if (!(await dialogs.confirm(question))) return;
      const fait = await api.ecrireBalisesAlbum(albumId, false);
      if (!estRapportBalises(fait)) throw { status: 404 };
      rapportBalises = fait;
      // Les fichiers relus ont pu changer la ligne des pistes (taille, date).
      if (fait.ecrits > 0) onRecharger?.();
    } catch (e) {
      echecBalises(e);
    } finally {
      balisesEnCours = false;
    }
  }

  const MODES: { v: ModeCompilation; cle: string }[] = [
    { v: 'auto', cle: 'v2.edition.compAuto' },
    { v: 'oui', cle: 'v2.edition.compYes' },
    { v: 'non', cle: 'v2.edition.compNo' },
  ];
  const TYPES: { v: string; cle: string }[] = [
    { v: 'album', cle: 'v2.edition.typeAlbum' },
    { v: 'ep', cle: 'v2.edition.typeEp' },
    { v: 'single', cle: 'v2.edition.typeSingle' },
  ];
</script>

{#snippet poigneeDisque(i: number)}
  <button type="button" class="ed-poignee" data-disque-rang={i} draggable="true"
    ondragstart={(e) => saisir(e, { sorte: 'disque', i })} ondragend={relacher}
    title={$tr('v2.edition.discHandle' as any)} aria-label={$tr('v2.edition.discHandle' as any)}
    onkeydown={(e) => disqueAuClavier(e, i)}>
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/>
      <circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/>
      <circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>
    </svg>
  </button>
{/snippet}

{#snippet pistes(d: number)}
  <ol class="ed-pistes">
    {#each b.disques[d].pistes as p, j (p.id)}
      <!-- On saisit par la POIGNÉE (glisser, ou ↑ / ↓ au clavier) : une ligne
           entière `draggable` volerait la sélection de texte de ses champs. -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <li class="ed-piste" data-piste-id={p.id}
        class:saisie={saisie?.sorte === 'piste' && saisie.d === d && saisie.j === j}
        class:survolee={survol === `p${d}-${j}`}
        ondragover={(e) => survoler(e, `p${d}-${j}`, saisie?.sorte === 'piste')}
        ondrop={(e) => deposerSurPiste(e, d, j)}>
        <button type="button" class="ed-poignee" data-piste="{d}-{j}" draggable="true"
          ondragstart={(e) => saisir(e, { sorte: 'piste', d, j })} ondragend={relacher}
          title={$tr('v2.edition.trackHandle' as any)} aria-label={$tr('v2.edition.trackHandle' as any)}
          onkeydown={(e) => pisteAuClavier(e, d, j)}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/>
            <circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/>
            <circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>
          </svg>
        </button>
        <span class="ed-num" aria-hidden="true">{j + 1}</span>
        <input class="ed-titre" type="text" bind:value={b.disques[d].pistes[j].title}
          aria-label={$tr('v2.edition.trackTitle' as any).replace('{n}', String(j + 1))} />
        <input class="ed-artiste" type="text" bind:value={b.disques[d].pistes[j].artist_name}
          aria-label={$tr('v2.edition.trackArtist' as any).replace('{n}', String(j + 1))}
          placeholder={$tr('v2.edition.fieldArtist' as any)} />
        {#if b.disques.length > 1}
          <select class="ed-vers" onchange={(e) => versDisque(e, d, j)}
            aria-label={$tr('v2.edition.moveTo' as any).replace('{n}', String(j + 1))}>
            <option value="">{$tr('v2.edition.moveToShort' as any)}</option>
            {#each b.disques as _autre, k}
              {#if k !== d}
                <option value={String(k)}>{$tr('v2.edition.disc' as any).replace('{n}', String(k + 1))}</option>
              {/if}
            {/each}
          </select>
        {/if}
        <span class="ed-duree">{p.duration_ms ? formatDuration(p.duration_ms) : ''}</span>
      </li>
    {/each}
  </ol>
{/snippet}

<section class="edition" aria-labelledby="edition-titre">
  <div class="ed-tete">
    <h2 id="edition-titre">{$tr('v2.edition.heading' as any)}</h2>
    {#if modifie}
      <span class="ed-non-enreg" role="status" data-non-enregistre>{$tr('v2.edition.unsaved' as any)}</span>
    {/if}
  </div>

  {#if erreur}
    <p class="ed-erreur" role="alert" data-erreur-edition>
      {$tr(erreur.cle as any)}{#if erreur.detail}{' '}<span class="ed-detail">{erreur.detail}</span>{/if}
    </p>
  {/if}

  <fieldset class="ed-champs">
    <legend>{$tr('v2.edition.sectionAlbum' as any)}</legend>
    <label>{$tr('v2.edition.fieldTitle' as any)}
      <input type="text" name="title" bind:value={b.title} required /></label>
    <label>{$tr('v2.edition.fieldAlbumArtist' as any)}
      <input type="text" name="album_artist" bind:value={b.album_artist} /></label>
    <label>{$tr('v2.edition.fieldYear' as any)}
      <input type="text" name="year" inputmode="numeric" maxlength="4" bind:value={b.year} /></label>
    <label>{$tr('v2.edition.fieldLabel' as any)}
      <input type="text" name="label" bind:value={b.label} /></label>
    <label>{$tr('v2.edition.fieldGenre' as any)}
      <input type="text" name="genre" bind:value={b.genre} /></label>
    <label>{$tr('v2.edition.fieldType' as any)}
      <select name="release_type" bind:value={b.release_type}>
        <option value="">{$tr('v2.edition.typeUnknown' as any)}</option>
        {#each TYPES as ty (ty.v)}<option value={ty.v}>{$tr(ty.cle as any)}</option>{/each}
        {#if typeInconnu}<option value={typeInconnu}>{typeInconnu}</option>{/if}
      </select></label>

    <div class="ed-comp" role="radiogroup" aria-labelledby="edition-comp">
      <span id="edition-comp" class="ed-comp-titre">{$tr('v2.edition.compilation' as any)}</span>
      {#each MODES as m (m.v)}
        <label class="ed-radio">
          <input type="radio" name="compilation_mode" value={m.v} bind:group={b.compilation_mode} />
          {$tr(m.cle as any)}
        </label>
      {/each}
      {#if b.compilation_mode === 'auto'}
        <span class="ed-effet" data-effet-compilation>
          {$tr((source.album.compilation_effective ? 'v2.edition.compNowYes' : 'v2.edition.compNowNo') as any)}
        </span>
      {/if}
    </div>
    {#if source.album.coffret}
      <p class="ed-coffret">{$tr((source.album.coffret === 'manuel' ? 'v2.edition.boxManual' : 'v2.edition.boxAuto') as any)}</p>
    {/if}
  </fieldset>

  <div class="ed-disques">
    {#if afficherDisques}
      <h3>{$tr('v2.edition.sectionDiscs' as any)}</h3>
      {#each b.disques as disque, i (disque.number)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="ed-disque" data-disque={disque.number}
          class:saisie={saisie?.sorte === 'disque' && saisie.i === i}
          class:survolee={survol === `d${i}`}
          ondragover={(e) => survoler(e, `d${i}`, true)}
          ondrop={(e) => deposerSurDisque(e, i)}>
          <div class="ed-disque-tete">
            {@render poigneeDisque(i)}
            <label class="ed-nom-disque">
              <span>{$tr('v2.edition.disc' as any).replace('{n}', String(i + 1))}</span>
              <input type="text" bind:value={b.disques[i].title}
                aria-label={$tr('v2.edition.discName' as any).replace('{n}', String(i + 1))}
                placeholder={$tr('v2.edition.discNamePlaceholder' as any)} />
            </label>
            <button type="button" class="ed-lien" data-detacher={disque.number}
              disabled={modifie || enCours || b.disques.length < 2}
              title={modifie ? $tr('v2.edition.saveFirst' as any) : $tr('v2.edition.detach' as any)}
              onclick={() => detacher(i)}>{$tr('v2.edition.detach' as any)}</button>
          </div>
          {#if disque.pistes.length === 0}
            <p class="ed-vide">{$tr('v2.edition.emptyDisc' as any)}</p>
          {/if}
          {@render pistes(i)}
        </div>
      {/each}
    {:else if b.disques.length === 1}
      <h3>{$tr('v2.edition.sectionTracks' as any)}</h3>
      {@render pistes(0)}
    {/if}

    <div class="ed-ajout">
      {#if !ajoutOuvert}
        <button type="button" class="ed-lien" data-ajouter-disque disabled={modifie || enCours}
          title={modifie ? $tr('v2.edition.saveFirst' as any) : $tr('v2.edition.addDisc' as any)}
          onclick={() => (ajoutOuvert = true)}>{$tr('v2.edition.addDisc' as any)}</button>
      {:else}
        <form class="ed-recherche" onsubmit={chercher}>
          <input type="search" bind:value={requete}
            aria-label={$tr('v2.edition.addDiscSearch' as any)}
            placeholder={$tr('v2.edition.addDiscSearch' as any)} />
          <button type="submit" class="ed-lien">{$tr('v2.edition.search' as any)}</button>
          <button type="button" class="ed-lien" onclick={() => { ajoutOuvert = false; resultats = null; }}>
            {$tr('v2.edition.cancel' as any)}</button>
        </form>
        {#if resultats}
          {#if resultats.length === 0}
            <p class="ed-vide">{$tr('v2.edition.addDiscNone' as any)}</p>
          {:else}
            <ul class="ed-resultats">
              {#each resultats as a (a.id)}
                <li><button type="button" class="ed-resultat" data-attacher={a.id} disabled={enCours}
                  onclick={() => attacher(a)}>
                  {$tr('v2.edition.addDiscPick' as any).replace('{title}', a.title ?? '')}
                  {#if a.artist_name}<span class="ed-detail">{a.artist_name}</span>{/if}
                </button></li>
              {/each}
            </ul>
          {/if}
        {/if}
      {/if}
    </div>
  </div>

  <div class="ed-actions">
    <button type="button" class="ed-enregistrer" data-enregistrer disabled={!modifie || enCours}
      onclick={enregistrer}>{$tr((enCours ? 'v2.edition.saving' : 'v2.edition.save') as any)}</button>
    <button type="button" class="ed-annuler" data-annuler onclick={onFermer}>{$tr('v2.edition.cancel' as any)}</button>
    {#if balisesPossibles}
      <button type="button" class="ed-lien ed-balises" data-ecrire-balises
        disabled={modifie || enCours || balisesEnCours}
        title={modifie ? $tr('v2.edition.saveFirst' as any) : $tr('v2.edition.writeTagsTip' as any)}
        onclick={ecrireBalises}>{$tr((balisesEnCours ? 'v2.edition.writeTagsBusy' : 'v2.edition.writeTags') as any)}</button>
    {/if}
  </div>

  {#if rapportBalises}
    <div class="ed-rapport" role="status" data-rapport-balises>
      {#if rapportBalises.dry_run}
        <p data-rien-a-ecrire>{$tr('v2.edition.writeTagsNothing' as any)}</p>
      {:else}
        <p data-resultat-balises>{$tr('v2.edition.writeTagsResult' as any)
          .replace('{ecrits}', String(rapportBalises.ecrits))
          .replace('{ignores}', String(rapportBalises.ignores.length))
          .replace('{erreurs}', String(rapportBalises.erreurs.length))}</p>
      {/if}
      {#if rapportBalises.ignores.length}
        <p class="ed-rapport-titre">{$tr('v2.edition.writeTagsSkippedList' as any)}</p>
        <ul>
          {#each rapportBalises.ignores as i (i.track_id)}
            <li data-ignore={i.raison}>{nomDeFichier(i.path) || '—'} <span class="ed-detail">{libelleRaison(i.raison)}</span></li>
          {/each}
        </ul>
      {/if}
      {#if rapportBalises.erreurs.length}
        <p class="ed-rapport-titre ed-rapport-err">{$tr('v2.edition.writeTagsErrorsList' as any)}</p>
        <ul>
          {#each rapportBalises.erreurs as x (x.track_id)}
            <li data-erreur-balise={x.track_id}>{nomDeFichier(x.path)} <span class="ed-detail">{x.message}</span></li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</section>

<style>
  .edition{display:flex; flex-direction:column; gap:16px; padding:4px 0 24px}
  .ed-tete{display:flex; align-items:center; gap:14px; flex-wrap:wrap}
  .ed-tete h2{margin:0; font-size:20px; font-weight:700}
  .ed-non-enreg{font:600 12px var(--v2-sans); color:var(--v2-acc-tint); padding:4px 10px;
    border-radius:var(--v2-r-pill); border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .ed-erreur{margin:0; padding:10px 12px; border-radius:var(--v2-r-md); color:var(--v2-danger);
    border:1px solid var(--v2-danger-bd)}
  .ed-detail{color:var(--v2-txt2); margin-left:6px}
  .ed-champs{display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px;
    margin:0; padding:14px; border:1px solid var(--v2-line2); border-radius:var(--v2-r-md)}
  .ed-champs legend{padding:0 6px; font-weight:700; color:var(--v2-txt2)}
  .ed-champs label{display:flex; flex-direction:column; gap:5px; font-size:12px; color:var(--v2-txt3)}
  input[type="text"], input[type="search"], select{height:34px; padding:0 10px; border-radius:8px;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt);
    font:14px var(--v2-sans); min-width:0}
  input:focus-visible, select:focus-visible, button:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:1px}
  .ed-comp{grid-column:1 / -1; display:flex; align-items:center; gap:14px; flex-wrap:wrap}
  .ed-comp-titre{font-size:12px; color:var(--v2-txt3)}
  .ed-champs label.ed-radio{flex-direction:row; align-items:center; gap:6px; font-size:14px; color:var(--v2-txt)}
  .ed-effet{font-size:12px; font-style:italic; color:var(--v2-txt3)}
  .ed-coffret{grid-column:1 / -1; margin:0; font-size:12px; color:var(--v2-txt3)}
  .ed-disques{display:flex; flex-direction:column; gap:12px}
  .ed-disques h3{margin:0; font-size:15px; font-weight:700}
  .ed-disque{border:1px solid var(--v2-line2); border-radius:var(--v2-r-md); padding:10px}
  .ed-disque.survolee{border-color:var(--v2-acc1)}
  .ed-disque.saisie{opacity:.5}
  .ed-disque-tete{display:flex; align-items:center; gap:10px; flex-wrap:wrap}
  .ed-nom-disque{display:flex; align-items:center; gap:8px; flex:1 1 240px; font-weight:600}
  .ed-nom-disque input{flex:1 1 auto}
  .ed-pistes{list-style:none; margin:8px 0 0; padding:0; display:flex; flex-direction:column; gap:4px}
  .ed-piste{display:grid; grid-template-columns:28px 24px minmax(120px, 2fr) minmax(100px, 1.3fr) auto 48px;
    align-items:center; gap:8px; padding:3px 4px; border-radius:8px}
  .ed-piste.survolee{box-shadow:inset 0 2px 0 var(--v2-acc1)}
  .ed-piste.saisie{opacity:.5}
  .ed-num, .ed-duree{font:12px var(--v2-mono); color:var(--v2-txt3); text-align:right}
  .ed-poignee{width:28px; height:28px; padding:6px; border:0; border-radius:6px; cursor:grab;
    background:transparent; color:var(--v2-txt3)}
  .ed-poignee svg{width:16px; height:16px}
  .ed-poignee:hover, .ed-poignee:focus-visible{color:var(--v2-txt); background:var(--v2-hover)}
  .ed-vide{margin:6px 0 0; font-size:12px; font-style:italic; color:var(--v2-txt3)}
  .ed-lien{height:32px; padding:0 14px; border-radius:var(--v2-r-pill); cursor:pointer;
    border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt); font:600 13px var(--v2-sans)}
  .ed-lien:hover:not(:disabled){border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .ed-lien:disabled, .ed-enregistrer:disabled{opacity:.5; cursor:default}
  .ed-recherche{display:flex; gap:8px; flex-wrap:wrap; align-items:center}
  .ed-recherche input{flex:1 1 220px}
  .ed-resultats{list-style:none; margin:6px 0 0; padding:0; display:flex; flex-direction:column; gap:2px}
  .ed-resultat{width:100%; text-align:left; padding:7px 10px; border:0; border-radius:8px; cursor:pointer;
    background:transparent; color:var(--v2-txt); font:13px var(--v2-sans)}
  .ed-resultat:hover{background:var(--v2-surface2)}
  .ed-actions{display:flex; gap:12px; flex-wrap:wrap}
  .ed-enregistrer, .ed-annuler{height:44px; padding:0 22px; border-radius:var(--v2-r-pill); cursor:pointer;
    font:700 14px var(--v2-sans)}
  .ed-enregistrer{border:0; color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .ed-annuler{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt)}
  .ed-actions .ed-balises{height:44px; margin-left:auto}
  .ed-rapport{padding:10px 12px; border:1px solid var(--v2-line2); border-radius:var(--v2-r-md); font-size:13px}
  .ed-rapport p{margin:0 0 6px}
  .ed-rapport ul{margin:0 0 8px; padding-left:18px}
  .ed-rapport-titre{font-weight:600; color:var(--v2-txt2)}
  .ed-rapport-err{color:var(--v2-danger)}
  @media (max-width: 640px){
    .ed-piste{grid-template-columns:28px 20px 1fr; }
    .ed-artiste, .ed-vers{grid-column:3}
    .ed-duree{display:none}
  }
</style>
