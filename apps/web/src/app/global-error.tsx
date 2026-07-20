"use client";

import "./globals.css";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          fontFamily:
            '"Avenir Next", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
          color: "#1f2933",
          background:
            "radial-gradient(ellipse 80% 60% at 100% 0%, rgba(15, 138, 108, 0.14), transparent 55%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(196, 146, 42, 0.10), transparent 50%), linear-gradient(165deg, #f4f6f5 0%, #eef1ef 45%, #e8eeeb 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1.25rem",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "28rem",
            background: "rgba(255,255,255,0.92)",
            border: "1px solid #cfd8d3",
            padding: "2rem 1.75rem",
          }}
        >
          <p
            style={{
              fontFamily:
                'Newsreader, "Iowan Old Style", Palatino, Georgia, serif',
              fontSize: "1.65rem",
              letterSpacing: "-0.03em",
              color: "#14213d",
              margin: 0,
            }}
          >
            REMBEH
          </p>
          <p
            style={{
              margin: "0.35rem 0 0",
              fontSize: "0.6875rem",
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(31, 41, 51, 0.55)",
            }}
          >
            by ANTIKRA Mechanism
          </p>
          <p
            style={{
              margin: "1.75rem 0 0",
              fontSize: "0.6875rem",
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#c4922a",
            }}
          >
            Application error
          </p>
          <h1
            style={{
              margin: "0.75rem 0 0",
              fontFamily:
                'Newsreader, "Iowan Old Style", Palatino, Georgia, serif',
              fontSize: "1.85rem",
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              color: "#14213d",
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              margin: "0.85rem 0 0",
              fontSize: "0.95rem",
              lineHeight: 1.65,
              color: "rgba(31, 41, 51, 0.78)",
            }}
          >
            REMBEH hit an unexpected error. Please try again. If the problem
            continues, contact your workspace administrator.
          </p>
          <div style={{ marginTop: "1.75rem", display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                minHeight: "2.75rem",
                padding: "0 1.15rem",
                border: "none",
                background: "#0f8a6c",
                color: "#fff",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="https://rembeh.antikra.com/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: "2.75rem",
                padding: "0 1.15rem",
                border: "1px solid #cfd8d3",
                color: "#14213d",
                fontSize: "0.875rem",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Go to home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
