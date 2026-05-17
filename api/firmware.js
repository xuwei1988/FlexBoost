const { getGroupedView, loadState } = require("./_lib/firmware-store");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

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
