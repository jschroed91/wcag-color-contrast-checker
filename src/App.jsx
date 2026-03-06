import React, { useMemo, useRef, useEffect, useState } from "react";

// WCAG 2.2 contrast requirements (contrast criteria are the same as WCAG 2.1):
// - Normal text: AA >= 4.5, AAA >= 7
// - Large text (>= 18pt regular OR >= 14pt bold): AA >= 3, AAA >= 4.5
// - Non-text UI components / graphical objects: >= 3 (commonly referenced)

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

function normalizeHex(input) {
  if (!input) return null;
  let s = String(input).trim();
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#([0-9a-fA-F]{3})$/.test(s)) {
    const m = s.slice(1);
    return `#${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}`.toLowerCase();
  }
  if (/^#([0-9a-fA-F]{6})$/.test(s)) return s.toLowerCase();
  return null;
}

function hexToRgb(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return { r, g, b };
}

function rgbToHex({ r, g, b }) {
  const to2 = (n) => n.toString(16).padStart(2, "0");
  return `#${to2(Math.round(r))}${to2(Math.round(g))}${to2(Math.round(b))}`;
}

// sRGB to linear
function srgbToLinear(v8) {
  const v = v8 / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb) {
  const R = srgbToLinear(rgb.r);
  const G = srgbToLinear(rgb.g);
  const B = srgbToLinear(rgb.b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(fgRgb, bgRgb) {
  const L1 = relativeLuminance(fgRgb);
  const L2 = relativeLuminance(bgRgb);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Interpolate in sRGB space
function mixRgb(a, b, t) {
  return {
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
  };
}

function sortStops(stops) {
  return [...stops]
    .map((s) => ({ ...s, pos: Number(s.pos) }))
    .filter((s) => Number.isFinite(s.pos))
    .sort((a, b) => a.pos - b.pos);
}

function bgColorAt(stops, posPct) {
  const ss = sortStops(stops);
  const p = Number(posPct);
  if (!Number.isFinite(p)) return null;
  if (ss.length === 0) return null;
  if (ss.length === 1) return hexToRgb(ss[0].color);

  // clamp outside ends (stops can be negative or greater than 100)
  if (p <= ss[0].pos) return hexToRgb(ss[0].color);
  if (p >= ss[ss.length - 1].pos) return hexToRgb(ss[ss.length - 1].color);

  for (let i = 0; i < ss.length - 1; i++) {
    const a = ss[i];
    const b = ss[i + 1];
    if (p >= a.pos && p <= b.pos) {
      const ar = hexToRgb(a.color);
      const br = hexToRgb(b.color);
      if (!ar || !br) return null;

      const denom = b.pos - a.pos;
      if (denom === 0) {
        // Multiple stops can share the same position (hard transitions).
        // Treat the color at that position as the later stop.
        return br;
      }

      const t = (p - a.pos) / denom;
      return mixRgb(ar, br, clamp01(t));
    }
  }

  return hexToRgb(ss[ss.length - 1].color);
}

function fmtRatio(r) {
  if (!Number.isFinite(r)) return "—";
  return r.toFixed(2);
}

function Badge({ ok, children }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold " +
        (ok
          ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200"
          : "bg-rose-100 text-rose-900 ring-1 ring-rose-200")
      }
    >
      {children}
    </span>
  );
}

function FieldLabel({ htmlFor, children, hint }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-900">
        {children}
      </label>
      {hint ? <p className="text-xs text-slate-600">{hint}</p> : null}
    </div>
  );
}

