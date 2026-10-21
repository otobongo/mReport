// Pure helper for the migration guard test (tests/migration-grants.test.ts).
//
// Supabase stops granting Data API privileges automatically on new objects in
// `public` from 30 Oct 2026, so every table or view a migration creates must
// be granted to anon, authenticated and service_role in the migrations too.
// This finds the ones that are not. It reads SQL text only; it never touches
// a database.

export const REQUIRED_ROLES = ["anon", "authenticated", "service_role"] as const;
const REQUIRED_PRIVILEGES = ["select", "insert", "update", "delete"] as const;

// A bare or double-quoted identifier.
const IDENT = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)`;
// An optionally schema-qualified name: ident or ident.ident
const QUALIFIED = String.raw`${IDENT}(?:\s*\.\s*${IDENT})?`;

const CREATE_RE = new RegExp(
  String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:(?:global\s+|local\s+)?(?:temp|temporary)\s+|unlogged\s+|materialized\s+)?(table|view)\s+(?:if\s+not\s+exists\s+)?(${QUALIFIED})`,
  "gi",
);

const GRANT_RE = new RegExp(
  String.raw`\bgrant\s+([\w\s,]+?)\s+on\s+(?:table\s+)?(${QUALIFIED}(?:\s*,\s*${QUALIFIED})*)\s+to\s+([^;]+)`,
  "gi",
);

/** Removes comments, string literals and dollar-quoted bodies; keeps quoted identifiers. */
function stripNoise(sql: string): string {
  return sql.replace(
    /"(?:[^"]|"")*"|--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g,
    (match) => (match.startsWith('"') ? match : " "),
  );
}

function unquote(part: string): string {
  const p = part.trim();
  return p.startsWith('"') ? p.slice(1, -1).replace(/""/g, '"') : p.toLowerCase();
}

/** Returns the bare name when the object is in `public` (explicitly or by default), else null. */
function publicName(qualified: string): string | null {
  const parts = qualified.match(new RegExp(IDENT, "g")) ?? [];
  if (parts.length === 1) return unquote(parts[0]!);
  if (parts.length === 2 && unquote(parts[0]!) === "public") return unquote(parts[1]!);
  return null;
}

/**
 * Names of tables and views created in `public` by the given SQL that no
 * grant in the same SQL gives select, insert, update and delete to anon,
 * authenticated and service_role. Names come back lower-cased unless quoted,
 * in order of first creation.
 */
export function findUngrantedRelations(sql: string): string[] {
  const clean = stripNoise(sql);

  const created: string[] = [];
  for (const m of clean.matchAll(CREATE_RE)) {
    const name = publicName(m[2]!);
    if (name && !created.includes(name)) created.push(name);
  }

  // name -> roles granted all four privileges (privileges and roles are
  // accumulated across statements, so split grants still count)
  const privs = new Map<string, Set<string>>();
  const roles = new Map<string, Set<string>>();
  for (const m of clean.matchAll(GRANT_RE)) {
    const granted = m[1]!
      .toLowerCase()
      .split(",")
      .map((s) => s.replace(/\s+privileges$/, "").trim());
    const grantedPrivs = granted.includes("all") ? [...REQUIRED_PRIVILEGES] : granted;
    const grantedRoles = m[3]!
      .split(",")
      .map((r) => unquote(r.replace(/\s+with\s+grant\s+option\s*$/i, "")));
    for (const obj of m[2]!.split(",")) {
      const name = publicName(obj);
      if (!name) continue;
      const p = privs.get(name) ?? new Set<string>();
      grantedPrivs.forEach((x) => p.add(x));
      privs.set(name, p);
      const r = roles.get(name) ?? new Set<string>();
      grantedRoles.forEach((x) => r.add(x));
      roles.set(name, r);
    }
  }

  return created.filter((name) => {
    const hasPrivs = REQUIRED_PRIVILEGES.every((p) => privs.get(name)?.has(p));
    const hasRoles = REQUIRED_ROLES.every((r) => roles.get(name)?.has(r));
    return !(hasPrivs && hasRoles);
  });
}
