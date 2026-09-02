<script lang="ts">
  /**
   * Écran des raccourcis, au thème du nouveau client.
   *
   * La coquille montait jusqu'ici `ShortcutsView`, l'écran du client actuel :
   * il fonctionnait, mais détonnait — palette, typographie et formes de
   * l'ancienne interface au milieu de la nouvelle. C'était la DERNIÈRE vue
   * dans ce cas, et je l'avais signalée deux fois sans la traiter.
   *
   * ## Ce qu'il fait, et pourquoi ces gestes-là
   *
   * La barre latérale n'en montre que CINQ, les épinglés d'abord. C'est ici
   * qu'on décide lesquels : épingler, renommer, changer d'icône, réordonner,
   * supprimer. Sans cet écran, un sixième raccourci serait invisible et
   * inatteignable.
   *
   * Le réordonnancement se fait au glisser-déposer, comme sur la page
   * d'accueil — deux écrans qui rangent des listes doivent se manipuler de la
   * même façon —, avec les flèches au clavier pour qui n'utilise pas de souris.
   */
  import { onMount } from 'svelte';
  import {
    shortcuts,
    loadShortcuts,
    removeShortcut,
    updateShortcut,
    togglePin,
    reorderShortcuts,
    navigateToShortcut,
    type Shortcut,
  } from '../../lib/stores/shortcuts';
  import { t } from '../../lib/i18n';
  import { dialogs } from '../../lib/stores/dialogs';
  import { notifications } from '../../lib/stores/notifications';
  import '../../styles/tune-v2.css';

  /** Les mêmes que l'écran actuel : on ne change pas le vocabulaire d'icônes. */
  const ICONES = ['⭐','📚','🎵','🎧','📻','💎','🎸','🎹','🎷','🎺','🎻','🎤','💿','🔊','❤️','🏠','🎶','🌍','🇫🇷','🎬','🕺','🆕','🔥','💯'];

  /** Les ÉPINGLÉS d'abord — c'est l'ordre que la barre latérale applique. */
  const ranges = $derived(
    [...$shortcuts].sort((a, b) => Number(b.pinned !== false) - Number(a.pinned !== false)),
  );

  let edite = $state<string | null>(null);
  let nom = $state('');
  let icone = $state('⭐');
  let travail = $state(false);

  function ouvrirEdition(sc: Shortcut) {
    edite = sc.id;
    nom = sc.name;
    icone = sc.icon || '⭐';
  }

  async function enregistrer() {
    if (!edite || !nom.trim() || travail) return;
    travail = true;
    try {
      await updateShortcut(edite, { name: nom.trim(), icon: icone });
      edite = null;
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
    travail = false;
  }

  async function supprimer(sc: Shortcut) {
    // Irréversible : on DEMANDE. Pas de `window.confirm` — les dialogues
    // natifs sont bannis dans les vues embarquées.
    if (!(await dialogs.confirm($t('v2.sc.deleteAsk' as any).replace('{name}', sc.name), { danger: true })))
      return;
    try {
      await removeShortcut(sc.id);
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
  }

  // ── Réordonnancement ─────────────────────────────────────────────────────
  let saisi = $state<number | null>(null);
  let survole = $state<number | null>(null);

  async function deplacer(de: number, vers: number) {
    if (de === vers || vers < 0 || vers >= ranges.length) return;
    const copie = [...ranges];
    const [x] = copie.splice(de, 1);
    copie.splice(vers, 0, x);
    try {
      // `reorderShortcuts` attend les OBJETS dans l'ordre voulu, pas leurs
      // identifiants : elle remplace le magasin tel quel.
      await reorderShortcuts(copie);
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
  }

  function deposer(cible: number) {
    const src = saisi;
    saisi = null;
    survole = null;
    if (src != null) void deplacer(src, cible);
  }

  function auClavier(e: KeyboardEvent, i: number) {
    const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    void deplacer(i, i + d);
  }

  onMount(() => {
    void loadShortcuts();
  });
</script>

<section class="v2-sc tune-v2">
  <header class="top">
    <div class="eyebrow">{$t('v2.sc.eyebrow' as any)}</div>
    <h1>{$t('v2.nav.shortcuts' as any)}</h1>
    <!-- On DIT la règle de la barre : sans cela, un utilisateur qui a huit
         raccourcis ne comprend pas pourquoi trois n'y figurent pas. -->
    <p class="sub">{$t('v2.sc.hint' as any)}</p>
  </header>

  <div class="scroll">
    {#if !ranges.length}
      <div class="etat">{$t('v2.sc.empty' as any)}</div>
    {:else}
      <ul class="liste">
        {#each ranges as sc, i (sc.id)}
          <li
            class="ligne"
            class:cible={survole === i && saisi !== null && saisi !== i}
            class:epingle={sc.pinned !== false}
            ondragover={(e) => { if (saisi !== null) { e.preventDefault(); survole = i; } }}
            ondrop={(e) => { e.preventDefault(); deposer(i); }}
          >
            <span
              class="poignee"
              role="button"
              tabindex="0"
              draggable="true"
              aria-label={$t('v2.home.move' as any)}
              ondragstart={() => (saisi = i)}
              ondragend={() => { saisi = null; survole = null; }}
              onkeydown={(e) => auClavier(e, i)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8h16M4 16h16"/></svg>
            </span>

            {#if edite === sc.id}
              <form class="edition" onsubmit={(e) => { e.preventDefault(); void enregistrer(); }}>
                <div class="icones">
                  {#each ICONES as ic (ic)}
                    <button type="button" class="ic" class:on={icone === ic} onclick={() => (icone = ic)}>{ic}</button>
                  {/each}
                </div>
                <div class="ligne-edit">
                  <!-- svelte-ignore a11y_autofocus -->
                  <input bind:value={nom} autofocus
                    onkeydown={(e) => { if (e.key === 'Escape') edite = null; }} />
                  <button type="button" class="btn" onclick={() => (edite = null)}>{$t('common.cancel' as any)}</button>
                  <button type="submit" class="btn pri" disabled={travail || !nom.trim()}>{$t('common.save' as any)}</button>
                </div>
              </form>
            {:else}
              <button class="ouvrir" onclick={() => navigateToShortcut(sc)}>
                <span class="emo">{sc.icon}</span>
                <span class="nm">{sc.name}</span>
                {#if sc.pinned !== false}<span class="tag">{$t('v2.sc.pinned' as any)}</span>{/if}
              </button>

              <div class="actions">
                <button class="act" onclick={() => togglePin(sc.id)}
                  title={sc.pinned !== false ? $t('v2.sc.unpin' as any) : $t('v2.sc.pin' as any)}
                  aria-label={sc.pinned !== false ? $t('v2.sc.unpin' as any) : $t('v2.sc.pin' as any)}>
                  <svg viewBox="0 0 24 24" fill={sc.pinned !== false ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                </button>
                <button class="act" onclick={() => ouvrirEdition(sc)} aria-label={$t('v2.cover.edit' as any)} title={$t('v2.cover.edit' as any)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l4 4"/></svg>
                </button>
                <button class="act danger" onclick={() => supprimer(sc)} aria-label={$t('v2.sc.delete' as any)} title={$t('v2.sc.delete' as any)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
  .v2-sc{display:flex; flex-direction:column; height:100%; min-width:0; background:var(--v2-bg);
    color:var(--v2-txt); font-family:var(--v2-sans); overflow:hidden}
  .top{padding:24px 30px 12px; padding-right:130px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .sub{color:var(--v2-txt2); font-size:13px; margin-top:6px; max-width:64ch}
  .scroll{flex:1; min-width:0; overflow-y:auto; padding:8px 30px 40px}
  .etat{padding:26px 0; color:var(--v2-txt3); font-size:13.5px}

  .liste{list-style:none; display:flex; flex-direction:column; gap:6px; max-width:760px}
  .ligne{display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:var(--v2-r-card);
    background:var(--v2-surface); border:1px solid var(--v2-line2); border-top-color:var(--v2-line2)}
  /* La cible de dépôt se voit : sans repère, on lâche à l'aveugle. */
  .ligne.cible{border-top-color:var(--v2-acc1)}
  /* Épinglé = ce que la barre latérale montre. Le dire ici évite d'avoir à
     aller vérifier ailleurs. */
  .ligne.epingle{border-left:2px solid var(--v2-acc1)}

  .poignee{display:grid; place-items:center; width:24px; height:24px; border-radius:6px; cursor:grab;
    color:var(--v2-txt3); background:var(--v2-surface2); flex:none}
  .poignee:hover{color:var(--v2-txt)}
  .poignee:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:2px}
  .poignee svg{width:14px; height:14px}

  .ouvrir{flex:1; min-width:0; display:flex; align-items:center; gap:10px; border:0; background:transparent;
    color:inherit; cursor:pointer; text-align:left; padding:0; font:inherit}
  .emo{font-size:16px; line-height:1; width:22px; text-align:center; flex:none}
  .nm{font:600 13.5px var(--v2-sans); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .tag{font:9.5px var(--v2-mono); letter-spacing:.06em; text-transform:uppercase; color:var(--v2-acc1);
    border:1px solid var(--v2-acc1); border-radius:var(--v2-r-pill); padding:1px 7px; flex:none}

  .actions{display:flex; gap:4px; flex:none}
  .act{width:28px; height:28px; border:0; border-radius:8px; background:transparent; color:var(--v2-txt3);
    display:grid; place-items:center; cursor:pointer}
  .act:hover{color:var(--v2-txt); background:var(--v2-hover)}
  .act.danger:hover{color:var(--v2-danger)}
  .act svg{width:15px; height:15px}

  .edition{flex:1; min-width:0; display:flex; flex-direction:column; gap:8px}
  .icones{display:flex; flex-wrap:wrap; gap:3px}
  .ic{width:26px; height:26px; border:1px solid transparent; border-radius:7px; background:transparent;
    font-size:14px; line-height:1; cursor:pointer}
  .ic:hover{background:var(--v2-hover)}
  .ic.on{border-color:var(--v2-acc1); background:var(--v2-hover)}
  .ligne-edit{display:flex; gap:6px}
  .ligne-edit input{flex:1; min-width:0; background:var(--v2-bg); border:1px solid var(--v2-line2);
    border-radius:8px; color:var(--v2-txt); font:inherit; font-size:13px; padding:7px 9px}
  .btn{border:1px solid var(--v2-line2); border-radius:8px; background:transparent; color:var(--v2-txt2);
    font:600 12.5px var(--v2-sans); padding:7px 12px; cursor:pointer}
  .btn:hover{color:var(--v2-txt)}
  .btn.pri{border-color:transparent; background:var(--v2-acc1); color:var(--v2-on-acc)}
  .btn.pri:disabled{opacity:.5; cursor:default}
</style>