function ColorInput({ id, label, value, onChange, description, fullWidthInput = false }) {
  const normalized = normalizeHex(value) || "#000000";

  return (
    <div className="space-y-2">
      <FieldLabel htmlFor={id} hint={description}>
        {label}
      </FieldLabel>
      <div className="flex items-center gap-2">
        <input
          id={id}
          className={
            (fullWidthInput ? "w-full " : "w-44 ") +
            "rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="#1a2b3c"
        />
        <input
          aria-label={`${label} color picker`}
          className="h-10 w-12 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
          type="color"
          value={normalized}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {description ? (
        <p id={`${id}-desc`} className="sr-only">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function MiniSpark({ data, height = 44 }) {
  const w = 260;
  const h = height;
  const pad = 6;

  const ys = data.map((d) => d.y).filter((y) => Number.isFinite(y));
  const minY = Math.min(...ys, 1);
  const maxY = Math.max(...ys, 21);

  const scaleX = (x) => pad + (x / 100) * (w - pad * 2);
  const scaleY = (y) => {
    if (!Number.isFinite(y)) return h - pad;
    const t = (y - minY) / (maxY - minY || 1);
    return h - pad - t * (h - pad * 2);
  };

  const d = data
    .map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(p.x).toFixed(2)},${scaleY(p.y).toFixed(2)}`)
    .join(" ");

  return (
    <svg
      width={w}
      height={h}
      role="img"
      aria-label="Contrast ratio across gradient"
      className="rounded-lg border border-slate-200 bg-white"
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-700" />
    </svg>
  );
}

function buildGradientCss(angle, stops) {
  const ss = sortStops(stops);
  if (ss.length === 0) return "linear-gradient(180deg, #ffffff 0%, #ffffff 100%)";

  const parts = ss
    .map((s) => {
      const c = normalizeHex(s.color) || "#000000";
      const p = Number(s.pos);
      // Allow negatives or greater-than-100; CSS supports this.
      return `${c} ${Number.isFinite(p) ? p : 0}%`;
    })
    .join(", ");

  const a = Number.isFinite(Number(angle)) ? Number(angle) : 180;
  return `linear-gradient(${a}deg, ${parts})`;
}

// Map a point in the box (x,y) to a 0..100 percent along the CSS linear-gradient axis.
// This uses the standard approach: project corners onto the direction vector and normalize.
function pointToGradientPercent({ x, y, width, height, angleDeg }) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;

  const a = Number.isFinite(Number(angleDeg)) ? Number(angleDeg) : 180;
  const rad = (a * Math.PI) / 180;

  // CSS angles: 0deg points up; 90deg right; 180deg down.
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);

  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: 0, y: h },
    { x: w, y: h },
  ];

  const proj = (pt) => pt.x * dx + pt.y * dy;
  let minP = Infinity;
  let maxP = -Infinity;
  for (const c of corners) {
    const p = proj(c);
    if (p < minP) minP = p;
    if (p > maxP) maxP = p;
  }

  const denom = maxP - minP;
  if (!Number.isFinite(denom) || denom === 0) return 0;

  const t = (proj({ x, y }) - minP) / denom;
  return clamp01(t) * 100;
}

function computeAnalysis({ mode, textRgb, solidBgRgb, stops, sampleStep }) {
  if (!textRgb) {
    return { ok: false, error: "Text color is not a valid hex value.", ratios: null };
  }

  if (mode === "solid") {
    if (!solidBgRgb) {
      return { ok: false, error: "Background color is not a valid hex value.", ratios: null };
    }
    const r = contrastRatio(textRgb, solidBgRgb);
    return {
      ok: true,
      type: "solid",
      ratio: r,
      minRatio: r,
      maxRatio: r,
      worstAt: 0,
      bestAt: 0,
      ratios: [
        { x: 0, y: r },
        { x: 100, y: r },
      ],
      worstBgHex: rgbToHex(solidBgRgb),
      bestBgHex: rgbToHex(solidBgRgb),
    };
  }

  const ss = sortStops(stops);
  if (ss.length < 2) {
    return { ok: false, error: "Add at least 2 gradient stops.", ratios: null };
  }

  for (const s of ss) {
    if (!normalizeHex(s.color)) return { ok: false, error: "One or more gradient stop colors are invalid.", ratios: null };
    if (!Number.isFinite(Number(s.pos)))
      return { ok: false, error: "One or more gradient stop positions are invalid.", ratios: null };
  }

  const step = Math.max(1, Math.min(10, Number(sampleStep) || 1));
  const points = [];

  for (let p = 0; p <= 100; p += step) {
    const bg = bgColorAt(ss, p);
    const r = bg ? contrastRatio(textRgb, bg) : NaN;
    points.push({ x: p, y: r, bg });
  }

  if (points[points.length - 1]?.x !== 100) {
    const bg = bgColorAt(ss, 100);
    const r = bg ? contrastRatio(textRgb, bg) : NaN;
    points.push({ x: 100, y: r, bg });
  }

  let min = Infinity;
  let max = -Infinity;
  let minP = 0;
  let maxP = 0;
  let minBg = null;
  let maxBg = null;

  for (const pt of points) {
    if (!Number.isFinite(pt.y)) continue;
    if (pt.y < min) {
      min = pt.y;
      minP = pt.x;
      minBg = pt.bg;
    }
    if (pt.y > max) {
      max = pt.y;
      maxP = pt.x;
      maxBg = pt.bg;
    }
  }

  return {
    ok: Number.isFinite(min) && Number.isFinite(max),
    type: "gradient",
    minRatio: min,
    maxRatio: max,
    worstAt: minP,
    bestAt: maxP,
    ratios: points.map((p) => ({ x: p.x, y: p.y })),
    worstBgHex: minBg ? rgbToHex(minBg) : null,
    bestBgHex: maxBg ? rgbToHex(maxBg) : null,
  };
}

function computeCriteriaForRatio(ratio) {
  if (!Number.isFinite(ratio)) return [];
  return [
    { key: "normal_aa", label: "Normal text — AA (at least 4.5:1)", pass: ratio >= 4.5, threshold: 4.5 },
    { key: "normal_aaa", label: "Normal text — AAA (at least 7:1)", pass: ratio >= 7, threshold: 7 },
    { key: "large_aa", label: "Large text — AA (at least 3:1)", pass: ratio >= 3, threshold: 3 },
    { key: "large_aaa", label: "Large text — AAA (at least 4.5:1)", pass: ratio >= 4.5, threshold: 4.5 },
    { key: "ui_aa", label: "UI components / graphics (at least 3:1)", pass: ratio >= 3, threshold: 3 },
  ];
}

function computeStatusText(analysis) {
  if (!analysis) return "";
  if (!analysis.ok) return analysis.error || "Inputs are invalid.";
  if (analysis.type === "solid") return `Contrast ratio: ${fmtRatio(analysis.ratio)}:1`;
  return `Worst-case ratio across gradient: ${fmtRatio(analysis.minRatio)}:1 (at ${analysis.worstAt}%)`;
}

function CriteriaTable({ title, subtitle, ratio, criteria }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="flex items-start justify-between gap-4 bg-slate-50 px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-600">{subtitle}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-[11px] text-slate-600">Ratio</p>
          <p className="text-lg font-bold tabular-nums text-slate-900">
            {fmtRatio(ratio)}
            <span className="text-sm font-semibold text-slate-600">:1</span>
          </p>
        </div>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead className="sr-only">
          <tr>
            <th>Criterion</th>
            <th>Result</th>
            <th>Threshold</th>
          </tr>
        </thead>
        <tbody>
          {criteria.map((c) => (
            <tr key={c.key} className="border-t border-slate-200">
              <td className="px-3 py-2 text-slate-900">{c.label}</td>
              <td className="px-3 py-2">
                <Badge ok={c.pass}>{c.pass ? "Pass" : "Fail"}</Badge>
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">{c.threshold.toFixed(1)}:1</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ width: r.width, height: r.height });
    };

    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(el);

    return () => ro.disconnect();
  }, [ref]);

  return size;
}

function safeEncode(s) {
  return encodeURIComponent(String(s ?? ""));
}

function safeDecode(s) {
  try {
    return decodeURIComponent(String(s ?? ""));
  } catch {
    return String(s ?? "");
  }
}

function buildShareUrl({ mode, textHex, bgHex, angle, stops, sampleStep, previewPadTop }) {
  const base = window.location.origin + window.location.pathname;
  const params = new URLSearchParams();
  params.set("mode", mode);
  params.set("text", (normalizeHex(textHex) || "#000000").slice(1));
  params.set("step", String(sampleStep));
  params.set("padTop", String(Math.max(0, Number(previewPadTop) || 0)));

  if (mode === "solid") {
    params.set("bg", (normalizeHex(bgHex) || "#ffffff").slice(1));
  } else {
    params.set("angle", String(Number.isFinite(Number(angle)) ? Number(angle) : 180));
    const ss = sortStops(stops)
      .map((s) => {
        const c = (normalizeHex(s.color) || "#000000").slice(1);
        const p = Number(s.pos);
        return `${c}:${Number.isFinite(p) ? p : 0}`;
      })
      .join(",");
    params.set("stops", ss);
  }

  return `${base}?${params.toString()}`;
}

function parseStateFromUrl() {
  const p = new URLSearchParams(window.location.search);
  const mode = p.get("mode") === "solid" ? "solid" : p.get("mode") === "gradient" ? "gradient" : null;
  const text = p.get("text");
  const bg = p.get("bg");
  const angle = p.get("angle");
  const stops = p.get("stops");
  const step = p.get("step");
  const padTop = p.get("padTop");

  const state = {};
  if (mode) state.mode = mode;
  if (text) state.textHex = normalizeHex(`#${safeDecode(text)}`) || null;
  if (bg) state.bgHex = normalizeHex(`#${safeDecode(bg)}`) || null;
  if (angle && Number.isFinite(Number(angle))) state.angle = Number(angle);
  if (step && Number.isFinite(Number(step))) state.sampleStep = Number(step);
  if (padTop && Number.isFinite(Number(padTop))) state.previewPadTop = Math.max(0, Number(padTop));

  if (stops) {
    const parts = safeDecode(stops)
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    const parsedStops = [];
    for (let i = 0; i < parts.length; i++) {
      const [cRaw, pRaw] = parts[i].split(":");
      const c = normalizeHex(`#${(cRaw || "").trim()}`);
      const pos = Number(pRaw);
      if (c && Number.isFinite(pos)) {
        parsedStops.push({ id: `u${i}-${cRaw}-${pRaw}`, color: c, pos });
      }
    }
    if (parsedStops.length >= 2) state.stops = parsedStops;
  }

  return state;
}

function ensureMeta(name, content, attr = "name") {
  let el = document.querySelector(`meta[${attr}='${name}']`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  return el;
}

function ensureLink(rel, href) {
  let el = document.querySelector(`link[rel='${rel}']`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  return el;
}

function ensureJsonLd(id, json) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(json);
  return el;
}

function buildFaqJsonLd(qa) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map((x) => ({
      "@type": "Question",
      name: x.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: x.a,
      },
    })),
  };
}

function computeOgDescription({ mode, analysis }) {
  if (!analysis?.ok) return "Check WCAG 2.2 contrast for text on solid colors and gradients.";
  if (mode === "solid") return `WCAG contrast ratio: ${fmtRatio(analysis.ratio)}:1`;
  return `Worst-case gradient contrast: ${fmtRatio(analysis.minRatio)}:1 (0–100% sampling)`;
}

// Client-side OpenGraph image generation. NOTE: Many crawlers require server-rendered meta.
// This sets og:image dynamically for sharing and provides a downloadable PNG.
function drawOgPng({ width = 1200, height = 630, mode, gradientCss, solidHex, textHex, ratioText, subtitle }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background
  if (mode === "solid") {
    ctx.fillStyle = normalizeHex(solidHex) || "#ffffff";
    ctx.fillRect(0, 0, width, height);
  } else {
    // Approximate linear-gradient on canvas.
    // We parse the computed gradientCss for angle + stops.
    // This is a best-effort render.
    const m = String(gradientCss || "").match(/linear-gradient\(([-\d.]+)deg,\s*(.*)\)$/i);
    let angle = 180;
    let stopsStr = "#ffffff 0%, #ffffff 100%";
    if (m) {
      angle = Number(m[1]);
      stopsStr = m[2];
    }

    const rad = (angle * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);

    // Project corners for a full-coverage gradient
    const corners = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: 0, y: height },
      { x: width, y: height },
    ];
    const proj = (pt) => pt.x * dx + pt.y * dy;
    let minP = Infinity;
    let maxP = -Infinity;
    for (const c of corners) {
      const p = proj(c);
      if (p < minP) minP = p;
      if (p > maxP) maxP = p;
    }

    const x0 = dx * minP;
    const y0 = dy * minP;
    const x1 = dx * maxP;
    const y1 = dy * maxP;

    const grad = ctx.createLinearGradient(x0, y0, x1, y1);

    const parts = stopsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // Parse "#rrggbb p%"; allow p outside 0..100 and clamp to [0..1]
    for (const part of parts) {
      const mm = part.match(/(#[0-9a-fA-F]{3,6})\s+([-\d.]+)%/);
      if (!mm) continue;
      const c = normalizeHex(mm[1]) || "#000000";
      const p = Number(mm[2]);
      if (!Number.isFinite(p)) continue;
      grad.addColorStop(clamp01(p / 100), c);
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  // Overlay
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillRect(60, 60, width - 120, height - 120);

  // Text
  const fg = normalizeHex(textHex) || "#111827";
  ctx.fillStyle = fg;
  ctx.textBaseline = "top";

  ctx.font = "700 52px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText("WCAG 2.2 Gradient Contrast Checker", 100, 110);

  ctx.font = "500 28px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillStyle = "#111827";
  ctx.fillText(subtitle || "Check text contrast on CSS gradients (worst-case + position).", 100, 180);

  ctx.font = "800 96px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  ctx.fillStyle = "#0f172a";
  ctx.fillText(ratioText || "—:1", 100, 260);

  ctx.font = "500 24px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillStyle = "#334155";
  ctx.fillText("Shareable link includes gradient, angle, stops, sampling, and position.", 100, 380);

  ctx.font = "500 22px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  ctx.fillStyle = "#475569";
  const cssLine = mode === "solid" ? `background: ${normalizeHex(solidHex) || "#ffffff"}` : `background: ${gradientCss}`;
  // Wrap-ish
  const maxChars = 70;
  const chunks = [];
  for (let i = 0; i < cssLine.length; i += maxChars) chunks.push(cssLine.slice(i, i + maxChars));
  let y = 430;
  for (const line of chunks.slice(0, 4)) {
    ctx.fillText(line, 100, y);
    y += 30;
  }

  return canvas.toDataURL("image/png");
}

// Tiny, dependency-free test runner using console.assert.
function runSelfTestsOnce() {
  if (runSelfTestsOnce._didRun) return;
  runSelfTestsOnce._didRun = true;

  const assert = (cond, msg) => {
    // eslint-disable-next-line no-console
    console.assert(cond, msg);
  };

  // normalizeHex
  assert(normalizeHex("fff") === "#ffffff", "normalizeHex should expand 3-digit hex");
  assert(normalizeHex("#ABC") === "#aabbcc", "normalizeHex should lower-case and expand 3-digit hex");
  assert(normalizeHex("#112233") === "#112233", "normalizeHex should preserve valid 6-digit hex");
  assert(normalizeHex("#xyz") === null, "normalizeHex should reject invalid hex");

  // contrastRatio known values
  const white = hexToRgb("#ffffff");
  const black = hexToRgb("#000000");
  assert(Math.abs(contrastRatio(black, white) - 21) < 1e-9, "black on white should be 21:1");

  // bgColorAt with negative / >100 positions
  const stops = [
    { id: "a", color: "#ffffff", pos: -17.75 },
    { id: "b", color: "#bac7e7", pos: 213.32 },
  ];
  const c0 = bgColorAt(stops, 0);
  const c100 = bgColorAt(stops, 100);
  assert(!!c0 && !!c100, "bgColorAt should return colors for 0..100 sampling even with out-of-range stops");

  // pointToGradientPercent sanity
  const pTop = pointToGradientPercent({ x: 50, y: 0, width: 100, height: 200, angleDeg: 180 });
  const pBottom = pointToGradientPercent({ x: 50, y: 200, width: 100, height: 200, angleDeg: 180 });
  assert(pTop !== null && Math.abs(pTop - 0) < 1e-9, "180deg: top should be ~0%");
  assert(pBottom !== null && Math.abs(pBottom - 100) < 1e-9, "180deg: bottom should be ~100%");

  // share URL parsing roundtrip (basic)
  const share = buildShareUrl({
    mode: "gradient",
    textHex: "#546177",
    bgHex: "#ffffff",
    angle: 180,
    stops: [
      { id: "s1", color: "#ffffff", pos: -17.75 },
      { id: "s2", color: "#bac7e7", pos: 213.32 },
    ],
    sampleStep: 1,
    previewPadTop: 20,
  });
  assert(typeof share === "string" && share.includes("stops="), "share URL should include stops");
}

// SEO + FAQ schema + OpenGraph
function useSeoMeta({ canonicalUrl, ogImageUrl, ogDescription, faqQa }) {
  useEffect(() => {
    const title = "WCAG 2.2 Gradient Color Contrast Checker | Check Text on CSS Gradients";
    document.title = title;

    ensureMeta(
      "description",
      "Free WCAG 2.2 color contrast checker that supports gradient backgrounds. Test text contrast on CSS gradients, find worst-case contrast ratios, and verify AA/AAA compliance."
    );

    ensureMeta(
      "keywords",
      "gradient contrast checker, WCAG 2.2 contrast checker, WCAG contrast ratio, accessibility gradient checker, text on gradient contrast, ADA color contrast tool"
    );

    ensureMeta("robots", "index,follow");

    // OpenGraph
    ensureMeta("og:title", title, "property");
    ensureMeta("og:description", ogDescription || "Check WCAG contrast on gradients (worst-case + text position).", "property");
    ensureMeta("og:type", "website", "property");
    if (ogImageUrl) ensureMeta("og:image", ogImageUrl, "property");

    // Twitter
    ensureMeta("twitter:card", "summary_large_image");
    ensureMeta("twitter:title", title);
    ensureMeta("twitter:description", ogDescription || "Check WCAG contrast on gradients (worst-case + text position)."
    );
    if (ogImageUrl) ensureMeta("twitter:image", ogImageUrl);

    // canonical
    ensureLink("canonical", canonicalUrl || window.location.href);

    // FAQ Schema
    if (faqQa?.length) {
      ensureJsonLd("faq-jsonld", buildFaqJsonLd(faqQa));
    }
  }, [canonicalUrl, ogImageUrl, ogDescription, faqQa]);
}

function FaqItem({ q, a, defaultOpen = false }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4" open={defaultOpen}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-base font-semibold text-slate-900">{q}</h3>
          <span aria-hidden="true" className="select-none text-slate-500">
            ▾
          </span>
        </div>
      </summary>
      <div className="mt-3 text-sm text-slate-700 leading-relaxed">{a}</div>
    </details>
  );
}

export default function App() {
  // Defaults
  const [mode, setMode] = useState("gradient");

  const [textHex, setTextHex] = useState("#546177");
  const [bgHex, setBgHex] = useState("#ffffff");

  const [angle, setAngle] = useState(180);
  const [stops, setStops] = useState([
    { id: "s1", color: "#ffffff", pos: -17.75 },
    { id: "s2", color: "#bac7e7", pos: 213.32 },
  ]);

  const [sampleStep, setSampleStep] = useState(1);

  // Preview padding to replicate where text sits inside the element.
  const [previewPadTop, setPreviewPadTop] = useState(20);

  // Share / OG image state
  const [shareUrl, setShareUrl] = useState("");
  const [ogPngDataUrl, setOgPngDataUrl] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    runSelfTestsOnce();

    // Hydrate initial state from URL, if provided.
    const s = parseStateFromUrl();
    if (s.mode) setMode(s.mode);
    if (s.textHex) setTextHex(s.textHex);
    if (s.bgHex) setBgHex(s.bgHex);
    if (typeof s.angle === "number") setAngle(s.angle);
    if (s.stops) setStops(s.stops);
    if (typeof s.sampleStep === "number") setSampleStep(s.sampleStep);
    if (typeof s.previewPadTop === "number") setPreviewPadTop(s.previewPadTop);
  }, []);

  const textRgb = useMemo(() => hexToRgb(textHex), [textHex]);
  const solidBgRgb = useMemo(() => hexToRgb(bgHex), [bgHex]);

  const gradientCss = useMemo(() => buildGradientCss(angle, stops), [angle, stops]);

  const analysis = useMemo(
    () =>
      computeAnalysis({
        mode,
        textRgb,
        solidBgRgb,
        stops,
        sampleStep,
      }),
    [mode, textRgb, solidBgRgb, stops, sampleStep]
  );

  const statusText = useMemo(() => computeStatusText(analysis), [analysis]);

  const liveRef = useRef(null);
  useEffect(() => {
    void liveRef.current;
  }, [statusText]);

  const previewRef = useRef(null);
  const previewSize = useElementSize(previewRef);

  // Preview style
  const previewStyle = useMemo(() => {
    const bg = mode === "solid" ? normalizeHex(bgHex) || "#ffffff" : gradientCss;
    return {
      background: bg,
      color: normalizeHex(textHex) || "#000000",
      paddingTop: `${Math.max(0, Number(previewPadTop) || 0)}px`,
      paddingLeft: "20px",
      paddingRight: "20px",
      paddingBottom: "20px",
    };
  }, [mode, bgHex, gradientCss, textHex, previewPadTop]);

  const setStop = (id, patch) => {
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const addStop = () => {
    setStops((prev) => {
      const nextId = `s${prev.length + 1}-${Math.random().toString(16).slice(2, 7)}`;
      const ss = sortStops(prev);
      const mid = ss.length ? (ss[0].pos + ss[ss.length - 1].pos) / 2 : 50;
      return [...prev, { id: nextId, color: "#888888", pos: Math.round(mid * 100) / 100 }];
    });
  };

  const removeStop = (id) => {
    setStops((prev) => prev.filter((s) => s.id !== id));
  };

  // Overall criteria (worst-case for gradients)
  const overallRatio = analysis?.ok
    ? analysis.type === "solid"
      ? analysis.ratio
      : analysis.minRatio
    : NaN;
  const overallCriteria = useMemo(() => computeCriteriaForRatio(overallRatio), [overallRatio]);

  // Criteria at the actual text position inside the preview.
  // For solid backgrounds this equals overall.
  const positionInfo = useMemo(() => {
    if (!analysis?.ok) return { pct: null, ratio: NaN, bgHex: null };
    if (mode === "solid") {
      const r = analysis.type === "solid" ? analysis.ratio : NaN;
      return { pct: null, ratio: r, bgHex: solidBgRgb ? rgbToHex(solidBgRgb) : null };
    }

    // Sample at a point representing where text begins.
    // We use the horizontal center, and the y coordinate equal to the top padding.
    const pct = pointToGradientPercent({
      x: previewSize.width / 2,
      y: Math.max(0, Number(previewPadTop) || 0),
      width: previewSize.width,
      height: previewSize.height,
      angleDeg: angle,
    });

    const bg = pct == null ? null : bgColorAt(stops, pct);
    const r = bg && textRgb ? contrastRatio(textRgb, bg) : NaN;
    return {
      pct,
      ratio: r,
      bgHex: bg ? rgbToHex(bg) : null,
    };
  }, [analysis, mode, solidBgRgb, stops, previewSize.width, previewSize.height, previewPadTop, angle, textRgb]);

  const positionCriteria = useMemo(() => computeCriteriaForRatio(positionInfo.ratio), [positionInfo.ratio]);

  // FAQ content (visible + schema)
  const faqQa = useMemo(
    () => [
      {
        q: "Can WCAG contrast be checked on gradient backgrounds?",
        a: "Yes. When text sits on a gradient, contrast varies across the element. This tool samples the rendered gradient from 0% to 100% and reports the worst-case (minimum) contrast ratio, plus a calculation at the exact text position shown in the preview.",
      },
      {
        q: "What WCAG 2.2 contrast ratio is required for normal text?",
        a: "WCAG requires at least 4.5:1 for normal text at Level AA, and 7:1 for Level AAA. Large text has a lower threshold (3:1 for AA).",
      },
      {
        q: "Why do many contrast checkers fail for gradients?",
        a: "Most tools accept a single background color. A gradient contains many intermediate colors between stops, so checking only the start/end colors can miss low-contrast regions in the middle.",
      },
      {
        q: "How does the gradient sampling work?",
        a: "For linear gradients, the tool samples points across the rendered element from 0% to 100% and computes contrast at each point using the WCAG relative luminance formula. The reported worst-case ratio is the minimum across those samples.",
      },
      {
        q: "Does this support negative or greater-than-100% stop positions?",
        a: "Yes. CSS allows stop positions outside 0–100%. The tool supports those values and still evaluates contrast across the rendered element from 0% to 100%.",
      },
      {
        q: "Is the OpenGraph image fully crawlable by Google?",
        a: "The tool generates an OpenGraph preview image client-side for sharing. For maximum SEO/social reliability, also generate a static og:image on the server/build pipeline and set it in your HTML head.",
      },
    ],
    []
  );

  // Share URL (auto-generated from current state)
  useEffect(() => {
    const url = buildShareUrl({ mode, textHex, bgHex, angle, stops, sampleStep, previewPadTop });
    setShareUrl(url);
    // keep canonical stable: without transient hash fragments
    window.history.replaceState({}, "", url);
  }, [mode, textHex, bgHex, angle, stops, sampleStep, previewPadTop]);

  // OG image generation (debounced-ish)
  useEffect(() => {
    const t = setTimeout(() => {
      const ratioText = analysis?.ok
        ? `${fmtRatio(mode === "solid" ? analysis.ratio : analysis.minRatio)}:1`
        : "—:1";

      const subtitle = mode === "solid" ? "Solid background contrast" : "Worst-case contrast on gradients";

      const png = drawOgPng({
        mode,
        gradientCss,
        solidHex: bgHex,
        textHex,
        ratioText,
        subtitle,
      });

      setOgPngDataUrl(png);
    }, 150);

    return () => clearTimeout(t);
  }, [mode, gradientCss, bgHex, textHex, analysis]);

  // SEO meta + FAQ schema
  const ogDescription = useMemo(() => computeOgDescription({ mode, analysis }), [mode, analysis]);
  useSeoMeta({
    canonicalUrl: shareUrl || window.location.href,
    ogImageUrl: ogPngDataUrl || undefined,
    ogDescription,
    faqQa,
  });

  const resultsHeaderRight = analysis?.ok ? (
    <div className="text-right">
      <p className="text-xs text-slate-600">{analysis.type === "solid" ? "Ratio" : "Worst-case"}</p>
      <p className="text-2xl font-bold tabular-nums">
        {analysis.type === "solid" ? fmtRatio(analysis.ratio) : fmtRatio(analysis.minRatio)}
        <span className="text-base font-semibold text-slate-600">:1</span>
      </p>
    </div>
  ) : (
    <Badge ok={false}>Fix inputs</Badge>
  );

  const resultsBody = !analysis?.ok ? (
    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
      {analysis?.error || "Please enter valid colors."}
    </div>
  ) : (
    <>
      <div className="mt-4 grid gap-3">
        <CriteriaTable
          title={mode === "gradient" ? "Overall (worst-case across rendered element)" : "Overall"}
          subtitle={mode === "gradient" ? "Uses the minimum contrast sampled from 0% to 100% of the element." : null}
          ratio={overallRatio}
          criteria={overallCriteria}
        />

        <CriteriaTable
          title="At text position"
          subtitle={
            mode === "gradient"
              ? `Computed at the preview’s text start location (padding-top ${Math.max(0, Number(previewPadTop) || 0)}px).` +
                (positionInfo.pct == null ? "" : ` Mapped to ~${positionInfo.pct.toFixed(2)}% along the gradient.`) +
                (positionInfo.bgHex ? ` Background there: ${positionInfo.bgHex}.` : "")
              : "Solid background (same as overall)."
          }
          ratio={positionInfo.ratio}
          criteria={positionCriteria}
        />
      </div>

      {analysis.type === "gradient" ? (
        <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <div className="text-xs text-slate-600">Worst background</div>
              <div className="mt-0.5 font-mono text-slate-900">{analysis.worstBgHex || "—"}</div>
              <div className="text-xs text-slate-600">at {analysis.worstAt}%</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <div className="text-xs text-slate-600">Best background</div>
              <div className="mt-0.5 font-mono text-slate-900">{analysis.bestBgHex || "—"}</div>
              <div className="text-xs text-slate-600">at {analysis.bestAt}%</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <div className="text-xs text-slate-600">Text position background</div>
              <div className="mt-0.5 font-mono text-slate-900">{positionInfo.bgHex || "—"}</div>
              <div className="text-xs text-slate-600">{positionInfo.pct == null ? "—" : `at ~${positionInfo.pct.toFixed(2)}%`}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MiniSpark data={analysis.ratios} />
            <div className="text-xs text-slate-600">Sparkline shows sampled contrast ratios across the gradient (0% to 100%).</div>
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <h3 className="text-sm font-semibold">Preview</h3>
        <p className="mt-1 text-xs text-slate-600">Adjust padding-top to match where your text sits relative to the gradient.</p>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <FieldLabel
                htmlFor="previewPadTop"
                hint="This changes the preview’s padding-top and also drives the 'At text position' calculation."
              >
                Preview padding-top (px)
              </FieldLabel>
              <input
                id="previewPadTop"
                type="number"
                step="1"
                min={0}
                className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                value={previewPadTop}
                onChange={(e) => setPreviewPadTop(Number(e.target.value))}
              />
            </div>

            <div className="text-xs text-slate-600">
              Preview size:{" "}
              <span className="font-mono tabular-nums">
                {Math.round(previewSize.width)}×{Math.round(previewSize.height)}
              </span>
              {mode === "gradient" && positionInfo.pct != null ? (
                <>
                  <br />
                  Text position mapped to{" "}
                  <span className="font-mono tabular-nums">{positionInfo.pct.toFixed(2)}%</span> along the gradient.
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div
          ref={previewRef}
          className="mt-3 rounded-2xl border border-slate-200 shadow-inner"
          style={previewStyle}
          role="region"
          aria-label="Color contrast preview"
        >
          <div className="max-w-xl">
            <p className="text-base font-normal">
              Normal text sample — The quick brown fox jumps over the lazy dog. (WCAG normal text uses 4.5:1 for AA.)
            </p>
            <p className="mt-3 text-lg font-semibold">
              Large/bold sample — The quick brown fox jumps over the lazy dog. (Large text AA is 3:1.)
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-950/10 bg-white/70 px-3 py-2 backdrop-blur">
              <span className="text-sm font-semibold">UI sample:</span>
              <button
                className="rounded-lg border border-slate-950/20 bg-white/90 px-3 py-1 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                type="button"
              >
                Button
              </button>
              <span className="text-xs text-slate-800">(UI components generally need at least 3:1)</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // fallback: prompt
      window.prompt("Copy this URL", shareUrl);
    }
  };

  const handleNativeShare = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: document.title,
        text: "WCAG 2.2 gradient contrast checker",
        url: shareUrl,
      });
    } catch {
      // user canceled
    }
  };

  const downloadOgImage = () => {
    if (!ogPngDataUrl) return;
    const a = document.createElement("a");
    a.href = ogPngDataUrl;
    a.download = "wcag-gradient-contrast.png";
    a.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl 2xl:max-w-7xl px-4 py-10">
        {/* Landing intro */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
            <div className="space-y-3">
              <h1 className="text-3xl font-extrabold tracking-tight">WCAG 2.2 Gradient Color Contrast Checker</h1>
              <p className="text-base text-slate-700">
                Most contrast tools only handle <strong>solid background colors</strong>. This tool checks contrast for <strong>CSS gradients</strong>
                by sampling the rendered element from <strong>0% to 100%</strong>, reporting the <strong>worst-case contrast ratio</strong>, and also
                showing the result <strong>at your exact text position</strong>.
              </p>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Gradient support</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Worst-case sampling</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">AA / AAA checks</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Shareable links</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-sm font-semibold">Share this exact check</h2>
              <p className="mt-1 text-xs text-slate-600">The link captures mode, colors, gradient stops, sampling, and text position.</p>

              <div className="mt-3 flex items-center gap-2">
                <input
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 shadow-sm"
                  value={shareUrl}
                  readOnly
                  aria-label="Shareable URL"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {navigator.share ? (
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    Share…
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={downloadOgImage}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-sm hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  Download preview image
                </button>
              </div>

              <div className="mt-3">
                <p className="text-[11px] text-slate-600">OpenGraph preview</p>
                <div className="mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {ogPngDataUrl ? (
                    <img src={ogPngDataUrl} alt="OpenGraph preview" className="h-auto w-full" />
                  ) : (
                    <div className="p-4 text-xs text-slate-600">Generating image…</div>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-slate-600">
                  Note: This OG image is generated client-side for sharing. For best crawler compatibility, generate a static og:image
                  in your deployment.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Tool */}
        <main className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold">Inputs</h2>

            <div className="mt-4 grid gap-4">
              <ColorInput
                id="textColor"
                label="Text color"
                value={textHex}
                onChange={setTextHex}
                description="Hex format like #546177 or 546177 (3- or 6-digit)."
              />

              <div className="space-y-2">
                <FieldLabel htmlFor="mode">Background type</FieldLabel>
                <div className="flex items-center gap-2" role="radiogroup" aria-label="Background type">
                  <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm">
                    <input type="radio" name="mode" value="solid" checked={mode === "solid"} onChange={() => setMode("solid")} />
                    Solid
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm">
                    <input type="radio" name="mode" value="gradient" checked={mode === "gradient"} onChange={() => setMode("gradient")} />
                    Gradient
                  </label>
                </div>
              </div>

              {mode === "solid" ? (
                <ColorInput
                  id="bgColor"
                  label="Background color"
                  value={bgHex}
                  onChange={setBgHex}
                  description="Used to compute a single contrast ratio."
                />
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <FieldLabel htmlFor="angle" hint="CSS angle for linear-gradient(). 180deg = top to bottom.">
                        Gradient angle (deg)
                      </FieldLabel>
                      <input
                        id="angle"
                        type="number"
                        className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={angle}
                        onChange={(e) => setAngle(Number(e.target.value))}
                        min={0}
                        max={360}
                      />
                    </div>

                    <div className="space-y-2">
                      <FieldLabel htmlFor="sampleStep" hint="Smaller = more accurate but slightly slower. 1% is usually fine.">
                        Sampling step (percent)
                      </FieldLabel>
                      <select
                        id="sampleStep"
                        className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={sampleStep}
                        onChange={(e) => setSampleStep(Number(e.target.value))}
                      >
                        <option value={1}>1%</option>
                        <option value={2}>2%</option>
                        <option value={5}>5%</option>
                        <option value={10}>10%</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div className="min-w-0">
                        <FieldLabel htmlFor="stops">Gradient stops</FieldLabel>
                      </div>
                      <button
                        type="button"
                        onClick={addStop}
                        className="w-full sm:w-auto rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      >
                        Add stop
                      </button>
                    </div>

                    <div className="space-y-3" id="stops">
                      {sortStops(stops).map((s, idx) => {
                        const canRemove = stops.length > 2;
                        return (
                          <div
                            key={s.id}
                            className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_140px_84px] sm:items-end"
                          >
                            <ColorInput
                              id={`stop-${s.id}-color`}
                              label={`Stop ${idx + 1} color`}
                              value={s.color}
                              onChange={(v) => setStop(s.id, { color: v })}
                              description={null}
                              fullWidthInput={true}
                            />

                            <div className="space-y-2">
                              <FieldLabel htmlFor={`stop-${s.id}-pos`} hint="Any percent value (can be negative or greater than 100).">
                                Position (%)
                              </FieldLabel>
                              <input
                                id={`stop-${s.id}-pos`}
                                type="number"
                                step="0.01"
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                                value={s.pos}
                                onChange={(e) => setStop(s.id, { pos: Number(e.target.value) })}
                              />
                            </div>

                            <div className="flex items-center justify-start sm:justify-end">
                              <button
                                type="button"
                                disabled={!canRemove}
                                onClick={() => removeStop(s.id)}
                                className={
                                  "rounded-lg px-3 py-2 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 " +
                                  (canRemove
                                    ? "bg-white text-slate-900 border border-slate-300 hover:bg-slate-100"
                                    : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed")
                                }
                                aria-disabled={!canRemove}
                                aria-label={canRemove ? `Remove stop ${idx + 1}` : "Need at least 2 stops"}
                                title={canRemove ? "Remove this stop" : "Need at least 2 stops"}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-xs text-slate-600">Computed CSS:</p>
                      <code className="mt-1 block select-all overflow-auto rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-slate-50">
                        {gradientCss}
                      </code>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Results</h2>
                <p className="mt-1 text-sm text-slate-700" aria-live="polite" ref={liveRef}>
                  {statusText}
                </p>
              </div>
              {resultsHeaderRight}
            </div>

            {resultsBody}
          </section>
        </main>

        {/* SEO content */}
        <section className="mt-12 grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-6 text-sm text-slate-700">
            <h2 className="text-xl font-semibold">Gradient Color Contrast Accessibility</h2>

            <p>
              Most WCAG color contrast tools only support <strong>solid background colors</strong>. In real user interfaces,
              designers frequently use <strong>CSS gradients</strong> for hero sections, buttons, cards, navigation bars, and
              marketing layouts. When text sits on top of a gradient, the contrast ratio can vary across the element.
            </p>

            <p>
              This tool samples the rendered gradient from <strong>0% to 100%</strong> and calculates the <strong>worst-case contrast ratio</strong>.
              That worst-case value determines whether the design passes AA/AAA requirements everywhere the text could appear.
            </p>

            <h3 className="text-lg font-semibold">WCAG 2.2 Contrast Requirements</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Normal text AA:</strong> 4.5:1 contrast ratio</li>
              <li><strong>Normal text AAA:</strong> 7:1 contrast ratio</li>
              <li><strong>Large text AA:</strong> 3:1 contrast ratio</li>
              <li><strong>Large text AAA:</strong> 4.5:1 contrast ratio</li>
              <li><strong>UI components and graphics:</strong> 3:1 contrast ratio</li>
            </ul>

            <p>
              The page also computes contrast at your <strong>exact text position</strong> (based on preview padding) so you can replicate a real
              layout—like a hero headline that starts 80px down from the top.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold">FAQ</h2>
            <div className="grid gap-3">
              {faqQa.map((x, i) => (
                <FaqItem key={x.q} q={x.q} a={x.a} defaultOpen={i === 0} />
              ))}
            </div>
          </div>
        </section>

        <footer className="mt-10 text-xs text-slate-600">
          <p>
            Notes: This tool computes contrast using WCAG relative luminance (sRGB). For gradients it samples along 0–100% of the rendered area (even if stop
            positions are negative or greater than 100). The "At text position" result uses the preview’s padding-top as the text start location.
          </p>
        </footer>
      </div>
    </div>
  );
}
