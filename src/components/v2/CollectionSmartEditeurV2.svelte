<script lang="ts">
  /**
   * Créer ou modifier une COLLECTION INTELLIGENTE.
   *
   * Bertrand, 05/09/2026 : « et comment ajouter une smart collection ? ». On ne
   * pouvait pas : l'écran Collections savait créer une collection MANUELLE —
   * un nom, une description — mais `createSmartCollection` exige des RÈGLES,
   * donc un éditeur. Il a choisi de l'écrire aux couleurs du nouveau client
   * plutôt que de monter celui de l'ancien.
   *
   * La grammaire vient de `lib/smartRegles`, partagée avec l'éditeur du client
   * actuel : vingt-deux champs et huit familles d'opérateurs recopiés auraient
   * divergé à la première addition, et le serveur n'en accepte qu'un.
   *
   * ## L'aperçu, pas la promesse
   *
   * Une règle mal posée ne se voit qu'à l'usage : « année > 2020 » sur une
   * discothèque de jazz peut ne rien rendre du tout. L'éditeur interroge donc
   * `/smart-collections/preview` à chaque changement et ANNONCE le nombre
   * d'albums retenus. On n'enregistre pas à l'aveugle.
   *
   * ## Les RÉFÉRENCES
   *
   * « Dans la collection X », « dans la playlist Y », « en favori » — demandé
   * par Bertrand le 05/09/2026. Ce ne sont pas des champs de texte : la valeur
   * est `classic:<id>` ou `smart:<id>` (module serveur `smart_refs`), et une
   * saisie libre y produirait des règles que le serveur refuse APRÈS coup.
   * Chacune a donc son sélecteur, alimenté par les quatre listes réelles.
   *
   * ⚠️ La collection en cours d'édition est ÉCARTÉE de la liste des
   * intelligentes : une règle qui se référence elle-même est refusée côté
   * serveur, et la proposer serait promettre une chose impossible.
   *
   * ## Ce que cet éditeur ne fait toujours pas
   *
   * Le champ `credit` (rôle + nom) demande un contrôle à deux valeurs. Il
   * reste dans la grammaire — une collection qui l'utilise s'ouvre et
   * s'enregistre sans le perdre — mais on ne peut pas en créer ici.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import {
    CHAMPS, operateursDe, typeDuChamp, sansValeur, regleComplete, valeurInitiale,
    type TypeChamp,
  } from '../../lib/smartRegles';
  import type { SmartRule } from '../../lib/types';
  import '../../styles/tune-v2.css';

  interface Props {
    /**
     * Identifiant d'une collection à MODIFIER, ou `null` pour en créer une.
     *
     * On prend un identifiant, pas un objet : l'écran Collections ne porte
     * qu'une forme normalisée — nom, nombre d'albums, pochettes — sans les
     * règles ni le mode. L'éditeur va donc chercher ce dont il a besoin, au
     * lieu d'obliger l'appelant à le savoir.
     */
    id?: number | null;
    onClose: () => void;
    onSaved: () => void;
  }
  let { id = null, onClose, onSaved }: Props = $props();

  let collection = $state<any | null>(null);
  let chargement = $state(id != null);

  $effect(() => {
    if (id == null) return;
    api.getSmartCollection(id)
      .then((c) => {
        collection = c;
        nom = c?.name ?? '';
        description = c?.description ?? '';
        mode = (c?.match_mode as 'all' | 'any') ?? 'all';
        regles = lireRegles();
      })
      .catch(() => { /* on reste sur un formulaire vide plutot qu'un ecran mort */ })
      .finally(() => { chargement = false; });
  });

  /** Les champs que CET éditeur sait saisir. Voir l'en-tête. */
  const SAISISSABLES: TypeChamp[] = [
    'text', 'int', 'nullable', 'timestamp', 'count', 'favorite',
    'collection_ref', 'playlist_ref',
  ];

  /**
   * Les quatre listes qui alimentent les sélecteurs de référence.
   *
   * Chargées une fois, en parallèle, et chacune tolère l'échec : un serveur
   * sans playlists intelligentes ne doit pas priver des trois autres.
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
        // Une règle qui se référence elle-même est refusée par le serveur.
        smartCollections: (sc ?? []).filter((x: any) => x.id !== moi),
        playlists: p ?? [],
        smartPlaylists: sp ?? [],
      };
    });
  });
  const champsOfferts = $derived(
    [...CHAMPS.filter((c) => SAISISSABLES.includes(c.type))]
      .sort((a, b) => $t(a.labelKey as any).localeCompare($t(b.labelKey as any))),
  );

  let nom = $state('');
  let description = $state('');
  let mode = $state<'all' | 'any'>('all');
  let regles = $state<SmartRule[]>([{ field: 'artist_name', op: 'contains', value: '' }]);

  /** Les règles arrivent en JSON encodé — c'est la forme que le serveur stocke. */
  function lireRegles(): SmartRule[] {
    if (!collection?.rules) return [{ field: 'artist_name', op: 'contains', value: '' }];
    try {
      const r = typeof collection.rules === 'string' ? JSON.parse(collection.rules) : collection.rules;
      return Array.isArray(r) && r.length ? r : [{ field: 'artist_name', op: 'contains', value: '' }];
    } catch {
      // Règles illisibles : on repart d'une règle vide plutôt que d'un écran
      // mort. L'ancienne valeur n'est pas perdue tant qu'on n'enregistre pas.
      return [{ field: 'artist_name', op: 'contains', value: '' }];
    }
  }

  function ajouter() {
    regles = [...regles, { field: 'artist_name', op: 'contains', value: '' }];
  }
  function retirer(i: number) {
    // Jamais zéro règle : une collection intelligente sans règle retiendrait
    // toute la bibliothèque, ce que personne ne demande sciemment.
    if (regles.length <= 1) return;
    regles = regles.filter((_, k) => k !== i);
  }
  function changerChamp(i: number, champ: string) {
    const type = typeDuChamp(champ);
    const op = operateursDe(champ)[0]?.value ?? '=';
    regles = regles.map((r, k) => (k === i ? { field: champ, op, value: valeurInitiale(op, type) } : r));
  }
  function changerOp(i: number, op: string) {
    regles = regles.map((r, k) =>
      k === i ? { ...r, op, value: valeurInitiale(op, typeDuChamp(r.field)) } : r);
  }
  function changerValeur(i: number, v: any) {
    regles = regles.map((r, k) => (k === i ? { ...r, value: v } : r));
  }
  function changerBorne(i: number, rang: 0 | 1, v: any) {
    regles = regles.map((r, k) => {
      if (k !== i) return r;
      const paire = Array.isArray(r.value) ? [...r.value] : ['', ''];
      paire[rang] = v;
      return { ...r, value: paire };
    });
  }

  const completes = $derived(regles.filter(regleComplete));
  const pretAEnregistrer = $derived(!chargement && nom.trim().length > 0 && completes.length > 0);

  /* ---------------- Aperçu ---------------- */
  let apercu = $state<number | null>(null);
  let apercuEnCours = $state(false);
  let seq = 0;

  $effect(() => {
    const r = completes;
    const m = mode;
    if (!r.length) { apercu = null; return; }
    const mien = ++seq;
    apercuEnCours = true;
    // Débounce : on tape dans un champ de texte, pas la peine d'interroger le
    // serveur à chaque lettre.
    const minuteur = setTimeout(() => {
      // 🔴 AUCUN `max_limit`.
      //
      // Bertrand, 05/09/2026 : « un bug dans l'évaluation des albums » —
      // capture d'une règle qui annonçait « 1 albums correspondent ». C'était
      // moi : j'envoyais `max_limit: 1` pour alléger la réponse, or le serveur
      // calcule `total` comme la LONGUEUR de la liste rendue. Le compteur
      // disait donc « 1 » dès qu'au moins un album correspondait.
      //
      // Mesuré sur le .18, même règle (`year > 2000`) :
      //
      //     max_limit: 1     -> total = 1
      //     sans max_limit   -> total = 1853
      //     max_limit: 5000  -> total = 1853
      //
      // Le commentaire de `SmartCollectionPreview` le disait déjà, mot pour
      // mot. Il n'y a pas de route qui ne rende que le compte : la seule
      // réponse juste coûte la liste entière. Elle est débouncée à 400 ms et
      // ne part que sur des règles complètes — c'est le prix d'un compteur qui
      // ne ment pas.
      api.previewSmartCollection({ rules: r, match_mode: m })
        .then((p) => { if (mien === seq) apercu = p?.total ?? 0; })
        .catch(() => { if (mien === seq) apercu = null; })
        .finally(() => { if (mien === seq) apercuEnCours = false; });
    }, 400);
    return () => clearTimeout(minuteur);
  });

  let travail = $state(false);
  async function enregistrer() {
    if (!pretAEnregistrer || travail) return;
    travail = true;
    try {
      const charge = {
        name: nom.trim(),
        description: description.trim() || undefined,
        rules: completes,
        match_mode: mode,
      };
      if (id != null) await api.updateSmartCollection(id, charge);
      else await api.createSmartCollection(charge as any);
      notifications.success($t('v2.smart.saved' as any));
      onSaved();
      onClose();
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
    travail = false;
  }
</script>

<div class="v2-smart tune-v2">
  <div class="entete">
    <div>
      <div class="eyebrow">{$t('v2.col.smart' as any)}</div>
      <h1>{id != null ? $t('v2.smart.editTitle' as any) : $t('v2.smart.newTitle' as any)}</h1>
    </div>
    <button class="fermer" onclick={onClose} aria-label={$t('common.close' as any)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  </div>

  <div class="corps">
    <label class="champ">
      <span>{$t('v2.smart.name' as any)}</span>
      <input class="txt" bind:value={nom} placeholder={$t('v2.smart.namePlaceholder' as any)} />
    </label>
    <label class="champ">
      <span>{$t('v2.smart.description' as any)}</span>
      <input class="txt" bind:value={description} />
    </label>

    <div class="mode">
      <span class="lbl">{$t('v2.smart.match' as any)}</span>
      <button class="pill" class:on={mode === 'all'} onclick={() => (mode = 'all')}>{$t('v2.smart.matchAll' as any)}</button>
      <button class="pill" class:on={mode === 'any'} onclick={() => (mode = 'any')}>{$t('v2.smart.matchAny' as any)}</button>
    </div>

    <div class="regles">
      {#each regles as r, i (i)}
        {@const type = typeDuChamp(r.field)}
        <div class="regle">
          <select class="sel" value={r.field} onchange={(e) => changerChamp(i, e.currentTarget.value)}>
            {#each champsOfferts as c (c.value)}
              <option value={c.value}>{$t(c.labelKey as any)}</option>
            {/each}
          </select>

          <select class="sel op" value={r.op} onchange={(e) => changerOp(i, e.currentTarget.value)}>
            {#each operateursDe(r.field) as o (o.value)}
              <option value={o.value}>{o.label ?? $t(o.labelKey as any)}</option>
            {/each}
          </select>

          {#if sansValeur(r.op)}
            <span class="rien">—</span>
          {:else if r.op === 'between'}
            <span class="paire">
              <input class="txt" type={type === 'timestamp' ? 'date' : 'number'}
                value={Array.isArray(r.value) ? r.value[0] : ''}
                oninput={(e) => changerBorne(i, 0, e.currentTarget.value)} />
              <em>{$t('v2.smart.and' as any)}</em>
              <input class="txt" type={type === 'timestamp' ? 'date' : 'number'}
                value={Array.isArray(r.value) ? r.value[1] : ''}
                oninput={(e) => changerBorne(i, 1, e.currentTarget.value)} />
            </span>
          {:else if type === 'collection_ref'}
            <select class="sel" value={r.value ?? ''} onchange={(e) => changerValeur(i, e.currentTarget.value)}>
              <option value="" disabled>{$t('smartCollection.refPick')}</option>
              <optgroup label={$t('smartCollection.groupCollections')}>
                {#each refs.collections as c (c.id)}<option value={`classic:${c.id}`}>{c.name}</option>{/each}
              </optgroup>
              <optgroup label={$t('smartCollection.groupSmartCollections')}>
                {#each refs.smartCollections as c (c.id)}<option value={`smart:${c.id}`}>{c.name}</option>{/each}
              </optgroup>
            </select>
          {:else if type === 'playlist_ref'}
            <select class="sel" value={r.value ?? ''} onchange={(e) => changerValeur(i, e.currentTarget.value)}>
              <option value="" disabled>{$t('smartCollection.refPick')}</option>
              <optgroup label={$t('smartCollection.groupPlaylists')}>
                {#each refs.playlists as p (p.id)}<option value={`classic:${p.id}`}>{p.name}</option>{/each}
              </optgroup>
              <optgroup label={$t('smartCollection.groupSmartPlaylists')}>
                {#each refs.smartPlaylists as p (p.id)}<option value={`smart:${p.id}`}>{p.name}</option>{/each}
              </optgroup>
            </select>
          {:else if type === 'favorite'}
            <select class="sel" value={String(r.value)} onchange={(e) => changerValeur(i, e.currentTarget.value === 'true')}>
              <option value="true">{$t('v2.smart.yes' as any)}</option>
              <option value="false">{$t('v2.smart.no' as any)}</option>
            </select>
          {:else}
            <input class="txt"
              type={type === 'int' || type === 'count' ? 'number' : type === 'timestamp' ? 'date' : 'text'}
              value={r.value ?? ''}
              oninput={(e) => changerValeur(i, type === 'int' || type === 'count'
                ? Number(e.currentTarget.value) : e.currentTarget.value)} />
          {/if}

          <button class="rm" onclick={() => retirer(i)} disabled={regles.length <= 1}
            aria-label={$t('v2.smart.removeRule' as any)} title={$t('v2.smart.removeRule' as any)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>
          </button>
        </div>
      {/each}
      <button class="lnk" onclick={ajouter}>+ {$t('v2.smart.addRule' as any)}</button>
    </div>

    <!-- L'APERÇU : une règle mal posée ne se voit qu'à l'usage. On annonce ce
         qu'elle retient avant d'enregistrer. -->
    <div class="apercu" class:vide={apercu === 0}>
      {#if apercuEnCours}
        {$t('v2.smart.previewing' as any)}
      {:else if apercu == null}
        {$t('v2.smart.previewNone' as any)}
      {:else}
        <!-- Le singulier a sa phrase : « 1 albums correspondent » se lit comme
             une erreur, et l'etait effectivement il y a cinq minutes. -->
        {$t((apercu === 1 ? 'v2.smart.previewOne' : 'v2.smart.previewCount') as any).replace('{n}', String(apercu))}
      {/if}
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
  .v2-smart{position:absolute; inset:0; z-index:40; display:flex; flex-direction:column;
    background:var(--v2-bg); color:var(--v2-txt); font-family:var(--v2-sans); overflow:hidden}
  .entete{display:flex; align-items:flex-start; gap:20px; padding:24px 30px 12px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .entete h1{font-size:26px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
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

  .mode{display:flex; align-items:center; gap:9px}
  .lbl{font:600 11px var(--v2-mono); letter-spacing:.12em; text-transform:uppercase; color:var(--v2-txt3)}
  .pill{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt3); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:6px 14px; font:600 12px var(--v2-sans)}
  .pill.on{color:var(--v2-acc-tint); border-color:var(--v2-acc2); background:var(--v2-acc-soft)}

  .regles{display:flex; flex-direction:column; gap:8px}
  .regle{display:grid; grid-template-columns:1fr auto 1fr auto; align-items:center; gap:8px}
  .sel{height:38px; border-radius:10px; border:1px solid var(--v2-line2); background:var(--v2-surface2);
    color:var(--v2-txt); font:13px var(--v2-sans); padding:0 10px; outline:none; min-width:0}
  .sel.op{min-width:120px}
  .paire{display:flex; align-items:center; gap:8px; min-width:0}
  .paire em{font:11px var(--v2-mono); font-style:normal; color:var(--v2-txt3)}
  .rien{color:var(--v2-txt3); font:12px var(--v2-mono)}
  .rm{width:34px; height:34px; border-radius:9px; border:1px solid transparent; background:transparent;
    color:var(--v2-txt3); cursor:pointer; display:grid; place-items:center}
  .rm:hover:not(:disabled){color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .rm:disabled{opacity:.3; cursor:default}
  .rm svg{width:15px; height:15px}
  .lnk{align-self:flex-start; border:1px dashed var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; border-radius:var(--v2-r-pill); padding:7px 14px;
    font:600 12px var(--v2-sans)}
  .lnk:hover{color:var(--v2-acc-tint); border-color:var(--v2-acc2)}

  .apercu{align-self:flex-start; font:12px var(--v2-mono); color:var(--v2-acc-tint);
    border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); border-radius:var(--v2-r-pill);
    padding:7px 14px}
  /* Zéro album n'est pas une erreur, mais ça se dit autrement qu'un succès. */
  .apercu.vide{color:var(--v2-txt3); border-color:var(--v2-line2); background:transparent}

  .pied{display:flex; justify-content:flex-end; gap:12px; padding:14px 30px 22px;
    border-top:1px solid var(--v2-line)}
  .ghost,.play{height:42px; padding:0 20px; border-radius:var(--v2-r-pill); font:700 14px var(--v2-sans); cursor:pointer}
  .ghost{color:var(--v2-txt); background:transparent; border:1px solid var(--v2-line2)}
  .ghost:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .play{color:var(--v2-on-acc); border:0; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .play:disabled{opacity:.45; cursor:default}
</style>
