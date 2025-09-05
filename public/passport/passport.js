// /public/passport/passport.js
(function () {
  // ---------- config ----------
  const BACKEND_EXPECTS_CENTS = false; // flip to true if your backend wants amount_cents
  const KIOSK_NAME = 'payulot_kiosk';
  const ORIGIN = location.origin;

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const show = (el) => { if (el) el.style.display = ""; };
  const hide = (el) => { if (el) el.style.display = "none"; };
  const fmtMoney = (a) => "BMD $" + Number(a || 0).toFixed(2);
  const setStatus = (el, msg, kind) => {
    if (!el) return;
    el.textContent = msg;
    el.className = "status" + (kind ? " " + kind : "");
    show(el);
  };
  function maskPid(pid){
    if(!pid || typeof pid !== 'string') return '';
    const last4 = pid.slice(-4);
    return '••••-••••-••••-' + last4;
  }

  // ---------- role handling ----------
  const ALLOWED = new Set([
    "vendor","rolevendor",
    "health","health_professional","healthprofessional","medical","emt","ambulance",
    "transit","bus","ferry","rail","operator"
  ]);
  function roleKey(me) {
    const r = String(me?.role || "").toLowerCase().trim();
    const t = String(me?.type || "").toLowerCase().trim();
    const v = r || t;
    if (["vendor","rolevendor"].includes(v)) return "vendor";
    if (["health","health_professional","healthprofessional","medical","emt","ambulance"].includes(v)) return "health";
    if (["transit","bus","ferry","rail","operator"].includes(v)) return "transit";
    return "unknown";
  }
  function fullNameOrEmail(me) {
    const first = (me?.first_name || "").trim();
    const last  = (me?.last_name  || "").trim();
    const name = (first + " " + last).trim();
    if (name) return name;
    return me?.email || "User";
  }

  async function fetchMe() {
    const token = localStorage.getItem("boop_jwt");
    if (!token) throw new Error("No token");
    const headers = { Authorization: `Bearer ${token}` };

    const res = await fetch("/api/me", { headers });
    if (!res.ok) {
      let message = "Unauthorized";
      try { message = (await res.json())?.message || message; } catch {}
      throw new Error(message);
    }
    const basic = await res.json();

    try {
      const moreRes = await fetch("/api/users/me", { headers });
      if (moreRes.ok) {
        const more = await moreRes.json();
        return { ...basic, ...more };
      }
    } catch {}
    return basic;
  }

  function setRoleView(role) {
    ["view-vendor", "view-health", "view-transit"].forEach((id) => $(id)?.classList.remove("active"));
    if (role === "vendor") $("view-vendor")?.classList.add("active");
    if (role === "health") $("view-health")?.classList.add("active");
    if (role === "transit") $("view-transit")?.classList.add("active");
  }

  // ---------- kiosk window + messaging ----------
  try { if (window.name !== KIOSK_NAME) window.name = KIOSK_NAME; } catch {}

  function updateUrlPid(pid) {
    try {
      const url = new URL(location.href);
      if (pid) url.searchParams.set('pid', pid);
      else url.searchParams.delete('pid');
      history.replaceState(null, '', url.toString());
    } catch {}
  }

  // Accept PID from opener (each tap)
  function acceptPID(newPid) {
    PID = newPid || "";
    updateUrlPid(PID);

    // Reset form & UI for the new tap
    const pidField = $("pid");
    if (pidField) {
      pidField.value = PID ? maskPid(PID) : "";
      pidField.readOnly = true;
      pidField.placeholder = "Passport is hidden";
      pidField.style.caretColor = "transparent";
      ["keydown","keypress","beforeinput","input","paste","drop","copy","cut","contextmenu"]
        .forEach(evt => pidField.addEventListener(evt, e => e.preventDefault()));
    }

    chargedLock = false;           // unlock for this PID
    processing = false;
    $("v_chargeBtn") && ($("v_chargeBtn").disabled = role !== "vendor");
    $("v_amount") && (($("v_amount").disabled = false), ($("v_amount").value = ""));
    $("v_note") &&  (($("v_note").disabled  = false), ($("v_note").value  = ""));
    hide($("v_receipt"));
    setStatus($("v_status"), PID ? "Passport read. Enter amount." : "Waiting for tap…", "");
    $("v_amount")?.focus();
  }

  // Reply with token when kiosk asks
  function sendTokenTo(openerWin) {
    try {
      openerWin?.postMessage({
        type: 'token:reply',
        token: localStorage.getItem('boop_jwt') || ''
      }, ORIGIN);
    } catch {}
  }

  window.addEventListener('message', (ev) => {
    if (ev.origin !== ORIGIN) return;
    const d = ev.data || {};
    if (d.type === 'charge:start')   acceptPID(d.pn);
    if (d.type === 'token:request')  sendTokenTo(window.opener);
  });

  // If we were opened by a relay page, announce we're ready
  function notifyReady() {
    try { window.opener?.postMessage({ type:'charge:ready' }, ORIGIN); } catch {}
  }

  // ---------- state ----------
  let PID = "";
  let role = "unknown";
  let processing = false;  // while a charge is running
  let chargedLock = false; // after a successful charge, wait for next tap

  // ---------- boot ----------
  document.addEventListener("DOMContentLoaded", async () => {
    $("year") && ($("year").textContent = new Date().getFullYear());

    // Pick up pid from URL (if first open came directly with ?pid=)
    try {
      const raw = new URL(location.href).searchParams.get("pid") || "";
      if (raw && /^[A-Za-z0-9_-]{12,}$/.test(raw)) PID = raw.trim();
    } catch {}
    if (PID) acceptPID(PID);

    // Auth + role gate
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
      const who = fullNameOrEmail(me);
      role = roleKey(me);

      $("signedInAs") && ($("signedInAs").textContent = `Signed in as ${who}`);
      $("roleBadge") && ($("roleBadge").textContent = role);
      $("whoBadge") && ($("whoBadge").textContent = who);
      setRoleView(role);

      $("v_chargeBtn") && ($("v_chargeBtn").disabled = (role !== "vendor") || !PID);
      $("t_validateBtn") && ($("t_validateBtn").disabled = (role !== "transit") || !PID);
    } catch (err) {
      try { await fetch("/api/logout", { method: "POST" }); } catch {}
      localStorage.clear();
      location.href = "/index.html";
      return;
    }

    // Tell relay we're ready to receive PIDs
    notifyReady();

    // Logout link
    $("logoutLink")?.addEventListener("click", async (e) => {
      e.preventDefault();
      try { await fetch("/api/logout", { method: "POST" }); } catch {}
      localStorage.clear();
      location.href = "/index.html";
    });

    // Vendor: charge — one-shot guarded
    $("v_amount")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("v_chargeBtn")?.click();
    });

    $("v_chargeBtn")?.addEventListener("click", async () => {
      const st = $("v_status");
      const amtInput  = $("v_amount");
      const noteInput = $("v_note");

      if (!PID)  return setStatus(st, "No passport detected. Open this page from the scanner.", "err");
      if (chargedLock) return setStatus(st, "Already charged. Tap a new card to start another sale.", "warn");
      if (processing)  return; // ignore double-clicks

      const amt = parseFloat(amtInput?.value || "");
      const note = noteInput?.value || "";
      if (!Number.isFinite(amt) || amt <= 0) return setStatus(st, "Enter a valid amount.", "err");

      processing = true;
      hide(st);
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

        if (!res.ok) throw new Error(body?.message || body?.error || `HTTP ${res.status}`);

        // Success UI
        setStatus(st, "Charge completed.", "ok");
        $("r_status") && ( $("r_status").textContent = "Success" );
        $("r_amount") && ( $("r_amount").textContent = fmtMoney(amt) );
        $("r_pid") && ( $("r_pid").textContent = maskPid(PID) );
        $("r_ref") && ( $("r_ref").textContent = (body.reference_code || body.reference || "—") );
        $("r_time") && ( $("r_time").textContent = new Date().toLocaleString() );
        $("v_receipt") && show($("v_receipt"));

        // Lock until next tap
        chargedLock = true;
        $("v_chargeBtn").disabled = true;

        // Let opener (relay) know we finished
        try { window.opener?.postMessage({ type:'charge:done', txn: body?.transaction || null }, ORIGIN); } catch {}
      } catch (err) {
        setStatus(st, `❌ ${err.message || err}`, "err");
        try { window.opener?.postMessage({ type:'charge:error', error: String(err?.message || err) }, ORIGIN); } catch {}
      } finally {
        processing = false;
        amtInput && (amtInput.disabled = false);
        noteInput && (noteInput.disabled = false);
      }
    });

    // Transit demo — unchanged
    $("t_validateBtn")?.addEventListener("click", async () => {
      const st = $("t_status");
      if (!PID)  return setStatus(st, "No passport detected. Open this page from the scanner.", "err");

      const fare = parseFloat($("t_fare")?.value);
      const mode = $("t_mode")?.value;
      if (!Number.isFinite(fare) || fare < 0) return setStatus(st, "Enter a valid fare.", "err");

      setStatus(st, `(demo) ${mode} fare deducted: ${fare.toFixed(2)}`, "ok");
    });
  });
})();
