import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  addUnforced,
  awardPoint,
  initialSnapshot,
  pointDisplay,
  type MatchConfig,
  type Snapshot,
  type TeamId,
} from "@/lib/padel";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Padel Score — Court Tracker" },
      {
        name: "description",
        content:
          "Minimal padel scorekeeper for friendly matches. Track points, games, sets and unforced errors from your phone on the court.",
      },
    ],
  }),
});

type Screen = "setup" | "match";

interface Stored {
  cfg: MatchConfig;
  history: Snapshot[];
}

const STORAGE_KEY = "padel-match-v1";

function Index() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [cfg, setCfg] = useState<MatchConfig | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([initialSnapshot()]);

  // Hydrate
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: Stored = JSON.parse(raw);
      if (parsed?.cfg && parsed?.history?.length) {
        setCfg(parsed.cfg);
        setHistory(parsed.history);
        setScreen("match");
      }
    } catch {}
  }, []);

  // Persist
  useEffect(() => {
    if (cfg) localStorage.setItem(STORAGE_KEY, JSON.stringify({ cfg, history }));
  }, [cfg, history]);

  const snapshot = history[history.length - 1];

  const startMatch = (c: MatchConfig) => {
    setCfg(c);
    setHistory([initialSnapshot()]);
    setScreen("match");
  };

  const onPoint = (team: TeamId) => {
    if (!cfg) return;
    setHistory((h) => [...h, awardPoint(h[h.length - 1], team, cfg)]);
  };

  const onUnforced = (team: TeamId) => {
    setHistory((h) => [...h, addUnforced(h[h.length - 1], team)]);
  };

  const undo = () => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setCfg(null);
    setHistory([initialSnapshot()]);
    setScreen("setup");
  };

  return (
    <main className="min-h-dvh w-full">
      {screen === "setup" || !cfg ? (
        <Setup onStart={startMatch} />
      ) : (
        <MatchView
          cfg={cfg}
          snapshot={snapshot}
          canUndo={history.length > 1}
          onPoint={onPoint}
          onUnforced={onUnforced}
          onUndo={undo}
          onReset={reset}
        />
      )}
    </main>
  );
}

/* -------------------- Setup -------------------- */

