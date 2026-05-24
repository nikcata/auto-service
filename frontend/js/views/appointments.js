const APPOINTMENT_STATUS_FILTERS = [
    { value: "all", label: "Всички" },
    { value: "scheduled", label: "Записани" },
    { value: "completed", label: "Завършени" },
    { value: "cancelled", label: "Отказани" }
];

async function renderAppointments(view) {
    const [customers, cars, appointments] = await Promise.all([api("/customers"), api("/cars"), api("/appointments")]);
    let appointmentSearchQuery = "";
    let appointmentStatusFilter = normalizeAppointmentStatusFilter(sessionStorage.getItem("appointmentStatusFilter"));
    const sortedCustomers = [...customers].sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || ""), "bg", { sensitivity: "base" }));
    const sortedCars = [...cars].sort((a, b) => {
        const carA = `${a.brand || ""} ${a.model || ""} ${a.registration_number || ""}`;
        const carB = `${b.brand || ""} ${b.model || ""} ${b.registration_number || ""}`;

        return carA.localeCompare(carB, "bg", { sensitivity: "base" });
    });
    const customerSelectItems = sortedCustomers.map((customer) => ({
        value: customer.id,
        label: `${customer.full_name} - ${customer.phone || "без телефон"}`
    }));
    const carSelectItems = sortedCars.map((car) => ({
        value: car.id,
        label: `${car.brand} ${car.model} - ${car.registration_number || "-"}`
    }));

    view.innerHTML = `
        <div class="section">
            <div class="card">
                <h3>Нов час</h3>
                <form class="form" data-appointment-form data-draft-key="appointments:new">
                    <label>Клиент${searchableSelect("customer_id", customerSelectItems, { placeholder: "Избери клиент", searchPlaceholder: "Търси клиент по име или телефон" })}</label>
                    <label>Автомобил${searchableSelect("car_id", carSelectItems, { placeholder: "Избери автомобил", searchPlaceholder: "Търси по марка, модел или рег. номер" })}</label>
                    <div class="form-row">
                        <label>Дата<input name="appointment_date_day" type="date" min="${todayInputDate()}" required></label>
                        <label>Час<input name="appointment_date_time" type="time" step="1800" required></label>
                    </div>
                    <label>Причина<textarea name="reason"></textarea></label>
                    <button class="primary">Запази</button>
                </form>
            </div>
            <div class="card">
                <div class="appointment-list-head">
                    <h3>Записани часове</h3>
                    <div class="appointment-filter" data-appointment-status-filter>
                        <button class="secondary small appointment-filter-button" data-appointment-filter-button type="button" aria-haspopup="true" aria-expanded="false">
                            <span data-appointment-filter-label>${escapeHtml(appointmentStatusFilterLabel(appointmentStatusFilter))}</span>
                            <span class="appointment-filter-caret" aria-hidden="true">▾</span>
                        </button>
                        <div class="appointment-filter-menu" data-appointment-filter-menu hidden>
                            ${appointmentStatusFilterOptions(appointmentStatusFilter)}
                        </div>
                    </div>
                </div>
                <div class="search-line calendar-search">
                    <input data-appointment-search placeholder="Търси по клиент, автомобил, рег. номер или причина">
                </div>
                <div data-appointments-list></div>
            </div>
        </div>
    `;

    document.querySelector("[data-appointment-form]").addEventListener("submit", submitAppointment);

    const filteredAppointments = () => {
        return appointments.filter((appointment) => {
            const status = appointment.status || "scheduled";
            if (appointmentStatusFilter !== "all" && status !== appointmentStatusFilter) {
                return false;
            }

            if (!appointmentSearchQuery) {
                return true;
            }

            const searchableText = [
                appointment.customer_name,
                appointment.brand,
                appointment.model,
                appointment.registration_number,
                appointment.reason,
                status,
                appointmentStatusFilterLabel(status)
            ].join(" ").toLowerCase();

            return searchableText.includes(appointmentSearchQuery);
        });
    };

    const handleAppointmentStatusSaved = (appointmentId, status) => {
        const appointment = appointments.find((item) => String(item.id) === String(appointmentId));
        if (appointment) {
            appointment.status = status;
        }

        if (appointmentStatusFilter !== "all" || appointmentSearchQuery) {
            setTimeout(() => renderAppointmentList(filteredAppointments()), 350);
        }
    };

    const renderAppointmentList = (items) => {
        const sortedItems = sortAppointmentsByDateDesc(items);

        document.querySelector("[data-appointments-list]").innerHTML = appointmentTable(sortedItems);
        bindAppointmentActions(sortedItems, handleAppointmentStatusSaved);
    };

    renderAppointmentList(filteredAppointments());

    bindAppointmentStatusFilter({
        getValue: () => appointmentStatusFilter,
        setValue: (value) => {
            appointmentStatusFilter = normalizeAppointmentStatusFilter(value);
            sessionStorage.setItem("appointmentStatusFilter", appointmentStatusFilter);
            renderAppointmentList(filteredAppointments());
        }
    });

    document.querySelector("[data-appointment-search]").addEventListener("input", (event) => {
        appointmentSearchQuery = event.target.value.trim().toLowerCase();
        renderAppointmentList(filteredAppointments());
    });
}

