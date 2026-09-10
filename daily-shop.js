/* =========================================================
   مرغ‌دونی — فروشگاه + جایزه روزانه
   نسخه پایدار
   ========================================================= */
(() => {
  "use strict";

  const SHOP_STATE_KEY = "morgdoni_shop_v4";
  const ACCOUNT_KEY = "md_accountId";

  const ITEMS = [
    {
      id: "frame_gold",
      name: "قاب طلایی",
      price: 500,
      icon: "🟨",
      description: "قاب ویژه برای پروفایل"
    },
    {
      id: "back_chicken",
      name: "پشت کارت مرغی",
      price: 350,
      icon: "🐔",
      description: "پشت کارت مخصوص مرغ‌دونی"
    },
    {
      id: "effect_fire",
      name: "افکت برد آتشین",
      price: 700,
      icon: "🔥",
      description: "افکت ویژه هنگام برد"
    },
    {
      id: "avatar_fox",
      name: "آواتار روباه",
      price: 250,
      icon: "🦊",
      description: "آواتار روباه"
    },
    {
      id: "avatar_rooster",
      name: "آواتار خروس طلایی",
      price: 400,
      icon: "🐓",
      description: "آواتار خروس طلایی"
    },
    {
      id: "emote_party",
      name: "واکنش جشن",
      price: 150,
      icon: "🎉",
      description: "واکنش ویژه داخل بازی"
    }
  ];

  function getSocket() {
    return window.__MORG_SOCKET__ ||
           window.socket ||
           null;
  }

  function getAccountId() {
    try {
      return localStorage.getItem(ACCOUNT_KEY) ||
             window.accountId ||
             getSocket()?.accountId ||
             "";
    } catch (_) {
      return window.accountId || "";
    }
  }

  function loadLocalState() {
    try {
      const raw = localStorage.getItem(SHOP_STATE_KEY);
      if (!raw) {
        return {
          coins: 0,
          streak: 0,
          lastDaily: "",
          inventory: []
        };
      }

      const data = JSON.parse(raw);

      return {
        coins: Number(data.coins) || 0,
        streak: Number(data.streak) || 0,
        lastDaily: data.lastDaily || "",
        inventory: Array.isArray(data.inventory)
          ? data.inventory
          : []
      };
    } catch (_) {
      return {
        coins: 0,
        streak: 0,
        lastDaily: "",
        inventory: []
      };
    }
  }

  function saveLocalState(state) {
    try {
      localStorage.setItem(
        SHOP_STATE_KEY,
        JSON.stringify(state)
      );
    } catch (_) {}
  }

  let state = loadLocalState();

  function todayKey() {
    const d = new Date();

    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0")
    ].join("-");
  }

  function yesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);

    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0")
    ].join("-");
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function message(text) {
    const el = document.getElementById("md-shop-message");

    if (!el) return;

    el.textContent = text || "";
  }

  function ensureStyle() {
    if (document.getElementById("md-shop-style")) return;

    const style = document.createElement("style");
    style.id = "md-shop-style";

    style.textContent = `
      #md-shop-btn {
        cursor:pointer;
      }

      #md-shop {
        position:fixed;
        inset:0;
        z-index:999999;
        display:none;
        align-items:center;
        justify-content:center;
        background:rgba(0,0,0,.65);
        direction:rtl;
        font-family:Tahoma,Arial,sans-serif;
      }

      #md-shop.on {
        display:flex;
      }

      #md-shop-box {
        width:min(94vw,620px);
        max-height:90vh;
        overflow:auto;
        background:#fff;
        color:#222;
        border-radius:22px;
        box-shadow:0 20px 70px rgba(0,0,0,.35);
        padding:20px;
      }

      #md-shop-head {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-bottom:14px;
      }

      #md-shop-head h2 {
        margin:0;
        font-size:24px;
      }

      #md-shop-close {
        border:0;
        background:#eee;
        border-radius:50%;
        width:38px;
        height:38px;
        cursor:pointer;
        font-size:20px;
      }

      #md-shop-coins {
        background:#fff7d6;
        border-radius:14px;
        padding:12px 16px;
        margin-bottom:14px;
        font-size:18px;
        font-weight:bold;
        text-align:center;
      }

      #md-daily-card {
        border:2px solid #f0c94b;
        border-radius:18px;
        padding:16px;
        margin-bottom:18px;
        background:#fffdf4;
      }

      #md-daily-card h3 {
        margin:0 0 8px;
      }

      #md-claim {
        width:100%;
        border:0;
        border-radius:12px;
        padding:13px;
        background:#f2c94c;
        color:#222;
        font-weight:bold;
        cursor:pointer;
        font-size:16px;
      }

      #md-claim:disabled {
        opacity:.55;
        cursor:not-allowed;
      }

      #md-shop-message {
        min-height:24px;
        margin-top:9px;
        text-align:center;
        font-weight:bold;
      }

      #md-shop-items {
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
        gap:12px;
      }

      .md-shop-item {
        border:1px solid #ddd;
        border-radius:16px;
        padding:14px;
        background:#fafafa;
      }

      .md-shop-icon {
        font-size:34px;
      }

      .md-shop-name {
        font-weight:bold;
        margin-top:6px;
      }

      .md-shop-desc {
        font-size:12px;
        color:#666;
        margin:6px 0 10px;
        min-height:30px;
      }

      .md-shop-price {
        font-weight:bold;
        margin-bottom:8px;
      }

      .md-buy {
        width:100%;
        border:0;
        border-radius:10px;
        padding:10px;
        cursor:pointer;
        background:#222;
        color:#fff;
      }

      .md-buy:disabled {
        opacity:.45;
        cursor:not-allowed;
      }
    `;

    document.head.appendChild(style);
  }

  function build() {
    ensureStyle();

    if (document.getElementById("md-shop")) {
      render();
      return;
    }

    const modal = document.createElement("div");
    modal.id = "md-shop";

    modal.innerHTML = `
      <div id="md-shop-box">

        <div id="md-shop-head">
          <h2>🛒 فروشگاه مرغ‌دونی</h2>
          <button id="md-shop-close" type="button">×</button>
        </div>

        <div id="md-shop-coins">
          🪙 موجودی: <span id="md-coins">0</span> سکه
        </div>

        <div id="md-daily-card">
          <h3>🎁 جایزه روزانه</h3>

          <div>
            هر روز می‌توانی سکه دریافت کنی.
          </div>

          <div style="margin:8px 0">
            🔥 روزهای متوالی:
            <b id="md-streak">0</b>
          </div>

          <button id="md-claim" type="button">
            دریافت 100 سکه
          </button>

          <div id="md-shop-message"></div>
        </div>

        <h3>🛍️ آیتم‌ها</h3>

        <div id="md-shop-items"></div>

      </div>
    `;

    document.body.appendChild(modal);

    document
      .getElementById("md-shop-close")
      .addEventListener("click", closeShop);

    modal.addEventListener("click", e => {
      if (e.target === modal) {
        closeShop();
      }
    });

    document
      .getElementById("md-claim")
      .addEventListener("click", claimDaily);

    render();
  }

  function openShop() {
    build();

    const modal = document.getElementById("md-shop");

    if (modal) {
      modal.classList.add("on");
    }

    const s = getSocket();

    if (s) {
      try {
        s.emit("shopGet", {
          accountId: getAccountId()
        });
      } catch (_) {}
    }
  }

  function closeShop() {
    const modal = document.getElementById("md-shop");

    if (modal) {
      modal.classList.remove("on");
    }
  }

  /*
   * مهم:
   * جایزه روزانه ابتدا به صورت محلی ثبت می‌شود تا UI
   * روی «در حال دریافت...» گیر نکند.
   *
   * سپس درخواست سرور هم ارسال می‌شود.
   */
  function claimDaily() {
    build();

    const btn = document.getElementById("md-claim");

    if (!btn) return;

    const today = todayKey();

    if (state.lastDaily === today) {
      message("⚠️ جایزه امروز را قبلاً گرفته‌ای.");
      render();
      return;
    }

    btn.disabled = true;
    btn.textContent = "⏳ دریافت شد...";

    /*
     * اگر دیروز جایزه گرفته شده باشد،
     * streak ادامه پیدا می‌کند.
     */
    if (state.lastDaily === yesterdayKey()) {
      state.streak += 1;
    } else {
      state.streak = 1;
    }

    /*
     * پاداش پایه 100 سکه
     * + حداکثر 100 سکه برای streak
     */
    const bonus = Math.min(
      100,
      Math.max(0, state.streak - 1) * 10
    );

    const reward = 100 + bonus;

    state.coins += reward;
    state.lastDaily = today;

    saveLocalState(state);

    render();

    message(`🎉 ${reward} سکه گرفتی!`);

    /*
     * درخواست سرور را هم ارسال می‌کنیم.
     * اگر سرور پاسخ نداد، UI همچنان خراب نمی‌شود.
     */
    const s = getSocket();

    if (s) {
      try {
        s.emit("shopClaimDaily", {
          accountId: getAccountId(),
          clientDate: today,
          clientReward: reward
        });
      } catch (_) {}
    }

    /*
     * دکمه را بعد از مدت کوتاه دوباره فعال کن
     * تا در صورت خطای سرور UI قفل نشود.
     */
    setTimeout(() => {
      render();
    }, 1200);
  }

  function buyItem(itemId) {
    build();

    const item = ITEMS.find(x => x.id === itemId);

    if (!item) return;

    state = loadLocalState();

    if (state.inventory.includes(itemId)) {
      message("✅ این آیتم را قبلاً داری.");
      return;
    }

    if (state.coins < item.price) {
      message("❌ سکه کافی نیست.");
      return;
    }

    /*
     * خرید را فوراً در موجودی محلی ثبت می‌کنیم
     * تا آیتم بعد از خرید در بازی قابل استفاده باشد.
     */
    state.coins -= item.price;
    state.inventory.push(itemId);

    saveLocalState(state);

    render();

    message(`✅ ${item.name} خریداری شد!`);

    const s = getSocket();

    if (s) {
      try {
        s.emit("shopBuy", {
          accountId: getAccountId(),
          itemId: itemId
        });
      } catch (_) {}
    }

    /*
     * اطلاع به سایر بخش‌های بازی
     */
    try {
      window.dispatchEvent(
        new CustomEvent("morgdoni:item-purchased", {
          detail: {
            itemId: itemId,
            item: item
          }
        })
      );
    } catch (_) {}
  }

  function render(serverData) {
    if (serverData && typeof serverData === "object") {
      /*
       * فقط زمانی اطلاعات سرور را قبول می‌کنیم
       * که مقدار معتبر داشته باشد.
       */
      if (
        serverData.coins !== undefined &&
        Number.isFinite(Number(serverData.coins))
      ) {
        state.coins = Math.max(
          state.coins,
          Number(serverData.coins)
        );
      }

      if (Array.isArray(serverData.inventory)) {
        for (const id of serverData.inventory) {
          if (!state.inventory.includes(id)) {
            state.inventory.push(id);
          }
        }
      }

      if (serverData.streak !== undefined) {
        state.streak = Math.max(
          state.streak,
          Number(serverData.streak) || 0
        );
      }

      if (serverData.lastDaily) {
        state.lastDaily =
          serverData.lastDaily;
      }

      saveLocalState(state);
    }

    const coins = document.getElementById("md-coins");
    const streak = document.getElementById("md-streak");
    const claim = document.getElementById("md-claim");
    const itemsBox = document.getElementById("md-shop-items");

    if (coins) {
      coins.textContent = state.coins;
    }

    if (streak) {
      streak.textContent = state.streak;
    }

    if (claim) {
      const already =
        state.lastDaily === todayKey();

      claim.disabled = already;

      claim.textContent = already
        ? "✅ جایزه امروز دریافت شده"
        : "دریافت 100 سکه";
    }

    if (itemsBox) {
      itemsBox.innerHTML = ITEMS.map(item => {
        const owned =
          state.inventory.includes(item.id);

        return `
          <div class="md-shop-item">

            <div class="md-shop-icon">
              ${item.icon}
            </div>

            <div class="md-shop-name">
              ${esc(item.name)}
            </div>

            <div class="md-shop-desc">
              ${esc(item.description)}
            </div>

            <div class="md-shop-price">
              🪙 ${item.price}
            </div>

            <button
              class="md-buy"
              type="button"
              data-item="${esc(item.id)}"
              ${owned ? "disabled" : ""}
            >
              ${owned ? "✅ خریداری شده" : "خرید"}
            </button>

          </div>
        `;
      }).join("");

      itemsBox
        .querySelectorAll(".md-buy")
        .forEach(btn => {
          btn.addEventListener("click", () => {
            buyItem(btn.dataset.item);
          });
        });
    }
  }

  /*
   * پاسخ‌های سرور
   */
  function bindSocket() {
    const s = getSocket();

    if (!s || s.__MORG_SHOP_BOUND__) {
      return;
    }

    /*
     * برای WebSocket سفارشی و Socket.IO
     * هر دو حالت را پشتیبانی می‌کنیم.
     */
    if (typeof s.on === "function") {

      s.__MORG_SHOP_BOUND__ = true;

      s.on("shopData", data => {
        state = loadLocalState();

        if (data && data.profile) {
          render(data.profile);
        } else {
          render(data);
        }
      });

      s.on("shopResult", data => {
        if (data && data.profile) {
          render(data.profile);
        }

        if (data && data.coins !== undefined) {
          state.coins = Math.max(
            state.coins,
            Number(data.coins) || 0
          );
          saveLocalState(state);
          render();
        }

        message(
          data?.message ||
          "✅ عملیات با موفقیت انجام شد."
        );
      });

      s.on("shopError", error => {
        /*
         * خطای سرور نباید UI را قفل کند.
         */
        const text =
          typeof error === "string"
            ? error
            : error?.message || "خطای فروشگاه";

        message("❌ " + text);

        const btn =
          document.getElementById("md-claim");

        if (btn) {
          btn.disabled =
            state.lastDaily === todayKey();

          btn.textContent =
            btn.disabled
              ? "✅ جایزه امروز دریافت شده"
              : "دریافت 100 سکه";
        }
      });
    }
  }

  /*
   * دکمه فروشگاه
   */
  function installShopButton() {
    build();

    let btn =
      document.getElementById("md-shop-btn");

    if (!btn) {
      btn = document.createElement("button");

      btn.id = "md-shop-btn";
      btn.type = "button";
      btn.textContent = "🛒 فروشگاه";

      /*
       * اولویت با منوی بازی
       */
      const targets = [
        "#menu",
        "#main-menu",
        ".menu",
        ".nav",
        "header",
        "body"
      ];

      let target = null;

      for (const selector of targets) {
        target = document.querySelector(selector);

        if (target) break;
      }

      if (target) {
        target.appendChild(btn);
      }
    }

    if (!btn.__SHOP_BOUND__) {
      btn.__SHOP_BOUND__ = true;

      btn.addEventListener(
        "click",
        openShop
      );
    }
  }

  /*
   * API عمومی برای باز کردن فروشگاه
   */
  window.MorgShop = {
    open: openShop,

    close: closeShop,

    getState: () => ({
      ...state,
      inventory: [...state.inventory]
    }),

    hasItem: id =>
      state.inventory.includes(id)
  };

  /*
   * رویداد عمومی
   */
  window.addEventListener(
    "morgdoni:open-shop",
    openShop
  );

  /*
   * اتصال Socket ممکن است بعداً ساخته شود،
   * بنابراین چند بار تلاش می‌کنیم.
   */
  let attempts = 0;

  const timer = setInterval(() => {
    installShopButton();
    bindSocket();

    attempts++;

    if (attempts >= 120) {
      clearInterval(timer);
    }
  }, 250);

  /*
   * اگر socket بعداً ساخته شد،
   * هنگام تغییرات صفحه دوباره اتصال را امتحان کن.
   */
  window.addEventListener(
    "load",
    () => {
      installShopButton();
      bindSocket();
      render();
    }
  );

})();
