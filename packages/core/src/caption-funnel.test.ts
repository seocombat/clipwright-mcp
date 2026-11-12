import { describe, expect, it } from "vitest";

import { captionFunnel, captionFunnelWord } from "./caption-funnel.js";

describe("the word a reel asks viewers to comment (#1422)", () => {
  // Mutants: drop the quotes, the capitals or the word after it, or a language's verbs, and a funnel said in a caption, aloud or abroad goes unseen.
  it.each([
    ['Comment "LIST" and I\'ll send you the full list in your DMs.', "LIST"],
    ['Comment "list" and I\'ll send you the full list in your DMs.', "LIST"],
    ["comment list and I'll send you the guide", "LIST"],
    ["Comment guide for the template", "GUIDE"],
    ["Comment **EDITOR** for the repos", "EDITOR"],
    ["DM me SCRIPT to get it", "SCRIPT"],
    ["DM me the word PLAN", "PLAN"],
    ["COMMENT PROMPT FOR THE SCRIPT", "PROMPT"],
    ["Напиши «СМЕТА» в директ", "СМЕТА"],
    ["напиши в комментариях слово гайд и я пришлю его", "ГАЙД"],
    ["Напишіть у коментарях «ПЛАН»", "ПЛАН"],
    ["Comenta GUÍA y te la mando", "GUÍA"],
    ["Comente a palavra roteiro e eu te envio", "ROTEIRO"],
    ["Commente « LISTE » et je t'envoie tout", "LISTE"],
    ["Commentez LISTE en commentaire", "LISTE"],
    ["Schreib mir PLAN und ich schicke dir alles", "PLAN"],
    ["Commenta la parola GUIDA e ti mando il file", "GUIDA"],
    ["Napisz w komentarzu PLAN", "PLAN"],
    ["「LIST」とコメントしてください", "LIST"],
    ["LISTとコメント", "LIST"],
    ['"LIST" 댓글 남겨 주세요', "LIST"],
    ['"LIST" कमेंट करें', "LIST"],
    ["LIST लिखें कमेंट में", "LIST"],
    ['"LIST" கமெண்ட் செய்யுங்கள்', "LIST"],
    ["'LISTE' yaz, sana göndereyim", "LISTE"],
    ["LIST yorum yaz", "LIST"],
    ["评论“LIST”领取完整清单", "LIST"],
  ])("reads %j as %j", (text, word) => {
    expect(captionFunnelWord(text)).toBe(word);
  });

  // Mutants: take any word after a verb, or a shouted caption's every word, and an ordinary call to comment reads as a code word.
  it.each([
    ["Comment below what you think"], ["COMMENT YOUR THOUGHTS BELOW"], ["COMMENT BELOW"], ["comment your thoughts and I'll reply"],
    ["Drop your clips, Pick a style, Hit render"], ["Instagram comment input bar typing 'LIST' and showing sent status"],
    ["Send this to a friend"], ["Don't forget to follow."], ["напиши, что думаешь"], ["Комментируй ниже"], ["#bathroom #DIY"],
    ["Orbit, couch wall, UI world, frame break"], [""],
  ])("finds no code word in %j", text => {
    expect(captionFunnelWord(text)).toBeNull();
  });

  it("names any word as any, and reads nothing from no text", () => {
    expect([captionFunnelWord("Drop a 🔥 or comment anything"), captionFunnelWord(null), captionFunnelWord(undefined)]).toEqual(["any", null, null]);
  });

  // Mutant: end the word at the match's end, and a cut caption's last word reads as whole or a closing quote as cut.
  it("ends each word at its own last letter, whatever marks it", () => {
    expect(['Comment "LIST" now', "comment **EDITOR**", "comment list and I'll send", "「LIST」とコメント"].map(text => captionFunnel(text)?.end))
      .toEqual([13, 16, 12, 5]);
  });
});
