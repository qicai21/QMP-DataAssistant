// 获取 URL 参数中的数据
function getShipmentDataFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const data = urlParams.get("data");
  return data ? JSON.parse(decodeURIComponent(data)) : [];
}

// 渲染表格
function renderTable(data) {
  const tableBody = document.getElementById("shipment-table").querySelector("tbody");
  tableBody.innerHTML = ""; // 清空表格内容

  data.forEach((item) => {
    const row = document.createElement("tr");
    Object.values(item).forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });
    tableBody.appendChild(row);
  });
}

// 处理确认按钮点击事件
function handleConfirmButtonClick() {
  window.close(); // 关闭当前窗口
}

// 初始化页面
function init() {
  const shipmentData = getShipmentDataFromUrl();
  renderTable(shipmentData);

  const confirmButton = document.getElementById("confirm-button");
  confirmButton.addEventListener("click", handleConfirmButtonClick);
}

// 执行初始化
document.addEventListener("DOMContentLoaded", init);