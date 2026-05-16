const API_URL = "";

const state = {
    view: localStorage.getItem("currentView") || "dashboard",
    incomePeriod: localStorage.getItem("incomePeriod") || "month",
    dashboardMonth: localStorage.getItem("dashboardMonth") || "",
    selectedRepairId: localStorage.getItem("selectedRepairId") || "",
    user: JSON.parse(localStorage.getItem("user") || "null"),
    token: localStorage.getItem("token"),
    data: {}
};

const incomePeriodLabels = {
    week: "Седмица",
    month: "Месец",
    three_months: "3 месеца",
    year: "Година"
};

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
const VIN_ERROR_MESSAGE = "VIN трябва да бъде точно 17 символа и да съдържа само цифри и букви без I, O и Q.";

const app = document.getElementById("app");
const modalRoot = document.createElement("div");
modalRoot.id = "modal-root";
document.body.appendChild(modalRoot);

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function money(value) {
    return `${Number(value || 0).toFixed(2)} EUR`;
}

function formatDate(value) {
    if (!value) return "-";
    return new Date(value).toLocaleDateString("bg-BG");
}

function formatInputDate(value) {
    if (!value) return "";
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatDateTime(value) {
    if (!value) return "-";
    return new Date(value).toLocaleString("bg-BG");
}

function dateKey(value) {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function monthKey(value) {
    const date = value ? new Date(value) : new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");

    return `${year}-${month}`;
}

function monthDateFromKey(value) {
    const key = value || monthKey();
    const [year, month] = key.split("-").map(Number);

    return new Date(year, month - 1, 1);
}

async function api(path, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (state.token) {
        headers.Authorization = `Bearer ${state.token}`;
    }

    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers
    });

    const text = await response.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch (error) {
            throw new Error("Server returned an invalid response. Restart the backend and try again.");
        }
    }

    if (!response.ok) {
        const message = data?.error || data?.message || "Request failed";

        if (state.token && (response.status === 401 || response.status === 403) && message.toLowerCase().includes("token")) {
            logout();
            throw new Error("Session expired. Please log in again.");
        }

        throw new Error(message);
    }

    return data;
}

function normalizeFormValues(values) {
    Object.keys(values).forEach((key) => {
        if (key === "vin" && typeof values[key] === "string") {
            values[key] = values[key].trim().toUpperCase();
        }

        if (typeof values[key] === "string" && values[key].includes("T") && key.includes("date")) {
            values[key] = values[key].replace("T", " ");
        }
    });

    return values;
}

function validateFormValues(values) {
    if (values.vin && !VIN_PATTERN.test(values.vin)) {
        throw new Error(VIN_ERROR_MESSAGE);
    }
}

function bindVinInputs(scope = document) {
    scope.querySelectorAll("[data-vin-input]").forEach((input) => {
        input.addEventListener("input", () => {
            input.value = input.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .replace(/[IOQ]/g, "")
                .slice(0, 17);
        });
    });
}

function setNotice(message, isError = false) {
    const box = document.querySelector("[data-notice]");
    if (!box) return;

    box.className = `notice${isError ? " error" : ""}`;
    box.textContent = message;
    box.hidden = false;
}

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

async function renderDashboard(view) {
    const [stats, appointments] = await Promise.all([
        api(`/stats?income_period=${encodeURIComponent(state.incomePeriod)}`),
        api("/appointments")
    ]);
    const periodOptions = Object.entries(incomePeriodLabels)
        .map(([value, label]) => `<option value="${value}" ${state.incomePeriod === value ? "selected" : ""}>${label}</option>`)
        .join("");
    const incomeCard = isAdmin()
        ? `
            <div class="card stat stat-button income-card" data-toggle-income>
                <div class="income-card-head">
                    <span>Приходи</span>
                    <select data-income-period>
                        ${periodOptions}
                    </select>
                </div>
                <strong data-income-value data-hidden-value="••••" data-visible-value="${money(stats.total_income)}">••••</strong>
                <small>Натисни за показване</small>
            </div>
        `
        : `
            <div class="card stat income-card income-card-locked">
                <div class="income-card-head">
                    <span>Приходи</span>
                </div>
                <strong>••••</strong>
                <small>Само за админ</small>
            </div>
        `;

    if (!state.dashboardMonth) {
        state.dashboardMonth = monthKey();
        localStorage.setItem("dashboardMonth", state.dashboardMonth);
    }

    view.innerHTML = `
        <div class="section">
            <div class="grid">
                <div class="card stat"><span>Клиенти</span><strong>${stats.total_customers}</strong></div>
                <div class="card stat"><span>Ремонти</span><strong>${stats.total_repairs}</strong></div>
                ${incomeCard}
            </div>
            <div class="card">
                <div data-dashboard-calendar>
                    ${dashboardCalendar(appointments)}
                </div>
            </div>
        </div>
    `;

    if (isAdmin()) {
        document.querySelector("[data-income-period]").addEventListener("change", (event) => {
            state.incomePeriod = event.target.value;
            localStorage.setItem("incomePeriod", state.incomePeriod);
            renderDashboard(view);
        });

        document.querySelector("[data-toggle-income]").addEventListener("click", (event) => {
            if (event.target.closest("[data-income-period]")) return;

            const value = document.querySelector("[data-income-value]");
            const isHidden = value.textContent === value.dataset.hiddenValue;

            value.textContent = isHidden ? value.dataset.visibleValue : value.dataset.hiddenValue;
            document.querySelector("[data-toggle-income] small").textContent = isHidden ? "Натисни за скриване" : "Натисни за показване";
        });
    }

    bindDashboardCalendarActions(appointments);
}

