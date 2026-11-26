export const FACELESS_ROUTES = [
  { route: "pictures", name: "Still pictures", tool: "make_faceless" },
  { route: "cartoon", name: "Cartoon", tool: "render_cut" },
  { route: "explainer", name: "Explainer", tool: "render_film" },
] as const;

export type FacelessRoute = (typeof FACELESS_ROUTES)[number]["route"];

export const FACELESS_ROUTE_IDS = FACELESS_ROUTES.map(r => r.route) as [FacelessRoute, ...FacelessRoute[]];
