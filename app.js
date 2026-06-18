/* Road Trip Bingo Generator — client-side PDF generation with jsPDF.
   Everything runs in the browser, so it works on GitHub Pages (static hosting). */

(function () {
  "use strict";

  // ---- UI references ----
  const el = (id) => document.getElementById(id);
  const titleInput = el("title");
  const numCardsInput = el("numCards");
  const gridSizeInput = el("gridSize");
  const commonPct = el("commonPct");
  const commonPctVal = el("commonPctVal");
  const freeSpace = el("freeSpace");
  const gameType = el("gameType");
  const customItems = el("customItems");
  const generateBtn = el("generate");
  const status = el("status");

  // Show the built-in list
  el("defaultCount").textContent = DEFAULT_WORDS.length;
  el("defaultPreview").textContent = DEFAULT_WORDS.join(" · ");

  commonPct.addEventListener("input", () => {
    commonPctVal.textContent = commonPct.value + "%";
  });

  // ---- Helpers ----
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function parseCustom(text) {
    return text
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function dedupe(arr) {
    const seen = new Set();
    const out = [];
    for (const item of arr) {
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  }

  function setStatus(msg, isError) {
    status.textContent = msg;
    status.className = isError ? "error" : "";
  }

  // Build one card's grid of words (array of length cells).
  // commonItems appear on every card (shuffled positions); rest are unique-per-card.
  function buildCard(commonItems, fillPool, cells, useFree, freeIndex) {
    const slots = new Array(cells).fill(null);
    const positions = shuffle([...Array(cells).keys()].filter((i) => !(useFree && i === freeIndex)));

    let p = 0;
    // Place shared/common items first.
    for (const item of commonItems) {
      if (p >= positions.length) break;
      slots[positions[p++]] = item;
    }
    // Fill the rest from a freshly shuffled pool (unique within this card).
    const pool = shuffle(fillPool);
    let f = 0;
    while (p < positions.length) {
      slots[positions[p++]] = pool[f++ % pool.length];
    }
    if (useFree) slots[freeIndex] = "FREE";
    return slots;
  }

  // ---- PDF drawing ----
  // Color palette (RGB).
  const C = {
    ink:      [33, 43, 58],
    primary:  [37, 99, 175],
    primaryDk:[24, 71, 130],
    accent:   [231, 124, 38],
    altFill:  [238, 243, 250],
    line:     [196, 208, 224],
    muted:    [128, 138, 154],
    white:    [255, 255, 255],
  };
  const fill = (doc, c) => doc.setFillColor(c[0], c[1], c[2]);
  const draw = (doc, c) => doc.setDrawColor(c[0], c[1], c[2]);
  const text = (doc, c) => doc.setTextColor(c[0], c[1], c[2]);

  // Draw a filled n-point star centered at (cx, cy).
  function star(doc, cx, cy, outer, inner, color) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    const deltas = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
    fill(doc, color);
    doc.lines(deltas, pts[0][0], pts[0][1], [1, 1], "F", true);
  }

  // Game types: winning patterns. `name` and `desc` are printed on the card.
  const GAMES = {
    line:     { name: "Line",          desc: "Fill any full row, column, or diagonal" },
    corners:  { name: "Four Corners",  desc: "Fill all four corner squares" },
    letterT:  { name: "Letter T",      desc: "Fill the top row and the middle column" },
    letterX:  { name: "Letter X",      desc: "Fill both diagonals" },
    plus:     { name: "Plus Sign",     desc: "Fill the middle row and middle column" },
    frame:    { name: "Picture Frame", desc: "Fill the entire outer border" },
    blackout: { name: "Blackout",      desc: "Fill every square on the card" },
  };

  // Set of cell indices that illustrate a pattern on a `grid`×`grid` board.
  function maskFor(id, grid) {
    const n = grid, mid = Math.floor(n / 2), m = new Set();
    const add = (r, c) => m.add(r * n + c);
    switch (id) {
      case "line": for (let c = 0; c < n; c++) add(0, c); break; // a sample row
      case "corners": add(0, 0); add(0, n - 1); add(n - 1, 0); add(n - 1, n - 1); break;
      case "letterT":
        for (let c = 0; c < n; c++) add(0, c);
        for (let r = 0; r < n; r++) add(r, mid);
        break;
      case "letterX":
        for (let i = 0; i < n; i++) { add(i, i); add(i, n - 1 - i); }
        break;
      case "plus":
        for (let c = 0; c < n; c++) add(mid, c);
        for (let r = 0; r < n; r++) add(r, mid);
        break;
      case "frame":
        for (let c = 0; c < n; c++) { add(0, c); add(n - 1, c); }
        for (let r = 0; r < n; r++) { add(r, 0); add(r, n - 1); }
        break;
      case "blackout": for (let i = 0; i < n * n; i++) m.add(i); break;
    }
    return m;
  }

  // Small grid diagram with the target cells highlighted.
  function drawPatternIcon(doc, x, y, size, grid, mask) {
    const cs = size / grid;
    doc.setLineWidth(0.4);
    draw(doc, C.line);
    for (let r = 0; r < grid; r++) {
      for (let c = 0; c < grid; c++) {
        fill(doc, mask.has(r * grid + c) ? C.accent : C.altFill);
        doc.rect(x + c * cs, y + r * cs, cs, cs, "FD");
      }
    }
  }

  // Fit a word into a cell: wrap + shrink font; returns {lines, fontSize, lineH}.
  function fitText(doc, word, maxW, maxH, startSize) {
    let fontSize = startSize;
    let lines;
    do {
      doc.setFontSize(fontSize);
      lines = doc.splitTextToSize(word, maxW);
      if (lines.length * (fontSize + 2) <= maxH) break;
      fontSize -= 0.5;
    } while (fontSize > 6);
    return { lines, fontSize, lineH: fontSize + 2 };
  }

  function drawCard(doc, title, slots, grid, cardNum, total, game) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 36;
    const frameX = margin, frameY = margin;
    const frameW = pageW - margin * 2, frameH = pageH - margin * 2;
    const pad = 20;
    const contentX = frameX + pad;
    const contentW = frameW - pad * 2;

    // Decorative double frame.
    doc.setLineWidth(2);
    draw(doc, C.primary);
    doc.roundedRect(frameX, frameY, frameW, frameH, 12, 12, "S");
    doc.setLineWidth(0.6);
    draw(doc, C.line);
    doc.roundedRect(frameX + 5, frameY + 5, frameW - 10, frameH - 10, 9, 9, "S");

    // Title banner.
    const bannerY = frameY + pad;
    const bannerH = 50;
    fill(doc, C.primary);
    doc.roundedRect(contentX, bannerY, contentW, bannerH, 9, 9, "F");
    doc.setFont("helvetica", "bold");
    text(doc, C.white);
    const tFit = fitText(doc, title.toUpperCase(), contentW - 30, bannerH, 26);
    doc.setFontSize(tFit.fontSize);
    const tStartY = bannerY + bannerH / 2 - ((tFit.lines.length - 1) * tFit.lineH) / 2 + tFit.fontSize / 3;
    tFit.lines.forEach((line, i) =>
      doc.text(line, pageW / 2, tStartY + i * tFit.lineH, { align: "center" })
    );

    // Tagline under banner.
    const taglineY = bannerY + bannerH + 16;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10.5);
    text(doc, C.muted);
    doc.text("Spot it  •  mark it  •  shout BINGO!", pageW / 2, taglineY, { align: "center" });

    // Footer layout reserved at the bottom.
    const footerH = 42;
    const footerTop = frameY + frameH - pad - footerH;

    // Grid geometry — centered in the space between tagline and footer.
    const availTop = taglineY + 14;
    const availH = footerTop - availTop;
    const cell = Math.min(contentW / grid, availH / grid);
    const gridW = cell * grid;
    const gridLeft = contentX + (contentW - gridW) / 2;
    const gridTop = availTop + (availH - gridW) / 2;
    const gap = 3;

    for (let r = 0; r < grid; r++) {
      for (let c = 0; c < grid; c++) {
        const x = gridLeft + c * cell;
        const y = gridTop + r * cell;
        const cx = x + cell / 2, cy = y + cell / 2;
        const word = slots[r * grid + c] || "";
        const bx = x + gap, by = y + gap, bs = cell - gap * 2;

        if (word === "FREE") {
          fill(doc, C.accent);
          draw(doc, C.accent);
          doc.setLineWidth(0.8);
          doc.roundedRect(bx, by, bs, bs, 6, 6, "FD");
          star(doc, cx, cy - bs * 0.12, bs * 0.26, bs * 0.11, C.white);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(Math.min(15, bs * 0.22));
          text(doc, C.white);
          doc.text("FREE", cx, cy + bs * 0.28, { align: "center" });
          continue;
        }

        // Checkerboard tint for visual rhythm.
        fill(doc, (r + c) % 2 === 0 ? C.altFill : C.white);
        draw(doc, C.line);
        doc.setLineWidth(0.8);
        doc.roundedRect(bx, by, bs, bs, 6, 6, "FD");

        text(doc, C.ink);
        doc.setFont("helvetica", "normal");
        const f = fitText(doc, word, bs - 10, bs - 8, Math.min(12, bs * 0.2));
        doc.setFontSize(f.fontSize);
        const startY = cy - ((f.lines.length - 1) * f.lineH) / 2 + f.fontSize / 3;
        f.lines.forEach((line, i) =>
          doc.text(line, cx, startY + i * f.lineH, { align: "center" })
        );
      }
    }

    // Footer: divider, pattern diagram, game name + rule, card number.
    draw(doc, C.line);
    doc.setLineWidth(0.6);
    doc.line(contentX, footerTop + 4, contentX + contentW, footerTop + 4);

    const fMid = footerTop + 4 + (footerH - 4) / 2;
    const iconSize = Math.min(30, footerH - 12);
    drawPatternIcon(doc, contentX, fMid - iconSize / 2, iconSize, grid, maskFor(game.id, grid));

    const textX = contentX + iconSize + 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    text(doc, C.primary);
    doc.text("How to win — " + game.name, textX, fMid - 3, { baseline: "middle" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    text(doc, C.muted);
    doc.text(game.desc + ".", textX, fMid + 11, { baseline: "middle" });

    if (total > 1) {
      doc.setFontSize(8.5);
      text(doc, C.muted);
      doc.text("Card " + cardNum + " of " + total, contentX + contentW, fMid, {
        align: "right",
        baseline: "middle",
      });
    }
  }

  // ---- Main ----
  function generate() {
    try {
      const title = (titleInput.value || "Road Trip Bingo").trim();
      const numCards = Math.max(1, Math.min(200, parseInt(numCardsInput.value, 10) || 1));
      const grid = Math.max(3, Math.min(6, parseInt(gridSizeInput.value, 10) || 5));
      const cells = grid * grid;
      const useFree = freeSpace.checked && grid % 2 === 1;
      const freeIndex = useFree ? Math.floor(cells / 2) : -1;
      const fillableCells = cells - (useFree ? 1 : 0);
      const pct = parseInt(commonPct.value, 10) || 0;
      const gameId = GAMES[gameType.value] ? gameType.value : "line";
      const game = { id: gameId, name: GAMES[gameId].name, desc: GAMES[gameId].desc };

      // Word pool: built-in + custom, de-duplicated.
      const custom = parseCustom(customItems.value);
      const allWords = dedupe([...DEFAULT_WORDS, ...custom]);

      if (allWords.length < fillableCells) {
        setStatus(
          `Need at least ${fillableCells} items for a ${grid}×${grid} card, but only have ${allWords.length}. Add more custom items.`,
          true
        );
        return;
      }

      // How many items are shared across all cards.
      let commonCount = Math.round((pct / 100) * fillableCells);
      commonCount = Math.min(commonCount, fillableCells, allWords.length);

      const shuffledAll = shuffle(allWords);
      const commonItems = shuffledAll.slice(0, commonCount);
      const fillPool = shuffledAll.slice(commonCount);

      if (fillPool.length < fillableCells - commonCount) {
        setStatus("Not enough unique items to fill each card without repeats. Add more items or lower the shared %.", true);
        return;
      }

      setStatus("Generating " + numCards + " card(s)…");

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "letter" });

      for (let i = 0; i < numCards; i++) {
        if (i > 0) doc.addPage();
        const slots = buildCard(commonItems, fillPool, cells, useFree, freeIndex);
        drawCard(doc, title, slots, grid, i + 1, numCards, game);
      }

      const safeTitle = title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "bingo";
      doc.save(safeTitle + "-cards.pdf");
      setStatus("Done! Generated " + numCards + " card(s). Check your downloads.");
    } catch (err) {
      console.error(err);
      setStatus("Something went wrong: " + err.message, true);
    }
  }

  generateBtn.addEventListener("click", generate);
})();