function Setup({ onStart }: { onStart: (c: MatchConfig) => void }) {
  const [aName, setAName] = useState("Team A");
  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");
  const [bName, setBName] = useState("Team B");
  const [b1, setB1] = useState("");
  const [b2, setB2] = useState("");
  const [bestOf, setBestOf] = useState<1 | 3 | 5>(3);
  const [golden, setGolden] = useState(true);

  const submit = () => {
    onStart({
      teamA: { name: aName.trim() || "Team A", players: [a1.trim(), a2.trim()] },
      teamB: { name: bName.trim() || "Team B", players: [b1.trim(), b2.trim()] },
      bestOf,
      goldenPoint: golden,
    });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 py-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Padel · Court Tracker
          </p>
          <h1 className="font-display text-3xl font-bold">New match</h1>
        </div>
        <div className="size-10 rounded-full bg-primary/20 ring-1 ring-primary/40 grid place-items-center">
          <span className="size-3 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
        </div>
      </header>

      <TeamCard
        accent="team-a"
        title="Team A"
        nameValue={aName}
        onName={setAName}
        p1={a1}
        p2={a2}
        onP1={setA1}
        onP2={setA2}
      />
      <TeamCard
        accent="team-b"
        title="Team B"
        nameValue={bName}
        onName={setBName}
        p1={b1}
        p2={b2}
        onP1={setB1}
        onP2={setB2}
      />

      <div className="rounded-2xl bg-card p-4">
        <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
          Format
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[1, 3, 5].map((n) => (
            <button
              key={n}
              onClick={() => setBestOf(n as 1 | 3 | 5)}
              className={`rounded-xl py-3 text-sm font-semibold transition ${
                bestOf === n
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              Best of {n}
            </button>
          ))}
        </div>
        <label className="mt-4 flex items-center justify-between rounded-xl bg-muted px-4 py-3">
          <div>
            <p className="text-sm font-medium">Golden Point</p>
            <p className="text-xs text-muted-foreground">
              Sudden death at deuce (no advantage)
            </p>
          </div>
          <button
            onClick={() => setGolden((g) => !g)}
            className={`relative h-7 w-12 rounded-full transition ${
              golden ? "bg-primary" : "bg-border"
            }`}
            aria-pressed={golden}
          >
            <span
              className={`absolute top-0.5 size-6 rounded-full bg-background transition ${
                golden ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </label>
      </div>

      <button
        onClick={submit}
        className="mt-auto rounded-2xl bg-primary py-5 text-lg font-bold text-primary-foreground shadow-[0_8px_30px_-8px_var(--primary)] active:scale-[0.99] transition"
      >
        Start Match
      </button>
    </div>
  );
}

function TeamCard({
  accent,
  title,
  nameValue,
  onName,
  p1,
  p2,
  onP1,
  onP2,
}: {
  accent: "team-a" | "team-b";
  title: string;
  nameValue: string;
  onName: (v: string) => void;
  p1: string;
  p2: string;
  onP1: (v: string) => void;
  onP2: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          className="size-2.5 rounded-full"
          style={{ background: `var(--${accent})` }}
        />
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {title}
        </p>
      </div>
      <input
        value={nameValue}
        onChange={(e) => onName(e.target.value)}
        placeholder="Team name"
        className="w-full rounded-xl bg-muted px-4 py-3 text-base font-semibold outline-none focus:ring-2 focus:ring-primary"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          value={p1}
          onChange={(e) => onP1(e.target.value)}
          placeholder="Player 1"
          className="rounded-xl bg-muted px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <input
          value={p2}
          onChange={(e) => onP2(e.target.value)}
          placeholder="Player 2"
          className="rounded-xl bg-muted px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
    </div>
  );
}

/* -------------------- Match -------------------- */

function MatchView({
  cfg,
  snapshot,
  canUndo,
  onPoint,
  onUnforced,
  onUndo,
  onReset,
}: {
  cfg: MatchConfig;
  snapshot: Snapshot;
  canUndo: boolean;
  onPoint: (t: TeamId) => void;
  onUnforced: (t: TeamId) => void;
  onUndo: () => void;
  onReset: () => void;
}) {
  const points = useMemo(() => pointDisplay(snapshot), [snapshot]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <span className="size-2 rounded-full bg-primary animate-pulse" />
          {snapshot.matchOver
            ? "Match complete"
            : snapshot.inTiebreak
              ? "Tiebreak"
              : `Best of ${cfg.bestOf}`}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground disabled:opacity-40"
          >
            Undo
          </button>
          <button
            onClick={() => {
              if (confirm("End match and start over?")) onReset();
            }}
            className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground"
          >
            New
          </button>
        </div>
      </div>

      {/* Set history strip */}
      <div className="px-5 pt-3">
        <SetStrip snapshot={snapshot} />
      </div>

      {/* Teams */}
      <div className="grid flex-1 grid-cols-1 gap-3 px-5 pb-5 pt-3">
        <TeamPanel
          team="A"
          accent="team-a"
          name={cfg.teamA.name}
          players={cfg.teamA.players}
          point={points.A}
          games={snapshot.games.A}
          unforced={snapshot.unforced.A}
          serving={false}
          disabled={snapshot.matchOver}
          onPoint={() => onPoint("A")}
          onUnforced={() => onUnforced("A")}
        />
        <TeamPanel
          team="B"
          accent="team-b"
          name={cfg.teamB.name}
          players={cfg.teamB.players}
          point={points.B}
          games={snapshot.games.B}
          unforced={snapshot.unforced.B}
          serving={false}
          disabled={snapshot.matchOver}
          onPoint={() => onPoint("B")}
          onUnforced={() => onUnforced("B")}
        />
      </div>

      {snapshot.matchOver && (
        <div className="px-5 pb-6 text-center">
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            Winner
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-primary">
            {snapshot.winner === "A" ? cfg.teamA.name : cfg.teamB.name}
          </p>
        </div>
      )}
    </div>
  );
}

function SetStrip({ snapshot }: { snapshot: Snapshot }) {
  const cells: Array<{ a: number | string; b: number | string; live?: boolean }> = [
    ...snapshot.sets.map((s) => ({ a: s[0], b: s[1] })),
  ];
  if (!snapshot.matchOver) {
    cells.push({ a: snapshot.games.A, b: snapshot.games.B, live: true });
  }
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-2xl bg-card p-3">
      <div className="flex flex-col gap-1 pr-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <span style={{ color: "var(--team-a)" }}>A</span>
        <span style={{ color: "var(--team-b)" }}>B</span>
      </div>
      {cells.length === 0 && (
        <span className="text-xs text-muted-foreground">No games yet</span>
      )}
      {cells.map((c, i) => (
        <div
          key={i}
          className={`flex flex-col items-center gap-1 rounded-lg px-3 py-1 tabular ${
            c.live ? "bg-muted" : ""
          }`}
        >
          <span className="score-num text-base">{c.a}</span>
          <span className="score-num text-base">{c.b}</span>
        </div>
      ))}
      <div className="ml-auto flex flex-col items-end gap-0.5 pl-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Sets
        </span>
        <span className="score-num text-sm">
          <span style={{ color: "var(--team-a)" }}>{snapshot.setsWon.A}</span>
          <span className="text-muted-foreground"> · </span>
          <span style={{ color: "var(--team-b)" }}>{snapshot.setsWon.B}</span>
        </span>
      </div>
    </div>
  );
}

function TeamPanel({
  accent,
  name,
  players,
  point,
  games,
  unforced,
  disabled,
  onPoint,
  onUnforced,
}: {
  team: TeamId;
  accent: "team-a" | "team-b";
  name: string;
  players: [string, string];
  point: string;
  games: number;
  unforced: number;
  serving: boolean;
  disabled: boolean;
  onPoint: () => void;
  onUnforced: () => void;
}) {
  const playerLabel = players.filter(Boolean).join(" · ") || "—";
  return (
    <button
      onClick={onPoint}
      disabled={disabled}
      className="group relative flex flex-1 flex-col justify-between overflow-hidden rounded-3xl p-5 text-left transition active:scale-[0.99] disabled:opacity-60"
      style={{
        background: `color-mix(in oklab, var(--${accent}) 14%, var(--card))`,
      }}
    >
      {/* glow bar */}
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: `var(--${accent})` }}
      />
      <div className="flex items-start justify-between">
        <div>
          <p
            className="text-[11px] font-bold uppercase tracking-[0.25em]"
            style={{ color: `var(--${accent})` }}
          >
            {name}
          </p>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
            {playerLabel}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Games
          </p>
          <p className="score-num text-2xl">{games}</p>
        </div>
      </div>

      <div className="flex items-end justify-between">
        <p
          className="score-num leading-none"
          style={{
            fontSize: "clamp(4.5rem, 22vw, 8rem)",
            color: `var(--${accent})`,
            textShadow: `0 0 40px color-mix(in oklab, var(--${accent}) 40%, transparent)`,
          }}
        >
          {point}
        </p>
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) onUnforced();
          }}
          role="button"
          aria-label="Add unforced error"
          className="flex flex-col items-center gap-1 rounded-2xl bg-background/60 px-3 py-2 ring-1 ring-border backdrop-blur active:scale-95 transition"
        >
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Unforced
          </span>
          <span className="score-num text-xl text-destructive">{unforced}</span>
          <span className="text-[10px] font-semibold text-destructive">+ TAP</span>
        </div>
      </div>

      <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-widest text-muted-foreground/60">
        Tap card · score point
      </p>
    </button>
  );
}
