// The code word a text asks viewers to comment or send (#917, #1422), read by trend cards, creator profiles and reference analyses alike:
// "Comment LIST", a Russian "write «ESTIMATE»", a Japanese "「LIST」 then comment". Verb-first languages name it after the verb, verb-last ones before.

export const CAPTION_FUNNEL_MAX_CHARS = 24;

/** Imperatives that ask for a comment or a message, the word after them. */
const VERBS_FIRST = [
  "comment", "type", "drop", "dm", "message", "send", "reply", "write",
  "напиши", "напишите", "пиши", "пишите", "оставь", "оставьте", "отправь", "отправьте", "комментируй", "комментируйте",
  "напишіть", "залиш", "залиште", "коментуй", "коментуйте", "надішли", "надішліть",
  "comenta", "comente", "comentá", "escribe", "escriba", "escríbeme", "escreva", "escreve", "manda", "mande", "envía", "envie", "deja", "deixe",
  "commente", "commentez", "écris", "écrivez", "envoie", "envoyez", "tape", "tapez",
  "kommentiere", "kommentiert", "schreib", "schreibe", "schreibt", "sende", "schick", "schickt",
  "commenta", "commentate", "scrivi", "scrivete", "invia", "inviami",
  "skomentuj", "napisz", "wpisz", "wyślij", "komentuj",
  "typ", "schrijf", "stuur", "reageer",
  "komentujte", "napište", "napíšte", "kommentér", "skriv", "kommentera", "kommentoi", "kirjoita", "kommenteer",
  "comentează", "scrie", "írd", "kommenteld", "komentiraj", "napiši", "σχολίασε", "γράψε", "напишете", "коментирай",
  "komentari", "ketik", "tulis", "kirim", "bình luận", "comment mo", "i-comment", "評論", "评论", "留言", "私信",
] as const;
/** Verbs that close the ask in languages that put the verb last: the quoted or capital word comes just before. */
const VERBS_LAST = ["コメント", "書いて", "送って", "댓글", "남겨", "적어", "보내", "yaz", "yorum", "gönder", "कमेंट", "लिखें", "लिखो", "लिखिए", "எழுது", "கமெண்ட்"] as const;

/** Words between the verb and the code word: "DM me", "the word", "in the comments", in each language. */
const FILLER = new Set([
  "me", "us", "the", "a", "word", "below", "down", "in", "comments", "comment", "dms", "section", "here",
  "мне", "слово", "в", "комментариях", "комментарии", "комменты", "комментах", "директ", "личку", "ниже", "у", "коментарях", "мені",
  "la", "palabra", "en", "los", "comentarios", "abajo", "aquí", "por", "palavra", "nos", "comentários", "aqui", "no",
  "le", "mot", "commentaire", "commentaires", "moi", "dessous", "ci-dessous", "mir", "das", "wort", "die", "kommentare", "unten",
  "parola", "nei", "commenti", "qui", "sotto", "mi", "słowo", "w", "komentarzu", "komentarzach", "poniżej", "het", "woord", "de", "reacties", "hieronder",
]);
/** Words that are not a code word when nothing marks one: "comment your thoughts", and the same in each language. */
const NOT_A_CODE_WORD = new Set([
  "what", "your", "yours", "my", "if", "this", "that", "it", "them", "how", "why", "and", "or", "to", "for", "something", "which", "who", "where", "when",
  "follow", "like", "share", "save", "subscribe", "please", "now", "us", "me", "back", "you", "him", "her",
  "что", "если", "свой", "своё", "свои", "это", "как", "почему", "какой", "и", "или", "що", "якщо", "свою", "це",
  "lo", "que", "tu", "tus", "si", "qué", "o", "y", "e", "seu", "sua", "ce", "tes", "ton", "ta", "et", "ou", "dein", "deine", "was", "und", "oder",
  "il", "tuo", "tua", "che", "co", "czy", "i", "wat", "je", "jouw",
]);
/** What a viewer gets for the word, right after it: the mark of a code word in plain speech ("comment list and I'll send you…"). */
const AFTER_WORD = /^[\s,.!:;—–-]*(?:and i\b|and i'll|and i will|and we|and get|and you'll|and you will|to get|to receive|for the|for my|for a|for free|and receive|и я|и мы|и получи|и пришлю|и отправлю|чтобы получить|і я|щоб отримати|y te|y yo|y recibe|para recibir|e eu|e te|e receba|para receber|et je|et on|pour recevoir|und ich|und du|und erhalte|e ti|e io|per ricevere|a ja|i wyślę|żeby dostać|en ik|en ontvang)(?![\p{L}\p{N}])/u;

