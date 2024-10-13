const puppeteer = require('puppeteer-core');
const chrome = require('chrome-aws-lambda');
const express = require('express');
const bodyParser = require('body-parser');
const Joi = require('joi');
const cors = require('cors');

// Create an express app
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Validate request body
const validateRequest = (req) => {
    const schema = Joi.object({
        imageUrl: Joi.string().uri().required(),
        no_cache: Joi.boolean() // Optional boolean parameter
    });
    return schema.validate(req.body);
};

// Function to launch a browser instance
let browserPromise = null;
const getBrowser = async () => {
    if (!browserPromise) {
        browserPromise = puppeteer.launch({
            args: chrome.args,
            executablePath: await chrome.executablePath,
            headless: chrome.headless,
        });
    }
    return browserPromise;
};

// Extract related sources from the search results
const extractRelatedSources = async (page) => {
    return page.evaluate(() => {
        const sourceList = [];
        const elements = document.querySelectorAll('li.anSuc a.GZrdsf');

        elements.forEach((element, index) => {
            const title = element.querySelector('.iJmjmd') ? element.querySelector('.iJmjmd').innerText.trim() : null;
            const source = element.querySelector('.ShWW9') ? element.querySelector('.ShWW9').innerText.trim() : null;
            const sourceLogo = element.querySelector('.RpIXBb img') ? element.querySelector('.RpIXBb img').src : null;
            const link = element.href;
            const thumbnail = element.querySelector('.GqnSBe img') ? element.querySelector('.GqnSBe img').src : null;
            const dimensions = element.querySelector('.QJLLAc') ? element.querySelector('.QJLLAc').innerText.trim() : null;

            let actualImageWidth = null;
            let actualImageHeight = null;
            if (dimensions) {
                const dimensionParts = dimensions.split('x');
                if (dimensionParts.length === 2) {
                    actualImageWidth = parseInt(dimensionParts[0], 10);
                    actualImageHeight = parseInt(dimensionParts[1], 10);
                }
            }

            sourceList.push({
                position: index + 1,
                title: title,
                source: source,
                source_logo: sourceLogo,
                link: link,
                thumbnail: thumbnail,
                actual_image_width: actualImageWidth,
                actual_image_height: actualImageHeight
            });
        });

        return sourceList;
    });
};

// Upload image and get sources from Google Lens
const uploadImageAndGetSources = async (imageUrl) => {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        const lensUrl = 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(imageUrl);
        await page.goto(lensUrl, { waitUntil: 'domcontentloaded' });

        // Wait for the results to appear
        await page.waitForSelector('li.anSuc a.GZrdsf', { timeout: 30000 });

        const relatedSources = await extractRelatedSources(page);
        return relatedSources;
    } catch (error) {
        console.error('Error during image processing:', error);
        throw new Error('Error during image processing');
    } finally {
        await page.close();
    }
};

// Express API endpoint

// Root endpoint
app.get("/", (req, res) => res.send("Server is running..."));

app.post('/api/upload', async (req, res) => {
    const { error } = validateRequest(req);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    const { imageUrl } = req.body;

    try {
        const sources = await uploadImageAndGetSources(imageUrl);
        res.json({ image_sources: sources });
    } catch (error) {
        res.status(500).json({ error: 'An error occurred while processing the image' });
    }
});

// Export the Express app as a Vercel serverless function
module.exports = app;