function dashboardCalendar(appointments) {
    const monthDate = monthDateFromKey(state.dashboardMonth);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - startOffset);
    const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
    const weekdays = ["Пон", "Вто", "Сря", "Чет", "Пет", "Съб", "Нед"];
    const todayKey = dateKey(new Date());
    const appointmentsByDay = appointments.reduce((groups, appointment) => {
        const key = dateKey(appointment.appointment_date);
        groups[key] = groups[key] || [];
        groups[key].push(appointment);
        return groups;
    }, {});

    Object.values(appointmentsByDay).forEach((items) => {
        items.sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date));
    });

    const days = Array.from({ length: totalCells }, (_, index) => {
        const day = new Date(gridStart);
        day.setDate(gridStart.getDate() + index);
        const key = dateKey(day);
        const dayAppointments = appointmentsByDay[key] || [];
        const isCurrentMonth = day.getMonth() === month;
        const isToday = key === todayKey;

        return `
            <div class="dashboard-calendar-day ${isCurrentMonth ? "" : "muted-day"} ${isToday ? "today" : ""}">
                <div class="dashboard-calendar-date">
                    <span>${day.getDate()}</span>
                    ${dayAppointments.length ? `<strong>${dayAppointments.length}</strong>` : ""}
                </div>
                <div class="dashboard-calendar-items">
                    ${dayAppointments.map((appointment) => dashboardCalendarAppointment(appointment)).join("")}
                </div>
            </div>
        `;
    }).join("");

    return `
        <div class="dashboard-calendar">
            <div class="dashboard-calendar-head">
                <div>
                    <h3>Месечен календар</h3>
                    <p>${monthDate.toLocaleDateString("bg-BG", { month: "long", year: "numeric" })}</p>
                </div>
                <div class="dashboard-calendar-controls">
                    <button class="secondary small" data-dashboard-month="prev" type="button">‹</button>
                    <button class="secondary small" data-dashboard-month="today" type="button">Днес</button>
                    <button class="secondary small" data-dashboard-month="next" type="button">›</button>
                </div>
            </div>
            <div class="dashboard-calendar-weekdays">
                ${weekdays.map((day) => `<span>${day}</span>`).join("")}
            </div>
            <div class="dashboard-calendar-grid">
                ${days}
            </div>
        </div>
    `;
}

function appointmentStatusLabel(status) {
    const labels = {
        scheduled: "Записан",
        completed: "Завършен",
        cancelled: "Отказан"
    };

    return labels[status] || status || "-";
}

function dashboardCalendarAppointment(appointment) {
    const time = new Date(appointment.appointment_date).toLocaleTimeString("bg-BG", {
        hour: "2-digit",
        minute: "2-digit"
    });
    const status = appointment.status || "scheduled";
    const statusText = appointmentStatusLabel(status);

    return `
        <button class="dashboard-calendar-appointment appointment-${escapeHtml(status)}" data-dashboard-appointment="${appointment.id}" type="button">
            <span>${escapeHtml(time)} · ${escapeHtml(appointment.customer_name || "-")}</span>
            <small>${escapeHtml(statusText)}</small>
        </button>
    `;
}

function bindDashboardCalendarActions(appointments) {
    document.querySelectorAll("[data-dashboard-month]").forEach((button) => {
        button.addEventListener("click", () => {
            const current = monthDateFromKey(state.dashboardMonth);

            if (button.dataset.dashboardMonth === "prev") {
                current.setMonth(current.getMonth() - 1);
            } else if (button.dataset.dashboardMonth === "next") {
                current.setMonth(current.getMonth() + 1);
            } else {
                const today = new Date();
                current.setFullYear(today.getFullYear(), today.getMonth(), 1);
            }

            state.dashboardMonth = monthKey(current);
            localStorage.setItem("dashboardMonth", state.dashboardMonth);
            document.querySelector("[data-dashboard-calendar]").innerHTML = dashboardCalendar(appointments);
            bindDashboardCalendarActions(appointments);
        });
    });

    document.querySelectorAll("[data-dashboard-appointment]").forEach((button) => {
        button.addEventListener("click", () => {
            const appointment = appointments.find((item) => String(item.id) === String(button.dataset.dashboardAppointment));
            if (appointment) showAppointmentModal(appointment);
        });
    });
}

function showAppointmentModal(appointment) {
    const car = `${appointment.brand || ""} ${appointment.model || ""}`.trim();
    const status = appointment.status || "scheduled";

    modalRoot.innerHTML = `
        <div class="modal-backdrop" data-close-modal>
            <div class="modal-card" role="dialog" aria-modal="true" aria-label="Детайли за запис">
                <div class="modal-head">
                    <div>
                        <h3>Детайли за запис</h3>
                        <p>${escapeHtml(formatDateTime(appointment.appointment_date))}</p>
                    </div>
                    <button class="secondary small" data-close-modal type="button">Затвори</button>
                </div>
                <div class="appointment-modal-body">
                    <strong class="appointment-status status-${escapeHtml(status)}">${escapeHtml(appointmentStatusLabel(status))}</strong>
                    <p><b>Клиент:</b> ${escapeHtml(appointment.customer_name || "-")}</p>
                    <p><b>Телефон:</b> ${escapeHtml(appointment.customer_phone || "-")}</p>
                    <p><b>Автомобил:</b> ${car ? escapeHtml(car) : "-"} ${appointment.registration_number ? `(${escapeHtml(appointment.registration_number)})` : ""}</p>
                    <p><b>Проблем:</b> ${escapeHtml(appointment.reason || "Без описание")}</p>
                </div>
            </div>
        </div>
    `;

    modalRoot.querySelectorAll("[data-close-modal]").forEach((element) => {
        element.addEventListener("click", (event) => {
            if (event.target === element) {
                modalRoot.innerHTML = "";
            }
        });
    });
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        modalRoot.innerHTML = "";
    }
});

