import { CAPTION_STYLE_ALIASES } from "./skills.js";
import { type TEMPLATE_KIND_IDS, TEMPLATE_KINDS, TEMPLATE_SIZES, templateDataText, type TemplateKind } from "./templates/index.js";
import { MAX_OVERLAYS_AT_ONCE } from "./ugc-layers.js";
import { SCRIPT_LENGTH_DESCRIPTION } from "./voices.js";

// MCP tools/list stays under the client's 102 KB (#1003), so quote_ugc carries these shorter texts; REST and OpenAPI keep the full ones (#1045).

/** What each kind is, in a few words, with the rules its data alone does not say; null where its name and data say it all. */
const TEMPLATE_GISTS: Record<(typeof TEMPLATE_KIND_IDS)[number], string | null> = {
  tag: "a short pill; without position it sits in the caption spot",
  lower_third: null,
  end_card: "a site pill and call to action in the caption spot",
  title_card: "a hook card",
  quote: "a quote card",
  stat: "a number counting from 0 to value (2 decimals); over sits at chest level",
  callout: "an arrow or ring on target {x,y}, % of the frame from top left; may point at the face",
  checklist: "rows a cursor clicks in turn (item: row index from 0), each click flipping it",
  phone_call: "an incoming call at the side (right unless side left), answered on answer_at",
  compare: "before, then after sweeping or wiping in on reveal_at, on a 3:5 card",
  notification: "at the top; stack cards drop in on their at",
  progress: "steps checked in turn on advance_at (one per step) or evenly",
  rating: "stars filling up to stars (1–5 in halves)",
  chat_window: "the prompt types in; answer, table rows, cards each on its at or evenly; zoom cuts on them",
  video_grid: "9:16 video tiles popping in turn: 2x2 takes cell_1–4, 3x1 cell_1–3",
  word_title: "the first entry from the start, each later one on its at quote or evenly, replacing the last or (build) adding to it",
  phone_screen: "a phone whose screen states change on states.at or evenly; lock, play, liked replace one another, tags add up, counter and timer stay",
  terminal: "the command types in, the diff changes on diff.at, a checked status on at",
  pointer_chips: "chips in a column below the face, each with a line to target {x,y} (% of the frame), in turn on items.at or evenly",
  chart: null,
  race: null,
  hand_title: "handwritten; mark.word: index from 0",
  word_fill: "one word whose letters show your clip",
};

const SIZE_FIELD = `, size? ${TEMPLATE_SIZES.join("|")}`;

/** The templates catalog in fewer words: every kind's data fields as the full catalog names them. */
export function compactTemplateCatalogText(kinds: readonly TemplateKind[] = TEMPLATE_KINDS): string {
  const sized = kinds.every(kind => templateDataText(kind).includes(SIZE_FIELD));
  const data = (kind: TemplateKind) => (sized ? templateDataText(kind).replace(SIZE_FIELD, "") : templateDataText(kind));
  return "Graphic templates { id, kind, anchor, cover_words?, placement?, transition?, data }, on any script run; price unchanged, a covered " +
    "presenter still billed. Ids unique across inserts, overlays, layout_windows and templates. Text: one line of Latin or the " +
    "script's letters, digits and punctuation, no emoji; a wide CJK glyph counts 2. " +
    (sized ? `Every kind's data also takes size? ${TEMPLATE_SIZES.join("|")} (absent: medium). ` : "") +
    "A media field is { asset_id } of a ready asset of that type. An inner quote is a string of words inside the template's own, after the previous " +
    "one, its beat on their first word, not under an insert or full-frame template; without one, clicks and steps spread evenly. A template " +
    "on the caption band hides captions. A full-frame one hides the presenter, overlays and over templates and never meets a wipe or zoom " +
    `insert. At most ${MAX_OVERLAYS_AT_ONCE} overlays and over templates at once, not overlapping. template_theme sets their look. Kinds: ` +
    kinds.map(kind => {
      const gist = kind.kind in TEMPLATE_GISTS ? TEMPLATE_GISTS[kind.kind as keyof typeof TEMPLATE_GISTS] : kind.description;
      return `${kind.kind} (${kind.placements.join("|")})${gist === null ? "" : `: ${gist}`}; data ${data(kind)}`;
    }).join(". ") + ".";
}

const CAPTION_STYLE_TEXT = "Caption look when captions=true; hormozi is the default. " +
  Object.entries(CAPTION_STYLE_ALIASES).map(([alias, preset]) => `${alias} draws ${preset}`).join("; ") +
  ". Every style's look and preview: https://clipwright.io/captions";

const SCRIPT_TEXT = "The words the actor says; required unless segments supplies the spoken text. Segments and text-anchored inserts require " +
  `long-form qualification on the server. ${SCRIPT_LENGTH_DESCRIPTION} ` +
  "Russian stress: a capital vowel inside a lowercase word (\"потОм\") reaches eleven_v4 and gemini-3.8-flash-tts as the mark U+0301; a " +
  "typed mark is kept; a word-initial capital, all caps or a second capital is left as it is, so write \"Яндекс Еда\", not \"ЯндексЕда\". " +
  "Tell users writing in Russian. eleven_flash_v2_5 and eleven_turbo_v2_5 cost less but misread stress marks.";

