export type DiscordAttendanceAction = {
  kind: "attendance";
  discordUserId: string;
  status: "AVAILABLE" | "LEAVE";
  warId: string | null;
};

export type DiscordInteraction = {
  type: number;
  channel_id?: string;
  guild_id?: string;
  token?: string;
  application_id?: string;
  member?: { user?: { id?: string } };
  user?: { id?: string };
  data?: { name?: string; custom_id?: string };
};

export function isAllowedDiscordChannel(
  interaction: DiscordInteraction,
  channelId: string | undefined,
  guildId: string | undefined,
) {
  return (
    !!channelId &&
    interaction.channel_id === channelId &&
    (!guildId || interaction.guild_id === guildId)
  );
}

export function getDiscordAttendanceAction(
  interaction: DiscordInteraction,
): DiscordAttendanceAction | "attendance-panel" | null {
  let status: "AVAILABLE" | "LEAVE" | null = null;
  if (interaction.type === 2) {
    if (interaction.data?.name === "war-join") status = "AVAILABLE";
    if (interaction.data?.name === "war-leave") status = "LEAVE";
    if (interaction.data?.name === "war-attendance") return "attendance-panel";
  } else if (interaction.type === 3) {
    const button =
      /^gwm:(join|leave):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
        interaction.data?.custom_id ?? "",
      );
    if (button?.[1] === "join") status = "AVAILABLE";
    if (button?.[1] === "leave") status = "LEAVE";
    const discordUserId =
      interaction.member?.user?.id ?? interaction.user?.id ?? "";
    if (!button || !status || !/^\d{17,20}$/.test(discordUserId)) return null;
    return {
      kind: "attendance",
      discordUserId,
      status,
      warId: button[2],
    };
  }
  const discordUserId =
    interaction.member?.user?.id ?? interaction.user?.id ?? "";
  if (!status || !/^\d{17,20}$/.test(discordUserId)) return null;
  return { kind: "attendance", discordUserId, status, warId: null };
}

export function discordErrorMessage(code?: string | null) {
  if (code === "P0002")
    return "This Discord account is not linked to a Guild Player.";
  if (code === "42501")
    return "Archived Guild Players cannot change attendance.";
  if (code === "22023")
    return "This attendance message is no longer for a preparing War.";
  return "Attendance could not be updated. Contact a guild Officer.";
}
