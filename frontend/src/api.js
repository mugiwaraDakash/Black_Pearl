import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const api = axios.create({ baseURL: API_BASE });

export const analyzeEmail = (file) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/analyze", form, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then((r) => r.data);
};

export const listSamples = () => api.get("/samples").then((r) => r.data);
export const analyzeSample = (filename) => api.post(`/samples/${filename}/analyze`).then((r) => r.data);

export const listCases = () => api.get("/cases").then((r) => r.data);
export const getCase = (id) => api.get(`/cases/${id}`).then((r) => r.data);
export const getCaseGraph = (id) => api.get(`/cases/${id}/graph`).then((r) => r.data);
export const getRelatedCases = (id) => api.get(`/cases/${id}/related`).then((r) => r.data);
export const getEvidenceTrail = (id) => api.get(`/cases/${id}/evidence-trail`).then((r) => r.data);
export const verifyLedger = () => api.get("/ledger/verify").then((r) => r.data);

export default api;
