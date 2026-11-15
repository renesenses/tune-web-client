<script lang="ts">
  /**
   * tune-server-rust#7371 — le pare-feu de Windows filtre Tune sur le réseau
   * actif. Voir `lib/alertePareFeu.ts`. Le bandeau dit ce qui se passe, ce
   * que l'utilisateur voit (un appareil seulement en AirPlay, ou muet), et les
   * deux façons d'y remédier.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { alertePareFeu, type AlertePareFeu } from '../../lib/alertePareFeu';

  let alerte = $state<AlertePareFeu | null>(null);

  $effect(() => {
    api
      .apiFetch('/system/pare-feu')
      .then((charge: unknown) => { alerte = alertePareFeu(charge); })
      .catch(() => { /* serveur ancien ou hors Windows : rien à dire */ });
  });

  const CLES_DES_PROFILS = {
    domaine: 'pareFeu.profilDomaine',
    prive: 'pareFeu.profilPrive',
    public: 'pareFeu.profilPublic',
  } as const;

  const nomsDesProfils = (a: AlertePareFeu) =>
    a.profils.map((p) => $t(CLES_DES_PROFILS[p] as any)).join(', ');
</script>

{#if alerte}
  <div class="alerte-pare-feu" role="status" data-alerte-pare-feu={alerte.profils.join(',')}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
    <div class="alerte-pare-feu-texte">
      <strong>{$t('pareFeu.titre' as any)}</strong>
      <span>{$t('pareFeu.corps' as any).replace('{profils}', nomsDesProfils(alerte))}</span>
      <ol>
        <li>{$t('pareFeu.etapePrive' as any)}</li>
        <li>{$t('pareFeu.etapeAutoriser' as any)}</li>
      </ol>
      <span>{$t('pareFeu.etapeRedemarrer' as any)}</span>
    </div>
  </div>
{/if}

<style>
  .alerte-pare-feu {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.7rem 0.9rem;
    margin: 0 0 0.75rem;
    border-radius: 10px;
    background: rgba(245, 158, 11, 0.14);
    border: 1px solid rgba(245, 158, 11, 0.35);
    color: var(--text, #e6e6e6);
    font-size:calc(0.85rem * var(--v2-txt-echelle, 1));
    line-height: 1.4;
  }
  .alerte-pare-feu svg {
    flex: 0 0 auto;
    margin-top: 0.1rem;
    color: rgb(245, 158, 11);
  }
  .alerte-pare-feu-texte {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .alerte-pare-feu-texte ol {
    margin: 0.2rem 0 0.1rem 1.1rem;
    padding: 0;
  }
</style>
