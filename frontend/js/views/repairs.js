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
