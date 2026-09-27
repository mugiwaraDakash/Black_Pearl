import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import UploadBox from "../components/UploadBox.jsx";
import CaseList from "../components/CaseList.jsx";
import { analyzeEmail, analyzeSample, listSamples, listCases } from "../api.js";

const BADGE_STYLES = {
  red: "bg-red-500/10 text-red-400 border-red-500/30",
  purple: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  green: "bg-green-500/10 text-green-400 border-green-500/30",
};

const THREAT_ICONS = {
  red: "🎣",
  purple: "💼",
  green: "✅",
};

export default function Dashboard() {
  const [cases, setCases] = useState([]);
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingSample, setLoadingSample] = useState(null);
  const [error, setError] = useState(null);
  const [backendOk, setBackendOk] = useState(null);
  const navigate = useNavigate();

  const refresh = () => listCases().then(setCases).catch(() => {});

  useEffect(() => {
    refresh();
    listSamples().then(setSamples).catch(() => {});
    fetch("http://localhost:8000/api/health")
      .then((r) => setBackendOk(r.ok))
      .catch(() => setBackendOk(false));
  }, []);

  const handleAnalyze = async (file) => {
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeEmail(file);
      navigate(`/cases/${result.id}`);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSampleClick = async (sample) => {
    setLoadingSample(sample.filename);
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeSample(sample.filename);
      navigate(`/cases/${result.id}`);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Sample analysis failed.");
    } finally {
      setLoading(false);
      setLoadingSample(null);
    }
  };

  const critical = cases.filter((c) => c.risk_level === "critical").length;
  const high = cases.filter((c) => c.risk_level === "high").length;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* ── Header ── */}
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🏴‍☠️</span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Black Pearl</h1>
            <p className="text-soc-muted text-xs mt-0.5">
              AI-Powered Email Threat Forensics · Geolocation · Evidence Integrity
            </p>
          </div>
        </div>

        {/* Live status pill */}
        {backendOk !== null && (
          <span
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium ${
              backendOk
                ? "bg-green-500/10 text-green-400 border-green-500/30"
                : "bg-red-500/10 text-red-400 border-red-500/30"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                backendOk ? "bg-green-400 animate-pulse" : "bg-red-400"
              }`}
            />
            {backendOk ? "API Online" : "API Offline"}
          </span>
        )}
      </header>

      {/* ── Stats Bar (only when cases exist) ── */}
      {cases.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Total Cases", value: cases.length, color: "text-blue-400" },
            { label: "Critical", value: critical, color: "text-red-400" },
            { label: "High Risk", value: high, color: "text-orange-400" },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-soc-panel border border-soc-border rounded-xl px-4 py-3 flex items-center justify-between"
            >
              <span className="text-soc-muted text-xs">{s.label}</span>
              <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── 1-Click Sample Cards ── */}
      {samples.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-soc-muted flex items-center gap-2">
              <span>⚡</span> Quick Test — Preloaded Samples
            </h2>
            <span className="text-xs text-soc-muted">Click any card to run full AI analysis</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {samples.map((s) => {
              const isCurrentLoading = loadingSample === s.filename;
              return (
                <div
                  key={s.filename}
                  className="bg-soc-panel border border-soc-border hover:border-blue-400/60 rounded-xl p-4 flex flex-col justify-between transition-all duration-200 relative group"
                >
                  {/* subtle glow overlay */}
                  <div className="absolute inset-0 rounded-xl bg-blue-500/0 group-hover:bg-blue-500/5 transition-all duration-200 pointer-events-none" />

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                          BADGE_STYLES[s.badge_color] || BADGE_STYLES.purple
                        }`}
                      >
                        {s.threat_type}
                      </span>
                      <span className="text-xl">{THREAT_ICONS[s.badge_color] || "📧"}</span>
                    </div>
                    <h3 className="font-semibold text-sm text-soc-text mb-1 group-hover:text-blue-300 transition-colors">
                      {s.title}
                    </h3>
                    <p className="text-xs text-soc-muted leading-relaxed mb-3">{s.description}</p>
                  </div>

                  <button
                    disabled={loading}
                    onClick={() => handleSampleClick(s)}
                    className="w-full mt-2 py-2 px-3 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {isCurrentLoading ? (
                      <>
                        <div className="animate-spin h-3.5 w-3.5 border-2 border-blue-400 border-t-transparent rounded-full" />
                        <span>Analyzing with Gemini AI…</span>
                      </>
                    ) : (
                      <>
                        <span>▶</span>
                        <span>Analyze Sample</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Manual Upload ── */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-soc-muted mb-2 flex items-center gap-2">
          <span>📁</span> Upload Custom Email (.eml)
        </h2>
        <UploadBox onAnalyze={handleAnalyze} loading={loading && !loadingSample} />
      </section>

      {/* Error banner */}
      {error && (
        <div className="mt-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center justify-between">
          <span>⚠ {error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-200 text-xs ml-4 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Case History ── */}
      <section className="mt-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            🗂 Analyzed Cases
            {cases.length > 0 && (
              <span className="text-xs font-normal bg-soc-panel border border-soc-border px-2 py-0.5 rounded-full text-soc-muted">
                {cases.length}
              </span>
            )}
          </h2>
          <button
            onClick={refresh}
            className="text-xs text-soc-muted hover:text-soc-text px-2.5 py-1 rounded bg-soc-panel border border-soc-border transition-colors"
          >
            ↻ Refresh
          </button>
        </div>

        <div className="bg-soc-panel border border-soc-border rounded-xl p-2">
          {cases.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2 text-soc-muted">
              <span className="text-4xl">📭</span>
              <p className="text-sm">No cases yet — analyze a sample above to get started.</p>
            </div>
          ) : (
            <CaseList cases={cases} />
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-10 text-center text-xs text-soc-muted opacity-40">
        Black Pearl · SHA-256 hash-chain evidence ledger · Gemini AI · ip-api.com geolocation
      </footer>
    </div>
  );
}
