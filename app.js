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
  const freeLabelField = el("freeLabelField");
  const freeLabelInput = el("freeLabel");
  const gameType = el("gameType");
  const customItems = el("customItems");
  const generateBtn = el("generate");
  const status = el("status");
  const chipsContainer = el("defaultChips");

  // Built-in word list, loaded from words.json at startup.
  let DEFAULT_WORDS = [];

  // Per-word overrides chosen in the word-list viewer.
  //  - always:  word appears on EVERY card
  //  - blocked: word is excluded from ALL cards
  // A word is in at most one of these.
  const alwaysWords = new Set();
  const blockedWords = new Set();

  // Render the built-in list as clickable chips that cycle through states.
  function renderChips() {
    chipsContainer.innerHTML = "";
    DEFAULT_WORDS.forEach((word) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = word;
      if (alwaysWords.has(word)) chip.classList.add("always");
      else if (blockedWords.has(word)) chip.classList.add("blocked");
      chip.title =
        alwaysWords.has(word) ? "On every card — click to block"
        : blockedWords.has(word) ? "Blocked — click to reset"
        : "Click to put on every card";
      chip.addEventListener("click", () => {
        if (alwaysWords.has(word)) { alwaysWords.delete(word); blockedWords.add(word); }
        else if (blockedWords.has(word)) { blockedWords.delete(word); }
        else { alwaysWords.add(word); }
        renderChips();
      });
      chipsContainer.appendChild(chip);
    });
  }

  generateBtn.disabled = true;
  fetch("words.json")
    .then((res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then((words) => {
      if (!Array.isArray(words)) throw new Error("words.json is not an array");
      DEFAULT_WORDS = words;
      el("defaultCount").textContent = DEFAULT_WORDS.length;
      renderChips();
      generateBtn.disabled = false;
    })
    .catch((err) => {
      console.error("Failed to load words.json", err);
      // Still allow generating from custom items alone.
      generateBtn.disabled = false;
      setStatus(
        "Couldn't load the built-in word list (words.json). You can still add your own custom items.",
        true
      );
    });

  commonPct.addEventListener("input", () => {
    commonPctVal.textContent = commonPct.value + "%";
  });

  // The center-label input only matters when a free space is enabled.
  function syncFreeLabel() {
    freeLabelField.style.display = freeSpace.checked ? "" : "none";
  }
  freeSpace.addEventListener("change", syncFreeLabel);
  syncFreeLabel();

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
    // The center/free cell (if any) is left empty here and drawn specially.
    return slots;
  }

  // ---- PDF drawing ----
  // Color palette (RGB).
  const C = {
    ink:      [33, 43, 58],
    primary:  [37, 99, 175],
    primaryDk:[24, 71, 130],
    accent:   [231, 124, 38],
    accentDk: [196, 96, 18],
    altFill:  [238, 243, 250],
    warmFill: [253, 246, 235],
    line:     [196, 208, 224],
    muted:    [128, 138, 154],
    bg:       [247, 250, 254],
    shadow:   [210, 219, 232],
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

  // Letter shown above each grid column, mapped from "BINGO" across the width.
  function columnLetter(c, grid) {
    const L = "BINGO";
    return L[Math.min(L.length - 1, Math.floor((c * L.length) / grid))];
  }

  function drawCard(doc, title, slots, grid, cardNum, total, game, freeIndex, freeLabel) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 36;
    const frameX = margin, frameY = margin;
    const frameW = pageW - margin * 2, frameH = pageH - margin * 2;
    const pad = 20;
    const contentX = frameX + pad;
    const contentW = frameW - pad * 2;

    // Soft page tint behind everything.
    fill(doc, C.bg);
    doc.rect(0, 0, pageW, pageH, "F");

    // Decorative double frame.
    doc.setLineWidth(2);
    draw(doc, C.primary);
    doc.roundedRect(frameX, frameY, frameW, frameH, 12, 12, "S");
    doc.setLineWidth(0.6);
    draw(doc, C.line);
    doc.roundedRect(frameX + 5, frameY + 5, frameW - 10, frameH - 10, 9, 9, "S");

    // Little star flourishes tucked into the four corners.
    [[frameX + 14, frameY + 14], [frameX + frameW - 14, frameY + 14],
     [frameX + 14, frameY + frameH - 14], [frameX + frameW - 14, frameY + frameH - 14]]
      .forEach(([sx, sy]) => star(doc, sx, sy, 5, 2.1, C.accent));

    // Title banner with a soft drop shadow.
    const bannerY = frameY + pad;
    const bannerH = 50;
    fill(doc, C.shadow);
    doc.roundedRect(contentX, bannerY + 3, contentW, bannerH, 9, 9, "F");
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

    // Accent bar + tagline under the banner.
    fill(doc, C.accent);
    doc.roundedRect(pageW / 2 - 38, bannerY + bannerH + 5, 76, 4, 2, 2, "F");
    const taglineY = bannerY + bannerH + 24;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10.5);
    text(doc, C.muted);
    doc.text("Spot it  •  mark it  •  shout BINGO!", pageW / 2, taglineY, { align: "center" });

    // Footer layout reserved at the bottom.
    const footerH = 42;
    const footerTop = frameY + frameH - pad - footerH;

    // Grid geometry — a column-letter strip sits above a centered square grid.
    const gap = 3;
    const availTop = taglineY + 12;
    const availH = footerTop - availTop;
    const stripGap = 8;
    const cell = Math.min(contentW / grid, (availH - stripGap) / (grid + 0.7));
    const stripH = Math.min(26, cell * 0.62);
    const gridW = cell * grid;
    const gridLeft = contentX + (contentW - gridW) / 2;
    const blockH = stripH + stripGap + gridW;
    const stripTop = availTop + (availH - blockH) / 2;
    const gridTop = stripTop + stripH + stripGap;

    // B-I-N-G-O column headers.
    doc.setFont("helvetica", "bold");
    for (let c = 0; c < grid; c++) {
      const x = gridLeft + c * cell;
      fill(doc, c % 2 === 0 ? C.primary : C.accent);
      doc.roundedRect(x + gap, stripTop, cell - gap * 2, stripH, 5, 5, "F");
      text(doc, C.white);
      doc.setFontSize(Math.min(16, stripH * 0.7));
      doc.text(columnLetter(c, grid), x + cell / 2, stripTop + stripH / 2, {
        align: "center",
        baseline: "middle",
      });
    }

    for (let r = 0; r < grid; r++) {
      for (let c = 0; c < grid; c++) {
        const x = gridLeft + c * cell;
        const y = gridTop + r * cell;
        const cx = x + cell / 2, cy = y + cell / 2;
        const idx = r * grid + c;
        const bx = x + gap, by = y + gap, bs = cell - gap * 2;

        if (idx === freeIndex) {
          fill(doc, C.accent);
          draw(doc, C.accentDk);
          doc.setLineWidth(0.8);
          doc.roundedRect(bx, by, bs, bs, 6, 6, "FD");
          star(doc, cx, cy - bs * 0.14, bs * 0.27, bs * 0.115, C.white);
          doc.setFont("helvetica", "bold");
          text(doc, C.white);
          const lf = fitText(doc, freeLabel.toUpperCase(), bs - 8, bs * 0.42, Math.min(14, bs * 0.2));
          doc.setFontSize(lf.fontSize);
          const ly = cy + bs * 0.3 - ((lf.lines.length - 1) * lf.lineH) / 2;
          lf.lines.forEach((line, i) =>
            doc.text(line, cx, ly + i * lf.lineH, { align: "center" })
          );
          continue;
        }

        const word = slots[idx] || "";

        // Checkerboard of cool/warm tints for visual rhythm.
        fill(doc, (r + c) % 2 === 0 ? C.altFill : C.warmFill);
        draw(doc, C.line);
        doc.setLineWidth(0.8);
        doc.roundedRect(bx, by, bs, bs, 6, 6, "FD");

        // Faint circle in the corner — a target to dab/mark.
        draw(doc, C.line);
        doc.setLineWidth(0.5);
        const mr = Math.max(2.4, bs * 0.07);
        doc.circle(bx + bs - mr - 3, by + mr + 3, mr, "S");

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
    star(doc, textX + 3, fMid - 3, 4, 1.7, C.accent);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    text(doc, C.primary);
    doc.text("How to win — " + game.name, textX + 12, fMid - 3, { baseline: "middle" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    text(doc, C.muted);
    doc.text(game.desc + ".", textX + 12, fMid + 11, { baseline: "middle" });

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
      const freeLabel = useFree ? ((freeLabelInput.value || "").trim() || "FREE") : "FREE";

      // Word pool: built-in + custom, de-duplicated, with blocked words removed.
      const custom = parseCustom(customItems.value);
      const allWords = dedupe([...DEFAULT_WORDS, ...custom]).filter((w) => !blockedWords.has(w));

      // Words the user pinned to appear on EVERY card.
      const forced = allWords.filter((w) => alwaysWords.has(w));

      if (forced.length > fillableCells) {
        setStatus(
          `You've pinned ${forced.length} words to every card, but a ${grid}×${grid} card only has ${fillableCells} usable cells. Unpin some words.`,
          true
        );
        return;
      }

      if (allWords.length < fillableCells) {
        setStatus(
          `Need at least ${fillableCells} items for a ${grid}×${grid} card, but only have ${allWords.length}. Add more custom items or block fewer.`,
          true
        );
        return;
      }

      // Shared items = the pinned words plus enough random ones to hit the %.
      let commonCount = Math.round((pct / 100) * fillableCells);
      commonCount = Math.min(commonCount, fillableCells, allWords.length);
      commonCount = Math.max(commonCount, forced.length);

      const others = shuffle(allWords.filter((w) => !alwaysWords.has(w)));
      const commonItems = shuffle([...forced, ...others.slice(0, commonCount - forced.length)]);
      const fillPool = others.slice(commonCount - forced.length);

      if (fillPool.length < fillableCells - commonItems.length) {
        setStatus("Not enough unique items to fill each card without repeats. Add more items, block fewer, or lower the shared %.", true);
        return;
      }

      setStatus("Generating " + numCards + " card(s)…");

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "letter" });

      for (let i = 0; i < numCards; i++) {
        if (i > 0) doc.addPage();
        const slots = buildCard(commonItems, fillPool, cells, useFree, freeIndex);
        drawCard(doc, title, slots, grid, i + 1, numCards, game, freeIndex, freeLabel);
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
