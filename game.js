// ==========================================
// GAMEWAR: CYBER BATTLE ARENA (WEB EDITION)
// ==========================================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window) || window.location.search.includes('mobile=true');
const MOBILE_MAX_DPR = 2.2;
const DESKTOP_MAX_DPR = 2;

// Responsive High-DPI Scaling Setup
let scale = 1;
let width = window.innerWidth;
let height = window.innerHeight;
let viewZoom = 1;

function getTargetViewZoom() {
    if (isMobile) {
        return width > height ? 1.25 : 1.35;
    }
    return Math.min(0.9, Math.max(0.78, 900 / Math.max(width, height)));
}

function resizeCanvas() {
    const rawDpr = window.devicePixelRatio || 1;
    const dpr = Math.min(rawDpr, isMobile ? MOBILE_MAX_DPR : DESKTOP_MAX_DPR);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    scale = dpr;
    viewZoom = getTargetViewZoom();
}
window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", () => {
    setTimeout(resizeCanvas, 200);
});
resizeCanvas();

// ==========================================
// GAME CONSTANTS & STATE
// ==========================================
const STATE = {
    MAIN_MENU: 0,
    PLAYING: 1,
    UPGRADE: 2,
    DEFEAT: 3,
    PAUSED: 4
};

let gameState = STATE.MAIN_MENU;
let profile = {
    stage_index: 1,
    highest_stage: 1,
    coins: 10000,
    unlocked_upgrades: [],
    cleared_stages: [],
    unlocked_features: [],
    unlocked_supers: [],
    active_super: null,
    kills: 0
};

let settings = {
    aimMode: "auto",
    vfxQuality: isMobile ? "low" : "high",
    sound: "on"
};

function isHighVfx() {
    return !isMobile && settings.vfxQuality === "high";
}

function isLowVfx() {
    return isMobile || settings.vfxQuality === "low";
}

let playerStats = {};
let player = null;
let enemies = [];
let projectiles = [];
let particles = [];
let floatingTexts = [];
let obstacles = [];
let napalmPuddles = [];
let coins = [];
let teleportPads = [];
let speedPads = [];

// Super Power Global variables
let superPowerCharge = 0; // 0 to 100
let superPowerActive = false;
let activeSuperPowerDuration = 0; // remaining active duration
let stormStrikesRemaining = 0;
let stormTimer = 0;
let upSuperBladeWave = 0;
let upSuperWaveCooldown = 0;
let upSuperBlades = [];

const arenaHalfSize = 1800; // Expanded Arena dimensions: -1800 to 1800

// Camera & VFX variables
let camera = { x: 0, y: 0, targetX: 0, targetY: 0 };
let shakeIntensity = 0;
let shakeDecay = 14;

// Mobile Joystick State
let joystickLeft = { x: 0, y: 0, startX: 0, startY: 0, active: false, id: -1, moveX: 0, moveY: 0 };
let joystickRight = { x: 0, y: 0, startX: 0, startY: 0, active: false, id: -1, aimX: 0, aimY: 0, isFiring: false };
const joyOuterRadius = 65;
const joyInnerRadius = 25;

// Color Palettes
const PLAYER_COLOR = "#339ef2";
const ENEMY_COLORS = {
    grunt: "#e6d147",
    striker: "#eb8033",
    sniper: "#b752ea",
    boss: "#db2938"
};

// ==========================================
// INPUT HANDLING
// ==========================================
const keys = {};
let mousePos = { x: 0, y: 0 };
let isMouseDown = false;
let autoAim = true;
let deferredInstallPrompt = null;

window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.code === "Escape") {
        if (gameState === STATE.PLAYING || gameState === STATE.PAUSED) {
            togglePause();
            e.preventDefault();
            return;
        }
    }

    const blockedKeys = ["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "spacebar"];
    if (blockedKeys.includes(e.key.toLowerCase())) {
        e.preventDefault();
    }
    keys[e.key.toLowerCase()] = true;
    keys[e.code.toLowerCase()] = true;
    
    // F key OR Space triggers super power manually
    const isF = e.key.toLowerCase() === "f" || e.code.toLowerCase() === "keyf";
    const isSpace = e.key === " " || e.code.toLowerCase() === "space";
    if ((isF || isSpace) && gameState === STATE.PLAYING) {
        activateSuperPower();
    }
});

window.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
    keys[e.code.toLowerCase()] = false;
});

function requestGamePointerLock() {
    if (isMobile) return;
    canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;
    if (canvas.requestPointerLock) {
        canvas.requestPointerLock();
    }
}

function releaseGamePointerLock() {
    if (isMobile) return;
    const exit = document.exitPointerLock || document.mozExitPointerLock || document.webkitExitPointerLock;
    if (exit) {
        exit.call(document);
    }
}

function updatePointerLockWarning() {
    if (isMobile) {
        const warning = document.getElementById("pointerLockWarning");
        if (warning) warning.classList.add("hide");
        return;
    }
    const isLocked = document.pointerLockElement === canvas || document.mozPointerLockElement === canvas || document.webkitPointerLockElement === canvas;
    const warning = document.getElementById("pointerLockWarning");
    if (warning) {
        if (gameState === STATE.PLAYING && !isLocked) {
            togglePause(); // Auto pause when losing pointer lock!
        } else {
            warning.classList.add("hide");
        }
    }
}

document.addEventListener("pointerlockchange", updatePointerLockWarning);
document.addEventListener("mozpointerlockchange", updatePointerLockWarning);
document.addEventListener("webkitpointerlockchange", updatePointerLockWarning);

window.addEventListener("mousemove", (e) => {
    const isLocked = document.pointerLockElement === canvas || document.mozPointerLockElement === canvas || document.webkitPointerLockElement === canvas;
    if (isLocked) {
        // Accumulate relative movement for custom crosshair when pointer is locked
        mousePos.x = Math.max(0, Math.min(width, mousePos.x + e.movementX));
        mousePos.y = Math.max(0, Math.min(height, mousePos.y + e.movementY));
    } else {
        // Normal cursor tracking
        mousePos.x = e.clientX;
        mousePos.y = e.clientY;
    }
});

canvas.addEventListener("click", () => {
    if (gameState === STATE.PLAYING) {
        requestGamePointerLock();
    }
});

window.addEventListener("mousedown", (e) => {
    if (e.button === 0) isMouseDown = true;
});

window.addEventListener("mouseup", (e) => {
    if (e.button === 0) isMouseDown = false;
});

// Mobile Touch Joystick Events
window.addEventListener("touchstart", (e) => {
    if (gameState !== STATE.PLAYING) return;
    
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const tx = touch.clientX;
        const ty = touch.clientY;
        
        // Left side touch -> Move Joystick
        if (tx < width * 0.45 && !joystickLeft.active) {
            joystickLeft.active = true;
            joystickLeft.id = touch.identifier;
            joystickLeft.startX = tx;
            joystickLeft.startY = ty;
            joystickLeft.x = tx;
            joystickLeft.y = ty;
            joystickLeft.moveX = 0;
            joystickLeft.moveY = 0;
        } 
        // Right side touch -> Aim & Shoot Joystick
        else if (tx >= width * 0.55 && !joystickRight.active) {
            joystickRight.active = true;
            joystickRight.id = touch.identifier;
            joystickRight.startX = tx;
            joystickRight.startY = ty;
            joystickRight.x = tx;
            joystickRight.y = ty;
            joystickRight.aimX = 0;
            joystickRight.aimY = 0;
            joystickRight.isFiring = true;
        }
    }
});

window.addEventListener("touchmove", (e) => {
    if (gameState !== STATE.PLAYING) return;
    
    for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        const tx = touch.clientX;
        const ty = touch.clientY;
        
        if (touch.identifier === joystickLeft.id) {
            let dx = tx - joystickLeft.startX;
            let dy = ty - joystickLeft.startY;
            let dist = Math.hypot(dx, dy);
            if (dist > joyOuterRadius) {
                dx = (dx / dist) * joyOuterRadius;
                dy = (dy / dist) * joyOuterRadius;
            }
            joystickLeft.x = joystickLeft.startX + dx;
            joystickLeft.y = joystickLeft.startY + dy;
            joystickLeft.moveX = dx / joyOuterRadius;
            joystickLeft.moveY = dy / joyOuterRadius;
        } 
        else if (touch.identifier === joystickRight.id) {
            let dx = tx - joystickRight.startX;
            let dy = ty - joystickRight.startY;
            let dist = Math.hypot(dx, dy);
            if (dist > joyOuterRadius) {
                dx = (dx / dist) * joyOuterRadius;
                dy = (dy / dist) * joyOuterRadius;
            }
            joystickRight.x = joystickRight.startX + dx;
            joystickRight.y = joystickRight.startY + dy;
            joystickRight.aimX = dx / joyOuterRadius;
            joystickRight.aimY = dy / joyOuterRadius;
            joystickRight.isFiring = dist > 10; // Fire if dragged out of deadzone
        }
    }
});

const handleTouchEnd = (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === joystickLeft.id) {
            joystickLeft.active = false;
            joystickLeft.id = -1;
            joystickLeft.moveX = 0;
            joystickLeft.moveY = 0;
        }
        else if (touch.identifier === joystickRight.id) {
            joystickRight.active = false;
            joystickRight.id = -1;
            joystickRight.aimX = 0;
            joystickRight.aimY = 0;
            joystickRight.isFiring = false;
        }
    }
};

window.addEventListener("touchend", handleTouchEnd);
window.addEventListener("touchcancel", handleTouchEnd);

// ==========================================
// UPGRADES & DATABASE (GAMEDATA)
// ==========================================
const UPGRADES = [
    {
        id: "reinforced_hull",
        name: "الهيكل المصفّح",
        description: "زيادة نقاط الصحة القصوى والدروع لحماية إضافية.",
        benefit: "صحة +35 | درع +1.5",
        cost: 55,
        one_time: true,
        requires: [],
        mods: { max_hp: 35.0, armor: 1.5 },
        rarity: "common"
    },
    {
        id: "turbo_drive",
        name: "المحرك النفاث",
        description: "تحرك أسرع والتفاف أسرع للدبابة والمستشعرات.",
        benefit: "سرعة +45 | التفاف +1.5",
        cost: 60,
        one_time: true,
        requires: ["reinforced_hull"],
        mods: { move_speed: 45.0, turn_speed: 1.5, features_add: ["dash"] },
        rarity: "common"
    },
    {
        id: "high_caliber",
        name: "العيار الثقيل",
        description: "زيادة الضرر الأساسي للقذائف بشكل ملحوظ.",
        benefit: "ضرر أساسي +8",
        cost: 65,
        one_time: true,
        requires: ["reinforced_hull"],
        mods: { damage: 8.0 },
        rarity: "common"
    },
    {
        id: "quick_reload",
        name: "التلقيم السريع",
        description: "تقليل زمن إعادة تلقيم السلاح لإطلاق متتابع.",
        benefit: "سرعة الإطلاق +35%",
        cost: 70,
        one_time: true,
        requires: ["high_caliber"],
        mods: { fire_rate: 0.35 },
        rarity: "rare"
    },
    {
        id: "armor_piercing",
        name: "خارق الدروع",
        description: "اختراق القذائف للأعداء لتصيب من خلفهم.",
        benefit: "اختراق الأعداء +1",
        cost: 75,
        one_time: true,
        requires: ["quick_reload"],
        mods: { projectile_pierce: 1, features_add: ["piercing"] },
        rarity: "rare"
    },
    {
        id: "explosive_rounds",
        name: "الذخيرة المتفجرة",
        description: "انفجار القذائف عند الاصطدام لإلحاق ضرر جماعي.",
        benefit: "ضرر انفجاري +4 في مدى 60px",
        cost: 80,
        one_time: true,
        requires: ["high_caliber"],
        mods: { damage: 4.0, splash_radius: 60.0, features_add: ["explosive"] },
        rarity: "epic"
    },
    {
        id: "frost_shells",
        name: "القذائف المجمّدة",
        description: "تبطئ القذائف حركة الأعداء عند إصابتهم.",
        benefit: "تبطئ العدو 12% لـ 0.5 ثانية",
        cost: 85,
        one_time: true,
        requires: ["quick_reload"],
        mods: { slow_multiplier: -0.12, slow_duration: 0.5, features_add: ["slow"] },
        rarity: "rare"
    },
    {
        id: "shield_generator",
        name: "مولد الدروع",
        description: "إضافة درع طاقة يمتص الضرر ويتجدد تلقائياً.",
        benefit: "سعة الدرع +25 | تجدد +4/ث",
        cost: 95,
        one_time: true,
        requires: ["reinforced_hull"],
        mods: { shield_capacity: 25.0, shield_regen: 4.0, features_add: ["shield"] },
        rarity: "epic"
    },
    {
        id: "rail_shells",
        name: "قذائف الريل الخارقة",
        description: "سرعة مقذوفات فائقة مع زيادة المدى وقوة الاختراق.",
        benefit: "ضرر +10 | سرعة ومدى القذيفة +20%",
        cost: 110,
        one_time: true,
        requires: ["armor_piercing"],
        mods: { damage: 10.0, projectile_speed: 180.0, projectile_range: 220.0, projectile_pierce: 1, features_add: ["rail"] },
        rarity: "legendary"
    }
];

function getPlayerBaseStats() {
    return {
        max_hp: 350.0,
        damage: 22.0,
        fire_rate: 1.6,
        move_speed: 260.0,
        armor: 2.0,
        projectile_speed: 880.0,
        projectile_range: 1100.0,
        projectile_pierce: 0,
        splash_radius: 0.0,
        slow_multiplier: 0.85,
        slow_duration: 1.2,
        shield_capacity: 100.0,
        shield_regen: 6.0,
        turn_speed: 10.0,
        features: []
    };
}

function applyUpgrade(stats, upgrade) {
    const copy = JSON.parse(JSON.stringify(stats));
    const mods = upgrade.mods;
    for (const key in mods) {
        if (key === "features_add") {
            mods[key].forEach(feature => {
                if (!copy.features.includes(feature)) {
                    copy.features.push(feature);
                }
            });
        } else {
            copy[key] = (copy[key] || 0) + mods[key];
        }
    }
    return copy;
}

const SHOP_FEATURES = [
    {
        id: "emp_pulse",
        name: "النبض الكهرومغناطيسي (EMP)",
        description: "فرصة 12% عند إصابة العدو لشل حركته وإطلاق النار عليه لمدة 1.5 ثانية.",
        cost: 100,
        rarity: "rare"
    },
    {
        id: "split_shot",
        name: "طلقة الانقسام (Split Shot)",
        description: "إطلاق قذيفتين إضافيتين بزاوية +/- 15 درجة لمضاعفة الهجوم.",
        cost: 150,
        rarity: "epic"
    },
    {
        id: "deflector_shield",
        name: "الدرع العاكس (Deflector)",
        description: "مضاعفة سعة درع الطاقة، مع فرصة 20% لعكس القذائف الممتصة.",
        cost: 200,
        rarity: "epic"
    },
    {
        id: "overdrive_dash",
        name: "الاندفاع الفائق (Overdrive)",
        description: "عند انخفاض الصحة عن 40%، تزيد السرعة 35% وسرعة الإطلاق 50%.",
        cost: 250,
        rarity: "rare"
    },
    {
        id: "mega_napalm",
        name: "النابالم الحارق (Napalm)",
        description: "انفجار القذائف يخلق بقع نيران على الأرض تلحق ضرراً مستمراً بالأعداء.",
        cost: 300,
        rarity: "epic"
    },
    {
        id: "phase_bullet",
        name: "قذيفة الاختراق الكمي (Phase)",
        description: "طلقات اللاعب تخترق الجدران وتخترق الأعداء لمرة واحدة دون أن تتلاشى.",
        cost: 350,
        rarity: "rare"
    },
    {
        id: "chronos_field",
        name: "حقل التباطؤ الزمني (Chronos)",
        description: "إنشاء هالة زمنية تبطئ سرعة الأعداء ومقذوفاتهم بنسبة 40% عند اقترابهم.",
        cost: 400,
        rarity: "rare"
    },
    {
        id: "nanite_field",
        name: "شحن النانو الذاتي (Nanite)",
        description: "تجديد فوري لـ 20% من سعة درع الطاقة عند تدمير أي دبابة عدو.",
        cost: 500,
        rarity: "epic"
    },
    {
        id: "plasma_cannon",
        name: "مدفع البلازما الفوضوي (Plasma)",
        description: "قذائف بلازما ضخمة تفجر وتصعق الأعداء، وتطلق 6 قذائف ليزرية دائرية عند الانفجار.",
        cost: 1200,
        rarity: "legendary"
    },
    {
        id: "singularity_bomb",
        name: "غضب التنين الذري (Singularity)",
        description: "تطلق قنبلة جاذبية تسحب جميع الأعداء لمركزها 1.2 ثانية ثم تنفجر في انهيار نووي مدمر.",
        cost: 1500,
        rarity: "legendary"
    },
    {
        id: "homing_missile",
        name: "الصاروخ الموجه الذاتي (Homing)",
        description: "قذائف اللاعب تنجذب وتوجه نفسها تلقائياً نحو أقرب هدف معادي في الميدان لتضمن الإصابة.",
        cost: 1000,
        rarity: "legendary"
    },
    {
        id: "shock_retaliation",
        name: "الهجمة الصاعقة المرتدة (Retaliate)",
        description: "عندما يخترق الأعداء درع دباباتك بالكامل، يتم إطلاق صعقة كهرومغناطيسية دائرية تشل حركة الأعداء القريبين لـ 1.8 ثانية.",
        cost: 800,
        rarity: "epic"
    }
];

// Save & Load System
function loadProfile() {
    const saved = localStorage.getItem("gamewar_save");
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            profile = {
                stage_index: parsed.stage_index || 1,
                highest_stage: parsed.highest_stage || 1,
                coins: typeof parsed.coins === "number" ? parsed.coins : 10000,
                unlocked_upgrades: parsed.unlocked_upgrades || [],
                cleared_stages: parsed.cleared_stages || [],
                unlocked_features: parsed.unlocked_features || [],
                unlocked_supers: parsed.unlocked_supers || [],
                active_super: parsed.active_super || null,
                kills: parsed.kills || 0
            };
        } catch (e) {
            console.error("Failed parsing profile save:", e);
        }
    } else {
        // Initial setup
        profile = {
            stage_index: 1,
            highest_stage: 1,
            coins: 10000,
            unlocked_upgrades: [],
            cleared_stages: [],
            unlocked_features: [],
            unlocked_supers: [],
            active_super: null,
            kills: 0
        };
    }
    
    const savedSettings = localStorage.getItem("gamewar_settings");
    if (savedSettings) {
        try {
            settings = { ...settings, ...JSON.parse(savedSettings) };
        } catch (e) {
            console.error("Failed parsing settings save:", e);
        }
    }
    if (isMobile) {
        settings.vfxQuality = "low";
        document.body.classList.add("is-mobile");
        const desktopHintEl = document.getElementById("desktopHint");
        const mobileHintEl = document.getElementById("mobileHint");
        if (desktopHintEl) desktopHintEl.classList.add("hide");
        if (mobileHintEl) mobileHintEl.classList.remove("hide");
    }
    
    // Sync Settings UI dropdowns
    document.getElementById("settingAimMode").value = settings.aimMode;
    document.getElementById("settingVfxQuality").value = settings.vfxQuality;
    document.getElementById("settingSound").value = settings.sound;
    autoAim = (settings.aimMode === "auto");
    if (player) player.autoAim = autoAim;
    
    // Sync Cyber Toggles & Init Tabs
    syncCyberToggles();
    initCyberToggles();
    initMenuTabs();
    
    recalculatePlayerStats();
}

function saveProfile() {
    localStorage.setItem("gamewar_save", JSON.stringify(profile));
}

function saveSettings() {
    localStorage.setItem("gamewar_settings", JSON.stringify(settings));
}

function resetProfile() {
    localStorage.removeItem("gamewar_save");
    profile = {
        stage_index: 1,
        highest_stage: 1,
        coins: 0,
        unlocked_upgrades: [],
        cleared_stages: [],
        unlocked_features: [],
        unlocked_supers: [],
        active_super: null,
        kills: 0
    };
    saveProfile();
    recalculatePlayerStats();
    populateShopUI();
    if (typeof populateSuperPowersUI === "function") populateSuperPowersUI();
}

function recalculatePlayerStats() {
    let stats = getPlayerBaseStats();
    profile.unlocked_upgrades.forEach(id => {
        const up = UPGRADES.find(u => u.id === id);
        if (up) stats = applyUpgrade(stats, up);
    });
    
    if (!profile.unlocked_features) {
        profile.unlocked_features = [];
    }
    
    profile.unlocked_features.forEach(featId => {
        if (!stats.features.includes(featId)) {
            stats.features.push(featId);
        }
        
        // Apply same fire rate / damage modifiers to the player as well for balance
        if (featId === "split_shot") {
            stats.fire_rate *= 0.70;
        } else if (featId === "plasma_cannon") {
            stats.damage *= 1.25;
            stats.fire_rate *= 0.60;
        } else if (featId === "singularity_bomb") {
            stats.damage *= 1.35;
            stats.fire_rate *= 0.50;
        }
    });
    
    if (profile.unlocked_features.includes("deflector_shield")) {
        stats.shield_capacity = (stats.shield_capacity || 0) * 2;
        if (stats.shield_capacity === 0) {
            stats.shield_capacity = 40.0;
            stats.shield_regen = Math.max(stats.shield_regen, 3.0);
        }
    }
    
    stats.upgrades = [...profile.unlocked_upgrades];
    playerStats = stats;
}

