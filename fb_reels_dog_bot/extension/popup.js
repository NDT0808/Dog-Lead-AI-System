document.addEventListener("DOMContentLoaded", () => {
    const statusText = document.getElementById("status-text");
    const barAdult = document.getElementById("bar-adult");
    const barPuppy = document.getElementById("bar-puppy");
    const barNone = document.getElementById("bar-none");
    const pctAdult = document.getElementById("pct-adult");
    const pctPuppy = document.getElementById("pct-puppy");
    const pctNone = document.getElementById("pct-none");
    const toggleBtn = document.getElementById("toggle-btn");

    const timerBox = document.getElementById("timer-box");
    const timerText = document.getElementById("timer-text");
    const timerBar = document.getElementById("timer-bar");

    // Config Elements
    const cfgThreshold = document.getElementById("cfg-threshold");
    const cfgDogMin = document.getElementById("cfg-dog-min");
    const cfgDogMax = document.getElementById("cfg-dog-max");
    const cfgNoneMin = document.getElementById("cfg-none-min");
    const cfgNoneMax = document.getElementById("cfg-none-max");
    const cfgSessionLimit = document.getElementById("cfg-session-limit");
    const cfgLikeLimit = document.getElementById("cfg-like-limit");
    const cfgIntMin = document.getElementById("cfg-int-min");
    const cfgIntMax = document.getElementById("cfg-int-max");
    const cfgLikeRate = document.getElementById("cfg-like-rate");
    const saveBtn = document.getElementById("save-btn");
    const followCounter = document.getElementById("follow-counter");
    const likeCounter = document.getElementById("like-counter");

    let isRunning = true;

    // Load initial config from storage
    chrome.storage.local.get(['botConfig'], (result) => {
        let conf = result.botConfig || {
            THRESHOLD: 0.50, DELAY_DOG_MIN: 10000, DELAY_DOG_MAX: 15000, DELAY_NORMAL_MIN: 2000, DELAY_NORMAL_MAX: 7000,
            SESSION_LIMIT: 20, LIKE_LIMIT: 100, FOLLOW_INTERVAL_MIN: 3, FOLLOW_INTERVAL_MAX: 7, LIKE_RATE: 70
        };
        cfgThreshold.value = Math.round(conf.THRESHOLD * 100);
        cfgDogMin.value = conf.DELAY_DOG_MIN / 1000;
        cfgDogMax.value = conf.DELAY_DOG_MAX / 1000;
        cfgNoneMin.value = conf.DELAY_NORMAL_MIN / 1000;
        cfgNoneMax.value = conf.DELAY_NORMAL_MAX / 1000;
        cfgSessionLimit.value = conf.SESSION_LIMIT || 20;
        cfgLikeLimit.value = conf.LIKE_LIMIT || 100;
        cfgIntMin.value = conf.FOLLOW_INTERVAL_MIN || 3;
        cfgIntMax.value = conf.FOLLOW_INTERVAL_MAX || 7;
        cfgLikeRate.value = conf.LIKE_RATE || 70;
    });

    // Save config
    saveBtn.addEventListener("click", () => {
        let newConfig = {
            THRESHOLD: parseFloat(cfgThreshold.value) / 100,
            DELAY_DOG_MIN: parseFloat(cfgDogMin.value) * 1000,
            DELAY_DOG_MAX: parseFloat(cfgDogMax.value) * 1000,
            DELAY_NORMAL_MIN: parseFloat(cfgNoneMin.value) * 1000,
            DELAY_NORMAL_MAX: parseFloat(cfgNoneMax.value) * 1000,
            SESSION_LIMIT: parseInt(cfgSessionLimit.value),
            LIKE_LIMIT: parseInt(cfgLikeLimit.value),
            FOLLOW_INTERVAL_MIN: parseInt(cfgIntMin.value),
            FOLLOW_INTERVAL_MAX: parseInt(cfgIntMax.value),
            LIKE_RATE: parseInt(cfgLikeRate.value)
        };
        chrome.storage.local.set({ botConfig: newConfig }, () => {
            saveBtn.innerText = "✅ ĐÃ LƯU!";
            saveBtn.style.background = "#10b981";
            setTimeout(() => {
                saveBtn.innerText = "💾 LƯU CẤU HÌNH";
                saveBtn.style.background = "#10b981";
            }, 2000);
        });
    });

    // Lấy trạng thái hiện tại
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "requestStatus" }, (response) => {
                if (chrome.runtime.lastError) {
                    statusText.innerText = "> Lỗi kết nối Content Script. Hãy F5 trang facebook.com/reels để code mới nhận diện nhé.";
                    return;
                }
                if (response) updateUI(response);
            });
        }
    });

    // Lắng nghe realtime từ content.js
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === "updatePopup") updateUI(msg);
    });

    function updateUI(data) {
        if (data.statusMsg) statusText.innerText = "> " + data.statusMsg;

        if (data.followCount !== undefined && data.followLimit !== undefined) {
            followCounter.innerText = `${data.followCount}/${data.followLimit} FL`;
        }
        if (data.likeCount !== undefined && data.likeLimit !== undefined) {
            likeCounter.innerText = `${data.likeCount}/${data.likeLimit} LK`;
        }

        if (data.scores) {
            barAdult.style.width = `${data.scores.adult}%`;
            pctAdult.innerText = `${data.scores.adult}%`;

            barPuppy.style.width = `${data.scores.puppy}%`;
            pctPuppy.innerText = `${data.scores.puppy}%`;

            barNone.style.width = `${data.scores.non}%`;
            pctNone.innerText = `${data.scores.non}%`;
        }

        if (data.timer && data.timer.total > 0) {
            timerBox.style.display = "block";
            let pct = (data.timer.current / data.timer.total) * 100;
            timerBar.style.width = `${Math.max(0, pct)}%`;
            timerText.innerText = `${(data.timer.current / 1000).toFixed(1)}s`;
        } else {
            timerBox.style.display = "none";
        }

        if (data.isRunning !== undefined) {
            isRunning = data.isRunning;
            toggleBtn.innerText = isRunning ? "⏸️ TẠM DỪNG BOT" : "▶️ TIẾP TỤC CHẠY";
            toggleBtn.className = isRunning ? "btn" : "btn off";
        }
    }

    toggleBtn.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "toggleBot" });
            }
        });
    });
});
