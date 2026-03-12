// Written by CheeWee Chua,
// Singapore, 
// 14-15 Feb 2026

const menuitemid_CopyJiraMarkdown = "copy-jira-url-for-markdown";
const menuitemid_CopyJiraHTML = "copy-jira-url-for-HTML";

// background.js
console.debug("background.js loaded in service worker");

let portFromCS;

function connected(p) {
  portFromCS = p;
  portFromCS.postMessage({ greeting: "hi there content script!" });
  portFromCS.onMessage.addListener((m) => {
    console.log("In background script, received message from content script");
    console.log(m.greeting);
  });
}

browser.runtime.onConnect.addListener(connected);

browser.browserAction.onClicked.addListener(() => {
  portFromCS.postMessage({ greeting: "they clicked the button!" });
});

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

// Removes the context menus
function removeContextMenu() {
    const id = menuitemid_CopyJiraMarkdown;
// DO NOT SIMPLIFY the .then.then!!! 
    browser.contextMenus.remove(id).catch(() => { }).then(() => { }).then(() => {
        console.debug(`Context menu removed successfully (if it existed): ${id}`);
    }).catch((error) => {
        console.error('Error removing context menu:', error);
    });
}

function createContextMenu() {
    browser.contextMenus.create({
        id: menuitemid_CopyJiraMarkdown,
        title: "Copy URL for Jira",
        contexts: ["page", "link"],
        documentUrlPatterns: ["https://embt.atlassian.net/*"] // Show context menu only on Jira pages
    }, () => {
        if (browser.runtime.lastError) {
            console.error('Error creating context menu:', browser.runtime.lastError);
        } else {
            console.debug('Context menu created successfully');
        }
    });
}

browser.runtime.onSuspend.addListener(() => {
    console.debug(`Service worker is being suspended, context menu "${menuitemid_CopyJiraMarkdown}" will be removed.`);
    browser.browserAction.setBadgeText({ text: `Unloaded ${menuitemid_CopyJiraMarkdown}` });
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.debug('Received message in background script:', message, ' from sender: ', sender);
        console.debug("Page loaded message received, destroying and creating context menu...");
        removeContextMenu(); // Ensure old context menu is removed before creating a new one
        createContextMenu();
        sendResponse({ status: "Context menu created" });
});


/* 
On the page: https://embt.atlassian.net/servicedesk/customer/user/requests?page=1&reporter=all&statuses=open 
where all issues filed by a user are shown, there is a table row element <tr> that has an attribute
data-testid="request-list.request-list-table-v2--row-row-<issueID>", eg for RSB-1194, the test id is:
data-testid="request-list.request-list-table-v2--row-row-RSB-1194"
so, the entire element is:
<tr ... data-testid="request-list.request-list-table-v2--row-row-RSB-1194" ..>

the issue id is located on the element <td> (contained within the above <tr>) with the attribute
data-testid="request-list.request-list-table-v2--cell-1", where cell-1 contains the issue id within <a>'s text content.

The issue summary is located on the element <td> (contained within the above <tr>) with the attribute
data-testid="request-list.request-list-table-v2--cell-2", where cell-2 contains the issue summary within <a>'s text content.
Both the issue and summary's <a> has a href that points to the issue page, and the href is relative,
like this: "/servicedesk/customer/portal/3/RSB-1194"

Use the following to find the table that contains a list of all the listed issues.
let table = document.querySelector('table[data-testid="request-list.request-list-table-v2--table"]'); 
*/

