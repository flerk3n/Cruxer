import { describe, expect, it } from "vitest";
import { createUrlSafetyPolicy, isForbiddenAddress } from "./url-policy";

describe("URL safety policy", () => {
  it("blocks private, loopback and reserved addresses", () => {
    for (const address of ["127.0.0.1", "10.0.0.1", "169.254.0.1", "192.168.1.1", "::1", "fc00::1"]) {
      expect(isForbiddenAddress(address)).toBe(true);
    }
    expect(isForbiddenAddress("8.8.8.8")).toBe(false);
  });

  it("checks DNS results and permits local fixtures only when explicitly enabled", async () => {
    const publicPolicy = createUrlSafetyPolicy({ resolver: async () => ["10.0.0.8"] });
    await expect(publicPolicy.assertAllowed("https://company.example/path")).rejects.toThrow(/private/i);
    const fixturePolicy = createUrlSafetyPolicy({ allowLocalhost: true });
    await expect(fixturePolicy.assertAllowed("http://localhost:8099/acme/")).resolves.toBeInstanceOf(URL);
  });
});
