async function renderRepairs(view) {
    const [repairs, appointments] = await Promise.all([api("/repairs"), api("/appointments")]);
    const cancelledAppointmentIds = new Set(
        appointments
            .filter((appointment) => appointment.status === "cancelled")
            .map((appointment) => String(appointment.id))
    );
    const openRepairs = repairs.filter((repair) => {
        return repair.status !== "completed" && !cancelledAppointmentIds.has(String(repair.appointment_id));
    });
    const completedRepairs = sortCompletedRepairs(repairs.filter((repair) => repair.status === "completed"));
    const repairAppointmentIds = new Set(repairs.map((repair) => String(repair.appointment_id)).filter(Boolean));
    const selectedRepairExists = openRepairs.some((repair) => String(repair.id) === String(state.selectedRepairId));
    const selectedRepairId = selectedRepairExists ? state.selectedRepairId : "";
    const selectedRepair = selectedRepairId ? await api(`/repairs/${selectedRepairId}`) : null;
    const availableAppointments = appointments.filter((appointment) => {
        return appointment.status === "scheduled"
            && !repairAppointmentIds.has(String(appointment.id))
            && !Number(appointment.has_repair);
    });
    const appointmentSelectItems = availableAppointments.map((appointment) => ({
        value: appointment.id,
        label: `${formatDateTime(appointment.appointment_date)} - ${appointment.registration_number || "-"} - ${appointment.brand} ${appointment.model}`
    }));
    view.innerHTML = `
        <div class="section">
            <div class="card">
                <h3>Ремонт от календар</h3>
                ${availableAppointments.length ? `
                    <form class="form" data-start-repair-form data-draft-key="repairs:start">
                        <label>Записан час
                            ${searchableSelect("appointment_id", appointmentSelectItems, { placeholder: "Избери записан час", searchPlaceholder: "Търси по дата, рег. номер или автомобил" })}
                        </label>
                        <button class="primary">Започни ремонт</button>
                    </form>
                ` : `<p class="empty">Няма свободни записани часове от календара.</p>`}
            </div>
            <div class="card">
                <h3>Добави част</h3>
                ${openRepairs.length ? `
                    <form class="form" data-part-form>
                        <label>Ремонт<select name="repair_id" required><option value="">Избери ремонт</option>${options(openRepairs, "id", (r) => `#${r.id} - ${r.brand || "-"} ${r.model || ""} (${r.registration_number || "-"}) - ${formatDate(r.repair_date)}`, selectedRepairId)}</select></label>
                        <div class="open-repair-toolbar">
                            <button class="danger secondary open-repair-delete-button" type="button" data-delete-open-repair="${selectedRepairId}" ${selectedRepairId ? "" : "disabled"}>Премахни започнат ремонт</button>
                        </div>
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
                <div class="search-line repair-search">
                    <input data-completed-repair-search placeholder="Търси по клиент, дата или автомобил">
                </div>
                <div class="repair-table completed-repair-table ${isAdmin() ? "admin-repair-table" : "mechanic-repair-table"}" data-completed-repairs-list>
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
            if (state.selectedRepairId) {
                sessionStorage.setItem("selectedRepairId", state.selectedRepairId);
            } else {
                sessionStorage.removeItem("selectedRepairId");
            }
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
    document.querySelectorAll("[data-delete-open-repair]").forEach((button) => {
        button.addEventListener("click", () => deleteOpenRepair(button.dataset.deleteOpenRepair));
    });
    bindCompletedRepairSearch(completedRepairs);
    bindCompletedRepairActions();
}

