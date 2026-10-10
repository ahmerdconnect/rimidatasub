// RIMIDATASUB WEBSITE JAVASCRIPT

document.addEventListener("DOMContentLoaded", function () {

    const menuButton = document.getElementById("menuButton");
    const navigation = document.getElementById("navigation");

    const serviceDialog = document.getElementById("serviceDialog");
    const dialogTitle = document.getElementById("dialogTitle");
    const dialogMessage = document.getElementById("dialogMessage");

    const accountDialog = document.getElementById("accountDialog");
    const accountTitle = document.getElementById("accountTitle");
    const accountMessage = document.getElementById("accountMessage");

    const nameLabel = document.getElementById("nameLabel");
    const fullName = document.getElementById("fullName");
    const contact = document.getElementById("contact");
    const password = document.getElementById("password");

    const accountSubmit = document.getElementById("accountSubmit");
    const switchText = document.getElementById("switchText");
    const switchButton = document.getElementById("switchButton");

    let accountMode = "signup";

    // Show current year
    document.getElementById("year").textContent =
        new Date().getFullYear();

    // Mobile navigation
    menuButton.addEventListener("click", function () {
        navigation.classList.toggle("open");
    });

    // Close mobile navigation after selecting a link
    document.querySelectorAll("#navigation a").forEach(function (link) {
        link.addEventListener("click", function () {
            navigation.classList.remove("open");
        });
    });

    // Service information
    const serviceDescriptions = {
        "Data":
            "Choose your mobile network and preferred data plan. Real data purchases will be enabled after a VTU provider is connected.",

        "Airtime":
            "Top up a mobile number. Real airtime purchases will be enabled after a VTU provider is connected.",

        "WAEC PIN":
            "The WAEC PIN service will be enabled after an approved supplier is connected.",

        "NECO PIN":
            "The NECO PIN service will be enabled after an approved supplier is connected.",

        "Wallet":
            "The secure wallet and transaction history will be developed in a later stage.",

        "Transaction History":
            "Your account will show transaction records after the secure backend and database are connected."
    };

    // Open service dialog
    document.querySelectorAll("[data-service]").forEach(function (button) {

        button.addEventListener("click", function () {

            const service = button.getAttribute("data-service");

            dialogTitle.textContent = service;
            dialogMessage.textContent =
                serviceDescriptions[service] ||
                "This service is planned for RIMIDATASUB.";

            serviceDialog.showModal();

        });

    });

    // Open account form
    function openAccount(mode) {

        accountMode = mode;

        accountTitle.textContent =
            mode === "signup" ? "Create Account" : "Login";

        nameLabel.hidden = mode === "login";

        password.setAttribute(
            "autocomplete",
            mode === "signup" ? "new-password" : "current-password"
        );

        accountSubmit.textContent =
            mode === "signup" ? "Preview Registration" : "Preview Login";

        switchText.textContent =
            mode === "signup"
                ? "Already have an account?"
                : "New to RIMIDATASUB?";

        switchButton.textContent =
            mode === "signup" ? "Login" : "Create Account";

        accountMessage.textContent = "";

        accountDialog.showModal();
    }

    // Login button
    document.getElementById("loginButton").addEventListener(
        "click",
        function () {
            openAccount("login");
        }
    );

    // Signup button
    document.getElementById("signupButton").addEventListener(
        "click",
        function () {
            openAccount("signup");
        }
    );

    // Get started button
    document.getElementById("startButton").addEventListener(
        "click",
        function () {
            openAccount("signup");
        }
    );

    // Switch between signup and login
    switchButton.addEventListener("click", function () {

        openAccount(
            accountMode === "signup" ? "login" : "signup"
        );

    });

    // Validate the demo account form
    accountSubmit.addEventListener("click", function () {

        const enteredContact = contact.value.trim();
        const enteredPassword = password.value;
        const enteredName = fullName.value.trim();

        if (
            accountMode === "signup" &&
            enteredName.length === 0
        ) {
            accountMessage.textContent =
                "Please enter your full name.";
            return;
        }

        if (enteredContact.length === 0) {
            accountMessage.textContent =
                "Please enter your email or phone number.";
            return;
        }

        if (enteredPassword.length < 8) {
            accountMessage.textContent =
                "Your password must be at least 8 characters.";
            return;
        }

        accountMessage.textContent =
            "This is a demo form only. Real account registration and login will be connected to the secure backend later.";

    });

    console.log("RIMIDATASUB website loaded successfully.");

});
