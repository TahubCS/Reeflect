import { expect, test } from "@playwright/test";

test("health endpoint reports the database as reachable", async ({
  request,
}) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ok" });
});
