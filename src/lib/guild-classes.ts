export const guildClasses = [
  { id: "ironclad", name: "Ironclad", color: "#f2c14e" },
  { id: "sylph", name: "Sylph", color: "#e68bc2" },
  { id: "bloodstrom", name: "Bloodstrom", color: "#e25757" },
  { id: "celestune", name: "Celestune", color: "#628bea" },
  { id: "nightwaker", name: "Nightwaker", color: "#7ec9e8" },
  { id: "numina", name: "Numina", color: "#9d7ae8" },
  { id: "dragonsvelte", name: "Dragonsvelte", color: "#6dbd82" },
] as const;

export type GuildClass = (typeof guildClasses)[number];
export type GuildClassId = GuildClass["id"];
