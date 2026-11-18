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
async function listShapeCards() {
  return await fetch("/api/shape-cards");
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
async function getGameHistory(gameId, from) {
  return await fetch(`/api/games/${gameId}/history?from=${from}`);
}
async function readGameHistory(response) {
  return await jsonResponse(response);
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

// client/game/history-cache.ts
function reconcileHistoryBoards(cache, game) {
  if (!cache || String(cache.gameId) !== String(game.id)) return void 0;
  if (cache.done !== (game.phase === "done")) return void 0;
  const keep = Math.max(0, (game.history?.length ?? 0) - 1);
  return cache.entries.length > keep ? {
    ...cache,
    entries: cache.entries.slice(0, keep)
  } : cache;
}
function withHistoryBoards(game, cache) {
  if (!cache?.entries.length || !game.history) return game;
  return {
    ...game,
    history: game.history.map((entry, index) => {
      const cached = cache.entries[index];
      return cached ? {
        ...entry,
        ...cached
      } : entry;
    })
  };
}
function historyFetchStart(cache, game, index) {
  const usable = reconcileHistoryBoards(cache, game);
  const have = usable?.entries.length ?? 0;
  return index < have ? void 0 : have;
}
function addHistoryBoards(cache, game, from, entries) {
  const base = reconcileHistoryBoards(cache, game) ?? {
    gameId: game.id,
    done: game.phase === "done",
    entries: []
  };
  if (from !== base.entries.length) return base;
  return reconcileHistoryBoards({
    ...base,
    entries: base.entries.concat(entries)
  }, game);
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
async function sendGameAction(gameId, action, statusElement2, renderGame2, socketState2) {
  if (statusElement2) statusElement2.textContent = "Sending\u2026";
  if (socketState2?.gameId === gameId && socketState2.socket?.readyState === WebSocket.OPEN) {
    socketState2.socket.send(JSON.stringify({
      type: "action",
      action
    }));
    return true;
  }
  const response = await postGameAction(gameId, action);
  const body = await response.json();
  if (!response.ok) {
    if (statusElement2) statusElement2.textContent = body.error ?? "Illegal action";
    if (body.game) renderGame2(body.game);
    return false;
  }
  renderGame2(body.game);
  return true;
}
function remakeConfig(config) {
  const next = JSON.parse(JSON.stringify(config));
  delete next.name;
  if (next.time?.main !== void 0) next.time.main /= 60;
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

// client/create/goban-presets.ts
var GOBAN_PRESETS = [
  {
    id: "circloid",
    name: "Circloid",
    description: "A rounded board with the corners removed, and the same 361 points as a 19\xD719.",
    rows: [
      ".......#######.......",
      ".....###########.....",
      "..#################..",
      "..########*########..",
      "..#################..",
      ".####*#########*####.",
      ".###################.",
      "#####################",
      "#####################",
      "#####################",
      "###*######*######*###",
      "#####################",
      "#####################",
      "#####################",
      ".###################.",
      ".####*#########*####.",
      "..#################..",
      "..########*########..",
      "..#################..",
      ".....###########.....",
      ".......#######......."
    ]
  },
  {
    // The main islands, drawn in the board editor, with star points.
    id: "japan",
    name: "Japan",
    description: "The islands of Japan as one connected landmass, with long, narrow land to fight over.",
    rows: [
      ".........................................##.....",
      ".........................................##.....",
      "........................................####....",
      ".....................................#########..",
      ".....................................##*#######.",
      "....................................###########.",
      "....................................###...###...",
      "......................................##...##...",
      "......................................##...#....",
      "......................................#####.....",
      ".......................................#####....",
      "......................................#######...",
      "......................................###*###...",
      "......................................########..",
      ".....................................#########..",
      ".....................................########...",
      "....................................#########...",
      "....................................#########...",
      "...................................#######*#....",
      "..................................##########....",
      "..................................##*######.....",
      ".................................#########......",
      "................................##########......",
      "..........................####.###########......",
      "..........................####.###########......",
      "........................####...###########......",
      ".......................#####..############......",
      ".......................###################......",
      "........................###################.....",
      "...............#####....##*############*###.....",
      "............#########..#############.#####......",
      ".....##############################..#####......",
      ".....###########*##################....####.....",
      ".....############################......####.....",
      "....####.....#......#############......####.....",
      "....#.......##........############..............",
      "########....#.......##############..............",
      "####*####...#########.#.##########..............",
      "##.####################..###*###................",
      "########..##########*###..####..................",
      "..######.####......#####..####..................",
      "..##*##..##.........#####..###..................",
      "...####.........................................",
      "....##.........................................."
    ]
  },
  {
    // The lower 48 and Alaska, drawn in the board editor.
    id: "usa",
    name: "USA",
    description: "The lower 48 states, with Alaska as a separate island.",
    rows: [
      ".....................................",
      ".........##..........................",
      "....########..#######................",
      ".#.####################..............",
      ".#.####################..##.......##.",
      ".######################..###...#####.",
      ".######################..###.######..",
      ".#######################.##########..",
      ".#################################...",
      ".###############################.....",
      "..#############################......",
      "..#############################......",
      "...###########################.......",
      "...###########################.......",
      ".....##########################......",
      "........#####################........",
      ".###........#################........",
      "######......########..###.####.......",
      ".######........####........###.......",
      "...##...........###.........###......",
      ".................##.........###......",
      ".............................#......."
    ]
  },
  {
    // A Go take on the classic four-player arena layout: walled main bases in the corners with
    // one ramp each, naturals along the edges, a ring of lakes around a central plaza. Rotated
    // four ways, so every corner is identical.
    id: "fighting-spirit",
    name: "Fighting Spirit",
    description: "Four walled corner bases, each with one opening, around four small lakes in the center.",
    rows: [
      "########.#######.########",
      "########.##..###.########",
      "########.#######.########",
      "###*####.#######.####*###",
      "########.###*###.########",
      "########.#######.########",
      "################.########",
      "################.########",
      ".........#######.##......",
      "##########.###.##########",
      "#########..###..#########",
      "#######################.#",
      "#.##*#######*#######*##.#",
      "#.#######################",
      "#########..###..#########",
      "##########.###.##########",
      "......##.#######.........",
      "########.################",
      "########.################",
      "########.#######.########",
      "########.###*###.########",
      "###*####.#######.####*###",
      "########.#######.########",
      "########.###..##.########",
      "########.#######.########"
    ]
  },
  {
    // A four-way arena drawn in the board editor: corner bases, walls with gaps and a central
    // pond. Rotating it 90° gives the same board (it isn't mirrored, hence the name). The
    // center star point is a single point surrounded by water: no stone can ever be played there.
    id: "pinwheel",
    name: "Pinwheel",
    description: "Four corner bases, spiralling water channels and a central pond. The point in the middle of the pond can't be played.",
    rows: [
      "#######.##.######.#######",
      "#######.##.##############",
      "#######.##.##############",
      "###*###.##.##*#######*###",
      "#######.##.######.#######",
      "#######.##.######.#######",
      "#######.###..###..#######",
      ".###...###########.......",
      "######.##################",
      "#########################",
      "###*#######...#####......",
      "##########.....###.######",
      "######.###..*..###.######",
      "######.###.....##########",
      "......#####...#######*###",
      "#########################",
      "##################.######",
      ".......###########...###.",
      "#######..###..###.#######",
      "#######.######.##.#######",
      "#######.######.##.#######",
      "###*######*###.##.###*###",
      "##############.##.#######",
      "##############.##.#######",
      "#######.######.##.#######"
    ]
  },
  {
    // A fortress drawn in the board editor: crenellated walls, a diamond moat around a small
    // central keep, and a checkerboard frame of single-point studs. The studs are surrounded by
    // water, so they are decorative: no stone can be played on them.
    id: "citadel",
    name: "Citadel",
    description: "A fortress with a moat around a central keep, framed by single-point studs that can't be played.",
    rows: [
      "*.*.*.*.*.*.*.*.*.*",
      ".*.*.*.*.*.*.*.*.*.",
      "*.*.#.#.#.#.#.#.*.*",
      ".*.#############.*.",
      "*.###############.*",
      ".*.##*#######*##.*.",
      "*.###############.*",
      ".*.######.######.*.",
      "*.######.#.######.*",
      ".*.####.#*#.####.*.",
      "*.######.#.######.*",
      ".*.######.######.*.",
      "*.###############.*",
      ".*.##*#######*##.*.",
      "*.###############.*",
      ".*.#############.*.",
      "*.*.#.#.#.#.#.#.*.*",
      ".*.*.*.*.*.*.*.*.*.",
      "*.*.*.*.*.*.*.*.*.*"
    ]
  }
];
function presetGoban(id) {
  const preset = GOBAN_PRESETS.find((candidate) => candidate.id === id);
  return preset ? gobanFromRows(preset.rows) : void 0;
}
function matchingPresetId(goban) {
  return GOBAN_PRESETS.find((preset) => {
    const candidate = gobanFromRows(preset.rows);
    return candidate.width === goban.width && candidate.height === goban.height && candidate.points.every((point, index) => point === goban.points[index]);
  })?.id;
}
function gobanFromRows(rows) {
  const width = Math.max(...rows.map((row) => row.length));
  const points = [];
  const starPoints = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const cell = row[x] ?? ".";
      points.push(cell === "." ? -1 : 0);
      if (cell === "*") starPoints.push({
        x,
        y
      });
    }
  });
  return {
    width,
    height: rows.length,
    points,
    ...starPoints.length ? {
      starPoints
    } : {}
  };
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
function starPointCoords(game) {
  const customStarPoints = game.config?.customGoban?.starPoints;
  if (customStarPoints?.length) {
    return customStarPoints.filter(({ x, y }) => isPlayableIntersection(game, x, y));
  }
  const { boardWidth: width, boardHeight: height } = game;
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
function boardFrame(game, showCoordinates2, trim = true) {
  const width = game.boardWidth;
  const height = game.boardHeight;
  let firstX = 0;
  let firstY = 0;
  let lastX = width - 1;
  let lastY = height - 1;
  if (trim) {
    const playable = game.board.flatMap((point, index) => point === -1 ? [] : [
      index
    ]);
    if (playable.length) {
      const xs = playable.map((index) => index % width);
      const ys = playable.map((index) => Math.floor(index / width));
      [firstX, lastX, firstY, lastY] = [
        Math.min(...xs),
        Math.max(...xs),
        Math.min(...ys),
        Math.max(...ys)
      ];
    }
  }
  const columns = lastX - firstX + 1;
  const rows = lastY - firstY + 1;
  const side = Math.max(2, columns, rows);
  const edge = boardEdge(showCoordinates2, side, side);
  const margin = edge / boardStep(side, edge);
  const spanX = columns - 1 + 2 * margin;
  const spanY = rows - 1 + 2 * margin;
  return {
    firstX,
    firstY,
    columns,
    rows,
    stepX: 100 / spanX,
    stepY: 100 / spanY,
    edgeX: margin * 100 / spanX,
    edgeY: margin * 100 / spanY,
    aspectRatio: spanX / spanY
  };
}
function framePosition(frame, x, y) {
  return {
    left: frame.edgeX + (x - frame.firstX) * frame.stepX,
    top: frame.edgeY + (y - frame.firstY) * frame.stepY
  };
}
function frameGridCoords(frame, leftPercent, topPercent) {
  return {
    gx: (leftPercent - frame.edgeX) / frame.stepX + frame.firstX,
    gy: (topPercent - frame.edgeY) / frame.stepY + frame.firstY
  };
}
function pointPosition(game, index, frame = boardFrame(game, true)) {
  return framePosition(frame, index % game.boardWidth, Math.floor(index / game.boardWidth));
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
  const points = shouldUsePixelPlacement(game) ? [
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
  if (shouldUsePixelPlacement(game)) {
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
function shouldUsePixelPlacement(game) {
  return Boolean(game.config.variants?.pixel && game.phase !== "scoring");
}
function boardGridCoords(board, game, event, showCoordinates2 = true) {
  const rect = board.getBoundingClientRect();
  return frameGridCoords(boardFrame(game, showCoordinates2), (event.clientX - rect.left) / rect.width * 100, (event.clientY - rect.top) / rect.height * 100);
}
function boardGridHtml(game, showCoordinates2 = true, frame = boardFrame(game, showCoordinates2)) {
  const segments = [];
  for (let y = 0; y < game.boardHeight; y++) {
    for (let x = 0; x < game.boardWidth; x++) {
      if (!isPlayableIntersection(game, x, y)) continue;
      const { left, top } = framePosition(frame, x, y);
      if (isPlayableIntersection(game, x + 1, y)) {
        const right = framePosition(frame, x + 1, y).left;
        segments.push(`M${svgNumber(left)} ${svgNumber(top)}H${svgNumber(right)}`);
      }
      if (isPlayableIntersection(game, x, y + 1)) {
        const bottom = framePosition(frame, x, y + 1).top;
        segments.push(`M${svgNumber(left)} ${svgNumber(top)}V${svgNumber(bottom)}`);
      }
    }
  }
  const grid = boardGridSvg(segments);
  if (!showCoordinates2) return grid;
  const horizontalCoords = Array.from({
    length: game.boardWidth
  }, (_, x) => {
    if (!Array.from({
      length: game.boardHeight
    }, (_2, y) => isPlayableIntersection(game, x, y)).some(Boolean)) return "";
    const left = framePosition(frame, x, 0).left;
    const label = columnLabel(x);
    return `<span class="coord coord-top" style="left:${left}%">${label}</span><span class="coord coord-bottom" style="left:${left}%">${label}</span>`;
  }).join("");
  const verticalCoords = Array.from({
    length: game.boardHeight
  }, (_, y) => {
    if (!Array.from({
      length: game.boardWidth
    }, (_2, x) => isPlayableIntersection(game, x, y)).some(Boolean)) return "";
    const top = framePosition(frame, 0, y).top;
    const label = game.boardHeight - y;
    return `<span class="coord coord-left" style="top:${top}%">${label}</span><span class="coord coord-right" style="top:${top}%">${label}</span>`;
  }).join("");
  return `${grid}${horizontalCoords}${verticalCoords}`;
}
function boardLandHtml(game, frame = boardFrame(game, true)) {
  if (!game.board.includes(-1)) return "";
  const halfX = frame.stepX / 2 + frame.stepX * 0.02;
  const halfY = frame.stepY / 2 + frame.stepY * 0.02;
  const squares = game.board.flatMap((point, index) => {
    if (point === -1) return [];
    const { left, top } = framePosition(frame, index % game.boardWidth, Math.floor(index / game.boardWidth));
    return [
      `M${svgNumber(left - halfX)} ${svgNumber(top - halfY)}h${svgNumber(halfX * 2)}v${svgNumber(halfY * 2)}h${svgNumber(-halfX * 2)}z`
    ];
  });
  return `<svg class="board-land" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${squares.join("")}"/></svg>`;
}
var COLUMN_LETTERS = "ABCDEFGHJKLMNOPQRSTUVWXYZ";
function columnLabel(x) {
  const letter = COLUMN_LETTERS[x % COLUMN_LETTERS.length];
  return letter.repeat(Math.floor(x / COLUMN_LETTERS.length) + 1);
}
function boardGridSvg(segments) {
  return `<svg class="board-grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${segments.join("")}" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" shape-rendering="crispEdges"/></svg>`;
}
function gridStrokeWidth(devicePixelRatio1) {
  const ratio = devicePixelRatio1 > 0 ? devicePixelRatio1 : 1;
  const devicePixels = Math.max(1, Math.round(ratio));
  return `${Number((devicePixels / ratio).toFixed(4))}px`;
}
function keepGridLinesCrisp(root = document.documentElement) {
  const update = () => {
    root.style.setProperty("--grid-stroke", gridStrokeWidth(devicePixelRatio));
    matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener("change", update, {
      once: true
    });
  };
  update();
}
function svgNumber(value) {
  return Number(value.toFixed(4));
}
function starPointsHtml(game, showCoordinates2 = true, frame = boardFrame(game, showCoordinates2)) {
  const coords = starPointCoords(game).filter(({ x, y }) => isPlayableIntersection(game, x, y));
  return coords.map(({ x, y }) => {
    const { left, top } = framePosition(frame, x, y);
    return `<i class="star-point" style="left:${left}%;top:${top}%"></i>`;
  }).join("");
}

// client/shared/custom-board.ts
var CUSTOM_BOARD_MIN_SIZE = 2;
var CUSTOM_BOARD_MAX_SIZE = 52;
var CUSTOM_BOARD_PHONE_FRIENDLY_SIZE = 19;
function playablePointCount(points) {
  return points.filter((point) => point !== -1).length;
}
function islandCount(width, height, points) {
  const seen = new Uint8Array(width * height);
  let islands = 0;
  for (let start = 0; start < points.length; start++) {
    if (points[start] === -1 || seen[start]) continue;
    islands++;
    const stack = [
      start
    ];
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop();
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1
      ];
      for (const next of neighbors) {
        if (next < 0 || seen[next] || points[next] === -1) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
  }
  return islands;
}
function exceedsPhoneFriendlySize(width, height) {
  return Math.max(width, height) > CUSTOM_BOARD_PHONE_FRIENDLY_SIZE;
}

// client/create/custom-goban.ts
var CUSTOM_GOBAN_AUTOSAVE_KEY = "baduk:custom-goban-autosave";
function parseCustomGoban(value, fallbackSize = 9) {
  if (!value) return emptyGoban(fallbackSize);
  try {
    return normalizeCustomGoban(JSON.parse(String(value)), fallbackSize);
  } catch {
    return emptyGoban(fallbackSize);
  }
}
function applyGobanPreset(root = document) {
  const form = root.querySelector("#create-game-form");
  const hidden = form?.querySelector("[name='customGoban']");
  const customGobanToggle = form?.querySelector("[name='customGobanMode']");
  const select = root.querySelector("[name='gobanPreset']");
  if (!form || !hidden || !customGobanToggle || !select) return;
  const size = Number(form.querySelector("[name='boardSize']")?.value ?? 9);
  hidden.value = JSON.stringify(presetGoban(select.value) ?? emptyGoban(size));
  customGobanToggle.checked = true;
  localStorage.setItem(CUSTOM_GOBAN_AUTOSAVE_KEY, hidden.value);
  customGobanToggle.dispatchEvent(new Event("change", {
    bubbles: true
  }));
}
function refreshCustomGobanPreset(root = document) {
  const form = root.querySelector("#create-game-form");
  const hidden = form?.querySelector("[name='customGoban']");
  const select = root.querySelector("[name='gobanPreset']");
  if (!select) return;
  if (select.options.length <= 1) select.insertAdjacentHTML("beforeend", presetOptionsHtml());
  const goban = hidden?.value ? parseCustomGoban(hidden.value) : void 0;
  select.value = goban ? matchingPresetId(goban) ?? "" : "";
}
function presetOptionsHtml() {
  return GOBAN_PRESETS.map((preset) => `<option value="${preset.id}">${preset.name}</option>`).join("");
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
    ],
    ...customGoban.starPoints ? {
      starPoints: [
        ...customGoban.starPoints
      ]
    } : {}
  };
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog custom-goban-dialog";
  dialog.innerHTML = `
    <button class="custom-goban-close" data-goban="close" type="button" aria-label="Close">\xD7</button>
    <div class="custom-goban-controls">
      <button data-goban="copy" type="button">Copy</button>
    </div>
    <p class="custom-goban-summary" aria-live="polite">${gobanSummary(goban)}</p>
    <div class="custom-goban-board-wrap">${customBoardHtml(goban, false)}</div>
  `;
  document.body.append(dialog);
  dialog.addEventListener("click", (event) => {
    const target = event.target;
    const action = target?.closest("[data-goban]")?.dataset.goban;
    if (action === "copy") copyText(JSON.stringify(goban), event.target, statusElement2, "Copied");
    if (action === "close") dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}
function paintGobanPoint(goban, index, tool) {
  if (index < 0 || index >= goban.points.length) return false;
  const x = index % goban.width;
  const y = Math.floor(index / goban.width);
  if (tool === "star") {
    if (goban.points[index] === -1) return false;
    const stars = gobanStarPoints(goban);
    const has = stars.some((star) => star.x === x && star.y === y);
    setStarPoints(goban, has ? stars.filter((star) => star.x !== x || star.y !== y) : [
      ...stars,
      {
        x,
        y
      }
    ]);
    return true;
  }
  const value = tool === "land" ? 0 : -1;
  if (goban.points[index] === value) return false;
  goban.points[index] = value;
  if (value === -1 && goban.starPoints) {
    setStarPoints(goban, goban.starPoints.filter((star) => star.x !== x || star.y !== y));
  }
  return true;
}
function gobanLine(width, from, to) {
  const x0 = from % width;
  const y0 = Math.floor(from / width);
  const dx = to % width - x0;
  const dy = Math.floor(to / width) - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) return [
    from
  ];
  return Array.from({
    length: steps + 1
  }, (_, step) => {
    const x = x0 + Math.round(dx * step / steps);
    const y = y0 + Math.round(dy * step / steps);
    return y * width + x;
  });
}
function fillGoban(goban, land) {
  goban.points = goban.points.map(() => land ? 0 : -1);
  if (!land) delete goban.starPoints;
}
function resizeGoban(goban, width, height) {
  const nextWidth = clampSize(width);
  const nextHeight = clampSize(height);
  const next = Array(nextWidth * nextHeight).fill(0);
  for (let y = 0; y < Math.min(nextHeight, goban.height); y++) {
    for (let x = 0; x < Math.min(nextWidth, goban.width); x++) {
      next[y * nextWidth + x] = goban.points[y * goban.width + x];
    }
  }
  goban.width = nextWidth;
  goban.height = nextHeight;
  goban.points = next;
  if (goban.starPoints) {
    setStarPoints(goban, goban.starPoints.filter((star) => star.x < nextWidth && star.y < nextHeight));
  }
}
function gobanStarPoints(goban) {
  return starPointCoords(gobanAsBoard(goban));
}
function gobanSummary(goban) {
  const points = playablePointCount(goban.points);
  const islands = islandCount(goban.width, goban.height, goban.points);
  const summary = `${goban.width}\xD7${goban.height} \xB7 ${points} point${points === 1 ? "" : "s"} \xB7 ${islands} island${islands === 1 ? "" : "s"}`;
  return exceedsPhoneFriendlySize(goban.width, goban.height) ? `${summary}<span class="custom-goban-warning">Larger than 19\xD719: stones will be small and hard to play on phones.</span>` : summary;
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
    refreshCustomGobanPreset();
  };
  autosave();
  let tool = "land";
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog custom-goban-dialog custom-goban-editor";
  dialog.innerHTML = `
    <button class="custom-goban-close" data-goban="close" type="button" aria-label="Close">\xD7</button>
    <div class="custom-goban-layout">
    <div class="custom-goban-side">
    <div class="custom-goban-controls">
      <div class="custom-goban-tools" role="radiogroup" aria-label="Paint">
        <button data-tool="land" type="button" role="radio">Land</button>
        <button data-tool="water" type="button" role="radio">Water</button>
        <button data-tool="star" type="button" role="radio">Star</button>
      </div>
      <div class="custom-goban-fill">
        <button data-goban="all-land" type="button">All land</button>
        <button data-goban="all-water" type="button">All water</button>
      </div>
      <div class="custom-goban-size">
        <span>W</span>
        <button data-goban="width-down" type="button" aria-label="Narrower">\u2212</button>
        <output data-goban-width></output>
        <button data-goban="width-up" type="button" aria-label="Wider">+</button>
        <span>H</span>
        <button data-goban="height-down" type="button" aria-label="Shorter">\u2212</button>
        <output data-goban-height></output>
        <button data-goban="height-up" type="button" aria-label="Taller">+</button>
      </div>
      <label class="custom-goban-preset">
        Preset
        <select data-goban-preset aria-label="Load a preset board">
          <option value="">Choose\u2026</option>${presetOptionsHtml()}
        </select>
      </label>
      <div class="custom-goban-actions">
        <button data-goban="reset" type="button">Reset</button>
        <button data-goban="copy" type="button">Copy</button>
        <button data-goban="paste" type="button">Paste</button>
        <button data-goban="save" type="button">Save</button>
      </div>
    </div>
    <p class="custom-goban-summary" aria-live="polite"></p>
    <figure class="custom-goban-preview">
      <figcaption>In game</figcaption>
      <div class="custom-goban-preview-board"></div>
    </figure>
    </div>
    <div class="custom-goban-board-wrap"></div>
    </div>
  `;
  document.body.append(dialog);
  const wrap = dialog.querySelector(".custom-goban-board-wrap");
  const summary = dialog.querySelector(".custom-goban-summary");
  const preview = dialog.querySelector(".custom-goban-preview-board");
  const renderInfo = () => {
    summary.innerHTML = gobanSummary(goban);
    preview.innerHTML = gamePreviewHtml(goban);
    dialog.querySelector("[data-goban-width]").textContent = String(goban.width);
    dialog.querySelector("[data-goban-height]").textContent = String(goban.height);
    for (const button of dialog.querySelectorAll("[data-tool]")) {
      const active = button.dataset.tool === tool;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-checked", String(active));
    }
  };
  const render = () => {
    wrap.innerHTML = customBoardHtml(goban, true);
    renderInfo();
  };
  const refreshPoint = (index) => {
    const board = wrap.querySelector(".custom-goban-board");
    board?.querySelector(`[data-index="${index}"]`)?.classList.toggle("is-water", goban.points[index] === -1);
    board?.classList.toggle("has-water", goban.points.includes(-1));
    const lines = board?.querySelector(".custom-goban-lines");
    if (lines) lines.innerHTML = customBoardLinesHtml(goban);
    renderInfo();
  };
  let painting = false;
  let lastPainted;
  const paintAt = (event) => {
    const board = wrap.querySelector(".custom-goban-board");
    const index = board ? gobanIndexAt(board, goban, event.clientX, event.clientY) : void 0;
    if (index === void 0 || index === lastPainted) return;
    const stroke = lastPainted === void 0 ? [
      index
    ] : gobanLine(goban.width, lastPainted, index);
    lastPainted = index;
    const changed = stroke.filter((point) => paintGobanPoint(goban, point, tool));
    if (changed.length === 0) return;
    autosave();
    for (const point of changed) refreshPoint(point);
  };
  wrap.addEventListener("pointerdown", (event) => {
    if (!event.target?.closest(".custom-goban-board")) return;
    event.preventDefault();
    wrap.setPointerCapture(event.pointerId);
    painting = tool !== "star";
    lastPainted = void 0;
    paintAt(event);
  });
  wrap.addEventListener("pointermove", (event) => {
    if (painting) paintAt(event);
  });
  const stopPainting = () => {
    painting = false;
    lastPainted = void 0;
  };
  wrap.addEventListener("pointerup", stopPainting);
  wrap.addEventListener("pointercancel", stopPainting);
  const change = (update) => {
    update();
    autosave();
    render();
  };
  dialog.addEventListener("click", (event) => {
    const target = event.target;
    const toolButton = target?.closest("[data-tool]");
    if (toolButton) {
      tool = toolButton.dataset.tool;
      renderInfo();
      return;
    }
    const action = target?.closest("[data-goban]")?.dataset.goban;
    if (!action) return;
    if (action === "all-land") change(() => fillGoban(goban, true));
    if (action === "all-water") change(() => fillGoban(goban, false));
    if (action === "width-up") change(() => resizeGoban(goban, goban.width + 1, goban.height));
    if (action === "width-down") change(() => resizeGoban(goban, goban.width - 1, goban.height));
    if (action === "height-up") change(() => resizeGoban(goban, goban.width, goban.height + 1));
    if (action === "height-down") change(() => resizeGoban(goban, goban.width, goban.height - 1));
    if (action === "reset") {
      change(() => {
        Object.assign(goban, emptyGoban(size));
        delete goban.starPoints;
      });
    }
    if (action === "save") {
      autosave();
      dialog.close();
    }
    if (action === "copy") copyText(JSON.stringify(goban), event.target, statusElement2, "Copied");
    if (action === "paste") {
      navigator.clipboard?.readText().then((text) => {
        change(() => {
          const pasted = parseCustomGoban(text, size);
          goban.width = pasted.width;
          goban.height = pasted.height;
          goban.points = pasted.points;
          if (pasted.starPoints) goban.starPoints = pasted.starPoints;
          else delete goban.starPoints;
        });
      });
    }
    if (action === "close") dialog.close();
  });
  dialog.querySelector("[data-goban-preset]")?.addEventListener("change", (event) => {
    const select = event.target;
    const preset = presetGoban(select.value);
    select.value = "";
    if (!preset) return;
    change(() => {
      delete goban.starPoints;
      Object.assign(goban, preset);
    });
  });
  dialog.addEventListener("close", () => dialog.remove());
  render();
  dialog.showModal();
}
function gamePreviewHtml(goban) {
  const board = gobanAsBoard(goban);
  const frame = boardFrame(board, false);
  const water = goban.points.includes(-1) ? " has-water" : "";
  return `<div class="board custom-goban-preview-surface${water}" role="img" aria-label="In-game preview" style="--board-step: ${frame.stepX}%; --board-aspect: ${frame.aspectRatio}">${boardLandHtml(board, frame)}${boardGridHtml(board, false, frame)}${starPointsHtml(board, false, frame)}</div>`;
}
function customBoardHtml(goban, editable) {
  const board = gobanAsBoard(goban);
  const frame = editorFrame(goban);
  const points = goban.points.map((point, index) => {
    const position = pointPosition(board, index, frame);
    const x = index % goban.width;
    const y = Math.floor(index / goban.width);
    return `<span class="custom-point${point === -1 ? " is-water" : ""}" data-index="${index}" style="left:${position.left}%;top:${position.top}%" aria-hidden="true" data-x="${x}" data-y="${y}"></span>`;
  }).join("");
  const water = goban.points.includes(-1) ? " has-water" : "";
  return `<div class="board custom-goban-board${editable ? " is-editable" : ""}${water}" role="img" aria-label="Custom board, ${goban.width} by ${goban.height}" style="--board-step: ${frame.stepX}%; --board-step-y: ${frame.stepY}%; --board-aspect: ${frame.aspectRatio}"><div class="custom-goban-lines">${customBoardLinesHtml(goban)}</div>${points}</div>`;
}
function customBoardLinesHtml(goban) {
  const board = gobanAsBoard(goban);
  const frame = editorFrame(goban);
  return boardLandHtml(board, frame) + boardGridHtml(board, false, frame) + starPointsHtml(board, false, frame);
}
function editorFrame(goban) {
  return boardFrame(gobanAsBoard(goban), false, false);
}
function gobanIndexAt(board, goban, clientX, clientY) {
  const rect = board.getBoundingClientRect();
  const { gx, gy } = frameGridCoords(editorFrame(goban), (clientX - rect.left) / rect.width * 100, (clientY - rect.top) / rect.height * 100);
  const x = Math.round(gx);
  const y = Math.round(gy);
  if (x < 0 || y < 0 || x >= goban.width || y >= goban.height) return void 0;
  return y * goban.width + x;
}
function gobanAsBoard(goban) {
  return {
    boardWidth: goban.width,
    boardHeight: goban.height,
    board: goban.points,
    config: {
      customGoban: goban.starPoints ? {
        starPoints: goban.starPoints
      } : {}
    }
  };
}
function setStarPoints(goban, stars) {
  if (stars.length) goban.starPoints = stars;
  else delete goban.starPoints;
}
function clampSize(value) {
  return Math.min(CUSTOM_BOARD_MAX_SIZE, Math.max(CUSTOM_BOARD_MIN_SIZE, Math.round(value)));
}
function normalizeCustomGoban(value, fallbackSize) {
  if (!value || typeof value !== "object") return emptyGoban(fallbackSize);
  const custom = value;
  const width = boundedInteger(custom.width, CUSTOM_BOARD_MIN_SIZE, CUSTOM_BOARD_MAX_SIZE, fallbackSize);
  const height = boundedInteger(custom.height, CUSTOM_BOARD_MIN_SIZE, CUSTOM_BOARD_MAX_SIZE, fallbackSize);
  const source = Array.isArray(custom.points) ? custom.points : [];
  const points = Array.from({
    length: width * height
  }, (_, index) => source[index] === -1 ? -1 : 0);
  const embeddedStarPoints = source.flatMap((point, index) => point === 1 ? [
    {
      x: index % width,
      y: Math.floor(index / width)
    }
  ] : []);
  const explicitStarPoints = Array.isArray(custom.starPoints) ? custom.starPoints.filter((point) => Number.isInteger(point?.x) && Number.isInteger(point?.y) && point.x >= 0 && point.y >= 0 && point.x < width && point.y < height && points[point.y * width + point.x] !== -1).map((point) => ({
    x: point.x,
    y: point.y
  })) : [];
  const starPoints = uniquePoints([
    ...explicitStarPoints,
    ...embeddedStarPoints
  ]);
  return {
    width,
    height,
    points,
    ...starPoints.length ? {
      starPoints
    } : {}
  };
}
function uniquePoints(points) {
  const seen = /* @__PURE__ */ new Set();
  return points.filter((point) => {
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function boundedInteger(value, min, max, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
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
  const viewersSeeInvisible = data.has("invisibleStonesShowViewers") || data.has("hiddenMoveShowViewers");
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
        String(data.get("colorGoColor3") ?? "#4f9d69"),
        String(data.get("colorGoColor4") ?? "#e07a5f")
      ],
      colorGoKomi: [
        0,
        Number(data.get("colorGoKomi2")),
        Number(data.get("colorGoKomi3")),
        Number(data.get("colorGoKomi4"))
      ],
      phantomMove: data.has("phantomMove"),
      phantomHideViewers: data.has("phantomHideViewers") || data.has("phantomMove") && !viewersSeeInvisible,
      hiddenMove: data.has("hiddenMove"),
      hiddenMoveCount: Number(data.get("hiddenMoveCount")),
      hiddenMoveShowViewers: viewersSeeInvisible,
      josekiCard: data.has("josekiCard"),
      shapeCards: data.has("shapeCards"),
      shapeCardHandSize: Number(data.get("shapeCardHandSize") ?? 4),
      shapeCardFull: data.has("shapeCardFull"),
      shapeCardReshuffle: data.has("shapeCardReshuffle"),
      tetris: data.has("tetris"),
      magnetic: data.has("magnetic"),
      nPlusOne: data.has("nPlusOne"),
      nPlusOneCount: Number(data.get("nPlusOneCount")),
      traitor: data.has("traitor"),
      traitorMode: data.get("traitorMode") === "percentage" ? "percentage" : "moves",
      traitorStoneCount: Number(data.get("traitorMoveCount") ?? 6),
      traitorChance: Number(data.get("traitorChancePercent") ?? 10),
      randomTurn: data.has("randomTurn"),
      teamGo: data.has("teamGo"),
      teamGoSeatCounts: [
        Number(data.get("teamGoSeats1")),
        Number(data.get("teamGoSeats2")),
        Number(data.get("teamGoSeats3")),
        Number(data.get("teamGoSeats4"))
      ]
    }
  };
}

// client/shared/variant-conflicts.ts
var VARIANT_LABELS = {
  pixel: "Pixel",
  zen: "Zen",
  colorGo: "Color Go",
  phantomMove: "Phantom",
  hiddenMove: "Hidden",
  josekiCard: "Joseki Card",
  shapeCards: "Katachi",
  tetris: "Tetris",
  magnetic: "Magnetic",
  nPlusOne: "N+1",
  traitor: "Traitor",
  randomTurn: "Random Turn",
  teamGo: "Team Go"
};
var VARIANT_KEYS = Object.keys(VARIANT_LABELS);
var VARIANT_CONFLICTS = {
  josekiCard: [
    "tetris",
    "zen",
    "colorGo"
  ],
  hiddenMove: [
    "zen"
  ],
  zen: [
    "colorGo"
  ],
  teamGo: [
    "zen"
  ],
  shapeCards: [
    "pixel",
    "nPlusOne",
    "traitor",
    "tetris",
    "zen",
    "colorGo",
    "hiddenMove",
    "phantomMove"
  ],
  // Sliding would reveal hidden/phantom stones, and Pixel/Katachi place several stones at once.
  magnetic: [
    "pixel",
    "hiddenMove",
    "phantomMove",
    "shapeCards"
  ],
  tetris: [
    "pixel"
  ]
};
function conflictingVariants(key) {
  const conflicts = new Set(VARIANT_CONFLICTS[key] ?? []);
  for (const [other, blocked] of Object.entries(VARIANT_CONFLICTS)) {
    if (blocked?.includes(key)) conflicts.add(other);
  }
  return [
    ...conflicts
  ];
}
function variantConfigProblems(selection2) {
  const on = (key) => Boolean(selection2.variants[key]);
  const problems = [];
  if (on("josekiCard") && selection2.boardSize !== 19) {
    problems.push("Joseki Card requires a 19\xD719 board.");
  }
  if (on("josekiCard") && selection2.customGoban) {
    problems.push("Joseki Card cannot be combined with Custom board.");
  }
  for (const [key, blocked] of Object.entries(VARIANT_CONFLICTS)) {
    if (!on(key)) continue;
    const chosen = (blocked ?? []).filter(on).map((other) => VARIANT_LABELS[other]);
    if (chosen.length) {
      problems.push(`${VARIANT_LABELS[key]} cannot be combined with ${chosen.join(", ")}.`);
    }
  }
  if (on("shapeCards") && selection2.ruleset === "chinese" && Number(selection2.handicap ?? 0) > 1) {
    problems.push("Katachi cannot be combined with free handicap placement.");
  }
  if (on("tetris") && on("nPlusOne") && Number(selection2.variants.nPlusOneCount) === 4) {
    problems.push("Tetris cannot be combined with N+1 count 4.");
  }
  return problems;
}

// client/ui/color-names.ts
var NAMED_COLORS = [
  {
    name: "Black",
    hex: "#111111",
    family: "black"
  },
  {
    name: "White",
    hex: "#eeeeee",
    family: "white"
  },
  {
    name: "Green",
    hex: "#4f9d69",
    family: "green"
  },
  {
    name: "Red",
    hex: "#e07a5f",
    family: "red"
  },
  {
    name: "Jet Black",
    hex: "#000000",
    family: "black"
  },
  {
    name: "Charcoal",
    hex: "#36454f",
    family: "black"
  },
  {
    name: "Dark Gray",
    hex: "#4a4a4a",
    family: "gray"
  },
  {
    name: "Dim Gray",
    hex: "#696969",
    family: "gray"
  },
  {
    name: "Gray",
    hex: "#808080",
    family: "gray"
  },
  {
    name: "Slate Gray",
    hex: "#708090",
    family: "gray"
  },
  {
    name: "Silver",
    hex: "#c0c0c0",
    family: "gray"
  },
  {
    name: "Light Gray",
    hex: "#d3d3d3",
    family: "gray"
  },
  {
    name: "White Smoke",
    hex: "#f5f5f5",
    family: "white"
  },
  {
    name: "Snow",
    hex: "#fffafa",
    family: "white"
  },
  {
    name: "Ivory",
    hex: "#fffff0",
    family: "white"
  },
  {
    name: "Cream",
    hex: "#fffdd0",
    family: "beige"
  },
  {
    name: "Beige",
    hex: "#f5f5dc",
    family: "beige"
  },
  {
    name: "Tan",
    hex: "#d2b48c",
    family: "beige"
  },
  {
    name: "Khaki",
    hex: "#f0e68c",
    family: "beige"
  },
  {
    name: "Brown",
    hex: "#a52a2a",
    family: "brown"
  },
  {
    name: "Saddle Brown",
    hex: "#8b4513",
    family: "brown"
  },
  {
    name: "Chocolate",
    hex: "#d2691e",
    family: "brown"
  },
  {
    name: "Sienna",
    hex: "#a0522d",
    family: "brown"
  },
  {
    name: "Peru",
    hex: "#cd853f",
    family: "brown"
  },
  {
    name: "Maroon",
    hex: "#800000",
    family: "red"
  },
  {
    name: "Bright Red",
    hex: "#ff0000",
    family: "red"
  },
  {
    name: "Dark Red",
    hex: "#8b0000",
    family: "red"
  },
  {
    name: "Crimson",
    hex: "#dc143c",
    family: "red"
  },
  {
    name: "Firebrick",
    hex: "#b22222",
    family: "red"
  },
  {
    name: "Indian Red",
    hex: "#cd5c5c",
    family: "red"
  },
  {
    name: "Tomato",
    hex: "#ff6347",
    family: "red"
  },
  {
    name: "Coral",
    hex: "#ff7f50",
    family: "red"
  },
  {
    name: "Salmon",
    hex: "#fa8072",
    family: "red"
  },
  {
    name: "Light Salmon",
    hex: "#ffa07a",
    family: "red"
  },
  {
    name: "Orange Red",
    hex: "#ff4500",
    family: "orange"
  },
  {
    name: "Orange",
    hex: "#ffa500",
    family: "orange"
  },
  {
    name: "Dark Orange",
    hex: "#ff8c00",
    family: "orange"
  },
  {
    name: "Gold",
    hex: "#ffd700",
    family: "yellow"
  },
  {
    name: "Goldenrod",
    hex: "#daa520",
    family: "yellow"
  },
  {
    name: "Yellow",
    hex: "#ffff00",
    family: "yellow"
  },
  {
    name: "Lemon Chiffon",
    hex: "#fffacd",
    family: "yellow"
  },
  {
    name: "Olive",
    hex: "#808000",
    family: "yellow"
  },
  {
    name: "Yellow Green",
    hex: "#9acd32",
    family: "green"
  },
  {
    name: "Chartreuse",
    hex: "#7fff00",
    family: "green"
  },
  {
    name: "Lime",
    hex: "#00ff00",
    family: "green"
  },
  {
    name: "Lime Green",
    hex: "#32cd32",
    family: "green"
  },
  {
    name: "Classic Green",
    hex: "#008000",
    family: "green"
  },
  {
    name: "Dark Green",
    hex: "#006400",
    family: "green"
  },
  {
    name: "Forest Green",
    hex: "#228b22",
    family: "green"
  },
  {
    name: "Sea Green",
    hex: "#2e8b57",
    family: "green"
  },
  {
    name: "Medium Sea Green",
    hex: "#3cb371",
    family: "green"
  },
  {
    name: "Spring Green",
    hex: "#00ff7f",
    family: "green"
  },
  {
    name: "Mint",
    hex: "#98ff98",
    family: "green"
  },
  {
    name: "Teal",
    hex: "#008080",
    family: "teal"
  },
  {
    name: "Dark Cyan",
    hex: "#008b8b",
    family: "teal"
  },
  {
    name: "Light Sea Green",
    hex: "#20b2aa",
    family: "teal"
  },
  {
    name: "Turquoise",
    hex: "#40e0d0",
    family: "teal"
  },
  {
    name: "Aquamarine",
    hex: "#7fffd4",
    family: "teal"
  },
  {
    name: "Cyan",
    hex: "#00ffff",
    family: "cyan"
  },
  {
    name: "Powder Blue",
    hex: "#b0e0e6",
    family: "blue"
  },
  {
    name: "Sky Blue",
    hex: "#87ceeb",
    family: "blue"
  },
  {
    name: "Deep Sky Blue",
    hex: "#00bfff",
    family: "blue"
  },
  {
    name: "Cornflower Blue",
    hex: "#6495ed",
    family: "blue"
  },
  {
    name: "Dodger Blue",
    hex: "#1e90ff",
    family: "blue"
  },
  {
    name: "Bright Blue",
    hex: "#0000ff",
    family: "blue"
  },
  {
    name: "Royal Blue",
    hex: "#4169e1",
    family: "blue"
  },
  {
    name: "Medium Blue",
    hex: "#0000cd",
    family: "blue"
  },
  {
    name: "Dark Blue",
    hex: "#00008b",
    family: "blue"
  },
  {
    name: "Navy",
    hex: "#000080",
    family: "blue"
  },
  {
    name: "Steel Blue",
    hex: "#4682b4",
    family: "blue"
  },
  {
    name: "Slate Blue",
    hex: "#6a5acd",
    family: "blue"
  },
  {
    name: "Indigo",
    hex: "#4b0082",
    family: "indigo"
  },
  {
    name: "Purple",
    hex: "#800080",
    family: "purple"
  },
  {
    name: "Dark Violet",
    hex: "#9400d3",
    family: "purple"
  },
  {
    name: "Blue Violet",
    hex: "#8a2be2",
    family: "purple"
  },
  {
    name: "Medium Purple",
    hex: "#9370db",
    family: "purple"
  },
  {
    name: "Violet",
    hex: "#ee82ee",
    family: "purple"
  },
  {
    name: "Orchid",
    hex: "#da70d6",
    family: "purple"
  },
  {
    name: "Plum",
    hex: "#dda0dd",
    family: "purple"
  },
  {
    name: "Lavender",
    hex: "#e6e6fa",
    family: "purple"
  },
  {
    name: "Magenta",
    hex: "#ff00ff",
    family: "magenta"
  },
  {
    name: "Rose",
    hex: "#ff007f",
    family: "pink"
  },
  {
    name: "Hot Pink",
    hex: "#ff69b4",
    family: "pink"
  },
  {
    name: "Deep Pink",
    hex: "#ff1493",
    family: "pink"
  },
  {
    name: "Pink",
    hex: "#ffc0cb",
    family: "pink"
  },
  {
    name: "Light Pink",
    hex: "#ffb6c1",
    family: "pink"
  }
];
var FAMILY_PREFIX = {
  black: "B",
  white: "W",
  gray: "GY",
  beige: "BE",
  brown: "BR",
  red: "R",
  orange: "O",
  yellow: "Y",
  green: "G",
  teal: "TE",
  cyan: "C",
  blue: "BL",
  indigo: "I",
  purple: "P",
  magenta: "M",
  pink: "PK"
};
var LAB_COLORS = NAMED_COLORS.map((color) => ({
  ...color,
  lab: hexToLab(color.hex)
}));
function nearestColorName(hex) {
  return nearestNamedColor(hex).name;
}
function colorResultPrefix(hex) {
  return FAMILY_PREFIX[nearestNamedColor(hex).family];
}
function colorLightness(hex) {
  return hexToLab(hex)?.[0];
}
var MIN_OPPOSITE_CONTRAST = 45;
function oppositeColor(hex) {
  const lab = hexToLab(hex);
  if (!lab) return void 0;
  const [lightness, a, b] = lab;
  const flipped = 100 - lightness;
  const target = lightness >= 50 ? Math.min(flipped, lightness - MIN_OPPOSITE_CONTRAST) : Math.max(flipped, lightness + MIN_OPPOSITE_CONTRAST);
  const opposite = Math.min(100, Math.max(0, target));
  for (let chroma = 1; chroma >= 0; chroma -= 0.05) {
    const rgb = labToRgb([
      opposite,
      -a * chroma,
      -b * chroma
    ]);
    if (rgb) return rgbToHex(rgb);
  }
  return rgbToHex(labToRgb([
    opposite,
    0,
    0
  ], true));
}
function nearestNamedColor(hex) {
  const lab = hexToLab(hex);
  if (!lab) return NAMED_COLORS[0];
  let closest = LAB_COLORS[0];
  let closestDistance = Infinity;
  for (const color of LAB_COLORS) {
    const distance = labDistance(lab, color.lab);
    if (distance >= closestDistance) continue;
    closest = color;
    closestDistance = distance;
  }
  return closest;
}
function hexToLab(hex) {
  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  if (!match) return void 0;
  const [red, green, blue] = match.slice(1).map((part) => Number.parseInt(part, 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const x = (red * 0.4124 + green * 0.3576 + blue * 0.1805) / 0.95047;
  const y = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const z = (red * 0.0193 + green * 0.1192 + blue * 0.9505) / 1.08883;
  const convert = (value) => value > 8856e-6 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const fx = convert(x);
  const fy = convert(y);
  const fz = convert(z);
  return [
    116 * fy - 16,
    500 * (fx - fy),
    200 * (fy - fz)
  ];
}
function labToRgb([lightness, a, b], clamp = false) {
  const fy = (lightness + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const invert = (value) => value > 0.206893 ? value ** 3 : (value - 16 / 116) / 7.787;
  const x = invert(fx) * 0.95047;
  const y = invert(fy);
  const z = invert(fz) * 1.08883;
  const linear = [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z
  ];
  const channels = linear.map((value) => value <= 31308e-7 ? 12.92 * value : 1.055 * Math.max(value, 0) ** (1 / 2.4) - 0.055);
  const epsilon = 5e-4;
  if (!clamp && channels.some((value) => value < -epsilon || value > 1 + epsilon)) {
    return void 0;
  }
  const [red, green, blue] = channels.map((value) => Math.min(1, Math.max(0, value)));
  return [
    red,
    green,
    blue
  ];
}
function rgbToHex(rgb) {
  return `#${rgb.map((value) => Math.round(value * 255).toString(16).padStart(2, "0")).join("")}`;
}
function labDistance(first, second) {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

// client/create/form.ts
function selectBoardSizeOption(event) {
  const button = event.currentTarget?.closest("[data-board-size-option]");
  const option = button?.dataset.boardSizeOption;
  const boardSize = document.querySelector("[name='boardSize']");
  const customGoban = document.querySelector("[name='customGobanMode']");
  if (!option || !boardSize || !customGoban) return;
  if (option === "cgoban") {
    customGoban.checked = true;
  } else {
    boardSize.value = option;
    customGoban.checked = false;
  }
  updateBoardSizeButtons();
  updateVariantOptions();
}
function updateBoardSizeButtons() {
  const boardSize = document.querySelector("[name='boardSize']");
  const customGoban = document.querySelector("[name='customGobanMode']");
  const selected = customGoban?.checked ? "cgoban" : boardSize?.value;
  for (const button of document.querySelectorAll("[data-board-size-option]")) {
    const active = button.dataset.boardSizeOption === selected;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    if (button.dataset.boardSizeOption === "cgoban") {
      button.disabled = Boolean(customGoban?.disabled);
    }
  }
}
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
  const teamGo = document.querySelector("[name='teamGo']")?.checked;
  if (teamGo) return teamGoSeatOptions();
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
function teamGoSeatOptions() {
  const colorGoEnabled = document.querySelector("[name='colorGo']")?.checked;
  const teamCount = colorGoEnabled ? Number(document.querySelector("[name='colorGoPlayerCount']")?.value ?? 3) : 2;
  const labels = Array.from({
    length: teamCount
  }, (_, index) => {
    const color = document.querySelector(`[name='colorGoColor${index + 1}']`)?.value;
    return nearestColorName(color ?? "#111111");
  });
  const options = labels.flatMap((label, teamIndex) => {
    const count = Number(document.querySelector(`[name='teamGoSeats${teamIndex + 1}']`)?.value ?? 0);
    return Array.from({
      length: Math.max(0, count)
    }, (_, seatIndex) => ({
      value: `team-${teamIndex + 1}-${seatIndex + 1}`,
      label: `${label} ${seatIndex + 1}`
    }));
  });
  return [
    ...options,
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
function updateColorGoKomiDefaults() {
  const count = Number(document.querySelector("[name='colorGoPlayerCount']")?.value ?? 2);
  const defaults = count >= 4 ? [
    0,
    3.5,
    5.5,
    7.5
  ] : count === 3 ? [
    0,
    5.5,
    7.5
  ] : [
    0,
    7.5
  ];
  for (let team = 2; team <= 4; team++) {
    const input = document.querySelector(`[name='colorGoKomi${team}']`);
    if (input) input.value = String(defaults[team - 1] ?? 0);
  }
}
function updateTeamColorNames(root = document) {
  for (let team = 1; team <= 4; team++) {
    const input = root.querySelector(`[name='colorGoColor${team}']`);
    if (!input) continue;
    const name = nearestColorName(input.value);
    const heading = root.querySelector(`[data-team-color-name='${team}']`);
    if (heading) heading.textContent = name;
    const label = root.querySelector(`[data-team-color-label='${team}']`);
    label?.setAttribute("aria-label", `${name} color`);
    input.title = name;
  }
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
  updateTeamColorNames();
  updateVariantConflicts();
  updateBoardSizeButtons();
  const colorGoEnabled = document.querySelector("[name='colorGo']")?.checked;
  const teamGoEnabled = document.querySelector("[name='teamGo']")?.checked;
  const colorGoCount = colorGoEnabled ? Number(document.querySelector("[name='colorGoPlayerCount']")?.value ?? 3) : 2;
  for (const setup of document.querySelectorAll("[data-team-setup-options]")) {
    setup.hidden = !colorGoEnabled && !teamGoEnabled;
  }
  for (const control of document.querySelectorAll("[data-color-go-control]")) {
    control.hidden = !colorGoEnabled;
  }
  for (const input of document.querySelectorAll("[data-team-go-seat]")) {
    input.hidden = !teamGoEnabled;
  }
  for (const label of document.querySelectorAll("[data-team-go-seat-label]")) {
    label.hidden = !teamGoEnabled;
  }
  for (const option of document.querySelectorAll("[data-color-go-player]")) {
    const hidden = Number(option.dataset.colorGoPlayer) > colorGoCount;
    option.hidden = hidden;
    option.style.display = hidden ? "none" : "";
  }
  const nPlusOneEnabled = document.querySelector("[name='nPlusOne']")?.checked;
  const hiddenEnabled = document.querySelector("[name='hiddenMove']")?.checked;
  const traitorEnabled = document.querySelector("[name='traitor']")?.checked;
  const phantomEnabled = document.querySelector("[name='phantomMove']")?.checked;
  for (const group of document.querySelectorAll("[data-variant-count-group]")) {
    group.hidden = !nPlusOneEnabled && !hiddenEnabled && !traitorEnabled;
  }
  const traitorMode = document.querySelector("[name='traitorMode']")?.value ?? "moves";
  for (const input of document.querySelectorAll("[data-traitor-mode-value]")) {
    const hidden = input.dataset.traitorModeValue !== traitorMode;
    input.hidden = hidden;
    input.disabled = hidden;
  }
  const invisibleStonesEnabled = Boolean(phantomEnabled || hiddenEnabled);
  for (const control of document.querySelectorAll("[data-invisible-stones-control]")) {
    control.hidden = !invisibleStonesEnabled;
    for (const input of control.querySelectorAll("input")) {
      input.disabled = !invisibleStonesEnabled;
    }
  }
  const scroller = document.querySelector(".panel-card");
  const scrollTop = scroller?.scrollTop ?? 0;
  for (const option of document.querySelectorAll("[data-variant-option]")) {
    const input = document.querySelector(`[name='${option.dataset.variantOption}']`);
    const hidden = !input?.checked;
    option.hidden = hidden;
    option.style.display = hidden ? "none" : "";
  }
  const divider = document.querySelector("[data-variant-options-divider]");
  if (divider) divider.hidden = false;
  requestAnimationFrame(() => {
    if (scroller) scroller.scrollTop = scrollTop;
    scrollTo(0, 0);
  });
}
function invalidVariantComboMessage(data) {
  return variantConfigProblems({
    variants: {
      ...Object.fromEntries(VARIANT_KEYS.map((key) => [
        key,
        data.has(key)
      ])),
      nPlusOneCount: Number(data.get("nPlusOneCount"))
    },
    boardSize: Number(data.get("boardSize")),
    customGoban: data.has("customGobanMode"),
    ruleset: String(data.get("ruleset") ?? ""),
    handicap: Number(data.get("handicap") ?? 0)
  })[0] ?? "";
}
function updateVariantConflicts() {
  const boardSize = document.querySelector("[name='boardSize']");
  const josekiCard = document.querySelector("[name='josekiCard']");
  const customGoban = document.querySelector("[name='customGobanMode']");
  const tetris = document.querySelector("[name='tetris']");
  const nPlusOne = document.querySelector("[name='nPlusOne']");
  const nPlusOneCount = document.querySelector("[name='nPlusOneCount']");
  if (!boardSize || !josekiCard || !customGoban || !tetris || !nPlusOne || !nPlusOneCount) return;
  const variants = new Map(VARIANT_KEYS.flatMap((key) => {
    const input = document.querySelector(`[name='${key}']`);
    return input ? [
      [
        key,
        input
      ]
    ] : [];
  }));
  for (const [key, input] of variants) {
    for (const other of conflictingVariants(key)) {
      const otherInput = variants.get(other);
      if (otherInput) resolveExclusivePair(input, otherInput);
    }
  }
  if (josekiCard.checked) {
    boardSize.value = "19";
    if (customGoban.checked) customGoban.checked = false;
  }
  const tetrisBlockedByNPlusOne = nPlusOne.checked && Number(nPlusOneCount.value) === 4;
  if (tetrisBlockedByNPlusOne && tetris.checked) tetris.checked = false;
  for (const [key, input] of variants) {
    setVariantDisabled(input, conflictingVariants(key).some((other) => variants.get(other)?.checked));
  }
  if (tetrisBlockedByNPlusOne) setVariantDisabled(tetris, true);
  if (customGoban.checked) setVariantDisabled(josekiCard, true);
  setVariantDisabled(customGoban, josekiCard.checked);
  boardSize.setCustomValidity(josekiCard.checked && Number(boardSize.value) !== 19 ? "Joseki Card requires a 19\xD719 board." : "");
  nPlusOneCount.setCustomValidity(tetris.checked && Number(nPlusOneCount.value) === 4 ? "Tetris cannot use N+1 count 4." : "");
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
  dialog.className = "ui-dialog joseki-card-dialog";
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
    <div class="dialog-scroll ui-scroll">${josekiCardGridHtml(cards)}</div>
  `;
}

// client/game/shape-card-state.ts
var selection;
var selectedStoneColor = "self";
var colorCardKey = "";
function turnHandSeatId(game) {
  const seatId = game.seats[game.turn]?.id;
  return seatId && game.shapeCards?.hands[seatId] ? seatId : void 0;
}
function selectedShapeCardIndex(game) {
  if (!selection || selection.gameId !== String(game.id)) return void 0;
  if (game.phase !== "play" || game.shapeCards?.active) return void 0;
  const seatId = turnHandSeatId(game);
  if (!seatId || seatId !== selection.seatId) return void 0;
  const hand = game.shapeCards?.hands[seatId] ?? [];
  if (hand[selection.index] === selection.cardId) return selection.index;
  const moved = hand.indexOf(selection.cardId);
  return moved >= 0 ? moved : void 0;
}
function selectShapeCard(game, index) {
  const seatId = turnHandSeatId(game);
  const cardId = seatId !== void 0 && index !== void 0 ? game.shapeCards?.hands[seatId]?.[index] : void 0;
  selection = seatId && cardId && index !== void 0 ? {
    gameId: String(game.id),
    seatId,
    index,
    cardId
  } : void 0;
  selectedStoneColor = "self";
  resetShapeStamp();
}
function currentShapeCard(game) {
  const view = game.shapeCards;
  if (!view) return void 0;
  if (view.active) return view.cards[view.active.cardId];
  const index = selectedShapeCardIndex(game);
  const seatId = turnHandSeatId(game);
  const cardId = index !== void 0 && seatId ? view.hands[seatId]?.[index] : void 0;
  return cardId ? view.cards[cardId] : void 0;
}
function currentShapeCardHasBothColors(game) {
  const card = currentShapeCard(game);
  return Boolean(card && new Set(card.stones.map((stone) => stone.rel)).size > 1);
}
function shapeStoneColor(game) {
  const card = currentShapeCard(game);
  if (!card) return "self";
  const key = `${game.id}:${card.id}`;
  if (key !== colorCardKey) selectedStoneColor = "self";
  colorCardKey = key;
  if (!currentShapeCardHasBothColors(game)) return card.stones[0]?.rel ?? "self";
  return selectedStoneColor;
}
function setShapeStoneColor(color) {
  selectedStoneColor = color;
}
function shapeOpponentTeam(game, team) {
  return game.seats.find((seat) => !seat.resigned && seat.team !== team)?.team ?? (team === 1 ? 2 : 1);
}
function shapePreviewTeam(game) {
  if (!currentShapeCard(game)) return void 0;
  const team = game.seats[game.turn]?.team ?? 1;
  return shapeStoneColor(game) === "self" ? team : shapeOpponentTeam(game, team);
}
var stampRotation = 0;
var stampMirrored = false;
function isFullShapeMode(game) {
  return Boolean(game.config.variants?.shapeCardFull);
}
function rotateShapeStamp() {
  stampRotation = (stampRotation + 1) % 4;
}
function mirrorShapeStamp() {
  stampMirrored = !stampMirrored;
}
function resetShapeStamp() {
  stampRotation = 0;
  stampMirrored = false;
}
function stampOrientation(card) {
  let stones = card.stones.map((stone) => ({
    ...stone,
    x: stampMirrored ? -stone.x : stone.x
  }));
  for (let turn = 0; turn < stampRotation; turn++) {
    stones = stones.map((stone) => ({
      ...stone,
      x: -stone.y,
      y: stone.x
    }));
  }
  const minX = Math.min(...stones.map((stone) => stone.x));
  const minY = Math.min(...stones.map((stone) => stone.y));
  return stones.map((stone) => ({
    ...stone,
    x: stone.x - minX,
    y: stone.y - minY
  }));
}
function stampStonesAt(card, point) {
  const stones = stampOrientation(card);
  const centerX = Math.floor(Math.max(...stones.map((stone) => stone.x)) / 2);
  const centerY = Math.floor(Math.max(...stones.map((stone) => stone.y)) / 2);
  return stones.map((stone) => ({
    x: point.x + stone.x - centerX,
    y: point.y + stone.y - centerY,
    rel: stone.rel
  }));
}

// client/game/katachi-controls.ts
var DEFAULTS = {
  placeButton: "left",
  rotateKey: "r",
  mirrorKey: "f"
};
function readKatachiControls() {
  try {
    const placeButton = localStorage.getItem("baduk:katachi-place-button") === "right" ? "right" : "left";
    return {
      placeButton,
      rotateKey: validKey(localStorage.getItem("baduk:katachi-rotate-key")) ?? DEFAULTS.rotateKey,
      mirrorKey: validKey(localStorage.getItem("baduk:katachi-mirror-key")) ?? DEFAULTS.mirrorKey
    };
  } catch {
    return {
      ...DEFAULTS
    };
  }
}
function saveKatachiControls(controls) {
  try {
    localStorage.setItem("baduk:katachi-place-button", controls.placeButton);
    localStorage.setItem("baduk:katachi-rotate-key", controls.rotateKey);
    localStorage.setItem("baduk:katachi-mirror-key", controls.mirrorKey);
  } catch {
  }
}
function placeMouseButton(controls = readKatachiControls()) {
  return controls.placeButton === "right" ? 2 : 0;
}
function rotateMouseButton(controls = readKatachiControls()) {
  return controls.placeButton === "right" ? 0 : 2;
}
function validKey(value) {
  const key = value?.trim().toLowerCase();
  return key && key.length === 1 ? key : void 0;
}

// client/game/shape-cards.ts
function shapeHandPanelHtml(game, session2, viewingHistory = false, historyEntry) {
  const view = game.shapeCards;
  if (!view) return "";
  if (viewingHistory) return playedCardPanelHtml(game, historyEntry);
  const handSeat = shapeHandSeat(game, session2);
  const turnSeat = game.seats[game.turn];
  const myTurn = !viewingHistory && game.phase === "play" && Boolean(handSeat) && handSeat?.id === turnSeat?.id;
  const hand = handSeat ? view.hands[handSeat.id] ?? [] : [];
  const team = handSeat?.team ?? 1;
  const active = view.active;
  const activeCard = active ? view.cards[active.cardId] : void 0;
  const selectedIndex = myTurn ? selectedShapeCardIndex(game) : void 0;
  const selectedCard = selectedIndex !== void 0 ? view.cards[hand[selectedIndex]] : void 0;
  const activeIndex = myTurn && active ? hand.indexOf(active.cardId) : -1;
  const canSelect = myTurn && !active;
  const status = handStatus(game, {
    myTurn,
    hasHand: Boolean(handSeat),
    activeCard,
    selectedCard
  });
  const opponentActive = active && activeCard && !myTurn ? `<div class="shape-hand-playing">${shapeCardHtml(activeCard, ...teamsFor(game, seatTeam(game, active.seatId)), true)}</div>` : "";
  const grid = handSeat ? `<div class="shape-hand-grid">${hand.map((cardId, index) => {
    const card = view.cards[cardId];
    if (!card) return "";
    const selected = index === selectedIndex || index === activeIndex;
    const face = selected && isFullShapeMode(game) ? {
      ...card,
      stones: stampOrientation(card)
    } : card;
    return shapeCardHtml(face, ...teamsFor(game, team), selected, {
      index,
      disabled: !canSelect
    });
  }).join("")}</div>` : "";
  return `
    <section class="shape-hand-panel ui-stack" aria-label="Katachi hand" data-shape-hand>
      <h3>${handSeat ? "Your hand" : "Katachi cards"}</h3>
      <p class="shape-hand-status" aria-live="polite">${status}</p>
      ${opponentActive}
      ${grid}
      ${myTurn ? handActionsHtml(game, Boolean(active), selectedCard !== void 0) : ""}
      ${handSeat ? ownDeckHtml(view, handSeat.id) : pilesHtml(game)}
    </section>
  `;
}
function playedCardPanelHtml(game, entry) {
  const played = entry?.shapeCard;
  const card = played ? game.shapeCards?.cards[played.cardId] : void 0;
  const body = played && card ? `<p class="shape-hand-status"><strong>${escapeHtml(seatName(game, played.seatId))}</strong> ${played.discarded ? `discarded <strong>${escapeHtml(card.name)}</strong>.` : played.stone === void 0 ? `played <strong>${escapeHtml(card.name)}</strong>.` : `played <strong>${escapeHtml(card.name)}</strong> \xB7 stone ${played.stone} of ${played.total}.`}</p>
      <div class="shape-hand-playing">${shapeCardHtml(card, ...teamsFor(game, seatTeam(game, played.seatId)), true)}</div>` : `<p class="shape-hand-status">No card was played on this move.</p>`;
  return `
    <section class="shape-hand-panel ui-stack" aria-label="Played card" data-shape-hand>
      <h3>Played card</h3>
      ${body}
    </section>
  `;
}
function ownDeckHtml(view, seatId) {
  const drawCount = view.seats.find((seat) => seat.seatId === seatId)?.drawCount ?? 0;
  return `<p class="muted-text">${drawCount} in deck</p>`;
}
function pilesHtml(game) {
  const view = game.shapeCards;
  return `<ul class="shape-card-piles muted-text">${view.seats.map((seat) => {
    const lastDiscard = seat.discard.at(-1);
    return `<li><strong>${escapeHtml(seatName(game, seat.seatId))}</strong> \xB7 ${seat.handCount} in hand \xB7 ${seat.drawCount} in deck${lastDiscard ? ` \xB7 last discard: ${escapeHtml(view.cards[lastDiscard]?.name ?? lastDiscard)}` : ""}</li>`;
  }).join("")}</ul>`;
}
function handStatus(game, state) {
  const active = game.shapeCards?.active;
  if (game.phase === "joseki") return "Your cards are ready for when normal play begins.";
  if (game.phase !== "play") return "";
  if (state.myTurn && active && state.activeCard) {
    return `Placing <strong>${escapeHtml(state.activeCard.name)}</strong>: ${active.placed.length} / ${state.activeCard.stones.length} stones, in any order.`;
  }
  if (state.myTurn && state.selectedCard && isFullShapeMode(game)) {
    const controls = readKatachiControls();
    const place = controls.placeButton === "right" ? "Right-click" : "Left-click";
    const rotate = controls.placeButton === "right" ? "left-click" : "right-click";
    return `${place} to place <strong>${escapeHtml(state.selectedCard.name)}</strong>; ${rotate} or ${controls.rotateKey.toUpperCase()} rotates, ${controls.mirrorKey.toUpperCase()} mirrors.`;
  }
  if (state.myTurn && state.selectedCard) {
    return `Click the board to play <strong>${escapeHtml(state.selectedCard.name)}</strong>, or discard it.`;
  }
  if (state.myTurn) return "Your turn: select a card.";
  const name = escapeHtml(seatName(game, game.seats[game.turn]?.id ?? ""));
  if (active && state.activeCard) {
    return `${name} is playing <strong>${escapeHtml(state.activeCard.name)}</strong> (${active.placed.length} / ${state.activeCard.stones.length}).`;
  }
  return `${name}'s turn.`;
}
function handActionsHtml(game, active, selected) {
  if (!active && !selected) return "";
  const color = shapeStoneColor(game);
  const toggle = currentShapeCardHasBothColors(game) ? `<div class="actions shape-card-color" role="group" aria-label="Stone color">
        <button type="button" class="${color === "self" ? "is-active" : ""}" data-shape-color="self" aria-pressed="${color === "self"}">My stone</button>
        <button type="button" class="${color === "opponent" ? "is-active" : ""}" data-shape-color="opponent" aria-pressed="${color === "opponent"}">Opponent stone</button>
      </div>` : "";
  const placed = game.shapeCards?.active?.placed.length ?? 0;
  const buttons = active ? `<button type="button" data-shape-undo ${placed === 0 ? "disabled" : ""}>Undo stone</button>
       <button type="button" data-shape-cancel>Cancel card</button>` : isFullShapeMode(game) ? `<button type="button" data-shape-rotate aria-label="Rotate (R)">Rotate</button>
       <button type="button" data-shape-mirror aria-label="Mirror (F)">Mirror</button>
       <button type="button" data-shape-discard>Discard</button>` : `<button type="button" data-shape-discard>Discard</button>`;
  return `${toggle}<div class="actions shape-hand-actions">${buttons}</div>`;
}
function shapeCardHtml(card, team = 1, opponent = 2, selected = false, button) {
  const stones = card.stones.map((stone) => ({
    x: stone.x,
    y: stone.y,
    color: stone.rel === "self" ? team : opponent
  }));
  const bounds2 = shapeCardBounds(stones);
  const tag = button ? "button" : "span";
  const buttonAttrs = button ? ` type="button" data-shape-index="${button.index}" aria-pressed="${selected}"${button.disabled ? " disabled" : ""}` : "";
  return `
    <${tag} class="j-card shape-card ${selected ? "is-selected" : ""}" data-shape-card-id="${escapeHtml(card.id)}"${buttonAttrs}>
      <span class="shape-card__name">${escapeHtml(card.name)}</span>
      <span class="shape-card__frame">${josekiCardBoardHtml(stones, bounds2)}</span>
      <span class="j-card__meta">${card.stones.length} stones</span>
    </${tag}>`;
}
var MIN_SHAPE_BOARD_LINES = 5;
function shapeCardBounds(stones) {
  const axis = (values) => {
    const min = Math.min(...values);
    const span = Math.max(...values) - min + 1;
    const size = Math.max(MIN_SHAPE_BOARD_LINES, span + 2);
    return {
      start: min - Math.floor((size - span) / 2),
      size
    };
  };
  const x = axis(stones.map((stone) => stone.x));
  const y = axis(stones.map((stone) => stone.y));
  return {
    minX: x.start,
    minY: y.start,
    width: x.size,
    height: y.size
  };
}
function shapeHandSeat(game, session2) {
  const hands = game.shapeCards?.hands ?? {};
  const owned = game.seats.filter((seat) => seat.playerUuid && seat.playerUuid === session2?.uuid && hands[seat.id]);
  return owned.find((seat) => seat.id === game.seats[game.turn]?.id) ?? owned[0];
}
function teamsFor(game, team) {
  return [
    team,
    shapeOpponentTeam(game, team)
  ];
}
function shapeCardGridHtml(cards) {
  return `<div class="j-card-grid">${cards.map((card) => `<div class="shape-card-slot">${shapeCardHtml(card)}</div>`).join("")}</div>`;
}
function seatTeam(game, seatId) {
  return game.seats.find((seat) => seat.id === seatId)?.team ?? 1;
}
function seatName(game, seatId) {
  const seat = game.seats.find((seat2) => seat2.id === seatId);
  return seat?.publicName || seat?.id || seatId;
}

// client/create/shape-card-dialog.ts
async function openShapeCardDialog(statusElement2) {
  const response = await listShapeCards();
  if (!response.ok) {
    if (statusElement2) statusElement2.textContent = "Could not load Katachi cards.";
    return;
  }
  const { cards: allCards } = await response.json();
  const cards = allCards.filter((card) => card.count > 0);
  const total = cards.reduce((sum, card) => sum + card.count, 0);
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog joseki-card-dialog";
  dialog.innerHTML = `
    <button class="dialog-close" type="button" aria-label="Close">\xD7</button>
    <h3>Katachi Cards</h3>
    <p class="ui-muted">Each player shuffles their own ${total}-card copy of this deck.
      You play a card's stones in your own color, rotated or mirrored any way.</p>
    <div class="dialog-scroll ui-scroll">${shapeCardGridHtml(cards)}</div>
  `;
  document.body.append(dialog);
  dialog.querySelector(".dialog-close")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

// client/create/form-bind.ts
function bindCreateGameForm(submitHandler, statusElement2, root = document) {
  restoreCustomGobanAutosave(root);
  refreshCustomGobanPreset(root);
  root.querySelector("#create-game-form")?.addEventListener("submit", submitHandler);
  root.querySelector("[name='timeSystem']")?.addEventListener("change", updateTimeOptions);
  root.querySelector("[name='ruleset']")?.addEventListener("change", updateRuleDefaults);
  root.querySelector("[name='handicap']")?.addEventListener("change", updateRuleDefaults);
  for (const button of root.querySelectorAll("[data-board-size-option]")) {
    button.addEventListener("click", (event) => {
      selectBoardSizeOption(event);
      refreshCustomGobanPreset(root);
    });
  }
  root.querySelector("[name='colorGoPlayerCount']")?.addEventListener("change", () => {
    updateColorGoKomiDefaults();
    updateVariantOptions();
    updateCreatorSeatOptions();
  });
  root.querySelector("[name='zenPlayerCount']")?.addEventListener("change", updateCreatorSeatOptions);
  root.querySelector("[name='nPlusOneCount']")?.addEventListener("input", updateVariantOptions);
  root.querySelector("[name='traitorMode']")?.addEventListener("change", updateVariantOptions);
  for (const input of root.querySelectorAll("[name^='teamGoSeats']")) {
    input.addEventListener("input", updateCreatorSeatOptions);
  }
  for (const input of root.querySelectorAll("[name^='colorGoColor']")) {
    input.addEventListener("input", () => {
      updateTeamColorNames(root);
      updateCreatorSeatOptions();
    });
  }
  root.querySelector(".custom-goban-open")?.addEventListener("click", () => openCustomGobanEditor(statusElement2));
  root.querySelector("[name='gobanPreset']")?.addEventListener("change", () => applyGobanPreset(root));
  root.querySelector(".shape-card-open")?.addEventListener("click", () => openShapeCardDialog(statusElement2));
  root.querySelector(".joseki-card-open")?.addEventListener("click", () => openJosekiCardDialog(statusElement2));
  root.querySelector("[data-seat-toggle]")?.addEventListener("click", cycleCreatorSeat);
  for (const input of root.querySelectorAll(".variant-button input")) {
    input.addEventListener("change", updateVariantOptions);
    input.addEventListener("change", updateCreatorSeatOptions);
    input.addEventListener("change", () => refreshCustomGobanPreset(root));
  }
  refreshCreateGameForm();
}
function refreshCreateGameForm() {
  updateTimeOptions();
  updateRuleDefaults();
  updateBoardSizeButtons();
  updateTeamColorNames();
  updateVariantOptions();
  updateCreatorSeatOptions();
  refreshCustomGobanPreset();
}

// client/game/variants.ts
var ALL_VARIANT_RULES = [
  {
    label: "Custom",
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
    label: "Katachi",
    rule: "Each turn, play a card by placing all of its stones (any rotation or mirror, any order, each a legal move) or discard one, then draw. The game ends when both players pass, when a deck runs out, or both agree to scoring. Full option: place the whole card at once as a single move (every point must be empty; captures, suicide and ko are checked once for the whole shape). Reshuffle option: shuffle your discards into a new deck when it runs out, so the game only ends by passing."
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
    label: "Magnetic",
    rule: "Placing a stone affects the nearest stone in each of the four directions: an opponent stone is pulled in until it touches the new stone, and your own stone is pushed away until it hits a stone or the edge. Only that first stone moves, with no chain reactions. Captures are checked after the stones move, and your own stones left without liberties are captured instead of the move being illegal."
  },
  {
    label: "N+1",
    rule: "Making exactly N stones in a row grants an extra turn."
  },
  {
    label: "Random Turn",
    rule: "After each turn, one active player is chosen randomly to play next."
  },
  {
    label: "Team Go",
    rule: "Each color can have multiple seats; turns rotate by color team and then seat."
  },
  {
    label: "Traitor",
    rule: "Some stones may play as another color, using either a move limit or fixed chance."
  }
];
function variantRuleText(label) {
  return ALL_VARIANT_RULES.find((rule) => rule.label === label)?.rule;
}
function ruleSentences(rule) {
  return rule?.split(/(?<=\.)\s+/) ?? [];
}
function ruleBodyHtml(rule) {
  const sentences = ruleSentences(rule);
  if (sentences.length < 2) return `<p class="rule-body">${escapeHtml(rule)}</p>`;
  return `<ul class="rule-body">${sentences.map((sentence) => `<li>${escapeHtml(sentence)}</li>`).join("")}</ul>`;
}
function variantsHtml(game) {
  const rules = activeVariantRules(game);
  return rules.map(({ label, rule, html }) => html ?? `<span title="${escapeAttr(rule)}">${label}</span>`).join(", ") || "None";
}
function inviteRulesHtml(game) {
  const rules = activeVariantRules(game);
  if (rules.length === 0) return `<p class="muted-text">No active variants.</p>`;
  return rules.map(({ label, rule }) => `<div class="rule-entry"><strong>${escapeHtml(label)}</strong>${ruleBodyHtml(rule)}</div>`).join("");
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
      ${ALL_VARIANT_RULES.map(({ label, rule }) => `<details><summary>${label}</summary>${ruleBodyHtml(rule)}</details>`).join("")}
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
      label: "Custom",
      rule,
      html: `<button class="variant-button variant-meta-button" data-cgoban-preview title="${escapeAttr(rule)}" type="button">Custom</button>`
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
  if (variants.shapeCards) {
    rules.push({
      label: "Katachi",
      rule: `Hand of ${variants.shapeCardHandSize ?? 4}. ` + (variants.shapeCardFull ? "Full: each turn, play a whole card at once as one move (any rotation or mirror; every point must be empty) or discard one, then draw. " : "Each turn, play a card by placing all of its stones (any rotation or mirror, any order, each a legal move) or discard one, then draw. ") + (variants.shapeCardReshuffle ? "Reshuffle: an empty deck reshuffles your discards, so the game ends when both players pass and agree to scoring." : "The game ends when both players pass, when a deck runs out, or both agree to scoring.")
    });
  }
  if (variants.magnetic) {
    rules.push({
      label: "Magnetic",
      rule: "Placing a stone affects the nearest stone in each of the four directions: an opponent stone is pulled in until it touches the new stone, and your own stone is pushed away until it hits a stone or the edge. Only that first stone moves, with no chain reactions. Captures are checked after the stones move, and your own stones left without liberties are captured instead of the move being illegal."
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
  if (variants.teamGo) {
    rules.push({
      label: "Team Go",
      rule: `Team seats: ${(variants.teamGoSeatCounts ?? []).join(" / ")}`
    });
  }
  if (variants.randomTurn) {
    rules.push({
      label: "Random Turn",
      rule: "After each turn, one active player is chosen randomly to play next."
    });
  }
  if (variants.traitor) {
    if (variants.traitorMode === "percentage") {
      const chance = variants.traitorChance ?? 10;
      rules.push({
        label: `Traitor chance (${chance}%)`,
        rule: `Each move has a fixed ${chance}% chance to play as another color.`
      });
    } else {
      rules.push({
        label: `Traitor moves (${variants.traitorStoneCount ?? 6})`,
        rule: `Some stones may play as another color (${variants.traitorStoneCount ?? 6} traitor moves).`
      });
    }
  }
  return rules;
}
function escapeAttr(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

// client/create/try-playing.ts
var TRY_PLAYING_SUGGESTIONS = [
  ...VARIANT_KEYS.map((id) => ({
    kind: "variant",
    id,
    name: VARIANT_LABELS[id],
    rules: ruleSentences(variantRuleText(VARIANT_LABELS[id]))
  })),
  ...GOBAN_PRESETS.map(({ id, name, description }) => ({
    kind: "board",
    id,
    name: `${name} board`,
    rules: [
      description
    ]
  }))
];
function pickSuggestion(random = Math.random) {
  const index = Math.floor(random() * TRY_PLAYING_SUGGESTIONS.length);
  return TRY_PLAYING_SUGGESTIONS[Math.min(index, TRY_PLAYING_SUGGESTIONS.length - 1)];
}
var NEVER_KEY = "baduk:try-playing-closed";
function shouldShowTryPlaying(permanent) {
  try {
    return permanent.getItem(NEVER_KEY) === null;
  } catch {
    return false;
  }
}
function closeForGood() {
  try {
    localStorage.setItem(NEVER_KEY, "true");
  } catch {
  }
}
function showTryPlaying() {
  removeTryPlaying();
  if (!shouldShowTryPlaying(localStorage)) return;
  const suggestion = pickSuggestion();
  const dialog = document.createElement("dialog");
  dialog.className = "ui-dialog try-playing";
  dialog.innerHTML = `
    <button class="dialog-close" type="button" data-try="close" aria-label="Close">\xD7</button>
    <h3>Try playing: ${escapeHtml(suggestion.name)}</h3>
    <h4>How it plays</h4>
    <ul class="dialog-scroll" tabindex="0">
      ${suggestion.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}
    </ul>
    <div class="try-playing__actions">
      <button type="button" data-try="never">Don't show again</button>
      <button type="button" data-try="go" autofocus>Try it</button>
    </div>
  `;
  dialog.addEventListener("click", (event) => {
    const action = event.target?.closest("[data-try]")?.dataset.try;
    if (!action) return;
    dialog.close();
    if (action === "go") applySuggestion(suggestion);
    if (action === "never") closeForGood();
  });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
function removeTryPlaying() {
  document.querySelector(".try-playing")?.remove();
}
function applySuggestion(suggestion) {
  for (const input of document.querySelectorAll(".variant-buttons input")) {
    input.checked = false;
  }
  const customBoard = document.querySelector("[name='customGobanMode']");
  if (customBoard) customBoard.checked = false;
  let shown = null;
  if (suggestion.kind === "board") {
    const select = document.querySelector("[name='gobanPreset']");
    if (select) select.value = suggestion.id;
    applyGobanPreset();
    shown = document.querySelector(".custom-board-settings");
    updateVariantOptions();
  } else {
    const input = document.querySelector(`[name='${suggestion.id}']`);
    if (input) {
      input.checked = true;
      input.dispatchEvent(new Event("change", {
        bubbles: true
      }));
    }
    shown = input?.closest(".variant-button") ?? null;
  }
  updateBoardSizeButtons();
  shown?.scrollIntoView({
    block: "center"
  });
}

// client/game/display.ts
function winnerText(game) {
  const names = (game.winnerTeams ?? []).map((team) => {
    const seat = game.seats.find((seat2) => seat2.team === team);
    return escapeHtml(seat?.publicName ?? seat?.id ?? `Team ${team}`);
  });
  return names.length > 1 ? `Tie: ${names.join(", ")}` : names[0];
}
function resultText(game) {
  const winners = winningTeams(game);
  if (game.phase !== "done" || winners.length === 0) return "";
  if (winners.length > 1) return winnerText({
    ...game,
    winnerTeams: winners
  });
  const winnerTeam = winners[0];
  const prefix = colorResultPrefix(stoneColor(game, winnerTeam));
  if (game.endReason === "resign") return `${prefix}+R`;
  if (game.endReason === "timeout") return `${prefix}+T`;
  if (game.endReason === "unknown") return `${prefix}+`;
  const lastAction = game.history?.at(-1)?.action;
  const wonByResignation = lastAction === "resign" || game.seats.some((seat) => seat.resigned && seat.team !== winnerTeam);
  if (!game.endReason && wonByResignation) return `${prefix}+R`;
  const winnerScore = game.points?.[winnerTeam - 1];
  const activeTeams = new Set(game.seats.filter((seat) => !seat.resigned).map((seat) => seat.team));
  const nextBestScore = Math.max(...game.points.map((score, index) => index + 1 !== winnerTeam && activeTeams.has(index + 1) ? score : -Infinity));
  const margin = winnerScore - nextBestScore;
  return Number.isFinite(margin) ? `${prefix}+${formatPoints(margin)}` : prefix;
}
function winningTeams(game) {
  if (game.winnerTeams?.length) return game.winnerTeams;
  if (game.phase !== "done") return [];
  const activeTeams = [
    ...new Set(game.seats.filter((seat) => !seat.resigned).map((seat) => seat.team))
  ];
  return activeTeams.length === 1 ? activeTeams : [];
}
function formatPoints(points) {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
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
  const team = placementPreviewTeam(game);
  return colorDotHtml(game, team, team, "active-stone");
}
function seatDisplayTeam(game, seat) {
  return game.config.variants?.zen ? 0 : seat.team;
}
function stoneColor(game, team) {
  const color = game.config.variants?.colorGoColors?.[team - 1];
  if (color) return color;
  const defaults = [
    "#080808",
    "#eeeeee",
    "#4f9d69",
    "#e07a5f",
    "#6c8cff"
  ];
  return defaults[team - 1] ?? "#777777";
}
function stoneTone(hex) {
  const lightness = colorLightness(hex) ?? 50;
  return lightness >= 70 ? "light" : lightness <= 25 ? "dark" : "mid";
}
function lastMoveDotColor(hex) {
  return oppositeColor(hex) ?? hex;
}
function colorDotHtml(game, colorTeam, dataTeam = colorTeam, className = "") {
  const color = stoneColor(game, colorTeam);
  return `<i class="color-dot${className ? ` ${className}` : ""}" data-team="${dataTeam}" data-tone="${stoneTone(color)}" style="--stone-color: ${color}"></i>`;
}
function teamColorName(game, team) {
  return nearestColorName(stoneColor(game, team));
}
function placementPreviewTeam(game) {
  const shapeTeam = shapePreviewTeam(game);
  if (shapeTeam !== void 0) return shapeTeam;
  const activeTeam = game.seats[game.turn]?.team ?? 1;
  return game.config.variants?.zen ? (game.playMoves ?? 0) % 2 + 1 : activeTeam;
}
function seatMetaHtml(game, seat) {
  if (game.phase === "done" && winningTeams(game).includes(seat.team)) return "Winner!";
  const clockText = seatClockText(game, seat);
  if (game.phase === "done" && winningTeams(game).includes(seat.team)) return "Winner!";
  const lines = [
    clockText
  ];
  if (game.config.variants?.traitor) {
    if (game.config.variants.traitorMode === "percentage") {
      lines.push(`TG: ${game.config.variants.traitorChance ?? 10}%`);
    } else {
      const used = game.traitorStonesPlaced?.[seat.team - 1] ?? 0;
      const total = game.config.variants.traitorStoneCount ?? 6;
      lines.push(`TG: ${Math.max(0, total - used)}`);
    }
  }
  return lines.join("<br />");
}
function seatClockText(game, seat) {
  const time = game.config.time;
  if (seat.resigned || !time || time.system === "none" || game.config.variants?.zen) return "--:--";
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
    display.mainLeft = 0;
    display.periodLeft = 0;
    display.periodsLeft = 0;
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

// client/game/optimistic.ts
var PREVIEW_SAFE_SWITCHES = /* @__PURE__ */ new Set([
  "capturesGivePoints"
]);
function isPlainGame(game) {
  return Object.entries(game.config.variants ?? {}).every(([key, value]) => typeof value !== "boolean" || !value || PREVIEW_SAFE_SWITCHES.has(key));
}
function optimisticPlacement(game, session2, action, pending) {
  if (pending || action.type !== "place" || game.phase !== "play") return void 0;
  if (!isPlainGame(game)) return void 0;
  const { x, y } = action;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= game.boardWidth || y >= game.boardHeight) {
    return void 0;
  }
  const index = y * game.boardWidth + x;
  if (game.board[index] !== 0) return void 0;
  const seat = currentActionSeat(game, session2, "play");
  if (!seat) return void 0;
  return {
    gameId: game.id,
    index,
    team: seat.team,
    playMoves: game.playMoves ?? 0
  };
}
function isPendingSettled(pending, game) {
  if (String(pending.gameId) !== String(game.id)) return true;
  return (game.playMoves ?? 0) > pending.playMoves || game.board[pending.index] !== 0 || game.phase !== "play";
}

// client/game/board-size-warning.ts
var PHONE_QUERY = "(max-width: 759px)";
function shouldWarnAboutBoardSize(game, isPhone = matchMedia(PHONE_QUERY).matches) {
  if (!isPhone) return false;
  const frame = boardFrame(game, false);
  return exceedsPhoneFriendlySize(frame.columns, frame.rows);
}
function confirmJoinOnPhone(game) {
  if (!shouldWarnAboutBoardSize(game)) return Promise.resolve(true);
  const frame = boardFrame(game, false);
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "ui-dialog board-size-dialog";
    dialog.innerHTML = `
      <h3>Large board</h3>
      <p>This board is ${frame.columns}\xD7${frame.rows}, larger than 19\xD719. On a phone the stones
        will be small and may be hard to tap.</p>
      <div class="board-size-dialog__actions">
        <button type="button" data-choice="cancel">Cancel</button>
        <button type="button" data-choice="join">Join anyway</button>
      </div>
    `;
    let joined = false;
    dialog.addEventListener("click", (event) => {
      const choice = event.target?.closest("[data-choice]")?.dataset.choice;
      if (!choice) return;
      joined = choice === "join";
      dialog.close();
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(joined);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
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
  bindShapeCards(options);
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
  const showPreview = (event) => {
    if (!board) return;
    const card = fullModeShapeCard(game);
    if (!card) return setBoardPreview(board, game, event, showCoordinates2);
    clearBoardPreview(board);
    const point = placementPointFromEvent(board, game, event, showCoordinates2);
    lastStampPoint = point;
    showShapeStamp(board, game, point ? stampStonesAt(card, point) : []);
  };
  const clearPreview = () => {
    clearBoardPreview(board);
    clearShapeStamp(board);
    lastStampPoint = void 0;
  };
  board?.addEventListener("contextmenu", (event) => event.preventDefault());
  board?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    activePointerId = event.pointerId;
    board.setPointerCapture(event.pointerId);
    showPreview(event);
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
        showPreview(event);
      }
      return;
    }
    event.preventDefault();
    showPreview(event);
  });
  board?.addEventListener("pointerleave", () => {
    if (activePointerId === void 0) clearPreview();
  });
  board?.addEventListener("pointercancel", () => {
    activePointerId = void 0;
    clearPreview();
  });
  board?.addEventListener("pointerup", async (event) => {
    if (activePointerId !== event.pointerId) return;
    event.preventDefault();
    activePointerId = void 0;
    const point = placementPointFromEvent(board, game, event, showCoordinates2);
    clearPreview();
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
    } else if (game.phase === "play" && game.shapeCards && isFullShapeMode(game)) {
      if (event.button === rotateMouseButton() && fullModeShapeCard(game)) {
        rotateShapeStamp();
        refreshShapeHand?.();
        showPreview(event);
      } else if (event.button === placeMouseButton()) {
        await playWholeShapeCard(options, point);
      }
    } else if (game.phase === "play" && game.shapeCards) {
      await placeShapeStone(options, point);
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
var shapeKeyController;
var refreshShapeHand;
var lastStampPoint;
function bindShapeCards(options) {
  const { panel: panel2, game, session: session2, sendAction: sendAction2, viewingHistory } = options;
  const hand = panel2.querySelector("[data-shape-hand]");
  if (!hand) return;
  const send = (action) => sendAction2(game.id, withCurrentSeat(game, session2, action));
  const refresh = () => {
    hand.outerHTML = shapeHandPanelHtml(game, session2, viewingHistory);
    const board = panel2.querySelector(".board");
    const team = placementPreviewTeam(game);
    board?.setAttribute("data-preview-team", String(team));
    board?.setAttribute("data-preview-tone", stoneTone(stoneColor(game, team)));
    board?.style.setProperty("--preview-color", stoneColor(game, team));
    bindShapeCards(options);
    const card = fullModeShapeCard(game);
    if (board && card && lastStampPoint) {
      showShapeStamp(board, game, stampStonesAt(card, lastStampPoint));
    }
  };
  refreshShapeHand = refresh;
  for (const card of hand.querySelectorAll("[data-shape-index]")) {
    card.addEventListener("click", () => {
      if (card.disabled) return;
      const index = Number(card.dataset.shapeIndex);
      selectShapeCard(game, selectedShapeCardIndex(game) === index ? void 0 : index);
      refresh();
    });
  }
  hand.querySelector("[data-shape-discard]")?.addEventListener("click", () => {
    const card = currentShapeCard(game);
    if (!card) return;
    selectShapeCard(game, void 0);
    void send({
      type: "discardShapeCard",
      cardId: card.id
    });
  });
  const turnStamp = (change) => {
    change();
    refresh();
  };
  hand.querySelector("[data-shape-rotate]")?.addEventListener("click", () => {
    turnStamp(rotateShapeStamp);
  });
  hand.querySelector("[data-shape-mirror]")?.addEventListener("click", () => {
    turnStamp(mirrorShapeStamp);
  });
  shapeKeyController?.abort();
  shapeKeyController = new AbortController();
  if (fullModeShapeCard(game)) {
    document.addEventListener("keydown", (event) => {
      const target = event.target;
      if (target?.closest("input, textarea, select, [contenteditable]") || event.metaKey || event.ctrlKey) {
        return;
      }
      const key = event.key.toLowerCase();
      const controls = readKatachiControls();
      if (key === controls.rotateKey) turnStamp(rotateShapeStamp);
      else if (key === controls.mirrorKey) turnStamp(mirrorShapeStamp);
    }, {
      signal: shapeKeyController.signal
    });
  }
  hand.querySelector("[data-shape-undo]")?.addEventListener("click", () => {
    void send({
      type: "undoShapeStone"
    });
  });
  hand.querySelector("[data-shape-cancel]")?.addEventListener("click", () => {
    void send({
      type: "cancelShapeCard"
    });
  });
  for (const button of hand.querySelectorAll("[data-shape-color]")) {
    button.addEventListener("click", () => {
      setShapeStoneColor(button.dataset.shapeColor === "opponent" ? "opponent" : "self");
      refresh();
    });
  }
}
function fullModeShapeCard(game) {
  if (!isFullShapeMode(game) || game.phase !== "play" || game.shapeCards?.active) return void 0;
  return selectedShapeCardIndex(game) === void 0 ? void 0 : currentShapeCard(game);
}
async function playWholeShapeCard({ game, session: session2, sendAction: sendAction2, statusElement: statusElement2 }, point) {
  const card = fullModeShapeCard(game);
  if (!card) return;
  const stones = stampStonesAt(card, point);
  const fits = stones.every((stone) => stone.x >= 0 && stone.y >= 0 && stone.x < game.boardWidth && stone.y < game.boardHeight);
  if (!fits) {
    if (statusElement2) statusElement2.textContent = "The card doesn't fit there.";
    return;
  }
  await sendAction2(game.id, withCurrentSeat(game, session2, {
    type: "playShapeCard",
    cardId: card.id,
    stones
  }));
}
function showShapeStamp(board, game, stones) {
  clearShapeStamp(board);
  const team = game.seats[game.turn]?.team ?? 1;
  for (const stone of stones) {
    if (stone.x < 0 || stone.y < 0 || stone.x >= game.boardWidth || stone.y >= game.boardHeight) {
      continue;
    }
    const index = stone.y * game.boardWidth + stone.x;
    if (game.board[index] !== 0) continue;
    const point = board.querySelector(`.point[data-index='${index}']`);
    if (!point) continue;
    const color = stone.rel === "self" ? team : shapeOpponentTeam(game, team);
    point.dataset.shapeStamp = "true";
    point.dataset.originalColor = point.dataset.color ?? "0";
    point.dataset.originalStoneColor = point.style.getPropertyValue("--stone-color");
    point.dataset.originalOpacity = point.style.getPropertyValue("--stone-opacity");
    point.dataset.color = String(color);
    point.style.setProperty("--stone-color", stoneColor(game, color));
    point.style.setProperty("--stone-opacity", "0.5");
  }
}
function clearShapeStamp(board) {
  for (const point of board?.querySelectorAll(".point[data-shape-stamp]") ?? []) {
    point.dataset.color = point.dataset.originalColor ?? "0";
    point.style.setProperty("--stone-color", point.dataset.originalStoneColor ?? "");
    point.style.setProperty("--stone-opacity", point.dataset.originalOpacity || "1");
    delete point.dataset.shapeStamp;
    delete point.dataset.originalColor;
    delete point.dataset.originalStoneColor;
    delete point.dataset.originalOpacity;
  }
}
async function placeShapeStone({ game, session: session2, sendAction: sendAction2 }, point) {
  const card = currentShapeCard(game);
  if (!card) return;
  const stoneColor2 = currentShapeCardHasBothColors(game) ? shapeStoneColor(game) : void 0;
  await sendAction2(game.id, withCurrentSeat(game, session2, {
    type: "place",
    x: point.x,
    y: point.y,
    ...game.shapeCards?.active ? {} : {
      cardId: card.id
    },
    ...stoneColor2 ? {
      stoneColor: stoneColor2
    } : {}
  }));
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
function bindSeats({ panel: panel2, game, statusElement: statusElement2, showGame: showGame2 }) {
  for (const button of panel2.querySelectorAll(".seat[data-open='true'], .team-seat-player[data-open='true']")) {
    const handleJoinSeat = async (event) => {
      if (event.target?.closest(".seat-action")) return;
      const seatId = button.dataset.seatId;
      if (!seatId || !await confirmJoinOnPhone(game)) return;
      const response = await joinSeat(game.id, seatId);
      if (!response.ok) return;
      await showGame2(game.id);
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
        if (!seatId || !await confirmJoinOnPhone(game)) return;
        const response = await joinSeat(game.id, seatId);
        if (!response.ok) return;
        await showGame2(game.id);
        return;
      }
      if (button.dataset.action === "invite") {
        await copyText(`${location.origin}/game/${game.id}#${encodeURIComponent(seatId ?? "")}`, button, statusElement2, "Copied");
        return;
      }
      if (!seatId) return;
      await leaveSeat(game.id, seatId);
      await showGame2(game.id);
    });
  }
}

// client/game/seats-render.ts
function usersColumnHtml(game) {
  const playerUuids = new Set(game.seats.flatMap((seat) => seat.playerUuid ? [
    seat.playerUuid
  ] : []));
  const unseatedUsers = (game.users ?? []).filter((user) => !playerUuids.has(user.uuid));
  const teamGroups = teamColorPlayerListsHtml(game);
  const viewers = unseatedUsers.map((user) => `<div class="user-row">${escapeHtml(user.name ?? short(user.uuid))}</div>`).join("");
  const viewerList = viewers || (teamGroups ? "" : `<p class="muted-text">None</p>`);
  return `${teamGroups}${viewerList}`;
}
function teamColorPlayerListsHtml(game) {
  const teams = [
    ...new Set(game.seats.map((seat) => seat.team))
  ];
  return teams.map((team) => {
    const players = game.seats.filter((seat) => seat.team === team && seat.playerUuid).map((seat) => `<div class="user-row">${escapeHtml(seat.publicName ?? short(seat.playerUuid))}</div>`).join("") || `<p class="muted-text">None</p>`;
    return `
      <div class="team-users" data-team="${team}">
        <h4>${colorDotHtml(game, team)}${escapeHtml(teamColorName(game, team))}</h4>
        <div class="team-users__players">${players}</div>
      </div>
    `;
  }).join("");
}
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
    if (game.config.variants?.teamGo) return teamSeatCardHtml(game, team, seats, session2);
    return `
      <div class="team-seat-box" data-team="${team}" style="--team-color: ${stoneColor(game, team)}">
        <div class="team-seat-list">
          ${seats.map(({ seat, index }) => playerSeatHtml(game, seat, index, session2)).join("")}
        </div>
      </div>
    `;
  }).join("");
}
function teamSeatCardHtml(game, team, seats, session2) {
  const active = seats.find(({ index }) => index === game.turn);
  const clockSeat = active?.seat ?? seats[0]?.seat;
  return `
    <div class="team-seat-box team-card" data-team="${team}" style="--team-color: ${stoneColor(game, team)}">
      <div class="team-seat-list">
        ${seats.map(({ seat, index }) => teamSeatRowHtml(game, seat, index, session2)).join("")}
      </div>
      <div class="team-card-footer">
        <div class="seat-time">${clockSeat ? seatMetaHtml(game, clockSeat) : "--"}</div>
        <div class="seat-points">${clockSeat ? formatSeatPoints(displaySeatPoints(game, clockSeat)) : 0} pts</div>
      </div>
    </div>
  `;
}
function teamSeatRowHtml(game, seat, index, session2) {
  const active = index === game.turn ? "\u25B6" : "";
  const player = seat.playerUuid ? escapeHtml(seat.publicName ?? short(seat.playerUuid)) : "open";
  const open = !seat.playerUuid;
  return `
    <div class="team-seat-player" data-seat-id="${seat.id}" data-open="${open}" ${open ? 'role="button" tabindex="0"' : 'aria-disabled="true"'}>
      <i class="turn-marker">${active}</i>
      ${colorDotHtml(game, seat.team)}
      <span class="team-seat-player__name">${player}</span>
      ${seatActionHtml(seat, session2)}
    </div>
  `;
}
function playerSeatHtml(game, seat, index, session2) {
  const active = index === game.turn ? "\u25B6" : "";
  const player = seat.playerUuid ? escapeHtml(seat.publicName ?? short(seat.playerUuid)) : "open";
  const action = seatActionHtml(seat, session2);
  const open = !seat.playerUuid;
  return `
    <div class="seat" data-seat-id="${seat.id}" data-open="${open}" ${open ? 'role="button" tabindex="0"' : 'aria-disabled="true"'}>
      <div class="seat-player"><i class="turn-marker">${active}</i>${activeStoneHtml(game, index)}${colorDotHtml(game, seat.team, seatDisplayTeam(game, seat))}${player}</div>
      ${action}
      <div class="seat-time">${seatMetaHtml(game, seat)}</div>
      <div class="seat-points">${formatSeatPoints(displaySeatPoints(game, seat))} pts</div>
    </div>
  `;
}
function displaySeatPoints(game, seat) {
  const score = game.points[seat.team - 1] ?? 0;
  if (game.phase === "scoring" || game.phase === "done") return score;
  if (game.config.variants?.colorGo) {
    return score + (game.config.variants.colorGoKomi?.[seat.team - 1] ?? 0);
  }
  return seat.team === 2 ? score + (game.config.komi ?? 0) : score;
}
function seatActionHtml(seat, session2) {
  return seat.playerUuid === session2?.uuid ? `<button class="seat-action" data-action="leave" data-seat-id="${seat.id}" type="button">Leave</button>` : !seat.playerUuid ? `<span class="seat-actions"><button class="seat-action" data-action="join" data-seat-id="${seat.id}" type="button">Join</button><button class="seat-action" data-action="invite" data-seat-id="${seat.id}" type="button">Invite</button></span>` : "";
}
function formatSeatPoints(points) {
  return Number.isInteger(points) ? String(points) : String(Number(points.toFixed(2)));
}

// client/game/territory.ts
function territoryShadeHtml(game, boardColors, frame) {
  if (game.phase !== "scoring" && game.phase !== "done") return "";
  return territoryShadeIndexes(game, boardColors).map(({ index, team }) => {
    const point = pointPosition(game, index, frame);
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
  const { game, session: session2, boardColors, boardOpacity, canNavigateHistory, visualHistoryIndex, playableHistoryIndex, playableHistoryCount, viewingHistory, passOrDoneDisabled, canUsePlayActions, canUndo, canResign, showCoordinates: showCoordinates2, historyEntry } = context;
  const frame = boardFrame(game, showCoordinates2);
  const overlay = josekiPlacementOverlay(game, boardColors, boardOpacity);
  const result = resultText(game);
  const shapeCardInProgress = Boolean(game.shapeCards?.active);
  return `
    <div class="game-title-row">
      <h2>${escapeHtml(game.config.name || `Game #${game.id}`)}</h2>
      <div class="game-title-actions ui-cluster">
        <button class="game-info-toggle" type="button" aria-label="Show game info">?</button>
      </div>
    </div>
    <dialog class="ui-dialog game-info-dialog">
      <button class="dialog-close" type="button" aria-label="Close">\xD7</button>
      <div class="dialog-scroll ui-scroll">
        ${gameInfoHtml(game)}
        ${variantRulesHelpHtml(game)}
        ${scoringHelpHtml()}
      </div>
    </dialog>
    <div class="game-view ${game.shapeCards ? "has-shape-hand" : ""}">
      <section class="board-panel" aria-label="Board">
        <div class="board ${result ? "has-result" : ""} ${game.board.includes(-1) ? "has-water" : ""}" data-preview-team="${placementPreviewTeam(game)}" data-preview-tone="${stoneTone(stoneColor(game, placementPreviewTeam(game)))}" data-coordinates="${showCoordinates2}" style="--board-step: ${frame.stepX}%; --board-aspect: ${frame.aspectRatio}; --preview-color: ${stoneColor(game, placementPreviewTeam(game))}">
          ${boardLandHtml(game, frame)}
          ${boardGridHtml(game, showCoordinates2, frame)}
          ${starPointsHtml(game, showCoordinates2, frame)}
          ${territoryShadeHtml(game, overlay.colors, frame)}
          ${boardPointsHtml(game, overlay.colors, overlay.opacity, frame, lastMoveIndexes(game, viewingHistory, historyEntry))}
          ${result ? `<div class="game-result-overlay" aria-live="polite">${escapeHtml(result)}</div>` : ""}
        </div>
      </section>
      ${shapeHandPanelHtml(game, session2, viewingHistory, historyEntry)}
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
          <button data-action="${game.phase === "scoring" ? "acceptScore" : "pass"}" ${passOrDoneDisabled || shapeCardInProgress ? "disabled" : ""}>${game.phase === "scoring" ? "Done" : "Pass"}</button>
          <button data-action="cancel" ${!canUndo || shapeCardInProgress ? "disabled" : ""}>Undo</button>
          <button data-action="resign" ${!canResign ? "disabled" : ""}>Resign</button>
        </div>
        <div class="players-panel__metadata">${gameInfoHtml(game)}</div>
      </section>
      <div class="panel-divider" aria-hidden="true"></div>
      <section class="users-panel ui-stack" aria-label="Users">
        <h3>Users</h3>
        <div class="user-list">
          <h4>Users</h4>
          ${usersColumnHtml(game)}
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
      <dialog class="ui-dialog joseki-selection-dialog" data-joseki-selection-dialog>
        <button class="dialog-close" data-joseki-selection-close type="button" aria-label="Close">\xD7</button>
        <h3>${pickText}</h3>
        <p class="muted-text">Select exactly ${requiredCount} card${requiredCount === 1 ? "" : "s"}. Your selected cards are highlighted.</p>
        <p>${selected.size} / ${requiredCount} selected \xB7 ${seconds}s remaining</p>
        <div class="dialog-scroll ui-scroll">
          ${josekiCardGridHtml(setup.availableCards, selected)}
        </div>
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
function boardPointsHtml(game, boardColors, boardOpacity, frame, lastMove) {
  return boardColors.map((color, index) => {
    const point = pointPosition(game, index, frame);
    const opacity = boardOpacity?.[index] ?? 1;
    const renderColor = color === 99 ? 3 : color;
    const hex = stoneColor(game, color);
    const isStone = color > 0 && color !== 99;
    const classes = [
      "point",
      game.deadStones?.[index] ? "is-dead" : "",
      game.noScorePoints?.[index] ? "is-no-score" : "",
      isStone && stoneTone(hex) === "light" ? "is-light-stone" : "",
      isStone && lastMove.has(index) ? "is-last-move" : ""
    ].filter(Boolean).join(" ");
    const dot = isStone && lastMove.has(index) ? `; --last-move-dot: ${lastMoveDotColor(hex)}` : "";
    return `<button class="${classes}" aria-label="${pointLabel(game, index)}" data-index="${index}" data-color="${renderColor}" ${color === -1 ? "disabled" : ""} style="left: ${point.left}%; top: ${point.top}%; --stone-color: ${hex}; --stone-opacity: ${opacity}${dot}"></button>`;
  }).join("");
}
function lastMoveIndexes(game, viewingHistory, historyEntry) {
  const points = viewingHistory ? historyEntry?.lastStone : game.lastStone;
  return new Set((points ?? []).map((point) => point.y * game.boardWidth + point.x));
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
  if (!focusRefreshRegistered) {
    focusRefreshRegistered = true;
    addEventListener("focus", () => render());
  }
}
var focusRefreshRegistered = false;
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
    <div class="invite-rules dialog-scroll ui-scroll">${rulesHtml}</div>
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
  if (!await confirmJoinOnPhone(game)) {
    history.replaceState(null, "", `/game/${game.id}`);
    return;
  }
  const response = await joinSeat(game.id, seatId);
  if (!response.ok) return;
  history.replaceState(null, "", `/game/${game.id}`);
  await showGame2(game.id);
  renderGame2(game);
  openJoinedRulesDialog(game);
}

// client/game/realtime.ts
function mergeGameUpdate(previous, update) {
  const { historyFrom, history: history2, ...game } = update;
  return {
    ...game,
    config: previous.config,
    history: (previous.history ?? []).slice(0, historyFrom).concat(history2)
  };
}
function connectGameSocket(gameId, socketState2, renderGame2, reconnect, onActionError = () => {
}) {
  if (socketState2.gameId === gameId && socketState2.socket?.readyState === WebSocket.OPEN) return;
  socketState2.socket?.close();
  socketState2.gameId = gameId;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${location.host}/api/games/${gameId}/ws`);
  socketState2.socket = socket;
  let lastGame;
  socket.addEventListener("message", (event) => {
    if (socketState2.socket !== socket) return;
    const message = JSON.parse(String(event.data));
    if (message.type === "snapshot" && message.game) {
      lastGame = message.game;
      renderGame2(lastGame);
    } else if (message.type === "update" && message.game && lastGame) {
      lastGame = mergeGameUpdate(lastGame, message.game);
      renderGame2(lastGame);
    } else if (message.type === "presence" && message.users && lastGame) {
      lastGame = {
        ...lastGame,
        users: message.users
      };
      renderGame2(lastGame);
    } else if (message.type === "action_error" && message.error) {
      const status = document.querySelector("#status");
      if (status) status.textContent = message.error;
      onActionError(message.error);
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

// client/game/magnet-animation.ts
function magnetSlides(previous, next, viewingHistory) {
  if (!previous || String(previous.id) !== String(next.id) || viewingHistory) return [];
  if ((next.playMoves ?? 0) <= (previous.playMoves ?? 0)) return [];
  return slidesOf(next, next);
}
function reviewMagnetSlides(game, entry) {
  return entry?.board ? slidesOf({
    ...entry,
    board: entry.board
  }, game) : [];
}
function slidesOf(position, game) {
  const width = game.boardWidth;
  const placed = position.lastStone?.[0];
  const placedColor = placed ? position.board[placed.y * width + placed.x] : void 0;
  return (position.magnetMoves ?? []).flatMap(({ from, to }) => {
    const toIndex = to.y * width + to.x;
    const color = position.board[toIndex];
    if (!color || color < 0) return [];
    return [
      {
        from: from.y * width + from.x,
        to: toIndex,
        distance: Math.abs(from.x - to.x) + Math.abs(from.y - to.y),
        attracted: color !== placedColor
      }
    ];
  });
}
function animateMagnetSlides(root, slides) {
  if (slides.length === 0) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const slide of slides) {
    const stone = root.querySelector(`.point[data-index="${slide.to}"]`);
    const origin = root.querySelector(`.point[data-index="${slide.from}"]`);
    if (!stone || !origin || typeof stone.animate !== "function") continue;
    const end = stone.getBoundingClientRect();
    const start = origin.getBoundingClientRect();
    const dx = start.left - end.left;
    const dy = start.top - end.top;
    stone.animate([
      {
        translate: `${dx}px ${dy}px`
      },
      {
        translate: "0px 0px"
      }
    ], {
      duration: Math.min(450, 140 + slide.distance * 45),
      easing: slide.attracted ? "cubic-bezier(0.5, 0, 0.9, 0.6)" : "cubic-bezier(0.1, 0.6, 0.3, 1)"
    });
  }
}

// client/game/last-move-marker.ts
var LAST_MOVE_MARKERS = [
  "slice",
  "circle",
  "ring",
  "square",
  "triangle"
];
var STORAGE_KEY = "baduk:last-move-marker";
function parseLastMoveMarker(value) {
  return LAST_MOVE_MARKERS.find((marker) => marker === value) ?? "slice";
}
function readLastMoveMarker() {
  try {
    return parseLastMoveMarker(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "slice";
  }
}
function saveLastMoveMarker(marker) {
  try {
    localStorage.setItem(STORAGE_KEY, marker);
  } catch {
  }
}
function applyLastMoveMarker(marker, root = document.documentElement) {
  root.dataset.lastMoveMarker = marker;
}

// client/game/countdown.ts
function countdownAudioPath(sound, seconds) {
  return Number.isInteger(seconds) && seconds >= 1 && seconds <= 10 ? `/countdown/${sound}/${seconds}.aac` : void 0;
}
function countdownCue(game, now = Date.now()) {
  const time = game.config.time;
  const activeSeat = game.seats[game.turn];
  if (game.phase !== "play" || !time || time.system === "none" || game.config.variants?.zen || game.clockUpdatedAt === void 0 || !activeSeat) return void 0;
  const seatTime = activeSeat.time ?? activeSeat.clock ?? {};
  const mainLeft = Math.max(0, Number(seatTime.mainLeft ?? seatTime.main ?? time.main ?? 0));
  const elapsed = Math.max(0, (now - game.clockUpdatedAt) / 1e3);
  if (time.system === "fischer") {
    const remaining2 = mainLeft - elapsed;
    return timeoutCue(game, remaining2) ?? cueForRemaining(game, remaining2, "main");
  }
  if (time.system !== "byoyomi") return void 0;
  if (elapsed < mainLeft) return cueForRemaining(game, mainLeft - elapsed, "main");
  const periodsLeft = Math.max(0, Math.floor(Number(seatTime.periodsLeft ?? seatTime.periods ?? time.periods ?? 0)));
  const firstPeriod = Math.max(0, Number(seatTime.periodLeft ?? seatTime.periodTime ?? time.periodTime ?? 0));
  const periodTime = Math.max(0, Number(time.periodTime ?? firstPeriod));
  if (periodsLeft === 0 || firstPeriod === 0) return void 0;
  const overtimeElapsed = elapsed - mainLeft;
  const overtimeRemaining = firstPeriod + Math.max(0, periodsLeft - 1) * periodTime - overtimeElapsed;
  const timeout = timeoutCue(game, overtimeRemaining);
  if (timeout) return timeout;
  if (overtimeElapsed < firstPeriod) {
    return cueForRemaining(game, firstPeriod - overtimeElapsed, "period-0");
  }
  if (periodTime === 0) return void 0;
  const laterElapsed = overtimeElapsed - firstPeriod;
  const laterPeriod = Math.floor(laterElapsed / periodTime) + 1;
  if (laterPeriod >= periodsLeft) return void 0;
  const remaining = periodTime - laterElapsed % periodTime;
  return cueForRemaining(game, remaining, `period-${laterPeriod}`);
}
function activeClockExpired(game, now = Date.now()) {
  const time = game.config.time;
  const activeSeat = game.seats[game.turn];
  if (game.phase !== "play" || !time || time.system === "none" || game.config.variants?.zen || game.clockUpdatedAt === void 0 || !activeSeat) return false;
  const seatTime = activeSeat.time ?? activeSeat.clock ?? {};
  const mainLeft = Math.max(0, Number(seatTime.mainLeft ?? seatTime.main ?? time.main ?? 0));
  const elapsed = Math.max(0, (now - game.clockUpdatedAt) / 1e3);
  if (time.system === "fischer") return elapsed >= mainLeft + 1;
  if (time.system !== "byoyomi") return false;
  const periodsLeft = Math.max(0, Math.floor(Number(seatTime.periodsLeft ?? seatTime.periods ?? time.periods ?? 0)));
  const firstPeriod = Math.max(0, Number(seatTime.periodLeft ?? seatTime.periodTime ?? time.periodTime ?? 0));
  const periodTime = Math.max(0, Number(time.periodTime ?? firstPeriod));
  const secondsUntilLoss = mainLeft + firstPeriod + Math.max(0, periodsLeft - 1) * periodTime;
  return elapsed >= secondsUntilLoss + 1;
}
function cueForRemaining(game, remaining, clockSegment) {
  if (!(remaining >= 1 && remaining < 11)) return void 0;
  const seconds = Math.floor(remaining);
  return {
    seconds,
    key: `${game.id}:${game.turn}:${game.clockUpdatedAt}:${clockSegment}:${seconds}`
  };
}
function timeoutCue(game, remaining) {
  if (!(remaining <= 0 && remaining > -1)) return void 0;
  return {
    seconds: 0,
    key: `${game.id}:${game.turn}:${game.clockUpdatedAt}:timeout`
  };
}

// client/game/sound.ts
function moveSoundFor(previous, next) {
  if (!previous || previous.id !== next.id) return void 0;
  const previousLength = previous.history?.length ?? 0;
  const nextLength = next.history?.length ?? 0;
  if (nextLength > previousLength && next.history?.at(-1)?.action === "pass") return "pass";
  if ((next.captureCount ?? 0) > (previous.captureCount ?? 0)) return "capture";
  if ((next.playMoves ?? 0) > (previous.playMoves ?? 0)) return "stone";
  return void 0;
}
function clampVolume(value, fallback = 0.5) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}
var SoundPlayer = class {
  context;
  contextCreated = false;
  gains = /* @__PURE__ */ new Map();
  volumes = /* @__PURE__ */ new Map();
  buffers = /* @__PURE__ */ new Map();
  active = /* @__PURE__ */ new Map();
  elements = /* @__PURE__ */ new Map();
  createContext;
  fetchAudio;
  createElement;
  constructor(options = {}) {
    this.createContext = options.createContext ?? defaultContext;
    this.fetchAudio = options.fetchAudio ?? defaultFetchAudio;
    this.createElement = options.createElement ?? ((src) => new Audio(src));
  }
  setVolume(group, volume) {
    const safe = clampVolume(volume);
    this.volumes.set(group, safe);
    const gain = this.gains.get(group);
    if (gain) gain.gain.value = safe;
  }
  volume(group) {
    return this.volumes.get(group) ?? 0.5;
  }
  /** Starts loading files ahead of time so the first play isn't delayed. */
  preload(sources) {
    for (const src of sources) void this.buffer(src);
  }
  play(src, group) {
    const context = this.audioContext();
    if (!context) {
      this.playElement(src, group);
      return;
    }
    void this.buffer(src).then((buffer) => {
      if (!buffer) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gain(context, group));
      const playing = this.activeSources(group);
      playing.add(source);
      source.addEventListener("ended", () => playing.delete(source));
      source.start();
    });
  }
  stop(group) {
    for (const source of this.activeSources(group)) {
      try {
        source.stop();
      } catch {
      }
    }
    this.activeSources(group).clear();
    for (const [key, element] of this.elements) {
      if (!key.startsWith(`${group}:`)) continue;
      element.pause();
      element.currentTime = 0;
    }
  }
  /**
   * Browsers keep audio suspended until the user interacts with the page; resume on the first
   * gesture and stop listening once audio is running.
   */
  unlockOn(target) {
    const events = [
      "pointerdown",
      "keydown",
      "touchend"
    ];
    const unlock = () => {
      const context = this.audioContext();
      if (!context) return remove();
      if (context.state === "running") return remove();
      void context.resume().then(() => {
        if (context.state === "running") remove();
      }).catch(() => {
      });
    };
    const remove = () => {
      for (const type of events) target.removeEventListener(type, unlock);
    };
    for (const type of events) target.addEventListener(type, unlock);
  }
  audioContext() {
    if (!this.contextCreated) {
      this.contextCreated = true;
      try {
        this.context = this.createContext();
      } catch {
        this.context = void 0;
      }
    }
    return this.context;
  }
  gain(context, group) {
    let gain = this.gains.get(group);
    if (!gain) {
      gain = context.createGain();
      gain.gain.value = this.volume(group);
      gain.connect(context.destination);
      this.gains.set(group, gain);
    }
    return gain;
  }
  buffer(src) {
    let buffer = this.buffers.get(src);
    if (!buffer) {
      const context = this.audioContext();
      buffer = context ? this.fetchAudio(src).then((data) => context.decodeAudioData(data)).catch(() => {
        this.buffers.delete(src);
        return void 0;
      }) : Promise.resolve(void 0);
      this.buffers.set(src, buffer);
    }
    return buffer;
  }
  activeSources(group) {
    let sources = this.active.get(group);
    if (!sources) {
      sources = /* @__PURE__ */ new Set();
      this.active.set(group, sources);
    }
    return sources;
  }
  /** Fallback for browsers without Web Audio: the previous <audio> element behaviour. */
  playElement(src, group) {
    const key = `${group}:${src}`;
    let element = this.elements.get(key);
    if (!element) {
      element = this.createElement(src);
      element.preload = "auto";
      this.elements.set(key, element);
    }
    element.volume = this.volume(group);
    element.currentTime = 0;
    void element.play().catch(() => {
    });
  }
};
function defaultContext() {
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  return Context ? new Context() : void 0;
}
async function defaultFetchAudio(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`audio ${src}: ${response.status}`);
  return await response.arrayBuffer();
}

// client/ui/dialog.ts
function installDialogLightDismiss(root = document) {
  let pressedBackdrop;
  root.addEventListener("pointerdown", (event) => {
    pressedBackdrop = backdropDialog(event);
  });
  root.addEventListener("click", (event) => {
    const dialog = backdropDialog(event);
    if (dialog && dialog === pressedBackdrop) dialog.close();
    pressedBackdrop = void 0;
  });
}
function backdropDialog(event) {
  const target = event.target;
  if (!(target instanceof HTMLDialogElement) || !target.open) return void 0;
  const rect = target.getBoundingClientRect();
  const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  return inside ? void 0 : target;
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
var stoneShadowToggle = document.querySelector("#stone-shadow-toggle");
var soundControl = document.querySelector("#sound-control");
var soundToggle = document.querySelector("#sound-toggle");
var soundPopover = document.querySelector("#sound-popover");
var stoneVolume = document.querySelector("#stone-volume");
var voiceVolume = document.querySelector("#voice-volume");
var countdownSound = document.querySelector("#countdown-sound");
var appRemake = document.querySelector("#app-remake");
var appHelp = document.querySelector("#app-help");
var MOVE_SOUNDS = {
  stone: "/clack.mp3",
  capture: "/capture.mp3",
  pass: "/pass.mp3"
};
var COUNTDOWN_BEEP = "/CountdownBeep.mp3";
var sounds = new SoundPlayer();
sounds.setVolume("stone", readSavedStoneVolume());
sounds.setVolume("voice", readSavedVoiceVolume());
sounds.unlockOn(document);
sounds.preload([
  ...Object.values(MOVE_SOUNDS),
  COUNTDOWN_BEEP
]);
if (stoneVolume) stoneVolume.value = String(sounds.volume("stone"));
if (voiceVolume) voiceVolume.value = String(sounds.volume("voice"));
if (countdownSound) countdownSound.value = readSavedCountdownSound();
preloadCountdownVoice(readSavedCountdownSound());
var createGamePanelHtml = panel.innerHTML;
var session;
var socketState = {};
var gameEvents;
var gameClockTimer;
var lastCountdownCueKey;
var historyKeyController;
var nameSaveTimer;
var lastSavedName = "";
var currentGame;
var showCoordinates = localStorage.getItem("baduk:show-coordinates") === "true" && !matchMedia("(max-width: 759px)").matches;
var showStoneShadows = localStorage.getItem("baduk:stone-shadows") !== "false";
if (!showCoordinates && matchMedia("(max-width: 759px)").matches) {
  localStorage.setItem("baduk:show-coordinates", "false");
}
var historyViewByGame = /* @__PURE__ */ new Map();
var historyBoards;
var historyBoardsLoading = false;
var pendingMove;
var shownPosition;
var pendingMoveTimer;
var PENDING_MOVE_TIMEOUT_MS = 3e3;
applySavedTheme();
keepGridLinesCrisp();
updateThemeToggle(themeToggle);
updateCoordinateToggle();
updateStoneShadowToggle();
installDialogLightDismiss();
var landingHelpBody = document.querySelector("[data-landing-help-body]");
if (landingHelpBody) landingHelpBody.innerHTML = allVariantRulesHelpHtml();
landingHelpBody?.addEventListener("toggle", (event) => {
  const entry = event.target;
  if (entry.open) entry.scrollIntoView({
    block: "nearest"
  });
}, true);
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
  lastCountdownCueKey = void 0;
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
    statusElement.textContent = `${health.service} online \xB7 ${session.name ?? ""}`;
    await renderGameList2();
    startGameListRefresh2();
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
  if (appRemake) appRemake.hidden = true;
  lastCountdownCueKey = void 0;
  stopCountdownAudio();
  disconnectGameSocket(socketState);
  historyKeyController?.abort();
  shell.classList.remove("game-layout", "desktop-fit");
  panel.innerHTML = createGameTemplate();
  bindCreateGameForm2();
  showTryPlaying();
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
  removeTryPlaying();
  connectGameSocket2(game.id);
  renderGame(game);
  await maybeJoinHashSeat(game, renderGame, showGame);
}
function renderGame(game) {
  const previousGame = currentGame;
  historyBoards = reconcileHistoryBoards(historyBoards, game);
  game = withHistoryBoards(applyLocalName(game), historyBoards);
  const helpDialog = document.querySelector(".game-info-dialog");
  const helpWasOpen = helpDialog?.open ?? false;
  const helpScrollTop = helpDialog?.querySelector(".dialog-scroll")?.scrollTop ?? 0;
  const josekiSelectionDialog = document.querySelector("[data-joseki-selection-dialog]");
  const josekiSelectionWasOpen = josekiSelectionDialog?.open ?? false;
  const josekiSelectionScrollTop = josekiSelectionDialog?.querySelector(".dialog-scroll")?.scrollTop ?? 0;
  const confirmedPendingMove = settlePendingMove(game);
  maybePlayStoneSound(currentGame, game, confirmedPendingMove);
  if (game.phase !== "play") {
    stopCountdownAudio();
    lastCountdownCueKey = void 0;
  } else if (currentGame && (currentGame.id !== game.id || currentGame.turn !== game.turn || currentGame.clockUpdatedAt !== game.clockUpdatedAt)) {
    stopCountdownAudio();
  }
  currentGame = game;
  if (appRemake) appRemake.hidden = false;
  maybePlayCountdown(game);
  clearTimeout(gameClockTimer);
  shell.classList.add("game-layout");
  updateGameLayoutMode(shell);
  const { rawHistory, latestHistoryIndex, historyIndex, viewingHistory, boardColors, boardOpacity, visualHistoryIndex, playableHistoryCount, playableHistoryIndex, canNavigateHistory, canUsePlayActions, canUndo, canResign, passOrDoneDisabled } = gameHistoryView(game, session, historyViewByGame);
  if (viewingHistory && !rawHistory[historyIndex]?.board) {
    void loadHistoryBoards(game, historyIndex);
  }
  const displayGame = viewingHistory ? {
    ...game,
    phase: "play",
    deadStones: [],
    noScorePoints: []
  } : game;
  panel.innerHTML = gameViewHtml({
    game: displayGame,
    session,
    historyEntry: viewingHistory ? rawHistory[historyIndex] : void 0,
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
    showGame,
    navigateGameHistory,
    canNavigateGameHistory: canNavigateGameHistory2,
    showCoordinates,
    toggleCoordinates
  });
  showPendingStone();
  animateMagnetSlides(panel, positionMagnetSlides(previousGame, game, historyIndex, viewingHistory));
  const activeSeat = game.seats[game.turn];
  statusElement.textContent = game.phase === "done" && game.winnerTeams?.length ? `done \xB7 winner: ${winnerText(game)}` : `${game.phase} \xB7 turn: ${activeSeat?.id ?? "none"}`;
  if (helpWasOpen) {
    const nextHelpDialog = panel.querySelector(".game-info-dialog");
    nextHelpDialog?.showModal();
    const scroller = nextHelpDialog?.querySelector(".dialog-scroll");
    if (scroller) scroller.scrollTop = helpScrollTop;
  }
  const nextJosekiSelectionDialog = panel.querySelector("[data-joseki-selection-dialog]");
  if (josekiSelectionWasOpen && nextJosekiSelectionDialog) {
    if (!nextJosekiSelectionDialog.open) nextJosekiSelectionDialog.showModal();
    const scroller = nextJosekiSelectionDialog.querySelector(".dialog-scroll");
    if (scroller) scroller.scrollTop = josekiSelectionScrollTop;
  }
  if (game.phase === "play" && game.clockUpdatedAt !== void 0 && game.config.time?.system && game.config.time.system !== "none") {
    gameClockTimer = setTimeout(() => updateGameClock(game), 1e3);
  }
}
function readSavedStoneVolume() {
  return readSavedVolume("baduk:stone-volume");
}
function readSavedVoiceVolume() {
  return readSavedVolume("baduk:voice-volume");
}
function readSavedVolume(key) {
  return clampVolume(Number(localStorage.getItem(key) ?? localStorage.getItem("baduk:sound-volume") ?? "0.5"));
}
function readSavedCountdownSound() {
  return parseCountdownSound(localStorage.getItem("baduk:countdown-sound"));
}
function readCountdownSoundSelection() {
  return parseCountdownSound(countdownSound?.value);
}
function parseCountdownSound(value) {
  return value === "chinese" || value === "beep" || value === "off" ? value : "english";
}
function bindKatachiControlsPopover() {
  const control = document.querySelector("#katachi-controls");
  const toggle = document.querySelector("#katachi-controls-toggle");
  const popover = document.querySelector("#katachi-controls-popover");
  const placeButton = document.querySelector("#katachi-place-button");
  const rotateKey = document.querySelector("#katachi-rotate-key");
  const mirrorKey = document.querySelector("#katachi-mirror-key");
  if (!control || !toggle || !popover || !placeButton || !rotateKey || !mirrorKey) return;
  const fill = () => {
    const controls = readKatachiControls();
    placeButton.value = controls.placeButton;
    rotateKey.value = controls.rotateKey.toUpperCase();
    mirrorKey.value = controls.mirrorKey.toUpperCase();
  };
  const save = () => {
    const current = readKatachiControls();
    const key = (input, fallback) => input.value.trim().toLowerCase() || fallback;
    saveKatachiControls({
      placeButton: placeButton.value === "right" ? "right" : "left",
      rotateKey: key(rotateKey, current.rotateKey),
      mirrorKey: key(mirrorKey, current.mirrorKey)
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
  for (const input of [
    rotateKey,
    mirrorKey
  ]) {
    input.addEventListener("input", save);
    input.addEventListener("focus", () => input.select());
  }
}
function bindLastMoveMarkerPopover() {
  applyLastMoveMarker(readLastMoveMarker());
  const control = document.querySelector("#marker-control");
  const toggle = document.querySelector("#marker-toggle");
  const popover = document.querySelector("#marker-popover");
  const select = document.querySelector("#last-move-marker");
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
function maybePlayStoneSound(previous, next, alreadyPlayed = false) {
  const sound = moveSoundFor(previous, next);
  if (sound === "stone" && alreadyPlayed) return;
  if (sound) sounds.play(MOVE_SOUNDS[sound], "stone");
}
function maybePlayCountdown(game) {
  const selectedSound = readCountdownSoundSelection();
  if (selectedSound === "off") return;
  const cue = countdownCue(game);
  if (!cue || cue.key === lastCountdownCueKey) return;
  lastCountdownCueKey = cue.key;
  const src = selectedSound === "beep" || cue.seconds === 0 ? COUNTDOWN_BEEP : countdownAudioPath(selectedSound, cue.seconds);
  if (!src) return;
  stopCountdownAudio();
  sounds.play(src, "voice");
}
function stopCountdownAudio() {
  sounds.stop("voice");
}
function preloadCountdownVoice(selected) {
  if (selected !== "english" && selected !== "chinese") return;
  sounds.preload(Array.from({
    length: 10
  }, (_, index) => countdownAudioPath(selected, index + 1)).filter((src) => Boolean(src)));
}
function updateGameClock(game) {
  if (currentGame !== game) return;
  if (activeClockExpired(game)) {
    clearTimeout(gameClockTimer);
    void showGame(game.id);
    return;
  }
  const previousPhase = game.phase;
  maybePlayCountdown(game);
  for (const clock of panel.querySelectorAll(".seat-time")) {
    const seatId = clock.closest("[data-seat-id]")?.dataset.seatId;
    const team = Number(clock.closest(".team-card[data-team]")?.dataset.team);
    const seat = seatId ? game.seats.find((candidate) => candidate.id === seatId) : Number.isInteger(team) ? game.seats.find((candidate, index) => candidate.team === team && index === game.turn) ?? game.seats.find((candidate) => candidate.team === team) : void 0;
    if (seat) clock.innerHTML = seatMetaHtml(game, seat);
  }
  if (game.phase !== previousPhase) {
    renderGame(game);
    return;
  }
  if (game.phase === "play" && game.clockUpdatedAt !== void 0) {
    gameClockTimer = setTimeout(() => updateGameClock(game), 1e3);
  }
}
function positionMagnetSlides(previous, game, historyIndex, reviewing) {
  const entry = game.history?.[historyIndex];
  if (reviewing && !entry?.board) return [];
  const last = shownPosition;
  shownPosition = {
    gameId: game.id,
    historyIndex,
    reviewing
  };
  const navigated = last !== void 0 && String(last.gameId) === String(game.id) && last.historyIndex !== historyIndex && (last.reviewing || reviewing);
  if (reviewing) return navigated ? reviewMagnetSlides(game, entry) : [];
  if (navigated) {
    return reviewMagnetSlides(game, {
      board: game.board,
      lastStone: game.lastStone,
      magnetMoves: game.magnetMoves
    });
  }
  return magnetSlides(previous, game, false);
}
async function loadHistoryBoards(game, index) {
  const from = historyFetchStart(historyBoards, game, index);
  if (from === void 0 || historyBoardsLoading) return;
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
function connectGameSocket2(gameId) {
  connectGameSocket(gameId, socketState, renderGame, connectGameSocket2, cancelPendingMove);
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
function toggleStoneShadows() {
  showStoneShadows = !showStoneShadows;
  localStorage.setItem("baduk:stone-shadows", String(showStoneShadows));
  updateStoneShadowToggle();
}
function updateStoneShadowToggle() {
  document.documentElement.dataset.stoneShadows = showStoneShadows ? "on" : "off";
  stoneShadowToggle?.setAttribute("aria-pressed", String(showStoneShadows));
  stoneShadowToggle?.classList.toggle("is-confirmed", showStoneShadows);
}
async function sendAction(gameId, action) {
  const pending = currentGame && String(currentGame.id) === String(gameId) ? optimisticPlacement(currentGame, session, action, pendingMove) : void 0;
  if (pending) startPendingMove(pending);
  const accepted = await sendGameAction(gameId, action, statusElement, renderGame, socketState);
  if (!accepted) cancelPendingMove();
}
function startPendingMove(pending) {
  pendingMove = pending;
  showPendingStone();
  sounds.play(MOVE_SOUNDS.stone, "stone");
  clearTimeout(pendingMoveTimer);
  pendingMoveTimer = setTimeout(() => {
    if (pendingMove !== pending) return;
    cancelPendingMove("Move not confirmed by the server.");
  }, PENDING_MOVE_TIMEOUT_MS);
}
function settlePendingMove(game) {
  if (!pendingMove || !isPendingSettled(pendingMove, game)) return false;
  const confirmed = String(pendingMove.gameId) === String(game.id) && (game.playMoves ?? 0) > pendingMove.playMoves;
  pendingMove = void 0;
  clearTimeout(pendingMoveTimer);
  return confirmed;
}
function cancelPendingMove(reason = statusElement.textContent ?? "") {
  if (!pendingMove) return;
  pendingMove = void 0;
  clearTimeout(pendingMoveTimer);
  if (currentGame) renderGame(currentGame);
  if (reason) statusElement.textContent = reason;
}
function showPendingStone() {
  if (!pendingMove || !currentGame || String(currentGame.id) !== String(pendingMove.gameId)) {
    return;
  }
  const point = panel.querySelector(`.point[data-index="${pendingMove.index}"]`);
  if (!point || point.dataset.color !== "0") return;
  const color = stoneColor(currentGame, pendingMove.team);
  point.dataset.color = String(pendingMove.team);
  point.style.setProperty("--stone-color", color);
  point.style.setProperty("--stone-opacity", "0.6");
  point.classList.add("is-pending");
  point.classList.toggle("is-light-stone", stoneTone(color) === "light");
  for (const marked of panel.querySelectorAll(".point.is-last-move")) {
    marked.classList.remove("is-last-move");
  }
  point.classList.add("is-last-move");
  point.style.setProperty("--last-move-dot", lastMoveDotColor(color));
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