function bindCompletedRepairSearch(repairs) {
    const input = document.querySelector("[data-completed-repair-search]");
    const list = document.querySelector("[data-completed-repairs-list]");
    if (!input || !list) return;

    input.addEventListener("input", () => {
        const query = input.value.trim().toLowerCase();
        const filteredRepairs = sortCompletedRepairs(repairs.filter((repair) => {
            const searchableText = [
                repair.customer_name,
                repair.brand,
                repair.model,
                formatDate(repair.repair_date)
            ].join(" ").toLowerCase();

            return searchableText.includes(query);
        }));

        list.innerHTML = completedRepairTable(filteredRepairs);
        bindCompletedRepairActions();
    });
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
                <label>Труд (часове)<input name="hours_worked" type="number" min="1" step="1" value="${escapeHtml(Math.max(1, Math.round(Number(repair.hours_worked || 1))))}"></label>
                <label>Цена на час<input name="price_per_hour" type="number" step="0.01" value="${escapeHtml(repair.price_per_hour || 40)}"></label>
            </div>
        </div>
    `;
}

function completedRepairSortDate(repair) {
    const value = repair.completed_at || repair.repair_date || repair.created_at;
    const timestamp = new Date(value).getTime();

    return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortCompletedRepairs(repairs) {
    return [...repairs].sort((a, b) => {
        const dateDiff = completedRepairSortDate(b) - completedRepairSortDate(a);
        if (dateDiff !== 0) return dateDiff;

        return Number(b.id || 0) - Number(a.id || 0);
    });
}

function invoiceAction(repair) {
    if (repair.invoice_id && repair.invoice_status !== "cancelled") {
        return '<span class="muted action-note">Фактура издадена</span>';
    }

    return '<button class="secondary small" type="button" data-invoice="' + escapeHtml(repair.id) + '">Издай фактура</button>';
}

function completedRepairTable(repairs) {
    return table(["ID", "Клиент", "Автомобил", "Дата", "Майстор", "Сума", "Действия"], repairs.map((r) => [
        r.id,
        isAdmin() ? twoLineName(r.customer_name, 12, 12) : twoLineName(r.customer_name, 18, 18),
        isAdmin() ? shortText(`${r.brand} ${r.model}`, 20) : shortText(`${r.brand} ${r.model}`, 34),
        formatDate(r.completed_at || r.repair_date),
        shortText(r.mechanic_name || "-", 18),
        money(r.total_price),
        `<div class="actions">
            <button class="secondary small" data-repair-detail="${r.id}">Детайли</button>
            <button class="secondary small" data-repair-edit="${r.id}">Редактирай</button>
            ${isAdmin() ? invoiceAction(r) : ""}
            ${isAdmin() ? `<button class="danger small" data-archive-repair="${r.id}">Архивирай</button>` : ""}
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
    document.querySelectorAll("[data-archive-repair]").forEach((button) => {
        button.addEventListener("click", () => archiveCompletedRepair(button.dataset.archiveRepair));
    });
}

async function archiveCompletedRepair(repairId) {
    if (!confirm("Да архивирам ли този завършен ремонт? Данните, частите и фактурите ще останат запазени.")) return;

    try {
        await api(`/repairs/${repairId}`, { method: "DELETE" });
        const detailBox = document.querySelector("[data-repair-detail-box]");
        if (detailBox) {
            detailBox.hidden = true;
            detailBox.innerHTML = "";
        }
        await refreshCompletedRepairList();
        setNotice("Ремонтът е архивиран.");
    } catch (error) {
        setNotice(error.message || "Неуспешно архивиране", true);
    }
}

async function refreshCompletedRepairList() {
    const list = document.querySelector("[data-completed-repairs-list]");
    if (!list) return;

    const repairs = await api("/repairs");
    const completedRepairs = sortCompletedRepairs(repairs.filter((repair) => repair.status === "completed"));
    list.innerHTML = completedRepairTable(completedRepairs);
    bindCompletedRepairSearch(completedRepairs);
    bindCompletedRepairActions();
}

function selectedRepairParts(repair) {
    if (!repair) return `<p class="empty">Избери ремонт, за да видиш добавените части.</p>`;

    const parts = repair.parts || [];
    const total = parts.reduce((sum, part) => sum + Number(part.total_price || 0), 0);

    if (!parts.length) {
        return `
            <p class="empty">Още няма добавени части към този ремонт.</p>
            <div class="finish-repair-actions">
                <button class="secondary small finish-repair-button" data-finish-repair="${repair.id}">Завърши ремонт</button>
            </div>
        `;
    }

    return `
        <h4>Добавени части</h4>
        ${table(["Част", "Марка", "Брой", "Ед. цена", "Общо", "Действия"], parts.map((part) => [
            shortText(part.part_name, 28),
            shortText(part.brand || "-", 22),
            part.quantity,
            money(part.unit_price),
            money(part.total_price),
            `<button class="danger small" data-delete-selected-part="${part.id}">Изтрий</button>`
        ]))}
        <p class="parts-total"><strong>Общо части:</strong> ${money(total)}</p>
        <div class="finish-repair-actions">
            <button class="primary small finish-repair-button" data-finish-repair="${repair.id}">Завърши ремонт</button>
        </div>
    `;
}
