const form = document.querySelector(".login-form");
const emailInput = form?.querySelector("input[name='email']");
const continueButton = form?.querySelector("[data-relay-email]");

continueButton?.addEventListener("click", () => {
  const email = emailInput?.value.trim();
  const action = form.getAttribute("action").split("?")[0];
  if (email) {
    form.setAttribute(
      "action",
      `${action}?auth_params=${encodeURIComponent(`email=${email}`)}`,
    );
  } else {
    form.setAttribute("action", action);
  }
});