const QUOTES = "\"'“”‘’«»„「」『』";
/** A quoted word, with the space French puts inside « »; bold or italic marks quote it as well: `Comment **EDITOR**`. */
const MARK = `(?:[${QUOTES}] ?|\\*{1,2})`, UNMARK = `(?: ?[${QUOTES}]|\\*{1,2})`;
const QUOTED = new RegExp(`^${MARK}([\\p{L}\\p{N}][\\p{L}\\p{N}-]{0,22})${UNMARK}`, "u");
const CAPS = /^(\p{Lu}[\p{Lu}\p{N}]{1,22})(?![\p{L}\p{N}])/u;
const PLAIN = /^([\p{L}\p{N}][\p{L}\p{N}-]{1,22})(?![\p{L}\p{N}])/u;
const ANY = /^(?:anything|any word|any emoji|что угодно|любое слово|cualquier cosa|qualquer coisa|n'importe quoi)(?![\p{L}\p{N}])/u;
const literal = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A Latin, Cyrillic or Greek verb stands on word boundaries; a CJK, Hangul or Indic one has none to stand on. */
const bounded = (verb: string) => (/^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\s'-]+$/u.test(verb)
  ? `(?<![\\p{L}\\p{N}])${literal(verb)}(?![\\p{L}\\p{N}])` : literal(verb));
const VERB_FIRST = new RegExp(VERBS_FIRST.map(bounded).join("|"), "gu");
const VERB_LAST = new RegExp(`(?:${MARK}([\\p{L}\\p{N}][\\p{L}\\p{N}-]{0,22})${UNMARK}|(?<![\\p{L}\\p{N}])(\\p{Lu}[\\p{Lu}\\p{N}]{1,22})(?![\\p{Lu}\\p{Ll}\\p{N}]))`
  + `[^\\n]{0,12}?(?:${VERBS_LAST.map(literal).join("|")})`, "gu");

type Found = { word: string; end: number };

/** The word after a verb at `from`: past the filler, then quoted, in capitals (unless the verb shouts too), or plain with what the viewer gets. */
function wordAfter(text: string, lower: string, from: number, shouting: boolean): Found | null {
  let at = from;
  for (;;) {
    const gap = /^[\s:\-–—,]+/u.exec(lower.slice(at))?.[0].length ?? 0;
    const next = /^[\p{L}\p{N}'-]+/u.exec(lower.slice(at + gap))?.[0];
    if (next === undefined || !FILLER.has(next)) { at += gap; break; }
    at += gap + next.length;
  }
  const any = ANY.exec(lower.slice(at, at + 40));
  if (any) return { word: "any", end: at + any[0].length };
  const rest = text.slice(at, at + 40);
  const marked = QUOTED.exec(rest) ?? (shouting ? null : CAPS.exec(rest));
  if (marked) return { word: marked[1]!, end: at + marked[0].indexOf(marked[1]!) + marked[1]!.length };
  const plain = PLAIN.exec(rest)?.[1];
  if (plain === undefined || NOT_A_CODE_WORD.has(plain.toLowerCase())) return null;
  return AFTER_WORD.test(lower.slice(at + plain.length, at + plain.length + 40)) ? { word: plain, end: at + plain.length } : null;
}

/** The word a text asks viewers to comment or send (a caption, the spoken words or one screen text), upper case, with the offset its own last */
/** letter ends at, so a cut caption can tell a word it may have shortened; "any" for any word; else `null`. */
export function captionFunnel(text: string | null | undefined): Found | null {
  if (typeof text !== "string") return null;
  const lower = text.toLowerCase();
  // Lower case keeps every offset of these scripts; a text it would reshape is read no further.
  if (lower.length !== text.length) return null;
  for (const verb of lower.matchAll(VERB_FIRST)) {
    const said = text.slice(verb.index, verb.index + verb[0].length);
    // "DM" is written in capitals anyway; a longer verb in capitals means the whole line shouts.
    const found = wordAfter(text, lower, verb.index + verb[0].length, said.length > 2 && said === said.toUpperCase() && said !== said.toLowerCase());
    if (found) return { word: found.word === "any" ? "any" : found.word.toUpperCase(), end: found.end };
  }
  const last = VERB_LAST.exec(text);
  VERB_LAST.lastIndex = 0;
  if (!last) return null;
  const word = last[1] ?? last[2]!;
  return { word: word.toUpperCase(), end: last.index + last[0].indexOf(word) + word.length };
}

export const captionFunnelWord = (text: string | null | undefined): string | null => captionFunnel(text)?.word ?? null;
