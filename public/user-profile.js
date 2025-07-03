<script type="module">
// user-profile.js – PostgreSQL version ✅

document.addEventListener("DOMContentLoaded", () => {
  const userInfo = document.getElementById("userInfo");
  const editBtn = document.getElementById("editProfileBtn");
  const saveBtn = document.getElementById("saveProfileBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const addStudentBtn = document.getElementById("addStudentBtn");
  const parentSection = document.getElementById("parentSection");
  const studentSection = document.getElementById("studentSection");
  const parentNameEl = document.getElementById("parentName");
  const parentEmailEl = document.getElementById("parentEmail");
  const assignedStudentsList = document.getElementById("assignedStudentsList");
  const assignStudentForm = document.getElementById("assignStudentForm");
  const studentSearchInput = document.getElementById("studentSearchInput");
  const studentSearchBtn = document.getElementById("studentSearchBtn");
  const studentSearchResults = document.getElementById("studentSearchResults");
  const assignSelectedBtn = document.getElementById("assignSelectedStudentsBtn");
  const nextPageBtn = document.getElementById("nextStudentPageBtn");
  const prevPageBtn = document.getElementById("prevStudentPageBtn");

  // ✅ Use localStorage instead of query string
  let currentUserId = localStorage.getItem("selectedUserId");
  localStorage.removeItem("selectedUserId");

  let currentUserData = null;
  let editFirstName, editLastName, editEmail, editRole;
  let currentPage = 1;

  ...
