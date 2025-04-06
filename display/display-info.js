document.addEventListener('DOMContentLoaded', async () => {
  const { documentGuid, authorization, cookie } = await chrome.storage.local.get([
    'documentGuid', 
    'authorization', 
    'cookie'
  ]);
  
  const container = document.getElementById('infoContainer');
  
  const createInfoItem = (label, value) => {
    const div = document.createElement('div');
    div.className = 'info-item';
    div.innerHTML = `
      <div class="label">${label}:</div>
      <div class="value">${value || '未获取到值'}</div>
    `;
    return div;
  };
  
  container.appendChild(createInfoItem('Document Guid', documentGuid));
  container.appendChild(createInfoItem('Authorization', authorization));
  container.appendChild(createInfoItem('Cookie', cookie));
});