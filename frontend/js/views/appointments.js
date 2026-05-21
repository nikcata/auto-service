async function renderAppointments(view) {
    const [customers, cars, appointments] = await Promise.all([api("/customers"), api("/cars"), api("/appointments")]);
    const sortedCustomers = [...customers].sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || ""), "bg", { sensitivity: "base" }));
    const sortedCars = [...cars].sort((a, b) => {
        const carA = `${a.brand || ""} ${a.model || ""} ${a.registration_number || ""}`;
        const carB = `${b.brand || ""} ${b.model || ""} ${b.registration_number || ""}`;

        return carA.localeCompare(carB, "bg", { sensitivity: "base" });
    });

    view.innerHTML = `
        <div class="section">
            <div class="card">
                <h3>Нов час</h3>
                <form class="form" data-appointment-form data-draft-key="appointments:new">
                    <label>Клиент<select name="customer_id" required>${options(sortedCustomers, "id", (customer) => `${customer.full_name} - ${customer.phone || "без телефон"}`)}</select></label>
                    <label>Автомобил<select name="car_id" required>${options(sortedCars, "id", (c) => `${c.brand} ${c.model} - ${c.registration_number || "-"}`)}</select></label>
                    <div class="form-row">
                        <label>Дата<input name="appointment_date_day" type="date" min="${todayInputDate()}" required></label>
                        <label>Час<input name="appointment_date_time" type="time" step="1800" required></label>
                    </div>
                    <label>Причина<textarea name="reason"></textarea></label>
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
        bindAppointmentActions(items);
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

function bindAppointmentActions(appointments = []) {
    document.querySelectorAll("[data-appointment-reason]").forEach((button) => {
        button.addEventListener("click", () => {
            const appointment = appointments.find((item) => String(item.id) === String(button.dataset.appointmentReason));
            if (appointment) showAppointmentReasonModal(appointment);
        });
    });

    document.querySelectorAll("[data-save-appointment-status]").forEach((button) => {
        button.addEventListener("click", () => updateAppointmentStatus(button.dataset.saveAppointmentStatus, button));
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
