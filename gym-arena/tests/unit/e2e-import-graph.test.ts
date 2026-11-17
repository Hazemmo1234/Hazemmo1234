import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Static enforcement (TypeScript parser, whole repository): every browser test must run through
// the guarded `test` of e2e/fixtures.ts, and in the DB suite only tests/db/helpers.ts may create
// database clients. This is a CI-time check (the unit job), NOT a runtime boundary: at runtime
// the default configurations' global setups and the worker fixture still guard every target.

const ROOT = join(__dirname, "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "coverage", "test-results", "playwright-report", ".test-stack", ".fresh-stack", ".ci-stack", "public"]);
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
/** Playwright's default test file pattern (any folder: a spec outside e2e/ is still caught) */
const SPEC = /\.(?:spec|test)\.[cm]?[jt]sx?$/;
const PLAYWRIGHT = /^(?:@playwright\/test|playwright|playwright-core|playwright\/test)(?:\/.*)?$/;
const DB_CLIENTS = new Set(["postgres", "@supabase/supabase-js"]);
/** values any file may import from Playwright packages (types are always allowed) */
const ALLOWED_PLAYWRIGHT_VALUES: Record<string, ReadonlySet<string>> = {
  "e2e/fixtures.ts": new Set(["test", "expect"]),
  "playwright.config.ts": new Set(["defineConfig", "devices"]),
};
const ANY_FILE_VALUES = new Set(["expect"]);
const TOP_LEVEL_FORBIDDEN_CALLS = new Set(["createClient", "postgres", "fetch", "signIn", "ownerSql"]);

function sourceFiles(dir = ROOT): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.isDirectory()) {
      if (SKIP_DIRS.has(name.name) || name.name.startsWith(".next")) continue;
      out.push(...sourceFiles(join(dir, name.name)));
    } else if (name.isFile() && SOURCE.test(name.name) && !name.name.endsWith(".d.ts")) {
      out.push(relative(ROOT, join(dir, name.name)).split(sep).join("/"));
    }
  }
  return out;
}

