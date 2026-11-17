"""Chuyển PDF bộ câu hỏi (đáp án đúng đánh dấu bằng nét đỏ bên trái) sang JSON tĩnh."""
import glob, json, re, sys, warnings
warnings.filterwarnings("ignore")
import pymupdf

src = sys.argv[1] if len(sys.argv) > 1 else glob.glob("*.pdf")[0]
out = sys.argv[2] if len(sys.argv) > 2 else "docs/data/questions.json"
doc = pymupdf.open(src)

def is_red(c):
    return c and c[0] > 0.8 and c[1] < 0.35 and c[2] < 0.35

items = []  # (kind, text, ymid_page)
for pi, page in enumerate(doc):
    marks = []
    hl = sorted({round(r["rect"].y0, 1) for r in page.get_drawings()
                 if r.get("type") == "s" and abs(r["rect"].y0 - r["rect"].y1) < 0.1 and r["rect"].width > 300})
    boxes = []
    for r in page.get_drawings():
        if is_red(r.get("color")) or is_red(r.get("fill")):
            w = (r.get("width") or 0) / 2
            rc = r["rect"]
            if rc.x0 < 80:
                boxes.append([rc.x0 - w, rc.y0 - w, rc.x1 + w, rc.y1 + w])
    boxes.sort(key=lambda b: b[1])
    clusters = []
    for bx in boxes:  # gom nét gần nhau thành một dấu
        if clusters and bx[1] <= clusters[-1][3] + 3:
            c = clusters[-1]; c[0] = min(c[0], bx[0]); c[2] = max(c[2], bx[2]); c[3] = max(c[3], bx[3])
        else:
            clusters.append(list(bx))
    marks = [((c[1] + c[3]) / 2, c[0], (c[2] - c[0]) * (c[3] - c[1])) for c in clusters if max(c[2] - c[0], c[3] - c[1]) >= 8]
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            txt = "".join(s["text"] for s in l["spans"]).strip()
            if not txt:
                continue
            bold = all("Bold" in s["font"] for s in l["spans"] if s["text"].strip())
            y0, y1 = l["bbox"][1], l["bbox"][3]
            items.append({"p": pi, "t": txt, "b": bold, "y0": y0, "y1": y1, "m": 0, "hl": hl, "x": l["bbox"][0]})
    # gán mỗi nét đỏ cho dòng không đậm có tâm gần nhất
    cand = [i for i in items if i["p"] == pi and not i["b"]]
    for my, mx, area in marks:
        if mx > 80 or not cand: continue
        best = min(cand, key=lambda i: abs((i["y0"] + i["y1"]) / 2 - my))
        if abs((best["y0"] + best["y1"]) / 2 - my) < 9: best["m"] = max(best["m"] or 0, area)

# bỏ tiêu đề đầu trang 1
items = [i for i in items if i["t"] not in ("TT", "Nội dung") and not i["t"].startswith(("BỘ CÂU HỎI", "Đối tượng", "Số lượng"))]

qs, cur = [], None
def flush():
    global cur
    if cur: qs.append(cur)
    cur = None

nxt = 1
queue = list(items)
while queue:
    it = queue.pop(0)
    t = it["t"]
    m = re.match(r"^End\b\s*(.*)$", t)
    if m:
        rest = m.group(1)
        if rest and not re.match(r"^%d\b" % nxt, rest) and cur is not None:
            queue.insert(0, dict(it, t=rest, b=False, fn=True))   # dòng "End" đè lên một lựa chọn
            queue.insert(1, dict(it, t="End", hl=[]))
            continue
        flush()
        if rest:
            queue.insert(0, dict(it, t=rest))
        continue
    m = re.match(r"^(\d+)(?:\s+(.*))?$", t)
    if m and int(m.group(1)) == nxt and (cur is None or cur["opts"] == [] or it["b"]) and it["x"] < 90:
        flush(); cur = {"id": nxt, "q": [], "opts": [], "ans": [], "_last": None}; nxt += 1
        if m.group(2):
            queue.insert(0, dict(it, t=m.group(2), b=True))
        continue
    if cur is None: continue
    if it["b"]:
        cur["q"].append(t); continue
    last = cur["_last"]
    new = it.get("fn") or last is None or last["p"] != it["p"] or any(last["y1"] - 3 <= h <= it["y0"] + 3 for h in it["hl"])
    if new:
        cur["opts"].append(t)
        if it["m"]: cur["ans"].append((len(cur["opts"]) - 1, it["m"]))
    else:
        cur["opts"][-1] += " " + t
        if it["m"]: cur["ans"].append((len(cur["opts"]) - 1, it["m"]))
    cur["_last"] = it
flush()

res, warn = [], []
for q in qs:
    qt = re.sub(r"\s+", " ", " ".join(q["q"])).strip()
    opts = [re.sub(r"\s+", " ", o).strip() for o in q["opts"]]
    a = sorted(q["ans"], key=lambda x: -x[1])
    ans = a[0][0] if a else -1
    if len(opts) < 2 or not a or (len(a) > 1 and a[1][1] > a[0][1] * 0.5 and a[1][0] != a[0][0]):
        warn.append((q["id"], len(opts), q["ans"]))
    res.append({"id": q["id"], "q": qt, "opts": opts, "ans": ans})

import os
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("questions:", len(res), "ids ok:", [r["id"] for r in res] == list(range(1, len(res) + 1)))
print("warnings:", warn)
