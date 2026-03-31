/**
 * StockInsight Pro — Phone Authentication
 * ========================================
 * Firebase Phone Auth via SMS OTP.
 * Steps:
 *   1. User enters phone number (international format)
 *   2. Firebase sends SMS via invisible reCAPTCHA
 *   3. User enters the 6-digit OTP
 *   4. On success → Firestore portfolio + alerts are loaded
 */

(function () {
  "use strict";

  let recaptchaVerifier = null;
  let confirmationResult = null;

  // ─── AUTH STATE ────────────────────────────────────────────────────────────
  function initAuth() {
    fbAuth.onAuthStateChanged((user) => {
      if (user) {
        onUserSignedIn(user);
      } else {
        onUserSignedOut();
      }
    });
  }

  async function onUserSignedIn(user) {
    const phone = user.phoneNumber || "User";

    // Update header login button
    const loginBtn  = document.getElementById("loginBtn");
    const loginText = document.getElementById("loginBtnLabel");
    if (loginBtn)  loginBtn.classList.add("signed-in");
    if (loginText) loginText.textContent = phone;

    // Populate user menu
    const menuPhone = document.getElementById("userMenuPhone");
    if (menuPhone) menuPhone.textContent = phone;

    // Reveal auth-gated sections
    document.querySelectorAll(".auth-required").forEach((el) =>
      el.classList.remove("auth-hidden")
    );

    // Load portfolio, alerts, paper trades
    if (window.Portfolio) {
      await Portfolio.loadPortfolio(user.uid);
      await Portfolio.loadAlerts(user.uid);
    }
    if (window.PaperTrade) {
      PaperTrade.loadPaperTrades(user.uid);
    }

    // Fire up insights once data is ready
    if (window.Insights && window.APP_DATA) {
      Insights.renderMacroAlerts(window.APP_DATA.market);
      Insights.renderDiversification(window.Portfolio?.portfolioStocks || [], window.APP_DATA);
      Insights.loadEarnings(window.Portfolio?.portfolioStocks || []);
    }

    // Request browser notification permission, then register FCM token
    await requestNotificationPermission();
    if (window.FCM) FCM.setupFCM(user.uid);

    // Update "Why" section CTAs to show navigation instead of login prompt
    updateWhyCTAs(true);
  }

  function onUserSignedOut() {
    const loginBtn  = document.getElementById("loginBtn");
    const loginText = document.getElementById("loginBtnLabel");
    if (loginBtn)  loginBtn.classList.remove("signed-in");
    if (loginText) loginText.textContent = "Sign In";

    // Hide auth-gated sections
    document.querySelectorAll(".auth-required").forEach((el) =>
      el.classList.add("auth-hidden")
    );

    if (window.Portfolio) Portfolio.clear();
    if (window.PaperTrade) PaperTrade.clear();

    // Revert "Why" section CTAs back to login prompts
    updateWhyCTAs(false);
  }

  // ─── WHY SECTION CTAs ─────────────────────────────────────────────────────
  function updateWhyCTAs(signedIn) {
    document.querySelectorAll(".why-auth-cta").forEach((btn) => {
      btn.textContent = signedIn ? "Go to feature ↓" : "Sign in to try →";
    });
    document.querySelectorAll(".why-auth-tag").forEach((tag) => {
      tag.textContent = signedIn ? "✓ Unlocked" : "Sign in to unlock";
      tag.classList.toggle("why-tag--unlocked", signedIn);
      tag.classList.toggle("why-tag--auth", !signedIn);
    });
  }

  // ─── MODAL OPEN / CLOSE ────────────────────────────────────────────────────
  function openAuthModal() {
    const overlay = document.getElementById("authModalOverlay");
    if (!overlay) return;
    overlay.classList.add("active");
    resetAuthForm();
    // Delay reCAPTCHA init until DOM is fully ready
    setTimeout(initRecaptcha, 100);
  }

  function closeAuthModal() {
    const overlay = document.getElementById("authModalOverlay");
    if (overlay) overlay.classList.remove("active");
    resetAuthForm();
  }

  // ─── reCAPTCHA ─────────────────────────────────────────────────────────────
  function initRecaptcha() {
    if (recaptchaVerifier) return;
    try {
      recaptchaVerifier = new firebase.auth.RecaptchaVerifier(
        "recaptchaContainer",
        { size: "invisible", callback: () => {} }
      );
      recaptchaVerifier.render();
    } catch (err) {
      console.warn("[Auth] reCAPTCHA init error:", err.message);
    }
  }

  function resetAuthForm() {
    document.getElementById("authPhoneStep")?.classList.remove("hidden");
    document.getElementById("authOtpStep")?.classList.add("hidden");
    const phoneInput = document.getElementById("authPhoneInput");
    const otpInput   = document.getElementById("authOtpInput");
    const errorEl    = document.getElementById("authError");
    if (phoneInput) phoneInput.value = "";
    if (otpInput)   otpInput.value   = "";
    if (errorEl)    errorEl.textContent = "";
    // Reset button states
    const sendBtn   = document.getElementById("authSendOtpBtn");
    const verifyBtn = document.getElementById("authVerifyOtpBtn");
    if (sendBtn)   { sendBtn.disabled = false;   sendBtn.textContent   = "Send OTP"; }
    if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.textContent = "Verify & Sign In"; }
    confirmationResult = null;
  }

  // ─── SEND OTP ──────────────────────────────────────────────────────────────
  async function sendOTP() {
    const phoneInput = document.getElementById("authPhoneInput");
    const errorEl    = document.getElementById("authError");
    const sendBtn    = document.getElementById("authSendOtpBtn");
    const phone      = phoneInput?.value.trim() || "";

    errorEl.textContent = "";

    if (!phone || !/^\+[1-9]\d{6,14}$/.test(phone)) {
      errorEl.textContent =
        "Enter a valid number with country code — e.g. +14155552671";
      return;
    }

    sendBtn.disabled    = true;
    sendBtn.textContent = "Sending…";

    try {
      confirmationResult = await fbAuth.signInWithPhoneNumber(
        phone,
        recaptchaVerifier
      );
      document.getElementById("authPhoneStep").classList.add("hidden");
      document.getElementById("authOtpStep").classList.remove("hidden");
      document.getElementById("authOtpInput").focus();
    } catch (err) {
      console.error("[Auth] sendOTP error:", err);
      errorEl.textContent = friendlyAuthError(err);
      sendBtn.disabled    = false;
      sendBtn.textContent = "Send OTP";
      // Reset reCAPTCHA so it can be used again
      recaptchaVerifier = null;
      setTimeout(initRecaptcha, 200);
    }
  }

  // ─── VERIFY OTP ────────────────────────────────────────────────────────────
  async function verifyOTP() {
    const otpInput  = document.getElementById("authOtpInput");
    const errorEl   = document.getElementById("authError");
    const verifyBtn = document.getElementById("authVerifyOtpBtn");
    const code      = otpInput?.value.trim() || "";

    errorEl.textContent = "";

    if (!code || !/^\d{6}$/.test(code)) {
      errorEl.textContent = "Enter the 6-digit code from your SMS";
      return;
    }

    verifyBtn.disabled    = true;
    verifyBtn.textContent = "Verifying…";

    try {
      await confirmationResult.confirm(code);
      closeAuthModal();
    } catch (err) {
      console.error("[Auth] verifyOTP error:", err);
      errorEl.textContent = friendlyAuthError(err);
      verifyBtn.disabled    = false;
      verifyBtn.textContent = "Verify & Sign In";
    }
  }

  // ─── SIGN OUT ─────────────────────────────────────────────────────────────
  async function signOut() {
    try {
      const uid = fbAuth.currentUser?.uid;
      if (uid && window.FCM) await FCM.removeFCMToken(uid);
      await fbAuth.signOut();
      document.getElementById("userMenu")?.classList.remove("active");
    } catch (err) {
      console.error("[Auth] signOut error:", err);
    }
  }

  // ─── NOTIFICATIONS ─────────────────────────────────────────────────────────
  async function requestNotificationPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") return;
    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        console.log("[Auth] Notification permission granted ✅");
      }
    }
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────
  function friendlyAuthError(err) {
    const map = {
      "auth/invalid-phone-number":      "Invalid phone number format.",
      "auth/too-many-requests":         "Too many attempts. Please try again later.",
      "auth/invalid-verification-code": "Incorrect OTP code. Please check and retry.",
      "auth/code-expired":              "OTP has expired. Please request a new one.",
      "auth/captcha-check-failed":      "reCAPTCHA failed. Please refresh the page.",
      "auth/quota-exceeded":            "SMS quota exceeded. Please try again tomorrow.",
    };
    return map[err.code] || err.message || "An error occurred. Please try again.";
  }

  // ─── DOM HOOKS ─────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    initAuth();

    // Login button — opens modal or toggles user menu
    document.getElementById("loginBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (fbAuth.currentUser) {
        document.getElementById("userMenu")?.classList.toggle("active");
      } else {
        openAuthModal();
      }
    });

    // Close user menu when clicking outside
    document.addEventListener("click", (e) => {
      const menu     = document.getElementById("userMenu");
      const loginBtn = document.getElementById("loginBtn");
      if (menu && !menu.contains(e.target) && !loginBtn?.contains(e.target)) {
        menu.classList.remove("active");
      }
    });

    document.getElementById("authSendOtpBtn")?.addEventListener("click", sendOTP);
    document.getElementById("authVerifyOtpBtn")?.addEventListener("click", verifyOTP);

    // Back to phone step
    document.getElementById("authBackBtn")?.addEventListener("click", () => {
      document.getElementById("authOtpStep").classList.add("hidden");
      document.getElementById("authPhoneStep").classList.remove("hidden");
      document.getElementById("authError").textContent = "";
      const sendBtn = document.getElementById("authSendOtpBtn");
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send OTP"; }
    });

    // Close modal
    document.getElementById("authModalClose")?.addEventListener("click", closeAuthModal);
    document.getElementById("authModalOverlay")?.addEventListener("click", (e) => {
      if (e.target.id === "authModalOverlay") closeAuthModal();
    });

    // Sign out
    document.getElementById("signOutBtn")?.addEventListener("click", signOut);

    // Enter key support
    document.getElementById("authPhoneInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendOTP();
    });
    document.getElementById("authOtpInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") verifyOTP();
    });
  });

  // Expose so app.js can check current user
  window.Auth = { openAuthModal, closeAuthModal, signOut };

  // Global handler for "Why" section CTA buttons — called via onclick="whyCTA(this)"
  window.whyCTA = function (btn) {
    const isSignedIn = !!fbAuth.currentUser;
    if (!isSignedIn) {
      openAuthModal();
      return;
    }
    const sectionId = btn.dataset.section;
    const tabId     = btn.dataset.tab;
    const section   = sectionId ? document.getElementById(sectionId) : null;
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      if (tabId) {
        // Delay click to let scroll settle, then activate the right tab
        setTimeout(() => {
          const pmtab = section.querySelector(`.pmtab[data-tab="${tabId}"]`);
          const itab  = section.querySelector(`.itab[data-tab="${tabId}"]`);
          if (pmtab) pmtab.click();
          if (itab)  itab.click();
        }, 400);
      }
    }
  };
})();