async function renderCustomers(view) {
    const customers = await api("/customers");
    view.innerHTML = `
        <div class="grid two">
            <div class="card">
                <h3>Нов клиент</h3>
                <form class="form" data-customer-form>
                    <label>Име<input name="full_name" required></label>
                    <label>Телефон<input name="phone"></label>
                    <button class="primary">Запази</button>
                </form>
            </div>
            <div class="card">
                <h3>Списък</h3>
                <div class="search-line customer-search">
                    <input data-customer-search placeholder="Търси по име или телефон">
                </div>
                <div data-customers-list></div>
            </div>
        </div>
    `;

    document.querySelector("[data-customer-form]").addEventListener("submit", submitJson("/customers", "POST"));

    const renderCustomerList = (items) => {
        document.querySelector("[data-customers-list]").innerHTML = customerTable(items);
        bindCustomerActions();
    };

    renderCustomerList(customers);

    document.querySelector("[data-customer-search]").addEventListener("input", (event) => {
        const query = event.target.value.trim().toLowerCase();
        const filteredCustomers = customers.filter((customer) => {
            const searchableText = [
                customer.full_name,
                customer.phone
            ].join(" ").toLowerCase();

            return searchableText.includes(query);
        });

        renderCustomerList(filteredCustomers);
    });
}

function customerTable(customers) {
    return table(["ID", "Име", "Телефон", "Действия"], customers.map((c) => [
        c.id,
        escapeHtml(c.full_name),
        escapeHtml(c.phone || "-"),
        `<button class="danger small" data-delete-customer="${c.id}">Изтрий</button>`
    ]));
}

function bindCustomerActions() {
    document.querySelectorAll("[data-delete-customer]").forEach((button) => {
        button.addEventListener("click", () => {
            deleteRecord(
                `/customers/${button.dataset.deleteCustomer}`,
                "Да изтрия ли този клиент? Свързаните автомобили, ремонти, части, часове и фактури също ще бъдат изтрити."
            );
        });
    });
}

async function renderCars(view) {
    const [customers, cars] = await Promise.all([api("/customers"), api("/cars")]);
    view.innerHTML = `
        <div class="section">
            <div class="card">
                <h3>Нов автомобил</h3>
                <form class="form" data-car-form>
                    <div class="form-row">
                        <label>Клиент<select name="customer_id" required>${options(customers, "id", "full_name")}</select></label>
                        <label>Марка<input name="brand" required></label>
                    </div>
                    <div class="form-row">
                        <label>Модел<input name="model" required></label>
                        <label>Година<input name="year" type="number"></label>
                    </div>
                    <div class="form-row">
                        <label>Рег. номер<input name="registration_number"></label>
                        <label>VIN<input name="vin" data-vin-input maxlength="17" pattern="[A-HJ-NPR-Z0-9]{17}" title="VIN трябва да бъде точно 17 символа и да съдържа само цифри и букви без I, O и Q." placeholder="17 символа"></label>
                    </div>
                    <div class="form-row">
                        <label>Двигател<input name="engine"></label>
                        <label>Километри<input name="mileage" type="number"></label>
                    </div>
                    <button class="primary">Запази</button>
                </form>
            </div>
            <div class="card">
                <h3>Списък</h3>
                <div class="search-line car-search">
                    <input data-car-search placeholder="Търси по клиент, марка, модел, рег. номер или VIN">
                </div>
                <div data-cars-list></div>
            </div>
        </div>
    `;

    document.querySelector("[data-car-form]").addEventListener("submit", submitJson("/cars", "POST"));
    bindVinInputs(view);

    const renderCarList = (items) => {
        document.querySelector("[data-cars-list]").innerHTML = carTable(items);
        bindCarActions();
    };

    renderCarList(cars);

    document.querySelector("[data-car-search]").addEventListener("input", (event) => {
        const query = event.target.value.trim().toLowerCase();
        const filteredCars = cars.filter((car) => {
            const searchableText = [
                car.customer_name,
                car.brand,
                car.model,
                car.registration_number,
                car.vin
            ].join(" ").toLowerCase();

            return searchableText.includes(query);
        });

        renderCarList(filteredCars);
    });
}

function carTable(cars) {
    return table(["ID", "Клиент", "Автомобил", "Рег. номер", "VIN", "Действия"], cars.map((c) => [
        c.id,
        escapeHtml(c.customer_name),
        escapeHtml(`${c.brand} ${c.model}`),
        escapeHtml(c.registration_number || "-"),
        escapeHtml(c.vin || "-"),
        `<button class="danger small" data-delete-car="${c.id}">Изтрий</button>`
    ]));
}

function bindCarActions() {
    document.querySelectorAll("[data-delete-car]").forEach((button) => {
        button.addEventListener("click", () => deleteRecord(`/cars/${button.dataset.deleteCar}`, "Да изтрия ли този автомобил? Свързаните ремонти също ще бъдат изтрити."));
    });
}

