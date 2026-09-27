const { DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID } =
  process.env;

if (!DISCORD_APPLICATION_ID || !DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
  throw new Error(
    "Set DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN, and DISCORD_GUILD_ID before registering commands.",
  );
}

const commands = [
  {
    name: "war-attendance",
    description: "Post the guild war attendance buttons",
    type: 1,
    default_member_permissions: "32",
    integration_types: [0],
    contexts: [0],
  },
  {
    name: "war-join",
    description: "Mark yourself available for the preparing war",
    type: 1,
    integration_types: [0],
    contexts: [0],
  },
  {
    name: "war-leave",
    description: "Mark yourself on leave for the preparing war",
    type: 1,
    integration_types: [0],
    contexts: [0],
  },
];

const endpoint =
  "https://discord.com/api/v10/applications/" +
  encodeURIComponent(DISCORD_APPLICATION_ID) +
  "/guilds/" +
  encodeURIComponent(DISCORD_GUILD_ID) +
  "/commands";
for (const command of commands) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: "Bot " + DISCORD_BOT_TOKEN,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) {
    throw new Error(
      "Discord command registration failed with HTTP " + response.status,
    );
  }
}
console.log(
  "Registered 3 Guild War Manager commands for the configured guild.",
);
