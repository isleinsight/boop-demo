// /public/passport/passport.js
(function () {
  // ---------- config ----------
  const BACKEND_EXPECTS_CENTS = false; // flip to true if your backend wants amount_cents

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

  // ---------- state ----------
  let PID = "";

  // ---------- boot ----------
  document.addEventListener("DOMContentLoaded", async () => {
    $("year") && ($("year").textContent = new Date().getFullYear());

    // 1) Require ?pid= (opened from scanner)
    let pid = "";
    try {
      const url = new URL(location.href);
      const raw = (url.searchParams.get("pid") || "").trim();
      if (raw && /^[A-Za-z0-9_-]{12,}$/.test(raw)) pid = raw;
    } catch {}

    if (!pid) {
      // No PID: show gentle message; disable actions
      setStatus($("commonStatus"),
        "This page should be opened from the scanner (deep link includes ?pid=…).",
        "warn"
      );
      $("v_chargeBtn") && ($("v_chargeBtn").disabled = true);
      $("t_validateBtn") && ($("t_validateBtn").disabled = true);
    } else {
      PID = pid;
      const pidField = $("pid");
      if (pidField) {
        // read-only + masked
        pidField.value = maskPid(PID);
        pidField.readOnly = true;
        pidField.placeholder = "Passport is hidden";
        pidField.style.caretColor = "transparent";
        ["keydown","keypress","beforeinput","input","paste","drop","copy","cut","contextmenu"]
          .forEach(evt => pidField.addEventListener(evt, e => e.preventDefault()));
      }
    }

    // 2) Auth + identity + role gate
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
      const role = roleKey(me);

      $("signedInAs") && ($("signedInAs").textContent = `Signed in as ${who}`);
      $("roleBadge") && ($("roleBadge").textContent = role);
      $("whoBadge") && ($("whoBadge").textContent = who);

      setRoleView(role);

      // If we do have a PID, enable vendor/transit buttons
      if (PID) {
        $("v_chargeBtn") && ($("v_chargeBtn").disabled = (role !== "vendor"));
        $("t_validateBtn") && ($("t_validateBtn").disabled = (role !== "transit"));
      }

    } catch (err) {
      // Token missing/expired
      try { await fetch("/api/logout", { method: "POST" }); } catch {}
      localStorage.clear();
      location.href = "/index.html";
      return;
    }

    // 3) Logout link
    $("logoutLink")?.addEventListener("click", async (e) => {
      e.preventDefault();
      try { await fetch("/api/logout", { method: "POST" }); } catch {}
      localStorage.clear();
      location.href = "/index.html";
    });

    // 4) Vendor: charge
    $("v_amount")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("v_chargeBtn")?.click();
    });

    $("v_chargeBtn")?.addEventListener("click", async () => {
      const st = $("v_status");
      const amtInput  = $("v_amount");
      const noteInput = $("v_note");

      if (!PID) return setStatus(st, "No passport detected. Open this page from the scanner.", "err");

      const amt = parseFloat(amtInput?.value || "");
      const note = noteInput?.value || "";
      if (!Number.isFinite(amt) || amt <= 0) return setStatus(st, "Enter a valid amount.", "err");

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

        setStatus(st, "Charge completed.", "ok");

        // Optional: receipt fill (masked pid)
        $("r_status") && ( $("r_status").textContent = "Success" );
        $("r_amount") && ( $("r_amount").textContent = fmtMoney(amt) );
        $("r_pid") && ( $("r_pid").textContent = maskPid(PID) );
        $("r_ref") && ( $("r_ref").textContent = (body.reference_code || body.reference || "—") );
        $("r_time") && ( $("r_time").textContent = new Date().toLocaleString() );
        $("v_receipt") && show($("v_receipt"));

      } catch (err) {
        setStatus(st, `❌ ${err.message || err}`, "err");
      } finally {
        $("v_chargeBtn").disabled = false;
        amtInput && (amtInput.disabled = false);
        noteInput && (noteInput.disabled = false);
      }
    });

    // 5) Transit: demo deduct
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
