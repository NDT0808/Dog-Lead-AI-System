// --- CẤU HÌNH BOT ---
let CONFIG = {
    // Đã nâng cấp model mới (YOLOv8 Object Detection 640x640)
    USE_NEW_MODEL: true,
    IMG_SIZE: 640,
    THRESHOLD: 0.5,

    // Cài đặt thời gian lướt giả lập người thật (Khoảng ngẫu nhiên)
    DELAY_DOG_MIN: 10000,    // Ít nhất 10 giây nếu thấy chó
    DELAY_DOG_MAX: 15000,    // Nhiều nhất 15 giây
    DELAY_NORMAL_MIN: 2000,  // Ít nhất 2 giây nếu là video rác
    DELAY_NORMAL_MAX: 7000,  // Nhiều nhất 7 giây
    SESSION_LIMIT: 20,       // Ngừng bot sau khi đủ số lượng Follow
    LIKE_LIMIT: 100,         // Ngừng bot sau khi đủ số lượng Like
    FOLLOW_INTERVAL_MIN: 0,  // Random số video chó tối thiểu để Follow 1 lần
    FOLLOW_INTERVAL_MAX: 1,  // Random số video chó tối đa để Follow 1 lần
    LIKE_RATE: 70            // Tỷ lệ thả tim dạo (%)
};

// Khôi phục cài đặt từ UI
chrome.storage.local.get(['botConfig'], (result) => {
    if (result.botConfig) Object.assign(CONFIG, result.botConfig);
});
// Cập nhật ngay khi UI thay đổi
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.botConfig) {
        Object.assign(CONFIG, changes.botConfig.newValue);
        console.log("[FB Dog Bot] Đã cập nhật CONFIG từ UI:", CONFIG);
    }
});

let lastScores = { adult: 0, non: 0, puppy: 0 };
let lastStatus = "Đang khởi động...";
let model = null;
let isBotRunning = true;
let sessionFollowCount = 0;
let sessionLikeCount = 0;
let dogEncounterCounter = 0;
let nextFollowTarget = 3; // Sẽ khởi tạo tự động trong vòng lặp


function updateStatus(msg, isError = false) {
    console.log("[FB Dog Bot]", msg);
    lastStatus = msg;
    sendUpdateToPopup();
}

let currentTimerInfo = null;

function sendUpdateToPopup(extra = {}) {
    if (extra.timer !== undefined) currentTimerInfo = extra.timer;
    chrome.runtime.sendMessage({
        action: "updatePopup",
        statusMsg: lastStatus,
        scores: lastScores,
        isRunning: isBotRunning,
        timer: currentTimerInfo,
        followCount: sessionFollowCount,
        followLimit: CONFIG.SESSION_LIMIT,
        likeCount: sessionLikeCount,
        likeLimit: CONFIG.LIKE_LIMIT
    }).catch(() => { });

    // Cập nhật lên Giao diện Floating Injected
    if (document.getElementById('fb-bot-status')) {
        document.getElementById('fb-bot-status').innerText = "> " + lastStatus;
        document.getElementById('fb-bot-fl').innerText = `${sessionFollowCount}/${CONFIG.SESSION_LIMIT} FL`;
        document.getElementById('fb-bot-lk').innerText = `${sessionLikeCount}/${CONFIG.LIKE_LIMIT} LK`;

        document.getElementById('fb-pct-adult').innerText = `${lastScores.adult}%`;
        document.getElementById('fb-bar-adult').style.width = `${lastScores.adult}%`;
        document.getElementById('fb-pct-puppy').innerText = `${lastScores.puppy}%`;
        document.getElementById('fb-bar-puppy').style.width = `${lastScores.puppy}%`;
        document.getElementById('fb-pct-none').innerText = `${lastScores.non}%`;
        document.getElementById('fb-bar-none').style.width = `${lastScores.non}%`;

        if (currentTimerInfo && currentTimerInfo.total > 0) {
            document.getElementById('fb-timer-box').style.display = 'block';
            let pct = (currentTimerInfo.current / currentTimerInfo.total) * 100;
            document.getElementById('fb-timer-bar').style.width = `${Math.max(0, pct)}%`;
            document.getElementById('fb-timer-text').innerText = `${(currentTimerInfo.current / 1000).toFixed(1)}s`;
        } else {
            document.getElementById('fb-timer-box').style.display = 'none';
        }
    }
}

