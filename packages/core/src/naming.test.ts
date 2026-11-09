import { describe, expect, it } from "vitest";
import { explainerFit, namedThings } from "./explainer-fit.js";
import { explainerObjectCeiling } from "./faceless-price.js";
import { namesThing, namingLanguageOf, NAMING_LANGUAGES } from "./naming.js";
import { scriptLanguageOf } from "./caption-language.js";

// #1284: the things a script names, in every language our voices speak. Lists of things count one per naming sentence; steps through
// software count none, which is what keeps their quote lean (#1277).

const LATTE = ["Did you know that if you pour steamed milk into espresso and it blooms into a white circle, that's a monk's head?",
  "Pull a line through that circle, and it's a heart.", "Stack two or three little hearts, and it's a tulip.",
  "Wiggle the jug side to side as you pull back, and it's a rosetta.", "Fold the layers around a tulip from the side, and it's a wing tulip.",
  "A rosetta as the wing, plus a curved neck and a small head? That's a swan.", "Two rosettas side by side, joined at the top, make a double rosetta.",
  "A long slow rosetta with fine, tight lines is a slow rosetta.", "Draw in the foam with a thin pin, and it's etching.",
  "Dust cocoa through a cut-out, and it's a stencil.", "So that's every latte art pattern in one minute. How many can you pour, and which one's yours?"].join("\n");
const BREWING = ["Did you know that if you pour hot water slowly over coffee in a paper cone, that's a pour-over?",
  "Steep coarse coffee for four minutes and press a metal filter down, and it's a French press.", "Push it through a paper filter with air in a plastic tube? That's an AeroPress.",
  "Let steam push water up through the coffee on the stove, and it's a moka pot.", "Simmer very fine coffee with water in a small long-handled pot, and it's Turkish coffee.",
  "A machine dripping water through a basket of grounds? That's drip coffee.", "Water rises into a glass globe, then falls back through the coffee: that's a siphon.",
  "Steep coarse coffee in cold water overnight, and it's cold brew.", "And nine bars of pressure for thirty seconds? That's an espresso.",
  "So that's every way to brew coffee in one minute. How many have you tried, and which one's yours?"].join("\n");
const REGULATOR = ["Bir voltaj regülatörünün içinde neler var? Kapağı birlikte açalım.", "Önce toroidal trafo: bakır sargılı, gerilimi ayarlayan ana parça.",
  "İçinde bir servo motor var, fırçayı doğru noktaya milim milim götürür.", "Karbon fırça ise akımı sargıya iletir.",
  "Sonra bir kontaktör gelir, tehlike anında devreyi hemen keser.", "Soğutma fanı, yoğun yükte bile cihazı serin tutar.",
  "Bir de ısı sensörü var, aşırı ısınmayı önceden haber verir.", "Dijital ekran, giriş ve çıkış voltajını anlık gösterir.",
  "Yanında bir sigorta durur, ani akım artışında devreyi korur.", "Bypass anahtarı sayesinde bakım sırasında evinizin elektriği kesilmez.",
  "Hepsi tek bir kabinde, evinizin voltajını iki yüz yirmi volta sabitler.", "Hangi parçayı merak ediyorsunuz? Yoruma yazın."].join("\n");
const HOW_TO = "Everyone says AI can write your summaries, but nobody shows you how. Here are three steps. First: open the chat and paste your call " +
  "notes. Second: type one line: summarize this in five bullets. Third: it reads, sorts, and checks every point. That's it. Try it on your next meeting. " +
  "Open it, paste, type, and press enter. Then share the summary in your team channel, so everyone reads the same five points before the next call " +
  "starts, and nobody asks what was decided. Save the chat, and the next meeting takes you two minutes instead of twenty.";
const EMAILS = "Three mistakes kill your cold emails. Mistake one: a long subject line. Keep it under six words. Mistake two: talking about yourself. " +
  "Open with their problem instead. Mistake three: no clear ask. End with one simple question. Fix these three, and replies double.";
const SHEET = "Here's how to share a sheet in ten seconds. Click Share in the top corner, paste your teammate's email, pick Editor from the menu and press " +
  "Send. They get a link right away, and you can remove them from the same menu whenever you like.";
const TR_HOW_TO = "Herkes yapay zekânın toplantı özetini yazabildiğini söylüyor ama kimse nasıl yapıldığını göstermiyor. İşte üç adım. Önce sohbeti aç ve " +
  "toplantı notlarını yapıştır. Sonra tek bir satır yaz: bunu beş maddede özetle. Üçüncü olarak her maddeyi kontrol et. Bu kadar. Bir sonraki toplantında dene. " +
  "Özeti ekip kanalında paylaş, herkes aynı beş maddeyi okusun. Sohbeti kaydet, bir sonraki toplantı iki dakika sürsün.";
