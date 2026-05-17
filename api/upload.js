const { loadState, saveState, uploadFirmware } = require("./_lib/firmware-store");

function parseJsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }
  return req.body;
}

function decodeBase64(contentBase64) {
  if (!contentBase64 || typeof contentBase64 !== "string") {
    throw new Error("Missing contentBase64.");
  }
  return Buffer.from(contentBase64, "base64");
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const body = parseJsonBody(req);
    const fileName = String(body.fileName || "").trim();
    if (!fileName) {
      return res.status(400).json({ error: "fileName is required." });
    }
    const bytes = decodeBase64(body.contentBase64);
    if (!bytes.length) {
      return res.status(400).json({ error: "Uploaded file is empty." });
    }

    const state = await loadState();
    const uploaded = await uploadFirmware({
      state,
      fileName,
      bytes,
      versionName: body.versionName,
      notes: body.notes,
      explicitVersion: Number(body.version)
    });
    await saveState(state);

    return res.status(200).json({ ok: true, record: uploaded });
  } catch (error) {
    return res.status(400).json({
      error: "Upload failed.",
      detail: String(error)
    });
  }
}

module.exports = handler;
module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb"
    }
  }
};
