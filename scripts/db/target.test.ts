import { describe, expect, it } from "vitest";
import {
  LOCAL_DATABASE_URL,
  TargetError,
  assertWritable,
  describeUrl,
  directUrl,
  knownAs,
  loadLocalEnv,
  parseTargetName,
  resolveTarget,
  verifiedSsl,
} from "./target";

const PROD_POOLED =
  "postgresql://u:secret@ep-prod-111-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require";
const PROD_DIRECT =
  "postgresql://u:secret@ep-prod-111.us-east-2.aws.neon.tech/neondb?sslmode=require";
const BRANCH_POOLED =
  "postgresql://u:secret@ep-branch-222-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require";

const env = {
  DATABASE_URL: PROD_POOLED,
  DATABASE_URL_UNPOOLED: PROD_DIRECT,
  DATABASE_URL_BATCHTESTINGBRANCH: BRANCH_POOLED,
  NEON_PRODUCTION_ENDPOINT_ID: "ep-prod-111",
};

describe("describeUrl and directUrl", () => {
  it("reads the endpoint id, database and pooling from a Neon URL", () => {
    expect(describeUrl(PROD_POOLED)).toEqual({
      endpoint: "ep-prod-111",
      database: "neondb",
      pooled: true,
    });
    expect(describeUrl("postgres://h/").database).toBe("(default)");
  });

  it("rejects something that is not a URL without echoing it", () => {
    expect(() => describeUrl("not a url secret")).toThrow(
      "The connection string is not a valid URL.",
    );
  });

  it("drops -pooler for the direct connection, and leaves other hosts alone", () => {
    expect(describeUrl(directUrl(PROD_POOLED))).toMatchObject({
      endpoint: "ep-prod-111",
      pooled: false,
    });
    expect(directUrl(LOCAL_DATABASE_URL)).toBe(LOCAL_DATABASE_URL);
  });

  it("spells out verify-full, which pg already uses for require", () => {
    expect(verifiedSsl(PROD_DIRECT)).toContain("sslmode=verify-full");
    expect(verifiedSsl(LOCAL_DATABASE_URL)).toBe(LOCAL_DATABASE_URL);
  });
});

describe("resolveTarget", () => {
  it("uses DATABASE_URL as is for the app target", () => {
    expect(resolveTarget("app", env)).toMatchObject({
      source: "DATABASE_URL",
      endpoint: "ep-prod-111",
      pooled: true,
    });
  });

  it("uses the Docker database for local", () => {
    expect(resolveTarget("local", env)).toMatchObject({
      url: LOCAL_DATABASE_URL,
      endpoint: "localhost",
    });
  });

  it("connects directly to the branch, from its pooled URL or its own direct one", () => {
    expect(resolveTarget("branch", env)).toMatchObject({
      source: "DATABASE_URL_BATCHTESTINGBRANCH",
      endpoint: "ep-branch-222",
      pooled: false,
    });
    const own = resolveTarget("branch", {
      DATABASE_URL_BATCHTESTINGBRANCH_UNPOOLED:
        "postgres://u:p@ep-other-333.neon.tech/db",
    });
    expect(own).toMatchObject({
      source: "DATABASE_URL_BATCHTESTINGBRANCH_UNPOOLED",
      endpoint: "ep-other-333",
    });
  });

  it("uses production's direct URL, falling back to DATABASE_URL", () => {
    expect(resolveTarget("production", env).source).toBe(
      "DATABASE_URL_UNPOOLED",
    );
    expect(
      resolveTarget("production", { DATABASE_URL: PROD_POOLED }),
    ).toMatchObject({ source: "DATABASE_URL", pooled: false });
  });

  it("says which variable is missing", () => {
    expect(() => resolveTarget("branch", {})).toThrow(
      "DATABASE_URL_BATCHTESTINGBRANCH is not set",
    );
  });
});

describe("assertWritable", () => {
  it("never writes to the unnamed app database", () => {
    expect(() => assertWritable(resolveTarget("app", env), env)).toThrow(
      TargetError,
    );
  });

  it("allows local and a branch that is not production", () => {
    expect(() =>
      assertWritable(resolveTarget("local", env), env),
    ).not.toThrow();
    expect(() =>
      assertWritable(resolveTarget("branch", env), env),
    ).not.toThrow();
  });

  it("refuses a branch URL that is really production", () => {
    const mixedUp = { ...env, DATABASE_URL_BATCHTESTINGBRANCH: PROD_POOLED };
    expect(() =>
      assertWritable(resolveTarget("branch", mixedUp), mixedUp),
    ).toThrow("points at production");
    // Without the production id set, DATABASE_URL is the reference.
    const noId = { ...mixedUp, NEON_PRODUCTION_ENDPOINT_ID: undefined };
    expect(() => assertWritable(resolveTarget("branch", noId), noId)).toThrow(
      "points at production",
    );
  });

  it("writes to production only when its endpoint id is set and matches", () => {
    expect(() =>
      assertWritable(resolveTarget("production", env), env),
    ).not.toThrow();
    const noId = { ...env, NEON_PRODUCTION_ENDPOINT_ID: undefined };
    expect(() =>
      assertWritable(resolveTarget("production", noId), noId),
    ).toThrow("Set NEON_PRODUCTION_ENDPOINT_ID");
    const swapped = { ...env, DATABASE_URL_UNPOOLED: BRANCH_POOLED };
    expect(() =>
      assertWritable(resolveTarget("production", swapped), swapped),
    ).toThrow("Refusing");
  });
});

describe("knownAs", () => {
  it("names production, the branch, local and anything else", () => {
    expect(knownAs(resolveTarget("app", env), env)).toBe("Neon production");
    expect(knownAs(resolveTarget("branch", env), env)).toBe(
      "Neon batch-testing branch",
    );
    expect(knownAs(resolveTarget("local", env), env)).toBe(
      "local Docker database",
    );
    const other = { DATABASE_URL: "postgres://u:p@ep-x-9.neon.tech/db" };
    expect(knownAs(resolveTarget("app", other), other)).toBe(
      "unknown database",
    );
    expect(knownAs(resolveTarget("production", other), other)).toMatch(
      /unverified/,
    );
  });
});

describe("parseTargetName", () => {
  it("accepts the four names and rejects others", () => {
    expect(parseTargetName("branch")).toBe("branch");
    expect(() => parseTargetName("main")).toThrow('Unknown target "main"');
    expect(() => parseTargetName(undefined)).toThrow("--target");
  });
});

describe("loadLocalEnv", () => {
  it("reads .env.local and carries on when it is missing", () => {
    const seen: string[] = [];
    loadLocalEnv((path) => seen.push(path));
    expect(seen).toEqual([".env.local"]);
    expect(() =>
      loadLocalEnv(() => {
        throw new Error("ENOENT");
      }),
    ).not.toThrow();
  });
});
