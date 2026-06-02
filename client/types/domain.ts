export type GameId = string | number;

export type Session = {
  uuid: string;
  name?: string;
};

export type Seat = {
  id: string;
  team: number;
  playerUuid?: string;
  publicName?: string;
  resigned?: boolean;
  time?: Record<string, number>;
  clock?: Record<string, number>;
};

export type TimeConfig = {
  system?: "none" | "byoyomi" | "fischer" | string;
  main?: number;
  periods?: number;
  periodTime?: number;
  fischerIncrement?: number;
};

export type CustomGoban = {
  width: number;
  height: number;
  points: number[];
};

export type JosekiStone = {
  x: number;
  y: number;
  color: number;
};

export type JosekiCard = {
  id: string;
  name: string;
  boardSize: number;
  stones: JosekiStone[];
};

export type GameVariants = {
  capturesGivePoints?: boolean;
  ponnukiPointValue?: number;
  pixel?: boolean;
  zen?: boolean;
  zenPlayerCount?: number;
  colorGo?: boolean;
  colorGoPlayerCount?: number;
  colorGoColors?: string[];
  colorGoKomi?: number[];
  phantomMove?: boolean;
  phantomHideViewers?: boolean;
  hiddenMove?: boolean;
  hiddenMoveCount?: number;
  hiddenMoveShowViewers?: boolean;
  josekiCard?: boolean;
  tetris?: boolean;
  nPlusOne?: boolean;
  nPlusOneCount?: number;
  traitor?: boolean;
  traitorStoneCount?: number;
  showTraitorCounter?: boolean;
};

export type GameConfig = {
  boardSize?: number;
  name?: string;
  ruleset: string;
  komi?: number;
  handicap?: number;
  creatorSeat?: string;
  time?: TimeConfig;
  customGoban?: CustomGoban;
  variants?: GameVariants;
};

export type CreateGameConfig =
  & Required<Pick<GameConfig, "time" | "variants">>
  & Omit<GameConfig, "time" | "variants">;

export type HistoryEntry = {
  action?: string;
  board?: number[];
  boardOpacity?: number[];
};

export type UserSummary = {
  uuid: string;
  name?: string;
};

export type JosekiSetup = {
  phase: "select" | "place";
  selectionStartedAt: number;
  selectionDeadlineAt: number;
  availableCards: JosekiCard[];
  seats: Array<{ seatId: string; selectedCardIds: string[]; confirmedSelection: boolean }>;
  placementOrder: string[];
  placementIndex: number;
  placedCorners: Array<"upper-left" | "upper-right" | "lower-left" | "lower-right">;
  currentPlacement?: {
    cardId: string;
    corner: "upper-left" | "upper-right" | "lower-left" | "lower-right";
    rotate: 0 | 90 | 180 | 270;
    flipX: boolean;
    swapColors: boolean;
  };
};

export type HiddenSetup = {
  stonesPerPlayer: number;
  visibility: "players" | "viewers";
  seats: Array<{
    seatId: string;
    points: Array<{ x: number; y: number }>;
    placements?: Array<{
      origin: { x: number; y: number };
      points: Array<{ x: number; y: number }>;
    }>;
  }>;
};

export type Game = {
  id: GameId;
  phase: "play" | "scoring" | "done" | string;
  boardWidth: number;
  boardHeight: number;
  board: number[];
  boardOpacity?: number[];
  turn: number;
  playMoves?: number;
  captureCount?: number;
  seats: Seat[];
  users?: UserSummary[];
  config: GameConfig;
  history?: HistoryEntry[];
  deadStones?: boolean[];
  noScorePoints?: boolean[];
  scoreAccepted?: boolean[];
  points: number[];
  winnerTeams?: number[];
  clockUpdatedAt?: number;
  traitorStonesPlaced?: number[];
  josekiSetup?: JosekiSetup;
  hiddenSetup?: HiddenSetup;
};

export type GameActionType =
  | "place"
  | "pass"
  | "done"
  | "resign"
  | "toggleDead"
  | "toggleNoScore"
  | "remake"
  | "placeHidden"
  | string;

export type GameAction = {
  type: GameActionType;
  seatId?: string;
  x?: number;
  y?: number;
  config?: CreateGameConfig;
  cardIds?: string[];
  placement?: Partial<NonNullable<JosekiSetup["currentPlacement"]>>;
};

export type GameResponse = {
  game: Game;
};

export type GameListItem = {
  id: GameId;
  config?: GameConfig;
};

export type GameListResponse = {
  games: GameListItem[];
};

export type HealthResponse = {
  service?: string;
  ok?: boolean;
  [key: string]: unknown;
};

export type JosekiCardsResponse = {
  cards: JosekiCard[];
};

export type JosekiCardResponse = {
  card: JosekiCard;
};