function normalizeAppointmentStatusFilter(value) {
    return APPOINTMENT_STATUS_FILTERS.some((filter) => filter.value === value) ? value : "all";
}

function appointmentStatusFilterLabel(value) {
    const filter = APPOINTMENT_STATUS_FILTERS.find((item) => item.value === value);

    return filter ? filter.label : APPOINTMENT_STATUS_FILTERS[0].label;
}

function appointmentStatusFilterOptions(activeValue) {
    return APPOINTMENT_STATUS_FILTERS.map((filter) => {
        const isActive = filter.value === activeValue;

        return `
            <button class="appointment-filter-option ${isActive ? "active" : ""}" data-appointment-filter-option="${escapeHtml(filter.value)}" type="button" aria-pressed="${isActive ? "true" : "false"}">
                ${escapeHtml(filter.label)}
            </button>
        `;
    }).join("");
}

function bindAppointmentStatusFilter({ getValue, setValue }) {
    const filter = document.querySelector("[data-appointment-status-filter]");
    const button = document.querySelector("[data-appointment-filter-button]");
    const menu = document.querySelector("[data-appointment-filter-menu]");
    const label = document.querySelector("[data-appointment-filter-label]");
    if (!filter || !button || !menu || !label) return;

    let outsideClickHandler = null;
    let escapeKeyHandler = null;

    const syncOptions = () => {
        label.textContent = appointmentStatusFilterLabel(getValue());
        menu.querySelectorAll("[data-appointment-filter-option]").forEach((option) => {
            const isActive = option.dataset.appointmentFilterOption === getValue();
            option.classList.toggle("active", isActive);
            option.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
    };

    const closeMenu = () => {
        menu.hidden = true;
        button.setAttribute("aria-expanded", "false");

        if (outsideClickHandler) {
            document.removeEventListener("click", outsideClickHandler);
            outsideClickHandler = null;
        }

        if (escapeKeyHandler) {
            document.removeEventListener("keydown", escapeKeyHandler);
            escapeKeyHandler = null;
        }
    };

    const openMenu = () => {
        menu.hidden = false;
        button.setAttribute("aria-expanded", "true");

        outsideClickHandler = (event) => {
            if (!filter.contains(event.target)) {
                closeMenu();
            }
        };

        escapeKeyHandler = (event) => {
            if (event.key === "Escape") {
                closeMenu();
            }
        };

        document.addEventListener("click", outsideClickHandler);
        document.addEventListener("keydown", escapeKeyHandler);
    };

    button.addEventListener("click", (event) => {
        event.stopPropagation();

        if (menu.hidden) {
            openMenu();
            return;
        }

        closeMenu();
    });

    menu.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    menu.querySelectorAll("[data-appointment-filter-option]").forEach((option) => {
        option.addEventListener("click", () => {
            setValue(option.dataset.appointmentFilterOption);
            syncOptions();
            closeMenu();
        });
    });
}

function sortAppointmentsByDateDesc(appointments) {
    return [...appointments].sort((a, b) => new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime());
}

function appointmentTable(appointments) {
    if (!appointments.length) return `<p class="empty">Няма записи.</p>`;

    return `
        <div class="table-scroll list-scroll">
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
                            <td>${appointmentCustomerName(a.customer_name)}</td>
                            <td>${shortText(`${a.brand} ${a.model}`, 24)}<br><span class="muted">${shortText(a.registration_number || "-", 14)}</span></td>
                            <td>
                                <button class="appointment-reason" data-appointment-reason="${a.id}" type="button" title="${escapeHtml(a.reason || "-")}">${escapeHtml(a.reason || "-")}</button>
                            </td>
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

function appointmentCustomerName(name) {
    const parts = String(name || "-").trim().split(/\s+/).filter(Boolean);
    const firstName = parts[0] || "-";
    const lastName = parts.slice(1).join(" ");
    const lastLine = lastName ? "<span>" + escapeHtml(lastName) + "</span>" : "";

    return '<span class="appointment-customer-name" title="' + escapeHtml(name || "-") + '">' +
        '<span>' + escapeHtml(firstName) + '</span>' +
        lastLine +
        '</span>';
}

function bindAppointmentActions(appointments = [], onStatusSaved = () => {}) {
    document.querySelectorAll("[data-appointment-reason]").forEach((button) => {
        button.addEventListener("click", () => {
            const appointment = appointments.find((item) => String(item.id) === String(button.dataset.appointmentReason));
            if (appointment) showAppointmentReasonModal(appointment);
        });
    });

    document.querySelectorAll("[data-save-appointment-status]").forEach((button) => {
        button.addEventListener("click", () => updateAppointmentStatus(button.dataset.saveAppointmentStatus, button, onStatusSaved));
    });

    document.querySelectorAll("[data-delete-appointment]").forEach((button) => {
        button.addEventListener("click", () => deleteRecord(`/appointments/${button.dataset.deleteAppointment}`, "Да изтрия ли този запис от календара?"));
    });
}

function showAppointmentReasonModal(appointment) {
    const car = `${appointment.brand || ""} ${appointment.model || ""}`.trim();
    const reason = appointment.reason || "Няма въведена причина.";

    modalRoot.innerHTML = `
        <div class="modal-backdrop" data-close-modal>
            <div class="modal-card" role="dialog" aria-modal="true" aria-label="Причина за запис">
                <div class="modal-head">
                    <div>
                        <h3>Причина за запис</h3>
                        <p>${escapeHtml(formatDateTime(appointment.appointment_date))}</p>
                    </div>
                    <button class="secondary small" data-close-modal type="button">Затвори</button>
                </div>
                <div class="appointment-modal-body">
                    <p><b>Клиент:</b> ${escapeHtml(appointment.customer_name || "-")}</p>
                    <p><b>Автомобил:</b> ${car ? escapeHtml(car) : "-"} ${appointment.registration_number ? `(${escapeHtml(appointment.registration_number)})` : ""}</p>
                    <div class="reason-modal-text">${escapeHtml(reason)}</div>
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

async function updateAppointmentStatus(appointmentId, button, onStatusSaved = () => {}) {
    const select = document.querySelector(`[data-appointment-status="${appointmentId}"]`);
    if (!select) return;

    const status = select.value;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Запазване...";
    button.classList.remove("saved");

    try {
        await api(`/appointments/${appointmentId}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status })
        });

        button.textContent = "Запазено";
        button.classList.add("saved");
        setNotice("Статусът е обновен.");
        onStatusSaved(appointmentId, status);

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
