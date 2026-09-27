import { describe, expect, it } from "vitest";
import {
  discordErrorMessage,
  getDiscordAttendanceAction,
  isAllowedDiscordChannel,
} from "./discord-interaction";

describe("Discord attendance interaction mapping", () => {
  it("maps official slash commands and buttons by stable Discord user ID", () => {
    expect(
      getDiscordAttendanceAction({
        type: 2,
        data: { name: "war-join" },
        member: { user: { id: "123456789012345678" } },
      }),
    ).toEqual({
      kind: "attendance",
      discordUserId: "123456789012345678",
      status: "AVAILABLE",
      warId: null,
    });
    expect(
      getDiscordAttendanceAction({
        type: 3,
        data: { custom_id: "gwm:leave:00000000-0000-4000-8000-000000000001" },
        user: { id: "123456789012345678" },
      }),
    ).toMatchObject({
      status: "LEAVE",
      warId: "00000000-0000-4000-8000-000000000001",
    });
    expect(
      getDiscordAttendanceAction({ type: 2, data: { name: "war-attendance" } }),
    ).toBe("attendance-panel");
    expect(
      getDiscordAttendanceAction({
        type: 2,
        data: { name: "war-join" },
        user: { id: "mutable-name" },
      }),
    ).toBeNull();
  });

  it("returns safe user-facing errors for unknown and archived links", () => {
    expect(discordErrorMessage("P0002")).toMatch(/not linked/);
    expect(discordErrorMessage("42501")).toMatch(/Archived/);
    expect(discordErrorMessage("XX000")).toMatch(/Officer/);
  });

  it("restricts commands and components to the configured guild channel", () => {
    const interaction = { type: 3, channel_id: "channel", guild_id: "guild" };
    expect(isAllowedDiscordChannel(interaction, "channel", "guild")).toBe(true);
    expect(isAllowedDiscordChannel(interaction, "other", "guild")).toBe(false);
    expect(isAllowedDiscordChannel(interaction, "channel", "other")).toBe(
      false,
    );
    expect(isAllowedDiscordChannel(interaction, undefined, undefined)).toBe(
      false,
    );
  });
});
