import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

function uid() {
  return crypto.randomUUID?.() ?? String(Date.now() + Math.random());
}

function splitBulk(text) {
  return text
    .split(/[\n,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function App() {
  const [mode, setMode] = useState("pick"); // "pick" | "manage"
  const [name, setName] = useState("");
  const [bulkText, setBulkText] = useState("");

  const [cards, setCards] = useState(() => {
    const raw = localStorage.getItem("country-picker.cards");
    return raw ? JSON.parse(raw) : [];
  });

  const [pickedId, setPickedId] = useState(null);

  // rolling (working baseline + hard stop)
  const [isRolling, setIsRolling] = useState(false);
  const [rollingName, setRollingName] = useState("");
  const rollingTimerRef = useRef(null);
  const hardStopTimerRef = useRef(null);

  // IMPORTANT: refs to avoid stale state in timeouts
  const isRollingRef = useRef(false);
  const lastShownRef = useRef(null); // {id, name}

  useEffect(() => {
    localStorage.setItem("country-picker.cards", JSON.stringify(cards));
  }, [cards]);

  useEffect(() => {
    return () => {
      if (rollingTimerRef.current) clearTimeout(rollingTimerRef.current);
      if (hardStopTimerRef.current) clearTimeout(hardStopTimerRef.current);
    };
  }, []);

  const uncheckedCards = useMemo(() => cards.filter((c) => !c.done), [cards]);

  const picked = useMemo(
    () => (pickedId ? cards.find((c) => c.id === pickedId) : null),
    [pickedId, cards]
  );

  function addCard() {
    const trimmed = name.trim();
    if (!trimmed) return;

    const exists = cards.some(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      alert("That card already exists.");
      return;
    }

    setCards((prev) => [
      ...prev,
      { id: uid(), name: trimmed, done: false, createdAt: Date.now() },
    ]);
    setName("");
  }

  function bulkAdd() {
    const items = splitBulk(bulkText);
    if (items.length === 0) return;

    const existing = new Set(cards.map((c) => c.name.toLowerCase()));
    const uniqueNew = [];

    for (const item of items) {
      const key = item.toLowerCase();
      if (!existing.has(key)) {
        existing.add(key);
        uniqueNew.push(item);
      }
    }

    if (uniqueNew.length === 0) {
      alert("Nothing new to add (all duplicates).");
      return;
    }

    const now = Date.now();
    const newCards = uniqueNew.map((item, idx) => ({
      id: uid(),
      name: item,
      done: false,
      createdAt: now + idx,
    }));

    setCards((prev) => [...prev, ...newCards]);
    setBulkText("");
  }

  function toggleDone(id) {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, done: !c.done } : c))
    );
    if (pickedId === id) setPickedId(null);
  }

  function removeCard(id) {
    setCards((prev) => prev.filter((c) => c.id !== id));
    if (pickedId === id) setPickedId(null);
  }

  // ✅ Working rolling baseline + ✅ Hard stop at exactly 5s
  function startRollingPick() {
    if (isRollingRef.current) return;

    if (uncheckedCards.length === 0) {
      alert("No unchecked cards left. Add more in Manage Deck.");
      return;
    }

    // clear any existing timers
    if (rollingTimerRef.current) clearTimeout(rollingTimerRef.current);
    if (hardStopTimerRef.current) clearTimeout(hardStopTimerRef.current);

    setIsRolling(true);
    isRollingRef.current = true;
    setPickedId(null);

    // seed with a first visible value
    const seed = uncheckedCards[Math.floor(Math.random() * uncheckedCards.length)];
    lastShownRef.current = { id: seed.id, name: seed.name };
    setRollingName(seed.name);

    // HARD STOP at 5 seconds: stop on whatever is currently displayed
    hardStopTimerRef.current = setTimeout(() => {
      if (!isRollingRef.current) return;

      // stop rolling loop
      if (rollingTimerRef.current) clearTimeout(rollingTimerRef.current);

      const last = lastShownRef.current;
      if (last?.id) {
        setRollingName(last.name);
        setPickedId(last.id);
      }
      setIsRolling(false);
      isRollingRef.current = false;

      if (hardStopTimerRef.current) clearTimeout(hardStopTimerRef.current);
      hardStopTimerRef.current = null;
    }, 5000);

    // original rolling loop (boring but stable)
    const winner =
      uncheckedCards[Math.floor(Math.random() * uncheckedCards.length)];

    const steps = Math.min(40, Math.max(18, uncheckedCards.length * 3));
    let i = 0;
    let delay = 35;

    const tick = () => {
      // if hard stop already happened, don't continue
      if (!isRollingRef.current) return;

      i += 1;

      const randomCard =
        uncheckedCards[Math.floor(Math.random() * uncheckedCards.length)];
      lastShownRef.current = { id: randomCard.id, name: randomCard.name };
      setRollingName(randomCard.name);

      delay = Math.floor(delay * 1.08 + 6);

      if (i < steps) {
        rollingTimerRef.current = setTimeout(tick, delay);
      } else {
        // normal finish
        lastShownRef.current = { id: winner.id, name: winner.name };
        setRollingName(winner.name);
        setPickedId(winner.id);

        if (hardStopTimerRef.current) clearTimeout(hardStopTimerRef.current);
        hardStopTimerRef.current = null;

        rollingTimerRef.current = setTimeout(() => {
          setIsRolling(false);
          isRollingRef.current = false;
        }, 250);
      }
    };

    tick();
  }

  return (
    <div className="page">
      <div className="shell">
        <header className="header">
          <h1>Country Picker</h1>
          <p>
            {mode === "pick"
              ? "Pick a country from your deck."
              : "Manage your deck: add, delete, mark done, bulk add, and search."}
          </p>
        </header>

        {mode === "pick" ? (
          <PickScreen
            unchecked={uncheckedCards.length}
            picked={picked}
            rollingName={rollingName}
            isRolling={isRolling}
            onPick={startRollingPick}
            onGoManage={() => setMode("manage")}
            canPick={uncheckedCards.length > 0}
          />
        ) : (
          <ManageScreen
            cards={cards}
            name={name}
            setName={setName}
            bulkText={bulkText}
            setBulkText={setBulkText}
            addCard={addCard}
            bulkAdd={bulkAdd}
            toggleDone={toggleDone}
            removeCard={removeCard}
            pickedId={pickedId}
            onBack={() => setMode("pick")}
          />
        )}
      </div>
    </div>
  );
}

