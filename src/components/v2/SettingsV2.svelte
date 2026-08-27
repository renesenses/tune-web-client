<script lang="ts">
  /**
   * Réglages du nouveau client (direction Levente).
   *
   * Structure réorganisée demandée par Bertrand (27/08) — voir lib/v2Settings,
   * qui en est la SOURCE UNIQUE, partagée avec la recherche du menu avatar.
   *
   * Densité par niveau : chaque onglet et chaque section porte un `min`. En
   * Essentiel on ne voit que l'ossature ; Avancé et Expert révèlent le reste,
   * sans jamais réorganiser ce qui était déjà là (stabilité spatiale).
   *
   * ÉTAT DU PORTAGE : l'ossature et la navigation sont en place ; le contenu
   * des sections est repris une à une depuis l'écran actuel (8 300 lignes).
   * Chaque section non encore reprise le dit explicitement et renvoie vers
   * l'écran actuel — jamais un cadre vide qui laisserait croire à un réglage
   * absent.
   */
  import { t } from '../../lib/i18n';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { followMe } from '../../lib/stores/zones';
  import { activeView } from '../../lib/stores/navigation';
  import { v2SettingsTarget } from '../../lib/stores/v2SettingsNav';
  import { V2_SETTINGS, type V2SettingsTabId } from '../../lib/v2Settings';
  import '../../styles/tune-v2.css';

  const level = $derived($preferences.settingsLevel);
  const tabs = $derived(V2_SETTINGS.filter((t2) => atLeast(level, t2.min)));

  let tabId = $state<V2SettingsTabId>('general');
  let highlight = $state<string | null>(null);

  // Cible venue de la recherche du menu avatar : consommée UNE fois, sinon un
  // retour ultérieur sur les Réglages rejouerait l'ancienne cible.
  $effect(() => {
    const target = $v2SettingsTarget;
    if (!target) return;
    tabId = target.tab;
    highlight = target.section ?? null;
    v2SettingsTarget.set(null);
  });

  const tab = $derived(tabs.find((x) => x.id === tabId) ?? tabs[0]);
  const sections = $derived((tab?.sections ?? []).filter((s) => atLeast(level, s.min)));
  const hiddenCount = $derived((tab?.sections.length ?? 0) - sections.length);

  function title(s: { titleKey?: string; title?: string; id: string }): string {
    return s.titleKey ? $t(s.titleKey as any) : (s.title ?? s.id);
  }
  function go(id: V2SettingsTabId) { tabId = id; highlight = null; }
</script>

