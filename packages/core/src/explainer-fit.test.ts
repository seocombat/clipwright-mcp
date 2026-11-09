import { describe, expect, it } from "vitest";
import { explainerFit } from "./explainer-fit.js";

const fits = (script: string) => explainerFit(script);

describe("explainer format fit (#1216)", () => {
  it("takes a how-to by steps, an N-mistakes list and a tool walkthrough, in English and Russian", () => {
    expect(fits("Everyone says AI can write your summaries, but nobody shows you how. Here are three steps. First: open the chat and paste your call " +
      "notes. Second: type one line: summarize this in five bullets. Third: it reads, sorts, and checks every point. That's it. Try it on your next meeting."))
      .toMatchObject({ fits: true, shape: "steps", misfit: null });
    expect(fits("Three mistakes kill your cold emails. Mistake one: a long subject line. Keep it under six words. Mistake two: talking about yourself. " +
      "Open with their problem instead. Mistake three: no clear ask. End with one simple question. Fix these three, and replies double."))
      .toMatchObject({ fits: true, shape: "list" });
    expect(fits("Here's how to share a sheet in ten seconds. Click Share in the top corner, paste your teammate's email, pick Editor from the menu and press " +
      "Send. They get a link right away, and you can remove them from the same menu whenever you like."))
      .toMatchObject({ fits: true, shape: "walkthrough" });
    expect(fits("Все хотят объясняющие мультики, но никто не говорит, как их собрать. Вот три шага. Первый: положи файл в папку своего проекта. " +
      "Второй: напиши одну строку. Третий: он разложит текст по словам, нарисует каждую сцену и сам проверит кадры. Вот и всё. Ставь и пробуй."))
      .toMatchObject({ fits: true, shape: "steps" });
  });

  /** Mutant: drop a misfit branch and its script is offered the format. */
  it("refuses reasoning, a dialogue and a story about people, each with its reason and a rewrite into actions", () => {
    const reasoning = fits("Success is less about talent than about patience. Most people overestimate what they can do in a year and underestimate " +
      "what a decade of quiet effort brings. Ambition matters, yet the real advantage is staying curious when nothing seems to change.");
    const dialogue = fits("Anna: Did you see the new pricing?\nMark: Yes, it looks cheaper than last year.\nAnna: I think it is a trap.\nMark: Maybe, " +
      "but customers seem happy so far, and the reviews are good.");
    const story = fits("Last summer my friend Tom moved to Lisbon. He found a tiny flat near the river and she visited him in August. They walked the " +
      "old streets every night, talked about the years they had lost, and laughed at how little had changed since school.");
    expect([reasoning, dialogue, story].map(f => [f.fits, f.misfit])).toEqual([[false, "reasoning"], [false, "dialogue"], [false, "story"]]);
    for (const f of [reasoning, dialogue, story]) expect(f.rewrite).toMatch(/steps/);
  });

  /** Mutant: move the minute's ceiling, and a 61 s walkthrough is taken or a 59 s one refused. */
  it("takes a walkthrough up to 60 s and asks to cut one just past it", () => {
    const steps = (words: number) => Array.from({ length: Math.ceil(words / 5) + 1 }, (_, i) => `Step ${i + 1}: open, click save.`).join(" ").split(" ").slice(0, words).join(" ");
    expect(explainerFit(steps(148))).toMatchObject({ fits: true });
    expect(explainerFit(steps(153))).toMatchObject({ fits: false, misfit: "too_long" });
  });

  const latteArt = [
    "Did you know that if you pour steamed milk into espresso and it blooms into a white circle, that's a monk's head?",
    "Pull a line through that circle, and it's a heart.", "Stack two or three little hearts, and it's a tulip.",
    "Wiggle the jug side to side as you pull back, and it's a rosetta.", "Fold the layers around a tulip from the side, and it's a wing tulip.",
    "A rosetta as the wing, plus a curved neck and a small head? That's a swan.", "Two rosettas side by side, joined at the top, make a double rosetta.",
    "A long slow rosetta with fine, tight lines is a slow rosetta.", "Draw in the foam with a thin pin, and it's etching.",
    "Dust cocoa through a cut-out, and it's a stencil.", "So that's every latte art pattern in one minute. How many can you pour, and which one's yours?"].join("\n");
  const opinion = "I have been thinking about why remote work divides people so sharply, and I believe the honest answer is more complicated than either " +
    "side admits. Supporters say it gives them freedom and time with their families. Critics say it weakens friendships and hides unfair expectations. " +
    "Both groups point to evidence that seems solid, yet the evidence mostly reflects the kind of company that was studied rather than the arrangement " +
    "itself. A small team with clear goals tends to do well anywhere. A large organisation with vague goals struggles whether people sit together or " +
    "apart. So the real question is not about offices at all, it is about trust, communication and how decisions get explained. Until leaders face that, " +
    "the argument will go on and nobody will feel convinced by the other side.";

  // #1276. Mutants: drop the naming rule, and the latte-art list reasons without actions; loosen it, and an argument with a few "that's a" lines is a list.
  it("takes a list where each line names a thing to show, and still refuses a script that only argues", () => {
    expect(fits(latteArt)).toMatchObject({ fits: true, shape: "list", misfit: null });
    expect(explainerFit(latteArt, 3.606)).toMatchObject({ fits: true, shape: "list" });
    expect(opinion.split(/\s+/).length).toBeGreaterThan(120);
    expect(fits(opinion)).toMatchObject({ fits: false, misfit: "reasoning" });
    const thin = `${opinion} That's a mistake. It's a habit. This is a trap.`;
    expect(fits(thin)).toMatchObject({ fits: false });
  });

  // Mutants: raise the naming count above 4 or the share above 40%, and a list with four naming lines out of ten stops fitting; lower either, and three of ten fit.
  it("takes a list at four naming lines in ten and not at three", () => {
    const ten = (n: number) => [...Array.from({ length: n }, (_, i) => `Fold the foam over the milk and it's a pattern number ${i}.`),
      ...Array.from({ length: 10 - n }, () => "Honestly I think the whole idea depends on mood and taste, not on method.")].join("\n");
    expect(fits(ten(4))).toMatchObject({ fits: true, shape: "list" });
    expect(fits(ten(3))).toMatchObject({ fits: false });
  });

  // #1275. Mutant: ignore the pace, and a fast voice's 150 words still read as a minute.
  it("judges the length at the pace of the voice that will speak", () => {
    const steps = Array.from({ length: 40 }, (_, i) => `Step ${i + 1}: open, click save.`).join(" ").split(" ").slice(0, 155).join(" ");
    expect(explainerFit(steps)).toMatchObject({ fits: false, misfit: "too_long" });
    expect(explainerFit(steps, 3.606)).toMatchObject({ fits: true });
    expect(explainerFit(steps, 2.4)).toMatchObject({ fits: false, misfit: "too_long" });
  });

  it("asks to cut a script past a minute and refuses one too short to walk through", () => {
    const long = fits(Array.from({ length: 40 }, (_, i) => `Step ${i + 1}: open the panel and click save.`).join(" "));
    expect([long.fits, long.misfit, long.rewrite]).toEqual([false, "too_long", "Cut it to the hook, three to five steps and the result: 20 to 45 seconds."]);
    expect(fits("Open the app.")).toMatchObject({ fits: false, misfit: "too_short" });
  });
});
