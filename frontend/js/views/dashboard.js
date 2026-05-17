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
