export type Point = { x: number; y: number };
export type Color = number;

export type ActionKind =
  | { type: "place"; point: Point; seatId?: string }
  | { type: "pass"; seatId?: string }
  | { type: "resign"; seatId?: string }
  | { type: "cancel"; seatId?: string }
  | { type: "toggleDead"; point: Point; seatId?: string }
  | { type: "toggleNoScore"; point: Point; seatId?: string }
  | { type: "acceptScore"; seatId?: string }
  | { type: "selectJosekiCards"; cardIds: string[]; seatId?: string }
  | { type: "confirmJosekiSelection"; seatId?: string }
  | { type: "updateJosekiPlacement"; placement: Partial<JosekiPlacement>; seatId?: string }
  | { type: "confirmJosekiPlacement"; seatId?: string }
  | { type: "placeHidden"; point: Point; seatId?: string };

export type GamePhase = "joseki" | "hidden" | "play" | "scoring" | "done";

export type JosekiPlacement = {
  cardId: string;
  corner: "upper-left" | "upper-right" | "lower-left" | "lower-right";
  rotate: 0 | 90 | 180 | 270;
  flipX: boolean;
  swapColors: boolean;
};

export type JosekiSeatSetup = {
  seatId: string;
  selectedCardIds: string[];
  confirmedSelection: boolean;
};

export type JosekiSetup = {
  phase: "select" | "place";
  selectionStartedAt: number;
  selectionDeadlineAt: number;
  availableCards: Array<
    { id: string; name: string; boardSize: number; stones: Array<Point & { color: Color }> }
  >;
  seats: JosekiSeatSetup[];
  placementOrder: string[];
  placementIndex: number;
  placedCorners: JosekiPlacement["corner"][];
  currentPlacement?: JosekiPlacement;
};

export type HiddenPlacement = {
  origin: Point;
  points: Point[];
};

export type HiddenSeatSetup = {
  seatId: string;
  points: Point[];
  placements?: HiddenPlacement[];
};

export type HiddenSetup = {
  stonesPerPlayer: number;
  visibility: "players" | "viewers";
  seats: HiddenSeatSetup[];
};

export type SeatTime = {
  mainLeft: number;
  periodLeft: number;
  periodsLeft: number;
};

export type Seat = {
  id: string;
  playerUuid?: string;
  publicName?: string;
  team: Color;
  resigned: boolean;
  time?: SeatTime;
};

export type PlayState = {
  playersPassed: boolean[];
  lastStone?: Point[];
  captureCount: number;
  capturedStones: number[];
  movesPlayed: number;
  extraTurnsRemaining: number;
  extraTurnSeat?: number;
  rngSeed: string;
  rngCounter: number;
  traitorStonesPlaced: number[];
  traitorNonTraitorMoves: number[];
  phantomOwners?: number[];
  phantomRevealed?: boolean[];
  deadStones?: boolean[];
  noScorePoints?: boolean[];
  scoreAccepted?: boolean[];
  winnerTeams?: number[];
};

export type BoardHistory = {
  hash: string;
  board: number[];
  points: number[];
  turn: number;
  phase: GamePhase;
  action?: "place" | "placeHidden" | "pass" | "resign";
  play: PlayState;
  hiddenSetup?: HiddenSetup;
};

export type SharedState = {
  id: string;
  clockUpdatedAt?: number;
  boardWidth: number;
  boardHeight: number;
  board: number[];
  seats: Seat[];
  points: number[];
  turn: number;
  phase: GamePhase;
  play: PlayState;
  history: BoardHistory[];
  josekiSetup?: JosekiSetup;
  hiddenSetup?: HiddenSetup;
};

export type MakeActionError =
  | "not_turn"
  | "waiting_for_players"
  | "out_of_bounds"
  | "point_occupied"
  | "suicide"
  | "ko"
  | "illegal";

export type RuleMods = {
  capturesGivePoints?: boolean;
  nPlusOne?: boolean;
  nPlusOneCount?: number;
  traitor?: boolean;
  traitorMode?: "moves" | "percentage";
  traitorStoneCount?: number;
  traitorChance?: number;
  randomTurn?: boolean;
  teamGo?: boolean;
  random?: () => number;
  ponnukiPointValue?: number;
  pixel?: boolean;
  zen?: boolean;
  colorGo?: boolean;
  colorGoKomi?: number[];
  phantomMove?: boolean;
  hiddenMove?: boolean;
  tetris?: boolean;
  komi?: number;
  scoring?: "area" | "territory";
  freeHandicapCount?: number;
};

export type MakeActionResult =
  | { ok: true; state: SharedState }
  | { ok: false; error: MakeActionError; state?: SharedState };
