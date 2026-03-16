const BOARD_RADIUS = 4;
const HEX_SIZE = 42;
const VIEWBOX_PADDING = 48;
const DIRECTIONS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const PIECE_DEFS = {
  elf: { name: "エルフ", short: "E", move: 2, attack: 1, summonable: false, max: 1 },
  siren: { name: "セイレーン", short: "S", move: 3, attack: 1, summonable: true, max: 3 },
  unicorn: { name: "ユニコーン", short: "U", move: 2, attack: 2, summonable: true, max: 3 },
  cerberus: { name: "ケルベロス", short: "C", move: 1, attack: 3, summonable: true, max: 2 },
};

const PLAYER_DEFS = {
  light: { name: "白陣営", tokenClass: "light" },
  dark: { name: "黒陣営", tokenClass: "dark" },
};

const STARTING_LAYOUT = {
  light: [
    { type: "elf", q: 0, r: 2 },
    { type: "unicorn", q: 2, r: 1 },
    { type: "siren", q: -2, r: 3 },
  ],
  dark: [
    { type: "elf", q: 0, r: -2 },
    { type: "unicorn", q: 2, r: -3 },
    { type: "siren", q: -2, r: -1 },
  ],
};

const boardElement = document.querySelector("#board");
const turnIndicator = document.querySelector("#turn-indicator");
const modeIndicator = document.querySelector("#mode-indicator");
const selectionIndicator = document.querySelector("#selection-indicator");
const messageElement = document.querySelector("#message");
const summonControls = document.querySelector("#summon-controls");
const pieceReference = document.querySelector("#piece-reference");
const logElement = document.querySelector("#log");
const restartButton = document.querySelector("#restart-button");
const modeButtons = [...document.querySelectorAll(".mode-button")];

const boardCells = generateBoard(BOARD_RADIUS);
const viewBox = computeViewBox(boardCells);

let idCounter = 1;
let state = createInitialState();

setupStaticUi();
bindEvents();
render();

function createInitialState() {
  idCounter = 1;

  const pieces = [];
  for (const [player, setup] of Object.entries(STARTING_LAYOUT)) {
    for (const piece of setup) {
      pieces.push(createPiece(piece.type, player, piece.q, piece.r));
    }
  }

  return {
    currentPlayer: "light",
    turn: 1,
    mode: "move",
    selectedPieceId: null,
    selectedSummonType: "unicorn",
    winner: null,
    message: "駒を選んで移動するか、行動を切り替えてください。",
    log: ["対局開始。白陣営の手番。"],
    pieces,
    reserves: {
      light: { siren: 2, unicorn: 2, cerberus: 2 },
      dark: { siren: 2, unicorn: 2, cerberus: 2 },
    },
  };
}

function bindEvents() {
  boardElement.addEventListener("click", handleBoardClick);
  restartButton.addEventListener("click", () => {
    state = createInitialState();
    render();
  });

  for (const button of modeButtons) {
    button.addEventListener("click", () => {
      if (state.winner) {
        return;
      }
      state.mode = button.dataset.mode;
      state.selectedPieceId = null;
      state.message = getModeMessage();
      render();
    });
  }
}

function setupStaticUi() {
  boardElement.setAttribute("viewBox", viewBox);

  const referenceMarkup = Object.entries(PIECE_DEFS)
    .map(
      ([type, def]) => `
        <article class="reference-card">
          <div class="reference-badge">${def.short}</div>
          <div>
            <strong>${def.name}</strong>
            <span>移動 ${def.move} / 攻撃 ${def.attack}${type === "elf" ? " / 撃破されると敗北" : ""}</span>
          </div>
        </article>
      `,
    )
    .join("");

  pieceReference.innerHTML = referenceMarkup;
}

