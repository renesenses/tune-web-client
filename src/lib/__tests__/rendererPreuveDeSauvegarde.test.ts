/**
 * « Et un bouton "sauvegarder mes réglages" dans configuration du renderer ?? »
 * — Bertrand, 09/09/2026, onglet Appareils des Réglages.
 *
 * ## Deux réponses successives à la même demande, et pourquoi la première ne
 * suffisait pas
 *
 * **09/09 — le témoin.** La lecture du code avait montré que les sept réglages
 * du renderer SONT écrits, un par un, dès le clic : `setNativeFlac`, `setAlac`,
 * `setAac`, `setCap16`, `setForceWav`, `setPlayDelay` appellent tous
 * `save(() => api.updateZone…)`. Ce qui manquait n'était donc pas la
 * sauvegarde, c'était sa PREUVE : seul l'échec parlait (`renderer.saveError`),
 * un succès ne disait rien, et rien ne distinguait « c'est écrit » de « le clic
 * n'a rien fait ». Le témoin « Enregistré » a été posé, repris de
 * `ZoneDeviceEditor` — le bloc voisin du même onglet, qui le montrait déjà.
 *
 * Et il avait été conclu : **pas de bouton**, parce qu'il ferait croire que
 * rien n'est écrit tant qu'on ne l'a pas pressé. Ce garde interdisait donc
 * `common.save` dans l'écran.
 *
 * 🔴 **11/09 — la prémisse était fausse.** Cette conclusion tenait sur un
 * implicite jamais vérifié : que ce qui est écrit RESTE écrit. Bertrand mesure
 * l'inverse en usage — **des configurations se perdent d'une session à
 * l'autre**. Les sept réglages vivent dans des colonnes de la table `zones`, et
 * une ligne de `zones` n'est pas stable d'un démarrage à l'autre : le serveur
 * porte tout un appareillage pour rattraper ce que la découverte lui fait subir
 * (`deduplicate`, `reparer_prefixe_local`, `merge_duplicate_settings`,
 * `reporter_reglages_de_doublons` — #1823, #1832). Cet appareillage existe
 * parce que le cas EST arrivé.
 *
 * Le bouton demandé a donc une fonction que le témoin n'avait pas : garder une
 * **seconde copie, ailleurs** (préférences synchronisées, clé = l'appareil),
 * que le sort d'une ligne de `zones` n'atteint pas. L'interdiction est levée ;
 * ce qu'elle protégeait ne l'est pas. Un bouton qui laisserait croire que rien
 * n'est appliqué avant de l'avoir pressé serait toujours un mensonge — d'où le
 * dernier bloc de ce fichier, qui exige que le texte d'aide dise l'inverse.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fr from '../locales/fr';
import en from '../locales/en';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const rc = () => sansCommentaires(lire('src/components/RendererConfig.svelte'));

describe('la sauvegarde automatique du renderer se VOIT', () => {
  it('🔴 un succès pose le témoin — avant, seul l’échec parlait', () => {
    const src = rc();
    expect(src, 'le succès ne laisse toujours aucune trace').toContain('enregistreLe = Date.now();');
    expect(src).toMatch(/<span class="rc-saved"[^>]*>\{\$t\('common\.saved'\)\}<\/span>/);
  });

  it('le témoin s’efface — un témoin permanent cesse d’être lu', () => {
    // Laissé à l'écran, il ne dirait plus rien du clic SUIVANT : on ne saurait
    // pas si le second réglage est passé.
    expect(rc()).toMatch(/setTimeout\(\(\) => \{ enregistreLe = 0; \}/);
    expect(rc(), 'deux clics rapides laisseraient deux minuteries en vol')
      .toContain('if (minuterie) clearTimeout(minuterie);');
  });

  it('l’échec continue de parler — on n’a rien remplacé', () => {
    expect(rc()).toContain("notifications.error($t('renderer.saveError'));");
  });

  it('🔴 les SEPT réglages s’écrivent toujours au clic, par le même `save`', () => {
    // C'est le vrai invariant, et le bouton d'enregistrement N'Y TOUCHE PAS :
    // si l'un des sept cessait d'écrire au clic, l'écran deviendrait un
    // formulaire à valider, ce que personne n'a demandé.
    const src = rc();
    const unitaires = src.match(/api\.updateZone(?!Reglages)\w+\(/g) ?? [];
    expect(unitaires.length, 'aucune écriture au clic trouvée : fichier déplacé ?')
      .toBeGreaterThanOrEqual(6);
    const horsSave = src
      .split(/api\.updateZone(?!Reglages)\w+\(/)
      .slice(0, -1)
      .filter((avant) => !/save\(\(\) => $/.test(avant));
    expect(horsSave, 'un réglage s’enregistre hors de `save` : il restera muet').toEqual([]);
  });

  it('le voisin du même onglet montre le même témoin — c’est la maison', () => {
    // Contre-épreuve du raisonnement : si `ZoneDeviceEditor` cessait de le
    // faire, ce fichier n'aurait plus de référence et devrait être relu.
    expect(sansCommentaires(lire('src/components/ZoneDeviceEditor.svelte')))
      .toContain("{$t('common.saved')}");
  });
});

describe('la configuration ENREGISTRÉE survit à la session', () => {
  it('🔴 l’écran porte un bouton d’enregistrement', () => {
    // Demande de Bertrand, deux fois : le 09/09 (« un bouton "sauvegarder mes
    // réglages" »), puis le 11/09 avec sa raison — les pertes entre sessions.
    expect(rc()).toContain("$t('renderer.saveConfig')");
    expect(rc(), "le bouton n'est pas branché").toContain('onclick={enregistrerConfig}');
  });

  it('🔴 la copie est rangée sous l’APPAREIL, jamais sous l’identifiant de zone', () => {
    // `zones.id` est précisément ce qui change quand la découverte recrée une
    // zone : ranger la copie dessous la perdrait dans le seul cas qu'on couvre.
    const src = rc();
    expect(src).toContain('cleAppareil(zone)');
    expect(src, "la clé ne doit pas se construire sur l'identifiant de zone")
      .not.toMatch(/ranger\([^)]*zone\.id/);
  });

  it('🔴 la copie n’est rangée qu’APRÈS le succès du patch', () => {
    // Garder une configuration que le serveur a refusée serait garder la preuve
    // de ce qui n'existe pas. Le `return` de la branche d'échec est l'invariant.
    const src = rc();
    const i = src.indexOf('async function enregistrerConfig');
    expect(i, 'enregistrerConfig a disparu').toBeGreaterThan(-1);
    const corps = src.slice(i, src.indexOf('\n  }', i));
    const patch = corps.indexOf('api.updateZoneReglages');
    const rangement = corps.indexOf('ranger(');
    expect(patch).toBeGreaterThan(-1);
    expect(rangement, 'le rangement doit suivre le patch').toBeGreaterThan(patch);
    expect(
      corps.slice(patch, rangement),
      "un échec doit sortir avant de ranger quoi que ce soit",
    ).toMatch(/catch\s*\{[\s\S]*return;/);
  });

  it('🔴 la remise en place patche la PAIRE WAV, pas le seul écart', () => {
    // `dlna_lpcm` et `dlna_wav24` sont exclusifs côté serveur. Le corps vient
    // de `corpsPatch`, qui porte toujours les deux ; le construire à partir des
    // écarts laisserait la zone porter la paire contradictoire.
    const src = rc();
    expect(src).toContain('corpsPatch(enregistre)');
    expect(src, 'un corps construit sur les écarts réintroduirait le défaut')
      .not.toMatch(/corpsPatch\(\s*divergences/);
  });

  it("l’écart est DÉRIVÉ de l’écran — il disparaît de lui-même après la remise en place", () => {
    // Posé à la main, le bandeau resterait affiché après avoir été traité, et
    // il n'y aurait aucune contre-épreuve à l'écran.
    expect(rc()).toMatch(/let divergences = \$derived\(/);
  });

  it('🔴 le texte d’aide dit que les réglages sont DÉJÀ appliqués', () => {
    // C'est ce que l'interdiction du 09/09 protégeait, et c'est ce qui reste
    // vrai : sans cette phrase, le bouton laisse croire que rien n'est écrit
    // tant qu'on ne l'a pas pressé, et le quitter sans l'avoir pressé donne
    // l'impression d'avoir tout perdu.
    expect(rc()).toContain("$t('renderer.saveConfigHint')");
    for (const [nom, dict] of [['fr', fr], ['en', en]] as const) {
      const aide = (dict as Record<string, string>)['renderer.saveConfigHint'];
      expect(aide, `renderer.saveConfigHint absente de ${nom}.ts`).toBeTruthy();
      expect(
        /déjà|already/i.test(aide),
        `en ${nom}, l'aide ne dit pas que les réglages sont déjà appliqués`,
      ).toBe(true);
    }
  });
});
