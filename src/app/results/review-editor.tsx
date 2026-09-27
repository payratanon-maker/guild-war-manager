"use client";

import { useState } from "react";
import type { MessageKey } from "@/lib/i18n";
import type { ReviewedExtractionRow } from "@/domain/extraction";
import { extractionStatFields } from "@/domain/extraction";
import { saveExtractionReview } from "./extraction-actions";

type Participant = {
  id: string;
  name: string;
  party: "A" | "B";
  squad: number;
};

export function ReviewEditor({
  candidateId,
  initialRows,
  participants,
  translate,
}: {
  candidateId: string;
  initialRows: ReviewedExtractionRow[];
  participants: Participant[];
  translate: (key: MessageKey) => string;
}) {
  const [rows, setRows] = useState(
    initialRows.length
      ? initialRows
      : [
          {
            assignmentId: null,
            playerName: "",
            confidence: null,
            kills: "",
            deaths: "",
            assists: "",
            damage: "",
            healing: "",
            damageTaken: "",
            towerDamage: "",
            revives: "",
          },
        ],
  );
  function update(index: number, field: string, value: string) {
    setRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        if (field === "assignmentId") {
          const participant = participants.find((item) => item.id === value);
          return {
            ...row,
            assignmentId: value || null,
            playerName: participant?.name ?? row.playerName,
          };
        }
        return { ...row, [field]: value };
      }),
    );
  }
  return (
    <form action={saveExtractionReview} className="extraction-review">
      <input type="hidden" name="candidateId" value={candidateId} />
      <input type="hidden" name="records" value={JSON.stringify(rows)} />
      <p className="muted">{translate("manualEntryNotice")}</p>
      {rows.map((row, index) => (
        <fieldset className="panel extraction-row" key={index}>
          <legend>
            {translate("detectedPlayer")} {index + 1}
          </legend>
          <label>
            {translate("selectParticipant")}
            <select
              value={row.assignmentId ?? ""}
              onChange={(event) =>
                update(index, "assignmentId", event.currentTarget.value)
              }
              required
            >
              <option value="">—</option>
              {participants.map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {participant.name} · {participant.party}
                  {participant.squad}
                </option>
              ))}
            </select>
          </label>
          <label>
            {translate("name")}
            <input
              maxLength={100}
              value={row.playerName}
              onChange={(event) =>
                update(index, "playerName", event.currentTarget.value)
              }
            />
          </label>
          <div className="extraction-stat-grid">
            {extractionStatFields.map((field) => (
              <label key={field}>
                {translate(field)}
                <input
                  type="number"
                  min={0}
                  max={Number.MAX_SAFE_INTEGER}
                  step={1}
                  required={field !== "revives"}
                  value={row[field]}
                  onChange={(event) =>
                    update(index, field, event.currentTarget.value)
                  }
                />
              </label>
            ))}
          </div>
          <button
            className="text-button"
            type="button"
            disabled={rows.length <= 1}
            onClick={() =>
              setRows((current) =>
                current.filter((_, rowIndex) => rowIndex !== index),
              )
            }
          >
            {translate("remove")}
          </button>
        </fieldset>
      ))}
      <div className="toolbar">
        <button
          type="button"
          className="secondary-button"
          disabled={rows.length >= 36}
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                assignmentId: null,
                playerName: "",
                confidence: null,
                kills: "",
                deaths: "",
                assists: "",
                damage: "",
                healing: "",
                damageTaken: "",
                towerDamage: "",
                revives: "",
              },
            ])
          }
        >
          {translate("addRow")}
        </button>
        <button className="primary-button">{translate("saveReview")}</button>
      </div>
    </form>
  );
}
