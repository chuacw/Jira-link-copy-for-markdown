// Written by CheeWee Chua,
// Singapore, 
// 14-16 Feb 2026
const menuitemid_CopyJiraMarkdown = "copy-jira-url-for-markdown";
const menuitemid_CopyJiraHTML = "copy-jira-url-for-HTML";

let api, scripting;
if (typeof browser !== "undefined") {
    api = browser;
    scripting = browser.scripting;
    if (!scripting) {
        scripting = browser.tabs;
    }
    console.log("Using browser API");
} else if (typeof chrome !== "undefined") {
    api = chrome;
    scripting = chrome.scripting;
    console.log("Using Chrome API");
}

// background.js
console.log("background.js v1.0.8 loaded in service worker");

function createContextMenu() {
    api.contextMenus.create({
        id: menuitemid_CopyJiraMarkdown,
        title: "Copy URL for Jira",
        contexts: ["page", "link"],
        documentUrlPatterns: ["https://embt.atlassian.net/*"] // Show context menu only on Jira pages
    }, () => {
        const errorMessage = chrome.runtime.lastError?.message;
        if (errorMessage) {
            console.error('Error creating context menu: ', errorMessage);
        } else {
            console.log('Context menu created successfully');
        }
    });
}

api.runtime.onInstalled.addListener(() => {
    console.log("Extension installed, creating context menu...");
    createContextMenu(); // Create context menu when service worker starts
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
api.contextMenus.onClicked.addListener(async (info, tab) => {
    console.log(`Context menuitem id: "${info.menuItemId}", Link URL: "${info.linkUrl}", Page URL: "${info.pageUrl}", Tab ID: ${tab.id}`);
    if (info.menuItemId === menuitemid_CopyJiraMarkdown && (info.linkUrl || info.pageUrl)) {
        console.log("Executing script on tab:", tab.id);
        let url = info.linkUrl || info.pageUrl; // Default to linkUrl, fallback to pageUrl

        console.log('Attempting to inject script into tab: ', tab.id);
        // Chrome can't marshal undefined, so we need to ensure url is a string (or "") before passing it as an argument
        let linkUrl = info.linkUrl == undefined ? "" : info.linkUrl;

        let injectionResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (linkUrl, pageUrl) => {
                console.log(`linkUrl: ${linkUrl}, pageUrl: ${pageUrl}`);
                console.log("querying for issue table...");
                let issueTable = document.querySelector('table[data-testid="request-list.request-list-table-v2--table"]');
                if (issueTable) {
                    console.log('Issue table found on the page: ', issueTable);
                    // When clicked on an empty part of the page, pageUrl is defined with the full URL
                    // When clicked on a link, linkUrl points to the issue page, 
                    // with pageUrl pointing to the page that the link is on. 
                    if (linkUrl != "") {
                        let url = linkUrl;
                        let issueID = url.substring(url.lastIndexOf('/') + 1);
                        console.log(`Extracted issue ID from link URL: ${issueID}`);
                        const row = issueTable.querySelector(`tr[data-testid="request-list.request-list-table-v2--row-row-${issueID}"]`);
                        console.log(`Row for issue ${issueID}: ${row}`);
                        const summaryCell = row.querySelector('td[data-testid="request-list.request-list-table-v2--cell-2"]');
                        const summary = summaryCell.querySelector('a').textContent;
                        console.log(`Summary for issue ${issueID}: ${summary}`);

                        const issue = { key: issueID, summary: summary };
                        const jsonPayload = { textContent: JSON.stringify({ reqDetails: { issue, issueLinkUrl: linkUrl } }) };
                        const jsonData = JSON.parse(jsonPayload.textContent);
                        console.log('jsonData to be returned: ', jsonData);
                        return jsonData;
                    } else {
                        console.log('No link URL, likely clicked on an empty part of the page. Returning page URL: ', pageUrl);
                    }
                } else {
                    console.log('Issue table not found on the page');
                };

                // For some reason, the first time an archive entry loads, the jsonPayload has the wrong data.
                // If the page is refreshed, then the jsonPayload is correct.
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
                    console.log(`jsonPayload: ${JSON.stringify(JSON.parse(jsonPayload.textContent), null, 2)}`);
                }
                const jsonData = JSON.parse(jsonPayload.textContent);
                return jsonData;
            },
            args: [linkUrl, info.pageUrl]
        });

        const errorMessage = chrome.runtime.lastError?.message;
        console.log('Callback called, results: ', injectionResults, ' lastError: ', errorMessage);
        console.log('Original URL from context menu: ', url);
        if (errorMessage) {
            console.error('Execute script error: ', errorMessage);
        } else if (injectionResults && injectionResults[0]) {
            const jsonData = injectionResults[0].result;
            if (jsonData) {
                try {
                    console.log('Parsed JSON from jsonPayload: ', jsonData);
                    const URL = jsonData.reqDetails.issueLinkUrl; // https://embt.atlassian.net/.../RSB-xxxx
                    const issueID = jsonData.reqDetails.issue.key; // RSB-xxxx
                    const summary = jsonData.reqDetails.issue.summary; // Summary text
                    url = `[${issueID}: ${summary}](${URL})`;
                    console.log(`Formatted Jira URL: "${url}"`);
                } catch (e) {
                    console.error('Failed to parse JSON from jsonPayload: ', e);
                }
            } else {
                console.log('Div with id jsonPayload not found in HTML');
            }
        } else {
            console.log('No results');
        }

        console.log(`Copying Jira URL to clipboard: "${url}"`);

        let newURL = url; // prevent serialization issue on Chrome

        // Copy the formatted URL to the clipboard
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            // 2. This function is serialized and run on the page
            func: (url) => {
                navigator.clipboard.writeText(url).then(() => {
                    console.log(`URL "${url}" copied to clipboard`);
                }).catch(err => {
                    console.error("Failed to copy to clipboard:", err);
                });
            },
            args: [newURL]
        });
    }
});
// Written by CheeWee Chua,
// Singapore,
// 14-16 Feb 2026
