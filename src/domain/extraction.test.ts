import { describe, expect, it } from "vitest";
import {
  blankExtractionRow,
  parseReviewedRows,
  readCandidateRows,
} from "./extraction";
import { MockExtractionProvider } from "./extraction-provider";

const assignmentId = "00000000-0000-4000-8000-000000000001";

describe("result extraction review boundary", () => {
  it("normalizes absent provider output without inventing official data", () => {
    expect(readCandidateRows({ records: [] })).toEqual([]);
    expect(
      readCandidateRows({
        records: [{ playerName: "Test", stats: { kills: -1 } }],
      })[0],
    ).toMatchObject({
      assignmentId: null,
      kills: "",
    });
  });

  it("provides a deterministic mock provider for offline pipeline tests", async () => {
    const mock = new MockExtractionProvider({
      provider: "fixture",
      records: [],
      diagnostics: { fixture: true },
    });
    await expect(
      mock.extract({
        image: new Uint8Array(),
        mimeType: "image/png",
        participants: [],
      }),
    ).resolves.toEqual({
      provider: "fixture",
      records: [],
      diagnostics: { fixture: true },
    });
  });

  it("requires a unique mapped assignment and valid bounded nonnegative integers", () => {
    const row = {
      ...blankExtractionRow(),
      assignmentId,
      playerName: "Gamer",
      kills: "12",
      deaths: "0",
      assists: "3",
      damage: "100",
      healing: "0",
      damageTaken: "8",
      towerDamage: "5",
    };
    expect(parseReviewedRows(JSON.stringify([row]))[0]).toMatchObject({
      assignmentId,
      stats: { kills: 12, deaths: 0, assists: 3, revives: null },
    });
    expect(() => parseReviewedRows(JSON.stringify([row, row]))).toThrow(
      /unique/,
    );
    expect(() =>
      parseReviewedRows(JSON.stringify([{ ...row, damage: "-1" }])),
    ).toThrow(/nonnegative/);
    expect(() =>
      parseReviewedRows(
        JSON.stringify([{ ...row, kills: "9007199254740992" }]),
      ),
    ).toThrow(/range/);
  });
});
