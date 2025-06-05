<script type="module">
  import { getFirestore, collection, query, where, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

  const firebaseConfig = {
    apiKey: "AIzaSyDwXCiL7elRCyywSjVgwQtklq_98OPWZm0",
    authDomain: "boop-becff.firebaseapp.com",
    projectId: "boop-becff",
    storageBucket: "boop-becff.appspot.com",
    messagingSenderId: "570567453336",
    appId: "1:570567453336:web:43ac40b4cd9d5b517fbeed"
  };

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const parentSearchBtn = document.getElementById("parentSearchBtn");
  const studentSearchBtn = document.getElementById("studentSearchBtn");
  const assignButton = document.getElementById("assignButton");

  const parentResults = document.getElementById("parentResults");
  const studentResults = document.getElementById("studentResults");
  const statusMessage = document.getElementById("statusMessage");

  let selectedParentId = null;

  // 🔍 Search Parents
  parentSearchBtn.addEventListener("click", async () => {
    const searchTerm = document.getElementById("parentSearch").value.trim().toLowerCase();
    parentResults.innerHTML = "";
    selectedParentId = null;

    const q = query(collection(db, "users"), where("role", "==", "parent"));
    const querySnapshot = await getDocs(q);

    let found = false;

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const nameEmail = `${data.firstName} ${data.lastName} ${data.email}`.toLowerCase();

      if (nameEmail.includes(searchTerm)) {
        found = true;
        const btn = document.createElement("button");
        btn.textContent = `${data.firstName} ${data.lastName} (${data.email})`;
        btn.addEventListener("click", () => {
          selectedParentId = docSnap.id;
          parentResults.innerHTML = `<strong>Selected:</strong> ${data.firstName} ${data.lastName} (${data.email})`;
        });
        parentResults.appendChild(btn);
      }
    });

    if (!found) {
      parentResults.innerHTML = "<em>No matching parents found.</em>";
    }
  });

  // 🔍 Search Students
  studentSearchBtn.addEventListener("click", async () => {
    const searchTerm = document.getElementById("studentSearch").value.trim().toLowerCase();
    studentResults.innerHTML = "";

    const q = query(collection(db, "users"), where("role", "==", "student"));
    const querySnapshot = await getDocs(q);

    let found = false;

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const nameEmail = `${data.firstName} ${data.lastName} ${data.email}`.toLowerCase();

      if (nameEmail.includes(searchTerm)) {
        found = true;
        const label = document.createElement("label");
        label.classList.add("student-checkbox");

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = docSnap.id;

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${data.firstName} ${data.lastName} (${data.email})`));
        studentResults.appendChild(label);
      }
    });

    if (!found) {
      studentResults.innerHTML = "<em>No matching students found.</em>";
    }
  });

  // ✅ Assign Students to Selected Parent
  assignButton.addEventListener("click", async () => {
    if (!selectedParentId) {
      statusMessage.textContent = "Please select a parent first.";
      statusMessage.style.color = "red";
      return;
    }

    const selectedStudentIds = Array.from(studentResults.querySelectorAll("input[type=checkbox]:checked"))
      .map(cb => cb.value);

    if (selectedStudentIds.length === 0) {
      statusMessage.textContent = "Please select at least one student.";
      statusMessage.style.color = "red";
      return;
    }

    try {
      const parentRef = doc(db, "users", selectedParentId);
      await updateDoc(parentRef, {
        children: selectedStudentIds
      });

      statusMessage.textContent = "Students successfully assigned to parent!";
      statusMessage.style.color = "green";
    } catch (error) {
      console.error("Assignment error:", error);
      statusMessage.textContent = "An error occurred while assigning students.";
      statusMessage.style.color = "red";
    }
  });
</script>
