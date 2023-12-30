/* global browser */

const manifest = browser.runtime.getManifest();
const extname = manifest.name;

const url_problem = "https://leetcode.com/problemset/"
const url_host = getHostname(url_problem);
const url_match = `https://${url_host}/`;

browser.runtime.onInstalled.addListener(doLeetCodeNag);
browser.runtime.onStartup.addListener(doLeetCodeNag);
browser.browserAction.onClicked.addListener(openLeetCodePage);
browser.browserAction.onClicked.addListener(() => { updateIcon(source = 'iconClicked'); });

// Periodic refresh
const randomDelay = Math.floor(Math.random() * 300000); // 0 to 5 minutes
const refreshInterval = 600000; // 10 minutes
setTimeout(() => {
    setInterval(() => {
        console.debug("Running periodic refresh");
        updateIcon();
    }, refreshInterval);
}, randomDelay);

// Helper functions
function getHostname(url) {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname;
    } catch (error) {
        console.error("Invalid URL:", error);
        return null;
    }
}

// Main functions
async function doLeetCodeNag() {
    // Check LeetCode completion status and update icon
    updateIcon()
    // Sleep for 3s
    await new Promise(resolve => setTimeout(resolve, 3000));
    // Check LeetCode completion status
    const isCompleted = await isLeetCodeCompleted()
    if (isCompleted) {
        console.debug("Today's submission already completed, exiting.");
        return;
    }

    // Open LeetCode page
    await openLeetCodePage();
}

function getLeetCodeUsername() {
    const cookieName = "LEETCODE_SESSION";

    return new Promise((resolve, reject) => {
        browser.cookies.get({ url: url_match, name: cookieName }).then(cookie => {
            if (!cookie) {
                console.debug("LEETCODE_SESSION cookie not found, we're not logged in.");
                resolve(null);  // Resolve with null or a specific value indicating no cookie
                return;
            }

            // Decode from Base64 and parse the JSON
            const parts = cookie.value.split('.');
            const decoded = atob(parts[1]);
            const sessionInfo = JSON.parse(decoded);

            // Extracting username (if it's in the JSON)
            const username = sessionInfo.username; // Adjust according to actual JSON structure
            if (!username) {
                throw new Error("Unexpected error: Unable to retrieve username from the session cookie. Has the cookie format changed?");
            }

            console.log("Retrieved username from cookie:", username);
            resolve(username);

        }).catch(error => {
            console.error("Error in getLeetCodeUsername:", error);
            reject(error.message || "Error processing cookie");
        });
    });
}

let submissionCountCache = {
    data: null,
    lastFetch: 0
};

function getLeetCodeSubmissionCount(username, cacheLifetimeSec = 600) {
    const apiUrl = `https://leetcode-stats-api.herokuapp.com/${username}`;
    const cacheLifetime = cacheLifetimeSec * 1000; // 10 minutes

    if (submissionCountCache.data &&
        (Date.now() - submissionCountCache.lastFetch < cacheLifetime)) {
        console.debug("Retrieving submission count from cache:", submissionCountCache.data);
        return Promise.resolve(submissionCountCache.data);
    }

    return fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error fetching data: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            console.debug("Retrieved user details from API:", data);
            const submissionCalendar = data.submissionCalendar;

            // Get today's date at midnight in Unix timestamp (seconds since Epoch)
            let today = new Date();
            today.setHours(0, 0, 0, 0);
            const epochAtMidnight = Math.floor(today.getTime() / 1000);

            // Check if there are submissions for today's date
            const submissionCount = submissionCalendar.hasOwnProperty(epochAtMidnight) ? submissionCalendar[epochAtMidnight] : 0;
            console.debug("Retrieved submission count for today:", submissionCount);

            // Update cache
            submissionCountCache = {
                data: submissionCount,
                lastFetch: Date.now()
            };

            return submissionCount;
        })
        .catch(error => {
            console.error('Error in getLeetCodeSubmissionCount:', error);
            throw error; // Re-throw the error for further handling if necessary
        });
}

async function isLeetCodeCompleted(cacheLifetimeSec = 600) {
    let submissionCount = 0;

    try {
        const username = await getLeetCodeUsername();
        if (username) {
            submissionCount = await getLeetCodeSubmissionCount(username, cacheLifetimeSec);
        }
    } catch (error) {
        console.debug("Unable to retrieve the submission count, assuming no submissions.", error);
    }

    if (submissionCount > 0) {
        console.debug("Already completed today's submission.");
        return true;
    }

    console.debug("No submissions made yet today.");
    return false;
}

async function openLeetCodePage() {
    // Search for an open LeetCode tab
    const tabs = await browser.tabs.query({ url: `${url_match}*` });

    if (tabs.length > 0) {
        console.debug("LeetCode tab already open, focusing tab: ", tabs[0].id);
        // Focus the window and tab where LeetCode is open
        await browser.windows.update(tabs[0].windowId, { focused: true });
        await browser.tabs.update(tabs[0].id, { active: true });
    } else {
        console.debug("Opening LeetCode in a new tab");
        // Open LeetCode in a new tab
        await browser.tabs.create({ url: url_problem });
    }
}


async function openLeetCodePageOld() {
    // Check if LeetCode page is already open
    let tmp = await browser.windows.getCurrent({ populate: false });
    let already_open_urls = new Set(
        (await browser.tabs.query({})).map((t) => t.url)
    );
    console.debug("Currently open urls: ", already_open_urls);

    if (already_open_urls.has(url)) {
        console.debug("Link already open, nothing to do: ", url);
        return;
    }

    // Open LeetCode page
    const winId = tmp.id;
    const createdTabIds = new Set();

    let first = true;

    tmp = await browser.tabs.create({
        windowId: winId,
        pinned: false,
        url: url,
        active: first,
    });
    first = false;
    createdTabIds.add(tmp.id);
}

let currentIcon = 'red';
async function updateIcon(source = null) {
    switch (source) {
        case 'iconClicked':
            cacheLifetimeSec = 60;
            console.debug("Icon clicked, setting cache lifetime to 60 seconds.");
            break;
        default:
            cacheLifetimeSec = 600;
    }

    const isCompleted = await isLeetCodeCompleted(cacheLifetimeSec);

    if (isCompleted && currentIcon !== 'gray') {
        // Set icon to gray
        browser.browserAction.setIcon({ path: "icons/icon-48-out.png" });
        currentIcon = 'gray';
    } else if (!isCompleted && currentIcon !== 'red') {
        // Set icon to red
        browser.browserAction.setIcon({ path: "icons/icon-48-fire.png" });
        currentIcon = 'red';
    }
}
