/**
 * standalone_controller.js - Điều phối 3 công cụ độc lập:
 * 1. Chỉ Lấy FB ID (UID)
 * 2. Bóc Tách Địa Chỉ & SĐT/Email Website
 * 3. Tìm Người Đại Diện / Chủ Trại Website
 */

import { parseCSV, csvString, normalizeURL, numericFacebookID, detectWebsiteColumn, detectFacebookColumn, makeRecords, domainOf } from './core.js';
import { UidFastRunner, ContactAddressRunner, OwnerRunner } from './runners.js?v=20261024_02';
import { callGemini, testGeminiApiKey } from './gemini.js';

export function initStandaloneTools(onPushToCrm) {
  // =========================================================================
  // 1. CHỈ LẤY FACEBOOK ID (UID) CONTROLLER
  // =========================================================================
  let uidRunner = null;
  let uidDataset = [];

  const dropZoneUid = document.getElementById('dropZoneUid');
  const fileInputUid = document.getElementById('fileInputUid');
  const txtBulkLinksUid = document.getElementById('txtBulkLinksUid');
  const workersUid = document.getElementById('workersUid');
  const btnStartUid = document.getElementById('btnStartUid');
  const btnPauseUid = document.getElementById('btnPauseUid');
  const btnResumeUid = document.getElementById('btnResumeUid');
  const btnStopUid = document.getElementById('btnStopUid');
  const btnClearUid = document.getElementById('btnClearUid');
  const btnQuickPasteUid = document.getElementById('btnQuickPasteUid');
  const btnExportUidCsv = document.getElementById('btnExportUidCsv');
  const btnExportUidJson = document.getElementById('btnExportUidJson');
  const btnPushUidToCrm = document.getElementById('btnPushUidToCrm');
  const searchUidInput = document.getElementById('searchUidInput');
  const uidTableBody = document.getElementById('uidTableBody');

  function updateUidCounts() {
    const text = txtBulkLinksUid ? txtBulkLinksUid.value.trim() : '';
    const lines = text ? text.split('\n').map(l => l.trim()).filter(Boolean) : [];
    const countEl = document.getElementById('lblUidLinkCount');
    if (countEl) countEl.textContent = lines.length;
  }

  if (txtBulkLinksUid) {
    txtBulkLinksUid.addEventListener('input', updateUidCounts);
  }

  if (dropZoneUid && fileInputUid) {
    dropZoneUid.addEventListener('click', () => fileInputUid.click());
    dropZoneUid.addEventListener('dragover', (e) => { e.preventDefault(); dropZoneUid.style.borderColor = 'var(--primary)'; });
    dropZoneUid.addEventListener('dragleave', () => { dropZoneUid.style.borderColor = 'var(--border-strong)'; });
    dropZoneUid.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZoneUid.style.borderColor = 'var(--border-strong)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleUidFile(e.dataTransfer.files[0]);
      }
    });
    fileInputUid.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleUidFile(e.target.files[0]);
      }
    });
  }

  function handleUidFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const fileNameEl = document.getElementById('lblUidLoadedFileName');
      if (fileNameEl) fileNameEl.textContent = file.name;

      if (file.name.endsWith('.json')) {
        try {
          const json = JSON.parse(content);
          const urls = json.map(x => x.url || x.facebook_url || x.website || x.original || '').filter(Boolean);
          txtBulkLinksUid.value = urls.join('\n');
          updateUidCounts();
        } catch {}
      } else {
        try {
          const table = parseCSV(content);
          if (table.length > 0) {
            const fbCol = detectFacebookColumn(table[0]);
            const webCol = detectWebsiteColumn(table[0]);
            const targetCol = fbCol >= 0 ? fbCol : (webCol >= 0 ? webCol : 0);
            const urls = table.slice(1).map(r => r[targetCol] || '').filter(Boolean);
            txtBulkLinksUid.value = urls.join('\n');
            updateUidCounts();
          }
        } catch {
          txtBulkLinksUid.value = content;
          updateUidCounts();
        }
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  if (btnQuickPasteUid) {
    btnQuickPasteUid.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          txtBulkLinksUid.value = text.trim();
          updateUidCounts();
        }
      } catch {}
    });
  }

  if (btnClearUid) {
    btnClearUid.addEventListener('click', () => {
      txtBulkLinksUid.value = '';
      updateUidCounts();
      uidDataset = [];
      renderUidTable();
    });
  }

  uidRunner = new UidFastRunner(
    (state) => {
      // Progress update
      const total = state.total || 0;
      const current = state.index || 0;
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;

      const fill = document.getElementById('progressFillUid');
      if (fill) fill.style.width = pct + '%';
      const pctEl = document.getElementById('lblUidPercent');
      if (pctEl) pctEl.textContent = pct + '%';
      const countEl = document.getElementById('lblUidCount');
      if (countEl) countEl.textContent = current;
      const totalEl = document.getElementById('lblUidTotal');
      if (totalEl) totalEl.textContent = total;

      const totalKpi = document.getElementById('kpiUidTotal');
      if (totalKpi) totalKpi.textContent = total;
      const successKpi = document.getElementById('kpiUidSuccess');
      if (successKpi) successKpi.textContent = uidDataset.filter(x => x.fbId).length;
      const fastKpi = document.getElementById('kpiUidFast');
      if (fastKpi) fastKpi.textContent = uidDataset.filter(x => x.method && x.method.includes('0s')).length;
      const rateKpi = document.getElementById('kpiUidRate');
      if (rateKpi) {
        const succ = uidDataset.filter(x => x.fbId).length;
        rateKpi.textContent = current > 0 ? Math.round((succ / current) * 100) + '%' : '0%';
      }

      if (state.lastResult) {
        const existingIdx = uidDataset.findIndex(x => x.index === state.lastResult.index);
        if (existingIdx >= 0) uidDataset[existingIdx] = state.lastResult;
        else uidDataset.push(state.lastResult);
        renderUidTable();

        const previewRow = document.getElementById('previewRowUid');
        if (previewRow) previewRow.style.display = 'flex';
        const pSource = document.getElementById('previewUidSource');
        if (pSource) pSource.textContent = state.lastResult.source;
        const pBadge = document.getElementById('previewUidBadge');
        if (pBadge) pBadge.textContent = state.lastResult.fbId ? `ID: ${state.lastResult.fbId}` : 'Chưa có ID';
        const pMethod = document.getElementById('previewUidMethod');
        if (pMethod) pMethod.textContent = state.lastResult.method || '';
      }

      if (state.completed) {
        btnStartUid.style.display = 'inline-flex';
        btnPauseUid.style.display = 'none';
        btnResumeUid.style.display = 'none';
        const statusEl = document.getElementById('lblUidStatus');
        if (statusEl) statusEl.textContent = 'Đã hoàn thành toàn bộ!';
      }
    },
    (logMsg) => {
      const taskEl = document.getElementById('lblUidCurrentTask');
      if (taskEl) taskEl.textContent = logMsg;
    }
  );

  if (btnStartUid) {
    btnStartUid.addEventListener('click', () => {
      const text = txtBulkLinksUid.value.trim();
      if (!text) {
        alert('Vui lòng dán danh sách link hoặc nạp file trước khi bắt đầu.');
        return;
      }
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const records = lines.map((url, i) => ({ original: url, url, name: '' }));
      uidDataset = [];
      const numWorkers = parseInt(workersUid?.value || '4', 10);
      uidRunner.setJob(records, numWorkers);
      btnStartUid.style.display = 'none';
      btnPauseUid.style.display = 'inline-flex';
      btnResumeUid.style.display = 'none';
      const statusEl = document.getElementById('lblUidStatus');
      if (statusEl) statusEl.textContent = 'Đang trích xuất UID...';
      uidRunner.start();
    });
  }

  if (btnPauseUid) {
    btnPauseUid.addEventListener('click', () => {
      uidRunner.pause();
      btnPauseUid.style.display = 'none';
      btnResumeUid.style.display = 'inline-flex';
      const statusEl = document.getElementById('lblUidStatus');
      if (statusEl) statusEl.textContent = 'Đã tạm dừng';
    });
  }

  if (btnResumeUid) {
    btnResumeUid.addEventListener('click', () => {
      btnResumeUid.style.display = 'none';
      btnPauseUid.style.display = 'inline-flex';
      const statusEl = document.getElementById('lblUidStatus');
      if (statusEl) statusEl.textContent = 'Đang tiếp tục trích xuất...';
      uidRunner.start();
    });
  }

  if (btnStopUid) {
    btnStopUid.addEventListener('click', () => {
      uidRunner.stop();
      btnStartUid.style.display = 'inline-flex';
      btnPauseUid.style.display = 'none';
      btnResumeUid.style.display = 'none';
      const statusEl = document.getElementById('lblUidStatus');
      if (statusEl) statusEl.textContent = 'Đã dừng lại.';
    });
  }

  function renderUidTable() {
    if (!uidTableBody) return;
    const query = (searchUidInput?.value || '').toLowerCase().trim();
    const filtered = uidDataset.filter(item => {
      if (!query) return true;
      return (item.fbId && item.fbId.includes(query)) ||
        (item.source && item.source.toLowerCase().includes(query)) ||
        (item.fbUrl && item.fbUrl.toLowerCase().includes(query));
    });

    const resCount = document.getElementById('lblUidResultCount');
    if (resCount) resCount.textContent = filtered.length;

    if (filtered.length === 0) {
      uidTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">Không tìm thấy bản ghi phù hợp.</td></tr>`;
      return;
    }

    uidTableBody.innerHTML = filtered.map((item, idx) => `
      <tr>
        <td style="font-family:var(--mono); text-align:center;">${idx + 1}</td>
        <td style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${item.source}">
          <a href="${item.source.startsWith('http') ? item.source : 'https://' + item.source}" target="_blank" style="color:var(--text);">${item.source}</a>
        </td>
        <td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${item.fbUrl ? `<a href="${item.fbUrl}" target="_blank" style="color:var(--primary); font-weight:600;">${item.fbUrl}</a>` : '<span style="color:var(--text-muted);">-</span>'}
        </td>
        <td>
          ${item.fbId ? `<span class="badge-fbid">🆔 ${item.fbId}</span>` : '<span style="color:var(--text-muted);">-</span>'}
        </td>
        <td style="font-size:11.5px; color:${item.fbId ? 'var(--emerald)' : 'var(--text-muted)'};">
          ${item.method || item.status}
        </td>
        <td>
          ${item.fbId ? `<button class="btn-action" onclick="navigator.clipboard.writeText('${item.fbId}')" style="padding:2px 8px; font-size:11px;">📋 Copy</button>` : '-'}
        </td>
      </tr>
    `).join('');
  }

  if (searchUidInput) {
    searchUidInput.addEventListener('input', renderUidTable);
  }

  if (btnExportUidCsv) {
    btnExportUidCsv.addEventListener('click', () => {
      if (!uidDataset.length) { alert('Chưa có dữ liệu để xuất.'); return; }
      const headers = ['STT', 'Nguồn_Đầu_Vào', 'Facebook_URL', 'Facebook_ID', 'Phương_Pháp', 'Trạng_Thái'];
      const rows = uidDataset.map((item, idx) => ({
        'STT': idx + 1,
        'Nguồn_Đầu_Vào': item.source,
        'Facebook_URL': item.fbUrl,
        'Facebook_ID': item.fbId,
        'Phương_Pháp': item.method,
        'Trạng_Thái': item.status
      }));
      const csv = csvString(rows, headers);
      downloadFile(csv, `facebook_uids_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
    });
  }

  if (btnExportUidJson) {
    btnExportUidJson.addEventListener('click', () => {
      if (!uidDataset.length) { alert('Chưa có dữ liệu để xuất.'); return; }
      const jsonStr = JSON.stringify(uidDataset, null, 2);
      downloadFile(jsonStr, `facebook_uids_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    });
  }

  if (btnPushUidToCrm) {
    btnPushUidToCrm.addEventListener('click', () => {
      const valid = uidDataset.filter(x => x.fbId);
      if (!valid.length) { alert('Không có bản ghi nào có Facebook ID để đẩy vào Master CRM.'); return; }
      const newLeads = valid.map(item => ({
        id: item.fbId,
        fb_id: item.fbId,
        url: item.fbUrl || `https://www.facebook.com/profile.php?id=${item.fbId}`,
        name: item.name || domainOf(item.source) || 'FB Lead',
        official_website: item.source.includes('facebook.com') ? '' : item.source
      }));
      if (typeof onPushToCrm === 'function') {
        onPushToCrm(newLeads);
      }
    });
  }


  // =========================================================================
  // 2. BÓC TÁCH LIÊN HỆ & ĐỊA CHỈ WEBSITE (CONTACT & ADDRESS) CONTROLLER
  // =========================================================================
  let contactRunner = null;
  let contactDataset = [];

  const dropZoneContact = document.getElementById('dropZoneContact');
  const fileInputContact = document.getElementById('fileInputContact');
  const txtBulkLinksContact = document.getElementById('txtBulkLinksContact');
  const workersContact = document.getElementById('workersContact');
  const delayContact = document.getElementById('delayContact');
  const btnStartContact = document.getElementById('btnStartContact');
  const btnPauseContact = document.getElementById('btnPauseContact');
  const btnResumeContact = document.getElementById('btnResumeContact');
  const btnStopContact = document.getElementById('btnStopContact');
  const btnClearContact = document.getElementById('btnClearContact');
  const btnQuickPasteContact = document.getElementById('btnQuickPasteContact');
  const btnExportContactCsv = document.getElementById('btnExportContactCsv');
  const btnPushContactToCrm = document.getElementById('btnPushContactToCrm');
  const searchContactInput = document.getElementById('searchContactInput');
  const contactTableBody = document.getElementById('contactTableBody');

  function updateContactCounts() {
    const text = txtBulkLinksContact ? txtBulkLinksContact.value.trim() : '';
    const lines = text ? text.split('\n').map(l => l.trim()).filter(Boolean) : [];
    const countEl = document.getElementById('lblContactLinkCount');
    if (countEl) countEl.textContent = lines.length;
  }

  if (txtBulkLinksContact) {
    txtBulkLinksContact.addEventListener('input', updateContactCounts);
  }

  if (dropZoneContact && fileInputContact) {
    dropZoneContact.addEventListener('click', () => fileInputContact.click());
    dropZoneContact.addEventListener('dragover', (e) => { e.preventDefault(); dropZoneContact.style.borderColor = 'var(--emerald)'; });
    dropZoneContact.addEventListener('dragleave', () => { dropZoneContact.style.borderColor = 'var(--border-strong)'; });
    dropZoneContact.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZoneContact.style.borderColor = 'var(--border-strong)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleContactFile(e.dataTransfer.files[0]);
      }
    });
    fileInputContact.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleContactFile(e.target.files[0]);
      }
    });
  }

  function handleContactFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const fileNameEl = document.getElementById('lblContactLoadedFileName');
      if (fileNameEl) fileNameEl.textContent = file.name;

      try {
        const table = parseCSV(content);
        if (table.length > 0) {
          const webCol = detectWebsiteColumn(table[0]);
          const targetCol = webCol >= 0 ? webCol : 0;
          const urls = table.slice(1).map(r => r[targetCol] || '').filter(Boolean);
          txtBulkLinksContact.value = urls.join('\n');
          updateContactCounts();
        }
      } catch {
        txtBulkLinksContact.value = content;
        updateContactCounts();
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  if (btnQuickPasteContact) {
    btnQuickPasteContact.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          txtBulkLinksContact.value = text.trim();
          updateContactCounts();
        }
      } catch {}
    });
  }

  if (btnClearContact) {
    btnClearContact.addEventListener('click', () => {
      txtBulkLinksContact.value = '';
      updateContactCounts();
      contactDataset = [];
      renderContactTable();
    });
  }

  contactRunner = new ContactAddressRunner(
    (state) => {
      const total = state.total || 0;
      const current = state.index || 0;
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;

      const fill = document.getElementById('progressFillContact');
      if (fill) fill.style.width = pct + '%';
      const pctEl = document.getElementById('lblContactPercent');
      if (pctEl) pctEl.textContent = pct + '%';
      const countEl = document.getElementById('lblContactCount');
      if (countEl) countEl.textContent = current;
      const totalEl = document.getElementById('lblContactTotal');
      if (totalEl) totalEl.textContent = total;

      const totalKpi = document.getElementById('kpiContactTotal');
      if (totalKpi) totalKpi.textContent = total;
      const emailKpi = document.getElementById('kpiContactEmail');
      if (emailKpi) emailKpi.textContent = contactDataset.filter(x => x.email).length;
      const phoneKpi = document.getElementById('kpiContactPhone');
      if (phoneKpi) phoneKpi.textContent = contactDataset.filter(x => x.phone).length;
      const addrKpi = document.getElementById('kpiContactAddress');
      if (addrKpi) addrKpi.textContent = contactDataset.filter(x => x.city || x.state || x.street).length;

      if (state.lastResult) {
        const existingIdx = contactDataset.findIndex(x => x.row === state.lastResult.row);
        if (existingIdx >= 0) contactDataset[existingIdx] = state.lastResult;
        else contactDataset.push(state.lastResult);
        renderContactTable();

        const previewRow = document.getElementById('previewRowContact');
        if (previewRow) previewRow.style.display = 'flex';
        const pUrl = document.getElementById('previewContactUrl');
        if (pUrl) pUrl.textContent = state.lastResult.website;
        const pPhone = document.getElementById('previewContactPhone');
        if (pPhone) pPhone.textContent = state.lastResult.phone ? `📞 ${state.lastResult.phone}` : (state.lastResult.email ? `✉️ ${state.lastResult.email}` : 'Không có SĐT');
        const pAddr = document.getElementById('previewContactAddress');
        if (pAddr) pAddr.textContent = state.lastResult.fullAddress || 'Chưa tìm thấy địa chỉ US';
      }

      if (state.completed) {
        btnStartContact.style.display = 'inline-flex';
        btnPauseContact.style.display = 'none';
        btnResumeContact.style.display = 'none';
        const statusEl = document.getElementById('lblContactStatus');
        if (statusEl) statusEl.textContent = 'Đã hoàn thành cào liên hệ!';
      }
    },
    (logMsg) => {
      const taskEl = document.getElementById('lblContactCurrentTask');
      if (taskEl) taskEl.textContent = logMsg;
    }
  );

  if (btnStartContact) {
    btnStartContact.addEventListener('click', () => {
      const text = txtBulkLinksContact.value.trim();
      if (!text) {
        alert('Vui lòng dán danh sách link website hoặc nạp file trước khi bắt đầu.');
        return;
      }
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const records = lines.map((url, i) => ({ row: i + 1, original: url, url, name: '' }));
      contactDataset = [];
      const numWorkers = parseInt(workersContact?.value || '3', 10);
      const delaySec = parseFloat(delayContact?.value || '1');
      contactRunner.setJob(records, numWorkers, delaySec);
      btnStartContact.style.display = 'none';
      btnPauseContact.style.display = 'inline-flex';
      btnResumeContact.style.display = 'none';
      const statusEl = document.getElementById('lblContactStatus');
      if (statusEl) statusEl.textContent = 'Đang cào địa chỉ & liên hệ...';
      contactRunner.start();
    });
  }

  if (btnPauseContact) {
    btnPauseContact.addEventListener('click', () => {
      contactRunner.pause();
      btnPauseContact.style.display = 'none';
      btnResumeContact.style.display = 'inline-flex';
      const statusEl = document.getElementById('lblContactStatus');
      if (statusEl) statusEl.textContent = 'Đã tạm dừng';
    });
  }

  if (btnResumeContact) {
    btnResumeContact.addEventListener('click', () => {
      btnResumeContact.style.display = 'none';
      btnPauseContact.style.display = 'inline-flex';
      const statusEl = document.getElementById('lblContactStatus');
      if (statusEl) statusEl.textContent = 'Đang tiếp tục cào...';
      contactRunner.start();
    });
  }

  if (btnStopContact) {
    btnStopContact.addEventListener('click', () => {
      contactRunner.stop();
      btnStartContact.style.display = 'inline-flex';
      btnPauseContact.style.display = 'none';
      btnResumeContact.style.display = 'none';
      const statusEl = document.getElementById('lblContactStatus');
      if (statusEl) statusEl.textContent = 'Đã dừng lại.';
    });
  }

  function renderContactTable() {
    if (!contactTableBody) return;
    const query = (searchContactInput?.value || '').toLowerCase().trim();
    const filtered = contactDataset.filter(item => {
      if (!query) return true;
      return (item.website && item.website.toLowerCase().includes(query)) ||
        (item.email && item.email.toLowerCase().includes(query)) ||
        (item.phone && item.phone.includes(query)) ||
        (item.city && item.city.toLowerCase().includes(query)) ||
        (item.state && item.state.toLowerCase().includes(query));
    });

    const resCount = document.getElementById('lblContactResultCount');
    if (resCount) resCount.textContent = filtered.length;

    if (filtered.length === 0) {
      contactTableBody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:30px; color:var(--text-muted);">Không tìm thấy bản ghi phù hợp.</td></tr>`;
      return;
    }

    contactTableBody.innerHTML = filtered.map((item, idx) => `
      <tr>
        <td style="font-family:var(--mono); text-align:center;">${idx + 1}</td>
        <td style="font-weight:700;">${item.sourceName || domainOf(item.website)}</td>
        <td style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          <a href="${item.website.startsWith('http') ? item.website : 'https://' + item.website}" target="_blank" style="color:var(--text);">${item.website}</a>
        </td>
        <td>${item.email ? `<span style="color:var(--primary); font-weight:600;">✉️ ${item.email}</span>` : '<span style="color:var(--text-muted);">-</span>'}</td>
        <td>${item.phone ? `<span style="color:var(--emerald); font-weight:700; font-family:var(--mono);">📞 ${item.phone}</span>` : '<span style="color:var(--text-muted);">-</span>'}</td>
        <td style="max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.street || '-'}</td>
        <td>${item.city || '-'}</td>
        <td>${item.state ? `<strong style="color:var(--sky);">${item.state}</strong>` : '-'}</td>
        <td style="font-family:var(--mono);">${item.zip || '-'}</td>
        <td style="max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${item.facebookUrl ? `<a href="${item.facebookUrl}" target="_blank" style="color:#0284c7;">${item.facebookUrl}</a>` : '-'}
        </td>
        <td>
          <button class="btn-action" onclick="navigator.clipboard.writeText('${item.phone || item.email || item.fullAddress}')" style="padding:2px 8px; font-size:11px;">Copy</button>
        </td>
      </tr>
    `).join('');
  }

  if (searchContactInput) {
    searchContactInput.addEventListener('input', renderContactTable);
  }

  if (btnExportContactCsv) {
    btnExportContactCsv.addEventListener('click', () => {
      if (!contactDataset.length) { alert('Chưa có dữ liệu để xuất.'); return; }
      const headers = ['STT', 'Tên_Cơ_Sở', 'Website', 'Email', 'Tất_Cả_Email', 'Số_Điện_Thoại', 'Tất_Cả_SĐT', 'Đường_Street', 'Thành_Phố', 'Bang_State', 'ZipCode', 'Quốc_Gia', 'Địa_Chỉ_Đầy_Đủ', 'Facebook_URL', 'Facebook_ID', 'Trạng_Thái'];
      const rows = contactDataset.map((item, idx) => ({
        'STT': idx + 1,
        'Tên_Cơ_Sở': item.sourceName || domainOf(item.website),
        'Website': item.website,
        'Email': item.email,
        'Tất_Cả_Email': item.allEmails,
        'Số_Điện_Thoại': item.phone,
        'Tất_Cả_SĐT': item.allPhones,
        'Đường_Street': item.street,
        'Thành_Phố': item.city,
        'Bang_State': item.state,
        'ZipCode': item.zip,
        'Quốc_Gia': item.country,
        'Địa_Chỉ_Đầy_Đủ': item.fullAddress,
        'Facebook_URL': item.facebookUrl,
        'Facebook_ID': item.facebookId,
        'Trạng_Thái': item.status
      }));
      const csv = csvString(rows, headers);
      downloadFile(csv, `website_contacts_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
    });
  }

  if (btnPushContactToCrm) {
    btnPushContactToCrm.addEventListener('click', () => {
      const valid = contactDataset.filter(x => x.phone || x.email || x.city || x.facebookUrl);
      if (!valid.length) { alert('Không có bản ghi nào có thông tin liên hệ để đẩy vào Master CRM.'); return; }
      const newLeads = valid.map(item => ({
        id: item.facebookId || `gen_${Math.random().toString(36).substring(2, 10)}`,
        fb_id: item.facebookId || '',
        name: item.sourceName || domainOf(item.website),
        official_website: item.website,
        phone: item.phone,
        email: item.email,
        city: item.city,
        state: item.state,
        zip_code: item.zip,
        full_address: item.fullAddress,
        url: item.facebookUrl || ''
      }));
      if (typeof onPushToCrm === 'function') {
        onPushToCrm(newLeads);
      }
    });
  }


  // =========================================================================
  // 3. TÌM CHỦ TRẠI / NGƯỜI ĐẠI DIỆN WEBSITE (ORIGINAL WEBSITE OWNER FINDER)
  // =========================================================================
  let ownerRunner = null;
  let ownerState = null;
  let renderedVisited = [];

  const dropZoneOwner = document.getElementById('dropZoneOwner');
  const fileInputOwner = document.getElementById('fileInputOwner');
  const txtBulkLinksOwner = document.getElementById('txtBulkLinksOwner');
  const scanModeOwner = document.getElementById('scanModeOwner');
  const chkShowGoogleTabOwner = document.getElementById('chkShowGoogleTabOwner');
  const chkPauseOnBlockOwner = document.getElementById('chkPauseOnBlockOwner');
  const chkUseTransformerOwner = document.getElementById('chkUseTransformerOwner');
  const txtGeminiApiKey = document.getElementById('txtGeminiApiKey');
  const btnSaveApiKey = document.getElementById('btnSaveApiKey');
  const btnTestApiKey = document.getElementById('btnTestApiKey');
  const lblApiKeyStatus = document.getElementById('lblApiKeyStatus');
  const workersOwner = document.getElementById('workersOwner');
  const maxAboutPagesOwner = document.getElementById('maxAboutPagesOwner');
  const timeoutOwner = document.getElementById('timeoutOwner');
  const delayOwner = document.getElementById('delayOwner');
  const btnStartOwner = document.getElementById('btnStartOwner');
  const btnPauseOwner = document.getElementById('btnPauseOwner');
  const btnResumeOwner = document.getElementById('btnResumeOwner');
  const btnSkipOwner = document.getElementById('btnSkipOwner');
  const btnStopOwner = document.getElementById('btnStopOwner');
  const btnClearOwner = document.getElementById('btnClearOwner');
  const btnQuickPasteOwner = document.getElementById('btnQuickPasteOwner');
  const btnExportOwnerCsv = document.getElementById('btnExportOwnerCsv');
  const btnPushOwnerToCrm = document.getElementById('btnPushOwnerToCrm');
  const btnCopyAiLogOwner = document.getElementById('btnCopyAiLogOwner');
  const btnClearAiLogOwner = document.getElementById('btnClearAiLogOwner');
  const searchOwnerInput = document.getElementById('searchOwnerInput');
  const ownerTableBody = document.getElementById('ownerTableBody');
  const aiLogBoxOwner = document.getElementById('aiLogBoxOwner');
  const lblAiLogSummaryOwner = document.getElementById('lblAiLogSummaryOwner');
  const visitedLinksOwner = document.getElementById('visitedLinksOwner');
  const lblOwnerVisitedCount = document.getElementById('lblOwnerVisitedCount');

  // Load saved Gemini API Key & Scan Mode
  if (txtGeminiApiKey) {
    const savedKey = localStorage.getItem('pet_lead_gemini_api_key') || '';
    if (savedKey) {
      txtGeminiApiKey.value = savedKey;
      if (lblApiKeyStatus) lblApiKeyStatus.textContent = '✓ Đã nạp Gemini API Key từ bộ nhớ.';
    }
  }

  if (scanModeOwner) {
    const savedMode = localStorage.getItem('pet_lead_owner_scan_mode') || 'gemini_direct';
    scanModeOwner.value = savedMode;
    scanModeOwner.addEventListener('change', () => {
      localStorage.setItem('pet_lead_owner_scan_mode', scanModeOwner.value);
    });
  }

  if (btnSaveApiKey) {
    btnSaveApiKey.addEventListener('click', () => {
      const key = (txtGeminiApiKey?.value || '').trim();
      localStorage.setItem('pet_lead_gemini_api_key', key);
      if (lblApiKeyStatus) lblApiKeyStatus.textContent = key ? '✓ Đã lưu API Key thành công!' : 'Đã xóa API Key.';
    });
  }

  if (btnTestApiKey) {
    btnTestApiKey.addEventListener('click', async () => {
      const key = (txtGeminiApiKey?.value || '').trim();
      if (!key) { alert('Vui lòng nhập API Key trước khi test.'); return; }
      if (lblApiKeyStatus) lblApiKeyStatus.textContent = 'Đang kiểm tra kết nối Google Gemini API...';
      try {
        const testRes = await testGeminiApiKey(key);
        if (testRes.ok) {
          if (lblApiKeyStatus) lblApiKeyStatus.textContent = '✓ ' + testRes.info;
        } else {
          if (lblApiKeyStatus) lblApiKeyStatus.textContent = '❌ ' + testRes.error;
        }
      } catch (err) {
        if (lblApiKeyStatus) lblApiKeyStatus.textContent = '❌ Lỗi API Key: ' + err.message;
      }
    });
  }

  function updateOwnerCounts() {
    const text = txtBulkLinksOwner ? txtBulkLinksOwner.value.trim() : '';
    const lines = text ? text.split('\n').map(l => l.trim()).filter(Boolean) : [];
    const countEl = document.getElementById('lblOwnerLinkCount');
    if (countEl) countEl.textContent = lines.length;
  }

  if (txtBulkLinksOwner) {
    txtBulkLinksOwner.addEventListener('input', updateOwnerCounts);
  }

  if (dropZoneOwner && fileInputOwner) {
    dropZoneOwner.addEventListener('click', () => fileInputOwner.click());
    dropZoneOwner.addEventListener('dragover', (e) => { e.preventDefault(); dropZoneOwner.style.borderColor = 'var(--primary)'; });
    dropZoneOwner.addEventListener('dragleave', () => { dropZoneOwner.style.borderColor = 'var(--border-strong)'; });
    dropZoneOwner.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZoneOwner.style.borderColor = 'var(--border-strong)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleOwnerFile(e.dataTransfer.files[0]);
      }
    });
    fileInputOwner.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleOwnerFile(e.target.files[0]);
      }
    });
  }

  function handleOwnerFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const fileNameEl = document.getElementById('lblOwnerLoadedFileName');
      if (fileNameEl) fileNameEl.textContent = file.name;

      try {
        const table = parseCSV(content);
        if (table.length > 0) {
          const webCol = detectWebsiteColumn(table[0]);
          const targetCol = webCol >= 0 ? webCol : 0;
          const urls = table.slice(1).map(r => r[targetCol] || '').filter(Boolean);
          txtBulkLinksOwner.value = urls.join('\n');
          updateOwnerCounts();
        }
      } catch {
        txtBulkLinksOwner.value = content;
        updateOwnerCounts();
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  if (btnQuickPasteOwner) {
    btnQuickPasteOwner.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          txtBulkLinksOwner.value = text.trim();
          updateOwnerCounts();
        }
      } catch {}
    });
  }

  // Khởi tạo Runner chuẩn Website Owner Finder
  ownerRunner = new OwnerRunner(
    (state) => renderOwnerState(state),
    (logMsg) => {
      const taskEl = document.getElementById('lblOwnerCurrentTask');
      if (taskEl) taskEl.textContent = logMsg;
    }
  );

  // Tải trạng thái trước đó nếu có
  ownerRunner.load().catch(() => {});

  function renderOwnerState(s) {
    if (!s) return;
    ownerState = s;

    const total = (s.records || []).length;
    const current = s.index || 0;
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;

    const fill = document.getElementById('progressFillOwner');
    if (fill) fill.style.width = pct + '%';
    const pctEl = document.getElementById('lblOwnerPercent');
    if (pctEl) pctEl.textContent = pct + '%';
    const countEl = document.getElementById('lblOwnerCount');
    if (countEl) countEl.textContent = current;
    const totalEl = document.getElementById('lblOwnerTotal');
    if (totalEl) totalEl.textContent = total;

    const statusEl = document.getElementById('lblOwnerStatus');
    if (statusEl) statusEl.textContent = s.status || 'Sẵn sàng';

    // KPIs
    const completed = (s.results || []).filter(Boolean);
    const processed = completed.length;
    const ownerFound = completed.filter(r => r.OwnerName).length;
    const aiFound = completed.filter(r => r.OwnerSource && (r.OwnerSource.includes('Gemini') || r.OwnerSource.includes('Google AI'))).length;

    const totalKpi = document.getElementById('kpiOwnerTotal');
    if (totalKpi) totalKpi.textContent = total;
    const foundKpi = document.getElementById('kpiOwnerFound');
    if (foundKpi) foundKpi.textContent = ownerFound;
    const aiKpi = document.getElementById('kpiOwnerAi');
    if (aiKpi) aiKpi.textContent = aiFound;
    const rateKpi = document.getElementById('kpiOwnerRate');
    if (rateKpi) {
      rateKpi.textContent = processed > 0 ? Math.round((ownerFound / processed) * 100) + '%' : '0%';
    }

    // Nút bấm theo trạng thái
    if (s.status === 'Đang chạy') {
      if (btnStartOwner) btnStartOwner.style.display = 'none';
      if (btnPauseOwner) btnPauseOwner.style.display = 'inline-flex';
      if (btnResumeOwner) btnResumeOwner.style.display = 'none';
    } else if (s.status && (s.status.includes('tạm dừng') || s.status.includes('thủ công'))) {
      if (btnStartOwner) btnStartOwner.style.display = 'none';
      if (btnPauseOwner) btnPauseOwner.style.display = 'none';
      if (btnResumeOwner) btnResumeOwner.style.display = 'inline-flex';
    } else {
      if (btnStartOwner) btnStartOwner.style.display = 'inline-flex';
      if (btnPauseOwner) btnPauseOwner.style.display = 'none';
      if (btnResumeOwner) btnResumeOwner.style.display = 'none';
    }

    // Preview thẻ gần nhất
    const lastResult = s.partial || completed[completed.length - 1];
    if (lastResult) {
      const previewRow = document.getElementById('previewRowOwner');
      if (previewRow) previewRow.style.display = 'flex';
      const pWeb = document.getElementById('previewOwnerWebsite');
      if (pWeb) pWeb.textContent = lastResult.Website || lastResult.ResolvedURL || '...';
      const pName = document.getElementById('previewOwnerName');
      if (pName) pName.textContent = lastResult.OwnerName ? `Chủ trại: ${lastResult.OwnerName}` : 'Chưa rõ tên chủ';
      const pSrc = document.getElementById('previewOwnerSource');
      if (pSrc) pSrc.textContent = lastResult.OwnerSource || lastResult.Status || '';
    }

    // Cập nhật Nhật ký Google AI & Gemini Live Log Box
    if (s.lastAILog && aiLogBoxOwner) {
      const log = s.lastAILog;
      if (lblAiLogSummaryOwner) {
        lblAiLogSummaryOwner.innerHTML = `Website: <b style="color:#6366f1">${log.domain || ''}</b> lúc <b>${log.time || ''}</b> (Độ dài cào: <b>${log.rawLength || 0}</b> ký tự)`;
      }
      let content = `======================================================================\n`;
      content += `🌐 DOMAIN: ${log.domain || ''} | THỜI GIAN: ${log.time || ''}\n`;
      content += `======================================================================\n\n`;
      content += `📄 [1. NỘI DUNG VĂN BẢN VÀ LINK TRÍCH DẪN THU ĐƯỢC TỪ GOOGLE AI]:\n`;
      content += `----------------------------------------------------------------------\n`;
      content += (log.rawText ? log.rawText : '(Không cào được văn bản)') + `\n\n`;

      const source = log.source || (log.geminiCalled ? 'gemini' : 'regex');
      if (source === 'google_ai_json') {
        content += `🌐 [2. KẾT QUẢ TRỰC TIẾP TỪ GOOGLE AI (Tiết kiệm 100% token Gemini)]:\n`;
        content += `----------------------------------------------------------------------\n`;
        content += JSON.stringify(log.geminiResult, null, 2) + `\n`;
      } else {
        content += `🤖 [2. KẾT QUẢ XỬ LÝ VỚI GEMINI API]:\n`;
        content += `----------------------------------------------------------------------\n`;
        if (log.geminiResult) content += JSON.stringify(log.geminiResult, null, 2) + `\n`;
        else if (log.error) content += `❌ THÔNG BÁO: ${log.error}\n`;
        else content += `(Không có kết quả)\n`;
      }
      aiLogBoxOwner.textContent = content;
    }

    // Cập nhật Link đã truy cập
    const visited = s.visitedUrls || [];
    if (lblOwnerVisitedCount) lblOwnerVisitedCount.textContent = visited.length + ' link';
    if (visitedLinksOwner && (visited.length !== renderedVisited.length)) {
      renderedVisited = [...visited];
      visitedLinksOwner.innerHTML = visited.length ? visited.map(u => `
        <a href="${u}" target="_blank" rel="noopener" style="color:var(--text); text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:2px 0; border-bottom:1px solid rgba(255,255,255,0.05);">🔗 ${u}</a>
      `).join('') : '<span style="color:var(--text-muted);">(Chưa có link nào)</span>';
    }

    renderOwnerTable();
  }

  function renderOwnerTable() {
    if (!ownerTableBody || !ownerState) return;
    const records = ownerState.records || [];
    const results = ownerState.results || [];
    const partial = ownerState.partial;

    const dataset = records.map((r, i) => results[i] || (i === ownerState.index && partial) || null).filter(Boolean);

    const query = (searchOwnerInput?.value || '').toLowerCase().trim();
    const filtered = dataset.filter(item => {
      if (!query) return true;
      return (item.OwnerName && item.OwnerName.toLowerCase().includes(query)) ||
        (item.Website && item.Website.toLowerCase().includes(query)) ||
        (item.OwnerTitle && item.OwnerTitle.toLowerCase().includes(query)) ||
        (item.CompanyName && item.CompanyName.toLowerCase().includes(query)) ||
        (item.BreederName && item.BreederName.toLowerCase().includes(query));
    });

    const resCount = document.getElementById('lblOwnerResultCount');
    if (resCount) resCount.textContent = filtered.length;

    if (filtered.length === 0) {
      ownerTableBody.innerHTML = `<tr><td colspan="14" style="text-align:center; padding:30px; color:var(--text-muted);">Chưa có dữ liệu phù hợp.</td></tr>`;
      return;
    }

    ownerTableBody.innerHTML = filtered.map((item, idx) => `
      <tr>
        <td style="font-family:var(--mono); text-align:center; font-weight:700;">${item.SourceRow || idx + 1}</td>
        <td style="font-weight:700;">${item.BreederName || domainOf(item.Website || item.ResolvedURL)}</td>
        <td style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          <a href="${item.Website && item.Website.startsWith('http') ? item.Website : 'https://' + (item.Website || '')}" target="_blank" rel="noopener" style="color:var(--text); font-weight:600;">${item.Website || '-'}</a>
        </td>
        <td>
          ${item.OwnerName ? `<strong style="color:var(--emerald); font-size:13px;">👤 ${item.OwnerName}</strong>` : '<span style="color:var(--text-muted); font-size:11px;">Chưa rõ</span>'}
        </td>
        <td style="font-size:11.5px; color:var(--text-muted);">${item.OwnerTitle || '-'}</td>
        <td style="font-size:11.5px; font-weight:600;">${item.CompanyName || '-'}</td>
        <td style="font-size:11px; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          <span class="badge ${item.OwnerSource && item.OwnerSource.includes('Gemini') ? 'primary' : 'success'}" style="font-size:10px;">${item.OwnerSource || '-'}</span>
        </td>
        <td style="font-size:11px; font-family:var(--mono);">${item.OwnerEmail ? `<a href="mailto:${item.OwnerEmail}" style="color:var(--sky);">${item.OwnerEmail}</a>` : '-'}</td>
        <td style="font-size:11px; font-family:var(--mono);">${item.Phone || '-'}</td>
        <td style="font-size:11px; color:var(--text-muted); max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.Address || '-'}</td>
        <td style="font-size:11px; max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.Socials || '-'}</td>
        <td style="font-size:11px; color:var(--text-muted); max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.Notes || '-'}</td>
        <td>
          <span class="badge ${item.Status && (item.Status.includes('Đủ') || item.Status.includes('Hoàn tất')) ? 'success' : item.Status && item.Status.includes('Lỗi') ? 'danger' : 'neutral'}" style="font-size:10px;">${item.Status || '-'}</span>
        </td>
        <td>
          ${item.OwnerName ? `<button class="btn-action" onclick="navigator.clipboard.writeText('${item.OwnerName}')" style="padding:2px 8px; font-size:11px;" title="Copy tên chủ">📋 Copy</button>` : '-'}
        </td>
      </tr>
    `).join('');
  }

  if (searchOwnerInput) {
    searchOwnerInput.addEventListener('input', renderOwnerTable);
  }

  if (btnStartOwner) {
    btnStartOwner.addEventListener('click', async () => {
      const text = txtBulkLinksOwner.value.trim();
      if (!text) {
        alert('Vui lòng dán danh sách website hoặc nạp file trước khi bắt đầu.');
        return;
      }
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const records = lines.map((url, i) => ({
        row: i + 1,
        name: '',
        area: '',
        original: url,
        url: normalizeURL(url)
      }));

      const settings = {
        scanMode: scanModeOwner?.value || 'gemini_direct',
        showGoogleTab: Boolean(chkShowGoogleTabOwner?.checked),
        pauseOnBlock: Boolean(chkPauseOnBlockOwner?.checked),
        useTransformer: Boolean(chkUseTransformerOwner?.checked),
        parallel: Math.max(1, Math.min(12, parseInt(workersOwner?.value || '3', 10))),
        delay: Number(delayOwner?.value) || 1,
        timeout: Number(timeoutOwner?.value) || 30,
        maxAboutPages: Number(maxAboutPagesOwner?.value) || 3,
        geminiApiKey: (txtGeminiApiKey?.value || '').trim(),
        active: true
      };

      try {
        await ownerRunner.setJob(records, settings);
        ownerRunner.start();
      } catch (err) {
        alert('Lỗi khởi tạo tác vụ: ' + err.message);
      }
    });
  }

  if (btnPauseOwner) {
    btnPauseOwner.addEventListener('click', () => {
      ownerRunner.pause();
    });
  }

  if (btnResumeOwner) {
    btnResumeOwner.addEventListener('click', () => {
      ownerRunner.start();
    });
  }

  if (btnSkipOwner) {
    btnSkipOwner.addEventListener('click', () => {
      ownerRunner.skip().catch(err => alert(err.message));
    });
  }

  if (btnStopOwner) {
    btnStopOwner.addEventListener('click', () => {
      ownerRunner.pause();
    });
  }

  if (btnClearOwner) {
    btnClearOwner.addEventListener('click', () => {
      txtBulkLinksOwner.value = '';
      updateOwnerCounts();
      ownerRunner.reset().catch(() => {});
    });
  }

  if (btnCopyAiLogOwner) {
    btnCopyAiLogOwner.addEventListener('click', () => {
      if (!aiLogBoxOwner) return;
      navigator.clipboard.writeText(aiLogBoxOwner.textContent);
      alert('Đã sao chép nội dung nhật ký AI vào Clipboard!');
    });
  }

  if (btnClearAiLogOwner) {
    btnClearAiLogOwner.addEventListener('click', () => {
      if (aiLogBoxOwner) aiLogBoxOwner.textContent = '(Đã xóa nhật ký)';
      if (lblAiLogSummaryOwner) lblAiLogSummaryOwner.textContent = '';
    });
  }

  if (btnExportOwnerCsv) {
    btnExportOwnerCsv.addEventListener('click', () => {
      const rows = ownerRunner.exportRows();
      if (!rows.length) { alert('Chưa có dữ liệu để xuất.'); return; }
      const exportHeaders = ['SourceRow', 'BreederName', 'Area', 'Website', 'ResolvedURL', 'OwnerName', 'OwnerTitle', 'CompanyName', 'OwnerSource', 'OwnerEmail', 'Phone', 'Address', 'Socials', 'Status', 'Notes'];
      const csv = csvString(rows, exportHeaders);
      downloadFile(csv, `website_owners_full_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
    });
  }

  if (btnPushOwnerToCrm) {
    btnPushOwnerToCrm.addEventListener('click', () => {
      const rows = ownerRunner.exportRows();
      const valid = rows.filter(x => x && x.OwnerName);
      if (!valid.length) { alert('Không có bản ghi nào có tên chủ trại để đẩy vào Master CRM.'); return; }
      const newLeads = valid.map(item => ({
        id: `owner_${Math.random().toString(36).substring(2, 10)}`,
        fb_id: '',
        name: item.BreederName || domainOf(item.Website || item.ResolvedURL),
        official_website: item.Website || item.ResolvedURL,
        owner_name: item.OwnerName,
        owner_title: item.OwnerTitle || 'Owner / Breeder',
        phone: item.Phone || '',
        email: item.OwnerEmail || '',
        location: item.Address || ''
      }));
      if (typeof onPushToCrm === 'function') {
        onPushToCrm(newLeads);
      }
    });
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

