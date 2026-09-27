import type { GuildClassId } from "../lib/guild-classes";

export type Id = string;
export type Timestamp = string;

export const accountStatuses = ["PENDING", "APPROVED", "REJECTED"] as const;
export type AccountStatus = (typeof accountStatuses)[number];

export const roles = ["MEMBER", "OFFICER", "ADMIN", "OWNER"] as const;
export type Role = (typeof roles)[number];

export const attendanceStatuses = ["UNKNOWN", "AVAILABLE", "LEAVE"] as const;
export type AttendanceStatus = (typeof attendanceStatuses)[number];

export const warStatuses = ["preparing", "finalized"] as const;
export type WarStatus = (typeof warStatuses)[number];

export const parties = ["A", "B"] as const;
export type Party = (typeof parties)[number];
export type SquadNumber = 1 | 2 | 3 | 4 | 5;
export type SlotNumber = 1 | 2 | 3 | 4 | 5 | 6;
export type SquadCode = `${Party}${SquadNumber}`;

export const extractionStatuses = [
  "pending",
  "reviewed",
  "rejected",
  "confirmed",
] as const;
export type ExtractionStatus = (typeof extractionStatuses)[number];

export interface AccountProfile {
  id: Id;
  username: string;
  status: AccountStatus;
  role: Role | null;
  decidedAt: Timestamp | null;
  decidedBy: Id | null;
}

export interface GuildPlayer {
  id: Id;
  displayName: string;
  currentClass: GuildClassId;
  archivedAt: Timestamp | null;
}

export interface Ultimate {
  id: Id;
  code: string;
  name: string;
  iconStoragePath: string | null;
  active: boolean;
}

export interface War {
  id: Id;
  warNumber: number;
  warDate: string;
  status: WarStatus;
  finalizedAt: Timestamp | null;
}

export interface CurrentFormationAssignment {
  formationId: 1;
  playerId: Id;
  party: Party;
  squadNumber: SquadNumber;
  slotNumber: SlotNumber;
  ultimateId: Id | null;
}

export interface WarAttendance {
  warId: Id;
  playerId: Id;
  status: AttendanceStatus;
}

export interface WarAssignmentSnapshot {
  id: Id;
  warId: Id;
  playerId: Id;
  playerNameSnapshot: string;
  classSnapshot: GuildClassId;
  party: Party;
  squadNumber: SquadNumber;
  slotNumber: SlotNumber;
  ultimateId: Id | null;
  ultimateCodeSnapshot: string | null;
  ultimateNameSnapshot: string | null;
  ultimateIconPathSnapshot: string | null;
  attendanceSnapshot: AttendanceStatus;
}

export interface WarPlayerStats {
  warAssignmentId: Id;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  healing: number;
  damageTaken: number;
  towerDamage: number;
  revives: number | null;
}

export interface WarResultUpload {
  id: Id;
  warId: Id;
  storagePath: string;
}

export interface WarExtractionCandidate {
  id: Id;
  uploadId: Id;
  provider: string;
  candidatePayload: Record<string, unknown>;
  status: ExtractionStatus;
}

export interface DiscordPlayerLink {
  playerId: Id;
  discordUserId: string;
}
