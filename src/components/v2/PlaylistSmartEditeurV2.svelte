<script lang="ts">
  /**
   * Créer, modifier ou supprimer une PLAYLIST INTELLIGENTE, dans le nouveau
   * client.
   *
   * FabienM, forum fil 1778, point 8 (v0.9.148) : « Comment créer une playlist
   * intelligente pour obtenir des titres avec des critères ? Les collections
   * ne ramènent que des albums ». Sa lecture était exacte : `/library/
   * smart-playlists` rend des PISTES, `/library/smart-collections` des ALBUMS,
   * et le nouveau client n'offrait que la lecture de la première.
   * `createSmartPlaylist`, `updateSmartPlaylist` et `deleteSmartPlaylist`
   * existaient dans `lib/api.ts` sans autre appelant que l'écran de l'ancienne
   * interface (#1150).
   *
   * ## Ce que cet éditeur REPREND, et ce qu'il n'invente pas
   *
   * Rien de la grammaire n'a été réécrit. Les champs, les opérateurs offerts
   * par champ, la lecture des règles stockées et la mise en forme du corps
   * viennent de `lib/smartPlaylistChamps`, extrait sans changement de
   * `v2-heritage/SmartPlaylistsView.svelte`. Les deux écrans envoient donc
   * exactement le même corps au serveur. Un second éditeur de règles aurait
   * divergé du premier, et le serveur n'accepte qu'une grammaire.
   *
   * La VALIDATION est celle de l'ancien écran, mot pour mot : un nom non vide
   * suffit à enregistrer, et seules les règles qui portent une valeur partent.
   * Une playlist sans règle est légitime — elle prend toute la bibliothèque,
   * coupée à `max_tracks`, et c'est ce que font « 50 Random Tracks » ou
   * « Recently Added » sur le serveur de test.
   *
   * La MISE EN PAGE, elle, est celle du nouveau client : c'est le même cadre
   * que `CollectionSmartEditeurV2`, dont cet écran est le pendant pour les
   * pistes.
   *
   * ## Les RÉFÉRENCES et leurs deux espaces d'identifiants
   *
   * « Dans la collection X », « dans la playlist Y » : la valeur n'est pas un
   * identifiant nu mais `classic:<id>` ou `smart:<id>` (module serveur
   * `smart_refs`). Une collection manuelle et une collection intelligente
   * peuvent porter le même nombre — ce sont deux tables. Chacune a donc son
   * sélecteur, alimenté par les quatre listes réelles, et la playlist en cours
   * de modification est écartée de la sienne : une règle qui se référence
   * elle-même est refusée par le serveur.
   *
   * ## Ce que cet éditeur ne fait PAS
   *
   * Pas d'aperçu. `/smart-collections/preview` n'a pas d'équivalent pour les
   * playlists : il n'existe aucune route qui évalue des règles sans les avoir
   * enregistrées. Annoncer un compte exigerait de créer la playlist d'abord —
   * ce serait promettre un chiffre qu'on ne sait pas calculer.
   */
  import { onMount } from 'svelte';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import { streamingServices } from '../../lib/stores/streaming';
  import { statutsStreaming } from '../../lib/albumsArtisteStreaming';
  import { sourcesDisponibles, libelleSource } from '../../lib/sourcesRegle';
  import { errText } from '../../lib/utils';
  import {
    CHAMPS,
    operateursDe,
    lireRegles,
    reglesPourServeur,
    regleNeuve,
    type RegleSmartPlaylist,
  } from '../../lib/smartPlaylistChamps';
  import '../../styles/tune-v2.css';

  interface Props {
    /**
     * Identifiant de la playlist intelligente à MODIFIER, ou `null` pour en
     * créer une. On prend l'identifiant, pas l'objet : la grille de l'écran
     * Playlists ne porte qu'un nom et des pochettes, jamais les règles.
     */
    id?: number | null;
    onClose: () => void;
    onSaved: () => void;
  }
  let { id = null, onClose, onSaved }: Props = $props();

  let chargement = $state(id != null);
  let nom = $state('');
  let description = $state('');
  let mode = $state('all');
  let triPar = $state('title');
  let ordre = $state('asc');
  let maximum = $state(200);
  let regles = $state<RegleSmartPlaylist[]>([regleNeuve()]);

  const TRIS: readonly { value: string; key: string }[] = [
    { value: 'title', key: 'common.title' },
    { value: 'artist', key: 'common.artist' },
    { value: 'album', key: 'common.album' },
    { value: 'year', key: 'smartPlaylists.fieldYear' },
    { value: 'duration', key: 'smartPlaylists.sortDuration' },
    { value: 'random', key: 'smartPlaylists.sortRandom' },
  ];

  $effect(() => {
    if (id == null) return;
    api
      .getSmartPlaylist(id)
      .then((sp: any) => {
        nom = sp?.name ?? '';
        description = sp?.description ?? '';
        mode = (sp?.match_mode ?? 'all').replace(/"/g, '');
        triPar = sp?.sort_by ?? 'title';
        ordre = sp?.sort_order ?? 'asc';
        maximum = sp?.max_tracks ?? 200;
        const lues = lireRegles(sp?.rules);
        regles = lues.length ? lues : [regleNeuve()];
      })
      .catch(() => {
        // Règles illisibles ou serveur muet : on reste sur un formulaire
        // plutôt qu'un écran mort. Rien n'est perdu tant qu'on n'enregistre
        // pas.
      })
      .finally(() => {
        chargement = false;
      });
  });

  /** Les statuts des services, pour la liste d'une règle « Source » (#4299). */
  let statutsServices = $state<Record<string, any>>({});
  onMount(() => {
    void statutsStreaming($streamingServices, api.getStreamingServices, (x) => streamingServices.set(x))
      .then((s) => { statutsServices = s; });
  });

  /**
   * Les quatre listes qui alimentent les sélecteurs de référence. Chargées une
   * fois, en parallèle, et chacune tolère l'échec : un serveur sans playlists
   * intelligentes ne doit pas priver des trois autres.
   */
  let refs = $state<{ collections: any[]; smartCollections: any[]; playlists: any[]; smartPlaylists: any[] }>(
    { collections: [], smartCollections: [], playlists: [], smartPlaylists: [] },
  );
  $effect(() => {
    const moi = id;
    Promise.all([
      api.getCollections().catch(() => []),
      api.listSmartCollections().catch(() => []),
      api.getPlaylists(500).catch(() => []),
      api.getSmartPlaylists().catch(() => []),
    ]).then(([c, sc, p, sp]) => {
      refs = {
        collections: c ?? [],
        smartCollections: sc ?? [],
        playlists: p ?? [],
        // Une règle qui se référence elle-même est refusée par le serveur :
        // la proposer serait promettre une chose impossible.
        smartPlaylists: (sp ?? []).filter((x: any) => x.id !== moi),
      };
    });
  });

  function ajouter() {
    regles = [...regles, regleNeuve()];
  }
  function retirer(i: number) {
    regles = regles.filter((_, k) => k !== i);
  }
  function changerChamp(i: number, champ: string) {
    // Changer de famille de champ invalide l'opérateur et la valeur : on
    // repart sur le premier opérateur valide.
    const op = operateursDe(champ)[0]?.value ?? 'contains';
    regles = regles.map((r, k) => (k === i ? { field: champ, operator: op, value: '' } : r));
  }
  function changerOp(i: number, op: string) {
    regles = regles.map((r, k) => (k === i ? { ...r, operator: op } : r));
  }
  function changerValeur(i: number, v: string) {
    regles = regles.map((r, k) => (k === i ? { ...r, value: v } : r));
  }

  // La validation de l'ancien écran, mot pour mot : un nom, rien de plus.
  const pretAEnregistrer = $derived(!chargement && nom.trim().length > 0);

  let travail = $state(false);
  async function enregistrer() {
    if (!pretAEnregistrer || travail) return;
    travail = true;
    try {
      const charge = {
        name: nom.trim(),
        description: description.trim() || undefined,
        rules: reglesPourServeur(regles),
        match_mode: mode,
        sort_by: triPar,
        sort_order: ordre,
        max_tracks: maximum,
      };
      if (id != null) {
        await api.updateSmartPlaylist(id, charge);
        notifications.success($t('smartPlaylists.updated').replace('{name}', charge.name));
      } else {
        await api.createSmartPlaylist(charge);
        notifications.success($t('smartPlaylists.created').replace('{name}', charge.name));
      }
      onSaved();
      onClose();
    } catch (e: any) {
      // apiError range le corps `error` du serveur dans e.code (par exemple le
      // message de référence circulaire) : le préférer au statut HTTP brut.
      notifications.error(e?.code || errText(e) || $t('common.error' as any));
    }
    travail = false;
  }
</script>

<div class="v2-spl tune-v2">
  <div class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.pl.tabSmart' as any)}</div>
      <h1>{id != null ? $t('v2.spl.editTitle' as any) : $t('v2.spl.newTitle' as any)}</h1>
    </div>
    <button class="fermer" onclick={onClose} aria-label={$t('common.close' as any)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  </div>

  <div class="corps">
    <label class="champ">
      <span>{$t('v2.smart.name' as any)}</span>
      <input class="txt" bind:value={nom} placeholder={$t('smartPlaylists.namePlaceholder')} />
    </label>
    <label class="champ">
      <span>{$t('v2.smart.description' as any)}</span>
      <input class="txt" bind:value={description} placeholder={$t('smartPlaylists.descPlaceholder')} />
    </label>

    <div class="mode">
      <span class="lbl">{$t('v2.smart.match' as any)}</span>
      <button class="pill" class:on={mode === 'all'} onclick={() => (mode = 'all')}>{$t('smartPlaylists.matchAll')}</button>
      <button class="pill" class:on={mode === 'any'} onclick={() => (mode = 'any')}>{$t('smartPlaylists.matchAny')}</button>
    </div>

    <div class="regles">
      <span class="lbl">{$t('smartPlaylists.rules')}</span>
      {#each regles as r, i (i)}
        <div class="regle">
          <select class="sel" value={r.field} onchange={(e) => changerChamp(i, e.currentTarget.value)}>
            {#each CHAMPS as c (c.value)}
              <option value={c.value}>{$t(c.key as any)}</option>
            {/each}
          </select>

          <select class="sel op" value={r.operator} onchange={(e) => changerOp(i, e.currentTarget.value)}>
            {#each operateursDe(r.field) as o (o.value)}
              <option value={o.value}>{o.key ? $t(o.key as any) : o.label}</option>
            {/each}
          </select>

          {#if r.field === 'in_collection'}
            <select class="sel" value={r.value ?? ''} onchange={(e) => changerValeur(i, e.currentTarget.value)}>
              <option value="" disabled>{$t('smartCollection.refPick')}</option>
              <optgroup label={$t('smartCollection.groupCollections')}>
                {#each refs.collections as c (c.id)}<option value={`classic:${c.id}`}>{c.name}</option>{/each}
              </optgroup>
              <optgroup label={$t('smartCollection.groupSmartCollections')}>
                {#each refs.smartCollections as c (c.id)}<option value={`smart:${c.id}`}>{c.name}</option>{/each}
              </optgroup>
            </select>
          {:else if r.field === 'in_playlist'}
            <select class="sel" value={r.value ?? ''} onchange={(e) => changerValeur(i, e.currentTarget.value)}>
              <option value="" disabled>{$t('smartCollection.refPick')}</option>
              <optgroup label={$t('smartCollection.groupPlaylists')}>
                {#each refs.playlists as p (p.id)}<option value={`classic:${p.id}`}>{p.name}</option>{/each}
              </optgroup>
              <optgroup label={$t('smartCollection.groupSmartPlaylists')}>
                {#each refs.smartPlaylists as p (p.id)}<option value={`smart:${p.id}`}>{p.name}</option>{/each}
              </optgroup>
            </select>
          {:else if r.field === 'favorite'}
            <!-- La valeur d'un FAVORI est sa SORTE, pas un oui/non : ce sont
                 les trois sortes que `smart_refs` connaît. -->
            <select class="sel" value={r.value ?? ''} onchange={(e) => changerValeur(i, e.currentTarget.value)}>
              <option value="" disabled>{$t('smartCollection.refPick')}</option>
              <option value="track">{$t('smartCollection.favTrack')}</option>
              <option value="album">{$t('smartCollection.favAlbum')}</option>
              <option value="artist">{$t('smartCollection.favArtist')}</option>
            </select>
          {:else if r.field === 'source'}
            <select class="sel" value={r.value ?? ''} onchange={(e) => changerValeur(i, e.currentTarget.value)}>
              <option value="" disabled>{$t('smartCollection.refPick')}</option>
              {#each sourcesDisponibles(statutsServices, r.value) as s (s)}
                <option value={s}>{libelleSource(s, $t('v2.lib.sourceLocal' as any))}</option>
              {/each}
            </select>
          {:else}
            <input class="txt" value={r.value ?? ''} placeholder={$t('smartPlaylists.valuePlaceholder')}
              oninput={(e) => changerValeur(i, e.currentTarget.value)} />
          {/if}

          <button class="rm" onclick={() => retirer(i)}
            aria-label={$t('v2.smart.removeRule' as any)} title={$t('v2.smart.removeRule' as any)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>
          </button>
        </div>
      {/each}
      <button class="lnk" onclick={ajouter}>+ {$t('v2.smart.addRule' as any)}</button>
    </div>

    <div class="options">
      <label class="champ">
        <span>{$t('smartPlaylists.sort')}</span>
        <select class="sel" bind:value={triPar}>
          {#each TRIS as s (s.value)}<option value={s.value}>{$t(s.key as any)}</option>{/each}
        </select>
      </label>
      <label class="champ">
        <span>{$t('smartPlaylists.order')}</span>
        <select class="sel" bind:value={ordre}>
          <option value="asc">{$t('smartPlaylists.asc')}</option>
          <option value="desc">{$t('smartPlaylists.desc')}</option>
        </select>
      </label>
      <label class="champ">
        <span>{$t('smartPlaylists.max')}</span>
        <input class="txt num" type="number" min="1" max="1000" bind:value={maximum} />
      </label>
    </div>
  </div>

  <div class="pied">
    <button class="ghost" onclick={onClose}>{$t('common.cancel' as any)}</button>
    <button class="play" onclick={enregistrer} disabled={!pretAEnregistrer || travail}>
      {$t('v2.smart.save' as any)}
    </button>
  </div>
</div>

<style>
  .v2-spl{position:absolute; inset:0; z-index:40; display:flex; flex-direction:column;
    background:var(--v2-bg); color:var(--v2-txt); font-family:var(--v2-sans); overflow:hidden}
  .fermer{margin-left:auto; width:36px; height:36px; border-radius:10px; cursor:pointer;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt2);
    display:grid; place-items:center}
  .fermer:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .fermer svg{width:16px; height:16px}

  .corps{flex:1; min-height:0; overflow-y:auto; padding:6px 30px 20px; display:flex;
    flex-direction:column; gap:16px; max-width:900px}
  .champ{display:flex; flex-direction:column; gap:6px}
  .champ > span{font:600 11px var(--v2-mono); letter-spacing:.12em; text-transform:uppercase; color:var(--v2-txt3)}
  .txt{height:38px; border-radius:10px; border:1px solid var(--v2-line2); background:var(--v2-surface2);
    color:var(--v2-txt); font:14px var(--v2-sans); padding:0 12px; outline:none; min-width:0}
  .txt:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .txt.num{max-width:140px}

  .mode{display:flex; align-items:center; gap:9px; flex-wrap:wrap}
  .lbl{font:600 11px var(--v2-mono); letter-spacing:.12em; text-transform:uppercase; color:var(--v2-txt3)}
  .pill{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt3); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:6px 14px; font:600 12px var(--v2-sans)}
  .pill.on{color:var(--v2-acc-tint); border-color:var(--v2-acc2); background:var(--v2-acc-soft)}

  .regles{display:flex; flex-direction:column; gap:8px}
  .regle{display:grid; grid-template-columns:1fr auto 1fr auto; align-items:center; gap:8px}
  .sel{height:38px; border-radius:10px; border:1px solid var(--v2-line2); background:var(--v2-surface2);
    color:var(--v2-txt); font:13px var(--v2-sans); padding:0 10px; outline:none; min-width:0}
  .sel.op{min-width:120px}
  .rm{width:34px; height:34px; border-radius:9px; border:1px solid transparent; background:transparent;
    color:var(--v2-txt3); cursor:pointer; display:grid; place-items:center}
  .rm:hover{color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .rm svg{width:15px; height:15px}
  .lnk{align-self:flex-start; border:1px dashed var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; border-radius:var(--v2-r-pill); padding:7px 14px;
    font:600 12px var(--v2-sans)}
  .lnk:hover{color:var(--v2-acc-tint); border-color:var(--v2-acc2)}

  .options{display:flex; gap:16px; flex-wrap:wrap}

  .pied{display:flex; justify-content:flex-end; gap:12px; padding:14px 30px 22px;
    border-top:1px solid var(--v2-line)}
  .ghost,.play{height:42px; padding:0 20px; border-radius:var(--v2-r-pill); font:700 14px var(--v2-sans); cursor:pointer}
  .ghost{color:var(--v2-txt); background:transparent; border:1px solid var(--v2-line2)}
  .ghost:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .play{color:var(--v2-on-acc); border:0; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .play:disabled{opacity:.45; cursor:default}
</style>
