import {
  createGame,
  getGame,
  getGameHistory,
  loadBootData,
  readGame,
  readGameHistory,
  readSession,
  updateSessionName,
} from "./api/http.ts";
import {
  addHistoryBoards,
  type HistoryBoards,
  historyFetchStart,
  reconcileHistoryBoards,
  withHistoryBoards,
} from "./game/history-cache.ts";
import { remakeConfig, sendGameAction } from "./game/actions.ts";
import { gameConfigFromFormData } from "./create/config.ts";
import { bindCreateGameForm as bindCreateGameFormControls } from "./create/form-bind.ts";
import { invalidVariantComboMessage } from "./create/form.ts";
import { removeTryPlaying, showTryPlaying } from "./create/try-playing.ts";
import {
  lastMoveDotColor,
  seatMetaHtml,
  stoneColor,
  stoneTone,
  winnerText,
} from "./game/display.ts";
import { isPendingSettled, optimisticPlacement, type PendingMove } from "./game/optimistic.ts";
import { bindGameEvents } from "./game/events.ts";
import { gameViewHtml } from "./game/render.ts";
import {
  renderGameList as renderGameListElement,
  startGameListRefresh as startGameListEvents,
} from "./game/list.ts";
import {
  canNavigateGameHistory as canNavigateGameHistoryForSession,
  nextHistoryIndex,
} from "./game/history.ts";
import { gameHistoryView } from "./game/history-view.ts";
import { maybeJoinHashSeat } from "./game/invite.ts";
import { updateGameLayoutMode, updateGameListHeight } from "./ui/layout.ts";
import {
  connectGameSocket as connectGameSocketToServer,
  disconnectGameSocket,
} from "./game/realtime.ts";
import { applySavedTheme, toggleTheme, updateThemeToggle } from "./ui/theme.ts";
import { allVariantRulesHelpHtml } from "./game/variants.ts";
import { keepGridLinesCrisp } from "./game/board-render.ts";
import { animateMagnetSlides, magnetSlides, reviewMagnetSlides } from "./game/magnet-animation.ts";
import {
  applyLastMoveMarker,
  parseLastMoveMarker,
  readLastMoveMarker,
  saveLastMoveMarker,
} from "./game/last-move-marker.ts";
import {
  activeClockExpired,
  countdownAudioPath,
  countdownCue,
  type CountdownSound,
} from "./game/countdown.ts";
import { clampVolume, type MoveSound, moveSoundFor, SoundPlayer } from "./game/sound.ts";
import type { Game, GameAction, Session } from "./types/domain.ts";
import { installDialogLightDismiss } from "./ui/dialog.ts";
import { readKatachiControls, saveKatachiControls } from "./game/katachi-controls.ts";

const statusElement = document.querySelector<HTMLElement>("#status")!;
const nameForm = document.querySelector<HTMLFormElement>("#name-form");
const nameInput = document.querySelector<HTMLInputElement>("#name-form input")!;
const panel = document.querySelector<HTMLElement>(".panel-card")!;
const listElement = document.querySelector<HTMLElement>("#game-list")!;
const shell = document.querySelector<HTMLElement>(".shell")!;
const themeToggle = document.querySelector<HTMLElement>("#theme-toggle");
const coordinateToggle = document.querySelector<HTMLButtonElement>("#coordinate-toggle");
const stoneShadowToggle = document.querySelector<HTMLButtonElement>("#stone-shadow-toggle");
const soundControl = document.querySelector<HTMLElement>("#sound-control");
const soundToggle = document.querySelector<HTMLButtonElement>("#sound-toggle");
const soundPopover = document.querySelector<HTMLElement>("#sound-popover");
const stoneVolume = document.querySelector<HTMLInputElement>("#stone-volume");
const voiceVolume = document.querySelector<HTMLInputElement>("#voice-volume");
const countdownSound = document.querySelector<HTMLSelectElement>("#countdown-sound");
const appRemake = document.querySelector<HTMLElement>("#app-remake");
const appHelp = document.querySelector<HTMLElement>("#app-help");
const MOVE_SOUNDS: Record<MoveSound, string> = {
  stone: "/clack.mp3",
  capture: "/capture.mp3",
  pass: "/pass.mp3",
};
const COUNTDOWN_BEEP = "/CountdownBeep.mp3";
const sounds = new SoundPlayer();
sounds.setVolume("stone", readSavedStoneVolume());
sounds.setVolume("voice", readSavedVoiceVolume());
sounds.unlockOn(document);
sounds.preload([...Object.values(MOVE_SOUNDS), COUNTDOWN_BEEP]);
if (stoneVolume) stoneVolume.value = String(sounds.volume("stone"));
if (voiceVolume) voiceVolume.value = String(sounds.volume("voice"));
if (countdownSound) countdownSound.value = readSavedCountdownSound();
preloadCountdownVoice(readSavedCountdownSound());
const createGamePanelHtml = panel.innerHTML;

