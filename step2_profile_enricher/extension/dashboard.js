/**
 * 🐾 Pet Lead AI — Dedicated Full-Screen Dashboard & Meta CRM Controller
 * Step 2: FB Profile Funnel Scraper, Visual Timeline Inspector & Lead CRM
 */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // App State
  let currentLang = 'vi';
  let allLeads = [];
  let isAutoRunning = false;
  let isPaused = false;
  let currentIndex = 0;
  let autoScrollLog = true;

  // Dictionary Song Ngữ (VI / ZH)
  const I18N = {
    vi: {
      brandTitle: "Pet Lead AI — FB Profile Funnel & Meta CRM",
      brandSubtitle: "Bóc tách Toàn diện: Chủ trại • Ngày đăng timeline • SĐT/Email • Kênh Amazon • Quản lý CRM 30 Trường Trực Tiếp",
      modeBadge: "Step 2: Profile Funnel Engine",
      btnImportStep1: "Nạp Lead Bước 1",
      btnTopPriority8: "Xuất Excel 37 Cột (Giao Sếp)",
      btnTopJson: "Xuất JSON LEAD-US",
      btnAddNew: "Thêm Lead Mới",
      cardFunnelTitle: "Bảng Điều Khiển Cào Phễu Profile Facebook",
      btnQuickPaste: "Dán từ Clipboard",
      fromLine: "Từ dòng:",
      toLine: "Đến dòng:",
      btnClearUrls: "Xóa link",
      btnStart: "Bắt đầu cào phễu",
      btnResume: "Tiếp tục cào",
      btnPause: "Tạm dừng",
      btnClearData: "Xóa dữ liệu CRM",
      terminalTitle: "Terminal Giám Sát Thời Gian Thực (Live Inspector)",
      autoScrollOn: "Cuộn tự động: BẬT",
      autoScrollOff: "Cuộn tự động: TẮT",
      clearLog: "Xóa log",
      kpiTotal: "Tổng Hồ Sơ CRM",
      kpiOwner: "Đã Tìm Thấy Chủ Trại",
      kpiAmazon: "Có Kênh Bán Amazon",
      kpiActive: "Đăng Bài Gần Đây (Tích Cực)",
      kpiTierS: "Khách Tiềm Năng Tier S/A",
      searchPlaceholder: "Tìm kiếm theo Tên chủ trại, Tên trại, SĐT, Email, Thành phố, FB ID...",
      showingCount: "Hiển thị:",
      thStt: "STT",
      thAvatar: "Ảnh Đại Diện",
      thOwner: "Tên Chủ Trại (Owner)",
      thName: "Tên Trại / Doanh Nghiệp",
      thFbId: "Facebook ID",
      thContact: "SĐT & Email",
      thWebsite: "Website Chính Thức",
      thAmazon: "Kênh Bán Amazon",
      thLocation: "Vị Trí (City, State)",
      thPublish: "Bài Đăng Gần Nhất",
      thCategory: "Nhóm Khách Hàng",
      thProduct: "Sản Phẩm Phù Hợp",
      thTier: "Xếp Hạng & Điểm",
      thActions: "Hành Động",
      modalTitle: "Chỉnh Sửa Hồ Sơ Khách Hàng CRM (Trực Tiếp)",
      btnModalCancel: "Hủy Bỏ",
      btnModalSave: "💾 Lưu Thay Đổi Ngay",
      openFbTitle: "Mở trang Facebook cá nhân trong tab mới",
      editCellTitle: "Nhấn để sửa thông tin trực tiếp",
      copyIdTitle: "Sao chép ID số",
      editBtn: "✏️ Sửa",
      openFbBtn: "🔗 FB",
      copyIdBtn: "📋 ID",
      delBtn: "🗑",
      confirmDel: "Bạn có chắc muốn xóa hồ sơ này khỏi bảng CRM?",
      confirmClear: "Bạn có chắc chắn muốn xóa sạch toàn bộ hồ sơ CRM?",
      pastedSuccess: (n) => `✅ Đã dán thành công ${n} link Facebook từ Clipboard!`,
      importedSuccess: (n) => `✅ Đã nạp thành công ${n} link Facebook từ Step 1!`,
      noStep1Leads: "Chưa tìm thấy danh sách link từ Step 1 trong bộ nhớ."
    },
    zh: {
      brandTitle: "Pet Lead AI — FB 主页漏斗与潜客 Meta CRM",
      brandSubtitle: "全维度深度挖掘：犬舍主理人 • 发帖时间戳 • 电话/邮箱 • 亚马逊渠道 • 30个字段实时编辑",
      modeBadge: "Step 2: 主页深度解析引擎",
      btnImportStep1: "从步骤1导入潜客",
      btnTopPriority8: "导出37列Excel (工作汇报)",
      btnTopJson: "导出 JSON LEAD-US",
      btnAddNew: "新增客户",
      cardFunnelTitle: "Facebook 主页漏斗自动化控制面板",
      btnQuickPaste: "从剪贴板粘贴",
      fromLine: "起始行:",
      toLine: "结束行:",
      btnClearUrls: "清空链接",
      btnStart: "开始深度解析",
      btnResume: "继续解析",
      btnPause: "暂停",
      btnClearData: "清空CRM数据",
      terminalTitle: "实时日志控制台 (Live Inspector)",
      autoScrollOn: "自动滚动: 开启",
      autoScrollOff: "自动滚动: 关闭",
      clearLog: "清空日志",
      kpiTotal: "CRM潜客总数",
      kpiOwner: "已查明主理人",
      kpiAmazon: "开设亚马逊店铺",
      kpiActive: "近期活跃 (正常发帖)",
      kpiTierS: "高优先级客户 Tier S/A",
      searchPlaceholder: "按主理人、犬舍名称、电话、邮箱、城市、FB ID快速筛选...",
      showingCount: "显示:",
      thStt: "编号",
      thAvatar: "头像",
      thOwner: "主理人姓名 (Owner)",
      thName: "犬舍 / 企业名称",
      thFbId: "Facebook ID",
      thContact: "电话 & 邮箱",
      thWebsite: "官方网站",
      thAmazon: "亚马逊销售渠道",
      thLocation: "地理位置 (州/市)",
      thPublish: "最新发帖时间",
      thCategory: "客户分类",
      thProduct: "推荐匹配产品",
      thTier: "评级与评分",
      thActions: "操作",
      modalTitle: "编辑客户档案 (实时更新)",
      btnModalCancel: "取消",
      btnModalSave: "💾 立即保存修改",
      openFbTitle: "在新标签页中打开Facebook个人主页",
      editCellTitle: "点击直接编辑此字段",
      copyIdTitle: "复制纯数字ID",
      editBtn: "✏️ 编辑",
      openFbBtn: "🔗 主页",
      copyIdBtn: "📋 复制",
      delBtn: "🗑",
      confirmDel: "确定要从CRM列表中删除此档案吗？",
      confirmClear: "确定要清空全部CRM潜客数据吗？",
      pastedSuccess: (n) => `✅ 已成功从剪贴板粘贴 ${n} 个Facebook链接！`,
      importedSuccess: (n) => `✅ 已从步骤1成功载入 ${n} 个目标主页链接！`,
      noStep1Leads: "未在存储中找到步骤1采集的潜客数据。"
    }
  };

  const t = () => I18N[currentLang];

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function copyText(val) {
    if (!val) return;
    navigator.clipboard.writeText(String(val)).then(() => {
      appendTerminalLog(`📋 Đã sao chép vào bộ nhớ: ${val}`, 'info');
    }).catch(() => {});
  }
  window.copyText = copyText;

  // =========================================================================
  // BẢNG TRA CỨU ẢNH ĐẠI DIỆN THỰC TẾ TỪ STEP 1 (FACEBOOK CDN HD)
  // =========================================================================
  const STEP1_AVATAR_LOOKUP = {
    // 1. Dog Corgleone & Crew (Boss)
    "100084312634205": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/860805257_1098152873005124_4605925114019750735_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx2040x2048&_nc_cat=106&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=H-dxwKOn2uEQ7kNvwEHmMHw&_nc_oc=Ado_X2zDXa74N2fy5kMxECcjv9Peq1k9pM8HUcl2m-ptA2Uayv8guroF9RTPnbjoqWE&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=InjjjM6AQQPVR-3vJ1R-tQ&_nc_ss=7b2a8&oh=00_AQOK_38HiFqqz_SabJn0EAOK2UizRCRu66RDQt-_Jbm9YQ&oe=6ADE4522",
    "1098152873005124": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/860805257_1098152873005124_4605925114019750735_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx2040x2048&_nc_cat=106&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=H-dxwKOn2uEQ7kNvwEHmMHw&_nc_oc=Ado_X2zDXa74N2fy5kMxECcjv9Peq1k9pM8HUcl2m-ptA2Uayv8guroF9RTPnbjoqWE&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=InjjjM6AQQPVR-3vJ1R-tQ&_nc_ss=7b2a8&oh=00_AQOK_38HiFqqz_SabJn0EAOK2UizRCRu66RDQt-_Jbm9YQ&oe=6ADE4522",
    "dogcorgleone": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/860805257_1098152873005124_4605925114019750735_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx2040x2048&_nc_cat=106&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=H-dxwKOn2uEQ7kNvwEHmMHw&_nc_oc=Ado_X2zDXa74N2fy5kMxECcjv9Peq1k9pM8HUcl2m-ptA2Uayv8guroF9RTPnbjoqWE&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=InjjjM6AQQPVR-3vJ1R-tQ&_nc_ss=7b2a8&oh=00_AQOK_38HiFqqz_SabJn0EAOK2UizRCRu66RDQt-_Jbm9YQ&oe=6ADE4522",
    "dog corgleone": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/860805257_1098152873005124_4605925114019750735_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx2040x2048&_nc_cat=106&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=H-dxwKOn2uEQ7kNvwEHmMHw&_nc_oc=Ado_X2zDXa74N2fy5kMxECcjv9Peq1k9pM8HUcl2m-ptA2Uayv8guroF9RTPnbjoqWE&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=InjjjM6AQQPVR-3vJ1R-tQ&_nc_ss=7b2a8&oh=00_AQOK_38HiFqqz_SabJn0EAOK2UizRCRu66RDQt-_Jbm9YQ&oe=6ADE4522",
    "dog corgleone & crew (boss)": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/860805257_1098152873005124_4605925114019750735_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx2040x2048&_nc_cat=106&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=H-dxwKOn2uEQ7kNvwEHmMHw&_nc_oc=Ado_X2zDXa74N2fy5kMxECcjv9Peq1k9pM8HUcl2m-ptA2Uayv8guroF9RTPnbjoqWE&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=InjjjM6AQQPVR-3vJ1R-tQ&_nc_ss=7b2a8&oh=00_AQOK_38HiFqqz_SabJn0EAOK2UizRCRu66RDQt-_Jbm9YQ&oe=6ADE4522",

    // 2. Crazy Dog Lovers
    "61566559027425": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/462005498_122103706064551967_3198089071887425138_n.jpg?stp=c76.0.788.788a_cp0_dst-jpg_tt6&cstp=mx788x788&_nc_cat=110&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=zPtWyDit3c0Q7kNvwF_YIOC&_nc_oc=AdrLIN9XtJOAZrG7wu0o5xH_Cm7qnWPbMaTcjBnKCD5MVHLnkq98JulqkbDkXnXly4k&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=InjjjM6AQQPVR-3vJ1R-tQ&_nc_ss=7b2a8&oh=00_AQOOeZkQzafA37O2z8Jl7qcjOh_FH5jR0ikNIB3iHjSeIw&oe=6ADE207A",
    "122103706064551967": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/462005498_122103706064551967_3198089071887425138_n.jpg?stp=c76.0.788.788a_cp0_dst-jpg_tt6&cstp=mx788x788&_nc_cat=110&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=zPtWyDit3c0Q7kNvwF_YIOC&_nc_oc=AdrLIN9XtJOAZrG7wu0o5xH_Cm7qnWPbMaTcjBnKCD5MVHLnkq98JulqkbDkXnXly4k&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=InjjjM6AQQPVR-3vJ1R-tQ&_nc_ss=7b2a8&oh=00_AQOOeZkQzafA37O2z8Jl7qcjOh_FH5jR0ikNIB3iHjSeIw&oe=6ADE207A",
    "crazydoglovers.uk": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/462005498_122103706064551967_3198089071887425138_n.jpg?stp=c76.0.788.788a_cp0_dst-jpg_tt6&cstp=mx788x788&_nc_cat=110&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=zPtWyDit3c0Q7kNvwF_YIOC&_nc_oc=AdrLIN9XtJOAZrG7wu0o5xH_Cm7qnWPbMaTcjBnKCD5MVHLnkq98JulqkbDkXnXly4k&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=InjjjM6AQQPVR-3vJ1R-tQ&_nc_ss=7b2a8&oh=00_AQOOeZkQzafA37O2z8Jl7qcjOh_FH5jR0ikNIB3iHjSeIw&oe=6ADE207A",
    "crazy dog lovers": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/462005498_122103706064551967_3198089071887425138_n.jpg?stp=c76.0.788.788a_cp0_dst-jpg_tt6&cstp=mx788x788&_nc_cat=110&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=zPtWyDit3c0Q7kNvwF_YIOC&_nc_oc=AdrLIN9XtJOAZrG7wu0o5xH_Cm7qnWPbMaTcjBnKCD5MVHLnkq98JulqkbDkXnXly4k&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=InjjjM6AQQPVR-3vJ1R-tQ&_nc_ss=7b2a8&oh=00_AQOOeZkQzafA37O2z8Jl7qcjOh_FH5jR0ikNIB3iHjSeIw&oe=6ADE207A",

    // 3. Ascsec / Cocker Spaniel
    "61594731538136": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/799676841_122095967409491051_5891965567465364453_n.jpg?stp=cp6_dst-jpg_tt6&cstp=mx1290x1290&_nc_cat=104&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=Ymha57zXx_IQ7kNvwH-y3Bc&_nc_oc=AdrioWUOqhMvTupm6DrxCIg_q2LuO659FQAhGrLo-3SGBWn6-PrIlkmXBSMxeCazjqw&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=LxW4FYUhLudDC7o1F8CZaA&_nc_ss=7b2a8&oh=00_AQOhUh22-QB3gVsydu3XSLIHtoh47A2CgW4Pu6uL1EmpYQ&oe=6ADE3F33",
    "cocker spaniel": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/799676841_122095967409491051_5891965567465364453_n.jpg?stp=cp6_dst-jpg_tt6&cstp=mx1290x1290&_nc_cat=104&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=Ymha57zXx_IQ7kNvwH-y3Bc&_nc_oc=AdrioWUOqhMvTupm6DrxCIg_q2LuO659FQAhGrLo-3SGBWn6-PrIlkmXBSMxeCazjqw&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=LxW4FYUhLudDC7o1F8CZaA&_nc_ss=7b2a8&oh=00_AQOhUh22-QB3gVsydu3XSLIHtoh47A2CgW4Pu6uL1EmpYQ&oe=6ADE3F33",
    "ascsec": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/799676841_122095967409491051_5891965567465364453_n.jpg?stp=cp6_dst-jpg_tt6&cstp=mx1290x1290&_nc_cat=104&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=Ymha57zXx_IQ7kNvwH-y3Bc&_nc_oc=AdrioWUOqhMvTupm6DrxCIg_q2LuO659FQAhGrLo-3SGBWn6-PrIlkmXBSMxeCazjqw&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=LxW4FYUhLudDC7o1F8CZaA&_nc_ss=7b2a8&oh=00_AQOhUh22-QB3gVsydu3XSLIHtoh47A2CgW4Pu6uL1EmpYQ&oe=6ADE3F33",

    // 4. Free Dachshund Puppies
    "61595513098587": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/853444971_122096623407517103_2508650680056135816_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx2026x2048&_nc_cat=109&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=mQc1kpvezdMQ7kNvwGetWJG&_nc_oc=AdpXH1EOfACKX3QSalWjd8s7l0hPD3fg0OlnykY7_Vty-DJ-cRo0dW-SfhsiCa0p0TU&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=LxW4FYUhLudDC7o1F8CZaA&_nc_ss=7b2a8&oh=00_AQOVoLhWO9u2EMT4uFS0fGq8e5TNQvK4jRwo0FQT_-nWkA&oe=6ADE3C87",
    "free dachshund puppies for adoption and rehoming": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/853444971_122096623407517103_2508650680056135816_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx2026x2048&_nc_cat=109&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=mQc1kpvezdMQ7kNvwGetWJG&_nc_oc=AdpXH1EOfACKX3QSalWjd8s7l0hPD3fg0OlnykY7_Vty-DJ-cRo0dW-SfhsiCa0p0TU&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=LxW4FYUhLudDC7o1F8CZaA&_nc_ss=7b2a8&oh=00_AQOVoLhWO9u2EMT4uFS0fGq8e5TNQvK4jRwo0FQT_-nWkA&oe=6ADE3C87",
    "free dachshund puppies": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/853444971_122096623407517103_2508650680056135816_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx2026x2048&_nc_cat=109&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=mQc1kpvezdMQ7kNvwGetWJG&_nc_oc=AdpXH1EOfACKX3QSalWjd8s7l0hPD3fg0OlnykY7_Vty-DJ-cRo0dW-SfhsiCa0p0TU&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=LxW4FYUhLudDC7o1F8CZaA&_nc_ss=7b2a8&oh=00_AQOVoLhWO9u2EMT4uFS0fGq8e5TNQvK4jRwo0FQT_-nWkA&oe=6ADE3C87",

    // 5. Chandra K9 Commando
    "100082804552805": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/440336552_418005740969574_7966871653006742989_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx960x960&_nc_cat=109&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=TSqss9UjjzMQ7kNvwEMXdLg&_nc_oc=AdqZcWrsuTOHAm35hatCyRTtUF2WopVRNlDIryzuBgBVI7exqpjntCGuGwNWVjAAcHk&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=LxW4FYUhLudDC7o1F8CZaA&_nc_ss=7b2a8&oh=00_AQP78wU-YIJOioeOnVNnedWfOob4h8WZNF3dAqXYIyvUxA&oe=6ADE41C1",
    "chandra k9 commando working dog kennel bengaluru": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/440336552_418005740969574_7966871653006742989_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx960x960&_nc_cat=109&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=TSqss9UjjzMQ7kNvwEMXdLg&_nc_oc=AdqZcWrsuTOHAm35hatCyRTtUF2WopVRNlDIryzuBgBVI7exqpjntCGuGwNWVjAAcHk&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=LxW4FYUhLudDC7o1F8CZaA&_nc_ss=7b2a8&oh=00_AQP78wU-YIJOioeOnVNnedWfOob4h8WZNF3dAqXYIyvUxA&oe=6ADE41C1",
    "chandra k9": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/440336552_418005740969574_7966871653006742989_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx960x960&_nc_cat=109&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=TSqss9UjjzMQ7kNvwEMXdLg&_nc_oc=AdqZcWrsuTOHAm35hatCyRTtUF2WopVRNlDIryzuBgBVI7exqpjntCGuGwNWVjAAcHk&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=LxW4FYUhLudDC7o1F8CZaA&_nc_ss=7b2a8&oh=00_AQP78wU-YIJOioeOnVNnedWfOob4h8WZNF3dAqXYIyvUxA&oe=6ADE41C1",

    // 6. Greenhouse Yorkies
    "61595221846060": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/853675465_122107209423507394_8773063100519475064_n.jpg?stp=c0.0.736.736a_cp0_dst-jpg_tt6&cstp=mx736x736&_nc_cat=108&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=bB8XyIMvgRsQ7kNvwEzzqG8&_nc_oc=AdphPkfZFAG2NKNTDtnJk8UB01QyCqHog13AN7DOBwVGWPck9TOkZHe8cB1cDuyboxY&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=ctBsJ6kU9-p0pZ607e0BpQ&_nc_ss=7b2a8&oh=00_AQNcrGMtivkAuQ3uiJJbpFjtL1n5WfTUgKfG-o_LT7I-bQ&oe=6ADE2306",
    "greenhouse yorkies": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/853675465_122107209423507394_8773063100519475064_n.jpg?stp=c0.0.736.736a_cp0_dst-jpg_tt6&cstp=mx736x736&_nc_cat=108&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=bB8XyIMvgRsQ7kNvwEzzqG8&_nc_oc=AdphPkfZFAG2NKNTDtnJk8UB01QyCqHog13AN7DOBwVGWPck9TOkZHe8cB1cDuyboxY&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=ctBsJ6kU9-p0pZ607e0BpQ&_nc_ss=7b2a8&oh=00_AQNcrGMtivkAuQ3uiJJbpFjtL1n5WfTUgKfG-o_LT7I-bQ&oe=6ADE2306",

    // 7. Soft For Dogs
    "61594231833777": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/802072198_122099903445474394_6740119027340512439_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx1080x1080&_nc_cat=106&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=rcCG6sSZoRIQ7kNvwGAH260&_nc_oc=AdqwucdznU8OBY_1H-iFR2TE0KNYsghnFzU1Y_5JaIYxW0iH1J8UiSE_BYFne64ftac&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=o8puI1ZCo9fn3PglqkumKg&_nc_ss=7b2a8&oh=00_AQMBAHCVILrglI-z_FqsJAchDBaKYYHyXWg7aD4lS0TTjQ&oe=6ADE34E1",
    "soft for dogs": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/802072198_122099903445474394_6740119027340512439_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx1080x1080&_nc_cat=106&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=rcCG6sSZoRIQ7kNvwGAH260&_nc_oc=AdqwucdznU8OBY_1H-iFR2TE0KNYsghnFzU1Y_5JaIYxW0iH1J8UiSE_BYFne64ftac&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=o8puI1ZCo9fn3PglqkumKg&_nc_ss=7b2a8&oh=00_AQMBAHCVILrglI-z_FqsJAchDBaKYYHyXWg7aD4lS0TTjQ&oe=6ADE34E1",

    // 8. Juliejowels / Dachshund Puppies
    "61595290116794": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/853053396_122102754147509670_4567344291178019063_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx1440x1440&_nc_cat=108&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=W5qnkOd7qBsQ7kNvwEX11_6&_nc_oc=Adqryeww74cbIG-8wXcUHK5B6eP-z-6LDvwjocZ7f-Q-5kw9LIH9cV9Heb_DXDIqkIo&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=spA5B2RsHkNF9udxSjMx8w&_nc_ss=7b2a8&oh=00_AQMzG4srVpmy1gjJuCI3sEciKDNXdIMTfzEPr5bfEx-maA&oe=6ADE1AFC",
    "dachshund puppies": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/853053396_122102754147509670_4567344291178019063_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx1440x1440&_nc_cat=108&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=W5qnkOd7qBsQ7kNvwEX11_6&_nc_oc=Adqryeww74cbIG-8wXcUHK5B6eP-z-6LDvwjocZ7f-Q-5kw9LIH9cV9Heb_DXDIqkIo&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=spA5B2RsHkNF9udxSjMx8w&_nc_ss=7b2a8&oh=00_AQMzG4srVpmy1gjJuCI3sEciKDNXdIMTfzEPr5bfEx-maA&oe=6ADE1AFC",
    "juliejowels": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/853053396_122102754147509670_4567344291178019063_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx1440x1440&_nc_cat=108&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=W5qnkOd7qBsQ7kNvwEX11_6&_nc_oc=Adqryeww74cbIG-8wXcUHK5B6eP-z-6LDvwjocZ7f-Q-5kw9LIH9cV9Heb_DXDIqkIo&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=spA5B2RsHkNF9udxSjMx8w&_nc_ss=7b2a8&oh=00_AQMzG4srVpmy1gjJuCI3sEciKDNXdIMTfzEPr5bfEx-maA&oe=6ADE1AFC",

    // 9. Paradise Frenchies
    "61595289693197": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/848995038_122099228025509656_4048205347987609657_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx640x640&_nc_cat=100&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=Fv4WV33GQWgQ7kNvwHrOL20&_nc_oc=AdqdGTAuhB19fMVZWM2WixDBPIHsBr9Yux_5NX1KlrMDN8tiAMsizPI8VDgU-CZC5ms&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=spA5B2RsHkNF9udxSjMx8w&_nc_ss=7b2a8&oh=00_AQO-azHhsnWRTUL0zxWxzg2euJmiTsnKYwhO7z3yBUlFHA&oe=6ADE149C",
    "paradise frenchies": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/848995038_122099228025509656_4048205347987609657_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx640x640&_nc_cat=100&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=Fv4WV33GQWgQ7kNvwHrOL20&_nc_oc=AdqdGTAuhB19fMVZWM2WixDBPIHsBr9Yux_5NX1KlrMDN8tiAMsizPI8VDgU-CZC5ms&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=spA5B2RsHkNF9udxSjMx8w&_nc_ss=7b2a8&oh=00_AQO-azHhsnWRTUL0zxWxzg2euJmiTsnKYwhO7z3yBUlFHA&oe=6ADE149C",

    // 10. German Shepherd World
    "61594332256058": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/845925005_122118219585477741_7967768453723125043_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx1254x1254&_nc_cat=101&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=HflOslV30asQ7kNvwHggId_&_nc_oc=AdoK3ctzaitWojBhsBGLQbOyzEpzBqwjOfRQsmlek30VP5Q9cYbkPCjv87mo5Jc-qrc&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=spA5B2RsHkNF9udxSjMx8w&_nc_ss=7b2a8&oh=00_AQMECrtYxinAveZLJDR2IdzSCCmbVVjGlev_cGANl2D3Pw&oe=6ADE302C",
    "german shepherd world": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/845925005_122118219585477741_7967768453723125043_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx1254x1254&_nc_cat=101&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=HflOslV30asQ7kNvwHggId_&_nc_oc=AdoK3ctzaitWojBhsBGLQbOyzEpzBqwjOfRQsmlek30VP5Q9cYbkPCjv87mo5Jc-qrc&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=spA5B2RsHkNF9udxSjMx8w&_nc_ss=7b2a8&oh=00_AQMECrtYxinAveZLJDR2IdzSCCmbVVjGlev_cGANl2D3Pw&oe=6ADE302C",

    // 11. Golden Acres Poodle Farm
    "100076508311524": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/467616410_586656400561299_7608861023452401031_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx1536x1536&_nc_cat=109&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=DyEWKZ-Grj4Q7kNvwFHN0F8&_nc_oc=Adp5aicluDR7M5UjiutQgL4aGOPcnY0vF-xeB7xdGrZ1t2DWfqd20RjNxBnEFIQA-Vk&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=dpjfXSsaDkCndWfc7qweMw&_nc_ss=7b2a8&oh=00_AQMrVK7iQ3YVvwPVF_ogyZO1iL3M9y4T6eq3IXYx7LIoJg&oe=6ADE2E2B",
    "golden acres poodle farm": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/467616410_586656400561299_7608861023452401031_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx1536x1536&_nc_cat=109&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=DyEWKZ-Grj4Q7kNvwFHN0F8&_nc_oc=Adp5aicluDR7M5UjiutQgL4aGOPcnY0vF-xeB7xdGrZ1t2DWfqd20RjNxBnEFIQA-Vk&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=dpjfXSsaDkCndWfc7qweMw&_nc_ss=7b2a8&oh=00_AQMrVK7iQ3YVvwPVF_ogyZO1iL3M9y4T6eq3IXYx7LIoJg&oe=6ADE2E2B",

    // 12. ABC VIP DOGS
    "61594975678956": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/855164329_122110907037499189_877532196647671267_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx1145x1146&_nc_cat=101&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=jke-1C27erMQ7kNvwGFgIT0&_nc_oc=Adqj6CD3jbHXr9tlGRiwaxPGyru732Y2Mh_ssTlhv6IIEnqbOX2oL1jyNdopz19mW9w&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=dpjfXSsaDkCndWfc7qweMw&_nc_ss=7b2a8&oh=00_AQOG8NHekMtHDfO6cSe6FQj0ZICSuxT9gsxVgwxazGkFwg&oe=6ADE1BB4",
    "abc vip dogs": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/855164329_122110907037499189_877532196647671267_n.jpg?stp=cp0_dst-jpg_tt6&cstp=mx1145x1146&_nc_cat=101&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=jke-1C27erMQ7kNvwGFgIT0&_nc_oc=Adqj6CD3jbHXr9tlGRiwaxPGyru732Y2Mh_ssTlhv6IIEnqbOX2oL1jyNdopz19mW9w&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=dpjfXSsaDkCndWfc7qweMw&_nc_ss=7b2a8&oh=00_AQOG8NHekMtHDfO6cSe6FQj0ZICSuxT9gsxVgwxazGkFwg&oe=6ADE1BB4",

    // 13. Lakeland Terrier México
    "61595707163197": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/856470882_1773914520573760_7422947113457391568_n.jpg?stp=c102.0.819.819a_cp0_dst-jpg_tt6&cstp=mx819x819&_nc_cat=103&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=FshYNu6WXGYQ7kNvwE6OYhc&_nc_oc=AdrOiZoAXQYaMzBq8O4XxfNUamY80GAMBIIEHpm55pkLsfADUNVj_Y8CpNKYvxyVnFE&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=WVhPGv_vIC--SGpgBz_aqQ&_nc_ss=7b2a8&oh=00_AQOGabO7q91SjM20ImXsKZybTegKQw3Pb-Esey7Gjb-scQ&oe=6ADE2058",
    "lakeland terrier méxico “apolo’s kennel”": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/856470882_1773914520573760_7422947113457391568_n.jpg?stp=c102.0.819.819a_cp0_dst-jpg_tt6&cstp=mx819x819&_nc_cat=103&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=FshYNu6WXGYQ7kNvwE6OYhc&_nc_oc=AdrOiZoAXQYaMzBq8O4XxfNUamY80GAMBIIEHpm55pkLsfADUNVj_Y8CpNKYvxyVnFE&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=WVhPGv_vIC--SGpgBz_aqQ&_nc_ss=7b2a8&oh=00_AQOGabO7q91SjM20ImXsKZybTegKQw3Pb-Esey7Gjb-scQ&oe=6ADE2058",
    "lakeland terrier": "https://scontent.fsgn8-4.fna.fbcdn.net/v/t39.30808-1/856470882_1773914520573760_7422947113457391568_n.jpg?stp=c102.0.819.819a_cp0_dst-jpg_tt6&cstp=mx819x819&_nc_cat=103&_nc_map=urlgen_bucketless&ccb=1-7&_nc_sid=edd80f&_nc_ohc=FshYNu6WXGYQ7kNvwE6OYhc&_nc_oc=AdrOiZoAXQYaMzBq8O4XxfNUamY80GAMBIIEHpm55pkLsfADUNVj_Y8CpNKYvxyVnFE&_nc_zt=24&_nc_ht=scontent.fsgn8-4.fna&_nc_gid=WVhPGv_vIC--SGpgBz_aqQ&_nc_ss=7b2a8&oh=00_AQOGabO7q91SjM20ImXsKZybTegKQw3Pb-Esey7Gjb-scQ&oe=6ADE2058"
  };

  /**
   * Tạo Data URI ảnh SVG chữ cái viết tắt sắc nét, màu sắc SaaS hiện đại
   * Tuyệt đối không bao giờ để trống hoặc hiển thị hình bóng xám silhouette
   */
  function generateInitialsSvgDataUri(name) {
    const clean = (name || 'DB').replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    let initials = 'DB';
    if (parts.length >= 2) {
      initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts.length === 1 && parts[0].length >= 2) {
      initials = parts[0].slice(0, 2).toUpperCase();
    } else if (parts.length === 1) {
      initials = parts[0][0].toUpperCase();
    }

    const palettes = [
      { bg1: '#0284c7', bg2: '#0369a1', text: '#ffffff' },
      { bg1: '#10b981', bg2: '#047857', text: '#ffffff' },
      { bg1: '#8b5cf6', bg2: '#6d28d9', text: '#ffffff' },
      { bg1: '#f59e0b', bg2: '#b45309', text: '#ffffff' },
      { bg1: '#ec4899', bg2: '#be185d', text: '#ffffff' },
      { bg1: '#06b6d4', bg2: '#0e7490', text: '#ffffff' },
      { bg1: '#3b82f6', bg2: '#1d4ed8', text: '#ffffff' }
    ];
    let code = 0;
    for (let i = 0; i < clean.length; i++) code += clean.charCodeAt(i);
    const color = palettes[code % palettes.length];

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">` +
      `<defs><linearGradient id="g_${code}" x1="0%" y1="0%" x2="100%" y2="100%">` +
      `<stop offset="0%" stop-color="${color.bg1}" /><stop offset="100%" stop-color="${color.bg2}" />` +
      `</linearGradient></defs>` +
      `<rect width="128" height="128" rx="64" fill="url(#g_${code})" />` +
      `<text x="50%" y="54%" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="44" font-weight="750" fill="${color.text}" text-anchor="middle" dominant-baseline="middle">${initials}</text>` +
      `</svg>`;

    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // =========================================================================
  // AVATAR RESOLVER & FALLBACK LOGIC
  // =========================================================================
  function resolveAvatarFallback(fbId, url, currentAvatar, ownerName, leadName) {
    const cleanId = fbId ? String(fbId).trim() : '';
    const cleanUrl = url ? String(url).trim().toLowerCase() : '';
    const cleanOwner = ownerName ? String(ownerName).trim().toLowerCase() : '';
    const cleanName = leadName ? String(leadName).trim().toLowerCase() : '';

    // 1. Kiểm tra trong STEP1_AVATAR_LOOKUP trước bằng ID, Owner, Name hoặc URL slug
    if (cleanId && STEP1_AVATAR_LOOKUP[cleanId]) return STEP1_AVATAR_LOOKUP[cleanId];
    if (cleanOwner && STEP1_AVATAR_LOOKUP[cleanOwner]) return STEP1_AVATAR_LOOKUP[cleanOwner];
    if (cleanName && STEP1_AVATAR_LOOKUP[cleanName]) return STEP1_AVATAR_LOOKUP[cleanName];

    if (cleanUrl) {
      for (const [key, val] of Object.entries(STEP1_AVATAR_LOOKUP)) {
        if (cleanUrl.includes(key)) return val;
      }
    }

    // 2. Nếu currentAvatar là ảnh Facebook CDN thật (loại bỏ bóng xám silhouette & graph API rác)
    if (currentAvatar && (currentAvatar.startsWith('http') || currentAvatar.startsWith('data:'))) {
      const isBadSilhouette = currentAvatar.includes('unavatar.io') ||
                              currentAvatar.includes('blank_profile') ||
                              currentAvatar.includes('rsrc.php') ||
                              currentAvatar.includes('graph.facebook.com');
      if (!isBadSilhouette) {
        return currentAvatar;
      }
    }

    // 3. Tìm trong DOG_GALLERY_DATA nếu có sẵn trên window
    if (typeof window !== 'undefined' && Array.isArray(window.DOG_GALLERY_DATA)) {
      const gMatch = window.DOG_GALLERY_DATA.find(x =>
        (cleanId && x.fb_id && String(x.fb_id).trim() === cleanId) ||
        (cleanName && x.name && x.name.toLowerCase().includes(cleanName))
      );
      if (gMatch && gMatch.avatar_url && !gMatch.avatar_url.includes('blank_profile')) {
        return gMatch.avatar_url;
      }
    }

    // 4. Tìm trong danh sách dữ liệu hồ sơ đã quét
    if (cleanId || cleanUrl) {
      const match = allLeads.find(x =>
        (cleanId && x.fb_id && String(x.fb_id).trim() === cleanId && x.avatar_url && !x.avatar_url.includes('unavatar.io') && !x.avatar_url.includes('blank_profile') && !x.avatar_url.includes('graph.facebook.com')) ||
        (cleanUrl && x.url && String(x.url).trim().toLowerCase() === cleanUrl && x.avatar_url && !x.avatar_url.includes('unavatar.io') && !x.avatar_url.includes('blank_profile') && !x.avatar_url.includes('graph.facebook.com'))
      );
      if (match && match.avatar_url) {
        return match.avatar_url;
      }
    }

    // 5. Fallback chữ cái sắc nét phong cách SaaS cao cấp bằng Data URI SVG
    const displayName = (ownerName && ownerName !== 'Facebook User' && ownerName !== '---')
      ? ownerName
      : (leadName || 'DB');
    return generateInitialsSvgDataUri(displayName);
  }

  // =========================================================================
  // LOGIC ĐỒNG BỘ DỮ LIỆU & TERMINAL LOG
  // =========================================================================
  function appendTerminalLog(msg, level = 'info', stage = '') {
    const box = $('terminalBox');
    if (!box) return;

    const timeStr = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'log-entry';

    let levelClass = 'log-info';
    let badgeText = stage || 'THÔNG TIN';

    if (level === 'success') { levelClass = 'log-success'; if (!stage) badgeText = 'THÀNH CÔNG'; }
    else if (level === 'warning') { levelClass = 'log-warning'; if (!stage) badgeText = 'CẢNH BÁO'; }
    else if (level === 'error') { levelClass = 'log-error'; if (!stage) badgeText = 'LỖI'; }
    else if (level === 'web') { levelClass = 'log-web'; if (!stage) badgeText = 'WEBSITE'; }
    else if (level === 'ai') { levelClass = 'log-ai'; if (!stage) badgeText = 'KÊNH AMAZON'; }

    entry.innerHTML = `
      <span class="log-time">[${timeStr}]</span>
      <span class="log-badge ${levelClass}">${escapeHtml(badgeText)}</span>
      <span>${escapeHtml(msg)}</span>
    `;

    box.appendChild(entry);
    if (autoScrollLog) {
      box.scrollTop = box.scrollHeight;
    }
  }

  // =========================================================================
  // RENDER BẢNG META CRM & SỬA TRỰC TIẾP
  // =========================================================================
  function renderCrmTable() {
    const tbody = $('crmTableBody');
    if (!tbody) return;

    const searchQuery = ($('searchInput')?.value || '').toLowerCase().trim();
    const filterAmz = $('filterAmazon')?.value || 'ALL';
    const filterTierVal = $('filterTier')?.value || 'ALL';

    const filtered = allLeads.filter(lead => {
      // 1. Search Query
      if (searchQuery) {
        const textBlob = [
          lead.stt, lead.lead_id, lead.owner, lead.name, lead.fb_id,
          lead.phone, lead.email, lead.city, lead.state, lead.website,
          lead.product_fit, lead.sales_action
        ].filter(Boolean).join(' ').toLowerCase();

        if (!textBlob.includes(searchQuery)) return false;
      }

      // 2. Amazon Filter
      if (filterAmz === 'HAS_AMAZON' && !lead.has_amazon && !lead.amazon_url) return false;
      if (filterAmz === 'TARGET' && (!lead.amz_cat || !lead.amz_cat.toLowerCase().includes('target') && !lead.amz_cat.toLowerCase().includes('pet toys') && !lead.amz_cat.toLowerCase().includes('cỏ'))) return false;
      if (filterAmz === 'NO_AMAZON' && (lead.has_amazon || lead.amazon_url)) return false;

      // 3. Tier Filter
      if (filterTierVal !== 'ALL') {
        const tier = lead.rank_tier || 'Tier B';
        if (filterTierVal === 'TIER_S' && !tier.includes('Tier S')) return false;
        if (filterTierVal === 'TIER_A' && !tier.includes('Tier A')) return false;
        if (filterTierVal === 'TIER_B' && !tier.includes('Tier B')) return false;
      }

      return true;
    });

    // Cập nhật số đếm
    if ($('filteredCount')) $('filteredCount').textContent = filtered.length;
    if ($('totalRowCount')) $('totalRowCount').textContent = allLeads.length;

    tbody.innerHTML = '';

    if (filtered.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td colspan="14" style="text-align:center; padding:36px; color:#64748b; font-size:13px;">
          ${searchQuery || filterAmz !== 'ALL' || filterTierVal !== 'ALL' ? '🔍 Không tìm thấy hồ sơ phù hợp với bộ lọc.' : '📂 Chưa có dữ liệu hồ sơ CRM. Hãy dán link và bấm "Bắt đầu cào phễu" hoặc "Nạp Lead Bước 1".'}
        </td>
      `;
      tbody.appendChild(tr);
      return;
    }

    filtered.forEach((item, idx) => {
      const tr = document.createElement('tr');
      const leadKey = item.stt || item.lead_id || item.fb_id || String(idx);

      let fbId = item.fb_id ? String(item.fb_id).trim() : '';
      if (!fbId && item.url) {
        const mId = item.url.match(/[?&]id=(\d{6,})/) || item.url.match(/\/people\/[^\/]+\/(\d{6,})/) || item.url.match(/facebook\.com\/(\d{8,})/);
        if (mId) fbId = mId[1];
      }
      let profileUrl = '';
      if (item.url && item.url.includes('facebook.com')) {
        profileUrl = item.url;
      } else if (fbId) {
        profileUrl = `https://www.facebook.com/profile.php?id=${fbId}`;
      } else if (item.url && item.url.startsWith('http')) {
        profileUrl = item.url;
      } else {
        profileUrl = '#';
      }

      const avatarUrl = resolveAvatarFallback(fbId, profileUrl, item.avatar_url || item.avatar, item.owner, item.name);
      const defaultUi = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.owner || item.name || 'DB')}&background=0284c7&color=fff&size=128&bold=true`;

      // STT formatting
      let rawStt = item.stt || item.lead_id || `LEAD-US-${String(idx + 1).padStart(6, '0')}`;
      if (/^\d+$/.test(rawStt)) rawStt = `LEAD-US-${String(rawStt).padStart(6, '0')}`;

      // Contacts
      const phone = item.phone || '';
      const email = item.email || '';
      const website = item.website || '';
      const location = [item.city, item.state].filter(Boolean).join(', ') || item.address || item.country || 'United States';

      // Amazon badge (Song ngữ Việt - Trung)
      let amzBadge = `<span style="color:#64748b; font-size:11px;">Chưa có link / 暂无</span>`;
      if (item.amazon_url || item.has_amazon) {
        const amzLink = item.amazon_url || `https://www.amazon.com/s?k=${encodeURIComponent(item.name || 'dog')}`;
        const amzCat = item.amz_cat || 'Kênh bán Amazon / 亚马逊店铺';
        amzBadge = `
          <div>
            <a href="${amzLink}" target="_blank" rel="noopener noreferrer" class="badge-amz" title="${escapeHtml(amzCat)}">
              🛒 Amazon / 亚马逊
            </a>
          </div>
        `;
      }

      // Publish time
      const pubTime = item.publish_time || item.publishTime || 'Chưa bóc tách';
      const relTime = item.relative_time || item.relativeTime || 'Tích cực';
      let actStatus = item.activity_status || '✓ TÍCH CỰC';
      if (!actStatus.includes('/')) actStatus = `${actStatus} / 活跃`;

      // Confidence label song ngữ
      let confLabel = item.owner_confidence || 'Tier 3';
      if (confLabel.includes('Tier 1')) confLabel = 'Tier 1 • Website / 官网认证';
      else if (confLabel.includes('Tier 2')) confLabel = 'Tier 2 • Email / 邮箱推导';
      else if (confLabel.includes('Tier 3')) confLabel = 'Tier 3 • FB / 社交主页';
      else if (confLabel.includes('Manual')) confLabel = 'Manual / 人工验证';

      // Tier & Score
      const score = item.score || 75;
      const tier = item.rank_tier || (score >= 75 ? 'Tier S' : (score >= 60 ? 'Tier A' : 'Tier B'));
      let tierClass = 'tier-b';
      if (tier.includes('Tier S')) tierClass = 'tier-s';
      else if (tier.includes('Tier A')) tierClass = 'tier-a';

      tr.innerHTML = `
        <td>
          <span class="badge-stt">${escapeHtml(rawStt)}</span>
        </td>
        <td style="text-align:center; vertical-align:middle;">
          <a href="${profileUrl}" target="_blank" rel="noopener noreferrer" class="circle-avatar-box" title="👉 Nhấn để mở trang Facebook / 点击打开Facebook主页 (${escapeHtml(item.name || item.owner)})">
            <img class="circle-avatar-img" src="${avatarUrl}" referrerpolicy="no-referrer" alt="${escapeHtml(item.name)}" onerror="this.onerror=null; this.src='${defaultUi}'" />
          </a>
        </td>
        <td style="min-width:140px; max-width:200px;">
          <div class="crm-editable-cell" onclick="openEditLeadModal('${leadKey}', 'editOwner')" title="Nhấn cây viết để sửa Tên chủ trại / 点击修改店主" style="color:#0f172a; font-size:12.5px; font-weight:750; word-break:break-word;">
            ${escapeHtml(item.owner || '---')} <span class="edit-pen" title="Chỉnh sửa Tên chủ trại / 点击修改店主">✏️</span>
          </div>
          <div style="font-size:10px; color:#64748b; margin-top:2px;">${escapeHtml(confLabel)}</div>
        </td>
        <td style="min-width:150px; max-width:210px;">
          <div class="crm-editable-cell" onclick="openEditLeadModal('${leadKey}', 'editName')" title="Nhấn cây viết để sửa Tên trại / 点击修改企业名称" style="font-weight:600; color:#1e293b; font-size:12px; word-break:break-word;">
            ${escapeHtml(item.name || '---')} <span class="edit-pen" title="Chỉnh sửa Tên trại / 点击修改企业名称">✏️</span>
          </div>
        </td>
        <td>
          <span class="badge-fbid" onclick="copyText('${fbId}')" title="${t().copyIdTitle}">
            # ${fbId || '---'}
          </span>
        </td>
        <td style="white-space:nowrap;">
          ${phone ? `<div class="crm-editable-cell" onclick="openEditLeadModal('${leadKey}', 'editPhone')" title="Nhấn cây viết để sửa SĐT" style="color:#0284c7; font-weight:700; font-family:var(--font-mono); font-size:11.5px;">📞 ${escapeHtml(phone)} <span class="edit-pen" title="Sửa SĐT">✏️</span></div>` : `<div class="crm-editable-cell" onclick="openEditLeadModal('${leadKey}', 'editPhone')" title="Thêm SĐT" style="color:#64748b; font-size:11px;">+ SĐT / 添加电话 <span class="edit-pen">✏️</span></div>`}
          ${email ? `<div class="crm-editable-cell" onclick="openEditLeadModal('${leadKey}', 'editEmail')" title="Nhấn cây viết để sửa Email" style="color:#059669; font-size:11px; margin-top:2px; font-family:var(--font-mono); font-weight:600;">✉️ ${escapeHtml(email)} <span class="edit-pen" title="Sửa Email">✏️</span></div>` : ''}
        </td>
        <td>
          ${website ? `
            <div style="display:inline-flex; align-items:center; gap:4px;">
              <a href="${website}" target="_blank" rel="noopener noreferrer" style="color:#0284c7; text-decoration:none; font-weight:650; font-size:12px;" title="${escapeHtml(website)}">🌐 ${escapeHtml(website.replace(/^https?:\/\//, '').split('/')[0])}</a>
              <span class="edit-pen" onclick="openEditLeadModal('${leadKey}', 'editWebsite')" title="Chỉnh sửa Website / 编辑网址">✏️</span>
            </div>` : `<span class="crm-editable-cell" onclick="openEditLeadModal('${leadKey}', 'editWebsite')" title="Thêm Website" style="color:#64748b; font-size:11px;">+ Web / 官网 <span class="edit-pen">✏️</span></span>`}
        </td>
        <td>
          <div style="display:inline-flex; align-items:center; gap:4px;">
            ${amzBadge}
            <span class="edit-pen" onclick="openEditLeadModal('${leadKey}', 'editAmazonUrl')" title="Chỉnh sửa link Amazon / 编辑亚马逊">✏️</span>
          </div>
        </td>
        <td>
          <div class="crm-editable-cell" onclick="openEditLeadModal('${leadKey}', 'editCity')" title="Nhấn cây viết để sửa Vị trí / 点击修改位置" style="color:#334155; font-size:12px; font-weight:600;">
            ${escapeHtml(location)} <span class="edit-pen" title="Chỉnh sửa Vị trí / 编辑位置">✏️</span>
          </div>
        </td>
        <td>
          <div style="color:#0284c7; font-weight:750; font-size:11.5px;">${escapeHtml(pubTime)}</div>
          <div style="font-size:10.5px; margin-top:3px; display:flex; gap:5px; align-items:center;">
            <span style="color:#64748b;">⏱️ ${escapeHtml(relTime)}</span>
            <span class="badge-status">${escapeHtml(actStatus)}</span>
          </div>
        </td>
        <td>
          <span style="font-size:11px; color:#0369a1; background:#e0f2fe; padding:2px 7px; border-radius:5px; border:1px solid #bae6fd; font-weight:600;" title="${escapeHtml(item.cat || 'Dog Breeder')}">
            ${escapeHtml(item.cat ? `${item.cat} / 犬舍` : 'Dog Breeder / 犬舍繁育')}
          </span>
        </td>
        <td>
          <span style="font-size:11px; color:#0f172a; font-weight:600; max-width:180px; display:inline-block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(item.product_fit || 'Puppy Starter Kit')}">
            ${escapeHtml(item.product_fit || 'Puppy Starter Kit / 幼犬套件')}
          </span>
        </td>
        <td>
          <span class="badge-tier ${tierClass}">${tier} (${score}đ / 分)</span>
        </td>
        <td style="text-align:center;">
          <div class="tbl-actions">
            <button type="button" class="tbl-btn edit" onclick="openEditLeadModal('${leadKey}')" title="Sửa hồ sơ / 编辑档案">
              <span>✏️ Sửa / 编辑</span>
            </button>
            <a href="${profileUrl}" target="_blank" rel="noopener noreferrer" class="tbl-btn" title="Mở Facebook / 打开主页">
              <span>🔗 FB / 主页</span>
            </a>
            <button type="button" class="tbl-btn" onclick="copyText('${fbId}')" title="Sao chép ID / 复制ID">
              <span>📋 ID / 复制</span>
            </button>
            <button type="button" class="tbl-btn danger" onclick="deleteLead('${leadKey}')" title="Xóa / 删除">
              <span>🗑️</span>
            </button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });

    updateKpiCards();
  }

  // =========================================================================
  // UPDATE KPI STATS CARDS
  // =========================================================================
  function updateKpiCards() {
    const total = allLeads.length;
    let ownerCount = 0;
    let amzCount = 0;
    let activeCount = 0;
    let tierSCount = 0;

    allLeads.forEach(item => {
      if (item.owner && item.owner !== 'Facebook User' && item.owner !== '---') ownerCount++;
      if (item.has_amazon || item.amazon_url) amzCount++;
      if (item.publish_time || item.publishTime) activeCount++;
      const tier = item.rank_tier || '';
      if (tier.includes('Tier S') || tier.includes('Tier A')) tierSCount++;
    });

    if ($('kpiTotal')) $('kpiTotal').textContent = total;
    if ($('kpiOwner')) $('kpiOwner').textContent = ownerCount;
    if ($('kpiOwnerRate')) $('kpiOwnerRate').textContent = total > 0 ? `(${Math.round((ownerCount / total) * 100)}%)` : '(0%)';
    if ($('kpiAmazon')) $('kpiAmazon').textContent = amzCount;
    if ($('kpiActive')) $('kpiActive').textContent = activeCount;
    if ($('kpiActiveRate')) $('kpiActiveRate').textContent = total > 0 ? `(${Math.round((activeCount / total) * 100)}%)` : '(100%)';
    if ($('kpiTierS')) $('kpiTierS').textContent = tierSCount;
  }

  // =========================================================================
  // MODAL EDIT LEAD CONTROLLER
  // =========================================================================
  function openEditLeadModal(key, focusField) {
    const lead = allLeads.find((x, i) =>
      (x.stt && x.stt === key) ||
      (x.lead_id && x.lead_id === key) ||
      (x.fb_id && x.fb_id === key) ||
      String(i) === String(key)
    );

    if (!lead) return;

    $('editLeadKey').value = key;
    $('editOwner').value = lead.owner || '';
    $('editConfidence').value = lead.owner_confidence || 'Tier 1 - Website Verified';
    $('editName').value = lead.name || '';
    $('editFbId').value = lead.fb_id || '';
    $('editUrl').value = lead.url || '';
    $('editAvatarUrl').value = lead.avatar_url || lead.avatar || '';
    $('editPhone').value = lead.phone || '';
    $('editEmail').value = lead.email || '';
    $('editWebsite').value = lead.website || '';
    $('editAmazonUrl').value = lead.amazon_url || '';
    $('editCity').value = lead.city || '';
    $('editState').value = lead.state || '';
    $('editZip').value = lead.zip || '';
    $('editCountry').value = lead.country || 'United States';
    $('editTier').value = lead.rank_tier || 'Tier S';
    $('editScore').value = lead.score || 85;
    $('editProductFit').value = lead.product_fit || '';
    $('editSalesAction').value = lead.sales_action || '';

    $('modalEditLead').style.display = 'flex';

    if (focusField && $(focusField)) {
      setTimeout(() => {
        try {
          $(focusField).focus();
          if ($(focusField).select) $(focusField).select();
        } catch (_) {}
      }, 80);
    }
  }
  window.openEditLeadModal = openEditLeadModal;

  function closeEditLeadModal() {
    $('modalEditLead').style.display = 'none';
  }

  $('btnModalClose')?.addEventListener('click', closeEditLeadModal);
  $('btnModalCancel')?.addEventListener('click', closeEditLeadModal);

  $('formEditLead')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = $('editLeadKey').value;
    const idx = allLeads.findIndex((x, i) =>
      (x.stt && x.stt === key) ||
      (x.lead_id && x.lead_id === key) ||
      (x.fb_id && x.fb_id === key) ||
      String(i) === String(key)
    );

    if (idx === -1) return;

    const updated = {
      ...allLeads[idx],
      owner: $('editOwner').value.trim(),
      owner_confidence: $('editConfidence').value,
      name: $('editName').value.trim(),
      fb_id: $('editFbId').value.trim(),
      url: $('editUrl').value.trim(),
      avatar_url: $('editAvatarUrl').value.trim(),
      avatar: $('editAvatarUrl').value.trim(),
      phone: $('editPhone').value.trim(),
      email: $('editEmail').value.trim(),
      website: $('editWebsite').value.trim(),
      amazon_url: $('editAmazonUrl').value.trim(),
      has_amazon: !!($('editAmazonUrl').value.trim()),
      city: $('editCity').value.trim(),
      state: $('editState').value.trim(),
      zip: $('editZip').value.trim(),
      country: $('editCountry').value.trim(),
      rank_tier: $('editTier').value,
      score: parseInt($('editScore').value, 10) || 75,
      product_fit: $('editProductFit').value.trim(),
      sales_action: $('editSalesAction').value.trim()
    };

    allLeads[idx] = updated;

    // Lưu vào background & chrome.storage.local
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        action: 'UPDATE_LEAD',
        lead: updated
      });
    }

    saveLeadsToStorage();
    renderCrmTable();
    closeEditLeadModal();

    appendTerminalLog(`💾 Đã cập nhật trực tiếp hồ sơ: ${updated.name} (Chủ: ${updated.owner})`, 'success');
  });

  // =========================================================================
  // XÓA LEAD
  // =========================================================================
  function deleteLead(key) {
    if (!confirm(t().confirmDel)) return;

    allLeads = allLeads.filter((x, i) =>
      x.stt !== key && x.lead_id !== key && x.fb_id !== key && String(i) !== String(key)
    );

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'DELETE_LEAD', key });
    }

    saveLeadsToStorage();
    renderCrmTable();
    appendTerminalLog(`🗑 Đã xóa hồ sơ khỏi CRM: ${key}`, 'warning');
  }
  window.deleteLead = deleteLead;

  // =========================================================================
  // THÊM LEAD MỚI THỦ CÔNG
  // =========================================================================
  $('btnAddNewLead')?.addEventListener('click', () => {
    const newIdx = allLeads.length + 1;
    const leadId = `LEAD-US-${String(newIdx).padStart(6, '0')}`;
    const newLead = {
      stt: leadId,
      lead_id: leadId,
      name: 'New Kennel / Breeder',
      owner: 'Breeder Owner',
      owner_confidence: 'Manual Verified',
      fb_id: '',
      url: '',
      phone: '',
      email: '',
      website: '',
      amazon_url: '',
      has_amazon: false,
      city: '',
      state: '',
      zip: '',
      country: 'United States',
      publish_time: new Date().toLocaleDateString('vi-VN'),
      relative_time: 'Hôm nay',
      activity_status: '✓ TÍCH CỰC',
      score: 85,
      rank_tier: 'Tier S',
      product_fit: 'Puppy Starter Kit V2/V3',
      sales_action: 'Telesale: Liên hệ giới thiệu thảm cỏ nhân tạo huấn luyện'
    };

    allLeads.unshift(newLead);
    saveLeadsToStorage();
    renderCrmTable();
    openEditLeadModal(leadId);
  });

  // =========================================================================
  // XUẤT EXCEL 37 CỘT (PRIORITY DATA 8) DÙNG EXCELJS TRỰC TIẾP
  // =========================================================================
  async function exportExcelPriority8() {
    if (!allLeads || allLeads.length === 0) {
      return alert(currentLang === 'zh' ? '暂无数据可导出！' : 'Chưa có dữ liệu để xuất file Excel!');
    }

    appendTerminalLog('📊 Đang khởi tạo workbook Excel 37 cột chuẩn Priority Data 8...', 'info');

    try {
      if (typeof ExcelJS === 'undefined') {
        // Fallback gửi background xuất CSV
        chrome.runtime.sendMessage({ action: 'EXPORT_PRIORITY_DATA_8' });
        return;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Pet Lead AI System';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Priority Data 8', {
        views: [{ state: 'frozen', ySplit: 1 }]
      });

      const headers = [
        'STT / CRM NO.', '邮箱地址', '邮箱地址状态', '名字', '姓氏', '全名 (主理人)',
        '用户社交 (Facebook URL)', 'LinkedIn', '工作职位', '国家', '详细地址', '行业',
        '添加日期', '公司名称 (犬舍名)', '公司网址', '公司社交', '公司规模', '公司所处国家',
        '公司位置', '州 (State)', '城市 (City)', '公司所在行业', '总部电话', '电话 (Phone)',
        '背调链接 (Google AI)', '测试打开次数', '客户等级 (Tier)', '打开网页', '营销更新',
        '回复次数', '营销打开次数', '营销邮件次数', '营销邮件数量', '年级/班级', '班级',
        '休眠原因', '推荐匹配产品 (Product Fit)', '销售跟进建议 (Sales Action)'
      ];

      worksheet.addRow(headers);

      // Header style
      const headerRow = worksheet.getRow(1);
      headerRow.height = 28;
      headerRow.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0284C7' } // Blue primary
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

      allLeads.forEach((lead, i) => {
        const fullName = lead.owner || '';
        const nameParts = fullName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
        const phone = lead.phone || '';
        const loc = [lead.city, lead.state].filter(Boolean).join(', ') || lead.address || 'USA';

        const rowValues = [
          lead.stt || `LEAD-US-${String(i + 1).padStart(6, '0')}`,
          lead.email || '',
          lead.email ? 'valid' : 'unknown',
          firstName,
          lastName,
          fullName,
          lead.url || '',
          '', // LinkedIn
          '创始人兼繁育人 (Breeder & Owner)',
          lead.country || 'United States',
          lead.address || '',
          lead.cat || '宠物繁育 / 狗舍 (Dog Breeder)',
          new Date().toISOString().slice(0, 10),
          lead.name || '',
          lead.website || '',
          lead.url || '',
          '1-10人',
          lead.country || 'United States',
          loc,
          lead.state || '',
          lead.city || '',
          '宠物用品 / 繁育基地',
          phone,
          phone,
          `https://www.google.com/search?q=${encodeURIComponent(lead.name || '')}`,
          0,
          lead.rank_tier || 'Tier S',
          1,
          '✓ TÍCH CỰC',
          0, 0, 0, 0, '', '', '',
          lead.product_fit || 'Puppy Starter Kit V2/V3',
          lead.sales_action || 'Liên hệ giới thiệu thảm cỏ nhân tạo & khay vệ sinh'
        ];

        const r = worksheet.addRow(rowValues);
        r.height = 22;
        r.alignment = { vertical: 'middle' };
      });

      // Auto width
      worksheet.columns.forEach((column) => {
        let maxLen = 12;
        column.eachCell({ includeEmpty: false }, (cell) => {
          const l = cell.value ? String(cell.value).length : 0;
          if (l > maxLen) maxLen = Math.min(l, 40);
        });
        column.width = maxLen + 3;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Priority_Data_8_Meta_CRM_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      appendTerminalLog('🎉 Đã xuất thành công file Excel 37 cột Priority Data 8!', 'success');
    } catch (err) {
      console.error(err);
      appendTerminalLog(`❌ Lỗi xuất Excel: ${err.message}`, 'error');
    }
  }

  $('btnTopExportPriority8')?.addEventListener('click', exportExcelPriority8);

  // =========================================================================
  // XUẤT JSON LEAD-US CHUẨN META RAG
  // =========================================================================
  function exportJsonLeadUs() {
    if (!allLeads || allLeads.length === 0) {
      return alert('Chưa có dữ liệu để xuất file JSON!');
    }

    const blob = new Blob([JSON.stringify(allLeads, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LEAD_US_Meta_CRM_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    appendTerminalLog(`📄 Đã xuất thành công file JSON LEAD-US (${allLeads.length} hồ sơ)!`, 'success');
  }

  $('btnTopExportJson')?.addEventListener('click', exportJsonLeadUs);

  // =========================================================================
  // NẠP LEAD TỪ BƯỚC 1 (FOLLOWERS / HARVESTER)
  // =========================================================================
  function importStep1Leads() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get(['verifiedLeads', 'scrapedFollowers', 'rawFollowers', 'DOG_GALLERY_DATA'], (res) => {
      const pool = [
        ...(res.verifiedLeads || []),
        ...(res.scrapedFollowers || []),
        ...(res.rawFollowers || []),
        ...(res.DOG_GALLERY_DATA || [])
      ];

      const urls = [];
      const seen = new Set();

      pool.forEach(item => {
        if (!item) return;
        const u = item.url || (item.fb_id ? `https://www.facebook.com/profile.php?id=${item.fb_id}` : '');
        if (u && !seen.has(u)) {
          seen.add(u);
          urls.push(u);
        }
      });

      if (urls.length === 0) {
        alert(t().noStep1Leads);
        return;
      }

      const existing = ($('urlListText')?.value || '').trim();
      $('urlListText').value = existing ? `${existing}\n${urls.join('\n')}` : urls.join('\n');
      updateLinkCountBadge();

      alert(t().importedSuccess(urls.length));
      appendTerminalLog(`📥 Đã nạp ${urls.length} link profile từ dữ liệu Bước 1!`, 'success');
    });
  }

  $('btnTopImportStep1')?.addEventListener('click', importStep1Leads);

  // =========================================================================
  // DÁN LINK & ĐẾM LINK
  // =========================================================================
  $('btnQuickPaste')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return alert('Clipboard đang trống!');

      const rawUrls = text.split(/\r?\n/).map(u => u.trim()).filter(Boolean);
      const fbUrls = rawUrls.filter(u => /facebook\.com/i.test(u));
      const toPaste = fbUrls.length > 0 ? fbUrls.join('\n') : rawUrls.join('\n');

      const cur = $('urlListText').value.trim();
      $('urlListText').value = cur ? `${cur}\n${toPaste}` : toPaste;
      updateLinkCountBadge();

      alert(t().pastedSuccess((fbUrls.length || rawUrls.length)));
      appendTerminalLog(`📋 Đã dán ${fbUrls.length || rawUrls.length} link từ clipboard`, 'info');
    } catch (e) {
      $('urlListText').focus();
      alert('Không thể đọc Clipboard tự động. Vui lòng bấm Ctrl+V để dán.');
    }
  });

  $('btnClearUrls')?.addEventListener('click', () => {
    $('urlListText').value = '';
    updateLinkCountBadge();
  });

  function updateLinkCountBadge() {
    const urls = ($('urlListText')?.value || '')
      .split('\n')
      .map(u => u.trim())
      .filter(Boolean);

    if ($('linkCountBadge')) {
      $('linkCountBadge').textContent = `${urls.length} link`;
    }
  }

  $('urlListText')?.addEventListener('input', updateLinkCountBadge);

  // =========================================================================
  // CONTROL BUTTONS: START / RESUME / PAUSE / CLEAR
  // =========================================================================
  $('btnAutoStart')?.addEventListener('click', () => {
    const text = $('urlListText').value;
    const urls = text.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return alert('Vui lòng dán ít nhất 1 link Facebook để cào!');

    let fromVal = parseInt($('fromLineInput').value, 10);
    if (isNaN(fromVal) || fromVal < 1) fromVal = 1;

    let toVal = parseInt($('toLineInput').value, 10);
    if (isNaN(toVal) || toVal > urls.length) toVal = urls.length;

    if (fromVal > urls.length) return alert(`Dòng bắt đầu (${fromVal}) vượt quá tổng số link (${urls.length})!`);
    if (fromVal > toVal) return alert('Dòng bắt đầu không thể lớn hơn dòng kết thúc!');

    // Chạy ngầm hoàn toàn, giữ nguyên tab UI Dashboard không bao giờ chuyển tab
    chrome.runtime.sendMessage({
      action: 'START_AUTO',
      urls: urls,
      startIndex: fromVal - 1,
      endIndex: toVal - 1,
      tabId: null
    }, () => {
      isAutoRunning = true;
      isPaused = false;
      updateControlsUi();
      appendTerminalLog(`🚀 Bắt đầu cào phễu từ dòng ${fromVal} đến dòng ${toVal} (chạy ngầm)...`, 'info');
    });
  });

  $('btnResume')?.addEventListener('click', () => {
    // Chạy ngầm hoàn toàn, giữ nguyên tab UI Dashboard không bao giờ chuyển tab
    chrome.runtime.sendMessage({
      action: 'RESUME_AUTO',
      tabId: null
    }, () => {
      isAutoRunning = true;
      isPaused = false;
      updateControlsUi();
      appendTerminalLog('⏯ Đang tiếp tục cào phễu trong tab ngầm...', 'info');
    });
  });

  $('btnPause')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'STOP_AUTO' }, () => {
      isAutoRunning = false;
      isPaused = true;
      updateControlsUi();
      appendTerminalLog('⏹ Đã tạm dừng cào phễu!', 'warning');
    });
  });

  $('btnClearAllData')?.addEventListener('click', () => {
    if (!confirm(t().confirmClear)) return;
    chrome.runtime.sendMessage({ action: 'CLEAR_DATA' }, () => {
      allLeads = [];
      saveLeadsToStorage();
      renderCrmTable();
      appendTerminalLog('🧹 Đã xóa sạch dữ liệu CRM!', 'warning');
    });
  });

  function updateControlsUi() {
    if (isAutoRunning) {
      if ($('btnAutoStart')) $('btnAutoStart').style.display = 'none';
      if ($('btnResume')) $('btnResume').style.display = 'none';
      if ($('btnPause')) $('btnPause').style.display = 'flex';
      if ($('progressStatusTitle')) $('progressStatusTitle').textContent = 'Trạng thái: Đang chạy bóc tách phễu...';
    } else if (isPaused) {
      if ($('btnAutoStart')) $('btnAutoStart').style.display = 'none';
      if ($('btnResume')) $('btnResume').style.display = 'flex';
      if ($('btnPause')) $('btnPause').style.display = 'none';
      if ($('progressStatusTitle')) $('progressStatusTitle').textContent = 'Trạng thái: Đã tạm dừng';
    } else {
      if ($('btnAutoStart')) $('btnAutoStart').style.display = 'flex';
      if ($('btnResume')) $('btnResume').style.display = 'none';
      if ($('btnPause')) $('btnPause').style.display = 'none';
      if ($('progressStatusTitle')) $('progressStatusTitle').textContent = 'Trạng thái: Sẵn sàng';
    }
  }

  // =========================================================================
  // STORAGE & SYNC WITH BACKGROUND
  // =========================================================================
  function saveLeadsToStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        allData: allLeads,
        crm_leads_step2: allLeads
      });
    }
  }

  const DEFAULT_LEADS_FALLBACK = [
    {
      stt: "LEAD-US-000001",
      lead_id: "LEAD-US-000001",
      name: "Dog Corgleone & Crew (Boss)",
      owner: "Dog Corgleone & Crew (Boss)",
      owner_confidence: "Tier 1 - Website Verified",
      fb_id: "100084312634205",
      url: "https://www.facebook.com/dogcorgleone",
      avatar_url: STEP1_AVATAR_LOOKUP["100084312634205"],
      phone: "",
      email: "",
      website: "",
      amazon_url: "",
      has_amazon: false,
      city: "Jacksonville",
      state: "FL",
      country: "United States",
      publish_time: "21/10/2026 10:15",
      relative_time: "3 giờ trước",
      activity_status: "✓ TÍCH CỰC",
      cat: "Dog Breeder",
      product_fit: "Puppy Starter Kit V2/V3",
      rank_tier: "Tier S",
      score: 85
    },
    {
      stt: "LEAD-US-000002",
      lead_id: "LEAD-US-000002",
      name: "Crazy Dog Lovers",
      owner: "Crazy Dog Lovers",
      owner_confidence: "Tier 2 - Email Prefix Fallback",
      fb_id: "61566559027425",
      url: "https://www.facebook.com/crazydoglovers.uk",
      avatar_url: STEP1_AVATAR_LOOKUP["61566559027425"],
      phone: "12508903842",
      email: "",
      website: "",
      amazon_url: "",
      has_amazon: false,
      city: "Denver",
      state: "CO",
      country: "United States",
      publish_time: "21/10/2026 09:30",
      relative_time: "4 giờ trước",
      activity_status: "✓ TÍCH CỰC",
      cat: "Dog Breeder",
      product_fit: "Pet Grass & Toys Combo",
      rank_tier: "Tier S",
      score: 88
    },
    {
      stt: "LEAD-US-000003",
      lead_id: "LEAD-US-000003",
      name: "Cocker Spaniel",
      owner: "Ascsec",
      owner_confidence: "Tier 1 - Website Verified",
      fb_id: "61594731538136",
      url: "https://www.facebook.com/profile.php?id=61594731538136",
      avatar_url: STEP1_AVATAR_LOOKUP["61594731538136"],
      phone: "19196371003",
      email: "ascsec2021@yahoo.com",
      website: "http://americanspanielclub.org",
      amazon_url: "",
      has_amazon: false,
      city: "North Myrtle Beach",
      state: "SC",
      country: "United States",
      publish_time: "21/10/2026 06:12",
      relative_time: "7 giờ trước",
      activity_status: "✓ TÍCH CỰC",
      cat: "Dog Breeder",
      product_fit: "Puppy Starter Kit V3",
      rank_tier: "Tier S",
      score: 95
    },
    {
      stt: "LEAD-US-000004",
      lead_id: "LEAD-US-000004",
      name: "free dachshund puppies for adoption and rehoming",
      owner: "free dachshund puppies for adoption and rehoming",
      owner_confidence: "Tier 3 - Facebook Page Fallback",
      fb_id: "61595513098587",
      url: "https://www.facebook.com/profile.php?id=61595513098587",
      avatar_url: STEP1_AVATAR_LOOKUP["61595513098587"],
      phone: "",
      email: "",
      website: "",
      amazon_url: "",
      has_amazon: false,
      city: "Austin",
      state: "TX",
      country: "United States",
      publish_time: "20/10/2026 18:45",
      relative_time: "19 giờ trước",
      activity_status: "✓ TÍCH CỰC",
      cat: "Dog Breeder",
      product_fit: "Puppy Starter Kit V2",
      rank_tier: "Tier A",
      score: 75
    },
    {
      stt: "LEAD-US-000005",
      lead_id: "LEAD-US-000005",
      name: "Chandra K9 Commando Working Dog Kennel Bengaluru",
      owner: "Chandra K9 Commando",
      owner_confidence: "Tier 1 - Website Verified",
      fb_id: "100082804552805",
      url: "https://www.facebook.com/profile.php?id=100082804552805",
      avatar_url: STEP1_AVATAR_LOOKUP["100082804552805"],
      phone: "",
      email: "",
      website: "",
      amazon_url: "",
      has_amazon: false,
      city: "Bengaluru",
      state: "KA",
      country: "India",
      publish_time: "07/06/2024",
      relative_time: "2 năm trước",
      activity_status: "⚠️ ÍT HOẠT ĐỘNG",
      cat: "Working Dog Kennel",
      product_fit: "Heavy Duty Training Turf",
      rank_tier: "Tier B",
      score: 65
    },
    {
      stt: "LEAD-US-000006",
      lead_id: "LEAD-US-000006",
      name: "Greenhouse Yorkies",
      owner: "Greenhouse Yorkies",
      owner_confidence: "Tier 2 - Email Prefix Fallback",
      fb_id: "61595221846060",
      url: "https://www.facebook.com/profile.php?id=61595221846060",
      avatar_url: STEP1_AVATAR_LOOKUP["61595221846060"],
      phone: "",
      email: "",
      website: "",
      amazon_url: "",
      has_amazon: false,
      city: "Downtown Phoenix",
      state: "AZ",
      country: "United States",
      publish_time: "20/10/2026 12:20",
      relative_time: "1 ngày trước",
      activity_status: "✓ TÍCH CỰC",
      cat: "Dog Breeder",
      product_fit: "Puppy Starter Kit V2",
      rank_tier: "Tier S",
      score: 82
    },
    {
      stt: "LEAD-US-000007",
      lead_id: "LEAD-US-000007",
      name: "Dachshund Puppies",
      owner: "Juliejowels",
      owner_confidence: "Tier 1 - Website Verified",
      fb_id: "61595290116794",
      url: "https://www.facebook.com/profile.php?id=61595290116794",
      avatar_url: STEP1_AVATAR_LOOKUP["61595290116794"],
      phone: "16504680459",
      email: "juliejowels@gmail.com",
      website: "",
      amazon_url: "",
      has_amazon: false,
      city: "San Francisco",
      state: "CA",
      country: "United States",
      publish_time: "21/10/2026 05:10",
      relative_time: "8 giờ trước",
      activity_status: "✓ TÍCH CỰC",
      cat: "Dog Breeder",
      product_fit: "Puppy Starter Kit V3",
      rank_tier: "Tier S",
      score: 92
    }
  ];

  function loadInitialData() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      allLeads = DEFAULT_LEADS_FALLBACK;
      renderCrmTable();
      return;
    }

    chrome.storage.local.get(['fb_publish_state', 'allData', 'crm_leads_step2', 'fb_funnel_lang'], (res) => {
      if (res.fb_funnel_lang) {
        setLanguage(res.fb_funnel_lang);
      }

      if (res.allData && Array.isArray(res.allData) && res.allData.length > 0) {
        allLeads = res.allData;
      } else if (res.fb_publish_state && Array.isArray(res.fb_publish_state.allData) && res.fb_publish_state.allData.length > 0) {
        allLeads = res.fb_publish_state.allData;
      } else if (res.crm_leads_step2 && Array.isArray(res.crm_leads_step2) && res.crm_leads_step2.length > 0) {
        allLeads = res.crm_leads_step2;
      } else {
        allLeads = DEFAULT_LEADS_FALLBACK;
      }

      // TỰ ĐỘNG SỬA VÀ NÂNG CẤP AVATAR TOÀN BỘ HỒ SƠ CŨ (LOẠI BỎ SILHOUETTE XÁM RÁC)
      let hasRepaired = false;
      allLeads = allLeads.map(item => {
        const currentAv = item.avatar_url || item.avatar || '';
        const resolved = resolveAvatarFallback(item.fb_id, item.url, currentAv, item.owner, item.name);
        if (resolved && resolved !== currentAv) {
          hasRepaired = true;
          return {
            ...item,
            avatar_url: resolved,
            avatar: resolved,
            image: resolved,
            img: resolved,
            photo: resolved,
            logo: resolved
          };
        }
        return item;
      });

      if (hasRepaired) {
        saveLeadsToStorage();
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ action: 'SET_ALL_DATA', allData: allLeads });
        }
      }

      if (res.fb_publish_state) {
        const s = res.fb_publish_state;
        isAutoRunning = s.isAutoRunning || false;
        isPaused = s.isPaused || false;
        currentIndex = s.currentIndex || 0;
        if (s.urlList && s.urlList.length > 0 && !$('urlListText').value) {
          $('urlListText').value = s.urlList.join('\n');
          updateLinkCountBadge();
        }
      }

      updateControlsUi();
      renderCrmTable();
    });
  }

  // =========================================================================
  // RUNTIME MESSAGE LISTENER (STEP2_LOG, STEP2_LEAD_DONE, STEP2_PROGRESS)
  // =========================================================================
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'STEP2_LOG') {
        const l = msg.log || {};
        appendTerminalLog(l.text || '', l.level || 'info', l.stage || '');
      } else if (msg.action === 'STEP2_PROGRESS') {
        const p = msg;
        if ($('progressBar')) $('progressBar').style.width = `${p.percent || 0}%`;
        if ($('progressPercentText')) $('progressPercentText').textContent = `${p.percent || 0}%`;
        if ($('statusLine')) $('statusLine').textContent = p.status || '';
      } else if (msg.action === 'STEP2_LEAD_DONE') {
        const lead = msg.lead;
        if (lead) {
          const leadFbId = lead.fb_id ? String(lead.fb_id).trim() : '';
          const leadUrl = lead.url ? String(lead.url).trim().toLowerCase() : '';
          const idx = allLeads.findIndex(x => 
            (leadFbId && x.fb_id && String(x.fb_id).trim() === leadFbId) ||
            (leadUrl && x.url && String(x.url).trim().toLowerCase() === leadUrl) ||
            (x.stt && lead.stt && x.stt === lead.stt)
          );
          if (idx !== -1) {
            allLeads[idx] = { ...allLeads[idx], ...lead };
          } else {
            allLeads.unshift(lead);
          }
          saveLeadsToStorage();
          renderCrmTable();
        }
      } else if (msg.action === 'STEP2_ALL_DONE') {
        isAutoRunning = false;
        isPaused = false;
        updateControlsUi();
        if ($('progressBar')) $('progressBar').style.width = '100%';
        if ($('progressPercentText')) $('progressPercentText').textContent = '100%';
        if ($('statusLine')) $('statusLine').textContent = '🎉 Đã hoàn tất toàn bộ quá trình cào!';
        appendTerminalLog('🎉 TOÀN BỘ QUÁ TRÌNH BÓC TÁCH BƯỚC 2 ĐÃ HOÀN TẤT THÀNH CÔNG!', 'success');
      } else if (msg.action === 'STATE_UPDATED') {
        const s = msg.state || {};
        isAutoRunning = s.isAutoRunning || false;
        isPaused = s.isPaused || false;
        if (s.allData && Array.isArray(s.allData)) {
          allLeads = s.allData;
          renderCrmTable();
        }
        updateControlsUi();
      }
    });
  }

  // =========================================================================
  // LANGUAGE SWITCHER (HỖ TRỢ SONG NGỮ VIỆT - TRUNG)
  // =========================================================================
  function setLanguage(lang) {
    currentLang = lang;
    $('langVi')?.classList.toggle('active', lang === 'vi');
    $('langZh')?.classList.toggle('active', lang === 'zh');

    const dict = t();
    if ($('txtBrandTitle')) $('txtBrandTitle').textContent = dict.brandTitle;
    if ($('txtBrandSubtitle')) $('txtBrandSubtitle').textContent = dict.brandSubtitle;
    if ($('txtModeBadge')) $('txtModeBadge').textContent = dict.modeBadge;
    if ($('txtBtnImportStep1')) $('txtBtnImportStep1').textContent = dict.btnImportStep1;
    if ($('txtBtnTopPriority8')) $('txtBtnTopPriority8').textContent = dict.btnTopPriority8;
    if ($('txtBtnTopJson')) $('txtBtnTopJson').textContent = dict.btnTopJson;
    if ($('txtBtnAddNew')) $('txtBtnAddNew').textContent = dict.btnAddNew;
    if ($('txtCardFunnelTitle')) $('txtCardFunnelTitle').textContent = dict.cardFunnelTitle;
    if ($('txtBtnQuickPaste')) $('txtBtnQuickPaste').textContent = dict.btnQuickPaste;
    if ($('txtFromLine')) $('txtFromLine').textContent = dict.fromLine;
    if ($('txtToLine')) $('txtToLine').textContent = dict.toLine;
    if ($('txtBtnClearUrls')) $('txtBtnClearUrls').textContent = dict.btnClearUrls;
    if ($('txtBtnStart')) $('txtBtnStart').textContent = dict.btnStart;
    if ($('txtBtnResume')) $('txtBtnResume').textContent = dict.btnResume;
    if ($('txtBtnPause')) $('txtBtnPause').textContent = dict.btnPause;
    if ($('txtBtnClearData')) $('txtBtnClearData').textContent = dict.btnClearData;
    if ($('txtTerminalTitle')) $('txtTerminalTitle').textContent = dict.terminalTitle;
    if ($('txtAutoScroll')) $('txtAutoScroll').textContent = autoScrollLog ? dict.autoScrollOn : dict.autoScrollOff;
    if ($('txtClearLog')) $('txtClearLog').textContent = dict.clearLog;
    if ($('txtKpiTotal')) $('txtKpiTotal').textContent = dict.kpiTotal;
    if ($('txtKpiOwner')) $('txtKpiOwner').textContent = dict.kpiOwner;
    if ($('txtKpiAmazon')) $('txtKpiAmazon').textContent = dict.kpiAmazon;
    if ($('txtKpiActive')) $('txtKpiActive').textContent = dict.kpiActive;
    if ($('txtKpiTierS')) $('txtKpiTierS').textContent = dict.kpiTierS;
    if ($('searchInput')) $('searchInput').placeholder = dict.searchPlaceholder;
    if ($('txtShowingCount')) $('txtShowingCount').textContent = dict.showingCount;

    // Tiêu đề bảng luôn giữ song ngữ Việt - Trung
    const thMap = {
      thStt: { vi: 'STT', zh: '序号' },
      thAvatar: { vi: 'ẢNH ĐẠI DIỆN', zh: '头像 (Avatar)' },
      thOwner: { vi: 'TÊN CHỦ TRẠI', zh: '主理人 (Owner)' },
      thName: { vi: 'TÊN TRẠI / TRANG', zh: '犬舍 / 企业' },
      thFbId: { vi: 'FACEBOOK ID', zh: '数字社交ID' },
      thContact: { vi: 'SĐT & EMAIL', zh: '电话 & 邮箱' },
      thWebsite: { vi: 'WEBSITE CHÍNH THỨC', zh: '官方网站' },
      thAmazon: { vi: 'KÊNH BÁN AMAZON', zh: '亚马逊渠道' },
      thLocation: { vi: 'VỊ TRÍ (CITY, STATE)', zh: '地理位置' },
      thPublish: { vi: 'BÀI ĐĂNG GẦN NHẤT', zh: '最新发帖' },
      thCategory: { vi: 'NHÓM KHÁCH HÀNG', zh: '客户分类' },
      thProduct: { vi: 'SẢN PHẨM PHÙ HỢP', zh: '推荐匹配产品' },
      thTier: { vi: 'XẾP HẠNG & ĐIỂM', zh: '评级与得分' },
      thActions: { vi: 'THAO TÁC', zh: '操作' }
    };
    for (const [id, label] of Object.entries(thMap)) {
      const el = $(id);
      if (el) {
        if (lang === 'vi') {
          el.innerHTML = `${label.vi}<span class="th-sub">${label.zh}</span>`;
        } else {
          el.innerHTML = `${label.zh}<span class="th-sub">${label.vi}</span>`;
        }
      }
    }

    if ($('txtModalTitle')) $('txtModalTitle').textContent = dict.modalTitle;
    if ($('btnModalCancel')) $('btnModalCancel').textContent = dict.btnModalCancel;
    if ($('btnModalSave')) $('btnModalSave').textContent = dict.btnModalSave;

    renderCrmTable();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ fb_funnel_lang: lang });
    }
  }

  $('langVi')?.addEventListener('click', () => setLanguage('vi'));
  $('langZh')?.addEventListener('click', () => setLanguage('zh'));

  // Terminal toggles
  $('btnToggleAutoScroll')?.addEventListener('click', () => {
    autoScrollLog = !autoScrollLog;
    if ($('txtAutoScroll')) $('txtAutoScroll').textContent = autoScrollLog ? t().autoScrollOn : t().autoScrollOff;
  });

  $('btnClearTerminal')?.addEventListener('click', () => {
    if ($('terminalBox')) $('terminalBox').innerHTML = '';
  });

  // Search & Filter listeners
  $('searchInput')?.addEventListener('input', renderCrmTable);
  $('filterAmazon')?.addEventListener('change', renderCrmTable);
  $('filterTier')?.addEventListener('change', renderCrmTable);

  // Initialize
  loadInitialData();
})();
