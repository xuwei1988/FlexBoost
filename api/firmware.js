const {
  requireDashboardAuth,
  sendAuthFailure
} = require("./_lib/dashboard-auth");
const { getGroupedView, loadState } = require("./_lib/firmware-store");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const auth = requireDashboardAuth(req, res);
  if (!auth.ok) return sendAuthFailure(res, auth);

  try {
    const state = await loadState();
    const payload = getGroupedView(state);
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to load firmware state.",
      detail: String(error)
    });
  }
};
