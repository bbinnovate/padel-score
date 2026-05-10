// Padel scoring engine

export type TeamId = "A" | "B";

export interface MatchConfig {
  teamA: { name: string; players: [string, string] };
  teamB: { name: string; players: [string, string] };
  bestOf: 1 | 3 | 5;
  goldenPoint: boolean; // if true, no advantage — sudden death at deuce
}

export interface Snapshot {
  // points within current game: 0,1,2,3 = 0,15,30,40; >=4 handled with deuce/adv
  points: { A: number; B: number };
  // games within current set
  games: { A: number; B: number };
  // completed sets (array of [aGames, bGames])
  sets: Array<[number, number]>;
  // sets won
  setsWon: { A: number; B: number };
  unforced: { A: number; B: number };
  inTiebreak: boolean;
  matchOver: boolean;
  winner: TeamId | null;
}

export const initialSnapshot = (): Snapshot => ({
  points: { A: 0, B: 0 },
  games: { A: 0, B: 0 },
  sets: [],
  setsWon: { A: 0, B: 0 },
  unforced: { A: 0, B: 0 },
  inTiebreak: false,
  matchOver: false,
  winner: null,
});

export const POINT_LABELS = ["0", "15", "30", "40"];

export function pointDisplay(s: Snapshot): { A: string; B: string } {
  if (s.inTiebreak) {
    return { A: String(s.points.A), B: String(s.points.B) };
  }
  const { A, B } = s.points;
  if (A >= 3 && B >= 3) {
    if (A === B) return { A: "40", B: "40" };
    if (A === B + 1) return { A: "AD", B: "—" };
    if (B === A + 1) return { A: "—", B: "AD" };
  }
  return { A: POINT_LABELS[Math.min(A, 3)], B: POINT_LABELS[Math.min(B, 3)] };
}

function setsToWin(bestOf: number) {
  return Math.ceil(bestOf / 2);
}

export function awardPoint(
  prev: Snapshot,
  team: TeamId,
  cfg: MatchConfig
): Snapshot {
  if (prev.matchOver) return prev;
  const s: Snapshot = {
    ...prev,
    points: { ...prev.points },
    games: { ...prev.games },
    sets: [...prev.sets],
    setsWon: { ...prev.setsWon },
    unforced: { ...prev.unforced },
  };
  const other: TeamId = team === "A" ? "B" : "A";

  if (s.inTiebreak) {
    s.points[team] += 1;
    const a = s.points.A;
    const b = s.points.B;
    const max = Math.max(a, b);
    if (max >= 7 && Math.abs(a - b) >= 2) {
      // tiebreak winner takes the set 7-6
      s.games[team] += 1;
      finalizeSet(s, cfg);
    }
    return s;
  }

  // Normal game scoring
  s.points[team] += 1;
  const pa = s.points.A;
  const pb = s.points.B;

  if (cfg.goldenPoint) {
    // At 40-40 (3-3), next point wins
    if (pa >= 4 || pb >= 4) {
      s.games[team] += 1;
      s.points = { A: 0, B: 0 };
      checkSet(s, cfg);
      return s;
    }
  } else {
    // Standard advantage scoring
    if (pa >= 4 || pb >= 4) {
      if (Math.abs(pa - pb) >= 2) {
        s.games[team] += 1;
        s.points = { A: 0, B: 0 };
        checkSet(s, cfg);
      }
    }
  }
  return s;
}

function checkSet(s: Snapshot, cfg: MatchConfig) {
  const ga = s.games.A;
  const gb = s.games.B;
  if ((ga >= 6 || gb >= 6) && Math.abs(ga - gb) >= 2) {
    finalizeSet(s, cfg);
    return;
  }
  if (ga === 6 && gb === 6) {
    s.inTiebreak = true;
    s.points = { A: 0, B: 0 };
  }
}

function finalizeSet(s: Snapshot, cfg: MatchConfig) {
  s.sets.push([s.games.A, s.games.B]);
  if (s.games.A > s.games.B) s.setsWon.A += 1;
  else s.setsWon.B += 1;
  s.games = { A: 0, B: 0 };
  s.points = { A: 0, B: 0 };
  s.inTiebreak = false;
  const need = setsToWin(cfg.bestOf);
  if (s.setsWon.A >= need) {
    s.matchOver = true;
    s.winner = "A";
  } else if (s.setsWon.B >= need) {
    s.matchOver = true;
    s.winner = "B";
  }
}

export function addUnforced(prev: Snapshot, team: TeamId): Snapshot {
  return { ...prev, unforced: { ...prev.unforced, [team]: prev.unforced[team] + 1 } };
}
