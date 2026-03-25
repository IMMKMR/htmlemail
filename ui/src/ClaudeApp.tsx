// @ts-nocheck
import { useState, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// SEMANTIC CONVERSION ENGINE
//
// Detects these patterns automatically from absolute-positioned HTML:
//   1. PILL HEADERS   — bg-only spacer left:0 + text overlapping → banner td
//   2. FOOTER BAND    — bg-only spacer full-width near page bottom → bg td
//   3. TWO-COL ROWS   — elements whose lefts cluster around two X zones
//   4. ICON+TEXT ROWS — small img (≤40px) beside text at same top
//   5. BODY PARAGRAPHS — consecutive same-left text lines → merged <p>
//   6. LOGO           — img far right, near top → right-aligned
//   7. DECORATIVE IMG — large img, bottom-right quadrant → float overlay
// ═══════════════════════════════════════════════════════════════════════════

function css(el) {
  const s = {};
  (el.getAttribute("style") || "").split(";").forEach(p => {
    const i = p.indexOf(":");
    if (i > 0) s[p.slice(0, i).trim().toLowerCase()] = p.slice(i + 1).trim();
  });
  return s;
}
const n = v => parseFloat((v || "0").toString().replace(/[^\d.]/g, "")) || 0;

function parseEl(tbl, idx) {
  const s = css(tbl);
  const t = n(s.top), l = n(s.left), w = n(s.width), h = n(s.height);
  const td = tbl.querySelector("td");
  const img = tbl.querySelector("img");
  const text = td ? td.textContent.trim() : "";
  const tdS = td ? css(td) : {};
  const bg = (s["background-color"] || tdS["background-color"] || "").replace(/\s/g, "").toLowerCase() || null;
  const isEmpty = text === "" && !img;
  const inner = td ? td.innerHTML.trim() : "";
  return { idx, t, l, w, h, r: l + w, b: t + h, img, text, inner, bg, isEmpty, tbl };
}

function overlaps(a, b) {
  return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
}

// ── MAIN CONVERT FUNCTION ──────────────────────────────────────────────────
export function convert(htmlStr) {
  const doc = new DOMParser().parseFromString(htmlStr, "text/html");
  const wrap = doc.querySelector('[style*="position:relative"],[style*="position: relative"]');
  if (!wrap) return { error: "No position:relative container found." };

  const wS = css(wrap);
  const CW = n(wS.width || "595");
  const CBG = wS["background-color"] || "#ffffff";

  // ── 1. Parse all tables ────────────────────────────────────────────────
  const all = Array.from(wrap.querySelectorAll(":scope > table"))
    .map((t, i) => parseEl(t, i))
    .filter(e => !(e.w === 0 && e.h === 0));

  // ── 2. Identify & consume background-only spacers ─────────────────────
  // A spacer = isEmpty + bg. Classify by width:
  //   full-width (w > CW*0.85) → FOOTER or SECTION bg band
  //   partial-width            → PILL HEADER (left-anchored banner)
  const spacers = all.filter(e => e.isEmpty && e.bg);
  const usedIds = new Set();

  const pillHeaders = []; // { t, l, w, h, bg, textEl }
  const bgBands = [];     // { t, l, w, h, bg }         (full-width, used as td bg)

  spacers.forEach(sp => {
    if (sp.w > CW * 0.85) {
      bgBands.push(sp);
      usedIds.add(sp.idx);
    } else {
      // Find text element that overlaps this spacer
      const textEl = all.find(e =>
        !e.isEmpty && !usedIds.has(e.idx) && e !== sp && overlaps(sp, e)
      );
      if (textEl) {
        pillHeaders.push({ t: sp.t, l: sp.l, w: sp.w, h: sp.h, bg: sp.bg, textEl });
        usedIds.add(sp.idx);
        usedIds.add(textEl.idx);
      } else {
        usedIds.add(sp.idx);
      }
    }
  });

  // Content elements (non-spacer, non-consumed)
  const content = all.filter(e => !usedIds.has(e.idx));

  // ── 3. Classify decorative graphic (large img, bottom-right) ──────────
  const graphic = content.find(e =>
    e.img && e.w > 50 && e.t > CW * 0.6 && e.l > CW * 0.65
  );
  if (graphic) usedIds.add(graphic.idx);

  // ── 4. Merge consecutive paragraph lines ──────────────────────────────
  // Lines at same left (±4px), consecutive tops (gap ≤ font-height + 4),
  // no img, similar font → merge into one paragraph block
  const textEls = content
    .filter(e => !e.img && e.text && !usedIds.has(e.idx))
    .sort((a, b) => a.t - b.t || a.l - b.l);

  const paraGroups = []; // each group → one <p>
  const inPara = new Set();

  textEls.forEach(el => {
    if (inPara.has(el.idx)) return;
    // Try to grow a group from this element
    const group = [el];
    inPara.add(el.idx);
    let last = el;
    // Keep appending lines that are:
    //  - same left (±4px)
    //  - immediately below (gap < 20px)
    //  - not an img
    //  - same approximate font-size (height similar)
    const candidates = textEls.filter(e =>
      !inPara.has(e.idx) &&
      Math.abs(e.l - el.l) < 5 &&
      e.t > el.t
    ).sort((a, b) => a.t - b.t);

    for (const c of candidates) {
      const gap = c.t - last.b;
      if (gap >= 0 && gap <= 14) {
        group.push(c);
        inPara.add(c.idx);
        last = c;
      } else {
        break;
      }
    }
    paraGroups.push(group);
  });

  // ── 5. Build "visual rows" from remaining content ─────────────────────
  // A visual row = elements within ROW_SNAP px of each other vertically
  const ROW_SNAP = 10;
  // All "atoms" to lay out: each para group is one atom, plus img-only els
  const atoms = [];

  // Para group atoms
  paraGroups.forEach(grp => {
    const t = Math.min(...grp.map(e => e.t));
    const b = Math.max(...grp.map(e => e.b));
    const l = grp[0].l;
    const w = Math.max(...grp.map(e => e.w));
    const lines = grp.map(e => e.inner);
    atoms.push({ type: "para", t, b, l, r: l + w, w, lines, raw: grp });
  });

  // Image atoms (not in para groups, not decorative)
  content
    .filter(e => e.img && !usedIds.has(e.idx))
    .forEach(e => {
      atoms.push({ type: "img", t: e.t, b: e.b, l: e.l, r: e.r, w: e.w, h: e.h, el: e });
    });

  atoms.sort((a, b) => a.t - b.t || a.l - b.l);

  // Group atoms into visual rows
  const rows = [];
  atoms.forEach(atom => {
    const last = rows[rows.length - 1];
    // Atoms whose tops are within 12px are considered in the same row
    if (last && Math.abs(atom.t - last[0].t) <= 12) {
      last.push(atom);
    } else {
      rows.push([atom]);
    }
  });

  /**
   * Detects arbitrary horizontal columns in a row and groups them.
   * Returns an array of Column objects, each containing one or more atoms.
   */
  function groupColumns(row) {
    const sorted = [...row].sort((a, b) => a.l - b.l);
    if (sorted.length <= 1) return [{ items: sorted, l: sorted[0]?.l || 0, r: sorted[0]?.r || 0 }];

    const cols = [];
    let curCol = [sorted[0]];
    let curR = sorted[0].r;

    for (let i = 1; i < sorted.length; i++) {
        const atom = sorted[i];
        // If there's a significant gap (>20px) between this atom and the previous right edge,
        // we start a new column. Small gaps indicate related elements (like Icon + Text).
        if (atom.l - curR > 20) {
            cols.push({ items: curCol, l: curCol[0].l, r: curR });
            curCol = [atom];
            curR = atom.r;
        } else {
            curCol.push(atom);
            curR = Math.max(curR, atom.r);
        }
    }
    cols.push({ items: curCol, l: curCol[0].l, r: curR });
    return cols;
  }

  // ── 8. Emit HTML ───────────────────────────────────────────────────────
  const parts = [];
  let cursor = 0;

  // Collect all "layout events" in top order: rows, pill headers, bg bands
  const events = [];

  rows.forEach(row => {
    const rowT = Math.min(...row.map(a => a.t));
    const rowB = Math.max(...row.map(a => a.b));
    events.push({ kind: "row", t: rowT, b: rowB, row });
  });
  pillHeaders.forEach(ph => {
    events.push({ kind: "pill", t: ph.t, b: ph.t + ph.h, ph });
  });
  bgBands.forEach(bb => {
    events.push({ kind: "band", t: bb.t, b: bb.t + bb.h, bb });
  });

  events.sort((a, b) => a.t - b.t);

  // Track whether we're inside a bg band
  let activeBand = null;

  function emitSpacer(px) {
    if (px > 0) parts.push(`<tr><td height="${Math.round(px)}" style="font-size:0;line-height:0;">&nbsp;</td></tr>`);
  }

  function innerHTML(atom) {
    // Check if this atom can be paired as icon+text within its column
    if (atom.type === "img" && atom.w <= 40) {
        // Look for a para atom in the same column atom list (if we were passed more context)
        // Actually, let's keep it simple: if atom is img, it's img.
        // The icon+text detection now happens inside groupColumns/emitRow if we want,
        // but let's just make sure para atoms allow multiple spans side-by-side if needed.
    }

    if (atom.type === "img") {
      const e = atom.el;
      return `<img src="${e.img.getAttribute("src")}" alt="${e.img.getAttribute("alt") || ""}" width="${e.w}" height="${e.h}" style="display:block;border:0;max-width:100%;height:auto;">`;
    }
    if (atom.type === "para") {
      // If a para group has items at different lefts, handle them? 
      // No, grp logic already handles same-left.
      const preserved = atom.lines.join(" ");
      return `<div style="margin:0;line-height:1.4;">${preserved}</div>`;
    }
    return "";
  }

  function emitIconText(iconAtom, textAtoms) {
    const src = iconAtom.el.img.getAttribute("src");
    const alt = iconAtom.el.img.getAttribute("alt") || "";
    const iw = iconAtom.w, ih = iconAtom.h;
    // Use original spans from each text atom — preserve all font styling
    const allLines = textAtoms.flatMap(a => a.lines);
    const allText = allLines.join(" ");

    return `<table role="presentation" border="0" cellpadding="0" cellspacing="0">
  <tr>
    <td valign="top" width="${iw}" style="padding-top:2px;"><img src="${src}" alt="${alt}" width="${iw}" height="${ih}" style="display:block;border:0;"></td>
    <td width="8" style="font-size:0;">&nbsp;</td>
    <td valign="top"><div style="margin:0;line-height:1.4;">${allText}</div></td>
  </tr>
</table>`;
  }

  function renderColumnAtoms(atoms) {
    // Detect Icon + Text pattern within the atoms of a single column
    // An icon+text is: [ImgAtom (w<40), ParaAtom]
    const sorted = [...atoms].sort((a,b) => a.l - b.l);
    const img = sorted.find(a => a.type === "img" && a.w <= 40);
    const para = sorted.find(a => a.type === "para");

    if (img && para && sorted.length === 2) {
        return emitIconText(img, [para]);
    }
    
    return sorted.map(a => innerHTML(a)).join("\n");
  }


  function emitRow(row) {
    const leftPad = Math.min(...row.map(a => a.l));
    const cols = groupColumns(row);

    if (cols.length > 1) {
      const rowW = Math.round(cols[cols.length - 1].r - leftPad);
      // Multiple columns detected — emit as responsive divs + MSO table
      let msoTable = `<!--[if mso]><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${rowW}"><tr>`;
      let divContent = "";

      cols.forEach((col, idx) => {
        const colW = Math.round(col.r - col.l);
        // Atoms within the column — use specialized renderer to catch Icon+Text
        const atomsHtml = renderColumnAtoms(col.items);
        
        msoTable += `<td width="${colW}" valign="top" style="padding:0;">`;
        divContent += `<div class="col" style="display:inline-block;vertical-align:top;width:${colW}px;">${atomsHtml}</div>`;

        // Gap between columns
        if (idx < cols.length - 1) {
          const gap = Math.round(cols[idx + 1].l - col.r);
          msoTable += `</td><td width="${gap}">&nbsp;</td>`;
          divContent += `<div style="display:inline-block;width:${gap}px;font-size:0;">&nbsp;</div>`;
        } else {
          msoTable += `</td>`;
        }
      });

      msoTable += `</tr></table><![endif]-->`;

      parts.push(`<tr>
  <td style="padding:0 ${leftPad}px;font-size:0;line-height:0;">
    ${msoTable}
    ${divContent}
  </td>
</tr>`);

    } else {
      // Single column
      const atom = row[0];
      const isLogo = row.length === 1 && atom.type === "img" && atom.l > CW * 0.6;

      if (isLogo) {
        parts.push(`<tr>
  <td align="right" style="padding-right:${CW - atom.r}px;">
    ${innerHTML(atom)}
  </td>
</tr>`);
      } else {
        // Single column — check for Icon+Text here too
        const atomsHtml = renderColumnAtoms(row);
        parts.push(`<tr>
  <td style="padding:0 ${leftPad}px;">
    ${atomsHtml}
  </td>
</tr>`);
      }
    }
  }

  // ── MAIN EMIT LOOP ─────────────────────────────────────────────────────
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];

    // Vertical spacer from cursor to this event
    emitSpacer(ev.t - cursor);

    if (ev.kind === "pill") {
      const ph = ev.ph;
      // Pill header: left-anchored td with bg, rest white
      // Width of pill = ph.w; text extracted from textEl
      const textInner = ph.textEl.inner;
      parts.push(`<tr>
  <td style="padding:0;font-size:0;line-height:0;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${CW}">
      <tr>
        <td width="${ph.w}" style="background-color:${ph.bg};padding:${Math.round((ph.h - 13) / 2)}px ${ph.textEl.l}px;border-radius:0 3px 3px 0;">${textInner}</td>
        <td style="background-color:${CBG};">&nbsp;</td>
      </tr>
    </table>
  </td>
</tr>`);
      cursor = ev.b;

    } else if (ev.kind === "band") {
      // Full-width bg band — will wrap subsequent content rows
      // Find the band end and collect rows that fall within
      const bb = ev.bb;
      const bandEnd = bb.b;

      // Collect events inside this band
      const inside = [];
      let j = i + 1;
      while (j < events.length && events[j].t < bandEnd) {
        inside.push(events[j]);
        j++;
      }
      // Emit band as single td with bg, padding
      const innerParts = [];
      let bandCursor = bb.t;
      inside.forEach(inEv => {
        if (inEv.t > bandCursor) {
          innerParts.push(`<tr><td height="${Math.round(inEv.t - bandCursor)}" style="font-size:0;line-height:0;">&nbsp;</td></tr>`);
        }
        if (inEv.kind === "row") {
          // emit row into inner parts (temporarily redirect)
          const savedLen = parts.length;
          emitRow(inEv.row);
          const emitted = parts.splice(savedLen);
          innerParts.push(...emitted);
        }
        bandCursor = inEv.b;
      });

      parts.push(`<tr>
  <td style="background-color:${bb.bg};padding:8px 0;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
      ${innerParts.join("\n      ")}
    </table>
  </td>
</tr>`);

      cursor = bandEnd;
      i = j - 1; // skip consumed events

    } else if (ev.kind === "row") {
      emitRow(ev.row);
      cursor = ev.b;
    }
  }

  // ── Decorative graphic ─────────────────────────────────────────────────
  if (graphic) {
    // Insert before last emitted row — find position in parts
    const gRow = `<tr>
  <td align="right" style="padding-right:0;font-size:0;line-height:0;">
    <img src="${graphic.img.getAttribute("src")}" alt="${graphic.img.getAttribute("alt") || ""}" width="${graphic.w}" height="${graphic.h}" style="display:block;border:0;margin-left:auto;max-width:${graphic.w}px;">
  </td>
</tr>`;
    parts.splice(parts.length - 1, 0, gRow);
  }

  // ── Assemble ───────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  body{margin:0;padding:0;background-color:#f4f4f4;-webkit-text-size-adjust:100%;}
  table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
  td{padding:0;vertical-align:top;}
  img{display:block;border:0;outline:none;text-decoration:none;height:auto;-ms-interpolation-mode:bicubic;}
  .wrap{width:100%;max-width:${CW}px;margin:0 auto;background-color:${CBG};}
  @media screen and (max-width:620px){
    .wrap{width:100%!important;}
    .col{display:block!important;width:100%!important;padding-bottom:10px!important;}
  }
