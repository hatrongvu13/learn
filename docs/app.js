"use strict";
const PER_EXAM = 40;          // số câu mỗi đề
const LS_WRONG = "ttHCM.wrong"; // lưu id câu làm sai
const app = document.getElementById("app");
let ALL = [];
let S = null; // trạng thái phiên làm bài

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) e.append(c instanceof Node ? c : document.createTextNode(c));
  return e;
};
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const getWrong = () => { try { return JSON.parse(localStorage.getItem(keyWrong())) || []; } catch { return []; } };
const setWrong = (ids) => localStorage.setItem(keyWrong(), JSON.stringify([...new Set(ids)]));

let BANKS = [], BANK = null;
const LS_BANK = "ttHCM.bank";
const keyWrong = () => `${LS_WRONG}.${BANK.id}`;

fetch("data/index.json").then((r) => r.json()).then((b) => { BANKS = b; return loadBank(localStorage.getItem(LS_BANK) || b[0].id); })
  .catch(() => { app.textContent = "Không tải được dữ liệu. Hãy mở bằng máy chủ web (GitHub Pages hoặc python3 -m http.server)."; });

async function loadBank(id) {
  BANK = BANKS.find((b) => b.id === id) || BANKS[0];
  localStorage.setItem(LS_BANK, BANK.id);
  const raw = await (await fetch("data/" + BANK.file)).json();
  ALL = BANK.type === "qa" ? raw.map((r) => ({ id: r.id, q: r.q, a: r.a.join("; ") })) : raw;
  document.getElementById("sub").textContent = `${BANK.title} · ${ALL.length} câu`;
  home();
}

// Tạo 4 lựa chọn cho câu chỉ có đáp án đúng: lấy đáp án của câu khác có dạng và độ dài gần nhất.
const shape = (t) => (/\d/.test(t) ? "n" : "t");
const unit = (t) => t.toLowerCase().replace(/[\d\s.,\-–—~>≥≤<=/]+/g, "").slice(-6); // đơn vị: g, cm, phút, ngày...
function toMcq(q) {
  const key = (t) => t.toLowerCase().replace(/\s+/g, "");
  const pool = ALL.filter((x) => x.id !== q.id && key(x.a) !== key(q.a));
  const near = pool.map((x) => ({ x, d: (shape(x.a) === shape(q.a) ? 0 : 1000) + (shape(q.a) === "n" && unit(x.a) !== unit(q.a) ? 300 : 0) + Math.abs(x.a.length - q.a.length) + Math.random() * 15 }))
    .sort((p, r) => p.d - r.d);
  const seen = new Set([key(q.a)]), wrong = [];
  for (const { x } of near) { if (seen.has(key(x.a))) continue; seen.add(key(x.a)); wrong.push(x.a); if (wrong.length === 3) break; }
  return { id: q.id, q: q.q, opts: [q.a, ...wrong], ans: 0 };
}