function PickScreen({
  unchecked,
  picked,
  rollingName,
  isRolling,
  onPick,
  onGoManage,
  canPick,
}) {
  const displayName = isRolling ? rollingName || "…" : picked ? picked.name : "—";

  return (
    <div className="pickLayout">
      <section className="pickHero">
        <button
          className={"btn pick " + (isRolling ? "rollingBtn" : "")}
          onClick={onPick}
          disabled={!canPick || isRolling}
        >
          {isRolling ? "🎰 Rolling…" : "🎲 Pick a country"}
        </button>

        <div className={"picked bigPicked " + (isRolling ? "rollingPicked" : "")}>
          <div className="pickedLabel">{isRolling ? "Rolling" : "Selected"}</div>
          <div className="pickedValue">{displayName}</div>
          <div className="pickedSub">
            {isRolling
              ? "Good luck… (max 5 seconds)"
              : picked
              ? "Tip: mark it done in Manage Deck to avoid repeats."
              : "Press Pick to choose from unchecked cards."}
          </div>
        </div>

        <div className="belowPickedRow">
          <button className="btn primary" onClick={onGoManage} disabled={isRolling}>
            ⚙️ Manage deck
          </button>
          <div className="pill">{unchecked} unchecked remaining</div>
        </div>
      </section>
    </div>
  );
}

