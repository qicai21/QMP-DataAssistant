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
let shipmentData =[];

// DOM 元素
const syncBtn = document.getElementById('send-request-button');
const statusEl = document.getElementById('sync-status');
const uploadButton = document.getElementById('upload-button');
const fileInput = document.getElementById('file-input');
const uploadText = document.getElementById('upload-text');
const bulkUploadButton = document.getElementById("bulk-upload-button");
bulkUploadButton.disabled = true; // 初始状态不可用

// 通知 background.js 打印日志
function logToBackground(message) {
  chrome.runtime.sendMessage({ type: "log", message });
}

// 通知 background.js
function notifyBackground(message) {
  if (!message || !message.type) {
    logToBackground("通知 background 失败: 消息类型(type)未定义");
    return;
  }

  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      logToBackground(`通知 background 失败: ${chrome.runtime.lastError.message}`);
    } else {
      logToBackground(`background 响应: ${JSON.stringify(response)}`);
    }
  });
}

// 更新同步按钮状态
function updateSyncButtonState() {
  syncBtn.disabled = shipmentData.length === 0; // 当 shipmentData 为空时禁用按钮
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
    logToBackground(`初始化失败: ${error.message}`); 
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

    // 发送日志到 background
    logToBackground(`同步完成，共 ${dataList.length} 条记录`);
  } catch (error) {
    logToBackground(`同步出错: ${error.message}`);
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

  // 检查文件扩展名是否为 .xlsx 或 .xls
  const fileExtension = file.name.split('.').pop().toLowerCase();
  if (fileExtension !== 'xlsx' && fileExtension !== 'xls') {
    logToBackground("仅支持 .xlsx 和 .xls 文件格式");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    // 过滤数据：只保留 "发运日期"、"箱号"、"皮重时间"、"净重" 都不为空的行
    shipmentData = jsonData
      .filter((row) => row["发运日期"] && row["箱号"] && row["皮重时间"] && row["净重"])
      .map((row) => ({
        SEND_DATE: convertExcelDate(row["发运日期"]), // 转换 "发运日期"
        TRANS_MEAN_NO: row["箱号"],
        RECEIVE_DATE: convertExcelDate(row["皮重时间"]), // 转换 "皮重时间"
        RECEIVE_WEIGHT: row["净重"] * 1000, // 转换为克
        TRANS_DETAIL_GUID: "",
        DOCUMENT_GUID: documentGuid,
        MATCH_STATUS: "",
      }));

    // 控制台打印读取到的数据
    logToBackground(`读取到 ${shipmentData.length} 条数据:`);
    // 通知 background 获取完成
    notifyBackground({
      type: "table",
      tableData: shipmentData,
    });

    // 更新同步按钮状态
    updateSyncButtonState();
  };

  reader.readAsArrayBuffer(file);
}

// 转换 Excel 日期值为 JavaScript 日期
function convertExcelDate(excelDate) {
  if (typeof excelDate === "number") {
    // 如果是数字，按 Excel 日期值转换
    const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // Excel 的起始日期是 1899-12-30（UTC 时间）
    const utcDate = new Date(excelEpoch.getTime() + excelDate * 86400000); // 每天是 86400000 毫秒
    return new Date(utcDate.getTime() + 8 * 60 * 60 * 1000); // 转换为北京时间（UTC+8）
  } else if (typeof excelDate === "string") {
    // 如果是字符串，尝试直接解析为日期
    const parsedDate = new Date(excelDate);
    if (!isNaN(parsedDate)) {
      return new Date(parsedDate.getTime() + 8 * 60 * 60 * 1000); // 转换为北京时间（UTC+8）
    }
  }
  throw new Error(`无法解析日期值: ${excelDate}`);
}

