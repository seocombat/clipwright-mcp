export interface ServiceOffer {
  readonly longForm: boolean;
  readonly explainerFilm: boolean;
  readonly ownAgent: boolean;
  readonly heygenAvatar6: boolean;
  readonly filmHead: boolean;
  readonly heroSprites: boolean;
  readonly outputMarking: boolean;
}

export const BASE_OFFER: ServiceOffer = Object.freeze({
  longForm: false, explainerFilm: false, ownAgent: false, heygenAvatar6: false, filmHead: false, heroSprites: false, outputMarking: false,
});

export const FULL_OFFER: ServiceOffer = Object.freeze({
  longForm: true, explainerFilm: true, ownAgent: true, heygenAvatar6: true, filmHead: true, heroSprites: true, outputMarking: false,
});