/** quote_ugc's shorter text per field; a field not named keeps the full text REST and OpenAPI carry. */
export const MCP_UGC_DESCRIPTIONS = {
  script: SCRIPT_TEXT,
  tts_model: "Speech model; omitted, the chosen voice's (list_voices), eleven_v4 for presets, catalog voices and voice_id. eleven_v3 " +
    "speaks eleven_v4 with a warning. eleven_v4 and gemini-3.8-flash-tts read stress marks (see script); eleven_flash_v2_5 and " +
    "eleven_turbo_v2_5 are cheaper outside Russian. gemini-3.8-flash-tts speaks only its own voices (default kore for a female actor, " +
    "else charon), has no word timings or audio tags, and refuses preset and catalog voices, voice_id, captions=true, segments and " +
    "inserts before any charge.",
  caption_style: CAPTION_STYLE_TEXT,
  templates: compactTemplateCatalogText(),
  caption_emphasis: "Script words or phrases to emphasise, every occurrence, matched as an insert quote. An item is the quote or " +
    "{ quote, look }: punch (a lead-in line over a large glowing keyword), pill (alone in a pill), color (accent colour) or box (soft " +
    "accent box). Without look: punch draws punch, hormozi and accent color, others larger in their highlight colour. Needs " +
    "captions=true; a quote not in script is refused before any charge.",
  voice: "Voice name from list_voices (presets sarah | george | eric | daria_ru_female); another name is refused before any charge. " +
    "Omitted: the default voice of the actor's gender (actor_id's or actor_gender's; george for the default actor and for image " +
    "alone). A gemini-3.8-flash-tts voice selects that model; a tts_model not speaking the voice is refused. Not with voice_id.",
  inserts: "Text-anchored image or video inserts over the narration, each over cover_words words from its anchor; need long-form " +
    "qualification on the server, 1080p and broll_policy=anyone. Captions draw over them.",
  segments: "Ordered actor and image segments; need long-form qualification on the server, captions=false and 1080p; image media " +
    "needs broll_policy=anyone.",
  captions: "Burn word-timed captions in, over the presenter and inserts; not with segments.",
  caption_position: "top, middle, lower or bottom (80% of the height); omitted, the caption_style's own place. Requires captions=true.",
  person: "NOT HONORED YET: the default actor is used; pick actor_id from list_actors or pass image.",
  name: "NOT HONORED YET: it does not reach the renderer.",
  look: "NOT HONORED YET: it does not reach the renderer.",
  actor_id: "Saved actor ID from list_actors; not with image, person or actor_gender. Without voice or voice_id the voice follows its gender.",
  voice_id: "Raw vendor voice id (16–32 letters and digits) outside the catalog; an unknown id fails the run, not the request. Not with " +
    "voice or tts_model=gemini-3.8-flash-tts.",
  broll_policy: "anyone allows people and the actor, no_actor excludes the actor, no_people all people and hands. Templates with " +
    "your own picture or video need \"anyone\"; otherwise stored only. Run value wins over the account default; else no_people.",
  overlays: `Text-anchored images or videos over the visible presenter, each at a position or place; at most ${MAX_OVERLAYS_AT_ONCE} at once, ` +
    "not overlapping. Captions move off them to the middle or bottom third, never over the face, and hide while neither is free. Hidden " +
    "under full-frame inserts. Needs what inserts need. Price unchanged.",
  image: "Public https URL of the actor's photo (PNG, JPEG or WebP, up to 10 MB); a local file goes through upload_image first. A private, " +
    "http, unreachable, redirecting, larger or other source is refused (unusable_source) before any charge. Gender is not detected: " +
    "pass actor_gender or voice, else the male default speaks, with a warning.",
  framing: "Text-anchored presenter sizes: each cuts to close or medium on its words and back after them; no overlap with each other, an " +
    "insert or a layout window. One wholly under full-frame templates is named in warnings[]; it wins over a punch_in emphasis. Needs " +
    "script and long-form qualification; price unchanged.",
  actor_gender: "Gender of the face in image, only with image: picks that gender's default voice (sarah or george; kore or charon on " +
    "gemini-3.8-flash-tts). Refused with actor_id. An explicit voice or voice_id wins, with a warning.",
  aspect_ratio: "Output format. Omitted: 9:16, or with an image the supported format nearest its shape, even landscape, so pass it with " +
    "image. A source more than 15% off the request is refused (aspect_conflict) before any charge.",
  caption_mode: "full (default): every spoken word. highlights: only around caption_emphasis quotes (lead-in, quote, short tail); requires " +
    "caption_emphasis. Captions hide under a full-frame insert.",
  visible_ai_label: "Visible AI label, default true. False hides only the visible label; invisible marking and signed provenance stay.",
  layout_windows: "Text-anchored presenter reframings: split (9:16 only) or card; no overlap with each other or an insert; needs what " +
    "inserts need. A covered or blurred presenter is billed as face time.",
  end_hold_s: "Seconds the last frame holds after the last word, the presenter frozen and every layer kept; production seconds. Needs " +
    "script and long-form qualification.",
  edit_sounds: "A short sound on every cut (insert, full-frame template, layout window, framing). Needs one of them; template_sounds.edit " +
    "picks it (list_template_sounds). Price unchanged.",
} as const;
