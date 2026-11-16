import { expect, it } from "vitest";
import { facelessDirectedPictures, facelessQuote, quoteDirectedFaceless, type DirectedFacelessAsk } from "./faceless-price.js";

// #1573: two levels, pro every second live and standard a third (owner 15.11 ~18:55), each held with every live second at 20 and charged
// what it shows, 20 a second with readable text and 12 without (~20:00), fitted to max_credits in whole seconds.
const own8 = (over: Partial<DirectedFacelessAsk> = {}): DirectedFacelessAsk =>
  ({ outputFrames: 750, captions: true, ownPictures: 8, tier: "standard", resolution: "720p", ...over });
const brief = (over: Partial<DirectedFacelessAsk> = {}): DirectedFacelessAsk => own8({ ownPictures: 0, ...over });

/** Mutants: the caller's pictures not taken off the picture ceiling; the 60 line on any picture; pro's share left at a half; the hold at the
 *  plain rate; the expected total at the text rate. */
it("holds a 30 s video on eight own pictures at 326 standard and 726 pro, expecting 246 and 486; a brief at 458 and 858, expecting 378 and 618", () => {
  expect(quoteDirectedFaceless(own8()).quote).toEqual({ outputFrames: 750, baseCredits: 4 * 9 + 30, openerCredits: 0, totalCredits: 326,
    totalCreditsWithoutText: 246, tariffId: "faceless-parts-v2", captions: true, images: 4, imageCredits: 9, directionCredits: 60, shotSeconds: 10,
    shotCredits: 200 });
  expect(quoteDirectedFaceless(own8({ tier: "pro" }))).toMatchObject({ liveSecondsCeiling: 30, plainLiveSeconds: 30, stillsCeiling: 4,
    ownPicturesRun: true, quote: { totalCredits: 726, totalCreditsWithoutText: 486, shotSeconds: 30, shotCredits: 600 } });
  expect(quoteDirectedFaceless(brief()).quote).toMatchObject({ totalCredits: 458, totalCreditsWithoutText: 378, images: 12, directionCredits: 120 });
  expect(quoteDirectedFaceless(brief({ tier: "pro" })).quote).toMatchObject({ totalCredits: 858, totalCreditsWithoutText: 618, shotSeconds: 30 });
  // A few own pictures among many made ones is not a video on the caller's pictures: the full line. Half of them is (r1).
  expect(quoteDirectedFaceless(brief({ ownPictures: 5, tier: "pro" }))).toMatchObject({ ownPicturesRun: false, stillsCeiling: 7,
    quote: { directionCredits: 120, shotSeconds: 30, totalCredits: 213 + 600, totalCreditsWithoutText: 213 + 360 } });
  expect(quoteDirectedFaceless(brief({ ownPictures: 6 }))).toMatchObject({ ownPicturesRun: true,
    quote: { directionCredits: 60, totalCredits: 344, totalCreditsWithoutText: 264 } });
  expect(quoteDirectedFaceless(brief({ ownPictures: 6, tier: "pro" })).quote).toMatchObject({ totalCredits: 744, totalCreditsWithoutText: 504 });
  // A third of 31 s is 10 whole seconds; 90 s on pro plays all 90.
  expect(quoteDirectedFaceless(brief({ outputFrames: 775 })).quote.shotSeconds).toBe(10);
  expect(quoteDirectedFaceless(brief({ outputFrames: 2250, tier: "pro" })).quote).toMatchObject({ shotSeconds: 90, totalCredits: 426 + 1800,
    totalCreditsWithoutText: 426 + 1080 });
  for (const ask of [own8(), own8({ tier: "pro" }), brief({ outputFrames: 2250, tier: "pro" })]) {
    expect(facelessQuote.safeParse(quoteDirectedFaceless(ask).quote).success).toBe(true);
  }
});

/** Mutants: max_credits ignored; the cut rounding up past the budget; the fixed lines cut; the held seconds counted at the plain rate; the
 *  no-text charge counting more live seconds than the held ones (#1600). */
it("fits the held live seconds to max_credits in whole seconds at 20, and never expects more live seconds than it holds", () => {
  expect(quoteDirectedFaceless(own8({ tier: "pro", maxCredits: 212 }))).toMatchObject({ liveSecondsCeiling: 30, plainLiveSeconds: 4,
    quote: { shotSeconds: 4, shotCredits: 80, totalCredits: 206, totalCreditsWithoutText: 174 } });
  expect(quoteDirectedFaceless(own8({ maxCredits: 212 })).quote).toMatchObject({ shotSeconds: 4, totalCredits: 206, totalCreditsWithoutText: 174 });
  expect(quoteDirectedFaceless(own8({ maxCredits: 326 })).quote.totalCredits).toBe(326);
  expect(quoteDirectedFaceless(own8({ tier: "pro", maxCredits: 726 })).quote.totalCredits).toBe(726);
  expect(quoteDirectedFaceless(own8({ tier: "pro", maxCredits: 745 })).quote.totalCredits).toBe(726);
  // 20 short of the top: 29 seconds held, 29 played without text.
  expect(quoteDirectedFaceless(own8({ tier: "pro", maxCredits: 706 }))).toMatchObject({ plainLiveSeconds: 29,
    quote: { shotSeconds: 29, totalCredits: 706, totalCreditsWithoutText: 126 + 29 * 12 } });
  expect(quoteDirectedFaceless(own8({ tier: "pro", maxCredits: 100 })).quote).toMatchObject({ shotSeconds: 0, totalCredits: 126,
    totalCreditsWithoutText: 126 });
});

/** Mutants: music outside the hold; a 1080p video holding live seconds no 1080p shot can use. */
it("holds music beside the fixed lines and no live second at 1080p", () => {
  expect(quoteDirectedFaceless(own8({ music: { mood: "calm" }, tier: "pro", maxCredits: 212 })).quote)
    .toMatchObject({ musicCredits: 60, shotSeconds: 1, totalCredits: 126 + 60 + 20, totalCreditsWithoutText: 126 + 60 + 12 });
  expect(quoteDirectedFaceless(own8({ tier: "pro", resolution: "1080p" }))).toMatchObject({ liveSecondsCeiling: 0,
    quote: { shotSeconds: 0, totalCredits: 126, totalCreditsWithoutText: 126 } });
});

it("lets a video make one picture per 2.5 selected seconds, at most 24", () => {
  expect([30, 31, 60, 90].map(facelessDirectedPictures)).toEqual([12, 13, 24, 24]);
  expect(() => quoteDirectedFaceless(own8({ outputFrames: 760 }))).toThrow();
});
