export const BRAND = {
  red: "#EE342F",
  yellow: "#F3B01C",
  purple: "#8D2676",
} as const;

export const CARD_COLOR = {
  added: BRAND.purple,
  removed: BRAND.yellow,
  info: BRAND.purple,
  warning: BRAND.yellow,
  danger: BRAND.red,
  muted: "#747F8D",
} as const;
