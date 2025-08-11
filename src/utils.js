import Docker from "dockerode";
import fetch from "node-fetch";
const docker = new Docker();

/**
 * Gets the exposed ports for a Docker container.
 * @param {string} containerId
 * @returns {Promise<string[]>}
 */
export async function getContainerPorts(containerId) {
  if (!containerId || typeof containerId !== "string") {
    throw new Error("Invalid containerId provided to getContainerPorts");
  }
  try {
    const data = await docker.getContainer(containerId).inspect();
    const ports = data?.NetworkSettings?.Ports || {};
    // Format: { "80/tcp": [{ HostIp: "0.0.0.0", HostPort: "8080" }], ... }
    return Object.entries(ports)
      .map(([containerPort, bindings]) => {
        if (!bindings || !Array.isArray(bindings) || !bindings.length)
          return null;
        return bindings
          .map((b) => `${b.HostIp}:${b.HostPort}->${containerPort}`)
          .join(", ");
      })
      .filter(Boolean);
  } catch (err) {
    throw new Error(
      `Failed to get ports for container ${containerId}: ${err.message || err}`
    );
  }
}

/**
 * Checks if Docker is running and accessible.
 * @returns {Promise<boolean>}
 */
export async function isDockerRunning() {
  try {
    await docker.ping();
    return true;
  } catch (err) {
    if (process.env.DEBUG) {
      console.error("[DEBUG] Docker ping failed:", err.message || err);
    }
    return false;
  }
}

/**
 * Runs a command inside a Docker container.
 * @param {string} containerId
 * @param {string[]} command
 * @returns {Promise<{output: string, exitCode: number}>}
 */
export async function runCommand(containerId, command) {
  if (!containerId || typeof containerId !== "string") {
    throw new Error("Invalid containerId provided to runCommand");
  }
  if (!Array.isArray(command)) {
    throw new Error("Command must be an array of strings");
  }
  try {
    const exec = await docker.getContainer(containerId).exec({
      Cmd: command,
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({ Detach: false });
    let output = "";
    for await (const chunk of stream) {
      output += chunk.toString();
    }
    return {
      output: output.replace(/[^ -~]+/g, "").trim(),
      exitCode: (await exec.inspect()).ExitCode,
    };
  } catch (err) {
    throw new Error(
      `Failed to run command in container ${containerId}: ${err.message || err}`
    );
  }
}

/**
 * Gets the OS type of a Docker container.
 * @param {string} containerId
 * @returns {Promise<string>}
 */
export async function getContainerOsType(containerId) {
  if (!containerId || typeof containerId !== "string") {
    throw new Error("Invalid containerId provided to getContainerOsType");
  }
  try {
    const containerData = await docker.getContainer(containerId).inspect();
    return containerData?.Os?.toLowerCase?.() || "linux";
  } catch (err) {
    throw new Error(
      `Failed to get OS type for container ${containerId}: ${
        err.message || err
      }`
    );
  }
}

/**
 * Returns a map of container names to IDs for all containers.
 * @returns {Promise<Object>}
 */
export async function getContainerMap() {
  try {
    const containers = await docker.listContainers({ all: true });
    return Object.fromEntries(
      containers.map(({ Names, Id }) => [
        Names?.[0]?.replace("/", "") || "Unknown",
        Id,
      ])
    );
  } catch (err) {
    throw new Error(`Failed to list Docker containers: ${err.message || err}`);
  }
}

/**
 * Gets the status and public IP/location for a container.
 * @param {string} containerId
 * @returns {Promise<[string, string, string]>}
 */
export async function getContainerStatus(containerId) {
  if (!containerId || typeof containerId !== "string") {
    throw new Error("Invalid containerId provided to getContainerStatus");
  }
  try {
    const containerData = await docker.getContainer(containerId).inspect();
    const name = containerData.Name
      ? containerData.Name.replace("/", "")
      : "Unknown Container";
    if (!containerData.State.Running) {
      return [name, `Container ${containerData.State.Status}`, "Unknown"];
    }
    const ip = await getPublicIP(runCommand, getContainerOsType)(containerId);
    return [
      name,
      ip ?? "Retrieval failed",
      ip ? await getLocation(ip) : "Unknown",
    ];
  } catch (err) {
    throw new Error(
      `Failed to get status for container ${containerId}: ${err.message || err}`
    );
  }
}

/**
 * Returns a function to get the public IP of a container.
 * @param {Function} runCommand
 * @param {Function} getContainerOsType
 * @returns {Function}
 */
export function getPublicIP(runCommand, getContainerOsType) {
  return async (containerId) => {
    if (!containerId || typeof containerId !== "string") {
      throw new Error("Invalid containerId provided to getPublicIP");
    }
    const osType = await getContainerOsType?.(containerId);
    const curlCmd = "curl -s https://api.ipify.org";
    const cmd = osType.includes("win")
      ? curlCmd.split(" ")
      : ["sh", "-c", curlCmd];
    const { output, exitCode } = await runCommand(containerId, cmd);
    if (exitCode === 0 && /^[0-9.]+$/.test(output.trim())) {
      return output.trim();
    }
    return null;
  };
}

/**
 * Gets the geolocation for an IP address.
 * @param {string} ip
 * @returns {Promise<string>}
 */
export async function getLocation(ip) {
  if (!ip || typeof ip !== "string") {
    throw new Error("Invalid IP address provided to getLocation");
  }
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}`);
    const data = await response.json();
    if (data.status === "fail") return "Unknown";
    return `${data.country}, ${data.city}`;
  } catch (err) {
    if (process.env.DEBUG) {
      console.error(
        `[DEBUG] Failed to get location for IP ${ip}:`,
        err.message || err
      );
    }
    return "Lookup Failed";
  }
}
