/* Login and signup forms with validation and server error display. */
(async function () {
  await Components.init();
  const $ = (id) => document.getElementById(id);
  const esc = Components.esc;
  // Only allow redirects to pages on this site (prevents open-redirect links).
  const rawNext = Components.param("next") || "";
  const next = /^[a-z0-9_-]+\.html(\?[^#]*)?$/i.test(rawNext) ? rawNext : "index.html";

  // Already signed in? Go where the visitor wanted to go.
  if (Components.user) { location.href = next; return; }

  const loginForm = $("loginForm");
  const signupForm = $("signupForm");

  function setMode(mode) {
    const login = mode === "login";
    loginForm.style.display = login ? "block" : "none";
    signupForm.style.display = login ? "none" : "block";
    $("tabLogin").classList.toggle("active", login);
    $("tabSignup").classList.toggle("active", !login);
  }
  $("tabLogin").onclick = () => setMode("login");
  $("tabSignup").onclick = () => setMode("signup");
  if (Components.param("mode") === "signup") setMode("signup");

  function clearErrors(form) {
    form.querySelectorAll("[data-err]").forEach((el) => (el.textContent = ""));
    form.querySelectorAll(".input").forEach((el) => el.classList.remove("invalid"));
  }
  function showErrors(form, errors, formMessage) {
    clearErrors(form);
    Object.entries(errors || {}).forEach(([field, msg]) => {
      const el = form.querySelector(`[data-err="${field}"]`);
      if (el) el.textContent = msg;
      const input = form.querySelector(`[name="${field}"]`);
      if (input) input.classList.add("invalid");
    });
    if (formMessage) form.querySelector('[data-err="_form"]').textContent = formMessage;
  }

  function setBusy(btn, busy, label) {
    btn.disabled = busy;
    btn.textContent = busy ? "Please wait…" : label;
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = loginForm.email.value.trim();
    const password = loginForm.password.value;
    const local = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) local.email = "Enter a valid email address.";
    if (!password) local.password = "Enter your password.";
    if (Object.keys(local).length) return showErrors(loginForm, local);

    const btn = loginForm.querySelector("button[type=submit]");
    setBusy(btn, true, "Login");
    try {
      await API.post("/auth/login", { email, password });
      Components.toast("Welcome back!");
      location.href = next;
    } catch (err) {
      showErrors(loginForm, err.errors, err.message);
      setBusy(btn, false, "Login");
    }
  });

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = signupForm;
    const local = {};
    if (f.name.value.trim().length < 2) local.name = "Enter your full name (at least 2 characters).";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.value.trim())) local.email = "Enter a valid email address.";
    if (f.phone.value.trim() && !/^[6-9]\d{9}$/.test(f.phone.value.replace(/[\s-]/g, ""))) local.phone = "Enter a valid 10-digit mobile number.";
    if (f.password.value.length < 8) local.password = "Use at least 8 characters.";
    else if (!/[A-Za-z]/.test(f.password.value) || !/\d/.test(f.password.value)) local.password = "Use at least one letter and one number.";
    if (f.confirm_password.value !== f.password.value) local.confirm_password = "Passwords do not match.";
    if (Object.keys(local).length) return showErrors(f, local);

    const btn = f.querySelector("button[type=submit]");
    setBusy(btn, true, "Create account");
    try {
      await API.post("/auth/signup", {
        name: f.name.value.trim(),
        email: f.email.value.trim(),
        phone: f.phone.value.trim(),
        password: f.password.value,
        confirm_password: f.confirm_password.value,
      });
      Components.toast("Account created. Welcome!");
      location.href = next;
    } catch (err) {
      showErrors(f, err.errors, err.message);
      setBusy(btn, false, "Create account");
    }
  });
})();