async function renderRepairs(view) {
    const [repairs, appointments] = await Promise.all([api("/repairs"), api("/appointments")]);
    const openRepairs = repairs.filter((repair) => repair.status !== "completed");
    const completedRepairs = repairs.filter((repair) => repair.status === "completed");
    const repairAppointmentIds = new Set(repairs.map((repair) => String(repair.appointment_id)).filter(Boolean));
    const selectedRepairExists = openRepairs.some((repair) => String(repair.id) === String(state.selectedRepairId));
    const selectedRepairId = selectedRepairExists ? state.selectedRepairId : openRepairs[0]?.id || "";
    const selectedRepair = selectedRepairId ? await api(`/repairs/${selectedRepairId}`) : null;
    const availableAppointments = appointments.filter((appointment) => {
        return appointment.status !== "cancelled" && !repairAppointmentIds.has(String(appointment.id));
    });

    view.innerHTML = `
        <div class="section">
            <div class="card">
                <h3>Ремонт от календар</h3>
                ${availableAppointments.length ? `
                    <form class="form" data-start-repair-form>
                        <label>Записан час
                            <select name="appointment_id" required>
                                ${options(availableAppointments, "id", (a) => `${formatDateTime(a.appointment_date)} - ${a.registration_number || "-"} - ${a.brand} ${a.model}`)}
                            </select>
                        </label>
                        <button class="primary">Започни ремонт</button>
                    </form>
                ` : `<p class="empty">Няма свободни записани часове от календара.</p>`}
            </div>
            <div class="card">
                <h3>Добави част</h3>
                ${openRepairs.length ? `
                    <form class="form" data-part-form>
                        <label>Ремонт<select name="repair_id" required>${options(openRepairs, "id", (r) => `#${r.id} - ${r.registration_number || "-"} - ${formatDate(r.repair_date)}`, selectedRepairId)}</select></label>
                        <div class="form-row">
                            <label>Част<input name="part_name" required></label>
                            <label>Марка<input name="brand"></label>
                        </div>
                        <div class="form-row">
                            <label>Брой<input name="quantity" type="number" value="1"></label>
                            <label>Ед. цена<input name="unit_price" type="number" step="0.01" value="0"></label>
                        </div>
                        <button class="primary">Добави част</button>
                    </form>
                    ${repairLaborForm(selectedRepair)}
                    <div class="parts-panel">
                        ${selectedRepairParts(selectedRepair)}
                    </div>
                ` : `<p class="empty">Първо започни ремонт от записан час в календара.</p>`}
            </div>
            <div class="card">
                <h3>Завършени ремонти</h3>
                <div class="repair-table" data-completed-repairs-list>
                    ${completedRepairTable(completedRepairs)}
                </div>
            </div>
            <div class="card" data-repair-detail-box hidden></div>
        </div>
    `;

    const startRepairForm = document.querySelector("[data-start-repair-form]");
    if (startRepairForm) {
        startRepairForm.addEventListener("submit", startRepairFromAppointment);
    }

    const partForm = document.querySelector("[data-part-form]");
    if (partForm) {
        const repairSelect = partForm.querySelector("[name='repair_id']");
        repairSelect.addEventListener("change", (event) => {
            state.selectedRepairId = event.target.value;
            localStorage.setItem("selectedRepairId", state.selectedRepairId);
            loadView();
        });

        partForm.addEventListener("submit", submitRepairPart);
    }
    document.querySelectorAll("[data-delete-selected-part]").forEach((button) => {
        button.addEventListener("click", () => deleteRepairPart(button.dataset.deleteSelectedPart));
    });
    document.querySelectorAll("[data-finish-repair]").forEach((button) => {
        button.addEventListener("click", () => finishRepair(button.dataset.finishRepair));
    });
    bindCompletedRepairActions();
}

function repairLaborForm(repair) {
    if (!repair) return "";

    return `
        <div class="form labor-form" data-labor-form data-repair-id="${escapeHtml(repair.id)}">
            <input type="hidden" name="car_id" value="${escapeHtml(repair.car_id)}">
            <input type="hidden" name="repair_date" value="${formatInputDate(repair.repair_date)}">
            <input type="hidden" name="mechanic_name" value="${escapeHtml(repair.mechanic_name || "")}">
            <input type="hidden" name="description" value="${escapeHtml(repair.description || "")}">
            <input type="hidden" name="status" value="${escapeHtml(repair.status || "open")}">
            <h4>Труд</h4>
            <div class="form-row">
                <label>Труд (часове)<input name="hours_worked" type="number" min="0" step="1" value="${escapeHtml(Math.round(Number(repair.hours_worked || 0)))}"></label>
                <label>Цена на час<input name="price_per_hour" type="number" step="0.01" value="${escapeHtml(repair.price_per_hour || 40)}"></label>
            </div>
        </div>
    `;
}

function completedRepairTable(repairs) {
    return table(["ID", "Клиент", "Автомобил", "Дата", "Майстор", "Сума", "Действия"], repairs.map((r) => [
        r.id,
        r.customer_name,
        `${r.brand} ${r.model}`,
        formatDate(r.repair_date),
        r.mechanic_name || "-",
        money(r.total_price),
        `<div class="actions">
            <button class="secondary small" data-repair-detail="${r.id}">Детайли</button>
            <button class="secondary small" data-repair-edit="${r.id}">Редактирай</button>
            ${isAdmin() ? `<button class="secondary small" data-invoice="${r.id}">Издай фактура</button>` : ""}
            ${isAdmin() ? `<button class="danger small" data-delete-repair="${r.id}">Изтрий</button>` : ""}
        </div>`
    ]));
}