</style>
</head>
<body>
<center>
<!--[if mso]><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${CW}"><tr><td><![endif]-->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" class="wrap" width="${CW}">
${parts.join("\n")}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</center>
</body>
</html>`;

  return {
    html,
    stats: {
      elements: content.length,
      paraGroups: paraGroups.length,
      pillHeaders: pillHeaders.length,
      bgBands: bgBands.length,
      rows: rows.length,
      hasGraphic: !!graphic,
      outputKb: (html.length / 1024).toFixed(1),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UI
// ═══════════════════════════════════════════════════════════════════════════

const M = "'DM Mono','Fira Code',monospace";

const TAG = ({ children }) => (
  <span style={{
    fontSize: 9, padding: "2px 8px", borderRadius: 20, background: "rgba(99,102,241,.12)",
    color: "#a5b4fc", border: "1px solid rgba(99,102,241,.25)", letterSpacing: ".05em", whiteSpace: "nowrap"
  }}>
    {children}
  </span>
);

const StatBox = ({ label, value }) => (
  <div>
    <div style={{ color: "#475569", fontSize: 9, letterSpacing: ".05em", textTransform: "uppercase" }}>{label}</div>
    <div style={{ color: "#a5b4fc", fontWeight: 700, fontSize: 13 }}>{value}</div>
  </div>
);

export default function App() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState("preview");
  const [pw, setPw] = useState(595);
  const [fileName, setFileName] = useState(null);
  const [drag, setDrag] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef();

  const run = () => {
    if (!input.trim()) return;
    setResult(convert(input));
    setTab("preview");
  };

  const loadFile = f => {
    if (!f) return;
    setFileName(f.name);
    new FileReader().onload = e => setInput(e.target.result),
      Object.assign(new FileReader(), {
        onload: e => setInput(e.target.result)
      }).readAsText(f);
  };

  const ok = result && !result.error;

  const copy = () => {
    navigator.clipboard.writeText(result.html).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([result.html], { type: "text/html" }));
    a.download = "email_responsive.html";
    a.click();
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080812", fontFamily: M, color: "#e2e8f0", display: "flex", flexDirection: "column" }}>

      {/* HEADER */}
      <div style={{ borderBottom: "1px solid rgba(99,102,241,.2)", padding: "12px 24px", display: "flex", alignItems: "center", gap: 12, background: "rgba(8,8,18,.95)" }}>
        <div style={{ width: 30, height: 30, borderRadius: 7, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>✦</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: "#a5b4fc" }}>
            FIG2EMAIL CONVERTER
            <span style={{ fontWeight: 400, color: "#475569", marginLeft: 8, fontSize: 10 }}>semantic engine v4</span>
          </div>
          <div style={{ fontSize: 9, color: "#334155", letterSpacing: ".08em", marginTop: 1 }}>
            ABSOLUTE HTML → RESPONSIVE TABLE EMAIL · PATTERN-AWARE · MSO-SAFE
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["Pill headers", "Para merge", "Icon+text", "Two-col", "Bg bands", "Footer detect"].map(t => <TAG key={t}>{t}</TAG>)}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

        {/* LEFT */}
        <div style={{ width: 340, display: "flex", flexDirection: "column", borderRight: "1px solid rgba(99,102,241,.18)", background: "rgba(8,8,18,.7)", flexShrink: 0 }}>

          {/* Drop */}
          <div
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); loadFile(e.dataTransfer.files[0]) }}
            onClick={() => fileRef.current.click()}
            style={{ margin: 12, border: `2px dashed ${drag ? "#6366f1" : "rgba(99,102,241,.25)"}`, borderRadius: 8, padding: "14px 12px", textAlign: "center", cursor: "pointer", background: drag ? "rgba(99,102,241,.08)" : "transparent", transition: "all .15s" }}>
            <input ref={fileRef} type="file" accept=".html" onChange={e => loadFile(e.target.files[0])} style={{ display: "none" }} />
            <div style={{ fontSize: 20, marginBottom: 3 }}>📂</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>
              {fileName
                ? <span style={{ color: "#a5b4fc" }}>✓ {fileName}</span>
                : <>Drop <strong style={{ color: "#e2e8f0" }}>index.html</strong> or click</>}
            </div>
          </div>

          <div style={{ textAlign: "center", fontSize: 9, color: "#334155", letterSpacing: ".1em", marginBottom: 6 }}>— OR PASTE —</div>

          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Paste Fig2Html / Figma-exported absolute HTML…"
            style={{ flex: 1, margin: "0 12px", padding: "10px", background: "rgba(4,4,12,.8)", border: "1px solid rgba(99,102,241,.18)", borderRadius: 7, color: "#64748b", fontSize: 10, fontFamily: M, resize: "none", outline: "none", lineHeight: 1.6 }}
          />

          <div style={{ padding: 12 }}>
            <button onClick={run} disabled={!input.trim()} style={{ width: "100%", padding: 10, borderRadius: 7, border: "none", background: input.trim() ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(99,102,241,.15)", color: input.trim() ? "#fff" : "#334155", fontSize: 12, fontWeight: 700, cursor: input.trim() ? "pointer" : "not-allowed", letterSpacing: ".08em", fontFamily: M }}>
              ⚡ CONVERT
            </button>
          </div>

          {result?.error && (
            <div style={{ margin: "0 12px 12px", padding: "8px 10px", background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 6, fontSize: 10, color: "#fca5a5" }}>
              ⚠ {result.error}
            </div>
          )}

          {ok && (
            <div style={{ margin: "0 12px 12px", padding: 10, background: "rgba(99,102,241,.06)", border: "1px solid rgba(99,102,241,.18)", borderRadius: 7, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 6px" }}>
              <StatBox label="Elements" value={result.stats.elements} />
              <StatBox label="Para groups" value={result.stats.paraGroups} />
              <StatBox label="Rows" value={result.stats.rows} />
              <StatBox label="Pills" value={result.stats.pillHeaders} />
              <StatBox label="Bands" value={result.stats.bgBands} />
              <StatBox label="KB" value={result.stats.outputKb} />
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* TABS */}
          <div style={{ display: "flex", borderBottom: "1px solid rgba(99,102,241,.18)", background: "rgba(8,8,18,.7)", padding: "0 16px", alignItems: "center", gap: 0, flexShrink: 0 }}>
            {[["preview", "Preview"], ["source", "Source"], ["debug", "Debug"]].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} style={{ padding: "10px 16px", background: "none", border: "none", borderBottom: tab === k ? "2px solid #6366f1" : "2px solid transparent", color: tab === k ? "#a5b4fc" : "#334155", fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: ".07em", fontFamily: M }}>
                {label}
              </button>
            ))}

            {ok && (
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 9, color: "#334155" }}>📱</span>
                <input type="range" min={320} max={720} value={pw} onChange={e => setPw(+e.target.value)} style={{ width: 70, accentColor: "#6366f1" }} />
                <span style={{ fontSize: 9, color: "#475569", minWidth: 32 }}>{pw}px</span>
                <span style={{ fontSize: 9, color: "#334155" }}>🖥</span>
                <button onClick={copy} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid rgba(99,102,241,.3)", background: copied ? "rgba(34,197,94,.1)" : "rgba(99,102,241,.08)", color: copied ? "#4ade80" : "#a5b4fc", fontSize: 9, cursor: "pointer", fontFamily: M, fontWeight: 700 }}>{copied ? "✓ COPIED" : "⎘ COPY"}</button>
                <button onClick={download} style={{ padding: "4px 10px", borderRadius: 4, border: "none", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontSize: 9, cursor: "pointer", fontFamily: M, fontWeight: 700 }}>↓ HTML</button>
              </div>
            )}
          </div>

          {/* CONTENT */}
          <div style={{ flex: 1, overflow: "auto", padding: 20 }}>

            {!ok && !result?.error && (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "#1e293b", textAlign: "center" }}>
                <div style={{ fontSize: 48 }}>✦</div>
                <div style={{ fontSize: 11, letterSpacing: ".1em", color: "#334155" }}>PASTE HTML & CONVERT</div>
                <div style={{ fontSize: 10, maxWidth: 380, lineHeight: 1.8, color: "#1e3a5f" }}>
                  The engine detects <strong style={{ color: "#334155" }}>pill headers</strong>, merges <strong style={{ color: "#334155" }}>paragraph lines</strong>,
                  builds <strong style={{ color: "#334155" }}>icon+text rows</strong>, handles <strong style={{ color: "#334155" }}>two-column layouts</strong>,
                  and wraps <strong style={{ color: "#334155" }}>footer bands</strong> — all automatically from the absolute positions.
                </div>
              </div>
            )}

            {ok && tab === "preview" && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <div style={{ width: pw, transition: "width .2s", boxShadow: "0 16px 48px rgba(0,0,0,.7)", borderRadius: 3, overflow: "hidden" }}>
                  <iframe srcDoc={result.html} style={{ width: "100%", height: 950, border: "none", display: "block" }} title="preview" sandbox="allow-same-origin" />
                </div>
              </div>
            )}

            {ok && tab === "source" && (
              <pre style={{ background: "rgba(4,4,12,.9)", border: "1px solid rgba(99,102,241,.18)", borderRadius: 8, padding: "16px 18px", fontSize: 10, lineHeight: 1.7, color: "#64748b", overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "84vh", margin: 0 }}>
                {result.html}
              </pre>
            )}

            {ok && tab === "debug" && (
              <div style={{ maxWidth: 580 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#a5b4fc", marginBottom: 14, letterSpacing: ".06em" }}>⚙ WHAT THE ENGINE DETECTED</div>
                {[
                  {
                    icon: "💊", label: "Pill Headers", val: result.stats.pillHeaders,
                    desc: "Left-anchored bg spacers overlapping text → converted to split-td banner rows (bg td + white td). Width and padding calculated from spacer dimensions."
                  },
                  {
                    icon: "📋", label: "Paragraph Groups", val: result.stats.paraGroups,
                    desc: "Consecutive same-left text lines with gaps ≤8px are merged into single <p> tags with line-height:1.5. Eliminates per-line spacing errors."
                  },
                  {
                    icon: "🎨", label: "Background Bands", val: result.stats.bgBands,
                    desc: "Full-width (>85% container) bg spacers become background-color on a <td> wrapping all content that falls within their vertical range."
                  },
                  {
                    icon: "⚡", label: "Rows Detected", val: result.stats.rows,
                    desc: "After merging paragraphs, remaining atoms are grouped into visual rows (tops within 10px). Each row is emitted as one <tr>."
                  },
                  {
                    icon: "🖼", label: "Decorative Graphic", val: result.stats.hasGraphic ? "Yes" : "No",
                    desc: "Large image in bottom-right quadrant (left > 65% width, top > 60% height) is treated as decorative overlay and right-aligned at end."
                  },
                ].map(({ icon, label, val, desc }) => (
                  <div key={label} style={{ display: "flex", gap: 12, marginBottom: 12, padding: "10px 12px", background: "rgba(99,102,241,.04)", border: "1px solid rgba(99,102,241,.12)", borderRadius: 7 }}>
                    <div style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>{label}</span>
                        <span style={{ fontSize: 10, color: "#6366f1", fontWeight: 700 }}>{val}</span>
                      </div>
                      <div style={{ fontSize: 10, color: "#334155", lineHeight: 1.7 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}