function home() {
  S = null;
  const opts = { mode: "practice", shuf: true };
  const modeSel = el("div", { class: "row" },
    el("label", {}, el("input", { type: "radio", name: "mode", value: "practice", checked: "" }), "Ôn luyện (xem đáp án ngay)"),
    el("label", {}, el("input", { type: "radio", name: "mode", value: "exam" }), "Thi thử (chấm cuối bài)"));
  const shufBox = el("input", { type: "checkbox", id: "shuf", checked: "" });
  const read = () => ({
    mode: modeSel.querySelector("input:checked").value,
    shuf: shufBox.checked,
  });
  const start = (list, title) => startSession(list, title, read());

  const exams = [];
  for (let i = 0; i * PER_EXAM < ALL.length; i++) {
    const part = ALL.slice(i * PER_EXAM, (i + 1) * PER_EXAM);
    exams.push(el("button", { onclick: () => start(part, `Đề ${i + 1}`) },
      `Đề ${i + 1}`, el("br"), el("span", { class: "small" }, `câu ${part[0].id}–${part[part.length - 1].id}`)));
  }
  const nInput = el("input", { type: "number", min: "1", max: String(ALL.length), value: "40", "aria-label": "Số câu ngẫu nhiên" });
  const wrong = getWrong();
  const wrongBtn = el("button", { disabled: wrong.length ? null : "", onclick: () => start(ALL.filter((q) => getWrong().includes(q.id)), "Câu làm sai") },
    `Ôn lại câu làm sai (${wrong.length})`);
  if (!wrong.length) wrongBtn.setAttribute("disabled", "");
  else wrongBtn.removeAttribute("disabled");

  const bankSel = el("select", { "aria-label": "Chọn bộ đề", onchange: (e) => loadBank(e.target.value) },
    BANKS.map((b) => el("option", { value: b.id, ...(b.id === BANK.id ? { selected: "" } : {}) }, `${b.title}`)));
  const cardBtn = BANK.type === "qa"
    ? el("button", { onclick: () => startFlash(shuffle(ALL)) }, "Thẻ ghi nhớ (lật xem đáp án)") : "";
  app.replaceChildren(
    el("div", { class: "card" }, el("h2", {}, "Bộ đề"), bankSel),
    el("div", { class: "card" }, el("h2", {}, "Cách làm bài"), modeSel,
      el("div", { class: "row" }, el("label", {}, shufBox, "Đảo thứ tự đáp án"))),
    el("h2", {}, "Chọn đề"), el("div", { class: "grid" }, exams),
    el("h2", {}, "Ôn luyện khác"),
    el("div", { class: "card" }, el("div", { class: "row" },
      el("button", { class: "pri", onclick: () => start(ALL, "Toàn bộ") }, `Toàn bộ ${ALL.length} câu`),
      el("button", { onclick: () => start(shuffle(ALL), "Toàn bộ (ngẫu nhiên)") }, "Toàn bộ, xáo thứ tự"),
      wrongBtn, cardBtn),
      el("div", { class: "row", style: "margin-top:10px" },
        el("button", { onclick: () => { const n = Math.max(1, Math.min(ALL.length, +nInput.value || 1)); start(shuffle(ALL).slice(0, n), `Ngẫu nhiên ${n} câu`); } }, "Ngẫu nhiên"),
        nInput, "câu")),
    el("p", { class: "small" }, "Mỗi đề gồm 40 câu liên tiếp trong bộ câu hỏi gốc. Câu làm sai được nhớ trên trình duyệt này."
      + (BANK.type === "qa" ? " Bộ này chỉ có đáp án đúng, nên 3 đáp án nhiễu được lấy từ câu khác." : "")));
}

function startSession(list, title, o) {
  if (!list.length) return;
  const qs = list.map((q0) => {
    const q = q0.opts ? q0 : toMcq(q0);
    const order = o.shuf ? shuffle(q.opts.map((_, i) => i)) : q.opts.map((_, i) => i);
    return { id: q.id, q: q.q, opts: order.map((i) => q.opts[i]), ans: order.indexOf(q.ans), pick: null };
  });
  S = { title, qs, i: 0, mode: o.mode, done: false };
  render();
}

function render() {
  if (S.done) return result();
  const q = S.qs[S.i], practice = S.mode === "practice", shown = practice && q.pick !== null;
  const answered = S.qs.filter((x) => x.pick !== null).length;
  const opts = q.opts.map((t, i) => {
    let cls = "opt";
    if (shown) { if (i === q.ans) cls += " ok"; else if (i === q.pick) cls += " bad"; }
    else if (i === q.pick) cls += " sel";
    return el("button", { class: cls, "aria-pressed": String(i === q.pick), onclick: () => { if (shown) return; q.pick = i; render(); } },
      `${"ABCD"[i] || i + 1}. ${t}`);
  });
  const map = el("div", { class: "map" }, S.qs.map((x, i) => {
    let c = "";
    if (x.pick !== null) c = practice ? (x.pick === x.ans ? "done" : "wrong") : "done";
    if (i === S.i) c += " cur";
    return el("button", { class: c, "aria-label": `Câu ${i + 1}`, onclick: () => { S.i = i; render(); } }, String(i + 1));
  }));
  app.replaceChildren(
    el("div", { class: "row" }, el("button", { onclick: () => { if (confirm("Thoát bài đang làm?")) home(); } }, "← Thoát"),
      el("strong", {}, S.title), el("span", { class: "small" }, `đã làm ${answered}/${S.qs.length}`)),
    el("div", { class: "bar" }, el("i", { style: `width:${(answered / S.qs.length) * 100}%` })),
    el("div", { class: "card" },
      el("div", { class: "small" }, `Câu ${S.i + 1}/${S.qs.length} · số gốc #${q.id}`),
      el("div", { class: "q" }, q.q), opts,
      shown ? el("p", {}, q.pick === q.ans ? "✔ Đúng" : `✘ Sai. Đáp án đúng: ${"ABCD"[q.ans]}. ${q.opts[q.ans]}`) : ""),
    el("div", { class: "nav" },
      el("button", { disabled: S.i === 0 ? "" : null, onclick: () => { S.i--; render(); } }, "← Câu trước"),
      S.i === S.qs.length - 1
        ? el("button", { class: "pri", onclick: finish }, "Nộp bài")
        : el("button", { class: "pri", onclick: () => { S.i++; render(); } }, "Câu sau →")),
    map);
  if (S.i === 0) document.querySelector("button[disabled]")?.removeAttribute("disabled");
  const prev = app.querySelector(".nav button");
  if (S.i === 0) prev.setAttribute("disabled", ""); else prev.removeAttribute("disabled");
}

