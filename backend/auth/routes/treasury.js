<script type="module">
    document.addEventListener("DOMContentLoaded", async () => {
      const user = JSON.parse(localStorage.getItem("boopUser"));
      const token = localStorage.getItem("boop_jwt");

      const userSearch = document.getElementById("userSearch");
      const suggestions = document.getElementById("userSuggestions");
      const treasuryAccount = document.getElementById("treasuryAccount");
      const amount = document.getElementById("amount");
      const note = document.getElementById("note");
      const addFundsBtn = document.getElementById("addFundsBtn");
      const statusEl = document.getElementById("status");
      const logoutBtn = document.getElementById("logoutBtn");

      const modal = document.getElementById("modal");
      const modalAmount = document.getElementById("modalAmount");
      const modalTreasury = document.getElementById("modalTreasury");
      const modalUser = document.getElementById("modalUser");
      const confirmModalBtn = document.getElementById("confirmModalBtn");
      const cancelModalBtn = document.getElementById("cancelModalBtn");

      let selectedUser = null;

      if (user?.type === "treasury") {
        document.getElementById("manageTreasuryLink").style.display = "block";
      }

      async function populateTreasuryAccounts() {
        try {
          if (user.type === "treasury") {
            const res = await fetch('/api/treasury/wallet-id', {
              headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok || !data.wallet_id) {
              throw new Error(data.error || "Missing wallet_id");
            }
            treasuryAccount.innerHTML = `<option value="${data.wallet_id}" selected>${user.email}'s Treasury</option>`;
            treasuryAccount.disabled = true;
          } else if (user.type === "accountant") {
            const res = await fetch('/api/treasury/treasury-wallets', {
              headers: { Authorization: `Bearer ${token}` }
            });
            console.log("Full response from /api/treasury/treasury-wallets:", {
              status: res.status,
              statusText: res.statusText,
              headers: Object.fromEntries(res.headers.entries())
            });
            const data = await res.json();
            console.log("Response body:", data);
            if (!res.ok) {
              console.error("Wallet fetch failed:", res.status, data);
              throw new Error(`Error ${res.status}: ${data.error || data.message || "Failed to fetch treasury wallets"}`);
            }
            treasuryAccount.innerHTML = `
              <option value="" disabled selected>Select a treasury account</option>
              ${data.map(w => `<option value="${w.id}">${w.name}</option>`).join("")}
            `;
          }
        } catch (err) {
          console.error("Treasury accounts error:", err);
          statusEl.textContent = `❌ Failed to load treasury accounts: ${err.message}`;
          statusEl.style.color = "red";
          addFundsBtn.disabled = true;
        }
      }

      await populateTreasuryAccounts();

      userSearch.addEventListener("input", async () => {
        const query = userSearch.value.trim();
        if (query.length < 2) {
          suggestions.style.display = "none";
          return;
        }

        try {
          const res = await fetch(`/api/users?search=${encodeURIComponent(query)}&hasWallet=true&assistanceOnly=true`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const users = await res.json();

          suggestions.innerHTML = users.length
            ? users.map(u => `
                <div class="user-suggestion" data-id="${u.id}" data-wallet="${u.wallet_id}">
                  ${u.first_name} ${u.last_name} (${u.email})
                </div>`).join("")
            : "<div>No results found</div>";

          suggestions.style.display = "block";
        } catch (err) {
          console.error("User search error:", err);
          suggestions.innerHTML = "<div>Error loading suggestions</div>";
          suggestions.style.display = "block";
        }
      });

      suggestions.addEventListener("click", (e) => {
        const item = e.target.closest(".user-suggestion");
        if (!item) return;
        selectedUser = {
          id: item.dataset.id,
          wallet_id: item.dataset.wallet,
          name: item.textContent
        };
        userSearch.value = item.textContent;
        suggestions.style.display = "none";
      });

      document.addEventListener("click", (e) => {
        if (!suggestions.contains(e.target) && e.target !== userSearch) {
          suggestions.style.display = "none";
        }
      });

      addFundsBtn.addEventListener("click", async () => {
        if (!selectedUser?.wallet_id || !amount.value || isNaN(amount.value) || amount.value <= 0 || !treasuryAccount.value) {
          statusEl.textContent = "Please complete all required fields with valid values.";
          statusEl.style.color = "red";
          return;
        }

        modalAmount.textContent = parseFloat(amount.value).toFixed(2);
        modalTreasury.textContent = treasuryAccount.options[treasuryAccount.selectedIndex].text;
        modalUser.textContent = selectedUser.name;
        modal.style.display = "flex";

        const confirmed = await new Promise((resolve, reject) => {
          confirmModalBtn.onclick = () => { modal.style.display = "none"; resolve(true); };
          cancelModalBtn.onclick = () => { modal.style.display = "none"; reject(new Error("Cancelled")); };
        });

        try {
          const res = await fetch("/api/transactions/add-funds", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              wallet_id: selectedUser.wallet_id,
              user_id: selectedUser.id,
              amount: parseFloat(amount.value),
              note: note.value,
              added_by: user.id,
              treasury_wallet_id: treasuryAccount.value
            })
          });

          const result = await res.json();
          if (res.ok) {
            statusEl.textContent = "✅ Funds transferred successfully!";
            statusEl.style.color = "green";
            userSearch.value = "";
            amount.value = "";
            note.value = "";
            treasuryAccount.value = "";
            selectedUser = null;
          } else {
            statusEl.textContent = `❌ ${result.error || "Transaction failed."}`;
            statusEl.style.color = "red";
          }
        } catch (err) {
          console.error("Fund transfer failed:", err);
          statusEl.textContent = `❌ ${err.message || "Unexpected error occurred."}`;
          statusEl.style.color = "red";
        }
      });

      logoutBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          await fetch("/api/logout", { method: "POST" });
        } catch {}
        localStorage.clear();
        window.location.href = "login.html";
      });

      console.log("✅ Add Funds script initialized");
    });
</script>