async function sleepWithCountdown(ms) {
    let remaining = ms;
    let total = ms;
    while (remaining > 0) {
        if (!isBotRunning) {
            // Nếu bị Tạm dừng, chờ đến khi chạy tiếp
            await new Promise(r => setTimeout(r, 1000));
            continue;
        }
        sendUpdateToPopup({ timer: { current: remaining, total: total } });
        let step = Math.min(100, remaining);
        await new Promise(r => setTimeout(r, step));
        remaining -= step;
    }
    sendUpdateToPopup({ timer: null });
}

// Lắng nghe yêu cầu từ Popup UI
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "requestStatus") {
        sendResponse({
            statusMsg: lastStatus,
            scores: lastScores,
            isRunning: isBotRunning,
            timer: currentTimerInfo,
            followCount: sessionFollowCount,
            followLimit: CONFIG.SESSION_LIMIT,
            likeCount: sessionLikeCount,
            likeLimit: CONFIG.LIKE_LIMIT
        });
    } else if (request.action === "toggleBot") {
        isBotRunning = !isBotRunning;
        updateStatus(isBotRunning ? "▶️ Bot đã tiếp tục chạy." : "⏸️ Đã TẠM DỪNG Bot.");
        sendUpdateToPopup();
    }
});

// --- Bounding Box Helper ---
function hideBBox() {
    let overlay = document.getElementById('fb-dog-bot-bbox');
    if (overlay) overlay.style.display = 'none';
}

function drawBBox(video, bestBox, label, conf, padX, padY, scale, vW, vH) {
    let overlayId = 'fb-dog-bot-bbox';
    let overlay = document.getElementById(overlayId);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.style.position = 'absolute';
        overlay.style.boxSizing = 'border-box';
        overlay.style.zIndex = '999999';
        overlay.style.pointerEvents = 'none';

        let labelDiv = document.createElement('div');
        labelDiv.id = overlayId + '-label';
        labelDiv.style.position = 'absolute';
        labelDiv.style.top = '-25px';
        labelDiv.style.left = '-3px';
        labelDiv.style.color = 'white';
        labelDiv.style.padding = '2px 6px';
        labelDiv.style.fontSize = '14px';
        labelDiv.style.fontWeight = 'bold';
        labelDiv.style.whiteSpace = 'nowrap';

        overlay.appendChild(labelDiv);
        document.body.appendChild(overlay);
    }

    overlay.style.display = 'block';

    let origXc = (bestBox.xc - padX) / scale;
    let origYc = (bestBox.yc - padY) / scale;
    let origW = bestBox.w / scale;
    let origH = bestBox.h / scale;

    const rect = video.getBoundingClientRect();
    const renderScaleX = rect.width / vW;
    const renderScaleY = rect.height / vH;

    let displayW = origW * renderScaleX;
    let displayH = origH * renderScaleY;
    let displayLeft = rect.left + window.scrollX + (origXc * renderScaleX) - displayW / 2;
    let displayTop = rect.top + window.scrollY + (origYc * renderScaleY) - displayH / 2;

    overlay.style.left = displayLeft + 'px';
    overlay.style.top = displayTop + 'px';
    overlay.style.width = displayW + 'px';
    overlay.style.height = displayH + 'px';

    let isRác = label.includes("RÁC");
    overlay.style.border = isRác ? '3px solid #ef4444' : '3px solid #10b981';

    let labelDiv = document.getElementById(overlayId + '-label');
    labelDiv.style.background = isRác ? '#ef4444' : '#10b981';
    labelDiv.innerText = `${label} (${Math.round(conf * 100)}%)`;
}

// 1. Tải Model AI
async function loadAIModel() {
    updateStatus("Đang thiết lập AI... (Nạp model ONNX tự train)");
    try {
        ort.env.wasm.wasmPaths = chrome.runtime.getURL('');
        const modelUrl = chrome.runtime.getURL('dog-model.onnx');
        model = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] });
        updateStatus("✅ Model YOLO ONNX đã sẵn sàng! Đang quét video...");
    } catch (e) {
        updateStatus("Lỗi nạp model: " + e.message, true);
    }
}

