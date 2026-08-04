import type { LocalConnectRequest } from "./contracts";
import { LocalApiRequestError } from "./local-api";

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
      !hasExactKeys(value.capabilities, [
        "projectSnapshotSchemaVersions",
        "snapshotUpload",
      ])
    ) {
      details.push(
        "capabilities accepts only projectSnapshotSchemaVersions and snapshotUpload.",
      );
    }
    if (
      !Array.isArray(value.capabilities.projectSnapshotSchemaVersions) ||
      value.capabilities.projectSnapshotSchemaVersions.length !== 1 ||
      value.capabilities.projectSnapshotSchemaVersions[0] !== "1.0.0"
    ) {
      details.push("The scanner must support ProjectSnapshot 1.0.0.");
    }
    if (value.capabilities.snapshotUpload !== false) {
      details.push(
        "capabilities.snapshotUpload must be false because connect is a control-plane handshake; scan-upload uses the returned grant separately.",
      );
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

export async function sha256Digest(raw: string) {
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}
