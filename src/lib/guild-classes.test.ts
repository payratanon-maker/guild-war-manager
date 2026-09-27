import { describe, expect, it } from "vitest";
import { guildClasses } from "./guild-classes";

describe("guild class configuration", () => {
  it("defines the seven canonical classes in roster order", () => {
    expect(guildClasses.map(({ name }) => name)).toEqual([
      "Ironclad",
      "Sylph",
      "Bloodstrom",
      "Celestune",
      "Nightwaker",
      "Numina",
      "Dragonsvelte",
    ]);
  });

  it("assigns each class a unique id and a valid color", () => {
    expect(new Set(guildClasses.map(({ id }) => id)).size).toBe(7);
    expect(new Set(guildClasses.map(({ color }) => color)).size).toBe(7);
    expect(
      guildClasses.every(({ color }) => /^#[0-9a-f]{6}$/i.test(color)),
    ).toBe(true);
  });
});