let session: Session | undefined;
const socketState: { socket?: WebSocket; gameId?: string | number } = {};
let gameEvents: EventSource | undefined;
let gameClockTimer: ReturnType<typeof setTimeout> | undefined;
let lastCountdownCueKey: string | undefined;
let historyKeyController: AbortController | undefined;
let nameSaveTimer: ReturnType<typeof setTimeout> | undefined;
let lastSavedName = "";
let currentGame: Game | undefined;
let showCoordinates = localStorage.getItem("baduk:show-coordinates") === "true" &&
  !matchMedia("(max-width: 759px)").matches;
let showStoneShadows = localStorage.getItem("baduk:stone-shadows") !== "false";
if (!showCoordinates && matchMedia("(max-width: 759px)").matches) {
  localStorage.setItem("baduk:show-coordinates", "false");
}
const historyViewByGame = new Map<Game["id"], number>();
let historyBoards: HistoryBoards | undefined;
let historyBoardsLoading = false;
/** Own stone shown before the server confirms it (plain games only). */
let pendingMove: PendingMove | undefined;
/** Position last put on screen, so history navigation can replay a Magnetic move's slides. */
let shownPosition: { gameId: Game["id"]; historyIndex: number; reviewing: boolean } | undefined;
let pendingMoveTimer: ReturnType<typeof setTimeout> | undefined;
const PENDING_MOVE_TIMEOUT_MS = 3000;

applySavedTheme();
keepGridLinesCrisp();
updateThemeToggle(themeToggle);
updateCoordinateToggle();
updateStoneShadowToggle();
installDialogLightDismiss();
const landingHelpBody = document.querySelector<HTMLElement>("[data-landing-help-body]");
if (landingHelpBody) landingHelpBody.innerHTML = allVariantRulesHelpHtml();
// An entry opened at the bottom of the list would otherwise expand out of sight. "toggle" doesn't
// bubble, hence the capture.
landingHelpBody?.addEventListener("toggle", (event) => {
  const entry = event.target as HTMLDetailsElement;
  if (entry.open) entry.scrollIntoView({ block: "nearest" });
}, true);

appRemake?.addEventListener("click", remakeCurrentGame);
appHelp?.addEventListener("click", () => {
  const dialog = document.querySelector<HTMLDialogElement>(".game-info-dialog") ??
    document.querySelector<HTMLDialogElement>(".landing-help-dialog");
  dialog?.showModal();
});
document.querySelector("[data-landing-help-close]")?.addEventListener(
  "click",
  () => document.querySelector<HTMLDialogElement>(".landing-help-dialog")?.close(),
);

listElement.addEventListener("wheel", (event: WheelEvent) => {
  if (!matchMedia("(min-width: 760px)").matches) return;
  if (listElement.scrollHeight <= listElement.clientHeight) return;
  event.preventDefault();
  const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
    ? listElement.clientHeight
    : 1;
  listElement.scrollTop += event.deltaY * multiplier;
}, { passive: false });

