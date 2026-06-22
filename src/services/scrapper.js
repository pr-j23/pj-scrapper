let browser = null;
let isScraping = false;
let browserOpen = false;
let scrapeInterval = null;
let page = null;

/**
 * Supported metals.
 */
const METALS = {
    GOLD: "gold",
    SILVER: "silver",
};

/**
 * Website selectors.
 */
const SELECTORS = {
    GOLD_PRICE: "#pid34",
    SILVER_PRICE: "#pid20",
    SPOT_GOLD: "#pid25",
    SPOT_SILVER: "#pid26",
    USD_INR: "#pid27",
};

/**
 * Weight conversion constants used by international bullion markets.
 *
 * Gold/Silver spot prices are quoted in USD per Troy Ounce.
 *
 * Gold  : USD/Troy Ounce -> INR/Gram
 * Silver: USD/Troy Ounce -> INR/Kilogram
 */
const GRAMS_PER_TROY_OUNCE = 31.1034768;
const TROY_OUNCES_PER_KILOGRAM = 32.1507466;

/**
 * Default response shape.
 */
const DEFAULT_RESPONSE = {
    gold_price: null,
    silver_price: null,
};

/**
 * Converts international spot prices into Indian market prices.
 */
const convertSpotToINR = (spotPriceUSD, usdInr, metal) => {
    const spotPrice = Number(spotPriceUSD);
    const exchangeRate = Number(usdInr);

    if (Number.isNaN(spotPrice) || Number.isNaN(exchangeRate)) {
        return null;
    }

    const spotPriceInINRPerTroyOunce = spotPrice * exchangeRate;

    switch (metal) {
        case METALS.GOLD:
            return (
                spotPriceInINRPerTroyOunce / GRAMS_PER_TROY_OUNCE
            ).toFixed(2);

        case METALS.SILVER:
            return (
                spotPriceInINRPerTroyOunce * TROY_OUNCES_PER_KILOGRAM
            ).toFixed(2);

        default:
            return null;
    }
};

function isBrowserOpen() {
    return browser && browser.process() && !browser.process().killed;
}

// Create page
export const createPage = async () => {
    if (isScraping) {
        console.error("Cannot scrape: Already scraping Running!");
        return null;
    }

    if (!isBrowserOpen()) {
        console.error("Cannot scrape: Browser not ready!");
        return null;
    }

    isScraping = true;

    try {
        page = await browser.newPage();

        await page.goto(
            process.env.Scrapper_URL ||
                "https://www.manokamanagold.com/default.aspx",
            {
                timeout: 60000,
                waitUntil: "domcontentloaded",
            }
        );

        console.log("Page Created & Running...");
    } catch (error) {
        if (error.message.includes("Connection closed")) {
            console.error("Browser connection closed. Restarting browser...");
            await closeBrowser();
            await startBrowser();
        } else {
            console.error("Scraping error:", error);
        }

        return null;
    }
};

// Scrape Data
export const scrapeData = async () => {
    try {
        const scrapedData = await page?.evaluate((selectors) => {
            const getValue = (selector) =>
                document.querySelector(selector)?.innerText?.trim() ?? null;

            return {
                // Direct values from website
                goldPrice: getValue(selectors.GOLD_PRICE),
                silverPrice: getValue(selectors.SILVER_PRICE),

                // Fallback values
                spotGold: getValue(selectors.SPOT_GOLD),
                spotSilver: getValue(selectors.SPOT_SILVER),
                usdInr: getValue(selectors.USD_INR),
            };
        }, SELECTORS);

        if (!scrapedData) {
            return DEFAULT_RESPONSE;
        }

        let {
            goldPrice,
            silverPrice,
            spotGold,
            spotSilver,
            usdInr,
        } = scrapedData;

        const cleanNumber = (value) =>
            Number(String(value).replace(/,/g, "").trim());

        const isMissingValue = (value) =>
            value === null ||
            value === undefined ||
            value === "" ||
            value === "--";

        /**
         * Gold fallback:
         * If pid34 is empty, calculate using Spot Gold + USDINR.
         */
        if (
            isMissingValue(goldPrice) &&
            !isMissingValue(spotGold) &&
            !isMissingValue(usdInr)
        ) {
            goldPrice = convertSpotToINR(
                cleanNumber(spotGold),
                cleanNumber(usdInr),
                METALS.GOLD
            );
        }

        /**
         * Silver fallback:
         * If pid20 is empty, calculate using Spot Silver + USDINR.
         */
        if (
            isMissingValue(silverPrice) &&
            !isMissingValue(spotSilver) &&
            !isMissingValue(usdInr)
        ) {
            silverPrice = convertSpotToINR(
                cleanNumber(spotSilver),
                cleanNumber(usdInr),
                METALS.SILVER
            );
        }

        return {
            gold_price: goldPrice ?? null,
            silver_price: silverPrice ?? null,
        };
    } catch (error) {
        if (error.message.includes("Connection closed")) {
            console.error("Browser connection closed. Restarting browser...");
            await closeBrowser();
        } else {
            console.error("Scraping error:", error);
            console.error(error.stack);
        }

        return DEFAULT_RESPONSE;
    }
};

// Start Browser
export const startBrowser = async (puppeteer) => {
    if (!browserOpen) {
        console.log("Starting browser...");

        browser = await puppeteer.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--single-process",
                "--no-zygote",
            ],
        });

        browserOpen = true;
    }
};

// Close Browser
export const closeBrowser = async () => {
    if (browserOpen && browser) {
        console.log("Closing browser...");

        await browser.close();

        browser = null;
        browserOpen = false;
    }
};

// Start Scraping
export const startScraping = async (wss) => {
    if (scrapeInterval || isScraping) {
        return;
    }

    console.log("Start Scrapping....");

    await createPage();

    scrapeInterval = setInterval(async () => {
        const data = await scrapeData();

        if (data) {
            wss.clients.forEach((client) => {
                client.send(JSON.stringify(data));
            });
        }
    }, process.env.Scrapping_Interval || 60000);
};

// Stop Scraping
export const stopScraping = async () => {
    if (scrapeInterval) {
        clearInterval(scrapeInterval);

        scrapeInterval = null;

        if (page) {
            await page.close();
        }

        page = null;
        isScraping = false;
    }
};