<script lang="ts">
  /**
   * La saisie d'une REQUÊTE AVANCÉE (tune-server-rust#7872), partagée par le
   * panneau de la Bibliothèque et l'éditeur des collections intelligentes.
   *
   * - une aide « ? » : la grammaire en bref et des exemples, qu'un clic recopie
   *   dans le champ ;
   * - le refus du serveur (400 `{position, attendu, message}`) : la saisie est
   *   recopiée sous le champ avec un repère sur le caractère fautif, et le
   *   curseur y est posé.
   *
   * La position du serveur est en CARACTÈRES : `decouperALaPosition`
   * (#6287) et `indiceUtf16` font la conversion (« é » ou un emoji compte pour un).
   */
  import { untrack } from 'svelte';
  import { t } from '../../lib/i18n';
  import {
    CHAMPS_DE_REQUETE,
    EXEMPLES_DE_REQUETE,
    indiceUtf16,
    type ErreurDeRequete,
  } from '../../lib/requeteAvancee';
  import { decouperALaPosition } from '../../lib/requeteTextuelle';
  import '../../styles/tune-v2.css';

  interface Props {
    value: string;
    /** Le refus de la dernière requête, ou `null`. */
    erreur?: ErreurDeRequete | null;
    /** Entrée dans le champ. Absent : aucune soumission au clavier. */
    onSubmit?: (() => void) | null;
    /** Le champ prend le focus à l'ouverture. */
    autofocus?: boolean;
  }
  let { value = $bindable(''), erreur = null, onSubmit = null, autofocus = false }: Props = $props();

  let champ = $state<HTMLInputElement | null>(null);
  let aideOuverte = $state(false);

  /** Le refus se rapporte au texte SOUMIS : on le recopie tant qu'il dure. */
  let soumis = $state('');
  $effect(() => {
    const e = erreur;
    if (!e) return;
    // Seul un NOUVEAU refus relance ce bloc : la frappe qui suit ne doit ni
    // effacer le repère ni ramener le curseur sur la faute.
    untrack(() => {
      soumis = value;
      // Le curseur sur la faute : on corrige là où le serveur a buté.
      const el = champ;
      if (el) {
        const i = indiceUtf16(value, e.position);
        const n = value.length;
        queueMicrotask(() => { el.focus(); el.setSelectionRange(i, Math.min(i + 1, n)); });
      }
    });
  });
  const repere = $derived(erreur ? decouperALaPosition(soumis, erreur.position) : null);

  $effect(() => {
    if (autofocus && champ) champ.focus();
  });

  function exemple(r: string) {
    value = r;
    aideOuverte = false;
    champ?.focus();
  }
</script>

