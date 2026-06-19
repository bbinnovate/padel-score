import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  serverTimestamp,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "./firebase";
import type { MatchConfig, Snapshot } from "./padel";

export interface MatchRecord {
  id: string;
  playerCode: string;
  completedAt: Date;
  winner: "A" | "B";
  teamA: { name: string; players: [string, string] };
  teamB: { name: string; players: [string, string] };
  sets: [number, number][];
  setsWon: { A: number; B: number };
  unforced: { A: number; B: number };
  totalMs: number;
  bestOf: number;
  goldenPoint: boolean;
}

// Firestore doesn't support nested arrays — store sets as {a, b} objects
interface SetScore { a: number; b: number }

interface RawRecord {
  playerCode: string;
  completedAt: Timestamp;
  winner: "A" | "B";
  teamA: { name: string; players: [string, string] };
  teamB: { name: string; players: [string, string] };
  sets: SetScore[];
  setsWon: { A: number; B: number };
  unforced: { A: number; B: number };
  totalMs: number;
  bestOf: number;
  goldenPoint: boolean;
}

function matchesCollection(playerCode: string) {
  return collection(db, "players", playerCode, "matches");
}

export async function saveMatch(
  playerCode: string,
  cfg: MatchConfig,
  snapshot: Snapshot,
  totalMs: number,
): Promise<string> {
  const data: Omit<RawRecord, "completedAt"> & { completedAt: ReturnType<typeof serverTimestamp> } =
    {
      playerCode,
      completedAt: serverTimestamp(),
      winner: snapshot.winner as "A" | "B",
      teamA: cfg.teamA,
      teamB: cfg.teamB,
      sets: snapshot.sets.map(([a, b]) => ({ a, b })),
      setsWon: snapshot.setsWon,
      unforced: snapshot.unforced,
      totalMs,
      bestOf: cfg.bestOf,
      goldenPoint: cfg.goldenPoint,
    };
  const ref = await addDoc(matchesCollection(playerCode), data);
  return ref.id;
}

export async function updateMatchNames(
  playerCode: string,
  matchId: string,
  cfg: MatchConfig,
): Promise<void> {
  const ref = doc(db, "players", playerCode, "matches", matchId);
  await updateDoc(ref, { teamA: cfg.teamA, teamB: cfg.teamB });
}

const PAGE_SIZE = 20;

export interface MatchPage {
  records: MatchRecord[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
}

function docToRecord(d: QueryDocumentSnapshot<DocumentData>): MatchRecord {
  const raw = d.data() as RawRecord;
  return {
    id: d.id,
    ...raw,
    sets: raw.sets.map((s) => [s.a, s.b] as [number, number]),
    completedAt: raw.completedAt?.toDate?.() ?? new Date(),
  };
}

export async function loadMatches(
  playerCode: string,
  after?: QueryDocumentSnapshot<DocumentData> | null,
): Promise<MatchPage> {
  const base = query(matchesCollection(playerCode), orderBy("completedAt", "desc"), limit(PAGE_SIZE));
  const q = after ? query(base, startAfter(after)) : base;
  const snap = await getDocs(q);
  const lastDoc = snap.docs.length === PAGE_SIZE ? snap.docs[snap.docs.length - 1] : null;
  return { records: snap.docs.map(docToRecord), cursor: lastDoc };
}
