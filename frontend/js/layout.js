function logout(options = {}) {
    if (options.confirm && !confirm("Сигурен ли си, че искаш да излезеш?")) {
        return;
    }

    localStorage.removeItem("token");
    localStorage.removeItem("user");
    state.token = null;
    state.user = null;
    render();
}

function render() {
    if (!state.token) {
        renderAuth();
        return;
    }

    if (!isAdmin() && state.view === "users") {
        state.view = "dashboard";
        localStorage.setItem("currentView", state.view);
    }

    renderLayout();
    loadView();
}

function isAdmin() {
    return state.user?.role === "admin";
}

function renderAuth() {
    app.innerHTML = `
        <section class="auth-shell">
            <div class="auth-card">
                <div class="brand">
                    <img class="brand-logo" src="assets/autoservice.png" alt="nmmotorsport">
                    <p>Управление на клиенти, автомобили, ремонти и фактури</p>
                </div>
                <p data-notice hidden></p>
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
                </form>
            </div>
        </section>
    `;

    document.querySelector("[data-auth-form]").addEventListener("submit", handleAuth);
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

        state.token = result.token;
        state.user = result.user;
        state.view = "dashboard";
        localStorage.setItem("token", result.token);
        localStorage.setItem("user", JSON.stringify(result.user));
        localStorage.setItem("currentView", state.view);
        render();
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
            localStorage.setItem("currentView", state.view);
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
        } else if (state.view === "users") {
            title.textContent = "Потребители";
            await renderUsers(view);
        }
    } catch (error) {
        view.innerHTML = `<div class="card"><p class="empty">${escapeHtml(error.message)}</p></div>`;
    }
}
