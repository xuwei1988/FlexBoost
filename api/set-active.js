const {
  applyActiveSelection,
  getGroupedView,
  inferGroupFromName,
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

  try {
    const body = parseJsonBody(req);
    const id = String(body.id || "").trim();
    const requestedGroup = String(body.group || "").trim().toLowerCase();
    if (!id) {
      return res.status(400).json({ error: "id is required." });
    }

    const state = await loadState();
    const record = state.records.find((r) => r.id === id);
    if (!record) {
      return res.status(404).json({ error: "Record not found." });
    }

    const inferred = record.group || inferGroupFromName(record.file_name);
    if (!inferred) {
      return res.status(400).json({ error: "Unsupported record group." });
    }
    if (requestedGroup && requestedGroup !== inferred) {
      return res.status(400).json({ error: "Group mismatch for selected record." });
    }

    applyActiveSelection(
      state,
      inferred,
      id,
      `Set ${record.file_name} as active ${inferred} firmware.`
    );
    await saveState(state);

    return res.status(200).json({ ok: true, payload: getGroupedView(state) });
  } catch (error) {
    return res.status(400).json({
      error: "Failed to set active firmware.",
      detail: String(error)
    });
  }
};