function finish() {
  const left = S.qs.filter((q) => q.pick === null).length;
  if (left && !confirm(`Còn ${left} câu chưa làm. Vẫn nộp bài?`)) return;
  S.done = true;
  const bad = S.qs.filter((q) => q.pick !== q.ans).map((q) => q.id);
  const good = S.qs.filter((q) => q.pick === q.ans).map((q) => q.id);
  setWrong(getWrong().filter((id) => !good.includes(id)).concat(bad));
  render();
}

function result() {
  const ok = S.qs.filter((q) => q.pick === q.ans).length, n = S.qs.length;
  const bad = S.qs.filter((q) => q.pick !== q.ans);
  app.replaceChildren(
    el("div", { class: "card" }, el("div", { class: "small" }, S.title),
      el("div", { class: "score" }, `${ok}/${n}`), el("div", {}, `${Math.round((ok / n) * 100)}% đúng`)),
    el("div", { class: "row" },
      el("button", { class: "pri", onclick: home }, "Về trang chọn đề"),
      bad.length ? el("button", { onclick: () => startSession(bad.map((q) => ALL.find((x) => x.id === q.id)), "Làm lại câu sai", { mode: S.mode, shuf: true }) }, `Làm lại ${bad.length} câu sai`) : ""),
    bad.length ? el("h2", {}, "Câu sai hoặc bỏ trống") : el("h2", {}, "Tất cả đều đúng 🎉"),
    bad.map((q) => el("div", { class: "card" }, el("div", { class: "small" }, `#${q.id}`), el("div", { class: "q" }, q.q),
      q.opts.map((t, i) => el("div", { class: "opt " + (i === q.ans ? "ok" : i === q.pick ? "bad" : ""), style: "padding:8px 12px;border:1px solid var(--line);border-radius:8px;margin:6px 0" },
        `${"ABCD"[i]}. ${t}`)),
      q.pick === null ? el("span", { class: "tag" }, "bỏ trống") : "")));
}

function startFlash(list) {
  let i = 0, show = false;
  const draw = () => {
    const q = list[i];
    app.replaceChildren(
      el("div", { class: "row" }, el("button", { onclick: home }, "← Thoát"), el("strong", {}, "Thẻ ghi nhớ"), el("span", { class: "small" }, `${i + 1}/${list.length}`)),
      el("div", { class: "bar" }, el("i", { style: `width:${((i + 1) / list.length) * 100}%` })),
      el("div", { class: "card" }, el("div", { class: "small" }, `#${q.id}`), el("div", { class: "q" }, q.q),
        show ? el("div", { class: "opt ok", style: "padding:10px 12px;border:1px solid var(--ok);border-radius:8px" }, q.a)
             : el("button", { class: "pri", onclick: () => { show = true; draw(); } }, "Xem đáp án")),
      el("div", { class: "nav" },
        el("button", { ...(i === 0 ? { disabled: "" } : {}), onclick: () => { i--; show = false; draw(); } }, "← Trước"),
        el("button", { class: "pri", onclick: () => { if (i < list.length - 1) { i++; show = false; draw(); } else home(); } }, i < list.length - 1 ? "Sau →" : "Xong")));
  };
  draw();
}
