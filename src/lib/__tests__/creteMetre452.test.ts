/**
 * #452 — trois visuels de crête-mètre, spécifiés par Xavijol le 14/08/2026.
 *
 * Ce fichier tient la SPÉCIFICATION, pas le dessin. Chaque cas cite la phrase
 * qu'il garde : c'est le genre de fonctionnalité dont les seuils se
 * « simplifient » tout seuls à la relecture, et dont personne ne remarque la
 * dérive avant qu'un testeur ne voie du rouge en permanence.
 */
import { describe, it, expect } from 'vitest';
import {
  AMBRE_DES_DB, BAR_RELEASE, IEC_AL_DB, IEC_PML_DB, PLANCHER_DB, PPM_HOLD_MS,
  STYLES_CRETE, STYLE_CRETE_DEFAUT,
  auRepos, estStyleCrete, fractionDe, styleSurLaBarre, suivreLaCrete, suivrePpm,
  surcharge, zoneIec,
} from '../peakMetre';

describe('Les seuils de surcharge', () => {
  it('🔴 le rouge est STRICTEMENT au-dessus de zéro', () => {
    // « rouge **strictement** > 0 ». Le mot est dans la spécification : un
    // master limité à 0,0 dBFS exactement n'est PAS en surcharge. Confondre
    // `>` et `>=` allumerait le rouge sur la moitié des disques modernes.
    expect(surcharge(0)).not.toBe('rouge');
    expect(surcharge(0.01)).toBe('rouge');
    expect(surcharge(3)).toBe('rouge');
  });

  it('l’ambre couvre « > −0,5 et ≤ 0 »', () => {
    expect(surcharge(-0.5)).toBe('aucune');   // la borne basse est EXCLUE
    expect(surcharge(-0.49)).toBe('ambre');
    expect(surcharge(-0.1)).toBe('ambre');
    expect(surcharge(0)).toBe('ambre');       // la borne haute est INCLUSE
  });

  it('en dessous, rien ne s’allume', () => {
    expect(surcharge(AMBRE_DES_DB)).toBe('aucune');
    expect(surcharge(-6)).toBe('aucune');
    expect(surcharge(-96)).toBe('aucune');
  });
});

describe('L’échelle IEC 268-18', () => {
  it('vert jusqu’à AL, ambre jusqu’à PML, rouge au-delà', () => {
    expect(zoneIec(-40)).toBe('vert');
    expect(zoneIec(IEC_AL_DB)).toBe('vert');      // AL lui-même est encore vert
    expect(zoneIec(-17.9)).toBe('ambre');
    expect(zoneIec(IEC_PML_DB)).toBe('ambre');    // PML lui-même est encore ambre
    expect(zoneIec(-8.9)).toBe('rouge');
    expect(zoneIec(0)).toBe('rouge');
  });

  it('les repères sont ceux de la norme', () => {
    expect(IEC_AL_DB).toBe(-18);
    expect(IEC_PML_DB).toBe(-9);
  });
});

describe('🔴 Le plancher d’échelle', () => {
  it('est à −60, pas au repos analogique', () => {
    // « la barre et le trait PPM rejoignent le plancher d'échelle (−60), pas
    // le repos analogique (−20) qui laissait un tiers de piste allumé ». Une
    // barre allumée à l'arrêt se lit comme un signal.
    expect(PLANCHER_DB).toBe(-60);
    expect(auRepos().gaucheDb).toBe(-60);
    expect(auRepos().ppm.db).toBeNull();
  });

  it('et rien ne descend en dessous', () => {
    expect(fractionDe(-96)).toBe(0);
    expect(fractionDe(-60)).toBe(0);
    expect(fractionDe(0)).toBe(1);
    expect(fractionDe(6)).toBe(1);
  });

  it('l’échelle est LINÉAIRE en décibels', () => {
    // Un bargraphe numérique n'a pas d'aiguille : ses graduations sont
    // régulières, et c'est ce qui permet d'y lire une valeur.
    expect(fractionDe(-30)).toBeCloseTo(0.5, 6);
    expect(fractionDe(-15)).toBeCloseTo(0.75, 6);
  });
});

