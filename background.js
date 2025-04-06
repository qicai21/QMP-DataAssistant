let documentGuid = null;
let authorization = null;
let cookie = null;
let authorizationCaptured = false;

// 在插件启动时检查是否已有authorization
chrome.storage.local.get('authorization', (result) => {
  if (result.authorization) {
    authorizationCaptured = true;
    console.log("Found existing authorization:" + result.authorization + "skipping capture");
  }
});

// 当storage被清空时重置标志
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.authorization && !changes.authorization.newValue) {
    authorizationCaptured = false;
    console.log("Authorization cleared, ready to capture again");
  }
});

// 监听页面加载完成，获取 documentGuid 和 cookie
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.url.startsWith("http://apq.customs.gov.cn/grain/static/htmls/ProcessEnt/document_confirm_detail.html?documentGuid=")) {
      // 1) 读取 documentGuid
      const url = new URL(details.url);
      const documentGuidParam = url.searchParams.get("documentGuid");
      if (documentGuidParam) {
        documentGuid = documentGuidParam;
        chrome.storage.local.set({ documentGuid: documentGuid });
        console.log("documentGuid:", documentGuid);
        authorizationCaptured = false;
      }

      // 2) 获取 cookie
      chrome.cookies.getAll({ url: details.url }, (cookies) => {
        const cookie_str = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        cookie = encodeCookie(cookie_str);
        chrome.storage.local.set({ cookie: cookie });
        console.log("cookie:", cookie);
      });
    }
  },
  { urls: ["http://apq.customs.gov.cn/grain/static/htmls/ProcessEnt/document_confirm_detail.html?documentGuid=*"], types: ["main_frame"] }
);

// 监听请求发送前的 headers，获取 authorization
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (authorizationCaptured) return; // 如果已经获取过，直接返回
    if (details.url === "http://apq.customs.gov.cn/webapi/ent/Process/StockInConfirm/receive/list" && details.method === "POST") {
      const authorizationHeader = details.requestHeaders.find(header => header.name.toLowerCase() === 'authorization');
      if (authorizationHeader && authorizationHeader.value) {
        authorization = authorizationHeader.value;
        chrome.storage.local.set({ authorization: authorization });
        console.log("authorization (request header):", authorization);
      }
    }
  },
  { urls: ["http://apq.customs.gov.cn/webapi/ent/Process/StockInConfirm/receive/list"], types: ["xmlhttprequest"] },
  ["requestHeaders"]
);

// 将保存好的 documentGuid，authorization， cookie 打印到控制台 (在获取到所有信息后 - 可以根据你的需求调整触发时机)
chrome.webRequest.onCompleted.addListener(
  () => {
    if (documentGuid && authorization && cookie) {
      console.log("--- All Data Collected ---");
      console.log("Final documentGuid:", documentGuid);
      console.log("Final authorization:", authorization);
      console.log("Final cookie:", cookie);
    }
  },
  { urls: ["http://apq.customs.gov.cn/grain/static/htmls/ProcessEnt/document_confirm_detail.html?documentGuid=*"] }
);

/**
 * 编码Cookie字符串，对每个值部分进行URI编码
 * @param {string} cookie - 原始Cookie字符串
 * @returns {string} 编码后的Cookie字符串
 */
function encodeCookie(cookie) {
    const use_cookie = (cookie + '"}').replace(/^apihost=\s*;\s*/, '');
    return use_cookie.split(';')
        .map(part => {
            const [key, ...valueParts] = part.split('=');
            const trimmedKey = key.trim();
            
            if (valueParts.length > 0) {
                // 对值进行URI编码（保留=号）
                const value = valueParts.join('=').trim();
                return `${trimmedKey}=${encodeURIComponent(value)}`;
            }
            return trimmedKey;
        })
        .join('; ')
        .replace(/%2F/g, '/');
}