"use client";

import { useEffect, useMemo, useState, useCallback } from "react"; // useCallback kept for fetchHistory
import confetti from "canvas-confetti";
import {
  addUnforced,
  canAddUnforced,
  awardPoint,
  initialSnapshot,
  pointDisplay,
  currentServer,
  type MatchConfig,
  type Snapshot,
  type TeamId,
} from "@/lib/padel";
import { getPlayerCode, getOriginalCode, setPlayerCode, restoreOriginalCode } from "@/lib/device";
// getPlayerCode reads localStorage directly — used inside callbacks to avoid stale state
import {
  saveMatch,
  updateMatchNames,
  loadMatches,
  type MatchRecord,
  type MatchPage,
} from "@/lib/match-store";

function haptic(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {}
  }
}

function teamHex(team: TeamId) {
  return team === "A" ? "#0047FF" : "#DCFF1B";
}

function celebrateSet(team: TeamId) {
  const color = teamHex(team);
  const palette = [color, "#0047FF", "#DCFF1B", "#F4F2EC"];
  const burst = (x: number) =>
    confetti({
      particleCount: 80,
      spread: 75,
      startVelocity: 50,
      origin: { x, y: 0.7 },
      colors: palette,
    });
  burst(0.2);
  burst(0.8);
  setTimeout(() => burst(0.5), 180);
}