themeToggle?.addEventListener("click", () => toggleTheme(themeToggle));
coordinateToggle?.addEventListener("click", toggleCoordinates);
stoneShadowToggle?.addEventListener("click", toggleStoneShadows);
soundToggle?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleSoundPopover();
});
soundControl?.addEventListener("click", (event) => event.stopPropagation());
bindKatachiControlsPopover();
bindLastMoveMarkerPopover();
stoneVolume?.addEventListener("input", () => {
  sounds.setVolume("stone", Number(stoneVolume.value));
  localStorage.setItem("baduk:stone-volume", stoneVolume.value);
});
voiceVolume?.addEventListener("input", () => {
  sounds.setVolume("voice", Number(voiceVolume.value));
  localStorage.setItem("baduk:voice-volume", voiceVolume.value);
});
countdownSound?.addEventListener("change", () => {
  localStorage.setItem("baduk:countdown-sound", readCountdownSoundSelection());
  preloadCountdownVoice(readCountdownSoundSelection());
  lastCountdownCueKey = undefined;
  stopCountdownAudio();
  if (currentGame) maybePlayCountdown(currentGame);
});
document.addEventListener("click", closeSoundPopover);

async function boot() {
  try {
    const { health, session: loadedSession } = await loadBootData();
    session = loadedSession;
    nameInput.value = session.name ?? "";
    lastSavedName = nameInput.value;
    statusElement.textContent = `${health.service} online · ${session.name ?? ""}`;

    await renderGameList();
    startGameListRefresh();
    const gameId = location.pathname.match(/^\/game\/([^/]+)/)?.[1];
    if (gameId) await showGame(gameId);
    else showTryPlaying();
  } catch (_error) {
    statusElement.textContent = "Server unavailable. Try refreshing.";
  }
}

nameForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveNameNow();
  nameInput.blur();
});
nameInput.addEventListener("input", () => {
  if (session) session = { ...session, name: nameInput.value };
  if (currentGame) renderGame(applyLocalName(currentGame));
  queueNameSave();
});
nameInput.addEventListener("blur", () => void saveNameNow());

bindCreateGameFormControls(handleCreateGameSubmit, statusElement);

async function handleCreateGameSubmit(event: SubmitEvent) {
  event.preventDefault();
  const currentForm = event.currentTarget as HTMLFormElement;
  const data = new FormData(currentForm);
  const invalidVariantMessage = invalidVariantComboMessage(data);
  if (invalidVariantMessage) {
    statusElement.textContent = invalidVariantMessage;
    return;
  }
  const response = await createGame(gameConfigFromFormData(data));
  if (!response.ok) {
    statusElement.textContent = "Could not create game.";
    return;
  }
  const game = await readGame(response);
  history.pushState(null, "", `/game/${game.id}`);
  await renderGameList();
  await showGame(game.id);
}

function queueNameSave(): void {
  clearTimeout(nameSaveTimer);
  nameSaveTimer = setTimeout(() => void saveNameNow(), 2000);
}

async function saveNameNow(): Promise<void> {
  clearTimeout(nameSaveTimer);
  const nextName = nameInput.value;
  if (nextName === lastSavedName) return;
  const response = await updateSessionName(nextName);
  if (!response.ok) return;
  session = await readSession(response);
  nameInput.value = session.name ?? "";
  lastSavedName = nameInput.value;
  const gameId = location.pathname.match(/^\/game\/([^/]+)/)?.[1];
  if (gameId) await showGame(gameId);
}

function applyLocalName(game: Game): Game {
  if (!session?.uuid) return game;
  const name = nameInput.value;
  return {
    ...game,
    seats: game.seats.map((seat) =>
      seat.playerUuid === session?.uuid ? { ...seat, publicName: name } : seat
    ),
    users: game.users?.map((user) => user.uuid === session?.uuid ? { ...user, name } : user),
  };
}