function ManageScreen({
  cards,
  name,
  setName,
  bulkText,
  setBulkText,
  addCard,
  bulkAdd,
  toggleDone,
  removeCard,
  pickedId,
  onBack,
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const sortedCards = useMemo(
    () => cards.slice().sort((a, b) => Number(a.done) - Number(b.done)),
    [cards]
  );

  const filteredCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedCards;
    return sortedCards.filter((c) => c.name.toLowerCase().includes(q));
  }, [sortedCards, query]);

  const totalPages = Math.max(1, Math.ceil(filteredCards.length / pageSize));

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const startIdx = (page - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, filteredCards.length);
  const pageItems = filteredCards.slice(startIdx, endIdx);

  function clearSearch() {
    setQuery("");
    setPage(1);
  }

  function onSearchChange(v) {
    setQuery(v);
    setPage(1);
  }

  return (
    <div className="grid">
      <section className="panel">
        <div className="box">
          <div className="boxTitle">
            <h3>DECK</h3>
            <div className="kpi">{cards.length} cards</div>
          </div>

          <button className="btn primary" onClick={onBack} style={{ width: "100%" }}>
            ← Back to Picker
          </button>
        </div>

        <div className="box">
          <div className="boxTitle">
            <h3>ADD ONE</h3>
            <div className="kpi">Quick add</div>
          </div>

          <div className="row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Add a country…"
              onKeyDown={(e) => {
                if (e.key === "Enter") addCard();
              }}
            />
            <button className="btn primary" onClick={addCard}>
              Add
            </button>
          </div>

          <div className="meta">
            <span>Duplicates are blocked (case-insensitive).</span>
          </div>
        </div>

        <div className="box">
          <div className="boxTitle">
            <h3>BULK ADD</h3>
            <div className="kpi">Paste a list</div>
          </div>

          <textarea
            className="bulkArea"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={
              "Paste countries separated by newline, comma, or semicolon.\nExample:\nFrance; Germany; Japan\nBrazil, Canada\nSpain"
            }
          />

          <div className="bulkActions">
            <button className="btn primary" onClick={bulkAdd} disabled={!bulkText.trim()}>
              Add all
            </button>
            <div className="smallHint">
              Splits on <b>newline</b>, <b>,</b>, or <b>;</b>
            </div>
          </div>
        </div>
      </section>

      <section className="listPanel">
        <div className="listHeader">
          <h2>Cards</h2>
          <div className="small">
            Showing <b>{filteredCards.length}</b>{" "}
            {query.trim() ? "match(es)" : "total"}
          </div>
        </div>

        <div className="listControls">
          <div className="searchRow">
            <input
              value={query}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder='Look for a card… (e.g. "ger")'
            />
            <button className="btn danger" onClick={clearSearch} disabled={!query.trim()}>
              Clear
            </button>
          </div>

          <div className="pager">
            <button
              className="btn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              ← Prev
            </button>

            <div className="pagerMid">
              Page <b>{page}</b> / <b>{totalPages}</b>
              <span className="pagerSub">
                (showing {filteredCards.length === 0 ? 0 : startIdx + 1}-{endIdx})
              </span>
            </div>

            <button
              className="btn"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next →
            </button>
          </div>
        </div>

        <div className="listScroll">
          <ul className="list">
            {pageItems.map((c) => (
              <li
                key={c.id}
                className={
                  "item " +
                  (c.done ? "done " : "") +
                  (pickedId === c.id ? "pickedOutline" : "")
                }
              >
                <label className="itemLeft">
                  <input
                    type="checkbox"
                    checked={c.done}
                    onChange={() => toggleDone(c.id)}
                  />
                  <span className="itemName">{c.name}</span>
                </label>

                <button className="btn danger" onClick={() => removeCard(c.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>

          {filteredCards.length === 0 && (
            <div className="empty">No results. Try a different search term.</div>
          )}
        </div>
      </section>
    </div>
  );
}
