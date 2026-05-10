import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
          "Minimal padel scorekeeper for friendly matches. Track points, sets, set times and unforced errors with voice announcements.",
      },
    ],
  }),
});

type Screen = "setup" | "match" | "summary";

interface SetTime {
  start: number; // epoch ms
  end?: number;
  pausedAccum: number; // ms accumulated while paused
  pauseStart?: number; // epoch when pause began
}

interface Stored {
  cfg: MatchConfig;
  history: Snapshot[];
  setTimes: SetTime[];
  speakerOn: boolean;
  screen: Screen;
}

const STORAGE_KEY = "padel-match-v2";

function Index() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [cfg, setCfg] = useState<MatchConfig | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([initialSnapshot()]);
  const [setTimes, setSetTimes] = useState<SetTime[]>([]);
  const [speakerOn, setSpeakerOn] = useState(true);

  // Hydrate
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: Stored = JSON.parse(raw);
      if (parsed?.cfg) {
        setCfg(parsed.cfg);
        setHistory(parsed.history ?? [initialSnapshot()]);
        setSetTimes(parsed.setTimes ?? []);
        setSpeakerOn(parsed.speakerOn ?? true);
        setScreen(parsed.screen ?? "match");
      }
    } catch {}
  }, []);

  // Persist
  useEffect(() => {
    if (cfg) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ cfg, history, setTimes, speakerOn, screen } as Stored),
      );
    }
  }, [cfg, history, setTimes, speakerOn, screen]);

  const snapshot = history[history.length - 1];
  const prevSnapshot = history.length > 1 ? history[history.length - 2] : null;

  const startMatch = (bestOf: 3 | 5, goldenPoint: boolean, speaker: boolean) => {
    setCfg({
      teamA: { name: "Team A", players: ["", ""] },
      teamB: { name: "Team B", players: ["", ""] },
      bestOf,
      goldenPoint,
    });
    setHistory([initialSnapshot()]);
    setSetTimes([]);
    setSpeakerOn(speaker);
    setScreen("match");
  };

  const onPoint = (team: TeamId) => {
    if (!cfg) return;
    setHistory((h) => {
      const prev = h[h.length - 1];
      const next = awardPoint(prev, team, cfg);

      // Set timer bookkeeping
      setSetTimes((times) => {
        const t = [...times];
        const currentSetIdx = next.sets.length; // index of current (or just-completed) set
        // First point of a set: start timer if not started
        const activeIdx = prev.sets.length; // set index BEFORE this point
        if (!t[activeIdx]) {
          t[activeIdx] = { start: Date.now(), pausedAccum: 0 };
        }
        // If a set just finalized, close that timer
        if (next.sets.length > prev.sets.length) {
          const idx = prev.sets.length;
          if (t[idx] && !t[idx].end) {
            t[idx] = { ...t[idx], end: Date.now() };
          }
        }
        return t;
      });

      // Voice
      if (speakerOn) speakScore(next, cfg, team);

      // If match over → go to summary
      if (next.matchOver) {
        setTimeout(() => setScreen("summary"), 300);
      }
      return [...h, next];
    });
  };

  const onUnforced = (team: TeamId) => {
    setHistory((h) => [...h, addUnforced(h[h.length - 1], team)]);
  };

  const undo = () => {
    setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
  };

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setCfg(null);
    setHistory([initialSnapshot()]);
    setSetTimes([]);
    setScreen("setup");
  };

  const togglePauseCurrentSet = () => {
    setSetTimes((times) => {
      const idx = snapshot.sets.length;
      const t = [...times];
      const cur = t[idx];
      if (!cur || cur.end) return times;
      if (cur.pauseStart) {
        // resume
        t[idx] = {
          ...cur,
          pausedAccum: cur.pausedAccum + (Date.now() - cur.pauseStart),
          pauseStart: undefined,
        };
      } else {
        t[idx] = { ...cur, pauseStart: Date.now() };
      }
      return t;
    });
  };

  const updateNames = (next: MatchConfig) => setCfg(next);

  return (
    <main className="min-h-dvh w-full">
      {screen === "setup" || !cfg ? (
        <Setup onStart={startMatch} initialSpeaker={speakerOn} />
      ) : screen === "summary" ? (
        <Summary
          cfg={cfg}
          snapshot={snapshot}
          setTimes={setTimes}
          onSave={updateNames}
          onNew={reset}
        />
      ) : (
        <MatchView
          cfg={cfg}
          snapshot={snapshot}
          prevSnapshot={prevSnapshot}
          setTimes={setTimes}
          speakerOn={speakerOn}
          onToggleSpeaker={() => setSpeakerOn((v) => !v)}
          canUndo={history.length > 1}
          onPoint={onPoint}
          onUnforced={onUnforced}
          onUndo={undo}
          onReset={reset}
          onTogglePauseSet={togglePauseCurrentSet}
        />
      )}
    </main>
  );
}

