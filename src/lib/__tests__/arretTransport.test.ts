/**
 * L'arrêt de la lecture : sa RÈGLE, et le seul chemin qui y mène.
 *
 * ## L'histoire, parce qu'elle explique la forme de ce fichier
 *
 *  - 05/09/2026 — Bertrand remplace le bouton stop autonome par un double-clic
 *    sur Lecture. Le stop n'est pas une commande de MUSIQUE, c'est une commande
 *    d'APPAREIL : il libère un renderer DLNA ou AirPlay là où la pause le garde.
 *  - 08/09 — « Et le bouton Stop de la transport barre !! ?? !! ». Je le lis
 *    comme « où est-il passé ? » et je le remets.
 *  - 09/09 — « Le bouton stop devait avoir été retiré. Non ? ». La lecture était
 *    fausse ; le bouton repart.
 *
 * Ce qui SURVIT à cet aller-retour, et qui est le vrai contenu de ce fichier :
 * la condition d'arrêt vit dans `lib/arretTransport` au lieu d'être écrite en
 * dur dans la barre, et un test l'APPELLE. Elle servait au bouton, elle sert au
 * double-clic — c'est la même règle.
 *
 * Le fichier garde donc :
 *
 *  1. la RÈGLE — `arretPossible`, appelée, pas relue ;
 *  2. le BRANCHEMENT — un seul chemin d'arrêt, le double-clic, et un seul appel
 *     à `stopAndSync`. « Écrit mais pas branché » est le défaut dominant de ce
 *     client ; deux implémentations de l'arrêt en seraient la variante.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { resolve } from 'node:path';
import { arretPossible } from '../arretTransport';

const barre = readFileSync(resolve(__dirname, '../../components/TransportBar.svelte'), 'utf-8');

describe('arretPossible', () => {
  it('arrête une piste locale d’une zone', () => {
    expect(arretPossible(10, 'local')).toBe(true);
  });

  it('n’arrête pas une radio : un direct ne se reprend pas où on l’a laissé', () => {
    expect(arretPossible(10, 'radio')).toBe(false);
  });

  it('n’arrête rien sans zone : il n’y a pas d’appareil à libérer', () => {
    expect(arretPossible(null, 'local')).toBe(false);
    expect(arretPossible(undefined, 'qobuz')).toBe(false);
  });

  it('une source absente ou inconnue reste arrêtable', () => {
    // Une piste locale sans champ `source` ne doit pas perdre son bouton.
    expect(arretPossible(10, undefined)).toBe(true);
    expect(arretPossible(10, null)).toBe(true);
    expect(arretPossible(10, 'tidal')).toBe(true);
  });
});

describe('la barre appelle la règle, et n’a pas de bouton stop', () => {
  it('la barre appelle la règle au lieu de la réécrire', () => {
    expect(barre).toContain("import { arretPossible } from '../lib/arretTransport'");
    expect(barre).toContain('arretPossible(zone?.id, displayTrack?.source)');
    // La condition en dur qu'elle remplace ne doit pas revenir en douce.
    expect(barre).not.toContain("!!zone?.id && displayTrack?.source !== 'radio'");
  });

  it('🔴 aucun bouton stop autonome dans la barre', () => {
    // Décision de Bertrand, prise le 05/09 et redite le 09/09. Le code, pas les
    // commentaires : le récit de l'aller-retour cite forcément le mot.
    const code = barre.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(code).not.toContain('{#if stopPossible}');
    expect(code).not.toContain('control-btn stop-btn');
    expect(code).not.toContain('transport.stop');
    expect(code).not.toContain("common.stop");
  });

  it('🔴 la règle SERT encore — elle garde le double-clic', () => {
    // Retirer le bouton ne doit pas rendre la condition morte : sans elle, un
    // double-clic sur une radio tenterait un arrêt que le serveur refuse.
    expect(barre).toContain('const stopPossible = $derived(arretPossible(');
    const i = barre.indexOf('async function arreter()');
    expect(barre.slice(i, i + 160)).toContain('if (!stopPossible || !zone?.id) return;');
  });

  it('UN seul chemin d’arrêt, et un seul appel', () => {
    expect(barre).toContain('async function arreter()');
    expect(barre).toContain('await stopAndSync(zone.id)');
    // Une seule occurrence de l'appel : pas de seconde implémentation.
    expect(barre.split('stopAndSync(zone.id)').length - 1).toBe(1);
    // Et un seul appelant : le double-clic.
    expect(barre.split('await arreter()').length - 1).toBe(1);
  });

  it('l’infobulle ANNONCE le double-clic — sinon personne ne le devine', () => {
    // C'est la contrepartie du retrait du bouton : le geste doit être dit.
    expect(barre).toContain('transport.dblClickStop');
  });
});

describe('🔴 le bouton unique a bien TROIS états', () => {
  // Bertrand, 09/09/2026 : « je veux avoir un seul bouton à 3 états : Play,
  // Pause, Stop » — « Simple click : Play↔Pause. Double click : → Stop. »
  //
  // Les deux gestes existaient. Ce qui manquait, c'est que le bouton n'avait
  // que DEUX apparences : arrêté et en pause montraient le même triangle, et
  // le double-clic n'accusait aucun effet visible.
  const code = barre.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

  it('l’état ARRÊTÉ est calculé, et distinct de la pause', () => {
    expect(code).toContain("const estArretee = $derived(!isPlaying && !ytActive && playState === 'stopped')");
  });

  it('il est porté par LE bouton de lecture, pas par un second bouton', () => {
    const i = code.indexOf('class="control-btn play-btn"');
    expect(i).toBeGreaterThan(0);
    expect(code.slice(i, i + 220)).toContain('class:arretee={estArretee}');
  });

  it('les trois apparences se distinguent vraiment', () => {
    // Une règle qui n'emporterait pas la décision ne changerait rien à
    // l'écran : la base porte `!important`, la variante doit aussi.
    const css = barre.slice(barre.lastIndexOf('<style'));
    const regle = /\.play-btn\.arretee \{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(regle).toContain('background: transparent !important');
    expect(regle).toContain('box-shadow: inset');
    // Et le contour ne doit pas changer la TAILLE du bouton : `border` ferait
    // passer 44 px à 48 et décalerait la rangée entière.
    expect(regle).not.toContain('border:');
  });

  it('🔴 aucun SECOND témoin d’état ailleurs dans l’application', () => {
    // « Retire ce témoin, le bouton porte déjà les 3 états » (09/09/2026).
    // « Lecture en cours » portait un carré de 12 px à l'arrêt, dans un
    // `<span>` : il redisait ce que le bouton dit, et se lisait comme un
    // bouton Stop qui n'en était pas un — c'est lui que Bertrand voyait encore
    // après le retrait du vrai bouton.
    //
    // La garde balaie TOUTE l'application : le défaut n'était pas dans la
    // barre, et le chercher seulement là l'aurait manqué une seconde fois.
    const fautifs: string[] = [];
    for (const f of globSync('src/components/**/*.svelte')) {
      const code = readFileSync(f, 'utf8')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ');
      if (code.includes('playback-indicator')) fautifs.push(`${f.split('/').pop()} → playback-indicator`);
      // Le carré de « stop » à 12 px, la forme exacte du témoin retiré.
      if (/x="6" y="6" width="12" height="12"/.test(code)) fautifs.push(`${f.split('/').pop()} → carré 12×12`);
    }
    expect(fautifs).toEqual([]);
  });

  it('un simple clic bascule, un double-clic arrête — les deux gestes de Bertrand', () => {
    expect(code).toContain('onclick={clicLecture}');
    expect(code).toContain('ondblclick={doubleClicLecture}');
    const i = code.indexOf('async function clicLecture(');
    expect(code.slice(i, i + 200)).toContain('await togglePlayPause();');
  });
});
