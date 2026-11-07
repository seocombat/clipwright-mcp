import { z } from "zod";
import { frameCanvasOf } from "../ugc-layers.js";
import type { TemplateKind } from "./index.js";
import { centredArea, fullWidth, sizedScale, templateSize } from "./size.js";

/** The prompt's text at medium on a 1080 short side: its lowercase letters at least 36 px tall, as captions keep (#1128). */
export const CHAT_WINDOW_FONT_PX = 70;
/** Text sizes: the title bar, the prompt box (two lines), a reply card, the gap before each card and the padding; an answer (three lines), the
 * table's head row and each of its rows (#1119); the width is the full frame's. */
export const CHAT_WINDOW_EMS = { bar: 1.6, prompt: 3.6, reply: 3.4, gap: 0.45, pad: 0.6, answer: 3.4, head: 1.4, row: 1.5 } as const;
/** A zoom cut scales the window by this much; the content area is the zoomed window, so it never leaves the area, and the window between cuts
 * still spans most of a tall frame. */
export const CHAT_WINDOW_ZOOM = 1.1;
const reply = z.object({ title: z.string().min(1).max(32), body: z.string().min(1).max(64).optional(), at: z.string().min(1).max(200).optional() }).strict();
const answer = z.object({ text: z.string().min(1).max(150), at: z.string().min(1).max(200).optional() }).strict();
const row = z.object({ cells: z.array(z.string().min(1).max(20)).min(2).max(3), at: z.string().min(1).max(200).optional() }).strict();
const table = z.object({ columns: z.array(z.string().min(1).max(16)).min(2).max(3), rows: z.array(row).min(1).max(4) }).strict();
const data = z.object({ app: z.string().min(1).max(24).optional(), prompt: z.string().min(1).max(120), replies: z.array(reply).min(1).max(3).optional(),
  answer: answer.optional(), table: table.optional(), zoom: z.boolean().optional(), size: templateSize }).strict().superRefine((value, context) => {
  if (value.table && !value.answer) context.addIssue({ code: z.ZodIssueCode.custom, path: ["table"], message: "a table follows an answer: add answer" });
  for (const [index, entry] of (value.table?.rows ?? []).entries()) if (entry.cells.length !== value.table!.columns.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["table", "rows", index, "cells"], message: `a row takes one cell per column (${value.table!.columns.length})` });
  }
});
type Data = z.infer<typeof data>;

/** The window's height in text sizes: the prompt, the answer with its table's rows, then the reply cards. */
export function chatWindowEms(value: { replies?: readonly unknown[] | undefined; answer?: unknown; table?: { rows: readonly unknown[] } | undefined }): number {
  const { pad, bar, prompt, gap, reply, answer, head, row } = CHAT_WINDOW_EMS;
  return 2 * pad + bar + prompt + (value.answer === undefined ? 0 : gap + answer) + (value.table ? gap + head + value.table.rows.length * row : 0) +
    (value.replies?.length ?? 0) * (gap + reply);
}

/** A chat app on a full frame: the prompt types in with a cursor, then an answer streams in with its table, then reply cards, each on its beat. */
export const chatWindow: TemplateKind<typeof data> = {
  kind: "chat_window",
  kindVersion: 2,
  description: "a full-frame chat window: the prompt types in, the answer streams in word by word, its table opens row by row, then reply " +
    "cards pop in, each on its at or spread evenly; zoom true cuts in and out on the beats",
  placements: ["full"],
  data,
  text: { app: 24, prompt: 120, "replies.title": 32, "replies.body": 64, "answer.text": 150, "table.columns": 16, "table.rows.cells": 20 },
  quotes: ["answer.at", "table.rows.at", "replies.at"],
  // The window is in by frame 6 and the prompt types for at least 4 frames before the first card.
  beatsFrom: 10,
  slots: {},
  hidesCaptions: () => true,
  onInserts: false,
  rect: (value: Data, aspectRatio) => {
    const canvas = frameCanvasOf(aspectRatio), zoom = value.zoom ? CHAT_WINDOW_ZOOM : 1, ems = chatWindowEms(value) * zoom;
    const em = Math.min(CHAT_WINDOW_FONT_PX * sizedScale(value.size, canvas), (0.92 * canvas.height) / ems);
    return centredArea(canvas, fullWidth(value.size, canvas), ems * em);
  },
  sample: { app: "Assistant", prompt: "make 3 ads for my app", answer: { text: "Three scripts, one per hook, ready to render.", at: "writes" },
    table: { columns: ["Hook", "Length"], rows: [{ cells: ["Pain point", "20 s"], at: "renders" }] },
    replies: [{ title: "Ads rendering", body: "vertical, three languages", at: "connected" }], zoom: true },
};

/** Version 1: reply cards only; its footprint is version 2's for the same data. */
export const chatWindowV1 = { ...chatWindow, kindVersion: 1 } as TemplateKind<typeof data>;
