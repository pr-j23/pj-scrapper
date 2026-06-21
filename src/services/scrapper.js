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
 * Converts international spot prices (USD/Troy Ounce)
 * into Indian market prices (INR).
 */
const convertSpotToINR = (spotPriceUSD, usdInr, metal) => {
    const spotPrice = Number(spotPriceUSD);
    const exchangeRate = Number(usdInr);

    if (Number.isNaN(spotPrice) || Number.isNaN(exchangeRate)) {
        return null;
    }

    // Convert USD/Troy Ounce -> INR/Troy Ounce
    const spotPriceInINRPerTroyOunce = spotPrice * exchangeRate;

    switch (metal) {
        case METALS.GOLD:
            // Gold is quoted per gram in India
            return (
                spotPriceInINRPerTroyOunce / GRAMS_PER_TROY_OUNCE
            ).toFixed(2);

        case METALS.SILVER:
            // Silver is quoted per kilogram in India
            return (
                spotPriceInINRPerTroyOunce * TROY_OUNCES_PER_KILOGRAM
            ).toFixed(2);

        default:
            return null;
    }
};

export const scrapeData = async () => {
    try {
        const scrapedData = await page?.evaluate((selectors) => {
            /**
             * Safely reads text content from an element.
             */
            const getValue = (selector) =>
                document.querySelector(selector)?.innerText?.trim() ?? null;

            return {
                /**
                 * Primary values displayed on the website.
                 * These are preferred whenever available.
                 */
                goldPrice: getValue(selectors.GOLD_PRICE),
                silverPrice: getValue(selectors.SILVER_PRICE),

                /**
                 * Fallback values used when primary values
                 * are unavailable.
                 */
                spotGold: getValue(selectors.SPOT_GOLD),
                spotSilver: getValue(selectors.SPOT_SILVER),
                usdInr: getValue(selectors.USD_INR),
            };
        }, SELECTORS);

        if (!scrapedData) {
            return null;
        }

        let {
            goldPrice,
            silverPrice,
            spotGold,
            spotSilver,
            usdInr,
        } = scrapedData;

        /**
         * Converts values like:
         * "4,320.79" -> 4320.79
         */
        const cleanNumber = (value) =>
            Number(String(value).replace(/,/g, "").trim());

        /**
         * Determines whether a scraped value
         * should be considered missing.
         */
        const isMissingValue = (value) =>
            value === null ||
            value === undefined ||
            value === "" ||
            value === "--";

        /**
         * Fallback Gold Calculation
         *
         * If the website gold price is unavailable,
         * calculate it from Spot Gold + USD/INR.
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
         * Fallback Silver Calculation
         *
         * If the website silver price is unavailable,
         * calculate it from Spot Silver + USD/INR.
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

        /**
         * Return final prices.
         *
         * Values may come directly from the website
         * or from fallback calculations.
         */
        return {
            gold_price: goldPrice,
            silver_price: silverPrice,
        };
    } catch (error) {
        if (error.message.includes("Connection closed")) {
            console.error("Browser connection closed. Restarting browser...");
            await closeBrowser();
            await startBrowser();
        } else {
            console.error("Scraping error:", error);
            console.error(error.stack);
        }

        return null;
    }
};