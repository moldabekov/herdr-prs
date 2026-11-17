// Every builder call returns another chainable element; nothing is drawn.
const element = () => new Proxy(function () {}, {
  get: (_t, key) => (key === "then" ? undefined : () => element()),
  apply: () => element(),
});

export class View {}
export const div = element;
export const svg = element;
export const image = element;
export const h_flex = element;
export const v_flex = element;
export const Scrollbar = element();
