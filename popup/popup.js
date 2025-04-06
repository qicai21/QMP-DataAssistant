// 引入 XLSX 库
const script = document.createElement('script');
script.src = 'xlsx.full.min.js';
document.head.appendChild(script);

// 全局变量
let dataList = [];
let totalData = 0;
let isSyncing = false;
let authorization = null;
let cookie = null;
let documentGuid = null;

// DOM 元素
const syncBtn = document.getElementById('send-request-button');
const statusEl = document.getElementById('sync-status');
const uploadButton = document.getElementById('upload-button');
const fileInput = document.getElementById('file-input');
const uploadText = document.getElementById('upload-text');

// 通知 background.js
function notifyBackground(message) {
  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      console.error("通知 background 失败:", chrome.runtime.lastError);
    } else {
      console.log("background 响应:", response);
    }
  });
}

// 初始化函数
async function init() {
  try {
    // 刷新当前活动页面
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.reload(tabs[0].id);
      }
    });

    // 确保异步操作完成
    await getDocumentGuidAndCookie();
    await getAuthorization();

    // 通知 background 获取完成
    notifyBackground({
      type: "variablesReady",
      documentGuid,
      cookie,
      authorization,
    });

    updateStatus();
  } catch (error) {
    console.error("初始化失败:", error);
  }
}

// 获取 documentGuid 和 cookie
async function getDocumentGuidAndCookie() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        const tabId = tabs[0].id;

        // 注入脚本以获取 documentGuid 和 cookie
        chrome.scripting.executeScript(
          {
            target: { tabId: tabId },
            func: () => {
              const urlParams = new URLSearchParams(window.location.search);
              return {
                documentGuid: urlParams.get('documentGuid'),
                cookie: document.cookie,
              };
            },
          },
          (results) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else if (results && results[0] && results[0].result) {
              const result = results[0].result;

              // 对 cookie 进行加工处理
              cookie = encodeCookie(result.cookie);
              documentGuid = result.documentGuid;
              resolve();
            } else {
              reject(new Error("无法获取 documentGuid 和 cookie"));
            }
          }
        );
      } else {
        reject(new Error("未找到活动标签页"));
      }
    });
  });
}

// 去掉 cookie 头部的 apihost=，并对值进行 URI 编码，处理中文
function encodeCookie(cookie) {
  const use_cookie = (cookie + '"}').replace(/^apihost=\s*;\s*/, '');
  return use_cookie
    .split(';')
    .map((part) => {
      const [key, ...valueParts] = part.split('=');
      const trimmedKey = key.trim();

      if (valueParts.length > 0) {
        // 对值进行 URI 编码（保留 = 号）
        const value = valueParts.join('=').trim();
        return `${trimmedKey}=${encodeURIComponent(value)}`;
      }
      return trimmedKey;
    })
    .join('; ')
    .replace(/%2F/g, '/');
}

// 获取 authorization
async function getAuthorization() {
  return new Promise((resolve) => {
    chrome.webRequest.onBeforeSendHeaders.addListener(
      (details) => {
        const authorizationHeader = details.requestHeaders.find(
          (header) => header.name.toLowerCase() === 'authorization'
        );
        if (authorizationHeader) {
          authorization = authorizationHeader.value;
          resolve();
        }
      },
      {
        // 仅监听指定请求的 headers
        urls: [
          "http://apq.customs.gov.cn/webapi/ent/Process/StockInConfirm/receive/list",
        ],
      },
      ["requestHeaders"]
    );
  });
}

// 更新状态显示
function updateStatus() {
  statusEl.textContent = `已同步 ${dataList.length} 条记录，共 ${totalData} 条`;
}

// 获取请求头
function getRequestHeaders() {
  return {
    "accept": "*/*",
    "accept-encoding": "gzip, deflate",
    "accept-language": "zh-CN,zh;q=-1.9,en-US;q=0.8,en;q=0.7,zh-TW;q=0.6",
    "cache-control": "no-cache",
    "connection": "keep-alive",
    "content-length": "164",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Authorization": authorization,
    "Cookie": cookie,
    "host": "apq.customs.gov.cn",
    "Origin": "http://apq.customs.gov.cn",
    "Pragma": "no-cache",
    "Referer": `http://apq.customs.gov.cn/grain/static/htmls/ProcessEnt/document_confirm_detail.html?documentGuid=${documentGuid}`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "x-requested-with": "XMLHttpRequest",
  };
}

// 构建表单数据字符串
function buildFormDataString(pagenum, totalpage) {
  const requestBody = {
    sort: "SEND_DATE",
    sortDesc: false,
    pending: false,
    paging: {
      pagecount: 50,
      pagenum: pagenum,
      totalpage: totalpage,
    },
    documentGuid: documentGuid,
  };

  const formData = new URLSearchParams();
  Object.entries(requestBody).forEach(([key, value]) => {
    if (typeof value === "object") {
      Object.entries(value).forEach(([subKey, subValue]) => {
        formData.append(`${key}[${subKey}]`, subValue);
      });
    } else {
      formData.append(key, value);
    }
  });

  return formData.toString();
}

// 发送 POST 请求获取列表数据
async function postGetListRequest(pagenum, totalpage) {
  if (!authorization || !cookie || !documentGuid) {
    throw new Error("缺少必要的请求参数：authorization、cookie或documentGuid");
  }

  const headers = getRequestHeaders();
  const formDataStr = buildFormDataString(pagenum, totalpage);

  const response = await fetch(
    "http://apq.customs.gov.cn/webapi/ent/Process/StockInConfirm/receive/list",
    {
      method: "POST",
      headers: headers,
      body: formDataStr,
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw new Error(`请求失败，状态码: ${response.status}`);
  }

  return await response.json();
}

// 同步数据
async function syncData() {
  if (isSyncing) return;

  isSyncing = true;
  syncBtn.disabled = true;
  statusEl.textContent = "同步中...";

  try {
    // 第一次请求
    const firstResult = await postGetListRequest(1, 0);
    totalData = firstResult.paging.totalpage;
    dataList = [...firstResult.content];

    updateStatus();

    // 计算剩余请求次数
    const totalPages = Math.ceil(totalData / 50);

    // 执行剩余请求
    for (let i = 2; i <= totalPages; i++) {
      statusEl.textContent = `同步中... (${i - 1}/${totalPages})`;
      const result = await postGetListRequest(i, totalData);
      dataList = [...dataList, ...result.content];
    }

    statusEl.textContent = `同步完成，共 ${dataList.length} 条记录`;

    // 通知 background 同步完成
    notifyBackground({
      type: "syncComplete",
      totalData: dataList.length,
      firstData: dataList[0] || null,
    });
  } catch (error) {
    console.error("同步出错:", error);
    statusEl.textContent = "同步失败: " + error.message;
  } finally {
    isSyncing = false;
    syncBtn.disabled = false;
  }
}

// 文件上传处理
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  uploadText.value = file.name;

  const reader = new FileReader();
  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    const receive_data = jsonData
      .filter((row) => row["箱号"] && row["皮重时间"] && row["净重"])
      .map((row) => ({
        箱号: row["箱号"],
        皮重时间: row["皮重时间"],
        净重: row["净重"],
      }));

    const dataStr = encodeURIComponent(JSON.stringify(receive_data));
    chrome.windows.create({
      url: `display/display.html?data=${dataStr}`,
      type: "popup",
      width: 800,
      height: 600,
    });
  };
  reader.readAsArrayBuffer(file);
}

// 事件监听
document.addEventListener("DOMContentLoaded", init);
syncBtn.addEventListener("click", syncData);
uploadButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", handleFileUpload);