function handleBoardClick(event) {
  if (state.winner) {
    return;
  }

  const cell = event.target.closest("[data-q]");
  if (!cell) {
    return;
  }

  const q = Number(cell.dataset.q);
  const r = Number(cell.dataset.r);

  if (state.mode === "summon") {
    handleSummonClick(q, r);
    return;
  }

  const clickedPiece = getPieceAt(q, r);
  if (clickedPiece && clickedPiece.player === state.currentPlayer) {
    state.selectedPieceId = clickedPiece.id;
    state.message = `${PIECE_DEFS[clickedPiece.type].name}を選択中。`;
    render();
    return;
  }

  const selectedPiece = getSelectedPiece();
  if (!selectedPiece) {
    state.message = "先に自分の駒を選択してください。";
    render();
    return;
  }

  handleMoveOrAttackClick(selectedPiece, q, r);
}

function handleMoveOrAttackClick(piece, q, r) {
  const targetKey = coordKey(q, r);
  const legalTargets = new Set(getMoveTargets(piece).map(({ q: nextQ, r: nextR }) => coordKey(nextQ, nextR)));
  const legalAttacks = new Map(
    getAttackTargets(piece).map((target) => [coordKey(target.q, target.r), target]),
  );

  if (!legalTargets.has(targetKey)) {
    if (!legalAttacks.has(targetKey)) {
      state.message = "そのマスへは移動も攻撃もできません。";
      render();
      return;
    }
  }

  const selectedTarget = legalAttacks.get(targetKey);
  if (!selectedTarget) {
    piece.q = q;
    piece.r = r;
    finishTurn(`${PLAYER_DEFS[piece.player].name}の${PIECE_DEFS[piece.type].name}が移動。`);
    return;
  }

  removePiece(selectedTarget.id);
  piece.q = q;
  piece.r = r;

  if (selectedTarget.type === "elf") {
    state.winner = piece.player;
    state.message = `${PLAYER_DEFS[piece.player].name}の勝利。相手エルフを撃破しました。`;
    pushLog(
      `${PLAYER_DEFS[piece.player].name}の${PIECE_DEFS[piece.type].name}がエルフを撃破して勝利。`,
    );
    render();
    return;
  }

  finishTurn(
    `${PLAYER_DEFS[piece.player].name}の${PIECE_DEFS[piece.type].name}が${PIECE_DEFS[selectedTarget.type].name}を撃破。`,
  );
}

function handleSummonClick(q, r) {
  const summonType = state.selectedSummonType;
  if (!summonType) {
    state.message = "先に召喚する駒を選んでください。";
    render();
    return;
  }

  const legalTargets = new Set(getSummonTargets().map(({ q: nextQ, r: nextR }) => coordKey(nextQ, nextR)));
  if (!legalTargets.has(coordKey(q, r))) {
    state.message = "召喚は自分のエルフに隣接する空きマスのみです。";
    render();
    return;
  }

  state.pieces.push(createPiece(summonType, state.currentPlayer, q, r));
  state.reserves[state.currentPlayer][summonType] -= 1;
  finishTurn(`${PLAYER_DEFS[state.currentPlayer].name}が${PIECE_DEFS[summonType].name}を召喚。`);
}

function finishTurn(logMessage) {
  pushLog(logMessage);
  state.currentPlayer = state.currentPlayer === "light" ? "dark" : "light";
  state.turn += 1;
  state.selectedPieceId = null;
  state.mode = "move";
  state.message = `${PLAYER_DEFS[state.currentPlayer].name}の手番です。`;
  render();
}

function pushLog(entry) {
  state.log = [entry, ...state.log].slice(0, 8);
}

function render() {
  renderStatus();
  renderModeButtons();
  renderSummonControls();
  renderBoard();
  renderLog();
}

function renderStatus() {
  const playerName = PLAYER_DEFS[state.currentPlayer].name;
  turnIndicator.textContent = state.winner
    ? `${PLAYER_DEFS[state.winner].name}の勝利`
    : `手番 ${state.turn} : ${playerName}`;

  const modeText = {
    move: "現在の行動: 移動 / 攻撃",
    summon: "現在の行動: 召喚",
  };
  modeIndicator.textContent = modeText[state.mode];

  const selectedPiece = getSelectedPiece();
  if (state.mode === "summon") {
    selectionIndicator.textContent = `召喚駒: ${PIECE_DEFS[state.selectedSummonType].name}`;
  } else if (selectedPiece) {
    const def = PIECE_DEFS[selectedPiece.type];
    selectionIndicator.textContent = `選択中: ${def.name} / 移動 ${def.move} / 攻撃 ${def.attack}`;
  } else {
    selectionIndicator.textContent = "選択中: なし";
  }

  messageElement.textContent = state.message;
}

