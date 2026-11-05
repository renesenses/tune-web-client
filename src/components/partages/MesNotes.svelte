<!--
  « MES NOTES » — web#2653 (serveur : tune-server-rust#7849).

  Une note personnelle en Markdown sur un artiste, un album ou une piste :
  lecture rendue, édition, suppression, et recherche dans toutes ses notes.

  🔴 Le texte vient du serveur BRUT. Le seul `{@html}` de ce composant passe
  par `rendreMarkdownSur` (`lib/markdownSur`) : aucun HTML brut, aucun
  script, liens en https seulement.

  Serveur ancien (route `/library/notes` inconnue) :
  - album : repli sur `album_ratings.note` (`getAlbumRating` / `rateAlbum`),
    qui n'existe qu'avec une note sur 5 étoiles ;
  - artiste et piste : le bloc dit que les notes ne sont pas disponibles.
-->
<script lang="ts">
  import * as api from '../../lib/api';
  import type { NotePersonnelle, TypeNote } from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { rendreMarkdownSur } from '../../lib/markdownSur';
  import { notifications } from '../../lib/stores/notifications';
  import { dialogs } from '../../lib/stores/dialogs';
  import { activeView, pendingLibraryAlbum } from '../../lib/stores/navigation';
  import { ouvrirFicheArtisteLocale } from '../../lib/ouvrirArtisteDepuis';
  import { get } from 'svelte/store';

  interface Props {
    type: TypeNote;
    id: number;
  }
  let { type, id }: Props = $props();

  type Mode = 'chargement' | 'notes' | 'repli' | 'indisponible' | 'erreur';
  let mode = $state<Mode>('chargement');
  let texte = $state('');
  let brouillon = $state('');
  let edition = $state(false);
  let occupe = $state(false);
  let chargePour = $state<string | null>(null);

  let rechercheOuverte = $state(false);
  let q = $state('');
  let resultats = $state<{ note: NotePersonnelle; nom: string }[] | null>(null);
  let rechercheEnCours = $state(false);

  const rendu = $derived(rendreMarkdownSur(texte));

  async function charger(cible: TypeNote, ident: number) {
    const cle = `${cible}:${ident}`;
    chargePour = cle;
    mode = 'chargement';
    edition = false;
    texte = '';
    try {
      if (await api.notesDisponibles()) {
        const n = await api.lireNote(cible, ident);
        if (chargePour !== cle) return;
        texte = n?.texte_md ?? '';
        mode = 'notes';
      } else if (cible === 'album') {
        const r = await api.getAlbumRating(ident).catch(() => null);
        if (chargePour !== cle) return;
        texte = typeof r?.note === 'string' ? r.note : '';
        mode = 'repli';
      } else {
        mode = 'indisponible';
      }
    } catch {
      if (chargePour === cle) mode = 'erreur';
    }
  }

  $effect(() => {
    const cle = `${type}:${id}`;
    if (cle !== chargePour) void charger(type, id);
  });

  function commencer() {
    brouillon = texte;
    edition = true;
  }

  async function enregistrer() {
    if (occupe) return;
    const nouveau = brouillon.trim() ? brouillon : '';
    occupe = true;
    try {
      if (mode === 'repli') {
        // `album_ratings.note` vit sur la ligne de la note sur 5 : relue au
        // moment d'écrire, les étoiles ont pu changer depuis l'ouverture.
        const r = await api.getAlbumRating(id).catch(() => null);
        const etoiles = Number(r?.rating) || 0;
        if (etoiles <= 0) {
          notifications.error($t('mesNotes.repliEtoiles' as any));
          return;
        }
        await api.rateAlbum(id, etoiles, nouveau);
        texte = nouveau;
      } else {
        const n = await api.ecrireNote(type, id, nouveau);
        texte = n?.texte_md ?? '';
      }
      edition = false;
      notifications.success($t((texte ? 'mesNotes.enregistree' : 'mesNotes.supprimee') as any));
    } catch {
      notifications.error($t('mesNotes.erreur' as any));
    } finally {
      occupe = false;
    }
  }

  async function supprimer() {
    if (occupe) return;
    if (!(await dialogs.confirm($t('mesNotes.supprimerConfirm' as any), { danger: true }))) return;
    occupe = true;
    try {
      if (mode === 'repli') {
        const r = await api.getAlbumRating(id).catch(() => null);
        const etoiles = Number(r?.rating) || 0;
        if (etoiles > 0) await api.rateAlbum(id, etoiles, '');
      } else {
        await api.supprimerNote(type, id);
      }
      texte = '';
      edition = false;
      notifications.success($t('mesNotes.supprimee' as any));
    } catch {
      notifications.error($t('mesNotes.erreur' as any));
    } finally {
      occupe = false;
    }
  }

  async function nomDe(n: NotePersonnelle): Promise<string> {
    try {
      if (n.item_type === 'album') return (await api.getAlbum(n.item_id))?.title ?? `#${n.item_id}`;
      if (n.item_type === 'artist') return (await api.getArtist(n.item_id))?.name ?? `#${n.item_id}`;
      return (await api.getTrack(n.item_id))?.title ?? `#${n.item_id}`;
    } catch {
      return `#${n.item_id}`;
    }
  }

  async function rechercher() {
    const mot = q.trim();
    if (!mot) { resultats = null; return; }
    rechercheEnCours = true;
    try {
      const r = await api.listerNotes({ q: mot, limit: 20 });
      const notes = r?.notes ?? [];
      const noms = await Promise.all(notes.map(nomDe));
      resultats = notes.map((note, i) => ({ note, nom: noms[i] }));
    } catch {
      resultats = [];
      notifications.error($t('mesNotes.erreurLecture' as any));
    } finally {
      rechercheEnCours = false;
    }
  }

  async function ouvrir(n: NotePersonnelle, nom: string) {
    if (n.item_type === 'artist') {
      ouvrirFicheArtisteLocale(n.item_id, nom, get(activeView));
      return;
    }
    let album: number | null = n.item_type === 'album' ? n.item_id : null;
    if (n.item_type === 'track') {
      const piste = await api.getTrack(n.item_id).catch(() => null);
      album = piste?.album_id ?? null;
    }
    if (album == null) return;
    pendingLibraryAlbum.set(album);
    activeView.set('library');
  }

  /** Un extrait en texte : jamais le Markdown rendu dans une liste. */
  function extrait(md: string): string {
    const plat = md.replace(/[#*_`>[\]()!~-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return plat.length > 140 ? `${plat.slice(0, 140)}…` : plat;
  }
</script>

<section class="mes-notes" data-mes-notes={type}>
  <div class="entete">
    <h3>{$t('mesNotes.titre' as any)}</h3>
    {#if (mode === 'notes' || mode === 'repli') && !edition}
      <button class="lien" data-mes-notes-modifier onclick={commencer}>
        {texte ? $t('mesNotes.modifier' as any) : $t('mesNotes.ajouter' as any)}
      </button>
      {#if texte}
        <button class="lien" data-mes-notes-supprimer onclick={supprimer} disabled={occupe}>
          {$t('mesNotes.supprimer' as any)}
        </button>
      {/if}
    {/if}
    {#if mode === 'notes'}
      <button class="lien recherche" data-mes-notes-rechercher aria-expanded={rechercheOuverte}
        onclick={() => (rechercheOuverte = !rechercheOuverte)}>
        {$t('mesNotes.rechercher' as any)}
      </button>
    {/if}
  </div>

  {#if mode === 'chargement'}
    <p class="etat">{$t('v2.common.loading' as any)}</p>
  {:else if mode === 'indisponible'}
    <p class="etat" data-mes-notes-indisponible>{$t('mesNotes.indisponible' as any)}</p>
  {:else if mode === 'erreur'}
    <p class="etat err">{$t('mesNotes.erreurLecture' as any)}</p>
  {:else if edition}
    <textarea class="saisie" data-mes-notes-saisie rows="6" bind:value={brouillon}
      placeholder={$t('mesNotes.placeholder' as any)} disabled={occupe}></textarea>
    <p class="aide">{$t('mesNotes.aide' as any)}</p>
    {#if mode === 'repli'}<p class="aide">{$t('mesNotes.repliEtoiles' as any)}</p>{/if}
    <div class="boutons">
      <button class="primaire" data-mes-notes-enregistrer onclick={enregistrer} disabled={occupe}>
        {$t('mesNotes.enregistrer' as any)}
      </button>
      <button class="lien" onclick={() => (edition = false)} disabled={occupe}>{$t('mesNotes.annuler' as any)}</button>
    </div>
  {:else if texte}
    <!-- Seule entrée HTML : `rendreMarkdownSur`, assaini (voir l'en-tête). -->
    <div class="rendu" data-mes-notes-rendu>{@html rendu}</div>
  {:else}
    <p class="etat">{$t('mesNotes.vide' as any)}</p>
  {/if}

  {#if rechercheOuverte && mode === 'notes'}
    <form class="chercher" onsubmit={(e) => { e.preventDefault(); void rechercher(); }}>
      <input type="search" data-mes-notes-q bind:value={q} placeholder={$t('mesNotes.rechercherPlaceholder' as any)} />
      <button class="primaire" type="submit" disabled={rechercheEnCours}>{$t('mesNotes.rechercher' as any)}</button>
    </form>
    {#if resultats}
      {#if resultats.length === 0}
        <p class="etat">{$t('mesNotes.aucunResultat' as any)}</p>
      {:else}
        <ul class="resultats" data-mes-notes-resultats>
          {#each resultats as r (r.note.item_type + ':' + r.note.item_id)}
            <li>
              <button class="resultat" onclick={() => ouvrir(r.note, r.nom)}>
                <span class="type">{$t(`mesNotes.type.${r.note.item_type}` as any)}</span>
                <span class="nom">{r.nom}</span>
                <span class="extrait">{extrait(r.note.texte_md)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  {/if}
</section>

<style>
  .mes-notes { margin: 12px 0; padding: 12px 16px; border: 1px solid var(--v2-line2, rgba(127, 127, 127, 0.25));
    border-radius: 10px; font: 400 13px var(--v2-sans, inherit); color: var(--v2-txt, inherit) }
  .entete { display: flex; flex-wrap: wrap; align-items: center; gap: 10px }
  .entete h3 { margin: 0 auto 0 0; font: 600 13px var(--v2-sans, inherit) }
  .lien { background: none; border: 0; padding: 2px 4px; cursor: pointer; color: var(--v2-acc1, inherit); font: inherit }
  .lien:disabled { opacity: .5; cursor: default }
  .primaire { background: var(--v2-acc1, #888); color: var(--v2-on-acc, #fff); border: 0; border-radius: 999px;
    padding: 5px 14px; cursor: pointer; font: 500 12px var(--v2-sans, inherit) }
  .primaire:disabled { opacity: .5; cursor: default }
  .etat { margin: 8px 0 0; color: var(--v2-txt3, inherit) }
  .etat.err { color: var(--v2-danger, inherit) }
  .aide { margin: 4px 0 0; font-size: 11.5px; color: var(--v2-txt3, inherit) }
  .saisie { width: 100%; box-sizing: border-box; margin-top: 8px; padding: 8px 10px; resize: vertical;
    background: var(--v2-surface, transparent); color: var(--v2-txt, inherit); border: 1px solid var(--v2-line2, #888);
    border-radius: 8px; font: 13px var(--v2-mono, monospace) }
  .boutons { display: flex; gap: 10px; align-items: center; margin-top: 8px }
  .rendu { margin-top: 8px; line-height: 1.5; overflow-wrap: anywhere }
  .rendu :global(p) { margin: 0 0 8px }
  .rendu :global(a) { color: var(--v2-acc1, inherit) }
  .rendu :global(pre) { overflow-x: auto; padding: 8px; border-radius: 6px; background: var(--v2-surface2, transparent) }
  .chercher { display: flex; gap: 8px; margin-top: 10px }
  .chercher input { flex: 1; min-width: 0; padding: 5px 10px; border-radius: 8px; border: 1px solid var(--v2-line2, #888);
    background: var(--v2-surface, transparent); color: var(--v2-txt, inherit); font: 13px var(--v2-sans, inherit) }
  .resultats { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px }
  .resultat { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; width: 100%; text-align: left;
    background: none; border: 0; padding: 6px 8px; border-radius: 8px; cursor: pointer; color: inherit; font: inherit }
  .resultat:hover { background: var(--v2-hover, rgba(127, 127, 127, 0.1)) }
  .type { font: 600 10.5px var(--v2-mono, monospace); color: var(--v2-txt3, inherit); text-transform: uppercase }
  .nom { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .extrait { grid-column: 2; color: var(--v2-txt2, inherit); font-size: 12px }
</style>
