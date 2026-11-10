import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { Investigation } from "../server/investigation";
import type { Delivery, Finding } from "../server/domain";
import "./style.css";
type Audit = {
  replayId: string;
  destination: string;
  approvedAt: string;
  state: string;
  status: number | null;
  detail: string;
};
type Detail = {
  delivery: Delivery;
  diagnosis: { findings: Finding[]; engine: string } | null;
  audit: Audit | null;
  reproduction: { observation: Delivery; createdAt: string } | null;
  investigations: {
    mode: "fixture" | "gemini";
    state: string;
    error?: string;
    result?: Investigation;
  }[];
};
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(
    "/api" + path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}
function App() {
  const generation = useRef(0);
  const [items, setItems] = useState<Delivery[]>([]),
    [mode, setMode] = useState<"fixture" | "gemini">("fixture"),
    [geminiAvailable, setGeminiAvailable] = useState(false),
    [destination, setDestination] = useState(""),
    [queueLoaded, setQueueLoaded] = useState(false),
    [selected, setSelected] = useState("evt_signature"),
    [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [approved, setApproved] = useState(false),
    [tab, setTab] = useState<"request" | "response">("request");
  async function load(id: string) {
    const version = ++generation.current;
    setDetail(null);
    setError("");
    setApproved(false);
    try {
      const result = await api<Detail>("/deliveries/" + id);
      if (version === generation.current) setDetail(result);
    } catch (e) {
      if (version === generation.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    api<{ geminiAvailable: boolean; destination: string }>("/config")
      .then((config) => {
        setGeminiAvailable(config.geminiAvailable);
        setDestination(config.destination);
      })
      .catch(() => {});
    api<{ items: Delivery[] }>("/deliveries?limit=20")
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message))
      .finally(() => setQueueLoaded(true));
  }, []);
  useEffect(() => {
    void load(selected);
  }, [selected]);
  async function act(
    kind: "diagnose" | "replay" | "reproduce" | "investigate",
  ) {
    setBusy(kind);
    setError("");
    try {
      await api(
        "/deliveries/" + selected + "/" + kind,
        kind === "replay"
          ? { approval: "REPLAY LOCAL FIXTURE" }
          : kind === "investigate"
            ? { mode }
            : {},
      );
      setDetail(await api<Detail>("/deliveries/" + selected));
      setApproved(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="shell">
      <header>
        <a href="/" className="brand">
          <span className="mark">✳</span> webhook clinic
          <span className="version">/ 01</span>
        </a>
        <span className="fixture">
          <i /> SYNTHETIC FIXTURE LAB
        </span>
        <span className="local">● LOCAL SYSTEM</span>
      </header>
      <div className="intro">
        <div>
          <p className="eyebrow">DELIVERY OPERATIONS / INSPECTION DESK</p>
          <h1>Every failure leaves a trace.</h1>
          <p>
            Inspect the evidence. Diagnose the cause. Approve a controlled
            replay.
          </p>
        </div>
        <div className="stats">
          <strong>03</strong>
          <span>
            FAILED FIXTURES
            <br />
            READY TO INSPECT
          </span>
        </div>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}{" "}
          <button onClick={() => window.location.reload()}>Refresh</button>
        </div>
      )}
      <main>
        <aside>
          <div className="sectionhead">
            <h2>Delivery queue</h2>
            <span>{items.length.toString().padStart(2, "0")}</span>
          </div>
          <p className="muted small">Seeded incidents · newest first</p>
          <nav aria-label="Failed deliveries">
            {items.length === 0 && (
              <p className="muted small" role="status">
                {queueLoaded
                  ? "No fixture deliveries available."
                  : "Loading fixture queue…"}
              </p>
            )}
            {items.map((d, i) => (
              <button
                className={"delivery " + (selected === d.id ? "selected" : "")}
                key={d.id}
                onClick={() => {
                  if (!busy) setSelected(d.id);
                }}
                disabled={!!busy}
              >
                <span className="row">
                  <span className="index">0{i + 1}</span>
                  <span className="badge fail">
                    {d.response.status ?? "TIMEOUT"}
                  </span>
                </span>
                <strong>{d.event}</strong>
                <span className="muted mono">{d.id}</span>
                <span className="row">
                  <span className="muted">{d.createdAt.slice(11, 16)} UTC</span>
                  <span>{d.durationMs} ms ↗</span>
                </span>
              </button>
            ))}
          </nav>
          <div className="boundary">
            <span>↳ CONTAINED BY DESIGN</span>
            <p>
              Only synthetic deliveries. Only the bundled local receiver. Every
              replay needs your approval.
            </p>
          </div>
        </aside>
        <article aria-busy={!detail || !!busy}>
          {!detail ? (
            <div className="loading" role="status">
              {error
                ? "Inspection unavailable. Refresh to reconnect."
                : "Loading immutable evidence…"}
            </div>
          ) : (
            <>
              <div className="eventhead">
                <div>
                  <p className="eyebrow">SELECTED DELIVERY / POST</p>
                  <h2>{detail.delivery.event}</h2>
                  <span className="muted mono">
                    {detail.delivery.id} · {detail.delivery.createdAt}
                  </span>
                </div>
                <span className="badge fail">DELIVERY FAILED</span>
              </div>
              <div className="evidencebar">
                <span>01 / EVIDENCE</span>
                <span>IMMUTABLE · SANITIZED AT INGEST</span>
              </div>
              <div
                className="tabs"
                onKeyDown={(event) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  ) {
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? "request"
                        : event.key === "End"
                          ? "response"
                          : tab === "request"
                            ? "response"
                            : "request";
                    setTab(next);
                    document.getElementById("evidence-tab-" + next)?.focus();
                  }
                }}
                role="tablist"
                aria-label="Delivery evidence"
              >
                {(["request", "response"] as const).map((t) => (
                  <button
                    role="tab"
                    id={"evidence-tab-" + t}
                    aria-controls="evidence-panel"
                    aria-selected={tab === t}
                    tabIndex={tab === t ? 0 : -1}
                    key={t}
                    onClick={() => setTab(t)}
                  >
                    {t === "request" ? "Request snapshot" : "Response snapshot"}
                  </button>
                ))}
                <span className="muted">
                  {detail.delivery.durationMs} ms / {detail.delivery.budgetMs}{" "}
                  ms budget
                </span>
              </div>
              <pre
                role="tabpanel"
                id="evidence-panel"
                aria-labelledby={"evidence-tab-" + tab}
                tabIndex={0}
              >
                {JSON.stringify(detail.delivery[tab], null, 2)}
              </pre>
              <section className="diagnostic">
                <div className="sectionhead">
                  <div>
                    <p className="eyebrow">02 / DIAGNOSTICS</p>
                    <h2>Follow the evidence</h2>
                  </div>
                  <button
                    className="action"
                    disabled={!!busy || !!detail.diagnosis}
                    onClick={() => void act("diagnose")}
                  >
                    {busy === "diagnose"
                      ? "Inspecting…"
                      : detail.diagnosis
                        ? "Analysis retained ✓"
                        : "Run diagnostics ↗"}
                  </button>
                </div>
                <p className="muted small">
                  Measured synthetic fixture checks · exact-byte HMAC, receiver
                  HTTP status, delivery deadline. No model needed for
                  verification.
                </p>
                {detail.diagnosis ? (
                  <ol className="timeline">
                    {detail.diagnosis.findings.map((f, i) => (
                      <li key={f.code}>
                        <span className={"node " + f.level}>{i + 1}</span>
                        <div>
                          <div className="row">
                            <strong>{f.title}</strong>
                            <span className={"signal " + f.level}>
                              {f.level.toUpperCase()}
                            </span>
                          </div>
                          <p className="evidence">{f.evidence}</p>
                          <p className="muted">{f.action}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="empty">
                    Three bounded checks. Source evidence attached to every
                    finding.
                  </div>
                )}
              </section>
              <section className="diagnostic">
                <div className="sectionhead">
                  <div>
                    <p className="eyebrow">LOCAL REPRODUCTION</p>
                    <h2>Observe the failure again</h2>
                  </div>
                  <button
                    className="action"
                    disabled={!!busy || !!detail.reproduction}
                    onClick={() => void act("reproduce")}
                  >
                    {busy === "reproduce"
                      ? "Observing…"
                      : detail.reproduction
                        ? "Observation retained ✓"
                        : "Reproduce locally ↗"}
                  </button>
                </div>
                <p className="muted small">
                  Known private synthetic bytes are sent to the bundled fixture
                  receiver. The timeout case deliberately exceeds its 150 ms
                  budget. No original evidence is replaced.
                </p>
                {detail.reproduction && (
                  <div className="audit" role="status">
                    <strong>
                      HTTP{" "}
                      {detail.reproduction.observation.response.status ??
                        "— / DEADLINE"}{" "}
                      · {detail.reproduction.observation.durationMs} ms observed
                    </strong>
                    <p>
                      HMAC verification:{" "}
                      {detail.reproduction.observation.signatureVerification
                        .valid
                        ? "matched"
                        : "mismatched"}{" "}
                      · capture {detail.reproduction.createdAt}
                    </p>
                    <p className="evidence">
                      {detail.reproduction.observation.response.body}
                    </p>
                  </div>
                )}
              </section>
              <section className="diagnostic">
                <p className="eyebrow">EVIDENCE INVESTIGATION / OPTIONAL</p>
                <h2>Choose the next checks</h2>
                <p className="muted small">
                  A bounded investigator selects signature, status or timeout
                  evidence. Every summary and citation is validated against the
                  retained diagnosis. Investigators cannot replay or select
                  destinations.
                </p>
                <div className="investigation-controls">
                  <label>
                    Investigator{" "}
                    <select
                      value={mode}
                      disabled={!!busy}
                      onChange={(e) =>
                        setMode(e.target.value as "fixture" | "gemini")
                      }
                    >
                      <option value="fixture">
                        Fixture selector · no inference
                      </option>
                      <option value="gemini" disabled={!geminiAvailable}>
                        Gemini ·{" "}
                        {geminiAvailable
                          ? "explicit live request"
                          : "server key required"}
                      </option>
                    </select>
                  </label>
                  <button
                    className="action"
                    disabled={
                      !!busy ||
                      !detail.diagnosis ||
                      detail.investigations.some((i) => i.mode === mode)
                    }
                    onClick={() => void act("investigate")}
                  >
                    {busy === "investigate"
                      ? "Investigating…"
                      : mode === "gemini"
                        ? "Request Gemini investigation ↗"
                        : "Investigate fixture evidence ↗"}
                  </button>
                </div>
                {!geminiAvailable && (
                  <p className="muted small">
                    No-key mode is ready. Optional Gemini requires
                    GEMINI_API_KEY set on the server (see README).
                  </p>
                )}
                {detail.investigations
                  .filter((i) => i.mode === mode)
                  .map((i) => (
                    <div
                      className="audit investigation-result"
                      key={i.mode}
                      role="status"
                    >
                      <strong>
                        {i.mode === "gemini"
                          ? "GEMINI LIVE PROVIDER"
                          : "FIXTURE · NO INFERENCE"}{" "}
                        / {i.state.toUpperCase()}
                      </strong>
                      {i.result ? (
                        <>
                          <p>{i.result.summary}</p>
                          <p className="muted small">
                            {i.result.model} ·{" "}
                            {i.result.usage.inputTokens ?? "—"} input /{" "}
                            {i.result.usage.outputTokens ?? "—"} output tokens
                          </p>
                          {i.result.checks.map((c) => (
                            <div key={c.code}>
                              <strong>{c.title}</strong>
                              <p className="evidence">{c.evidenceQuote}</p>
                            </div>
                          ))}
                        </>
                      ) : (
                        <p>
                          {i.error ??
                            "Investigation pending. A retained attempt prevents duplicate provider calls; no replay is performed."}
                        </p>
                      )}
                    </div>
                  ))}
              </section>
              <section className="replay">
                <div>
                  <p className="eyebrow">03 / CONTROLLED REPLAY</p>
                  <h2>One approval. One local delivery.</h2>
                  <p className="muted small">
                    Replays use a newly signed synthetic payload. Original
                    evidence stays unchanged.
                  </p>
                </div>
                <code className="target">
                  POST {destination || "fixed local receiver"}{" "}
                  <span>FIXED DESTINATION</span>
                </code>
                {detail.audit ? (
                  <div className="audit" role="status">
                    <div className="row">
                      <strong
                        className={
                          detail.audit.state === "succeeded" ? "pass" : "warn"
                        }
                      >
                        {detail.audit.state.toUpperCase()}
                      </strong>
                      <span>HTTP {detail.audit.status ?? "—"}</span>
                    </div>
                    <p>{detail.audit.detail}</p>
                    <dl>
                      <dt>Correlation</dt>
                      <dd>{detail.audit.replayId}</dd>
                      <dt>Approved</dt>
                      <dd>{detail.audit.approvedAt}</dd>
                    </dl>
                    <p className="muted small">
                      Audit retained in MongoDB. Duplicate approvals return this
                      same attempt; no further delivery is sent.
                    </p>
                  </div>
                ) : (
                  <>
                    <label className="approval">
                      <input
                        type="checkbox"
                        checked={approved}
                        disabled={!detail.diagnosis || !!busy}
                        onChange={(e) => setApproved(e.target.checked)}
                      />
                      <span>
                        I reviewed the fixture findings and approve one replay
                        to the local receiver.
                      </span>
                    </label>
                    <button
                      className="action primary"
                      disabled={!detail.diagnosis || !approved || !!busy}
                      onClick={() => void act("replay")}
                    >
                      {busy === "replay"
                        ? "Awaiting receiver…"
                        : "Approve & replay locally →"}
                    </button>
                    {!detail.diagnosis && (
                      <p className="muted small">
                        Run diagnostics to unlock approval.
                      </p>
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </article>
      </main>
      <footer>
        <span>WEBHOOK CLINIC / A SMALL LAB FOR FAILED DELIVERIES</span>
        <span>FIXTURE REASONING · NO PRODUCTION CONNECTIONS</span>
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