// 2. Chụp khung hình Video đang phát và nhận diện (Hỗ trợ YOLOv8 Object Detection 640x640)
async function scanVideoForDog() {
    const videos = document.querySelectorAll('video');
    let video = null;
    for (let v of videos) {
        const rect = v.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.top > -100 && rect.bottom > 0) {
            video = v;
            break;
        }
    }

    if (!video || !model) {
        return { isDog: false, label: "ĐANG TÌM KIẾM VIDEO..." };
    }

    try {
        const IMG_SIZE = CONFIG.IMG_SIZE;
        const canvas = document.createElement('canvas');
        canvas.width = IMG_SIZE;
        canvas.height = IMG_SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, IMG_SIZE, IMG_SIZE);

        const vW = video.videoWidth || video.clientWidth;
        const vH = video.videoHeight || video.clientHeight;

        const scale = Math.min(IMG_SIZE / vW, IMG_SIZE / vH);
        const w = vW * scale;
        const h = vH * scale;
        const padX = (IMG_SIZE - w) / 2;
        const padY = (IMG_SIZE - h) / 2;

        ctx.drawImage(video, 0, 0, vW, vH, padX, padY, w, h);
        const imgData = ctx.getImageData(0, 0, IMG_SIZE, IMG_SIZE).data;

        const floatData = new Float32Array(3 * IMG_SIZE * IMG_SIZE);
        for (let i = 0; i < IMG_SIZE * IMG_SIZE; i++) {
            floatData[i] = imgData[i * 4] / 255.0;
            floatData[IMG_SIZE * IMG_SIZE + i] = imgData[i * 4 + 1] / 255.0;
            floatData[2 * IMG_SIZE * IMG_SIZE + i] = imgData[i * 4 + 2] / 255.0;
        }

        const tensor = new ort.Tensor('float32', floatData, [1, 3, IMG_SIZE, IMG_SIZE]);
        const results = await model.run({ images: tensor });
        const output = results[Object.keys(results)[0]].data;

        let maxConf = 0;
        let bestClass = -1;
        let bestBox = null;

        if (CONFIG.USE_NEW_MODEL) {
            // Xử lý YOLOv8 Object Detection [1, 7, 8400]
            let anchors = 8400;
            for (let i = 0; i < anchors; i++) {
                let class0 = output[4 * anchors + i];
                let class1 = output[5 * anchors + i];
                let class2 = output[6 * anchors + i];

                let currentMax = Math.max(class0, class1, class2);
                if (currentMax > maxConf) {
                    maxConf = currentMax;
                    if (currentMax === class0) bestClass = 0;
                    else if (currentMax === class1) bestClass = 1;
                    else bestClass = 2;

                    bestBox = {
                        xc: output[0 * anchors + i],
                        yc: output[1 * anchors + i],
                        w: output[2 * anchors + i],
                        h: output[3 * anchors + i]
                    };
                }
            }
        } else {
            // Xử lý YOLO Classification cũ [1, 3]
            bestClass = 0;
            maxConf = output[0];
            for (let i = 1; i < output.length; i++) {
                if (output[i] > maxConf) {
                    maxConf = output[i];
                    bestClass = i;
                }
            }
        }

        lastScores = {
            adult: bestClass === 0 ? (maxConf * 100).toFixed(1) : 0,
            non: bestClass === 1 ? (maxConf * 100).toFixed(1) : 0,
            puppy: bestClass === 2 ? (maxConf * 100).toFixed(1) : 0
        };
        sendUpdateToPopup();

        let labelName = "RÁC (NON-DOG)";
        if (bestClass === 0) labelName = "CHÓ LỚN (ADULT DOG)";
        if (bestClass === 2) labelName = "CHÓ CON (PUPPY)";

        if (bestBox) {
            drawBBox(video, bestBox, labelName, maxConf, padX, padY, scale, vW, vH);
        }

        let threshold = CONFIG.THRESHOLD;
        if ((bestClass === 0 || bestClass === 2) && maxConf > threshold) {
            return { isDog: true, label: labelName };
        }
        return { isDog: false, label: labelName };
    } catch (e) {
        console.log("Lỗi quét video:", e);
        return { isDog: false, label: "ERROR" };
    }
}

