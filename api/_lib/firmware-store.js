const { createHash, randomUUID } = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { list, put } = require("@vercel/blob");

const STATE_SCHEMA_VERSION = 1;
const STATE_BLOB_PATH = "metadata/firmware-state.json";

const GROUP_BIN = "bin";
const GROUP_TXT = "txt";

function nowIso() {
  return new Date().toISOString();
}

function normalizeExt(fileName) {
  const idx = fileName.lastIndexOf(".");
  if (idx <= 0) return "";
  return fileName.slice(idx).toLowerCase();
}

function inferGroupFromName(fileName) {
  const ext = normalizeExt(fileName);
  if (ext === ".bin") return GROUP_BIN;
  if (ext === ".txt") return GROUP_TXT;
  return null;
}

function targetForGroup(group) {
  return group === GROUP_TXT ? "dcdc_txt" : "esp32_bin";
}

function toReleaseEntry(record) {
  return {
    id: record.id,
    version: record.version,
    version_name: record.version_name,
    file_name: record.file_name,
    file_ext: record.file_ext,
    file_url: record.file_url,
    size: record.size,
    sha256: record.sha256 || "",
    target: record.target || targetForGroup(record.group),
    notes: record.notes || "",
    status: record.status,
    uploaded_at: record.uploaded_at
  };
}

function createEmptyState() {
  return {
    schema_version: STATE_SCHEMA_VERSION,
    updated_at: nowIso(),
    active_bin_id: null,
    active_txt_id: null,
    records: [],
    firmware_history: []
  };
}

async function readStateBlob() {
  const { blobs } = await list({ prefix: STATE_BLOB_PATH, limit: 1 });
  if (!blobs || blobs.length === 0) return null;
  const blob = blobs[0];
  const response = await fetch(blob.url, { cache: "no-store" });
  if (!response.ok) return null;
  const parsed = await response.json();
  if (!parsed || typeof parsed !== "object") return null;
  return parsed;
}

async function writeStateBlob(state) {
  state.updated_at = nowIso();
  await put(STATE_BLOB_PATH, JSON.stringify(state, null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8"
  });
}

function buildHistoryEvent(type, group, recordId, detail) {
  return {
    event_id: randomUUID(),
    event_type: type,
    group,
    record_id: recordId,
    detail,
    at: nowIso()
  };
}

function applyActiveSelection(state, group, recordId, reason) {
  const activeKey = group === GROUP_BIN ? "active_bin_id" : "active_txt_id";
  for (const r of state.records) {
    if (r.group !== group) continue;
    if (r.id === recordId) {
      r.status = "active";
    } else if (r.status === "active") {
      r.status = "archived";
    }
  }
  state[activeKey] = recordId;
  state.firmware_history.unshift(
    buildHistoryEvent("set_active", group, recordId, reason)
  );
}

function sortedByUploadedDesc(records) {
  return [...records].sort((a, b) => {
    const t1 = Date.parse(a.uploaded_at || "") || 0;
    const t2 = Date.parse(b.uploaded_at || "") || 0;
    return t2 - t1;
  });
}

function inferVersionName(fileName) {
  const idx = fileName.lastIndexOf(".");
  return idx > 0 ? fileName.slice(0, idx) : fileName;
}

function nextVersion(records) {
  if (!records.length) return 1;
  const maxVersion = Math.max(
    ...records.map((r) => (Number.isFinite(r.version) ? r.version : 0))
  );
  return maxVersion + 1;
}

async function bootstrapFromReleasesJson() {
  const state = createEmptyState();
  let raw = null;
  try {
    const releasesPath = path.join(process.cwd(), "releases.json");
    raw = await fs.readFile(releasesPath, "utf8");
  } catch (_) {
    return state;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return state;
  }

  const releases = Array.isArray(parsed.releases) ? parsed.releases : [];
  const mapped = [];
  for (const item of releases) {
    const fileName = (item?.file_name || "").trim();
    const group = inferGroupFromName(fileName);
    if (!group) continue;
    const ext = normalizeExt(fileName);
    const record = {
      id: randomUUID(),
      version: Number(item.version) || mapped.length + 1,
      version_name: (item.version_name || inferVersionName(fileName)).trim(),
      file_name: fileName,
      file_ext: ext,
      file_url: (item.file_url || "").trim(),
      size: Number(item.size) || 0,
      sha256: (item.sha256 || "").trim(),
      target: (item.target || targetForGroup(group)).trim(),
      notes: (item.notes || "").trim(),
      group,
      status: "archived",
      uploaded_at: parsed.generated_at || nowIso()
    };
    mapped.push(record);
  }

  if (!mapped.length) return state;
  state.records = sortedByUploadedDesc(mapped);

  const latestVersion = Number(parsed.latest_version) || null;
  const latestRecord =
    latestVersion == null
      ? null
      : state.records.find((r) => r.version === latestVersion) || null;
  if (latestRecord) {
    applyActiveSelection(
      state,
      latestRecord.group,
      latestRecord.id,
      "Bootstrapped active from releases.json latest_version."
    );
  }

  const activeBinExists = !!state.active_bin_id;
  const activeTxtExists = !!state.active_txt_id;
  if (!activeBinExists) {
    const firstBin = state.records.find((r) => r.group === GROUP_BIN);
    if (firstBin) {
      applyActiveSelection(
        state,
        GROUP_BIN,
        firstBin.id,
        "Bootstrapped default active bin."
      );
    }
  }
  if (!activeTxtExists) {
    const firstTxt = state.records.find((r) => r.group === GROUP_TXT);
    if (firstTxt) {
      applyActiveSelection(
        state,
        GROUP_TXT,
        firstTxt.id,
        "Bootstrapped default active txt."
      );
    }
  }

  return state;
}

