const express = require('express');
const { createServer } = require('http');
const WebSocket = require('ws');
const puppeteer = require('puppeteer');
const { startBrowser, startScraping, closeBrowser, stopScraping, scrapeData } = require('./src/services/scrapper');
const health = require("./src/routes/healthCheck")

const app = express();
const httpServer = createServer(app);

const wss = new WebSocket.Server({ server: httpServer })

let browserClosing = null;

wss.on('connection', async (ws) => {
  console.log('Client connected! =>', wss.clients.size);
  clearInterval(browserClosing);

  if (wss.clients.size) {
    await startBrowser(puppeteer);
    await startScraping(wss);
    const initialData = await scrapeData();
    wss.clients.forEach((client) => {
      client.send(JSON.stringify(initialData))
    })
  }

  ws.on('message', (message) => {
    console.log('Received message:', message)
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message)
      }
    })
  })
  ws.on('close', async () => {
    console.log('Client disconnected! =>', wss.clients.size)
    if (!wss.clients.size) {
      stopScraping();

      console.log('Waiting for scraping to complete...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      browserClosing = setTimeout(() => {
        if (!wss.clients.size) {
          closeBrowser();
        }
      }, 5000);
    }
  })
})

app.use(express.json())

app.use(health)

app.get("/api/v1/get_price", async (req, res) => {

  let data = null;
  try {
    if (wss.clients.size) {
      data = await scrapeData();
    }
    else {
      await startBrowser(puppeteer);
      await startScraping(wss);
      data = await scrapeData();
      await stopScraping()
      await closeBrowser();
    }
  } catch (err) {
    await stopScraping();
    await closeBrowser();
    return res.status(400).send({
      status: 'error',
      message: 'Something went wrong!'
    })
  }

  return res.status(200).send({
    status: 'success',
    message: 'Prices Data succesfully fetched!',
    data
  })
})

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});