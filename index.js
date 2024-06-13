const express = require("express");
const ping = require("ping");
const snmp = require("snmp-native");
const os = require("os");

const app = express();
const port = 3008;

// Get the local IP address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const interfaceName in interfaces) {
    const iface = interfaces[interfaceName];
    for (const alias of iface) {
      if (alias.family === "IPv4" && !alias.internal) {
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
function pingIp(ip, timeout = 2000) {
  return Promise.race([
    ping.promise.probe(ip),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), timeout)
    ),
  ]);
}

// Function to check if a device is a printer using SNMP with timeout
function checkIfPrinter(ip, timeout = 500) {
  return new Promise((resolve, reject) => {
    const session = new snmp.Session({ host: ip, community: "public" });
    const oid = [1, 3, 6, 1, 2, 1, 25, 3, 2, 1, 3]; // OID for hrDeviceType

    const timer = setTimeout(() => {
      session.close();
      reject(new Error("Timeout"));
    }, timeout);

    session.get({ oid: oid }, function (error, varbinds) {
      clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        const isPrinter =
          varbinds[0].value.toString() === "1.3.6.1.2.1.25.3.1.5"; // OID for printer
        resolve(isPrinter);
      }
      session.close();
    });
  });
}

// Function to scan the network
async function scanNetwork() {
  let devices = [];
  const start = 200;
  const end = 220;

  for (let i = start; i <= end; i++) {
    const ip = `${networkPrefix}${i}`;
    try {
      const res = await pingIp(ip);
      if (res && res.alive) {
        devices.push(ip);
      }
    } catch (error) {
      console.error(`Error pinging ${ip}:`, error);
    }
  }

  return devices;
}

// Endpoint to scan for printers
app.get("/scan", async (req, res) => {
  try {
    const devices = await scanNetwork();
    const printers = [];

    for (const ip of devices) {
      try {
        const isPrinter = await checkIfPrinter(ip);
        if (isPrinter) {
          printers.push(ip);
        }
      } catch (error) {
        console.error(`Error checking ${ip}:`, error);
      }
    }

    res.json({ printers });
  } catch (error) {
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