function bindCompletedRepairActions() {
    document.querySelectorAll("[data-invoice]").forEach((button) => button.addEventListener("click", generateInvoice));
    document.querySelectorAll("[data-repair-detail]").forEach((button) => {
        button.addEventListener("click", () => toggleRepairDetails(button.dataset.repairDetail));
    });
    document.querySelectorAll("[data-repair-edit]").forEach((button) => {
        button.addEventListener("click", () => renderRepairEdit(button.dataset.repairEdit));
    });
    document.querySelectorAll("[data-delete-repair]").forEach((button) => {
        button.addEventListener("click", () => deleteRecord(`/repairs/${button.dataset.deleteRepair}`, "Да изтрия ли този ремонт и всички негови части?"));
    });
}

async function refreshCompletedRepairList() {
    const list = document.querySelector("[data-completed-repairs-list]");
    if (!list) return;

    const repairs = await api("/repairs");
    const completedRepairs = repairs.filter((repair) => repair.status === "completed");
    list.innerHTML = completedRepairTable(completedRepairs);
    bindCompletedRepairActions();
}

function selectedRepairParts(repair) {
    if (!repair) return `<p class="empty">Избери ремонт, за да видиш добавените части.</p>`;

    const parts = repair.parts || [];
    const total = parts.reduce((sum, part) => sum + Number(part.total_price || 0), 0);

    if (!parts.length) {
        return `
            <p class="empty">Още няма добавени части към този ремонт.</p>
            <button class="secondary" data-finish-repair="${repair.id}">Завърши ремонт</button>
        `;
    }

    return `
        <h4>Добавени части</h4>
        ${table(["Част", "Марка", "Брой", "Ед. цена", "Общо", "Действия"], parts.map((part) => [
            escapeHtml(part.part_name),
            escapeHtml(part.brand || "-"),
            part.quantity,
            money(part.unit_price),
            money(part.total_price),
            `<button class="danger small" data-delete-selected-part="${part.id}">Изтрий</button>`
        ]))}
        <p class="parts-total"><strong>Общо части:</strong> ${money(total)}</p>
        <button class="primary finish-repair-button" data-finish-repair="${repair.id}">Завърши ремонт</button>
    `;
}

async function renderAppointments(view) {
    const [customers, cars, appointments] = await Promise.all([api("/customers"), api("/cars"), api("/appointments")]);
    view.innerHTML = `
        <div class="section">
            <div class="card">
                <h3>Нов час</h3>
                <form class="form" data-appointment-form>
                    <label>Клиент<select name="customer_id" required>${options(customers, "id", "full_name")}</select></label>
                    <label>Автомобил<select name="car_id" required>${options(cars, "id", (c) => `${c.registration_number || "-"} - ${c.brand} ${c.model}`)}</select></label>
                    <div class="form-row">
                        <label>Дата<input name="appointment_date_day" type="date" required></label>
                        <label>Час<input name="appointment_date_time" type="time" required></label>
                    </div>
                    <label>Причина<input name="reason"></label>
                    <button class="primary">Запази</button>
                </form>
            </div>
            <div class="card">
                <h3>Записани часове</h3>
                <div class="search-line calendar-search">
                    <input data-appointment-search placeholder="Търси по клиент, автомобил, рег. номер или причина">
                </div>
                <div data-appointments-list></div>
            </div>
        </div>
    `;

    document.querySelector("[data-appointment-form]").addEventListener("submit", submitAppointment);

    const renderAppointmentList = (items) => {
        document.querySelector("[data-appointments-list]").innerHTML = appointmentTable(items);
        bindAppointmentActions();
    };

    renderAppointmentList(appointments);

    document.querySelector("[data-appointment-search]").addEventListener("input", (event) => {
        const query = event.target.value.trim().toLowerCase();
        const filteredAppointments = appointments.filter((appointment) => {
            const searchableText = [
                appointment.customer_name,
                appointment.brand,
                appointment.model,
                appointment.registration_number,
                appointment.reason,
                appointment.status
            ].join(" ").toLowerCase();

            return searchableText.includes(query);
        });

        renderAppointmentList(filteredAppointments);
    });
}