const ESPRESSO = ["Did you know that if you force hot water through finely ground coffee for about thirty seconds, that's an espresso?",
  "Stop it early, with less water, and it's a ristretto.", "Let it run long, and it's a lungo.", "Two shots in one cup? That's a doppio.",
  "Top a shot with hot water, and it's an americano.", "Water first, then the shot on top? That's a long black.", "Just a spoonful of milk foam, and it's a macchiato.",
  "Equal parts espresso and warm milk is a cortado.", "A double shot with thin, velvety milk is a flat white.", "One shot, hot milk and a thick cap of foam is a cappuccino.",
  "More milk, less foam, and it's a latte.", "Add chocolate to that latte, and it's a mocha.", "And a shot poured over vanilla ice cream? That's an affogato.",
  "So that's every espresso drink in one minute. How many did you know, and which one's yours?"].join("\n");
const AGENT_AD = "I'm going to give you an AI agent that makes your video ads for you. And no, you don't have to comment a code word to get it. Here's the " +
  "whole thing. First, open Claude and connect Clipwright. That's one line. Then ask it to find reels that took off on your topic. It ranks them by views " +
  "against each creator's usual, so you copy what works, not who's big. Pick one. The agent breaks it down beat by beat and writes your script on that " +
  "structure, in your words. Before anything runs, it shows you the plan and the price. You say yes, and the finished video lands in your chat. No editor, " +
  "no timeline. Save this, and get four hundred twenty free credits at clipwright dot io.";
/** The brewing list and the summary how-to in each other language our voices speak: [language, list, how-to]. */
const OTHERS: [string, string, string][] = [
  ["es", "¿Sabías que si echas agua caliente sobre el café en un cono de papel, eso es un pour-over? Prensa el café con un filtro de metal y es una prensa " +
    "francesa. Deja que el vapor suba el agua en la estufa y es una moka. Agua fría toda la noche y es un cold brew. Y nueve bares durante treinta segundos " +
    "son un espresso. ¿Cuál es el tuyo?",
    "Todos dicen que la IA puede escribir tus resúmenes, pero nadie muestra cómo. Aquí tienes tres pasos. Primero: abre el chat y pega tus notas. Segundo: " +
    "escribe una línea: resume esto en cinco puntos. Tercero: lee, ordena y revisa cada punto. Eso es todo. Pruébalo en tu próxima reunión."],
  ["fr", "Tu savais que si tu verses de l'eau chaude sur le café dans un cône en papier, c'est un pour-over ? Presse le café avec un filtre en métal, et c'est " +
    "une cafetière à piston. Laisse la vapeur pousser l'eau sur le feu, et c'est une moka. De l'eau froide toute la nuit, et c'est un cold brew. Neuf bars " +
    "pendant trente secondes, c'est un espresso. Lequel est le tien ?",
    "Tout le monde dit que l'IA peut écrire tes résumés, mais personne ne montre comment. Voici trois étapes. D'abord : ouvre le chat et colle tes notes. " +
    "Ensuite : tape une ligne. Enfin : il lit, trie et vérifie chaque point. C'est tout. Essaie-le à ta prochaine réunion."],
  ["it", "Lo sapevi che se versi acqua calda sul caffè in un cono di carta, questo è un pour-over? Premi il caffè con un filtro di metallo, ed è una french " +
    "press. Lascia che il vapore spinga l'acqua sul fuoco, ed è una moka. Acqua fredda tutta la notte, ed è un cold brew. Nove bar per trenta secondi, ed è " +
    "un espresso. Qual è il tuo?",
    "Tutti dicono che l'IA può scrivere i tuoi riassunti, ma nessuno mostra come. Ecco tre passi. Primo: apri la chat e incolla le note. Secondo: scrivi una " +
    "riga. Terzo: legge, ordina e controlla ogni punto. Tutto qui. Provalo alla prossima riunione."],
  ["pt", "Você sabia que se você despeja água quente sobre o café num cone de papel, isso é um pour-over? Pressione o café com um filtro de metal, e é uma " +
    "prensa francesa. Deixe o vapor empurrar a água no fogão, e é uma moka. Água fria a noite toda, e é um cold brew. Nove bares por trinta segundos, e é um " +
    "espresso. Qual é o seu?",
    "Todo mundo diz que a IA pode escrever seus resumos, mas ninguém mostra como. Aqui estão três passos. Primeiro: abra o chat e cole suas notas. Segundo: " +
    "escreva uma linha. Terceiro: ele lê, ordena e confere cada ponto. É isso. Tente na sua próxima reunião."],
  ["ru", "Знаешь, что если пролить горячую воду через бумажный конус, это пуровер? Прижми кофе металлическим фильтром, и это френч-пресс. Пар толкает воду " +
    "вверх на плите, и это гейзерная кофеварка. Холодная вода на всю ночь, и это колд брю. Девять бар за тридцать секунд, и это эспрессо. А какой твой?",
    "Все хотят объясняющие мультики, но никто не говорит, как их собрать. Вот три шага. Первый: положи файл в папку своего проекта. Второй: напиши одну " +
    "строку. Третий: он разложит текст по словам, нарисует каждую сцену и сам проверит кадры. Вот и всё. Ставь и пробуй."],
];

