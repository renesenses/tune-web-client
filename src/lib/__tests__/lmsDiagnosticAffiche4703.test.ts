/**
 * 🔴 renesenses/tune-server-rust#4703 — le panneau Squeezebox affichait sa
 * propre phrase générique par-dessus ce que le serveur avait compris.
 *
 * Belkadi Yacine, fil forum 1507, 22/09/2026 : « toujours pas de platine,
 * aucun lecteur trouvé alors que Lyrion s'ouvre en affichant ma
 * bibliothèque ». Le ticket relevait que sa formulation ne correspond à
 * AUCUN message du serveur — et pour cause : l'écran n'en affiche aucun.
 *
 * `/api/v1/squeezebox/status` porte un champ `diagnostic` depuis la
 * v0.9.153 (`lms_sans_platine`, `lms_recensement_impossible`, et depuis
 * #4703 `lms_est_tune_lui_meme`). Ce champ n'était **ni déclaré dans
 * `SqueezeboxStatus`, ni lu nulle part** : quelle que soit la cause, le
 * panneau retombait sur « Aucun lecteur Squeezebox trouvé ». Le diagnostic
 * serveur était écrit et jamais branché.
 *
 * Mesuré en lecture seule sur le .18 le 22/09/2026 — `lms_host: "localhost"`,
 * `players: []`, `diagnostic.code: "lms_sans_platine"` — et pas une ligne de
 * ce message n'était affichable.
 *
 * Cette garde tient les deux bouts : le champ existe dans le contrat TS, et
 * le gabarit le PRÉFÈRE à sa phrase générique — laquelle reste le repli, pour
 * un serveur antérieur à la v0.9.153 qui n'envoie rien.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('#4703 — le panneau Lyrion dit ce que le serveur a compris', () => {
  it('le contrat TS déclare le champ `diagnostic`', () => {
    const api = lire('src/lib/api.ts');
    const debut = api.indexOf('export interface SqueezeboxStatus');
    expect(debut, 'SqueezeboxStatus a été renommée : cette garde ne garde plus rien').toBeGreaterThan(-1);
    const fin = api.indexOf('}', debut);
    expect(fin).toBeGreaterThan(debut);
    const bloc = api.slice(debut, fin);
    expect(
      bloc,
      'sans le champ, `sbStatus.diagnostic` est `undefined` en TypeScript et ' +
        'le gabarit retombe silencieusement sur sa phrase générique',
    ).toContain('diagnostic');
  });

  it('🔴 le gabarit préfère le message du serveur à sa phrase générique', () => {
    const v2 = lire('src/components/v2/SettingsV2.svelte');
    const repli = "$t('settings.squeezeboxNoPlayers' as any)";
    const position = v2.indexOf(repli);
    expect(position, 'la ligne « aucun lecteur » a disparu du panneau').toBeGreaterThan(-1);

    // La fenêtre : la ligne qui porte le repli. Chercher dans le fichier
    // entier laisserait passer un `diagnostic.message` affiché ailleurs.
    const debutLigne = v2.lastIndexOf('\n', position) + 1;
    const finLigne = v2.indexOf('\n', position);
    const ligne = v2.slice(debutLigne, finLigne);

    expect(
      ligne,
      "le panneau affiche « Aucun lecteur Squeezebox trouvé » quelle que soit " +
        'la cause : LMS muet, liste illisible, ou Tune qui s\'interroge ' +
        'lui-même. Le serveur sait laquelle et le dit dans `diagnostic.message` ' +
        '(#4703).',
    ).toContain('sbStatus?.diagnostic?.message');

    expect(
      ligne,
      'le repli doit RESTER : un serveur antérieur à la v0.9.153 n\'envoie ' +
        'aucun diagnostic, et un panneau vide serait pire que la phrase générique',
    ).toContain(repli);

    // Et dans cet ordre : le diagnostic d'abord, le repli ensuite.
    expect(
      ligne.indexOf('sbStatus?.diagnostic?.message'),
      'le repli passe AVANT le diagnostic : il gagnerait toujours',
    ).toBeLessThan(ligne.indexOf(repli));
  });
});
