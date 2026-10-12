import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.ts";

const TOKEN = "worker-test-token-0123456789-0123456789";
const BASE = {
  REEFLECT_URL: "http://localhost:3000",
  AGENT_SERVICE_TOKEN: TOKEN,
};

describe("parseConfig", () => {
  it("defaults to the terminal provider, which needs no Photon credentials", () => {
    expect(parseConfig(BASE)).toEqual({
      AGENT_PROVIDER: "terminal",
      REEFLECT_URL: "http://localhost:3000",
      AGENT_SERVICE_TOKEN: TOKEN,
      PORT: 8787,
    });
  });

  it("treats empty values as unset", () => {
    const config = parseConfig({
      ...BASE,
      AGENT_PROVIDER: " ",
      PHOTON_PROJECT_ID: "",
      PHOTON_PROJECT_SECRET: "",
      PORT: "",
      RENDER_EXTERNAL_URL: "",
    });

    expect(config.AGENT_PROVIDER).toBe("terminal");
    expect(config.PORT).toBe(8787);
    expect(config.PHOTON_PROJECT_ID).toBeUndefined();
    expect(config.RENDER_EXTERNAL_URL).toBeUndefined();
  });

  it("reads the iMessage settings and Render's port and URL", () => {
    const config = parseConfig({
      ...BASE,
      AGENT_PROVIDER: "imessage",
      PHOTON_PROJECT_ID: "project-id",
      PHOTON_PROJECT_SECRET: "project-secret",
      PORT: "10000",
      RENDER_EXTERNAL_URL: "https://worker.example.com",
    });

    expect(config).toMatchObject({
      AGENT_PROVIDER: "imessage",
      PHOTON_PROJECT_ID: "project-id",
      PHOTON_PROJECT_SECRET: "project-secret",
      PORT: 10000,
      RENDER_EXTERNAL_URL: "https://worker.example.com",
    });
  });

  it("needs both Photon credentials for iMessage", () => {
    const attempt = (): unknown =>
      parseConfig({ ...BASE, AGENT_PROVIDER: "imessage" });

    expect(attempt).toThrow(
      /PHOTON_PROJECT_ID: required when AGENT_PROVIDER is imessage/,
    );
    expect(attempt).toThrow(/PHOTON_PROJECT_SECRET/);
  });

  it("names what is missing or malformed, without echoing a value", () => {
    expect(() => parseConfig({})).toThrow(/REEFLECT_URL/);
    expect(() => parseConfig({})).toThrow(/AGENT_SERVICE_TOKEN/);
    expect(() => parseConfig({})).toThrow(/agent-worker\/\.env\.example/);

    const short = (): unknown =>
      parseConfig({ ...BASE, AGENT_SERVICE_TOKEN: "short-secret" });
    expect(short).toThrow(/AGENT_SERVICE_TOKEN/);
    expect(short).not.toThrow(/short-secret/);

    expect(() => parseConfig({ ...BASE, REEFLECT_URL: "localhost" })).toThrow(
      /REEFLECT_URL/,
    );
    expect(() => parseConfig({ ...BASE, AGENT_PROVIDER: "telegram" })).toThrow(
      /AGENT_PROVIDER/,
    );
    expect(() => parseConfig({ ...BASE, PORT: "70000" })).toThrow(/PORT/);
    expect(() => parseConfig({ ...BASE, PORT: "abc" })).toThrow(/PORT/);
  });

  it("refuses an app URL that would send the token in clear (HO-115)", () => {
    expect(() =>
      parseConfig({ ...BASE, REEFLECT_URL: "http://reeflect.example.com" }),
    ).toThrow(/REEFLECT_URL: must use https/);
    for (const url of [
      "https://reeflect.example.com",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]) {
      expect(parseConfig({ ...BASE, REEFLECT_URL: url }).REEFLECT_URL).toBe(
        url,
      );
    }
  });

  it("trims the token as the app does, so a pasted newline still matches", () => {
    const token = BASE.AGENT_SERVICE_TOKEN;
    expect(
      parseConfig({ ...BASE, AGENT_SERVICE_TOKEN: ` ${token}\n` })
        .AGENT_SERVICE_TOKEN,
    ).toBe(token);
  });
});