/* -------------------- Voice -------------------- */

function speakScore(s: Snapshot, cfg: MatchConfig, scorer: TeamId) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const teamLabel = scorer === "A" ? cfg.teamA.name : cfg.teamB.name;
  let phrase = "";
  if (s.matchOver) {
    const winner = s.winner === "A" ? cfg.teamA.name : cfg.teamB.name;
    phrase = `Game, set and match. ${winner} wins.`;
  } else {
    const disp = pointDisplay(s);
    if (s.inTiebreak) {
      phrase = `${teamLabel} scores. Tiebreak ${disp.A} ${disp.B}.`;
    } else if (s.points.A === 0 && s.points.B === 0) {
      // game just ended
      phrase = `Game ${teamLabel}. ${s.games.A} ${s.games.B}.`;
    } else {
      const said = (v: string) =>
        v === "0" ? "love" : v === "AD" ? "advantage" : v;
      phrase = `${teamLabel}, ${said(scorer === "A" ? disp.A : disp.B)} ${said(
        scorer === "A" ? disp.B : disp.A,
      )}`;
    }
  }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(phrase);
    u.rate = 1.05;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch {}
}

/* -------------------- Setup -------------------- */

function Setup({
  onStart,
  initialSpeaker,
}: {
  onStart: (bestOf: 3 | 5, golden: boolean, speaker: boolean) => void;
  initialSpeaker: boolean;
}) {
  const [golden, setGolden] = useState(true);
  const [speaker, setSpeaker] = useState(initialSpeaker);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 py-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Padel · Court Tracker
          </p>
          <h1 className="font-display text-3xl font-bold">New match</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a format. Add names later.
          </p>
        </div>
        <div className="size-10 rounded-full bg-primary/20 ring-1 ring-primary/40 grid place-items-center">
          <span className="size-3 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
        </div>
      </header>

      <div className="flex flex-col gap-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Format
        </p>
        <button
          onClick={() => onStart(3, golden, speaker)}
          className="rounded-3xl bg-primary px-6 py-8 text-left text-primary-foreground shadow-[0_8px_30px_-8px_var(--primary)] active:scale-[0.99] transition"
        >
          <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-70">
            Standard
          </p>
          <p className="font-display text-3xl font-bold">Best of 3</p>
          <p className="mt-1 text-sm opacity-80">First to 2 sets wins</p>
        </button>
        <button
          onClick={() => onStart(5, golden, speaker)}
          className="rounded-3xl bg-card px-6 py-8 text-left ring-1 ring-border active:scale-[0.99] transition"
        >
          <p
            className="text-xs font-bold uppercase tracking-[0.25em]"
            style={{ color: "var(--accent)" }}
          >
            Long
          </p>
          <p className="font-display text-3xl font-bold">Best of 5</p>
          <p className="mt-1 text-sm text-muted-foreground">
            First to 3 sets wins
          </p>
        </button>
      </div>

      <div className="rounded-2xl bg-card p-2">
        <ToggleRow
          label="Golden Point"
          desc="Sudden death at deuce"
          on={golden}
          onChange={() => setGolden((g) => !g)}
        />
        <ToggleRow
          label="Speaker"
          desc="Announce score out loud"
          on={speaker}
          onChange={() => setSpeaker((g) => !g)}
        />
      </div>

      <p className="mt-auto text-center text-xs text-muted-foreground">
        Stick the phone on the wall. Tap a team panel to score.
      </p>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  on,
  onChange,
}: {
  label: string;
  desc: string;
  on: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-xl px-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <button
        onClick={onChange}
        className={`relative h-7 w-12 rounded-full transition ${
          on ? "bg-primary" : "bg-border"
        }`}
        aria-pressed={on}
      >
        <span
          className={`absolute top-0.5 size-6 rounded-full bg-background transition ${
            on ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}

/* -------------------- Match -------------------- */

function MatchView({
  cfg,
  snapshot,
  setTimes,
  speakerOn,
  onToggleSpeaker,
  canUndo,
  onPoint,
  onUnforced,
  onUndo,
  onReset,
  onTogglePauseSet,
}: {
  cfg: MatchConfig;
  snapshot: Snapshot;
  prevSnapshot: Snapshot | null;
  setTimes: SetTime[];
  speakerOn: boolean;
  onToggleSpeaker: () => void;
  canUndo: boolean;
  onPoint: (t: TeamId) => void;
  onUnforced: (t: TeamId) => void;
  onUndo: () => void;
  onReset: () => void;
  onTogglePauseSet: () => void;
}) {
  const points = useMemo(() => pointDisplay(snapshot), [snapshot]);
  const currentSetIdx = snapshot.sets.length;
  const currentTimer = setTimes[currentSetIdx];

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <span className="size-2 rounded-full bg-primary animate-pulse" />
          {snapshot.matchOver
            ? "Match complete"
            : snapshot.inTiebreak
              ? "Tiebreak"
              : `Best of ${cfg.bestOf}`}
        </div>
        <div className="flex gap-1.5">
          <IconBtn onClick={onToggleSpeaker} active={speakerOn} label="Speaker">
            {speakerOn ? "🔊" : "🔇"}
          </IconBtn>
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

      {/* Set timer + history strip */}
      <div className="flex items-stretch gap-2 px-4 pt-3">
        <SetTimerCard
          timer={currentTimer}
          setIdx={currentSetIdx}
          onTogglePause={onTogglePauseSet}
          disabled={snapshot.matchOver}
        />
        <SetStrip snapshot={snapshot} setTimes={setTimes} />
      </div>

      {/* Teams */}
      <div className="grid flex-1 grid-cols-1 gap-3 px-4 pb-4 pt-3">
        <TeamPanel
          accent="team-a"
          name={cfg.teamA.name}
          point={points.A}
          games={snapshot.games.A}
          setsWon={snapshot.setsWon.A}
          unforced={snapshot.unforced.A}
          disabled={snapshot.matchOver}
          onPoint={() => onPoint("A")}
          onUnforced={() => onUnforced("A")}
        />
        <TeamPanel
          accent="team-b"
          name={cfg.teamB.name}
          point={points.B}
          games={snapshot.games.B}
          setsWon={snapshot.setsWon.B}
          unforced={snapshot.unforced.B}
          disabled={snapshot.matchOver}
          onPoint={() => onPoint("B")}
          onUnforced={() => onUnforced("B")}
        />
      </div>
    </div>
  );
}

function IconBtn({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`grid size-8 place-items-center rounded-full text-sm transition ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function SetTimerCard({
  timer,
  setIdx,
  onTogglePause,
  disabled,
}: {
  timer: SetTime | undefined;
  setIdx: number;
  onTogglePause: () => void;
  disabled: boolean;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  let elapsed = 0;
  let paused = false;
  if (timer) {
    const end = timer.end ?? Date.now();
    paused = !!timer.pauseStart;
    const pauseExtra = timer.pauseStart ? Date.now() - timer.pauseStart : 0;
    elapsed = end - timer.start - timer.pausedAccum - pauseExtra;
  }

  return (
    <button
      onClick={onTogglePause}
      disabled={disabled || !timer}
      className="flex flex-col items-start justify-center rounded-2xl bg-card px-3 py-2 text-left ring-1 ring-border disabled:opacity-60"
    >
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
        Set {setIdx + 1} {paused ? "· paused" : timer ? "· live" : ""}
      </span>
      <span className="score-num text-base">
        {timer ? fmtElapsed(elapsed) : "0:00"}
      </span>
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
        {!timer ? "Tap a team to start" : paused ? "Tap to resume" : "Tap to pause"}
      </span>
    </button>
  );
}

function SetStrip({
  snapshot,
  setTimes,
}: {
  snapshot: Snapshot;
  setTimes: SetTime[];
}) {
  const cells: Array<{
    a: number | string;
    b: number | string;
    live?: boolean;
    duration?: string;
  }> = snapshot.sets.map((s, i) => {
    const t = setTimes[i];
    const dur =
      t && t.end ? fmtElapsed(t.end - t.start - t.pausedAccum) : undefined;
    return { a: s[0], b: s[1], duration: dur };
  });
  if (!snapshot.matchOver) {
    cells.push({ a: snapshot.games.A, b: snapshot.games.B, live: true });
  }
  return (
    <div className="flex flex-1 items-center gap-2 overflow-x-auto rounded-2xl bg-card p-2 ring-1 ring-border">
      <div className="flex flex-col gap-1 pr-1 text-[9px] uppercase tracking-widest">
        <span style={{ color: "var(--team-a)" }}>A</span>
        <span style={{ color: "var(--team-b)" }}>B</span>
      </div>
      {cells.map((c, i) => (
        <div
          key={i}
          className={`flex flex-col items-center rounded-lg px-2 py-1 tabular ${
            c.live ? "bg-muted" : ""
          }`}
        >
          <span className="score-num text-sm" style={{ color: "var(--team-a)" }}>
            {c.a}
          </span>
          <span className="score-num text-sm" style={{ color: "var(--team-b)" }}>
            {c.b}
          </span>
          {c.duration && (
            <span className="text-[8px] text-muted-foreground">{c.duration}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function TeamPanel({
  accent,
  name,
  point,
  games,
  setsWon,
  unforced,
  disabled,
  onPoint,
  onUnforced,
}: {
  accent: "team-a" | "team-b";
  name: string;
  point: string;
  games: number;
  setsWon: number;
  unforced: number;
  disabled: boolean;
  onPoint: () => void;
  onUnforced: () => void;
}) {
  return (
    <button
      onClick={onPoint}
      disabled={disabled}
      className="group relative flex flex-1 flex-col justify-between overflow-hidden rounded-3xl p-5 text-left transition active:scale-[0.99] disabled:opacity-60"
      style={{
        background: `color-mix(in oklab, var(--${accent}) 22%, var(--card))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, var(--${accent}) 50%, transparent)`,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ background: `var(--${accent})` }}
      />
      <div
        className="absolute -right-10 -top-10 size-32 rounded-full opacity-30 blur-2xl"
        style={{ background: `var(--${accent})` }}
      />

      <div className="relative flex items-start justify-between">
        <div>
          <p
            className="text-xs font-bold uppercase tracking-[0.3em]"
            style={{ color: `var(--${accent})` }}
          >
            {name}
          </p>
          <div className="mt-1 flex gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>
              Sets <span className="score-num text-foreground">{setsWon}</span>
            </span>
            <span>
              Games <span className="score-num text-foreground">{games}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="relative flex items-end justify-between">
        <p
          className="score-num leading-none"
          style={{
            fontSize: "clamp(4.5rem, 22vw, 8rem)",
            color: `var(--${accent})`,
            textShadow: `0 0 40px color-mix(in oklab, var(--${accent}) 50%, transparent)`,
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
          className="flex flex-col items-center gap-1 rounded-2xl bg-background/70 px-3 py-2 ring-1 ring-border backdrop-blur active:scale-95 transition"
        >
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Unforced
          </span>
          <span className="score-num text-xl text-destructive">{unforced}</span>
          <span className="text-[10px] font-semibold text-destructive">+ TAP</span>
        </div>
      </div>
    </button>
  );
}

/* -------------------- Summary -------------------- */

function Summary({
  cfg,
  snapshot,
  setTimes,
  onSave,
  onNew,
}: {
  cfg: MatchConfig;
  snapshot: Snapshot;
  setTimes: SetTime[];
  onSave: (c: MatchConfig) => void;
  onNew: () => void;
}) {
  const [aName, setAName] = useState(cfg.teamA.name);
  const [a1, setA1] = useState(cfg.teamA.players[0]);
  const [a2, setA2] = useState(cfg.teamA.players[1]);
  const [bName, setBName] = useState(cfg.teamB.name);
  const [b1, setB1] = useState(cfg.teamB.players[0]);
  const [b2, setB2] = useState(cfg.teamB.players[1]);

  const winner = snapshot.winner === "A" ? aName : bName;
  const totalMs = setTimes.reduce(
    (acc, t) => acc + ((t.end ?? Date.now()) - t.start - t.pausedAccum),
    0,
  );

  const save = () => {
    onSave({
      ...cfg,
      teamA: { name: aName.trim() || "Team A", players: [a1.trim(), a2.trim()] },
      teamB: { name: bName.trim() || "Team B", players: [b1.trim(), b2.trim()] },
    });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      <header>
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Match complete
        </p>
        <h1 className="font-display text-3xl font-bold">
          <span style={{ color: snapshot.winner === "A" ? "var(--team-a)" : "var(--team-b)" }}>
            {winner}
          </span>{" "}
          wins
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Total time {fmtElapsed(totalMs)} · {snapshot.sets.length} set
          {snapshot.sets.length !== 1 ? "s" : ""}
        </p>
      </header>

      <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
        <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
          Score
        </p>
        <div className="flex flex-col gap-2">
          {snapshot.sets.map((s, i) => {
            const t = setTimes[i];
            const dur = t && t.end ? fmtElapsed(t.end - t.start - t.pausedAccum) : "—";
            return (
              <div key={i} className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  Set {i + 1} · {dur}
                </span>
                <span className="score-num text-lg">
                  <span style={{ color: "var(--team-a)" }}>{s[0]}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span style={{ color: "var(--team-b)" }}>{s[1]}</span>
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Unforced A
            </p>
            <p className="score-num text-xl text-destructive">
              {snapshot.unforced.A}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Unforced B
            </p>
            <p className="score-num text-xl text-destructive">
              {snapshot.unforced.B}
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        Log who played
      </p>

      <NameCard
        accent="team-a"
        title="Team A"
        nameValue={aName}
        onName={setAName}
        p1={a1}
        p2={a2}
        onP1={setA1}
        onP2={setA2}
      />
      <NameCard
        accent="team-b"
        title="Team B"
        nameValue={bName}
        onName={setBName}
        p1={b1}
        p2={b2}
        onP1={setB1}
        onP2={setB2}
      />

      <div className="mt-auto flex gap-2">
        <button
          onClick={save}
          className="flex-1 rounded-2xl bg-muted py-4 text-sm font-bold text-foreground"
        >
          Save names
        </button>
        <button
          onClick={onNew}
          className="flex-1 rounded-2xl bg-primary py-4 text-sm font-bold text-primary-foreground shadow-[0_8px_30px_-8px_var(--primary)]"
        >
          New match
        </button>
      </div>
    </div>
  );
}

function NameCard({
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
    <div
      className="rounded-2xl bg-card p-4"
      style={{
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, var(--${accent}) 40%, transparent)`,
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className="size-2.5 rounded-full"
          style={{ background: `var(--${accent})` }}
        />
        <p
          className="text-xs uppercase tracking-widest"
          style={{ color: `var(--${accent})` }}
        >
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
