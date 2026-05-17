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
