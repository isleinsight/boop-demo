// transactions.js

let currentPage = 1;
const transactionsPerPage = 10;

async function fetchTransactions() {
  const token = localStorage.getItem("boop_jwt");
  const urlParams = new URLSearchParams(window.location.search);
  const userId = urlParams.get("uid") || localStorage.getItem("selectedUserId");
  const offset = (currentPage - 1) * transactionsPerPage;

  if (!userId) {
    alert("User ID not found");
    return;
  }

  try {
    const res = await fetch(`/api/transactions/user/${userId}?limit=${transactionsPerPage}&offset=${offset}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) throw new Error("Failed to fetch transactions");
    const { transactions, totalCount } = await res.json();

    renderTransactions(transactions);
    updatePagination(totalCount);
  } catch (err) {
    console.error("❌ Error fetching transactions:", err.message);
    alert("Could not load transactions.");
  }
}

function renderTransactions(transactions) {
  const tableBody = document.querySelector("#transactionTable tbody");
  tableBody.innerHTML = "";

  if (!transactions.length) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center;">No transactions found</td></tr>`;
    return;
  }

  transactions.forEach(tx => {
    const createdAt = new Date(tx.created_at).toLocaleString();
    const amount = `$${(tx.amount_cents / 100).toFixed(2)}`;
    const direction = tx.type === "credit" ? "Received" : "Sent";
    const counterparty = tx.counterparty_name || "-";
    const noteBtn = tx.note
      ? `<button class="btn-view-note" data-note="${tx.note.replace(/"/g, '&quot;')}">View</button>`
      : "-";
    const id = tx.id || "-";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${createdAt}</td>
      <td>${amount}</td>
      <td>${tx.type === 'credit' ? `From ${counterparty}` : `To ${counterparty}`}</td>
      <td>${direction}</td>
      <td>${noteBtn}</td>
      <td>${id}</td>
    `;
    tableBody.appendChild(row);
  });

  attachNoteListeners();
}

function attachNoteListeners() {
  document.querySelectorAll(".btn-view-note").forEach(button => {
    button.addEventListener("click", () => {
      const noteText = button.dataset.note || "";
      showNote(noteText);
    });
  });
}

function updatePagination(totalCount) {
  const pageIndicator = document.getElementById("transactionPageIndicator");
  const prevBtn = document.getElementById("prevTransactions");
  const nextBtn = document.getElementById("nextTransactions");

  pageIndicator.textContent = `Page ${currentPage}`;

  prevBtn.style.display = currentPage === 1 ? "none" : "inline-block";
  nextBtn.style.display = currentPage * transactionsPerPage >= totalCount ? "none" : "inline-block";
}

document.getElementById("nextTransactions")?.addEventListener("click", () => {
  currentPage++;
  fetchTransactions();
});

document.getElementById("prevTransactions")?.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    fetchTransactions();
  }
});

function showNote(noteText) {
  const modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.background = "rgba(0, 0, 0, 0.6)";
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  modal.style.zIndex = "9999";

  const box = document.createElement("div");
  box.style.background = "#fff";
  box.style.padding = "20px";
  box.style.borderRadius = "8px";
  box.style.maxWidth = "400px";
  box.style.boxShadow = "0 4px 10px rgba(0, 0, 0, 0.3)";
  box.innerHTML = `
    <h3>Transaction Note</h3>
    <p style="white-space: pre-wrap;">${noteText}</p>
    <button style="margin-top: 20px;" onclick="this.closest('div').parentNode.remove()">Close</button>
  `;

  modal.appendChild(box);
  document.body.appendChild(modal);
}

// Initial load
fetchTransactions();
