"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { guildClasses, type GuildClassId } from "@/lib/guild-classes";
import type { Party } from "@/domain/model";
import { moveFormationPlayer, setAssignmentUltimate } from "./actions";

type Player = {
  id: string;
  display_name: string;
  current_class: GuildClassId;
  archived_at: string | null;
};
type Assignment = {
  player_id: string;
  party: Party;
  squad_number: number;
  slot_number: number;
  ultimate_id: string | null;
};
type Destination = {
  party: Party | null;
  squad: number | null;
  slot: number | null;
};
type Ultimate = {
  id: string;
  name: string;
  code: string;
  icon_storage_path: string | null;
  active: boolean;
};
type Labels = {
  pool: string;
  search: string;
  class: string;
  all: string;
  leave: string;
  select: string;
  remove: string;
  ultimate: string;
  partyA: string;
  partyB: string;
  assigned: string;
  empty: string;
  error: string;
  normalMode: string;
  compactMode: string;
  showPool: string;
  hidePool: string;
};

function PlayerCard({
  player,
  assignment,
  disabled,
  selected,
  hasSelection,
  selectable,
  onSelect,
  onTarget,
  ultimates,
  iconBase,
  onUltimate,
  compact,
  onRemove,
  labels,
}: {
  player: Player;
  assignment?: Assignment;
  disabled: boolean;
  selected: boolean;
  hasSelection: boolean;
  selectable: boolean;
  onSelect: () => void;
  onTarget: () => void;
  ultimates: Ultimate[];
  iconBase: string;
  onUltimate: (id: string | null) => void;
  compact: boolean;
  onRemove?: () => void;
  labels: Labels;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `player:${player.id}`,
    disabled: !selectable || disabled,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `slot:${player.id}`,
    disabled: !assignment || !selectable,
  });
  const item = guildClasses.find(({ id }) => id === player.current_class)!;
  const ultimate = ultimates.find(({ id }) => id === assignment?.ultimate_id);
  return (
    <div
      ref={setDropRef}
      className={`player-card ${selected ? "selected" : ""} ${isOver ? "drop-over" : ""} ${disabled ? "player-disabled" : ""}`}
      style={{ borderLeftColor: item.color, opacity: isDragging ? 0.4 : 1 }}
    >
      <button
        ref={setDragRef}
        {...attributes}
        {...listeners}
        type="button"
        className="player-card-main"
        onClick={() => (hasSelection && !selected ? onTarget() : onSelect())}
        disabled={disabled || !selectable}
        style={{
          transform: transform
            ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
            : undefined,
        }}
        aria-label={`${labels.select} ${player.display_name}`}
        title={player.display_name}
      >
        <span className="class-dot" style={{ backgroundColor: item.color }} />
        <span className="player-card-name">
          {player.display_name}
          <small>{item.name}</small>
        </span>
        {ultimate && (
          <span
            className="ultimate-icon"
            title={ultimate.name}
            style={
              ultimate.icon_storage_path && iconBase
                ? {
                    backgroundImage: `url(${iconBase}/${ultimate.icon_storage_path.split("/").map(encodeURIComponent).join("/")})`,
                  }
                : undefined
            }
          >
            {ultimate.icon_storage_path && iconBase ? "" : "✦"}
          </span>
        )}
        {disabled && <small>{labels.leave}</small>}
      </button>
      {assignment && selectable && (
        <label className="ultimate-picker">
          <span className="ultimate-picker-label">{labels.ultimate}</span>
          <select
            value={assignment.ultimate_id ?? ""}
            disabled={disabled}
            onChange={(event) => onUltimate(event.target.value || null)}
            aria-label={`${labels.ultimate}: ${player.display_name}`}
            title={ultimate?.name ?? labels.ultimate}
          >
            <option value="">—</option>
            {ultimates.map((choice) => (
              <option
                key={choice.id}
                value={choice.id}
                disabled={!choice.active}
              >
                {compact ? choice.code : choice.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {compact && assignment && selectable && onRemove && (
        <button
          type="button"
          className="compact-remove"
          aria-label={`${labels.remove} ${player.display_name}`}
          title={`${labels.remove} ${player.display_name}`}
          disabled={disabled}
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </div>
  );
}

function Squad({
  party,
  number,
  assignments,
  players,
  selectedId,
  busy,
  editable,
  chooseDestination,
  choosePlayer,
  ultimates,
  iconBase,
  onUltimate,
  onRemove,
  compact,
  labels,
}: {
  party: Party;
  number: number;
  assignments: Assignment[];
  players: Player[];
  selectedId: string | null;
  busy: boolean;
  editable: boolean;
  chooseDestination: (destination: Destination) => void;
  choosePlayer: (id: string) => void;
  ultimates: Ultimate[];
  iconBase: string;
  onUltimate: (playerId: string, ultimateId: string | null) => void;
  onRemove: (playerId: string) => void;
  compact: boolean;
  labels: Labels;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `squad:${party}${number}`,
    disabled: !editable,
  });
  const occupants = assignments
    .filter((a) => a.party === party && a.squad_number === number)
    .sort((a, b) => a.slot_number - b.slot_number);
  return (
    <section ref={setNodeRef} className={`squad ${isOver ? "drop-over" : ""}`}>
      <button
        className="squad-heading"
        type="button"
        disabled={!selectedId || busy || !editable}
        onClick={() => chooseDestination({ party, squad: number, slot: null })}
      >
        <strong>
          {party}
          {number}
        </strong>
        <span>{occupants.length}/6</span>
      </button>
      <div className="squad-players">
        {occupants.map((assignment) => {
          const player = players.find((p) => p.id === assignment.player_id);
          return (
            player && (
              <PlayerCard
                key={player.id}
                player={player}
                assignment={assignment}
                disabled={busy}
                selected={selectedId === player.id}
                hasSelection={!!selectedId}
                selectable={editable}
                onSelect={() => choosePlayer(player.id)}
                onTarget={() =>
                  selectedId && selectedId !== player.id
                    ? chooseDestination({
                        party,
                        squad: number,
                        slot: assignment.slot_number,
                      })
                    : choosePlayer(player.id)
                }
                ultimates={ultimates}
                iconBase={iconBase}
                onUltimate={(id) => onUltimate(player.id, id)}
                compact={compact}
                onRemove={() => onRemove(player.id)}
                labels={labels}
              />
            )
          );
        })}
        {compact &&
          Array.from({ length: 6 - occupants.length }, (_, index) => (
            <div
              key={`empty-${index}`}
              className="squad-slot-placeholder"
              aria-hidden="true"
            >
              —
            </div>
          ))}
      </div>
      {!compact && occupants.length === 0 && (
        <div className="squad-empty">{labels.empty}</div>
      )}
    </section>
  );
}

export function FormationBoard({
  players,
  assignments,
  leave,
  editable,
  ultimates,
  iconBase,
  labels,
}: {
  players: Player[];
  assignments: Assignment[];
  leave: string[];
  editable: boolean;
  ultimates: Ultimate[];
  iconBase: string;
  labels: Labels;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [compact, setCompact] = useState(false);
  const [showPool, setShowPool] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );
  const leaveIds = new Set(leave);
  const assignedIds = new Set(assignments.map((a) => a.player_id));
  const pool = players.filter(
    (p) =>
      !p.archived_at &&
      !assignedIds.has(p.id) &&
      p.display_name.toLowerCase().includes(search.toLowerCase()) &&
      (!classFilter || p.current_class === classFilter),
  );
  const submit = (playerId: string, destination: Destination) => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await moveFormationPlayer({ playerId, ...destination });
      if (result.ok) {
        setSelectedId(null);
        router.refresh();
      } else setError(labels.error);
    });
  };
  const onUltimate = (playerId: string, ultimateId: string | null) => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await setAssignmentUltimate(playerId, ultimateId);
      if (result.ok) router.refresh();
      else setError(labels.error);
    });
  };
  const chooseDestination = (destination: Destination) => {
    if (selectedId) submit(selectedId, destination);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const playerId = String(active.id).replace(/^player:/, "");
    const target = String(over.id);
    if (target === "pool")
      submit(playerId, { party: null, squad: null, slot: null });
    else if (target.startsWith("squad:")) {
      const code = target.slice(6);
      submit(playerId, {
        party: code[0] as Party,
        squad: Number(code[1]),
        slot: null,
      });
    } else if (target.startsWith("slot:")) {
      const assignment = assignments.find(
        (a) => a.player_id === target.slice(5),
      );
      if (assignment)
        submit(playerId, {
          party: assignment.party,
          squad: assignment.squad_number,
          slot: assignment.slot_number,
        });
    }
  };
  const { setNodeRef: setPoolRef, isOver: poolOver } = useDroppable({
    id: "pool",
    disabled: !editable,
  });
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="builder-view-controls">
        <button
          type="button"
          className="secondary-button"
          aria-pressed={!compact}
          onClick={() => setCompact(false)}
        >
          {labels.normalMode}
        </button>
        <button
          type="button"
          className="secondary-button"
          aria-pressed={compact}
          onClick={() => setCompact(true)}
        >
          {labels.compactMode}
        </button>
        {compact && (
          <button
            type="button"
            className="secondary-button"
            aria-expanded={showPool}
            onClick={() => setShowPool(!showPool)}
          >
            {showPool ? labels.hidePool : labels.showPool}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="error-state">
          {error}
        </p>
      )}
      <div className={`builder-grid ${compact ? "builder-compact" : ""}`}>
        <section
          ref={setPoolRef}
          className={`panel pool-panel ${poolOver ? "drop-over" : ""} ${showPool ? "pool-visible" : ""}`}
        >
          <div className="section-title">
            <h2>{labels.pool}</h2>
            <strong>{pool.length}</strong>
          </div>
          <div className="toolbar">
            <label>
              {labels.search}
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              {labels.class}
              <select
                value={classFilter}
                onChange={(event) => setClassFilter(event.target.value)}
              >
                <option value="">{labels.all}</option>
                {guildClasses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {selectedId && editable && (
            <button
              type="button"
              className="secondary-button"
              disabled={pending}
              onClick={() =>
                chooseDestination({ party: null, squad: null, slot: null })
              }
            >
              {labels.remove}
            </button>
          )}
          {guildClasses.map((item) => {
            const group = pool.filter((p) => p.current_class === item.id);
            return (
              group.length > 0 && (
                <div key={item.id} className="pool-group">
                  <h3 style={{ color: item.color }}>
                    {item.name} · {group.length}
                  </h3>
                  {group.map((player) => (
                    <PlayerCard
                      key={player.id}
                      player={player}
                      disabled={pending || leaveIds.has(player.id)}
                      selected={selectedId === player.id}
                      hasSelection={!!selectedId}
                      selectable={editable}
                      onSelect={() => setSelectedId(player.id)}
                      onTarget={() => setSelectedId(player.id)}
                      ultimates={ultimates}
                      iconBase={iconBase}
                      onUltimate={() => {}}
                      compact={false}
                      labels={labels}
                    />
                  ))}
                </div>
              )
            );
          })}
        </section>
        {(["A", "B"] as const).map((party) => (
          <section key={party} className="party-column">
            <h2>{party === "A" ? labels.partyA : labels.partyB}</h2>
            {[1, 2, 3, 4, 5].map((number) => (
              <Squad
                key={number}
                party={party}
                number={number}
                assignments={assignments}
                players={players}
                selectedId={selectedId}
                busy={pending}
                editable={editable}
                chooseDestination={chooseDestination}
                choosePlayer={setSelectedId}
                ultimates={ultimates}
                iconBase={iconBase}
                onUltimate={onUltimate}
                onRemove={(playerId) =>
                  submit(playerId, { party: null, squad: null, slot: null })
                }
                compact={compact}
                labels={labels}
              />
            ))}
          </section>
        ))}
      </div>
    </DndContext>
  );
}
