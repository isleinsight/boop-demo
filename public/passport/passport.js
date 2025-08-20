// /public/passport/passport.js
(function(){
  // ---------- helpers ----------
  const $ = (id)=>document.getElementById(id);
  const show = (el)=>{ el && (el.style.display = ""); };
  const hide = (el)=>{ el && (el.style.display = "none"); };
  const setStatus = (el, msg, kind) => {
    if (!el) return;
    el.textContent = msg;
    el.className = "status" + (kind ? " " + kind : "");
    show(el);
  };
  const fromQS = (k) => {
    try { return new URL(location.href).searchParams.get(k) || ""; } catch { return ""; }
  };

  // Accepted roles/types for this page
  const ALLOWED = new Set([
    "vendor","rolevendor",
    "health","health_professional","healthprofessional","medical","emt","ambulance",
    "transit","bus","ferry","rail","operator"
  ]);

  // Normalize role/type into a key we use for the UI
  function roleKey(me){
    const r = String(me?.role || "").toLowerCase().trim();
    const t = String(me?.type || "").toLowerCase().trim();
    const v = r || t;

    if (["vendor","rolevendor"].includes(v)) return "vendor";
    if (["health","health_professional","healthprofessional","medical","emt","ambulance"].includes(v)) return "health";
    if (["transit","bus","ferry","rail","operator"].includes(v)) return "transit";
    return "unknown";
  }

  function fullName(me){
    const first = (me?.first_name || "").trim();
    const last  = (me?.last_name  || "").trim();
    const emailFallback = (me?.email || "").split("@")[0] || "User";
    const name = (first + " " + last).trim();
    return name || emailFallback;
  }

  // Fetch identity:
  //   1) /api/me  → validates token and gets id/email/role/type
  //   2) /api/users/me → enrich with first_name/last_name if available
  async function fetchMe(){
    const token = localStorage.getItem("boop_jwt");
    if (!token) throw new Error("No token");

    // 1) Validate / get base fields
    const meRes = await fetch("/api/me", { headers:{ Authorization:`Bearer ${token}` }});
    if (!meRes.ok) {
      const errPayload = await meRes.json().catch(()=>({}));
      throw new Error(errPayload?.message || "Unauthorized");
    }
    const basic = await meRes.json();
    console.debug("[passport] /api/me →", basic);

    // 2) Try to enrich with names
    try {
      const fullRes = await fetch("/api/users/me", { headers:{ Authorization:`Bearer ${token}` }});
      if (fullRes.ok) {
        const more = await fullRes.json();
        console.debug("[passport] /api/users/me →", more);
        return { ...basic, ...more };
      }
    } catch (_) {
      // ignore; we’ll just use basic
    }
    return basic;
  }

  function setRoleView(active){
    // hide all
    ["view-vendor","view-health","view-transit"].forEach(id => {
      const el = $(id);
      if (el) el.classList.remove("active");
    });
    if (active === "vendor")   $("view-vendor")?.classList.add("active");
    if (active === "health")   $("view-health")?.classList.add("active");
    if (active === "transit")  $("view-transit")?.classList.add("active");
  }

  // ---------- boot ----------
  document.addEventListener("DOMContentLoaded", async ()=>{
    $("year") && ($("year").textContent = new Date().getFullYear());

    // auth + identity
    try {
      const me = await fetchMe();

      // Normalize and gate by role/type
      const rawRole = String(me.role || me.type || "").toLowerCase().trim();
      console.debug("[passport] raw role/type:", me.role, me.type, "→ normalized:", rawRole);

      if (!ALLOWED.has(rawRole)) {
        console.warn("[passport] role not allowed on this page:", rawRole);
        // If you want to *show* the shell instead of redirect, comment the next 3 lines:
        try { await fetch("/api/logout", { method:"POST" }); } catch {}
        localStorage.clear();
        location.href = "/index.html";
        return;
      }

      // Enrich and store
      const enriched = me;
      localStorage.setItem("boopUser", JSON.stringify(enriched));

      const who  = fullName(enriched);
      const role = roleKey(enriched);

      $("signedInAs")  && ($("signedInAs").textContent  = `Signed in as ${who}`);
      $("roleBadge")   && ($("roleBadge").textContent   = role);
      $("whoBadge")    && ($("whoBadge").textContent    = who);

      // Prefill PID from URL if present
      const pidEl = $("pid");
      const pidQS = fromQS("pid");
      if (pidQS && pidEl) pidEl.value = pidQS;

      // show the right view
      setRoleView(role);

    } catch (err){
      console.error("[passport] auth error:", err?.message || err);
      // ONLY on true auth failure do we bounce home
      try { await fetch("/api/logout", { method:"POST" }); } catch {}
      localStorage.clear();
      location.href = "/index.html";
      return;
    }

    // ----- Common controls -----
    $("btnPaste")?.addEventListener("click", async ()=>{
      const st = $("commonStatus");
      try{
        const text = await navigator.clipboard.readText();
        if (text) $("pid").value = text.trim();
      }catch{
        setStatus(st, "Clipboard read failed. Paste manually.", "warn");
      }
    });

    $("btnLoad")?.addEventListener("click", ()=>{
      const pid = $("pid")?.value.trim();
      if (!pid){
        return setStatus($("commonStatus"), "Please enter a Passport ID.", "err");
      }
      hide($("commonStatus"));
      // (optional) fetch passport meta here later
    });

    $("logoutLink")?.addEventListener("click", async (e)=>{
      e.preventDefault();
      try { await fetch("/api/logout", { method:"POST" }); } catch {}
      localStorage.clear();
      location.href = "/index.html";
    });

    // ----- Vendor actions (wire to your endpoint when ready) -----
    $("v_chargeBtn")?.addEventListener("click", async ()=>{
      const pid  = $("pid")?.value.trim();
      const amt  = parseFloat($("v_amount")?.value);
      const note = $("v_note")?.value || "";
      const st   = $("v_status");

      if (!pid)  return setStatus(st, "Passport ID required.", "err");
      if (!Number.isFinite(amt) || amt <= 0) return setStatus(st, "Enter a valid amount.", "err");

      // Example wiring (uncomment when your endpoint is ready):
      /*
      try{
        hide(st);
        const token = localStorage.getItem("boop_jwt");
        const res = await fetch("/api/vendor/passport-charge", {
          method:"POST",
          headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
          body: JSON.stringify({ passport_id: pid, amount: amt, note })
        });
        const payload = await res.json().catch(()=>({}));
        if (!res.ok) throw new Error(payload?.message || payload?.error || res.status);
        setStatus(st, "Charge completed.", "ok");
      }catch(err){
        setStatus(st, `❌ ${err.message || err}`, "err");
      }
      */
      // demo only:
      setStatus(st, "(demo) Charge completed.", "ok");
    });

    // ----- Transit actions -----
    $("t_validateBtn")?.addEventListener("click", async ()=>{
      const pid  = $("pid")?.value.trim();
      const fare = parseFloat($("t_fare")?.value);
      const mode = $("t_mode")?.value;
      const st   = $("t_status");

      if (!pid)  return setStatus(st, "Passport ID required.", "err");
      if (!Number.isFinite(fare) || fare < 0) return setStatus(st, "Enter a valid fare.", "err");

      // Example wiring when transit endpoint exists
      setStatus(st, `(demo) ${mode} fare deducted: ${fare.toFixed(2)}`, "ok");
    });
  });
})();
