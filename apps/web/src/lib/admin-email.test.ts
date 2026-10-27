import { describe, expect, it } from "vitest";
import { adminEmails, isAdminEmail } from "./admin-email";

describe("admin allow-list (ADMIN_EMAILS)", () => {
  const env = { ADMIN_EMAILS: " Boss@Example.com , second@example.com ,," };

  it("a listed email is an admin, case-insensitively and ignoring spaces", () => {
    expect(adminEmails(env)).toEqual(["boss@example.com", "second@example.com"]);
    expect(isAdminEmail("boss@example.com", env)).toBe(true);
    expect(isAdminEmail("  SECOND@example.com", env)).toBe(true);
  });

  it("anyone else is not", () => {
    expect(isAdminEmail("boss@example.com.evil.test", env)).toBe(false);
    expect(isAdminEmail("other@example.com", env)).toBe(false);
    expect(isAdminEmail(null, env)).toBe(false);
    expect(isAdminEmail("", env)).toBe(false);
  });

  it("with ADMIN_EMAILS missing or empty nobody is an admin", () => {
    expect(isAdminEmail("boss@example.com", {})).toBe(false);
    expect(isAdminEmail("boss@example.com", { ADMIN_EMAILS: "" })).toBe(false);
    expect(isAdminEmail("", { ADMIN_EMAILS: "," })).toBe(false);
  });
});
