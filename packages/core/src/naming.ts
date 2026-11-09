// Whether a sentence of a script names a thing (#1284): one procedure over a rules table keyed by the script's language, for every language our
// voices speak. It counts an explainer's object pictures, so steps through software must name none: each rule is measured on both kinds.

interface NamingRules {
  /** A copula, naming verb or existential, then one of these and a word, names a thing: "is a cortado", "there's a fuse". */
  articles: readonly string[];
  frames: readonly string[];
  existential: readonly string[];
  /** Demonstrative copulas: a bare noun phrase of one to three words after them names a thing too ("it's cold brew"). */
  bare: readonly string[];
  /** Words that name a state, a pronoun or a quantity: no noun phrase starts or ends with one ("it's done", "that's it"). */
  states: readonly string[];
  /** Sequence words a label may open with, dropped before it is read ("Önce toroidal trafo:"). */
  sequence: readonly string[];
  /** Words that make a label a step or a point: numbers, step words, pronouns, imperatives ("Mistake one:", "Save the chat,"). */
  notThing: readonly string[];
  /** Topic markers and postpositions that close a label as a colon does (tr "ise", "sayesinde"). */
  topic: readonly string[];
  /** The verb comes last, so an existential follows its noun ("bir servo motor var"). */
  verbLast: boolean;
  /** An imperative's own ending, where the language marks one (the Russian polite imperative ending, fr "ouvrez"): a label with it is a step, whatever the verb. */
  imperative?: RegExp;
  /** The ending an object's case and a compound's possessive share (tr -ı -i -u -ü): which word carries it tells a step from a name. */
  caseEnding?: RegExp;
}

const EN_STATES = ["done", "ready", "easy", "simple", "fast", "quick", "free", "ok", "okay", "fine", "true", "false", "over", "on", "off", "here", "there",
  "it", "this", "that", "these", "those", "yours", "mine", "ours", "theirs", "his", "hers", "live", "possible", "impossible", "important", "enough", "better",
  "best", "worse", "worst", "right", "wrong", "open", "closed", "set", "finished", "saved", "all", "every", "each", "some", "no", "not", "my", "your", "our",
  "their", "its", "how", "why", "what", "where", "when", "who", "because", "so", "very", "really", "just", "also", "too", "still", "now", "working", "running",
  "loading", "gone", "back", "up", "down", "out", "in", "safe", "clear", "good", "bad", "great", "fun", "hard", "new", "old", "same", "different", "like",
  "about", "worth", "nothing", "everything", "something", "anything", "one", "two", "three", "time", "a", "an", "the"];
const EN_NOT_THING = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "step", "mistake", "tip", "rule", "way", "reason", "trick",
  "it", "you", "your", "we", "i", "they", "this", "that", "open", "type", "click", "tap", "paste", "add", "write", "put", "press", "choose", "select", "drag",
  "drop", "run", "install", "upload", "copy", "save", "keep", "use", "try", "avoid", "make", "check", "start", "end", "fix", "create", "turn", "move", "pick",
  "send", "ask", "record", "cut", "sort", "mark", "name", "enter", "connect", "share", "stop", "let", "top", "pour", "draw", "dust", "plug", "switch",
  "replace", "remove", "delete", "fill", "follow", "find", "post", "schedule", "change", "go", "get", "look", "read", "watch", "wait", "sign", "log", "edit",
  "drag", "scroll", "swipe", "hold", "set", "turn", "export", "import", "download", "rename", "sync", "merge", "split", "filter", "search", "paste", "part",
  "section", "chapter", "point", "lesson"];
