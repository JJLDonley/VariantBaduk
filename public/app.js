// client/api/http.ts
async function jsonResponse(response) {
  return await response.json();
}
async function loadBootData() {
  const [healthResponse, sessionResponse] = await Promise.all([
    fetch("/api/health"),
    fetch("/api/session")
  ]);
  if (!healthResponse.ok) throw new Error(`health failed: ${healthResponse.status}`);
  if (!sessionResponse.ok) throw new Error(`session failed: ${sessionResponse.status}`);
  return {
    health: await jsonResponse(healthResponse),
    session: await jsonResponse(sessionResponse)
  };
}
async function updateSessionName(name) {
  return await fetch("/api/session/name", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      name
    })
  });
}
async function readSession(response) {
  return await jsonResponse(response);
}
async function listGames() {
  return await fetch("/api/games");
}
async function readGameList(response) {
  return await jsonResponse(response);
}
async function listJosekiCards() {
  return await fetch("/api/joseki-cards");
}
async function readJosekiCards(response) {
  return await jsonResponse(response);
}
async function createGame(config) {
  return await fetch("/api/games", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(config)
  });
}
async function getGame(gameId) {
  return await fetch(`/api/games/${gameId}`);
}
async function readGame(response) {
  const body = await jsonResponse(response);
  return body.game;
}
async function joinSeat(gameId, seatId) {
  return await fetch(`/api/games/${gameId}/seats/${seatId}/join`, {
    method: "POST"
  });
}
async function leaveSeat(gameId, seatId) {
  return await fetch(`/api/games/${gameId}/seats/${seatId}/leave`, {
    method: "POST"
  });
}
async function postGameAction(gameId, action) {
  return await fetch(`/api/games/${gameId}/actions`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(action)
  });
}

// client/game/actions.ts
function currentActionSeat(game, session2, mode = game.phase) {
  if (mode === "scoring") {
    return game.seats.find((seat, index) => seat.playerUuid === session2?.uuid && !seat.resigned && !game.scoreAccepted?.[index]);
  }
  if (mode === "joseki" || mode === "hidden") {
    return game.seats.find((seat) => seat.playerUuid === session2?.uuid && !seat.resigned);
  }
  const activeSeat = game.seats[game.turn];
  return activeSeat?.playerUuid === session2?.uuid && !activeSeat.resigned ? activeSeat : void 0;
}
function withCurrentSeat(game, session2, action) {
  const seat = currentActionSeat(game, session2, action.type === "acceptScore" || action.type === "toggleDead" ? "scoring" : game.phase);
  return seat ? {
    ...action,
    seatId: seat.id
  } : action;
}
async function sendGameAction(gameId, action, statusElement2, renderGame2, renderGameList3, socketState2) {
  if (statusElement2) statusElement2.textContent = "Sending\u2026";
  if (socketState2?.gameId === gameId && socketState2.socket?.readyState === WebSocket.OPEN) {
    socketState2.socket.send(JSON.stringify({
      type: "action",
      action
    }));
    return;
  }
  const response = await postGameAction(gameId, action);
  const body = await response.json();
  if (!response.ok) {
    if (statusElement2) statusElement2.textContent = body.error ?? "Illegal action";
    if (body.game) renderGame2(body.game);
    return;
  }
  renderGame2(body.game);
  await renderGameList3();
}
function remakeConfig(config) {
  const next = JSON.parse(JSON.stringify(config));
  delete next.name;
  return next;
}

// client/ui/clipboard.ts
async function copyText(text, button, statusElement2, confirmation = "Copied") {
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch {
    copied = false;
  }
  if (!copied) copied = fallbackCopyText(text);
  if (!copied) showManualCopyDialog(text);
  if (statusElement2) statusElement2.textContent = copied ? `${confirmation}: ${text}` : `Copy manually: ${text}`;
  if (!(button instanceof HTMLElement)) return;
  const original = button.textContent;
  button.classList.toggle("is-confirmed", copied);
  button.textContent = copied ? confirmation : "Copy failed";
  setTimeout(() => {
    button.classList.remove("is-confirmed");
    button.textContent = original;
  }, 1200);
}
function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "0";
  textarea.style.top = "0";
  textarea.style.opacity = "0.01";
  textarea.style.pointerEvents = "none";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}