// 3. Tự động thả tim và Follow
async function likeAndFollowReel(shouldFollow = true, shouldLike = true) {
    updateStatus("❤️ Đang thao tác...");

    function isElementInViewport(el) {
        const rect = el.getBoundingClientRect();
        // Nới lỏng viewport để bù trừ sai số khi cuộn
        return rect.width > 0 && rect.height > 0 && rect.top >= -50 && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + 150;
    }

    async function simulateClick(el, isFollow = false) {
        if (!el) return;

        let cursor = document.getElementById('fb-dog-bot-cursor');
        if (!cursor) {
            cursor = document.createElement('div');
            cursor.id = 'fb-dog-bot-cursor';
            cursor.style.cssText = `
                position: fixed; width: 24px; height: 24px;
                background-color: rgba(255, 0, 0, 0.8);
                border: 3px solid white; border-radius: 50%;
                pointer-events: none; z-index: 99999999;
                transition: all 0.4s ease-out; opacity: 0;
                box-shadow: 0 0 10px rgba(0,0,0,0.5);
                top: 50%; left: 50%; transform: translate(-50%, -50%);
            `;
            document.body.appendChild(cursor);
        }

        const rect = el.getBoundingClientRect();

        // Click ngay chính giữa phần tử 
        let targetX = rect.left + rect.width / 2;
        let targetY = rect.top + rect.height / 2;

        cursor.style.opacity = '1';
        cursor.style.top = `${targetY}px`;
        cursor.style.left = `${targetX}px`;

        await new Promise(r => setTimeout(r, 300));

        cursor.style.transform = 'translate(-50%, -50%) scale(0.6)';
        cursor.style.backgroundColor = isFollow ? 'rgba(0, 255, 0, 0.9)' : 'rgba(255, 20, 147, 0.9)';
        await new Promise(r => setTimeout(r, 100));

        // Bắn Full bộ sự kiện Mouse và Pointer
        try { el.click(); } catch (e) { }

        ['pointerover', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evType => {
            el.dispatchEvent(new MouseEvent(evType, {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: targetX,
                clientY: targetY,
                pointerId: 1
            }));
        });

        cursor.style.transform = 'translate(-50%, -50%) scale(1.3)';
        await new Promise(r => setTimeout(r, 200));
        cursor.style.opacity = '0';
    }

    let hasLiked = false;
    // 3.1. Tìm và bấm nút Like (Thả tim)
    if (shouldLike) {
        const buttons = document.querySelectorAll('div[role="button"]');
        for (let btn of buttons) {
            if (btn.closest && btn.closest('#fb-dog-bot-ui')) continue; // Bỏ qua UI của Bot
            let label = (btn.getAttribute('aria-label') || "").toLowerCase();
            if ((label === "bỏ thích" || label === "unlike" || label === "remove like") && isElementInViewport(btn)) {
                hasLiked = true; // Kênh này đã Like từ trước, vẫn tính
                break;
            }
            if ((label === "thích" || label === "like") && isElementInViewport(btn)) {
                await simulateClick(btn, false);
                hasLiked = true;
                break;
            }
        }
    }

    // Nếu chiến thuật random yêu cầu chỉ xem/like dạo chứ không Follow, thì dừng tại đây.
    if (!shouldFollow) return { didLike: hasLiked, didFollow: false };

    // 3.2. Tìm và bấm nút Follow (Mở rộng tìm kiếm cực đại)
    // Rất nhiều trường hợp FB dùng thẻ div bình thường để bọc chữ "Theo dõi"
    const allTags = document.querySelectorAll('span, div, a, b, strong');
    let hasFollowed = false;
    let followElement = null;

    for (let el of allTags) {
        if (el.closest && el.closest('#fb-dog-bot-ui')) continue; // Bỏ qua UI của Bot

        let text = (el.innerText || "").trim().toLowerCase();
        let aria = (el.getAttribute('aria-label') || "").trim().toLowerCase();

        // Lọc bỏ các khối div cha khổng lồ (Nới lỏng lên 60 ký tự để chứa được tên kênh dài như "Three Golden Bears • Follow")
        if (text.length > 60 && aria.length > 60) continue;

        // Kiểm tra xem đã Follow chưa
        if (text.includes("đang theo dõi") || text.includes("following") || aria.includes("đang theo dõi") || aria.includes("following")) {
            if (isElementInViewport(el)) {
                console.log("Kênh này đã Follow từ trước! Bỏ qua...");
                hasFollowed = true;
                break;
            }
        }

        // Tìm khớp chữ Follow (Đã loại bỏ Subscribe để tránh chuyển trang)
        if ((text.includes("theo dõi") || text.includes("follow") ||
            aria.includes("theo dõi") || aria.includes("follow"))
            && !text.includes("đang") && !text.includes("following") && !text.includes("đã")) {
            if (isElementInViewport(el)) {
                followElement = el;
                // Vẫn tiếp tục vòng lặp để lấy thẻ con nhỏ nhất ở dưới cùng
            }
        }
    }

    if (!hasFollowed && followElement) {
        followElement.style.border = "3px solid blue"; // Đổi viền xanh để dễ nhận biết thẻ bị nhắm mục tiêu
        // Ưu tiên thẻ div cha có khả năng click, nếu không thì click trực tiếp vào chữ
        let clickableParent = followElement.closest('div[role="button"], a') || followElement;
        await simulateClick(clickableParent, true);
        console.log("Đã bấm Follow thành công!");
        return { didLike: hasLiked, didFollow: true };
    }
    return { didLike: hasLiked, didFollow: false };
}

