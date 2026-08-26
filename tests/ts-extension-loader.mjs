import { existsSync } from "node:fs";

/**
 * The app imports its own modules without a file extension, which the bundler
 * resolves and Node's ESM resolver does not. This adds the `.ts` back for
 * relative specifiers so the model can be tested as plain source.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true, format: "module-typescript" };
  }
  return nextResolve(specifier, context);
}
