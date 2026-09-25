/**
 * Chantier « multicanal » — déclarer la disposition de canaux d'un appareil.
 *
 * Bertrand, 19/09/2026 : « dans les réglages de l'appareil, permettre la
 * sélection du nombre de canaux », pour des utilisateurs en 5.1 — *« Je ne
 * peux pas le tester chez moi »*.
 *
 * Mesuré sur le .18 : `max_channels` vaut `None` sur les quinze zones et
 * `GET /devices/audio` rend zéro sortie. Le serveur propose donc les NEUF
 * dispositions quand l'appareil se tait — sans quoi il n'y aurait rien à
 * sélectionner nulle part.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const vue = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
const api = readFileSync('src/lib/api.ts', 'utf8');
const types = readFileSync('src/lib/types.ts', 'utf8');

describe('multicanal — l\'appel', () => {
  it('un PATCH, et la chaîne vide revient au défaut', () => {
    const i = api.indexOf('export function updateZoneChannelLayout(');
    expect(i).toBeGreaterThan(0);
    const bloc = api.slice(i, api.indexOf('\n}', i));
    expect(bloc).toContain("method: 'PATCH'");
    expect(bloc).toContain('channel_layout: layout');
    // `layout` est une CHAÎNE, pas un booléen ni un nombre : c'est le nom
    // stable côté serveur, et la chaîne vide y supprime la clé.
    expect(api).toContain('updateZoneChannelLayout(id: number, layout: string)');
  });
});

describe('multicanal — l\'écran', () => {
  it('le sélecteur existe et propose ce que le SERVEUR offre', () => {
    expect(vue).toContain('z.channel_layouts_offered');
    expect(vue).toContain('api.updateZoneChannelLayout(z.id as number');
    expect(vue).toContain("zoneConfig.channelsFollow");
  });

  it('🔴 il lit le STATUT du serveur, il ne redérive pas la règle', () => {
    // Le bloc mono voisin redérive (`output_type !== 'local'`) et son propre
    // commentaire admet qu'il ignore la seconde contrainte du serveur. Deux
    // règles pour un même fait finissent par diverger.
    expect(vue).toContain('z.channel_layout_status?.unavailable');
    const i = vue.indexOf('api.updateZoneChannelLayout');
    const garde = vue.lastIndexOf('disabled=', i);
    // Fils 1914/1913 : le verrou passe par `canauxVerrouilles`, qui lit le
    // MÊME statut serveur (`unavailable` + `reason`) — un avertissement
    // (`au_dela_de_l_appareil`) n'y verrouille plus. Voir `vueZones.ts`.
    expect(vue.slice(garde, i)).toContain('canauxVerrouilles(z.channel_layout_status)');
    // Contre-épreuve : on ne refait PAS le test de localité pour ce contrôle.
    const j = vue.indexOf('{#if (z.channel_layouts_offered ?? []).length}');
    const k = vue.indexOf('</select>', j);
    expect(vue.slice(j, k)).not.toContain("output_type ?? '') !== 'local'");
  });

  it('🔴 le verrou ne dépend pas d\'un choix déjà fait', () => {
    // `unavailable` est vrai même quand rien n'est déclaré : la question est
    // « ce réglage a-t-il un sens ici ? », pas « a-t-on choisi ? ».
    expect(types).toContain('unavailable: boolean;');
    const i = types.indexOf('channel_layout_status?:');
    const bloc = types.slice(i, types.indexOf('};', i));
    for (const c of ['requested', 'effective', 'unavailable', 'reason', 'detail']) {
      expect(bloc, c).toContain(c);
    }
  });

  it('il DIT pourquoi, dans la langue de l’utilisateur', () => {
    // 🔴 Cette garde épinglait l'inverse : « `detail` est une phrase en clair :
    // un écran sans table de traduction peut l'afficher tel quel ». C'est vrai
    // d'un écran nu ; celui-ci en a une, et le résultat a été vu le 20/09/2026
    // sur une installation ANGLAISE — « cette zone ne sort pas par une carte
    // son locale… » au milieu de Settings › Devices.
    //
    // On lit donc le CODE (`reason`), que le serveur destine explicitement à
    // la machine (« le client les traduit », `canaux_declares.rs`), et jamais
    // la phrase. Voir `cleContrainteCanaux` dans `lib/vueZones`.
    expect(vue).toContain('cleContrainteCanaux(z.channel_layout_status?.reason)');
    expect(vue.replace(/<!--[\s\S]*?-->/g, '')).not.toContain('channel_layout_status?.detail');
  });

  it('rien ne s\'affiche si le serveur n\'offre rien', () => {
    // Un serveur antérieur ne publie pas `channel_layouts_offered` : le bloc
    // entier disparaît au lieu de rendre un sélecteur vide.
    expect(vue).toContain('{#if (z.channel_layouts_offered ?? []).length}');
  });
});

describe('multicanal — les clés dans les ONZE langues', () => {
  const LAYOUTS = ['mono', 'stereo', 'surround51', 'surround71', 'surround514',
    'surround714', 'surround916', 'immersive24', 'immersive32'];
  const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu'];

  for (const l of LANGUES) {
    it(l, () => {
      const src = readFileSync(`src/lib/locales/${l}.ts`, 'utf8');
      for (const c of ['zoneConfig.channelsTitle', 'zoneConfig.channelsFollow',
                       'zoneConfig.channelsUnavailable']) {
        expect(src, `${l} / ${c}`).toContain(c);
      }
      // Les NEUF dispositions du serveur, et pas une de moins : une entrée
      // manquante rendrait une option vide dans le sélecteur.
      for (const d of LAYOUTS) {
        expect(src, `${l} / channels_${d}`).toContain(`zoneConfig.channels_${d}`);
      }
    });
  }

  it('🔴 « mono » et « stéréo » sont TRADUITS, les sigles ne le sont pas', () => {
    const val = (l: string, k: string) =>
      (readFileSync(`src/lib/locales/${l}.ts`, 'utf8')
        .match(new RegExp(`"zoneConfig\\.channels_${k}":\\s*"([^"]*)"`)) ?? [])[1];
    // Ce sont des MOTS : ils diffèrent d'une langue à l'autre.
    expect(val('fr', 'stereo')).toBe('Stéréo');
    expect(val('en', 'stereo')).toBe('Stereo');
    expect(val('ja', 'stereo')).toBe('ステレオ');
    expect(val('zh', 'mono')).toBe('单声道');
    // 5.1 et 7.1.4 sont des SIGLES : identiques partout.
    for (const l of ['fr', 'en', 'ja', 'zh', 'hu']) {
      expect(val(l, 'surround51'), l).toBe('5.1');
    }
  });
});
