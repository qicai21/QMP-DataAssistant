document.addEventListener('DOMContentLoaded', function () {
    const urlParams = new URLSearchParams(window.location.search);
    const dataStr = urlParams.get('data');
    const receive_data = JSON.parse(decodeURIComponent(dataStr));

    const tableBody = document.querySelector('#data-table tbody');
    receive_data.forEach(rowData => {
        const row = document.createElement('tr');
        const boxNumberCell = document.createElement('td');
        boxNumberCell.textContent = rowData['箱号'];
        const weighTimeCell = document.createElement('td');
        weighTimeCell.textContent = rowData['皮重时间'];
        const netWeightCell = document.createElement('td');
        netWeightCell.textContent = rowData['净重'];

        row.appendChild(boxNumberCell);
        row.appendChild(weighTimeCell);
        row.appendChild(netWeightCell);
        tableBody.appendChild(row);
    });
});