describe('🔴 La balistique', () => {
  it('l’attaque est INSTANTANÉE', () => {
    // « la barre colle à la crête (plus la course de 100–150 ms de l'aiguille
    // VU) ». Une crête manquée est une crête invisible.
    expect(suivreLaCrete(-40, -6)).toBe(-6);
    expect(suivreLaCrete(-6, -6)).toBe(-6);
  });

  it('la retombée est AMORTIE', () => {
    // « sans ça, chaque fenêtre de 40 ms faisait flasher les segments ».
    const apres = suivreLaCrete(-6, -40);
    expect(apres).toBeGreaterThan(-40);
    expect(apres).toBeLessThan(-6);
    expect(apres).toBeCloseTo(-6 + (-40 + 6) * BAR_RELEASE, 6);
  });

  it('et elle CONVERGE — elle ne s’arrête pas à mi-chemin', () => {
    let db = -6;
    for (let i = 0; i < 400; i++) db = suivreLaCrete(db, PLANCHER_DB);
    expect(db).toBeCloseTo(PLANCHER_DB, 3);
  });
});

describe('Le trait PPM', () => {
  it('monte tout de suite', () => {
    const e = suivrePpm({ db: null, depuisMs: 0 }, -12, 1000);
    expect(e.db).toBe(-12);
  });

  it('🔴 TIENT 1,2 s avant de céder', () => {
    const pose = suivrePpm({ db: null, depuisMs: 0 }, -6, 1000);
    // Pendant la tenue, une crête plus basse ne le fait pas descendre.
    expect(suivrePpm(pose, -30, 1000 + PPM_HOLD_MS - 1).db).toBe(-6);
    // Passé le délai, il suit.
    expect(suivrePpm(pose, -30, 1000 + PPM_HOLD_MS).db).toBe(-30);
  });

  it('🔴 une crête PLUS HAUTE le remplace immédiatement', () => {
    // Sinon on afficherait l'avant-dernière, ce qui est pire que rien.
    const pose = suivrePpm({ db: null, depuisMs: 0 }, -20, 1000);
    expect(suivrePpm(pose, -3, 1100).db).toBe(-3);
  });
});

describe('🔴 Ce que la barre de lecture peut afficher', () => {
  it('les lampes, et rien d’autre', () => {
    // « La barre de lecture n'affiche JAMAIS DAT ni IEC (trop large). Si on
    // active les témoins sur la barre, ce sont les lampes. »
    expect(styleSurLaBarre('dat')).toBe('lamps');
    expect(styleSurLaBarre('iec')).toBe('lamps');
    expect(styleSurLaBarre('lamps')).toBe('lamps');
  });

  it('et « rien » reste « rien »', () => {
    // Le repli ne doit pas rallumer un instrument que l'utilisateur a éteint.
    expect(styleSurLaBarre('off')).toBe('off');
  });
});

describe('Le réglage', () => {
  it('offre les quatre états, dans l’ordre du panneau', () => {
    expect(STYLES_CRETE).toEqual(['off', 'lamps', 'dat', 'iec']);
  });

  it('le défaut est celui que Xavijol propose', () => {
    expect(STYLE_CRETE_DEFAUT).toBe('dat');
  });

  it('une valeur inconnue n’est pas un style', () => {
    // Un réglage relu depuis un stockage corrompu ne doit pas atteindre le
    // rendu : c'est là qu'un `switch` sans `default` dessine du vide.
    for (const v of ['vu', '', null, undefined, 42, {}]) expect(estStyleCrete(v)).toBe(false);
    for (const v of STYLES_CRETE) expect(estStyleCrete(v)).toBe(true);
  });
});
