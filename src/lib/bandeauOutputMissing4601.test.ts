// #4601 / #4580 — LE TROISIÈME ÉTAT DU BANDEAU DE ZONE.
//
// Deux testeurs ont SUPPRIMÉ ET RECRÉÉ une zone pour la faire refonctionner.
// Leur zone avait bien un appareil : il avait seulement disparu du registre
// vivant du serveur — un renderer DLNA qui change d'identifiant en
// redémarrant, un bail DHCP renouvelé. `output_reach` ne savait dire que deux
// choses, « pas de sortie du tout » et « l'onglet ne tire rien », et rendait
// donc `ok`. L'écran n'avait rien à dire, et supprimer la zone paraissait
// être la seule issue.
//
// Or c'est le geste à éviter : elle se rattache seule dès que l'appareil
// réapparaît, et la recréer perd son volume, sa file et ses réglages.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { avertissementDe } from './bandeauLisible';

describe('#4601 — `output_missing` mérite un bandeau', () => {
  it('🔴 il est reconnu, et rendu tel quel', () => {
    expect(avertissementDe('output_missing')).toBe('output_missing');
  });

  it('les deux états d’avant sont intacts', () => {
    expect(avertissementDe('no_output')).toBe('no_output');
    expect(avertissementDe('browser_unattended')).toBe('browser_unattended');
  });

  it('et rien d’autre ne passe', () => {
    // La porte ne s'ouvre pas : `ok`, une valeur inconnue, ou un serveur
    // antérieur à 0.9.70 qui n'envoie pas le champ du tout.
    for (const v of ['ok', 'autre_chose', '', null, undefined]) {
      expect(avertissementDe(v as any), String(v)).toBeNull();
    }
  });
});

describe('#4601 — ce que le bandeau PROPOSE, et ce qu’il ne propose pas', () => {
  // 🔴 SANS LES COMMENTAIRES. Le composant EXPLIQUE, en commentaire, qu'il ne
  // faut surtout pas proposer « Supprimer la zone » — et la première version
  // de cette garde rougissait sur sa propre explication. Une garde de texte se
  // mesure sur ce qui est RENDU, jamais sur ce qui est écrit autour.
  const sansCommentaires = (x: string) =>
    x.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const vue = sansCommentaires(
    readFileSync('src/components/partages/ZoneOutputBanner.svelte', 'utf8'),
  );
  const fr = readFileSync('src/lib/locales/fr.ts', 'utf8');

  it('il a sa propre phrase et son propre bouton', () => {
    expect(vue).toContain("$motif === 'output_missing'");
    expect(vue).toContain("$t('zone.outputMissingBanner')");
    expect(vue).toContain("$t('zone.outputMissingBannerAction')");
  });

  it('🔴 il ne propose JAMAIS de supprimer la zone', () => {
    // Le cœur du chantier. Un bouton « Supprimer la zone » à cet endroit
    // serait la pire réponse possible : c'est exactement ce que les deux
    // testeurs ont fait, et ce que tout ce travail cherche à éviter.
    const i = vue.indexOf("$motif === 'output_missing'");
    const bloc = vue.slice(i, vue.indexOf('{/if}', i));
    expect(bloc.toLowerCase()).not.toContain('delete');
    expect(bloc.toLowerCase()).not.toContain('supprim');
    expect(bloc).not.toContain('zone.deleteZone');
  });

  it('🔴 la phrase DIT que la zone se rattache seule, et qu’il ne faut pas la supprimer', () => {
    // Sans ces deux promesses, le bandeau nomme un problème sans couper le
    // réflexe qui coûte une zone.
    const ligne = /'zone\.outputMissingBanner': '([^']*(?:\\'[^']*)*)'/.exec(fr)?.[1] ?? '';
    expect(ligne, 'la phrase française est introuvable').not.toBe('');
    expect(ligne).toContain('rattachera seul');
    expect(ligne).toContain('Inutile de supprimer la zone');
  });

  it('les onze langues portent les deux clés', () => {
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu']) {
      const s = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      expect(s, `${l} : phrase`).toContain('zone.outputMissingBanner');
      expect(s, `${l} : bouton`).toContain('zone.outputMissingBannerAction');
    }
  });
});