function startGameListRefresh() {
  startGameListEvents(
    gameEvents,
    (events) => gameEvents = events,
    renderGameList,
    startGameListRefresh,
  );
}

async function renderGameList() {
  await renderGameListElement(listElement, showGame);
}

window.addEventListener("popstate", async () => {
  const gameId = location.pathname.match(/^\/game\/([^/]+)/)?.[1];
  if (gameId) await showGame(gameId);
  else showCreateScreen(false);
});
window.addEventListener("resize", () => {
  updateGameLayoutMode(shell);
  updateGameListHeight(listElement);
  if (matchMedia("(max-width: 759px)").matches && showCoordinates) {
    showCoordinates = false;
    localStorage.setItem("baduk:show-coordinates", "false");
    updateCoordinateToggle();
    if (currentGame) renderGame(currentGame);
  }
});

function showCreateScreen(push = true) {
  currentGame = undefined;
  if (appRemake) appRemake.hidden = true;
  lastCountdownCueKey = undefined;
  stopCountdownAudio();
  disconnectGameSocket(socketState);
  historyKeyController?.abort();
  shell.classList.remove("game-layout", "desktop-fit");
  panel.innerHTML = createGameTemplate();
  bindCreateGameForm();
  showTryPlaying();
  if (push && location.pathname !== "/") history.pushState(null, "", "/");
}

function createGameTemplate() {
  return createGamePanelHtml;
}

function bindCreateGameForm() {
  bindCreateGameFormControls(handleCreateGameSubmit, statusElement);
}

async function showGame(gameId: string | number | undefined) {
  if (gameId === undefined) return;
  const response = await getGame(gameId);
  if (!response.ok) {
    statusElement.textContent = "Game not found.";
    return;
  }
  const game = await readGame(response);
  removeTryPlaying();
  connectGameSocket(game.id);
  renderGame(game);
  await maybeJoinHashSeat(game, renderGame, showGame);
}

