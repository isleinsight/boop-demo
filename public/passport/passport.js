// /public/passport/passport.js
(function () {
  // ---------- config ----------
  // If backend expects cents (integers), flip this to true.
  const BACKEND_EXPECTS_CENTS = false;

  // ---------- tiny helpers ----------
  const $ = (id) => document.getElementById(id);
  const show = (el) => { if (el) el.style.display = ""; };
  const hide = (el) => { if (el) el.style.display = "none"; };

  const setStatus = (el, msg, kind) => {
    if (!el) return;
    el.textContent = msg;
    el.className = "status" + (kind ? " " + kind : "");
    show(el);
  };

  const fmtMoney = (a) => {
    const n = Number(a || 0);
    return "BMD $" + n.toFixed(2);
  };

  // ---------- role handling ----------
  // Accepted roles/types for this page
  const ALLOWED = new Set([
    "vendor","rolevendor",
    "health","health_professional","healthprofessional","medical","emt","ambulance",
    "transit","bus","ferry","rail","operator"
  ]);

  // Normalize role/type into a key we use for the UI
  function roleKey(me) {
    const r = String(me?.role || "").toLowerCase().trim();
    const t = String(me?.type || "").toLowerCase().trim();
    const v = r || t;

    if (["vendor","rolevendor"].includes(v)) return "vendor";
    if (["health","health_professional","healthprofessional","medical","emt","ambulance"].includes(v)) return "health";
    if (["transit","bus","ferry","rail","operator"].includes(v)) return "transit";
    return "unknown";
  }

  function fullName(me) {
    const first = (me?.first_name || "").trim();
    const last  = (me?.last_name  || "").trim();
    const emailFallback = (me?.email || "").split("@")[0] || "User";
    const name = (first + " " + last).trim();
    return name || emailFallback;
  }

  async function fetchMe() {
    const token = localStorage.getItem("boop_jwt");
    if (!token) throw new Error("No token");

    const meRes = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
    if (!meRes.ok) {
      const errPayload = await meRes.json().catch(() => ({}));
      throw new Error(errPayload?.message || "Unauthorized");
    }
    const basic = await meRes.json();

    try {
      const fullRes = await fetch("/api/users/me", { headers: { Authorization: `Bearer ${token}` } });
      if (fullRes.ok) {
        const more = await fullRes.json();
        return { ...basic, ...more };
      }
    } catch (_) {}
    return basic;
  }

  function setRoleView(active) {
    ["view-vendor", "view-health", "view-transit"].forEach((id) => {
      const el = $(id);
      if (el) el.classList.remove("active");
    });
    if (active === "vendor") $("view-vendor")?.classList.add("active");
    if (active === "health") $("view-health")?.classList.add("active");
    if (active === "transit") $("view-transit")?.classList.add("active");
  }

  // ---------- secure PID handling (no manual entry; masked display) ----------
  function maskPid(pid){
    if(!pid || typeof pid !== 'string') return '';
    const last4 = pid.slice(-4);
    return '••••-••••-••••-' + last4;
  }

  // Full PID/token only lives in memory here
  let PID = '';

  function hardLockPidField(field) {
    if (!field) return;
    field.readOnly = true;
    field.placeholder = 'Passport is hidden';
    field.style.caretColor = 'transparent';
    // Block all input/copy/paste/context menu/drag
    ['keydown','keypress','beforeinput','input','paste','drop','copy','cut','contextmenu']
      .forEach(evt => field.addEventListener(evt, e => e.preventDefault()));
  }

  function setPid(pid){
    PID = (pid || '');
    const f = $('pid');
    if (f) {
      f.value = PID ? maskPid(PID) : '';
      hardLockPidField(f);
    }
    const has = !!PID;
    $('v_chargeBtn') && ($('v_chargeBtn').disabled = !has);
    $('t_validateBtn') && ($('t_validateBtn').disabled = !has);
    $('btnLoad') && ($('btnLoad').disabled = true); // manual load is disabled for security
  }

  // ---------- boot ----------
  document.addEventListener("DOMContentLoaded", async () => {
    $("year") && ($("year").textContent = new Date().getFullYear());

    // Lock the PID field immediately (even before we have a value)
    const pidField = $('pid');
    if (pidField) hardLockPidField(pidField);

    // auth + identity
    try {
      const me = await fetchMe();
      const rawRole = String(me.role || me.type || "").toLowerCase().trim();

      if (!ALLOWED.has(rawRole)) {
        try { await fetch("/api/logout", { method: "POST" }); } catch {}
        localStorage.clear();
        location.href = "/index.html";
        return;
      }

      localStorage.setItem("boopUser", JSON.stringify(me));

      const who = fullName(me);
      const role = roleKey(me);

      $("signedInAs") && ($("signedInAs").textContent = `Signed in as ${who}`);
      $("roleBadge") && ($("roleBadge").textContent = role);
      $("whoBadge") && ($("whoBadge").textContent = who);

      setRoleView(role);

      // Preload from ?pid= (deeplink from scanner/NFC)
      try {
        const url = new URL(location.href);
        const pidQS = url.searchParams.get('pid');
        if (pidQS && /^[A-Za-z0-9_-]{12,}$/.test(pidQS)) {
          setPid(pidQS);
        }
      } catch {}

      // Accept from scanner via postMessage({ pid: '...' })
      window.addEventListener('message', (e) => {
        const data = e.data || {};
        if (data && typeof data === 'object' && typeof data.pid === 'string') {
          if (/^[A-Za-z0-9_-]{12,}$/.test(data.pid)) setPid(data.pid);
        }
      });
    } catch (err) {
      try { await fetch("/api/logout", { method: "POST" }); } catch {}
      localStorage.clear();
      location.href = "/index.html";
      return;
    }

    // ----- Common controls (now read-only / informational) -----
    $("btnPaste")?.addEventListener("click", () => {
      setStatus($("commonStatus"),
        "Manual paste is disabled for security. Use Scan/Load (deeplink) or open from the scanner.",
        "warn"
      );
    });

    $("btnLoad")?.addEventListener("click", () => {
      setStatus($("commonStatus"),
        "Manual entry is disabled. Use the scanner or a deeplink with ?pid=…",
        "warn"
      );
    });

    $("logoutLink")?.addEventListener("click", async (e) => {
      e.preventDefault();
      try { await fetch("/api/logout", { method: "POST" }); } catch {}
      localStorage.clear();
      location.href = "/index.html";
    });

    $("v_amount")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("v_chargeBtn")?.click();
    });

    // ----- Vendor actions → REAL CALL (uses pid_token) -----
    $("v_chargeBtn")?.addEventListener("click", async () => {
      const amtInput = $("v_amount");
      const noteInput = $("v_note");
      const st = $("v_status");
      const receipt = $("v_receipt");

      const amt = parseFloat(amtInput?.value || "");
      const note = noteInput?.value || "";

      if (!PID) return setStatus(st, "No passport selected. Use Scan/Load first.", "err");
      if (!Number.isFinite(amt) || amt <= 0) return setStatus(st, "Enter a valid amount.", "err");

      hide(st);
      if (receipt) hide(receipt);

      $("v_chargeBtn").disabled = true;
      amtInput && (amtInput.disabled = true);
      noteInput && (noteInput.disabled = true);

      try {
        const token = localStorage.getItem("boop_jwt");
        const payload = BACKEND_EXPECTS_CENTS
          ? { pid_token: PID, amount_cents: Math.round(amt * 100), note }
          : { pid_token: PID, amount: amt, note };

        const res = await fetch("/api/vendor/passport-charge", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        let body = {};
        try { body = await res.json(); } catch {}

        if (!res.ok) {
          throw new Error(body?.message || body?.error || `HTTP ${res.status}`);
        }

        const ref = body.reference_code || body.reference || "—";
        const when = new Date();
        setStatus(st, "Charge completed.", "ok");

        // Optional: fill a receipt area if present
        $("r_status") && ( $("r_status").textContent = "Success" );
        $("r_amount") && ( $("r_amount").textContent = fmtMoney(amt) );
        $("r_pid") && ( $("r_pid").textContent = maskPid(PID) ); // keep masked
        $("r_ref") && ( $("r_ref").textContent = ref );
        $("r_time") && ( $("r_time").textContent = when.toLocaleString() );
        if (receipt) show(receipt);

      } catch (err) {
        setStatus(st, `❌ ${err.message || err}`, "err");
      } finally {
        $("v_chargeBtn").disabled = !PID;
        amtInput && (amtInput.disabled = false);
        noteInput && (noteInput.disabled = false);
      }
    });

    // ----- Transit actions (demo) -----
    $("t_validateBtn")?.addEventListener("click", async () => {
      const fare = parseFloat($("t_fare")?.value);
      const mode = $("t_mode")?.value;
      const st = $("t_status");

      if (!PID)  return setStatus(st, "No passport selected. Use Scan/Load first.", "err");
      if (!Number.isFinite(fare) || fare < 0) return setStatus(st, "Enter a valid fare.", "err");

      setStatus(st, `(demo) ${mode} fare deducted: ${fare.toFixed(2)}`, "ok");
    });
  });
})();