function drawFeatureIcon(canvas, id) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    
    // Scale dynamically from the base 48x48 coordinates
    ctx.scale(canvas.width / 48, canvas.height / 48);
    
    ctx.shadowBlur = 6;
    ctx.lineWidth = 2.5;
    
    if (id === "emp_pulse") {
        ctx.strokeStyle = "#4cd6ff";
        ctx.shadowColor = "#4cd6ff";
        ctx.fillStyle = "rgba(76, 214, 255, 0.15)";
        
        // Center core
        ctx.beginPath();
        ctx.arc(24, 24, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Outer pulsing ring
        ctx.strokeStyle = "rgba(76, 214, 255, 0.4)";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(24, 24, 18, 0, Math.PI * 2);
        ctx.stroke();
        
        // Lightning bolts
        ctx.strokeStyle = "#4cd6ff";
        ctx.lineWidth = 2.0;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
            ctx.beginPath();
            ctx.moveTo(24, 24);
            const mx1 = 24 + Math.cos(a + 0.25) * 11;
            const my1 = 24 + Math.sin(a + 0.25) * 11;
            ctx.lineTo(mx1, my1);
            const mx2 = mx1 + Math.cos(a - 0.2) * 9;
            const my2 = my1 + Math.sin(a - 0.2) * 9;
            ctx.lineTo(mx2, my2);
            ctx.stroke();
            
            // Spark dots at tips
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(mx2, my2, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    else if (id === "split_shot") {
        ctx.strokeStyle = "#33f276";
        ctx.shadowColor = "#33f276";
        
        // Gun base outline
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(4, 20, 10, 8);
        ctx.strokeStyle = "#33f276";
        ctx.strokeRect(4, 20, 10, 8);
        
        // 3 branching trajectories
        const targets = [
            {x: 40, y: 12},
            {x: 42, y: 24},
            {x: 40, y: 36}
        ];
        targets.forEach(t => {
            ctx.strokeStyle = "rgba(51, 242, 118, 0.35)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(14, 24);
            ctx.lineTo(t.x, t.y);
            ctx.stroke();
            
            // Glowing bullet head
            ctx.fillStyle = "#ffffff";
            ctx.shadowColor = "#33f276";
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(t.x, t.y, 3.5, 0, Math.PI * 2);
            ctx.fill();
            
            // Side spark indicators
            ctx.fillStyle = "#33f276";
            ctx.beginPath();
            ctx.arc(t.x - 6, t.y, 2, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    else if (id === "deflector_shield") {
        // Shield arc
        ctx.strokeStyle = "#339ef2";
        ctx.shadowColor = "#339ef2";
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(14, 24, 16, -Math.PI / 2.2, Math.PI / 2.2);
        ctx.stroke();
        
        // Incoming red laser beam
        ctx.strokeStyle = "#f2334b";
        ctx.shadowColor = "#f2334b";
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(42, 14);
        ctx.lineTo(26, 20);
        ctx.stroke();
        
        // Bullet impact spark
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#ffffff";
        ctx.beginPath();
        ctx.arc(26, 20, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Reflected green laser beam
        ctx.strokeStyle = "#33f276";
        ctx.shadowColor = "#33f276";
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(26, 20);
        ctx.lineTo(42, 34);
        ctx.stroke();
    }
    else if (id === "overdrive_dash") {
        ctx.strokeStyle = "#ff7700";
        ctx.shadowColor = "#ff7700";
        
        // Motion speed lines behind
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255, 119, 0, 0.3)";
        ctx.beginPath();
        ctx.moveTo(4, 18); ctx.lineTo(16, 18);
        ctx.moveTo(2, 24); ctx.lineTo(20, 24);
        ctx.moveTo(4, 30); ctx.lineTo(16, 30);
        ctx.stroke();
        
        // Sleek mini tank body
        ctx.fillStyle = "rgba(255, 119, 0, 0.15)";
        ctx.strokeStyle = "#ff7700";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(18, 14);
        ctx.lineTo(34, 18);
        ctx.lineTo(34, 30);
        ctx.lineTo(18, 34);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Glowing speed tip
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#ff7700";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(34, 24, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    else if (id === "mega_napalm") {
        // Flame using bezier curves
        ctx.strokeStyle = "#ff3300";
        ctx.shadowColor = "#ff3300";
        ctx.lineWidth = 2.0;
        
        // Underneath burning puddle
        ctx.fillStyle = "rgba(255, 85, 0, 0.3)";
        ctx.beginPath();
        ctx.ellipse(24, 37, 14, 3.5, 0, 0, Math.PI*2);
        ctx.fill();
        
        // Main Flame shape
        ctx.fillStyle = "rgba(255, 85, 0, 0.25)";
        ctx.beginPath();
        ctx.moveTo(24, 36);
        ctx.bezierCurveTo(14, 36, 12, 24, 20, 15);
        ctx.bezierCurveTo(16, 8, 24, 4, 24, 4);
        ctx.bezierCurveTo(24, 4, 32, 8, 28, 15);
        ctx.bezierCurveTo(36, 24, 34, 36, 24, 36);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Inner flame core (yellow)
        ctx.fillStyle = "rgba(255, 218, 51, 0.75)";
        ctx.strokeStyle = "#ffda33";
        ctx.shadowColor = "#ffda33";
        ctx.beginPath();
        ctx.moveTo(24, 34);
        ctx.bezierCurveTo(18, 34, 17, 26, 22, 20);
        ctx.bezierCurveTo(20, 16, 24, 12, 24, 12);
        ctx.bezierCurveTo(24, 12, 28, 16, 26, 20);
        ctx.bezierCurveTo(30, 26, 30, 34, 24, 34);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    else if (id === "phase_bullet") {
        ctx.strokeStyle = "#facc15";
        ctx.shadowColor = "#facc15";
        ctx.lineWidth = 2.0;
        
        // Vertical dashed wall representing barrier
        ctx.strokeStyle = "rgba(250, 204, 21, 0.35)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(24, 8);
        ctx.lineTo(24, 40);
        ctx.stroke();
        ctx.setLineDash([]); // Reset
        
        // Phase trajectory line
        ctx.strokeStyle = "#facc15";
        ctx.beginPath();
        ctx.moveTo(6, 24);
        ctx.lineTo(42, 24);
        ctx.stroke();
        
        // Glowing bullet head (after the wall)
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(36, 24, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Trailing phase rings
        ctx.strokeStyle = "rgba(250, 204, 21, 0.6)";
        ctx.beginPath();
        ctx.arc(14, 24, 3, 0, Math.PI*2);
        ctx.arc(24, 24, 3, 0, Math.PI*2);
        ctx.stroke();
    }
    else if (id === "chronos_field") {
        ctx.strokeStyle = "#22c55e";
        ctx.shadowColor = "#22c55e";
        ctx.lineWidth = 2.0;
        
        // Outer gear / circular distortion field
        ctx.strokeStyle = "rgba(34, 197, 94, 0.3)";
        ctx.beginPath();
        ctx.arc(24, 24, 18, 0, Math.PI * 2);
        ctx.stroke();
        
        // Clock tick marks on the circle
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 1.5;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
            ctx.beginPath();
            ctx.moveTo(24 + Math.cos(a) * 15, 24 + Math.sin(a) * 15);
            ctx.lineTo(24 + Math.cos(a) * 18, 24 + Math.sin(a) * 18);
            ctx.stroke();
        }
        
        // Clock hands in center
        ctx.beginPath();
        ctx.moveTo(24, 24);
        ctx.lineTo(24, 13); // minute hand
        ctx.moveTo(24, 24);
        ctx.lineTo(32, 24); // hour hand
        ctx.stroke();
        
        // Center pivot dot
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(24, 24, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }
    else if (id === "nanite_field") {
        ctx.strokeStyle = "#a855f7";
        ctx.shadowColor = "#a855f7";
        ctx.lineWidth = 2.0;
        
        // Shield polygon (crest shape)
        ctx.fillStyle = "rgba(168, 85, 247, 0.15)";
        ctx.beginPath();
        ctx.moveTo(24, 8);
        ctx.lineTo(38, 14);
        ctx.lineTo(34, 30);
        ctx.quadraticCurveTo(24, 38, 24, 41);
        ctx.quadraticCurveTo(24, 38, 14, 30);
        ctx.lineTo(10, 14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Molecular hex nanite grid lines inside shield
        ctx.strokeStyle = "rgba(168, 85, 247, 0.5)";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(24, 14); ctx.lineTo(30, 17.5); ctx.lineTo(30, 24.5); ctx.lineTo(24, 28); ctx.lineTo(18, 24.5); ctx.lineTo(18, 17.5); ctx.closePath();
        ctx.moveTo(24, 28); ctx.lineTo(24, 36);
        ctx.stroke();
        
        // Repair sparkles
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(31, 13, 1.5, 0, Math.PI*2);
        ctx.arc(16, 29, 2, 0, Math.PI*2);
        ctx.fill();
    }
    else if (id === "plasma_cannon") {
        ctx.strokeStyle = "#ec4899";
        ctx.shadowColor = "#ec4899";
        ctx.lineWidth = 2.0;
        
        // Cannon barrel (detailed)
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(4, 20, 12, 8);
        ctx.strokeRect(4, 20, 12, 8);
        
        // Glowing cannon muzzle ring
        ctx.strokeStyle = "#ffffff";
        ctx.strokeRect(16, 18, 2, 12);
        
        // Giant plasma orb
        const grad = ctx.createRadialGradient(28, 24, 2, 28, 24, 12);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.4, "#ec4899");
        grad.addColorStop(1, "rgba(236, 72, 153, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(28, 24, 12, 0, Math.PI * 2);
        ctx.fill();
        
        // Starburst rays (6 directions)
        ctx.strokeStyle = "rgba(236, 72, 153, 0.7)";
        ctx.lineWidth = 1.5;
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
            ctx.beginPath();
            ctx.moveTo(28 + Math.cos(a) * 8, 24 + Math.sin(a) * 8);
            ctx.lineTo(28 + Math.cos(a) * 19, 24 + Math.sin(a) * 19);
            ctx.stroke();
        }
    }
    else if (id === "singularity_bomb") {
        ctx.strokeStyle = "#8b5cf6";
        ctx.shadowColor = "#8b5cf6";
        ctx.lineWidth = 2.0;
        
        // Singularity black hole core
        ctx.fillStyle = "#000000";
        ctx.beginPath();
        ctx.arc(24, 24, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Spiral gravitational pull lines
        ctx.strokeStyle = "rgba(139, 92, 246, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.save();
        ctx.translate(24, 24);
        for (let i = 0; i < 5; i++) {
            ctx.rotate(Math.PI / 2.5);
            ctx.beginPath();
            ctx.moveTo(8, 0);
            ctx.quadraticCurveTo(12, 6, 18, 2);
            ctx.stroke();
        }
        ctx.restore();
        
        // Event horizon neon outer rings
        ctx.strokeStyle = "rgba(139, 92, 246, 0.8)";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(24, 24, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(168, 85, 247, 0.3)";
        ctx.beginPath();
        ctx.arc(24, 24, 16, 0, Math.PI * 2);
        ctx.stroke();
    }
    else if (id === "homing_missile") {
        ctx.strokeStyle = "#fb923c"; // Orange
        ctx.shadowColor = "#fb923c";
        ctx.fillStyle = "rgba(251, 146, 60, 0.15)";
        
        // Draw missile shape pointing up-right
        ctx.beginPath();
        ctx.moveTo(14, 34);
        ctx.lineTo(28, 20);
        ctx.lineTo(34, 26);
        ctx.lineTo(20, 40);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Homing target indicator lines around it
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(32, 16, 6, 0, Math.PI*2);
        ctx.stroke();
        
        // Crosshair ticks
        ctx.beginPath();
        ctx.moveTo(32, 8); ctx.lineTo(32, 12);
        ctx.moveTo(32, 20); ctx.lineTo(32, 24);
        ctx.moveTo(24, 16); ctx.lineTo(28, 16);
        ctx.moveTo(36, 16); ctx.lineTo(40, 16);
        ctx.stroke();
    }
    else if (id === "shock_retaliation") {
        ctx.strokeStyle = "#06b6d4"; // Cyan
        ctx.shadowColor = "#06b6d4";
        ctx.fillStyle = "rgba(6, 182, 212, 0.15)";
        
        // Draw a shield breaking or radiating energy
        ctx.beginPath();
        ctx.arc(24, 24, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Radiating pulse lines
        ctx.strokeStyle = "rgba(6, 182, 212, 0.45)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(24, 24, 16, 0, Math.PI*2);
        ctx.arc(24, 24, 22, 0, Math.PI*2);
        ctx.stroke();
        
        // Spark lines
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.0;
        for (let a = 0.5; a < Math.PI * 2; a += Math.PI / 2) {
            ctx.beginPath();
            ctx.moveTo(24 + Math.cos(a) * 10, 24 + Math.sin(a) * 10);
            ctx.lineTo(24 + Math.cos(a) * 16, 24 + Math.sin(a) * 16);
            ctx.stroke();
        }
    }
    
    ctx.restore();
}

function drawUpgradeIcon(canvas, id) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    
    // Scale dynamically from the base 48x48 coordinates
    ctx.scale(canvas.width / 48, canvas.height / 48);
    
    ctx.shadowBlur = 6;
    ctx.lineWidth = 2.5;
    
    if (id === "reinforced_hull") {
        ctx.strokeStyle = "#94a3b8";
        ctx.shadowColor = "#94a3b8";
        ctx.fillStyle = "rgba(148, 163, 184, 0.15)";
        
        ctx.beginPath();
        ctx.moveTo(24, 6);
        ctx.lineTo(38, 12);
        ctx.lineTo(34, 32);
        ctx.quadraticCurveTo(24, 40, 24, 42);
        ctx.quadraticCurveTo(24, 40, 14, 32);
        ctx.lineTo(10, 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Armor plate rivets
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(16, 16, 1.5, 0, Math.PI*2);
        ctx.arc(32, 16, 1.5, 0, Math.PI*2);
        ctx.arc(24, 30, 1.5, 0, Math.PI*2);
        ctx.fill();
    }
    else if (id === "turbo_drive") {
        ctx.strokeStyle = "#ff7700";
        ctx.shadowColor = "#ff7700";
        ctx.fillStyle = "rgba(255, 119, 0, 0.1)";
        
        // Booster nozzle
        ctx.beginPath();
        ctx.moveTo(10, 16);
        ctx.lineTo(26, 16);
        ctx.lineTo(22, 32);
        ctx.lineTo(14, 32);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Exhaust flames
        ctx.strokeStyle = "#ff3300";
        ctx.beginPath();
        ctx.moveTo(16, 32);
        ctx.lineTo(12, 42);
        ctx.moveTo(20, 32);
        ctx.lineTo(24, 42);
        ctx.moveTo(18, 32);
        ctx.lineTo(18, 44);
        ctx.stroke();
    }
    else if (id === "high_caliber") {
        ctx.strokeStyle = "#eb8033";
        ctx.shadowColor = "#eb8033";
        ctx.fillStyle = "rgba(235, 128, 51, 0.15)";
        
        // Thick barrel outline
        ctx.fillRect(8, 20, 26, 8);
        ctx.strokeRect(8, 20, 26, 8);
        
        // Huge muzzle tip
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(34, 16, 6, 16);
        ctx.strokeRect(34, 16, 6, 16);
        
        // Muzzle brake gas holes
        ctx.fillStyle = "#eb8033";
        ctx.beginPath();
        ctx.arc(37, 20, 1.5, 0, Math.PI*2);
        ctx.arc(37, 28, 1.5, 0, Math.PI*2);
        ctx.fill();
    }
    else if (id === "quick_reload") {
        ctx.strokeStyle = "#f2e233";
        ctx.shadowColor = "#f2e233";
        
        // Circular reload arrow
        ctx.beginPath();
        ctx.arc(24, 24, 14, -Math.PI / 3, Math.PI * 1.5);
        ctx.stroke();
        
        // Arrowhead
        ctx.fillStyle = "#f2e233";
        ctx.beginPath();
        ctx.moveTo(31, 10);
        ctx.lineTo(38, 12);
        ctx.lineTo(34, 5);
        ctx.closePath();
        ctx.fill();
        
        // Bullet inside the arrow
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(22, 20, 4, 8);
        ctx.beginPath();
        ctx.moveTo(22, 20);
        ctx.lineTo(24, 14);
        ctx.lineTo(26, 20);
        ctx.closePath();
        ctx.fill();
    }
    else if (id === "armor_piercing") {
        ctx.strokeStyle = "#f2334b";
        ctx.shadowColor = "#f2334b";
        
        // Shield target
        ctx.strokeStyle = "rgba(242, 51, 75, 0.4)";
        ctx.beginPath();
        ctx.moveTo(32, 10);
        ctx.lineTo(32, 38);
        ctx.stroke();
        
        // Piercing sharp bullet
        ctx.strokeStyle = "#f2334b";
        ctx.fillStyle = "#f2334b";
        ctx.beginPath();
        ctx.moveTo(8, 24);
        ctx.lineTo(24, 20);
        ctx.lineTo(36, 24); // Sharp point piercing target
        ctx.lineTo(24, 28);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Impact splash lines
        ctx.strokeStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(36, 24); ctx.lineTo(42, 20);
        ctx.moveTo(36, 24); ctx.lineTo(42, 28);
        ctx.stroke();
    }
    else if (id === "explosive_rounds") {
        ctx.strokeStyle = "#ff5500";
        ctx.shadowColor = "#ff5500";
        ctx.fillStyle = "rgba(255, 85, 0, 0.2)";
        
        // Spherical bomb body
        ctx.beginPath();
        ctx.arc(24, 26, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Bomb fuse
        ctx.strokeStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(24, 14);
        ctx.quadraticCurveTo(28, 8, 34, 10);
        ctx.stroke();
        
        // Spark
        ctx.fillStyle = "#ffd700";
        ctx.beginPath();
        ctx.arc(34, 10, 3, 0, Math.PI*2);
        ctx.fill();
    }
    else if (id === "frost_shells") {
        ctx.strokeStyle = "#38bdf8";
        ctx.shadowColor = "#38bdf8";
        ctx.lineWidth = 2.0;
        
        // Snowflake structure
        ctx.beginPath();
        // 6 rays
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
            const cos = Math.cos(a);
            const sin = Math.sin(a);
            ctx.moveTo(24, 24);
            ctx.lineTo(24 + cos * 16, 24 + sin * 16);
            
            // Side branches
            ctx.moveTo(24 + cos * 10, 24 + sin * 10);
            ctx.lineTo(24 + cos * 10 + Math.cos(a + 0.8) * 5, 24 + sin * 10 + Math.sin(a + 0.8) * 5);
            ctx.moveTo(24 + cos * 10, 24 + sin * 10);
            ctx.lineTo(24 + cos * 10 + Math.cos(a - 0.8) * 5, 24 + sin * 10 + Math.sin(a - 0.8) * 5);
        }
        ctx.stroke();
    }
    else if (id === "shield_generator") {
        ctx.strokeStyle = "#339ef2";
        ctx.shadowColor = "#339ef2";
        ctx.fillStyle = "rgba(51, 158, 242, 0.15)";
        
        // Central power generator core
        ctx.beginPath();
        ctx.arc(24, 24, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Outer shield arc bubble
        ctx.strokeStyle = "rgba(51, 158, 242, 0.6)";
        ctx.beginPath();
        ctx.arc(24, 24, 16, -Math.PI / 1.5, Math.PI / 1.5);
        ctx.stroke();
        
        // Extra outer ripple
        ctx.strokeStyle = "rgba(51, 158, 242, 0.25)";
        ctx.beginPath();
        ctx.arc(24, 24, 22, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
    }
    else if (id === "rail_shells") {
        ctx.strokeStyle = "#22d3ee";
        ctx.shadowColor = "#22d3ee";
        
        // Two parallel rail lines
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(6, 18); ctx.lineTo(38, 18);
        ctx.moveTo(6, 30); ctx.lineTo(38, 30);
        ctx.stroke();
        
        // Electromagnetic coils wrapping them
        ctx.strokeStyle = "rgba(34, 211, 238, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(12, 16); ctx.lineTo(16, 32);
        ctx.moveTo(20, 16); ctx.lineTo(24, 32);
        ctx.moveTo(28, 16); ctx.lineTo(32, 32);
        ctx.stroke();
        
        // Lightning spark
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(10, 24);
        ctx.lineTo(20, 21);
        ctx.lineTo(30, 27);
        ctx.lineTo(42, 24);
        ctx.stroke();
    }
    
    ctx.restore();
}

function triggerCoinPulse(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.classList.remove("coin-pulse");
        void el.offsetWidth; // trigger reflow to restart animation
        el.classList.add("coin-pulse");
    }
}

function getRarityBadge(rarity) {
    if (rarity === "legendary") {
        return `<span style="color: #ffd700; border: 1px solid #ffd700; padding: 1.5px 5px; border-radius: 4px; font-size: 0.6rem; font-weight: 800; text-shadow: 0 0 5px rgba(255,215,0,0.6); margin-right: 6px; background: rgba(255,215,0,0.15); display: inline-block;">أسطوري</span>`;
    } else if (rarity === "epic") {
        return `<span style="color: #d946ef; border: 1px solid #d946ef; padding: 1.5px 5px; border-radius: 4px; font-size: 0.6rem; font-weight: 800; text-shadow: 0 0 5px rgba(217,70,239,0.6); margin-right: 6px; background: rgba(217,70,239,0.15); display: inline-block;">استثنائي</span>`;
    } else {
        return `<span style="color: #38bdf8; border: 1px solid #38bdf8; padding: 1.5px 5px; border-radius: 4px; font-size: 0.6rem; font-weight: 800; text-shadow: 0 0 5px rgba(56,189,248,0.6); margin-right: 6px; background: rgba(56,189,248,0.15); display: inline-block;">نادر</span>`;
    }
}

function populateShopUI() {
    const shopList = document.getElementById("shopList");
    if (!shopList) return;
    shopList.innerHTML = "";
    
    SHOP_FEATURES.forEach(feature => {
        const item = document.createElement("div");
        item.className = "shop-item rarity-" + feature.rarity;
        
        const isOwned = (profile.unlocked_features || []).includes(feature.id);
        const canAfford = profile.coins >= feature.cost;
        
        let btnClass = "shop-buy-btn";
        let btnText = "شراء";
        
        if (isOwned) {
            btnClass += " owned";
            btnText = "مفتوحة";
        } else if (!canAfford) {
            btnClass += " cant-afford";
            btnText = "شراء";
        } else {
            btnClass += " locked";
            btnText = "شراء";
        }
        
        item.innerHTML = `
            <div class="card-badge-row">
                ${getRarityBadge(feature.rarity)}
                <div class="shop-item-cost">💰 ${feature.cost}</div>
            </div>
            <div class="card-icon-container">
                <canvas class="shop-item-icon-canvas" width="56" height="56"></canvas>
            </div>
            <div class="shop-item-info">
                <span class="shop-item-name">${feature.name}</span>
                <span class="shop-item-desc">${feature.description}</span>
            </div>
            <div class="card-action-row">
                <button class="${btnClass}" ${isOwned ? "disabled" : ""}>${btnText}</button>
            </div>
        `;
        
        const canvasEl = item.querySelector(".shop-item-icon-canvas");
        drawFeatureIcon(canvasEl, feature.id);
        
        if (!isOwned && canAfford) {
            const btn = item.querySelector("button");
            btn.addEventListener("click", () => {
                profile.coins -= feature.cost;
                if (!profile.unlocked_features) profile.unlocked_features = [];
                profile.unlocked_features.push(feature.id);
                saveProfile();
                recalculatePlayerStats();
                refreshMainMenuUI();
                populateShopUI();
                triggerCoinPulse("savedCoins");
                playSynthSound("shoot");
            });
        }
        
        shopList.appendChild(item);
    });
}

// ==========================================
// CAMPAIGN GENERATOR & ENEMY WAVE BUILDER
// ==========================================
function buildStage(stageIndex) {
    const waves = [];
    // Cap waveCount to 2-3 so we don't overcrowd the arena
    const waveCount = Math.min(3, 2 + Math.floor(stageIndex / 6));
    const archetypes = ["grunt", "striker", "sniper"];
    
    for (let i = 0; i < waveCount; i++) {
        const arch = archetypes[(stageIndex + i) % archetypes.length];
        waves.push({
            archetype: arch,
            count: 1 + (stageIndex % 2), // Capped to 1 or 2 per wave (Max 3-5 total)
            spawn_interval: 0.5,
            health_mult: 1.0 + Math.pow(stageIndex - 1, 0.75) * 0.15 + i * 0.05,  // Smooth sub-linear HP scaling
            damage_mult: 1.0 + Math.pow(stageIndex - 1, 0.7) * 0.10 + i * 0.04,  // Smooth sub-linear damage scaling
            speed_mult: Math.min(1.22, 1.0 + (stageIndex - 1) * 0.012),
            fire_rate_mult: Math.min(1.35, 1.0 + (stageIndex - 1) * 0.015)
        });
    }
    
    // Add Boss Wave every 5th stage
    if (stageIndex % 5 === 0) {
        waves.push({
            archetype: "boss",
            count: 1,
            spawn_interval: 0.2,
            health_mult: 2.2 + Math.pow(stageIndex - 1, 0.75) * 0.25,
            damage_mult: 1.4 + Math.pow(stageIndex - 1, 0.7) * 0.15,
            speed_mult: 0.95 + (stageIndex - 1) * 0.008,
            fire_rate_mult: 1.12
        });
    }
    
    return {
        stage_index: stageIndex,
        stage_id: "stage_" + stageIndex.toString().padStart(2, '0'),
        name: "العملية " + stageIndex,
        reward: 35 + (stageIndex * 28),
        boss: stageIndex % 5 === 0,
        waves: waves
    };
}

function buildEnemyStats(archetype, stageIndex, wave) {
    const base = {
        max_hp: 240.0,
        damage: 10.0,
        fire_rate: 0.85,
        move_speed: 220.0,
        armor: 0.5,
        projectile_speed: 760.0,
        projectile_range: 900.0,
        projectile_pierce: 0,
        splash_radius: 0.0,
        slow_multiplier: 0.9,
        slow_duration: 0.7,
        shield_capacity: 60.0,
        shield_regen: 3.0,
        turn_speed: 8.0,
        features: []
    };
    
    switch (archetype) {
        case "striker":
            base.max_hp += 15.0;
            base.damage += 5.0;
            base.move_speed += 40.0;
            base.fire_rate += 0.2;
            break;
        case "sniper":
            base.max_hp -= 10.0;
            base.damage += 10.0;
            base.fire_rate += 0.45;
            base.projectile_range += 220.0;
            base.projectile_speed += 160.0;
            break;
        case "boss":
            base.max_hp += 850.0;
            base.damage += 16.0;
            base.move_speed -= 40.0;
            base.fire_rate += 0.4;
            base.armor += 5.0;
            base.projectile_pierce = 2;
            base.shield_capacity = 300.0;
            base.shield_regen = 8.0;
            base.turn_speed = 5.0;
            break;
    }
    
    // Wave multipliers
    base.max_hp = Math.max(20.0, base.max_hp * wave.health_mult);
    base.damage = Math.max(5.0, base.damage * wave.damage_mult);
    base.move_speed = Math.max(140.0, base.move_speed * wave.speed_mult);
    base.fire_rate = Math.max(0.35, base.fire_rate * wave.fire_rate_mult);
    
    // Scale speed/range slightly with stages
    const stageSpeedFactor = Math.min(1.15, 1.0 + (stageIndex - 1) * 0.015);
    base.projectile_speed *= stageSpeedFactor;
    const stageRangeFactor = Math.min(1.12, 1.0 + (stageIndex - 1) * 0.012);
    base.projectile_range *= stageRangeFactor;
    
    // Dynamically assign random features to enemies based on stage Index
    const availableFeatures = [
        "emp_pulse", "split_shot", "deflector_shield", "mega_napalm",
        "phase_bullet", "chronos_field", "nanite_field"
    ];
    if (stageIndex >= 4) availableFeatures.push("plasma_cannon");
    if (stageIndex >= 6) availableFeatures.push("singularity_bomb");
    
    // Shuffle available features and pick a number of them
    const shuffled = [...availableFeatures].sort(() => 0.5 - Math.random());
    const numFeatures = Math.min(shuffled.length, 1 + Math.floor(stageIndex / 1.5));
    
    base.features = [];
    for (let f = 0; f < numFeatures; f++) {
        const featId = shuffled[f];
        base.features.push(featId);
        
        // Adjust stats for chosen features
        if (featId === "deflector_shield") {
            base.shield_capacity = (base.shield_capacity || 0.0) * 2;
            if (base.shield_capacity === 0) {
                base.shield_capacity = 40.0;
                base.shield_regen = Math.max(base.shield_regen, 3.0);
            }
        } else if (featId === "nanite_field") {
            base.shield_capacity = Math.max(base.shield_capacity, 25.0);
            base.shield_regen = Math.max(base.shield_regen, 2.5);
        } else if (featId === "split_shot") {
            base.fire_rate *= 0.70; // 30% slower fire rate for split shot to avoid bullet wall spam
        } else if (featId === "plasma_cannon") {
            base.damage *= 1.25;
            base.fire_rate *= 0.60; // 40% slower fire rate
        } else if (featId === "singularity_bomb") {
            base.damage *= 1.35;
            base.fire_rate *= 0.50; // 50% slower fire rate
        }
    }
    
    // Auto shield generator at higher stages
    if (stageIndex >= 3 && !base.features.includes("deflector_shield")) {
        base.shield_capacity = Math.max(base.shield_capacity, 20.0 + stageIndex * 3.0);
        base.shield_regen = Math.max(base.shield_regen, 2.0 + stageIndex * 0.3);
    }
    
    return base;
}

// ==========================================
// PHYSICS & COLLISION HELPERS
// ==========================================
function circleRectCollide(cx, cy, radius, rx, ry, rwidth, rheight) {
    // Closest point on rectangle to circle center
    const closestX = Math.max(rx - rwidth/2, Math.min(cx, rx + rwidth/2));
    const closestY = Math.max(ry - rheight/2, Math.min(cy, ry + rheight/2));
    
    const distanceX = cx - closestX;
    const distanceY = cy - closestY;
    const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);
    
    return distanceSquared < (radius * radius);
}

// Point-to-line-segment distance (for laser beam collision)
function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 0) {
        t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    }
    const nx = ax + t * dx;
    const ny = ay + t * dy;
    return Math.sqrt((px - nx) ** 2 + (py - ny) ** 2);
}

class CoinEntity {
    constructor(x, y, value = 2) {
        this.x = x;
        this.y = y;
        this.value = value;
        this.vx = (Math.random() - 0.5) * 260; // Slightly higher scatter spread
        this.vy = (Math.random() - 0.5) * 260;
        this.radius = 6;
        this.angle = Math.random() * Math.PI;
        this.spinSpeed = 6 + Math.random() * 6;
        this.age = 0;
        this.lifetime = 6.0;
        this.alive = true;
        this.trail = [];
        this.maxTrailLength = 6;
    }
    update(dt) {
        this.age += dt;
        this.angle += this.spinSpeed * dt;
        
        // Save current position for trail effect
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }
        
        // Magnetic attraction to player
        if (player && player.alive) {
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.max(1.0, Math.hypot(dx, dy));
            
            // Scatter phase for the first 0.3s, then pull magnetically
            if (this.age > 0.3) {
                // Acceleration: speed increases as it gets closer and over time
                const pullSpeed = Math.min(1100, 120 + (this.age - 0.3) * 680 + (45000 / dist));
                
                // Direction vector towards player
                const targetVx = (dx / dist) * pullSpeed;
                const targetVy = (dy / dist) * pullSpeed;
                
                // Smart magnetism: loose curved steering when far, tight direct snapping when close (< 120px)
                const lerpRate = dist < 120 ? 15.0 : 7.2;
                const lerpFactor = 1.0 - Math.exp(-lerpRate * dt);
                
                this.vx += (targetVx - this.vx) * lerpFactor;
                this.vy += (targetVy - this.vy) * lerpFactor;
            } else {
                // Scatter phase: standard physics deceleration
                this.vx *= Math.exp(-3.5 * dt);
                this.vy *= Math.exp(-3.5 * dt);
            }
            
            // Collect if within player tank collision radius
            if (dist < 28) {
                profile.coins += this.value;
                saveProfile();
                triggerCoinPulse("hudCoins");
                triggerCoinPulse("savedCoins");
                playSynthSound("coin");
                
                // Spawn beautiful gold spark particles with high outward velocity
                const sparkCount = isLowVfx() ? (isMobile ? 1 : 3) : 7;
                for (let i = 0; i < sparkCount; i++) {
                    const spark = new SmokeParticle(this.x, this.y, "#ffd700", 2.0 + Math.random() * 2.0, 0.3 + Math.random() * 0.2);
                    spark.vx = (Math.random() - 0.5) * 160;
                    spark.vy = (Math.random() - 0.5) * 160;
                    particles.push(spark);
                }
                
                // Add floating text
                floatingTexts.push(new FloatingText(`+💰${this.value}`, this.x, this.y, "#ffd700"));
                
                this.alive = false;
                return false;
            }
        } else {
            // Player dead: slow down
            this.vx *= Math.exp(-2.2 * dt);
            this.vy *= Math.exp(-2.2 * dt);
        }
        
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        
        return this.age < this.lifetime;
    }
    draw(ctx, camX, camY) {
        const rx = this.x - camX;
        const ry = this.y - camY;
        
        // Draw trailing path if quality is medium/high
        if (!isLowVfx() && this.trail.length > 1) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(this.trail[0].x - camX, this.trail[0].y - camY);
            for (let i = 1; i < this.trail.length; i++) {
                ctx.lineTo(this.trail[i].x - camX, this.trail[i].y - camY);
            }
            ctx.strokeStyle = "rgba(255, 215, 0, 0.35)";
            ctx.lineWidth = this.radius * 1.1;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.stroke();
            
            // Highlight core of the trail
            ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
            ctx.lineWidth = this.radius * 0.45;
            ctx.stroke();
            ctx.restore();
        }
        
        ctx.save();
        
        // Spinning scale calculation
        const scaleX = Math.abs(Math.sin(this.angle));
        
        // Golden glow if high quality
        if (isHighVfx()) {
            ctx.shadowColor = "#ffd700";
            ctx.shadowBlur = 6;
        }
        
        ctx.fillStyle = "#ffd700";
        ctx.strokeStyle = "#b58d00";
        ctx.lineWidth = 1.5;
        
        ctx.beginPath();
        ctx.ellipse(rx, ry, this.radius * scaleX, this.radius, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Inner detail
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.ellipse(rx, ry, this.radius * 0.4 * scaleX, this.radius * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}

// ==========================================
// PARTICLE VFX SYSTEMS
// ==========================================
class SmokeParticle {
    constructor(x, y, color, size, lifetime) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = size;
        this.lifetime = lifetime;
        this.age = 0;
        this.vx = (Math.random() - 0.5) * 30;
        this.vy = (Math.random() - 0.5) * 30;
    }
    update(dt) {
        this.age += dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        return this.age < this.lifetime;
    }
    draw(ctx, camX, camY) {
        const progress = this.age / this.lifetime;
        const alpha = 0.35 * (1 - progress);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x - camX, this.y - camY, this.size * (1.0 + progress * 0.8), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0; // Reset alpha manually to save performance
    }
}

class ExplosionParticle {
    constructor(x, y, color, size, lifetime, type) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = size;
        this.lifetime = lifetime;
        this.age = 0;
        this.type = type;
        const angle = Math.random() * Math.PI * 2;
        const speed = type === "spark" ? (60 + Math.random() * 240) : (40 + Math.random() * 160);
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
    }
    update(dt) {
        this.age += dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        const drag = this.type === "spark" ? 0.94 : 0.92;
        this.vx *= drag;
        this.vy *= drag;
        return this.age < this.lifetime;
    }
    draw(ctx, camX, camY) {
        const progress = this.age / this.lifetime;
        const alpha = 1 - progress;
        ctx.globalAlpha = alpha;
        if (this.type === "spark") {
            ctx.strokeStyle = this.color;
            ctx.lineWidth = this.size;
            ctx.lineCap = "round";
            const useShadow = isHighVfx();
            if (useShadow) {
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 4;
            }
            ctx.beginPath();
            ctx.moveTo(this.x - camX, this.y - camY);
            ctx.lineTo(this.x - camX - this.vx * 0.04, this.y - camY - this.vy * 0.04);
            ctx.stroke();
            if (useShadow) {
                ctx.shadowBlur = 0;
            }
        } else {
            ctx.fillStyle = this.type === "smoke" ? "#22252a" : this.color;
            ctx.beginPath();
            ctx.arc(this.x - camX, this.y - camY, this.size * (1 - progress * 0.4), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;
    }
}

class FloatingText {
    constructor(text, x, y, color) {
        this.text = text;
        this.x = x;
        this.y = y;
        this.color = color;
        this.vy = -75;
        this.lifetime = 0.9;
        this.age = 0;
    }
    update(dt) {
        this.age += dt;
        this.y += this.vy * dt;
        return this.age < this.lifetime;
    }
    draw(ctx, camX, camY) {
        const alpha = 1 - (this.age / this.lifetime);
        ctx.globalAlpha = alpha;
        ctx.font = "bold 16px 'Orbitron', sans-serif";
        ctx.fillStyle = this.color;
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 4;
        ctx.textAlign = "center";
        ctx.strokeText(this.text, this.x - camX, this.y - camY);
        ctx.fillText(this.text, this.x - camX, this.y - camY);
        ctx.globalAlpha = 1.0; // Reset alpha manually
    }
}

function spawnExplosion(x, y, color, count, lifetime) {
    const finalCount = isHighVfx() ? count : Math.max(2, Math.ceil(count * (isMobile ? 0.22 : 0.4)));
    for (let i = 0; i < finalCount; i++) {
        const type = Math.random() > 0.35 ? "fire" : "smoke";
        const size = (isMobile ? 2 : 3) + Math.random() * (isMobile ? 3 : 5);
        particles.push(new ExplosionParticle(x, y, color, size, lifetime * (isMobile ? 0.75 : 1), type));
    }
    if (isHighVfx()) {
        const sparkCount = Math.ceil(count * 0.5);
        for (let i = 0; i < sparkCount; i++) {
            particles.push(new ExplosionParticle(x, y, color, 1.5 + Math.random() * 1.5, lifetime * 1.25, "spark"));
        }
    }
}

class NapalmPuddle {
    constructor(x, y, radius, damage, duration, team, owner) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.damage = damage;
        this.lifetime = duration;
        this.age = 0;
        this.team = team;
        this.owner = owner;
        this.tickTimer = 0;
    }
    update(dt) {
        this.age += dt;
        this.tickTimer += dt;
        
        if (this.tickTimer >= 0.20) {
            this.tickTimer = 0;
            const allTanks = [];
            if (player && player.alive) allTanks.push(player);
            enemies.forEach(e => { if (e.alive) allTanks.push(e); });
            
            allTanks.forEach(tank => {
                if (this.team === "player" && tank.team === "player") return;
                const dist = Math.hypot(tank.x - this.x, tank.y - this.y);
                if (dist < this.radius + 18) {
                    tank.takeDamage(this.damage * 0.20, this.team);
                }
            });
        }
        
        if (Math.random() < (isMobile ? 0.08 : 0.25)) {
            particles.push(new ExplosionParticle(
                this.x + (Math.random() - 0.5) * this.radius,
                this.y + (Math.random() - 0.5) * this.radius,
                "#ff5500",
                2 + Math.random() * 3,
                0.3 + Math.random() * 0.3,
                "fire"
            ));
        }
        
        return this.age < this.lifetime;
    }
    draw(ctx, camX, camY) {
        const rx = this.x - camX;
        const ry = this.y - camY;
        const progress = this.age / this.lifetime;
        const alpha = 0.45 * (1 - progress);
        
        ctx.save();
        ctx.globalAlpha = alpha;
        
        const grad = ctx.createRadialGradient(rx, ry, 2, rx, ry, this.radius);
        grad.addColorStop(0, "#ffda33");
        grad.addColorStop(0.3, "#ff5500");
        grad.addColorStop(1, "rgba(242, 51, 75, 0)");
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(rx, ry, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ==========================================
// GAME ENTITIES
// ==========================================

class Obstacle {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }
    draw(ctx, camX, camY) {
        const rx = this.x - camX;
        const ry = this.y - camY;
        
        ctx.save();
        
        // Draw drop shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.fillRect(rx - this.w/2 + 6, ry - this.h/2 + 6, this.w, this.h);
        
        // Glassmorphic body
        ctx.fillStyle = "rgba(22, 28, 38, 0.9)";
        ctx.fillRect(rx - this.w/2, ry - this.h/2, this.w, this.h);
        
        // Neon glowing border
        ctx.strokeStyle = "rgba(51, 158, 242, 0.75)";
        ctx.lineWidth = 2;
        ctx.strokeRect(rx - this.w/2, ry - this.h/2, this.w, this.h);
        
        // Neon inner grid effect
        ctx.strokeStyle = "rgba(51, 158, 242, 0.15)";
        ctx.beginPath();
        ctx.moveTo(rx - this.w/2, ry);
        ctx.lineTo(rx + this.w/2, ry);
        ctx.moveTo(rx, ry - this.h/2);
        ctx.lineTo(rx, ry + this.h/2);
        ctx.stroke();
        
        ctx.restore();
    }
}

class NanoCache extends Obstacle {
    constructor(x, y) {
        super(x, y, 32, 32);
        this.hp = 60;
        this.maxHp = 60;
        this.alive = true;
    }
    
    takeDamage(amount) {
        if (!this.alive) return;
        this.hp -= amount;
        if (this.hp <= 0) {
            this.alive = false;
            obstacles = obstacles.filter(o => o !== this);
            playSynthSound("nuclear");
            spawnExplosion(this.x, this.y, "#22c55e", 25, 0.6);
            if (window.shockwaves) {
                window.shockwaves.push(new Shockwave(this.x, this.y, 180, 0.5, "#22c55e"));
            }
            if (player && player.alive) {
                const dist = Math.hypot(player.x - this.x, player.y - this.y);
                if (dist <= 180) {
                    player.hp = Math.min(player.maxHp, player.hp + 60);
                    if (player.shieldCapacity > 0) {
                        player.shield = Math.min(player.shieldCapacity, player.shield + 30);
                    }
                    player.spawnFloatingText("⚙️ إصلاح النانو +60 HP", "#22c55e");
                }
            }
        }
    }
    
    draw(ctx, camX, camY) {
        if (!this.alive) return;
        const rx = this.x - camX;
        const ry = this.y - camY;
        
        ctx.save();
        ctx.shadowBlur = 6;
        ctx.shadowColor = "#22c55e";
        ctx.fillStyle = "rgba(22, 101, 52, 0.9)";
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2.0;
        
        // Hexagonal container
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = i * Math.PI / 3;
            const px = rx + Math.cos(angle) * 16;
            const py = ry + Math.sin(angle) * 16;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Pulsing green core
        const pulse = 1.0 + Math.sin(performance.now() / 100) * 0.15;
        ctx.fillStyle = "#4ade80";
        ctx.beginPath();
        ctx.arc(rx, ry, 6 * pulse, 0, Math.PI * 2);
        ctx.fill();
        
        // Simple health bar above if damaged
        if (this.hp < this.maxHp) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            ctx.fillRect(rx - 16, ry - 24, 32, 4);
            ctx.fillStyle = "#22c55e";
            ctx.fillRect(rx - 16, ry - 24, 32 * (this.hp / this.maxHp), 4);
        }
        ctx.restore();
    }
}

class TeleportPad {
    constructor(x, y, targetX, targetY, color) {
        this.x = x;
        this.y = y;
        this.targetX = targetX;
        this.targetY = targetY;
        this.color = color;
        this.radius = 35;
        this.cooldowns = new Map(); // tracks cooldown per entity
    }
    
    update(dt) {
        for (let [entity, timer] of this.cooldowns.entries()) {
            if (timer > 0) {
                this.cooldowns.set(entity, timer - dt);
            } else {
                this.cooldowns.delete(entity);
            }
        }
    }
    
    draw(ctx, camX, camY) {
        const rx = this.x - camX;
        const ry = this.y - camY;
        
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2.0;
        
        // Outer rotating ring
        ctx.beginPath();
        const angle = (performance.now() / 300) % (Math.PI * 2);
        ctx.arc(rx, ry, this.radius, angle, angle + Math.PI * 1.5);
        ctx.stroke();
        
        // Inner rotating ring (opposite direction)
        ctx.strokeStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(rx, ry, this.radius - 8, -angle, -angle + Math.PI * 1.2);
        ctx.stroke();
        
        // Pulsing core glowing circle
        const coreAlpha = 0.15 + Math.sin(performance.now() / 150) * 0.1;
        ctx.fillStyle = this.color;
        ctx.globalAlpha = coreAlpha;
        ctx.beginPath();
        ctx.arc(rx, ry, this.radius - 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class SpeedPad {
    constructor(x, y, angle, color = "#eab308") {
        this.x = x;
        this.y = y;
        this.angle = angle; // Direction of boost
        this.color = color;
        this.w = 55;
        this.h = 40;
    }
    
    draw(ctx, camX, camY) {
        const rx = this.x - camX;
        const ry = this.y - camY;
        
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(this.angle);
        
        // Drawing neon arrows/chevron
        ctx.strokeStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        ctx.lineWidth = 3.0;
        ctx.fillStyle = "rgba(234, 179, 8, 0.08)";
        
        // Base plate
        ctx.beginPath();
        ctx.rect(-this.w/2, -this.h/2, this.w, this.h);
        ctx.fill();
        ctx.stroke();
        
        // Arrow shapes moving forwards
        const pulseOffset = (performance.now() / 8) % 30;
        ctx.lineWidth = 2.0;
        ctx.strokeStyle = "#ffffff";
        for (let i = -1; i <= 1; i++) {
            const ax = i * 14 + (pulseOffset - 15);
            if (ax > -this.w/2 + 5 && ax < this.w/2 - 5) {
                ctx.beginPath();
                ctx.moveTo(ax - 5, -12);
                ctx.lineTo(ax, 0);
                ctx.lineTo(ax - 5, 12);
                ctx.stroke();
            }
        }
        ctx.restore();
    }
}

class Projectile {
    constructor(x, y, dx, dy, team, color, stats, owner) {
        this.x = x;
        this.y = y;
        this.dx = dx;
        this.dy = dy;
        this.team = team;
        this.color = color;
        this.stats = stats;
        this.owner = owner;
        
        this.speed = stats.projectile_speed || 800;
        this.range = stats.projectile_range || 900;
        this.damage = stats.damage || 10;
        this.pierceLeft = stats.projectile_pierce || 0;
        this.splashRadius = stats.splash_radius || 0;
        this.slowMultiplier = stats.slow_multiplier || 0.85;
        this.slowDuration = stats.slow_duration || 1.0;
        
        this.traveled = 0;
        this.smokeTimer = 0;
        this.alive = true;
        
        // Custom feature overrides
        this.radius = 7;
        this.obstaclePierceLeft = 0;
        this.enemyPierceLeft = this.pierceLeft;
        this.isSingularity = false;
        
        if (this.team === "player" && this.stats.features) {
            if (this.stats.features.includes("phase_bullet")) {
                this.obstaclePierceLeft = 1;
                this.enemyPierceLeft += 1;
            }
            if (this.stats.features.includes("plasma_cannon") && !this.isSubProjectile) {
                this.radius = 14;
                this.damage *= 1.5;
            }
            if (this.stats.features.includes("singularity_bomb")) {
                this.radius = 16;
                this.damage *= 1.25;
                this.isSingularity = true;
                this.speed *= 0.75;
            }
        }
    }
    
    update(dt) {
        // Homing missile logic
        if (this.team === "player" && player && player.stats.features && player.stats.features.includes("homing_missile")) {
            let nearestEnemy = null;
            let minDist = 450;
            enemies.forEach(e => {
                if (e.alive) {
                    const dist = Math.hypot(e.x - this.x, e.y - this.y);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestEnemy = e;
                    }
                }
            });
            if (nearestEnemy) {
                const targetAngle = Math.atan2(nearestEnemy.y - this.y, nearestEnemy.x - this.x);
                const currentAngle = Math.atan2(this.dy, this.dx);
                let angleDiff = targetAngle - currentAngle;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                
                const maxRotation = 4.5 * dt;
                const rotateAmt = Math.max(-maxRotation, Math.min(maxRotation, angleDiff));
                const newAngle = currentAngle + rotateAmt;
                this.dx = Math.cos(newAngle);
                this.dy = Math.sin(newAngle);
            }
        }

        const moveDist = this.speed * dt;
        this.x += this.dx * moveDist;
        this.y += this.dy * moveDist;
        this.traveled += moveDist;
        
        // Trail particles
        this.smokeTimer += dt;
        const trailThreshold = isHighVfx() ? 0.035 : (isMobile ? 0.18 : 0.095);
        if (this.smokeTimer >= trailThreshold) {
            this.smokeTimer = 0;
            particles.push(new SmokeParticle(
                this.x - this.dx * 6,
                this.y - this.dy * 6,
                this.color,
                this.radius * 0.65,
                0.26
            ));
        }
        
        // Singularity pulling behavior
        if (this.isSingularity && this.alive) {
            enemies.forEach(e => {
                if (e.alive) {
                    const dx = this.x - e.x;
                    const dy = this.y - e.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist < 200 && dist > 10) {
                        const pullForce = 220 * (1 - dist / 200);
                        e.vx += (dx / dist) * pullForce * dt;
                        e.vy += (dy / dist) * pullForce * dt;
                        
                        // Pull sparks
                        if (Math.random() < 0.1) {
                            particles.push(new SmokeParticle(
                                e.x + (Math.random() - 0.5) * 20,
                                e.y + (Math.random() - 0.5) * 20,
                                "#a855f7",
                                2.0,
                                0.2
                            ));
                        }
                    }
                }
            });
        }
        
        // Clamp life to range
        if (this.traveled >= this.range) {
            this.alive = false;
        }
        
        if (!this.alive) return false;
        
        // --- Collision Logic ---
        
        // Check collision with Player's Aegis (super_shield) shield bubble
        if (this.team === "enemy" && typeof superPowerActive !== 'undefined' && superPowerActive && profile.active_super === "super_shield" && player && player.alive) {
            const dist = Math.hypot(this.x - player.x, this.y - player.y);
            if (dist < 60 + this.radius) {
                // Reflect!
                this.team = "player";
                this.owner = player;
                this.color = "#22c55e"; // plasma green
                this.damage = Math.max(this.damage * 1.5, 30); // buff damage
                this.speed = Math.max(this.speed * 1.25, 900); // speed up reflected bullet
                
                // Point outwards from the player center
                let angle = Math.atan2(this.y - player.y, this.x - player.x);
                angle += (Math.random() - 0.5) * 0.25;
                this.dx = Math.cos(angle);
                this.dy = Math.sin(angle);
                
                // Spawn reflection sparks
                for (let p = 0; p < 8; p++) {
                    particles.push(new SmokeParticle(this.x, this.y, "#22c55e", 4.0, 0.3));
                }
                
                playSynthSound("hit"); // sound feedback
            }
        }
        
        // 1. Obstacle Collision
        for (let i = 0; i < obstacles.length; i++) {
            const obs = obstacles[i];
            if (circleRectCollide(this.x, this.y, this.radius, obs.x, obs.y, obs.w, obs.h)) {
                if (typeof obs.takeDamage === "function") {
                    obs.takeDamage(this.damage);
                }
                
                if (this.obstaclePierceLeft > 0) {
                    this.obstaclePierceLeft--;
                    // Phase spark
                    for (let p = 0; p < 4; p++) {
                        particles.push(new SmokeParticle(this.x, this.y, "#facc15", 3.0, 0.2));
                    }
                    continue; // Keep moving
                }
                
                if (this.isSingularity || (this.team === "player" && this.stats.features.includes("plasma_cannon")) || this.splashRadius > 0 || (this.team === "player" && this.stats.features.includes("mega_napalm"))) {
                    this.explode();
                } else {
                    spawnExplosion(this.x, this.y, this.color, 8, 0.35);
                    playSynthSound("hit");
                }
                this.alive = false;
                return false;
            }
        }
        
        // 2. Tank Collision
        const allTanks = [];
        if (player && player.alive) allTanks.push(player);
        enemies.forEach(e => { if (e.alive) allTanks.push(e); });
        
        for (let i = 0; i < allTanks.length; i++) {
            const tank = allTanks[i];
            if (tank === this.owner) continue;
            if (this.team === "player" && tank.team === "player") continue;
            
            // Check bounding circle overlap
            const dist = Math.hypot(this.x - tank.x, this.y - tank.y);
            const tankRadius = tank.aiArchetype === "boss" ? 37 : 22;
            if (dist < tankRadius + this.radius * 0.5) {
                tank.takeDamage(this.damage);
                
                // Slow effect feature
                if (this.stats.features && this.stats.features.includes("slow")) {
                    tank.applySlow(this.slowMultiplier, this.slowDuration);
                }
                
                // EMP Pulse feature
                if (this.team === "player" && this.stats.features.includes("emp_pulse")) {
                    if (Math.random() < 0.12) {
                        tank.applyStun(1.5);
                    }
                }
                
                if (this.isSingularity || (this.team === "player" && this.stats.features.includes("plasma_cannon")) || this.splashRadius > 0 || (this.team === "player" && this.stats.features.includes("mega_napalm"))) {
                    this.explode();
                } else {
                    spawnExplosion(this.x, this.y, this.color, 8, 0.35);
                    playSynthSound("hit");
                }
                
                if (this.enemyPierceLeft > 0) {
                    this.enemyPierceLeft--;
                } else {
                    this.alive = false;
                    return false;
                }
            }
        }
        
        return this.alive;
    }
    
    explode() {
        if (this.isSingularity) {
            spawnExplosion(this.x, this.y, "#a855f7", 32, 0.8);
            addShake(15.0);
            playSynthSound("nuclear");
            
            const pullRad = 180;
            const allTanks = [];
            if (player && player.alive) allTanks.push(player);
            enemies.forEach(e => { if (e.alive) allTanks.push(e); });
            
            allTanks.forEach(tank => {
                if (tank === this.owner) return;
                if (this.team === "player" && tank.team === "player") return;
                
                const dx = this.x - tank.x;
                const dy = this.y - tank.y;
                const dist = Math.hypot(dx, dy);
                if (dist <= pullRad) {
                    tank.x = this.x - (dx / Math.max(1, dist)) * 5;
                    tank.y = this.y - (dy / Math.max(1, dist)) * 5;
                    tank.takeDamage(this.damage * 2.2, this.team);
                    tank.applyStun(1.8);
                }
            });
            return;
        }
        
        if (this.team === "player" && this.stats.features && this.stats.features.includes("plasma_cannon") && !this.isSubProjectile) {
            spawnExplosion(this.x, this.y, "#ec4899", 24, 0.6);
            addShake(8.0);
            playSynthSound("explosion");
            
            const plasmaRad = 120;
            const allTanks = [];
            if (player && player.alive) allTanks.push(player);
            enemies.forEach(e => { if (e.alive) allTanks.push(e); });
            
            allTanks.forEach(tank => {
                if (tank === this.owner) return;
                if (this.team === "player" && tank.team === "player") return;
                
                const dist = Math.hypot(this.x - tank.x, this.y - tank.y);
                if (dist <= plasmaRad) {
                    tank.applyStun(1.5);
                    tank.takeDamage(this.damage * 0.85, this.team);
                }
            });
            
            // Spawn 6 sub-projectiles flying out in a circle
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
                const subProj = new Projectile(
                    this.x, this.y,
                    Math.cos(a), Math.sin(a),
                    this.team,
                    "#ec4899",
                    this.stats,
                    this.owner
                );
                subProj.isSubProjectile = true;
                subProj.radius = 5;
                subProj.damage = this.damage * 0.45;
                subProj.range = 300;
                projectiles.push(subProj);
            }
            return;
        }

        spawnExplosion(this.x, this.y, this.color, 18, 0.45);
        playSynthSound("explosion");
        
        // Spawn Napalm Puddle if owner has Mega Napalm feature
        if (this.team === "player" && this.stats.features && this.stats.features.includes("mega_napalm")) {
            napalmPuddles.push(new NapalmPuddle(
                this.x,
                this.y,
                75, // Radius
                35, // Damage per second
                4.0, // Duration in seconds
                this.team,
                this.owner
            ));
        }
        
        const allTanks = [];
        if (player && player.alive) allTanks.push(player);
        enemies.forEach(e => { if (e.alive) allTanks.push(e); });
        
        allTanks.forEach(tank => {
            if (tank === this.owner) return;
            if (this.team === "player" && tank.team === "player") return;
            
            const dist = Math.hypot(this.x - tank.x, this.y - tank.y);
            const splashRad = this.splashRadius || (this.team === "player" && this.stats.features.includes("mega_napalm") ? 75 : 0);
            if (splashRad > 0 && dist <= splashRad) {
                tank.takeDamage(this.damage * 0.65, this.team);
            }
        });
    }
    
    draw(ctx, camX, camY) {
        ctx.save();
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 6;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x - camX, this.y - camY, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner white core
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        ctx.beginPath();
        ctx.arc(this.x - camX, this.y - camY, this.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class UpSuperBlade {
    constructor(x, y, angle, owner, waveIndex) {
        this.x = x;
        this.y = y;
        this.owner = owner;
        this.angle = angle;
        this.dx = Math.cos(angle);
        this.dy = Math.sin(angle);
        this.waveIndex = waveIndex;
        this.team = "player";
        this.color = "#ff5a1f";
        this.outSpeed = 1280 + Math.min(420, waveIndex * 35);
        this.returnSpeed = 1850 + Math.min(520, waveIndex * 45);
        this.maxDistance = 620 + Math.min(240, waveIndex * 18);
        this.damage = (playerStats.damage || 20) * (1.45 + Math.min(0.55, waveIndex * 0.04));
        this.traveled = 0;
        this.phase = "out";
        this.radius = 9;
        this.alive = true;
        this.hitTargets = new Set();
        this.spin = Math.random() * Math.PI * 2;
        this.smokeTimer = 0;
    }

    update(dt) {
        if (!this.alive) return false;

        let vx = this.dx;
        let vy = this.dy;
        let speed = this.outSpeed;

        if (this.phase === "return" && this.owner && this.owner.alive) {
            const toOwnerX = this.owner.x - this.x;
            const toOwnerY = this.owner.y - this.y;
            const dist = Math.max(1, Math.hypot(toOwnerX, toOwnerY));
            vx = toOwnerX / dist;
            vy = toOwnerY / dist;
            this.angle = Math.atan2(vy, vx);
            speed = this.returnSpeed;
            if (dist < 28) {
                this.alive = false;
                return false;
            }
        }

        const moveDist = speed * dt;
        this.x += vx * moveDist;
        this.y += vy * moveDist;
        this.traveled += moveDist;
        this.spin += dt * 15;

        if (this.phase === "out" && this.traveled >= this.maxDistance) {
            this.phase = "return";
            this.hitTargets.clear();
        }

        this.smokeTimer += dt;
        if (this.smokeTimer > 0.025) {
            this.smokeTimer = 0;
            particles.push(new SmokeParticle(
                this.x - vx * 10,
                this.y - vy * 10,
                Math.random() < 0.5 ? "#ff7a18" : "#facc15",
                3.0,
                0.18
            ));
        }

        enemies.forEach(enemy => {
            if (!enemy.alive || this.hitTargets.has(enemy)) return;
            const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
            const tankRadius = enemy.aiArchetype === "boss" ? 39 : 24;
            if (dist < tankRadius + this.radius) {
                enemy.takeDamage(this.damage, "player");
                this.hitTargets.add(enemy);
                spawnExplosion(this.x, this.y, "#ff7a18", 6, 0.24);
                playSynthSound("hit");
            }
        });

        if (Math.abs(this.x) > arenaHalfSize + 300 || Math.abs(this.y) > arenaHalfSize + 300) {
            this.phase = "return";
        }

        return this.alive;
    }

    draw(ctx, camX, camY) {
        const rx = this.x - camX;
        const ry = this.y - camY;

        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(this.angle);
        ctx.shadowColor = "#ff7a18";
        ctx.shadowBlur = 16;

        const flame = ctx.createLinearGradient(-18, 0, 26, 0);
        flame.addColorStop(0, "rgba(255, 60, 0, 0.2)");
        flame.addColorStop(0.45, "#ff7a18");
        flame.addColorStop(1, "#fff2a8");
        ctx.fillStyle = flame;
        ctx.strokeStyle = "#7c1d00";
        ctx.lineWidth = 1.2;

        ctx.beginPath();
        ctx.moveTo(28, 0);
        ctx.lineTo(5, -7);
        ctx.lineTo(-18, -3);
        ctx.lineTo(-24, 0);
        ctx.lineTo(-18, 3);
        ctx.lineTo(5, 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(0, -2);
        ctx.lineTo(0, 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

class TankEntity {
    constructor(x, y, stats, team, color, enableAI = false, aiArchetype = "grunt") {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.stats = stats;
        this.team = team;
        this.color = color;
        this.aiEnabled = enableAI;
        this.aiArchetype = aiArchetype;
        
        this.bodyColor = color;
        this.turretColor = team === "player" ? "#d0e7f7" : color;
        
        this.maxHp = stats.max_hp || 100;
        this.hp = this.maxHp;
        this.shieldCapacity = stats.shield_capacity || 0;
        this.shield = this.shieldCapacity;
        this.shieldRegen = stats.shield_regen || 0;
        
        this.shieldDelay = 2.5;
        this.shieldDelayTimer = 0;
        this.fireCooldown = 0;
        this.slowMultiplier = 1.0;
        this.slowTimer = 0;
        
        this.alive = true;
        this.chassisAngle = 0;
        this.turretAngle = 0;
        
        this.muzzleFlashTimer = 0;
        this.shieldVFXTimer = 0;
        this.smokeTimer = 0;
        this.treadAnimTimer = 0;
        
        // Controls / AI Target
        this.moveInput = { x: 0, y: 0 };
        this.aimInput = { x: 0, y: 0 };
        this.firePressed = false;
        this.target = null;
        this.autoAim = true;

        // Ammunition & heat system (Player only)
        if (team === "player") {
            this.ammo = 100;
            this.maxAmmo = 100;
            this.ammoRegen = 35;
            this.ammoCostPerShot = 10;
            this.isReloading = false;
            this.reloadTimer = 0;
        }
        this.boostTimer = 0;
        this.boostAngle = 0;
    }
    
    configure(stats, team, color, enableAI = false, aiArchetype = "grunt") {
        this.stats = stats;
        this.team = team;
        this.bodyColor = color;
        this.turretColor = team === "player" ? "#d0e7f7" : color;
        this.aiEnabled = enableAI;
        this.aiArchetype = aiArchetype;
        this.maxHp = stats.max_hp || 100;
        this.hp = this.maxHp;
        this.shieldCapacity = stats.shield_capacity || 0;
        this.shield = this.shieldCapacity;
        this.shieldRegen = stats.shield_regen || 0;
        this.shieldDelayTimer = 0;
        this.fireCooldown = 0;
        this.slowMultiplier = 1.0;
        this.slowTimer = 0;
        this.alive = true;
        this.vx = 0;
        this.vy = 0;
        this.treadAnimTimer = 0;

        // Ammunition & heat system (Player only)
        if (team === "player") {
            this.ammo = 100;
            this.maxAmmo = 100;
            this.ammoRegen = 35;
            this.ammoCostPerShot = 10;
            this.isReloading = false;
            this.reloadTimer = 0;
        }
        this.boostTimer = 0;
        this.boostAngle = 0;
    }
    
    applySlow(multiplier, duration) {
        this.slowMultiplier = Math.min(this.slowMultiplier, Math.max(multiplier, 0.2));
        this.slowTimer = Math.max(this.slowTimer, duration);
    }

    applyStun(duration) {
        this.stunTimer = Math.max(this.stunTimer || 0, duration);
        this.spawnFloatingText("صعق!", "#ffa500");
    }

    reflectBullet() {
        const nearest = this.findNearestEnemy();
        let angle = Math.random() * Math.PI * 2;
        if (nearest) {
            angle = Math.atan2(nearest.y - this.y, nearest.x - this.x);
        }
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const pX = this.x + dx * 40;
        const pY = this.y + dy * 40;
        
        spawnExplosion(this.x, this.y, "#4cd6ff", 6, 0.25);
        this.spawnFloatingText("انعكاس!", "#33f276");
        
        const proj = new Projectile(
            pX, pY, dx, dy,
            this.team,
            "#33f276",
            this.stats,
            this
        );
        proj.damage = this.stats.damage * 0.8;
        projectiles.push(proj);
        playSynthSound("shoot");
    }

    takeDamage(amount, sourceTeam = "enemy") {
        if (!this.alive) return;
        
        // If player has Nanite Overdrive active, shield is invulnerable (100%) and health cannot decrease
        if (this.team === "player" && superPowerActive && profile.active_super === "super_overdrive") {
            this.shield = this.shieldCapacity;
            this.shieldVFXTimer = 0.25;
            this.spawnFloatingText("حصانة خارقة! ⚡", "#a855f7");
            return;
        }
        
        const armor = this.stats.armor || 0;
        let effective = Math.max(1.0, amount - armor);
        let shieldAbsorbed = 0;
        
        if (this.shield > 0) {
            shieldAbsorbed = Math.min(this.shield, effective);
            this.shield -= shieldAbsorbed;
            effective -= shieldAbsorbed;
            this.shieldVFXTimer = 0.35;
            this.spawnFloatingText("صد " + Math.floor(shieldAbsorbed), "#4cd6ff");
            
            // Deflector Shield bullet reflection
            if (this.team === "player" && this.stats.features.includes("deflector_shield")) {
                if (Math.random() < 0.20) {
                    this.reflectBullet();
                }
            }
            
            // Stunning Retaliation (shock_retaliation) check
            if (this.shield <= 0 && this.team === "player" && this.stats.features && this.stats.features.includes("shock_retaliation")) {
                this.spawnFloatingText("💥 نبض كهرومغناطيسي! 💥", "#06b6d4");
                playSynthSound("nuclear");
                if (window.shockwaves) {
                    window.shockwaves.push(new Shockwave(this.x, this.y, 220, 0.55, "#06b6d4"));
                }
                enemies.forEach(e => {
                    if (e.alive) {
                        const dist = Math.hypot(e.x - this.x, e.y - this.y);
                        if (dist <= 220) {
                            e.applyStun(1.8);
                            for (let s = 0; s < 6; s++) {
                                particles.push(new SmokeParticle(e.x, e.y, "#06b6d4", 3.0, 0.25));
                            }
                        }
                    }
                });
            }
        }
        
        if (effective > 0) {
            this.hp -= effective;
            this.spawnFloatingText("-" + Math.floor(effective), this.team === "player" ? "#f2334b" : "#f2d133");
            if (this.team === "player") {
                addShake(6.0);
                window.gridDamagePulse = 1.2;
            }
            if (sourceTeam === "player" && this.team !== "player") {
                registerPlayerDamage(effective + shieldAbsorbed);
                window.gridGlowPulse = Math.min(1.5, (window.gridGlowPulse || 0) + 0.2);
            }
        } else {
            if (sourceTeam === "player" && this.team !== "player") {
                registerPlayerDamage(shieldAbsorbed);
                window.gridGlowPulse = Math.min(1.5, (window.gridGlowPulse || 0) + 0.15);
            }
        }
        
        playSynthSound("hit");
        
        this.shieldDelayTimer = this.shieldDelay;
        if (this.hp <= 0) {
            this.die();
        }
    }
    
    spawnFloatingText(textVal, textCol) {
        floatingTexts.push(new FloatingText(
            textVal, 
            this.x + (Math.random() - 0.5) * 30, 
            this.y - 20, 
            textCol
        ));
    }
    
    die() {
        if (!this.alive) return;
        this.alive = false;
        
        if (this.aiArchetype === "boss") {
            // Epic boss explosion
            spawnExplosion(this.x, this.y, this.bodyColor, 45, 0.85);
            if (window.shockwaves) {
                window.shockwaves.push(new Shockwave(this.x, this.y, 320, 0.9, this.bodyColor));
            }
            addShake(22.0);
            
            // Spawn sub-explosions around it after death
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
                const ex = this.x + Math.cos(a) * 45;
                const ey = this.y + Math.sin(a) * 45;
                setTimeout(() => {
                    spawnExplosion(ex, ey, "#ff5533", 10, 0.4);
                }, 150 + Math.random() * 150);
            }
        } else {
            const explCount = 14;
            spawnExplosion(this.x, this.y, this.bodyColor, explCount, 0.45);
            if (window.shockwaves) {
                window.shockwaves.push(new Shockwave(this.x, this.y, 90, 0.45, this.bodyColor));
            }
            addShake(6.0);
        }
        
        playSynthSound("explosion");
        
        if (this.team === "player") {
            handlePlayerDefeat();
        } else {
            // Reward player with kill count (coins are spawned as physical entities)
            profile.kills = (profile.kills || 0) + 1;
            window.stageKills = (window.stageKills || 0) + 1;
            
            // Spawn boss every 10 kills of regular enemies
            if (this.aiArchetype !== "boss" && window.stageKills % 10 === 0 && window.stageKills > 0) {
                spawnBoss();
            }
            
            // Nanite Field check: recharge player shield on kill
            if (player && player.alive && player.stats.features && player.stats.features.includes("nanite_field")) {
                if (player.shieldCapacity > 0) {
                    player.shield = Math.min(player.shieldCapacity, player.shield + player.shieldCapacity * 0.20);
                    // Spawn purple nanite healing particles
                    for (let p = 0; p < 12; p++) {
                        particles.push(new SmokeParticle(
                            player.x + (Math.random() - 0.5) * 35,
                            player.y + (Math.random() - 0.5) * 35,
                            "#c084fc",
                            3,
                            0.3
                        ));
                    }
                    player.spawnFloatingText("+20% درع 🛡️", "#c084fc");
                }
            }
            
            // Spawn physical coins
            let coinCount = 3;
            let coinVal = 4;
            if (this.aiArchetype === "boss") {
                coinCount = 10;
                coinVal = 15;
            } else if (this.aiArchetype === "sniper" || this.aiArchetype === "striker") {
                coinCount = 4;
                coinVal = 5;
            }
            
            for (let i = 0; i < coinCount; i++) {
                coins.push(new CoinEntity(this.x, this.y, coinVal));
            }
            
            saveProfile();
            refreshMainMenuUI();
            
            // Remove from active enemies array
            const idx = enemies.indexOf(this);
            if (idx !== -1) enemies.splice(idx, 1);
            
            // Respawn a new enemy to maintain constant 9 enemies (10 total tanks including player)
            if (window.stageKills < window.targetKills) {
                spawnReplacementEnemy();
            }
            
            updateHUDEnemyCount();
            checkStageClear();
        }
    }
    
    update(dt) {
        if (!this.alive) return;
        
        // Decay speed boost pad timer
        if (this.boostTimer > 0) {
            this.boostTimer -= dt;
        }
        
        // --- 1. Slow logic ---
        if (this.slowTimer > 0) {
            this.slowTimer -= dt;
            if (this.slowTimer <= 0) this.slowMultiplier = 1.0;
        }
        
        // --- 1b. Stun logic ---
        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
            this.moveInput = { x: 0, y: 0 };
            this.firePressed = false;
            
            // Stun sparks VFX
            if (Math.random() < 0.15) {
                particles.push(new ExplosionParticle(
                    this.x + (Math.random() - 0.5) * 40,
                    this.y + (Math.random() - 0.5) * 40,
                    "#ffa500",
                    3,
                    0.25,
                    "fire"
                ));
            }
        }
        
        // --- 2. Shield regen logic ---
        if (this.shield < this.shieldCapacity) {
            if (this.shieldDelayTimer > 0) {
                this.shieldDelayTimer -= dt;
            } else if (this.shieldRegen > 0) {
                this.shield = Math.min(this.shieldCapacity, this.shield + this.shieldRegen * dt);
            }
        }
        
        // --- 3. AI Processing ---
        if (this.aiEnabled) {
            if (this.stunTimer > 0) {
                this.moveInput = { x: 0, y: 0 };
                this.firePressed = false;
            } else {
                this.runAI(dt);
            }
        }
        
        // --- 4. Physics & Movement ---
        let desiredX = this.moveInput.x;
        let desiredY = this.moveInput.y;
        
        // Normalize input vector
        const inputLen = Math.hypot(desiredX, desiredY);
        if (inputLen > 1.0) {
            desiredX /= inputLen;
            desiredY /= inputLen;
        }
        
        let moveSpeed = (this.stats.move_speed || 220) * this.slowMultiplier;
        
        // Apply speed booster pad influence
        if (this.boostTimer > 0) {
            desiredX = Math.cos(this.boostAngle);
            desiredY = Math.sin(this.boostAngle);
            moveSpeed = Math.max(moveSpeed * 1.8, 400); // Massive boost!
        }
        
        // Overdrive Dash speed buff
        if (this.team === "player" && this.stats.features.includes("overdrive_dash")) {
            if (this.hp / this.maxHp < 0.40) {
                moveSpeed *= 1.35;
            }
        }
        
        // Super Overdrive speed buff (+50%) when active
        if (this.team === "player" && superPowerActive && profile.active_super === "super_overdrive") {
            moveSpeed *= 1.5;
        }
        
        // Laser slow effect recovery for enemies
        if (this.team !== "player" && typeof this.speedMultiplier === "number" && this.speedMultiplier < 1.0) {
            this.speedMultiplier = Math.min(1.0, this.speedMultiplier + dt * 0.8);
            moveSpeed *= this.speedMultiplier;
        }
        
        const targetVx = desiredX * moveSpeed;
        const targetVy = desiredY * moveSpeed;
        
        // Lerp/smooth movement (framerate independent)
        this.vx += (targetVx - this.vx) * (1 - Math.exp(-12.0 * dt));
        this.vy += (targetVy - this.vy) * (1 - Math.exp(-12.0 * dt));
        
        const speed = Math.hypot(this.vx, this.vy);
        if (speed > 5) {
            this.treadAnimTimer = ((this.treadAnimTimer || 0) + speed * dt * 0.08) % 5;
        }
        
        // Apply velocity & slide (basic wall sliding via box limits)
        let nextX = this.x + this.vx * dt;
        let nextY = this.y + this.vy * dt;
        
        // Obstacle Collisions (Slide against bounding rectangles)
        for (let i = 0; i < obstacles.length; i++) {
            const obs = obstacles[i];
            // Radius of tank is roughly 22 for collision
            if (circleRectCollide(nextX, this.y, 22, obs.x, obs.y, obs.w, obs.h)) {
                // Collides moving horizontally -> cancel horizontal velocity
                this.vx = 0;
                nextX = this.x;
            }
            if (circleRectCollide(this.x, nextY, 22, obs.x, obs.y, obs.w, obs.h)) {
                // Collides moving vertically -> cancel vertical velocity
                this.vy = 0;
                nextY = this.y;
            }
        }
        
        this.x = nextX;
        this.y = nextY;
        
        // Clamp to arena bounds
        this.clampToArena();
        
        // Spawn thruster trails/exhaust sparks
        if (inputLen > 0.1 && (isHighVfx() || Math.random() < (isMobile ? 0.08 : 0.3))) {
            const thrusterThreshold = isHighVfx() ? 0.08 : (isMobile ? 0.42 : 0.25);
            this.thrusterTimer = (this.thrusterTimer || 0) + dt;
            if (this.thrusterTimer >= thrusterThreshold) {
                this.thrusterTimer = 0;
                const backAngle = this.chassisAngle + Math.PI;
                const emitterX = this.x + Math.cos(backAngle) * 20;
                const emitterY = this.y + Math.sin(backAngle) * 20;
                
                let trailColor = "#38bdf8";
                if (this.team !== "player") {
                    if (this.aiArchetype === "boss") trailColor = "#ef4444";
                    else if (this.aiArchetype === "sniper") trailColor = "#c084fc";
                    else if (this.aiArchetype === "striker") trailColor = "#f97316";
                    else trailColor = "#facc15";
                }
                
                particles.push(new ExplosionParticle(
                    emitterX + (Math.random() - 0.5) * 6,
                    emitterY + (Math.random() - 0.5) * 6,
                    trailColor,
                    1.5 + Math.random() * 2.0,
                    0.2 + Math.random() * 0.15,
                    "fire"
                ));
            }
        }

        // Update ghost afterimages if player has active super
        if (this.team === "player" && typeof superPowerActive !== 'undefined' && superPowerActive) {
            if (!this.afterimages) this.afterimages = [];
            this.afterimages.push({
                x: this.x,
                y: this.y,
                chassisAngle: this.chassisAngle,
                turretAngle: this.turretAngle
            });
            const afterimageLimit = isMobile ? 2 : 5;
            if (this.afterimages.length > afterimageLimit) {
                this.afterimages.shift();
            }
        } else {
            if (this.afterimages) this.afterimages.length = 0;
        }
        
        // --- 5. Chassis Rotation ---
        if (inputLen > 0.1) {
            const targetChassisAngle = Math.atan2(desiredY, desiredX);
            // Angle interpolation
            let diff = targetChassisAngle - this.chassisAngle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            const turnSpeed = this.stats.turn_speed || 10.0;
            this.chassisAngle += diff * (1 - Math.exp(-turnSpeed * dt));
        }
        
        // --- 6. Aiming & Turret Rotation ---
        let aimDirX = 0;
        let aimDirY = 0;
        
        if (this.aiEnabled) {
            if (this.target && this.target.alive) {
                const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
                const bulletSpeed = this.stats.projectile_speed || 760;
                const timeToImpact = dist / bulletSpeed;
                
                // Lead the shot based on target's current velocity (0.8 scale for realistic prediction)
                const predX = this.target.x + (this.target.vx || 0) * timeToImpact * 0.8;
                const predY = this.target.y + (this.target.vy || 0) * timeToImpact * 0.8;
                
                aimDirX = predX - this.x;
                aimDirY = predY - this.y;
            }
        } else {
            // Player controls: check for smart auto-aim override when firing
            let useAutoAim = this.autoAim; // If global auto-aim is ON, always auto-aim
            
            if (!useAutoAim && this.firePressed) {
                // If firing in manual mode, check if we fired "without selecting a target"
                const nearest = this.findNearestEnemy();
                if (nearest) {
                    if (isMobile) {
                        // Mobile: check right joystick drag distance and angle
                        const dragDist = Math.hypot(joystickRight.aimX, joystickRight.aimY);
                        if (dragDist <= 0.3) {
                            useAutoAim = true; // Tapped or minor drag -> auto-aim
                        } else {
                            // Check if any enemy is in the direction of the drag
                            const dragAngle = Math.atan2(joystickRight.aimY, joystickRight.aimX);
                            let enemyInCone = false;
                            enemies.forEach(enemy => {
                                if (!enemy.alive) return;
                                const enemyAngle = Math.atan2(enemy.y - this.y, enemy.x - this.x);
                                let diff = enemyAngle - dragAngle;
                                while (diff < -Math.PI) diff += Math.PI * 2;
                                while (diff > Math.PI) diff -= Math.PI * 2;
                                if (Math.abs(diff) < 0.6) { // ~35 degrees cone
                                    enemyInCone = true;
                                }
                            });
                            if (!enemyInCone) {
                                useAutoAim = true; // No enemy in the dragged direction -> auto-aim to nearest
                            }
                        }
                    } else {
                        // Desktop: check if mouse cursor is close to any enemy
                        const z = viewZoom || 1;
                        const worldMouseX = this.x + (mousePos.x - width / 2) / z;
                        const worldMouseY = this.y + (mousePos.y - height / 2) / z;
                        
                        let enemyNearCursor = false;
                        enemies.forEach(enemy => {
                            if (!enemy.alive) return;
                            const distToCursor = Math.hypot(enemy.x - worldMouseX, enemy.y - worldMouseY);
                            if (distToCursor < 135) { // 135px threshold
                                enemyNearCursor = true;
                            }
                        });
                        if (!enemyNearCursor) {
                            useAutoAim = true; // Firing in empty space -> auto-aim to nearest
                        }
                    }
                }
            }
            
            if (useAutoAim || (Math.hypot(this.aimInput.x, this.aimInput.y) < 0.1 && (this.autoAim || isMobile))) {
                const nearest = this.findNearestEnemy();
                if (nearest) {
                    aimDirX = nearest.x - this.x;
                    aimDirY = nearest.y - this.y;
                } else {
                    aimDirX = this.aimInput.x;
                    aimDirY = this.aimInput.y;
                }
            } else {
                aimDirX = this.aimInput.x;
                aimDirY = this.aimInput.y;
            }
            
            if (Math.hypot(aimDirX, aimDirY) < 0.1) {
                aimDirX = Math.cos(this.chassisAngle);
                aimDirY = Math.sin(this.chassisAngle);
            }
        }
        
        if (Math.hypot(aimDirX, aimDirY) > 0.1) {
            const targetTurretAngle = Math.atan2(aimDirY, aimDirX);
            let diff = targetTurretAngle - this.turretAngle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            const turnSpeed = this.stats.turn_speed || 10.0;
            this.turretAngle += diff * (1 - Math.exp(-turnSpeed * 1.2 * dt));
        }
        
        // --- 7. VFX Timers ---
        if (this.muzzleFlashTimer > 0) this.muzzleFlashTimer -= dt;
        if (this.shieldVFXTimer > 0) this.shieldVFXTimer -= dt;
        
        // Spawn dust/tread smoke
        if (inputLen > 0.1) {
            this.smokeTimer += dt;
            const chassisSmokeThreshold = isHighVfx() ? 0.12 : (isMobile ? 0.55 : 0.32);
            if (this.smokeTimer >= chassisSmokeThreshold) {
                this.smokeTimer = 0;
                particles.push(new SmokeParticle(
                    this.x - Math.cos(this.chassisAngle) * 20,
                    this.y - Math.sin(this.chassisAngle) * 20,
                    "#555860",
                    5.0,
                    0.4
                ));
            }
        }
        
        // --- 7b. Player Ammunition Update ---
        if (this.team === "player") {
            if (this.isReloading) {
                this.reloadTimer -= dt;
                // Recover ammo during reload
                this.ammo = Math.min(this.maxAmmo, this.ammo + (this.maxAmmo / 1.5) * dt);
                if (this.reloadTimer <= 0) {
                    this.isReloading = false;
                    this.reloadTimer = 0;
                    this.ammo = this.maxAmmo;
                    this.spawnFloatingText("جاهز للإطلاق ⚡", "#22c55e");
                    playSynthSound("synth");
                }
            } else {
                // Slower recovery if holding fire button, normal recovery if not
                const regenRate = this.firePressed ? this.ammoRegen * 0.25 : this.ammoRegen;
                this.ammo = Math.min(this.maxAmmo, this.ammo + regenRate * dt);
            }
        }

        // --- 8. Weapon Cooldown & Shooting ---
        if (this.fireCooldown > 0) this.fireCooldown -= dt;
        if (this.firePressed && this.fireCooldown <= 0) {
            this.fire();
        }
    }
    
    clampToArena() {
        const borderPadding = 26;
        this.x = Math.max(-arenaHalfSize + borderPadding, Math.min(arenaHalfSize - borderPadding, this.x));
        this.y = Math.max(-arenaHalfSize + borderPadding, Math.min(arenaHalfSize - borderPadding, this.y));
    }
    
    findNearestEnemy() {
        let nearest = null;
        let minDist = Infinity;
        enemies.forEach(enemy => {
            if (!enemy.alive) return;
            const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
            if (dist < minDist) {
                minDist = dist;
                nearest = enemy;
            }
        });
        return nearest;
    }
    
    findNearestTarget() {
        if (this.aiArchetype === "boss") {
            // Boss prioritises player if alive and within 950px
            if (player && player.alive) {
                const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
                if (distToPlayer < 950) {
                    return player;
                }
            }
        }
        
        let nearest = null;
        let minDist = Infinity;
        
        const allTanks = [];
        if (player && player.alive && player !== this) allTanks.push(player);
        enemies.forEach(e => {
            if (e.alive && e !== this) {
                allTanks.push(e);
            }
        });
        
        allTanks.forEach(tank => {
            const dist = Math.hypot(tank.x - this.x, tank.y - this.y);
            if (dist < minDist) {
                minDist = dist;
                nearest = tank;
            }
        });
        
        return nearest;
    }
    
    runAI(dt) {
        this.target = this.findNearestTarget();
        if (!this.target) {
            this.moveInput = { x: 0, y: 0 };
            this.firePressed = false;
            return;
        }
        
        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const dist = Math.hypot(dx, dy);
        
        let preferredRange = 320;
        let strafeStrength = 0.35;
        
        switch (this.aiArchetype) {
            case "sniper":
                preferredRange = 440;
                strafeStrength = 0.2;
                break;
            case "boss":
                preferredRange = 360;
                strafeStrength = 0.28;
                break;
            case "striker":
                preferredRange = 280;
                strafeStrength = 0.45;
                break;
        }
        
        let moveX = 0;
        let moveY = 0;
        
        // Smart retreat state machine
        const hpRatio = this.hp / this.maxHp;
        const shieldRatio = this.shieldCapacity > 0 ? (this.shield / this.shieldCapacity) : 1.0;
        
        if (hpRatio < 0.35 || shieldRatio < 0.15) {
            this.isRetreating = true;
        }
        
        if (this.isRetreating && hpRatio > 0.55 && shieldRatio > 0.70) {
            this.isRetreating = false;
        }
        
        if (this.isRetreating) {
            // Seek cover behind the nearest obstacle
            let nearestObstacle = null;
            let minDist = 99999;
            obstacles.forEach(obs => {
                const obsCenterX = obs.x + obs.w / 2;
                const obsCenterY = obs.y + obs.h / 2;
                const distToObs = Math.hypot(obsCenterX - this.x, obsCenterY - this.y);
                if (distToObs < minDist) {
                    minDist = distToObs;
                    nearestObstacle = obs;
                }
            });
            
            if (nearestObstacle && minDist < 450) {
                const obsCenterX = nearestObstacle.x + nearestObstacle.w / 2;
                const obsCenterY = nearestObstacle.y + nearestObstacle.h / 2;
                
                const targetToObsX = obsCenterX - this.target.x;
                const targetToObsY = obsCenterY - this.target.y;
                const targetToObsDist = Math.max(1.0, Math.hypot(targetToObsX, targetToObsY));
                
                // Spot is behind the obstacle opposite to target player
                const coverSpotX = obsCenterX + (targetToObsX / targetToObsDist) * 45;
                const coverSpotY = obsCenterY + (targetToObsY / targetToObsDist) * 45;
                
                const toCoverX = coverSpotX - this.x;
                const toCoverY = coverSpotY - this.y;
                const distToCover = Math.hypot(toCoverX, toCoverY);
                
                if (distToCover > 20) {
                    moveX = toCoverX / distToCover;
                    moveY = toCoverY / distToCover;
                } else {
                    moveX = 0;
                    moveY = 0;
                }
            } else {
                // Fallback: Run directly away from target
                moveX = -dx / dist;
                moveY = -dy / dist;
            }
            strafeStrength = 0.55; // Dodging strafe strength
            this.firePressed = dist <= preferredRange * 0.8; // Focus on escaping
        } else {
            // Normal tactical AI movement
            if (dist > preferredRange + 60) {
                // Chase
                moveX = dx / dist;
                moveY = dy / dist;
            } else if (dist < preferredRange * 0.7) {
                // Back away
                moveX = -dx / dist;
                moveY = -dy / dist;
            }
            this.firePressed = dist <= preferredRange + 120;
        }
        
        // --- Projectile Dodging (Evasion) ---
        let evasionX = 0;
        let evasionY = 0;
        let incomingCount = 0;
        
        projectiles.forEach(proj => {
            if (proj.alive && proj.team === "player") {
                const px = proj.x - this.x;
                const py = proj.y - this.y;
                const distToProj = Math.hypot(px, py);
                if (distToProj < 180) {
                    const toTankX = -px / distToProj;
                    const toTankY = -py / distToProj;
                    const dot = proj.dx * toTankX + proj.dy * toTankY;
                    if (dot > 0.65) {
                        // Perpendicular directions
                        const perp1X = -proj.dy;
                        const perp1Y = proj.dx;
                        const perp2X = proj.dy;
                        const perp2Y = -proj.dx;
                        
                        const dot1 = perp1X * moveX + perp1Y * moveY;
                        const dot2 = perp2X * moveX + perp2Y * moveY;
                        
                        if (dot1 > dot2) {
                            evasionX += perp1X;
                            evasionY += perp1Y;
                        } else {
                            evasionX += perp2X;
                            evasionY += perp2Y;
                        }
                        incomingCount++;
                    }
                }
            }
        });
        
        if (incomingCount > 0) {
            const evaLen = Math.hypot(evasionX, evasionY);
            if (evaLen > 0.01) {
                const blendRatio = 0.6;
                moveX = moveX * (1 - blendRatio) + (evasionX / evaLen) * blendRatio;
                moveY = moveY * (1 - blendRatio) + (evasionY / evaLen) * blendRatio;
                
                const len = Math.hypot(moveX, moveY);
                if (len > 0.01) {
                    moveX /= len;
                    moveY /= len;
                }
            }
        }
        
        // Calculate final movement input including dodging strafe
        const strafeX = -dy / dist;
        const strafeY = dx / dist;
        
        this.moveInput.x = moveX + strafeX * strafeStrength;
        this.moveInput.y = moveY + strafeY * strafeStrength;

        // --- AI Obstacle Avoidance Steering ---
        let avoidX = 0;
        let avoidY = 0;
        let colliding = false;
        
        const lookAheadDist = 70;
        const predX = this.x + this.moveInput.x * lookAheadDist;
        const predY = this.y + this.moveInput.y * lookAheadDist;
        
        for (let i = 0; i < obstacles.length; i++) {
            const obs = obstacles[i];
            if (circleRectCollide(predX, predY, 28, obs.x, obs.y, obs.w, obs.h)) {
                colliding = true;
                
                const toTankX = this.x - obs.x;
                const toTankY = this.y - obs.y;
                
                const perp1X = -toTankY;
                const perp1Y = toTankX;
                const perp2X = toTankY;
                const perp2Y = -toTankX;
                
                const dot1 = perp1X * this.moveInput.x + perp1Y * this.moveInput.y;
                const dot2 = perp2X * this.moveInput.x + perp2Y * this.moveInput.y;
                
                if (dot1 > dot2) {
                    avoidX += perp1X;
                    avoidY += perp1Y;
                } else {
                    avoidX += perp2X;
                    avoidY += perp2Y;
                }
            }
        }
        
        if (colliding) {
            const avoidLen = Math.hypot(avoidX, avoidY);
            if (avoidLen > 0.01) {
                this.moveInput.x = (this.moveInput.x * 0.3) + (avoidX / avoidLen * 0.7);
                this.moveInput.y = (this.moveInput.y * 0.3) + (avoidY / avoidLen * 0.7);
                
                const len = Math.hypot(this.moveInput.x, this.moveInput.y);
                if (len > 0.01) {
                    this.moveInput.x /= len;
                    this.moveInput.y /= len;
                }
            }
        }
    }
    
    fire() {
        if (this.team === "player") {
            let ammoCost = 10;
            if (this.stats.features.includes("split_shot")) ammoCost += 5;
            if (this.stats.features.includes("plasma_cannon")) ammoCost += 10;
            if (this.stats.features.includes("singularity_bomb")) ammoCost += 25;
            
            this.ammoCostPerShot = ammoCost;
            
            if (this.isReloading) return;
            if (this.ammo < ammoCost) {
                this.isReloading = true;
                this.reloadTimer = 1.5;
                playSynthSound("hit");
                this.spawnFloatingText("⚠️ حرارة مرتفعة! إعادة شحن", "#ef4444");
                return;
            }
            this.ammo -= ammoCost;
        }

        let fireRate = this.stats.fire_rate || 1.0;
        
        // Overdrive Dash fire rate buff
        if (this.team === "player" && this.stats.features.includes("overdrive_dash")) {
            if (this.hp / this.maxHp < 0.40) {
                fireRate *= 1.50;
            }
        }
        
        // Super Overdrive fire rate buff (+100%) when active
        if (this.team === "player" && superPowerActive && profile.active_super === "super_overdrive") {
            fireRate *= 2.0;
        }
        
        this.fireCooldown = 1.0 / Math.max(0.2, fireRate);
        this.muzzleFlashTimer = 0.06;
        
        const fdirX = Math.cos(this.turretAngle);
        const fdirY = Math.sin(this.turretAngle);
        
        const barrelScale = this.aiArchetype === "boss" ? 60 : 36;
        const pX = this.x + fdirX * barrelScale;
        const pY = this.y + fdirY * barrelScale;
        
        let color = this.team === "player" ? "#5bb5ff" : this.bodyColor;
        if (this.team === "player" && this.stats.features) {
            if (this.stats.features.includes("singularity_bomb")) {
                color = "#a855f7"; // violet
            } else if (this.stats.features.includes("plasma_cannon")) {
                color = "#ec4899"; // pink/magenta
            }
        }
        
        if (this.aiArchetype === "boss") {
            // Boss weapon: giant central laser/bullet + two side bullets
            const projColor = "#ff334b";
            const proj = new Projectile(
                pX, pY, fdirX, fdirY,
                this.team,
                projColor,
                this.stats,
                this
            );
            proj.radius = 13;
            proj.damage = this.stats.damage * 1.5;
            proj.speed = this.stats.projectile_speed * 0.95;
            proj.enemyPierceLeft = 2; // Boss bullets pierce standard enemies!
            projectiles.push(proj);
            
            const angles = [-0.2, 0.2];
            angles.forEach(ang => {
                const fdirX1 = Math.cos(this.turretAngle + ang);
                const fdirY1 = Math.sin(this.turretAngle + ang);
                const projSide = new Projectile(
                    pX, pY, fdirX1, fdirY1,
                    this.team,
                    "rgba(255, 51, 75, 0.7)",
                    this.stats,
                    this
                );
                projSide.radius = 7;
                projSide.damage = this.stats.damage * 0.75;
                projSide.speed = this.stats.projectile_speed * 1.05;
                projectiles.push(projSide);
            });
        } else {
            // Normal tank weapon
            const proj = new Projectile(
                pX, pY, fdirX, fdirY,
                this.team,
                color,
                this.stats,
                this
            );
            projectiles.push(proj);
            
            // Split Shot feature - fire 2 extra side shells
            if (this.team === "player" && this.stats.features.includes("split_shot")) {
                const angle1 = this.turretAngle - 0.26; // -15 deg
                const fdirX1 = Math.cos(angle1);
                const fdirY1 = Math.sin(angle1);
                const proj1 = new Projectile(
                    pX, pY, fdirX1, fdirY1,
                    this.team,
                    color,
                    this.stats,
                    this
                );
                projectiles.push(proj1);
                
                const angle2 = this.turretAngle + 0.26; // +15 deg
                const fdirX2 = Math.cos(angle2);
                const fdirY2 = Math.sin(angle2);
                const proj2 = new Projectile(
                    pX, pY, fdirX2, fdirY2,
                    this.team,
                    color,
                    this.stats,
                    this
                );
                projectiles.push(proj2);
            }
        }
        
        playSynthSound("shoot");
        if (this.team === "player") {
            addShake(3.0);
        } else if (this.aiArchetype === "boss") {
            addShake(5.0);
        }
    }
    
    draw(ctx, camX, camY) {
        const rx = this.x - camX;
        const ry = this.y - camY;
        
        // Draw ghost afterimages if active (drawn below tank)
        if (this.team === "player" && typeof superPowerActive !== 'undefined' && superPowerActive && this.afterimages && this.afterimages.length > 0) {
            this.afterimages.forEach((img, index) => {
                if (index === this.afterimages.length - 1) return;
                const alpha = (index + 1) / 10 * 0.45;
                ctx.save();
                const gx = img.x - camX;
                const gy = img.y - camY;
                ctx.translate(gx, gy);
                ctx.rotate(img.chassisAngle);
                ctx.globalAlpha = alpha;
                
                // Draw ghost body
                ctx.fillStyle = "rgba(250, 204, 21, 0.4)";
                ctx.strokeStyle = "#ffd700";
                ctx.lineWidth = 1.5;
                ctx.fillRect(-26, -14, 52, 28);
                ctx.strokeRect(-26, -14, 52, 28);
                
                // Draw ghost turret
                ctx.rotate(-img.chassisAngle);
                ctx.rotate(img.turretAngle);
                ctx.fillStyle = "rgba(250, 204, 21, 0.55)";
                ctx.beginPath();
                ctx.arc(0, 0, 15, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                
                // Draw ghost barrel
                ctx.fillStyle = "#ffd700";
                ctx.fillRect(0, -4, 36, 8);
                ctx.restore();
            });
        }
        
        ctx.save();
        
        if (this.aiArchetype === "boss") {
            ctx.translate(rx, ry);
            ctx.scale(1.7, 1.7);
            ctx.translate(-rx, -ry);
        }
        
        // Draw Underglow (neon light ring below tank)
        let glowColor = "rgba(51, 158, 242, 0.25)"; // Cyan for player
        if (this.team !== "player") {
            if (this.aiArchetype === "striker") glowColor = "rgba(235, 128, 51, 0.25)";
            else if (this.aiArchetype === "sniper") glowColor = "rgba(183, 82, 234, 0.25)";
            else if (this.aiArchetype === "boss") glowColor = "rgba(219, 41, 56, 0.4)";
            else glowColor = "rgba(230, 209, 71, 0.25)"; // grunt
        }
        
        ctx.save();
        ctx.shadowColor = glowColor.replace("0.25", "0.9").replace("0.4", "0.95");
        ctx.shadowBlur = 18;
        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.arc(rx, ry, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        // Draw drop shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
        ctx.beginPath();
        ctx.ellipse(rx, ry + 4, 30, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Chassis rotation translation
        ctx.translate(rx, ry);
        ctx.rotate(this.chassisAngle);
        
        // 1. Draw Left and Right Tracks (animated)
        ctx.fillStyle = "#2d2f34";
        // Left Track base
        ctx.fillRect(-30, -21, 60, 7);
        // Treads
        ctx.fillStyle = "#1c1e21";
        const treadOffset = (this.treadAnimTimer || 0);
        for (let i = -6; i <= 6; i++) {
            const tx = i * 5 + (treadOffset % 5) - 2.5;
            if (tx >= -30 && tx <= 30) {
                ctx.fillRect(tx, -21, 2, 7);
            }
        }
        
        // Right Track base
        ctx.fillStyle = "#2d2f34";
        ctx.fillRect(-30, 14, 60, 7);
        // Treads
        ctx.fillStyle = "#1c1e21";
        for (let i = -6; i <= 6; i++) {
            const tx = i * 5 + (treadOffset % 5) - 2.5;
            if (tx >= -30 && tx <= 30) {
                ctx.fillRect(tx, 14, 2, 7);
            }
        }
        
        // Track wheels hubs details
        ctx.fillStyle = "#101114";
        ctx.beginPath();
        ctx.arc(-20, -17.5, 2.5, 0, Math.PI*2);
        ctx.arc(0, -17.5, 2.5, 0, Math.PI*2);
        ctx.arc(20, -17.5, 2.5, 0, Math.PI*2);
        ctx.arc(-20, 17.5, 2.5, 0, Math.PI*2);
        ctx.arc(0, 17.5, 2.5, 0, Math.PI*2);
        ctx.arc(20, 17.5, 2.5, 0, Math.PI*2);
        ctx.fill();
        
        // 2. Draw Chassis Body
        ctx.fillStyle = this.bodyColor;
        ctx.fillRect(-26, -14, 52, 28);
        
        // Standard upgrades chassis decorations (Player Only)
        if (this.team === "player" && this.stats.upgrades) {
            // Reinforced Hull (skirting and front wedge plate)
            if (this.stats.upgrades.includes("reinforced_hull")) {
                ctx.fillStyle = "#475569";
                ctx.fillRect(-22, -23, 44, 3);
                ctx.fillRect(-22, 20, 44, 3);
                ctx.strokeStyle = "#94a3b8";
                ctx.lineWidth = 1;
                ctx.strokeRect(-22, -23, 44, 3);
                ctx.strokeRect(-22, 20, 44, 3);
                
                ctx.fillStyle = "#334155";
                ctx.beginPath();
                ctx.moveTo(22, -12);
                ctx.lineTo(31, 0);
                ctx.lineTo(22, 12);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
            
            // Turbo Drive (exhaust pipes)
            if (this.stats.upgrades.includes("turbo_drive")) {
                ctx.fillStyle = "#64748b";
                ctx.fillRect(-28, -17, 6, 3);
                ctx.fillRect(-28, 14, 6, 3);
                
                // Animate tiny exhaust smoke when moving
                if (Math.hypot(this.vx, this.vy) > 10 && Math.random() < 0.15) {
                    particles.push(new SmokeParticle(
                        this.x - Math.cos(this.chassisAngle) * 25,
                        this.y - Math.sin(this.chassisAngle) * 25,
                        "#708090",
                        3,
                        0.35
                    ));
                }
            }
            
            // Explosive Rounds (ammo drums)
            if (this.stats.upgrades.includes("explosive_rounds")) {
                ctx.fillStyle = "#f2334b";
                ctx.strokeStyle = "#80101b";
                ctx.lineWidth = 1.0;
                ctx.fillRect(-22, -11, 7, 5);
                ctx.strokeRect(-22, -11, 7, 5);
                ctx.fillRect(-22, 6, 7, 5);
                ctx.strokeRect(-22, 6, 7, 5);
            }
        }
        
        // Overdrive twin exhaust boosters (Shop ability)
        if (this.team === "player" && this.stats.features && this.stats.features.includes("overdrive_dash")) {
            // Detailed dark steel booster nozzles
            ctx.fillStyle = "#1e293b";
            ctx.strokeStyle = "#475569";
            ctx.lineWidth = 1;
            ctx.fillRect(-32, -10, 6, 6);
            ctx.strokeRect(-32, -10, 6, 6);
            ctx.fillRect(-32, 4, 6, 6);
            ctx.strokeRect(-32, 4, 6, 6);
            
            // Copper exhaust rings
            ctx.fillStyle = "#d97706";
            ctx.fillRect(-28, -9, 2, 4);
            ctx.fillRect(-28, 5, 2, 4);
            
            // Animate booster flames
            ctx.save();
            const isLowHealth = (this.hp / this.maxHp) < 0.40;
            const flameLen = isLowHealth ? (18 + Math.random() * 12) : (4 + Math.random() * 3);
            const shadowB = isLowHealth ? 12 : 4;
            
            ctx.shadowBlur = shadowB;
            
            // Outer Flame (orange/red)
            ctx.fillStyle = isLowHealth ? "#ef4444" : "rgba(249, 115, 22, 0.4)";
            ctx.shadowColor = isLowHealth ? "#ef4444" : "#f97316";
            ctx.beginPath();
            // Top booster
            ctx.moveTo(-32, -7);
            ctx.lineTo(-32 - flameLen, -7);
            ctx.lineTo(-32, -10);
            // Bottom booster
            ctx.moveTo(-32, 7);
            ctx.lineTo(-32 - flameLen, 7);
            ctx.lineTo(-32, 4);
            ctx.fill();
            
            // Inner Flame core (yellow/white)
            ctx.fillStyle = isLowHealth ? "#facc15" : "rgba(253, 224, 71, 0.6)";
            ctx.beginPath();
            ctx.moveTo(-32, -8);
            ctx.lineTo(-32 - flameLen * 0.6, -7);
            ctx.lineTo(-32, -9);
            ctx.moveTo(-32, 6);
            ctx.lineTo(-32 - flameLen * 0.6, 7);
            ctx.lineTo(-32, 5);
            ctx.fill();
            
            ctx.restore();
        }
        
        // Mega Napalm fuel container
        if (this.team === "player" && this.stats.features && this.stats.features.includes("mega_napalm")) {
            // Fuel container base
            ctx.fillStyle = "#ff5500";
            ctx.strokeStyle = "#ffda33";
            ctx.lineWidth = 1;
            ctx.fillRect(-23, -7, 9, 14);
            ctx.strokeRect(-23, -7, 9, 14);
            
            // Hazard warning stripes (yellow and black)
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-23, -4); ctx.lineTo(-19, -7);
            ctx.moveTo(-23, 1); ctx.lineTo(-17, -4);
            ctx.moveTo(-23, 6); ctx.lineTo(-15, 0);
            ctx.stroke();
            
            // Orange fuel tube connecting the canister to the turret base (drawn towards center)
            ctx.strokeStyle = "rgba(255, 85, 0, 0.85)";
            ctx.lineWidth = 2.0;
            ctx.shadowColor = "#ff5500";
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.moveTo(-14, 0);
            ctx.quadraticCurveTo(-7, -4, 0, 0); // curved tube towards turret center
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
        
        // Glowing Chassis outline
        ctx.strokeStyle = this.team === "player" ? "#74c2ff" : this.bodyColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(-26, -14, 52, 28);
        
        // Front metal plate highlight
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.fillRect(14, -12, 10, 24);
        
        // 3. Draw Turret (rotate relative to chassis)
        ctx.rotate(-this.chassisAngle); // Cancel chassis rotation
        ctx.rotate(this.turretAngle);   // Apply turret rotation
        
        // Split Shot double side-barrels
        if (this.team === "player" && this.stats.features && this.stats.features.includes("split_shot")) {
            ctx.fillStyle = "#2d2f34";
            ctx.lineWidth = 1;
            
            // Left extra barrel
            ctx.fillRect(0, -10, 32, 4);
            ctx.strokeStyle = "#33f276";
            ctx.strokeRect(0, -10, 32, 4);
            
            // Right extra barrel
            ctx.fillRect(0, 6, 32, 4);
            ctx.strokeRect(0, 6, 32, 4);
            
            // Green copper coils wrapped around side barrels
            ctx.strokeStyle = "#10b981";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            // Coils on left barrel
            ctx.moveTo(8, -11); ctx.lineTo(8, -5);
            ctx.moveTo(16, -11); ctx.lineTo(16, -5);
            ctx.moveTo(24, -11); ctx.lineTo(24, -5);
            // Coils on right barrel
            ctx.moveTo(8, 5); ctx.lineTo(8, 11);
            ctx.moveTo(16, 5); ctx.lineTo(16, 11);
            ctx.moveTo(24, 5); ctx.lineTo(24, 11);
            ctx.stroke();
            
            // Laser connector lines running to the turret base
            ctx.strokeStyle = "rgba(51, 242, 118, 0.6)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, -8);
            ctx.lineTo(-8, 0);
            ctx.moveTo(0, 8);
            ctx.lineTo(-8, 0);
            ctx.stroke();
        }
        
        // Standard upgrades turret modifications (Player Only)
        const hasRail = this.team === "player" && this.stats.upgrades && this.stats.upgrades.includes("rail_shells");
        const hasCaliber = this.team === "player" && this.stats.upgrades && this.stats.upgrades.includes("high_caliber");
        const hasReload = this.team === "player" && this.stats.upgrades && this.stats.upgrades.includes("quick_reload");
        
        let barrelLength = 36;
        let barrelWidth = 8;
        if (hasRail) {
            barrelLength = 46;
            barrelWidth = 6;
        } else if (hasCaliber) {
            barrelLength = 38;
            barrelWidth = 10;
        }
        
        // Barrel base draw
        ctx.fillStyle = "#3e4147";
        ctx.fillRect(0, -barrelWidth/2, barrelLength, barrelWidth);
        ctx.strokeStyle = this.team === "player" ? "#74c2ff" : this.bodyColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(0, -barrelWidth/2, barrelLength, barrelWidth);
        
        // Rail Coils and core
        if (hasRail) {
            ctx.strokeStyle = "#22d3ee";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(12, -4); ctx.lineTo(12, 4);
            ctx.moveTo(22, -4); ctx.lineTo(22, 4);
            ctx.moveTo(32, -4); ctx.lineTo(32, 4);
            ctx.moveTo(42, -4); ctx.lineTo(42, 4);
            ctx.stroke();
            
            // Glowing cyan core line
            ctx.fillStyle = "#22d3ee";
            ctx.fillRect(4, -1, barrelLength - 8, 2);
        }
        
        // Caliber muzzle brake tip
        if (hasCaliber && !hasRail) {
            ctx.fillStyle = "#1e293b";
            ctx.strokeStyle = "#cbd5e1";
            ctx.lineWidth = 1.0;
            ctx.fillRect(barrelLength, -barrelWidth/2 - 2, 6, barrelWidth + 4);
            ctx.strokeRect(barrelLength, -barrelWidth/2 - 2, 6, barrelWidth + 4);
        }
        
        // Reload recoil cylinders
        if (hasReload) {
            ctx.fillStyle = "#475569";
            ctx.fillRect(2, -barrelWidth/2 - 3, 10, 3);
            ctx.fillRect(2, barrelWidth/2, 10, 3);
        }
        
        // Laser sight for Armor Piercing
        if (this.team === "player" && this.stats.upgrades && this.stats.upgrades.includes("armor_piercing")) {
            ctx.strokeStyle = "rgba(239, 68, 68, 0.4)";
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(barrelLength, 0);
            ctx.lineTo(barrelLength + 90, 0);
            ctx.stroke();
        }
        
        // Frost Shells cooling base
        if (this.team === "player" && this.stats.upgrades && this.stats.upgrades.includes("frost_shells")) {
            ctx.fillStyle = "#38bdf8";
            ctx.beginPath();
            ctx.arc(-10, -11, 2.5, 0, Math.PI*2);
            ctx.arc(-10, 11, 2.5, 0, Math.PI*2);
            ctx.fill();
        }
        
        // Shield Generator energy ring
        if (this.team === "player" && this.stats.upgrades && this.stats.upgrades.includes("shield_generator")) {
            ctx.strokeStyle = "#38bdf8";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, 18, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // Barrel tip overlay
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
        ctx.fillRect(barrelLength - 4, -barrelWidth/2 - 1, 4, barrelWidth + 2);
        
        // Turret Base
        ctx.fillStyle = this.turretColor;
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = this.team === "player" ? "#74c2ff" : this.bodyColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // EMP Pulse charging nodes
        if (this.team === "player" && this.stats.features && this.stats.features.includes("emp_pulse")) {
            ctx.save();
            
            // Draw metallic support brackets for the nodes
            ctx.fillStyle = "#475569";
            ctx.fillRect(-10, -12, 6, 4);
            ctx.fillRect(-10, 8, 6, 4);
            
            // Cyan energy cables running from turret center to nodes
            ctx.strokeStyle = "rgba(76, 214, 255, 0.7)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(-8, -6, -7, -10);
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(-8, 6, -7, 10);
            ctx.stroke();
            
            // Draw nodes
            ctx.fillStyle = "#4cd6ff";
            ctx.shadowColor = "#4cd6ff";
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(-7, -10, 4, 0, Math.PI * 2);
            ctx.arc(-7, 10, 4, 0, Math.PI * 2);
            ctx.fill();
            
            // Occasional electric charging spark arc between the nodes
            if (Math.random() < 0.15) {
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1;
                ctx.shadowBlur = 4;
                ctx.shadowColor = "#4cd6ff";
                ctx.beginPath();
                ctx.moveTo(-7, -10);
                // jagged line
                const midX = -7 + (Math.random() - 0.5) * 6;
                const midY = (Math.random() - 0.5) * 4;
                ctx.lineTo(midX, midY);
                ctx.lineTo(-7, 10);
                ctx.stroke();
            }
            
            ctx.restore();
        }
        
        // Deflector Shield rotating dish
        if (this.team === "player" && this.stats.features && this.stats.features.includes("deflector_shield")) {
            ctx.save();
            
            // Steel mounting arm from turret center to dish (offset to the back/side)
            ctx.strokeStyle = "#64748b";
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-16, -16); // extends back-left
            ctx.stroke();
            
            // Mount head
            ctx.fillStyle = "#475569";
            ctx.beginPath();
            ctx.arc(-16, -16, 3, 0, Math.PI * 2);
            ctx.fill();
            
            // Rotating radar dish array (centered at mount point)
            ctx.translate(-16, -16);
            ctx.strokeStyle = "#339ef2";
            ctx.lineWidth = 1.5;
            ctx.shadowColor = "#339ef2";
            ctx.shadowBlur = 6;
            
            // Outer dish ring
            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, Math.PI * 2);
            ctx.stroke();
            
            // Radar inner grid lines
            ctx.strokeStyle = "rgba(51, 158, 242, 0.4)";
            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
            ctx.stroke();
            
            // Sweep scan angle
            const rotateAngle = (performance.now() / 250) % (Math.PI * 2);
            
            // Scanning glow sector (semi-transparent sweep)
            ctx.fillStyle = "rgba(51, 158, 242, 0.15)";
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, 10, rotateAngle - 0.4, rotateAngle);
            ctx.closePath();
            ctx.fill();
            
            // Scanner arm
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(rotateAngle) * 10, Math.sin(rotateAngle) * 10);
            ctx.stroke();
            
            ctx.restore();
        }
        
        // Turret hatch
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.beginPath();
        ctx.arc(-4, -4, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Neon energy core in center
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Muzzle Flash
        if (this.muzzleFlashTimer > 0) {
            ctx.save();
            ctx.shadowColor = "#ffda33";
            ctx.shadowBlur = 12;
            ctx.fillStyle = "rgba(255, 218, 51, 0.95)";
            ctx.beginPath();
            ctx.arc(42, 0, 12, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(45, 0, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        
        ctx.restore(); // Restore back to original screen translation
        
        // 4. Draw Health & Shield Overhead Bars
        const scale = this.aiArchetype === "boss" ? 1.7 : 1.0;
        const bx = rx - 30 * scale;
        const by = ry - 32 * scale;
        const barW = 60 * scale;
        const barH = 5 * scale;
        const barG = 7 * scale;
        const shieldH = 4 * scale;
        
        ctx.fillStyle = "rgba(10, 15, 20, 0.65)";
        ctx.fillRect(bx, by, barW, barH);
        const hpRatio = Math.max(0, this.hp / this.maxHp);
        ctx.fillStyle = "#33f276";
        ctx.fillRect(bx, by, barW * hpRatio, barH);
        
        // Shield Bar
        if (this.shieldCapacity > 0) {
            ctx.fillStyle = "rgba(10, 15, 20, 0.65)";
            ctx.fillRect(bx, by + barG, barW, shieldH);
            const shieldRatio = Math.max(0, this.shield / this.shieldCapacity);
            ctx.fillStyle = "#339ef2";
            ctx.fillRect(bx, by + barG, barW * shieldRatio, shieldH);
        }
        
        // 5. Shield Bubble VFX
        if (this.shield > 0 && (this.shieldVFXTimer > 0 || this.hp / this.maxHp < 0.3)) {
            let alpha = 0.25;
            if (this.shieldVFXTimer > 0) {
                alpha = 0.5 * (this.shieldVFXTimer / 0.35);
            }
            
            ctx.save();
            ctx.strokeStyle = "rgba(51, 158, 242, " + alpha + ")";
            ctx.fillStyle = "rgba(51, 158, 242, " + (alpha * 0.15) + ")";
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.arc(rx, ry, 46 * scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // 5.2 Nuclear Aegis (super_shield) Visual Shield Bubble
        if (this.team === "player" && typeof superPowerActive !== 'undefined' && superPowerActive && profile.active_super === "super_shield") {
            ctx.save();
            const pulse = 1.0 + Math.sin(performance.now() / 80) * 0.05;
            const radius = 60 * pulse;
            ctx.strokeStyle = "rgba(34, 197, 94, 0.85)";
            ctx.shadowColor = "#22c55e";
            ctx.shadowBlur = 12;
            ctx.fillStyle = "rgba(34, 197, 94, 0.12)";
            ctx.lineWidth = 3.0;
            ctx.beginPath();
            ctx.arc(rx, ry, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Draw a subtle secondary inner ring
            ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.arc(rx, ry, radius - 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        
        // 6. Overdrive Aura VFX
        if (this.team === "player" && this.stats.features && this.stats.features.includes("overdrive_dash") && (this.hp / this.maxHp < 0.40)) {
            ctx.save();
            ctx.strokeStyle = "rgba(242, 51, 75, 0.45)";
            ctx.fillStyle = "rgba(242, 51, 75, 0.08)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(rx, ry, 34 + Math.sin(performance.now() / 100) * 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
        
        // 7. Super Charge Ring around Player Tank (Brawl Stars Style)
        if (this.team === "player") {
            const timeSinceHit = performance.now() - (window.lastHitTime || 0);
            const isFlashing = timeSinceHit < 200; // Flash for 200ms
            const pulseFactor = isFlashing ? 1.0 + (1.0 - timeSinceHit / 200) * 0.25 : 1.0;
            
            const baseRadius = 38 * pulseFactor;
            const px = rx; 
            const py = ry;
            
            // Uncharged arc background
            ctx.save();
            ctx.beginPath();
            ctx.arc(px, py, baseRadius, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.restore();
            
            // Charged arc
            const chargeRatio = (typeof superPowerCharge !== 'undefined' ? superPowerCharge : 0) / 100;
            if (chargeRatio > 0) {
                ctx.save();
                ctx.beginPath();
                // Start from top (-Math.PI/2) and go clockwise based on charge
                ctx.arc(px, py, baseRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * chargeRatio);
                
                // Color is white/yellow if flashing, gold if fully charged, otherwise standard yellow
                ctx.strokeStyle = isFlashing ? "#ffffff" : (chargeRatio >= 1.0 ? "#facc15" : "#eab308");
                ctx.lineWidth = isFlashing ? 5.5 : 4;
                ctx.lineCap = "round";
                ctx.stroke();
                
                // Add glowing shadow if high quality
                if (isHighVfx()) {
                    ctx.shadowColor = chargeRatio >= 1.0 ? "#facc15" : "#eab308";
                    ctx.shadowBlur = isFlashing ? 12 : 6;
                    ctx.stroke();
                }
                ctx.restore();
            }
            
            // If 100% charged, draw an outer rotating golden dashed ring (solar charge aura)
            if (chargeRatio >= 1.0) {
                ctx.save();
                const rotAngle = (performance.now() / 450) % (Math.PI * 2);
                ctx.translate(px, py);
                ctx.rotate(rotAngle);
                ctx.beginPath();
                ctx.arc(0, 0, baseRadius + 5, 0, Math.PI * 2);
                ctx.strokeStyle = "rgba(250, 204, 21, 0.6)";
                ctx.lineWidth = 1.5;
                ctx.setLineDash([6, 8]);
                ctx.stroke();
                ctx.restore();
            }
        }
    }
}

// ==========================================
// GAME CORE LOOP & CAMPAIGN FLOW
// ==========================================
let lastTime = performance.now();
let stageInstance = null;
let currentWaveIndex = 0;
let waveSpawnCount = 0;
let activeSpawnTimer = 0;
let waveTimer = 0;
let spawnFinished = false;

function startStage(stageIdx) {
    enemies = [];
    projectiles = [];
    upSuperBlades = [];
    upSuperBladeWave = 0;
    upSuperWaveCooldown = 0;
    particles = [];
    floatingTexts = [];
    obstacles = [];
    teleportPads = [];
    speedPads = [];
    napalmPuddles = [];
    coins = [];
    
    stageInstance = buildStage(stageIdx);
    
    // Build static level obstacles programmatically
    buildLevelObstacles(stageIdx);
    
    currentWaveIndex = 0;
    waveSpawnCount = 0;
    activeSpawnTimer = 0;
    
    // Toggle overlays
    document.getElementById("mainMenu").classList.add("hide");
    document.getElementById("upgradePanel").classList.add("hide");
    document.getElementById("defeatPanel").classList.add("hide");
    document.getElementById("pausePanel").classList.add("hide");
    document.getElementById("hud").classList.remove("hide");
    
    if (isMobile) {
        document.getElementById("mobilePauseBtn").classList.remove("hide");
        document.getElementById("mobileSuperBtn").classList.remove("hide");
    } else {
        document.getElementById("mobilePauseBtn").classList.add("hide");
        document.getElementById("mobileSuperBtn").classList.add("hide");
    }
    
    gameState = STATE.PLAYING;
    
    // Re-initialize player
    if (!player) {
        player = new TankEntity(0, 0, playerStats, "player", PLAYER_COLOR);
    } else {
        player.configure(playerStats, "player", PLAYER_COLOR);
    }
    player.x = 0;
    player.y = 0;
    player.died = false;
    player.stunTimer = 0;
    
    // Reset camera position
    camera.x = 0;
    camera.y = 0;
    
    // Pre-spawn all enemies tactically across the map
    preSpawnAllEnemies();
    
    if (stageInstance.boss) {
        showBossWarning();
    }
    
    updateHUD();
    requestGamePointerLock();
}

function buildLevelObstacles(stageIdx) {
    obstacles = [];
    teleportPads = [];
    speedPads = [];

    const theme = stageIdx % 4;
    
    // 1. Generate core layout obstacles based on theme
    if (theme === 0) {
        // --- Theme 0: Cyber Ruins (Scattered Blocks) ---
        const count = 25 + (stageIdx % 10) * 2;
        for (let i = 0; i < count; i++) {
            const w = 90 + (i % 4) * 20;
            const h = 42 + (i % 3) * 15;
            let ox = (Math.random() - 0.5) * (arenaHalfSize * 1.6);
            let oy = (Math.random() - 0.5) * (arenaHalfSize * 1.6);
            
            // Keep center safe
            if (Math.abs(ox) < 250 && Math.abs(oy) < 250) {
                ox += 450 * (Math.random() > 0.5 ? 1 : -1);
                oy += 450 * (Math.random() > 0.5 ? 1 : -1);
            }
            obstacles.push(new Obstacle(ox, oy, w, h));
        }
    } 
    else if (theme === 1) {
        // --- Theme 1: Sector Central (Central Fortress) ---
        const rSize = 350; // Radius size of the fort
        const wallT = 30;  // Wall thickness
        
        // 4 Large fortress outer walls with gaps
        // Top Left Wall segment
        obstacles.push(new Obstacle(-rSize/2 - 50, -rSize, 220, wallT));
        // Top Right Wall segment
        obstacles.push(new Obstacle(rSize/2 + 50, -rSize, 220, wallT));
        // Bottom Left Wall segment
        obstacles.push(new Obstacle(-rSize/2 - 50, rSize, 220, wallT));
        // Bottom Right Wall segment
        obstacles.push(new Obstacle(rSize/2 + 50, rSize, 220, wallT));
        
        // Left Side Wall segments
        obstacles.push(new Obstacle(-rSize, -rSize/2 - 50, wallT, 220));
        obstacles.push(new Obstacle(-rSize, rSize/2 + 50, wallT, 220));
        
        // Right Side Wall segments
        obstacles.push(new Obstacle(rSize, -rSize/2 - 50, wallT, 220));
        obstacles.push(new Obstacle(rSize, rSize/2 + 50, wallT, 220));
        
        // 4 Corner towers
        obstacles.push(new Obstacle(-rSize, -rSize, 60, 60));
        obstacles.push(new Obstacle(rSize, -rSize, 60, 60));
        obstacles.push(new Obstacle(-rSize, rSize, 60, 60));
        obstacles.push(new Obstacle(rSize, rSize, 60, 60));
        
        // Scatter some outer rubble
        for (let i = 0; i < 15; i++) {
            let ox = (Math.random() - 0.5) * (arenaHalfSize * 1.6);
            let oy = (Math.random() - 0.5) * (arenaHalfSize * 1.6);
            if (Math.abs(ox) < rSize + 80 && Math.abs(oy) < rSize + 80) {
                ox += (rSize + 150) * (ox > 0 ? 1 : -1);
                oy += (rSize + 150) * (oy > 0 ? 1 : -1);
            }
            obstacles.push(new Obstacle(ox, oy, 80, 40));
        }
    } 
    else if (theme === 2) {
        // --- Theme 2: Digital Labyrinth (Pillars Grid) ---
        const step = 280;
        for (let x = -arenaHalfSize + 300; x < arenaHalfSize - 300; x += step) {
            for (let y = -arenaHalfSize + 300; y < arenaHalfSize - 300; y += step) {
                if (Math.abs(x) < 200 && Math.abs(y) < 200) continue;
                
                if ((Math.abs(x) + Math.abs(y)) % (step * 2) === 0) {
                    obstacles.push(new Obstacle(x, y, 70, 70));
                } else {
                    const rot = (x + y) % 3 === 0;
                    obstacles.push(new Obstacle(x, y, rot ? 140 : 40, rot ? 40 : 140));
                }
            }
        }
    } 
    else if (theme === 3) {
        // --- Theme 3: Choke Points (Long Dividers) ---
        const wallT = 32;
        
        // Horizontal dividers
        obstacles.push(new Obstacle(-800, -600, 1000, wallT));
        obstacles.push(new Obstacle(800, -600, 1000, wallT));
        obstacles.push(new Obstacle(-800, 600, 1000, wallT));
        obstacles.push(new Obstacle(800, 600, 1000, wallT));
        
        // Vertical dividers
        obstacles.push(new Obstacle(-600, -800, wallT, 1000));
        obstacles.push(new Obstacle(600, -800, wallT, 1000));
        obstacles.push(new Obstacle(-600, 800, wallT, 1000));
        obstacles.push(new Obstacle(600, 800, wallT, 1000));
        
        // Add random scatter blocks
        for (let i = 0; i < 15; i++) {
            let ox = (Math.random() - 0.5) * (arenaHalfSize * 1.5);
            let oy = (Math.random() - 0.5) * (arenaHalfSize * 1.5);
            if (Math.abs(ox) < 200 && Math.abs(oy) < 200) continue;
            obstacles.push(new Obstacle(ox, oy, 80, 40));
        }
    }

    // 2. Spawn Quantum Teleportation Pads (Portals)
    const p1Dist = arenaHalfSize - 220;
    teleportPads.push(new TeleportPad(-p1Dist, -p1Dist, p1Dist, p1Dist, "#06b6d4"));
    teleportPads.push(new TeleportPad(p1Dist, p1Dist, -p1Dist, -p1Dist, "#06b6d4"));
    
    teleportPads.push(new TeleportPad(-p1Dist, p1Dist, p1Dist, -p1Dist, "#a855f7"));
    teleportPads.push(new TeleportPad(p1Dist, -p1Dist, -p1Dist, p1Dist, "#a855f7"));

    // 3. Spawn Electro-Booster Pads (Speed Pads)
    speedPads.push(new SpeedPad(-220, 0, Math.PI, "#eab308")); // Leftwards
    speedPads.push(new SpeedPad(220, 0, 0, "#eab308"));       // Rightwards
    speedPads.push(new SpeedPad(0, -220, -Math.PI/2, "#eab308")); // Upwards
    speedPads.push(new SpeedPad(0, 220, Math.PI/2, "#eab308"));   // Downwards
    
    const cDist = arenaHalfSize - 350;
    speedPads.push(new SpeedPad(-cDist, -cDist, Math.PI/4, "#fb923c")); // Orange speedup pointing down-right
    speedPads.push(new SpeedPad(cDist, -cDist, Math.PI * 3/4, "#fb923c"));
    speedPads.push(new SpeedPad(-cDist, cDist, -Math.PI/4, "#fb923c"));
    speedPads.push(new SpeedPad(cDist, cDist, -Math.PI * 3/4, "#fb923c"));

    // 4. Spawn Destructible Nano Caches (Green Caches)
    const cacheCount = 4 + (stageIdx % 3);
    for (let i = 0; i < cacheCount; i++) {
        let cx = 0, cy = 0;
        let valid = false;
        let attempts = 0;
        while (!valid && attempts < 100) {
            attempts++;
            cx = (Math.random() - 0.5) * arenaHalfSize * 1.3;
            cy = (Math.random() - 0.5) * arenaHalfSize * 1.3;
            
            if (Math.abs(cx) < 300 && Math.abs(cy) < 300) continue;
            
            let coll = false;
            for (let j = 0; j < obstacles.length; j++) {
                if (circleRectCollide(cx, cy, 30, obstacles[j].x, obstacles[j].y, obstacles[j].w, obstacles[j].h)) {
                    coll = true;
                    break;
                }
            }
            if (!coll) valid = true;
        }
        if (valid) {
            obstacles.push(new NanoCache(cx, cy));
        }
    }
}

function preSpawnAllEnemies() {
    enemies = [];
    window.stageKills = 0;
    window.targetKills = 6 + stageInstance.stage_index * 2;
    
    const countToSpawn = 9;
    const archetypes = ["grunt", "striker", "sniper"];
    
    for (let i = 0; i < countToSpawn; i++) {
        let sx = 0, sy = 0;
        let valid = false;
        let attempts = 0;
        
        while (!valid && attempts < 100) {
            attempts++;
            const spawnArea = arenaHalfSize - 80;
            sx = (Math.random() - 0.5) * spawnArea * 2;
            sy = (Math.random() - 0.5) * spawnArea * 2;
            
            // Keep away from player starting point (0,0)
            const distFromPlayer = Math.hypot(sx, sy);
            if (distFromPlayer < 650) continue;
            
            // Check obstacle collisions
            let obstacleCollision = false;
            for (let j = 0; j < obstacles.length; j++) {
                const obs = obstacles[j];
                if (circleRectCollide(sx, sy, 32, obs.x, obs.y, obs.w, obs.h)) {
                    obstacleCollision = true;
                    break;
                }
            }
            if (obstacleCollision) continue;
            
            // Check enemy collisions
            let enemyCollision = false;
            for (let j = 0; j < enemies.length; j++) {
                const e = enemies[j];
                if (Math.hypot(sx - e.x, sy - e.y) < 60) {
                    enemyCollision = true;
                    break;
                }
            }
            if (enemyCollision) continue;
            
            valid = true;
        }
        
        const arch = archetypes[i % archetypes.length];
        const waveStats = {
            health_mult: 1.0 + Math.pow(stageInstance.stage_index - 1, 0.75) * 0.15 + (i % 3) * 0.05,
            damage_mult: 1.0 + Math.pow(stageInstance.stage_index - 1, 0.7) * 0.10 + (i % 3) * 0.04,
            speed_mult: Math.min(1.22, 1.0 + (stageInstance.stage_index - 1) * 0.012),
            fire_rate_mult: Math.min(1.35, 1.0 + (stageInstance.stage_index - 1) * 0.015)
        };
        const stats = buildEnemyStats(arch, stageInstance.stage_index, waveStats);
        const color = ENEMY_COLORS[arch] || "#ffffff";
        
        const enemy = new TankEntity(sx, sy, stats, "enemy", color, true, arch);
        enemies.push(enemy);
    }
    
    spawnFinished = true;
    updateHUDEnemyCount();
}

function spawnReplacementEnemy() {
    if (gameState !== STATE.PLAYING) return;
    
    // Count active alive enemies
    const activeEnemiesCount = enemies.filter(e => e.alive).length;
    if (activeEnemiesCount >= 9) return;
    
    let sx = 0, sy = 0;
    let valid = false;
    let attempts = 0;
    
    while (!valid && attempts < 100) {
        attempts++;
        const spawnArea = arenaHalfSize - 80;
        sx = (Math.random() - 0.5) * spawnArea * 2;
        sy = (Math.random() - 0.5) * spawnArea * 2;
        
        if (player && player.alive) {
            const distFromPlayer = Math.hypot(sx - player.x, sy - player.y);
            if (distFromPlayer < 650) continue;
        }
        
        let obstacleCollision = false;
        for (let j = 0; j < obstacles.length; j++) {
            const obs = obstacles[j];
            if (circleRectCollide(sx, sy, 32, obs.x, obs.y, obs.w, obs.h)) {
                obstacleCollision = true;
                break;
            }
        }
        if (obstacleCollision) continue;
        
        let enemyCollision = false;
        for (let j = 0; j < enemies.length; j++) {
            const e = enemies[j];
            if (e.alive && Math.hypot(sx - e.x, sy - e.y) < 60) {
                enemyCollision = true;
                break;
            }
        }
        if (enemyCollision) continue;
        
        valid = true;
    }
    
    const archetypes = ["grunt", "striker", "sniper"];
    const randArch = archetypes[Math.floor(Math.random() * archetypes.length)];
    
    const mockWave = {
        health_mult: 1.0 + Math.pow(stageInstance.stage_index - 1, 0.75) * 0.15,
        damage_mult: 1.0 + Math.pow(stageInstance.stage_index - 1, 0.7) * 0.10,
        speed_mult: Math.min(1.22, 1.0 + (stageInstance.stage_index - 1) * 0.012),
        fire_rate_mult: Math.min(1.35, 1.0 + (stageInstance.stage_index - 1) * 0.015)
    };
    
    const stats = buildEnemyStats(randArch, stageInstance.stage_index, mockWave);
    const color = ENEMY_COLORS[randArch] || "#ffffff";
    
    const enemy = new TankEntity(sx, sy, stats, "enemy", color, true, randArch);
    enemies.push(enemy);
    updateHUDEnemyCount();
}

function spawnBoss() {
    if (gameState !== STATE.PLAYING) return;
    
    showBossWarning();
    addShake(15.0);
    
    playSynthSound("nuclear");
    setTimeout(() => { playSynthSound("nuclear"); }, 300);
    
    let sx = 0, sy = 0;
    if (player && player.alive) {
        const angle = Math.random() * Math.PI * 2;
        sx = player.x + Math.cos(angle) * 750;
        sy = player.y + Math.sin(angle) * 750;
    } else {
        sx = (Math.random() - 0.5) * arenaHalfSize;
        sy = (Math.random() - 0.5) * arenaHalfSize;
    }
    
    const limit = arenaHalfSize - 100;
    sx = Math.max(-limit, Math.min(limit, sx));
    sy = Math.max(-limit, Math.min(limit, sy));
    
    const waveStats = {
        health_mult: 1.0 + Math.pow(stageInstance.stage_index - 1, 0.8) * 0.2,
        damage_mult: 1.0 + Math.pow(stageInstance.stage_index - 1, 0.75) * 0.15,
        speed_mult: Math.min(1.15, 1.0 + (stageInstance.stage_index - 1) * 0.01),
        fire_rate_mult: Math.min(1.25, 1.0 + (stageInstance.stage_index - 1) * 0.015)
    };
    
    const stats = buildEnemyStats("boss", stageInstance.stage_index, waveStats);
    if (!stats.features) stats.features = [];
    if (!stats.features.includes("split_shot")) stats.features.push("split_shot");
    if (!stats.features.includes("deflector_shield")) stats.features.push("deflector_shield");
    if (!stats.features.includes("mega_napalm")) stats.features.push("mega_napalm");
    if (!stats.features.includes("plasma_cannon") && stageInstance.stage_index >= 3) stats.features.push("plasma_cannon");
    
    const bossColor = ENEMY_COLORS.boss || "#db2938";
    const boss = new TankEntity(sx, sy, stats, "enemy", bossColor, true, "boss");
    
    enemies.push(boss);
    
    floatingTexts.push(new FloatingText(
        "⚠️ اقتراب الزعيم العملاق! ⚠️",
        player ? player.x : 0,
        player ? player.y - 60 : -60,
        "#f2334b",
        2.5,
        22
    ));
    
    if (window.shockwaves) {
        window.shockwaves.push(new Shockwave(sx, sy, 250, 0.8, "#f2334b"));
    }
}

function updateHUDEnemyCount() {
    const hudWave = document.getElementById("hudWave");
    if (hudWave) {
        hudWave.textContent = `التصفيات: ${window.stageKills || 0} / ${window.targetKills || 10}`;
    }
}

function processWaveSpawning(dt) {
    // No-op. Enemies pre-spawned at start.
}

function checkStageClear() {
    if (gameState !== STATE.PLAYING) return;
    
    // Stage cannot clear if there is any active boss alive
    const bossAlive = enemies.some(e => e.alive && e.aiArchetype === "boss");
    
    if (window.stageKills >= window.targetKills && !bossAlive) {
        handleStageClear();
    }
}

function handleStageClear() {
    gameState = STATE.UPGRADE;
    
    // Save progression
    profile.stage_index = stageInstance.stage_index + 1;
    profile.highest_stage = Math.max(profile.highest_stage, stageInstance.stage_index);
    profile.coins += stageInstance.reward;
    if (!profile.cleared_stages.includes(stageInstance.stage_id)) {
        profile.cleared_stages.push(stageInstance.stage_id);
    }
    
    saveProfile();
    recalculatePlayerStats();
    
    // Show Upgrades select UI
    document.getElementById("hud").classList.add("hide");
    document.getElementById("upgradePanel").classList.remove("hide");
    
    document.getElementById("mobilePauseBtn").classList.add("hide");
    document.getElementById("mobileSuperBtn").classList.add("hide");
    
    populateUpgradeChoices();
    releaseGamePointerLock();
}

function handlePlayerDefeat() {
    gameState = STATE.DEFEAT;
    document.getElementById("hud").classList.add("hide");
    document.getElementById("defeatPanel").classList.remove("hide");
    
    document.getElementById("mobilePauseBtn").classList.add("hide");
    document.getElementById("mobileSuperBtn").classList.add("hide");
    
    releaseGamePointerLock();
}

function togglePause() {
    if (gameState === STATE.PLAYING) {
        gameState = STATE.PAUSED;
        document.getElementById("hud").classList.add("hide");
        document.getElementById("pausePanel").classList.remove("hide");
        
        document.getElementById("mobilePauseBtn").classList.add("hide");
        document.getElementById("mobileSuperBtn").classList.add("hide");
        
        // Reset inputs to prevent continuous movement/shooting
        if (player) {
            player.moveInput = { x: 0, y: 0 };
            player.firePressed = false;
        }
        for (const k in keys) {
            keys[k] = false;
        }
        isMouseDown = false;
        
        releaseGamePointerLock();
        playSynthSound("hit");
    } else if (gameState === STATE.PAUSED) {
        gameState = STATE.PLAYING;
        document.getElementById("pausePanel").classList.add("hide");
        document.getElementById("hud").classList.remove("hide");
        
        if (isMobile) {
            document.getElementById("mobilePauseBtn").classList.remove("hide");
            document.getElementById("mobileSuperBtn").classList.remove("hide");
        }
        
        requestGamePointerLock();
        playSynthSound("synth");
    }
}

// ==========================================
// SMART SUPER POWERS MECHANICS
// ==========================================
const SUPER_POWERS = [
    {
        id: "super_laser",
        name: "مدمر الليزر الكمي (Hyper Laser)",
        description: "توليد شعاع ليزري خارق مستمر ومحرق لمدة 3.5 ثانية يذيب الأعداء والجدران في طريقه.",
        cost: 2500,
        color: "#ffd700" // Golden Yellow
    },
    {
        id: "super_storm",
        name: "عاصفة الصواعق الرعدية (Storm)",
        description: "استدعاء 12 صاعقة رعدية مدمرة تضرب جميع الأعداء في الشاشة وتصعقهم لـ 3 ثوانٍ.",
        cost: 3000,
        color: "#06b6d4" // Cyan
    },
    {
        id: "super_overdrive",
        name: "الفرط النانوي الخارق (Overdrive)",
        description: "شحن الدرع 100%، الحصانة المطلقة، زيادة السرعة 50%، ومعدل الإطلاق 100% لمدة 6 ثوانٍ.",
        cost: 3500,
        color: "#a855f7" // Purple
    },
    {
        id: "super_chronos",
        name: "حقل التباطؤ المطلق (Chronos Field)",
        description: "إبطاء حركة الأعداء ومقذوفاتهم بنسبة 90% لـ 5 ثوانٍ لتمشيط الميدان وتفادي النيران بسهولة.",
        cost: 4000,
        color: "#3b82f6" // Blue
    },
    {
        id: "super_shield",
        name: "الدرع النووي العاكس (Nuclear Aegis)",
        description: "إنشاء درع نووي عاكس عملاق يمتص 100% من الضرر ويعكس قذائف الأعداء كقذائف بلازما خضراء مدمرة لـ 4.5 ثوانٍ.",
        cost: 4500,
        color: "#22c55e" // Green
    },
    {
        id: "upsuper",
        name: "UPSUPER",
        description: "سوبر أسطوري يطلق سكاكين نارية سريعة: تبدأ بـ 5 طلقات، تعود بسرعة، ثم تصبح 10 ثم 15 وهكذا طوال مدة التفعيل.",
        cost: 6500,
        color: "#ff5a1f",
        tierLabel: "سوبر أسطوري",
        tierClass: "legendary-super"
    }
];

function registerPlayerDamage(amount) {
    // Set window.lastHitTime for visual ring pulse and crosshair hit indicator on every hit
    window.lastHitTime = performance.now();
    
    if (superPowerActive || !profile.active_super) return;
    
    // Boosted Super charge: 1 damage = 0.12% charge (~830 damage for full charge)
    superPowerCharge = Math.min(100, superPowerCharge + amount * 0.12);
    
    const hintEl = document.getElementById("superBtnHint");
    if (superPowerCharge >= 100 && hintEl) {
        hintEl.classList.remove("hide");
    }
}

function activateSuperPower() {
    if (superPowerCharge < 100 || superPowerActive || !player || !player.alive) return;
    if (!profile.active_super) return;
    
    superPowerActive = true;
    superPowerCharge = 0;
    
    const hintEl = document.getElementById("superBtnHint");
    if (hintEl) hintEl.classList.add("hide");
    
    playSynthSound("nuclear"); // play powerful activate sound
    player.spawnFloatingText("⚡ تفعيل القدرة الخارقة! ⚡", "#ffd700");
    
    const superType = profile.active_super;
    
    if (superType === "super_laser") {
        activeSuperPowerDuration = 3.5;
    } else if (superType === "super_storm") {
        activeSuperPowerDuration = 3.0;
        triggerThunderstorm();
    } else if (superType === "super_overdrive") {
        activeSuperPowerDuration = 6.0;
        player.shield = player.shieldCapacity;
        player.spawnFloatingText("حصانة الفرط النانوي! ⚡", "#a855f7");
    } else if (superType === "super_chronos") {
        activeSuperPowerDuration = 5.0;
        player.spawnFloatingText("حقل التباطؤ المطلق! ⏳", "#3b82f6");
    } else if (superType === "super_shield") {
        activeSuperPowerDuration = 4.5;
        player.spawnFloatingText("الدرع النووي العاكس! 🛡️", "#22c55e");
    } else if (superType === "upsuper") {
        activeSuperPowerDuration = 7.5;
        upSuperBladeWave = 0;
        upSuperWaveCooldown = 0;
        upSuperBlades = [];
        spawnUpSuperWave();
        player.spawnFloatingText("UPSUPER: سكاكين النار!", "#ff7a18");
    }
    
    // Spawn massive golden/yellow shockwave ring
    if (window.shockwaves) {
        window.shockwaves.push(new Shockwave(player.x, player.y, 260, 0.75, "#ffd700"));
    }
}

function triggerThunderstorm() {
    stormStrikesRemaining = 12;
    stormTimer = 0;
}

function spawnUpSuperWave() {
    if (!player || !player.alive) return;
    upSuperBladeWave += 1;
    const count = Math.min(upSuperBladeWave * 5, isMobile ? 35 : 70);
    const baseAngle = player.turretAngle || 0;
    const spread = Math.min(Math.PI * 1.25, 0.18 * (count - 1));
    const startAngle = baseAngle - spread / 2;

    for (let i = 0; i < count; i++) {
        const ratio = count === 1 ? 0.5 : i / (count - 1);
        const angle = startAngle + spread * ratio + (Math.random() - 0.5) * 0.035;
        upSuperBlades.push(new UpSuperBlade(
            player.x + Math.cos(angle) * 28,
            player.y + Math.sin(angle) * 28,
            angle,
            player,
            upSuperBladeWave
        ));
    }

    player.spawnFloatingText(`UPSUPER x${count}`, "#ff7a18");
    if (window.shockwaves) {
        window.shockwaves.push(new Shockwave(player.x, player.y, 120 + count * 2, 0.32, "#ff7a18"));
    }
}

function updateUpSuper(dt) {
    for (let i = upSuperBlades.length - 1; i >= 0; i--) {
        const active = upSuperBlades[i].update(dt);
        if (!active) upSuperBlades.splice(i, 1);
    }

    if (!superPowerActive || profile.active_super !== "upsuper" || gameState !== STATE.PLAYING) return;

    upSuperWaveCooldown = Math.max(0, upSuperWaveCooldown - dt);
    if (upSuperBlades.length === 0 && upSuperWaveCooldown <= 0) {
        upSuperWaveCooldown = 0.18;
        spawnUpSuperWave();
    }
}

function updateThunderstorm(dt) {
    if (stormStrikesRemaining <= 0) return;
    
    stormTimer += dt;
    if (stormTimer >= 0.22) { // strike every 0.22 seconds
        stormTimer = 0;
        stormStrikesRemaining--;
        
        let targetX = 0;
        let targetY = 0;
        let targetEnemy = null;
        
        const activeEnemies = enemies.filter(e => e.alive);
        if (activeEnemies.length > 0) {
            targetEnemy = activeEnemies[Math.floor(Math.random() * activeEnemies.length)];
            targetX = targetEnemy.x;
            targetY = targetEnemy.y;
        } else {
            // random spot in viewport
            targetX = player.x + (Math.random() - 0.5) * 600;
            targetY = player.y + (Math.random() - 0.5) * 600;
        }
        
        if (targetEnemy) {
            targetEnemy.takeDamage(playerStats.damage * 4.5, "player");
            targetEnemy.applyStun(3.0);
        }
        
        addShake(8.0);
        playSynthSound("explosion"); // loud explosion
        
        // Build lightning bolt visual jagged points
        const boltPoints = [];
        let curX = targetX + (Math.random() - 0.5) * 80;
        let curY = targetY - 600;
        
        boltPoints.push({ x: curX, y: curY });
        while (curY < targetY) {
            curY += 40 + Math.random() * 40;
            curX += (Math.random() - 0.5) * 30;
            boltPoints.push({ x: curX, y: curY });
        }
        boltPoints.push({ x: targetX, y: targetY });
        
        if (!window.activeLightningBolts) window.activeLightningBolts = [];
        window.activeLightningBolts.push({
            points: boltPoints,
            age: 0,
            lifetime: 0.12
        });
        
        spawnExplosion(targetX, targetY, "#06b6d4", 12, 0.45);
    }
}

function drawSuperIcon(canvas, id) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(canvas.width / 48, canvas.height / 48);
    ctx.shadowBlur = 6;
    ctx.lineWidth = 2.0;
    
    if (id === "super_laser") {
        ctx.strokeStyle = "#ffd700";
        ctx.shadowColor = "#ffd700";
        ctx.fillStyle = "rgba(255, 215, 0, 0.15)";
        
        ctx.beginPath();
        ctx.moveTo(4, 40);
        ctx.lineTo(40, 4);
        ctx.stroke();
        
        ctx.lineWidth = 1.0;
        ctx.strokeStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(8, 40);
        ctx.lineTo(40, 8);
        ctx.stroke();
        
        ctx.fillStyle = "#ffd700";
        ctx.beginPath();
        ctx.arc(24, 24, 3, 0, Math.PI*2);
        ctx.arc(32, 16, 2, 0, Math.PI*2);
        ctx.arc(16, 32, 2, 0, Math.PI*2);
        ctx.fill();
    } 
    else if (id === "super_storm") {
        ctx.strokeStyle = "#06b6d4";
        ctx.shadowColor = "#06b6d4";
        ctx.fillStyle = "rgba(6, 182, 212, 0.15)";
        
        ctx.beginPath();
        ctx.arc(18, 20, 5, 0, Math.PI*2);
        ctx.arc(26, 18, 6, 0, Math.PI*2);
        ctx.arc(32, 22, 5, 0, Math.PI*2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(24, 22);
        ctx.lineTo(18, 30);
        ctx.lineTo(26, 30);
        ctx.lineTo(20, 40);
        ctx.stroke();
    } 
    else if (id === "super_overdrive") {
        ctx.strokeStyle = "#a855f7";
        ctx.shadowColor = "#a855f7";
        ctx.fillStyle = "rgba(168, 85, 247, 0.15)";
        
        ctx.beginPath();
        ctx.arc(24, 24, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.beginPath();
        ctx.ellipse(24, 24, 15, 5, Math.PI / 4, 0, Math.PI * 2);
        ctx.ellipse(24, 24, 15, 5, -Math.PI / 4, 0, Math.PI * 2);
        ctx.stroke();
    }
    else if (id === "super_chronos") {
        ctx.strokeStyle = "#3b82f6";
        ctx.shadowColor = "#3b82f6";
        ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
        
        // Hourglass shape
        ctx.beginPath();
        ctx.moveTo(14, 12);
        ctx.lineTo(34, 12);
        ctx.lineTo(26, 24);
        ctx.lineTo(34, 36);
        ctx.lineTo(14, 36);
        ctx.lineTo(22, 24);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Sand dripping
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(24, 18, 2, 0, Math.PI * 2);
        ctx.arc(24, 28, 2, 0, Math.PI * 2);
        ctx.arc(24, 32, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
    else if (id === "super_shield") {
        ctx.strokeStyle = "#22c55e";
        ctx.shadowColor = "#22c55e";
        ctx.fillStyle = "rgba(34, 197, 94, 0.15)";
        
        // Shield shape
        ctx.beginPath();
        ctx.moveTo(24, 6);
        ctx.lineTo(38, 12);
        ctx.lineTo(38, 26);
        ctx.quadraticCurveTo(38, 38, 24, 42);
        ctx.quadraticCurveTo(10, 38, 10, 26);
        ctx.lineTo(10, 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Inner cross
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(24, 14);
        ctx.lineTo(24, 34);
        ctx.moveTo(16, 22);
        ctx.lineTo(32, 22);
        ctx.stroke();
    }
    else if (id === "upsuper") {
        ctx.strokeStyle = "#ff5a1f";
        ctx.shadowColor = "#ff7a18";
        ctx.fillStyle = "rgba(255, 90, 31, 0.18)";

        // Fire fan background
        ctx.beginPath();
        ctx.moveTo(24, 42);
        ctx.bezierCurveTo(8, 30, 16, 18, 21, 6);
        ctx.bezierCurveTo(26, 15, 35, 17, 30, 30);
        ctx.bezierCurveTo(38, 25, 40, 36, 24, 42);
        ctx.fill();
        ctx.stroke();

        // Knife-like blades
        for (let i = -1; i <= 1; i++) {
            ctx.save();
            ctx.translate(24, 24);
            ctx.rotate(i * 0.45);
            ctx.fillStyle = i === 0 ? "#fff2a8" : "#ff7a18";
            ctx.strokeStyle = "#7c1d00";
            ctx.beginPath();
            ctx.moveTo(17, 0);
            ctx.lineTo(0, -4);
            ctx.lineTo(-12, 0);
            ctx.lineTo(0, 4);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
    }
    
    ctx.restore();
}

function populateSuperPowersUI() {
    const listContainer = document.getElementById("superPowersList");
    if (!listContainer) return;
    listContainer.innerHTML = "";
    
    SUPER_POWERS.forEach(sup => {
        const item = document.createElement("div");
        item.className = "shop-item";
        
        const isUnlocked = (profile.unlocked_supers || []).includes(sup.id);
        const isActive = profile.active_super === sup.id;
        const canAfford = profile.coins >= sup.cost;
        
        let btnText = "شراء";
        let btnClass = "shop-buy-btn";
        
        if (isActive) {
            btnText = "نشط ✅";
            btnClass += " active-super";
        } else if (isUnlocked) {
            btnText = "تفعيل";
            btnClass += " select-super";
        } else if (!canAfford) {
            btnText = "شراء";
            btnClass += " cant-afford";
        } else {
            btnText = "شراء";
            btnClass += " locked";
        }
        
        const tierLabel = sup.tierLabel || "فائقة";
        const tierClass = sup.tierClass ? ` ${sup.tierClass}` : "";

        item.innerHTML = `
            <div class="card-badge-row">
                <span class="super-tier-badge${tierClass}" style="color: ${sup.color}; border: 1px solid ${sup.color}; padding: 1.5px 5px; border-radius: 4px; font-size: 0.6rem; font-weight: 800; text-shadow: 0 0 5px ${sup.color}; background: rgba(0,0,0,0.25); display: inline-block;">${tierLabel}</span>
                <div class="shop-item-cost" style="color: #ffd700">💰 ${sup.cost}</div>
            </div>
            <div class="card-icon-container">
                <canvas class="super-item-icon-canvas" width="56" height="56" style="border: 1px solid ${sup.color};"></canvas>
            </div>
            <div class="shop-item-info">
                <span class="shop-item-name" style="color: ${sup.color}">${sup.name}</span>
                <span class="shop-item-desc" style="font-size: 0.72rem;">${sup.description}</span>
            </div>
            <div class="card-action-row">
                <button class="${btnClass}">${btnText}</button>
            </div>
        `;
        
        const canvasEl = item.querySelector(".super-item-icon-canvas");
        drawSuperIcon(canvasEl, sup.id);
        
        const btn = item.querySelector("button");
        btn.addEventListener("click", () => {
            if (isActive) return;
            
            if (isUnlocked) {
                profile.active_super = sup.id;
                saveProfile();
                populateSuperPowersUI();
                playSynthSound("shoot");
            } else if (canAfford) {
                profile.coins -= sup.cost;
                if (!profile.unlocked_supers) profile.unlocked_supers = [];
                profile.unlocked_supers.push(sup.id);
                profile.active_super = sup.id;
                saveProfile();
                populateSuperPowersUI();
                refreshMainMenuUI();
                triggerCoinPulse("savedCoins");
                playSynthSound("nuclear");
            }
        });
        
        listContainer.appendChild(item);
    });
}

function getUpgradeCategory(id) {
    if (id === "reinforced_hull" || id === "shield_generator") {
        return { name: "دفاعية", class: "cat-def" };
    } else if (id === "turbo_drive") {
        return { name: "حركة", class: "cat-mob" };
    } else {
        return { name: "هجومية", class: "cat-off" };
    }
}

function getSmartRecommendation(choices) {
    if (!choices || choices.length === 0) return null;
    if (!player) return choices[0].id;
    
    // 1. Health/Shield critical check
    const hpRatio = player.hp / player.maxHp;
    if (hpRatio < 0.6) {
        const defense = choices.find(c => c.id === "shield_generator" || c.id === "reinforced_hull");
        if (defense) return defense.id;
    }
    
    // 2. High-tier upgrade check
    const rail = choices.find(c => c.id === "rail_shells");
    if (rail) return rail.id;
    
    // 3. Offense check
    const offense = choices.find(c => c.id === "high_caliber" || c.id === "quick_reload" || c.id === "explosive_rounds");
    if (offense) return offense.id;
    
    // Default to first choice
    return choices[0].id;
}

function populateUpgradeChoices() {
    const listContainer = document.getElementById("upgradeList");
    listContainer.innerHTML = "";
    
    // Update current balance in the upgrade panel
    const balanceCoinsEl = document.getElementById("upgradePanelCoins");
    if (balanceCoinsEl) {
        balanceCoinsEl.textContent = profile.coins;
    }
    
    // Build 3 random upgrades the player qualifies for
    const pool = JSON.parse(JSON.stringify(UPGRADES));
    const choices = [];
    
    while (choices.length < 3 && pool.length > 0) {
        const idx = Math.floor(Math.random() * pool.length);
        const up = pool.splice(idx, 1)[0];
        
        // Qualification check
        const alreadyOwned = profile.unlocked_upgrades.includes(up.id);
        const reqsMet = up.requires.every(req => profile.unlocked_upgrades.includes(req));
        
        if (!alreadyOwned && reqsMet) {
            choices.push(up);
        }
    }
    
    // If no upgrades qualified, show a message
    if (choices.length === 0) {
        listContainer.innerHTML = "<p class='text-cyan'>لقد حصلت على جميع الترقيات الممكنة!</p>";
        return;
    }
    
    const recId = getSmartRecommendation(choices);
    
    choices.forEach(up => {
        const card = document.createElement("div");
        card.className = `upgrade-card rarity-${up.rarity || "common"}`;
        
        const cantAfford = profile.coins < up.cost;
        if (cantAfford) card.classList.add("disabled");
        
        const cat = getUpgradeCategory(up.id);
        const isRec = (up.id === recId);
        
        card.innerHTML = `
            ${isRec ? '<div class="rec-badge">⭐ موصى به ذكياً</div>' : ''}
            <span class="category-badge ${cat.class}">${cat.name}</span>
            <canvas class="upgrade-icon-canvas" width="48" height="48" style="background: rgba(16,24,35,0.45); border-radius:6px; border: 1px solid rgba(51,158,242,0.2); margin: 0 auto 10px auto; display: block; flex-shrink: 0;"></canvas>
            <h5>${up.name}</h5>
            <div class="cost">💰 ${up.cost}</div>
            <div class="stat-benefit">${up.benefit || ''}</div>
            <div class="desc">${up.description}</div>
        `;
        
        const canvasEl = card.querySelector(".upgrade-icon-canvas");
        drawUpgradeIcon(canvasEl, up.id);
        
        card.addEventListener("click", () => {
            if (cantAfford) {
                if (player) player.spawnFloatingText("تحتاج للمزيد من العملات!", "#f2334b");
                return;
            }
            
            // Deduct cost and unlock
            profile.coins -= up.cost;
            profile.unlocked_upgrades.push(up.id);
            saveProfile();
            recalculatePlayerStats();
            
            // Redraw panel to show changes
            populateUpgradeChoices();
            if (player) {
                player.configure(playerStats, "player", PLAYER_COLOR);
                player.spawnFloatingText("تمت الترقية! 🚀", "#33f276");
            }
        });
        
        listContainer.appendChild(card);
    });
}

// ==========================================
// HUD & SCREEEN VFX ACTIONS
// ==========================================
function updateHUD() {
    if (!stageInstance) return;
    document.getElementById("hudStage").textContent = `العملية: ${stageInstance.name}`;
    document.getElementById("hudCoins").textContent = `💰 ${profile.coins}`;
    
    if (player && player.alive) {
        const hpPct = Math.max(0, (player.hp / player.maxHp) * 100);
        document.getElementById("hpBar").style.width = `${hpPct}%`;
        document.getElementById("hpText").textContent = `${Math.floor(player.hp)} / ${Math.floor(player.maxHp)}`;
        
        if (player.shieldCapacity > 0) {
            document.getElementById("shieldContainer").style.display = "block";
            const shPct = Math.max(0, (player.shield / player.shieldCapacity) * 100);
            document.getElementById("shieldBar").style.width = `${shPct}%`;
            document.getElementById("shieldText").textContent = `${Math.floor(player.shield)} / ${Math.floor(player.shieldCapacity)}`;
        } else {
            document.getElementById("shieldContainer").style.display = "none";
        }

        // ---- WEAPON ENERGY/AMMO HUD BAR ----
        const ammoPct = Math.max(0, (player.ammo / player.maxAmmo) * 100);
        const ammoBar = document.getElementById("ammoBar");
        const ammoText = document.getElementById("ammoText");
        if (ammoBar && ammoText) {
            ammoBar.style.width = `${ammoPct}%`;
            if (player.isReloading) {
                ammoText.textContent = `⚠️ حرارة مرتفعة! إعادة شحن... (${Math.ceil(player.reloadTimer * 10) / 10}ث)`;
                ammoBar.style.background = "linear-gradient(90deg, #ef4444, #f87171)";
                ammoBar.style.boxShadow = "0 0 10px rgba(239, 68, 68, 0.8)";
            } else {
                ammoText.textContent = `${Math.floor(player.ammo)} / ${Math.floor(player.maxAmmo)}`;
                ammoBar.style.background = "linear-gradient(90deg, #f97316, #fb923c)";
                ammoBar.style.boxShadow = "0 0 10px rgba(249, 115, 22, 0.6)";
            }
        }
    }
    
    // ---- SUPER POWER HUD BAR ----
    const superContainer = document.getElementById("superContainer");
    const superBar = document.getElementById("superBar");
    const superText = document.getElementById("superText");
    const superBtnHint = document.getElementById("superBtnHint");
    
    if (profile.active_super) {
        superContainer.style.display = "block";
        const pct = Math.min(100, superPowerCharge);
        superBar.style.width = `${pct}%`;
        superText.textContent = `${Math.floor(pct)}%`;
        
        const mobSuperBtn = document.getElementById("mobileSuperBtn");
        if (pct >= 100 && !superPowerActive) {
            superBar.classList.add("super-charged");
            if (superBtnHint) superBtnHint.classList.remove("hide");
            if (mobSuperBtn && gameState === STATE.PLAYING) mobSuperBtn.classList.add("charged");
        } else {
            superBar.classList.remove("super-charged");
            if (superBtnHint) superBtnHint.classList.add("hide");
            if (mobSuperBtn) mobSuperBtn.classList.remove("charged");
        }
        
        if (isMobile && gameState === STATE.PLAYING && mobSuperBtn) {
            mobSuperBtn.classList.remove("hide");
        }
    } else {
        superContainer.style.display = "none";
        const mobSuperBtn = document.getElementById("mobileSuperBtn");
        if (mobSuperBtn) mobSuperBtn.classList.add("hide");
    }
    
    // Update active features HUD icons
    const activeFeatures = profile.unlocked_features || [];
    const featuresKey = activeFeatures.join(",");
    if (window.lastHudFeaturesKey !== featuresKey) {
        window.lastHudFeaturesKey = featuresKey;
        const listContainer = document.getElementById("hudFeaturesList");
        if (listContainer) {
            listContainer.innerHTML = "";
            activeFeatures.forEach(featId => {
                const feat = SHOP_FEATURES.find(f => f.id === featId);
                if (feat) {
                    const wrapper = document.createElement("div");
                    wrapper.className = "hud-feature-icon-wrapper";
                    wrapper.title = feat.name; // Tooltip with feature name in Arabic
                    
                    const canvas = document.createElement("canvas");
                    canvas.className = "hud-feature-icon-canvas";
                    canvas.width = 30;
                    canvas.height = 30;
                    
                    wrapper.appendChild(canvas);
                    listContainer.appendChild(wrapper);
                    
                    // Draw the icon dynamically
                    drawFeatureIcon(canvas, featId);
                }
            });
        }
    }
}

function showBossWarning() {
    const banner = document.getElementById("bossWarning");
    banner.classList.remove("hide");
    setTimeout(() => {
        banner.classList.add("hide");
    }, 3000);
}

function addShake(intensity) {
    shakeIntensity = Math.max(shakeIntensity, intensity);
}

function updateCamera(dt) {
    if (player && player.alive) {
        // Linear interpolation following player position
        camera.targetX = player.x;
        camera.targetY = player.y;
    } else {
        camera.targetX = 0;
        camera.targetY = 0;
    }
    
    camera.x += (camera.targetX - camera.x) * (1 - Math.exp(-6 * dt));
    camera.y += (camera.targetY - camera.y) * (1 - Math.exp(-6 * dt));
    
    // Apply shake offsets
    if (shakeIntensity > 0) {
        shakeIntensity = Math.max(0, shakeIntensity - shakeDecay * dt);
    }
}

// ==========================================
// MENU ACTIONS
// ==========================================
function enterMainMenu() {
    gameState = STATE.MAIN_MENU;
    document.getElementById("mainMenu").classList.remove("hide");
    document.getElementById("hud").classList.add("hide");
    document.getElementById("upgradePanel").classList.add("hide");
    document.getElementById("defeatPanel").classList.add("hide");
    document.getElementById("pausePanel").classList.add("hide");
    
    document.getElementById("mobilePauseBtn").classList.add("hide");
    document.getElementById("mobileSuperBtn").classList.add("hide");
    
    // Spawn player at center for menu presentation
    player = new TankEntity(0, 0, playerStats, "player", PLAYER_COLOR);
    player.velocity = { x: 0, y: 0 };
    player.moveInput = { x: 0, y: 0 };
    player.firePressed = false;
    enemies = [];
    projectiles = [];
    upSuperBlades = [];
    upSuperBladeWave = 0;
    upSuperWaveCooldown = 0;
    particles = [];
    floatingTexts = [];
    obstacles = [];
    napalmPuddles = [];
    coins = [];
    
    camera.x = 0;
    camera.y = 0;
    
    refreshMainMenuUI();
    populateShopUI();
    releaseGamePointerLock();
}

function getMilitaryRank(kills) {
    if (kills < 10) return "مجند مستجد";
    if (kills < 50) return "عريف مقاتل";
    if (kills < 150) return "رقيب مدرعات";
    if (kills < 350) return "ملازم سيبراني";
    if (kills < 700) return "نقيب مدرع";
    return "جنرال حرب سيبراني";
}

function refreshMainMenuUI() {
    document.getElementById("highestStage").textContent = profile.highest_stage;
    document.getElementById("savedCoins").textContent = `💰 ${profile.coins}`;
    triggerCoinPulse("savedCoins");
    document.getElementById("totalKills").textContent = profile.kills || 0;
    
    const upgradesCount = profile.unlocked_upgrades.length + (profile.unlocked_features || []).length + (profile.unlocked_supers || []).length;
    document.getElementById("savedUpgrades").textContent = `${upgradesCount} / 22`;
    
    const deployBtn = document.getElementById("deployBtn");
    if (deployBtn) {
        const deployText = deployBtn.querySelector(".deploy-text");
        if (deployText) {
            deployText.textContent = `🚀 بدء العملية ${profile.stage_index}`;
        } else {
            deployBtn.textContent = `🚀 بدء العملية ${profile.stage_index}`;
        }
    }
    
    const rankEl = document.getElementById("militaryRank");
    if (rankEl) {
        rankEl.textContent = getMilitaryRank(profile.kills || 0);
    }
    
    populateSuperPowersUI();
}

function syncCyberToggles() {
    document.querySelectorAll(".cyber-toggle").forEach(toggle => {
        const settingName = toggle.dataset.setting;
        const val = settings[settingName];
        toggle.querySelectorAll(".toggle-btn").forEach(btn => {
            if (btn.dataset.value === val) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });
    });
}

function initCyberToggles() {
    if (window.cyberMenuInitializedToggles) return;
    window.cyberMenuInitializedToggles = true;
    
    document.querySelectorAll(".cyber-toggle .toggle-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const toggle = btn.closest(".cyber-toggle");
            const settingName = toggle.dataset.setting;
            const value = btn.dataset.value;
            
            settings[settingName] = value;
            saveSettings();
            syncCyberToggles();
            
            let selectId = "";
            if (settingName === "aimMode") selectId = "settingAimMode";
            else if (settingName === "vfxQuality") selectId = "settingVfxQuality";
            else if (settingName === "sound") selectId = "settingSound";
            
            if (selectId) {
                const selectEl = document.getElementById(selectId);
                if (selectEl) {
                    selectEl.value = value;
                    selectEl.dispatchEvent(new Event("change"));
                }
            }
            
            playSynthSound("hit");
        });
    });
}

function initMenuTabs() {
    if (window.cyberMenuInitializedTabs) return;
    window.cyberMenuInitializedTabs = true;
    
    const tabButtons = document.querySelectorAll(".cyber-tab-btn");
    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.dataset.tab;
            if (!targetTab) return;
            
            playSynthSound("hit");
            
            tabButtons.forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".cyber-tab-panel").forEach(p => p.classList.remove("active"));
            
            btn.classList.add("active");
            const panel = document.getElementById(targetTab);
            if (panel) {
                panel.classList.add("active");
            }
        });
    });
}

function updateInstallButton() {
    const installBtn = document.getElementById("installAppBtn");
    if (!installBtn) return;
    installBtn.classList.remove("hide");
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (isStandalone) {
        installBtn.textContent = "مثبتة";
        installBtn.disabled = true;
        installBtn.title = "اللعبة تعمل كتطبيق مثبت.";
        return;
    }
    installBtn.disabled = false;
    installBtn.textContent = deferredInstallPrompt ? "تثبيت" : "تنزيل";
    installBtn.title = deferredInstallPrompt
        ? "تثبيت اللعبة كتطبيق على الجوال."
        : "عرض طريقة تثبيت اللعبة من المتصفح.";
}

function showInstallInstructions() {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const message = isIOS
        ? "لتثبيت اللعبة على iPhone: افتحها من Safari، اضغط مشاركة، ثم Add to Home Screen. بعد فتحها مرة واحدة من رابط HTTPS ستعمل بدون نت من الكاش."
        : "لتثبيت اللعبة على Android: افتحها من Chrome، اضغط قائمة الثلاث نقاط، ثم Install app أو Add to Home screen. بعد فتحها مرة واحدة من رابط HTTPS ستعمل بدون نت من الكاش.";
    alert(message);
}

window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    updateInstallButton();
});

window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    updateInstallButton();
});

let blueprintAngle = 0;
function drawBlueprintTank() {
    const canvas = document.getElementById("blueprintCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.fillStyle = "rgba(0, 10, 20, 0.6)";
    ctx.fillRect(0, 0, w, h);
    
    ctx.strokeStyle = "rgba(76, 214, 255, 0.08)";
    ctx.lineWidth = 1;
    const gridSize = 20;
    for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    
    ctx.strokeStyle = "rgba(76, 214, 255, 0.2)";
    ctx.beginPath();
    ctx.arc(w/2, h/2, 4, 0, Math.PI*2);
    ctx.stroke();
    
    const margin = 10;
    const length = 15;
    
    ctx.beginPath();
    ctx.moveTo(margin, margin + length);
    ctx.lineTo(margin, margin);
    ctx.lineTo(margin + length, margin);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(w - margin, margin + length);
    ctx.lineTo(w - margin, margin);
    ctx.lineTo(w - margin - length, margin);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(margin, h - margin - length);
    ctx.lineTo(margin, h - margin);
    ctx.lineTo(margin + length, h - margin);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(w - margin, h - margin - length);
    ctx.lineTo(w - margin, h - margin);
    ctx.lineTo(w - margin - length, h - margin);
    ctx.stroke();

    blueprintAngle += 0.015;
    
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(blueprintAngle);
    
    ctx.shadowColor = "#4cd6ff";
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "#4cd6ff";
    ctx.lineWidth = 2;
    
    ctx.strokeRect(-24, -30, 48, 60);
    
    ctx.strokeStyle = "rgba(76, 214, 255, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-32, -34, 8, 68);
    ctx.strokeRect(24, -34, 8, 68);
    
    for (let ty = -30; ty <= 30; ty += 12) {
        ctx.beginPath();
        ctx.moveTo(-32, ty);
        ctx.lineTo(-24, ty);
        ctx.moveTo(24, ty);
        ctx.lineTo(32, ty);
        ctx.stroke();
    }
    
    ctx.strokeStyle = "#4cd6ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.strokeRect(-4, -45, 8, 30);
    
    ctx.beginPath();
    ctx.moveTo(-6, -40);
    ctx.lineTo(6, -40);
    ctx.moveTo(-6, -30);
    ctx.lineTo(6, -30);
    ctx.stroke();
    
    ctx.fillStyle = "rgba(76, 214, 255, 0.2)";
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
    
    ctx.shadowBlur = 0;
    ctx.font = "8px 'Orbitron', monospace";
    ctx.fillStyle = "rgba(76, 214, 255, 0.7)";
    ctx.fillText("MODEL: T-900 CYBER", 16, h - 25);
    ctx.fillText("SYSTEM STABLE: 100%", 16, h - 14);
    
    if (Math.floor(Date.now() / 400) % 2 === 0) {
        ctx.fillStyle = "#33f276";
        ctx.fillText("● SCANNING...", w - 90, 22);
    }
}

document.getElementById("deployBtn").addEventListener("click", () => {
    startStage(profile.stage_index);
});

document.getElementById("resetDataBtn").addEventListener("click", () => {
    if (confirm("هل أنت متأكد من مسح جميع بيانات تقدم اللعبة؟")) {
        resetProfile();
        refreshMainMenuUI();
        if (player) player.configure(playerStats, "player", PLAYER_COLOR);
    }
});

const installAppBtn = document.getElementById("installAppBtn");
if (installAppBtn) {
    installAppBtn.addEventListener("click", async () => {
        if (!deferredInstallPrompt) {
            showInstallInstructions();
            return;
        }
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        updateInstallButton();
    });
}
updateInstallButton();

document.getElementById("nextStageBtn").addEventListener("click", () => {
    startStage(profile.stage_index);
});

document.getElementById("retryBtn").addEventListener("click", () => {
    startStage(profile.stage_index);
});

document.getElementById("resetCampaignBtn").addEventListener("click", () => {
    enterMainMenu();
});

document.getElementById("resumeBtn").addEventListener("click", () => {
    togglePause();
});

document.getElementById("pauseMainMenuBtn").addEventListener("click", () => {
    document.getElementById("pausePanel").classList.add("hide");
    enterMainMenu();
    playSynthSound("hit");
});

const autoAimBtn = document.getElementById("autoAimBtn");
autoAimBtn.addEventListener("click", () => {
    autoAim = !autoAim;
    autoAimBtn.textContent = `التصويب التلقائي: ${autoAim ? 'تفعيل' : 'إيقاف'}`;
    autoAimBtn.className = `game-btn mini-btn ${autoAim ? 'success-btn' : 'danger-btn'}`;
    if (player) player.autoAim = autoAim;
});

// Click on super bar container or hint button to activate super
const superContainerEl = document.getElementById("superContainer");
const superBtnHintEl = document.getElementById("superBtnHint");
if (superContainerEl) {
    superContainerEl.addEventListener("click", () => {
        if (gameState === STATE.PLAYING) activateSuperPower();
    });
    superContainerEl.style.cursor = "pointer";
}
if (superBtnHintEl) {
    superBtnHintEl.addEventListener("click", (e) => {
        e.stopPropagation();
        if (gameState === STATE.PLAYING) activateSuperPower();
    });
}

// Mobile Virtual Buttons event listeners
const mobilePauseBtnEl = document.getElementById("mobilePauseBtn");
const mobileSuperBtnEl = document.getElementById("mobileSuperBtn");
if (mobilePauseBtnEl) {
    mobilePauseBtnEl.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePause();
    });
    mobilePauseBtnEl.addEventListener("touchstart", (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePause();
    });
}
if (mobileSuperBtnEl) {
    mobileSuperBtnEl.addEventListener("click", (e) => {
        e.stopPropagation();
        if (gameState === STATE.PLAYING) activateSuperPower();
    });
    mobileSuperBtnEl.addEventListener("touchstart", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (gameState === STATE.PLAYING) activateSuperPower();
    });
}

// ==========================================
// LOOP DRAWING & GAME UPDATING
// ==========================================
window.gridGlowPulse = window.gridGlowPulse || 0;
window.gridDamagePulse = window.gridDamagePulse || 0;
window.shockwaves = window.shockwaves || [];

class Shockwave {
    constructor(x, y, maxRadius, duration, color = "#ffffff") {
        this.x = x;
        this.y = y;
        this.radius = 0;
        this.maxRadius = maxRadius;
        this.duration = duration;
        this.color = color;
        this.elapsed = 0;
        this.alive = true;
    }
    update(dt) {
        this.elapsed += dt;
        if (this.elapsed >= this.duration) {
            this.alive = false;
            return false;
        }
        this.radius = (this.elapsed / this.duration) * this.maxRadius;
        return true;
    }
    draw(ctx, camX, camY) {
        ctx.save();
        const progress = this.elapsed / this.duration;
        const alpha = 1.0 - progress;
        ctx.strokeStyle = this.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 3 * (1 - progress) + 0.5;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10 * (1 - progress);
        ctx.beginPath();
        ctx.arc(this.x - camX, this.y - camY, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}
window.Shockwave = Shockwave;

function drawGrid(ctx, camX, camY) {
    ctx.save();
    
    // Draw background color grid tiles
    ctx.fillStyle = "#0c0d12";
    ctx.fillRect(-arenaHalfSize - camX, -arenaHalfSize - camY, arenaHalfSize*2, arenaHalfSize*2);
    
    const glowVal = (window.gridGlowPulse || 0);
    const damageVal = (window.gridDamagePulse || 0);
    
    // Base grid color: dark slate blue. Mix cyan or red depending on pulse.
    let r = Math.floor(43 + damageVal * 150);
    let g = Math.floor(76 - damageVal * 40 + glowVal * 80);
    let b = Math.floor(115 - damageVal * 50 + glowVal * 120);
    let a = isMobile ? (0.35 + glowVal * 0.15 + damageVal * 0.25) : (0.22 + glowVal * 0.20 + damageVal * 0.30);
    
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
    ctx.lineWidth = isHighVfx() ? (1.0 + glowVal * 1.5 + damageVal * 2.0) : (isMobile ? 1.4 : 1.0);
    ctx.beginPath();
    
    // Cull vertical and horizontal lines outside visible viewport
    const z = viewZoom || 1;
    const visibleWidth = width / z;
    const visibleHeight = height / z;
    
    const startX = Math.max(-arenaHalfSize, Math.floor(camX / 60) * 60 - 60);
    const endX = Math.min(arenaHalfSize, Math.ceil((camX + visibleWidth) / 60) * 60 + 60);
    const startY = Math.max(-arenaHalfSize, Math.floor(camY / 60) * 60 - 60);
    const endY = Math.min(arenaHalfSize, Math.ceil((camY + visibleHeight) / 60) * 60 + 60);

    // Vertical grid lines inside viewport
    for (let x = startX; x <= endX; x += 60) {
        ctx.moveTo(x - camX, Math.max(-arenaHalfSize - camY, -60));
        ctx.lineTo(x - camX, Math.min(arenaHalfSize - camY, visibleHeight + 60));
    }
    
    // Horizontal grid lines inside viewport
    for (let y = startY; y <= endY; y += 60) {
        ctx.moveTo(Math.max(-arenaHalfSize - camX, -60), y - camY);
        ctx.lineTo(Math.min(arenaHalfSize - camX, visibleWidth + 60), y - camY);
    }
    ctx.stroke();
    
    // Draw glowing intersection points/crosses inside viewport for high quality and mobile
    if (isHighVfx() || isMobile) {
        const startX = Math.max(-arenaHalfSize, Math.floor(camX / 60) * 60 - 60);
        const endX = Math.min(arenaHalfSize, Math.ceil((camX + visibleWidth) / 60) * 60 + 60);
        const startY = Math.max(-arenaHalfSize, Math.floor(camY / 60) * 60 - 60);
        const endY = Math.min(arenaHalfSize, Math.ceil((camY + visibleHeight) / 60) * 60 + 60);
        
        ctx.fillStyle = isMobile ? `rgba(81, 158, 242, 0.28)` : `rgba(81, 158, 242, ${0.15 + glowVal * 0.35})`;
        for (let gx = startX; gx <= endX; gx += 60) {
            for (let gy = startY; gy <= endY; gy += 60) {
                ctx.fillRect(gx - camX - 1.5, gy - camY - 1.5, 3, 3);
            }
        }
    }
    
    // Draw cyber tactical origin/center circle
    ctx.strokeStyle = `rgba(51, ${158 + Math.floor(glowVal * 97)}, 242, ${0.35 + glowVal * 0.45})`;
    ctx.lineWidth = 1.5 + glowVal * 1.0;
    ctx.beginPath();
    ctx.arc(0 - camX, 0 - camY, 45, 0, Math.PI * 2);
    ctx.moveTo(-60 - camX, 0 - camY); ctx.lineTo(60 - camX, 0 - camY);
    ctx.moveTo(0 - camX, -60 - camY); ctx.lineTo(0 - camX, 60 - camY);
    ctx.stroke();
    
    // Draw solid 32px slate boundary walls
    const wallThickness = 32;
    ctx.fillStyle = "#1e293b"; // Slate metal body
    
    // Top Wall
    ctx.fillRect(-arenaHalfSize - wallThickness - camX, -arenaHalfSize - wallThickness - camY, arenaHalfSize * 2 + wallThickness * 2, wallThickness);
    // Bottom Wall
    ctx.fillRect(-arenaHalfSize - wallThickness - camX, arenaHalfSize - camY, arenaHalfSize * 2 + wallThickness * 2, wallThickness);
    // Left Wall
    ctx.fillRect(-arenaHalfSize - wallThickness - camX, -arenaHalfSize - camY, wallThickness, arenaHalfSize * 2);
    // Right Wall
    ctx.fillRect(arenaHalfSize - camX, -arenaHalfSize - camY, wallThickness, arenaHalfSize * 2);
    
    // Draw neon glows on the wall edges facing the arena
    ctx.strokeStyle = "#f2334b"; // Neon red glow
    ctx.lineWidth = 3.0;
    if (isHighVfx()) {
        ctx.shadowColor = "#f2334b";
        ctx.shadowBlur = 8;
    }
    
    ctx.beginPath();
    // Top inner edge
    ctx.moveTo(-arenaHalfSize - camX, -arenaHalfSize - camY);
    ctx.lineTo(arenaHalfSize - camX, -arenaHalfSize - camY);
    // Bottom inner edge
    ctx.moveTo(-arenaHalfSize - camX, arenaHalfSize - camY);
    ctx.lineTo(arenaHalfSize - camX, arenaHalfSize - camY);
    // Left inner edge
    ctx.moveTo(-arenaHalfSize - camX, -arenaHalfSize - camY);
    ctx.lineTo(-arenaHalfSize - camX, arenaHalfSize - camY);
    // Right inner edge
    ctx.moveTo(arenaHalfSize - camX, -arenaHalfSize - camY);
    ctx.lineTo(arenaHalfSize - camX, arenaHalfSize - camY);
    ctx.stroke();
    
    ctx.restore();
}

function drawJoysticks(ctx) {
    if (!isMobile) return;

    // --- LEFT JOYSTICK: Movement (Cyan/Blue Cyber Theme) ---
    ctx.save();
    const leftActive = joystickLeft.active;
    ctx.globalAlpha = leftActive ? 0.85 : 0.28;

    const leftCX = leftActive ? joystickLeft.startX : 110;
    const leftCY = leftActive ? joystickLeft.startY : height - 110;
    const leftKnobX = leftActive ? joystickLeft.x : leftCX;
    const leftKnobY = leftActive ? joystickLeft.y : leftCY;

    // Neon glow effect if active
    if (leftActive) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = "#339ef2";
    }

    // Outer ring base
    ctx.fillStyle = "rgba(10, 18, 30, 0.4)";
    ctx.strokeStyle = leftActive ? "#339ef2" : "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = leftActive ? 3.5 : 2;
    ctx.beginPath();
    ctx.arc(leftCX, leftCY, joyOuterRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Directional guidelines inside the base (D-pad style crosshairs)
    ctx.shadowBlur = 0; // reset glow for internal lines
    ctx.strokeStyle = leftActive ? "rgba(51, 158, 242, 0.45)" : "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // Horizontal line
    ctx.moveTo(leftCX - joyOuterRadius + 12, leftCY);
    ctx.lineTo(leftCX + joyOuterRadius - 12, leftCY);
    // Vertical line
    ctx.moveTo(leftCX, leftCY - joyOuterRadius + 12);
    ctx.lineTo(leftCX, leftCY + joyOuterRadius - 12);
    ctx.stroke();

    // Inner knob (the draggable part)
    if (leftActive) {
        ctx.shadowBlur = 8;
        ctx.shadowColor = "#339ef2";
    }
    ctx.fillStyle = leftActive ? "rgba(51, 158, 242, 0.9)" : "rgba(255, 255, 255, 0.45)";
    ctx.beginPath();
    ctx.arc(leftKnobX, leftKnobY, joyInnerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = leftActive ? "rgba(102, 180, 255, 0.75)" : "rgba(255, 255, 255, 0.25)";
    ctx.beginPath();
    ctx.arc(leftKnobX, leftKnobY, joyInnerRadius - 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();


    // --- RIGHT JOYSTICK: Aim & Shoot (Red/Orange Cyber Theme) ---
    ctx.save();
    const rightActive = joystickRight.active;
    ctx.globalAlpha = rightActive ? 0.85 : 0.28;

    const rightCX = rightActive ? joystickRight.startX : width - 110;
    const rightCY = rightActive ? joystickRight.startY : height - 110;
    const rightKnobX = rightActive ? joystickRight.x : rightCX;
    const rightKnobY = rightActive ? joystickRight.y : rightCY;

    // Neon glow effect if active
    if (rightActive) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = "#eb5757";
    }

    // Outer ring base
    ctx.fillStyle = "rgba(18, 10, 10, 0.4)";
    ctx.strokeStyle = rightActive ? "#eb5757" : "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = rightActive ? 3.5 : 2;
    ctx.beginPath();
    ctx.arc(rightCX, rightCY, joyOuterRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Concentric target reticle ring inside the base
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rightActive ? "rgba(235, 87, 87, 0.45)" : "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(rightCX, rightCY, joyOuterRadius * 0.55, 0, Math.PI * 2);
    ctx.stroke();

    // Concentric cross lines
    ctx.beginPath();
    ctx.moveTo(rightCX - 8, rightCY); ctx.lineTo(rightCX + 8, rightCY);
    ctx.moveTo(rightCX, rightCY - 8); ctx.lineTo(rightCX, rightCY + 8);
    ctx.stroke();

    // Inner knob (the draggable part)
    if (rightActive) {
        ctx.shadowBlur = 8;
        ctx.shadowColor = "#eb5757";
    }
    ctx.fillStyle = rightActive ? "rgba(235, 87, 87, 0.9)" : "rgba(255, 255, 255, 0.45)";
    ctx.beginPath();
    ctx.arc(rightKnobX, rightKnobY, joyInnerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = rightActive ? "rgba(255, 130, 130, 0.75)" : "rgba(255, 255, 255, 0.25)";
    ctx.beginPath();
    ctx.arc(rightKnobX, rightKnobY, joyInnerRadius - 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawAimReticle(ctx, camX, camY) {
    if (gameState !== STATE.PLAYING || !player || !player.alive) return;
    
    // Skip drawing custom reticle on touch inputs (joysticks render instead)
    if (joystickLeft.active || joystickRight.active) return;
    
    const maxRange = playerStats.projectile_range || 1100;
    const px = player.x - camX;
    const py = player.y - camY;
    
    const mx = mousePos.x;
    const my = mousePos.y;
    
    const dx = mx - (width / 2);
    const dy = my - (height / 2);
    const dist = Math.hypot(dx, dy);
    
    const aimLen = Math.min(dist, maxRange);
    const angle = Math.atan2(dy, dx);
    const retX = player.x + Math.cos(angle) * aimLen;
    const retY = player.y + Math.sin(angle) * aimLen;
    
    ctx.save();
    ctx.strokeStyle = "rgba(51, 158, 242, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    
    // Draw aiming dotted line
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(retX - camX, retY - camY);
    ctx.stroke();
    
    // Draw target reticle crosshair
    ctx.restore();
    
    const timeSinceHit = performance.now() - (window.lastHitTime || 0);
    const isFlashing = timeSinceHit < 200;
    
    ctx.save();
    ctx.translate(retX - camX, retY - camY);
    
    // Standard crosshair ring (flashes red-orange on hit)
    ctx.strokeStyle = isFlashing ? "rgba(242, 51, 75, 0.95)" : "rgba(51, 158, 242, 0.8)";
    ctx.lineWidth = isFlashing ? 3 : 2;
    const retRadius = isFlashing ? 13 : 8;
    ctx.beginPath();
    ctx.arc(0, 0, retRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    // If flashing, draw 4 diagonal hitmarker ticks (Brawl Stars / Shooter hit indicator style)
    if (isFlashing) {
        ctx.strokeStyle = "rgba(242, 51, 75, 0.9)";
        ctx.lineWidth = 2.5;
        for (let a = 0; a < 4; a++) {
            const rot = (Math.PI / 4) + a * (Math.PI / 2);
            ctx.beginPath();
            ctx.moveTo(Math.cos(rot) * 6, Math.sin(rot) * 6);
            ctx.lineTo(Math.cos(rot) * 15, Math.sin(rot) * 15);
            ctx.stroke();
        }
    }
    
    // Center point
    ctx.fillStyle = isFlashing ? "rgba(242, 51, 75, 0.95)" : "rgba(51, 158, 242, 0.8)";
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function resolveTankCollisions() {
    const allTanks = [];
    if (player && player.alive) allTanks.push(player);
    enemies.forEach(e => { if (e.alive) allTanks.push(e); });
    
    for (let i = 0; i < allTanks.length; i++) {
        for (let j = i + 1; j < allTanks.length; j++) {
            const t1 = allTanks[i];
            const t2 = allTanks[j];
            
            const r1 = t1.aiArchetype === "boss" ? 37 : 22;
            const r2 = t2.aiArchetype === "boss" ? 37 : 22;
            const minDist = r1 + r2;
            
            const dx = t1.x - t2.x;
            const dy = t1.y - t2.y;
            const dist = Math.hypot(dx, dy);
            
            if (dist < minDist) {
                const overlap = minDist - dist;
                let pushX = 1;
                let pushY = 0;
                if (dist > 0.01) {
                    pushX = dx / dist;
                    pushY = dy / dist;
                } else {
                    const angle = Math.random() * Math.PI * 2;
                    pushX = Math.cos(angle);
                    pushY = Math.sin(angle);
                }
                
                // Push apart by half the overlap
                t1.x += pushX * (overlap * 0.5);
                t1.y += pushY * (overlap * 0.5);
                
                t2.x -= pushX * (overlap * 0.5);
                t2.y -= pushY * (overlap * 0.5);
                
                // Damp velocities and add an elastic bounce force to prevent sticking
                const dot1 = t1.vx * pushX + t1.vy * pushY;
                const dot2 = t2.vx * pushX + t2.vy * pushY;
                
                if (dot1 < 0) {
                    t1.vx -= dot1 * pushX * 0.8;
                    t1.vy -= dot1 * pushY * 0.8;
                }
                if (dot2 > 0) {
                    t2.vx -= dot2 * pushX * 0.8;
                    t2.vy -= dot2 * pushY * 0.8;
                }
                
                // Add minor elastic recoil impulse
                const recoil = 35;
                t1.vx += pushX * recoil;
                t1.vy += pushY * recoil;
                t2.vx -= pushX * recoil;
                t2.vy -= pushY * recoil;
            }
        }
    }
}

function gameLoop(time) {
    const dt = Math.min(0.1, (time - lastTime) / 1000);
    lastTime = time;
    
    // Clear screen
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, width, height);
    
    // 1. Process Update Physics
    if (gameState === STATE.PLAYING) {
        processWaveSpawning(dt);
        
        // Handle desktop player movement input
        let moveX = 0;
        let moveY = 0;
        if (keys["w"] || keys["keyw"] || keys["arrowup"]) moveY = -1;
        if (keys["s"] || keys["keys"] || keys["arrowdown"]) moveY = 1;
        if (keys["a"] || keys["keya"] || keys["arrowleft"]) moveX = -1;
        if (keys["d"] || keys["keyd"] || keys["arrowright"]) moveX = 1;
        
        if (joystickLeft.active) {
            player.moveInput.x = joystickLeft.moveX;
            player.moveInput.y = joystickLeft.moveY;
        } else {
            player.moveInput.x = moveX;
            player.moveInput.y = moveY;
        }
        
        // Handle aiming and firing
        if (isMobile) {
            if (joystickRight.active) {
                // If dragged significantly, use manual aim. Otherwise, use auto-aim (0, 0)
                const dragDist = Math.hypot(joystickRight.aimX, joystickRight.aimY);
                if (dragDist > 0.22) {
                    player.aimInput.x = joystickRight.aimX;
                    player.aimInput.y = joystickRight.aimY;
                } else {
                    player.aimInput.x = 0;
                    player.aimInput.y = 0;
                }
                player.firePressed = joystickRight.isFiring;
            } else {
                player.aimInput.x = 0;
                player.aimInput.y = 0;
                player.firePressed = false;
            }
        } else {
            if (joystickRight.active) {
                player.aimInput.x = joystickRight.aimX;
                player.aimInput.y = joystickRight.aimY;
                player.firePressed = joystickRight.isFiring;
            } else {
                // Mouse controls
                const dx = mousePos.x - (width / 2);
                const dy = mousePos.y - (height / 2);
                player.aimInput.x = dx;
                player.aimInput.y = dy;
                player.firePressed = isMouseDown || keys[" "];
            }
        }
        
        player.autoAim = autoAim;
    } 
    else if (gameState === STATE.MAIN_MENU && player) {
        // On menu, rotate turret to look at mouse
        const dx = mousePos.x - (width / 2);
        const dy = mousePos.y - (height / 2);
        player.aimInput.x = dx;
        player.aimInput.y = dy;
        player.moveInput = { x: 0, y: 0 };
        player.firePressed = false;
    }
    
    // 1b. Update Entities (freeze when paused in upgrades/defeat/pause state)
    const isPaused = (gameState === STATE.UPGRADE || gameState === STATE.DEFEAT || gameState === STATE.PAUSED);
    
    if (!isPaused) {
        // Decay grid pulses
        window.gridGlowPulse = Math.max(0, (window.gridGlowPulse || 0) - dt * 2.2);
        window.gridDamagePulse = Math.max(0, (window.gridDamagePulse || 0) - dt * 2.2);
        
        // Update shockwaves
        if (window.shockwaves) {
            for (let i = window.shockwaves.length - 1; i >= 0; i--) {
                const active = window.shockwaves[i].update(dt);
                if (!active) window.shockwaves.splice(i, 1);
            }
        }
        
        // ---- SUPER POWER DURATION DECAY ----
        if (superPowerActive) {
            activeSuperPowerDuration -= dt;
            if (activeSuperPowerDuration <= 0) {
                activeSuperPowerDuration = 0;
                superPowerActive = false;
                superPowerCharge = 0;
                if (player) player.spawnFloatingText("انتهى السوبر! 🔋", "#facc15");
                playSynthSound("shield");
            }
        }
        
        // ---- STORM THUNDERSTORM UPDATE ----
        if (superPowerActive && profile.active_super === "super_storm" && gameState === STATE.PLAYING) {
            updateThunderstorm(dt);
        }
        updateUpSuper(dt);
        // Decay lightning bolts age
        if (window.activeLightningBolts) {
            for (let i = window.activeLightningBolts.length - 1; i >= 0; i--) {
                window.activeLightningBolts[i].age += dt;
                if (window.activeLightningBolts[i].age >= window.activeLightningBolts[i].lifetime) {
                    window.activeLightningBolts.splice(i, 1);
                }
            }
        }

        // Enforce entity caps to prevent performance decay
        const particleCap = isMobile ? 42 : 120;
        const projectileCap = isMobile ? 58 : 80;
        const floatingTextCap = isMobile ? 8 : 20;
        const shockwaveCap = isMobile ? 4 : 12;
        const lightningCap = isMobile ? 5 : 14;
        if (particles.length > particleCap) {
            particles.splice(0, particles.length - particleCap);
        }
        if (projectiles.length > projectileCap) {
            projectiles.splice(0, projectiles.length - projectileCap);
        }
        if (floatingTexts.length > floatingTextCap) {
            floatingTexts.splice(0, floatingTexts.length - floatingTextCap);
        }
        if (window.shockwaves && window.shockwaves.length > shockwaveCap) {
            window.shockwaves.splice(0, window.shockwaves.length - shockwaveCap);
        }
        if (window.activeLightningBolts && window.activeLightningBolts.length > lightningCap) {
            window.activeLightningBolts.splice(0, window.activeLightningBolts.length - lightningCap);
        }
        
        // Update player
        if (player) {
            player.update(dt);
        }
        
        // Update enemies (slowed down by 90% during super_chronos)
        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemyDt = (superPowerActive && profile.active_super === "super_chronos") ? dt * 0.1 : dt;
            enemies[i].update(enemyDt);
        }
        
        // Resolve tank overlapping collisions
        resolveTankCollisions();
        
        // Re-clamp all active tanks inside boundaries after collisions push them
        if (player && player.alive) player.clampToArena();
        enemies.forEach(e => { if (e.alive) e.clampToArena(); });
        
        // Update projectiles (enemy projectiles slowed down by 90% during super_chronos)
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const proj = projectiles[i];
            const projDt = (superPowerActive && profile.active_super === "super_chronos" && proj.team === "enemy") ? dt * 0.1 : dt;
            const active = proj.update(projDt);
            if (!active) projectiles.splice(i, 1);
        }
        
        // ---- HYPER LASER UPDATE (deal continuous damage to enemies in beam) ----
        if (superPowerActive && profile.active_super === "super_laser" && player && player.alive && gameState === STATE.PLAYING) {
            const turretAngle = player.turretAngle;
            const laserRange = 1200;
            const lx1 = player.x + Math.cos(turretAngle) * 22;
            const ly1 = player.y + Math.sin(turretAngle) * 22;
            const lx2 = player.x + Math.cos(turretAngle) * laserRange;
            const ly2 = player.y + Math.sin(turretAngle) * laserRange;
            const laserRadius = 14;
            const laserDamagePerSec = playerStats.damage * 8;
            
            enemies.forEach(enemy => {
                if (!enemy.alive) return;
                const dist = distToSegment(enemy.x, enemy.y, lx1, ly1, lx2, ly2);
                if (dist < laserRadius + 22) {
                    enemy.takeDamage(laserDamagePerSec * dt, "player");
                    // Slow effect
                    enemy.speedMultiplier = Math.max(0.2, (enemy.speedMultiplier || 1.0) - dt * 1.2);
                    if (Math.random() < 0.04) spawnExplosion(enemy.x, enemy.y, "#ffd700", 3, 0.18);
                }
            });
        }
        
        // Update particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const active = particles[i].update(dt);
            if (!active) particles.splice(i, 1);
        }
        
        // Update floating texts
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            const active = floatingTexts[i].update(dt);
            if (!active) floatingTexts.splice(i, 1);
        }
        
        // Update napalm puddles
        for (let i = napalmPuddles.length - 1; i >= 0; i--) {
            const active = napalmPuddles[i].update(dt);
            if (!active) napalmPuddles.splice(i, 1);
        }
        
        // Update coins
        for (let i = coins.length - 1; i >= 0; i--) {
            const active = coins[i].update(dt);
            if (!active) coins.splice(i, 1);
        }
        
        // Update teleport pads
        teleportPads.forEach(pad => pad.update(dt));
        
        // Check Teleportation and Speed Boosters for tanks
        const allActiveTanks = [];
        if (player && player.alive) allActiveTanks.push(player);
        enemies.forEach(e => { if (e.alive) allActiveTanks.push(e); });
        
        allActiveTanks.forEach(tank => {
            // Check Teleport Pad warp
            teleportPads.forEach(pad => {
                const padCooldown = pad.cooldowns.get(tank) || 0;
                if (padCooldown <= 0) {
                    const distToPad = Math.hypot(tank.x - pad.x, tank.y - pad.y);
                    if (distToPad < pad.radius + 5) {
                        tank.x = pad.targetX;
                        tank.y = pad.targetY;
                        
                        const otherPad = teleportPads.find(p => p !== pad && p.targetX === pad.x && p.targetY === pad.y);
                        pad.cooldowns.set(tank, 4.0);
                        if (otherPad) {
                            otherPad.cooldowns.set(tank, 4.0);
                        }
                        
                        spawnExplosion(pad.x, pad.y, pad.color, 12, 0.4);
                        spawnExplosion(pad.targetX, pad.targetY, pad.color, 12, 0.4);
                        
                        if (window.shockwaves) {
                            window.shockwaves.push(new Shockwave(pad.x, pad.y, 80, 0.35, pad.color));
                            window.shockwaves.push(new Shockwave(pad.targetX, pad.targetY, 80, 0.35, pad.color));
                        }
                        
                        playSynthSound("nuclear");
                        tank.spawnFloatingText("🌀 انتقال كمي!", pad.color);
                    }
                }
            });
            
            // Check Speed Booster Pad speedup
            speedPads.forEach(pad => {
                const distToSpeedPad = Math.hypot(tank.x - pad.x, tank.y - pad.y);
                if (distToSpeedPad < 32) {
                    if (!(tank.boostTimer > 0)) {
                        tank.spawnFloatingText("⚡ اندفاع!", "#eab308");
                    }
                    tank.boostTimer = 1.5;
                    tank.boostAngle = pad.angle;
                    
                    if (Math.random() < 0.15) {
                        particles.push(new SmokeParticle(tank.x, tank.y, pad.color, 3.0, 0.2));
                    }
                }
            });
        });
    }
    
    // Camera Tracking
    updateCamera(dt);
    
    // Shake camera offsets
    let curCamX = camera.x;
    let curCamY = camera.y;
    if (shakeIntensity > 0) {
        curCamX += (Math.random() - 0.5) * shakeIntensity * 2;
        curCamY += (Math.random() - 0.5) * shakeIntensity * 2;
    }
    
    const z = viewZoom || 1;
    const viewportCenterX = curCamX - (width / (2 * z));
    const viewportCenterY = curCamY - (height / (2 * z));
    
    // 2. Process DRAWING
    ctx.save();
    ctx.scale(z, z);
    drawGrid(ctx, viewportCenterX, viewportCenterY);
    
    // Draw speed booster pads
    speedPads.forEach(pad => pad.draw(ctx, viewportCenterX, viewportCenterY));
    
    // Draw teleport pads
    teleportPads.forEach(pad => pad.draw(ctx, viewportCenterX, viewportCenterY));
    
    // Draw napalm puddles on the ground below tanks/projectiles
    napalmPuddles.forEach(p => p.draw(ctx, viewportCenterX, viewportCenterY));
    
    // Draw shockwaves on the ground
    if (window.shockwaves) {
        window.shockwaves.forEach(s => s.draw(ctx, viewportCenterX, viewportCenterY));
    }
    
    // Draw obstacles
    obstacles.forEach(obs => obs.draw(ctx, viewportCenterX, viewportCenterY));
    
    // Draw coins
    coins.forEach(c => c.draw(ctx, viewportCenterX, viewportCenterY));
    
    // Sort rendering by Y position (tanks and projectiles)
    const renderQueue = window.renderQueue || [];
    renderQueue.length = 0;
    window.renderQueue = renderQueue;
    
    if (player && player.alive) renderQueue.push(player);
    enemies.forEach(e => { if (e.alive) renderQueue.push(e); });
    projectiles.forEach(p => renderQueue.push(p));
    upSuperBlades.forEach(b => renderQueue.push(b));
    
    renderQueue.sort((a, b) => a.y - b.y);
    
    renderQueue.forEach(item => {
        item.draw(ctx, viewportCenterX, viewportCenterY);
    });
    
    // Draw particles
    particles.forEach(p => p.draw(ctx, viewportCenterX, viewportCenterY));
    
    // ---- DRAW HYPER LASER BEAM ----
    if (superPowerActive && profile.active_super === "super_laser" && player && player.alive) {
        const turretAngle = player.turretAngle;
        const laserRange = 1200;
        const lx1 = player.x - viewportCenterX + Math.cos(turretAngle) * 22;
        const ly1 = player.y - viewportCenterY + Math.sin(turretAngle) * 22;
        const lx2 = player.x - viewportCenterX + Math.cos(turretAngle) * laserRange;
        const ly2 = player.y - viewportCenterY + Math.sin(turretAngle) * laserRange;
        const timeNow = performance.now() / 1000;
        
        ctx.save();
        const beamGlow = isMobile ? 0 : 1;
        // Outer glow beam (wide, golden)
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 28 * beamGlow;
        ctx.strokeStyle = "rgba(255, 200, 0, 0.45)";
        ctx.lineWidth = 18 + Math.sin(timeNow * 12) * 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(lx1, ly1);
        ctx.lineTo(lx2, ly2);
        ctx.stroke();
        
        // Mid beam (amber)
        ctx.shadowBlur = 14 * beamGlow;
        ctx.strokeStyle = "rgba(255, 170, 20, 0.85)";
        ctx.lineWidth = 8 + Math.sin(timeNow * 14) * 1.5;
        ctx.beginPath();
        ctx.moveTo(lx1, ly1);
        ctx.lineTo(lx2, ly2);
        ctx.stroke();
        
        // Core white beam (sharp center)
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 8 * beamGlow;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(lx1, ly1);
        ctx.lineTo(lx2, ly2);
        ctx.stroke();
        
        // Muzzle flash burst circle
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 20 * beamGlow;
        ctx.fillStyle = "rgba(255, 215, 0, 0.8)";
        ctx.beginPath();
        ctx.arc(lx1, ly1, 8 + Math.sin(timeNow * 20) * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    
    // ---- DRAW STORM LIGHTNING BOLTS ----
    if (window.activeLightningBolts && window.activeLightningBolts.length > 0) {
        ctx.save();
        window.activeLightningBolts.forEach(bolt => {
            const alpha = Math.max(0, 1 - bolt.age / bolt.lifetime);
            ctx.globalAlpha = alpha;
            ctx.shadowColor = "#06b6d4";
            ctx.shadowBlur = isMobile ? 0 : 22;
            ctx.strokeStyle = "#06b6d4";
            ctx.lineWidth = 3;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            bolt.points.forEach((pt, idx) => {
                const sx = pt.x - viewportCenterX;
                const sy = pt.y - viewportCenterY;
                if (idx === 0) ctx.moveTo(sx, sy);
                else ctx.lineTo(sx, sy);
            });
            ctx.stroke();
            // White core
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.lineWidth = 1.2;
            ctx.shadowBlur = isMobile ? 0 : 8;
            ctx.beginPath();
            bolt.points.forEach((pt, idx) => {
                const sx = pt.x - viewportCenterX;
                const sy = pt.y - viewportCenterY;
                if (idx === 0) ctx.moveTo(sx, sy);
                else ctx.lineTo(sx, sy);
            });
            ctx.stroke();
        });
        ctx.globalAlpha = 1;
        ctx.restore();
    }
    
    // Draw floating text labels
    floatingTexts.forEach(ft => ft.draw(ctx, viewportCenterX, viewportCenterY));
    
    // Draw custom aiming crosshair reticle
    drawAimReticle(ctx, viewportCenterX, viewportCenterY);
    
    // Draw touch screen joypads overlay
    ctx.restore();
    drawJoysticks(ctx);
    
    // Live update HUD bars
    if (gameState === STATE.PLAYING) {
        updateHUD();
    }
    
    // Draw blueprint tank in main menu
    if (gameState === STATE.MAIN_MENU) {
        drawBlueprintTank();
    }
    
    requestAnimationFrame(gameLoop);
}

// Web Audio API Sound Synthesizer
let audioCtx = null;

let lastSoundTimes = {};
function playSynthSound(type) {
    if (settings.sound !== "on") return;
    
    // Throttling to prevent annoying repetitive sound stack-ups
    const nowTime = performance.now();
    if (lastSoundTimes[type] && nowTime - lastSoundTimes[type] < 45) {
        return; // skip playing this sound
    }
    lastSoundTimes[type] = nowTime;
    
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }
        
        const now = audioCtx.currentTime;
        
        // Pitch variation (+/- 7.5%) for organic and dynamic feel
        const pitchVar = 1 + (Math.random() - 0.5) * 0.15;
        
        if (type === "shoot") {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.type = "sine";
            osc.frequency.setValueAtTime(450 * pitchVar, now);
            osc.frequency.exponentialRampToValueAtTime(100 * pitchVar, now + 0.12);
            
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.005, now + 0.12);
            
            osc.start(now);
            osc.stop(now + 0.12);
        } 
        else if (type === "hit") {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.type = "triangle";
            osc.frequency.setValueAtTime(220 * pitchVar, now);
            osc.frequency.linearRampToValueAtTime(80 * pitchVar, now + 0.05);
            
            gain.gain.setValueAtTime(0.06, now);
            gain.gain.exponentialRampToValueAtTime(0.005, now + 0.05);
            
            osc.start(now);
            osc.stop(now + 0.05);
        } 
        else if (type === "explosion") {
            // White noise buffer for realistic crunchy explosion
            const sampleRate = audioCtx.sampleRate;
            const bufferSize = sampleRate * 0.4;
            const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            
            const noiseSource = audioCtx.createBufferSource();
            noiseSource.buffer = buffer;
            
            const filter = audioCtx.createBiquadFilter();
            filter.type = "lowpass";
            filter.frequency.setValueAtTime(220 * pitchVar, now);
            filter.frequency.exponentialRampToValueAtTime(10 * pitchVar, now + 0.35);
            
            const gainNode = audioCtx.createGain();
            gainNode.gain.setValueAtTime(0.20, now);
            gainNode.gain.exponentialRampToValueAtTime(0.005, now + 0.35);
            
            noiseSource.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            noiseSource.start(now);
            noiseSource.stop(now + 0.35);
        }
        else if (type === "coin") {
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            osc.type = "sine";
            osc.frequency.setValueAtTime(880 * pitchVar, now);
            osc.frequency.exponentialRampToValueAtTime(1200 * pitchVar, now + 0.08); // rising chime
            
            gainNode.gain.setValueAtTime(0.07, now);
            gainNode.gain.exponentialRampToValueAtTime(0.005, now + 0.15);
            
            osc.start(now);
            osc.stop(now + 0.15);
        }
        else if (type === "nuclear") {
            // Long, deep white noise rumble for gravity singularity explosion
            const sampleRate = audioCtx.sampleRate;
            const bufferSize = sampleRate * 0.8;
            const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            
            const noiseSource = audioCtx.createBufferSource();
            noiseSource.buffer = buffer;
            
            const filter = audioCtx.createBiquadFilter();
            filter.type = "lowpass";
            filter.frequency.setValueAtTime(160, now);
            filter.frequency.linearRampToValueAtTime(10, now + 0.75);
            
            const gainNode = audioCtx.createGain();
            gainNode.gain.setValueAtTime(0.35, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
            
            noiseSource.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            noiseSource.start(now);
            noiseSource.stop(now + 0.75);
        }
    } catch (e) {
        console.error("Audio synth error:", e);
    }
}

function renderGameToText() {
    const aliveEnemies = enemies.filter((enemy) => enemy && enemy.alive);
    const payload = {
        coordinateSystem: "origin=center, +x=right, +y=down",
        mode: gameState,
        stage: stageInstance ? {
            id: stageInstance.stage_id,
            name: stageInstance.name,
            index: stageInstance.stage_index,
            wave: stageInstance.wave_index,
            waveCount: stageInstance.waves.length,
            targetKills: window.targetKills || 0
        } : null,
        profile: {
            coins: profile.coins,
            stage_index: profile.stage_index,
            highest_stage: profile.highest_stage,
            active_super: profile.active_super || null
        },
        player: player ? {
            x: Math.round(player.x),
            y: Math.round(player.y),
            hp: Math.round(player.hp),
            maxHp: Math.round(player.maxHp),
            shield: Math.round(player.shield || 0),
            shieldCapacity: Math.round(player.shieldCapacity || 0),
            ammo: Math.round(player.ammo || 0),
            maxAmmo: Math.round(player.maxAmmo || 0),
            alive: !!player.alive
        } : null,
        counts: {
            enemies: aliveEnemies.length,
            projectiles: projectiles.length,
            upSuperBlades: upSuperBlades.length,
            coins: coins.length
        },
        super: {
            charge: Math.round(superPowerCharge),
            active: superPowerActive
        }
    };
    return JSON.stringify(payload);
}
window.render_game_to_text = renderGameToText;

// Connect UI Settings Listeners
document.getElementById("settingAimMode").addEventListener("change", (e) => {
    settings.aimMode = e.target.value;
    autoAim = (settings.aimMode === "auto");
    if (player) player.autoAim = autoAim;
    saveSettings();
});

document.getElementById("settingVfxQuality").addEventListener("change", (e) => {
    settings.vfxQuality = e.target.value;
    saveSettings();
});

document.getElementById("settingSound").addEventListener("change", (e) => {
    settings.sound = e.target.value;
    saveSettings();
});

// Initialise profile details on startup
loadProfile();
enterMainMenu();
requestAnimationFrame(gameLoop);
