import browser from "webextension-polyfill";

import "webext-dynamic-content-scripts";

import addDomainPermissionToggle from "webext-domain-permission-toggle";

(async () => {
    addDomainPermissionToggle();
})();

browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        browser.tabs.create({ url: "https://coder.com/docs/v2/latest/templates/open-in-coder" });
    }
});
browser.runtime.setUninstallURL("https://coder.com/docs/v2/latest/templates/open-in-coder?track=true");

export {};