function renderModeButtons() {
  for (const button of modeButtons) {
    const isActive = button.dataset.mode === state.mode;
    button.classList.toggle("active", isActive);
    button.disabled = Boolean(state.winner);
  }
}

function renderSummonControls() {
  const reserves = state.reserves[state.currentPlayer];
  summonControls.innerHTML = Object.entries(PIECE_DEFS)
    .filter(([, def]) => def.summonable)
    .map(([type, def]) => {
      const remaining = reserves[type];
      const active = state.selectedSummonType === type;
      const disabled = state.winner || remaining <= 0;

      return `
        <button
          class="summon-button ${active ? "active" : ""}"
          data-summon-type="${type}"
          type="button"
          ${disabled ? "disabled" : ""}
        >
          <span class="piece-name">${def.name}</span>
          <span>移動 ${def.move} / 攻撃 ${def.attack}</span>
          <span class="piece-count">残り ${remaining}</span>
        </button>
      `;
    })
    .join("");

  for (const button of summonControls.querySelectorAll("[data-summon-type]")) {
    button.addEventListener("click", () => {
      if (state.winner) {
        return;
      }
      state.selectedSummonType = button.dataset.summonType;
      state.mode = "summon";
      state.selectedPieceId = null;
      state.message = `${PIECE_DEFS[state.selectedSummonType].name}を召喚するマスを選んでください。`;
      render();
    });
  }
}

function renderBoard() {
  const selectedPiece = getSelectedPiece();
  const moveTargets = selectedPiece && state.mode === "move" ? keySet(getMoveTargets(selectedPiece)) : new Set();
  const attackTargets = selectedPiece && state.mode === "move" ? keySet(getAttackTargets(selectedPiece)) : new Set();
  const summonTargets = state.mode === "summon" ? keySet(getSummonTargets()) : new Set();

  const markup = boardCells
    .map((cell) => {
      const piece = getPieceAt(cell.q, cell.r);
      const classes = ["hex-cell", "hoverable"];
      const cellKey = coordKey(cell.q, cell.r);

      if (selectedPiece && selectedPiece.q === cell.q && selectedPiece.r === cell.r) {
        classes.push("selected");
      } else if (moveTargets.has(cellKey)) {
        classes.push("target");
      } else if (attackTargets.has(cellKey)) {
        classes.push("attack");
      } else if (summonTargets.has(cellKey)) {
        classes.push("summon");
      }

      return `
        <g class="cell-group" data-q="${cell.q}" data-r="${cell.r}">
          <polygon class="${classes.join(" ")}" points="${cell.points}" />
          ${piece ? renderPiece(piece, cell.x, cell.y) : ""}
        </g>
      `;
    })
    .join("");

  boardElement.innerHTML = markup;
}

function renderPiece(piece, x, y) {
  const def = PIECE_DEFS[piece.type];
  const player = PLAYER_DEFS[piece.player];
  return `
    <circle class="piece-token ${player.tokenClass}" cx="${x}" cy="${y}" r="21" />
    <text class="piece-mark ${player.tokenClass}" x="${x}" y="${y - 1}">${def.short}</text>
    <text class="piece-power" x="${x}" y="${y + 17}">M${def.move} A${def.attack}</text>
  `;
}

function renderLog() {
  logElement.innerHTML = state.log.map((entry) => `<li>${entry}</li>`).join("");
}

function getSelectedPiece() {
  return state.pieces.find((piece) => piece.id === state.selectedPieceId) || null;
}

function getMoveTargets(piece) {
  return boardCells.filter((cell) => {
    if (cell.q === piece.q && cell.r === piece.r) {
      return false;
    }
    if (getPieceAt(cell.q, cell.r)) {
      return false;
    }
    return hexDistance(piece, cell) <= PIECE_DEFS[piece.type].move;
  });
}

