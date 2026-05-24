const {
  requireDashboardAuth,
  sendAuthFailure
} = require("./_lib/dashboard-auth");
const {
  deleteFirmwareRecord,
  getGroupedView,
  loadState,
  saveState
} = require("./_lib/firmware-store");

function parseJsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }
  return req.body;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const auth = requireDashboardAuth(req, res);
  if (!auth.ok) return sendAuthFailure(res, auth);

  try {
    const body = parseJsonBody(req);
    const id = String(body.id || "").trim();
    if (!id) {
      return res.status(400).json({ error: "id is required." });
    }

    const state = await loadState();
    await deleteFirmwareRecord(state, id);
    await saveState(state);

    return res.status(200).json({ ok: true, payload: getGroupedView(state) });
  } catch (error) {
    const msg = String(error);
    const status = msg.includes("not found") ? 404 : 400;
    return res.status(status).json({
      error: "Delete failed.",
      detail: msg
    });
  }
};
