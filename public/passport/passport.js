<!-- /public/passport/passport.js -->
<script>
(function () {
  // ---------- config ----------
  // If your backend expects cents (integers), flip this to true.
  const BACKEND_EXPECTS_CENTS = false;

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const show = (el) => { el && (el.style.display = ""); };
  const hide = (el) => { el && (el.style.display = "none"); };

  const setStatus = (el, msg, kind) => {
    if (!el) return;
    el.textContent = msg;
    el.className = "status" + (kind ? " " + kind : "");
    show(el);
  };

  const fromQS = (k) => {
    try { return new URL(location.href).searchParams.get(k) || ""; } catch { return ""; }
  };

  const fmtMoney = (a) => {
    const n = Number(a || 0);
    return "BMD $" + n.toFixed(2);
  };

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

  // Fetch identity:
  //   1) /api/me            → validates token and gets id/email/role/type (+ names if your server returns them)
  //   2) /api/users/me      → enrich with first_name/last_name if available
  async function fetchMe() {
    const token = localStorage.getItem("boop_jwt");
    if (!token) throw new Error("No token");

    // 1) base
    const meRes = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
    if (!meRes.ok) {
      const errPayload = await meRes.json().catch(() => ({}));
      throw new Error(errPayload?.message || "Unauthorized");
    }
    const basic = await meRes.json();

    // 2) enrich names
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

  // ---------- boot ----------
  document.addEventListener("DOMContentLoaded", async () => {
    $("year") && ($("year").textContent = new Date().getFullYear());

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

      // Prefill PID from URL if present
      const pidQS = fromQS("pid");
      if (pidQS && $("pid")) $("pid").value = pidQS;

      setRoleView(role);
    } catch (err) {
      try { await fetch("/api/logout", { method: "POST" }); } catch {}
      localStorage.clear();
      location.href = "/index.html";
      return;
    }

    // ----- Common controls -----
    $("btnPaste")?.addEventListener("click", async () => {
      const st = $("commonStatus");
      try {
        const text = await navigator.clipboard.readText();
        if (text && $("pid")) $("pid").value = text.trim();
      } catch {
        setStatus(st, "Clipboard read failed. Paste manually.", "warn");
      }
    });

    $("btnLoad")?.addEventListener("click", () => {
      const pid = $("pid")?.value.trim();
      if (!pid) return setStatus($("commonStatus"), "Please enter a Passport ID.", "err");
      hide($("commonStatus"));
      // (optional) fetch passport meta here
    });

    $("logoutLink")?.addEventListener("click", async (e) => {
      e.preventDefault();
      try { await fetch("/api/logout", { method: "POST" }); } catch {}
      localStorage.clear();
      location.href = "/index.html";
    });

    // Press Enter in amount to trigger charge quickly
    $("v_amount")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("v_chargeBtn")?.click();
    });

    // ----- Vendor actions → REAL CALL -----
    $("v_chargeBtn")?.addEventListener("click", async () => {
      const pidInput = $("pid");
      const amtInput = $("v_amount");
      const noteInput = $("v_note");
      const st = $("v_status");
      const receipt = $("v_receipt"); // optional container if you have it

      const pid = (pidInput?.value || "").trim();
      const amt = parseFloat(amtInput?.value || "");
      const note = noteInput?.value || "";

      if (!pid) return setStatus(st, "Passport ID required.", "err");
      if (!Number.isFinite(amt) || amt <= 0) return setStatus(st, "Enter a valid amount.", "err");

      hide(st);
      if (receipt) hide(receipt);

      // disable while processing
      $("v_chargeBtn") && ($("v_chargeBtn").disabled = true);
      amtInput && (amtInput.disabled = true);
      noteInput && (noteInput.disabled = true);
      pidInput && (pidInput.disabled = true);

      try {
        const token = localStorage.getItem("boop_jwt");
        const payload = BACKEND_EXPECTS_CENTS
          ? { passport_id: pid, amount_cents: Math.round(amt * 100), note }
          : { passport_id: pid, amount: amt, note };

        const res = await fetch("/api/vendor/passport-charge", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        // Try to parse JSON
        let body = {};
        try { body = await res.json(); } catch {}

        if (!res.ok) {
          // Re-enable for retry on error
          $("v_chargeBtn") && ($("v_chargeBtn").disabled = false);
          amtInput && (amtInput.disabled = false);
          noteInput && (noteInput.disabled = false);
          pidInput && (pidInput.disabled = false);

          throw new Error(body?.message || body?.error || `HTTP ${res.status}`);
        }

        // Success → show receipt info if you have fields for it
        const ref = body.reference_code || body.reference || "—";
        const when = new Date();
        setStatus(st, "Charge completed.", "ok");

        // Example: populate a receipt block (add these elements in HTML if you want)
        $("r_status") && ( $("r_status").textContent = "Success" );
        $("r_amount") && ( $("r_amount").textContent = fmtMoney(amt) );
        $("r_pid") && ( $("r_pid").textContent = pid );
        $("r_ref") && ( $("r_ref").textContent = ref );
        $("r_time") && ( $("r_time").textContent = when.toLocaleString() );
        if (receipt) show(receipt);

        // Keep charge button disabled after success (one-shot)
      } catch (err) {
        setStatus(st, `❌ ${err.message || err}`, "err");
      }
    });

    // ----- Transit actions (still demo until you wire backend) -----
    $("t_validateBtn")?.addEventListener("click", async () => {
      const pid = $("pid")?.value.trim();
      const fare = parseFloat($("t_fare")?.value);
      const mode = $("t_mode")?.value;
      const st = $("t_status");

      if (!pid)  return setStatus(st, "Passport ID required.", "err");
      if (!Number.isFinite(fare) || fare < 0) return setStatus(st, "Enter a valid fare.", "err");

      // TODO: POST to your transit endpoint when ready
      setStatus(st, `(demo) ${mode} fare deducted: ${fare.toFixed(2)}`, "ok");
    });
  });
})();
</script>