function showManualCopyDialog(text) {
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog invite-dialog";
  dialog.innerHTML = `
    <button class="dialog-close" data-copy-close type="button" aria-label="Close">\xD7</button>
    <h3>Copy invite link</h3>
    <input data-copy-input readonly value="${text}" />
  `;
  document.body.append(dialog);
  dialog.addEventListener("click", (event) => {
    if (event.target?.closest("[data-copy-close]")) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  const input = dialog.querySelector("[data-copy-input]");
  input?.focus();
  input?.select();
}

// client/create/custom-goban.ts
var CUSTOM_GOBAN_AUTOSAVE_KEY = "baduk:custom-goban-autosave";
function parseCustomGoban(value, fallbackSize = 9) {
  if (!value) return emptyGoban(fallbackSize);
  try {
    return JSON.parse(String(value));
  } catch {
    return emptyGoban(fallbackSize);
  }
}
function restoreCustomGobanAutosave(root = document) {
  const form = root.querySelector("#create-game-form");
  const hidden = form?.querySelector("[name='customGoban']");
  const toggle = form?.querySelector("[name='customGobanMode']");
  const saved = localStorage.getItem(CUSTOM_GOBAN_AUTOSAVE_KEY);
  if (!hidden || !saved || hidden.value) return;
  const goban = parseCustomGoban(saved, Number(form?.querySelector("[name='boardSize']")?.value ?? 9));
  hidden.value = JSON.stringify(goban);
  if (toggle) toggle.checked = true;
}
function openCustomGobanPreview(customGoban, statusElement2) {
  if (!customGoban) return;
  const goban = {
    width: customGoban.width,
    height: customGoban.height,
    points: [
      ...customGoban.points
    ]
  };
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog custom-goban-dialog";
  dialog.innerHTML = `
    <button class="custom-goban-close" data-goban="close" type="button" aria-label="Close">\xD7</button>
    <div class="custom-goban-controls">
      <button data-goban="copy" type="button">Copy</button>
    </div>
    <div class="custom-goban-board-wrap"><div class="custom-goban-board"></div></div>
  `;
  document.body.append(dialog);
  const board = dialog.querySelector(".custom-goban-board");
  if (board) {
    board.style.gridTemplateColumns = `repeat(${goban.width}, 1fr)`;
    board.innerHTML = goban.points.map((point) => `<button type="button" class="custom-point ${point === -1 ? "is-removed" : ""}" disabled></button>`).join("");
  }
  dialog.addEventListener("click", (event) => {
    const target = event.target;
    const action = target?.closest("[data-goban]")?.dataset.goban;
    if (action === "copy") copyText(JSON.stringify(goban), event.target, statusElement2, "Copied");
    if (action === "close") dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}
function openCustomGobanEditor(statusElement2) {
  const form = document.querySelector("#create-game-form");
  const size = Number(form?.querySelector("[name='boardSize']")?.value ?? 9);
  const hidden = form?.querySelector("[name='customGoban']");
  if (!hidden) return;
  const goban = parseCustomGoban(hidden.value, size);
  const autosave = () => {
    hidden.value = JSON.stringify(goban);
    localStorage.setItem(CUSTOM_GOBAN_AUTOSAVE_KEY, hidden.value);
  };
  autosave();
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog custom-goban-dialog";
  let resizeMode = "both";
  dialog.innerHTML = `
    <button class="custom-goban-close" data-goban="close" type="button" aria-label="Close">\xD7</button>
    <div class="custom-goban-controls">
      <button data-goban="reset" type="button">Reset</button>
      <button data-goban="save" type="button">Save</button>
      <button data-goban="copy" type="button">Copy</button>
      <button data-goban="paste" type="button">Paste</button>
      <button data-goban="mode" type="button">Both</button>
      <button data-goban="add" type="button">+</button>
      <button data-goban="remove" type="button">\u2212</button>
    </div>
    <div class="custom-goban-board-wrap"><div class="custom-goban-board"></div></div>
  `;
  document.body.append(dialog);
  const render = () => {
    const board = dialog.querySelector(".custom-goban-board");
    if (!board) return;
    board.style.gridTemplateColumns = `repeat(${goban.width}, 1fr)`;
    board.innerHTML = goban.points.map((point, index) => `<button type="button" data-index="${index}" class="custom-point ${point === -1 ? "is-removed" : ""}"></button>`).join("");
    for (const point of board.querySelectorAll(".custom-point")) {
      point.addEventListener("click", () => {
        const index = Number(point.dataset.index);
        goban.points[index] = goban.points[index] === -1 ? 0 : -1;
        autosave();
        render();
      });
    }
  };
  const resize = (width, height) => {
    const next = Array(width * height).fill(0);
    for (let y = 0; y < Math.min(height, goban.height); y++) {
      for (let x = 0; x < Math.min(width, goban.width); x++) {
        next[y * width + x] = goban.points[y * goban.width + x];
      }
    }
    goban.width = width;
    goban.height = height;
    goban.points = next;
    autosave();
    render();
  };
  dialog.addEventListener("click", (event) => {
    const target = event.target;
    const action = target?.closest("[data-goban]")?.dataset.goban;
    if (!action) return;
    if (action === "mode") {
      resizeMode = resizeMode === "row" ? "col" : resizeMode === "col" ? "both" : "row";
      target.textContent = resizeMode === "row" ? "Row" : resizeMode === "col" ? "Col" : "Both";
    }
    if (action === "add") {
      resize(resizeMode === "row" ? goban.width : Math.min(25, goban.width + 1), resizeMode === "col" ? goban.height : Math.min(25, goban.height + 1));
    }
    if (action === "remove") {
      resize(resizeMode === "row" ? goban.width : Math.max(2, goban.width - 1), resizeMode === "col" ? goban.height : Math.max(2, goban.height - 1));
    }
    if (action === "reset") resize(size, size);
    if (action === "save") {
      autosave();
      dialog.close();
    }
    if (action === "copy") copyText(JSON.stringify(goban), event.target, statusElement2, "Copied");
    if (action === "paste") {
      navigator.clipboard?.readText().then((text) => {
        const pasted = parseCustomGoban(text, size);
        goban.width = pasted.width;
        goban.height = pasted.height;
        goban.points = pasted.points;
        autosave();
        render();
      });
    }
    if (action === "close") dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  render();
  dialog.showModal();
}
function emptyGoban(size) {
  return {
    width: size,
    height: size,
    points: Array(size * size).fill(0)
  };
}

// client/create/config.ts
function gameConfigFromFormData(data) {
  return {
    boardSize: Number(data.get("boardSize")),
    name: String(data.get("gameName") ?? "").trim(),
    ruleset: String(data.get("ruleset") ?? "chinese"),
    komi: Number(data.get("komi")),
    handicap: Number(data.get("handicap")),
    creatorSeat: String(data.get("creatorSeat") ?? "black"),
    time: {
      system: String(data.get("timeSystem") ?? "none"),
      main: Number(data.get("mainTime")),
      periods: Number(data.get("periods")),
      periodTime: Number(data.get("periodTime")),
      fischerIncrement: Number(data.get("fischerIncrement"))
    },
    customGoban: data.has("customGobanMode") ? parseCustomGoban(data.get("customGoban"), Number(data.get("boardSize"))) : void 0,
    variants: {
      capturesGivePoints: data.has("capturesGivePoints"),
      ponnukiPointValue: Number(data.get("ponnukiPointValue")),
      pixel: data.has("pixel"),
      zen: data.has("zen"),
      zenPlayerCount: Number(data.get("zenPlayerCount")),
      colorGo: data.has("colorGo"),
      colorGoPlayerCount: Number(data.get("colorGoPlayerCount")),
      colorGoColors: [
        String(data.get("colorGoColor1") ?? "#111111"),
        String(data.get("colorGoColor2") ?? "#eeeeee"),
        String(data.get("colorGoColor3") ?? "#6c8cff"),
        String(data.get("colorGoColor4") ?? "#e07a5f")
      ],
      colorGoKomi: [
        0,
        Number(data.get("colorGoKomi2")),
        Number(data.get("colorGoKomi3")),
        Number(data.get("colorGoKomi4"))
      ],
      phantomMove: data.has("phantomMove"),
      phantomHideViewers: data.has("phantomHideViewers"),
      hiddenMove: data.has("hiddenMove"),
      hiddenMoveCount: Number(data.get("hiddenMoveCount")),
      hiddenMoveShowViewers: data.has("hiddenMoveShowViewers"),
      josekiCard: data.has("josekiCard"),
      tetris: data.has("tetris"),
      nPlusOne: data.has("nPlusOne"),
      nPlusOneCount: Number(data.get("nPlusOneCount")),
      traitor: data.has("traitor"),
      traitorStoneCount: Number(data.get("traitorMoveCount")),
      showTraitorCounter: data.has("showTraitorCounter")
    }
  };
}

// client/create/form.ts
function cycleCreatorSeat(event) {
  const input = document.querySelector("[name='creatorSeat']");
  if (!input) return;
  const options = creatorSeatOptions();
  const index = options.findIndex((option) => option.value === input.value);
  const next = options[(index + 1) % options.length] ?? options[0];
  input.value = next.value;
  const button = event.currentTarget;
  if (button) button.textContent = `Seat: ${next.label}`;
}
function updateCreatorSeatOptions() {
  const input = document.querySelector("[name='creatorSeat']");
  const button = document.querySelector("[data-seat-toggle]");
  if (!input || !button) return;
  const options = creatorSeatOptions();
  const selected = options.find((option) => option.value === input.value) ?? options[0];
  input.value = selected.value;
  button.textContent = `Seat: ${selected.label}`;
}
function creatorSeatOptions() {
  const color = document.querySelector("[name='colorGo']")?.checked;
  const zen = document.querySelector("[name='zen']")?.checked;
  if (color) {
    const count = Number(document.querySelector("[name='colorGoPlayerCount']")?.value ?? 3);
    return multiplayerSeatOptions(count);
  }
  if (zen) {
    const count = Number(document.querySelector("[name='zenPlayerCount']")?.value ?? 3);
    return multiplayerSeatOptions(count);
  }
  return [
    {
      value: "black",
      label: "Black"
    },
    {
      value: "white",
      label: "White"
    },
    {
      value: "none",
      label: "None"
    }
  ];
}
function multiplayerSeatOptions(count) {
  return [
    ...Array.from({
      length: count
    }, (_, index) => ({
      value: `player-${index + 1}`,
      label: `P${index + 1}`
    })),
    {
      value: "none",
      label: "None"
    }
  ];
}
function updateTimeOptions() {
  const selected = document.querySelector("[name='timeSystem']")?.value ?? "none";
  for (const option of document.querySelectorAll("[data-time-option]")) {
    option.hidden = !(option.dataset.timeOption ?? "").split(" ").includes(selected);
  }
}
function updateRuleDefaults() {
  const komi = document.querySelector("[name='komi']");
  const captures = document.querySelector("[name='capturesGivePoints']");
  const handicap = Number(document.querySelector("[name='handicap']")?.value ?? 0);
  const rules = document.querySelector("[name='ruleset']")?.value;
  if (komi) {
    komi.value = handicap > 0 ? "0.5" : [
      "chinese",
      "aga"
    ].includes(rules ?? "") ? "7.5" : "6.5";
  }
  if (captures) captures.checked = rules === "japanese";
}
function updateVariantOptions() {
  updateVariantConflicts();
  const colorGoCount = Number(document.querySelector("[name='colorGoPlayerCount']")?.value ?? 3);
  for (const option of document.querySelectorAll("[data-color-go-player]")) {
    const hidden = Number(option.dataset.colorGoPlayer) > colorGoCount;
    option.hidden = hidden;
    option.style.display = hidden ? "none" : "";
  }
  const scroller = document.querySelector(".panel-card");
  const scrollTop = scroller?.scrollTop ?? 0;
  for (const option of document.querySelectorAll("[data-variant-option]")) {
    const input = document.querySelector(`[name='${option.dataset.variantOption}']`);
    option.hidden = !input?.checked;
  }
  const divider = document.querySelector("[data-variant-options-divider]");
  if (divider) divider.hidden = false;
  requestAnimationFrame(() => {
    if (scroller) scroller.scrollTop = scrollTop;
    scrollTo(0, 0);
  });
}
function invalidVariantComboMessage(data) {
  if (data.has("josekiCard") && Number(data.get("boardSize")) !== 19) {
    return "Joseki Card requires a 19\xD719 board.";
  }
  if (data.has("josekiCard") && (data.has("customGobanMode") || data.has("tetris") || data.has("zen") || data.has("colorGo"))) {
    return "Joseki Card cannot be combined with CGoban, Tetris, Zen, or Color Go.";
  }
  if (data.has("hiddenMove") && data.has("zen")) return "Hidden cannot be combined with Zen.";
  if (data.has("zen") && data.has("colorGo")) return "Zen cannot be combined with Color Go.";
  if (data.has("tetris") && data.has("pixel")) return "Tetris cannot be combined with Pixel.";
  if (data.has("tetris") && data.has("nPlusOne") && Number(data.get("nPlusOneCount")) === 4) {
    return "Tetris cannot be combined with N+1 count 4.";
  }
  return "";
}
function updateVariantConflicts() {
  const boardSize = document.querySelector("[name='boardSize']");
  const josekiCard = document.querySelector("[name='josekiCard']");
  const customGoban = document.querySelector("[name='customGobanMode']");
  const tetris = document.querySelector("[name='tetris']");
  const pixel = document.querySelector("[name='pixel']");
  const zen = document.querySelector("[name='zen']");
  const colorGo = document.querySelector("[name='colorGo']");
  const hiddenMove = document.querySelector("[name='hiddenMove']");
  const nPlusOne = document.querySelector("[name='nPlusOne']");
  const nPlusOneCount = document.querySelector("[name='nPlusOneCount']");
  if (!boardSize || !josekiCard || !customGoban || !tetris || !pixel || !zen || !colorGo || !hiddenMove || !nPlusOne || !nPlusOneCount) return;
  resolveExclusivePair(tetris, pixel);
  resolveExclusivePair(zen, colorGo);
  resolveExclusivePair(zen, hiddenMove);
  if (josekiCard.checked) {
    boardSize.value = "19";
    if (customGoban.checked) customGoban.checked = false;
    if (tetris.checked) tetris.checked = false;
    if (zen.checked) zen.checked = false;
    if (colorGo.checked) colorGo.checked = false;
  }
  const tetrisBlockedByNPlusOne = nPlusOne.checked && Number(nPlusOneCount.value) === 4;
  if (tetrisBlockedByNPlusOne && tetris.checked) tetris.checked = false;
  const tetrisChecked = tetris.checked;
  setVariantDisabled(pixel, tetrisChecked);
  setVariantDisabled(customGoban, josekiCard.checked);
  setVariantDisabled(tetris, pixel.checked || tetrisBlockedByNPlusOne || josekiCard.checked);
  setVariantDisabled(colorGo, zen.checked || josekiCard.checked);
  setVariantDisabled(hiddenMove, zen.checked);
  setVariantDisabled(zen, colorGo.checked || hiddenMove.checked || josekiCard.checked);
  setVariantDisabled(josekiCard, customGoban.checked || tetris.checked || zen.checked || colorGo.checked);
  boardSize.setCustomValidity(josekiCard.checked && Number(boardSize.value) !== 19 ? "Joseki Card requires a 19\xD719 board." : "");
  nPlusOneCount.setCustomValidity(tetrisChecked && Number(nPlusOneCount.value) === 4 ? "Tetris cannot use N+1 count 4." : "");
}
function resolveExclusivePair(first, second) {
  if (!first.checked || !second.checked) return;
  if (document.activeElement === first) second.checked = false;
  else first.checked = false;
}
function setVariantDisabled(input, disabled) {
  input.disabled = disabled;
  input.closest(".variant-button")?.classList.toggle("is-disabled", disabled);
}

// client/ui/format.ts
function formatHms(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const secs = total % 60;
  return [
    hours,
    minutes,
    secs
  ].map((part) => String(part).padStart(2, "0")).join(":");
}
function formatByoyomiTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return minutes > 0 ? `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : String(secs).padStart(2, "0");
}
function rulesText(ruleset) {
  return {
    chinese: "Chinese",
    aga: "AGA",
    japanese: "Japanese",
    area: "Area",
    territory: "Territory"
  }[ruleset] ?? ruleset;
}
function formatMinutes(seconds) {
  return `${Math.floor((Number(seconds) || 0) / 60)}m`;
}
function timeSettingsText(time) {
  if (!time || time.system === "none") return "No time limit";
  if (time.system === "byoyomi") {
    return `Byo-yomi \xB7 Main ${formatMinutes(time.main ?? 0)} \xB7 ${time.periods ?? 0} \xD7 ${time.periodTime ?? 0}s`;
  }
  if (time.system === "fischer") {
    return `Fischer \xB7 Main ${formatMinutes(time.main ?? 0)} \xB7 +${time.fischerIncrement ?? 0}s`;
  }
  return "No time limit";
}
function short(value) {
  return String(value).slice(0, 8);
}
function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// client/game/joseki-card.ts
function josekiCardGridHtml(cards, selectedIds = /* @__PURE__ */ new Set()) {
  const previewSize = josekiCardGridPreviewSize(cards);
  return `<div class="j-card-grid">${cards.map((card) => josekiCardHtml(card, selectedIds.has(card.id), previewSize)).join("")}</div>`;
}
function josekiCardHtml(card, selected = false, previewSize = josekiCardPreviewBounds(card.stones, card.boardSize)) {
  const bounds2 = josekiCardTopRightBounds(card.stones, previewSize, card.boardSize);
  return `
    <button class="j-card ${selected ? "is-selected" : ""}" type="button" data-joseki-card-id="${card.id}">
      <span>${escapeHtml(card.name)}</span>
      ${josekiCardBoardHtml(card.stones, bounds2)}
      <span class="j-card__meta">${card.stones.length} stones \xB7 ${bounds2.width}\xD7${bounds2.height} preview</span>
    </button>
  `;
}
function josekiCardBoardHtml(stones, bounds2 = josekiCardPreviewBounds(stones)) {
  return `
    <span class="j-card__board" aria-hidden="true" style="--j-card-board-width: ${bounds2.width}; --j-card-board-height: ${bounds2.height}">
      ${josekiCardLineHtml(bounds2)}
      ${stones.map((stone) => josekiCardStoneHtml(stone, bounds2)).join("")}
    </span>
  `;
}
function josekiCardGridPreviewSize(cards) {
  const bounds2 = cards.map((card) => josekiCardPreviewBounds(card.stones, card.boardSize));
  return {
    width: Math.max(1, ...bounds2.map((bound) => bound.width)),
    height: Math.max(1, ...bounds2.map((bound) => bound.height))
  };
}
function josekiCardTopRightBounds(stones, previewSize, boardSize = 19) {
  if (stones.length === 0) {
    return {
      minX: Math.max(0, boardSize - previewSize.width),
      minY: 0,
      ...previewSize
    };
  }
  return {
    minX: Math.max(0, boardSize - previewSize.width),
    minY: 0,
    ...previewSize
  };
}
function josekiCardPreviewBounds(stones, boardSize = 19) {
  if (stones.length === 0) {
    return {
      minX: Math.max(0, boardSize - 1),
      minY: 0,
      width: 1,
      height: 1
    };
  }
  const xs = stones.map((stone) => stone.x);
  const ys = stones.map((stone) => stone.y);
  const minX = Math.max(0, Math.min(...xs) - 1);
  const minY = 0;
  const maxX = boardSize - 1;
  const maxY = Math.min(boardSize - 1, Math.max(...ys) + 1);
  return {
    minX,
    minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}
function josekiCardLineHtml(bounds2) {
  const vertical = Array.from({
    length: Math.max(0, bounds2.width)
  }, (_, x) => `<span class="j-card__line j-card__line--vertical" style="--j-card-x: ${linePosition(x, bounds2.width)}"></span>`);
  const horizontal = Array.from({
    length: Math.max(0, bounds2.height)
  }, (_, y) => `<span class="j-card__line j-card__line--horizontal" style="--j-card-y: ${linePosition(y, bounds2.height)}"></span>`);
  return `${vertical.join("")}${horizontal.join("")}`;
}
function josekiCardStoneHtml(stone, bounds2) {
  return `<span class="j-card__stone" data-color="${stone.color}" style="--j-card-x: ${linePosition(stone.x - bounds2.minX, bounds2.width)}; --j-card-y: ${linePosition(stone.y - bounds2.minY, bounds2.height)}"></span>`;
}
function linePosition(index, lineCount) {
  return index / Math.max(1, lineCount - 1);
}

// client/create/joseki-card-dialog.ts
async function openJosekiCardDialog(statusElement2) {
  const response = await listJosekiCards();
  if (!response.ok) {
    if (statusElement2) statusElement2.textContent = "Could not load joseki cards.";
    return;
  }
  const { cards } = await readJosekiCards(response);
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog ui-scroll joseki-card-dialog";
  dialog.innerHTML = josekiCardDialogHtml(cards);
  document.body.append(dialog);
  dialog.querySelector(".dialog-close")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}
function josekiCardDialogHtml(cards) {
  return `
    <button class="dialog-close" type="button" aria-label="Close">\xD7</button>
    <h3>Joseki Cards</h3>
    <p class="ui-muted">Preview available cards. Selection and pre-game placement are next.</p>
    ${josekiCardGridHtml(cards)}
  `;
}

// client/create/form-bind.ts
function bindCreateGameForm(submitHandler, statusElement2, root = document) {
  restoreCustomGobanAutosave(root);
  root.querySelector("#create-game-form")?.addEventListener("submit", submitHandler);
  root.querySelector("[name='timeSystem']")?.addEventListener("change", updateTimeOptions);
  root.querySelector("[name='ruleset']")?.addEventListener("change", updateRuleDefaults);
  root.querySelector("[name='handicap']")?.addEventListener("change", updateRuleDefaults);
  root.querySelector("[name='boardSize']")?.addEventListener("change", updateVariantOptions);
  root.querySelector("[name='colorGoPlayerCount']")?.addEventListener("change", () => {
    updateVariantOptions();
    updateCreatorSeatOptions();
  });
  root.querySelector("[name='zenPlayerCount']")?.addEventListener("change", updateCreatorSeatOptions);
  root.querySelector("[name='nPlusOneCount']")?.addEventListener("input", updateVariantOptions);
  root.querySelector(".custom-goban-open")?.addEventListener("click", () => openCustomGobanEditor(statusElement2));
  root.querySelector(".joseki-card-open")?.addEventListener("click", () => openJosekiCardDialog(statusElement2));
  root.querySelector("[data-seat-toggle]")?.addEventListener("click", cycleCreatorSeat);
  for (const input of root.querySelectorAll(".variant-button input")) {
    input.addEventListener("change", updateVariantOptions);
    input.addEventListener("change", updateCreatorSeatOptions);
  }
  refreshCreateGameForm();
}
function refreshCreateGameForm() {
  updateTimeOptions();
  updateRuleDefaults();
  updateVariantOptions();
  updateCreatorSeatOptions();
}

// client/game/variants.ts
var ALL_VARIANT_RULES = [
  {
    label: "CGoban",
    rule: "Custom board shapes can remove points from the goban."
  },
  {
    label: "Captures are points",
    rule: "Captures add points immediately."
  },
  {
    label: "Ponnuki points",
    rule: "Single-stone captures can award extra points."
  },
  {
    label: "Pixel",
    rule: "Each move places a 2\xD72 block where possible."
  },
  {
    label: "Zen",
    rule: "Multi-player game where placed stone color alternates by move."
  },
  {
    label: "Color Go",
    rule: "Multi-player Go: each player has their own stone color and komi."
  },
  {
    label: "Phantom",
    rule: "Stones start hidden; collisions, captures, atari, and scoring reveal them."
  },
  {
    label: "Joseki Card",
    rule: "Players select and place joseki cards in corners before normal play begins."
  },
  {
    label: "Hidden",
    rule: "Players secretly pre-place stones before normal play begins; unique hidden stones remain hidden until revealed."
  },
  {
    label: "Tetris",
    rule: "A move is illegal only if it creates a connected group of exactly 4 stones."
  },
  {
    label: "N+1",
    rule: "Making exactly N stones in a row grants an extra turn."
  },
  {
    label: "Traitor",
    rule: "Some stones may play as another color instead of the player's normal color."
  }
];
function variantsHtml(game) {
  const rules = activeVariantRules(game);
  return rules.map(({ label, rule, html }) => html ?? `<span title="${escapeAttr(rule)}">${label}</span>`).join(", ") || "None";
}
function inviteRulesHtml(game) {
  const rules = activeVariantRules(game);
  if (rules.length === 0) return `<p class="muted-text">No active variants.</p>`;
  return `<ul>${rules.map(({ label, rule }) => `<li><strong>${label}:</strong> ${rule}</li>`).join("")}</ul>`;
}
function variantRulesHelpHtml(game) {
  return `
    <div class="variant-rules-help">
      <h4>Variant rules</h4>
      ${inviteRulesHtml(game)}
    </div>
  `;
}
function allVariantRulesHelpHtml() {
  return `
    <div class="variant-rules-help">
      <h3>Help</h3>
      <p>Create or join a game. In a game, this help button shows rules for active variants.</p>
      <h4>Variant rules</h4>
      ${ALL_VARIANT_RULES.map(({ label, rule }) => `<details><summary>${label}</summary><p>${rule}</p></details>`).join("")}
      <h4>Privacy, licensing, and acknowledgements</h4>
      <details>
        <summary>Privacy</summary>
        <p>We do not use analytics, ads, or behavioral tracking. We store only enough session/game data to connect players to games and seats.</p>
      </details>
      <details>
        <summary>Licensing and acknowledgements</summary>
        <p>Variant Go Server is released under the MIT License.</p>
        <p>Inspired by JaniM.</p>
        <p>Profanity word lists are vendored from <a href="https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words">LDNOOBW's bad-word lists</a>.</p>
      </details>
    </div>
  `;
}
function activeVariantRules(game) {
  const variants = game.config.variants ?? {};
  const rules = [];
  if (game.config.customGoban) {
    const rule = "This game uses a custom board shape.";
    rules.push({
      label: "CGoban",
      rule,
      html: `<button class="variant-button variant-meta-button" data-cgoban-preview title="${escapeAttr(rule)}" type="button">CGoban</button>`
    });
  }
  if (variants.capturesGivePoints) {
    rules.push({
      label: "Captures are points",
      rule: "Captures add points immediately."
    });
  }
  if (variants.ponnukiPointValue) {
    rules.push({
      label: `Ponnukis are ${variants.ponnukiPointValue} points`,
      rule: `Single-stone captures are worth ${variants.ponnukiPointValue} extra points.`
    });
  }
  if (variants.pixel) {
    rules.push({
      label: "Pixel",
      rule: "Each move places a 2\xD72 block where possible."
    });
  }
  if (variants.zen) {
    rules.push({
      label: `Zen (${variants.zenPlayerCount ?? 3} players)`,
      rule: `${variants.zenPlayerCount ?? 3} players; placed stone color alternates by move.`
    });
  }
  if (variants.colorGo) {
    rules.push({
      label: `Color (${variants.colorGoPlayerCount ?? 3} players)`,
      rule: `${variants.colorGoPlayerCount ?? 3} players, each with their own color and komi.`
    });
  }
  if (variants.phantomMove) {
    rules.push({
      label: `Phantom${variants.phantomHideViewers ? " (viewers hidden)" : ""}`,
      rule: `Stones start hidden; collisions, captures, atari, and scoring reveal them${variants.phantomHideViewers ? "; viewers cannot see hidden stones" : ""}.`
    });
  }
  if (variants.hiddenMove) {
    rules.push({
      label: "Hidden",
      rule: `${variants.hiddenMoveCount ?? 3} hidden stones per player before play starts; unique hidden stones remain hidden until revealed.`
    });
  }
  if (variants.josekiCard) {
    rules.push({
      label: "Joseki Card",
      rule: "Players select and place joseki cards in corners before normal play begins."
    });
  }
  if (variants.tetris) {
    rules.push({
      label: "Tetris",
      rule: "A move is illegal only if it creates a connected group of exactly 4 stones."
    });
  }
  if (variants.nPlusOne) {
    rules.push({
      label: `N+1 extra turn (${variants.nPlusOneCount ?? 1})`,
      rule: `Making exactly ${variants.nPlusOneCount ?? 1} in a row grants an extra turn.`
    });
  }
  if (variants.traitor) {
    rules.push({
      label: `Traitor moves (${variants.traitorStoneCount ?? 6})`,
      rule: `Some stones may play as another color (${variants.traitorStoneCount ?? 6} traitor moves).`
    });
  }
  return rules;
}
function escapeAttr(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

// client/game/display.ts
function winnerText(game) {
  const names = (game.winnerTeams ?? []).map((team) => {
    const seat = game.seats.find((seat2) => seat2.team === team);
    return escapeHtml(seat?.publicName ?? seat?.id ?? `Team ${team}`);
  });
  return names.length > 1 ? `Tie: ${names.join(", ")}` : names[0];
}
function scoringHelpHtml() {
  return `
    <div class="scoring-help">
      <h4>Scoring</h4>
      <p>After all players pass, mark dead stones, optionally mark no-score areas, then Done.</p>
      <p>Click stones to mark dead groups. Shift-click or right-click empty areas to mark no-score/seki.</p>
    </div>
  `;
}
function gameInfoHtml(game) {
  return `
    <div class="game-meta">
      <span><strong>Time Settings</strong>${timeSettingsText(game.config.time)}</span>
      <span><strong>Scoring</strong>${rulesText(game.config.ruleset)} \xB7 Komi ${game.config.komi ?? 7.5} \xB7 Handicap ${game.config.handicap ?? 0}</span>
      <span><strong>Board size</strong>${game.boardWidth} \xD7 ${game.boardHeight}</span>
      <span><strong>Variants</strong><span class="variant-meta-list">${variantsHtml(game)}</span></span>
    </div>
  `;
}
function activeStoneHtml(game, index) {
  if (!game.config.variants?.zen || index !== game.turn) return "";
  return `<i class="color-dot active-stone" data-team="${placementPreviewTeam(game)}" style="--stone-color: ${stoneColor(game, placementPreviewTeam(game))}"></i>`;
}
function seatDisplayTeam(game, seat) {
  return game.config.variants?.zen ? 0 : seat.team;
}
function stoneColor(game, team) {
  const color = game.config.variants?.colorGoColors?.[team - 1];
  if (color) return color;
  return team === 1 ? "#080808" : team === 2 ? "#eeeeee" : "#777777";
}
function placementPreviewTeam(game) {
  const activeTeam = game.seats[game.turn]?.team ?? 1;
  return game.config.variants?.zen ? (game.playMoves ?? 0) % 2 + 1 : activeTeam;
}
function seatMetaHtml(game, seat) {
  if (game.phase === "done" && game.winnerTeams?.includes(seat.team)) return "Winner!";
  const lines = [
    seatClockText(game, seat)
  ];
  if (game.config.variants?.traitor && game.config.variants?.showTraitorCounter) {
    const used = game.traitorStonesPlaced?.[seat.team - 1] ?? 0;
    const total = game.config.variants.traitorStoneCount ?? 6;
    lines.push(`TG: ${Math.max(0, total - used)}`);
  }
  return lines.join("<br />");
}
function viewersHtml(game) {
  return (game.users ?? []).map((user) => `<div class="user-row">${escapeHtml(user.name ?? short(user.uuid))}</div>`).join("") || `<p class="muted-text">None</p>`;
}
function seatClockText(game, seat) {
  const time = game.config.time;
  if (!time || time.system === "none" || game.config.variants?.zen) return "--:--";
  const seatTime = currentSeatTime(game, seat);
  const mainLeft = Number(seatTime.mainLeft ?? seatTime.main ?? time.main ?? 0);
  if (mainLeft > 0 || time.system === "fischer") return formatHms(mainLeft);
  if (time.system === "byoyomi") {
    const periodLeft = Number(seatTime.periodLeft ?? seatTime.periodTime ?? time.periodTime ?? 0);
    const periodsLeft = Number(seatTime.periodsLeft ?? seatTime.periods ?? time.periods ?? 0);
    return `${formatByoyomiTime(periodLeft)} x ${periodsLeft}`;
  }
  return "No time";
}
function currentSeatTime(game, seat) {
  const base = seat.time ?? seat.clock ?? {};
  const time = game.config.time ?? {};
  const display = {
    mainLeft: Number(base.mainLeft ?? base.main ?? time.main ?? 0),
    periodLeft: Number(base.periodLeft ?? base.periodTime ?? time.periodTime ?? 0),
    periodsLeft: Number(base.periodsLeft ?? base.periods ?? time.periods ?? 0)
  };
  if (game.phase !== "play" || game.seats[game.turn]?.team !== seat.team || game.clockUpdatedAt === void 0) return display;
  const secondsUntilLoss = time.system === "fischer" ? display.mainLeft : display.mainLeft + display.periodLeft + Math.max(0, display.periodsLeft - 1) * (time.periodTime ?? 0);
  if ((Date.now() - game.clockUpdatedAt) / 1e3 >= secondsUntilLoss + 1) {
    game.phase = "done";
    game.clockUpdatedAt = void 0;
    seat.resigned = true;
    return display;
  }
  let elapsed = Math.max(0, (Date.now() - game.clockUpdatedAt) / 1e3);
  const mainUsed = Math.min(display.mainLeft, elapsed);
  display.mainLeft = Math.max(0, display.mainLeft - mainUsed);
  elapsed -= mainUsed;
  if (time.system === "byoyomi" && display.mainLeft <= 0 && elapsed > 0) {
    const periodTime = time.periodTime || display.periodLeft || 1;
    const periodUsed = Math.min(display.periodLeft, elapsed);
    display.periodLeft = Math.max(0, display.periodLeft - periodUsed);
    elapsed -= periodUsed;
    if (elapsed > 0 && display.periodsLeft > 0) {
      const available = display.periodLeft + Math.max(0, display.periodsLeft - 1) * periodTime;
      const remaining = Math.max(0, available - elapsed);
      display.periodsLeft = remaining > 0 ? Math.ceil(remaining / periodTime) : 0;
      display.periodLeft = display.periodsLeft > 0 ? Math.max(0, remaining - (display.periodsLeft - 1) * periodTime) : 0;
    }
  }
  return display;
}

// client/game/board-utils.ts
function neighborIndexes(index, width, height) {
  const x = index % width;
  const y = Math.floor(index / width);
  const neighbors = [];
  if (x > 0) neighbors.push(index - 1);
  if (x < width - 1) neighbors.push(index + 1);
  if (y > 0) neighbors.push(index - width);
  if (y < height - 1) neighbors.push(index + width);
  return neighbors;
}
function isPlayableIntersection(game, x, y) {
  return x >= 0 && y >= 0 && x < game.boardWidth && y < game.boardHeight && game.board[y * game.boardWidth + x] !== -1;
}
function starPointCoords(width, height) {
  if (width !== height) return [];
  if (width === 9) {
    return [
      {
        x: 2,
        y: 2
      },
      {
        x: 6,
        y: 2
      },
      {
        x: 4,
        y: 4
      },
      {
        x: 2,
        y: 6
      },
      {
        x: 6,
        y: 6
      }
    ];
  }
  if (width === 13) return starGrid([
    3,
    6,
    9
  ]);
  if (width === 19) return starGrid([
    3,
    9,
    15
  ]);
  return [];
}
function pointPosition(game, index, edge = boardEdge(true, game.boardWidth, game.boardHeight)) {
  const x = index % game.boardWidth;
  const y = Math.floor(index / game.boardWidth);
  return {
    left: edge + x * boardStep(game.boardWidth, edge),
    top: edge + y * boardStep(game.boardHeight, edge)
  };
}
function boardEdge(showCoordinates2, width = 19, height = width) {
  const stoneSafeEdge = 50 / Math.max(1, Math.min(width, height));
  return showCoordinates2 ? Math.max(7, stoneSafeEdge + 4) : Math.max(3, stoneSafeEdge);
}
function boardStep(size, edge = boardEdge(true, size)) {
  return size <= 1 ? 0 : (100 - edge * 2) / (size - 1);
}
function pointLabel(game, index) {
  const x = index % game.boardWidth;
  const y = Math.floor(index / game.boardWidth);
  return `point ${x + 1}, ${y + 1}`;
}
function starGrid(values) {
  return values.flatMap((y) => values.map((x) => ({
    x,
    y
  })));
}

// client/game/board-render.ts
function setBoardPreview(board, game, event, showCoordinates2 = true) {
  const indexes = previewBoardIndexes(board, game, event, showCoordinates2);
  clearBoardPreview(board);
  for (const index of indexes) {
    board.querySelector(`.point[data-index='${index}']`)?.classList.add("is-preview");
  }
}
function clearBoardPreview(board) {
  for (const point of board?.querySelectorAll(".point.is-preview") ?? []) {
    point.classList.remove("is-preview");
  }
}
function previewBoardIndexes(board, game, event, showCoordinates2 = true) {
  const point = placementPointFromEvent(board, game, event, showCoordinates2);
  if (!point) return [];
  const points = game.config.variants?.pixel ? [
    point,
    {
      x: point.x + 1,
      y: point.y
    },
    {
      x: point.x,
      y: point.y + 1
    },
    {
      x: point.x + 1,
      y: point.y + 1
    }
  ] : [
    point
  ];
  return points.filter((point2) => point2.x >= 0 && point2.y >= 0 && point2.x < game.boardWidth && point2.y < game.boardHeight).map((point2) => point2.y * game.boardWidth + point2.x).filter((candidate) => game.board[candidate] === 0);
}
function placementPointFromEvent(board, game, event, showCoordinates2 = true) {
  const { gx, gy } = boardGridCoords(board, game, event, showCoordinates2);
  if (game.config.variants?.pixel) {
    const point2 = {
      x: Math.floor(gx),
      y: Math.floor(gy)
    };
    const hasBoardPoint = [
      point2,
      {
        x: point2.x + 1,
        y: point2.y
      },
      {
        x: point2.x,
        y: point2.y + 1
      },
      {
        x: point2.x + 1,
        y: point2.y + 1
      }
    ].some((candidate) => candidate.x >= 0 && candidate.y >= 0 && candidate.x < game.boardWidth && candidate.y < game.boardHeight && game.board[candidate.y * game.boardWidth + candidate.x] !== -1);
    return hasBoardPoint ? point2 : void 0;
  }
  const point = {
    x: Math.round(gx),
    y: Math.round(gy)
  };
  if (point.x < 0 || point.y < 0 || point.x >= game.boardWidth || point.y >= game.boardHeight) {
    return void 0;
  }
  if (game.board[point.y * game.boardWidth + point.x] === -1) return void 0;
  return point;
}
function boardGridCoords(board, game, event, showCoordinates2 = true) {
  const rect = board.getBoundingClientRect();
  const px = (event.clientX - rect.left) / rect.width * 100;
  const py = (event.clientY - rect.top) / rect.height * 100;
  const edge = boardEdge(showCoordinates2, game.boardWidth, game.boardHeight);
  return {
    gx: (px - edge) / boardStep(game.boardWidth, edge),
    gy: (py - edge) / boardStep(game.boardHeight, edge)
  };
}
function boardGridHtml(game, showCoordinates2 = true) {
  const letters = "ABCDEFGHJKLMNOPQRSTUVWXYZ";
  const edge = boardEdge(showCoordinates2, game.boardWidth, game.boardHeight);
  const stepX = boardStep(game.boardWidth, edge);
  const stepY = boardStep(game.boardHeight, edge);
  const lines = [];
  for (let y = 0; y < game.boardHeight; y++) {
    for (let x = 0; x < game.boardWidth; x++) {
      if (!isPlayableIntersection(game, x, y)) continue;
      const left = edge + x * stepX;
      const top = edge + y * stepY;
      if (isPlayableIntersection(game, x + 1, y)) {
        lines.push(`<i class="board-line board-line-h" style="left:${left}%;top:${top}%;inline-size:${stepX}%"></i>`);
      }
      if (isPlayableIntersection(game, x, y + 1)) {
        lines.push(`<i class="board-line board-line-v" style="left:${left}%;top:${top}%;block-size:${stepY}%"></i>`);
      }
    }
  }
  if (!showCoordinates2) return lines.join("");
  const horizontalCoords = Array.from({
    length: game.boardWidth
  }, (_, x) => {
    if (!Array.from({
      length: game.boardHeight
    }, (_2, y) => isPlayableIntersection(game, x, y)).some(Boolean)) return "";
    const left = edge + x * stepX;
    const label = letters[x] ?? x + 1;
    return `<span class="coord coord-top" style="left:${left}%">${label}</span><span class="coord coord-bottom" style="left:${left}%">${label}</span>`;
  }).join("");
  const verticalCoords = Array.from({
    length: game.boardHeight
  }, (_, y) => {
    if (!Array.from({
      length: game.boardWidth
    }, (_2, x) => isPlayableIntersection(game, x, y)).some(Boolean)) return "";
    const top = edge + y * stepY;
    const label = game.boardHeight - y;
    return `<span class="coord coord-left" style="top:${top}%">${label}</span><span class="coord coord-right" style="top:${top}%">${label}</span>`;
  }).join("");
  return `${lines.join("")}${horizontalCoords}${verticalCoords}`;
}
function starPointsHtml(game, showCoordinates2 = true) {
  const coords = starPointCoords(game.boardWidth, game.boardHeight).filter(({ x, y }) => isPlayableIntersection(game, x, y));
  const edge = boardEdge(showCoordinates2, game.boardWidth, game.boardHeight);
  return coords.map(({ x, y }) => {
    const left = edge + x * boardStep(game.boardWidth, edge);
    const top = edge + y * boardStep(game.boardHeight, edge);
    return `<i class="star-point" style="left:${left}%;top:${top}%"></i>`;
  }).join("");
}

// client/game/joseki-placement.ts
function josekiPlacementOverlay(game, boardColors, boardOpacity) {
  const placement = game.josekiSetup?.currentPlacement;
  if (game.phase !== "joseki" || !placement) {
    return {
      colors: boardColors,
      opacity: boardOpacity ?? Array(boardColors.length).fill(1)
    };
  }
  const card = game.josekiSetup?.availableCards.find((card2) => card2.id === placement.cardId);
  if (!card) {
    return {
      colors: boardColors,
      opacity: boardOpacity ?? Array(boardColors.length).fill(1)
    };
  }
  return injectJosekiCard(boardColors, boardOpacity, game.boardWidth, game.boardHeight, card, placement);
}
function hoverJosekiCardOnBoard(board, game, cardId) {
  clearJosekiCardHover(board);
  const card = game.josekiSetup?.availableCards.find((card2) => card2.id === cardId);
  if (!card) return;
  const placement = {
    cardId,
    corner: "upper-right",
    rotate: 0,
    flipX: false,
    swapColors: false
  };
  const overlay = injectJosekiCard(game.board, void 0, game.boardWidth, game.boardHeight, card, placement);
  overlay.colors.forEach((color, index) => {
    if (color === game.board[index]) return;
    const point = board.querySelector(`.point[data-index='${index}']`);
    if (!point) return;
    point.dataset.josekiPreview = "true";
    point.dataset.originalColor = point.dataset.color ?? "0";
    point.dataset.originalOpacity = point.style.getPropertyValue("--stone-opacity");
    point.dataset.color = String(color);
    point.style.setProperty("--stone-opacity", "1");
  });
}
function clearJosekiCardHover(board) {
  for (const point of board?.querySelectorAll(".point[data-joseki-preview='true']") ?? []) {
    point.dataset.color = point.dataset.originalColor ?? "0";
    if (point.dataset.originalOpacity) {
      point.style.setProperty("--stone-opacity", point.dataset.originalOpacity);
    } else point.style.removeProperty("--stone-opacity");
    delete point.dataset.josekiPreview;
    delete point.dataset.originalColor;
    delete point.dataset.originalOpacity;
  }
}
function injectJosekiCard(sourceBoard, sourceOpacity, width, height, card, placement) {
  const board2d = toBoard2d(sourceBoard, width, height);
  const opacity2d = toBoard2d(sourceOpacity ?? Array(sourceBoard.length).fill(1), width, height);
  for (const stone of transformJosekiCard(card, placement)) {
    if (stone.x < 0 || stone.y < 0 || stone.x >= width || stone.y >= height) continue;
    if (board2d[stone.y][stone.x] !== 0) continue;
    board2d[stone.y][stone.x] = stone.color;
    opacity2d[stone.y][stone.x] = 0.55;
  }
  return {
    colors: board2d.flat(),
    opacity: opacity2d.flat()
  };
}
function toBoard2d(values, width, height) {
  return Array.from({
    length: height
  }, (_, y) => values.slice(y * width, y * width + width));
}
function transformJosekiCard(card, placement) {
  const local = card.stones.map((stone) => ({
    ...stone,
    x: card.boardSize - 1 - stone.x,
    y: stone.y
  }));
  const box = bounds(local);
  return local.map((stone) => anchorLocalToCorner({
    ...transformLocalStone(stone, placement, box.width, box.height),
    color: transformedColor(stone.color, placement)
  }, card.boardSize, placement.corner));
}
function transformLocalStone(stone, placement, width, height) {
  let next = {
    ...stone
  };
  if (placement.flipX) next = {
    ...next,
    x: next.y,
    y: next.x
  };
  const rotate = placement.flipX ? 0 : placement.rotate ?? 0;
  if (rotate === 90) next = {
    ...next,
    x: next.y,
    y: width - 1 - next.x
  };
  else if (rotate === 180) next = {
    ...next,
    x: width - 1 - next.x,
    y: height - 1 - next.y
  };
  else if (rotate === 270) next = {
    ...next,
    x: height - 1 - next.y,
    y: next.x
  };
  return next;
}
function transformedColor(color, placement) {
  return placement.swapColors && (color === 1 || color === 2) ? color === 1 ? 2 : 1 : color;
}
function anchorLocalToCorner(stone, boardSize, corner) {
  if (corner === "upper-left") return stone;
  if (corner === "upper-right") return {
    ...stone,
    x: boardSize - 1 - stone.x
  };
  if (corner === "lower-left") return {
    ...stone,
    y: boardSize - 1 - stone.y
  };
  return {
    ...stone,
    x: boardSize - 1 - stone.x,
    y: boardSize - 1 - stone.y
  };
}
function bounds(stones) {
  if (stones.length === 0) return {
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
    width: 0,
    height: 0
  };
  const xs = stones.map((stone) => stone.x);
  const ys = stones.map((stone) => stone.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

// client/game/history-controls.ts
function bindHistoryKeyboardControls(game, historyIndex, latestHistoryIndex, controller, canNavigate, navigate) {
  controller?.abort();
  if (!canNavigate(game)) return void 0;
  const nextController = new AbortController();
  document.addEventListener("keydown", (event) => {
    if (!matchMedia("(min-width: 760px)").matches) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (isEditableKeyTarget(event.target)) return;
    const action = historyActionFromKey(event.key);
    if (!action) return;
    event.preventDefault();
    navigate(game, historyIndex, latestHistoryIndex, action);
  }, {
    signal: nextController.signal
  });
  return nextController;
}
function historyActionFromKey(key) {
  if (key === "ArrowLeft") return "prev";
  if (key === "ArrowRight") return "next";
  if (key === "ArrowUp") return "first";
  if (key === "ArrowDown") return "latest";
  return void 0;
}
function isEditableKeyTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, select, textarea, [contenteditable='true']"));
}

// client/game/events.ts
function bindGameEvents(options) {
  bindPlayersToggle(options.panel);
  bindInfoDialog(options.panel);
  bindCustomGobanPreview(options);
  bindBoard(options);
  bindJosekiSetup(options);
  bindActionButtons(options);
  bindHistoryButtons(options);
  const historyKeyController2 = bindHistoryKeyboardControls(options.game, options.historyIndex, options.latestHistoryIndex, options.historyKeyController, options.canNavigateGameHistory, options.navigateGameHistory);
  bindSeats(options);
  return historyKeyController2;
}
function bindPlayersToggle(panel2) {
  const playersToggle = panel2.querySelector(".players-toggle");
  const seats = panel2.querySelector(".seats");
  playersToggle?.addEventListener("click", () => {
    const expanded = playersToggle.getAttribute("aria-expanded") === "true";
    playersToggle.setAttribute("aria-expanded", String(!expanded));
    if (seats) seats.hidden = expanded;
  });
}
function bindInfoDialog(panel2) {
  const infoDialog = panel2.querySelector(".game-info-dialog");
  panel2.querySelector(".game-info-toggle")?.addEventListener("click", () => infoDialog?.showModal());
  infoDialog?.querySelector(".dialog-close")?.addEventListener("click", () => infoDialog.close());
}
function bindCustomGobanPreview({ panel: panel2, game, statusElement: statusElement2 }) {
  for (const link of panel2.querySelectorAll("[data-cgoban-preview]")) {
    link.addEventListener("click", () => openCustomGobanPreview(game.config.customGoban, statusElement2));
    link.addEventListener("keydown", (event) => {
      const key = event.key;
      if (key !== "Enter" && key !== " ") return;
      event.preventDefault();
      openCustomGobanPreview(game.config.customGoban, statusElement2);
    });
  }
}
function bindBoard(options) {
  const { panel: panel2, game, session: session2, boardColors, viewingHistory, sendAction: sendAction2, showCoordinates: showCoordinates2 } = options;
  const board = panel2.querySelector(".board");
  let activePointerId;
  let josekiHoverCorner = game.josekiSetup?.currentPlacement?.corner;
  board?.addEventListener("contextmenu", (event) => event.preventDefault());
  board?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    activePointerId = event.pointerId;
    board.setPointerCapture(event.pointerId);
    setBoardPreview(board, game, event, showCoordinates2);
  });
  board?.addEventListener("pointermove", (event) => {
    if (game.phase === "joseki" && game.josekiSetup?.phase === "place") {
      const nextCorner = josekiCornerFromEvent(board, event);
      if (game.josekiSetup.placedCorners.includes(nextCorner)) return;
      if (nextCorner !== josekiHoverCorner) {
        josekiHoverCorner = nextCorner;
        const placement = game.josekiSetup.currentPlacement;
        if (placement) {
          void sendAction2(game.id, withCurrentSeat(game, session2, {
            type: "updateJosekiPlacement",
            placement: {
              ...placement,
              corner: nextCorner
            }
          }));
        }
      }
      return;
    }
    if (activePointerId !== event.pointerId) {
      if (activePointerId === void 0 && event.pointerType === "mouse") {
        setBoardPreview(board, game, event, showCoordinates2);
      }
      return;
    }
    event.preventDefault();
    setBoardPreview(board, game, event, showCoordinates2);
  });
  board?.addEventListener("pointerleave", () => {
    if (activePointerId === void 0) clearBoardPreview(board);
  });
  board?.addEventListener("pointercancel", () => {
    activePointerId = void 0;
    clearBoardPreview(board);
  });
  board?.addEventListener("pointerup", async (event) => {
    if (activePointerId !== event.pointerId) return;
    event.preventDefault();
    activePointerId = void 0;
    const point = placementPointFromEvent(board, game, event, showCoordinates2);
    clearBoardPreview(board);
    if (!point || viewingHistory || game.phase === "joseki") return;
    if (game.phase === "hidden") {
      await sendAction2(game.id, withCurrentSeat(game, session2, {
        type: "placeHidden",
        x: point.x,
        y: point.y
      }));
    } else if (game.phase === "scoring") {
      if (!currentActionSeat(game, session2, "scoring")) return;
      const pointIndex = point.y * game.boardWidth + point.x;
      if (boardColors[pointIndex] === -1) return;
      const actionType = event.shiftKey || event.button === 2 || boardColors[pointIndex] === 0 ? "toggleNoScore" : "toggleDead";
      await sendAction2(game.id, withCurrentSeat(game, session2, {
        type: actionType,
        x: point.x,
        y: point.y
      }));
    } else if (game.phase === "play") {
      await sendAction2(game.id, withCurrentSeat(game, session2, {
        type: "place",
        x: point.x,
        y: point.y
      }));
    }
  });
}
function isJosekiCorner(value) {
  return value === "upper-left" || value === "upper-right" || value === "lower-left" || value === "lower-right";
}
function josekiCornerFromEvent(board, event) {
  const rect = board.getBoundingClientRect();
  const left = event.clientX < rect.left + rect.width / 2;
  const upper = event.clientY < rect.top + rect.height / 2;
  if (upper && left) return "upper-left";
  if (upper) return "upper-right";
  return left ? "lower-left" : "lower-right";
}
function bindJosekiSetup({ panel: panel2, game, session: session2, sendAction: sendAction2 }) {
  const ownedSeatIds = new Set(game.seats.filter((seat) => seat.playerUuid === session2?.uuid).map((seat) => seat.id));
  const ownedSetups = game.josekiSetup?.seats.filter((entry) => ownedSeatIds.has(entry.seatId)) ?? [];
  const requiredCount = Math.max(2, ownedSetups.length * 2);
  const board = panel2.querySelector(".board");
  const selectionDialog = panel2.querySelector("[data-joseki-selection-dialog]");
  panel2.querySelector("[data-joseki-selection-open]")?.addEventListener("click", () => selectionDialog?.showModal());
  selectionDialog?.querySelector("[data-joseki-selection-close]")?.addEventListener("click", () => selectionDialog.close());
  if (selectionDialog && ownedSetups.length > 0 && game.josekiSetup?.phase === "select") {
    try {
      if (!selectionDialog.open) selectionDialog.showModal();
    } catch {
      selectionDialog.setAttribute("open", "");
    }
  }
  for (const button of panel2.querySelectorAll("[data-joseki-card-id]")) {
    button.addEventListener("pointerenter", () => {
      if (board && button.dataset.josekiCardId) {
        hoverJosekiCardOnBoard(board, game, button.dataset.josekiCardId);
      }
    });
    button.addEventListener("pointerleave", () => clearJosekiCardHover(board));
    button.addEventListener("click", async () => {
      const id = button.dataset.josekiCardId;
      if (!id || ownedSetups.length === 0) return;
      const selected = new Set(ownedSetups.flatMap((entry) => entry.selectedCardIds));
      if (selected.has(id)) selected.delete(id);
      else if (selected.size < requiredCount) selected.add(id);
      await sendAction2(game.id, withCurrentSeat(game, session2, {
        type: "selectJosekiCards",
        cardIds: [
          ...selected
        ]
      }));
    });
  }
  panel2.querySelector("[data-joseki-selection-confirm]")?.addEventListener("click", async () => {
    await sendAction2(game.id, withCurrentSeat(game, session2, {
      type: "confirmJosekiSelection"
    }));
  });
  for (const button of panel2.querySelectorAll("[data-joseki-corner]")) {
    button.addEventListener("click", async () => {
      const placement = game.josekiSetup?.currentPlacement;
      const corner = button.dataset.josekiCorner;
      if (!placement || !isJosekiCorner(corner)) return;
      await sendAction2(game.id, withCurrentSeat(game, session2, {
        type: "updateJosekiPlacement",
        placement: {
          ...placement,
          corner
        }
      }));
    });
  }
  for (const button of panel2.querySelectorAll("[data-joseki-placement]")) {
    button.addEventListener("click", async () => {
      const placement = game.josekiSetup?.currentPlacement;
      if (!placement) return;
      const action = button.dataset.josekiPlacement;
      if (action === "confirm") {
        await sendAction2(game.id, withCurrentSeat(game, session2, {
          type: "confirmJosekiPlacement"
        }));
        return;
      }
      const next = {
        ...placement
      };
      if (action === "swap") next.swapColors = !next.swapColors;
      if (action === "flip") {
        next.flipX = !next.flipX;
        next.rotate = 0;
      }
      await sendAction2(game.id, withCurrentSeat(game, session2, {
        type: "updateJosekiPlacement",
        placement: next
      }));
    });
  }
}
function bindActionButtons({ panel: panel2, game, session: session2, sendAction: sendAction2, toggleCoordinates: toggleCoordinates2 }) {
  panel2.querySelector("[data-toggle-coordinates]")?.addEventListener("click", toggleCoordinates2);
  for (const button of panel2.querySelectorAll("[data-action]")) {
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      const type = button.dataset.action;
      if (!type) return;
      await sendAction2(game.id, withCurrentSeat(game, session2, {
        type
      }));
    });
  }
}
function bindHistoryButtons({ panel: panel2, game, historyIndex, latestHistoryIndex, navigateGameHistory: navigateGameHistory2 }) {
  for (const button of panel2.querySelectorAll("[data-history]")) {
    button.addEventListener("click", () => navigateGameHistory2(game, historyIndex, latestHistoryIndex, button.dataset.history ?? "latest"));
  }
}
function bindSeats({ panel: panel2, game, statusElement: statusElement2, renderGameList: renderGameList3, showGame: showGame2 }) {
  for (const button of panel2.querySelectorAll(".seat[data-open='true']")) {
    const handleJoinSeat = async (event) => {
      if (event.target?.closest(".seat-action")) return;
      const seatId = button.dataset.seatId;
      if (!seatId) return;
      const response = await joinSeat(game.id, seatId);
      if (!response.ok) return;
      await Promise.all([
        renderGameList3(),
        showGame2(game.id)
      ]);
    };
    button.addEventListener("click", handleJoinSeat);
    button.addEventListener("keydown", async (event) => {
      const key = event.key;
      if (key !== "Enter" && key !== " ") return;
      event.preventDefault();
      await handleJoinSeat(event);
    });
  }
  for (const button of panel2.querySelectorAll(".seat-action")) {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const seatId = button.dataset.seatId;
      if (button.dataset.action === "join") {
        if (!seatId) return;
        const response = await joinSeat(game.id, seatId);
        if (!response.ok) return;
        await Promise.all([
          renderGameList3(),
          showGame2(game.id)
        ]);
        return;
      }
      if (button.dataset.action === "invite") {
        await copyText(`${location.origin}/game/${game.id}#${encodeURIComponent(seatId ?? "")}`, button, statusElement2, "Copied");
        return;
      }
      if (!seatId) return;
      await leaveSeat(game.id, seatId);
      await Promise.all([
        renderGameList3(),
        showGame2(game.id)
      ]);
    });
  }
}

// client/game/seats-render.ts
function teamSeatsHtml(game, session2) {
  if (game.config.variants?.zen) {
    return `
      <div class="team-seat-box" data-team="zen">
        <div class="team-seat-list">
          ${game.seats.map((seat, index) => playerSeatHtml(game, seat, index, session2)).join("")}
        </div>
      </div>
    `;
  }
  const teams = [
    ...new Set(game.seats.map((seat) => seat.team))
  ];
  return teams.map((team) => {
    const seats = game.seats.map((seat, index) => ({
      seat,
      index
    })).filter(({ seat }) => seat.team === team);
    return `
      <div class="team-seat-box" data-team="${team}">
        <div class="team-seat-list">
          ${seats.map(({ seat, index }) => playerSeatHtml(game, seat, index, session2)).join("")}
        </div>
      </div>
    `;
  }).join("");
}
function playerSeatHtml(game, seat, index, session2) {
  const active = index === game.turn ? "\u25B6" : "";
  const player = seat.playerUuid ? escapeHtml(seat.publicName ?? short(seat.playerUuid)) : "open";
  const action = seat.playerUuid === session2?.uuid ? `<button class="seat-action" data-action="leave" data-seat-id="${seat.id}" type="button">Leave</button>` : !seat.playerUuid ? `<span class="seat-actions"><button class="seat-action" data-action="join" data-seat-id="${seat.id}" type="button">Join</button><button class="seat-action" data-action="invite" data-seat-id="${seat.id}" type="button">Invite</button></span>` : "";
  const open = !seat.playerUuid;
  return `
    <div class="seat" data-seat-id="${seat.id}" data-open="${open}" ${open ? 'role="button" tabindex="0"' : 'aria-disabled="true"'}>
      <div class="seat-player"><i class="turn-marker">${active}</i>${activeStoneHtml(game, index)}<i class="color-dot" data-team="${seatDisplayTeam(game, seat)}" style="--stone-color: ${stoneColor(game, seat.team)}"></i>${player}</div>
      ${action}
      <div class="seat-time">${seatMetaHtml(game, seat)}</div>
      <div class="seat-points">${game.points[seat.team - 1] ?? 0} pts</div>
    </div>
  `;
}

// client/game/territory.ts
function territoryShadeHtml(game, boardColors, edge) {
  if (game.phase !== "scoring" && game.phase !== "done") return "";
  return territoryShadeIndexes(game, boardColors).map(({ index, team }) => {
    const point = pointPosition(game, index, edge);
    return `<i class="territory-shade" aria-hidden="true" style="left: ${point.left}%; top: ${point.top}%; --territory-color: ${stoneColor(game, team)}"></i>`;
  }).join("");
}
function territoryShadeIndexes(game, boardColors) {
  const width = game.boardWidth;
  const height = game.boardHeight;
  const dead = game.deadStones ?? [];
  const visited = /* @__PURE__ */ new Set();
  const shaded = [];
  const noScore = game.noScorePoints ?? [];
  const isTerritoryPoint = (index) => (boardColors[index] === 0 || dead[index]) && !noScore[index];
  const isLiveStone = (index) => boardColors[index] > 0 && !dead[index];
  for (let index = 0; index < boardColors.length; index++) {
    if (visited.has(index) || !isTerritoryPoint(index)) continue;
    const region = [];
    const borderingTeams = /* @__PURE__ */ new Set();
    const stack = [
      index
    ];
    visited.add(index);
    while (stack.length > 0) {
      const current = stack.pop();
      region.push(current);
      for (const neighbor of neighborIndexes(current, width, height)) {
        if (boardColors[neighbor] === -1) continue;
        if (isLiveStone(neighbor)) borderingTeams.add(boardColors[neighbor]);
        else if (isTerritoryPoint(neighbor) && !visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    if (borderingTeams.size !== 1) continue;
    const [team] = borderingTeams;
    for (const pointIndex of region) shaded.push({
      index: pointIndex,
      team
    });
  }
  return shaded;
}

// client/game/render.ts
function gameViewHtml(context) {
  const { game, session: session2, boardColors, boardOpacity, canNavigateHistory, visualHistoryIndex, playableHistoryIndex, playableHistoryCount, viewingHistory, passOrDoneDisabled, canUsePlayActions, canUndo, canResign, showCoordinates: showCoordinates2 } = context;
  const edge = boardEdge(showCoordinates2, game.boardWidth, game.boardHeight);
  const overlay = josekiPlacementOverlay(game, boardColors, boardOpacity);
  return `
    <div class="game-title-row">
      <h2>${escapeHtml(game.config.name || `Game #${game.id}`)}</h2>
      <div class="game-title-actions ui-cluster">
        <button class="game-info-toggle" type="button" aria-label="Show game info">?</button>
      </div>
    </div>
    <dialog class="ui-dialog game-info-dialog">
      <button class="dialog-close" type="button" aria-label="Close">\xD7</button>
      ${gameInfoHtml(game)}
      ${variantRulesHelpHtml(game)}
      ${scoringHelpHtml()}
    </dialog>
    <div class="game-view">
      <section class="board-panel" aria-label="Board">
        <div class="board" data-preview-team="${placementPreviewTeam(game)}" data-coordinates="${showCoordinates2}" style="--board-step: ${boardStep(game.boardWidth, edge)}%; --preview-color: ${stoneColor(game, placementPreviewTeam(game))}">
          ${boardGridHtml(game, showCoordinates2)}
          ${starPointsHtml(game, showCoordinates2)}
          ${territoryShadeHtml(game, overlay.colors, edge)}
          ${boardPointsHtml(game, overlay.colors, overlay.opacity, edge)}
        </div>
      </section>
      <section class="players-panel ui-stack" aria-label="Players and seats">
        <button class="players-toggle players-panel__toggle" type="button" aria-expanded="false">Players</button>
        <div class="history-actions players-panel__review" ${canNavigateHistory ? "" : "hidden"}>
          <button class="history-edge" data-history="first" ${visualHistoryIndex <= 0 ? "disabled" : ""}>First</button>
          <button data-history="prev" ${visualHistoryIndex <= 0 ? "disabled" : ""} aria-label="Previous">\u2190</button>
          <span>${playableHistoryIndex} / ${playableHistoryCount}</span>
          <button data-history="next" ${!viewingHistory ? "disabled" : ""} aria-label="Next">\u2192</button>
          <button class="history-edge" data-history="latest" ${!viewingHistory ? "disabled" : ""}>Last</button>
        </div>
        ${josekiSetupHtml(game, session2)}
        ${hiddenSetupHtml(game, session2)}
        <div class="seats players-panel__seats" hidden>
          ${teamSeatsHtml(game, session2)}
        </div>
        <div class="actions players-panel__actions" ${game.phase === "done" || game.phase === "hidden" || viewingHistory || !game.seats.every((seat) => seat.playerUuid) || (game.phase === "scoring" ? passOrDoneDisabled : !canUsePlayActions) ? "hidden" : ""}>
          <button data-action="${game.phase === "scoring" ? "acceptScore" : "pass"}" ${passOrDoneDisabled ? "disabled" : ""}>${game.phase === "scoring" ? "Done" : "Pass"}</button>
          <button data-action="cancel" ${!canUndo ? "disabled" : ""}>Undo</button>
          <button data-action="resign" ${!canResign ? "disabled" : ""}>Resign</button>
        </div>
        <div class="players-panel__metadata">${gameInfoHtml(game)}</div>
      </section>
      <div class="panel-divider" aria-hidden="true"></div>
      <section class="users-panel ui-stack" aria-label="Users">
        <h3>Users</h3>
        <div class="user-list">
          <h4>Users</h4>
          ${viewersHtml(game)}
        </div>
      </section>
    </div>
  `;
}
function hiddenSetupHtml(game, session2) {
  const setup = game.hiddenSetup;
  if (game.phase !== "hidden" || !setup) return "";
  const ownedSeatIds = new Set(game.seats.filter((seat) => seat.playerUuid === session2?.uuid).map((seat) => seat.id));
  const owned = setup.seats.filter((entry) => ownedSeatIds.has(entry.seatId));
  const placed = owned.reduce((total, entry) => total + (entry.placements?.length ?? entry.points.length), 0);
  const required = owned.length * setup.stonesPerPlayer;
  return `
    <div class="joseki-setup-panel players-panel__actions">
      <strong>Hidden setup</strong>
      <p class="muted-text">Place ${setup.stonesPerPlayer} hidden stones per seat before play starts.</p>
      <p>${placed} / ${required} placed</p>
    </div>
  `;
}
function josekiSetupHtml(game, session2) {
  const setup = game.josekiSetup;
  if (game.phase !== "joseki" || !setup) return "";
  const seat = game.seats.find((seat2) => seat2.playerUuid === session2?.uuid);
  const ownedSeatIds = new Set(game.seats.filter((seat2) => seat2.playerUuid === session2?.uuid).map((seat2) => seat2.id));
  const ownedSetups = setup.seats.filter((entry) => ownedSeatIds.has(entry.seatId));
  if (setup.phase === "select") {
    const selected = new Set(ownedSetups.flatMap((entry) => entry.selectedCardIds));
    const requiredCount = Math.max(2, ownedSetups.length * 2);
    const seconds = Math.max(0, Math.ceil((setup.selectionDeadlineAt - Date.now()) / 1e3));
    const canSelect = ownedSetups.length > 0;
    const pickText = requiredCount === 2 ? "Pick 2 joseki cards" : `Pick ${requiredCount} joseki cards`;
    return `
      <div class="joseki-selection-notice players-panel__setup">
        <strong>${canSelect ? pickText : "Joseki card selection"}</strong>
        <p class="muted-text">${canSelect ? `${pickText} before play starts. Selection closes in ${seconds}s.` : `Waiting for players to pick joseki cards. Selection closes in ${seconds}s.`}</p>
        <p>${selected.size} / ${requiredCount} selected</p>
        <button data-joseki-selection-open type="button" ${canSelect ? "" : "disabled"}>Choose cards</button>
      </div>
      <dialog class="ui-dialog ui-scroll joseki-selection-dialog" data-joseki-selection-dialog>
        <button class="dialog-close" data-joseki-selection-close type="button" aria-label="Close">\xD7</button>
        <h3>${pickText}</h3>
        <p class="muted-text">Select exactly ${requiredCount} card${requiredCount === 1 ? "" : "s"}. Your selected cards are highlighted.</p>
        <p>${selected.size} / ${requiredCount} selected \xB7 ${seconds}s remaining</p>
        ${josekiCardGridHtml(setup.availableCards, selected)}
        <div class="actions joseki-selection-actions">
          <button data-joseki-selection-confirm type="button" ${selected.size === requiredCount ? "" : "disabled"}>Confirm selection</button>
        </div>
      </dialog>
    `;
  }
  const activeSeatId = setup.placementOrder[setup.placementIndex];
  const activeSeat = game.seats.find((seat2) => seat2.id === activeSeatId);
  const canPlace = activeSeat?.playerUuid === session2?.uuid;
  const placement = setup.currentPlacement;
  const cornerButton = (label, corner) => `<button data-joseki-corner="${corner}" type="button" ${canPlace && !setup.placedCorners.includes(corner) ? "" : "disabled"}>${label}</button>`;
  return `
    <div class="joseki-setup players-panel__setup">
      <strong>${canPlace ? "Place joseki" : "Waiting for joseki placement"}</strong>
      <span>${placement?.cardId ?? ""}</span>
      <div class="actions joseki-corner-actions">
        ${cornerButton("TL", "upper-left")}
        ${cornerButton("TR", "upper-right")}
        ${cornerButton("BR", "lower-right")}
        ${cornerButton("BL", "lower-left")}
      </div>
      <div class="actions">
        <button data-joseki-placement="swap" type="button" ${canPlace ? "" : "disabled"}>Swap</button>
        <button data-joseki-placement="flip" type="button" ${canPlace ? "" : "disabled"}>Flip</button>
        <button data-joseki-placement="confirm" type="button" ${canPlace ? "" : "disabled"}>Confirm</button>
      </div>
    </div>
  `;
}
function boardPointsHtml(game, boardColors, boardOpacity, edge) {
  return boardColors.map((color, index) => {
    const point = pointPosition(game, index, edge);
    const opacity = boardOpacity?.[index] ?? 1;
    const renderColor = color === 99 ? 3 : color;
    return `<button class="point ${game.deadStones?.[index] ? "is-dead" : ""} ${game.noScorePoints?.[index] ? "is-no-score" : ""}" aria-label="${pointLabel(game, index)}" data-index="${index}" data-color="${renderColor}" ${color === -1 ? "disabled" : ""} style="left: ${point.left}%; top: ${point.top}%; --stone-color: ${stoneColor(game, color)}; --stone-opacity: ${opacity}"></button>`;
  }).join("");
}

// client/ui/layout.ts
function updateGameListHeight(listElement2) {
  if (!listElement2) return;
  if (!matchMedia("(min-width: 760px)").matches) {
    listElement2.style.removeProperty("height");
    return;
  }
  const bottomPadding = 16;
  const top = listElement2.getBoundingClientRect().top;
  const height = Math.max(0, window.innerHeight - top - bottomPadding);
  listElement2.style.height = `${height}px`;
}
function updateGameLayoutMode(shell2) {
  if (!shell2) return;
  if (!shell2.classList.contains("game-layout")) {
    shell2.classList.remove("desktop-fit");
    return;
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  const boardSize = Math.max(240, Math.min(width - 8, height - 224));
  const rightPanels = 16 * 16 + 1 + 14 * 16 + 48;
  shell2.classList.toggle("desktop-fit", width >= 760 && width >= boardSize + rightPanels + 24);
}

// client/game/list.ts
async function renderGameList(listElement2, showGame2) {
  if (!listElement2) return;
  const response = await listGames();
  if (!response.ok) {
    listElement2.textContent = "Could not load games.";
    return;
  }
  const { games } = await readGameList(response);
  if (games.length === 0) {
    listElement2.innerHTML = `<p class="muted-text">No games yet.</p>`;
    return;
  }
  if (matchMedia("(min-width: 760px)").matches) {
    listElement2.closest("details")?.setAttribute("open", "");
  }
  listElement2.innerHTML = games.map((game) => gameListItemHtml(game)).join("");
  updateGameListHeight(listElement2);
  for (const link of listElement2.querySelectorAll(".game-list-item")) {
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      history.pushState(null, "", link.href);
      await showGame2(link.dataset.gameId);
    });
  }
}
function startGameListRefresh(currentEvents, setEvents, render, restart) {
  if (currentEvents) return;
  const events = new EventSource("/api/games/events");
  setEvents(events);
  events.addEventListener("games_changed", () => render());
  events.addEventListener("error", () => {
    events.close();
    setEvents(void 0);
    setTimeout(restart, 1e3);
  });
  addEventListener("focus", () => render());
}
function gameListItemHtml(game) {
  const label = game.config?.name || `Game #${game.id}`;
  return `<a class="game-list-item" href="/game/${game.id}" data-game-id="${game.id}">${escapeHtml(label)}</a>`;
}

// client/game/history.ts
function visualHistoryEntries(history2) {
  const lastHiddenIndex = history2.reduce((last, entry, index) => entry?.action === "placeHidden" ? index : last, -1);
  return history2.map((entry, index) => ({
    entry,
    index
  })).filter(({ entry, index }) => {
    if (entry?.action === "place") return true;
    if (lastHiddenIndex >= 0) return index === lastHiddenIndex;
    return index === 0;
  });
}
function canNavigateGameHistory(game, session2) {
  const isPlayer = game.seats.some((seat) => seat.playerUuid === session2?.uuid);
  return game.phase === "done" || !isPlayer;
}
function nextHistoryIndex(history2, historyIndex, latestHistoryIndex, action) {
  const visualHistory = visualHistoryEntries(history2);
  const viewingHistory = historyIndex !== latestHistoryIndex;
  const currentVisualIndex = viewingHistory ? visualHistory.findIndex((entry) => entry.index === historyIndex) : visualHistory.length;
  if (action === "first") return visualHistory[0]?.index ?? latestHistoryIndex;
  if (action === "prev") {
    return visualHistory[Math.max(0, currentVisualIndex - 1)]?.index ?? latestHistoryIndex;
  }
  if (action === "next") {
    return currentVisualIndex >= visualHistory.length - 1 ? latestHistoryIndex : visualHistory[currentVisualIndex + 1]?.index ?? latestHistoryIndex;
  }
  return latestHistoryIndex;
}

// client/game/history-view.ts
function gameHistoryView(game, session2, historyViewByGame2) {
  const rawHistory = game.history ?? [];
  const visualHistory = visualHistoryEntries(rawHistory);
  const latestHistoryIndex = Math.max(0, rawHistory.length - 1);
  const requestedHistoryIndex = historyViewByGame2.get(game.id) ?? latestHistoryIndex;
  const historyIndex = Math.min(requestedHistoryIndex, latestHistoryIndex);
  if (historyIndex === latestHistoryIndex) historyViewByGame2.delete(game.id);
  else historyViewByGame2.set(game.id, historyIndex);
  const viewingHistory = historyIndex !== latestHistoryIndex;
  const historyEntry = rawHistory[historyIndex];
  const boardColors = viewingHistory ? historyEntry?.board ?? game.board : game.board;
  const boardOpacity = viewingHistory ? historyEntry?.boardOpacity : game.boardOpacity;
  const visualHistoryIndex = viewingHistory ? Math.max(0, visualHistory.findIndex((entry) => entry.index === historyIndex)) : visualHistory.length;
  const hiddenSetupOffset = visualHistory[0]?.entry.action === "placeHidden" ? 1 : 0;
  const playableHistoryCount = Math.max(0, visualHistory.length - hiddenSetupOffset);
  const playableHistoryIndex = viewingHistory ? Math.max(0, visualHistoryIndex + 1 - hiddenSetupOffset) : playableHistoryCount;
  const canNavigateHistory = canNavigateGameHistory(game, session2);
  const allSeatsFilled = game.seats.every((seat) => Boolean(seat.playerUuid));
  const currentSeat = currentActionSeat(game, session2);
  const canUsePlayActions = allSeatsFilled && !viewingHistory && game.phase === "play" && Boolean(currentSeat && !currentSeat.resigned);
  const canAcceptScore = allSeatsFilled && !viewingHistory && game.phase === "scoring" && Boolean(currentActionSeat(game, session2, "scoring"));
  const canUndo = canUsePlayActions && rawHistory.length >= 2 && rawHistory.at(-2)?.phase === "play";
  const canResign = canUsePlayActions;
  const passOrDoneDisabled = game.phase === "scoring" ? !canAcceptScore : !canUsePlayActions;
  return {
    rawHistory,
    visualHistory,
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
    passOrDoneDisabled
  };
}

// client/game/invite.ts
function openJoinedRulesDialog(game) {
  const rulesHtml = inviteRulesHtml(game);
  if (rulesHtml === "<ul></ul>") return;
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog invite-dialog";
  dialog.innerHTML = `
    <button class="dialog-close" type="button" aria-label="Close">\xD7</button>
    <h3>Variant rules</h3>
    <div class="invite-rules">${rulesHtml}</div>
  `;
  document.body.append(dialog);
  dialog.querySelector(".dialog-close")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}
async function maybeJoinHashSeat(game, renderGame2, showGame2) {
  const seatId = decodeURIComponent(location.hash.slice(1));
  if (!seatId) return;
  const seat = game.seats.find((candidate) => candidate.id === seatId);
  if (!seat || seat.playerUuid) return;
  const response = await joinSeat(game.id, seatId);
  if (!response.ok) return;
  history.replaceState(null, "", `/game/${game.id}`);
  await showGame2(game.id);
  renderGame2(game);
  openJoinedRulesDialog(game);
}

// client/game/realtime.ts
function connectGameSocket(gameId, socketState2, renderGame2, renderGameList3, reconnect) {
  if (socketState2.gameId === gameId && socketState2.socket?.readyState === WebSocket.OPEN) return;
  socketState2.socket?.close();
  socketState2.gameId = gameId;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${location.host}/api/games/${gameId}/ws`);
  socketState2.socket = socket;
  socket.addEventListener("message", async (event) => {
    const message = JSON.parse(String(event.data));
    if (message.type === "snapshot" && message.game) {
      renderGame2(message.game);
      await renderGameList3();
    } else if (message.type === "action_error" && message.error) {
      const status = document.querySelector("#status");
      if (status) status.textContent = message.error;
    }
  });
  socket.addEventListener("close", () => {
    if (socketState2.gameId === gameId) setTimeout(() => reconnect(gameId), 1e3);
  });
}
function disconnectGameSocket(socketState2) {
  socketState2.gameId = void 0;
  socketState2.socket?.close();
}

// client/ui/theme.ts
var themes = [
  "system",
  "light",
  "dark"
];
function applySavedTheme() {
  applyThemePreference(savedThemePreference());
}
function updateThemeToggle(button) {
  if (!button) return;
  const preference = themePreference();
  const effective = effectiveTheme(preference);
  button.textContent = preference === "system" ? "\u25D0" : effective === "dark" ? "\u263C" : "\u263E";
  button.setAttribute("title", `Theme: ${preference}`);
  button.setAttribute("aria-label", `Theme: ${preference}. Click to change theme.`);
}
function toggleTheme(button) {
  const current = themePreference();
  const next = themes[(themes.indexOf(current) + 1) % themes.length];
  applyThemePreference(next);
  localStorage.setItem("theme", next);
  updateThemeToggle(button);
}
function savedThemePreference() {
  const savedTheme = localStorage.getItem("theme");
  return isThemePreference(savedTheme) ? savedTheme : "system";
}
function themePreference() {
  const theme = document.documentElement.dataset.theme;
  return isThemePreference(theme) ? theme : "system";
}
function applyThemePreference(theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
function effectiveTheme(theme) {
  if (theme !== "system") return theme;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function isThemePreference(value) {
  return value === "system" || value === "light" || value === "dark";
}

// client/main.ts
var statusElement = document.querySelector("#status");
var nameForm = document.querySelector("#name-form");
var nameInput = document.querySelector("#name-form input");
var panel = document.querySelector(".panel-card");
var listElement = document.querySelector("#game-list");
var shell = document.querySelector(".shell");
var themeToggle = document.querySelector("#theme-toggle");
var coordinateToggle = document.querySelector("#coordinate-toggle");
var soundControl = document.querySelector("#sound-control");
var soundToggle = document.querySelector("#sound-toggle");
var soundPopover = document.querySelector("#sound-popover");
var soundVolume = document.querySelector("#sound-volume");
var appRemake = document.querySelector("#app-remake");
var appHelp = document.querySelector("#app-help");
var stoneSound = createSound("/clack.mp3");
var captureSound = createSound("/capture.mp3");
var passSound = createSound("/pass.mp3");
if (soundVolume) soundVolume.value = String(stoneSound.volume);
var createGamePanelHtml = panel.innerHTML;
var session;
var socketState = {};
var gameEvents;
var gameClockTimer;
var historyKeyController;
var nameSaveTimer;
var lastSavedName = "";
var currentGame;
var showCoordinates = localStorage.getItem("baduk:show-coordinates") === "true" && !matchMedia("(max-width: 759px)").matches;
if (!showCoordinates && matchMedia("(max-width: 759px)").matches) {
  localStorage.setItem("baduk:show-coordinates", "false");
}
var historyViewByGame = /* @__PURE__ */ new Map();
applySavedTheme();
updateThemeToggle(themeToggle);
updateCoordinateToggle();
var landingHelpBody = document.querySelector("[data-landing-help-body]");
if (landingHelpBody) landingHelpBody.innerHTML = allVariantRulesHelpHtml();
appRemake?.addEventListener("click", remakeCurrentGame);
appHelp?.addEventListener("click", () => {
  const dialog = document.querySelector(".game-info-dialog") ?? document.querySelector(".landing-help-dialog");
  dialog?.showModal();
});
document.querySelector("[data-landing-help-close]")?.addEventListener("click", () => document.querySelector(".landing-help-dialog")?.close());
listElement.addEventListener("wheel", (event) => {
  if (!matchMedia("(min-width: 760px)").matches) return;
  if (listElement.scrollHeight <= listElement.clientHeight) return;
  event.preventDefault();
  const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? listElement.clientHeight : 1;
  listElement.scrollTop += event.deltaY * multiplier;
}, {
  passive: false
});
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
    statusElement.textContent = `${health.service} online \xB7 ${session.name ?? ""}`;
    await renderGameList2();
    startGameListRefresh2();
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
  if (session) session = {
    ...session,
    name: nameInput.value
  };
  if (currentGame) renderGame(applyLocalName(currentGame));
  queueNameSave();
});
nameInput.addEventListener("blur", () => void saveNameNow());
bindCreateGameForm(handleCreateGameSubmit, statusElement);
async function handleCreateGameSubmit(event) {
  event.preventDefault();
  const currentForm = event.currentTarget;
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
  await renderGameList2();
  await showGame(game.id);
}
function queueNameSave() {
  clearTimeout(nameSaveTimer);
  nameSaveTimer = setTimeout(() => void saveNameNow(), 2e3);
}
async function saveNameNow() {
  clearTimeout(nameSaveTimer);
  const nextName = nameInput.value;
  if (nextName === lastSavedName) return;
  const response = await updateSessionName(nextName);
  if (!response.ok) return;
  session = await readSession(response);
  nameInput.value = session.name ?? "";
  lastSavedName = nameInput.value;
  await renderGameList2();
  const gameId = location.pathname.match(/^\/game\/([^/]+)/)?.[1];
  if (gameId) await showGame(gameId);
}
function applyLocalName(game) {
  if (!session?.uuid) return game;
  const name = nameInput.value;
  return {
    ...game,
    seats: game.seats.map((seat) => seat.playerUuid === session?.uuid ? {
      ...seat,
      publicName: name
    } : seat),
    users: game.users?.map((user) => user.uuid === session?.uuid ? {
      ...user,
      name
    } : user)
  };
}
function startGameListRefresh2() {
  startGameListRefresh(gameEvents, (events) => gameEvents = events, renderGameList2, startGameListRefresh2);
}
async function renderGameList2() {
  await renderGameList(listElement, showGame);
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
  currentGame = void 0;
  disconnectGameSocket(socketState);
  historyKeyController?.abort();
  shell.classList.remove("game-layout", "desktop-fit");
  panel.innerHTML = createGameTemplate();
  bindCreateGameForm2();
  if (push && location.pathname !== "/") history.pushState(null, "", "/");
}
function createGameTemplate() {
  return createGamePanelHtml;
}
function bindCreateGameForm2() {
  bindCreateGameForm(handleCreateGameSubmit, statusElement);
}
async function showGame(gameId) {
  if (gameId === void 0) return;
  const response = await getGame(gameId);
  if (!response.ok) {
    statusElement.textContent = "Game not found.";
    return;
  }
  const game = await readGame(response);
  connectGameSocket2(game.id);
  renderGame(game);
  await maybeJoinHashSeat(game, renderGame, showGame);
}
function renderGame(game) {
  game = applyLocalName(game);
  const helpWasOpen = document.querySelector(".game-info-dialog")?.open ?? false;
  const josekiSelectionDialog = document.querySelector("[data-joseki-selection-dialog]");
  const josekiSelectionWasOpen = josekiSelectionDialog?.open ?? false;
  const josekiSelectionScrollTop = josekiSelectionDialog?.scrollTop ?? 0;
  maybePlayStoneSound(currentGame, game);
  currentGame = game;
  clearTimeout(gameClockTimer);
  shell.classList.add("game-layout");
  updateGameLayoutMode(shell);
  const { latestHistoryIndex, historyIndex, viewingHistory, boardColors, boardOpacity, visualHistoryIndex, playableHistoryCount, playableHistoryIndex, canNavigateHistory, canUsePlayActions, canUndo, canResign, passOrDoneDisabled } = gameHistoryView(game, session, historyViewByGame);
  const displayGame = viewingHistory ? {
    ...game,
    phase: "play",
    deadStones: [],
    noScorePoints: []
  } : game;
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
    showCoordinates
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
    renderGameList: renderGameList2,
    showGame,
    navigateGameHistory,
    canNavigateGameHistory: canNavigateGameHistory2,
    showCoordinates,
    toggleCoordinates
  });
  const activeSeat = game.seats[game.turn];
  statusElement.textContent = game.phase === "done" && game.winnerTeams?.length ? `done \xB7 winner: ${winnerText(game)}` : `${game.phase} \xB7 turn: ${activeSeat?.id ?? "none"}`;
  if (helpWasOpen) panel.querySelector(".game-info-dialog")?.showModal();
  const nextJosekiSelectionDialog = panel.querySelector("[data-joseki-selection-dialog]");
  if (josekiSelectionWasOpen && nextJosekiSelectionDialog) {
    if (!nextJosekiSelectionDialog.open) nextJosekiSelectionDialog.showModal();
    nextJosekiSelectionDialog.scrollTop = josekiSelectionScrollTop;
  }
  if (game.phase === "play" && game.clockUpdatedAt !== void 0 && game.config.time?.system && game.config.time.system !== "none") {
    gameClockTimer = setTimeout(() => renderGame(game), 1e3);
  }
}
function createSound(src) {
  const sound = new Audio(src);
  sound.preload = "auto";
  sound.volume = readSavedSoundVolume();
  return sound;
}
function setSoundVolume(volume) {
  const safeVolume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.5;
  for (const sound of [
    stoneSound,
    captureSound,
    passSound
  ]) sound.volume = safeVolume;
}
function readSavedSoundVolume() {
  const saved = Number(localStorage.getItem("baduk:sound-volume") ?? "0.5");
  return Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : 0.5;
}
function toggleSoundPopover() {
  if (!soundPopover || !soundToggle) return;
  const open = soundPopover.hidden;
  soundPopover.hidden = !open;
  soundToggle.setAttribute("aria-expanded", String(open));
}
function closeSoundPopover() {
  if (!soundPopover || !soundToggle) return;
  soundPopover.hidden = true;
  soundToggle.setAttribute("aria-expanded", "false");
}
function maybePlayStoneSound(previous, next) {
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
function playSound(sound) {
  sound.currentTime = 0;
  void sound.play().catch(() => {
  });
}
function connectGameSocket2(gameId) {
  connectGameSocket(gameId, socketState, renderGame, renderGameList2, connectGameSocket2);
}
async function remakeCurrentGame() {
  if (!currentGame) return;
  statusElement.textContent = "Creating remake\u2026";
  const response = await createGame(remakeConfig(currentGame.config));
  if (!response.ok) {
    statusElement.textContent = "Could not remake game.";
    return;
  }
  const game = await readGame(response);
  history.pushState(null, "", `/game/${game.id}`);
  await renderGameList2();
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
async function sendAction(gameId, action) {
  await sendGameAction(gameId, action, statusElement, renderGame, renderGameList2, socketState);
}
function navigateGameHistory(game, historyIndex, latestHistoryIndex, action) {
  const nextIndex = nextHistoryIndex(game.history ?? [], historyIndex, latestHistoryIndex, action);
  if (nextIndex === historyIndex) return;
  if (nextIndex === latestHistoryIndex) historyViewByGame.delete(game.id);
  else historyViewByGame.set(game.id, nextIndex);
  renderGame(game);
}
function canNavigateGameHistory2(game) {
  return canNavigateGameHistory(game, session);
}
boot();