<section class="v2-settings tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">Configuration</div>
      <h1>Réglages</h1>
    </div>
  </header>

  <div class="body">
    <nav class="rail" aria-label="Sections des réglages">
      {#each tabs as x (x.id)}
        <button class="rtab" class:on={x.id === tabId} onclick={() => go(x.id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d={x.icon} /></svg>
          <span>{x.label}</span>
        </button>
      {/each}
      {#if !atLeast(level, 'expert')}
        <div class="railnote">D'autres réglages apparaissent aux niveaux Avancé et Expert.</div>
      {/if}
    </nav>

    <div class="pane">
      {#if tab}
        <div class="panehead">
          <h2>{tab.label}</h2>
          {#if hiddenCount > 0}
            <span class="masked">{hiddenCount} section{hiddenCount > 1 ? 's' : ''} de plus à un niveau supérieur</span>
          {/if}
        </div>

        {#each sections as s (s.id)}
          <section class="card" class:hl={highlight === s.id}>
            <div class="cardhead">
              <h3>{title(s)}</h3>
              {#if s.from !== tab.id}<span class="moved">déplacé depuis « {s.from} »</span>{/if}
            </div>

            {#if s.id === 'followMe'}
              <!-- Section réellement portée : même store que l'écran actuel,
                   donc le réglage est partagé, pas dupliqué. -->
              <div class="row">
                <div class="lbl">
                  <span>{$t('settings.followMeLabel' as any)}</span>
                  <span class="hint">{$t('settings.followMeHint' as any)}</span>
                </div>
                <label class="sw">
                  <input type="checkbox" bind:checked={$followMe} />
                  <span class="slider"></span>
                </label>
              </div>
            {:else}
              <div class="todo">
                <span>Contenu repris depuis l'écran actuel — pas encore porté ici.</span>
                <button class="lnk" onclick={() => activeView.set('settings')}>Ouvrir dans l'écran actuel</button>
              </div>
            {/if}
          </section>
        {/each}

        {#if !sections.length}
          <div class="empty">Rien à ce niveau d'interface. Passez en Avancé ou Expert depuis le menu avatar.</div>
        {/if}
      {/if}
    </div>
  </div>
</section>

<style>
  .v2-settings{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .top{padding:24px 30px 12px; padding-right:96px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}

  .body{flex:1; min-height:0; display:grid; grid-template-columns:216px 1fr; gap:22px; padding:6px 30px 0}

  .rail{display:flex; flex-direction:column; gap:2px; overflow-y:auto; padding-bottom:30px}
  .rail::-webkit-scrollbar{width:8px}.rail::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .rtab{display:flex; align-items:center; gap:11px; padding:10px 12px; border:0; border-radius:10px; cursor:pointer;
    background:transparent; color:var(--v2-txt2); font:500 14px var(--v2-sans); text-align:left; transition:.15s}
  .rtab svg{width:18px; height:18px; flex:0 0 auto}
  .rtab:hover{color:var(--v2-txt); background:var(--v2-hover)}
  .rtab.on{color:var(--v2-txt); background:linear-gradient(90deg,var(--v2-active1),var(--v2-active2));
    box-shadow:inset 0 0 0 1px var(--v2-line2)}
  .rtab.on svg{color:var(--v2-acc1)}
  .railnote{margin-top:12px; padding:10px 12px; font-size:11px; line-height:1.4; color:var(--v2-txt3);
    border:1px dashed var(--v2-line2); border-radius:10px}

  .pane{overflow-y:auto; padding:0 4px 40px; display:flex; flex-direction:column; gap:14px}
  .pane::-webkit-scrollbar{width:9px}.pane::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .panehead{display:flex; align-items:baseline; gap:14px; padding:2px 0 4px}
  .panehead h2{font-size:20px; font-weight:700}
  .masked{font:11px var(--v2-mono); color:var(--v2-txt3)}

  .card{border:1px solid var(--v2-line); border-radius:14px; background:var(--v2-surface2); padding:16px 18px}
  .card.hl{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .cardhead{display:flex; align-items:baseline; gap:12px; flex-wrap:wrap}
  .cardhead h3{font-size:15px; font-weight:700}
  .moved{font:10px var(--v2-mono); letter-spacing:.06em; color:var(--v2-txt3);
    border:1px solid var(--v2-line2); border-radius:999px; padding:2px 8px}

  .row{display:flex; align-items:center; justify-content:space-between; gap:20px; margin-top:12px}
  .lbl{display:flex; flex-direction:column; gap:4px; min-width:0}
  .lbl span:first-child{font-size:13.5px; font-weight:500}
  .hint{font-size:11.5px; line-height:1.45; color:var(--v2-txt3)}
  .sw{position:relative; flex:0 0 auto; width:44px; height:25px; cursor:pointer}
  .sw input{position:absolute; opacity:0; width:0; height:0}
  .slider{position:absolute; inset:0; border-radius:999px; background:var(--v2-line2); transition:.18s}
  .slider::before{content:""; position:absolute; left:3px; top:3px; width:19px; height:19px; border-radius:50%;
    background:var(--v2-knob); transition:.18s}
  .sw input:checked + .slider{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw input:checked + .slider::before{transform:translateX(19px)}
  .sw input:focus-visible + .slider{box-shadow:0 0 0 3px var(--v2-focus)}

  .todo{display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-top:10px;
    font-size:12px; color:var(--v2-txt3)}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:999px; padding:6px 13px; font:600 11.5px var(--v2-sans)}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .empty{padding:30px 4px; color:var(--v2-txt3); font-size:14px}
</style>