const RULES: Readonly<Record<string, NamingRules>> = {
  en: { articles: ["a", "an", "the"], frames: ["is", "are", "called", "make", "makes", "meet"], existential: ["there's", "there is", "there are"],
    bare: ["it's", "that's", "this is", "it is", "that is", "these are", "they're", "called"], states: EN_STATES,
    sequence: ["first", "firstly", "second", "third", "then", "next", "after", "finally", "last", "lastly", "now", "so", "and", "but", "plus", "step"],
    notThing: EN_NOT_THING, topic: [], verbLast: false },
  tr: { articles: ["bir"], frames: [], existential: ["var", "vardır", "gelir", "durur", "bulunur"], bare: [], states: ["bu", "şu", "o", "her", "hepsi", "tek"],
    sequence: ["önce", "sonra", "ardından", "son", "olarak", "ilk", "ikinci", "üçüncü", "de", "ve", "ama"],
    notThing: ["bir", "iki", "üç", "dört", "beş", "adım", "hata", "ipucu", "kural", "yol", "neden", "sen", "siz", "biz", "ben", "bu", "şu", "aç", "yaz", "kaydet",
      "paylaş", "dene", "tıkla", "seç", "yapıştır", "kopyala", "gönder", "ekle", "sil", "gir", "bas", "yükle", "indir", "başlat", "kontrol", "et", "bak", "koy"],
    topic: ["ise", "sayesinde"], verbLast: true, caseEnding: /[ıiuü]$/u },
  es: { articles: ["un", "una", "el", "la", "los", "las"], frames: ["es", "son", "llama", "llamado", "llamada"], existential: ["hay"],
    bare: ["eso es", "esto es", "se llama"], states: ["fácil", "listo", "lista", "simple", "rápido", "gratis", "esto", "eso", "todo", "aquí", "así", "mejor", "bien",
      "mal", "muy", "más", "tan", "mío", "tuyo", "nuestro", "un", "una"],
    sequence: ["primero", "segundo", "tercero", "luego", "después", "entonces", "finalmente", "y", "pero", "paso"],
    notThing: ["uno", "dos", "tres", "cuatro", "cinco", "paso", "error", "consejo", "regla", "forma", "tú", "usted", "nosotros", "abre", "escribe", "haz", "pega",
      "pulsa", "elige", "guarda", "copia", "envía", "añade", "prueba", "comparte"], topic: [], verbLast: false },
  fr: { articles: ["un", "une", "le", "la", "les", "l'"], frames: ["est", "sont", "appelle", "appelé", "appelée"], existential: ["il y a"],
    bare: ["c'est", "ce sont", "s'appelle"], states: ["facile", "prêt", "prête", "simple", "rapide", "gratuit", "ça", "tout", "ici", "fini", "mieux", "bon",
      "bien", "très", "plus", "si", "un", "une", "le", "la", "tien", "tienne", "mien", "mienne"],
    sequence: ["abord", "ensuite", "puis", "enfin", "premier", "deuxième", "troisième", "et", "mais", "étape"],
    notThing: ["un", "deux", "trois", "quatre", "cinq", "étape", "erreur", "astuce", "règle", "façon", "tu", "vous", "nous", "ouvre", "ouvrez", "écris", "tape",
      "colle", "appuie", "choisis", "enregistre", "copie", "envoie", "ajoute", "essaie", "partage", "supprime", "remplis", "cherche", "trouve", "partie"],
    topic: [], verbLast: false, imperative: /\p{L}{2,}ez$/u },
  it: { articles: ["un", "una", "uno", "un'", "il", "lo", "la", "i", "gli", "le", "l'"], frames: ["è", "sono", "chiama", "chiamato", "chiamata"],
    existential: ["c'è", "ci sono"], bare: ["questo è", "ecco", "si chiama"], states: ["facile", "pronto", "pronta", "semplice", "veloce", "gratis", "tutto", "qui",
      "così", "meglio", "bene", "molto", "più", "un", "una", "tuo", "tua", "mio", "mia"],
    sequence: ["prima", "poi", "dopo", "infine", "primo", "secondo", "terzo", "e", "ma", "passo"],
    notThing: ["uno", "due", "tre", "quattro", "cinque", "passo", "errore", "consiglio", "regola", "modo", "tu", "voi", "noi", "apri", "scrivi", "incolla", "premi",
      "scegli", "salva", "copia", "invia", "aggiungi", "prova", "condividi"], topic: [], verbLast: false },
  pt: { articles: ["um", "uma", "o", "a", "os", "as"], frames: ["é", "são", "chama", "chamado", "chamada"], existential: ["há", "tem"],
    bare: ["isso é", "isto é", "se chama"], states: ["fácil", "pronto", "pronta", "simples", "rápido", "grátis", "isso", "tudo", "aqui", "assim", "melhor",
      "bem", "muito", "mais", "um", "uma", "o", "a", "seu", "sua", "meu", "minha"],
    sequence: ["primeiro", "segundo", "terceiro", "depois", "então", "finalmente", "e", "mas", "passo"],
    notThing: ["um", "dois", "três", "quatro", "cinco", "passo", "erro", "dica", "regra", "forma", "você", "nós", "abra", "escreva", "cole", "aperte", "escolha",
      "salve", "copie", "envie", "adicione", "tente", "compartilhe"], topic: [], verbLast: false },
  ru: { articles: [], frames: [], existential: [], bare: ["это", "называется", "это и есть"],
    states: ["готово", "просто", "легко", "всё", "все", "так", "здесь", "тут", "оно", "он", "она", "они", "мой", "твой", "наш", "ваш", "быстро", "бесплатно",
      "важно", "хорошо", "лучше", "не", "очень", "и", "а", "но", "как", "что", "то"],
    sequence: ["сначала", "потом", "затем", "дальше", "наконец", "первый", "второй", "третий", "шаг", "и", "а", "но"],
    notThing: ["один", "два", "три", "четыре", "пять", "шаг", "ошибка", "совет", "правило", "способ", "ты", "вы", "мы", "я", "открой", "нажми", "вставь", "напиши",
      "положи", "добавь", "выбери", "сохрани", "проверь", "запусти", "скопируй", "введи", "сделай", "возьми", "перетащи", "поставь", "включи", "выключи",
      "загрузи", "отправь", "запиши", "убери", "удали", "заполни", "найди", "начни", "закончи", "держи", "используй", "попробуй", "подключи", "замени", "отметь",
      "назови", "спроси", "открывай", "пиши", "ставь", "делай", "пробуй", "часть", "пункт"], topic: [], verbLast: false, imperative: /(?:йте|ите|ьте)$/u },
};

