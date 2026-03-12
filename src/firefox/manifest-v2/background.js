const menuitemid_CopyJiraURL = "copy-jira-url";

// background.js
console.log("background.js loaded in service worker");

let api, scripting;
if (typeof browser !== "undefined") {
    api = browser;
    scripting = browser.scripting;
    if (!scripting) {
        scripting = browser.tabs;
    }
    console.debug("Using browser API");
} else if (typeof chrome !== "undefined") {
    api = chrome;
    scripting = chrome.scripting;
    console.debug("Using Chrome API");
}



// Create context menu item - Firefox
browser.contextMenus.remove(menuitemid_CopyJiraURL).catch(() => {}).then(() => {
    return browser.contextMenus.create({
        id: menuitemid_CopyJiraURL,
        title: "Copy URL for Jira",
        contexts: ["page", "link"] // page is for the URL to show on context menu of the page, link is for context menu on links
    });
}).then(() => {
    console.debug('Context menu created successfully');
}).catch((error) => {
    console.error('Error with context menu:', error);
});

// Listen for context menu clicks - Firefox
browser.contextMenus.onClicked.addListener((info, tab) => {
    console.debug("Context menu clicked:", info.menuItemId, info.linkUrl, "Tab ID:", tab.id);
    console.debug(`Menu item ID: ${info.menuItemId}, Link URL: ${info.linkUrl}, Page URL: ${info.pageUrl}`);
    if (info.menuItemId === menuitemid_CopyJiraURL && (info.linkUrl || info.pageUrl)) {
        console.debug("Executing script on tab:", tab.id);
        let newURL = info.linkUrl || info.pageUrl; // Default to linkUrl, fallback to pageUrl
        // Execute script in the tab to parse JSON and return it
        // On Firefox chrome.scripting is undefined
        browser.tabs.executeScript(tab.id, {
            code: `document.documentElement.outerHTML`
        }, (results) => {
            console.debug('Callback called, results:', results, 'lastError:', browser.runtime.lastError);
            console.debug('Original URL from context menu:', newURL);
            if (browser.runtime.lastError) {
                console.error('Execute script error:', browser.runtime.lastError);
            } else if (results && results[0]) {
                const HTML = results[0];
                // console.debug('HTML retrieved from tab:', HTML.substring(0, 500));  // Log first 500 chars to avoid overflow
                // Parse the HTML to extract JSON

                const parser = new DOMParser();
                const doc = parser.parseFromString(HTML, 'text/html');
                const jsonDiv = doc.querySelector('div#jsonPayload');
                if (jsonDiv) {
                    try {
                        const jsonData = JSON.parse(jsonDiv.textContent);
                        console.debug('Parsed JSON from jsonPayload:', jsonData);
                        const URL = jsonData.reqDetails.issueLinkUrl; // https://embt.atlassian.net/.../RSB-xxxx
                        const issueID = jsonData.reqDetails.issue.key; // RSB-xxxx
                        const summary = jsonData.reqDetails.issue.summary; // Summary text
                        newURL = `[${issueID}: ${summary}](${URL})`;
                        console.debug(`Formatted Jira URL: "${newURL}"`);
                    } catch (e) {
                        console.error('Failed to parse JSON from jsonPayload:', e);
                    }
                } else {
                    console.debug('Div with id jsonPayload not found in HTML');
                }
            } else {
                console.debug('No results');
            }

            let url = newURL;
            console.debug('Copying Jira URL to clipboard:', url);

            browser.tabs.executeScript(tab.id, {
                code: `navigator.clipboard.writeText("${url}").then(() => console.debug('URL "${url}" copied to clipboard')).catch(err => console.error('Failed to copy URL:', err))`
            });

        });

    }
});