function renderGame(game: Game) {
  const previousGame = currentGame;
  historyBoards = reconcileHistoryBoards(historyBoards, game);
  game = withHistoryBoards(applyLocalName(game), historyBoards);
  const helpDialog = document.querySelector<HTMLDialogElement>(".game-info-dialog");
  const helpWasOpen = helpDialog?.open ?? false;
  const helpScrollTop = helpDialog?.querySelector(".dialog-scroll")?.scrollTop ?? 0;
  const josekiSelectionDialog = document.querySelector<HTMLDialogElement>(
    "[data-joseki-selection-dialog]",
  );
  const josekiSelectionWasOpen = josekiSelectionDialog?.open ?? false;
  const josekiSelectionScrollTop =
    josekiSelectionDialog?.querySelector(".dialog-scroll")?.scrollTop ?? 0;
  const confirmedPendingMove = settlePendingMove(game);
  maybePlayStoneSound(currentGame, game, confirmedPendingMove);
  if (game.phase !== "play") {
    stopCountdownAudio();
    lastCountdownCueKey = undefined;
  } else if (
    currentGame &&
    (currentGame.id !== game.id || currentGame.turn !== game.turn ||
      currentGame.clockUpdatedAt !== game.clockUpdatedAt)
  ) {
    stopCountdownAudio();
  }
  currentGame = game;
  if (appRemake) appRemake.hidden = false;
  maybePlayCountdown(game);
  clearTimeout(gameClockTimer);
  shell.classList.add("game-layout");
  updateGameLayoutMode(shell);
  const {
    rawHistory,
    latestHistoryIndex,
    historyIndex,
    viewingHistory,
    boardColors,
    boardOpacity,
    visualHistoryIndex,
    playableHistoryCount,
    playableHistoryIndex,
    canNavigateHistory,
    canUsePlayActions,
    canUndo,
    canResign,
    passOrDoneDisabled,
  } = gameHistoryView(game, session, historyViewByGame);
  if (viewingHistory && !rawHistory[historyIndex]?.board) {
    void loadHistoryBoards(game, historyIndex);
  }
  const displayGame = viewingHistory
    ? { ...game, phase: "play", deadStones: [], noScorePoints: [] }
    : game;
  panel.innerHTML = gameViewHtml({
    game: displayGame,
    session,
    historyEntry: viewingHistory ? rawHistory[historyIndex] : undefined,
    boardColors,
    boardOpacity,
    canNavigateHistory,
    visualHistoryIndex,
    playableHistoryIndex,
    playableHistoryCount,
    viewingHistory,
    passOrDoneDisabled,
    canUsePlayActions,
    canUndo,
    canResign,
    showCoordinates,
  });

  historyKeyController = bindGameEvents({
    panel,
    game,
    session,
    boardColors,
    viewingHistory,
    historyIndex,
    latestHistoryIndex,
    historyKeyController,
    statusElement,
    sendAction,
    showGame,
    navigateGameHistory,
    canNavigateGameHistory,
    showCoordinates,
    toggleCoordinates,
  });

  showPendingStone();
  animateMagnetSlides(
    panel,
    positionMagnetSlides(previousGame, game, historyIndex, viewingHistory),
  );

  const activeSeat = game.seats[game.turn];
  statusElement.textContent = game.phase === "done" && game.winnerTeams?.length
    ? `done · winner: ${winnerText(game)}`
    : `${game.phase} · turn: ${activeSeat?.id ?? "none"}`;
  if (helpWasOpen) {
    const nextHelpDialog = panel.querySelector<HTMLDialogElement>(".game-info-dialog");
    nextHelpDialog?.showModal();
    const scroller = nextHelpDialog?.querySelector(".dialog-scroll");
    if (scroller) scroller.scrollTop = helpScrollTop;
  }
  const nextJosekiSelectionDialog = panel.querySelector<HTMLDialogElement>(
    "[data-joseki-selection-dialog]",
  );
  if (josekiSelectionWasOpen && nextJosekiSelectionDialog) {
    if (!nextJosekiSelectionDialog.open) nextJosekiSelectionDialog.showModal();
    const scroller = nextJosekiSelectionDialog.querySelector(".dialog-scroll");
    if (scroller) scroller.scrollTop = josekiSelectionScrollTop;
  }
  if (
    game.phase === "play" && game.clockUpdatedAt !== undefined && game.config.time?.system &&
    game.config.time.system !== "none"
  ) {
    gameClockTimer = setTimeout(() => updateGameClock(game), 1000);
  }
}

function readSavedStoneVolume(): number {
  return readSavedVolume("baduk:stone-volume");
}

function readSavedVoiceVolume(): number {
  return readSavedVolume("baduk:voice-volume");
}

function readSavedVolume(key: string): number {
  return clampVolume(
    Number(localStorage.getItem(key) ?? localStorage.getItem("baduk:sound-volume") ?? "0.5"),
  );
}

function readSavedCountdownSound(): CountdownSound {
  return parseCountdownSound(localStorage.getItem("baduk:countdown-sound"));
}

function readCountdownSoundSelection(): CountdownSound {
  return parseCountdownSound(countdownSound?.value);
}

function parseCountdownSound(value: string | null | undefined): CountdownSound {
  return value === "chinese" || value === "beep" || value === "off" ? value : "english";
}

