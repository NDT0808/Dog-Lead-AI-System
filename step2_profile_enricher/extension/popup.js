// Step 2 Profile Enricher Popup Controller
let currentEnrichedData = [];

document.addEventListener('DOMContentLoaded', async () => {
  const storage = await chrome.storage.local.get(['enrichedLeads']);
  if (storage.enrichedLeads && Array.isArray(storage.enrichedLeads)) {
    currentEnrichedData = storage.enrichedLeads;
  }

  document.getElementById('btnScrapeCurrent').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('facebook.com')) {
      alert('Vui lòng mở trang Facebook cần bóc tách thông tin!');
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'SCRAPE_ABOUT_DATA' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content_fb_about.js']
        }, () => {
          chrome.tabs.sendMessage(tab.id, { action: 'SCRAPE_ABOUT_DATA' }, renderResult);
        });
      } else {
        renderResult(response);
      }
    });
  });

  document.getElementById('btnExportStep2').addEventListener('click', () => {
    if (currentEnrichedData.length === 0) {
      alert('Chưa có dữ liệu làm giàu để xuất!');
      return;
    }
    const blob = new Blob([JSON.stringify(currentEnrichedData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url: url,
      filename: `step2_enriched_leads_${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.json`,
      saveAs: true
    });
  });
});

function renderResult(data) {
  if (!data) return;
  document.getElementById('valName').textContent = data.name || '---';
  document.getElementById('valOwner').textContent = data.owner || '---';
  document.getElementById('valWeb').textContent = data.website || '---';
  document.getElementById('valPhone').textContent = data.phone || '---';
  document.getElementById('valEmail').textContent = data.email || '---';
  document.getElementById('valAddr').textContent = data.address || '---';

  // Save to storage
  currentEnrichedData.push(data);
  chrome.storage.local.set({ enrichedLeads: currentEnrichedData });
}
