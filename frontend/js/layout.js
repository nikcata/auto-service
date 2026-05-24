const PASSWORD_PATTERN = /^(?=.*[A-Za-zА-Яа-я])(?=.*\d).{4,8}$/;

function logout(options = {}) {
    if (options.confirm && !confirm("Сигурен ли си, че искаш да излезеш?")) {
        return;
    }

    clearStoredFormDrafts();

    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    state.token = null;
    state.user = null;
    render();
}

function render() {
    if (!state.token) {
        renderAuth();
        return;
    }

    if (!isAdmin() && ["users", "archive"].includes(state.view)) {
        state.view = "dashboard";
        sessionStorage.setItem("currentView", state.view);
    }

    renderLayout();
    loadView();
}

function isAdmin() {
    return state.user?.role === "admin";
}

function renderAuth(mode = "login", presetUsername = "") {
    const isPasswordReset = mode === "password-reset";

    app.innerHTML = `
        <section class="auth-shell">
            <div class="auth-card">
                <div class="brand">
                    <img class="brand-logo" src="assets/autoservice.png" alt="nmmotorsport">
                    <p>Управление на клиенти, автомобили, ремонти и фактури</p>
                </div>
                <p data-notice hidden></p>
                ${isPasswordReset ? `
                    <form class="form" data-password-reset-form>
                        <label>
                            Потребителско име
                            <input name="username" value="${escapeHtml(presetUsername)}" required autocomplete="username">
                        </label>
                        <label>
                            Нова парола
                            <input name="password" type="password" required autocomplete="new-password" minlength="4" maxlength="8" pattern="(?=.*[A-Za-zА-Яа-я])(?=.*\\d).{4,8}" title="Паролата трябва да е 4-8 символа и да съдържа поне една буква и една цифра">
                        </label>
                        <label>
                            Повтори паролата
                            <input name="confirm_password" type="password" required autocomplete="new-password" minlength="4" maxlength="8" pattern="(?=.*[A-Za-zА-Яа-я])(?=.*\\d).{4,8}" title="Паролата трябва да е 4-8 символа и да съдържа поне една буква и една цифра">
                        </label>
                        <button class="primary" type="submit">Запази парола</button>
                        <button class="secondary" data-show-login type="button">Назад към вход</button>
                    </form>
                ` : `
                    <form class="form" data-auth-form="login">
                        <label>
                            Потребителско име
                            <input name="username" required autocomplete="username">
                        </label>
                        <label>
                            Парола
                            <input name="password" type="password" required autocomplete="current-password">
                        </label>
                        <button class="primary" type="submit">Вход</button>
                        <button class="secondary" data-show-password-reset type="button">Задай/смени парола</button>
                    </form>
                `}
            </div>
        </section>
    `;

    document.querySelector("[data-auth-form]")?.addEventListener("submit", handleAuth);
    document.querySelector("[data-password-reset-form]")?.addEventListener("submit", handlePasswordReset);
    document.querySelector("[data-show-password-reset]")?.addEventListener("click", () => renderAuth("password-reset"));
    document.querySelector("[data-show-login]")?.addEventListener("click", () => renderAuth("login"));
}

async function handleAuth(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());

    try {
        const result = await api("/login", {
            method: "POST",
            body: JSON.stringify(values)
        });

        clearStoredFormDrafts();

        state.token = result.token;
        state.user = result.user;
        state.view = "dashboard";
        sessionStorage.setItem("token", result.token);
        sessionStorage.setItem("user", JSON.stringify(result.user));
        sessionStorage.setItem("currentView", state.view);
        render();
    } catch (error) {
        const username = String(values.username || "").trim();

        if (error.code === "PASSWORD_SETUP_REQUIRED") {
            renderAuth("password-reset", username);
            setNotice("Този потребител още няма парола. Задай парола, за да продължиш.", true);
            return;
        }

        setNotice(error.message, true);
    }
}

async function handlePasswordReset(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());

    if (values.password !== values.confirm_password) {
        setNotice("Паролите не съвпадат.", true);
        return;
    }

    if (!PASSWORD_PATTERN.test(values.password || "")) {
        setNotice("Паролата трябва да е 4-8 символа и да съдържа поне една буква и една цифра.", true);
        return;
    }

    try {
        await api("/password/reset", {
            method: "POST",
            body: JSON.stringify({
                username: values.username,
                password: values.password
            })
        });

        renderAuth("login");
        setNotice("Паролата е запазена. Влез с новата парола.");
    } catch (error) {
        setNotice(error.message, true);
    }
}

function renderLayout() {
    const items = [
        ["dashboard", "Табло"],
        ["customers", "Клиенти"],
        ["cars", "Автомобили"],
        ["repairs", "Ремонти"],
        ["appointments", "Календар"],
        ["invoices", "Фактури"]
    ];

    if (isAdmin()) {
        items.push(["archive", "Архив"]);
        items.push(["users", "Потребители"]);
    }

    app.innerHTML = `
        <div class="layout">
            <aside class="sidebar">
                <img class="sidebar-logo" src="assets/autoservice.png" alt="nmmotorsport">
                <nav class="nav">
                    ${items.map(([id, label]) => `<button class="${state.view === id ? "active" : ""}" data-view="${id}">${label}</button>`).join("")}
                    <button data-logout>Изход</button>
                </nav>
            </aside>
            <section class="main">
                <div class="topbar">
                    <div>
                        <h2 data-title></h2>
                    </div>
                </div>
                <p data-notice hidden></p>
                <div id="view"></div>
            </section>
        </div>
    `;

    document.querySelectorAll("[data-view]").forEach((button) => {
        button.addEventListener("click", () => {
            state.view = button.dataset.view;
            sessionStorage.setItem("currentView", state.view);
            render();
        });
    });

    document.querySelector("[data-logout]").addEventListener("click", () => logout({ confirm: true }));
}

async function loadView() {
    const title = document.querySelector("[data-title]");
    const view = document.getElementById("view");

    try {
        if (state.view === "dashboard") {
            title.textContent = "Табло";
            await renderDashboard(view);
        } else if (state.view === "customers") {
            title.textContent = "Клиенти";
            await renderCustomers(view);
        } else if (state.view === "cars") {
            title.textContent = "Автомобили";
            await renderCars(view);
        } else if (state.view === "repairs") {
            title.textContent = "Ремонти";
            await renderRepairs(view);
        } else if (state.view === "appointments") {
            title.textContent = "Календар";
            await renderAppointments(view);
        } else if (state.view === "invoices") {
            title.textContent = "Фактури";
            await renderInvoices(view);
        } else if (state.view === "archive") {
            title.textContent = "Архив";
            await renderArchive(view);
        } else if (state.view === "users") {
            title.textContent = "Потребители";
            await renderUsers(view);
        }
        bindFormDrafts(view);
        setupSearchableSelects(view);
    } catch (error) {
        view.innerHTML = `<div class="card"><p class="empty">${escapeHtml(error.message)}</p></div>`;
    }
}