/** The Katachi controls popover: same pattern and styles as the sound popover. */
function bindKatachiControlsPopover(): void {
  const control = document.querySelector<HTMLElement>("#katachi-controls");
  const toggle = document.querySelector<HTMLButtonElement>("#katachi-controls-toggle");
  const popover = document.querySelector<HTMLElement>("#katachi-controls-popover");
  const placeButton = document.querySelector<HTMLSelectElement>("#katachi-place-button");
  const rotateKey = document.querySelector<HTMLInputElement>("#katachi-rotate-key");
  const mirrorKey = document.querySelector<HTMLInputElement>("#katachi-mirror-key");
  if (!control || !toggle || !popover || !placeButton || !rotateKey || !mirrorKey) return;
  const fill = () => {
    const controls = readKatachiControls();
    placeButton.value = controls.placeButton;
    rotateKey.value = controls.rotateKey.toUpperCase();
    mirrorKey.value = controls.mirrorKey.toUpperCase();
  };
  const save = () => {
    const current = readKatachiControls();
    const key = (input: HTMLInputElement, fallback: string) =>
      input.value.trim().toLowerCase() || fallback;
    saveKatachiControls({
      placeButton: placeButton.value === "right" ? "right" : "left",
      rotateKey: key(rotateKey, current.rotateKey),
      mirrorKey: key(mirrorKey, current.mirrorKey),
    });
    fill();
  };
  fill();
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = popover.hidden;
    popover.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  });
  control.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => {
    popover.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  });
  placeButton.addEventListener("change", save);
  for (const input of [rotateKey, mirrorKey]) {
    input.addEventListener("input", save);
    input.addEventListener("focus", () => input.select());
  }
}

/** The last-move marker picker: same pattern and styles as the sound popover. */
function bindLastMoveMarkerPopover(): void {
  applyLastMoveMarker(readLastMoveMarker());
  const control = document.querySelector<HTMLElement>("#marker-control");
  const toggle = document.querySelector<HTMLButtonElement>("#marker-toggle");
  const popover = document.querySelector<HTMLElement>("#marker-popover");
  const select = document.querySelector<HTMLSelectElement>("#last-move-marker");
  if (!control || !toggle || !popover || !select) return;
  select.value = readLastMoveMarker();
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = popover.hidden;
    popover.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  });
  control.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => {
    popover.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  });
  select.addEventListener("change", () => {
    const marker = parseLastMoveMarker(select.value);
    saveLastMoveMarker(marker);
    applyLastMoveMarker(marker);
  });
}

function toggleSoundPopover(): void {
  if (!soundPopover || !soundToggle) return;
  const open = soundPopover.hidden;
  soundPopover.hidden = !open;
  soundToggle.setAttribute("aria-expanded", String(open));
}

function closeSoundPopover(): void {
  if (!soundPopover || !soundToggle) return;
  soundPopover.hidden = true;
  soundToggle.setAttribute("aria-expanded", "false");
}

function maybePlayStoneSound(previous: Game | undefined, next: Game, alreadyPlayed = false): void {
  const sound = moveSoundFor(previous, next);
  // The click already sounded when the pending stone appeared; a capture still plays.
  if (sound === "stone" && alreadyPlayed) return;
  if (sound) sounds.play(MOVE_SOUNDS[sound], "stone");
}

function maybePlayCountdown(game: Game): void {
  const selectedSound = readCountdownSoundSelection();
  if (selectedSound === "off") return;
  const cue = countdownCue(game);
  if (!cue || cue.key === lastCountdownCueKey) return;
  lastCountdownCueKey = cue.key;

  const src = selectedSound === "beep" || cue.seconds === 0
    ? COUNTDOWN_BEEP
    : countdownAudioPath(selectedSound, cue.seconds);
  if (!src) return;
  stopCountdownAudio();
  sounds.play(src, "voice");
}

function stopCountdownAudio(): void {
  sounds.stop("voice");
}

function preloadCountdownVoice(selected: CountdownSound): void {
  if (selected !== "english" && selected !== "chinese") return;
  sounds.preload(
    Array.from({ length: 10 }, (_, index) => countdownAudioPath(selected, index + 1))
      .filter((src): src is string => Boolean(src)),
  );
}

