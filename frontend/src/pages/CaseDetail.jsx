import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getCase, getCaseGraph, getRelatedCases, getEvidenceTrail } from "../api.js";
import RiskGauge from "../components/RiskGauge.jsx";
import IOCTable from "../components/IOCTable.jsx";
import GraphView from "../components/GraphView.jsx";

const AUTH_COLOR = {
  pass: "text-green-400",
  fail: "text-red-400",
  softfail: "text-orange-400",
  none: "text-soc-muted",
  neutral: "text-soc-muted",
};

const TAB_LABELS = {
  overview: "📊 Overview",
  headers: "📨 Headers",
  ai: "🤖 AI Analysis",
  iocs: "🔍 IOCs",
  graph: "🕸 Graph",
  evidence: "🔒 Evidence",
};

function AuthPill({ label, value }) {
  return (
    <div className="bg-soc-bg border border-soc-border rounded-lg px-3 py-2 text-center">
      <p className="text-xs text-soc-muted mb-1">{label}</p>
      <p className={`font-bold uppercase text-sm ${AUTH_COLOR[value] || "text-soc-muted"}`}>
        {value || "none"}
      </p>
    </div>
  );
}

export default function CaseDetail() {
  const { id } = useParams();
  const [c, setCase] = useState(null);
  const [graph, setGraph] = useState(null);
  const [related, setRelated] = useState([]);
  const [trail, setTrail] = useState([]);
  const [tab, setTab] = useState("overview");
  const [err, setErr] = useState(null);

  useEffect(() => {
    getCase(id).then(setCase).catch((e) => setErr(e.message));
    getCaseGraph(id).then(setGraph).catch(() => setGraph(null));
    getRelatedCases(id).then(setRelated).catch(() => setRelated([]));
    getEvidenceTrail(id).then(setTrail).catch(() => setTrail([]));
  }, [id]);

  if (err)
    return (
      <div className="p-8 text-red-400 flex items-center gap-2">
        <span>⚠</span> {err}
      </div>
    );
  if (!c)
    return (
      <div className="p-8 text-soc-muted flex items-center gap-2">
        <div className="animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full" />
        Loading case…
      </div>
    );

  const verdictColor =
    c.ai_verdict === "phishing" || c.ai_verdict === "bec" || c.ai_verdict === "malware"
      ? "text-red-400"
      : c.ai_verdict === "spam"
      ? "text-orange-400"
      : "text-green-400";

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <Link to="/" className="text-soc-muted text-sm hover:text-soc-text flex items-center gap-1 w-fit">
        ← Back to dashboard
      </Link>

      {/* Case header */}
      <header className="mt-4 mb-6 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-xl font-bold truncate">{c.subject || "(no subject)"}</h1>
          <p className="text-soc-muted text-sm mt-1">
            From <span className="text-soc-text">{c.sender}</span>
            {c.to_addr && (
              <>
                {" "}→{" "}
                <span className="text-soc-text">{c.to_addr}</span>
              </>
            )}
          </p>
          <p className="text-soc-muted text-xs mt-1 font-mono">Case ID: {c.id}</p>
        </div>
        <div className="shrink-0">
          <RiskGauge score={c.risk_score} level={c.risk_level} />
        </div>
      </header>

      {/* Tab bar */}
      <nav className="flex gap-1 mb-6 border-b border-soc-border overflow-x-auto">
        {Object.entries(TAB_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
              tab === key
                ? "border-blue-400 text-soc-text font-medium"
                : "border-transparent text-soc-muted hover:text-soc-text"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ── Overview ── */}
      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-soc-panel border border-soc-border rounded-xl p-4">
            <h3 className="font-semibold text-sm text-soc-muted uppercase tracking-wider mb-3">AI Verdict</h3>
            <p className={`text-3xl font-bold capitalize mb-1 ${verdictColor}`}>{c.ai_verdict}</p>
            <p className="text-soc-muted text-sm">
              Confidence:{" "}
              <span className="text-soc-text font-medium">
                {(c.ai_confidence * 100).toFixed(0)}%
              </span>
            </p>
          </div>

          <div className="bg-soc-panel border border-soc-border rounded-xl p-4">
            <h3 className="font-semibold text-sm text-soc-muted uppercase tracking-wider mb-3">Risk Breakdown</h3>
            <ul className="text-sm space-y-1.5">
              {c.risk_breakdown &&
                Object.entries(c.risk_breakdown).map(([k, v]) => (
                  <li key={k} className="flex justify-between items-center">
                    <span className="text-soc-muted capitalize">{k.replace(/_/g, " ")}</span>
                    <span className="font-mono text-xs bg-soc-bg px-2 py-0.5 rounded">+{v}</span>
                  </li>
                ))}
            </ul>
          </div>

          <div className="col-span-2 bg-soc-panel border border-soc-border rounded-xl p-4">
            <h3 className="font-semibold text-sm text-soc-muted uppercase tracking-wider mb-3">
              Header Anomalies
            </h3>
            {c.auth_anomalies?.length ? (
              <ul className="text-sm space-y-1.5 list-disc list-inside text-soc-text">
                {c.auth_anomalies.map((a, i) => (
                  <li key={i} className="text-orange-300">
                    {a}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-green-400 text-sm">✓ No anomalies detected.</p>
            )}
          </div>

          {related.length > 0 && (
            <div className="col-span-2 bg-soc-panel border border-soc-border rounded-xl p-4">
              <h3 className="font-semibold text-sm text-soc-muted uppercase tracking-wider mb-3">
                🔗 Related Campaign Cases — Shared Infrastructure
              </h3>
              <ul className="text-sm space-y-2">
                {related.map((r) => (
                  <li key={r.case_id} className="flex justify-between items-center">
                    <Link
                      to={`/cases/${r.case_id}`}
                      className="text-blue-400 hover:underline truncate max-w-xs"
                    >
                      {r.subject}
                    </Link>
                    <span className="text-soc-muted text-xs ml-4 shrink-0">
                      shared {r.shared_type}: {r.shared_value}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Headers ── */}
      {tab === "headers" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <AuthPill label="SPF" value={c.spf_result} />
            <AuthPill label="DKIM" value={c.dkim_result} />
            <AuthPill label="DMARC" value={c.dmarc_result} />
          </div>
          <div className="bg-soc-panel border border-soc-border rounded-xl p-4">
            <h3 className="font-semibold mb-3">Relay Path (origin → destination)</h3>
            <div className="space-y-2">
              {c.relay_path?.length ? (
                c.relay_path.map((hop, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm font-mono">
                    <span className="text-soc-muted w-6 shrink-0">{i + 1}.</span>
                    <span>{hop.from || "?"}</span>
                    <span className="text-soc-muted">→</span>
                    <span>{hop.by || "?"}</span>
                    {hop.ip && <span className="text-purple-300 ml-2">[{hop.ip}]</span>}
                  </div>
                ))
              ) : (
                <p className="text-soc-muted text-sm">No relay hops parsed.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── AI Analysis ── */}
      {tab === "ai" && (
        <div className="bg-soc-panel border border-soc-border rounded-xl p-5 space-y-5">
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              🤖 Gemini Reasoning
            </h3>
            <p className="text-sm text-soc-text leading-relaxed">{c.ai_reasoning}</p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Indicators Flagged</h3>
            <div className="flex flex-wrap gap-2">
              {c.ai_indicators?.length ? (
                c.ai_indicators.map((ind, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded-full text-xs"
                  >
                    {ind}
                  </span>
                ))
              ) : (
                <p className="text-soc-muted text-sm">None listed.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── IOCs ── */}
      {tab === "iocs" && (
        <div className="bg-soc-panel border border-soc-border rounded-xl p-4">
          <IOCTable iocs={c.iocs} />
        </div>
      )}

      {/* ── Graph ── */}
      {tab === "graph" && (
        <div className="bg-soc-panel border border-soc-border rounded-xl p-4">
          <GraphView graph={graph} />
        </div>
      )}

      {/* ── Evidence Ledger ── */}
      {tab === "evidence" && (
        <div className="bg-soc-panel border border-soc-border rounded-xl p-5">
          <h3 className="font-semibold mb-1">🔒 Tamper-Evident Hash-Chain Ledger</h3>
          <p className="text-soc-muted text-xs mb-4 leading-relaxed">
            SHA-256 hash chain — each entry commits to the hash of the previous one. Altering any
            past record breaks every hash after it. Not a distributed blockchain; an honest
            append-only ledger.
          </p>
          {trail.length === 0 ? (
            <p className="text-soc-muted text-sm">No ledger entries for this case.</p>
          ) : (
            <div className="space-y-0 divide-y divide-soc-border">
              {trail.map((t) => (
                <div key={t.seq} className="py-3 text-xs font-mono">
                  <p className="text-soc-text">
                    <span className="text-soc-muted">seq</span> {t.seq} ·{" "}
                    <span className="text-blue-300">{t.event_type}</span> · {t.timestamp}
                  </p>
                  <p className="text-soc-muted truncate mt-0.5">hash: {t.record_hash}</p>
                  <p className="text-soc-muted truncate">prev: {t.prev_hash}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
