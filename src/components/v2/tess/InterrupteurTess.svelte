<script lang="ts">
  /**
   * Refonte TESS rc14 (Rémi, demande 5) — l'interrupteur on/off de TESS, celui
   * de l'ancien égaliseur (piste de 46 × 26), à la place de toutes les cases.
   *
   * Un `<input type="checkbox" role="switch">` : le clavier (Espace) et les
   * lecteurs d'écran le lisent comme un interrupteur, et les attributs
   * `data-tess-*` passés par l'appelant restent sur l'input (tests inchangés).
   *
   * L'état affiché est celui du PARENT (`checked`), jamais celui du clic :
   * l'input est remis à `checked` aussitôt, et `onToggle(voulu)` décide. Le
   * serveur peut refuser ; l'interrupteur ne ment pas en attendant.
   */
  import type { HTMLInputAttributes } from 'svelte/elements';

  let {
    checked = false,
    disabled = false,
    label = '',
    title = undefined,
    texte = null,
    onToggle,
    ...reste
  }: {
    checked?: boolean;
    disabled?: boolean;
    /** Nom accessible (aria-label). */
    label?: string;
    title?: string;
    /** Texte visible à côté de la piste, ou `null`. */
    texte?: string | null;
    onToggle: (voulu: boolean) => void;
  } & Omit<HTMLInputAttributes, 'checked' | 'disabled' | 'title' | 'type' | 'role'> = $props();
</script>

<label class="interrupteur" class:inactif={disabled} {title}>
  <input
    {...reste}
    type="checkbox"
    role="switch"
    {checked}
    {disabled}
    aria-checked={checked}
    aria-label={label || undefined}
    onchange={(e) => {
      const c = e.currentTarget as HTMLInputElement;
      const voulu = c.checked;
      c.checked = checked;
      onToggle(voulu);
    }} />
  <span class="piste" aria-hidden="true"></span>
  {#if texte}<span class="texte">{texte}</span>{/if}
</label>

<style>
  .interrupteur{position:relative; display:inline-flex; align-items:center; gap:8px; cursor:pointer; flex:0 0 auto;
    color:var(--v2-txt2); font-size:calc(12.5px * var(--v2-txt-echelle, 1))}
  .interrupteur.inactif{cursor:default; opacity:.5}
  input{position:absolute; opacity:0; width:46px; height:26px; margin:0; left:0; top:50%; transform:translateY(-50%); cursor:inherit}
  .piste{position:relative; width:46px; height:26px; border-radius:999px; background:var(--v2-line2); transition:.18s; flex:0 0 auto}
  .piste::before{content:""; position:absolute; left:3px; top:3px; width:20px; height:20px; border-radius:50%;
    background:var(--v2-txt); transition:.18s}
  input:checked + .piste{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  input:checked + .piste::before{transform:translateX(20px); background:var(--v2-on-acc, #fff)}
  input:focus-visible + .piste{outline:2px solid var(--v2-acc1); outline-offset:2px}
  @media (prefers-reduced-motion: reduce){ .piste,.piste::before{transition:none} }
</style>
