// Lets scripts run with plain `node` import code from `src/` the way Next.js
// and Vitest do: `@/…` means `src/…`, and imports may leave off `.ts` or
// `/index.ts`. Load it first: `node --import ./scripts/register-paths.ts …`.
import { statSync } from "node:fs";
import { registerHooks } from "node:module";

const SRC = new URL("../src/", import.meta.url);
const SUFFIXES = ["", ".ts", ".tsx", "/index.ts"];

function isFile(url: URL): boolean {
  try {
    return statSync(url).isFile();
  } catch {
    return false;
  }
}

function resolveLocal(
  specifier: string,
  parentURL: string | undefined,
): string | undefined {
  let base: URL;
  if (specifier.startsWith("@/")) {
    base = new URL(specifier.slice(2), SRC);
  } else if (
    /^\.\.?\//.test(specifier) &&
    parentURL?.startsWith("file:") &&
    !parentURL.includes("/node_modules/")
  ) {
    base = new URL(specifier, parentURL);
  } else {
    return undefined;
  }
  for (const suffix of SUFFIXES) {
    const candidate = new URL(base.href + suffix);
    if (isFile(candidate)) return candidate.href;
  }
  return undefined;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(
      resolveLocal(specifier, context.parentURL) ?? specifier,
      context,
    );
  },
});
