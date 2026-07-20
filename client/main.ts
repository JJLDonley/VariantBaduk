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
import { seatMetaHtml, winnerText } from "./game/display.ts";
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
import {
  activeClockExpired,
  countdownAudioPath,
  countdownCue,
  type CountdownSound,
  type CountdownVoice,
} from "./game/countdown.ts";
import type { Game, GameAction, Session } from "./types/domain.ts";

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
const stoneSound = createSound("/clack.mp3", readSavedStoneVolume());
const captureSound = createSound("/capture.mp3", readSavedStoneVolume());
const passSound = createSound("/pass.mp3", readSavedStoneVolume());
const voiceCountdownSounds = {
  english: createCountdownVoiceSounds("english"),
  chinese: createCountdownVoiceSounds("chinese"),
};
const countdownBeep = createSound("/CountdownBeep.mp3", readSavedVoiceVolume());
if (stoneVolume) stoneVolume.value = String(stoneSound.volume);
if (voiceVolume) voiceVolume.value = String(countdownBeep.volume);
if (countdownSound) countdownSound.value = readSavedCountdownSound();
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

applySavedTheme();
updateThemeToggle(themeToggle);
updateCoordinateToggle();
updateStoneShadowToggle();
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
stoneShadowToggle?.addEventListener("click", toggleStoneShadows);
soundToggle?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleSoundPopover();
});
soundControl?.addEventListener("click", (event) => event.stopPropagation());
stoneVolume?.addEventListener("input", () => {
  setStoneVolume(Number(stoneVolume.value));
  localStorage.setItem("baduk:stone-volume", stoneVolume.value);
});
voiceVolume?.addEventListener("input", () => {
  setVoiceVolume(Number(voiceVolume.value));
  localStorage.setItem("baduk:voice-volume", voiceVolume.value);
});
countdownSound?.addEventListener("change", () => {
  localStorage.setItem("baduk:countdown-sound", readCountdownSoundSelection());
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
  if (appRemake) appRemake.hidden = true;
  lastCountdownCueKey = undefined;
  stopCountdownAudio();
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
  const josekiSelectionDialog = document.querySelector<HTMLDialogElement>(
    "[data-joseki-selection-dialog]",
  );
  const josekiSelectionWasOpen = josekiSelectionDialog?.open ?? false;
  const josekiSelectionScrollTop = josekiSelectionDialog?.scrollTop ?? 0;
  maybePlayStoneSound(currentGame, game);
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
  const nextJosekiSelectionDialog = panel.querySelector<HTMLDialogElement>(
    "[data-joseki-selection-dialog]",
  );
  if (josekiSelectionWasOpen && nextJosekiSelectionDialog) {
    if (!nextJosekiSelectionDialog.open) nextJosekiSelectionDialog.showModal();
    nextJosekiSelectionDialog.scrollTop = josekiSelectionScrollTop;
  }
  if (
    game.phase === "play" && game.clockUpdatedAt !== undefined && game.config.time?.system &&
    game.config.time.system !== "none"
  ) {
    gameClockTimer = setTimeout(() => updateGameClock(game), 1000);
  }
}

function createSound(src: string, volume: number): HTMLAudioElement {
  const sound = new Audio(src);
  sound.preload = "auto";
  sound.volume = volume;
  return sound;
}

function createCountdownVoiceSounds(voice: CountdownVoice): HTMLAudioElement[] {
  return Array.from({ length: 10 }, (_, index) => {
    const src = countdownAudioPath(voice, index + 1);
    if (!src) throw new Error(`Missing ${voice} countdown audio path`);
    return createSound(src, readSavedVoiceVolume());
  });
}

function setStoneVolume(volume: number): void {
  const safeVolume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.5;
  for (const sound of [stoneSound, captureSound, passSound]) sound.volume = safeVolume;
}

function setVoiceVolume(volume: number): void {
  const safeVolume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.5;
  for (
    const sound of [
      ...voiceCountdownSounds.english,
      ...voiceCountdownSounds.chinese,
      countdownBeep,
    ]
  ) sound.volume = safeVolume;
}

function readSavedStoneVolume(): number {
  return readSavedVolume("baduk:stone-volume");
}

function readSavedVoiceVolume(): number {
  return readSavedVolume("baduk:voice-volume");
}

function readSavedVolume(key: string): number {
  const saved = Number(
    localStorage.getItem(key) ?? localStorage.getItem("baduk:sound-volume") ?? "0.5",
  );
  return Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : 0.5;
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

function maybePlayCountdown(game: Game): void {
  const selectedSound = readCountdownSoundSelection();
  if (selectedSound === "off") return;
  const cue = countdownCue(game);
  if (!cue || cue.key === lastCountdownCueKey) return;
  lastCountdownCueKey = cue.key;

  if (selectedSound === "beep" || cue.seconds === 0) {
    playCountdownSound(countdownBeep);
    return;
  }

  const audio = voiceCountdownSounds[selectedSound][cue.seconds - 1];
  if (!audio) return;
  playCountdownSound(audio);
}

function playCountdownSound(audio: HTMLAudioElement): void {
  stopCountdownAudio();
  playSound(audio);
}

function stopCountdownAudio(): void {
  const countdownSounds = [
    ...voiceCountdownSounds.english,
    ...voiceCountdownSounds.chinese,
    countdownBeep,
  ];
  for (const audio of countdownSounds) {
    audio.pause();
    audio.currentTime = 0;
  }
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