function updateGameClock(game: Game): void {
  if (currentGame !== game) return;
  if (activeClockExpired(game)) {
    clearTimeout(gameClockTimer);
    void showGame(game.id);
    return;
  }
  const previousPhase = game.phase;
  maybePlayCountdown(game);

  for (const clock of panel.querySelectorAll<HTMLElement>(".seat-time")) {
    const seatId = clock.closest<HTMLElement>("[data-seat-id]")?.dataset.seatId;
    const team = Number(clock.closest<HTMLElement>(".team-card[data-team]")?.dataset.team);
    const seat = seatId
      ? game.seats.find((candidate) => candidate.id === seatId)
      : Number.isInteger(team)
      ? game.seats.find((candidate, index) => candidate.team === team && index === game.turn) ??
        game.seats.find((candidate) => candidate.team === team)
      : undefined;
    if (seat) clock.innerHTML = seatMetaHtml(game, seat);
  }

  if (game.phase !== previousPhase) {
    renderGame(game);
    return;
  }
  if (game.phase === "play" && game.clockUpdatedAt !== undefined) {
    gameClockTimer = setTimeout(() => updateGameClock(game), 1000);
  }
}

/**
 * Slides to play for what is now on screen: a newly arrived live move, or the move of a position
 * that history navigation just landed on (including stepping forward into the live position).
 */
function positionMagnetSlides(
  previous: Game | undefined,
  game: Game,
  historyIndex: number,
  reviewing: boolean,
) {
  const entry = game.history?.[historyIndex];
  // A past position whose board is still loading isn't on screen yet; count it once it is.
  if (reviewing && !entry?.board) return [];
  const last = shownPosition;
  shownPosition = { gameId: game.id, historyIndex, reviewing };
  const navigated = last !== undefined && String(last.gameId) === String(game.id) &&
    last.historyIndex !== historyIndex && (last.reviewing || reviewing);
  if (reviewing) return navigated ? reviewMagnetSlides(game, entry) : [];
  if (navigated) {
    // Stepped forward into the live position: replay the latest move's slides.
    return reviewMagnetSlides(game, {
      board: game.board,
      lastStone: game.lastStone,
      magnetMoves: game.magnetMoves,
    });
  }
  return magnetSlides(previous, game, false);
}

/** Fetches the past positions needed to show `index`, then re-renders if still relevant. */
async function loadHistoryBoards(game: Game, index: number): Promise<void> {
  const from = historyFetchStart(historyBoards, game, index);
  if (from === undefined || historyBoardsLoading) return;
  historyBoardsLoading = true;
  try {
    const response = await getGameHistory(game.id, from);
    if (!response.ok) return;
    const { from: start, entries } = await readGameHistory(response);
    if (!currentGame || String(currentGame.id) !== String(game.id)) return;
    historyBoards = addHistoryBoards(historyBoards, currentGame, start, entries);
    renderGame(currentGame);
  } finally {
    historyBoardsLoading = false;
  }
}

function connectGameSocket(gameId: string | number) {
  connectGameSocketToServer(
    gameId,
    socketState,
    renderGame,
    connectGameSocket,
    cancelPendingMove,
  );
}

async function remakeCurrentGame() {
  if (!currentGame) return;
  statusElement.textContent = "Creating remake…";
  const response = await createGame(remakeConfig(currentGame.config));
  if (!response.ok) {
    statusElement.textContent = "Could not remake game.";
    return;
  }
  const game = await readGame(response);
  history.pushState(null, "", `/game/${game.id}`);
  await renderGameList();
  await showGame(game.id);
}

function toggleCoordinates() {
  showCoordinates = !showCoordinates;
  localStorage.setItem("baduk:show-coordinates", String(showCoordinates));
  updateCoordinateToggle();
  if (currentGame) renderGame(currentGame);
}

function updateCoordinateToggle() {
  coordinateToggle?.setAttribute("aria-pressed", String(showCoordinates));
  coordinateToggle?.classList.toggle("is-confirmed", showCoordinates);
}