interface ModuleUse {
  module: string;
  /** value names imported or re-exported; "*" = namespace/default/require/dynamic/side-effect */
  values: string[];
  line: number;
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(join(ROOT, file), "utf8"), ts.ScriptTarget.Latest, true);
}
const lineOf = (sf: ts.SourceFile, node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

/** Every way a file can load a module: import, export-from, import =, require(), import(). */
function moduleUses(sf: ts.SourceFile): ModuleUse[] {
  const uses: ModuleUse[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const values: string[] = [];
      if (!clause) values.push("*"); // side-effect import
      else if (!clause.isTypeOnly) {
        if (clause.name) values.push("*"); // default import
        const nb = clause.namedBindings;
        if (nb && ts.isNamespaceImport(nb)) values.push("*");
        if (nb && ts.isNamedImports(nb)) {
          for (const el of nb.elements) if (!el.isTypeOnly) values.push((el.propertyName ?? el.name).text);
        }
      }
      uses.push({ module: node.moduleSpecifier.text, values, line: lineOf(sf, node) });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const values: string[] = [];
      if (!node.isTypeOnly) {
        if (!node.exportClause || ts.isNamespaceExport(node.exportClause)) values.push("*");
        else for (const el of node.exportClause.elements) if (!el.isTypeOnly) values.push((el.propertyName ?? el.name).text);
      }
      uses.push({ module: node.moduleSpecifier.text, values, line: lineOf(sf, node) });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) {
      uses.push({ module: node.moduleReference.expression.text, values: node.isTypeOnly ? [] : ["*"], line: lineOf(sf, node) });
    } else if (ts.isCallExpression(node)) {
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      const isDynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      if (isRequire || isDynamic) {
        const arg = node.arguments[0];
        uses.push({ module: arg && ts.isStringLiteralLike(arg) ? arg.text : "<computed>", values: ["*"], line: lineOf(sf, node) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return uses;
}

/** calls that run when the module is loaded (not inside any function) */
function topLevelCalls(sf: ts.SourceFile): Array<{ name: string; line: number }> {
  const out: Array<{ name: string; line: number }> = [];
  const visit = (node: ts.Node) => {
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) return; // runs later, not at load
    if (ts.isCallExpression(node)) {
      const e = node.expression;
      const name = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : "";
      if (TOP_LEVEL_FORBIDDEN_CALLS.has(name)) out.push({ name, line: lineOf(sf, node) });
    }
    ts.forEachChild(node, visit);
  };
  sf.statements.forEach(visit);
  return out;
}

const files = sourceFiles();
const parsed = new Map(files.map((f) => [f, parse(f)] as const));
const e2eSpecs = files.filter((f) => f.startsWith("e2e/") && SPEC.test(f));

describe("import graph: Playwright is used only through the guarded fixture", () => {
  it("the scan sees the whole repository (specs, helpers, configs, DB tests)", () => {
    expect(e2eSpecs.length).toBeGreaterThanOrEqual(10);
    for (const f of ["e2e/fixtures.ts", "e2e/helpers.ts", "playwright.config.ts", "tests/db/helpers.ts"]) expect(files).toContain(f);
  });

  it.each(files)("%s loads Playwright only in an allowed way", (file) => {
    const allowed = ALLOWED_PLAYWRIGHT_VALUES[file] ?? ANY_FILE_VALUES;
    for (const use of moduleUses(parsed.get(file)!)) {
      if (use.module === "<computed>") {
        // a computed require()/import() could load anything — not allowed in test code
        const testCode = file.startsWith("e2e/") || file.startsWith("tests/") || file === "playwright.config.ts";
        expect(testCode, `${file}:${use.line} computed module load in test code`).toBe(false);
        continue;
      }
      if (!PLAYWRIGHT.test(use.module)) continue;
      for (const v of use.values) {
        expect(allowed.has(v), `${file}:${use.line} loads "${v}" from ${use.module} — use e2e/fixtures.ts`).toBe(true);
      }
    }
  });

  it.each(e2eSpecs)("%s takes `test` from ./fixtures", (file) => {
    const uses = moduleUses(parsed.get(file)!);
    const fromFixtures = uses.some((u) => u.module === "./fixtures" && u.values.includes("test"));
    expect(fromFixtures, `${file} must import { test } from "./fixtures"`).toBe(true);
  });

  it("no file outside e2e/ is a Playwright spec (it would run without being listed above)", () => {
    for (const file of files.filter((f) => SPEC.test(f) && !f.startsWith("e2e/"))) {
      const pw = moduleUses(parsed.get(file)!).filter((u) => PLAYWRIGHT.test(u.module));
      expect(pw, `${file} imports Playwright`).toEqual([]);
    }
  });

  it.each(e2eSpecs)("%s creates no client and signs nobody in when the module loads", (file) => {
    expect(topLevelCalls(parsed.get(file)!)).toEqual([]);
  });

  it("the e2e helpers and fixture modules also call nothing write-capable at load", () => {
    for (const f of ["e2e/helpers.ts", "e2e/fixtures.ts"]) expect(topLevelCalls(parsed.get(f)!), f).toEqual([]);
  });
});

describe("import graph: only tests/db/helpers.ts creates database clients", () => {
  const dbFiles = files.filter((f) => f.startsWith("tests/db/"));
  it("there are DB test files to check", () => expect(dbFiles.length).toBeGreaterThan(10));
  // Several DB tests load app modules (which create Supabase clients) with a top-level
  // `await import(...)`. That is safe only because the file STATICALLY imports a value from
  // ./helpers: static imports finish evaluating — including helpers' awaited identity check —
  // before any of the file's own code (dynamic imports included) runs.
  it.each(dbFiles.filter((f) => SPEC.test(f)))("%s statically imports a value from ./helpers (identity check runs first)", (file) => {
    const sf = parsed.get(file)!;
    const staticHelpers = sf.statements.filter(
      (s): s is ts.ImportDeclaration =>
        ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text === "./helpers",
    );
    const values = staticHelpers.flatMap((s) => moduleUses(ts.createSourceFile("h.ts", s.getText(sf), ts.ScriptTarget.Latest, true))[0].values);
    expect(values.length, `${file} must import a value from "./helpers" with a static import`).toBeGreaterThan(0);
  });
  it.each(dbFiles.filter((f) => f !== "tests/db/helpers.ts"))("%s does not load a database client library", (file) => {
    for (const use of moduleUses(parsed.get(file)!)) {
      if (DB_CLIENTS.has(use.module)) expect(use.values, `${file}:${use.line} loads ${use.module} — use ./helpers`).toEqual([]);
      expect(use.module, `${file}:${use.line}`).not.toBe("<computed>");
    }
  });
});

describe("import graph: the rules themselves catch every form (self-test on inline sources)", () => {
  const usesOf = (code: string) => moduleUses(ts.createSourceFile("x.ts", code, ts.ScriptTarget.Latest, true));
  it("named, aliased, namespace, default, side-effect, require, dynamic import, re-export, import =", () => {
    expect(usesOf('import { test } from "@playwright/test";')[0].values).toEqual(["test"]);
    expect(usesOf('import { test as t } from "@playwright/test";')[0].values).toEqual(["test"]);
    expect(usesOf('import * as pw from "@playwright/test";')[0].values).toEqual(["*"]);
    expect(usesOf('import pw from "@playwright/test";')[0].values).toEqual(["*"]);
    expect(usesOf('import "@playwright/test";')[0].values).toEqual(["*"]);
    expect(usesOf('const pw = require("@playwright/test");')[0]).toMatchObject({ module: "@playwright/test", values: ["*"] });
    expect(usesOf('const pw = await import("playwright/test");')[0]).toMatchObject({ module: "playwright/test", values: ["*"] });
    expect(usesOf('export { test } from "@playwright/test";')[0].values).toEqual(["test"]);
    expect(usesOf('export * from "@playwright/test";')[0].values).toEqual(["*"]);
    expect(usesOf('import pw = require("@playwright/test");')[0].values).toEqual(["*"]);
    expect(usesOf("const m = require(name);")[0].module).toBe("<computed>");
  });
  it("type-only imports carry no values", () => {
    expect(usesOf('import type { Page } from "@playwright/test";')[0].values).toEqual([]);
    expect(usesOf('import { type Page, expect } from "@playwright/test";')[0].values).toEqual(["expect"]);
  });
  it("Playwright entry points are all recognised", () => {
    for (const m of ["@playwright/test", "@playwright/test/reporter", "playwright", "playwright/test", "playwright-core", "playwright-core/lib/x"]) expect(PLAYWRIGHT.test(m), m).toBe(true);
    expect(PLAYWRIGHT.test("./fixtures")).toBe(false);
  });
  it("load-time calls are found; calls inside functions are not", () => {
    const sf = (code: string) => ts.createSourceFile("x.ts", code, ts.ScriptTarget.Latest, true);
    expect(topLevelCalls(sf("const s = createClient(u, k);")).map((c) => c.name)).toEqual(["createClient"]);
    expect(topLevelCalls(sf("await supabase.createClient(u, k);")).map((c) => c.name)).toEqual(["createClient"]);
    expect(topLevelCalls(sf('const r = fetch("/api");')).map((c) => c.name)).toEqual(["fetch"]);
    expect(topLevelCalls(sf("const s = () => createClient(u, k); function f() { postgres(x); }"))).toEqual([]);
    expect(topLevelCalls(sf('test("x", async () => { await signIn(page, "a"); });'))).toEqual([]);
  });
});
