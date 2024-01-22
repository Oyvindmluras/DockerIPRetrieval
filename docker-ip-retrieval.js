#!/usr/bin/env node

import Docker from "dockerode";
import Enquirer from "enquirer";
import Table from "cli-table3";

const { AutoComplete } = Enquirer;
const docker = new Docker();

const COL_WIDTH_NAME = 30;
const COL_WIDTH_IP = 35;

function getContainerName(container) {
  return container.Names[0].split("/")[1].split(":")[0];
}

function capitaliseString(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

async function executeCommandInContainer(containerId, command) {
  const exec = await docker.getContainer(containerId).exec({
    Cmd: command,
    AttachStdout: true,
    AttachStderr: true,
  });
  const { output } = await exec.start({ Detach: false }).then((stream) => {
    let output = "";
    stream.on("data", (chunk) => (output += chunk.toString()));
    return new Promise((resolve) =>
      stream.on("end", () => resolve({ output, exec }))
    );
  });
  const inspect = await exec.inspect();
  return {
    output: output.replace(/[^ -~]+/g, "").trim(),
    exitCode: inspect.ExitCode,
  };
}

async function getContainerPublicIP(containerId) {
  const command = [
    "sh",
    "-c",
    "wget -qO- ifconfig.me 2>/dev/null || curl -s ifconfig.me 2>/dev/null",
  ];
  return await executeCommandInContainer(containerId, command);
}

async function getContainerStatusOrIP(containerId) {
  const containerData = await docker.getContainer(containerId).inspect();
  let output = `Container ${containerData.State.Status}`;
  if (containerData.State.Running) {
    const result = await getContainerPublicIP(containerId);
    if (result.exitCode !== 0) {
      output = `Retrieval failed. Exit code ${result.exitCode}`;
    } else {
      output = result.output;
    }
  }
  return [containerData.Name.replace('/', ''), output];
}

async function getContainerNames(containers) {
  return containers.reduce((acc, container) => {
    const name = capitaliseString(getContainerName(container));
    acc[name] = container.Id;
    return acc;
  }, {});
}

async function getContainerChoices(containerNames) {
  const choices = Object.keys(containerNames).map((name) => ({
    name,
    value: name,
  }));
  choices.unshift({ name: "All", value: "All" });
  return choices;
}

async function getSelectedContainerName(choices) {
  return await new AutoComplete({
    name: "container",
    message: "Select a Docker container to retrieve its IP address:",
    choices,
  }).run();
}

async function getContainerResults(
  selectedContainerName,
  containers,
  containerNames
) {
  return selectedContainerName === "All"
    ? await Promise.all(
        containers.map((container) => getContainerStatusOrIP(container.Id))
      )
    : [await getContainerStatusOrIP(containerNames[selectedContainerName])];
}

async function displayContainerPublicIP(results) {
  const table = new Table({
    head: ["Container Name", "Public IP Address"],
    colWidths: [COL_WIDTH_NAME, COL_WIDTH_IP],
    style: { head: ["green"] },
    chars: { mid: "", "left-mid": "", "mid-mid": "", "right-mid": "" },
  });
  table.push(...results);
  console.log(table.toString());
}

async function getPublicIP() {
  try {
    const containers = await docker.listContainers({ all: true });
    const containerNames = await getContainerNames(containers);
    const choices = await getContainerChoices(containerNames);
    const selectedContainerName = await getSelectedContainerName(choices);
    const results = await getContainerResults(
      selectedContainerName,
      containers,
      containerNames
    );
    displayContainerPublicIP(results);
  } catch (error) {
    console.error(error);
  }
}

getPublicIP();