function toggleStoneShadows(): void {
  showStoneShadows = !showStoneShadows;
  localStorage.setItem("baduk:stone-shadows", String(showStoneShadows));
  updateStoneShadowToggle();
}

function updateStoneShadowToggle(): void {
  document.documentElement.dataset.stoneShadows = showStoneShadows ? "on" : "off";
  stoneShadowToggle?.setAttribute("aria-pressed", String(showStoneShadows));
  stoneShadowToggle?.classList.toggle("is-confirmed", showStoneShadows);
}

async function sendAction(gameId: string | number, action: GameAction) {
  const pending = currentGame && String(currentGame.id) === String(gameId)
    ? optimisticPlacement(currentGame, session, action, pendingMove)
    : undefined;
  if (pending) startPendingMove(pending);
  const accepted = await sendGameAction(gameId, action, statusElement, renderGame, socketState);
  if (!accepted) cancelPendingMove();
}

function startPendingMove(pending: PendingMove): void {
  pendingMove = pending;
  showPendingStone();
  sounds.play(MOVE_SOUNDS.stone, "stone");
  clearTimeout(pendingMoveTimer);
  pendingMoveTimer = setTimeout(() => {
    if (pendingMove !== pending) return;
    cancelPendingMove("Move not confirmed by the server.");
  }, PENDING_MOVE_TIMEOUT_MS);
}

/** Clears the preview once the server's state covers it; true if the move was played. */
function settlePendingMove(game: Game): boolean {
  if (!pendingMove || !isPendingSettled(pendingMove, game)) return false;
  const confirmed = String(pendingMove.gameId) === String(game.id) &&
    (game.playMoves ?? 0) > pendingMove.playMoves;
  pendingMove = undefined;
  clearTimeout(pendingMoveTimer);
  return confirmed;
}

/**
 * Removes the preview after a rejection or timeout. The re-render rewrites the status line, so
 * the reason (e.g. "suicide") is put back afterwards.
 */
function cancelPendingMove(reason = statusElement.textContent ?? ""): void {
  if (!pendingMove) return;
  pendingMove = undefined;
  clearTimeout(pendingMoveTimer);
  if (currentGame) renderGame(currentGame);
  if (reason) statusElement.textContent = reason;
}

/** Draws the pending stone; re-applied after renders that don't settle it yet. */
function showPendingStone(): void {
  if (!pendingMove || !currentGame || String(currentGame.id) !== String(pendingMove.gameId)) {
    return;
  }
  const point = panel.querySelector<HTMLElement>(`.point[data-index="${pendingMove.index}"]`);
  if (!point || point.dataset.color !== "0") return;
  const color = stoneColor(currentGame, pendingMove.team);
  point.dataset.color = String(pendingMove.team);
  point.style.setProperty("--stone-color", color);
  point.style.setProperty("--stone-opacity", "0.6");
  point.classList.add("is-pending");
  point.classList.toggle("is-light-stone", stoneTone(color) === "light");
  // It is the last move now: move the marker over from the previous one.
  for (const marked of panel.querySelectorAll(".point.is-last-move")) {
    marked.classList.remove("is-last-move");
  }
  point.classList.add("is-last-move");
  point.style.setProperty("--last-move-dot", lastMoveDotColor(color));
}

function navigateGameHistory(
  game: Game,
  historyIndex: number,
  latestHistoryIndex: number,
  action: string,
) {
  const nextIndex = nextHistoryIndex(game.history ?? [], historyIndex, latestHistoryIndex, action);
  if (nextIndex === historyIndex) return;
  if (nextIndex === latestHistoryIndex) historyViewByGame.delete(game.id);
  else historyViewByGame.set(game.id, nextIndex);
  renderGame(game);
}

function canNavigateGameHistory(game: Game) {
  return canNavigateGameHistoryForSession(game, session);
}

boot();
