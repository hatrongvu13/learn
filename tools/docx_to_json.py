"""Chuyển file docx dạng 'câu hỏi + đáp án đúng' sang JSON tự luận/ghi nhớ."""
import glob, json, re, sys
import docx

src = sys.argv[1] if len(sys.argv) > 1 else glob.glob("*.docx")[0]
out = sys.argv[2] if len(sys.argv) > 2 else "docs/data/qa.json"
paras = [p.text for p in docx.Document(src).paragraphs]
Q = re.compile(r"^\s*(\d+)(?:\s*[\.,)]\s*|\s+)(\S.*)$")

blocks, cur = [], None
for i, t in enumerate(paras):
    if i == 0 or not t.strip():
        cur = None if not t.strip() else cur
        continue
    m = Q.match(t)
    indented = t.startswith("  ")
    last = blocks[-1]["id"] if blocks else 0
    if m and not indented and 0 < int(m.group(1)) - last <= 6:  # số thứ tự tăng dần, tránh nhầm đáp án bắt đầu bằng số
        cur = {"id": int(m.group(1)), "q": [m.group(2).strip()], "a": []}
        blocks.append(cur)
    elif cur is not None:
        (cur["a"] if (indented or cur["a"] or True) else cur["q"]).append(t.strip())
res, warn = [], []
for b in blocks:
    q = re.sub(r"\s+", " ", " ".join(b["q"])).strip()
    a = [re.sub(r"\s+", " ", x).strip() for x in b["a"]]
    if not a: warn.append((b["id"], "không có đáp án"))
    res.append({"id": b["id"], "q": q, "a": a})
ids = [r["id"] for r in res]
dup = {i for i in ids if ids.count(i) > 1}
miss = sorted(set(range(1, max(ids) + 1)) - set(ids))
json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("câu:", len(res), "trùng id:", sorted(dup), "thiếu:", miss)
print("cảnh báo:", warn, "| nhiều dòng đáp án:", [(r["id"], len(r["a"])) for r in res if len(r["a"]) > 1])
