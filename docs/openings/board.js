// A small chessboard input for the opening dashboard: plain SVG, with
// chess.js (BSD-2-Clause) for legality and SAN. No board code from elsewhere.
// Pieces are the Cburnett set (Colin M.L. Burnett, via Wikimedia Commons, used
// under the BSD licence; see pieces/LICENSE.txt and pieces/SOURCES.json),
// served unmodified from pieces/. Colours follow Lichess's default brown theme.
//
//   const el = createBoard({ Chess, moves: ["e4", "e5"], pieceBase: "pieces/" });
//   el.value          // SAN moves up to the cursor (the position shown)
//   el.setLine(moves) // replace the line and move the cursor to its end
//   el.addEventListener("input", ...)   // fired on every change
//
// Click a piece then a square, or drag it. A pawn reaching the last rank
// opens a picker (queen, knight, rook, bishop). The buttons step through the
// line; the move list jumps to any ply; arrow keys step when the board has focus.

const FILES = "abcdefgh";
const NS = "http://www.w3.org/2000/svg";
const PROMO = ["q", "n", "r", "b"];   // Lichess's picker order

function svg(tag, attrs = {}, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

export function createBoard({ Chess, moves = [], orientation = "white", pieceBase = "pieces/" } = {}) {
  let line = [];
  let ply = 0;
  let flipped = orientation === "black";
  let selected = null;
  let drag = null;
  let promo = null;   // { from, to, color } while the promotion picker is open
  let game = new Chess();
  const src = (p) => `${pieceBase}Chess_${p.type}${p.color === "w" ? "l" : "d"}t45.svg`;
  // warm the cache so the first drawn position has its pieces
  for (const t of "kqrbnp") for (const c of "wb") { const i = new Image(); i.src = src({ type: t, color: c }); }

  const root = document.createElement("div");
  root.className = "cb";
  const boardWrap = document.createElement("div");
  boardWrap.className = "cb-board";
  root.appendChild(boardWrap);
  const board = svg("svg", { viewBox: "0 0 8 8", role: "img", "aria-label": "chessboard", tabindex: "0" });
  boardWrap.appendChild(board);
  const gSquares = svg("g", {}, board), gMarks = svg("g", {}, board), gPieces = svg("g", {}, board),
    gDrag = svg("g", {}, board), gPromo = svg("g", {}, board);

  const bar = document.createElement("div");
  bar.className = "cb-bar";
  root.appendChild(bar);
  const btn = (label, title, fn) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.title = title; b.setAttribute("aria-label", title);
    b.addEventListener("click", fn);
    bar.appendChild(b);
    return b;
  };
  const bStart = btn("«", "Start position", () => goto(0));
  const bBack = btn("‹", "Back one move", () => goto(ply - 1));
  const bFwd = btn("›", "Forward one move", () => goto(ply + 1));
  const bEnd = btn("»", "End of line", () => goto(line.length));
  btn("Flip", "Flip board", () => { flipped = !flipped; draw(); });
  btn("Reset", "Clear the line", () => setLine([], true));

  const list = document.createElement("div");
  list.className = "cb-moves";
  root.appendChild(list);

  const sqXY = (sq) => {
    const f = FILES.indexOf(sq[0]), r = +sq[1] - 1;
    return flipped ? [7 - f, r] : [f, 7 - r];
  };
  const xySq = (x, y) => {
    const f = flipped ? 7 - x : x, r = flipped ? y : 7 - y;
    return f >= 0 && f < 8 && r >= 0 && r < 8 ? FILES[f] + (r + 1) : null;
  };
  const pointSq = (ev) => {
    const pt = board.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(board.getScreenCTM().inverse());
    return { x: p.x, y: p.y, sq: xySq(Math.floor(p.x), Math.floor(p.y)) };
  };

  function rebuild() {
    game = new Chess();
    for (let i = 0; i < ply; i++) game.move(line[i]);
  }

  function lastMove() {
    if (ply === 0) return null;
    const h = game.history({ verbose: true });
    return h[h.length - 1];
  }

  function pieceImg(p, x, y, parent, cls = "cb-piece") {
    return svg("image", { href: src(p), x, y, width: 1, height: 1, class: cls }, parent);
  }

  function draw() {
    gSquares.replaceChildren(); gMarks.replaceChildren(); gPieces.replaceChildren(); gDrag.replaceChildren(); gPromo.replaceChildren();
    const lm = lastMove();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const sq = xySq(x, y);
      svg("rect", { x, y, width: 1, height: 1, class: (x + y) % 2 ? "cb-dark" : "cb-light" }, gSquares);
      if (lm && (sq === lm.from || sq === lm.to)) svg("rect", { x, y, width: 1, height: 1, class: "cb-last" }, gSquares);
      if (sq === selected) svg("rect", { x, y, width: 1, height: 1, class: "cb-sel" }, gSquares);
    }
    // coordinates in the corners of the edge squares, in the opposite square colour
    for (let i = 0; i < 8; i++) {
      const fileSq = xySq(i, 7), rankSq = xySq(0, i);
      const tf = svg("text", { x: i + 0.95, y: 7.95, class: `cb-coord ${(i + 7) % 2 ? "on-dark" : "on-light"}`, "text-anchor": "end" }, gSquares);
      tf.textContent = fileSq[0];
      const tr = svg("text", { x: 0.05, y: i + 0.21, class: `cb-coord ${i % 2 ? "on-dark" : "on-light"}` }, gSquares);
      tr.textContent = rankSq[1];
    }
    if (selected) {
      const seen = new Set();
      for (const m of game.moves({ square: selected, verbose: true })) {
        if (seen.has(m.to)) continue;   // four promotion moves share a square
        seen.add(m.to);
        const [x, y] = sqXY(m.to);
        if (m.captured) svg("circle", { cx: x + 0.5, cy: y + 0.5, r: 0.46, class: "cb-hint-cap" }, gMarks);
        else svg("circle", { cx: x + 0.5, cy: y + 0.5, r: 0.13, class: "cb-hint" }, gMarks);
      }
    }
    for (const row of game.board()) for (const p of row) {
      if (!p) continue;
      if (drag && drag.from === p.square) continue;
      if (promo && promo.from === p.square) continue;
      const [x, y] = sqXY(p.square);
      pieceImg(p, x, y, gPieces);
    }
    if (drag && drag.piece) pieceImg(drag.piece, drag.x - 0.5, drag.y - 0.5, gDrag, "cb-piece cb-dragging");
    if (promo) drawPromo();
    drawList();
    bStart.disabled = bBack.disabled = ply === 0;
    bFwd.disabled = bEnd.disabled = ply >= line.length;
  }

  // The picker: four pieces down the target file from the promotion square
  // towards the middle of the board, over a dimmed board (as on Lichess).
  function drawPromo() {
    svg("rect", { x: 0, y: 0, width: 8, height: 8, class: "cb-dim" }, gPromo);
    const [x, y0] = sqXY(promo.to);
    const dir = y0 === 0 ? 1 : -1;
    PROMO.forEach((t, i) => {
      const y = y0 + dir * i;
      const g = svg("g", { class: "cb-promo", "data-piece": t }, gPromo);
      svg("circle", { cx: x + 0.5, cy: y + 0.5, r: 0.5, class: "cb-promo-bg" }, g);
      pieceImg({ type: t, color: promo.color }, x + 0.08, y + 0.08, g).setAttribute("width", 0.84);
      g.lastChild.setAttribute("height", 0.84);
    });
  }
  const promoAt = (sq) => {
    if (!promo || !sq) return null;
    const [x, y] = sqXY(sq), [px, y0] = sqXY(promo.to);
    const dir = y0 === 0 ? 1 : -1, i = (y - y0) * dir;
    return x === px && i >= 0 && i < 4 ? PROMO[i] : null;
  };

  function drawList() {
    list.replaceChildren();
    if (!line.length) { const s = document.createElement("span"); s.className = "cb-empty"; s.textContent = "Start position: make a move on the board."; list.appendChild(s); return; }
    line.forEach((m, i) => {
      if (i % 2 === 0) { const n = document.createElement("span"); n.className = "cb-num"; n.textContent = `${i / 2 + 1}.`; list.appendChild(n); }
      const b = document.createElement("button");
      b.type = "button"; b.textContent = m;
      b.className = "cb-mv" + (i + 1 === ply ? " cur" : "") + (i + 1 > ply ? " future" : "");
      b.addEventListener("click", () => goto(i + 1));
      list.appendChild(b);
    });
  }

  function emit() {
    root.value = line.slice(0, ply);
    root.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function goto(k) {
    k = Math.max(0, Math.min(line.length, k));
    if (k === ply) return;
    ply = k; selected = null; promo = null; rebuild(); draw(); emit();
  }

  function setLine(moves, notify = true) {
    // keep only the legal prefix of what we were given
    const g = new Chess(), ok = [];
    for (const m of moves || []) { try { ok.push(g.move(m).san); } catch { break; } }
    line = ok; ply = ok.length; selected = null; promo = null; game = g;
    draw();
    root.value = line.slice(0, ply);
    if (notify) root.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Returns true when the move was played or the promotion picker opened.
  function tryMove(from, to, promotion) {
    const cands = game.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (!cands.length) return false;
    if (cands.some((m) => m.promotion) && !promotion) {
      promo = { from, to, color: game.turn() };
      selected = null;
      draw();
      return true;
    }
    let mv = null;
    try { mv = game.move({ from, to, promotion }); } catch { mv = null; }
    if (!mv) return false;
    // a new move at the cursor replaces the rest of the line, unless it IS the next move
    if (line[ply] === mv.san) ply += 1;
    else { line = line.slice(0, ply).concat(mv.san); ply = line.length; }
    selected = null; promo = null;
    rebuild(); draw(); emit();
    return true;
  }

  board.addEventListener("pointerdown", (ev) => {
    const { x, y, sq } = pointSq(ev);
    if (promo) {   // the picker is modal: choose a piece, or click elsewhere to cancel
      const t = promoAt(sq);
      const { from, to } = promo;
      promo = null;
      if (!(t && tryMove(from, to, t))) draw();
      return;
    }
    if (!sq) return;
    const p = game.get(sq);
    if (selected && selected !== sq && (!p || p.color !== game.turn())) {
      if (tryMove(selected, sq)) return;
    }
    if (p && p.color === game.turn()) {
      selected = sq;
      drag = { from: sq, piece: p, x, y, x0: x, y0: y, moved: false };
      board.setPointerCapture(ev.pointerId);
      draw();
    } else { selected = null; draw(); }
  });
  board.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const { x, y } = pointSq(ev);
    if (Math.hypot(x - drag.x0, y - drag.y0) > 0.15) drag.moved = true;
    drag.x = x; drag.y = y;
    gDrag.replaceChildren();
    pieceImg(drag.piece, x - 0.5, y - 0.5, gDrag, "cb-piece cb-dragging");
  });
  const endDrag = (ev) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    const { sq } = pointSq(ev);
    if (d.moved && sq && sq !== d.from && tryMove(d.from, sq)) return;
    draw(); // a plain click keeps the piece selected for click-to-move
  };
  board.addEventListener("pointerup", endDrag);
  board.addEventListener("pointercancel", () => { drag = null; draw(); });
  board.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowLeft") { goto(ply - 1); ev.preventDefault(); }
    if (ev.key === "ArrowRight") { goto(ply + 1); ev.preventDefault(); }
    if (ev.key === "Escape" && promo) { promo = null; draw(); }
  });

  root.setLine = setLine;
  root.goto = goto;
  root.fen = () => game.fen();
  root.line = () => line.slice();
  setLine(moves, false);
  return root;
}