function getAttackTargets(piece) {
  return boardCells
    .map((cell) => getPieceAt(cell.q, cell.r))
    .filter(Boolean)
    .filter((target) => {
      if (target.player === piece.player) {
        return false;
      }
      if (target.q === piece.q && target.r === piece.r) {
        return false;
      }
      return (
        hexDistance(piece, target) <= PIECE_DEFS[piece.type].move &&
        PIECE_DEFS[piece.type].attack > PIECE_DEFS[target.type].attack
      );
    });
}

function getSummonTargets() {
  const summonType = state.selectedSummonType;
  if (!summonType || state.reserves[state.currentPlayer][summonType] <= 0) {
    return [];
  }

  const elf = state.pieces.find((piece) => piece.player === state.currentPlayer && piece.type === "elf");
  if (!elf) {
    return [];
  }

  return DIRECTIONS.map(([dq, dr]) => ({ q: elf.q + dq, r: elf.r + dr }))
    .filter(({ q, r }) => isInsideBoard(q, r))
    .filter(({ q, r }) => !getPieceAt(q, r));
}

function removePiece(pieceId) {
  state.pieces = state.pieces.filter((piece) => piece.id !== pieceId);
}

function getPieceAt(q, r) {
  return state.pieces.find((piece) => piece.q === q && piece.r === r) || null;
}

function createPiece(type, player, q, r) {
  return {
    id: `piece-${idCounter++}`,
    type,
    player,
    q,
    r,
  };
}

function generateBoard(radius) {
  const cells = [];
  for (let q = -radius; q <= radius; q += 1) {
    for (let r = -radius; r <= radius; r += 1) {
      if (!isInsideBoard(q, r, radius)) {
        continue;
      }

      const { x, y } = axialToPixel(q, r);
      cells.push({
        q,
        r,
        x,
        y,
        points: hexPoints(x, y, HEX_SIZE),
      });
    }
  }
  return cells;
}

function axialToPixel(q, r) {
  return {
    x: HEX_SIZE * 1.5 * q,
    y: HEX_SIZE * Math.sqrt(3) * (r + q / 2),
  };
}

function hexPoints(centerX, centerY, size) {
  const points = [];
  for (let index = 0; index < 6; index += 1) {
    const angle = (60 * index) * (Math.PI / 180);
    const x = centerX + size * Math.cos(angle);
    const y = centerY + size * Math.sin(angle);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(" ");
}

function computeViewBox(cells) {
  const xs = [];
  const ys = [];

  for (const cell of cells) {
    for (let index = 0; index < 6; index += 1) {
      const angle = (60 * index) * (Math.PI / 180);
      xs.push(cell.x + HEX_SIZE * Math.cos(angle));
      ys.push(cell.y + HEX_SIZE * Math.sin(angle));
    }
  }

  const minX = Math.min(...xs) - VIEWBOX_PADDING;
  const maxX = Math.max(...xs) + VIEWBOX_PADDING;
  const minY = Math.min(...ys) - VIEWBOX_PADDING;
  const maxY = Math.max(...ys) + VIEWBOX_PADDING;

  return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
}

function isInsideBoard(q, r, radius = BOARD_RADIUS) {
  const s = -q - r;
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= radius;
}

function hexDistance(from, to) {
  const fromS = -from.q - from.r;
  const toS = -to.q - to.r;
  return (
    Math.abs(from.q - to.q) +
    Math.abs(from.r - to.r) +
    Math.abs(fromS - toS)
  ) / 2;
}

function coordKey(q, r) {
  return `${q},${r}`;
}

function keySet(cells) {
  return new Set(cells.map(({ q, r }) => coordKey(q, r)));
}

function getModeMessage() {
  switch (state.mode) {
    case "summon":
      return `${PIECE_DEFS[state.selectedSummonType].name}を召喚するマスを選んでください。`;
    default:
      return "自分の駒を選び、空きマスへ移動するか、倒せる敵駒へ進入してください。";
  }
}
