#!/usr/bin/env node

import Docker from "dockerode";
import Enquirer from "enquirer";
import Table from "cli-table3";
import fetch from "node-fetch";
import { readFileSync } from "fs";

const docker = new Docker();
const { AutoComplete } = Enquirer;
const COL_WIDTHS = [30, 35, 40];

function getAppVersion() {
  try {
    const packageJson = JSON.parse(readFileSync("./package.json", "utf8"));
    return packageJson.version || "Unknown Version";
  } catch {
    return "Unknown Version";
  }
}

async function isDockerRunning() {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

async function runCommand(containerId, command) {
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
}

async function getPublicIP(containerId) {
  const { output, exitCode } = await runCommand(containerId, [
    "sh",
    "-c",
    "curl -s https://api.ipify.org || wget -qO- https://api.ipify.org",
  ]);
  return exitCode === 0 && /^[0-9.]+$/.test(output) ? output : null;
}

async function getLocation(ip) {
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}`);
    const data = await response.json();
    return data.status === "fail" ? "Unknown" : `${data.country}, ${data.city}`;
  } catch {
    return "Lookup Failed";
  }
}

async function getContainerStatus(containerId) {
  const containerData = await docker.getContainer(containerId).inspect();
  const name = containerData.Name ? containerData.Name.replace("/", "") : "Unknown Container";
  if (!containerData.State.Running) {
    return [name, `Container ${containerData.State.Status}`, "Unknown"];
  }
  const ip = await getPublicIP(containerId);
  return [name, ip ?? "Retrieval failed", ip ? await getLocation(ip) : "Unknown"];
}

async function mapContainers(containers) {
  return Object.fromEntries(
    containers.map(({ Names, Id }) => [Names?.[0]?.replace("/", "") || "Unknown", Id])
  );
}

async function getContainerChoices(containerMap) {
  return [
    { name: "All", value: "All" },
    ...Object.keys(containerMap).map((name) => ({ name, value: name })),
  ];
}

async function fetchContainerResults(selectedContainer, containers, containerMap) {
  return selectedContainer === "All"
    ? Promise.all(containers.map(({ Id }) => getContainerStatus(Id)))
    : [await getContainerStatus(containerMap[selectedContainer])];
}

function showResults(results) {
  const table = new Table({
    head: ["Container Name", "Public IP Address", "Location"],
    colWidths: COL_WIDTHS,
    style: { head: ["green"] },
    chars: { mid: "", "left-mid": "", "mid-mid": "", "right-mid": "" },
  });
  table.push(...results);
  console.log(table.toString());
}

async function checkDockerStatus() {
  const args = process.argv.slice(2);
  if (args.includes("-v")) {
    console.log(`Version: ${getAppVersion()}`);
    return;
  }
  if (!(await isDockerRunning())) {
    console.log("Docker not detected.");
    return;
  }

  try {
    const containers = await docker.listContainers({ all: true });
    const containerMap = await mapContainers(containers);

    const selectedContainer = await new AutoComplete({
      name: "container",
      message: "Select a Docker container to retrieve its status:",
      choices: await getContainerChoices(containerMap),
    }).run();

    showResults(await fetchContainerResults(selectedContainer, containers, containerMap));
  } catch (error) {
    console.error("Error fetching container data:", error);
  }
}

checkDockerStatus();
