import Enquirer from "enquirer";
import Table from "cli-table3";
const { AutoComplete } = Enquirer;

/**
 * Displays a table of container ports.
 * @param {Array} portRows - Array of [containerName, portsString]
 */
export async function showPortsTable(portRows) {
  const table = new Table({
    head: ["Container Name", "Ports"],
    colWidths: [30, 60],
    style: { head: ["green"] },
    chars: { mid: "", "left-mid": "", "mid-mid": "", "right-mid": "" },
  });
  table.push(...portRows);
  console.log("\n" + table.toString());
}

/**
 * Returns choices for the container selection prompt.
 * @param {Object} containerMap
 * @returns {Array<{name: string, value: string}>}
 */
export function getContainerChoices(containerMap) {
  return [
    { name: "All", value: "All" },
    ...Object.keys(containerMap).map((name) => ({ name, value: name })),
  ];
}

/**
 * Prompts the user to select a container (or all).
 * @param {Object} containerMap
 * @returns {Promise<string>}
 */
export async function promptContainer(containerMap) {
  return new AutoComplete({
    name: "container",
    message: "Select a Docker container to retrieve its status:",
    choices: getContainerChoices(containerMap),
  }).run();
}

/**
 * Displays the results in a formatted table.
 * @param {Array} results
 * @param {Array<number>} colWidths
 */
export function showResults(results, colWidths) {
  const table = new Table({
    head: ["Container Name", "Public IP Address", "Location"],
    colWidths,
    style: { head: ["green"] },
    chars: { mid: "", "left-mid": "", "mid-mid": "", "right-mid": "" },
  });
  table.push(...results);
  console.log(table.toString());
}
