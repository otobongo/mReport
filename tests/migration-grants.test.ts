import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findUngrantedRelations } from "@/lib/db/migration-grants";

const ALL = "to anon, authenticated, service_role";

describe("findUngrantedRelations", () => {
  it("reports a table with no grants", () => {
    const sql = `create table public.mreport_things (id uuid primary key);`;
    expect(findUngrantedRelations(sql)).toEqual(["mreport_things"]);
  });

  it("accepts a table granted to all three roles", () => {
    const sql = `
      create table public.mreport_things (id uuid primary key);
      grant select, insert, update, delete on public.mreport_things ${ALL};`;
    expect(findUngrantedRelations(sql)).toEqual([]);
  });

  it("handles if not exists, and names with or without the public prefix", () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS mreport_a (id int);
      CREATE TABLE IF NOT EXISTS public.mreport_b (id int);
      grant select, insert, update, delete on public.mreport_a ${ALL};`;
    expect(findUngrantedRelations(sql)).toEqual(["mreport_b"]);
  });

  it("matches a prefixed create to an unprefixed grant and the reverse", () => {
    const sql = `
      create table public.mreport_a (id int);
      create table mreport_b (id int);
      grant select, insert, update, delete on mreport_a ${ALL};
      grant select, insert, update, delete on public.mreport_b ${ALL};`;
    expect(findUngrantedRelations(sql)).toEqual([]);
  });

  it("handles quoted identifiers", () => {
    const sql = `
      create table "public"."Mreport_Quoted" (id int);
      create table "mreport_other" (id int);
      grant select, insert, update, delete on "public"."Mreport_Quoted" ${ALL};`;
    expect(findUngrantedRelations(sql)).toEqual(["mreport_other"]);
  });

  it("is case-insensitive for keywords and unquoted names", () => {
    const sql = `
      CREATE TABLE Public.MReport_Upper (id int);
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE PUBLIC.MREPORT_UPPER TO ANON, AUTHENTICATED, SERVICE_ROLE;`;
    expect(findUngrantedRelations(sql)).toEqual([]);
  });

  it("accepts one grant statement listing several tables", () => {
    const sql = `
      create table public.a (id int);
      create table public.b (id int);
      create table public.c (id int);
      grant select, insert, update, delete on public.a, public.b ${ALL};`;
    expect(findUngrantedRelations(sql)).toEqual(["c"]);
  });

  it("requires views to be granted too", () => {
    const sql = `
      create or replace view public.mreport_v as select 1;
      create materialized view public.mreport_mv as select 1;
      grant select, insert, update, delete on public.mreport_v ${ALL};`;
    expect(findUngrantedRelations(sql)).toEqual(["mreport_mv"]);
  });

  it("fails when a role is missing", () => {
    const sql = `
      create table public.a (id int);
      grant select, insert, update, delete on public.a to authenticated, service_role;`;
    expect(findUngrantedRelations(sql)).toEqual(["a"]);
  });

  it("fails when a privilege is missing", () => {
    const sql = `
      create table public.a (id int);
      grant select on public.a ${ALL};`;
    expect(findUngrantedRelations(sql)).toEqual(["a"]);
  });

  it("accepts grant all and split grants that add up", () => {
    const sql = `
      create table public.a (id int);
      create table public.b (id int);
      grant all on public.a ${ALL};
      grant select, insert on public.b ${ALL};
      grant update, delete on public.b ${ALL};`;
    expect(findUngrantedRelations(sql)).toEqual([]);
  });

  it("does not count a bulk grant on all tables in schema", () => {
    const sql = `
      create table public.a (id int);
      grant select, insert, update, delete on all tables in schema public ${ALL};`;
    expect(findUngrantedRelations(sql)).toEqual(["a"]);
  });

  it("ignores tables in other schemas and temp tables in function bodies", () => {
    const sql = `
      create table storage.things (id int);
      create function public.f() returns void language plpgsql as $$
      begin create temp table scratch (id int); end; $$;`;
    expect(findUngrantedRelations(sql)).toEqual([]);
  });

  it("ignores commented-out statements and strings", () => {
    const sql = `
      -- create table public.commented (id int);
      /* create table public.blocked (id int); */
      insert into t values ('create table public.in_string (id int)');`;
    expect(findUngrantedRelations(sql)).toEqual([]);
  });

  it("returns nothing for an empty string", () => {
    expect(findUngrantedRelations("")).toEqual([]);
  });
});

describe("supabase/migrations", () => {
  it("grants every table and view created in public to anon, authenticated and service_role", () => {
    const dir = path.resolve(__dirname, "../supabase/migrations");
    const all = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(path.join(dir, f), "utf8"))
      .join("\n;\n");
    // Fix: add a grant in the same migration that creates the table. See
    // 0005_mreport_explicit_grants.sql for why.
    expect(findUngrantedRelations(all)).toEqual([]);
  });
});