// 4. Lướt sang video tiếp theo
function scrollToNextReel() {
    updateStatus("⬇️ Đang lướt sang video tiếp theo...");

    const videos = document.querySelectorAll('video');
    let currentVideoIndex = -1;
    for (let i = 0; i < videos.length; i++) {
        const rect = videos[i].getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.top > -100 && rect.bottom > 0) {
            currentVideoIndex = i;
            break;
        }
    }

    if (currentVideoIndex !== -1 && currentVideoIndex + 1 < videos.length) {
        videos[currentVideoIndex + 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
        console.log("Đã cuộn tới video tiếp theo bằng scrollIntoView");
        return;
    }

    const buttons = document.querySelectorAll('div[role="button"]');
    for (let btn of buttons) {
        if (btn.closest && btn.closest('#fb-dog-bot-ui')) continue; // Bỏ qua UI của Bot
        let label = (btn.getAttribute('aria-label') || "").toLowerCase();
        if (label.includes('next video') || label.includes('video tiếp theo') || label.includes('next card') || label.includes('tiếp')) {
            btn.click();
            return;
        }
    }

    if (currentVideoIndex !== -1) {
        let el = videos[currentVideoIndex];
        while (el) {
            if (el.scrollHeight > el.clientHeight) {
                el.scrollBy({ top: 800, behavior: 'smooth' });
                return;
            }
            el = el.parentElement;
        }
    }
}

// 5. Vòng lặp chính
async function botLoop() {
    if (!isBotRunning) {
        setTimeout(botLoop, 2000);
        return;
    }

    // Đợi Model load xong thì mới chạy
    if (!model) {
        setTimeout(botLoop, 2000);
        return;
    }

    updateStatus("🔍 Bắt đầu quét video (Quét tối đa 5 khung hình)...");
    let isDogFound = false;
    let dogFrames = 0;
    let finalResult = null;

    // Chiến thuật mới: Quét tối đa 5 lần. Cần ít nhất 2 lần nhận là chó để chống False Positive (nhận diện sai)
    for (let i = 1; i <= 5; i++) {
        let result = await scanVideoForDog();
        finalResult = result;

        if (result.label === "ERROR" || result.label === "ĐANG TÌM KIẾM VIDEO...") {
            hideBBox();
            break; // Lỗi hoặc không thấy video, thoát vòng lặp
        }

        if (result.isDog) {
            dogFrames++;
            console.log(`[Lần ${i}/5] 🎉 AI phát hiện chó! (Lần ${dogFrames}/2)`);
            if (dogFrames >= 2) {
                isDogFound = true;
                break; // Đủ 2 frame uy tín, chốt!
            }
        } else {
            console.log(`[Lần ${i}/5] ❌ Chưa thấy chó, chờ video phát thêm 1s rồi quét lại...`);
        }

        if (i < 5) await new Promise(r => setTimeout(r, 1000));
    }

    hideBBox(); // Tắt BBox khi sang bước thao tác

    if (isDogFound) {
        if (dogEncounterCounter === 0) { // Khởi tạo Random Follow Target
            nextFollowTarget = Math.floor(Math.random() * (CONFIG.FOLLOW_INTERVAL_MAX - CONFIG.FOLLOW_INTERVAL_MIN + 1)) + CONFIG.FOLLOW_INTERVAL_MIN;
        }
        dogEncounterCounter++;
        let waitTime = Math.floor(Math.random() * (CONFIG.DELAY_DOG_MAX - CONFIG.DELAY_DOG_MIN + 1)) + CONFIG.DELAY_DOG_MIN;

        let shouldFollowThisDog = (dogEncounterCounter >= nextFollowTarget);
        let likeRate = CONFIG.LIKE_RATE !== undefined ? CONFIG.LIKE_RATE : 70;
        let shouldLikeThisDog = (Math.random() * 100) <= likeRate;

        if (shouldFollowThisDog) {
            updateStatus(`✅ Tới lượt Follow (Clip chó thứ ${dogEncounterCounter}). Đang thao tác...`);
        } else {
            let msg = shouldLikeThisDog ? "thả tim dạo" : "chỉ xem dạo";
            updateStatus(`✅ CHÓ! Tới ${msg} (Clip chó thứ ${dogEncounterCounter}/${nextFollowTarget})...`);
        }

        let actionResult = await likeAndFollowReel(shouldFollowThisDog, shouldLikeThisDog);

        if (actionResult.didLike) sessionLikeCount++;
        if (actionResult.didFollow) {
            sessionFollowCount++;
            // Đặt lại đếm sau khi Follow thành công, chờ lượt random tiếp theo
            dogEncounterCounter = 0;
        }
        sendUpdateToPopup();

        // Chờ bằng thanh thời gian (Hiển thị UI)
        await sleepWithCountdown(waitTime);

        if (sessionFollowCount >= CONFIG.SESSION_LIMIT || sessionLikeCount >= CONFIG.LIKE_LIMIT) {
            isBotRunning = false;
            updateStatus(`🛑 Đã xong phiên! (Follow: ${sessionFollowCount}/${CONFIG.SESSION_LIMIT} | Like: ${sessionLikeCount}/${CONFIG.LIKE_LIMIT}). Hãy nghỉ ngơi 30p!`);
            sendUpdateToPopup();
        }
    } else {
        let waitTime = Math.floor(Math.random() * (CONFIG.DELAY_NORMAL_MAX - CONFIG.DELAY_NORMAL_MIN + 1)) + CONFIG.DELAY_NORMAL_MIN;
        updateStatus(`❌ KẾT LUẬN: ĐÂY LÀ ${finalResult ? finalResult.label : "RÁC"}. Lướt qua!`);
        // Chờ bằng thanh thời gian (Hiển thị UI)
        await sleepWithCountdown(waitTime);
    }

    scrollToNextReel();
    setTimeout(botLoop, 3000);
}

