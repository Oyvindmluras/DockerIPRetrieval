// Docker IP Retrieval CLI
// Retrieves and displays IP addresses of running Docker containers.


import { isDockerRunning, getContainerStatus, getContainerMap, getContainerPorts } from "./src/utils.js";
import { promptContainer, showResults, showPortsTable } from "./src/ui.js";


const COL_WIDTHS = [30, 35, 40];
const VERSION = "1.2.0";

/**
 * Lists the ports used by each Docker container.
 * @param {Object} containerMap
 */
async function listContainerPorts(containerMap) {
  const entries = Object.entries(containerMap);
  if (!entries.length) {
    console.log("No Docker containers found.");
    return;
  }
  const portRows = [];
  for (const [name, id] of entries) {
    try {
      const ports = await getContainerPorts(id);
      portRows.push([
        name,
        ports.length ? ports.join("\n") : "No ports exposed"
      ]);
    } catch (err) {
      portRows.push([name, `Error retrieving ports (${err.message || err})`]);
    }
  }
  showPortsTable(portRows);
}

/**
 * Prompts user to select containers and retrieves their status.
 * @param {Object} containerMap - Map of container names to IDs.
 * @returns {Promise<Array>} Array of container status objects.
 */
async function getSelectedContainerResults(containerMap) {
  try {
    const selected = await promptContainer(containerMap);
    const ids = Object.values(containerMap);
    if (selected === "All") {
      return Promise.all(ids.map(getContainerStatus));
    }
    return [await getContainerStatus(containerMap[selected])];
  } catch (err) {
    console.error("Prompt failed:", err.message || err);
    process.exit(1);
  }
}

/**
 * Main entry point for the CLI.
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("-v") || args.includes("--version")) {
    console.log(`Docker IP Retrieval version: ${VERSION}`);
    return;
  }

  if (!(await isDockerRunning())) {
    console.log("Docker is not running or not detected. Please ensure Docker is installed and running.");
    process.exit(1);
  }

  try {
    const containerMap = await getContainerMap();
    if (!Object.keys(containerMap).length) {
      console.log("No Docker containers found.");
      return;
    }

    if (args.includes("--ports") || args.includes("-p")) {
      await listContainerPorts(containerMap);
      return;
    }

    const results = await getSelectedContainerResults(containerMap);
    showResults(results, COL_WIDTHS);
  } catch (error) {
    console.error("Unexpected error:", error.message || error);
    process.exit(1);
  }
}

main();
