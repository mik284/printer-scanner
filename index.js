const express = require("express");
const app = express();
const escpos = require("escpos");
escpos.Network = require("escpos-network");

app.use(express.json()); // Middleware to parse JSON bodies

// Set up the printer connection
const device = new escpos.Network("192.168.1.100"); // Replace with your printer's IP address
const printer = new escpos.Printer(device, { encoding: "GBK" }); // Optional, but recommended for thermal printers

// Define a route to print a receipt
app.post("/print-receipt", (req, res) => {
  const receiptData = req.body; // Assume receipt data is sent in the request body

  // Create a print job
  const printJob = [
    { text: "Receipt Header", fontSize: 2, align: "center" },
    { text: "------------------------", fontSize: 1, align: "center" },
    {
      text: `Date: ${new Date().toLocaleDateString()}`,
      fontSize: 1,
      align: "left",
    },
    { text: `Order ID: ${receiptData.orderId}`, fontSize: 1, align: "left" },
    { text: "------------------------", fontSize: 1, align: "center" },
    { text: "Items:", fontSize: 1, align: "left" },
  ];

  receiptData.items.forEach((item) => {
    printJob.push({
      text: `${item.name} x ${item.quantity}`,
      fontSize: 1,
      align: "left",
    });
  });

  printJob.push({
    text: "------------------------",
    fontSize: 1,
    align: "center",
  });
  printJob.push({
    text: `Total: ${receiptData.total}`,
    fontSize: 1,
    align: "right",
  });
  printJob.push({
    text: "------------------------",
    fontSize: 1,
    align: "center",
  });
  printJob.push({
    text: "Thank you for your purchase!",
    fontSize: 1,
    align: "center",
  });

  // Send the print job to the printer
  device.open((error) => {
    if (error) {
      console.error("Failed to connect to the printer:", error);
      return res.status(500).send("Error connecting to printer");
    }

    // Process each item in the print job
    printJob.forEach((job) => {
      printer.align(job.align).size(job.fontSize, job.fontSize).text(job.text);
    });

    printer.cut().close(() => {
      res.send("Receipt printed successfully!");
    });
  });
});

app.listen(3000, () => {
  console.log("Server listening on port 3000");
});