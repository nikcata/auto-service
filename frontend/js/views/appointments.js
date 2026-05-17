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