function appointmentTable(appointments) {
    if (!appointments.length) return `<p class="empty">Няма записи.</p>`;

    return `
        <div class="table-scroll">
            <table class="appointment-table">
                <thead>
                    <tr>
                        <th>Дата</th>
                        <th>Клиент</th>
                        <th>Автомобил</th>
                        <th>Причина</th>
                        <th>Статус</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${appointments.map((a) => `
                        <tr>
                            <td>${new Date(a.appointment_date).toLocaleString("bg-BG")}</td>
                            <td>${escapeHtml(a.customer_name)}</td>
                            <td>${escapeHtml(`${a.brand} ${a.model}`)}<br><span class="muted">${escapeHtml(a.registration_number || "-")}</span></td>
                            <td>${escapeHtml(a.reason || "-")}</td>
                            <td>
                                <select class="status-select" data-appointment-status="${a.id}">
                                    <option value="scheduled" ${a.status === "scheduled" ? "selected" : ""}>Записан</option>
                                    <option value="completed" ${a.status === "completed" ? "selected" : ""}>Завършен</option>
                                    <option value="cancelled" ${a.status === "cancelled" ? "selected" : ""}>Отказан</option>
                                </select>
                            </td>
                            <td>
                                <div class="appointment-actions">
                                    <button class="secondary small" data-save-appointment-status="${a.id}">Запази</button>
                                    <button class="danger small" data-delete-appointment="${a.id}">Изтрий</button>
                                </div>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function bindAppointmentActions() {
    document.querySelectorAll("[data-save-appointment-status]").forEach((button) => {
        button.addEventListener("click", () => updateAppointmentStatus(button.dataset.saveAppointmentStatus, button));
    });

    document.querySelectorAll("[data-delete-appointment]").forEach((button) => {
        button.addEventListener("click", () => deleteRecord(`/appointments/${button.dataset.deleteAppointment}`, "Да изтрия ли този запис от календара?"));
    });
}

async function updateAppointmentStatus(appointmentId, button) {
    const select = document.querySelector(`[data-appointment-status="${appointmentId}"]`);
    if (!select) return;

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Запазване...";
    button.classList.remove("saved");

    try {
        await api(`/appointments/${appointmentId}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: select.value })
        });

        button.textContent = "Запазено";
        button.classList.add("saved");
        setNotice("Статусът е обновен.");

        setTimeout(() => {
            button.disabled = false;
            button.textContent = originalText;
            button.classList.remove("saved");
        }, 1400);
    } catch (error) {
        button.disabled = false;
        button.textContent = originalText;
        setNotice(error.message, true);
    }
}

async function renderInvoices(view) {
    const invoices = await api("/invoices");
    view.innerHTML = `
        <div class="section">
            <div class="card">
                <h3>Издадени фактури</h3>
                <div data-invoices-list>${invoiceTable(invoices)}</div>
            </div>
        </div>
    `;

    bindInvoiceActions();
}

function invoiceTable(invoices) {
    return `
        <div class="table-scroll">
            <table class="invoice-table">
                <thead>
                    <tr>
                        <th>Номер</th>
                        <th>Клиент</th>
                        <th>Автомобил</th>
                        <th>Сума</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoices.map((i) => `
                        <tr>
                            <td>${escapeHtml(i.invoice_number)}</td>
                            <td>${escapeHtml(i.customer_name)}</td>
                            <td>${escapeHtml(`${i.brand} ${i.model}`)}</td>
                            <td>${money(i.total_amount)}</td>
                            <td>
                                <div class="actions">
                                    <a class="secondary small" href="${API_URL}/${escapeHtml(i.pdf_path)}" target="_blank">Отвори</a>
                                    ${isAdmin() ? `<button class="danger small" data-delete-invoice="${i.id}">Изтрий</button>` : ""}
                                </div>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

async function refreshInvoiceList() {
    const list = document.querySelector("[data-invoices-list]");
    if (!list) return;

    const invoices = await api("/invoices");
    list.innerHTML = invoiceTable(invoices);
    bindInvoiceActions();
}

function bindInvoiceActions() {
    document.querySelectorAll("[data-delete-invoice]").forEach((button) => {
        button.addEventListener("click", async () => {
            if (!confirm("Да изтрия ли тази фактура? PDF файлът също ще бъде премахнат.")) return;

            try {
                await api(`/invoices/${button.dataset.deleteInvoice}`, { method: "DELETE" });
                await refreshInvoiceList();
                setNotice("Фактурата е изтрита.");
            } catch (error) {
                setNotice(error.message, true);
            }
        });
    });
}

async function renderUsers(view) {
    const users = await api("/users");

    view.innerHTML = `
        <div class="grid two">
            <div class="card">
                <h3>Нов потребител</h3>
                <form class="form" data-user-form>
                    <label>Потребителско име<input name="username" required autocomplete="off"></label>
                    <label>Парола<input name="password" type="password" required autocomplete="new-password"></label>
                    <label>Роля
                        <select name="role">
                            <option value="mechanic">Механик</option>
                            <option value="admin">Админ</option>
                        </select>
                    </label>
                    <button class="primary">Създай потребител</button>
                </form>
            </div>
            <div class="card">
                <h3>Списък</h3>
                <div data-users-list>${userTable(users)}</div>
            </div>
        </div>
    `;

    document.querySelector("[data-user-form]").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form).entries());

        try {
            await api("/users", {
                method: "POST",
                body: JSON.stringify(values)
            });

            form.reset();
            await refreshUserList();
            setNotice("Потребителят е създаден.");
        } catch (error) {
            setNotice(error.message, true);
        }
    });

    bindUserActions();
}

function userTable(users) {
    return table(["Потребител", "Роля", "Действия"], users.map((user) => [
        escapeHtml(user.username),
        user.role === "admin" ? "Админ" : "Механик",
        user.id === state.user?.id
            ? `<span class="muted">Текущ акаунт</span>`
            : `<button class="danger small" data-delete-user="${user.id}">Изтрий</button>`
    ]));
}

async function refreshUserList() {
    const list = document.querySelector("[data-users-list]");
    if (!list) return;

    const users = await api("/users");
    list.innerHTML = userTable(users);
    bindUserActions();
}

function bindUserActions() {
    document.querySelectorAll("[data-delete-user]").forEach((button) => {
        button.addEventListener("click", async () => {
            if (!confirm("Да изтрия ли този потребител?")) return;

            try {
                await api(`/users/${button.dataset.deleteUser}`, { method: "DELETE" });
                await refreshUserList();
                setNotice("Потребителят е изтрит.");
            } catch (error) {
                setNotice(error.message, true);
            }
        });
    });
}

async function submitAppointment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const day = values.appointment_date_day;
    const time = values.appointment_date_time;

    delete values.appointment_date_day;
    delete values.appointment_date_time;
    values.appointment_date = day + " " + time + ":00";

    try {
        await api("/appointments", {
            method: "POST",
            body: JSON.stringify(values)
        });
        setNotice("Записът е успешен.");
        loadView();
    } catch (error) {
        setNotice(error.message, true);
    }
}

function submitJson(path, method) {
    return async (event) => {
        event.preventDefault();
        const values = normalizeFormValues(Object.fromEntries(new FormData(event.currentTarget).entries()));

        try {
            validateFormValues(values);

            await api(path, {
                method,
                body: JSON.stringify(values)
            });
            setNotice("Записът е успешен.");
            loadView();
        } catch (error) {
            setNotice(error.message, true);
        }
    };
}

async function submitRepairPart(event) {
    event.preventDefault();
    const values = normalizeFormValues(Object.fromEntries(new FormData(event.currentTarget).entries()));

    try {
        await api("/repair-parts", {
            method: "POST",
            body: JSON.stringify(values)
        });

        state.selectedRepairId = String(values.repair_id || "");
        localStorage.setItem("selectedRepairId", state.selectedRepairId);
        setNotice("Частта е добавена.");
        loadView();
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function deleteRepairPart(partId) {
    if (!confirm("Да изтрия ли тази част от ремонта?")) return;

    try {
        await api(`/repair-parts/${partId}`, { method: "DELETE" });
        setNotice("Частта е изтрита.");
        loadView();
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function finishRepair(repairId) {
    if (!confirm("Готов ли е ремонтът? След това ще се появи в списъка за PDF.")) return;

    try {
        const laborBox = document.querySelector(`[data-labor-form][data-repair-id="${repairId}"]`);
        if (laborBox) {
            const fields = laborBox.querySelectorAll("input[name]");
            const values = normalizeFormValues(Object.fromEntries(Array.from(fields).map((field) => [field.name, field.value])));

            await api(`/repairs/${repairId}`, {
                method: "PUT",
                body: JSON.stringify(values)
            });
        }

        await api(`/repairs/${repairId}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: "completed" })
        });

        if (String(state.selectedRepairId) === String(repairId)) {
            state.selectedRepairId = "";
            localStorage.removeItem("selectedRepairId");
        }

        setNotice("Ремонтът е завършен.");
        loadView();
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function startRepairFromAppointment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const appointmentId = new FormData(form).get("appointment_id");

    try {
        const result = await api(`/appointments/${appointmentId}/start-repair`, { method: "POST" });
        if (result?.repair_id) {
            state.selectedRepairId = String(result.repair_id);
            localStorage.setItem("selectedRepairId", state.selectedRepairId);
        }

        setNotice("Ремонтът е започнат от записания час.");
        loadView();
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function deleteRecord(path, message) {
    if (!confirm(message)) return;

    try {
        await api(path, { method: "DELETE" });
        setNotice("Записът е изтрит.");
        loadView();
    } catch (error) {
        setNotice(error.message, true);
    }
}

function closeRepairDetails() {
    const box = document.querySelector("[data-repair-detail-box]");
    if (!box) return;

    box.hidden = true;
    box.dataset.openRepairId = "";
    box.innerHTML = "";
}

async function renderRepairDetails(repairId) {
    const box = document.querySelector("[data-repair-detail-box]");
    if (!box) return;

    try {
        const repair = await api(`/repairs/${repairId}`);
        box.hidden = false;
        box.dataset.openRepairId = String(repairId);
        box.innerHTML = `
            <h3>Детайли за ремонт #${escapeHtml(repair.id)}</h3>
            <div class="grid two">
                <p><strong>Клиент:</strong> ${escapeHtml(repair.customer_name)}</p>
                <p><strong>Автомобил:</strong> ${escapeHtml(`${repair.brand} ${repair.model}`)}</p>
                <p><strong>Рег. номер:</strong> ${escapeHtml(repair.registration_number || "-")}</p>
                <p><strong>Майстор:</strong> ${escapeHtml(repair.mechanic_name || "-")}</p>
                <p><strong>Труд:</strong> ${escapeHtml(repair.hours_worked || 0)} ч. x ${money(repair.price_per_hour || 0)}</p>
                <p><strong>Сума труд:</strong> ${money(repair.labor_price || 0)}</p>
                <p><strong>Крайна сума:</strong> ${money(repair.total_price)}</p>
            </div>
            <p>${escapeHtml(repair.description || "")}</p>
            <div class="part-table">
                ${table(["ID", "Част", "Марка", "Бр.", "Ед. цена", "Общо"], repair.parts.map((part) => [
                    part.id,
                    escapeHtml(part.part_name),
                    escapeHtml(part.brand || "-"),
                    part.quantity,
                    money(part.unit_price),
                    money(part.total_price)
                ]))}
            </div>
        `;
    } catch (error) {
        setNotice(error.message, true);
    }
}

function toggleRepairDetails(repairId) {
    const box = document.querySelector("[data-repair-detail-box]");
    if (!box) return;

    if (!box.hidden && box.dataset.openRepairId === String(repairId)) {
        closeRepairDetails();
        return;
    }

    renderRepairDetails(repairId);
}

async function renderRepairEdit(repairId) {
    const box = document.querySelector("[data-repair-detail-box]");
    if (!box) return;

    try {
        const repair = await api(`/repairs/${repairId}`);
        box.hidden = false;
        box.innerHTML = `
            <h3>Редакция на ремонт #${escapeHtml(repair.id)}</h3>
            <form class="form" data-repair-edit-form data-repair-id="${escapeHtml(repair.id)}">
                <input type="hidden" name="car_id" value="${escapeHtml(repair.car_id)}">
                <input type="hidden" name="status" value="${escapeHtml(repair.status || "completed")}">
                <div class="form-row">
                    <label>Дата на ремонт<input name="repair_date" type="date" required value="${formatInputDate(repair.repair_date)}"></label>
                    <label>Майстор<input name="mechanic_name" required value="${escapeHtml(repair.mechanic_name || "")}"></label>
                </div>
                <div class="form-row">
                    <label>Труд (часове)<input name="hours_worked" type="number" min="0" step="1" value="${escapeHtml(Math.round(Number(repair.hours_worked || 0)))}"></label>
                    <label>Цена на час<input name="price_per_hour" type="number" step="0.01" value="${escapeHtml(repair.price_per_hour || 40)}"></label>
                </div>
                <label>Описание<textarea name="description">${escapeHtml(repair.description || "")}</textarea></label>
                <div class="actions">
                    <button class="primary">Запази промените</button>
                    <button class="secondary" type="button" data-cancel-repair-edit="${repair.id}">Отказ</button>
                </div>
            </form>
            <h4>Части към ремонта</h4>
            <div class="part-table">
                ${table(["ID", "Част", "Марка", "Бр.", "Ед. цена", "Общо", "Действия"], repair.parts.map((part) => [
                    part.id,
                    escapeHtml(part.part_name),
                    escapeHtml(part.brand || "-"),
                    part.quantity,
                    money(part.unit_price),
                    money(part.total_price),
                    `<div class="actions">
                        <button class="secondary small" data-edit-part="${part.id}">Редактирай</button>
                        <button class="danger small" data-delete-part="${part.id}">Изтрий</button>
                    </div>`
                ]))}
            </div>
        `;

        document.querySelector("[data-repair-edit-form]").addEventListener("submit", submitRepairEdit);
        document.querySelector("[data-cancel-repair-edit]").addEventListener("click", closeRepairDetails);
        document.querySelectorAll("[data-edit-part]").forEach((button) => {
            button.addEventListener("click", () => renderPartEdit(repairId, button.dataset.editPart));
        });

        document.querySelectorAll("[data-delete-part]").forEach((button) => {
            button.addEventListener("click", () => deletePartFromEdit(button.dataset.deletePart, repairId));
        });
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function submitRepairEdit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const repairId = form.dataset.repairId;
    const values = normalizeFormValues(Object.fromEntries(new FormData(form).entries()));

    if (!repairId) {
        setNotice("Не може да се намери ремонтът за редакция.", true);
        return;
    }

    try {
        await api(`/repairs/${repairId}`, {
            method: "PUT",
            body: JSON.stringify(values)
        });

        setNotice("Ремонтът е обновен.");
        await refreshCompletedRepairList();
        const box = document.querySelector("[data-repair-detail-box]");
        if (box) {
            box.hidden = true;
            box.innerHTML = "";
        }
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function renderPartEdit(repairId, partId) {
    const box = document.querySelector("[data-repair-detail-box]");
    if (!box) return;

    try {
        const repair = await api(`/repairs/${repairId}`);
        const part = (repair.parts || []).find((item) => String(item.id) === String(partId));

        if (!part) {
            setNotice("Частта не е намерена.", true);
            return;
        }

        box.hidden = false;
        box.innerHTML = `
            <h3>Редакция на част #${escapeHtml(part.id)}</h3>
            <form class="form" data-part-edit-form data-repair-id="${escapeHtml(repairId)}" data-part-id="${escapeHtml(part.id)}">
                <div class="form-row">
                    <label>Част<input name="part_name" required value="${escapeHtml(part.part_name)}"></label>
                    <label>Марка<input name="brand" value="${escapeHtml(part.brand || "")}"></label>
                </div>
                <div class="form-row">
                    <label>Брой<input name="quantity" type="number" value="${escapeHtml(part.quantity || 1)}"></label>
                    <label>Ед. цена<input name="unit_price" type="number" step="0.01" value="${escapeHtml(part.unit_price || 0)}"></label>
                </div>
                <div class="actions">
                    <button class="primary">Запази част</button>
                    <button class="secondary" type="button" data-cancel-part-edit="${escapeHtml(repairId)}">Отказ</button>
                </div>
            </form>
        `;

        document.querySelector("[data-part-edit-form]").addEventListener("submit", submitPartEdit);
        document.querySelector("[data-cancel-part-edit]").addEventListener("click", () => renderRepairEdit(repairId));
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function submitPartEdit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const repairId = form.dataset.repairId;
    const partId = form.dataset.partId;
    const values = Object.fromEntries(new FormData(form).entries());

    try {
        await api(`/repair-parts/${partId}`, {
            method: "PUT",
            body: JSON.stringify(values)
        });

        setNotice("Частта е обновена.");
        await refreshCompletedRepairList();
        renderRepairEdit(repairId);
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function deletePartFromEdit(partId, repairId) {
    if (!confirm("Да изтрия ли тази част от ремонта?")) return;

    try {
        await api(`/repair-parts/${partId}`, { method: "DELETE" });
        setNotice("Частта е изтрита.");
        await refreshCompletedRepairList();
        renderRepairEdit(repairId);
    } catch (error) {
        setNotice(error.message, true);
    }
}

async function generateInvoice(event) {
    const repairId = event.currentTarget.dataset.invoice;

    try {
        const result = await api(`/invoice/${repairId}`);
        window.open(`${API_URL}/${result.file}`, "_blank");
        setNotice("Фактурата е генерирана.");
    } catch (error) {
        setNotice(error.message, true);
    }
}

function options(items, valueKey, labelKey, selectedValue = "") {
    return items.map((item) => {
        const label = typeof labelKey === "function" ? labelKey(item) : item[labelKey];
        const value = item[valueKey];
        const selected = String(value) === String(selectedValue) ? " selected" : "";

        return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
    }).join("");
}

function table(headers, rows) {
    if (!rows.length) return `<p class="empty">Няма записи.</p>`;

    return `
        <table>
            <thead>
                <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
            </thead>
            <tbody>
                ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell == null ? "-" : cell}</td>`).join("")}</tr>`).join("")}
            </tbody>
        </table>
    `;
}

render();
