import { ImageResponse } from "https://deno.land/x/og_edge/mod.ts";

export default async (req: Request) => {
  const url = new URL(req.url);

  const ratio = url.searchParams.get("ratio") ?? "—";
  const mode = url.searchParams.get("mode") ?? "gradient";
  const css = url.searchParams.get("css") ?? "linear-gradient(180deg, #fff 0%, #bac7e7 100%)";

  // Keep it simple: show ratio + highlight gradient support
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          padding: "64px",
          background: "#0b1220",
          color: "white",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.1 }}>
          WCAG 2.2 Gradient Contrast Checker
        </div>

        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <div
            style={{
              fontSize: 88,
              fontWeight: 900,
              padding: "16px 24px",
              borderRadius: 18,
              background: "rgba(255,255,255,0.12)",
            }}
          >
            {ratio}:1
          </div>
          <div style={{ fontSize: 28, opacity: 0.9 }}>
            {mode === "solid" ? "Solid background" : "Worst-case across gradient (0–100%)"}
          </div>
        </div>

        <div
          style={{
            padding: 20,
            borderRadius: 18,
            background: "white",
            color: "#0b1220",
            fontSize: 24,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          }}
        >
          {css}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
};