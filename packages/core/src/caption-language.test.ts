import { describe, expect, it } from "vitest";
import { captionLanguageOf } from "@clipwright/core";

describe("captionLanguageOf", () => {
  it.each([["Hello there", "en"], ["Zażółć gęślą", "pl"], ["Привет, мир", "ru"], ["Xin chào các bạn", "vi"], ["こんにちは世界", "ja"],
    ["你好世界", "zh"], ["안녕하세요", "ko"], ["Γεια σου", "el"], ["مرحبا", "ar"], ["नमस्ते", "hi"], ["வணக்கம்", "ta"]])("reads %s as %s", (text, language) => {
    expect(captionLanguageOf(text)).toBe(language);
  });
});
