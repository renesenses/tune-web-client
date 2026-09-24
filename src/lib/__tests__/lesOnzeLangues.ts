// Les onze dictionnaires, et RIEN d'autre — pour les bancs qui les prennent
// en espace de noms (`import * as LOCALES from './lesOnzeLangues'`) et
// comptent ses entrées : ils doivent en trouver onze, pas treize.
//
// Depuis tune-server-rust#4800 (cause 4), `locales/index.ts` n'exporte plus
// les dictionnaires : il ne porte que des `import()` — un chunk par langue.
// Ce fichier est le seul point où les onze sont importés en statique, à la
// collecte (#1308) ; `onzeDictionnaires.ts` y ajoute ses aides.
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it from '../locales/it';
import zh from '../locales/zh';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import hu from '../locales/hu';

export { fr, en, de, es, it, zh, ja, ko, ro, sv, hu };