async function loadState() {
  const existing = await readStateBlob();
  if (existing && Array.isArray(existing.records)) {
    if (!Array.isArray(existing.firmware_history)) {
      existing.firmware_history = [];
    }
    return existing;
  }
  const bootstrapped = await bootstrapFromReleasesJson();
  await writeStateBlob(bootstrapped);
  return bootstrapped;
}

async function saveState(state) {
  await writeStateBlob(state);
  return state;
}

async function uploadFirmware({
  state,
  fileName,
  bytes,
  versionName,
  notes,
  explicitVersion
}) {
  const ext = normalizeExt(fileName);
  const group = inferGroupFromName(fileName);
  if (!group) {
    throw new Error("Only .bin and .txt files are supported.");
  }
  const blobPath = `firmware/${Date.now()}-${fileName}`;
  const uploadedBlob = await put(blobPath, bytes, {
    access: "public",
    addRandomSuffix: true,
    contentType: "application/octet-stream"
  });
  const digest = createHash("sha256").update(bytes).digest("hex");

  const version =
    Number.isFinite(explicitVersion) && explicitVersion > 0
      ? explicitVersion
      : nextVersion(state.records);
  const record = {
    id: randomUUID(),
    version,
    version_name:
      (versionName || "").trim() || inferVersionName(fileName) || `v${version}`,
    file_name: fileName,
    file_ext: ext,
    file_url: uploadedBlob.url,
    size: bytes.length,
    sha256: digest,
    target: targetForGroup(group),
    notes: (notes || "").trim(),
    group,
    status: "archived",
    uploaded_at: nowIso()
  };

  state.records.unshift(record);
  state.firmware_history.unshift(
    buildHistoryEvent("upload", group, record.id, `Uploaded ${fileName}.`)
  );

  const activeKey = group === GROUP_BIN ? "active_bin_id" : "active_txt_id";
  if (!state[activeKey]) {
    applyActiveSelection(
      state,
      group,
      record.id,
      "Auto-activated first firmware in this group."
    );
  }

  state.updated_at = nowIso();
  return record;
}

function getGroupedView(state) {
  const sorted = sortedByUploadedDesc(state.records);
  const binFiles = sorted.filter((r) => r.group === GROUP_BIN).map(toReleaseEntry);
  const txtFiles = sorted.filter((r) => r.group === GROUP_TXT).map(toReleaseEntry);
  const activeBin = sorted.find((r) => r.id === state.active_bin_id) || null;
  const activeTxt = sorted.find((r) => r.id === state.active_txt_id) || null;
  return {
    schema_version: 2,
    updated_at: state.updated_at,
    active: {
      bin: activeBin ? toReleaseEntry(activeBin) : null,
      txt: activeTxt ? toReleaseEntry(activeTxt) : null
    },
    bin_files: binFiles,
    txt_files: txtFiles,
    records: sorted.map(toReleaseEntry),
    firmware_history: state.firmware_history || []
  };
}

function getActiveManifest(state) {
  const grouped = getGroupedView(state);
  const activeBin = grouped.active.bin;
  const activeTxt = grouped.active.txt;
  const releases = [activeTxt, activeBin].filter(Boolean);
  const latestVersion = releases.length
    ? Math.max(...releases.map((r) => Number(r.version) || 0))
    : 0;
  return {
    schema_version: 2,
    latest_version: latestVersion,
    active_bin: activeBin,
    active_txt: activeTxt,
    releases
  };
}

module.exports = {
  GROUP_BIN,
  GROUP_TXT,
  applyActiveSelection,
  getActiveManifest,
  getGroupedView,
  inferGroupFromName,
  loadState,
  saveState,
  uploadFirmware
};