// 匹配 shipmentData 和 dataList 的方法
function matchShipmentDataWithDataList() {
  shipmentData.forEach((shipmentItem) => {
    // 提取 shipmentItem 的信息
    const { TRANS_MEAN_NO, SEND_DATE } = shipmentItem;

    // 格式化 SEND_DATE 为日期（忽略时间部分）
    const shipmentDate = new Date(SEND_DATE).toDateString();

    // 在 dataList 中查找所有符合条件的项
    const matchedItems = dataList.filter((dataItem) => {
      const dataDate = new Date(dataItem.SEND_DATE).toDateString();
      return (
        dataItem.TRANS_MEAN_NO === TRANS_MEAN_NO && // TRANS_MEAN_NO 相同
        dataDate === shipmentDate // SEND_DATE 为同一天
      );
    });

    if (matchedItems.length > 1) {
      // 如果匹配到多条记录
      shipmentItem.MATCH_STATUS = "同箱号同一日多条数据";
    } else if (matchedItems.length === 1) {
      const matchedItem = matchedItems[0];
      if (!matchedItem.RECEIVE_WEIGHT || matchedItem.RECEIVE_WEIGHT === 0) {
        // 匹配成功且 RECEIVE_WEIGHT 为空或 0
        shipmentItem.TRANS_DETAIL_GUID = matchedItem.TP_GUID;
        shipmentItem.MATCH_STATUS = "done";
      } else {
        // 匹配成功但 RECEIVE_WEIGHT 不为空或 0
        shipmentItem.MATCH_STATUS = "已有收货重量";
      }
    } else {
      // 未找到匹配项
      shipmentItem.MATCH_STATUS = "未匹配到";
    }
  });

  // 打开 display.html 页面并传递数据
  openDisplayPage(shipmentData);

  // 通知匹配完成
  logToBackground("匹配完成，更新后的 shipmentData:");
  logToBackground(shipmentData);

  // 通知 background 匹配结果
  notifyBackground({
    type: "matchComplete",
    matchedData: shipmentData,
  });
}

// 打开 display.html 页面并传递数据
function openDisplayPage(data) {
  const dataStr = encodeURIComponent(JSON.stringify(data));
  chrome.windows.create({
    url: `display/display.html?data=${dataStr}`,
    type: "popup",
    width: 800,
    height: 600,
  });
}

// 批量上传方法
async function bulkUploadDatas() {
  // 运行 generateUploadDataString 方法生成待上传数据
  const stringData = generateUploadDataString();

  // 将结果通过 background 打印到控制台
  logToBackground("待上传的 stringData 集合:");
  stringData.forEach((data, index) => {
    logToBackground(`第 ${index + 1} 条数据: ${data}`);
  });

  // 获取请求头
  const headers = getRequestHeaders();
  // 统计上传成功的条数
  let successCount = 0;

  // 遍历每一条 stringData 并发送 POST 请求
  for (const [index, data] of stringData.entries()) {
    try {
      const response = await fetch(
        "http://apq.customs.gov.cn/webapi/ent/Process/StockInConfirm/receive/update/A",
        {
          method: "POST",
          headers: headers,
          body: data,
          credentials: "include",
        }
      );

      if (response.ok) {
        successCount++;
        logToBackground(`第 ${index + 1} 条数据上传成功`);
      } else {
        logToBackground(`第 ${index + 1} 条数据上传失败，状态码: ${response.status}`);
      }
    } catch (error) {
      logToBackground(`第 ${index + 1} 条数据上传失败，错误: ${error.message}`);
    }
  }

  // 上传完成后弹出提示
  alert(`上传完成，共计上传 ${successCount} 条数据`);
}

// 从匹配后的 shipmentData 中生成待上传的 stringData 集合
function generateUploadDataString() {
  // 筛选出 MATCH_STATUS 为 "done" 的项
  const doneItems = shipmentData.filter((item) => item.MATCH_STATUS === "done");

  // 将每个 item 转换为 URL 编码的字符串
  return doneItems.map((item) => {
    const data = {
      COMPLETE_RECEIVE_DESC: "",
      RECEIVE_DESC: "",
      WEIGHT: item.RECEIVE_WEIGHT, // 使用 RECEIVE_WEIGHT，默认为 0
      ReceiveDate: formatDateToString(item.RECEIVE_DATE), // 转换 RECEIVE_DATE 为字符串
      TRANS_DETAIL_GUID: item.TRANS_DETAIL_GUID, // 使用 TRANS_DETAIL_GUID
      DOCUMENT_GUID: item.DOCUMENT_GUID, // 使用 DOCUMENT_GUID
    };

    // 转换为 URL 编码的字符串
    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      formData.append(key, value);
    }

    return formData.toString(); // 返回生成的 dataString
  });
}

// 将 JavaScript Date 转换为 "YYYY-MM-DD HH:mm:ss" 格式的字符串
function formatDateToString(date) {
  if (!(date instanceof Date) || isNaN(date)) {
    throw new Error(`无效的日期: ${date}`);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // 月份从 0 开始
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 初始化同步按钮状态
updateSyncButtonState();

// 事件监听
document.addEventListener("DOMContentLoaded", init);
uploadButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", handleFileUpload);
// 或在同步完成后调用
syncBtn.addEventListener("click", async () => {
  bulkUploadButton.disabled = true; // 在匹配数据前禁用按钮
  await syncData();
  matchShipmentDataWithDataList();
  bulkUploadButton.disabled = false; // 匹配完成后启用按钮
});
bulkUploadButton.addEventListener("click", bulkUploadDatas);