/* =================================================================
   APP
   Loads a category's JSON, lists the names as chips, renders the
   selected card underneath.
   =================================================================*/

import { CATEGORIES } from "./config.js";
import { buildCardSVG, resolveCardConfig } from "./card.js";

const els = {
  categories: document.getElementById("categories"),
  search: document.getElementById("search"),
  chips: document.getElementById("chips"),
  count: document.getElementById("count"),
  stage: document.getElementById("stage"),
  status: document.getElementById("status")
};

const state = {
  categoryIndex: -1,
  category: null, // the config entry
  deck: null, // the parsed JSON
  cardConfig: null, // { layout, geometry } resolved for this deck
  cards: [],
  filtered: [],
  selectedId: null
};

/* --- small helpers ------------------------------------------------ */

const cache = new Map();

async function loadDeck(entry) {
  if (cache.has(entry.file)) return cache.get(entry.file);

  const res = await fetch(entry.file, { cache: "no-store" });
  if (!res.ok) throw new Error(`${entry.file} returned ${res.status}`);

  const deck = await res.json();
  if (!Array.isArray(deck?.cards)) {
    throw new Error(`${entry.file} has no "cards" array`);
  }

  cache.set(entry.file, deck);
  return deck;
}

function setStatus(message, tone = "info") {
  els.status.textContent = message || "";
  els.status.dataset.tone = tone;
  els.status.hidden = !message;
}

/* --- category bar ------------------------------------------------- */

function renderCategories() {
  els.categories.innerHTML = "";

  CATEGORIES.forEach((entry, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "category";
    btn.textContent = entry.label || entry.file;
    btn.setAttribute("aria-pressed", String(i === state.categoryIndex));
    btn.addEventListener("click", () => selectCategory(i));
    els.categories.append(btn);
  });
}

async function selectCategory(index) {
  const entry = CATEGORIES[index];
  if (!entry) return;

  state.categoryIndex = index;
  state.category = entry;
  state.selectedId = null;

  renderCategories();
  els.chips.innerHTML = "";
  els.stage.innerHTML = "";
  els.count.textContent = "";
  setStatus("Loading deck…");

  try {
    const deck = await loadDeck(entry);
    state.deck = deck;
    state.cards = deck.cards;
    state.cardConfig = resolveCardConfig(deck);

    // Use the JSON's own name if the config didn't give one.
    if (!entry.label && deck.categoryName) {
      entry.label = deck.categoryName;
      renderCategories();
    }

    setStatus("");
    applyFilter(els.search.value);
    els.search.focus();
  } catch (err) {
    setStatus(
      `Couldn't load ${entry.file}. ${err.message}. Check the path in js/config.js, and serve the folder over http rather than opening the file directly.`,
      "error"
    );
  }
}

/* --- chips -------------------------------------------------------- */

function applyFilter(query) {
  const q = String(query || "").trim().toLowerCase();

  state.filtered = !q
    ? state.cards
    : state.cards.filter((c) => {
        const name = String(c.region || "").toLowerCase();
        const nick = String(c.nickname || "").toLowerCase();
        return name.includes(q) || nick.includes(q);
      });

  renderChips();
}

function renderChips() {
  els.chips.innerHTML = "";

  const total = state.cards.length;
  const shown = state.filtered.length;
  els.count.textContent =
    shown === total ? `${total} cards` : `${shown} of ${total} cards`;

  if (!shown) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No names match that search.";
    els.chips.append(empty);
    return;
  }

  state.filtered.forEach((card) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = card.region || card.id;
    chip.setAttribute("aria-pressed", String(card.id === state.selectedId));
    chip.addEventListener("click", () => selectCard(card));
    els.chips.append(chip);
  });
}

/* --- the card stage ----------------------------------------------- */

async function selectCard(card) {
  state.selectedId = card.id;
  renderChips();

  els.stage.setAttribute("aria-busy", "true");

  try {
    const svg = await buildCardSVG(card, state.category, state.cardConfig);
    els.stage.innerHTML = `<div class="card">${svg}</div>`;
    els.stage.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    setStatus(`Couldn't render ${card.region}. ${err.message}`, "error");
  } finally {
    els.stage.removeAttribute("aria-busy");
  }
}

/* --- boot --------------------------------------------------------- */

function init() {
  if (!CATEGORIES.length) {
    setStatus("No categories configured. Add one to CATEGORIES in js/config.js.", "error");
    return;
  }

  els.search.addEventListener("input", (e) => {
    if (state.cards.length) applyFilter(e.target.value);
  });

  renderCategories();
  selectCategory(0);
}

init();
