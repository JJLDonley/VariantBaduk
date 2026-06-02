import {
  createGame,
  getGame,
  loadBootData,
  readGame,
  readSession,
  updateSessionName,
} from "./api/http.ts";
import { remakeConfig, sendGameAction } from "./game/actions.ts";
import { gameConfigFromFormData } from "./create/config.ts";
import { bindCreateGameForm as bindCreateGameFormControls } from "./create/form-bind.ts";
import { invalidVariantComboMessage } from "./create/form.ts";
import { winnerText } from "./game/display.ts";
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
import type { Game, GameAction, Session } from "./types/domain.ts";

const statusElement = document.querySelector<HTMLElement>("#status")!;
const nameForm = document.querySelector<HTMLFormElement>("#name-form");
const nameInput = document.querySelector<HTMLInputElement>("#name-form input")!;
const panel = document.querySelector<HTMLElement>(".panel-card")!;
const listElement = document.querySelector<HTMLElement>("#game-list")!;
const shell = document.querySelector<HTMLElement>(".shell")!;
const themeToggle = document.querySelector<HTMLElement>("#theme-toggle");
const coordinateToggle = document.querySelector<HTMLButtonElement>("#coordinate-toggle");
const soundControl = document.querySelector<HTMLElement>("#sound-control");
const soundToggle = document.querySelector<HTMLButtonElement>("#sound-toggle");
const soundPopover = document.querySelector<HTMLElement>("#sound-popover");
const soundVolume = document.querySelector<HTMLInputElement>("#sound-volume");
const appRemake = document.querySelector<HTMLElement>("#app-remake");
const appHelp = document.querySelector<HTMLElement>("#app-help");
const stoneSound = createSound("/clack.mp3");
const captureSound = createSound("/capture.mp3");
const passSound = createSound("/pass.mp3");
if (soundVolume) soundVolume.value = String(stoneSound.volume);
const createGamePanelHtml = panel.innerHTML;

let session: Session | undefined;
const socketState: { socket?: WebSocket; gameId?: string | number } = {};
let gameEvents: EventSource | undefined;
let gameClockTimer: ReturnType<typeof setTimeout> | undefined;
let historyKeyController: AbortController | undefined;
let nameSaveTimer: ReturnType<typeof setTimeout> | undefined;
let lastSavedName = "";
let currentGame: Game | undefined;
let showCoordinates = localStorage.getItem("baduk:show-coordinates") === "true" &&
  !matchMedia("(max-width: 759px)").matches;
if (!showCoordinates && matchMedia("(max-width: 759px)").matches) {
  localStorage.setItem("baduk:show-coordinates", "false");
}
const historyViewByGame = new Map<Game["id"], number>();

applySavedTheme();
updateThemeToggle(themeToggle);
updateCoordinateToggle();
const landingHelpBody = document.querySelector<HTMLElement>("[data-landing-help-body]");
if (landingHelpBody) landingHelpBody.innerHTML = allVariantRulesHelpHtml();

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
soundToggle?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleSoundPopover();
});
soundControl?.addEventListener("click", (event) => event.stopPropagation());
soundVolume?.addEventListener("input", () => {
  setSoundVolume(Number(soundVolume.value));
  localStorage.setItem("baduk:sound-volume", soundVolume.value);
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
  await renderGameList();
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
  disconnectGameSocket(socketState);
  historyKeyController?.abort();
  shell.classList.remove("game-layout", "desktop-fit");
  panel.innerHTML = createGameTemplate();
  bindCreateGameForm();
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
  connectGameSocket(game.id);
  renderGame(game);
  await maybeJoinHashSeat(game, renderGame, showGame);
}

function renderGame(game: Game) {
  game = applyLocalName(game);
  const helpWasOpen = document.querySelector<HTMLDialogElement>(".game-info-dialog")?.open ?? false;
  maybePlayStoneSound(currentGame, game);
  currentGame = game;
  clearTimeout(gameClockTimer);
  shell.classList.add("game-layout");
  updateGameLayoutMode(shell);
  const {
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
    canResign,
    passOrDoneDisabled,
  } = gameHistoryView(game, session, historyViewByGame);
  const displayGame = viewingHistory
    ? { ...game, phase: "play", deadStones: [], noScorePoints: [] }
    : game;
  panel.innerHTML = gameViewHtml({
    game: displayGame,
    session,
    boardColors,
    boardOpacity,
    canNavigateHistory,
    visualHistoryIndex,
    playableHistoryIndex,
    playableHistoryCount,
    viewingHistory,
    passOrDoneDisabled,
    canUsePlayActions,
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
    renderGameList,
    showGame,
    navigateGameHistory,
    canNavigateGameHistory,
    showCoordinates,
    toggleCoordinates,
  });

  const activeSeat = game.seats[game.turn];
  statusElement.textContent = game.phase === "done" && game.winnerTeams?.length
    ? `done · winner: ${winnerText(game)}`
    : `${game.phase} · turn: ${activeSeat?.id ?? "none"}`;
  if (helpWasOpen) panel.querySelector<HTMLDialogElement>(".game-info-dialog")?.showModal();
  if (
    game.phase === "play" && game.clockUpdatedAt !== undefined && game.config.time?.system &&
    game.config.time.system !== "none"
  ) {
    gameClockTimer = setTimeout(() => renderGame(game), 1000);
  }
}

function createSound(src: string): HTMLAudioElement {
  const sound = new Audio(src);
  sound.preload = "auto";
  sound.volume = readSavedSoundVolume();
  return sound;
}

function setSoundVolume(volume: number): void {
  const safeVolume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.5;
  for (const sound of [stoneSound, captureSound, passSound]) sound.volume = safeVolume;
}

function readSavedSoundVolume(): number {
  const saved = Number(localStorage.getItem("baduk:sound-volume") ?? "0.5");
  return Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : 0.5;
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

function maybePlayStoneSound(previous: Game | undefined, next: Game): void {
  if (!previous || previous.id !== next.id) return;
  const nextAction = next.history?.at(-1)?.action;
  const previousHistoryLength = previous.history?.length ?? 0;
  const nextHistoryLength = next.history?.length ?? 0;
  if (nextHistoryLength > previousHistoryLength && nextAction === "pass") {
    playSound(passSound);
    return;
  }
  if ((next.captureCount ?? 0) > (previous.captureCount ?? 0)) {
    playSound(captureSound);
    return;
  }
  if ((next.playMoves ?? 0) > (previous.playMoves ?? 0)) playSound(stoneSound);
}

function playSound(sound: HTMLAudioElement): void {
  sound.currentTime = 0;
  void sound.play().catch(() => {});
}

function connectGameSocket(gameId: string | number) {
  connectGameSocketToServer(gameId, socketState, renderGame, renderGameList, connectGameSocket);
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

async function sendAction(gameId: string | number, action: GameAction) {
  await sendGameAction(gameId, action, statusElement, renderGame, renderGameList, socketState);
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
