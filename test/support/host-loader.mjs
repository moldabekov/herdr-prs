// Points the host-only imports of the mod at test stand-ins, so node can load
// the real panel.js. Registered by test/panel.test.js.
const MAP = { herdr: "./fake-herdr.js", "gpui-kit": "./fake-ui.js", "gpui-base": "./fake-ui.js" };

export async function resolve(specifier, context, next) {
  if (MAP[specifier]) return { url: new URL(MAP[specifier], import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
