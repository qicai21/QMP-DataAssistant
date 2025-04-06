// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete') {
        console.log(`页面已经 reloaded: ${tab.url}`);
    }
});

// 监听来自 popup.js 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "log") {
    console.log("Popup Log:", message.message);
  } else if (message.type === "variablesReady") {
    console.log("DocumentGuid:", message.documentGuid);
    console.log("Cookie:", message.cookie);
    console.log("Authorization:", message.authorization);
    sendResponse({ status: "Variables logged" });
  } else if (message.type === "syncComplete") {
    console.log("同步完成，总数据量:", message.totalData);
    console.log("第一条数据内容:", message.firstData);
    sendResponse({ status: "Sync data logged" });
  } else if (message.type === "table") {
    console.table(message.tableData);
    sendResponse({ status: "Table data logged" });
  }
})