/** The languages whose sentences can name a thing; any other names none. */
export const NAMING_LANGUAGES = Object.keys(RULES);

/** The most common words of each Latin-script language: the letters alone do not tell Spanish from English or Portuguese (the font table reads
 * them all as Latin), so the script's own words do. */
const COMMON: Readonly<Record<string, readonly string[]>> = {
  en: ["the", "and", "is", "it", "you", "to", "of", "that", "in", "with"], es: ["el", "la", "y", "es", "que", "de", "en", "los", "un", "una", "con"],
  fr: ["le", "la", "et", "est", "que", "de", "les", "un", "une", "des", "avec"], it: ["il", "la", "e", "è", "che", "di", "un", "una", "per", "con"],
  pt: ["o", "a", "e", "é", "que", "de", "um", "uma", "os", "do", "com"], tr: ["ve", "bir", "bu", "için", "ile", "da", "de", "çok", "ama"],
};
/** A Latin script uses at least this many of its language's common words, or it is none of ours and names nothing (German, Dutch). */
const COMMON_MIN = 3;
/** The language whose rules read a script: its letters when they decide (Cyrillic, Turkish), else the Latin language whose common words it uses most. */
export function namingLanguageOf(script: string, letters: string): string {
  // The font table reads every Latin script as en, pl or vi (French â and ê read as vi), so those are told apart by their words.
  if (!["en", "pl", "vi"].includes(letters)) return letters;
  const words = script.toLocaleLowerCase().match(/[\p{L}']+/gu) ?? [];
  const [best, count] = Object.entries(COMMON).map(([language, common]) => [language, words.filter(w => common.includes(w)).length] as const)
    .reduce((top, next) => (next[1] > top[1] ? next : top));
  return count >= COMMON_MIN ? best : "und";
}

/** A clause's words in its language's lower case; an elided article stands apart ("l'espresso" is "l'" and "espresso"), "it's" stays whole. */
function wordsOf(text: string, language: string): string[] {
  return (text.toLocaleLowerCase(language).replace(/’/g, "'").match(/[\p{L}\p{N}'-]+/gu) ?? [])
    .flatMap(w => { const m = /^(\p{L}{1,2}')(\p{L}{2,}.*)$/u.exec(w); return m ? [m[1]!, m[2]!] : [w]; }).filter(w => w !== "'");
}

/** Whether one sentence names a thing, by the rules of its script's language. */
export function namesThing(sentence: string, language: string): boolean {
  const r = RULES[language];
  if (!r) return false;
  const clauses = sentence.split(/[,;:?!.…]/u).map(clause => wordsOf(clause, language));
  const after = (lead: string) => {
    const lw = wordsOf(lead, language), out: string[][] = [];
    for (const ws of clauses) for (let i = 0; i + lw.length <= ws.length; i++) if (lw.every((w, k) => ws[i + k] === w)) out.push(ws.slice(i + lw.length));
    return out;
  };
  // A bare figure names a count ("it is 1", "Part 2:"), and a figure hyphened to a word names a measure ("a 10-minute job"); a word mixing
  // letters and figures otherwise is a name ("a B-52", "a 7UP").
  const noun = (w: string | undefined) => w !== undefined && !r.states.includes(w) && /\p{L}/u.test(w) && !/^\p{N}+-/u.test(w);
  // A bare phrase has no article to vouch for it, so a number, a step word or a pronoun at either end keeps it out too ("ecco tre passi").
  const bareNoun = (w: string | undefined) => noun(w) && !r.notThing.includes(w!);
  const step = (w: string) => !noun(w) || r.notThing.includes(w) || r.sequence.includes(w) || (r.imperative?.test(w) ?? false);
  for (const lead of [...r.frames, ...r.bare, ...r.existential]) for (const rest of after(lead)) if (r.articles.includes(rest[0] ?? "") && noun(rest[1])) return true;
  for (const lead of r.bare) for (const rest of after(lead)) if (rest.length >= 1 && rest.length <= 3 && bareNoun(rest[0]) && bareNoun(rest.at(-1))) return true;
  if (r.verbLast) for (const ws of clauses) {
    const at = ws.findIndex(w => r.existential.includes(w));
    if (at > 0 && ws.slice(0, at).some((w, i, all) => r.articles.includes(w) && noun(all[i + 1]))) return true;
    if (at > 0 && at <= 3 && ws.slice(0, at).every(w => !step(w))) return true;
  }
  // A label names a thing only where the language's word order tells a noun phrase from a step (#1285). Where the verb comes first, a step reads
  // "Duplicate rows," exactly as a name reads "Cold brew,", and no closed verb list can hold every verb, so there a label never names.
  if (!r.verbLast || !r.caseEnding) return false;
  const topic = r.topic.length ? `|\\s(?:${r.topic.join("|")})\\s` : "";
  const head = new RegExp(`^\\s*([^,:;.?!]+?)\\s*(?:[,:]${topic})`, "u").exec(sentence)?.[1] ?? "";
  let label = wordsOf(head, language).filter(w => !w.endsWith("'"));
  while (label.length && r.sequence.includes(label[0]!)) label = label.slice(1);
  // Where the verb comes last, a step is an object then its verb: the object carries the case ending and the bare verb closes the label
  // ("Sohbeti kaydet"); a compound name carries its ending on the last word ("Soğutma fanı", "Isı sensörü"). One word alone tells neither.
  const objectThenVerb = label.slice(0, -1).some(w => r.caseEnding!.test(w)) && !r.caseEnding.test(label.at(-1)!);
  // A sequence word left inside the label makes it a step, not a name.
  return label.length >= 2 && label.length <= 3 && !objectThenVerb && label.every(w => !step(w));
}