describe("the things a script names, in every language we voice (#1284)", () => {
  /** Mutants: drop the bare-noun rule ("it's cold brew"), let it take a state ("it's done", "that's it"), or count a step label ("First:"). */
  it("counts English lists, bare names among them, and no software steps", () => {
    expect([namedThings(LATTE), namedThings(BREWING)]).toEqual([10, 9]);
    for (const text of [HOW_TO, EMAILS, SHEET]) expect(namedThings(text)).toBe(0);
    expect(["That's drip coffee.", "And it's cold brew.", "It's Turkish coffee."].map(s => namesThing(s, "en"))).toEqual([true, true, true]);
    expect(["That's it.", "And it's done.", "It's ready to go.", "First: open the chat.", "Mistake one: a long subject line.", "Save the chat, and wait.",
      "Water first, then the shot on top?"].map(s => namesThing(s, "en"))).toEqual([false, false, false, false, false, false, false]);
  });

  /** Mutant: the procedure kept English-only, and the Turkish regulator list (live, a customer waiting) reads as reasoning with no pictures. */
  it("counts the Turkish regulator's parts, and no Turkish software steps", () => {
    // Its nine parts in seven constructions ("Önce …:", "İçinde bir … var", "… ise", "Sonra bir … gelir", "Bir de … var", "Yanında bir … durur",
    // "… sayesinde"), and the regulator its hook names.
    expect([scriptLanguageOf(REGULATOR), namedThings(REGULATOR), explainerObjectCeiling(REGULATOR)]).toEqual(["tr", 10, 10]);
    expect(REGULATOR.split("\n").map(line => namesThing(line.split(/(?<=[.?])\s/u)[0]!, "tr"))).toEqual([true, true, true, true, true, true, true, true, true, true,
      false, false]);
    expect(explainerFit(REGULATOR)).toMatchObject({ fits: true, shape: "list" });
    expect(["Soğutma fanı, cihazı serin tutar.", "Sonra bir kontaktör gelir.", "Karbon fırça ise akımı iletir.", "Önce toroidal trafo: ana parça."]
      .map(s => namesThing(s, "tr"))).toEqual([true, true, true, true]);
    expect(["Sohbeti kaydet, bir sonraki toplantı başlasın.", "Sonra tek bir satır yaz: özetle.", "Bu kadar."].map(s => namesThing(s, "tr"))).toEqual([false, false, false]);
    expect(namedThings(TR_HOW_TO)).toBe(0);
  });

  /** Mutants: a language our voices speak left without rules, its function words not telling it from English, or its software steps counted. */
  it.each(OTHERS)("reads the %s brewing list as five named things and its software how-to as none", (language, list, howTo) => {
    expect([NAMING_LANGUAGES.includes(language), namingLanguageOf(list, scriptLanguageOf(list)), namingLanguageOf(howTo, scriptLanguageOf(howTo))])
      .toEqual([true, language, language]);
    expect([namedThings(list), explainerObjectCeiling(list), namedThings(howTo), explainerObjectCeiling(howTo)]).toEqual([5, 5, 0, 0]);
  });

  it("names nothing in steps that open on a verb, a figure or a numbered part, nor outside our languages", () => {
    // Codex r1: steps that open on another verb, a figure or a numbered part, in English and Russian, name nothing; nor does a Turkish state word.
    const steps = [
      "Delete rows, then save. Remove duplicates, then save. Fill cells, then save. Find errors, then save. Replace names, then save.",
      "Check the first row in the spreadsheet, it is 1. Check the second row in the spreadsheet, it is 2. Check the third row in the spreadsheet, it is 3. " +
        "Check the fourth row in the spreadsheet, it is 4.",
      "Part 1: open the chat. Part 2: paste the notes. Part 3: ask for bullets. Part 4: copy the summary.",
      "Откройте файл, затем сохраните. Нажмите кнопку, затем подождите. Выберите строку, затем удалите. Скопируйте текст, затем вставьте.",
    ];
    for (const text of steps) expect({ text: text.slice(0, 20), named: namedThings(text) }).toEqual({ text: text.slice(0, 20), named: 0 });
    expect(["O var, başla.", "Hepsi var, kaydet.", "Tek var, dene."].map(s => namesThing(s, "tr"))).toEqual([false, false, false]);
    // A word mixing letters and figures names a thing; a bare figure or a figure hyphened to a measure does not, nor does a question listing what goes in.
    expect(["That's a B-52.", "That's a 7UP.", "That's an iPhone 15.", "It is 1.", "Part 2: open the chat.", "That's a 10-minute job.", "It's a 3-step fix.",
      "And coffee liqueur, Irish cream and orange liqueur layered in a shot glass?"].map(s => namesThing(s, "en")))
      .toEqual([true, true, true, false, false, false, false, false]);
    // The cocktails reshoot names its eleven drinks, B-52 the last of them.
    const cocktails = "Shake espresso with vodka and coffee liqueur over ice, and that's an espresso martini. Pour a shot over vanilla ice cream, and it's an affogato. " +
      "Espresso over tonic water and ice? That's an espresso tonic. Shake espresso with ice and a little sugar until it foams, and it's a shakerato. " +
      "Hot coffee with Irish whiskey, sugar and a layer of cream is an Irish coffee. A shot of espresso with a splash of brandy is a caffè corretto. " +
      "Espresso shaken with a sweet vanilla liqueur over ice? That's a carajillo. Cold coffee with lemon and ice is a mazagran. " +
      "Coffee liqueur and vodka over ice, and it's a Black Russian. Add cream to it, and it's a White Russian. " +
      "And coffee liqueur, Irish cream and orange liqueur layered in a shot glass? That's a B-52. So that's every coffee cocktail in one minute.";
    expect([namedThings(cocktails), explainerObjectCeiling(cocktails)]).toEqual([11, 11]);
    // A language without rules names nothing, so its quote holds no picture: Japanese by its letters, German by none of our languages' words.
    expect(namesThing("これはエスプレッソです。", "ja")).toBe(false);
    const japanese = "これはエスプレッソです。これはラテです。これはモカです。これはカプチーノです。", german = "Öffne den Chat, dann warte. " +
      "Kopiere die Notizen, dann warte. Schreibe eine Zeile, dann warte. Teile die Zusammenfassung, dann warte. Der Filter: ein Sieb. Die Kanne: aus Glas.";
    expect([namingLanguageOf(japanese, scriptLanguageOf(japanese)), namedThings(japanese), explainerObjectCeiling(japanese)]).toEqual(["ja", 0, 0]);
    expect([namingLanguageOf(german, scriptLanguageOf(german)), namedThings(german), explainerObjectCeiling(german)]).toEqual(["und", 0, 0]);
    // Codex r1 (delta): three common words make a language, two do not; a label of four words before "sayesinde" is no name, three is.
    const kit = "Here is the brewing kit with tools. That's an urn. That's an oven. That's an icebox. That's an eggcup.";
    expect([namingLanguageOf(kit, "en"), namedThings(kit), namingLanguageOf("Here is the kit. That's an urn.", "en")]).toEqual(["en", 5, "und"]);
    expect(["Küçük kırmızı bypass anahtarı sayesinde elektrik kesilmez.", "Kırmızı bypass anahtarı sayesinde elektrik kesilmez."].map(s => namesThing(s, "tr")))
      .toEqual([false, true]);
  });

  /** The measured table (#1284, 2026-11-08): each row's named sentences and its object-picture ceiling. Mutant: any rule loosened or tightened. */
  it("holds the measured table of channel lists and software how-tos", () => {
    const rows: [string, string, number, number][] = [["en espresso", ESPRESSO, 13, 12], ["en brewing, bare nouns", BREWING, 9, 9], ["en latte art", LATTE, 10, 10],
      ["tr regulator", REGULATOR, 10, 10], ["en software how-to", HOW_TO, 0, 0], ["en cold-emails list", EMAILS, 0, 0], ["en sheet walkthrough", SHEET, 0, 0],
      ["en agent ad", AGENT_AD, 0, 0], ["tr software how-to", TR_HOW_TO, 0, 0]];
    expect(rows.map(([name, text]) => [name, namedThings(text), explainerObjectCeiling(text)])).toEqual(rows.map(([name, , named, ceiling]) => [name, named, ceiling]));
  });
});
