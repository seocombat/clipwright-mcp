import { describe, expect, it } from "vitest";
import { captionLanguageOf, scriptLanguageOf } from "@clipwright/core";

describe("scriptLanguageOf (narrator choice)", () => {
  // Mutants: Turkish left as the font table's Polish, a Polish or Romanian text read as Turkish, or another script's answer changed.
  it.each([["Çocuğun yağmurda şemsiyesiz", "tr"], ["Hızlı ve güzel bir çözüm", "tr"], ["Şimdi öğrenin", "tr"], ["İstanbul'da bir gün", "tr"],
    ["Şeker", "tr"], ["Kâr ve şeker", "tr"], ["Hâlâ şimdi", "tr"], ["Dükkânım için hâlâ şemsiye", "tr"], ["Kâr ağaç", "tr"], ["Xin chào, tôi là ngườı", "vi"], ["ağaç ơn", "vi"], ["Ağaç ưa nước", "vi"], ["Şi țara", "pl"], ["Şi Ștefan", "pl"], ["Zażółć gęślą jaźń", "pl"], ["Hello there", "en"], ["Привет, мир", "ru"], ["Xin chào các bạn", "vi"],
    ["Zażółć şemsiye", "pl"], ["Gönderi çok güzel", "pl"]])("reads %s as %s", (text, language) => {
    expect(scriptLanguageOf(text)).toBe(language);
  });

  it("leaves the caption language alone: Turkish captions keep the latin-ext table row", () => {
    expect(captionLanguageOf("Çocuğun yağmurda şemsiyesiz")).toBe("pl");
  });
});

describe("captionLanguageOf", () => {
  it.each([["Hello there", "en"], ["Zażółć gęślą", "pl"], ["Привет, мир", "ru"], ["Xin chào các bạn", "vi"], ["こんにちは世界", "ja"],
    ["你好世界", "zh"], ["안녕하세요", "ko"], ["Γεια σου", "el"], ["مرحبا", "ar"], ["नमस्ते", "hi"], ["வணக்கம்", "ta"]])("reads %s as %s", (text, language) => {
    expect(captionLanguageOf(text)).toBe(language);
  });
});
