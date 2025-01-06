let browser = null;
let isScraping = false;
let browserOpen = false;
let scrapeInterval = null;
let page = null;

function isBrowserOpen() {
    return browser && browser.process() && !browser.process().killed;
}

// Scraping function 
export const createPage = async () => {
    if (isScraping) {
        console.error('Cannot scrape: Already scraping Running!');
        return null;
    }
    if (!isBrowserOpen()) {
        console.error('Cannot scrape: Browser not ready!');
        return null;
    }

    isScraping = true;

    try {
        page = await browser.newPage();
        await page.goto(process.env.Scrapper_URL || "https://www.manokamanagold.com/default.aspx", { timeout: 60000, waitUntil: 'domcontentloaded' });
        console.log("Page Created & Running...")
        
    } catch (error) {
        if (error.message.includes('Connection closed')) {
            console.error('Browser connection closed. Restarting browser...');
            await closeBrowser();
            await startBrowser();
        } else {
            console.error('Scraping error:', error);
        }
        return null;
    }
}

export const scrapeData = async () => {
    try {
        // Scraping logic
        const data = await page?.evaluate(() => {
            const element25 = document.querySelector('#pid25');
            const element26 = document.querySelector('#pid26');

            return {
                gold_price: element25 ? element25.innerText.trim() : null,
                silver_price: element26 ? element26.innerText.trim() : null,
            };
        });

        return data;
    } catch (error) {
        if (error.message.includes('Connection closed')) {
            console.error('Browser connection closed. Restarting browser...');
            await closeBrowser();
            await startBrowser();
        } else {
            console.error('Scraping error:', error);
        }
        return null;
    } 
}

export const startBrowser = async (puppeteer) => {
    if (!browserOpen) {
        console.log('Starting browser...');
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                "--single-process",
                "--no-zygote"
            ],
        });
        browserOpen = true;
    }
}

export const closeBrowser = async () => {
    if (browserOpen && browser) {
        console.log('Closing browser...');
        await browser.close();
        browser = null;
        browserOpen = false;
    }
}

export const startScraping = async (wss) => {

    if (scrapeInterval || isScraping) return;
    console.log("Start Scrapping....")
    await createPage();

    scrapeInterval = setInterval(async () => {
        const data = await scrapeData();
        if (data) {
            wss.clients.forEach((client) => {
                client.send(JSON.stringify(data))
            })
        }
    }, process.env.Scrapping_Interval || 60000);
}

export const stopScraping = async () => {
    if (scrapeInterval) {
        clearInterval(scrapeInterval);
        scrapeInterval = null;
        if (page) await page.close();
        isScraping = false;
    }
}