// Giao diện trôi nổi trên trang Facebook
function injectFloatingUI() {
    if (document.getElementById('fb-dog-bot-ui')) return;

    const style = document.createElement('style');
    style.innerHTML = `
        #fb-dog-bot-ui {
            position: fixed; top: 20px; right: 20px; width: 360px; min-width: 300px;
            max-width: 800px; max-height: 90vh; background: #0f172a; color: #e2e8f0;
            font-family: 'Inter', sans-serif; z-index: 9999999; border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5); display: flex; flex-direction: column;
            resize: both; overflow: auto; border: 1px solid #334155;
        }
        #fb-dog-bot-header {
            padding: 12px 16px; background: #1e293b; border-bottom: 1px solid #334155;
            cursor: move; display: flex; justify-content: space-between; align-items: center;
        }
        #fb-dog-bot-header h2 { margin: 0; font-size: 16px; color: #38bdf8; font-weight: 700; }
        #fb-dog-bot-content { padding: 16px; flex-grow: 1; overflow-y: auto; }
        #fb-dog-bot-ui .card { background: #1e293b; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
        #fb-dog-bot-ui .status-box { background: #020617; border-left: 3px solid #38bdf8; padding: 12px; font-size: 13px; color: #10b981; margin-bottom: 16px; word-wrap: break-word; }
        #fb-dog-bot-ui .setting-group { margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
        #fb-dog-bot-ui .setting-group label { font-size: 12px; color: #94a3b8; font-weight: 600; }
        #fb-dog-bot-ui .setting-group input { width: 50px; padding: 4px; border-radius: 4px; border: 1px solid #475569; background: #0f172a; color: #38bdf8; text-align: center; }
        #fb-dog-bot-ui .btn { width: 100%; padding: 12px; border: none; border-radius: 8px; background: #38bdf8; font-weight: 700; cursor: pointer; margin-bottom: 8px; transition: 0.2s; }
        #fb-dog-bot-ui .btn:hover { background: #7dd3fc; }
        #fb-dog-bot-ui .btn-save { background: #10b981; }
        #fb-dog-bot-ui .btn-save:hover { background: #34d399; }
        #fb-dog-bot-ui .btn-toggle.off { background: #ef4444; color: white; }
        #fb-dog-bot-ui .pred-bar { margin: 12px 0; }
        #fb-dog-bot-ui .pred-label { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; font-weight: 600; }
        #fb-dog-bot-ui .bar-bg { background: #334155; border-radius: 4px; height: 10px; overflow: hidden; }
        #fb-dog-bot-ui .bar-fill { height: 100%; width: 0%; transition: width 0.4s; }
        #fb-dog-bot-ui .fill-puppy { background: #ec4899; }
        #fb-dog-bot-ui .fill-adult { background: #38bdf8; }
        #fb-dog-bot-ui .fill-none { background: #94a3b8; }
        #fb-dog-bot-ui .timer-container { margin-top: 16px; padding-top: 12px; border-top: 1px dashed #334155; display: none; }
        #fb-dog-bot-ui .timer-label { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 8px; color: #94a3b8; }
        #fb-dog-bot-ui .timer-bg { background: #334155; border-radius: 6px; height: 12px; overflow: hidden; }
        #fb-dog-bot-ui .timer-fill { height: 100%; width: 100%; background: linear-gradient(90deg, #f59e0b, #ef4444); }
        #fb-dog-bot-ui .close-btn { background: none; border: none; color: #ef4444; font-size: 16px; cursor: pointer; }
    `;
    document.head.appendChild(style);

    const ui = document.createElement('div');
    ui.id = 'fb-dog-bot-ui';
    ui.innerHTML = `
        <div id="fb-dog-bot-header">
            <h2>🐶 Dog Bot PRO</h2>
            <button class="close-btn" id="fb-bot-close" title="Ẩn UI">✖</button>
        </div>
        <div id="fb-dog-bot-content">
            <div class="status-box" id="fb-bot-status">> Đang khởi động...</div>
            <div class="card">
                <div style="font-size: 12px; color: #94a3b8; margin-bottom: 8px; font-weight: 700;">⚙️ CẤU HÌNH</div>
                <div class="settings">
                    <div class="setting-group"><label>Threshold (%)</label><input type="number" id="fb-cfg-threshold"></div>
                    <div class="setting-group"><label>Delay Dog (s)</label><div><input type="number" id="fb-cfg-dog-min"> - <input type="number" id="fb-cfg-dog-max"></div></div>
                    <div class="setting-group"><label>Delay Rác (s)</label><div><input type="number" id="fb-cfg-none-min"> - <input type="number" id="fb-cfg-none-max"></div></div>
                    <div class="setting-group"><label>Follow Limit</label><input type="number" id="fb-cfg-session"></div>
                    <div class="setting-group"><label>Like Limit</label><input type="number" id="fb-cfg-like"></div>
                    <div class="setting-group"><label>Follow Rate</label><div><input type="number" id="fb-cfg-int-min"> - <input type="number" id="fb-cfg-int-max"></div></div>
                    <div class="setting-group"><label>Like Rate (%)</label><input type="number" id="fb-cfg-like-rate"></div>
                </div>
                <button class="btn btn-save" id="fb-bot-save">💾 LƯU CẤU HÌNH</button>
            </div>
            <div class="card">
                <div style="font-size: 12px; color: #94a3b8; margin-bottom: 8px; display: flex; justify-content: space-between; font-weight: 700;">
                    <span>LIVE STATS</span>
                    <span><span id="fb-bot-fl" style="color: #10b981;">0/0 FL</span> &nbsp; <span id="fb-bot-lk" style="color: #f43f5e;">0/0 LK</span></span>
                </div>
                <div class="pred-bar"><div class="pred-label"><span style="color: #38bdf8">Adult Dog</span><span id="fb-pct-adult">0%</span></div><div class="bar-bg"><div class="bar-fill fill-adult" id="fb-bar-adult"></div></div></div>
                <div class="pred-bar"><div class="pred-label"><span style="color: #ec4899">Puppy</span><span id="fb-pct-puppy">0%</span></div><div class="bar-bg"><div class="bar-fill fill-puppy" id="fb-bar-puppy"></div></div></div>
                <div class="pred-bar"><div class="pred-label"><span style="color: #94a3b8">Rác</span><span id="fb-pct-none">0%</span></div><div class="bar-bg"><div class="bar-fill fill-none" id="fb-bar-none"></div></div></div>
                <div class="timer-container" id="fb-timer-box">
                    <div class="timer-label"><span>Dwell Time</span><span id="fb-timer-text">0.0s</span></div>
                    <div class="timer-bg"><div class="timer-fill" id="fb-timer-bar"></div></div>
                </div>
            </div>
            <button class="btn btn-toggle" id="fb-bot-toggle">⏸️ TẠM DỪNG BOT</button>
        </div>
    `;
    document.body.appendChild(ui);

    // Kéo thả UI
    const header = document.getElementById('fb-dog-bot-header');
    let isDragging = false, offsetX, offsetY;
    header.addEventListener('mousedown', e => {
        isDragging = true;
        offsetX = e.clientX - ui.getBoundingClientRect().left;
        offsetY = e.clientY - ui.getBoundingClientRect().top;
        header.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
        if (!isDragging) return;
        ui.style.left = `${e.clientX - offsetX}px`;
        ui.style.top = `${e.clientY - offsetY}px`;
        ui.style.right = 'auto'; // Disable right anchoring
    });
    window.addEventListener('mouseup', () => {
        isDragging = false;
        header.style.cursor = 'move';
    });

    document.getElementById('fb-bot-close').addEventListener('click', () => { ui.style.display = 'none'; });

    const fields = {
        threshold: document.getElementById('fb-cfg-threshold'),
        dogMin: document.getElementById('fb-cfg-dog-min'), dogMax: document.getElementById('fb-cfg-dog-max'),
        noneMin: document.getElementById('fb-cfg-none-min'), noneMax: document.getElementById('fb-cfg-none-max'),
        session: document.getElementById('fb-cfg-session'), like: document.getElementById('fb-cfg-like'),
        intMin: document.getElementById('fb-cfg-int-min'), intMax: document.getElementById('fb-cfg-int-max'),
        likeRate: document.getElementById('fb-cfg-like-rate')
    };

    chrome.storage.local.get(['botConfig'], (result) => {
        let conf = result.botConfig || CONFIG;
        fields.threshold.value = Math.round(conf.THRESHOLD * 100);
        fields.dogMin.value = conf.DELAY_DOG_MIN / 1000; fields.dogMax.value = conf.DELAY_DOG_MAX / 1000;
        fields.noneMin.value = conf.DELAY_NORMAL_MIN / 1000; fields.noneMax.value = conf.DELAY_NORMAL_MAX / 1000;
        fields.session.value = conf.SESSION_LIMIT; fields.like.value = conf.LIKE_LIMIT;
        fields.intMin.value = conf.FOLLOW_INTERVAL_MIN; fields.intMax.value = conf.FOLLOW_INTERVAL_MAX;
        fields.likeRate.value = conf.LIKE_RATE;
    });

    document.getElementById('fb-bot-save').addEventListener('click', e => {
        let newConfig = {
            THRESHOLD: parseFloat(fields.threshold.value) / 100,
            DELAY_DOG_MIN: parseFloat(fields.dogMin.value) * 1000, DELAY_DOG_MAX: parseFloat(fields.dogMax.value) * 1000,
            DELAY_NORMAL_MIN: parseFloat(fields.noneMin.value) * 1000, DELAY_NORMAL_MAX: parseFloat(fields.noneMax.value) * 1000,
            SESSION_LIMIT: parseInt(fields.session.value), LIKE_LIMIT: parseInt(fields.like.value),
            FOLLOW_INTERVAL_MIN: parseInt(fields.intMin.value), FOLLOW_INTERVAL_MAX: parseInt(fields.intMax.value),
            LIKE_RATE: parseInt(fields.likeRate.value)
        };
        chrome.storage.local.set({ botConfig: newConfig }, () => {
            Object.assign(CONFIG, newConfig);
            e.target.innerText = '✅ ĐÃ LƯU!';
            setTimeout(() => { e.target.innerText = '💾 LƯU CẤU HÌNH'; }, 2000);
        });
    });

    const toggleBtn = document.getElementById('fb-bot-toggle');
    toggleBtn.addEventListener('click', () => {
        isBotRunning = !isBotRunning;
        toggleBtn.innerText = isBotRunning ? '⏸️ TẠM DỪNG BOT' : '▶️ TIẾP TỤC CHẠY';
        toggleBtn.className = isBotRunning ? 'btn btn-toggle' : 'btn btn-toggle off';
        updateStatus(isBotRunning ? '▶️ Bot đã tiếp tục chạy.' : '⏸️ Đã TẠM DỪNG Bot.');
    });
}

// Chạy bot
loadAIModel().then(() => {
    injectFloatingUI();
    botLoop();
});
