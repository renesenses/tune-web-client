<script lang="ts">
  /**
   * Choix de l'album ou de la playlist d'un réveil par une RECHERCHE (web#2393).
   *
   * Le réglage demandait l'identifiant, que personne ne connaît. Ici on tape un
   * nom, on choisit dans la liste (pochette, titre, artiste) et l'identifiant
   * part tel quel dans `onchoisir` : le corps envoyé au serveur ne change pas.
   * Album : la recherche de la bibliothèque (`/library/search`). Playlist : les
   * playlists de l'utilisateur, filtrées ici.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';

  interface Props {
    type: 'album' | 'playlist';
    idChoisi: string;
    nomChoisi: string;
    onchoisir: (id: string, nom: string) => void;
  }
  let { type, idChoisi, nomChoisi, onchoisir }: Props = $props();

  interface Ligne { id: string; titre: string; sousTitre: string; pochette: string | null }

  let requete = $state('');
  let lignes = $state<Ligne[]>([]);
  let cherche = $state(false);
  let erreur = $state(false);
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  let numero = 0;

  function saisie() {
    clearTimeout(minuteur);
    const q = requete.trim();
    if (q.length < 2) { lignes = []; cherche = false; return; }
    minuteur = setTimeout(() => void lancer(q), 250);
  }

  async function lancer(q: string) {
    const mien = ++numero;
    cherche = true;
    erreur = false;
    try {
      let res: Ligne[];
      if (type === 'album') {
        const r = await api.searchLibrary(q, 12);
        res = (r?.albums ?? []).filter((a) => a.id != null).map((a) => ({
          id: String(a.id), titre: a.title, sousTitre: a.artist_name ?? '', pochette: (a as any).cover_path ?? null,
        }));
      } else {
        const tout = (await api.getPlaylists(500, 0)) ?? [];
        const bas = q.toLowerCase();
        res = tout.filter((p: any) => String(p.name ?? '').toLowerCase().includes(bas)).slice(0, 12).map((p: any) => ({
          id: String(p.id), titre: p.name, sousTitre: '', pochette: p.cover_path ?? null,
        }));
      }
      if (mien === numero) lignes = res;
    } catch {
      if (mien === numero) { lignes = []; erreur = true; }
    }
    if (mien === numero) cherche = false;
  }

  function choisir(l: Ligne) {
    onchoisir(l.id, l.sousTitre ? `${l.titre} — ${l.sousTitre}` : l.titre);
    requete = '';
    lignes = [];
  }
</script>

<div class="selecteur">
  {#if idChoisi}
    <div class="choisi" data-testid="source-choisie">
      <span>{$t('alarms.chosen')} <b>{nomChoisi || idChoisi}</b></span>
    </div>
  {/if}
  <input
    type="search"
    bind:value={requete}
    oninput={saisie}
    placeholder={type === 'album' ? $t('alarms.searchAlbum') : $t('alarms.searchPlaylist')}
    aria-label={type === 'album' ? $t('alarms.searchAlbum') : $t('alarms.searchPlaylist')} />
  {#if erreur}
    <p class="indice">{$t('alarms.searchError')}</p>
  {:else if !cherche && requete.trim().length >= 2 && !lignes.length}
    <p class="indice">{$t('alarms.noResult')}</p>
  {/if}
  {#if lignes.length}
    <ul class="resultats">
      {#each lignes as l (l.id)}
        <li>
          <button type="button" class="ligne-res" data-id={l.id} onclick={() => choisir(l)}>
            {#if l.pochette}
              <img src={api.artworkUrl(l.pochette, 96)} alt="" width="40" height="40" loading="lazy" />
            {:else}
              <span class="sans-pochette"></span>
            {/if}
            <span class="txt"><b>{l.titre}</b>{#if l.sousTitre}<span>{l.sousTitre}</span>{/if}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .selecteur { display: flex; flex-direction: column; gap: 6px; }
  .choisi { font: 400 13px var(--v2-sans); color: var(--v2-txt); }
  .indice { margin: 0; font: 400 12px var(--v2-sans); color: var(--v2-txt2); }
  .resultats { list-style: none; margin: 0; padding: 0; max-height: 280px; overflow-y: auto; border: 1px solid var(--v2-line2); border-radius: 8px; }
  .ligne-res { display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 10px; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
  .ligne-res:hover, .ligne-res:focus-visible { background: var(--v2-line2); }
  .ligne-res img, .sans-pochette { width: 40px; height: 40px; border-radius: 4px; object-fit: cover; background: var(--v2-line2); flex: 0 0 auto; }
  .txt { display: flex; flex-direction: column; min-width: 0; }
  .txt b { font: 600 13px var(--v2-sans); }
  .txt span { font: 400 12px var(--v2-sans); color: var(--v2-txt2); }
</style>
