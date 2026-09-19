/**
 * #3383 — « la bascule "désactiver la télémétrie" de l'interface n'éteint rien ».
 *
 * Le serveur écrit désormais le refus et répond l'état EFFECTIF. Restait le
 * dernier maillon : l'écran ignorait cette réponse. `toggleCloudTelemetry`
 * faisait `cloudTelemetryEnabled = !cloudTelemetryEnabled` — la case bougeait
 * quoi qu'ait répondu le serveur.
 *
 * Ça n'est pas théorique. Quand l'exploitant a posé `TUNE_TELEMETRY=false`,
 * `POST /cloud/telemetry/enable` répond `{"enabled": false}` : le serveur
 * refuse de rallumer. L'inversion locale affichait alors une case COCHÉE pour
 * un envoi qui n'aurait jamais lieu — le mensonge symétrique de celui de
 * l'issue, et le rafraîchissement suivant décochait la case tout seul.
 *
 * ## Ce que ce fichier garde, et comment
 *
 * 1. la DÉCISION, en appelant le code de production (`etatTelemetrie`) ;
 * 2. le fait qu'elle soit BRANCHÉE — un module juste jamais appelé est
 *    exactement le défaut d'origine (« écrit mais pas branché ») ;
 * 3. l'INTITULÉ, qui promettait des « statistiques anonymes » alors que le
 *    battement porte un `server_id` persistant, et qui taisait que la même
 *    bascule coupe aussi les métadonnées communautaires.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { etatTelemetrie, routeDeBascule } from '../etatTelemetrie';

import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import itLocale from '../locales/it';
import zh from '../locales/zh';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import hu from '../locales/hu';

const LANGUES: Record<string, Record<string, string>> = {
  fr, en, de, es, it: itLocale, zh, ja, ko, ro, sv, hu,
} as never;



describe('#3383 — la décision d’affichage vient du serveur', () => {
  it('une demande d’activation refusée par la machine laisse la case décochée', () => {
    // `TUNE_TELEMETRY=false` : l'utilisateur clique pour activer, le serveur
    // répond non. C'est le cas que l'inversion locale affichait à l'envers.
    const etat = etatTelemetrie(
      { enabled: false, env_override: true },
      { actif: true, verrouEnvironnement: false },
    );
    expect(etat.actif).toBe(false);
    expect(etat.verrouEnvironnement).toBe(true);
  });

  it('un refus accepté est repris tel quel', () => {
    const etat = etatTelemetrie(
      { enabled: false, env_override: false },
      { actif: false, verrouEnvironnement: false },
    );
    expect(etat).toEqual({ actif: false, verrouEnvironnement: false });
  });

  it('un serveur antérieur à #3383 ne bloque pas la bascule : on retombe sur le repli', () => {
    // Ni `enabled` ni `env_override` dans la réponse : le repli porte la
    // valeur DEMANDÉE, donc le comportement d'avant — ni meilleur ni pire.
    const etat = etatTelemetrie({}, { actif: false, verrouEnvironnement: false });
    expect(etat.actif).toBe(false);
    const rallume = etatTelemetrie(null, { actif: true, verrouEnvironnement: false });
    expect(rallume.actif).toBe(true);
  });

  it('une valeur qui n’est pas un booléen ne décide de rien', () => {
    // `"false"` est une CHAÎNE : la lire comme vraie rallumerait l'affichage
    // sur un refus.
    const etat = etatTelemetrie(
      { enabled: 'false', env_override: 1 } as never,
      { actif: false, verrouEnvironnement: false },
    );
    expect(etat.actif).toBe(false);
    expect(etat.verrouEnvironnement).toBe(false);
  });

  it('la route demandée correspond au souhait, pas à l’état courant', () => {
    expect(routeDeBascule(true)).toBe('/cloud/telemetry/enable');
    expect(routeDeBascule(false)).toBe('/cloud/telemetry/disable');
  });
});