function celebrateMatch(team: TeamId) {
  const color = teamHex(team);
  const palette = [color, "#0047FF", "#DCFF1B", "#F4F2EC"];
  confetti({
    particleCount: 220,
    spread: 120,
    startVelocity: 60,
    origin: { y: 0.55 },
    colors: palette,
  });
  const end = Date.now() + 2200;
  const frame = () => {
    confetti({
      particleCount: 8,
      angle: 60,
      spread: 80,
      origin: { x: 0, y: 0.85 },
      colors: palette,
    });
    confetti({
      particleCount: 8,
      angle: 120,
      spread: 80,
      origin: { x: 1, y: 0.85 },
      colors: palette,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}

type Screen = "setup" | "match" | "summary";

interface SetTime {
  start: number;
  end?: number;
  pausedAccum: number;
  pauseStart?: number;
}

interface Stored {
  cfg: MatchConfig;
  history: Snapshot[];
  setTimes: SetTime[];
  speakerOn: boolean;
  screen: Screen;
  savedMatchId?: string;
}

const STORAGE_KEY = "padel-match-v2";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [cfg, setCfg] = useState<MatchConfig | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([initialSnapshot()]);
  const [setTimes, setSetTimes] = useState<SetTime[]>([]);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [bigMode, setBigMode] = useState(false);
  const [playerCode, setPlayerCodeState] = useState("");
  const [savedMatchId, setSavedMatchId] = useState<string | undefined>();
  const [saveError, setSaveError] = useState<string | undefined>();

  useEffect(() => {
    setPlayerCodeState(getPlayerCode());
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: Stored & { bigMode?: boolean } = JSON.parse(raw);
      if (parsed?.cfg) {
        setCfg(parsed.cfg);
        setHistory(parsed.history ?? [initialSnapshot()]);
        setSetTimes(parsed.setTimes ?? []);
        setSpeakerOn(parsed.speakerOn ?? true);
        setBigMode(parsed.bigMode ?? false);
        setScreen(parsed.screen ?? "match");
        setSavedMatchId(parsed.savedMatchId);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (cfg) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          cfg,
          history,
          setTimes,
          speakerOn,
          screen,
          bigMode,
          savedMatchId,
        } as Stored & { bigMode: boolean }),
      );
    }
  }, [cfg, history, setTimes, speakerOn, screen, bigMode, savedMatchId]);

  const snapshot = history[history.length - 1];
  const prevSnapshot = history.length > 1 ? history[history.length - 2] : null;

  const startMatch = (
    bestOf: 3 | 5,
    goldenPoint: boolean,
    speaker: boolean,
    initialServer: TeamId,
  ) => {
    setCfg({
      teamA: { name: "Team A", players: ["", ""] },
      teamB: { name: "Team B", players: ["", ""] },
      bestOf,
      goldenPoint,
      initialServer,
    });
    setHistory([initialSnapshot()]);
    setSetTimes([]);
    setSpeakerOn(speaker);
    setSavedMatchId(undefined);
    setScreen("match");
  };

  const onPoint = (team: TeamId) => {
    if (!cfg) return;
    // Compute next state outside the updater so side-effects run exactly once
    setHistory((h) => {
      const prev = h[h.length - 1];
      const next = awardPoint(prev, team, cfg);

      setSetTimes((times) => {
        const t = [...times];
        const activeIdx = prev.sets.length;
        if (!t[activeIdx]) {
          t[activeIdx] = { start: Date.now(), pausedAccum: 0 };
        }
        if (next.sets.length > prev.sets.length) {
          const idx = prev.sets.length;
          if (t[idx] && !t[idx].end) {
            t[idx] = { ...t[idx], end: Date.now() };
          }
        }
        return t;
      });

      // Use setTimeout(0) to escape the updater — React Strict Mode calls
      // updaters twice in dev which would double-fire speech and haptics
      const _next = next;
      const _prev = prev;
      setTimeout(() => {
        if (speakerOn) speakScore(_next, cfg, team, _prev);
        if (_next.matchOver) {
          haptic([60, 40, 60, 40, 200]);
          celebrateMatch(_next.winner ?? team);
          setTimeout(() => setScreen("summary"), 1500);
        } else if (_next.sets.length > _prev.sets.length) {
          haptic([40, 30, 80]);
          celebrateSet(team);
        } else if (_next.games.A > _prev.games.A || _next.games.B > _prev.games.B) {
          haptic([20, 30, 40]);
        } else {
          haptic(25);
        }
      }, 0);

      return [...h, next];
    });
  };

  const onUnforced = (team: TeamId) => {
    haptic([10, 20, 10]);
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
    setSavedMatchId(undefined);
    setScreen("setup");
  };

  const totalMs = setTimes.reduce(
    (acc, t) => acc + ((t.end ?? Date.now()) - t.start - t.pausedAccum),
    0,
  );

  // Auto-save to Firestore when summary screen is shown.
  // Read playerCode directly from localStorage to avoid stale closure.
  useEffect(() => {
    if (screen !== "summary" || !cfg || !snapshot.matchOver || savedMatchId) return;
    const code = getPlayerCode();
    if (!code) return;
    saveMatch(code, cfg, snapshot, totalMs)
      .then((id) => setSavedMatchId(id))
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setSaveError(msg);
        console.error("Failed to save match:", e);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const updateNames = async (next: MatchConfig) => {
    setCfg(next);
    if (playerCode && savedMatchId) {
      try {
        await updateMatchNames(playerCode, savedMatchId, next);
      } catch (e) {
        console.error("Failed to update match names", e);
      }
    }
  };

  const handleCodeChange = (code: string) => {
    setPlayerCode(code);
    setPlayerCodeState(code);
  };

  const handleRestoreCode = () => {
    const original = restoreOriginalCode();
    setPlayerCodeState(original);
  };

  const togglePauseCurrentSet = () => {
    setSetTimes((times) => {
      const idx = snapshot.sets.length;
      const t = [...times];
      const cur = t[idx];
      if (!cur || cur.end) return times;
      if (cur.pauseStart) {
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

  return (
    <main className="min-h-dvh w-full">
      <InstallModal />
      {screen === "setup" || !cfg ? (
        <Setup
          onStart={startMatch}
          initialSpeaker={speakerOn}
          playerCode={playerCode}
          onCodeChange={handleCodeChange}
          onRestoreCode={handleRestoreCode}
        />
      ) : screen === "summary" ? (
        <Summary
          cfg={cfg}
          snapshot={snapshot}
          setTimes={setTimes}
          saved={!!savedMatchId}
          saveError={saveError}
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
          bigMode={bigMode}
          onToggleBig={() => setBigMode((v) => !v)}
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

/* -------------------- Install Modal -------------------- */

const INSTALL_KEY = "padel-install-dismissed";

function InstallModal() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(INSTALL_KEY)) return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator as any).standalone === true;
    if (standalone) return;

    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua) && !/CriOS|FxiOS/i.test(ua);
    const isAndroid = /android/i.test(ua);

    if (isIOS) {
      setTimeout(() => {
        setPlatform("ios");
        setShow(true);
      }, 2000);
    } else if (isAndroid) {
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setTimeout(() => {
          setPlatform("android");
          setShow(true);
        }, 2000);
      };
      window.addEventListener("beforeinstallprompt", handler);
      return () => window.removeEventListener("beforeinstallprompt", handler);
    }
  }, []);

  const dismiss = (permanent: boolean) => {
    if (permanent) localStorage.setItem(INSTALL_KEY, "1");
    setShow(false);
  };

  const install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    }
    dismiss(true);
  };

  if (!show || !platform) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pb-8">
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
        onClick={() => dismiss(false)}
      />
      <div className="relative w-full max-w-md rounded-3xl bg-card p-6 shadow-2xl ring-1 ring-border">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-primary">
            <span className="text-2xl">🎾</span>
          </div>
          <div>
            <p className="font-bold text-base">Add to Home Screen</p>
            <p className="text-xs text-muted-foreground">Get the full app experience</p>
          </div>
        </div>

        {platform === "ios" ? (
          <div className="mb-5 flex flex-col gap-3">
            {[
              { icon: "⬆️", text: "Tap the Share button in Safari's toolbar" },
              { icon: "➕", text: 'Scroll down and tap "Add to Home Screen"' },
              { icon: "✅", text: 'Tap "Add" to install Padel Score' },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xl">{step.icon}</span>
                <p className="text-sm text-muted-foreground">{step.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-5 text-sm text-muted-foreground">
            Install Padel Score for instant access from your home screen — works offline too.
          </p>
        )}

        <div className="flex gap-2">
          {platform === "android" && (
            <button
              onClick={install}
              className="flex-1 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground"
            >
              Install
            </button>
          )}
          <button
            onClick={() => dismiss(false)}
            className="flex-1 rounded-2xl bg-muted py-3 text-sm font-semibold text-foreground"
          >
            Not now
          </button>
          <button
            onClick={() => dismiss(true)}
            className="flex-1 rounded-2xl bg-muted py-3 text-sm font-semibold text-muted-foreground"
          >
            Don&apos;t show again
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Voice -------------------- */

const PT = ["love", "fifteen", "thirty", "forty"] as const;

function speakScore(s: Snapshot, cfg: MatchConfig, scorer: TeamId, prev: Snapshot) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  const nameA = cfg.teamA.name;
  const nameB = cfg.teamB.name;
  const scorerName = scorer === "A" ? nameA : nameB;
  // Always announce server's score first, receiver's second
  const server = currentServer(cfg, s);
  let phrase = "";

  if (s.matchOver) {
    const winner = s.winner === "A" ? nameA : nameB;
    phrase = `Match ${winner}.`;
  } else if (s.inTiebreak && prev.inTiebreak) {
    // Tiebreak — server's count first
    const svr = server === "A" ? s.points.A : s.points.B;
    const rcv = server === "A" ? s.points.B : s.points.A;
    phrase = svr === rcv ? `${svr} all.` : `${svr} ${rcv}.`;
  } else if (s.points.A === 0 && s.points.B === 0 && !s.inTiebreak) {
    const setJustWon = s.sets.length > prev.sets.length;
    if (setJustWon) {
      const setNum = s.sets.length; // sets array already updated
      phrase = `Set ${setNum} ${scorerName}.`;
    } else {
      phrase = `Game ${scorerName}.`;
    }
  } else if (!s.inTiebreak) {
    const { A, B } = s.points;
    if (A >= 3 && B >= 3) {
      if (A === B) {
        phrase = "Deuce.";
      } else {
        const advName = A > B ? nameA : nameB;
        phrase = `Advantage ${advName}.`;
      }
    } else {
      // Server's score first, receiver's second
      const svr = server === "A" ? A : B;
      const rcv = server === "A" ? B : A;
      const svrW = PT[Math.min(svr, 3)];
      const rcvW = PT[Math.min(rcv, 3)];
      phrase = svr === rcv ? `${svrW} all.` : `${svrW} ${rcvW}.`;
    }
  }

  if (!phrase) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(phrase);
    u.rate = 1.05;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch {}
}

/* -------------------- Setup -------------------- */

type SetupTab = "new" | "history";

function Setup({
  onStart,
  initialSpeaker,
  playerCode,
  onCodeChange,
  onRestoreCode,
}: {
  onStart: (bestOf: 3 | 5, golden: boolean, speaker: boolean, initialServer: TeamId) => void;
  initialSpeaker: boolean;
  playerCode: string;
  onCodeChange: (code: string) => void;
  onRestoreCode: () => void;
}) {
  const [golden, setGolden] = useState(true);
  const [speaker, setSpeaker] = useState(initialSpeaker);
  const [tab, setTab] = useState<SetupTab>("new");
  const [history, setHistory] = useState<MatchRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<MatchPage["cursor"]>(null);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const originalCode = getOriginalCode();

  const fetchHistory = useCallback(async (code: string) => {
    if (!code) return;
    setLoadingHistory(true);
    try {
      const page = await loadMatches(code);
      setHistory(page.records);
      setCursor(page.cursor);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const loadMore = async () => {
    if (!playerCode || !cursor) return;
    setLoadingMore(true);
    try {
      const page = await loadMatches(playerCode, cursor);
      setHistory((prev) => [...prev, ...page.records]);
      setCursor(page.cursor);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (tab === "history" && playerCode) {
      fetchHistory(playerCode);
    }
  }, [tab, playerCode, fetchHistory]);

  const handleCodeSubmit = () => {
    const trimmed = codeInput.toUpperCase().trim();
    if (trimmed.length < 4) {
      setCodeError("Code must be at least 4 characters");
      return;
    }
    onCodeChange(trimmed);
    setShowCodeInput(false);
    setCodeInput("");
    setCodeError("");
    if (tab === "history") fetchHistory(trimmed);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pb-8 pt-safe">
      <header className="flex items-center justify-between">
        <BrandMark />
        <button
          onClick={() => setShowCodeInput((v) => !v)}
          className="flex flex-col items-end gap-0.5"
        >
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
            Player code
          </span>
          <span className="font-mono text-xs font-bold tracking-wider text-primary">
            {playerCode || "…"}
          </span>
        </button>
      </header>

      {showCodeInput && (
        <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <p className="mb-1 text-xs font-semibold">Enter a code to sync with another device</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Share your code with others or enter theirs to view shared history.
          </p>
          <div className="flex gap-2">
            <input
              value={codeInput}
              onChange={(e) => {
                setCodeInput(e.target.value.toUpperCase());
                setCodeError("");
              }}
              placeholder={playerCode}
              className="flex-1 rounded-xl bg-muted px-3 py-2 font-mono text-sm uppercase outline-none focus:ring-2 focus:ring-primary"
              maxLength={9}
            />
            <button
              onClick={handleCodeSubmit}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Use
            </button>
          </div>
          {codeError && <p className="mt-1.5 text-xs text-destructive">{codeError}</p>}
          <CopyButton text={playerCode} label={`Copy my code (${playerCode})`} />
          {playerCode !== originalCode && (
            <button
              onClick={() => {
                onRestoreCode();
                setShowCodeInput(false);
              }}
              className="mt-2 w-full rounded-xl bg-muted py-2.5 text-sm font-semibold text-foreground"
            >
              Back to my code ({originalCode})
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex rounded-2xl bg-muted p-1">
        {(["new", "history"] as SetupTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition ${
              tab === t ? "bg-background shadow text-foreground" : "text-muted-foreground"
            }`}
          >
            {t === "new" ? "New Match" : "History"}
          </button>
        ))}
      </div>

      {tab === "new" ? (
        <>
          <div>
            <h1 className="font-display text-4xl font-extrabold tracking-tight">New match</h1>
            <p className="mt-1 text-base text-muted-foreground">Pick a format. Add names later.</p>
          </div>

          <div className="flex flex-col gap-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Format</p>
            <button
              onClick={() => onStart(3, golden, speaker, "A")}
              className="rounded-3xl bg-primary px-7 py-10 text-left text-primary-foreground shadow-[0_10px_40px_-10px_var(--primary)] active:scale-[0.99] transition"
            >
              <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-80">Standard</p>
              <p className="font-display text-4xl font-extrabold">Best of 3</p>
              <p className="mt-1 text-base opacity-90">First to 2 sets wins</p>
            </button>
            <button
              onClick={() => onStart(5, golden, speaker, "A")}
              className="rounded-3xl px-7 py-10 text-left active:scale-[0.99] transition"
              style={{
                background: "var(--accent)",
                color: "var(--accent-foreground)",
                boxShadow: "0 10px 40px -10px var(--accent)",
              }}
            >
              <p className="text-xs font-bold uppercase tracking-[0.25em] opacity-80">Long</p>
              <p className="font-display text-4xl font-extrabold">Best of 5</p>
              <p className="mt-1 text-base opacity-90">First to 3 sets wins</p>
            </button>
          </div>

          <div className="rounded-2xl bg-card p-2 ring-1 ring-border">
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
        </>
      ) : (
        <HistoryView
          records={history}
          loading={loadingHistory}
          loadingMore={loadingMore}
          hasMore={!!cursor}
          onLoadMore={loadMore}
        />
      )}
    </div>
  );
}

/* -------------------- History -------------------- */

function fmtDate(d: Date) {
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${date} · ${time}`;
}

function HistoryView({
  records,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
}: {
  records: MatchRecord[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16">
        <p className="text-base font-semibold">No matches yet</p>
        <p className="text-center text-sm text-muted-foreground">
          Completed matches will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-8">
      {records.map((r) => {
        return (
          <div key={r.id} className="rounded-2xl bg-card p-4 ring-1 ring-border">
            {/* Top meta row */}
            <p className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">
              {fmtDate(r.completedAt)} · {fmtElapsed(r.totalMs)} · Best of {r.bestOf}
            </p>

            {/* 50/50 split */}
            <div className="flex items-stretch gap-0">
              {/* Team A */}
              <div className="flex flex-1 flex-col">
                <p className="text-sm font-bold" style={{ color: "var(--team-a)" }}>
                  {r.teamA.name}
                  {r.winner === "A" && (
                    <span className="ml-1 text-[10px] font-semibold">👑 Wins</span>
                  )}
                </p>
                <div
                  className="score-num mt-0.5 text-xl font-bold"
                  style={{ color: "var(--team-a)" }}
                >
                  {r.sets.map(([a], i) => (
                    <span key={i} className="mr-1">
                      {a}
                    </span>
                  ))}
                </div>
                {r.teamA.players.some(Boolean) && (
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    {r.teamA.players.map((name, i) =>
                      name ? (
                        <div key={i} className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">{name}</span>
                          {r.teamA.playerLevels?.[i] && (
                            <span className="text-[10px] text-amber-400">
                              {"★".repeat(parseInt(r.teamA.playerLevels[i]))}
                            </span>
                          )}
                        </div>
                      ) : null,
                    )}
                  </div>
                )}
                <p className="mt-auto pt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  UE <span className="font-bold text-foreground">{r.unforced.A}</span>
                </p>
              </div>

              {/* VS divider */}
              <div className="flex flex-col items-center justify-center px-3">
                <div className="h-full w-px bg-border" />
                <span className="my-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  vs
                </span>
                <div className="h-full w-px bg-border" />
              </div>

              {/* Team B */}
              <div className="flex flex-1 flex-col items-end">
                <p className="text-sm font-bold" style={{ color: "var(--team-b-ink)" }}>
                  {r.winner === "B" && (
                    <span className="mr-1 text-[10px] font-semibold">👑 Wins</span>
                  )}
                  {r.teamB.name}
                </p>
                <div
                  className="score-num mt-0.5 text-xl font-bold"
                  style={{ color: "var(--team-b-ink)" }}
                >
                  {r.sets.map(([, b], i) => (
                    <span key={i} className="ml-1">
                      {b}
                    </span>
                  ))}
                </div>
                {r.teamB.players.some(Boolean) && (
                  <div className="mt-1.5 flex flex-col items-end gap-0.5">
                    {r.teamB.players.map((name, i) =>
                      name ? (
                        <div key={i} className="flex items-center gap-1">
                          {r.teamB.playerLevels?.[i] && (
                            <span className="text-[10px] text-amber-400">
                              {"★".repeat(parseInt(r.teamB.playerLevels[i]))}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">{name}</span>
                        </div>
                      ) : null,
                    )}
                  </div>
                )}
                <p className="mt-auto pt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  UE <span className="font-bold text-foreground">{r.unforced.B}</span>
                </p>
              </div>
            </div>
          </div>
        );
      })}
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="w-full rounded-2xl bg-muted py-3 text-sm font-semibold text-muted-foreground disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

function CopyButton({ text, compact, label }: { text: string; compact?: boolean; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement("textarea");
        el.value = text;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <button
      onClick={copy}
      className={
        compact
          ? "rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-primary transition"
          : "mt-3 w-full rounded-xl bg-muted py-2.5 text-sm font-semibold text-foreground transition"
      }
    >
      {copied ? "Copied!" : (label ?? "Copy")}
    </button>
  );
}

function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  const big = size === "md";
  return (
    <div className={big ? "leading-tight" : "leading-tight text-sm"}>
      <p className="brand-wordmark" style={{ fontSize: big ? "1.4rem" : "0.95rem" }}>
        Padel<span style={{ color: "var(--primary)" }}> · </span>Courtside
      </p>
      <p
        className="brand-wordmark"
        style={{
          fontSize: big ? "0.8rem" : "0.65rem",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--muted-foreground)",
        }}
      >
        / withPri
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
    <label className="flex items-center justify-between rounded-xl px-4 py-4">
      <div>
        <p className="text-base font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <button
        onClick={onChange}
        className={`relative h-9 w-16 rounded-full transition ${on ? "bg-primary" : "bg-border"}`}
        aria-pressed={on}
      >
        <span
          className={`absolute top-1 size-7 rounded-full bg-background shadow transition ${
            on ? "left-7.5" : "left-1"
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
  bigMode,
  onToggleBig,
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
  bigMode: boolean;
  onToggleBig: () => void;
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

  const matchStarted =
    snapshot.points.A > 0 ||
    snapshot.points.B > 0 ||
    snapshot.games.A > 0 ||
    snapshot.games.B > 0 ||
    snapshot.sets.length > 0;

  return (
    <div className={`mx-auto flex min-h-dvh ${bigMode ? "max-w-2xl" : "max-w-md"} flex-col`}>
      <div className="flex items-center justify-between gap-2 px-4 pt-safe">
        <div className="flex flex-col gap-0.5">
          <BrandMark size="sm" />
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <span className="size-2 rounded-full bg-primary animate-pulse" />
            {snapshot.matchOver
              ? "Match complete"
              : snapshot.inTiebreak
                ? "Tiebreak"
                : `Best of ${cfg.bestOf}`}
          </div>
        </div>
        <div className="flex gap-2">
          <IconBtn onClick={onToggleBig} active={bigMode} label="Big distance mode">
            {bigMode ? "🔍" : "👁"}
          </IconBtn>
          <IconBtn onClick={onToggleSpeaker} active={speakerOn} label="Speaker">
            {speakerOn ? "🔊" : "🔇"}
          </IconBtn>
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="rounded-full bg-muted px-4 py-2.5 text-sm font-bold text-foreground disabled:opacity-40"
          >
            Undo
          </button>
          <button
            onClick={() => {
              if (confirm("End match and start over?")) onReset();
            }}
            className="rounded-full bg-muted px-4 py-2.5 text-sm font-bold text-foreground"
          >
            New
          </button>
        </div>
      </div>

      <div className="flex items-stretch gap-2 px-4 pt-3">
        <SetTimerCard
          timer={currentTimer}
          setIdx={currentSetIdx}
          onTogglePause={onTogglePauseSet}
          disabled={snapshot.matchOver}
          big={bigMode}
        />
        <SetStrip snapshot={snapshot} setTimes={setTimes} big={bigMode} />
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 px-4 pb-4 pt-3">
        {(["A", "B"] as const).map((t) => {
          const serving = currentServer(cfg, snapshot) === t;
          return (
            <TeamPanel
              key={t}
              accent={t === "A" ? "team-a" : "team-b"}
              name={t === "A" ? cfg.teamA.name : cfg.teamB.name}
              point={t === "A" ? points.A : points.B}
              games={t === "A" ? snapshot.games.A : snapshot.games.B}
              setsWon={t === "A" ? snapshot.setsWon.A : snapshot.setsWon.B}
              unforced={t === "A" ? snapshot.unforced.A : snapshot.unforced.B}
              disabled={snapshot.matchOver}
              unforcedDisabled={!matchStarted || snapshot.matchOver || !canAddUnforced(snapshot, t)}
              big={bigMode}
              serving={serving && !snapshot.matchOver}
              onPoint={() => onPoint(t)}
              onUnforced={() => onUnforced(t)}
            />
          );
        })}
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
      className={`grid size-11 place-items-center rounded-full text-lg transition ${
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
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
  big,
}: {
  timer: SetTime | undefined;
  setIdx: number;
  onTogglePause: () => void;
  disabled: boolean;
  big?: boolean;
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
      className={`flex flex-col items-start justify-center rounded-2xl bg-card text-left ring-1 ring-border disabled:opacity-60 ${big ? "px-5 py-3" : "px-3 py-2"}`}
    >
      <span
        className={`uppercase tracking-widest text-muted-foreground ${big ? "text-xs" : "text-[9px]"}`}
      >
        Set {setIdx + 1} {paused ? "· paused" : timer ? "· live" : ""}
      </span>
      <span className={`score-num ${big ? "text-2xl" : "text-base"}`}>
        {timer ? fmtElapsed(elapsed) : "0:00"}
      </span>
      <span
        className={`uppercase tracking-widest text-muted-foreground ${big ? "text-[10px]" : "text-[9px]"}`}
      >
        {!timer ? "Tap a team to start" : paused ? "Tap to resume" : "Tap to pause"}
      </span>
    </button>
  );
}

function SetStrip({
  snapshot,
  setTimes,
  big,
}: {
  snapshot: Snapshot;
  setTimes: SetTime[];
  big?: boolean;
}) {
  const cells: Array<{
    a: number | string;
    b: number | string;
    live?: boolean;
    duration?: string;
  }> = snapshot.sets.map((s, i) => {
    const t = setTimes[i];
    const dur = t && t.end ? fmtElapsed(t.end - t.start - t.pausedAccum) : undefined;
    return { a: s[0], b: s[1], duration: dur };
  });
  if (!snapshot.matchOver) {
    cells.push({ a: snapshot.games.A, b: snapshot.games.B, live: true });
  }
  return (
    <div
      className={`flex flex-1 items-center gap-2 overflow-x-auto rounded-2xl bg-card ring-1 ring-border ${big ? "p-3" : "p-2"}`}
    >
      <div
        className={`flex flex-col gap-1 pr-1 uppercase tracking-widest font-extrabold ${big ? "text-sm" : "text-[9px]"}`}
      >
        <span style={{ color: "var(--team-a-ink)" }}>A</span>
        <span style={{ color: "var(--team-b-ink)" }}>B</span>
      </div>
      {cells.map((c, i) => (
        <div
          key={i}
          className={`flex flex-col items-center rounded-lg tabular ${big ? "px-3 py-1.5" : "px-2 py-1"} ${
            c.live ? "bg-muted" : ""
          }`}
        >
          <span
            className={`score-num ${big ? "text-xl" : "text-sm"}`}
            style={{ color: "var(--team-a-ink)" }}
          >
            {c.a}
          </span>
          <span
            className={`score-num ${big ? "text-xl" : "text-sm"}`}
            style={{ color: "var(--team-b-ink)" }}
          >
            {c.b}
          </span>
          {c.duration && (
            <span className={`text-muted-foreground ${big ? "text-[10px]" : "text-[8px]"}`}>
              {c.duration}
            </span>
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
  unforcedDisabled,
  big,
  serving,
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
  unforcedDisabled?: boolean;
  big?: boolean;
  serving?: boolean;
  onPoint: () => void;
  onUnforced: () => void;
}) {
  const inkVar = `var(--${accent}-ink)`;
  return (
    <button
      onClick={onPoint}
      disabled={disabled}
      className={`group relative flex flex-1 flex-col justify-between overflow-hidden rounded-3xl text-left transition active:scale-[0.99] disabled:opacity-60 ${big ? "p-8" : "p-6"}`}
      style={{
        background: `color-mix(in oklab, var(--${accent}) 32%, var(--card))`,
        boxShadow: `inset 0 0 0 3px color-mix(in oklab, var(--${accent}) 75%, transparent)`,
      }}
    >
      <div
        className={`absolute inset-x-0 top-0 ${big ? "h-3" : "h-2"}`}
        style={{ background: `var(--${accent})` }}
      />
      <div
        className="absolute -right-10 -top-10 size-40 rounded-full opacity-30 blur-2xl"
        style={{ background: `var(--${accent})` }}
      />

      <div className="relative flex items-start justify-between">
        <div>
          <p
            className={`font-extrabold uppercase tracking-[0.3em] ${big ? "text-xl" : "text-sm"}`}
            style={{ color: inkVar }}
          >
            {name}
          </p>
          <div
            className={`mt-1.5 flex gap-4 uppercase tracking-widest text-muted-foreground ${big ? "text-base" : "text-xs"}`}
          >
            <span>
              Sets{" "}
              <span className={`score-num text-foreground ${big ? "text-2xl" : "text-base"}`}>
                {setsWon}
              </span>
            </span>
            <span>
              Games{" "}
              <span className={`score-num text-foreground ${big ? "text-2xl" : "text-base"}`}>
                {games}
              </span>
            </span>
          </div>
        </div>
        {serving && (
          <span
            className="animate-pulse flex items-center gap-1 rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest"
            style={{ color: inkVar }}
          >
            🎾 Serving
          </span>
        )}
      </div>

      <div className="relative flex items-end justify-between gap-3">
        <p
          className="score-num leading-none"
          style={{
            fontSize: big ? "clamp(8rem, 36vw, 14rem)" : "clamp(5.5rem, 26vw, 9.5rem)",
            color: inkVar,
            textShadow: `0 0 40px color-mix(in oklab, var(--${accent}) 60%, transparent)`,
          }}
        >
          {point}
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!unforcedDisabled) onUnforced();
          }}
          disabled={unforcedDisabled}
          aria-label="Add unforced error"
          className={`flex flex-col items-center gap-1 rounded-2xl bg-background/90 ring-2 ring-border backdrop-blur transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none ${big ? "min-w-35 px-5 py-5" : "min-w-24 px-4 py-3"}`}
        >
          <span
            className={`font-semibold uppercase tracking-widest text-muted-foreground ${big ? "text-sm" : "text-xs"}`}
          >
            Unforced
          </span>
          <span className={`score-num text-destructive ${big ? "text-5xl" : "text-3xl"}`}>
            {unforced}
          </span>
          <span
            className={`font-extrabold tracking-wider text-destructive ${big ? "text-sm" : "text-xs"}`}
          >
            + TAP
          </span>
        </button>
      </div>
    </button>
  );
}

/* -------------------- Summary -------------------- */

function Summary({
  cfg,
  snapshot,
  setTimes,
  saved,
  saveError,
  onSave,
  onNew,
}: {
  cfg: MatchConfig;
  snapshot: Snapshot;
  setTimes: SetTime[];
  saved: boolean;
  saveError?: string;
  onSave: (c: MatchConfig) => Promise<void>;
  onNew: () => void;
}) {
  const [aName, setAName] = useState(cfg.teamA.name);
  const [a1, setA1] = useState(cfg.teamA.players[0]);
  const [a2, setA2] = useState(cfg.teamA.players[1]);
  const [a1Level, setA1Level] = useState(cfg.teamA.playerLevels?.[0] ?? "");
  const [a2Level, setA2Level] = useState(cfg.teamA.playerLevels?.[1] ?? "");
  const [bName, setBName] = useState(cfg.teamB.name);
  const [b1, setB1] = useState(cfg.teamB.players[0]);
  const [b2, setB2] = useState(cfg.teamB.players[1]);
  const [b1Level, setB1Level] = useState(cfg.teamB.playerLevels?.[0] ?? "");
  const [b2Level, setB2Level] = useState(cfg.teamB.playerLevels?.[1] ?? "");
  const [saving, setSaving] = useState(false);
  const [namesSaved, setNamesSaved] = useState(false);
  const [errors, setErrors] = useState({ aName: "", bName: "" });

  const winner = snapshot.winner === "A" ? aName : bName;
  const totalMs = setTimes.reduce(
    (acc, t) => acc + ((t.end ?? Date.now()) - t.start - t.pausedAccum),
    0,
  );

  const save = async () => {
    const errs = {
      aName: aName.trim() ? "" : "Team A name is required",
      bName: bName.trim() ? "" : "Team B name is required",
    };
    setErrors(errs);
    if (errs.aName || errs.bName) return;
    setSaving(true);
    await onSave({
      ...cfg,
      teamA: {
        name: aName.trim(),
        players: [a1.trim(), a2.trim()],
        playerLevels: [a1Level, a2Level],
      },
      teamB: {
        name: bName.trim(),
        players: [b1.trim(), b2.trim()],
        playerLevels: [b1Level, b2Level],
      },
    });
    setSaving(false);
    setNamesSaved(true);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 pb-8 pt-safe">
      <header>
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Match complete</p>
        <h1 className="font-display text-3xl font-bold">
          <span style={{ color: snapshot.winner === "A" ? "var(--team-a)" : "var(--team-b-ink)" }}>
            {winner}
          </span>{" "}
          wins
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Total time {fmtElapsed(totalMs)} · {snapshot.sets.length} set
          {snapshot.sets.length !== 1 ? "s" : ""}
        </p>
        {saved && <p className="mt-1 text-xs font-semibold text-primary">Saved to your history</p>}
        {!saved && !saveError && <p className="mt-1 text-xs text-muted-foreground">Saving…</p>}
        {saveError && (
          <p className="mt-1 text-xs font-semibold text-destructive">Save failed: {saveError}</p>
        )}
      </header>

      <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
        <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Score</p>
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
                  <span style={{ color: "var(--team-b-ink)" }}>{s[1]}</span>
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
            <p className="score-num text-xl text-destructive">{snapshot.unforced.A}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Unforced B
            </p>
            <p className="score-num text-xl text-destructive">{snapshot.unforced.B}</p>
          </div>
        </div>
      </div>

      <p className="text-xs uppercase tracking-widest text-muted-foreground">Log who played</p>

      <NameCard
        accent="team-a"
        title="Team A"
        nameValue={aName}
        onName={(v) => {
          setAName(v);
          setErrors((e) => ({ ...e, aName: "" }));
        }}
        p1={a1}
        p2={a2}
        onP1={setA1}
        onP2={setA2}
        p1Level={a1Level}
        p2Level={a2Level}
        onP1Level={setA1Level}
        onP2Level={setA2Level}
        error={errors.aName}
      />
      <NameCard
        accent="team-b"
        title="Team B"
        nameValue={bName}
        onName={(v) => {
          setBName(v);
          setErrors((e) => ({ ...e, bName: "" }));
        }}
        p1={b1}
        p2={b2}
        onP1={setB1}
        onP2={setB2}
        p1Level={b1Level}
        p2Level={b2Level}
        onP1Level={setB1Level}
        onP2Level={setB2Level}
        error={errors.bName}
      />

      <div className="mt-auto flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 rounded-2xl bg-accent py-4 text-sm font-bold text-accent-foreground disabled:opacity-60"
        >
          {saving ? "Saving…" : namesSaved ? "Saved ✓" : "Save players"}
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

const SKILL_LABELS = ["Beginner", "Casual", "Intermediate", "Advanced", "Pro"] as const;

function LevelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const selected = value ? parseInt(value) : 0;
  const label = selected ? SKILL_LABELS[selected - 1] : null;
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(selected === n ? "" : String(n))}
            className="flex h-10 w-10 items-center justify-center text-2xl transition-transform active:scale-90"
          >
            <span className={n <= selected ? "opacity-100" : "opacity-20"}>★</span>
          </button>
        ))}
      </div>
      {label && <span className="text-xs font-semibold text-muted-foreground">{label}</span>}
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
  p1Level,
  p2Level,
  onP1Level,
  onP2Level,
  error,
}: {
  accent: "team-a" | "team-b";
  title: string;
  nameValue: string;
  onName: (v: string) => void;
  p1: string;
  p2: string;
  onP1: (v: string) => void;
  onP2: (v: string) => void;
  p1Level: string;
  p2Level: string;
  onP1Level: (v: string) => void;
  onP2Level: (v: string) => void;
  error?: string;
}) {
  return (
    <div
      className="rounded-2xl bg-card p-4"
      style={{
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, var(--${error ? "destructive" : accent}) 40%, transparent)`,
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: `var(--${accent})` }} />
          <p
            className="text-xs uppercase tracking-widest"
            style={{ color: `var(--${accent}-ink)` }}
          >
            {title}
          </p>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <input
        value={nameValue}
        onChange={(e) => onName(e.target.value)}
        placeholder="Team name"
        className="w-full rounded-xl bg-muted px-4 py-3 text-base font-semibold outline-none focus:ring-2 focus:ring-primary"
      />
      <div className="mt-2 flex flex-col gap-3">
        {(
          [
            { val: p1, onVal: onP1, level: p1Level, onLevel: onP1Level, ph: "Player 1" },
            { val: p2, onVal: onP2, level: p2Level, onLevel: onP2Level, ph: "Player 2" },
          ] as const
        ).map(({ val, onVal, level, onLevel, ph }) => (
          <div key={ph} className="rounded-xl bg-muted px-3 pt-2.5 pb-1">
            <input
              value={val}
              onChange={(e) => onVal(e.target.value)}
              placeholder={ph}
              className="w-full bg-transparent text-sm outline-none"
            />
            <LevelPicker value={level} onChange={onLevel} />
          </div>
        ))}
      </div>
    </div>
  );
}
