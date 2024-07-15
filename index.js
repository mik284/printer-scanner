const express = require("express");
const ping = require("ping");
const snmp = require("net-snmp");
const os = require("os");
const util = require("util");

const app = express();
const port = 3008;

// Get the local IP address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const interfaceName in interfaces) {
    const iface = interfaces[interfaceName];
    for (const alias of iface) {
      if (
        alias.family === "IPv4" &&
        !alias.internal &&
        alias.address.startsWith("192.168.")
      ) {
        return alias.address;
      }
    }
  }
  throw new Error("No active network interface found.");
}

const localIp = getLocalIp();
console.log(localIp);
const networkPrefix = localIp.substring(0, localIp.lastIndexOf(".") + 1);

// Function to ping a single IP with timeout
async function pingIp(ip, timeout = 2000) {
  try {
    const res = await ping.promise.probe(ip, { timeout: timeout / 1000 });
    return res.alive;
  } catch (error) {
    console.error(`Error pinging ${ip}:`, error);
    return false;
  }
}

// Async function to check if a device is a printer using SNMP with timeout
async function checkIfPrinter(ip, timeout = 20000) {
  console.log("Checking:", ip);

  const session = snmp.createSession(ip, "public", { version: snmp.Version2c });
  const oid = "1.3.6.1.2.1.25.3.2.1.3"; // OID for hrDeviceType
  const getAsync = util.promisify(session.get.bind(session));

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Timeout"));
    }, timeout);
  });

  try {
    const varbinds = await Promise.race([getAsync([oid]), timeoutPromise]);
    clearTimeout(timer);
    const isPrinter = varbinds[0].value.toString() === "1.3.6.1.2.1.25.3.1.5"; // OID for printer
    return isPrinter;
  } catch (error) {
    console.error(`Error checking ${ip}:`, error);
    return false;
  } finally {
    session.close();
  }
}

// Function to scan the network in batches
async function scanNetwork() {
  const devices = [];
  const start = 1;
  const end = 20; // Scan the full range of possible addresses
  const batchSize = 20;

  for (let i = start; i <= end; i += batchSize) {
    const batchPromises = [];
    for (let j = 0; j < batchSize && i + j <= end; j++) {
      const ip = `${networkPrefix}${i + j}`;
      batchPromises.push(pingIp(ip).then((isAlive) => (isAlive ? ip : null)));
    }

    const results = await Promise.allSettled(batchPromises);
    devices.push(
      ...results
        .filter(
          (result) => result.status === "fulfilled" && result.value !== null
        )
        .map((result) => result.value)
    );
  }

  return devices;
}

// Endpoint to scan for printers
app.get("/scan", async (req, res) => {
  try {
    const devices = await scanNetwork();
    const printers = [];

    for (const ip of devices) {
      const isPrinter = await checkIfPrinter(ip);
      if (isPrinter) {
        printers.push(ip);
      }
    }

    res.json({ printers });
  } catch (error) {
    console.error(`Error scanning network:`, error);
    res.status(500).send("Error scanning network");
  }
});

// Define a simple route
app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