browser.contextMenus.onClicked.addListener(async (info, tab) => {
    console.debug(`Context menuitem id: "${info.menuItemId}", Link URL: "${info.linkUrl}", Page URL: "${info.pageUrl}", Tab ID: ${tab.id}`);
    if (info.menuItemId === menuitemid_CopyJiraMarkdown && (info.linkUrl || info.pageUrl)) {
        console.debug("Executing script on tab:", tab.id);
        let newURL = info.linkUrl || info.pageUrl; // Default to linkUrl, fallback to pageUrl

        console.log('Attempting to inject script into tab: ', tab.id);
        let injectionResults = await scripting.executeScript({
            target: { tabId: tab.id },
            func: (linkUrl, pageUrl) => {
                console.debug("querying for issue table...");
                let issueTable = document.querySelector('table[data-testid="request-list.request-list-table-v2--table"]');
                if (issueTable) {
                    console.debug('Issue table found on the page: ', issueTable);
                    console.debug(`linkUrl: ${linkUrl}, pageUrl: ${pageUrl}`);
                    // When clicked on an empty part of the page, pageUrl is defined with the full URL
                    // When clicked on a link, linkUrl points to the issue page, 
                    // with pageUrl pointing to the page that the link is on. 
                    if (linkUrl) {
                        let url = linkUrl;
                        let issueID = url.substring(url.lastIndexOf('/') + 1);
                        console.debug(`Extracted issue ID from link URL: ${issueID}`);
                        const row = issueTable.querySelector(`tr[data-testid="request-list.request-list-table-v2--row-row-${issueID}"]`);
                        console.debug(`Row for issue ${issueID}: ${row}`);
                        const summaryCell = row.querySelector('td[data-testid="request-list.request-list-table-v2--cell-2"]');
                        const summary = summaryCell.querySelector('a').textContent;
                        console.debug(`Summary for issue ${issueID}: ${summary}`);

                        const issue = { key: issueID, summary: summary };
                        const jsonPayload = { textContent: JSON.stringify({ reqDetails: { issue, issueLinkUrl: linkUrl } }) };
                        const jsonData = JSON.parse(jsonPayload.textContent);
                        console.debug('jsonData to be returned: ', jsonData);
                        return jsonData;
                    }
                } else {
                    console.debug('Issue table not found on the page');
                };

                let jsonPayload = document.querySelector('div#jsonPayload');
                if (!jsonPayload) {
                    console.error('jsonPayload not found!');
                    console.log('Document URL: ', document.URL);
                    const issue = { key: null, summary: null };
                    jsonPayload = {
                        textContent: JSON.stringify({
                            reqDetails: { issue, issueLinkUrl: document.URL }
                        })
                    }; // Return empty JSON if not found
                } {
                    console.debug(`jsonPayload: ${JSON.stringify(jsonPayload.textContent)}`);
                }
                const jsonData = JSON.parse(jsonPayload.textContent);
                return jsonData;
            },
            args: [info.linkUrl, info.pageUrl]
        });

        let url = newURL; // fallback to the original URL if parsing fails.
        console.debug('Callback called, results: ', injectionResults, ' lastError: ', browser.runtime.lastError);
        console.debug('Original URL from context menu: ', newURL);
        if (browser.runtime.lastError) {
            console.error('Execute script error: ', browser.runtime.lastError);
        } else if (injectionResults && injectionResults[0]) {
            const jsonData = injectionResults[0].result;
            if (jsonData) {
                try {
                    console.debug('Parsed JSON from jsonPayload: ', jsonData);
                    const URL = jsonData.reqDetails.issueLinkUrl; // https://embt.atlassian.net/.../RSB-xxxx
                    const issueID = jsonData.reqDetails.issue.key; // RSB-xxxx
                    const summary = jsonData.reqDetails.issue.summary; // Summary text
                    url = `[${issueID}: ${summary}](${URL})`;
                    console.debug(`Formatted Jira URL: "${url}"`);
                } catch (e) {
                    console.error('Failed to parse JSON from jsonPayload: ', e);
                }
            } else {
                console.debug('Div with id jsonPayload not found in HTML');
            }
        } else {
            console.debug('No results');
        }

        console.debug(`Copying Jira URL to clipboard: "${url}"`);

        // Copy the formatted URL to the clipboard
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            // 2. This function is serialized and run on the page
            func: (url) => {
                navigator.clipboard.writeText(url).then(() => {
                    console.log(`URL "${url}" copied to clipboard`);
                }).catch(err => {
                    console.error("Failed to copy to clipboard:", err);
                });
            },
            args: [url]
        });
    }
});
// Written by CheeWee Chua,
// Singapore,
// 14-15 Feb 2026