<div class="v2-req">
  <div class="ligne">
    <input bind:this={champ} class="txt" class:fautif={erreur != null} bind:value
      spellcheck="false" autocomplete="off"
      placeholder={$t('requeteAvancee.placeholder' as any)}
      aria-label={$t('requeteAvancee.placeholder' as any)}
      aria-invalid={erreur != null}
      onkeydown={(e) => { if (e.key === 'Enter' && onSubmit) { e.preventDefault(); onSubmit(); } }} />
    <button class="aide-btn" class:on={aideOuverte} aria-expanded={aideOuverte}
      aria-label={$t('requeteAvancee.help' as any)} title={$t('requeteAvancee.help' as any)}
      onclick={() => (aideOuverte = !aideOuverte)}>?</button>
  </div>

  {#if erreur && repere}
    <div class="refus" role="alert">
      <div class="refus-titre">
        {$t('requeteAvancee.errorAt' as any).replace('{n}', String(erreur.position + 1))}
      </div>
      <pre class="repere" aria-hidden="true">{repere.avant}<mark>{repere.fautif || ' '}</mark>{repere.apres}</pre>
      {#if erreur.attendu}
        <div class="attendu">{$t('requeteAvancee.expected' as any)} <code>{erreur.attendu}</code></div>
      {/if}
      {#if erreur.message}<div class="detail">{erreur.message}</div>{/if}
    </div>
  {/if}

  {#if aideOuverte}
    <div class="aide">
      <p>{$t('requeteAvancee.helpIntro' as any)}</p>
      <ul class="regles">
        <li><code>field:value</code> — {$t('requeteAvancee.helpContains' as any)}</li>
        <li><code>field:=value</code> — {$t('requeteAvancee.helpEquals' as any)}</li>
        <li><code>"…"</code> — {$t('requeteAvancee.helpQuotes' as any)}</li>
        <li><code>OR</code> · <code>( )</code> — {$t('requeteAvancee.helpOr' as any)}</li>
        <li><code>-</code> · <code>NOT</code> — {$t('requeteAvancee.helpNot' as any)}</li>
        <li><code>year:1960..1969</code> · <code>rating:&gt;=4</code> — {$t('requeteAvancee.helpRange' as any)}</li>
      </ul>
      <div class="champs">
        <span class="lbl">{$t('requeteAvancee.helpFields' as any)}</span>
        <code>{[...CHAMPS_DE_REQUETE.texte, ...CHAMPS_DE_REQUETE.nombres, 'loved'].join(' · ')}</code>
        <span class="lbl">{$t('requeteAvancee.helpRoles' as any)}</span>
        <code>{CHAMPS_DE_REQUETE.roles.join(' · ')}</code>
      </div>
      <span class="lbl">{$t('requeteAvancee.helpExamples' as any)}</span>
      <ul class="exemples">
        {#each EXEMPLES_DE_REQUETE as ex (ex.requete)}
          <li>
            <button class="ex" onclick={() => exemple(ex.requete)}
              title={$t('requeteAvancee.useExample' as any)}><code>{ex.requete}</code></button>
            <span>{$t(ex.cle as any)}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .v2-req{display:flex; flex-direction:column; gap:8px; min-width:0}
  .ligne{display:flex; gap:8px; align-items:center}
  .txt{flex:1; height:40px; border-radius:10px; border:1px solid var(--v2-line2); background:var(--v2-surface2);
    color:var(--v2-txt); font:14px var(--v2-mono); padding:0 12px; outline:none; min-width:0}
  .txt:focus{border-color:var(--v2-acc2); box-shadow:0 0 0 3px var(--v2-focus)}
  .txt.fautif{border-color:var(--v2-danger-bd)}
  .aide-btn{width:40px; height:40px; flex:none; border-radius:10px; cursor:pointer;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt2);
    font:700 15px var(--v2-sans)}
  .aide-btn:hover,.aide-btn.on{color:var(--v2-acc-tint); border-color:var(--v2-acc2)}

  .refus{border:1px solid var(--v2-danger-bd); background:var(--v2-danger-soft); border-radius:10px;
    padding:10px 12px; display:flex; flex-direction:column; gap:6px}
  .refus-titre{color:var(--v2-danger); font:600 13px var(--v2-sans)}
  .repere{margin:0; font:13px/1.5 var(--v2-mono); color:var(--v2-txt); white-space:pre-wrap; word-break:break-all}
  .repere mark{background:var(--v2-danger); color:var(--v2-on-acc); border-radius:3px; padding:0 1px}
  .attendu,.detail{font:12px/1.4 var(--v2-sans); color:var(--v2-txt2)}
  .attendu code{font:12px var(--v2-mono); color:var(--v2-txt)}

  .aide{border:1px solid var(--v2-line2); background:var(--v2-surface2); border-radius:10px;
    padding:12px 14px; display:flex; flex-direction:column; gap:8px; font:13px/1.45 var(--v2-sans);
    color:var(--v2-txt2)}
  .aide p{margin:0}
  .aide code{font:12px var(--v2-mono); color:var(--v2-txt)}
  .regles,.exemples{margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:4px}
  .champs{display:flex; flex-direction:column; gap:4px}
  .lbl{font:600 11px var(--v2-mono); letter-spacing:.12em; text-transform:uppercase; color:var(--v2-txt3)}
  .exemples li{display:flex; flex-direction:column; gap:2px}
  .ex{align-self:flex-start; text-align:left; border:1px dashed var(--v2-line2); background:transparent;
    border-radius:8px; padding:4px 8px; cursor:pointer}
  .ex:hover{border-color:var(--v2-acc2)}
</style>
