<script lang="ts">
  /**
   * Le badge « Tune tested ».
   *
   * Un seul dessin, deux emplacements : la liste des appareils dans Réglages,
   * et la carte de zone en vue grille. Le badge affirme quelque chose — que
   * MozAIk Labs a validé une configuration pour cet appareil — et il doit donc
   * mener à la liste publique où cette affirmation se vérifie. Un badge qui
   * n'explique pas ce qu'il affirme n'est qu'une décoration.
   *
   * Il ne décide de rien : l'appelant lui passe l'appareil trouvé au catalogue
   * (`appareilTuneTeste`), et ne le monte que s'il y en a un. Le badge absent
   * ne dit PAS « non validé », il dit « rien à dire » — le catalogue peut être
   * hors de portée.
   */
  import { URL_PAGE_PUBLIQUE } from '../../lib/tuneTested';
  import { tip } from '../../lib/tooltip';
  import { t } from '../../lib/i18n';

  interface Props {
    /** `sm` dans une ligne dense, `md` sur une carte. */
    taille?: 'sm' | 'md';
  }
  let { taille = 'sm' }: Props = $props();
</script>

<a
  class="tt {taille}"
  href={URL_PAGE_PUBLIQUE}
  target="_blank"
  rel="noopener noreferrer"
  onclick={(e) => e.stopPropagation()}
  use:tip={'v2.dev.tuneTestedTip'}
>{$t('v2.dev.tuneTested' as any)}</a>

<style>
  /* `stopPropagation` ci-dessus : sur une carte de zone, le clic sur la carte
     ACTIVE la zone. Ouvrir le catalogue ne doit pas changer la sortie audio. */
  .tt{
    font:9.5px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase;
    color:var(--v2-acc1); border:1px solid var(--v2-acc1); border-radius:3px;
    padding:1px 5px; white-space:nowrap; text-decoration:none; cursor:pointer;
    align-self:center;
  }
  .tt.md{font-size:10px; padding:2px 7px; border-radius:4px}
  .tt:hover{background:var(--v2-acc-soft)}
</style>
