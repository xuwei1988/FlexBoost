const { isAuthenticated, isPasswordConfigured } = require("./_lib/dashboard-auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const configured = isPasswordConfigured();
  const authenticated = configured && isAuthenticated(req);

  return res.status(200).json({
    authenticated,
    passwordConfigured: configured
  });
};
