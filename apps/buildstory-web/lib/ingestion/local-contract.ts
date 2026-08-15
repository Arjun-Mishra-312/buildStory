import type { LocalConnectRequest } from "./contracts";
import { LocalApiRequestError } from "./local-api";
import { LEGACY_PROJECT_SNAPSHOT_SCHEMA_VERSION, OLDEST_PROJECT_SNAPSHOT_SCHEMA_VERSION, PROJECT_SNAPSHOT_SCHEMA_VERSION } from "./scanner-project-snapshot";

/** Every ProjectSnapshot version this server still accepts at the upload boundary. See validation.ts. */
function acceptedSnapshotSchemaVersions(): readonly string[] {
  return process.env.NODE_ENV === "production"
    ? [PROJECT_SNAPSHOT_SCHEMA_VERSION]
    : [
        PROJECT_SNAPSHOT_SCHEMA_VERSION,
        LEGACY_PROJECT_SNAPSHOT_SCHEMA_VERSION,
        OLDEST_PROJECT_SNAPSHOT_SCHEMA_VERSION,
      ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  return (
    actual.length === allowed.length &&
    actual.every((key, index) => key === allowed[index])
  );
}

export function parseLocalConnectRequest(value: unknown): LocalConnectRequest {
  const details: string[] = [];
  if (!isRecord(value)) {
    throw new LocalApiRequestError(
      "invalid_connect_request",
      "The connection request must be a JSON object.",
      400,
    );
  }
  if (
    !hasExactKeys(value, [
      "protocolVersion",
      "uploadSessionId",
      "deviceCode",
      "client",
      "capabilities",
    ])
  ) {
    details.push("Only protocolVersion, uploadSessionId, deviceCode, client, and capabilities are accepted.");
  }
  if (value.protocolVersion !== "1.0") {
    details.push("protocolVersion must be 1.0.");
  }
  if (
    typeof value.uploadSessionId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value.uploadSessionId)
  ) {
    details.push("uploadSessionId must be copied exactly from the dashboard.");
  }
  if (
    typeof value.deviceCode !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._~-]{2,127}$/.test(value.deviceCode)
  ) {
    details.push("deviceCode must be copied exactly from the dashboard.");
  }

  if (!isRecord(value.client)) {
    details.push("client is required.");
  } else {
    if (!hasExactKeys(value.client, ["command", "version"])) {
      details.push("client accepts only command and version.");
    }
    if (value.client.command !== "buildstory") {
      details.push("client.command must be buildstory.");
    }
    if (
      typeof value.client.version !== "string" ||
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value.client.version)
    ) {
      details.push("client.version must be a semantic version.");
    }
  }

  if (!isRecord(value.capabilities)) {
    details.push("capabilities is required.");
  } else {
    if (
      !(
        hasExactKeys(value.capabilities, ["projectSnapshotSchemaVersions", "snapshotUpload"]) ||
        hasExactKeys(value.capabilities, ["projectSnapshotSchemaVersions", "snapshotUpload", "narrativeModes"])
      )
    ) {
      details.push(
        "capabilities accepts only projectSnapshotSchemaVersions and snapshotUpload.",
      );
    }
    const acceptedVersions = acceptedSnapshotSchemaVersions();
    if (
      !Array.isArray(value.capabilities.projectSnapshotSchemaVersions) ||
      value.capabilities.projectSnapshotSchemaVersions.length !== 1 ||
      typeof value.capabilities.projectSnapshotSchemaVersions[0] !== "string" ||
      !acceptedVersions.includes(value.capabilities.projectSnapshotSchemaVersions[0])
    ) {
      details.push(
        `The scanner must support ProjectSnapshot ${acceptedVersions.join(" or ")}.`,
      );
    }
    if (value.capabilities.snapshotUpload !== false) {
      details.push(
        "capabilities.snapshotUpload must be false because connect is a control-plane handshake; scan-upload uses the returned grant separately.",
      );
    }
    if ("narrativeModes" in value.capabilities && (
      !Array.isArray(value.capabilities.narrativeModes) ||
      value.capabilities.narrativeModes.length === 0 ||
      value.capabilities.narrativeModes.some((mode) => !["local", "byok", "cloud", "off"].includes(mode as string)) ||
      new Set(value.capabilities.narrativeModes).size !== value.capabilities.narrativeModes.length
    )) {
      details.push("capabilities.narrativeModes must be a unique non-empty list of local, byok, cloud, and/or off.");
    }
  }

  if (details.length) {
    throw new LocalApiRequestError(
      "invalid_connect_request",
      "The connection request does not match Buildstory protocol 1.0.",
      400,
      details,
    );
  }
  return value as LocalConnectRequest;
}

export function parseCliPairStartRequest(value: unknown): {
  protocolVersion: "1.0";
  client: { command: "buildstory"; version: string };
  projectLabel: string;
  narrativeMode: "local" | "byok" | "off";
} {
  const details: string[] = [];
  if (!isRecord(value)) {
    throw new LocalApiRequestError("invalid_pair_request", "The pairing request must be a JSON object.", 400);
  }
  if (!hasExactKeys(value, ["protocolVersion", "client", "projectLabel", "narrativeMode"])) {
    details.push("Only protocolVersion, client, projectLabel, and narrativeMode are accepted.");
  }
  if (value.protocolVersion !== "1.0") details.push("protocolVersion must be 1.0.");
  if (!isRecord(value.client)) {
    details.push("client is required.");
  } else {
    if (!hasExactKeys(value.client, ["command", "version"])) details.push("client accepts only command and version.");
    if (value.client.command !== "buildstory") details.push("client.command must be buildstory.");
    if (typeof value.client.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value.client.version)) {
      details.push("client.version must be a semantic version.");
    }
  }
  if (typeof value.projectLabel !== "string" || value.projectLabel.length < 1 || value.projectLabel.length > 120) {
    details.push("projectLabel must be 1-120 characters.");
  }
  if (value.narrativeMode !== "local" && value.narrativeMode !== "byok" && value.narrativeMode !== "off") {
    details.push("narrativeMode must be local, byok, or off.");
  }
  if (details.length) {
    throw new LocalApiRequestError("invalid_pair_request", "The pairing request does not match Buildstory protocol 1.0.", 400, details);
  }
  return value as {
    protocolVersion: "1.0";
    client: { command: "buildstory"; version: string };
    projectLabel: string;
    narrativeMode: "local" | "byok" | "off";
  };
}

export function parseCliPairPollRequest(value: unknown): { protocolVersion: "1.0"; pairingId: string } {
  const details: string[] = [];
  if (!isRecord(value)) {
    throw new LocalApiRequestError("invalid_pair_request", "The pairing poll must be a JSON object.", 400);
  }
  if (!hasExactKeys(value, ["protocolVersion", "pairingId"])) {
    details.push("Only protocolVersion and pairingId are accepted.");
  }
  if (value.protocolVersion !== "1.0") details.push("protocolVersion must be 1.0.");
  if (typeof value.pairingId !== "string" || !/^pair_[A-Za-z0-9]+$/.test(value.pairingId)) {
    details.push("pairingId must be copied exactly from the pairing start response.");
  }
  if (details.length) {
    throw new LocalApiRequestError("invalid_pair_request", "The pairing poll does not match Buildstory protocol 1.0.", 400, details);
  }
  return value as { protocolVersion: "1.0"; pairingId: string };
}

export async function sha256Digest(raw: string) {
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}
