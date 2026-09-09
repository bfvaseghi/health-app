import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import ts from "typescript";

/**
 * The app imports its own modules without a file extension, which the bundler
 * resolves and Node's ESM resolver does not. This adds the `.ts` back for
 * relative specifiers so the model can be tested as plain source.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true, format: "module-typescript" };
    const component = new URL(`${specifier}.tsx`, context.parentURL);
    if (existsSync(component)) return { url: component.href, shortCircuit: true, format: "module" };
  }
  return nextResolve(specifier, context);
}

/** Render the real workout components against the same records as the planner. */
export async function load(url, context, nextLoad) {
  if (!url.endsWith(".tsx")) return nextLoad(url, context);
  const source = await readFile(new URL(url), "utf8");
  const result = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext,
  } });
  return { format: "module", source: result.outputText, shortCircuit: true };
}
