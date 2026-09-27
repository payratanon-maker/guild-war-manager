import { describe, expect, it } from "vitest";
import { messages, translateRole, translateStatus } from "./i18n";

describe("centralized localization", () => {
  it("provides the same message keys in Thai and English", () => {
    expect(Object.keys(messages.th).sort()).toEqual(
      Object.keys(messages.en).sort(),
    );
    for (const locale of ["en", "th"] as const) {
      expect(Object.values(messages[locale]).every(Boolean)).toBe(true);
    }
  });

  it("localizes account roles and approval statuses", () => {
    expect(translateRole("th", "OWNER")).toBe("เจ้าของระบบ");
    expect(translateRole("en", "OFFICER")).toBe("Officer");
    expect(translateStatus("th", "PENDING")).toBe("รออนุมัติ");
    expect(translateStatus("en", "APPROVED")).toBe("Approved");
  });
});
